package do_.mongo

import io.circe.*
import io.circe.syntax.*
import io.circe.parser.*
import java.time.Instant
import scala.collection.mutable

/**
 * Represents a MongoDB document with type-safe accessors.
 * Provides functional-style access with Option and Either.
 */
final class Document private (private val underlying: mutable.Map[String, Any]) extends Iterable[(String, Any)]:

  /**
   * Gets a value by key, returning Option.
   */
  def get[T](key: String): Option[T] =
    underlying.get(key).map(_.asInstanceOf[T])

  /**
   * Gets a value or returns a default.
   */
  def getOrElse[T](key: String, default: => T): T =
    get[T](key).getOrElse(default)

  /**
   * Gets a String value.
   */
  def getString(key: String): Option[String] =
    get[Any](key).flatMap:
      case s: String => Some(s)
      case _ => None

  /**
   * Gets an Int value.
   */
  def getInt(key: String): Option[Int] =
    get[Any](key).flatMap:
      case i: Int => Some(i)
      case l: Long if l >= Int.MinValue && l <= Int.MaxValue => Some(l.toInt)
      case d: Double if d.isWhole => Some(d.toInt)
      case n: Number => Some(n.intValue)
      case _ => None

  /**
   * Gets a Long value.
   */
  def getLong(key: String): Option[Long] =
    get[Any](key).flatMap:
      case l: Long => Some(l)
      case i: Int => Some(i.toLong)
      case d: Double if d.isWhole => Some(d.toLong)
      case n: Number => Some(n.longValue)
      case _ => None

  /**
   * Gets a Double value.
   */
  def getDouble(key: String): Option[Double] =
    get[Any](key).flatMap:
      case d: Double => Some(d)
      case n: Number => Some(n.doubleValue)
      case _ => None

  /**
   * Gets a Boolean value.
   */
  def getBoolean(key: String): Option[Boolean] =
    get[Any](key).flatMap:
      case b: Boolean => Some(b)
      case _ => None

  /**
   * Gets a nested Document.
   */
  def getDocument(key: String): Option[Document] =
    get[Any](key).flatMap:
      case d: Document => Some(d)
      case m: Map[_, _] => Some(Document(m.asInstanceOf[Map[String, Any]]))
      case _ => None

  /**
   * Gets a List value.
   */
  def getList[T](key: String): Option[List[T]] =
    get[Any](key).flatMap:
      case l: List[_] => Some(l.asInstanceOf[List[T]])
      case s: Seq[_] => Some(s.toList.asInstanceOf[List[T]])
      case _ => None

  /**
   * Gets an ObjectId value.
   */
  def getObjectId(key: String): Option[ObjectId] =
    get[Any](key).flatMap:
      case o: ObjectId => Some(o)
      case s: String => ObjectId.parse(s).toOption
      case _ => None

  /**
   * Gets an Instant value.
   */
  def getInstant(key: String): Option[Instant] =
    get[Any](key).flatMap:
      case i: Instant => Some(i)
      case l: Long => Some(Instant.ofEpochMilli(l))
      case s: String => scala.util.Try(Instant.parse(s)).toOption
      case _ => None

  /**
   * Sets a value, returning a new Document.
   */
  def set(key: String, value: Any): Document =
    val newMap = mutable.Map.from(underlying)
    newMap(key) = value
    new Document(newMap)

  /**
   * Alias for set using + operator.
   */
  def +(kv: (String, Any)): Document = set(kv._1, kv._2)

  /**
   * Removes a key, returning a new Document.
   */
  def remove(key: String): Document =
    val newMap = mutable.Map.from(underlying)
    newMap.remove(key)
    new Document(newMap)

  /**
   * Alias for remove using - operator.
   */
  def -(key: String): Document = remove(key)

  /**
   * Checks if document contains a key.
   */
  def contains(key: String): Boolean = underlying.contains(key)

  /**
   * Returns all keys.
   */
  def keys: Set[String] = underlying.keySet.toSet

  /**
   * Returns the number of fields.
   */
  override def size: Int = underlying.size

  /**
   * Checks if document is empty.
   */
  override def isEmpty: Boolean = underlying.isEmpty

  /**
   * Iterator over key-value pairs.
   */
  def iterator: Iterator[(String, Any)] = underlying.iterator

  /**
   * Converts to a Map.
   */
  def toMap: Map[String, Any] = underlying.toMap

  /**
   * Converts to JSON string.
   */
  def toJson: String = toJsonValue.noSpaces

  /**
   * Converts to pretty-printed JSON string.
   */
  def toPrettyJson: String = toJsonValue.spaces2

  /**
   * Converts to Circe JSON value.
   */
  def toJsonValue: Json =
    def toJson(value: Any): Json = value match
      case null => Json.Null
      case s: String => Json.fromString(s)
      case i: Int => Json.fromInt(i)
      case l: Long => Json.fromLong(l)
      case d: Double => Json.fromDoubleOrNull(d)
      case b: Boolean => Json.fromBoolean(b)
      case o: ObjectId => Json.obj("$oid" -> Json.fromString(o.toHexString))
      case i: Instant => Json.obj("$date" -> Json.fromLong(i.toEpochMilli))
      case d: Document => d.toJsonValue
      case m: Map[_, _] =>
        Json.obj(m.asInstanceOf[Map[String, Any]].map { case (k, v) => k -> toJson(v) }.toSeq*)
      case l: Iterable[_] => Json.arr(l.map(toJson).toSeq*)
      case other => Json.fromString(other.toString)

    Json.obj(underlying.map { case (k, v) => k -> toJson(v) }.toSeq*)

  override def toString: String = toPrettyJson

  override def equals(obj: Any): Boolean = obj match
    case d: Document => underlying == d.underlying
    case _ => false

  override def hashCode(): Int = underlying.hashCode()

