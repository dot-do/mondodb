package do_.mongo

import scala.util.control.NoStackTrace

/**
 * Sealed trait representing all MongoDB errors.
 * Use pattern matching to handle specific error types.
 */
sealed trait MongoError extends NoStackTrace:
  def message: String
  def code: Option[Int]
  override def getMessage: String = message

object MongoError:
  /** Create a generic MongoError */
  def apply(msg: String): MongoError = GenericError(msg, None)
  def apply(msg: String, code: Int): MongoError = GenericError(msg, Some(code))

/**
 * Generic MongoDB error with optional error code.
 */
final case class GenericError(
  message: String,
  code: Option[Int] = None
) extends MongoError

/**
 * Connection-related errors.
 */
final case class ConnectionError(
  message: String,
  host: Option[String] = None,
  code: Option[Int] = None
) extends MongoError

/**
 * Authentication failures.
 */
final case class AuthenticationError(
  message: String,
  code: Option[Int] = Some(18)
) extends MongoError

/**
 * Authorization/permission errors.
 */
final case class AuthorizationError(
  message: String,
  code: Option[Int] = Some(13)
) extends MongoError

/**
 * Document validation errors.
 */
final case class ValidationError(
  message: String,
  field: Option[String] = None,
  code: Option[Int] = Some(121)
) extends MongoError

/**
 * Duplicate key errors (unique constraint violations).
 */
final case class DuplicateKeyError(
  message: String,
  keyPattern: Map[String, Any] = Map.empty,
  keyValue: Map[String, Any] = Map.empty,
  code: Option[Int] = Some(11000)
) extends MongoError

/**
 * Document not found errors.
 */
final case class NotFoundError(
  message: String,
  collection: Option[String] = None,
  code: Option[Int] = None
) extends MongoError

/**
 * Query execution errors.
 */
final case class QueryError(
  message: String,
  query: Option[String] = None,
  code: Option[Int] = None
) extends MongoError

/**
 * Write operation errors.
 */
final case class WriteError(
  message: String,
  index: Int = 0,
  code: Option[Int] = None
) extends MongoError

/**
 * Transaction-related errors.
 */
final case class TransactionError(
  message: String,
  code: Option[Int] = None
) extends MongoError

/**
 * Timeout errors.
 */
final case class TimeoutError(
  message: String,
  timeoutMs: Long = 0,
  code: Option[Int] = Some(50)
) extends MongoError

/**
 * Network/transport errors.
 */
final case class NetworkError(
  message: String,
  code: Option[Int] = None
) extends MongoError

/**
 * Serialization/deserialization errors.
 */
final case class SerializationError(
  message: String,
  typeName: Option[String] = None,
  code: Option[Int] = None
) extends MongoError
