package do_.mongo;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static do_.mongo.Filters.*;
import static do_.mongo.Updates.*;
import static org.assertj.core.api.Assertions.*;

/**
 * Unit tests for MongoCollection CRUD operations.
 */
@DisplayName("MongoCollection")
class MongoCollectionTest {

    private MongoClient client;
    private MongoCollection<Document> collection;

    @BeforeEach
    void setUp() {
        client = MongoClients.createMock();
        collection = client.getDatabase("test").getCollection("users");
    }

    @AfterEach
    void tearDown() {
        if (client != null) {
            client.close();
        }
    }

    @Nested
    @DisplayName("Insert Operations")
    class InsertTests {

        @Test
        @DisplayName("should insert one document")
        void shouldInsertOne() {
            InsertOneResult result = collection.insertOne(
                    new Document("name", "Alice").append("age", 30)
            );

            assertThat(result).isNotNull();
            assertThat(result.wasAcknowledged()).isTrue();
            assertThat(result.getInsertedId()).isNotNull();
        }

        @Test
        @DisplayName("should insert many documents")
        void shouldInsertMany() {
            InsertManyResult result = collection.insertMany(Arrays.asList(
                    new Document("name", "Bob").append("age", 25),
                    new Document("name", "Carol").append("age", 35)
            ));

            assertThat(result).isNotNull();
            assertThat(result.wasAcknowledged()).isTrue();
            assertThat(result.getInsertedIds()).hasSize(2);
        }

        @Test
        @DisplayName("should generate ObjectId if not provided")
        void shouldGenerateObjectId() {
            Document doc = new Document("name", "Dave");
            InsertOneResult result = collection.insertOne(doc);

            assertThat(result.getInsertedId()).isNotNull();
        }
    }

    @Nested
    @DisplayName("Find Operations")
    class FindTests {

        @BeforeEach
        void insertTestData() {
            collection.insertMany(Arrays.asList(
                    new Document("name", "Alice").append("age", 30).append("city", "Austin"),
                    new Document("name", "Bob").append("age", 25).append("city", "Boston"),
                    new Document("name", "Carol").append("age", 35).append("city", "Austin"),
                    new Document("name", "Dave").append("age", 28).append("city", "Chicago")
            ));
        }

        @Test
        @DisplayName("should find all documents")
        void shouldFindAll() {
            List<Document> docs = collection.find().toList();
            assertThat(docs).hasSize(4);
        }

        @Test
        @DisplayName("should find with equality filter")
        void shouldFindWithEqualityFilter() {
            List<Document> docs = collection.find(eq("name", "Alice")).toList();
            assertThat(docs).hasSize(1);
            assertThat(docs.get(0).getString("name")).isEqualTo("Alice");
        }

        @Test
        @DisplayName("should find with comparison filter")
        void shouldFindWithComparisonFilter() {
            List<Document> docs = collection.find(gte("age", 30)).toList();
            assertThat(docs).hasSize(2); // Alice (30), Carol (35)
        }

        @Test
        @DisplayName("should find with logical operators")
        void shouldFindWithLogicalOperators() {
            List<Document> docs = collection.find(
                    and(eq("city", "Austin"), gte("age", 30))
            ).toList();
            assertThat(docs).hasSize(2); // Alice and Carol
        }

        @Test
        @DisplayName("should find first")
        void shouldFindFirst() {
            Document doc = collection.find(eq("city", "Austin")).first();
            assertThat(doc).isNotNull();
            assertThat(doc.getString("city")).isEqualTo("Austin");
        }

        @Test
        @DisplayName("should return null when no match")
        void shouldReturnNullWhenNoMatch() {
            Document doc = collection.find(eq("name", "NotExists")).first();
            assertThat(doc).isNull();
        }

        @Test
        @DisplayName("should apply limit")
        void shouldApplyLimit() {
            List<Document> docs = collection.find().limit(2).toList();
            assertThat(docs).hasSize(2);
        }

        @Test
        @DisplayName("should apply skip")
        void shouldApplySkip() {
            List<Document> all = collection.find().toList();
            List<Document> skipped = collection.find().skip(2).toList();
            assertThat(skipped).hasSize(all.size() - 2);
        }
    }

    @Nested
    @DisplayName("Update Operations")
    class UpdateTests {

        @BeforeEach
        void insertTestData() {
            collection.insertMany(Arrays.asList(
                    new Document("name", "Alice").append("age", 30),
                    new Document("name", "Bob").append("age", 25),
                    new Document("name", "Carol").append("age", 35)
            ));
        }

        @Test
        @DisplayName("should update one document")
        void shouldUpdateOne() {
            UpdateResult result = collection.updateOne(
                    eq("name", "Alice"),
                    set("age", 31)
            );

            assertThat(result.getMatchedCount()).isEqualTo(1);
            assertThat(result.getModifiedCount()).isEqualTo(1);

            Document alice = collection.findOne(eq("name", "Alice"));
            assertThat(alice.getInteger("age")).isEqualTo(31);
        }

        @Test
        @DisplayName("should update many documents")
        void shouldUpdateMany() {
            UpdateResult result = collection.updateMany(
                    gte("age", 30),
                    inc("age", 1)
            );

            assertThat(result.getMatchedCount()).isEqualTo(2); // Alice, Carol
            assertThat(result.getModifiedCount()).isEqualTo(2);
        }

