package do_.mongo

import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers
import org.scalatest.EitherValues
import org.scalatest.BeforeAndAfterEach

class MongoCollectionSpec extends AnyFlatSpec with Matchers with EitherValues with BeforeAndAfterEach:

  var client: MongoClient = _
  var collection: MongoCollection[Document] = _

  override def beforeEach(): Unit =
    client = MongoClient("mongodb://localhost:27017/test")
    client.connect()
    collection = client.getDatabase("test").getCollection("users")

  override def afterEach(): Unit =
    client.close()

  "MongoCollection" should "insert and find a document" in {
    val doc = Document(
      "name" -> "Alice",
      "email" -> "alice@example.com"
    )

    val insertResult = collection.insertOne(doc)
    insertResult.value.acknowledged shouldBe true
    insertResult.value.insertedId shouldBe defined

    val findResult = collection.find(Filters.eq("name", "Alice"))
    findResult.value should have size 1
    findResult.value.head.getString("name") shouldBe Some("Alice")
  }

  it should "insert many documents" in {
    val docs = List(
      Document("name" -> "Bob", "age" -> 25),
      Document("name" -> "Charlie", "age" -> 35),
      Document("name" -> "Diana", "age" -> 28)
    )

    val insertResult = collection.insertMany(docs)
    insertResult.value.acknowledged shouldBe true
    insertResult.value.insertedCount shouldBe 3

    val findResult = collection.find()
    findResult.value.size should be >= 3
  }

  it should "find one document" in {
    collection.insertOne(Document("name" -> "Eve", "unique" -> true))

    val findResult = collection.findOne(Filters.eq("unique", true))
    findResult.value shouldBe defined
    findResult.value.get.getString("name") shouldBe Some("Eve")
  }

  it should "return None for non-existent document" in {
    val findResult = collection.findOne(Filters.eq("nonexistent", "value"))
    findResult.value shouldBe None
  }

  it should "find document by ObjectId" in {
    val insertResult = collection.insertOne(Document("name" -> "Frank"))
    val id = insertResult.value.insertedId.get

    val findResult = collection.findById(id)
    findResult.value shouldBe defined
    findResult.value.get.getString("name") shouldBe Some("Frank")
  }

  it should "update a document" in {
    collection.insertOne(Document("name" -> "Grace", "score" -> 100))

    val updateResult = collection.updateOne(
      Filters.eq("name", "Grace"),
      Updates.set("score", 150)
    )
    updateResult.value.matchedCount shouldBe 1
    updateResult.value.modifiedCount shouldBe 1

    val findResult = collection.findOne(Filters.eq("name", "Grace"))
    findResult.value.get.getInt("score") shouldBe Some(150)
  }

  it should "delete a document" in {
    collection.insertOne(Document("name" -> "Henry", "toDelete" -> true))

    val deleteResult = collection.deleteOne(Filters.eq("toDelete", true))
    deleteResult.value.deletedCount shouldBe 1

    val findResult = collection.findOne(Filters.eq("name", "Henry"))
    findResult.value shouldBe None
  }

  it should "delete many documents" in {
    collection.insertMany(List(
      Document("type" -> "temp", "value" -> 1),
      Document("type" -> "temp", "value" -> 2),
      Document("type" -> "temp", "value" -> 3)
    ))

    val deleteResult = collection.deleteMany(Filters.eq("type", "temp"))
    deleteResult.value.deletedCount shouldBe 3
  }

  it should "count documents" in {
    collection.insertMany(List(
      Document("category" -> "A"),
      Document("category" -> "A"),
      Document("category" -> "B")
    ))

    val countAll = collection.countDocuments()
    countAll.value should be >= 3L

    val countA = collection.countDocuments(Filters.eq("category", "A"))
    countA.value shouldBe 2L
  }

  it should "use fluent find API" in {
    collection.insertMany(List(
      Document("name" -> "User1", "age" -> 20),
      Document("name" -> "User2", "age" -> 25),
      Document("name" -> "User3", "age" -> 30),
      Document("name" -> "User4", "age" -> 35),
      Document("name" -> "User5", "age" -> 40)
    ))

    val result = collection
      .findFluent(Filters.gte("age", 25))
      .skip(1)
      .limit(2)
      .toList

    result.value should have size 2
  }

  it should "support complex filters" in {
    collection.insertMany(List(
      Document("name" -> "Test1", "value" -> 10, "active" -> true),
      Document("name" -> "Test2", "value" -> 20, "active" -> true),
      Document("name" -> "Test3", "value" -> 30, "active" -> false)
    ))

    val result = collection.find(
      Filters.and(
        Filters.gte("value", 15),
        Filters.eq("active", true)
      )
    )

    result.value should have size 1
    result.value.head.getString("name") shouldBe Some("Test2")
  }
