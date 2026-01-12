/// MongoDB client for mongo.do
library;

import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

import 'types.dart';
import 'database.dart';
import 'exceptions.dart';

/// Parse a MongoDB connection URI
({
  String protocol,
  String host,
  int? port,
  String? database,
  String? username,
  String? password,
  Map<String, String> options,
}) parseConnectionUri(String uri) {
  // Handle mongodb:// and mongodb+srv:// and https://
  final protocolMatch = RegExp(r'^(mongodb(?:\+srv)?|https?):\/\/').firstMatch(uri);
  if (protocolMatch == null) {
    throw MongoException('Invalid MongoDB URI: must start with mongodb://, mongodb+srv://, or https://');
  }

  final protocol = protocolMatch.group(1)!;
  var remaining = uri.substring(protocolMatch.end);

  // Extract credentials if present
  String? username;
  String? password;

  final atIndex = remaining.indexOf('@');
  if (atIndex != -1) {
    final credentials = remaining.substring(0, atIndex);
    remaining = remaining.substring(atIndex + 1);

    final colonIndex = credentials.indexOf(':');
    if (colonIndex != -1) {
      username = Uri.decodeComponent(credentials.substring(0, colonIndex));
      password = Uri.decodeComponent(credentials.substring(colonIndex + 1));
    } else {
      username = Uri.decodeComponent(credentials);
    }
  }

  // Extract query string if present
  final options = <String, String>{};
  final queryIndex = remaining.indexOf('?');
  if (queryIndex != -1) {
    final queryString = remaining.substring(queryIndex + 1);
    remaining = remaining.substring(0, queryIndex);

    for (final pair in queryString.split('&')) {
      final parts = pair.split('=');
      if (parts.length == 2) {
        options[Uri.decodeComponent(parts[0])] = Uri.decodeComponent(parts[1]);
      }
    }
  }

  // Extract database name
  String? database;
  final pathIndex = remaining.indexOf('/');
  var hostPart = remaining;

  if (pathIndex != -1) {
    hostPart = remaining.substring(0, pathIndex);
    final dbPart = remaining.substring(pathIndex + 1);
    if (dbPart.isNotEmpty) {
      database = dbPart;
    }
  }

  // Parse host and port
  final portMatch = RegExp(r':(\d+)$').firstMatch(hostPart);
  var host = hostPart;
  int? port;

  if (portMatch != null) {
    host = hostPart.substring(0, hostPart.length - portMatch.group(0)!.length);
    port = int.parse(portMatch.group(1)!);
  }

  return (
    protocol: protocol,
    host: host,
    port: port,
    database: database,
    username: username,
    password: password,
    options: options,
  );
}

/// HTTP-based RPC transport
class HttpRpcTransport implements RpcTransport {
  final String _baseUrl;
  final http.Client _client;
  final Map<String, String> _headers;
  bool _closed = false;

  HttpRpcTransport(
    String baseUrl, {
    String? token,
    http.Client? client,
  })  : _baseUrl = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl,
        _client = client ?? http.Client(),
        _headers = {
          'Content-Type': 'application/json',
          if (token != null) 'Authorization': 'Bearer $token',
        };

  @override
  Future<dynamic> call(String method, List<dynamic> args) async {
    if (_closed) {
      throw ConnectionException('Transport is closed');
    }

    try {
      final response = await _client.post(
        Uri.parse('$_baseUrl/rpc'),
        headers: _headers,
        body: jsonEncode({
          'method': method,
          'args': args,
        }),
      );

      if (response.statusCode >= 400) {
        throw MongoException(
          'RPC call failed: ${response.body}',
          code: 'HTTP_${response.statusCode}',
          retriable: response.statusCode >= 500,
        );
      }

      final result = jsonDecode(response.body);
      if (result is Map && result['error'] != null) {
        throw MongoException(
          result['error']['message'] ?? 'Unknown error',
          code: result['error']['code']?.toString(),
        );
      }

      return result['result'];
    } on http.ClientException catch (e) {
      throw ConnectionException('Network error: $e');
    }
  }

  @override
  Future<void> close() async {
    _closed = true;
    _client.close();
  }
}