        @Test
        @DisplayName("should upsert when no match")
        void shouldUpsertWhenNoMatch() {
            UpdateResult result = collection.updateOne(
                    eq("name", "Eve"),
                    set("age", 22),
                    true // upsert
            );

            assertThat(result.getMatchedCount()).isEqualTo(0);
            assertThat(result.getUpsertedId()).isNotNull();

            Document eve = collection.findOne(eq("name", "Eve"));
            assertThat(eve).isNotNull();
            assertThat(eve.getInteger("age")).isEqualTo(22);
        }

        @Test
        @DisplayName("should replace one document")
        void shouldReplaceOne() {
            UpdateResult result = collection.replaceOne(
                    eq("name", "Bob"),
                    new Document("name", "Robert").append("age", 26)
            );

            assertThat(result.getMatchedCount()).isEqualTo(1);

            Document robert = collection.findOne(eq("name", "Robert"));
            assertThat(robert).isNotNull();
            assertThat(robert.getInteger("age")).isEqualTo(26);
        }
    }

    @Nested
    @DisplayName("Delete Operations")
    class DeleteTests {

        @BeforeEach
        void insertTestData() {
            collection.insertMany(Arrays.asList(
                    new Document("name", "Alice").append("status", "active"),
                    new Document("name", "Bob").append("status", "inactive"),
                    new Document("name", "Carol").append("status", "active")
            ));
        }

        @Test
        @DisplayName("should delete one document")
        void shouldDeleteOne() {
            DeleteResult result = collection.deleteOne(eq("name", "Bob"));

            assertThat(result.getDeletedCount()).isEqualTo(1);
            assertThat(collection.findOne(eq("name", "Bob"))).isNull();
        }

        @Test
        @DisplayName("should delete many documents")
        void shouldDeleteMany() {
            DeleteResult result = collection.deleteMany(eq("status", "active"));

            assertThat(result.getDeletedCount()).isEqualTo(2);
            assertThat(collection.countDocuments()).isEqualTo(1);
        }
    }

    @Nested
    @DisplayName("Count Operations")
    class CountTests {

        @BeforeEach
        void insertTestData() {
            collection.insertMany(Arrays.asList(
                    new Document("type", "A"),
                    new Document("type", "B"),
                    new Document("type", "A"),
                    new Document("type", "C")
            ));
        }

        @Test
        @DisplayName("should count all documents")
        void shouldCountAll() {
            long count = collection.countDocuments();
            assertThat(count).isEqualTo(4);
        }

        @Test
        @DisplayName("should count with filter")
        void shouldCountWithFilter() {
            long count = collection.countDocuments(eq("type", "A"));
            assertThat(count).isEqualTo(2);
        }

        @Test
        @DisplayName("should return estimated count")
        void shouldReturnEstimatedCount() {
            long count = collection.estimatedDocumentCount();
            assertThat(count).isEqualTo(4);
        }
    }

    @Nested
    @DisplayName("Find and Modify Operations")
    class FindAndModifyTests {

        @BeforeEach
        void insertTestData() {
            collection.insertOne(
                    new Document("name", "Counter").append("value", 0)
            );
        }

        @Test
        @DisplayName("should find and update returning original")
        void shouldFindAndUpdateReturningOriginal() {
            Document original = collection.findOneAndUpdate(
                    eq("name", "Counter"),
                    inc("value", 1)
            );

            assertThat(original).isNotNull();
            assertThat(original.getInteger("value")).isEqualTo(0);

            Document updated = collection.findOne(eq("name", "Counter"));
            assertThat(updated.getInteger("value")).isEqualTo(1);
        }

        @Test
        @DisplayName("should find and update returning new")
        void shouldFindAndUpdateReturningNew() {
            Document updated = collection.findOneAndUpdate(
                    eq("name", "Counter"),
                    inc("value", 1),
                    "after"
            );

            assertThat(updated).isNotNull();
            assertThat(updated.getInteger("value")).isEqualTo(1);
        }

        @Test
        @DisplayName("should find and delete")
        void shouldFindAndDelete() {
            Document deleted = collection.findOneAndDelete(eq("name", "Counter"));

            assertThat(deleted).isNotNull();
            assertThat(deleted.getString("name")).isEqualTo("Counter");
            assertThat(collection.findOne(eq("name", "Counter"))).isNull();
        }
    }

    @Nested
    @DisplayName("Distinct Operations")
    class DistinctTests {

        @BeforeEach
        void insertTestData() {
            collection.insertMany(Arrays.asList(
                    new Document("category", "A").append("value", 1),
                    new Document("category", "B").append("value", 2),
                    new Document("category", "A").append("value", 3),
                    new Document("category", "C").append("value", 4)
            ));
        }

        @Test
        @DisplayName("should get distinct values")
        void shouldGetDistinctValues() {
            List<String> categories = collection.distinct("category", String.class);
            assertThat(categories).containsExactlyInAnyOrder("A", "B", "C");
        }

        @Test
        @DisplayName("should get distinct values with filter")
        void shouldGetDistinctWithFilter() {
            List<Integer> values = collection.distinct("value", gte("value", 2), Integer.class);
            assertThat(values).containsExactlyInAnyOrder(2, 3, 4);
        }
    }
}
