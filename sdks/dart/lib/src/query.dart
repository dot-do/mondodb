/// Natural language query API for mongo.do
library;

import 'dart:async';
import 'types.dart';
import 'client.dart';
import 'exceptions.dart';

/// Global configuration for mongo.do
class MongoConfig {
  /// Database name
  final String? name;

  /// Domain or URL
  final String? domain;

  /// Enable vector search
  final bool vector;

  /// Enable full-text search
  final bool fulltext;

  /// Enable analytics
  final bool analytics;

  /// Storage configuration
  final StorageConfig? storage;

  /// API key for authentication
  final String? apiKey;

  const MongoConfig({
    this.name,
    this.domain,
    this.vector = false,
    this.fulltext = false,
    this.analytics = false,
    this.storage,
    this.apiKey,
  });
}

/// Storage tier configuration
class StorageConfig {
  final String? hot;
  final String? warm;
  final String? cold;

  const StorageConfig({this.hot, this.warm, this.cold});
}

/// Global Mongo instance holder
class Mongo {
  static MongoConfig? _config;
  static MongoClient? _client;

  /// Configure the global Mongo instance
  static void configure(MongoConfig config) {
    _config = config;
  }

  /// Get the current configuration
  static MongoConfig? get config => _config;

  /// Get or create the client
  static Future<MongoClient> getClient() async {
    if (_client != null && _client!.isConnected) {
      return _client!;
    }

    final config = _config;
    if (config == null) {
      throw MongoException('Mongo is not configured. Call Mongo.configure() first.');
    }

    final uri = config.domain ?? 'https://mongo.do';
    _client = await MongoClient.connectUri(
      uri,
      MongoClientOptions(token: config.apiKey),
    );
    return _client!;
  }

  /// Close the global client
  static Future<void> close() async {
    await _client?.close();
    _client = null;
  }
}

/// Execute a natural language query
///
/// This function translates natural language queries into MongoDB operations
/// using AI-powered query understanding.
///
/// ```dart
/// // Find users
/// final users = await mongo("users who haven't logged in this month");
///
/// // Find with conditions
/// final vips = await mongo("customers with orders over \$1000");
///
/// // Aggregate
/// final revenue = await mongo("total revenue by category this month");
/// ```
Future<T> mongo<T>(String query) {
  return MongoQuery<T>(query);
}

/// A natural language query that can be chained and executed
class MongoQuery<T> implements Future<T> {
  final String _query;
  final List<_PipelineStep> _pipeline = [];
  int? _limitValue;
  int? _skipValue;
  String? _sortField;
  SortDirection? _sortDirection;
  bool _highlight = false;
  bool _fuzzy = false;
  bool _atomic = false;

  MongoQuery(this._query);

  /// Limit results to n documents
  MongoQuery<T> limit(int n) {
    _limitValue = n;
    return this;
  }

  /// Skip the first n documents
  MongoQuery<T> skip(int n) {
    _skipValue = n;
    return this;
  }

  /// Sort results by field
  MongoQuery<T> sort(String field, [SortDirection direction = SortDirection.ascending]) {
    _sortField = field;
    _sortDirection = direction;
    return this;
  }

  /// Enable search result highlighting
  MongoQuery<T> highlight() {
    _highlight = true;
    return this;
  }

  /// Enable fuzzy matching
  MongoQuery<T> fuzzy() {
    _fuzzy = true;
    return this;
  }

  /// Transform results server-side
  MongoQuery<List<R>> map<R>(R Function(T item) mapper) {
    final newQuery = MongoQuery<List<R>>(_query);
    newQuery._pipeline.addAll(_pipeline);
    newQuery._pipeline.add(_MapStep(mapper));
    newQuery._limitValue = _limitValue;
    newQuery._skipValue = _skipValue;
    newQuery._sortField = _sortField;
    newQuery._sortDirection = _sortDirection;
    newQuery._highlight = _highlight;
    newQuery._fuzzy = _fuzzy;
    return newQuery;
  }

  /// Filter results server-side
  MongoQuery<List<T>> where(bool Function(T item) predicate) {
    final newQuery = MongoQuery<List<T>>(_query);
    newQuery._pipeline.addAll(_pipeline);
    newQuery._pipeline.add(_FilterStep(predicate));
    newQuery._limitValue = _limitValue;
    newQuery._skipValue = _skipValue;
    newQuery._sortField = _sortField;
    newQuery._sortDirection = _sortDirection;
    newQuery._highlight = _highlight;
    newQuery._fuzzy = _fuzzy;
    return newQuery;
  }

  /// Reduce results server-side
  MongoQuery<R> reduce<R>(R initial, R Function(R acc, T item) reducer) {
    final newQuery = MongoQuery<R>(_query);
    newQuery._pipeline.addAll(_pipeline);
    newQuery._pipeline.add(_ReduceStep(initial, reducer));
    newQuery._limitValue = _limitValue;
    newQuery._skipValue = _skipValue;
    newQuery._sortField = _sortField;
    newQuery._sortDirection = _sortDirection;
    newQuery._highlight = _highlight;
    newQuery._fuzzy = _fuzzy;
    return newQuery;
  }

