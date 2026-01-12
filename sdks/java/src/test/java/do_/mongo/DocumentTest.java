package do_.mongo;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Arrays;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;

/**
 * Unit tests for Document class.
 */
@DisplayName("Document")
class DocumentTest {

    @Nested
    @DisplayName("Construction")
    class ConstructionTests {

        @Test
        @DisplayName("should create empty document")
        void shouldCreateEmptyDocument() {
            Document doc = new Document();
            assertThat(doc).isEmpty();
        }

        @Test
        @DisplayName("should create document with single key-value")
        void shouldCreateWithSingleKeyValue() {
            Document doc = new Document("name", "Alice");
            assertThat(doc.getString("name")).isEqualTo("Alice");
        }

        @Test
        @DisplayName("should create document from map")
        void shouldCreateFromMap() {
            Map<String, Object> map = new HashMap<>();
            map.put("name", "Bob");
            map.put("age", 30);

            Document doc = new Document(map);
            assertThat(doc.getString("name")).isEqualTo("Bob");
            assertThat(doc.getInteger("age")).isEqualTo(30);
        }

        @Test
        @DisplayName("should copy another document")
        void shouldCopyAnotherDocument() {
            Document original = new Document("x", 1).append("y", 2);
            Document copy = new Document(original);

            assertThat(copy.getInteger("x")).isEqualTo(1);
            assertThat(copy.getInteger("y")).isEqualTo(2);
        }
    }

    @Nested
    @DisplayName("Append Operations")
    class AppendTests {

        @Test
        @DisplayName("should append values with chaining")
        void shouldAppendWithChaining() {
            Document doc = new Document()
                    .append("name", "Carol")
                    .append("age", 25)
                    .append("active", true);

            assertThat(doc).hasSize(3);
            assertThat(doc.getString("name")).isEqualTo("Carol");
            assertThat(doc.getInteger("age")).isEqualTo(25);
            assertThat(doc.getBoolean("active")).isTrue();
        }

        @Test
        @DisplayName("should append nested document")
        void shouldAppendNestedDocument() {
            Document address = new Document("city", "Austin").append("state", "TX");
            Document doc = new Document("name", "Dave").append("address", address);

            Document retrievedAddress = doc.get("address", Document.class);
            assertThat(retrievedAddress.getString("city")).isEqualTo("Austin");
        }
    }

    @Nested
    @DisplayName("Get Operations")
    class GetTests {

        private Document doc;

        @org.junit.jupiter.api.BeforeEach
        void setUp() {
            doc = new Document()
                    .append("string", "hello")
                    .append("integer", 42)
                    .append("long", 9999999999L)
                    .append("double", 3.14)
                    .append("boolean", true)
                    .append("list", Arrays.asList(1, 2, 3))
                    .append("nested", new Document("inner", "value"))
                    .append("nullValue", null);
        }

        @Test
        @DisplayName("should get string value")
        void shouldGetString() {
            assertThat(doc.getString("string")).isEqualTo("hello");
        }

        @Test
        @DisplayName("should get integer value")
        void shouldGetInteger() {
            assertThat(doc.getInteger("integer")).isEqualTo(42);
        }

        @Test
        @DisplayName("should get integer with default")
        void shouldGetIntegerWithDefault() {
            assertThat(doc.getInteger("missing", 99)).isEqualTo(99);
            assertThat(doc.getInteger("integer", 99)).isEqualTo(42);
        }

        @Test
        @DisplayName("should get long value")
        void shouldGetLong() {
            assertThat(doc.getLong("long")).isEqualTo(9999999999L);
        }

        @Test
        @DisplayName("should get double value")
        void shouldGetDouble() {
            assertThat(doc.getDouble("double")).isEqualTo(3.14);
        }

        @Test
        @DisplayName("should get boolean value")
        void shouldGetBoolean() {
            assertThat(doc.getBoolean("boolean")).isTrue();
        }

        @Test
        @DisplayName("should get boolean with default")
        void shouldGetBooleanWithDefault() {
            assertThat(doc.getBoolean("missing", false)).isFalse();
            assertThat(doc.getBoolean("boolean", false)).isTrue();
        }

        @Test
        @DisplayName("should get list value")
        void shouldGetList() {
            List<?> list = doc.getList("list", Integer.class);
            assertThat(list).containsExactly(1, 2, 3);
        }

