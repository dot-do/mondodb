package do_.mongo

import scala.concurrent.{ExecutionContext, Future}
import scala.util.matching.Regex
import cats.effect.IO

/**
 * MongoDB Client - the main entry point for database connections.
 *
 * Example usage:
 * {{{
 * val client = MongoClient("mongodb://localhost:27017")
 *
 * // Connect and get database
 * for
 *   _ <- client.connect()
 *   db <- Right(client.getDatabase("myapp"))
 *   users = db.getCollection("users")
 *   result <- users.insertOne(Document("name" -> "Alice"))
 * yield result
 * }}}
 */
class MongoClient private (private val settings: MongoClientSettings):

  private var transport: Option[RpcTransport] = None
  private var connected: Boolean = false
  private var closed: Boolean = false
  private val databases = scala.collection.mutable.Map[String, MongoDatabase]()

  /**
   * Connects to the MongoDB server.
   */
  def connect(): Either[MongoError, Unit] =
    if closed then Left(ConnectionError("Client is closed"))
    else if connected then Right(())
    else
      try
        transport = Some(new MockRpcTransport())
        transport.get.call("connect", settings.connectionString)
        connected = true
        Right(())
      catch
        case e: Exception =>
          Left(ConnectionError(s"Failed to connect: ${e.getMessage}"))

  /**
   * Connects asynchronously.
   */
  def connectAsync()(using ExecutionContext): Future[Either[MongoError, Unit]] =
    Future(connect())

  /**
   * Connects using Cats Effect IO.
   */
  def connectIO(): IO[Either[MongoError, Unit]] =
    IO(connect())

  /**
   * Gets a database by name.
   */
  def getDatabase(name: String): MongoDatabase =
    ensureConnected()
    databases.getOrElseUpdate(name, new MongoDatabase(transport.get, name))

  /**
   * Gets the default database (from connection string or "test").
   */
  def getDefaultDatabase: MongoDatabase =
    getDatabase(settings.defaultDatabase.getOrElse("test"))

  /**
   * Lists all database names.
   */
  def listDatabaseNames(): Either[MongoError, List[String]] =
    ensureConnected()
    transport.get.call("listDatabases").map { result =>
      val doc = result.asInstanceOf[Document]
      doc.getList[Document]("databases")
        .getOrElse(List.empty)
        .flatMap(_.getString("name"))
    }

  /**
   * Lists database names asynchronously.
   */
  def listDatabaseNamesAsync()(using ExecutionContext): Future[Either[MongoError, List[String]]] =
    Future(listDatabaseNames())

  /**
   * Lists database names using Cats Effect IO.
   */
  def listDatabaseNamesIO(): IO[Either[MongoError, List[String]]] =
    IO(listDatabaseNames())

  /**
   * Lists all databases with full information.
   */
  def listDatabases(): Either[MongoError, List[Document]] =
    ensureConnected()
    transport.get.call("listDatabases").map { result =>
      val doc = result.asInstanceOf[Document]
      doc.getList[Document]("databases").getOrElse(List.empty)
    }

  /**
   * Drops a database.
   */
  def dropDatabase(name: String): Either[MongoError, Unit] =
    ensureConnected()
    transport.get.call("dropDatabase", name).map { _ =>
      databases.remove(name)
      ()
    }

  /**
   * Pings the server to check connectivity.
   */
  def ping(): Either[MongoError, Boolean] =
    ensureConnected()
    transport.get.call("ping").map { result =>
      val doc = result.asInstanceOf[Document]
      doc.getInt("ok").contains(1)
    }

  /**
   * Checks if the client is connected.
   */
  def isConnected: Boolean = connected && !closed

  /**
   * Checks if the client is closed.
   */
  def isClosed: Boolean = closed

  /**
   * Closes the client connection.
   */
  def close(): Unit =
    if !closed then
      closed = true
      connected = false
      transport.foreach(_.close())
      transport = None
      databases.clear()

  /**
   * Closes the client using Cats Effect IO.
   */
  def closeIO(): IO[Unit] = IO(close())

  /**
   * Gets the client settings.
   */
  def getSettings: MongoClientSettings = settings

  /**
   * Sets a custom transport (for testing).
   */
  def setTransport(t: RpcTransport): Unit =
    transport = Some(t)
    connected = true

  private def ensureConnected(): Unit =
    if closed then throw new IllegalStateException("Client is closed")
    if !connected then connect() match
      case Left(e) => throw new RuntimeException(e.message)
      case Right(_) => ()

