package do_.mongo;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.regex.Pattern;

import static do_.mongo.Filters.*;
import static org.assertj.core.api.Assertions.*;

/**
 * Unit tests for Filters utility class.
 */
@DisplayName("Filters")
class FiltersTest {

    @Nested
    @DisplayName("Comparison Operators")
    class ComparisonTests {

        @Test
        @DisplayName("eq should create equality filter")
        void eqShouldCreateEqualityFilter() {
            Document doc = eq("status", "active").toBsonDocument();
            assertThat(doc.getString("status")).isEqualTo("active");
        }

        @Test
        @DisplayName("eq with single arg should filter by _id")
        void eqSingleArgShouldFilterById() {
            Document doc = eq("12345").toBsonDocument();
            assertThat(doc.getString("_id")).isEqualTo("12345");
        }

        @Test
        @DisplayName("ne should create not-equal filter")
        void neShouldCreateNotEqualFilter() {
            Document doc = ne("status", "deleted").toBsonDocument();
            Document status = doc.get("status", Document.class);
            assertThat(status.get("$ne")).isEqualTo("deleted");
        }

        @Test
        @DisplayName("gt should create greater-than filter")
        void gtShouldCreateGtFilter() {
            Document doc = gt("age", 18).toBsonDocument();
            Document age = doc.get("age", Document.class);
            assertThat(age.get("$gt")).isEqualTo(18);
        }

        @Test
        @DisplayName("gte should create greater-than-or-equal filter")
        void gteShouldCreateGteFilter() {
            Document doc = gte("score", 85.5).toBsonDocument();
            Document score = doc.get("score", Document.class);
            assertThat(score.get("$gte")).isEqualTo(85.5);
        }

        @Test
        @DisplayName("lt should create less-than filter")
        void ltShouldCreateLtFilter() {
            Document doc = lt("age", 65).toBsonDocument();
            Document age = doc.get("age", Document.class);
            assertThat(age.get("$lt")).isEqualTo(65);
        }

        @Test
        @DisplayName("lte should create less-than-or-equal filter")
        void lteShouldCreateLteFilter() {
            Document doc = lte("priority", 5).toBsonDocument();
            Document priority = doc.get("priority", Document.class);
            assertThat(priority.get("$lte")).isEqualTo(5);
        }

        @Test
        @DisplayName("in should create in filter with varargs")
        void inShouldCreateInFilter() {
            Document doc = in("status", "pending", "processing", "complete").toBsonDocument();
            Document status = doc.get("status", Document.class);
            assertThat(status.get("$in")).asList().containsExactly("pending", "processing", "complete");
        }

        @Test
        @DisplayName("in should create in filter with iterable")
        void inShouldCreateInFilterWithIterable() {
            Document doc = in("id", Arrays.asList(1, 2, 3)).toBsonDocument();
            Document id = doc.get("id", Document.class);
            assertThat(id.get("$in")).asList().containsExactly(1, 2, 3);
        }

        @Test
        @DisplayName("nin should create not-in filter")
        void ninShouldCreateNinFilter() {
            Document doc = nin("type", "spam", "deleted").toBsonDocument();
            Document type = doc.get("type", Document.class);
            assertThat(type.get("$nin")).asList().containsExactly("spam", "deleted");
        }
    }

    @Nested
    @DisplayName("Logical Operators")
    class LogicalTests {

        @Test
        @DisplayName("and should combine filters")
        void andShouldCombineFilters() {
            Document doc = and(
                    eq("active", true),
                    gte("age", 18)
            ).toBsonDocument();

            assertThat(doc.get("$and")).asList().hasSize(2);
        }

        @Test
        @DisplayName("or should combine filters")
        void orShouldCombineFilters() {
            Document doc = or(
                    eq("role", "admin"),
                    eq("role", "moderator")
            ).toBsonDocument();

            assertThat(doc.get("$or")).asList().hasSize(2);
        }

        @Test
        @DisplayName("nor should combine filters with negation")
        void norShouldCombineFilters() {
            Document doc = nor(
                    eq("status", "banned"),
                    eq("status", "suspended")
            ).toBsonDocument();

            assertThat(doc.get("$nor")).asList().hasSize(2);
        }

        @Test
        @DisplayName("not should negate filter")
        void notShouldNegateFilter() {
            Document doc = not(gt("age", 100)).toBsonDocument();
            Document age = doc.get("age", Document.class);
            assertThat(age.containsKey("$not")).isTrue();
        }
    }

    @Nested
    @DisplayName("Element Operators")
    class ElementTests {

