package do_.mongo;

import java.util.Arrays;
import java.util.List;

/**
 * Utility class for creating MongoDB sort specifications.
 * <p>
 * This class provides static factory methods for building sort documents.
 * </p>
 *
 * <pre>{@code
 * import static do_.mongo.Sorts.*;
 *
 * // Single field
 * Bson sort = ascending("name");
 *
 * // Multiple fields
 * Bson sort = orderBy(ascending("lastName"), descending("age"));
 *
 * // Text score sort
 * Bson sort = metaTextScore("score");
 * }</pre>
 */
public final class Sorts {

    private Sorts() {
        // Utility class
    }

    /**
     * Creates an ascending sort specification for a single field.
     *
     * @param fieldName the field name
     * @return the sort specification
     */
    public static Bson ascending(String fieldName) {
        return () -> new Document(fieldName, 1);
    }

    /**
     * Creates an ascending sort specification for multiple fields.
     *
     * @param fieldNames the field names
     * @return the sort specification
     */
    public static Bson ascending(String... fieldNames) {
        return ascending(Arrays.asList(fieldNames));
    }

    /**
     * Creates an ascending sort specification for multiple fields.
     *
     * @param fieldNames the field names
     * @return the sort specification
     */
    public static Bson ascending(List<String> fieldNames) {
        return () -> {
            Document sort = new Document();
            for (String field : fieldNames) {
                sort.append(field, 1);
            }
            return sort;
        };
    }

    /**
     * Creates a descending sort specification for a single field.
     *
     * @param fieldName the field name
     * @return the sort specification
     */
    public static Bson descending(String fieldName) {
        return () -> new Document(fieldName, -1);
    }

    /**
     * Creates a descending sort specification for multiple fields.
     *
     * @param fieldNames the field names
     * @return the sort specification
     */
    public static Bson descending(String... fieldNames) {
        return descending(Arrays.asList(fieldNames));
    }

    /**
     * Creates a descending sort specification for multiple fields.
     *
     * @param fieldNames the field names
     * @return the sort specification
     */
    public static Bson descending(List<String> fieldNames) {
        return () -> {
            Document sort = new Document();
            for (String field : fieldNames) {
                sort.append(field, -1);
            }
            return sort;
        };
    }

    /**
     * Combines multiple sort specifications in order.
     *
     * @param sorts the sort specifications
     * @return the combined sort specification
     */
    public static Bson orderBy(Bson... sorts) {
        return orderBy(Arrays.asList(sorts));
    }

    /**
     * Combines multiple sort specifications in order.
     *
     * @param sorts the sort specifications
     * @return the combined sort specification
     */
    public static Bson orderBy(Iterable<Bson> sorts) {
        return () -> {
            Document combined = new Document();
            for (Bson sort : sorts) {
                combined.putAll(sort.toBsonDocument());
            }
            return combined;
        };
    }

    /**
     * Creates a text score metadata sort.
     *
     * @param fieldName the field name for the text score
     * @return the sort specification
     */
    public static Bson metaTextScore(String fieldName) {
        return () -> new Document(fieldName, new Document("$meta", "textScore"));
    }

    /**
     * Creates a compound sort from field names and directions.
     * <p>
     * Example: {@code compound("name", 1, "age", -1)}
     * </p>
     *
     * @param fieldAndDirections alternating field names and directions (1 or -1)
     * @return the sort specification
     */
    public static Bson compound(Object... fieldAndDirections) {
        return () -> {
            Document sort = new Document();
            for (int i = 0; i < fieldAndDirections.length - 1; i += 2) {
                String field = (String) fieldAndDirections[i];
                Number direction = (Number) fieldAndDirections[i + 1];
                sort.append(field, direction.intValue());
            }
            return sort;
        };
    }

    /**
     * Creates a natural order sort (order of documents on disk).
     *
     * @return the sort specification
     */
    public static Bson natural() {
        return natural(true);
    }

    /**
     * Creates a natural order sort.
     *
     * @param ascending true for ascending, false for descending
     * @return the sort specification
     */
    public static Bson natural(boolean ascending) {
        return () -> new Document("$natural", ascending ? 1 : -1);
    }
}
