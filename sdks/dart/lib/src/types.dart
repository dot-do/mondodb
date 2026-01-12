/// MongoDB-compatible type definitions for mongo.do
library;

/// MongoDB ObjectId representation
class ObjectId {
  final String oid;

  const ObjectId(this.oid);

  factory ObjectId.fromJson(Map<String, dynamic> json) {
    return ObjectId(json['\$oid'] as String);
  }

  Map<String, dynamic> toJson() => {'\$oid': oid};

  @override
  String toString() => oid;

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is ObjectId && oid == other.oid;

  @override
  int get hashCode => oid.hashCode;
}

/// Generic document type alias
typedef Document = Map<String, dynamic>;

/// Sort direction
enum SortDirection {
  ascending(1),
  descending(-1);

  final int value;
  const SortDirection(this.value);
}

/// Insert one result
class InsertOneResult {
  final bool acknowledged;
  final dynamic insertedId;

  const InsertOneResult({
    required this.acknowledged,
    required this.insertedId,
  });

  factory InsertOneResult.fromJson(Map<String, dynamic> json) {
    return InsertOneResult(
      acknowledged: json['acknowledged'] as bool,
      insertedId: json['insertedId'],
    );
  }
}

/// Insert many result
class InsertManyResult {
  final bool acknowledged;
  final int insertedCount;
  final Map<int, dynamic> insertedIds;

  const InsertManyResult({
    required this.acknowledged,
    required this.insertedCount,
    required this.insertedIds,
  });

  factory InsertManyResult.fromJson(Map<String, dynamic> json) {
    final idsMap = json['insertedIds'] as Map<String, dynamic>?;
    return InsertManyResult(
      acknowledged: json['acknowledged'] as bool,
      insertedCount: json['insertedCount'] as int,
      insertedIds: idsMap?.map((k, v) => MapEntry(int.parse(k), v)) ?? {},
    );
  }
}

/// Update result
class UpdateResult {
  final bool acknowledged;
  final int matchedCount;
  final int modifiedCount;
  final dynamic upsertedId;
  final int? upsertedCount;

  const UpdateResult({
    required this.acknowledged,
    required this.matchedCount,
    required this.modifiedCount,
    this.upsertedId,
    this.upsertedCount,
  });

  factory UpdateResult.fromJson(Map<String, dynamic> json) {
    return UpdateResult(
      acknowledged: json['acknowledged'] as bool,
      matchedCount: json['matchedCount'] as int,
      modifiedCount: json['modifiedCount'] as int,
      upsertedId: json['upsertedId'],
      upsertedCount: json['upsertedCount'] as int?,
    );
  }
}

/// Delete result
class DeleteResult {
  final bool acknowledged;
  final int deletedCount;

  const DeleteResult({
    required this.acknowledged,
    required this.deletedCount,
  });

  factory DeleteResult.fromJson(Map<String, dynamic> json) {
    return DeleteResult(
      acknowledged: json['acknowledged'] as bool,
      deletedCount: json['deletedCount'] as int,
    );
  }
}

/// Find options
class FindOptions {
  final Map<String, dynamic>? sort;
  final int? limit;
  final int? skip;
  final Map<String, dynamic>? projection;
  final String? hint;
  final int? maxTimeMS;
  final bool? allowDiskUse;
  final int? batchSize;
  final String? comment;

  const FindOptions({
    this.sort,
    this.limit,
    this.skip,
    this.projection,
    this.hint,
    this.maxTimeMS,
    this.allowDiskUse,
    this.batchSize,
    this.comment,
  });

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (sort != null) json['sort'] = sort;
    if (limit != null) json['limit'] = limit;
    if (skip != null) json['skip'] = skip;
    if (projection != null) json['projection'] = projection;
    if (hint != null) json['hint'] = hint;
    if (maxTimeMS != null) json['maxTimeMS'] = maxTimeMS;
    if (allowDiskUse != null) json['allowDiskUse'] = allowDiskUse;
    if (batchSize != null) json['batchSize'] = batchSize;
    if (comment != null) json['comment'] = comment;
    return json;
  }
}

/// Update options
class UpdateOptions {
  final bool? upsert;
  final List<Map<String, dynamic>>? arrayFilters;
  final String? hint;

