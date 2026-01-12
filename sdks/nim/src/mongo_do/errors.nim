## MongoDB error types for the .do platform

import std/[options, json]

type
  MongoError* = object of CatchableError
    ## Base error type for MongoDB operations
    code*: string
    details*: Option[JsonNode]

  QueryError* = object of MongoError
    ## Query-related errors
    suggestion*: Option[string]

  ConnectionError* = object of MongoError
    ## Connection-related errors
    uri*: string

  AuthenticationError* = object of MongoError
    ## Authentication errors

  ValidationError* = object of MongoError
    ## Validation errors

  DuplicateKeyError* = object of MongoError
    ## Duplicate key error (code 11000)
    duplicateKey*: Option[JsonNode]

  WriteError* = object of MongoError
    ## Write operation errors

  TransactionError* = object of MongoError
    ## Transaction errors

  TimeoutError* = object of MongoError
    ## Timeout errors

  InvalidURIError* = object of MongoError
    ## Invalid URI format

# Error constructors

proc newMongoError*(code, message: string, details: Option[JsonNode] = none(JsonNode)): ref MongoError =
  result = newException(MongoError, message)
  result.code = code
  result.details = details

proc newQueryError*(message: string, suggestion: Option[string] = none(string), code: string = "QUERY_ERROR"): ref QueryError =
  result = newException(QueryError, message)
  result.code = code
  result.suggestion = suggestion

proc newConnectionError*(message: string, uri: string = ""): ref ConnectionError =
  result = newException(ConnectionError, message)
  result.code = "CONNECTION_ERROR"
  result.uri = uri

proc newAuthenticationError*(message: string): ref AuthenticationError =
  result = newException(AuthenticationError, message)
  result.code = "AUTH_ERROR"

proc newValidationError*(message: string): ref ValidationError =
  result = newException(ValidationError, message)
  result.code = "VALIDATION_ERROR"

proc newDuplicateKeyError*(message: string, details: Option[JsonNode] = none(JsonNode)): ref DuplicateKeyError =
  result = newException(DuplicateKeyError, message)
  result.code = "11000"
  result.details = details

proc newWriteError*(message: string, code: string = "WRITE_ERROR"): ref WriteError =
  result = newException(WriteError, message)
  result.code = code

proc newTransactionError*(message: string): ref TransactionError =
  result = newException(TransactionError, message)
  result.code = "TRANSACTION_ERROR"

proc newTimeoutError*(message: string = "Request timed out"): ref TimeoutError =
  result = newException(TimeoutError, message)
  result.code = "TIMEOUT"

proc newInvalidURIError*(message: string): ref InvalidURIError =
  result = newException(InvalidURIError, message)
  result.code = "INVALID_URI"