/// Mock RPC transport for testing
class MockRpcTransport implements RpcTransport {
  final Map<String, Map<String, List<Document>>> _data = {};
  int _nextId = 1;
  bool _closed = false;
  final List<({String method, List<dynamic> args})> _callLog = [];

  /// Get the call log for testing
  List<({String method, List<dynamic> args})> get callLog => List.unmodifiable(_callLog);

  /// Clear the call log
  void clearCallLog() => _callLog.clear();

  /// Seed test data
  void seed(String database, String collection, List<Document> documents) {
    _data.putIfAbsent(database, () => {});
    _data[database]![collection] = documents;
  }

  @override
  Future<dynamic> call(String method, List<dynamic> args) async {
    if (_closed) {
      throw ConnectionException('Transport is closed');
    }

    _callLog.add((method: method, args: args));

    switch (method) {
      case 'connect':
      case 'ping':
        return {'ok': 1};

      case 'insertOne':
        final dbName = args[0] as String;
        final collName = args[1] as String;
        final doc = args[2] as Document;
        final collection = _getOrCreateCollection(dbName, collName);
        final id = doc['_id'] ?? 'id_${_nextId++}';
        collection.add({...doc, '_id': id});
        return {'acknowledged': true, 'insertedId': id};

      case 'insertMany':
        final dbName = args[0] as String;
        final collName = args[1] as String;
        final docs = args[2] as List<dynamic>;
        final collection = _getOrCreateCollection(dbName, collName);
        final insertedIds = <String, dynamic>{};
        for (var i = 0; i < docs.length; i++) {
          final doc = docs[i] as Document;
          final id = doc['_id'] ?? 'id_${_nextId++}';
          collection.add({...doc, '_id': id});
          insertedIds['$i'] = id;
        }
        return {
          'acknowledged': true,
          'insertedCount': docs.length,
          'insertedIds': insertedIds,
        };

      case 'find':
        final dbName = args[0] as String;
        final collName = args[1] as String;
        final filter = args[2] as Document;
        final options = args.length > 3 ? args[3] as Document : <String, dynamic>{};
        var results = _getCollection(dbName, collName)
            .where((doc) => _matchesFilter(doc, filter))
            .toList();

        if (options['sort'] != null) {
          results = _sortDocs(results, options['sort'] as Map<String, dynamic>);
        }
        if (options['skip'] != null) {
          results = results.skip(options['skip'] as int).toList();
        }
        if (options['limit'] != null) {
          results = results.take(options['limit'] as int).toList();
        }

        return results;

      case 'findOneAndUpdate':
        final dbName = args[0] as String;
        final collName = args[1] as String;
        final filter = args[2] as Document;
        final update = args[3] as Document;
        final options = args.length > 4 ? args[4] as Document : <String, dynamic>{};
        final collection = _getCollection(dbName, collName);
        final index = collection.indexWhere((doc) => _matchesFilter(doc, filter));

        if (index == -1) {
          if (options['upsert'] == true) {
            final id = 'id_${_nextId++}';
            final newDoc = {'_id': id, ...filter, ..._applyUpdate({}, update)};
            collection.add(newDoc);
            return options['returnDocument'] == 'after' ? newDoc : null;
          }
          return null;
        }

        final original = Map<String, dynamic>.from(collection[index]);
        collection[index] = _applyUpdate(collection[index], update);
        return options['returnDocument'] == 'after' ? collection[index] : original;

      case 'findOneAndDelete':
        final dbName = args[0] as String;
        final collName = args[1] as String;
        final filter = args[2] as Document;
        final collection = _getCollection(dbName, collName);
        final index = collection.indexWhere((doc) => _matchesFilter(doc, filter));

        if (index == -1) return null;
        final deleted = collection.removeAt(index);
        return deleted;

      case 'updateOne':
        final dbName = args[0] as String;
        final collName = args[1] as String;
        final filter = args[2] as Document;
        final update = args[3] as Document;
        final options = args.length > 4 ? args[4] as Document : <String, dynamic>{};
        final collection = _getCollection(dbName, collName);
        final index = collection.indexWhere((doc) => _matchesFilter(doc, filter));

        if (index == -1) {
          if (options['upsert'] == true) {
            final id = 'id_${_nextId++}';
            collection.add({'_id': id, ..._applyUpdate({}, update)});
            return {
              'acknowledged': true,
              'matchedCount': 0,
              'modifiedCount': 0,
              'upsertedId': id,
              'upsertedCount': 1,
            };
          }
          return {'acknowledged': true, 'matchedCount': 0, 'modifiedCount': 0};
        }

        collection[index] = _applyUpdate(collection[index], update);
        return {'acknowledged': true, 'matchedCount': 1, 'modifiedCount': 1};

      case 'updateMany':
        final dbName = args[0] as String;
        final collName = args[1] as String;
        final filter = args[2] as Document;
        final update = args[3] as Document;
        final collection = _getCollection(dbName, collName);
        var matchedCount = 0;
        var modifiedCount = 0;

        for (var i = 0; i < collection.length; i++) {
          if (_matchesFilter(collection[i], filter)) {
            matchedCount++;
            final updated = _applyUpdate(collection[i], update);
            if (jsonEncode(updated) != jsonEncode(collection[i])) {
              collection[i] = updated;
              modifiedCount++;
            }
          }
        }

        return {
          'acknowledged': true,
          'matchedCount': matchedCount,
          'modifiedCount': modifiedCount,
        };

      case 'deleteOne':
        final dbName = args[0] as String;
        final collName = args[1] as String;
        final filter = args[2] as Document;
        final collection = _getCollection(dbName, collName);
        final index = collection.indexWhere((doc) => _matchesFilter(doc, filter));

        if (index == -1) {
          return {'acknowledged': true, 'deletedCount': 0};
        }

        collection.removeAt(index);
        return {'acknowledged': true, 'deletedCount': 1};

      case 'deleteMany':
        final dbName = args[0] as String;
        final collName = args[1] as String;
        final filter = args[2] as Document;
        final collection = _getCollection(dbName, collName);
        final initialLength = collection.length;
        collection.removeWhere((doc) => _matchesFilter(doc, filter));
        return {
          'acknowledged': true,
          'deletedCount': initialLength - collection.length,
        };

      case 'countDocuments':
        final dbName = args[0] as String;
        final collName = args[1] as String;
        final filter = args[2] as Document;
        return _getCollection(dbName, collName)
            .where((doc) => _matchesFilter(doc, filter))
            .length;

      case 'estimatedDocumentCount':
        final dbName = args[0] as String;
        final collName = args[1] as String;
        return _getCollection(dbName, collName).length;

      case 'distinct':
        final dbName = args[0] as String;
        final collName = args[1] as String;
        final field = args[2] as String;
        final filter = args.length > 3 ? args[3] as Document : <String, dynamic>{};
        final values = <dynamic>{};
        for (final doc in _getCollection(dbName, collName)) {
          if (_matchesFilter(doc, filter) && doc.containsKey(field)) {
            values.add(doc[field]);
          }
        }
        return values.toList();

      case 'aggregate':
        final dbName = args[0] as String;
        final collName = args[1] as String;
        final pipeline = args[2] as List<dynamic>;
        var results = List<Document>.from(_getCollection(dbName, collName));

        for (final stage in pipeline) {
          final stageMap = stage as Map<String, dynamic>;
          if (stageMap.containsKey('\$match')) {
            results = results.where((doc) => _matchesFilter(doc, stageMap['\$match'] as Document)).toList();
          } else if (stageMap.containsKey('\$limit')) {
            results = results.take(stageMap['\$limit'] as int).toList();
          } else if (stageMap.containsKey('\$skip')) {
            results = results.skip(stageMap['\$skip'] as int).toList();
          } else if (stageMap.containsKey('\$sort')) {
            results = _sortDocs(results, stageMap['\$sort'] as Map<String, dynamic>);
          } else if (stageMap.containsKey('\$count')) {
            results = [{stageMap['\$count'] as String: results.length}];
          }
        }

        return results;

      case 'createCollection':
        final dbName = args[0] as String;
        final collName = args[1] as String;
        _getOrCreateCollection(dbName, collName);
        return {'ok': 1};

      case 'dropCollection':
        final dbName = args[0] as String;
        final collName = args[1] as String;
        _data[dbName]?.remove(collName);
        return true;

      case 'dropDatabase':
        final dbName = args[0] as String;
        _data.remove(dbName);
        return true;

      case 'listCollections':
        final dbName = args[0] as String;
        final db = _data[dbName] ?? {};
        return db.keys.map((name) => {'name': name, 'type': 'collection'}).toList();

      case 'listDatabases':
        return {
          'databases': _data.keys.map((name) => {'name': name, 'sizeOnDisk': 0, 'empty': _data[name]?.isEmpty ?? true}).toList(),
          'totalSize': 0,
        };

      case 'createIndex':
      case 'createIndexes':
        return 'index_name';

      case 'dropIndex':
      case 'dropIndexes':
        return null;

      case 'listIndexes':
        return [{'v': 2, 'key': {'_id': 1}, 'name': '_id_'}];

      case 'runCommand':
        final command = args[1] as Document;
        if (command.containsKey('dbStats')) {
          return {
            'db': args[0],
            'collections': 0,
            'objects': 0,
            'avgObjSize': 0,
            'dataSize': 0,
            'storageSize': 0,
            'indexes': 0,
            'indexSize': 0,
            'ok': 1,
          };
        }
        if (command.containsKey('ping')) {
          return {'ok': 1};
        }
        return {'ok': 1};

      case 'serverStatus':
        return {'host': 'localhost', 'version': '1.0.0', 'ok': 1};

      case 'adminCommand':
        return {'ok': 1};

      default:
        throw MongoException('Unknown method: $method');
    }
  }

