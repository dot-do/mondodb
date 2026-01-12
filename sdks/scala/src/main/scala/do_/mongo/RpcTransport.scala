package do_.mongo

import scala.concurrent.Future
import scala.concurrent.ExecutionContext
import io.circe.*
import io.circe.syntax.*

/**
 * Transport layer for RPC communication with mongo.do.
 */
trait RpcTransport:

  /**
   * Sends a synchronous RPC call.
   */
  def call(method: String, params: Any*): Either[MongoError, Any]

  /**
   * Sends an asynchronous RPC call.
   */
  def callAsync(method: String, params: Any*)(using ExecutionContext): Future[Either[MongoError, Any]]

  /**
   * Closes the transport.
   */
  def close(): Unit

/**
 * Mock RPC transport for testing purposes.
 */
class MockRpcTransport extends RpcTransport:
  import scala.collection.mutable

  private val databases = mutable.Map[String, mutable.Map[String, mutable.Buffer[Document]]]()
  private var closed = false

  def isClosed: Boolean = closed

  override def call(method: String, params: Any*): Either[MongoError, Any] =
    if closed then
      Left(ConnectionError("Transport is closed"))
    else
      method match
        case "ping" =>
          Right(Document("ok" -> 1))

        case "connect" =>
          Right(Document("ok" -> 1))

        case "listDatabases" =>
          val dbs = databases.keys.map(name => Document("name" -> name, "sizeOnDisk" -> 0L)).toList
          Right(Document("databases" -> dbs, "ok" -> 1))

        case "createDatabase" if params.nonEmpty =>
          val name = params.head.toString
          databases.getOrElseUpdate(name, mutable.Map.empty)
          Right(Document("ok" -> 1))

        case "dropDatabase" if params.nonEmpty =>
          val name = params.head.toString
          databases.remove(name)
          Right(Document("ok" -> 1))

        case "listCollections" if params.nonEmpty =>
          val dbName = params.head.toString
          val collections = databases.get(dbName).map(_.keys.toList).getOrElse(List.empty)
          Right(collections.map(name => Document("name" -> name)))

        case "createCollection" if params.length >= 2 =>
          val dbName = params(0).toString
          val collName = params(1).toString
          val db = databases.getOrElseUpdate(dbName, mutable.Map.empty)
          db.getOrElseUpdate(collName, mutable.Buffer.empty)
          Right(Document("ok" -> 1))

        case "dropCollection" if params.length >= 2 =>
          val dbName = params(0).toString
          val collName = params(1).toString
          databases.get(dbName).foreach(_.remove(collName))
          Right(Document("ok" -> 1))

        case "insertOne" if params.length >= 3 =>
          val dbName = params(0).toString
          val collName = params(1).toString
          val doc = params(2).asInstanceOf[Document]
          val db = databases.getOrElseUpdate(dbName, mutable.Map.empty)
          val coll = db.getOrElseUpdate(collName, mutable.Buffer.empty)

          val docWithId = if doc.contains("_id") then doc
                          else doc + ("_id" -> ObjectId())

          coll += docWithId
          Right(Document(
            "acknowledged" -> true,
            "insertedId" -> docWithId.getObjectId("_id").getOrElse(ObjectId())
          ))

        case "insertMany" if params.length >= 3 =>
          val dbName = params(0).toString
          val collName = params(1).toString
          val docs = params(2).asInstanceOf[List[Document]]
          val db = databases.getOrElseUpdate(dbName, mutable.Map.empty)
          val coll = db.getOrElseUpdate(collName, mutable.Buffer.empty)

          val docsWithIds = docs.map { doc =>
            if doc.contains("_id") then doc
            else doc + ("_id" -> ObjectId())
          }

          coll ++= docsWithIds
          val insertedIds = docsWithIds.zipWithIndex.map { case (doc, idx) =>
            idx -> doc.getObjectId("_id").getOrElse(ObjectId())
          }.toMap

          Right(Document(
            "acknowledged" -> true,
            "insertedCount" -> docsWithIds.size,
            "insertedIds" -> insertedIds
          ))

        case "find" if params.length >= 3 =>
          val dbName = params(0).toString
          val collName = params(1).toString
          val filter = params(2).asInstanceOf[Bson]
          val db = databases.getOrElse(dbName, mutable.Map.empty)
          val coll = db.getOrElse(collName, mutable.Buffer.empty)

          // Simple filter matching (production would be more sophisticated)
          val results = if filter.toMap.isEmpty then coll.toList
                       else coll.filter(doc => matchesFilter(doc, filter)).toList

          Right(results)

        case "findOne" if params.length >= 3 =>
          val dbName = params(0).toString
          val collName = params(1).toString
          val filter = params(2).asInstanceOf[Bson]
          val db = databases.getOrElse(dbName, mutable.Map.empty)
          val coll = db.getOrElse(collName, mutable.Buffer.empty)

          val result = if filter.toMap.isEmpty then coll.headOption
                       else coll.find(doc => matchesFilter(doc, filter))

          Right(result.orNull)

        case "updateOne" if params.length >= 4 =>
          val dbName = params(0).toString
          val collName = params(1).toString
          val filter = params(2).asInstanceOf[Bson]
          val update = params(3).asInstanceOf[Bson]
          val db = databases.getOrElse(dbName, mutable.Map.empty)
          val coll = db.getOrElse(collName, mutable.Buffer.empty)

          val idx = coll.indexWhere(doc => matchesFilter(doc, filter))
          if idx >= 0 then
            coll(idx) = applyUpdate(coll(idx), update)
            Right(Document("acknowledged" -> true, "matchedCount" -> 1, "modifiedCount" -> 1))
          else
            Right(Document("acknowledged" -> true, "matchedCount" -> 0, "modifiedCount" -> 0))

        case "deleteOne" if params.length >= 3 =>
          val dbName = params(0).toString
          val collName = params(1).toString
          val filter = params(2).asInstanceOf[Bson]
          val db = databases.getOrElse(dbName, mutable.Map.empty)
          val coll = db.getOrElse(collName, mutable.Buffer.empty)

          val idx = coll.indexWhere(doc => matchesFilter(doc, filter))
          if idx >= 0 then
            coll.remove(idx)
            Right(Document("acknowledged" -> true, "deletedCount" -> 1))
          else
            Right(Document("acknowledged" -> true, "deletedCount" -> 0))

        case "deleteMany" if params.length >= 3 =>
          val dbName = params(0).toString
          val collName = params(1).toString
          val filter = params(2).asInstanceOf[Bson]
          val db = databases.getOrElse(dbName, mutable.Map.empty)
          val coll = db.getOrElse(collName, mutable.Buffer.empty)

          val originalSize = coll.size
          val remaining = coll.filterNot(doc => matchesFilter(doc, filter))
          coll.clear()
          coll ++= remaining
          val deleted = originalSize - coll.size

          Right(Document("acknowledged" -> true, "deletedCount" -> deleted))

        case "countDocuments" if params.length >= 3 =>
          val dbName = params(0).toString
          val collName = params(1).toString
          val filter = params(2).asInstanceOf[Bson]
          val db = databases.getOrElse(dbName, mutable.Map.empty)
          val coll = db.getOrElse(collName, mutable.Buffer.empty)

          val count = if filter.toMap.isEmpty then coll.size
                     else coll.count(doc => matchesFilter(doc, filter))

          Right(count.toLong)

        case _ =>
          Left(QueryError(s"Unknown method: $method"))

  override def callAsync(method: String, params: Any*)(using ec: ExecutionContext): Future[Either[MongoError, Any]] =
    Future(call(method, params*))

  override def close(): Unit =
    closed = true

  private def matchesFilter(doc: Document, filter: Bson): Boolean =
    filter.toMap.forall { case (key, value) =>
      doc.get[Any](key).contains(value)
    }

  private def applyUpdate(doc: Document, update: Bson): Document =
    update.toMap.foldLeft(doc) { case (d, (op, value)) =>
      op match
        case "$set" =>
          value.asInstanceOf[Map[String, Any]].foldLeft(d) { case (d2, (k, v)) =>
            d2 + (k -> v)
          }
        case "$unset" =>
          value.asInstanceOf[Map[String, Any]].keys.foldLeft(d) { case (d2, k) =>
            d2 - k
          }
        case "$inc" =>
          value.asInstanceOf[Map[String, Number]].foldLeft(d) { case (d2, (k, v)) =>
            val current = d2.getDouble(k).getOrElse(0.0)
            d2 + (k -> (current + v.doubleValue()))
          }
        case _ => d
    }
