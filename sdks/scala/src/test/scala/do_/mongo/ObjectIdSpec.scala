package do_.mongo

import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers
import org.scalatest.EitherValues
import java.time.Instant
import java.time.temporal.ChronoUnit

class ObjectIdSpec extends AnyFlatSpec with Matchers with EitherValues:

  "ObjectId" should "generate unique ids" in {
    val id1 = ObjectId()
    val id2 = ObjectId()
    val id3 = ObjectId()

    id1 should not be id2
    id2 should not be id3
    id1 should not be id3
  }

  it should "have 24 character hex representation" in {
    val id = ObjectId()

    id.toHexString should have length 24
    id.toHexString should fullyMatch regex "[0-9a-f]{24}"
  }

  it should "be parsable from hex string" in {
    val hex = "507f1f77bcf86cd799439011"
    val id = ObjectId.parse(hex)

    id shouldBe a[Right[_, _]]
    id.value.toHexString shouldBe hex
  }

  it should "reject invalid hex strings" in {
    ObjectId.parse("") shouldBe a[Left[_, _]]
    ObjectId.parse("short") shouldBe a[Left[_, _]]
    ObjectId.parse("507f1f77bcf86cd799439011extra") shouldBe a[Left[_, _]]
    ObjectId.parse("507f1f77bcf86cd79943901g") shouldBe a[Left[_, _]] // invalid char
    ObjectId.parse(null) shouldBe a[Left[_, _]]
  }

  it should "validate hex strings" in {
    ObjectId.isValid("507f1f77bcf86cd799439011") shouldBe true
    ObjectId.isValid("") shouldBe false
    ObjectId.isValid("short") shouldBe false
    ObjectId.isValid("507f1f77bcf86cd79943901g") shouldBe false
  }

  it should "extract timestamp" in {
    val id = ObjectId()
    val timestamp = id.timestamp

    val now = Instant.now()
    timestamp should be >= now.minusSeconds(5)
    timestamp should be <= now.plusSeconds(5)
  }

  it should "create from timestamp" in {
    val instant = Instant.parse("2024-01-15T12:00:00Z")
    val id = ObjectId.fromTimestamp(instant)

    id.timestamp.truncatedTo(ChronoUnit.SECONDS) shouldBe instant.truncatedTo(ChronoUnit.SECONDS)
  }

  it should "be ordered" in {
    val id1 = ObjectId()
    Thread.sleep(1)
    val id2 = ObjectId()
    Thread.sleep(1)
    val id3 = ObjectId()

    id1 should be < id2
    id2 should be < id3
    id1 should be < id3

    val sorted = List(id3, id1, id2).sorted
    sorted shouldBe List(id1, id2, id3)
  }

  it should "convert to byte array" in {
    val id = ObjectId()
    val bytes = id.toByteArray

    bytes should have length 12

    val restored = ObjectId.fromByteArray(bytes)
    restored.value shouldBe id
  }

  it should "reject invalid byte arrays" in {
    ObjectId.fromByteArray(Array[Byte]()) shouldBe a[Left[_, _]]
    ObjectId.fromByteArray(Array.fill(11)(0.toByte)) shouldBe a[Left[_, _]]
    ObjectId.fromByteArray(Array.fill(13)(0.toByte)) shouldBe a[Left[_, _]]
    ObjectId.fromByteArray(null) shouldBe a[Left[_, _]]
  }

  it should "support equality" in {
    val hex = "507f1f77bcf86cd799439011"
    val id1 = ObjectId.parse(hex).value
    val id2 = ObjectId.parse(hex).value

    id1 shouldBe id2
    id1.hashCode shouldBe id2.hashCode
  }

  it should "have string representation" in {
    val hex = "507f1f77bcf86cd799439011"
    val id = ObjectId.parse(hex).value

    id.toString shouldBe hex
  }

  it should "have incrementing counter" in {
    val ids = (1 to 1000).map(_ => ObjectId())
    val hexStrings = ids.map(_.toHexString)

    // All should be unique
    hexStrings.toSet should have size 1000
  }