  @override
  Future<void> close() async {
    _closed = true;
  }

  List<Document> _getOrCreateCollection(String dbName, String collName) {
    _data.putIfAbsent(dbName, () => {});
    return _data[dbName]!.putIfAbsent(collName, () => []);
  }

  List<Document> _getCollection(String dbName, String collName) {
    return _data[dbName]?[collName] ?? [];
  }

  bool _matchesFilter(Document doc, Document filter) {
    if (filter.isEmpty) return true;

    for (final entry in filter.entries) {
      final key = entry.key;
      final value = entry.value;

      if (key == '\$and') {
        if (!(value as List).every((f) => _matchesFilter(doc, f as Document))) {
          return false;
        }
        continue;
      }
      if (key == '\$or') {
        if (!(value as List).any((f) => _matchesFilter(doc, f as Document))) {
          return false;
        }
        continue;
      }

      final docValue = doc[key];

      if (value is Map<String, dynamic>) {
        for (final opEntry in value.entries) {
          final op = opEntry.key;
          final opValue = opEntry.value;

          switch (op) {
            case '\$eq':
              if (docValue != opValue) return false;
              break;
            case '\$ne':
              if (docValue == opValue) return false;
              break;
            case '\$gt':
              if (docValue == null || (docValue as Comparable) <= opValue) return false;
              break;
            case '\$gte':
              if (docValue == null || (docValue as Comparable) < opValue) return false;
              break;
            case '\$lt':
              if (docValue == null || (docValue as Comparable) >= opValue) return false;
              break;
            case '\$lte':
              if (docValue == null || (docValue as Comparable) > opValue) return false;
              break;
            case '\$in':
              if (!(opValue as List).contains(docValue)) return false;
              break;
            case '\$nin':
              if ((opValue as List).contains(docValue)) return false;
              break;
            case '\$exists':
              if ((opValue as bool) != doc.containsKey(key)) return false;
              break;
            case '\$regex':
              if (docValue == null || !RegExp(opValue as String).hasMatch(docValue as String)) {
                return false;
              }
              break;
          }
        }
      } else {
        if (docValue != value) return false;
      }
    }

    return true;
  }

