/// MongoDB collection for mongo.do
library;

import 'dart:async';
import 'types.dart';
import 'cursor.dart';
import 'selector.dart';

/// A MongoDB collection
class MongoCollection {
  final RpcTransport _transport;
  final String _dbName;
  final String _collectionName;

  MongoCollection(this._transport, this._dbName, this._collectionName);

  /// Get the collection name
  String get collectionName => _collectionName;

  /// Get the database name
  String get databaseName => _dbName;

  /// Find documents matching a filter
  MongoCursor<Document> find([dynamic filter, FindOptions? options]) {
    final filterMap = _normalizeFilter(filter);
    final optionsMap = options?.toJson() ?? <String, dynamic>{};
    return MongoCursor<Document>(
      _transport,
      _dbName,
      _collectionName,
      filterMap,
      optionsMap,
    );
  }

  /// Find a single document matching a filter
  Future<Document?> findOne([dynamic filter, FindOptions? options]) async {
    final filterMap = _normalizeFilter(filter);
    final optionsMap = {...(options?.toJson() ?? {}), 'limit': 1};
    final cursor = MongoCursor<Document>(
      _transport,
      _dbName,
      _collectionName,
      filterMap,
      optionsMap,
    );
    return cursor.first();
  }

  /// Find a document by ID
  Future<Document?> findById(dynamic id) async {
    return findOne(where.id(id));
  }

  /// Insert a single document
  Future<InsertOneResult> insertOne(Document document) async {
    final result = await _transport.call('insertOne', [
      _dbName,
      _collectionName,
      document,
    ]);
    return InsertOneResult.fromJson(result as Map<String, dynamic>);
  }

  /// Insert multiple documents
  Future<InsertManyResult> insertMany(List<Document> documents) async {
    final result = await _transport.call('insertMany', [
      _dbName,
      _collectionName,
      documents,
    ]);
    return InsertManyResult.fromJson(result as Map<String, dynamic>);
  }

  /// Update a single document
  Future<UpdateResult> updateOne(
    dynamic filter,
    dynamic update, [
    UpdateOptions? options,
  ]) async {
    final filterMap = _normalizeFilter(filter);
    final updateMap = _normalizeUpdate(update);
    final result = await _transport.call('updateOne', [
      _dbName,
      _collectionName,
      filterMap,
      updateMap,
      options?.toJson() ?? {},
    ]);
    return UpdateResult.fromJson(result as Map<String, dynamic>);
  }

  /// Update multiple documents
  Future<UpdateResult> updateMany(
    dynamic filter,
    dynamic update, [
    UpdateOptions? options,
  ]) async {
    final filterMap = _normalizeFilter(filter);
    final updateMap = _normalizeUpdate(update);
    final result = await _transport.call('updateMany', [
      _dbName,
      _collectionName,
      filterMap,
      updateMap,
      options?.toJson() ?? {},
    ]);
    return UpdateResult.fromJson(result as Map<String, dynamic>);
  }

  /// Replace a single document
  Future<UpdateResult> replaceOne(
    dynamic filter,
    Document replacement, [
    UpdateOptions? options,
  ]) async {
    final filterMap = _normalizeFilter(filter);
    final result = await _transport.call('replaceOne', [
      _dbName,
      _collectionName,
      filterMap,
      replacement,
      options?.toJson() ?? {},
    ]);
    return UpdateResult.fromJson(result as Map<String, dynamic>);
  }

  /// Delete a single document
  Future<DeleteResult> deleteOne(dynamic filter, [DeleteOptions? options]) async {
    final filterMap = _normalizeFilter(filter);
    final result = await _transport.call('deleteOne', [
      _dbName,
      _collectionName,
      filterMap,
      options?.toJson() ?? {},
    ]);
    return DeleteResult.fromJson(result as Map<String, dynamic>);
  }

  /// Delete multiple documents
  Future<DeleteResult> deleteMany(dynamic filter, [DeleteOptions? options]) async {
    final filterMap = _normalizeFilter(filter);
    final result = await _transport.call('deleteMany', [
      _dbName,
      _collectionName,
      filterMap,
      options?.toJson() ?? {},
    ]);
    return DeleteResult.fromJson(result as Map<String, dynamic>);
  }

  /// Find and update a document atomically
  Future<Document?> findOneAndUpdate(
    dynamic filter,
    dynamic update, {
    bool? upsert,
    bool returnDocument = false,
    Map<String, dynamic>? sort,
    Map<String, dynamic>? projection,
  }) async {
    final filterMap = _normalizeFilter(filter);
    final updateMap = _normalizeUpdate(update);
    final result = await _transport.call('findOneAndUpdate', [
      _dbName,
      _collectionName,
      filterMap,
      updateMap,
      {
        'upsert': upsert,
        'returnDocument': returnDocument ? 'after' : 'before',
        if (sort != null) 'sort': sort,
        if (projection != null) 'projection': projection,
      },
    ]);
    return result as Document?;
  }

