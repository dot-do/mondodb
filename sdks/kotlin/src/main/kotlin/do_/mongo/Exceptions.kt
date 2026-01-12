package do_.mongo

/**
 * Base exception for MongoDB operations.
 */
open class MongoException(
    message: String,
    cause: Throwable? = null
) : RuntimeException(message, cause)

/**
 * Exception thrown when connection fails.
 */
class MongoConnectionException(
    message: String,
    cause: Throwable? = null
) : MongoException(message, cause)

/**
 * Exception thrown when a query fails.
 */
class MongoQueryException(
    message: String,
    val errorCode: Int = 0,
    cause: Throwable? = null
) : MongoException(message, cause)

/**
 * Exception thrown when a write operation fails.
 */
class MongoWriteException(
    message: String,
    val errorCode: Int = 0,
    cause: Throwable? = null
) : MongoException(message, cause)

/**
 * Exception thrown when an operation times out.
 */
class MongoTimeoutException(
    message: String,
    cause: Throwable? = null
) : MongoException(message, cause)
