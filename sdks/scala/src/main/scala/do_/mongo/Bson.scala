package do_.mongo

import io.circe.*
import io.circe.syntax.*
import java.time.Instant

/**
 * BSON document representation for MongoDB operations.
 * Provides a type-safe way to construct MongoDB queries and updates.
 */
final case class Bson private (private val data: Map[String, Any]):

  /**
   * Gets a value by key.
   */
  def get[T](key: String): Option[T] =
    data.get(key).map(_.asInstanceOf[T])

  /**
   * Combines this Bson with another.
   */
  def ++(other: Bson): Bson =
    Bson(data ++ other.data)

  /**
   * Adds a key-value pair.
   */
  def +(kv: (String, Any)): Bson =
    Bson(data + kv)

  /**
   * Converts to Map.
   */
  def toMap: Map[String, Any] = data

  /**
   * Converts to JSON string.
   */
  def toJson: String = toJsonValue.noSpaces

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
      case b: Bson => b.toJsonValue
      case m: Map[_, _] =>
        Json.obj(m.asInstanceOf[Map[String, Any]].map { case (k, v) => k -> toJson(v) }.toSeq*)
      case l: Iterable[_] => Json.arr(l.map(toJson).toSeq*)
      case other => Json.fromString(other.toString)

    Json.obj(data.map { case (k, v) => k -> toJson(v) }.toSeq*)

  override def toString: String = toJson

object Bson:

  /**
   * Creates an empty Bson.
   */
  def empty: Bson = Bson(Map.empty)

  /**
   * Creates a Bson from key-value pairs.
   */
  def doc(pairs: (String, Any)*): Bson =
    Bson(pairs.toMap)

  /**
   * Creates a Bson from a Map.
   */
  def apply(map: Map[String, Any]): Bson = new Bson(map)

  /**
   * Parses a Bson from JSON string.
   */
  def parse(json: String): Either[MongoError, Bson] =
    io.circe.parser.parse(json) match
      case Left(e) => Left(SerializationError(s"Failed to parse JSON: ${e.message}"))
      case Right(j) => fromJson(j)

  /**
   * Creates a Bson from Circe JSON.
   */
  def fromJson(json: Json): Either[MongoError, Bson] =
    def fromJsonValue(j: Json): Any = j.fold(
      jsonNull = null,
      jsonBoolean = identity,
      jsonNumber = n => n.toLong.getOrElse(n.toDouble),
      jsonString = identity,
      jsonArray = arr => arr.map(fromJsonValue).toList,
      jsonObject = obj =>
        if obj.contains("$oid") then
          ObjectId.parse(obj("$oid").flatMap(_.asString).getOrElse("")).getOrElse(obj.toMap.view.mapValues(fromJsonValue).toMap)
        else if obj.contains("$date") then
          Instant.ofEpochMilli(obj("$date").flatMap(_.asNumber).flatMap(_.toLong).getOrElse(0L))
        else
          obj.toMap.view.mapValues(fromJsonValue).toMap
    )

    json.asObject match
      case Some(obj) =>
        Right(Bson(obj.toMap.view.mapValues(fromJsonValue).toMap))
      case None =>
        Left(SerializationError("JSON must be an object"))