        @Test
        @DisplayName("should get nested document")
        void shouldGetNestedDocument() {
            Document nested = doc.get("nested", Document.class);
            assertThat(nested.getString("inner")).isEqualTo("value");
        }

        @Test
        @DisplayName("should return null for missing key")
        void shouldReturnNullForMissingKey() {
            assertThat(doc.get("missing")).isNull();
            assertThat(doc.getString("missing")).isNull();
        }
    }

    @Nested
    @DisplayName("Date Handling")
    class DateTests {

        @Test
        @DisplayName("should store and retrieve Date")
        void shouldHandleDate() {
            Date now = new Date();
            Document doc = new Document("createdAt", now);

            Object retrieved = doc.get("createdAt");
            assertThat(retrieved).isEqualTo(now);
        }

        @Test
        @DisplayName("should store and retrieve Instant")
        void shouldHandleInstant() {
            Instant now = Instant.now();
            Document doc = new Document("timestamp", now);

            Object retrieved = doc.get("timestamp");
            assertThat(retrieved).isEqualTo(now);
        }
    }

    @Nested
    @DisplayName("ObjectId Handling")
    class ObjectIdTests {

        @Test
        @DisplayName("should get ObjectId from _id field")
        void shouldGetObjectId() {
            ObjectId id = ObjectId.get();
            Document doc = new Document("_id", id);

            ObjectId retrieved = doc.getObjectId("_id");
            assertThat(retrieved).isNotNull();
            assertThat(retrieved.toHexString()).isEqualTo(id.toHexString());
        }
    }

    @Nested
    @DisplayName("containsKey")
    class ContainsKeyTests {

        @Test
        @DisplayName("should return true for existing key")
        void shouldReturnTrueForExistingKey() {
            Document doc = new Document("name", "Test");
            assertThat(doc.containsKey("name")).isTrue();
        }

        @Test
        @DisplayName("should return false for missing key")
        void shouldReturnFalseForMissingKey() {
            Document doc = new Document("name", "Test");
            assertThat(doc.containsKey("other")).isFalse();
        }

        @Test
        @DisplayName("should return true for key with null value")
        void shouldReturnTrueForNullValue() {
            Document doc = new Document("nullKey", null);
            assertThat(doc.containsKey("nullKey")).isTrue();
        }
    }

    @Nested
    @DisplayName("Bson Interface")
    class BsonInterfaceTests {

        @Test
        @DisplayName("should implement Bson interface")
        void shouldImplementBson() {
            Document doc = new Document("x", 1);
            Bson bson = doc;

            Document converted = bson.toBsonDocument();
            assertThat(converted.getInteger("x")).isEqualTo(1);
        }

        @Test
        @DisplayName("toBsonDocument should return self")
        void toBsonDocumentShouldReturnSelf() {
            Document doc = new Document("test", true);
            assertThat(doc.toBsonDocument()).isSameAs(doc);
        }
    }

    @Nested
    @DisplayName("Parse and ToJson")
    class SerializationTests {

        @Test
        @DisplayName("should parse simple JSON")
        void shouldParseSimpleJson() {
            Document doc = Document.parse("{\"name\": \"Test\", \"value\": 123}");

            assertThat(doc.getString("name")).isEqualTo("Test");
            assertThat(doc.get("value")).isNotNull();
        }

        @Test
        @DisplayName("should convert to JSON")
        void shouldConvertToJson() {
            Document doc = new Document("name", "Alice").append("age", 30);
            String json = doc.toJson();

            assertThat(json).contains("\"name\"");
            assertThat(json).contains("\"Alice\"");
            assertThat(json).contains("\"age\"");
        }
    }

    @Nested
    @DisplayName("Equality")
    class EqualityTests {

        @Test
        @DisplayName("equal documents should be equal")
        void equalDocumentsShouldBeEqual() {
            Document doc1 = new Document("x", 1).append("y", 2);
            Document doc2 = new Document("x", 1).append("y", 2);

            assertThat(doc1).isEqualTo(doc2);
            assertThat(doc1.hashCode()).isEqualTo(doc2.hashCode());
        }

        @Test
        @DisplayName("different documents should not be equal")
        void differentDocumentsShouldNotBeEqual() {
            Document doc1 = new Document("x", 1);
            Document doc2 = new Document("x", 2);

            assertThat(doc1).isNotEqualTo(doc2);
        }
    }
}