object Document:

  /**
   * Creates an empty Document.
   */
  def apply(): Document = new Document(mutable.Map.empty)

  /**
   * Creates a Document from key-value pairs.
   */
  def apply(pairs: (String, Any)*): Document =
    new Document(mutable.Map.from(pairs))

  /**
   * Creates a Document from a Map.
   */
  def apply(map: Map[String, Any]): Document =
    new Document(mutable.Map.from(map))

  /**
   * Parses a Document from JSON string.
   */
  def parse(json: String): Either[MongoError, Document] =
    io.circe.parser.parse(json) match
      case Left(e) => Left(SerializationError(s"Failed to parse JSON: ${e.message}"))
      case Right(j) => fromJson(j)

  /**
   * Creates a Document from Circe JSON.
   */
  def fromJson(json: Json): Either[MongoError, Document] =
    def fromJsonValue(j: Json): Any = j.fold(
      jsonNull = null,
      jsonBoolean = identity,
      jsonNumber = n => n.toLong.getOrElse(n.toDouble),
      jsonString = identity,
      jsonArray = arr => arr.map(fromJsonValue).toList,
      jsonObject = obj =>
        // Handle extended JSON
        if obj.contains("$oid") then
          ObjectId.parse(obj("$oid").flatMap(_.asString).getOrElse("")).getOrElse(obj.toMap.view.mapValues(fromJsonValue).toMap)
        else if obj.contains("$date") then
          Instant.ofEpochMilli(obj("$date").flatMap(_.asNumber).flatMap(_.toLong).getOrElse(0L))
        else
          obj.toMap.view.mapValues(fromJsonValue).toMap
    )

    json.asObject match
      case Some(obj) =>
        Right(Document(obj.toMap.view.mapValues(fromJsonValue).toMap))
      case None =>
        Left(SerializationError("JSON must be an object"))

  /**
   * Empty document instance.
   */
  val empty: Document = Document()
