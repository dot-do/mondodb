package do_.mongo

import io.circe.*
import io.circe.generic.semiauto.*
import scala.deriving.Mirror
import scala.compiletime.{constValueTuple, erasedValue, summonInline}

/**
 * Type class for encoding and decoding MongoDB documents.
 * Provides type-safe serialization for case classes.
 */
trait MongoCodec[T]:
  /**
   * Encodes a value to a Document.
   */
  def encode(value: T): Document

  /**
   * Decodes a Document to a value.
   */
  def decode(doc: Document): Either[MongoError, T]

object MongoCodec:

  /**
   * Creates a codec from Circe encoder/decoder.
   */
  def fromCirce[T](using encoder: Encoder[T], decoder: Decoder[T]): MongoCodec[T] =
    new MongoCodec[T]:
      def encode(value: T): Document =
        val json = encoder(value)
        Document.fromJson(json).getOrElse(Document.empty)

      def decode(doc: Document): Either[MongoError, T] =
        decoder.decodeJson(doc.toJsonValue) match
          case Left(e) => Left(SerializationError(e.message))
          case Right(v) => Right(v)

  /**
   * Identity codec for Document.
   */
  given MongoCodec[Document] with
    def encode(value: Document): Document = value
    def decode(doc: Document): Either[MongoError, Document] = Right(doc)

  /**
   * Derive codec for case classes automatically using Circe.
   */
  inline def derived[T](using m: Mirror.ProductOf[T], e: Encoder[T], d: Decoder[T]): MongoCodec[T] =
    fromCirce[T]

  /**
   * Summon an existing codec.
   */
  def apply[T](using codec: MongoCodec[T]): MongoCodec[T] = codec

  // Common type codecs
  given MongoCodec[String] with
    def encode(value: String): Document = Document("value" -> value)
    def decode(doc: Document): Either[MongoError, String] =
      doc.getString("value").toRight(SerializationError("Expected string value"))

  given MongoCodec[Int] with
    def encode(value: Int): Document = Document("value" -> value)
    def decode(doc: Document): Either[MongoError, Int] =
      doc.getInt("value").toRight(SerializationError("Expected int value"))

  given MongoCodec[Long] with
    def encode(value: Long): Document = Document("value" -> value)
    def decode(doc: Document): Either[MongoError, Long] =
      doc.getLong("value").toRight(SerializationError("Expected long value"))

  given MongoCodec[Double] with
    def encode(value: Double): Document = Document("value" -> value)
    def decode(doc: Document): Either[MongoError, Double] =
      doc.getDouble("value").toRight(SerializationError("Expected double value"))

  given MongoCodec[Boolean] with
    def encode(value: Boolean): Document = Document("value" -> value)
    def decode(doc: Document): Either[MongoError, Boolean] =
      doc.getBoolean("value").toRight(SerializationError("Expected boolean value"))

/**
 * Extension to derive codecs using the `derives` clause.
 */
object MongoCodecDerivation:
  /**
   * Derive a codec for a case class.
   * Usage: case class User(name: String) derives MongoCodec
   */
  inline def derived[T](using m: Mirror.ProductOf[T], e: Encoder[T], d: Decoder[T]): MongoCodec[T] =
    MongoCodec.fromCirce[T]