  List<Document> _sortDocs(List<Document> docs, Map<String, dynamic> sort) {
    return [...docs]..sort((a, b) {
      for (final entry in sort.entries) {
        final key = entry.key;
        final direction = entry.value as int;
        final aVal = a[key];
        final bVal = b[key];

        if (aVal == bVal) continue;
        if (aVal == null) return direction;
        if (bVal == null) return -direction;

        final comparison = (aVal as Comparable).compareTo(bVal);
        if (comparison != 0) return comparison * direction;
      }
      return 0;
    });
  }

  Document _applyUpdate(Document doc, Document update) {
    final result = Map<String, dynamic>.from(doc);

    if (update.containsKey('\$set')) {
      result.addAll(update['\$set'] as Map<String, dynamic>);
    }

    if (update.containsKey('\$unset')) {
      for (final key in (update['\$unset'] as Map<String, dynamic>).keys) {
        result.remove(key);
      }
    }

    if (update.containsKey('\$inc')) {
      for (final entry in (update['\$inc'] as Map<String, dynamic>).entries) {
        result[entry.key] = (result[entry.key] as num? ?? 0) + (entry.value as num);
      }
    }

    if (update.containsKey('\$push')) {
      for (final entry in (update['\$push'] as Map<String, dynamic>).entries) {
        final arr = (result[entry.key] as List<dynamic>?) ?? [];
        if (entry.value is Map && (entry.value as Map).containsKey('\$each')) {
          arr.addAll((entry.value as Map)['\$each'] as List);
        } else {
          arr.add(entry.value);
        }
        result[entry.key] = arr;
      }
    }

    if (update.containsKey('\$pull')) {
      for (final entry in (update['\$pull'] as Map<String, dynamic>).entries) {
        final arr = (result[entry.key] as List<dynamic>?) ?? [];
        arr.remove(entry.value);
        result[entry.key] = arr;
      }
    }

    if (update.containsKey('\$addToSet')) {
      for (final entry in (update['\$addToSet'] as Map<String, dynamic>).entries) {
        final arr = (result[entry.key] as List<dynamic>?) ?? [];
        if (entry.value is Map && (entry.value as Map).containsKey('\$each')) {
          for (final item in (entry.value as Map)['\$each'] as List) {
            if (!arr.contains(item)) arr.add(item);
          }
        } else {
          if (!arr.contains(entry.value)) arr.add(entry.value);
        }
        result[entry.key] = arr;
      }
    }

    return result;
  }
}

