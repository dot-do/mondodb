package do_.mongo

import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers
import org.scalatest.EitherValues
import java.time.Instant

class DocumentSpec extends AnyFlatSpec with Matchers with EitherValues:

  "Document" should "be created from key-value pairs" in {
    val doc = Document(
      "name" -> "Alice",
      "age" -> 30,
      "active" -> true
    )

    doc.getString("name") shouldBe Some("Alice")
    doc.getInt("age") shouldBe Some(30)
    doc.getBoolean("active") shouldBe Some(true)
  }

  it should "return None for missing keys" in {
    val doc = Document("name" -> "Alice")

    doc.getString("missing") shouldBe None
    doc.getInt("missing") shouldBe None
    doc.getBoolean("missing") shouldBe None
  }

  it should "support nested documents" in {
    val doc = Document(
      "user" -> Document(
        "name" -> "Alice",
        "email" -> "alice@example.com"
      )
    )

    val nested = doc.getDocument("user")
    nested shouldBe defined
    nested.get.getString("name") shouldBe Some("Alice")
    nested.get.getString("email") shouldBe Some("alice@example.com")
  }

  it should "support lists" in {
    val doc = Document(
      "tags" -> List("scala", "mongodb", "functional")
    )

    val tags = doc.getList[String]("tags")
    tags shouldBe Some(List("scala", "mongodb", "functional"))
  }

  it should "support ObjectId" in {
    val id = ObjectId()
    val doc = Document("_id" -> id)

    doc.getObjectId("_id") shouldBe Some(id)
  }

  it should "support Instant" in {
    val now = Instant.now()
    val doc = Document("createdAt" -> now)

    doc.getInstant("createdAt") shouldBe Some(now)
  }

  it should "be immutable when adding values" in {
    val doc1 = Document("a" -> 1)
    val doc2 = doc1 + ("b" -> 2)

    doc1.contains("b") shouldBe false
    doc2.contains("a") shouldBe true
    doc2.contains("b") shouldBe true
  }

  it should "be immutable when removing values" in {
    val doc1 = Document("a" -> 1, "b" -> 2)
    val doc2 = doc1 - "a"

    doc1.contains("a") shouldBe true
    doc2.contains("a") shouldBe false
    doc2.contains("b") shouldBe true
  }

  it should "convert to and from JSON" in {
    val doc = Document(
      "name" -> "Alice",
      "age" -> 30,
      "active" -> true
    )

    val json = doc.toJson
    val parsed = Document.parse(json)

    parsed.value.getString("name") shouldBe Some("Alice")
    parsed.value.getInt("age") shouldBe Some(30)
    parsed.value.getBoolean("active") shouldBe Some(true)
  }

  it should "handle numeric type conversions" in {
    val doc = Document(
      "intVal" -> 42,
      "longVal" -> 9999999999L,
      "doubleVal" -> 3.14
    )

    doc.getInt("intVal") shouldBe Some(42)
    doc.getLong("intVal") shouldBe Some(42L)
    doc.getDouble("intVal") shouldBe Some(42.0)

    doc.getLong("longVal") shouldBe Some(9999999999L)
    doc.getDouble("longVal") shouldBe Some(9999999999.0)

    doc.getDouble("doubleVal") shouldBe Some(3.14)
  }

  it should "support iteration" in {
    val doc = Document(
      "a" -> 1,
      "b" -> 2,
      "c" -> 3
    )

    doc.size shouldBe 3
    doc.keys should contain allOf ("a", "b", "c")
    doc.toMap should contain allOf ("a" -> 1, "b" -> 2, "c" -> 3)
  }

  it should "support equality" in {
    val doc1 = Document("name" -> "Alice", "age" -> 30)
    val doc2 = Document("name" -> "Alice", "age" -> 30)
    val doc3 = Document("name" -> "Bob", "age" -> 25)

    doc1 shouldBe doc2
    doc1 should not be doc3
    doc1.hashCode shouldBe doc2.hashCode
  }

  it should "parse extended JSON for ObjectId" in {
    val json = """{"_id": {"$oid": "507f1f77bcf86cd799439011"}}"""
    val doc = Document.parse(json)

    doc.value.getObjectId("_id") shouldBe defined
    doc.value.getObjectId("_id").get.toHexString shouldBe "507f1f77bcf86cd799439011"
  }

  it should "parse extended JSON for dates" in {
    val json = """{"createdAt": {"$date": 1609459200000}}"""
    val doc = Document.parse(json)

    doc.value.getInstant("createdAt") shouldBe defined
    doc.value.getInstant("createdAt").get.toEpochMilli shouldBe 1609459200000L
  }

  it should "handle getOrElse" in {
    val doc = Document("name" -> "Alice")

    doc.getOrElse[String]("name", "Unknown") shouldBe "Alice"
    doc.getOrElse[String]("missing", "Unknown") shouldBe "Unknown"
  }
