package do_.mongo

import scala.concurrent.{ExecutionContext, Future}
import cats.effect.IO

/**
 * A MongoDB collection with functional-style operations.
 * All operations return Either for error handling.
 *
 * @tparam T the document type (Document for untyped, or a case class for typed)
 */
class MongoCollection[T] private[mongo] (
  private val transport: RpcTransport,
  private val databaseName: String,
  val name: String
)(using codec: MongoCodec[T]):

  // ============ Insert Operations ============

  /**
   * Inserts a single document.
   *
   * @return Either containing the InsertOneResult or an error
   */
  def insertOne(document: T): Either[MongoError, InsertOneResult] =
    val doc = codec.encode(document)
    transport.call("insertOne", databaseName, name, doc).map { result =>
      val resultDoc = result.asInstanceOf[Document]
      InsertOneResult(
        acknowledged = resultDoc.getBoolean("acknowledged").getOrElse(true),
        insertedId = resultDoc.getObjectId("insertedId")
      )
    }

  /**
   * Inserts a single document asynchronously.
   */
  def insertOneAsync(document: T)(using ExecutionContext): Future[Either[MongoError, InsertOneResult]] =
    Future(insertOne(document))

  /**
   * Inserts a single document using Cats Effect IO.
   */
  def insertOneIO(document: T): IO[Either[MongoError, InsertOneResult]] =
    IO(insertOne(document))

  /**
   * Inserts multiple documents.
   */
  def insertMany(documents: List[T]): Either[MongoError, InsertManyResult] =
    val docs = documents.map(codec.encode)
    transport.call("insertMany", databaseName, name, docs).map { result =>
      val resultDoc = result.asInstanceOf[Document]
      InsertManyResult(
        acknowledged = resultDoc.getBoolean("acknowledged").getOrElse(true),
        insertedCount = resultDoc.getInt("insertedCount").getOrElse(0),
        insertedIds = resultDoc.get[Map[Int, ObjectId]]("insertedIds").getOrElse(Map.empty)
      )
    }

  /**
   * Inserts multiple documents asynchronously.
   */
  def insertManyAsync(documents: List[T])(using ExecutionContext): Future[Either[MongoError, InsertManyResult]] =
    Future(insertMany(documents))

  /**
   * Inserts multiple documents using Cats Effect IO.
   */
  def insertManyIO(documents: List[T]): IO[Either[MongoError, InsertManyResult]] =
    IO(insertMany(documents))

  // ============ Find Operations ============

  /**
   * Finds all documents matching the filter.
   */
  def find(filter: Bson = Bson.empty): Either[MongoError, List[T]] =
    transport.call("find", databaseName, name, filter).map { result =>
      result.asInstanceOf[List[Document]].flatMap(codec.decode(_).toOption)
    }

  /**
   * Finds all documents matching the filter asynchronously.
   */
  def findAsync(filter: Bson = Bson.empty)(using ExecutionContext): Future[Either[MongoError, List[T]]] =
    Future(find(filter))

  /**
   * Finds all documents using Cats Effect IO.
   */
  def findIO(filter: Bson = Bson.empty): IO[Either[MongoError, List[T]]] =
    IO(find(filter))

  /**
   * Creates a fluent find operation for method chaining.
   */
  def findFluent(filter: Bson = Bson.empty): FindFluent[T] =
    FindFluent(this, filter)

  /**
   * Finds a single document matching the filter.
   */
  def findOne(filter: Bson = Bson.empty): Either[MongoError, Option[T]] =
    transport.call("findOne", databaseName, name, filter).map { result =>
      Option(result).flatMap {
        case doc: Document => codec.decode(doc).toOption
        case _ => None
      }
    }

  /**
   * Finds a single document asynchronously.
   */
  def findOneAsync(filter: Bson = Bson.empty)(using ExecutionContext): Future[Either[MongoError, Option[T]]] =
    Future(findOne(filter))

  /**
   * Finds a single document using Cats Effect IO.
   */
  def findOneIO(filter: Bson = Bson.empty): IO[Either[MongoError, Option[T]]] =
    IO(findOne(filter))

  /**
   * Finds a document by _id.
   */
  def findById(id: ObjectId): Either[MongoError, Option[T]] =
    findOne(Filters.eq("_id", id))

  /**
   * Finds a document by _id asynchronously.
   */
  def findByIdAsync(id: ObjectId)(using ExecutionContext): Future[Either[MongoError, Option[T]]] =
    Future(findById(id))

  /**
   * Finds a document by _id using Cats Effect IO.
   */
  def findByIdIO(id: ObjectId): IO[Either[MongoError, Option[T]]] =
    IO(findById(id))

  // ============ Update Operations ============

  /**
   * Updates a single document matching the filter.
   */
  def updateOne(filter: Bson, update: Bson): Either[MongoError, UpdateResult] =
    transport.call("updateOne", databaseName, name, filter, update).map { result =>
      val resultDoc = result.asInstanceOf[Document]
      UpdateResult(
        acknowledged = resultDoc.getBoolean("acknowledged").getOrElse(true),
        matchedCount = resultDoc.getLong("matchedCount").getOrElse(0L),
        modifiedCount = resultDoc.getLong("modifiedCount").getOrElse(0L),
        upsertedId = resultDoc.getObjectId("upsertedId")
      )
    }

  /**
   * Updates a single document asynchronously.
   */
  def updateOneAsync(filter: Bson, update: Bson)(using ExecutionContext): Future[Either[MongoError, UpdateResult]] =
    Future(updateOne(filter, update))

  /**
   * Updates a single document using Cats Effect IO.
   */
  def updateOneIO(filter: Bson, update: Bson): IO[Either[MongoError, UpdateResult]] =
    IO(updateOne(filter, update))

  /**
   * Updates multiple documents matching the filter.
   */
  def updateMany(filter: Bson, update: Bson): Either[MongoError, UpdateResult] =
    transport.call("updateMany", databaseName, name, filter, update).map { result =>
      val resultDoc = result.asInstanceOf[Document]
      UpdateResult(
        acknowledged = resultDoc.getBoolean("acknowledged").getOrElse(true),
        matchedCount = resultDoc.getLong("matchedCount").getOrElse(0L),
        modifiedCount = resultDoc.getLong("modifiedCount").getOrElse(0L),
        upsertedId = resultDoc.getObjectId("upsertedId")
      )
    }

  /**
   * Updates multiple documents asynchronously.
   */
  def updateManyAsync(filter: Bson, update: Bson)(using ExecutionContext): Future[Either[MongoError, UpdateResult]] =
    Future(updateMany(filter, update))

  /**
   * Updates multiple documents using Cats Effect IO.
   */
  def updateManyIO(filter: Bson, update: Bson): IO[Either[MongoError, UpdateResult]] =
    IO(updateMany(filter, update))

  /**
   * Replaces a single document.
   */
  def replaceOne(filter: Bson, replacement: T): Either[MongoError, UpdateResult] =
    val doc = codec.encode(replacement)
    transport.call("replaceOne", databaseName, name, filter, doc).map { result =>
      val resultDoc = result.asInstanceOf[Document]
      UpdateResult(
        acknowledged = resultDoc.getBoolean("acknowledged").getOrElse(true),
        matchedCount = resultDoc.getLong("matchedCount").getOrElse(0L),
        modifiedCount = resultDoc.getLong("modifiedCount").getOrElse(0L),
        upsertedId = resultDoc.getObjectId("upsertedId")
      )
    }

  // ============ Delete Operations ============

  /**
   * Deletes a single document matching the filter.
   */
  def deleteOne(filter: Bson): Either[MongoError, DeleteResult] =
    transport.call("deleteOne", databaseName, name, filter).map { result =>
      val resultDoc = result.asInstanceOf[Document]
      DeleteResult(
        acknowledged = resultDoc.getBoolean("acknowledged").getOrElse(true),
        deletedCount = resultDoc.getLong("deletedCount").getOrElse(0L)
      )
    }

  /**
   * Deletes a single document asynchronously.
   */
  def deleteOneAsync(filter: Bson)(using ExecutionContext): Future[Either[MongoError, DeleteResult]] =
    Future(deleteOne(filter))

  /**
   * Deletes a single document using Cats Effect IO.
   */
  def deleteOneIO(filter: Bson): IO[Either[MongoError, DeleteResult]] =
    IO(deleteOne(filter))

  /**
   * Deletes multiple documents matching the filter.
   */
  def deleteMany(filter: Bson): Either[MongoError, DeleteResult] =
    transport.call("deleteMany", databaseName, name, filter).map { result =>
      val resultDoc = result.asInstanceOf[Document]
      DeleteResult(
        acknowledged = resultDoc.getBoolean("acknowledged").getOrElse(true),
        deletedCount = resultDoc.getLong("deletedCount").getOrElse(0L)
      )
    }

  /**
   * Deletes multiple documents asynchronously.
   */
  def deleteManyAsync(filter: Bson)(using ExecutionContext): Future[Either[MongoError, DeleteResult]] =
    Future(deleteMany(filter))

  /**
   * Deletes multiple documents using Cats Effect IO.
   */
  def deleteManyIO(filter: Bson): IO[Either[MongoError, DeleteResult]] =
    IO(deleteMany(filter))

  // ============ Count Operations ============

  /**
   * Counts documents matching the filter.
   */
  def countDocuments(filter: Bson = Bson.empty): Either[MongoError, Long] =
    transport.call("countDocuments", databaseName, name, filter).map { result =>
      result.asInstanceOf[Long]
    }

  /**
   * Counts documents asynchronously.
   */
  def countDocumentsAsync(filter: Bson = Bson.empty)(using ExecutionContext): Future[Either[MongoError, Long]] =
    Future(countDocuments(filter))

  /**
   * Counts documents using Cats Effect IO.
   */
  def countDocumentsIO(filter: Bson = Bson.empty): IO[Either[MongoError, Long]] =
    IO(countDocuments(filter))

  // ============ Aggregation ============

  /**
   * Performs an aggregation pipeline.
   */
  def aggregate(pipeline: List[Bson]): Either[MongoError, List[Document]] =
    transport.call("aggregate", databaseName, name, pipeline).map { result =>
      result.asInstanceOf[List[Document]]
    }

  /**
   * Performs an aggregation pipeline asynchronously.
   */
  def aggregateAsync(pipeline: List[Bson])(using ExecutionContext): Future[Either[MongoError, List[Document]]] =
    Future(aggregate(pipeline))

  /**
   * Performs an aggregation using Cats Effect IO.
   */
  def aggregateIO(pipeline: List[Bson]): IO[Either[MongoError, List[Document]]] =
    IO(aggregate(pipeline))

  // ============ Internal ============

  private[mongo] def getTransport: RpcTransport = transport
  private[mongo] def getDatabaseName: String = databaseName