  /// Find and delete a document atomically
  Future<Document?> findOneAndDelete(
    dynamic filter, {
    Map<String, dynamic>? sort,
    Map<String, dynamic>? projection,
  }) async {
    final filterMap = _normalizeFilter(filter);
    final result = await _transport.call('findOneAndDelete', [
      _dbName,
      _collectionName,
      filterMap,
      {
        if (sort != null) 'sort': sort,
        if (projection != null) 'projection': projection,
      },
    ]);
    return result as Document?;
  }

  /// Find and replace a document atomically
  Future<Document?> findOneAndReplace(
    dynamic filter,
    Document replacement, {
    bool? upsert,
    bool returnDocument = false,
    Map<String, dynamic>? sort,
    Map<String, dynamic>? projection,
  }) async {
    final filterMap = _normalizeFilter(filter);
    final result = await _transport.call('findOneAndReplace', [
      _dbName,
      _collectionName,
      filterMap,
      replacement,
      {
        'upsert': upsert,
        'returnDocument': returnDocument ? 'after' : 'before',
        if (sort != null) 'sort': sort,
        if (projection != null) 'projection': projection,
      },
    ]);
    return result as Document?;
  }

  /// Count documents matching a filter
  Future<int> countDocuments([dynamic filter, CountOptions? options]) async {
    final filterMap = _normalizeFilter(filter);
    final result = await _transport.call('countDocuments', [
      _dbName,
      _collectionName,
      filterMap,
      options?.toJson() ?? {},
    ]);
    return result as int;
  }

  /// Get an estimated document count
  Future<int> estimatedDocumentCount() async {
    final result = await _transport.call('estimatedDocumentCount', [
      _dbName,
      _collectionName,
    ]);
    return result as int;
  }

  /// Get distinct values for a field
  Future<List<dynamic>> distinct(String field, [dynamic filter]) async {
    final filterMap = _normalizeFilter(filter);
    final result = await _transport.call('distinct', [
      _dbName,
      _collectionName,
      field,
      filterMap,
    ]);
    return (result as List<dynamic>);
  }

  /// Run an aggregation pipeline
  Future<List<Document>> aggregate(
    List<Map<String, dynamic>> pipeline, [
    AggregateOptions? options,
  ]) async {
    final result = await _transport.call('aggregate', [
      _dbName,
      _collectionName,
      pipeline,
      options?.toJson() ?? {},
    ]);
    return (result as List<dynamic>).cast<Document>();
  }

  /// Create an index
  Future<String> createIndex(
    Map<String, dynamic> keys, {
    String? name,
    bool? unique,
    bool? sparse,
    int? expireAfterSeconds,
  }) async {
    final result = await _transport.call('createIndex', [
      _dbName,
      _collectionName,
      keys,
      {
        if (name != null) 'name': name,
        if (unique != null) 'unique': unique,
        if (sparse != null) 'sparse': sparse,
        if (expireAfterSeconds != null) 'expireAfterSeconds': expireAfterSeconds,
      },
    ]);
    return result as String;
  }

  /// Create multiple indexes
  Future<List<String>> createIndexes(List<Map<String, dynamic>> indexes) async {
    final result = await _transport.call('createIndexes', [
      _dbName,
      _collectionName,
      indexes,
    ]);
    return (result as List<dynamic>).cast<String>();
  }

  /// Drop an index
  Future<void> dropIndex(String indexName) async {
    await _transport.call('dropIndex', [
      _dbName,
      _collectionName,
      indexName,
    ]);
  }

  /// Drop all indexes
  Future<void> dropIndexes() async {
    await _transport.call('dropIndexes', [
      _dbName,
      _collectionName,
    ]);
  }

  /// List indexes
  Future<List<Document>> listIndexes() async {
    final result = await _transport.call('listIndexes', [
      _dbName,
      _collectionName,
    ]);
    return (result as List<dynamic>).cast<Document>();
  }

  /// Drop this collection
  Future<void> drop() async {
    await _transport.call('dropCollection', [
      _dbName,
      _collectionName,
    ]);
  }

  /// Rename this collection
  Future<void> rename(String newName, {bool dropTarget = false}) async {
    await _transport.call('renameCollection', [
      _dbName,
      _collectionName,
      newName,
      {'dropTarget': dropTarget},
    ]);
  }

  /// Bulk write operations
  Future<BulkWriteResult> bulkWrite(
    List<Map<String, dynamic>> operations, {
    bool ordered = true,
  }) async {
    final result = await _transport.call('bulkWrite', [
      _dbName,
      _collectionName,
      operations,
      {'ordered': ordered},
    ]);
    return BulkWriteResult.fromJson(result as Map<String, dynamic>);
  }

