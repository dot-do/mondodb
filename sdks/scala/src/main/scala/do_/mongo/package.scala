package do_

/**
 * MongoDB SDK for Scala.
 *
 * This package provides a functional, type-safe MongoDB client with:
 * - Option and Either for null-safe operations
 * - Future and Cats Effect IO for async operations
 * - Akka Streams and FS2 for streaming
 * - Type-safe codecs for case classes
 *
 * Example usage:
 * {{{
 * import do_.mongo._
 *
 * // Create client
 * val client = MongoClient("mongodb://localhost:27017")
 *
 * // Get database and collection
 * val db = client.getDatabase("myapp")
 * val users = db.getCollection("users")
 *
 * // Insert a document
 * users.insertOne(Document("name" -> "Alice", "age" -> 30))
 *
 * // Query with filters
 * val result = users.find(Filters.eq("name", "Alice"))
 *
 * // Pattern match on Either result
 * result match
 *   case Right(docs) => docs.foreach(println)
 *   case Left(error) => println(s"Error: ${error.message}")
 *
 * // Close client
 * client.close()
 * }}}
 */
package object mongo:

  // Re-export commonly used types
  type MongoError = do_.mongo.MongoError
  type Document = do_.mongo.Document
  type ObjectId = do_.mongo.ObjectId
  type Bson = do_.mongo.Bson
  type MongoCodec[T] = do_.mongo.MongoCodec[T]

  // Re-export companion objects
  val Document = do_.mongo.Document
  val ObjectId = do_.mongo.ObjectId
  val Bson = do_.mongo.Bson
  val Filters = do_.mongo.Filters
  val Updates = do_.mongo.Updates
  val Sorts = do_.mongo.Sorts
  val Projections = do_.mongo.Projections
  val MongoCodec = do_.mongo.MongoCodec

  // Re-export result types
  type InsertOneResult = do_.mongo.InsertOneResult
  type InsertManyResult = do_.mongo.InsertManyResult
  type UpdateResult = do_.mongo.UpdateResult
  type DeleteResult = do_.mongo.DeleteResult

  // Re-export error types
  type ConnectionError = do_.mongo.ConnectionError
  type AuthenticationError = do_.mongo.AuthenticationError
  type ValidationError = do_.mongo.ValidationError
  type DuplicateKeyError = do_.mongo.DuplicateKeyError
  type NotFoundError = do_.mongo.NotFoundError
  type QueryError = do_.mongo.QueryError
  type WriteError = do_.mongo.WriteError
  type TimeoutError = do_.mongo.TimeoutError

  /**
   * Extension methods for working with Either[MongoError, T].
   */
  extension [T](result: Either[MongoError, T])
    /**
     * Converts to Option, discarding error information.
     */
    def toOption: Option[T] = result.toOption

    /**
     * Gets the value or throws the error.
     */
    def getOrThrow: T = result match
      case Right(v) => v
      case Left(e) => throw e

    /**
     * Maps over the success value.
     */
    def mapValue[U](f: T => U): Either[MongoError, U] = result.map(f)

    /**
     * Flat maps over the success value.
     */
    def flatMapValue[U](f: T => Either[MongoError, U]): Either[MongoError, U] = result.flatMap(f)

    /**
     * Recovers from errors.
     */
    def recover(pf: PartialFunction[MongoError, T]): Either[MongoError, T] =
      result.left.flatMap(e => pf.lift(e).toRight(e))

    /**
     * Taps into the result for side effects.
     */
    def tap(f: T => Unit): Either[MongoError, T] =
      result.foreach(f)
      result

    /**
     * Taps into errors for side effects.
     */
    def tapError(f: MongoError => Unit): Either[MongoError, T] =
      result.left.foreach(f)
      result

  /**
   * Extension methods for Option to convert to Either[MongoError, T].
   */
  extension [T](opt: Option[T])
    /**
     * Converts Option to Either with a custom error.
     */
    def toMongoError(error: => MongoError): Either[MongoError, T] =
      opt.toRight(error)

    /**
     * Converts Option to Either with a not found error.
     */
    def orNotFound(message: String): Either[MongoError, T] =
      opt.toRight(NotFoundError(message))
