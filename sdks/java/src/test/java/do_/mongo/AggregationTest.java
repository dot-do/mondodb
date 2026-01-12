package do_.mongo;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static do_.mongo.AggregateIterable.*;
import static do_.mongo.Filters.*;
import static org.assertj.core.api.Assertions.*;

/**
 * Unit tests for aggregation operations.
 */
@DisplayName("Aggregation")
class AggregationTest {

    private MongoClient client;
    private MongoCollection<Document> collection;

    @BeforeEach
    void setUp() {
        client = MongoClients.createMock();
        collection = client.getDatabase("test").getCollection("orders");

        // Insert test data
        collection.insertMany(Arrays.asList(
                new Document("customer", "Alice").append("amount", 100).append("category", "electronics"),
                new Document("customer", "Bob").append("amount", 200).append("category", "clothing"),
                new Document("customer", "Alice").append("amount", 150).append("category", "electronics"),
                new Document("customer", "Carol").append("amount", 300).append("category", "electronics"),
                new Document("customer", "Bob").append("amount", 50).append("category", "books")
        ));
    }

    @AfterEach
    void tearDown() {
        if (client != null) {
            client.close();
        }
    }

    @Nested
    @DisplayName("Pipeline Stages")
    class PipelineStageTests {

        @Test
        @DisplayName("should execute match stage")
        void shouldExecuteMatchStage() {
            List<Document> results = collection.aggregate()
                    .match(eq("category", "electronics"))
                    .toList();

            assertThat(results).hasSize(3);
            assertThat(results).allMatch(doc -> "electronics".equals(doc.getString("category")));
        }

        @Test
        @DisplayName("should execute limit stage")
        void shouldExecuteLimitStage() {
            List<Document> results = collection.aggregate()
                    .limit(2)
                    .toList();

            assertThat(results).hasSize(2);
        }

        @Test
        @DisplayName("should execute skip stage")
        void shouldExecuteSkipStage() {
            int total = collection.find().toList().size();
            List<Document> results = collection.aggregate()
                    .skip(2)
                    .toList();

            assertThat(results).hasSize(total - 2);
        }

        @Test
        @DisplayName("should combine match and limit")
        void shouldCombineMatchAndLimit() {
            List<Document> results = collection.aggregate()
                    .match(gte("amount", 100))
                    .limit(2)
                    .toList();

            assertThat(results).hasSize(2);
            assertThat(results).allMatch(doc -> doc.getInteger("amount") >= 100);
        }
    }

    @Nested
    @DisplayName("Aggregation with Document Pipeline")
    class DocumentPipelineTests {

        @Test
        @DisplayName("should execute document-based pipeline")
        void shouldExecuteDocumentPipeline() {
            List<Document> results = collection.aggregate(Arrays.asList(
                    new Document("$match", new Document("category", "electronics")),
                    new Document("$limit", 2)
            ));

            assertThat(results).hasSize(2);
        }
    }

    @Nested
    @DisplayName("AggregateIterable Builder")
    class IterableBuilderTests {

        @Test
        @DisplayName("should build and execute pipeline")
        void shouldBuildAndExecutePipeline() {
            List<Document> results = collection.aggregate()
                    .match(eq("category", "electronics"))
                    .toList();

            assertThat(results).isNotEmpty();
        }

        @Test
        @DisplayName("should get first result")
        void shouldGetFirstResult() {
            Document first = collection.aggregate()
                    .match(eq("customer", "Alice"))
                    .first();

            assertThat(first).isNotNull();
            assertThat(first.getString("customer")).isEqualTo("Alice");
        }

        @Test
        @DisplayName("should return null when no match")
        void shouldReturnNullWhenNoMatch() {
            Document first = collection.aggregate()
                    .match(eq("customer", "NotExists"))
                    .first();

            assertThat(first).isNull();
        }

        @Test
        @DisplayName("should iterate with forEach")
        void shouldIterateWithForEach() {
            java.util.concurrent.atomic.AtomicInteger count = new java.util.concurrent.atomic.AtomicInteger(0);

            collection.aggregate()
                    .match(eq("category", "electronics"))
                    .forEach(doc -> count.incrementAndGet());

            assertThat(count.get()).isEqualTo(3);
        }

        @Test
        @DisplayName("should collect into list")
        void shouldCollectIntoList() {
            java.util.ArrayList<Document> target = new java.util.ArrayList<>();

            collection.aggregate()
                    .limit(3)
                    .into(target);

            assertThat(target).hasSize(3);
        }

        @Test
        @DisplayName("should get pipeline stages")
        void shouldGetPipelineStages() {
            AggregateIterable<Document> iterable = collection.aggregate()
                    .match(eq("active", true))
                    .limit(10)
                    .skip(5);

            List<Document> pipeline = iterable.getPipeline();
            assertThat(pipeline).hasSize(3);
        }
    }

    @Nested
    @DisplayName("Accumulator Helpers")
    class AccumulatorTests {

        @Test
        @DisplayName("sum should create $sum accumulator")
        void sumShouldCreateAccumulator() {
            Document acc = sum("total", "$amount");
            assertThat(acc.containsKey("total")).isTrue();
            Document total = acc.get("total", Document.class);
            assertThat(total.get("$sum")).isEqualTo("$amount");
        }

        @Test
        @DisplayName("avg should create $avg accumulator")
        void avgShouldCreateAccumulator() {
            Document acc = avg("average", "$score");
            Document average = acc.get("average", Document.class);
            assertThat(average.get("$avg")).isEqualTo("$score");
        }

        @Test
        @DisplayName("min should create $min accumulator")
        void minShouldCreateAccumulator() {
            Document acc = min("lowest", "$price");
            Document lowest = acc.get("lowest", Document.class);
            assertThat(lowest.get("$min")).isEqualTo("$price");
        }

        @Test
        @DisplayName("max should create $max accumulator")
        void maxShouldCreateAccumulator() {
            Document acc = max("highest", "$price");
            Document highest = acc.get("highest", Document.class);
            assertThat(highest.get("$max")).isEqualTo("$price");
        }

        @Test
        @DisplayName("first should create $first accumulator")
        void firstShouldCreateAccumulator() {
            Document acc = first("firstItem", "$item");
            Document firstItem = acc.get("firstItem", Document.class);
            assertThat(firstItem.get("$first")).isEqualTo("$item");
        }

        @Test
        @DisplayName("last should create $last accumulator")
        void lastShouldCreateAccumulator() {
            Document acc = last("lastItem", "$item");
            Document lastItem = acc.get("lastItem", Document.class);
            assertThat(lastItem.get("$last")).isEqualTo("$item");
        }

        @Test
        @DisplayName("push should create $push accumulator")
        void pushShouldCreateAccumulator() {
            Document acc = push("items", "$item");
            Document items = acc.get("items", Document.class);
            assertThat(items.get("$push")).isEqualTo("$item");
        }

        @Test
        @DisplayName("addToSet should create $addToSet accumulator")
        void addToSetShouldCreateAccumulator() {
            Document acc = addToSet("uniqueItems", "$item");
            Document uniqueItems = acc.get("uniqueItems", Document.class);
            assertThat(uniqueItems.get("$addToSet")).isEqualTo("$item");
        }

        @Test
        @DisplayName("countAcc should create count accumulator")
        void countAccShouldCreateAccumulator() {
            Document acc = countAcc("count");
            Document count = acc.get("count", Document.class);
            assertThat(count.get("$sum")).isEqualTo(1);
        }
    }
}