  /// Watch for changes (change stream)
  Stream<ChangeEvent> watch([List<Map<String, dynamic>>? pipeline]) {
    final controller = StreamController<ChangeEvent>();

    // Implement change stream via polling or WebSocket
    // This is a simplified implementation
    controller.onListen = () async {
      try {
        while (!controller.isClosed) {
          final result = await _transport.call('watch', [
            _dbName,
            _collectionName,
            pipeline ?? [],
          ]);
          if (result != null) {
            controller.add(ChangeEvent.fromJson(result as Map<String, dynamic>));
          }
          await Future.delayed(const Duration(milliseconds: 100));
        }
      } catch (e) {
        if (!controller.isClosed) {
          controller.addError(e);
        }
      }
    };

    return controller.stream;
  }

  Map<String, dynamic> _normalizeFilter(dynamic filter) {
    if (filter == null) return {};
    if (filter is SelectorBuilder) return filter.map;
    if (filter is Map<String, dynamic>) return filter;
    throw ArgumentError('Invalid filter type: ${filter.runtimeType}');
  }

  Map<String, dynamic> _normalizeUpdate(dynamic update) {
    if (update is ModifierBuilder) return update.map;
    if (update is Map<String, dynamic>) return update;
    throw ArgumentError('Invalid update type: ${update.runtimeType}');
  }
}

/// A typed MongoDB collection
class TypedCollection<T> {
  final MongoCollection _collection;
  final T Function(Map<String, dynamic>) _fromJson;
  final Map<String, dynamic> Function(T) _toJson;

  TypedCollection(
    this._collection,
    this._fromJson,
    this._toJson,
  );

  /// Find documents matching a filter
  Future<List<T>> find([dynamic filter, FindOptions? options]) async {
    final cursor = _collection.find(filter, options);
    final docs = await cursor.toList();
    return docs.map(_fromJson).toList();
  }

  /// Find a single document matching a filter
  Future<T?> findOne([dynamic filter, FindOptions? options]) async {
    final doc = await _collection.findOne(filter, options);
    return doc != null ? _fromJson(doc) : null;
  }

  /// Insert a single document
  Future<InsertOneResult> insertOne(T document) async {
    return _collection.insertOne(_toJson(document));
  }

  /// Insert multiple documents
  Future<InsertManyResult> insertMany(List<T> documents) async {
    return _collection.insertMany(documents.map(_toJson).toList());
  }

  /// Update a single document
  Future<UpdateResult> updateOne(
    dynamic filter,
    dynamic update, [
    UpdateOptions? options,
  ]) async {
    return _collection.updateOne(filter, update, options);
  }

  /// Update multiple documents
  Future<UpdateResult> updateMany(
    dynamic filter,
    dynamic update, [
    UpdateOptions? options,
  ]) async {
    return _collection.updateMany(filter, update, options);
  }

  /// Delete a single document
  Future<DeleteResult> deleteOne(dynamic filter, [DeleteOptions? options]) async {
    return _collection.deleteOne(filter, options);
  }

  /// Delete multiple documents
  Future<DeleteResult> deleteMany(dynamic filter, [DeleteOptions? options]) async {
    return _collection.deleteMany(filter, options);
  }

  /// Count documents matching a filter
  Future<int> countDocuments([dynamic filter, CountOptions? options]) async {
    return _collection.countDocuments(filter, options);
  }
}

/// Bulk write result
class BulkWriteResult {
  final int insertedCount;
  final int matchedCount;
  final int modifiedCount;
  final int deletedCount;
  final int upsertedCount;
  final Map<int, dynamic> upsertedIds;

  const BulkWriteResult({
    required this.insertedCount,
    required this.matchedCount,
    required this.modifiedCount,
    required this.deletedCount,
    required this.upsertedCount,
    required this.upsertedIds,
  });

  factory BulkWriteResult.fromJson(Map<String, dynamic> json) {
    final upsertedIdsRaw = json['upsertedIds'] as Map<String, dynamic>?;
    return BulkWriteResult(
      insertedCount: json['insertedCount'] as int? ?? 0,
      matchedCount: json['matchedCount'] as int? ?? 0,
      modifiedCount: json['modifiedCount'] as int? ?? 0,
      deletedCount: json['deletedCount'] as int? ?? 0,
      upsertedCount: json['upsertedCount'] as int? ?? 0,
      upsertedIds: upsertedIdsRaw?.map((k, v) => MapEntry(int.parse(k), v)) ?? {},
    );
  }
}

/// Change event from a change stream
class ChangeEvent {
  final String operationType;
  final Document? fullDocument;
  final Document? documentKey;
  final Document? updateDescription;
  final String? clusterTime;

  const ChangeEvent({
    required this.operationType,
    this.fullDocument,
    this.documentKey,
    this.updateDescription,
    this.clusterTime,
  });

  factory ChangeEvent.fromJson(Map<String, dynamic> json) {
    return ChangeEvent(
      operationType: json['operationType'] as String,
      fullDocument: json['fullDocument'] as Document?,
      documentKey: json['documentKey'] as Document?,
      updateDescription: json['updateDescription'] as Document?,
      clusterTime: json['clusterTime'] as String?,
    );
  }
}