  const UpdateOptions({
    this.upsert,
    this.arrayFilters,
    this.hint,
  });

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (upsert != null) json['upsert'] = upsert;
    if (arrayFilters != null) json['arrayFilters'] = arrayFilters;
    if (hint != null) json['hint'] = hint;
    return json;
  }
}

/// Delete options
class DeleteOptions {
  final String? hint;

  const DeleteOptions({this.hint});

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (hint != null) json['hint'] = hint;
    return json;
  }
}

/// Count options
class CountOptions {
  final int? skip;
  final int? limit;
  final int? maxTimeMS;
  final String? hint;

  const CountOptions({
    this.skip,
    this.limit,
    this.maxTimeMS,
    this.hint,
  });

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (skip != null) json['skip'] = skip;
    if (limit != null) json['limit'] = limit;
    if (maxTimeMS != null) json['maxTimeMS'] = maxTimeMS;
    if (hint != null) json['hint'] = hint;
    return json;
  }
}

/// Aggregate options
class AggregateOptions {
  final bool? allowDiskUse;
  final int? maxTimeMS;
  final int? batchSize;
  final bool? bypassDocumentValidation;
  final Map<String, dynamic>? collation;
  final String? hint;
  final String? comment;
  final Map<String, dynamic>? let$;

  const AggregateOptions({
    this.allowDiskUse,
    this.maxTimeMS,
    this.batchSize,
    this.bypassDocumentValidation,
    this.collation,
    this.hint,
    this.comment,
    this.let$,
  });

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (allowDiskUse != null) json['allowDiskUse'] = allowDiskUse;
    if (maxTimeMS != null) json['maxTimeMS'] = maxTimeMS;
    if (batchSize != null) json['batchSize'] = batchSize;
    if (bypassDocumentValidation != null) {
      json['bypassDocumentValidation'] = bypassDocumentValidation;
    }
    if (collation != null) json['collation'] = collation;
    if (hint != null) json['hint'] = hint;
    if (comment != null) json['comment'] = comment;
    if (let$ != null) json['let'] = let$;
    return json;
  }
}

/// MongoDB client options
class MongoClientOptions {
  /// Request timeout in milliseconds
  final int? timeout;

  /// Enable auto-reconnect
  final bool? autoReconnect;

  /// Maximum number of retries
  final int? maxRetries;

  /// Reconnect interval in milliseconds
  final int? reconnectInterval;

  /// Authentication token
  final String? token;

  const MongoClientOptions({
    this.timeout,
    this.autoReconnect,
    this.maxRetries,
    this.reconnectInterval,
    this.token,
  });
}

/// RPC transport interface
abstract class RpcTransport {
  Future<dynamic> call(String method, List<dynamic> args);
  Future<void> close();
}

/// Collection info
class CollectionInfo {
  final String name;
  final String type;

  const CollectionInfo({required this.name, required this.type});

  factory CollectionInfo.fromJson(Map<String, dynamic> json) {
    return CollectionInfo(
      name: json['name'] as String,
      type: json['type'] as String? ?? 'collection',
    );
  }
}

/// Database stats
class DatabaseStats {
  final String db;
  final int collections;
  final int objects;
  final double avgObjSize;
  final int dataSize;
  final int storageSize;
  final int indexes;
  final int indexSize;

  const DatabaseStats({
    required this.db,
    required this.collections,
    required this.objects,
    required this.avgObjSize,
    required this.dataSize,
    required this.storageSize,
    required this.indexes,
    required this.indexSize,
  });

  factory DatabaseStats.fromJson(Map<String, dynamic> json) {
    return DatabaseStats(
      db: json['db'] as String,
      collections: json['collections'] as int? ?? 0,
      objects: json['objects'] as int? ?? 0,
      avgObjSize: (json['avgObjSize'] as num?)?.toDouble() ?? 0.0,
      dataSize: json['dataSize'] as int? ?? 0,
      storageSize: json['storageSize'] as int? ?? 0,
      indexes: json['indexes'] as int? ?? 0,
      indexSize: json['indexSize'] as int? ?? 0,
    );
  }
}
