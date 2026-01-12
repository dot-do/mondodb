package do_.mongo

import java.security.SecureRandom
import java.time.Instant
import java.util.concurrent.atomic.AtomicInteger

/**
 * MongoDB ObjectId - a 12-byte unique identifier.
 *
 * Format:
 * - 4 bytes: Unix timestamp in seconds
 * - 5 bytes: Random value (unique per machine/process)
 * - 3 bytes: Counter (starts with random value)
 */
final class ObjectId private (private val bytes: Array[Byte]) extends Ordered[ObjectId]:

  require(bytes.length == 12, "ObjectId must be 12 bytes")

  /**
   * Gets the timestamp when this ObjectId was created.
   */
  def timestamp: Instant =
    val seconds = ((bytes(0) & 0xff) << 24) |
                  ((bytes(1) & 0xff) << 16) |
                  ((bytes(2) & 0xff) << 8) |
                  (bytes(3) & 0xff)
    Instant.ofEpochSecond(seconds.toLong)

  /**
   * Converts to hexadecimal string representation.
   */
  def toHexString: String =
    bytes.map(b => f"$b%02x").mkString

  /**
   * Gets the raw bytes.
   */
  def toByteArray: Array[Byte] = bytes.clone()

  override def toString: String = toHexString

  override def equals(obj: Any): Boolean = obj match
    case o: ObjectId => java.util.Arrays.equals(bytes, o.bytes)
    case _ => false

  override def hashCode(): Int = java.util.Arrays.hashCode(bytes)

  override def compare(that: ObjectId): Int =
    java.util.Arrays.compareUnsigned(bytes, that.bytes)

object ObjectId:

  private val random = new SecureRandom()
  private val randomBytes = new Array[Byte](5)
  random.nextBytes(randomBytes)
  private val counter = new AtomicInteger(random.nextInt())

  /**
   * Generates a new ObjectId.
   */
  def apply(): ObjectId =
    val bytes = new Array[Byte](12)
    val timestamp = (System.currentTimeMillis() / 1000).toInt

    // Timestamp (4 bytes, big-endian)
    bytes(0) = (timestamp >> 24).toByte
    bytes(1) = (timestamp >> 16).toByte
    bytes(2) = (timestamp >> 8).toByte
    bytes(3) = timestamp.toByte

    // Random value (5 bytes)
    System.arraycopy(randomBytes, 0, bytes, 4, 5)

    // Counter (3 bytes, big-endian)
    val count = counter.getAndIncrement()
    bytes(9) = (count >> 16).toByte
    bytes(10) = (count >> 8).toByte
    bytes(11) = count.toByte

    new ObjectId(bytes)

  /**
   * Generates a new ObjectId (alias for apply).
   */
  def generate(): ObjectId = apply()

  /**
   * Creates an ObjectId from a hexadecimal string.
   */
  def parse(hex: String): Either[MongoError, ObjectId] =
    if hex == null || hex.length != 24 then
      Left(ValidationError(s"Invalid ObjectId: expected 24 hex characters, got ${Option(hex).map(_.length).getOrElse(0)}"))
    else if !hex.forall(c => c.isDigit || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) then
      Left(ValidationError("Invalid ObjectId: contains non-hex characters"))
    else
      try
        val bytes = hex.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray
        Right(new ObjectId(bytes))
      catch
        case e: NumberFormatException =>
          Left(ValidationError(s"Invalid ObjectId: ${e.getMessage}"))

  /**
   * Creates an ObjectId from a hexadecimal string, throwing on error.
   */
  def fromHexString(hex: String): ObjectId =
    parse(hex) match
      case Right(id) => id
      case Left(e) => throw new IllegalArgumentException(e.message)

  /**
   * Creates an ObjectId from raw bytes.
   */
  def fromByteArray(bytes: Array[Byte]): Either[MongoError, ObjectId] =
    if bytes == null || bytes.length != 12 then
      Left(ValidationError(s"Invalid ObjectId: expected 12 bytes, got ${Option(bytes).map(_.length).getOrElse(0)}"))
    else
      Right(new ObjectId(bytes.clone()))

  /**
   * Creates an ObjectId from a timestamp (useful for range queries).
   */
  def fromTimestamp(instant: Instant): ObjectId =
    val bytes = new Array[Byte](12)
    val timestamp = instant.getEpochSecond.toInt

    bytes(0) = (timestamp >> 24).toByte
    bytes(1) = (timestamp >> 16).toByte
    bytes(2) = (timestamp >> 8).toByte
    bytes(3) = timestamp.toByte

    new ObjectId(bytes)

  /**
   * Checks if a string is a valid ObjectId.
   */
  def isValid(hex: String): Boolean =
    parse(hex).isRight

  /**
   * Implicit conversion to String.
   */
  given Conversion[ObjectId, String] = _.toHexString