/// MongoClient - the main entry point for database connections
class MongoClient {
  final String _uri;
  final MongoClientOptions _options;
  RpcTransport? _transport;
  bool _connected = false;
  final Map<String, MongoDatabase> _databases = {};
  String? _defaultDbName;

  /// Create a new MongoClient
  MongoClient(this._uri, [MongoClientOptions? options])
      : _options = options ?? const MongoClientOptions() {
    try {
      final parsed = parseConnectionUri(_uri);
      _defaultDbName = parsed.database;
    } catch (_) {
      // Ignore parse errors
    }
  }

  /// Connect to the database
  Future<MongoClient> connect() async {
    if (_connected) return this;

    // Create the transport based on URI
    if (_uri.startsWith('mock://')) {
      _transport = MockRpcTransport();
    } else {
      _transport = HttpRpcTransport(_uri, token: _options.token);
    }

    // Perform initial handshake
    await _transport!.call('connect', [_uri]);

    _connected = true;
    return this;
  }

  /// Get a database by name
  MongoDatabase db([String? name]) {
    if (_transport == null) {
      throw ConnectionException('Client must be connected before calling db()');
    }

    final dbName = name ?? _defaultDbName ?? 'test';
    return _databases.putIfAbsent(
      dbName,
      () => MongoDatabase(_transport!, dbName),
    );
  }

  /// List all databases
  Future<List<String>> listDatabaseNames() async {
    final result = await _transport!.call('listDatabases', []);
    final databases = (result as Map<String, dynamic>)['databases'] as List<dynamic>;
    return databases.map((db) => (db as Map<String, dynamic>)['name'] as String).toList();
  }

  /// Close the connection
  Future<void> close() async {
    if (_transport != null) {
      await _transport!.close();
      _transport = null;
    }
    _connected = false;
    _databases.clear();
  }

  /// Check if connected
  bool get isConnected => _connected;

  /// Get the internal transport (for testing)
  RpcTransport? get transport => _transport;

  /// Set a custom transport (for testing)
  void setTransport(RpcTransport transport) {
    _transport = transport;
    _connected = true;
  }

  /// Static connect method for convenience
  static Future<MongoClient> connectUri(String uri, [MongoClientOptions? options]) async {
    final client = MongoClient(uri, options);
    return client.connect();
  }
}