  /// Execute as an atomic transaction
  MongoQuery<T> atomic() {
    _atomic = true;
    return this;
  }

  /// Convert to a Stream
  Stream<T> stream() {
    final controller = StreamController<T>();

    _execute().then((result) {
      if (result is List) {
        for (final item in result) {
          controller.add(item as T);
        }
      } else {
        controller.add(result);
      }
      controller.close();
    }).catchError((Object error) {
      controller.addError(error);
      controller.close();
    });

    return controller.stream;
  }

  /// Execute the query
  Future<T> _execute() async {
    final client = await Mongo.getClient();
    final transport = client.transport;
    if (transport == null) {
      throw ConnectionException('Not connected');
    }

    // Build the query request
    final request = {
      'query': _query,
      'options': {
        if (_limitValue != null) 'limit': _limitValue,
        if (_skipValue != null) 'skip': _skipValue,
        if (_sortField != null) 'sort': {_sortField: _sortDirection?.value ?? 1},
        if (_highlight) 'highlight': true,
        if (_fuzzy) 'fuzzy': true,
        if (_atomic) 'atomic': true,
        'pipeline': _pipeline.map((step) => step.toJson()).toList(),
      },
    };

    final result = await transport.call('naturalQuery', [request]);

    // Apply any client-side transformations
    var data = result;
    for (final step in _pipeline) {
      data = step.apply(data);
    }

    return data as T;
  }

  // Future implementation
  @override
  Stream<T> asStream() => stream();

  @override
  Future<T> catchError(Function onError, {bool Function(Object error)? test}) {
    return _execute().catchError(onError, test: test);
  }

  @override
  Future<R> then<R>(FutureOr<R> Function(T value) onValue, {Function? onError}) {
    return _execute().then(onValue, onError: onError);
  }

  @override
  Future<T> timeout(Duration timeLimit, {FutureOr<T> Function()? onTimeout}) {
    return _execute().timeout(timeLimit, onTimeout: onTimeout);
  }

  @override
  Future<T> whenComplete(FutureOr<void> Function() action) {
    return _execute().whenComplete(action);
  }
}

/// Pipeline step base class
abstract class _PipelineStep {
  Map<String, dynamic> toJson();
  dynamic apply(dynamic data);
}

/// Map transformation step
class _MapStep<T, R> implements _PipelineStep {
  final R Function(T item) _mapper;

  _MapStep(this._mapper);

  @override
  Map<String, dynamic> toJson() => {'type': 'map'};

  @override
  dynamic apply(dynamic data) {
    if (data is List) {
      return data.map((item) => _mapper(item as T)).toList();
    }
    return _mapper(data as T);
  }
}

/// Filter step
class _FilterStep<T> implements _PipelineStep {
  final bool Function(T item) _predicate;

  _FilterStep(this._predicate);

  @override
  Map<String, dynamic> toJson() => {'type': 'filter'};

  @override
  dynamic apply(dynamic data) {
    if (data is List) {
      return data.where((item) => _predicate(item as T)).toList();
    }
    return _predicate(data as T) ? data : null;
  }
}

/// Reduce step
class _ReduceStep<T, R> implements _PipelineStep {
  final R _initial;
  final R Function(R acc, T item) _reducer;

  _ReduceStep(this._initial, this._reducer);

  @override
  Map<String, dynamic> toJson() => {'type': 'reduce'};

  @override
  dynamic apply(dynamic data) {
    if (data is List) {
      return data.fold(_initial, (acc, item) => _reducer(acc as R, item as T));
    }
    return _reducer(_initial, data as T);
  }
}

/// Transaction context for atomic operations
class TransactionContext {
  final RpcTransport _transport;
  final String _txId;

  TransactionContext(this._transport, this._txId);

  /// Execute a query within this transaction
  Future<T> query<T>(String query) async {
    final result = await _transport.call('transactionQuery', [
      _txId,
      {'query': query},
    ]);
    return result as T;
  }
}

/// Execute a block within a transaction
Future<T> transaction<T>(Future<T> Function(TransactionContext tx) fn) async {
  final client = await Mongo.getClient();
  final transport = client.transport;
  if (transport == null) {
    throw ConnectionException('Not connected');
  }

  // Begin transaction
  final txResult = await transport.call('beginTransaction', []);
  final txId = (txResult as Map<String, dynamic>)['transactionId'] as String;

  try {
    final ctx = TransactionContext(transport, txId);
    final result = await fn(ctx);

    // Commit transaction
    await transport.call('commitTransaction', [txId]);

    return result;
  } catch (e) {
    // Abort transaction
    await transport.call('abortTransaction', [txId]);
    rethrow;
  }
}