        @Test
        @DisplayName("exists should create exists filter")
        void existsShouldCreateFilter() {
            Document doc = exists("email").toBsonDocument();
            Document email = doc.get("email", Document.class);
            assertThat(email.get("$exists")).isEqualTo(true);
        }

        @Test
        @DisplayName("exists false should create not-exists filter")
        void existsFalseShouldCreateFilter() {
            Document doc = exists("deletedAt", false).toBsonDocument();
            Document field = doc.get("deletedAt", Document.class);
            assertThat(field.get("$exists")).isEqualTo(false);
        }

        @Test
        @DisplayName("type should create type filter")
        void typeShouldCreateFilter() {
            Document doc = type("value", "string").toBsonDocument();
            Document value = doc.get("value", Document.class);
            assertThat(value.get("$type")).isEqualTo("string");
        }
    }

    @Nested
    @DisplayName("Evaluation Operators")
    class EvaluationTests {

        @Test
        @DisplayName("regex should create regex filter")
        void regexShouldCreateFilter() {
            Document doc = regex("email", ".*@example\\.com$").toBsonDocument();
            Document email = doc.get("email", Document.class);
            assertThat(email.get("$regex")).isEqualTo(".*@example\\.com$");
        }

        @Test
        @DisplayName("regex should include options")
        void regexShouldIncludeOptions() {
            Document doc = regex("name", "^john", "i").toBsonDocument();
            Document name = doc.get("name", Document.class);
            assertThat(name.get("$regex")).isEqualTo("^john");
            assertThat(name.get("$options")).isEqualTo("i");
        }

        @Test
        @DisplayName("regex should accept Pattern")
        void regexShouldAcceptPattern() {
            Document doc = regex("code", Pattern.compile("^[A-Z]{2}\\d{4}$", Pattern.CASE_INSENSITIVE))
                    .toBsonDocument();
            Document code = doc.get("code", Document.class);
            assertThat(code.get("$regex")).isEqualTo("^[A-Z]{2}\\d{4}$");
            assertThat(code.getString("$options")).contains("i");
        }

        @Test
        @DisplayName("text should create text search filter")
        void textShouldCreateFilter() {
            Document doc = text("coffee shop").toBsonDocument();
            Document text = doc.get("$text", Document.class);
            assertThat(text.get("$search")).isEqualTo("coffee shop");
        }

        @Test
        @DisplayName("mod should create modulo filter")
        void modShouldCreateFilter() {
            Document doc = mod("quantity", 4, 0).toBsonDocument();
            Document quantity = doc.get("quantity", Document.class);
            assertThat(quantity.get("$mod")).asList().containsExactly(4L, 0L);
        }
    }

    @Nested
    @DisplayName("Array Operators")
    class ArrayTests {

        @Test
        @DisplayName("all should create all filter")
        void allShouldCreateFilter() {
            Document doc = all("tags", "mongodb", "database", "nosql").toBsonDocument();
            Document tags = doc.get("tags", Document.class);
            assertThat(tags.get("$all")).asList().containsExactly("mongodb", "database", "nosql");
        }

        @Test
        @DisplayName("elemMatch should create elemMatch filter")
        void elemMatchShouldCreateFilter() {
            Document doc = elemMatch("scores", and(gte("score", 85), lt("score", 95))).toBsonDocument();
            Document scores = doc.get("scores", Document.class);
            assertThat(scores.containsKey("$elemMatch")).isTrue();
        }

        @Test
        @DisplayName("size should create size filter")
        void sizeShouldCreateFilter() {
            Document doc = size("items", 3).toBsonDocument();
            Document items = doc.get("items", Document.class);
            assertThat(items.get("$size")).isEqualTo(3);
        }
    }

    @Nested
    @DisplayName("Bitwise Operators")
    class BitwiseTests {

        @Test
        @DisplayName("bitsAllSet should create filter")
        void bitsAllSetShouldCreateFilter() {
            Document doc = bitsAllSet("flags", 0b1010L).toBsonDocument();
            Document flags = doc.get("flags", Document.class);
            assertThat(flags.get("$bitsAllSet")).isEqualTo(0b1010L);
        }

        @Test
        @DisplayName("bitsAnySet should create filter")
        void bitsAnySetShouldCreateFilter() {
            Document doc = bitsAnySet("permissions", 0b0100L).toBsonDocument();
            Document permissions = doc.get("permissions", Document.class);
            assertThat(permissions.get("$bitsAnySet")).isEqualTo(0b0100L);
        }
    }

    @Nested
    @DisplayName("Utility Methods")
    class UtilityTests {

        @Test
        @DisplayName("empty should create empty filter")
        void emptyShouldCreateEmptyFilter() {
            Document doc = empty().toBsonDocument();
            assertThat(doc).isEmpty();
        }
    }
}