/**
 * Fluent find operation builder.
 */
case class FindFluent[T](
  private val collection: MongoCollection[T],
  private val filter: Bson,
  private val projection: Option[Bson] = None,
  private val sort: Option[Bson] = None,
  private val skip: Option[Int] = None,
  private val limit: Option[Int] = None
)(using codec: MongoCodec[T]):

  def projection(proj: Bson): FindFluent[T] = copy(projection = Some(proj))
  def sort(s: Bson): FindFluent[T] = copy(sort = Some(s))
  def skip(n: Int): FindFluent[T] = copy(skip = Some(n))
  def limit(n: Int): FindFluent[T] = copy(limit = Some(n))

  def toList: Either[MongoError, List[T]] =
    collection.find(filter).map { results =>
      var r = results
      sort.foreach(_ => r = r) // TODO: implement sorting
      skip.foreach(n => r = r.drop(n))
      limit.foreach(n => r = r.take(n))
      r
    }

  def first: Either[MongoError, Option[T]] =
    toList.map(_.headOption)

// ============ Result Types ============

/**
 * Result of an insertOne operation.
 */
case class InsertOneResult(
  acknowledged: Boolean,
  insertedId: Option[ObjectId]
)

/**
 * Result of an insertMany operation.
 */
case class InsertManyResult(
  acknowledged: Boolean,
  insertedCount: Int,
  insertedIds: Map[Int, ObjectId]
)

/**
 * Result of an update operation.
 */
case class UpdateResult(
  acknowledged: Boolean,
  matchedCount: Long,
  modifiedCount: Long,
  upsertedId: Option[ObjectId]
)

/**
 * Result of a delete operation.
 */
case class DeleteResult(
  acknowledged: Boolean,
  deletedCount: Long
)
