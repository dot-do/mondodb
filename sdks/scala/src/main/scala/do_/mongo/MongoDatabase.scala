package do_.mongo

import scala.concurrent.{ExecutionContext, Future}
import cats.effect.IO

/**
 * A MongoDB database that provides access to collections.
 */
class MongoDatabase private[mongo] (
  private val transport: RpcTransport,
  val name: String
):

  /**
   * Gets a collection with Document type.
   */
  def getCollection(collectionName: String): MongoCollection[Document] =
    given MongoCodec[Document] = MongoCodec[Document]
    new MongoCollection[Document](transport, name, collectionName)

  /**
   * Gets a typed collection.
   */
  def getTypedCollection[T](collectionName: String)(using codec: MongoCodec[T]): MongoCollection[T] =
    new MongoCollection[T](transport, name, collectionName)

  /**
   * Lists all collection names in this database.
   */
  def listCollectionNames(): Either[MongoError, List[String]] =
    transport.call("listCollections", name).map { result =>
      result.asInstanceOf[List[Document]].flatMap(_.getString("name"))
    }

  /**
   * Lists collection names asynchronously.
   */
  def listCollectionNamesAsync()(using ExecutionContext): Future[Either[MongoError, List[String]]] =
    Future(listCollectionNames())

  /**
   * Lists collection names using Cats Effect IO.
   */
  def listCollectionNamesIO(): IO[Either[MongoError, List[String]]] =
    IO(listCollectionNames())

  /**
   * Creates a collection.
   */
  def createCollection(collectionName: String): Either[MongoError, Unit] =
    transport.call("createCollection", name, collectionName).map(_ => ())

  /**
   * Creates a collection asynchronously.
   */
  def createCollectionAsync(collectionName: String)(using ExecutionContext): Future[Either[MongoError, Unit]] =
    Future(createCollection(collectionName))

  /**
   * Creates a collection using Cats Effect IO.
   */
  def createCollectionIO(collectionName: String): IO[Either[MongoError, Unit]] =
    IO(createCollection(collectionName))

  /**
   * Drops a collection.
   */
  def dropCollection(collectionName: String): Either[MongoError, Unit] =
    transport.call("dropCollection", name, collectionName).map(_ => ())

  /**
   * Drops a collection asynchronously.
   */
  def dropCollectionAsync(collectionName: String)(using ExecutionContext): Future[Either[MongoError, Unit]] =
    Future(dropCollection(collectionName))

  /**
   * Drops a collection using Cats Effect IO.
   */
  def dropCollectionIO(collectionName: String): IO[Either[MongoError, Unit]] =
    IO(dropCollection(collectionName))

  /**
   * Runs a command on this database.
   */
  def runCommand(command: Bson): Either[MongoError, Document] =
    transport.call("runCommand", name, command).map { result =>
      result.asInstanceOf[Document]
    }

  /**
   * Runs a command asynchronously.
   */
  def runCommandAsync(command: Bson)(using ExecutionContext): Future[Either[MongoError, Document]] =
    Future(runCommand(command))

  /**
   * Runs a command using Cats Effect IO.
   */
  def runCommandIO(command: Bson): IO[Either[MongoError, Document]] =
    IO(runCommand(command))

  /**
   * Drops this database.
   */
  def drop(): Either[MongoError, Unit] =
    transport.call("dropDatabase", name).map(_ => ())

  /**
   * Drops this database asynchronously.
   */
  def dropAsync()(using ExecutionContext): Future[Either[MongoError, Unit]] =
    Future(drop())

  /**
   * Drops this database using Cats Effect IO.
   */
  def dropIO(): IO[Either[MongoError, Unit]] =
    IO(drop())

  override def toString: String = s"MongoDatabase($name)"
