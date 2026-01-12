/// MongoDB database for mongo.do
library;

import 'types.dart';
import 'collection.dart';

/// A MongoDB database
class MongoDatabase {
  final RpcTransport _transport;
  final String _name;
  final Map<String, MongoCollection> _collections = {};

  MongoDatabase(this._transport, this._name);

  /// Get the database name
  String get name => _name;

  /// Get a collection by name
  MongoCollection collection(String name) {
    return _collections.putIfAbsent(
      name,
      () => MongoCollection(_transport, _name, name),
    );
  }

  /// Get a typed collection
  TypedCollection<T> typedCollection<T>(
    String name,
    T Function(Map<String, dynamic>) fromJson,
    Map<String, dynamic> Function(T) toJson,
  ) {
    final coll = collection(name);
    return TypedCollection<T>(coll, fromJson, toJson);
  }

  /// List collection names
  Future<List<String>> listCollectionNames() async {
    final result = await _transport.call('listCollections', [_name]);
    final collections = result as List<dynamic>;
    return collections
        .map((c) => (c as Map<String, dynamic>)['name'] as String)
        .toList();
  }

  /// List collections with info
  Future<List<CollectionInfo>> listCollections() async {
    final result = await _transport.call('listCollections', [_name]);
    final collections = result as List<dynamic>;
    return collections
        .map((c) => CollectionInfo.fromJson(c as Map<String, dynamic>))
        .toList();
  }

  /// Create a collection
  Future<MongoCollection> createCollection(
    String name, {
    Map<String, dynamic>? options,
  }) async {
    await _transport.call('createCollection', [_name, name, options ?? {}]);
    return collection(name);
  }

  /// Drop a collection
  Future<void> dropCollection(String name) async {
    await _transport.call('dropCollection', [_name, name]);
    _collections.remove(name);
  }

  /// Rename a collection
  Future<void> renameCollection(
    String oldName,
    String newName, {
    bool dropTarget = false,
  }) async {
    await _transport.call('renameCollection', [
      _name,
      oldName,
      newName,
      {'dropTarget': dropTarget},
    ]);
    final coll = _collections.remove(oldName);
    if (coll != null) {
      _collections[newName] = collection(newName);
    }
  }

  /// Drop this database
  Future<void> drop() async {
    await _transport.call('dropDatabase', [_name]);
    _collections.clear();
  }

  /// Get database statistics
  Future<DatabaseStats> stats() async {
    final result = await _transport.call('runCommand', [
      _name,
      {'dbStats': 1},
    ]);
    return DatabaseStats.fromJson(result as Map<String, dynamic>);
  }

  /// Run a command on this database
  Future<Map<String, dynamic>> runCommand(Map<String, dynamic> command) async {
    final result = await _transport.call('runCommand', [_name, command]);
    return result as Map<String, dynamic>;
  }

  /// Run an admin command
  Future<Map<String, dynamic>> adminCommand(Map<String, dynamic> command) async {
    final result = await _transport.call('adminCommand', [_name, command]);
    return result as Map<String, dynamic>;
  }

  /// Create user
  Future<void> createUser(
    String username,
    String password, {
    List<Map<String, dynamic>>? roles,
  }) async {
    await runCommand({
      'createUser': username,
      'pwd': password,
      'roles': roles ?? [],
    });
  }

  /// Drop user
  Future<void> dropUser(String username) async {
    await runCommand({'dropUser': username});
  }

  /// Get current operations
  Future<List<Map<String, dynamic>>> currentOp() async {
    final result = await runCommand({'currentOp': 1});
    return (result['inprog'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ?? [];
  }

  /// Kill an operation
  Future<void> killOp(int opId) async {
    await runCommand({'killOp': 1, 'op': opId});
  }

  /// Get server status
  Future<Map<String, dynamic>> serverStatus() async {
    return runCommand({'serverStatus': 1});
  }

  /// Ping the server
  Future<bool> ping() async {
    try {
      final result = await runCommand({'ping': 1});
      return result['ok'] == 1;
    } catch (e) {
      return false;
    }
  }
}
