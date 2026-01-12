/// MongoDB exceptions for mongo.do
library;

/// Base exception for all MongoDB errors
class MongoException implements Exception {
  final String message;
  final String? code;
  final bool retriable;

  const MongoException(
    this.message, {
    this.code,
    this.retriable = false,
  });

  @override
  String toString() => 'MongoException: $message${code != null ? ' ($code)' : ''}';
}

/// Exception thrown when a query fails
class QueryException extends MongoException {
  final String? suggestion;

  const QueryException(
    super.message, {
    super.code,
    super.retriable,
    this.suggestion,
  });

  @override
  String toString() {
    var result = 'QueryException: $message';
    if (code != null) result += ' ($code)';
    if (suggestion != null) result += '\nSuggestion: $suggestion';
    return result;
  }
}

/// Exception thrown when connection fails
class ConnectionException extends MongoException {
  const ConnectionException(super.message)
      : super(code: 'CONNECTION_ERROR', retriable: true);

  @override
  String toString() => 'ConnectionException: $message';
}

/// Exception thrown when authentication fails
class AuthenticationException extends MongoException {
  const AuthenticationException(super.message)
      : super(code: 'AUTH_ERROR', retriable: false);

  @override
  String toString() => 'AuthenticationException: $message';
}

/// Exception thrown when a document is not found
class DocumentNotFoundException extends MongoException {
  const DocumentNotFoundException(super.message)
      : super(code: 'NOT_FOUND', retriable: false);

  @override
  String toString() => 'DocumentNotFoundException: $message';
}

/// Exception thrown when a write operation fails
class WriteException extends MongoException {
  final List<Map<String, dynamic>>? writeErrors;
  final Map<String, dynamic>? writeConcernError;

  const WriteException(
    super.message, {
    super.code,
    super.retriable,
    this.writeErrors,
    this.writeConcernError,
  });

  @override
  String toString() => 'WriteException: $message${code != null ? ' ($code)' : ''}';
}

/// Exception thrown when a bulk write operation fails
class BulkWriteException extends WriteException {
  final int insertedCount;
  final int matchedCount;
  final int modifiedCount;
  final int deletedCount;
  final int upsertedCount;

  const BulkWriteException(
    super.message, {
    super.code,
    super.retriable,
    super.writeErrors,
    super.writeConcernError,
    this.insertedCount = 0,
    this.matchedCount = 0,
    this.modifiedCount = 0,
    this.deletedCount = 0,
    this.upsertedCount = 0,
  });

  @override
  String toString() => 'BulkWriteException: $message${code != null ? ' ($code)' : ''}';
}

/// Exception thrown when a transaction fails
class TransactionException extends MongoException {
  const TransactionException(super.message)
      : super(code: 'TRANSACTION_ERROR', retriable: true);

  @override
  String toString() => 'TransactionException: $message';
}

/// Exception thrown when an operation times out
class TimeoutException extends MongoException {
  const TimeoutException(super.message)
      : super(code: 'TIMEOUT', retriable: true);

  @override
  String toString() => 'TimeoutException: $message';
}

/// Exception thrown when validation fails
class ValidationException extends MongoException {
  final Map<String, dynamic>? validationErrors;

  const ValidationException(
    super.message, {
    this.validationErrors,
  }) : super(code: 'VALIDATION_ERROR', retriable: false);

  @override
  String toString() => 'ValidationException: $message';
}