object MongoClient:

  private val UriPattern: Regex =
    """^(mongodb(?:\+srv)?)://(?:([^:@]+)(?::([^@]*))?@)?([^/?]+)(?:/([^?]*))?(?:\?(.*))?$""".r

  /**
   * Creates a MongoClient from a connection string.
   */
  def apply(connectionString: String): MongoClient =
    new MongoClient(MongoClientSettings.fromConnectionString(connectionString))

  /**
   * Creates a MongoClient from settings.
   */
  def apply(settings: MongoClientSettings): MongoClient =
    new MongoClient(settings)

  /**
   * Creates and connects a MongoClient.
   */
  def connect(connectionString: String): Either[MongoError, MongoClient] =
    val client = MongoClient(connectionString)
    client.connect().map(_ => client)

  /**
   * Creates and connects a MongoClient asynchronously.
   */
  def connectAsync(connectionString: String)(using ExecutionContext): Future[Either[MongoError, MongoClient]] =
    Future(connect(connectionString))

  /**
   * Creates and connects a MongoClient using Cats Effect IO.
   */
  def connectIO(connectionString: String): IO[Either[MongoError, MongoClient]] =
    IO(connect(connectionString))

  /**
   * Creates a MongoClient resource that auto-closes.
   */
  def resource(connectionString: String): cats.effect.Resource[IO, MongoClient] =
    cats.effect.Resource.make(
      IO {
        val client = MongoClient(connectionString)
        client.connect() match
          case Left(e) => throw new RuntimeException(e.message)
          case Right(_) => client
      }
    )(client => client.closeIO())

/**
 * MongoDB client settings.
 */
case class MongoClientSettings(
  connectionString: String,
  hosts: List[String] = List.empty,
  username: Option[String] = None,
  password: Option[String] = None,
  defaultDatabase: Option[String] = None,
  authSource: Option[String] = None,
  replicaSet: Option[String] = None,
  ssl: Boolean = false,
  connectTimeoutMs: Int = 10000,
  socketTimeoutMs: Int = 0,
  maxPoolSize: Int = 100,
  minPoolSize: Int = 0,
  retryWrites: Boolean = true,
  retryReads: Boolean = true
)

object MongoClientSettings:

  private val UriPattern: Regex =
    """^(mongodb(?:\+srv)?)://(?:([^:@]+)(?::([^@]*))?@)?([^/?]+)(?:/([^?]*))?(?:\?(.*))?$""".r

  /**
   * Creates settings from a MongoDB connection string.
   */
  def fromConnectionString(uri: String): MongoClientSettings =
    uri match
      case UriPattern(protocol, username, password, hosts, database, options) =>
        val parsedOptions = parseOptions(Option(options).getOrElse(""))
        MongoClientSettings(
          connectionString = uri,
          hosts = Option(hosts).map(_.split(",").toList).getOrElse(List("localhost:27017")),
          username = Option(username),
          password = Option(password),
          defaultDatabase = Option(database).filter(_.nonEmpty),
          authSource = parsedOptions.get("authSource"),
          replicaSet = parsedOptions.get("replicaSet"),
          ssl = protocol == "mongodb+srv" || parsedOptions.get("ssl").contains("true"),
          connectTimeoutMs = parsedOptions.get("connectTimeoutMS").map(_.toInt).getOrElse(10000),
          socketTimeoutMs = parsedOptions.get("socketTimeoutMS").map(_.toInt).getOrElse(0),
          maxPoolSize = parsedOptions.get("maxPoolSize").map(_.toInt).getOrElse(100),
          minPoolSize = parsedOptions.get("minPoolSize").map(_.toInt).getOrElse(0),
          retryWrites = parsedOptions.get("retryWrites").forall(_ == "true"),
          retryReads = parsedOptions.get("retryReads").forall(_ == "true")
        )
      case _ =>
        MongoClientSettings(
          connectionString = uri,
          hosts = List("localhost:27017")
        )

  private def parseOptions(options: String): Map[String, String] =
    if options.isEmpty then Map.empty
    else
      options.split("&").flatMap { pair =>
        pair.split("=", 2) match
          case Array(key, value) => Some(key -> value)
          case _ => None
      }.toMap

  /**
   * Default settings for local development.
   */
  val default: MongoClientSettings = MongoClientSettings(
    connectionString = "mongodb://localhost:27017",
    hosts = List("localhost:27017")
  )
