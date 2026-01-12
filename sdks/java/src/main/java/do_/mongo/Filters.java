package do_.mongo;

import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Utility class for creating MongoDB query filters.
 * <p>
 * This class provides static factory methods for all standard MongoDB query operators.
 * </p>
 *
 * <pre>{@code
 * import static do_.mongo.Filters.*;
 *
 * // Simple equality
 * Bson filter = eq("status", "active");
 *
 * // Comparison
 * Bson filter = and(gte("age", 18), lt("age", 65));
 *
 * // Array operators
 * Bson filter = in("status", "pending", "processing");
 *
 * // Logical operators
 * Bson filter = or(eq("priority", "high"), gte("score", 90));
 * }</pre>
 */
public final class Filters {

    private Filters() {
        // Utility class
    }

    // ============================================================================
    // Comparison Operators
    // ============================================================================

    /**
     * Creates an equality filter.
     *
     * @param fieldName the field name
     * @param value     the value to match
     * @return the filter
     */
    public static Bson eq(String fieldName, Object value) {
        return () -> new Document(fieldName, value);
    }

    /**
     * Creates a filter for _id equality.
     *
     * @param value the _id value
     * @return the filter
     */
    public static Bson eq(Object value) {
        return eq("_id", value);
    }

    /**
     * Creates a not-equal filter.
     *
     * @param fieldName the field name
     * @param value     the value to not match
     * @return the filter
     */
    public static Bson ne(String fieldName, Object value) {
        return () -> new Document(fieldName, new Document("$ne", value));
    }

    /**
     * Creates a greater-than filter.
     *
     * @param fieldName the field name
     * @param value     the value to compare
     * @return the filter
     */
    public static Bson gt(String fieldName, Object value) {
        return () -> new Document(fieldName, new Document("$gt", value));
    }

    /**
     * Creates a greater-than-or-equal filter.
     *
     * @param fieldName the field name
     * @param value     the value to compare
     * @return the filter
     */
    public static Bson gte(String fieldName, Object value) {
        return () -> new Document(fieldName, new Document("$gte", value));
    }

    /**
     * Creates a less-than filter.
     *
     * @param fieldName the field name
     * @param value     the value to compare
     * @return the filter
     */
    public static Bson lt(String fieldName, Object value) {
        return () -> new Document(fieldName, new Document("$lt", value));
    }

    /**
     * Creates a less-than-or-equal filter.
     *
     * @param fieldName the field name
     * @param value     the value to compare
     * @return the filter
     */
    public static Bson lte(String fieldName, Object value) {
        return () -> new Document(fieldName, new Document("$lte", value));
    }

    /**
     * Creates an in filter.
     *
     * @param fieldName the field name
     * @param values    the values to match
     * @return the filter
     */
    public static Bson in(String fieldName, Object... values) {
        return in(fieldName, Arrays.asList(values));
    }

    /**
     * Creates an in filter.
     *
     * @param fieldName the field name
     * @param values    the values to match
     * @return the filter
     */
    public static Bson in(String fieldName, Iterable<?> values) {
        return () -> new Document(fieldName, new Document("$in", toList(values)));
    }

    /**
     * Creates a not-in filter.
     *
     * @param fieldName the field name
     * @param values    the values to not match
     * @return the filter
     */
    public static Bson nin(String fieldName, Object... values) {
        return nin(fieldName, Arrays.asList(values));
    }

    /**
     * Creates a not-in filter.
     *
     * @param fieldName the field name
     * @param values    the values to not match
     * @return the filter
     */
    public static Bson nin(String fieldName, Iterable<?> values) {
        return () -> new Document(fieldName, new Document("$nin", toList(values)));
    }

    // ============================================================================
    // Logical Operators
    // ============================================================================

    /**
     * Creates an and filter.
     *
     * @param filters the filters to combine
     * @return the combined filter
     */
    public static Bson and(Bson... filters) {
        return and(Arrays.asList(filters));
    }

    /**
     * Creates an and filter.
     *
     * @param filters the filters to combine
     * @return the combined filter
     */
    public static Bson and(Iterable<Bson> filters) {
        return () -> {
            List<Document> docs = new java.util.ArrayList<>();
            for (Bson filter : filters) {
                docs.add(filter.toBsonDocument());
            }
            return new Document("$and", docs);
        };
    }

    /**
     * Creates an or filter.
     *
     * @param filters the filters to combine
     * @return the combined filter
     */
    public static Bson or(Bson... filters) {
        return or(Arrays.asList(filters));
    }

    /**
     * Creates an or filter.
     *
     * @param filters the filters to combine
     * @return the combined filter
     */
    public static Bson or(Iterable<Bson> filters) {
        return () -> {
            List<Document> docs = new java.util.ArrayList<>();
            for (Bson filter : filters) {
                docs.add(filter.toBsonDocument());
            }
            return new Document("$or", docs);
        };
    }

    /**
     * Creates a nor filter.
     *
     * @param filters the filters to combine
     * @return the combined filter
     */
    public static Bson nor(Bson... filters) {
        return nor(Arrays.asList(filters));
    }

    /**
     * Creates a nor filter.
     *
     * @param filters the filters to combine
     * @return the combined filter
     */
    public static Bson nor(Iterable<Bson> filters) {
        return () -> {
            List<Document> docs = new java.util.ArrayList<>();
            for (Bson filter : filters) {
                docs.add(filter.toBsonDocument());
            }
            return new Document("$nor", docs);
        };
    }

    /**
     * Creates a not filter.
     *
     * @param filter the filter to negate
     * @return the negated filter
     */
    public static Bson not(Bson filter) {
        return () -> {
            Document doc = filter.toBsonDocument();
            // For simple field filters, wrap the operator expression in $not
            if (doc.size() == 1) {
                String field = doc.keySet().iterator().next();
                Object value = doc.get(field);
                if (value instanceof Document) {
                    return new Document(field, new Document("$not", value));
                }
            }
            // For complex filters, use $nor with single element
            return new Document("$nor", Arrays.asList(doc));
        };
    }

    // ============================================================================
    // Element Operators
    // ============================================================================

    /**
     * Creates an exists filter.
     *
     * @param fieldName the field name
     * @return the filter
     */
    public static Bson exists(String fieldName) {
        return exists(fieldName, true);
    }

    /**
     * Creates an exists filter.
     *
     * @param fieldName the field name
     * @param exists    true if field should exist
     * @return the filter
     */
    public static Bson exists(String fieldName, boolean exists) {
        return () -> new Document(fieldName, new Document("$exists", exists));
    }

    /**
     * Creates a type filter.
     *
     * @param fieldName the field name
     * @param type      the BSON type name
     * @return the filter
     */
    public static Bson type(String fieldName, String type) {
        return () -> new Document(fieldName, new Document("$type", type));
    }

    /**
     * Creates a type filter.
     *
     * @param fieldName the field name
     * @param type      the BSON type number
     * @return the filter
     */
    public static Bson type(String fieldName, int type) {
        return () -> new Document(fieldName, new Document("$type", type));
    }

    // ============================================================================
    // Evaluation Operators
    // ============================================================================

    /**
     * Creates a regex filter.
     *
     * @param fieldName the field name
     * @param pattern   the regex pattern
     * @return the filter
     */
    public static Bson regex(String fieldName, String pattern) {
        return regex(fieldName, pattern, null);
    }

    /**
     * Creates a regex filter.
     *
     * @param fieldName the field name
     * @param pattern   the regex pattern
     * @param options   the regex options (i, m, s, x)
     * @return the filter
     */
    public static Bson regex(String fieldName, String pattern, String options) {
        return () -> {
            Document regex = new Document("$regex", pattern);
            if (options != null && !options.isEmpty()) {
                regex.append("$options", options);
            }
            return new Document(fieldName, regex);
        };
    }

    /**
     * Creates a regex filter.
     *
     * @param fieldName the field name
     * @param pattern   the compiled regex pattern
     * @return the filter
     */
    public static Bson regex(String fieldName, Pattern pattern) {
        String options = "";
        if ((pattern.flags() & Pattern.CASE_INSENSITIVE) != 0) options += "i";
        if ((pattern.flags() & Pattern.MULTILINE) != 0) options += "m";
        if ((pattern.flags() & Pattern.DOTALL) != 0) options += "s";
        if ((pattern.flags() & Pattern.COMMENTS) != 0) options += "x";
        return regex(fieldName, pattern.pattern(), options.isEmpty() ? null : options);
    }

    /**
     * Creates a text search filter.
     *
     * @param search the search string
     * @return the filter
     */
    public static Bson text(String search) {
        return text(search, null);
    }

    /**
     * Creates a text search filter.
     *
     * @param search   the search string
     * @param language the language for text search
     * @return the filter
     */
    public static Bson text(String search, String language) {
        return () -> {
            Document text = new Document("$search", search);
            if (language != null) {
                text.append("$language", language);
            }
            return new Document("$text", text);
        };
    }

    /**
     * Creates a mod filter.
     *
     * @param fieldName the field name
     * @param divisor   the divisor
     * @param remainder the expected remainder
     * @return the filter
     */
    public static Bson mod(String fieldName, long divisor, long remainder) {
        return () -> new Document(fieldName, new Document("$mod", Arrays.asList(divisor, remainder)));
    }

    // ============================================================================
    // Array Operators
    // ============================================================================

    /**
     * Creates an all filter.
     *
     * @param fieldName the field name
     * @param values    the values that must all be present
     * @return the filter
     */
    public static Bson all(String fieldName, Object... values) {
        return all(fieldName, Arrays.asList(values));
    }

    /**
     * Creates an all filter.
     *
     * @param fieldName the field name
     * @param values    the values that must all be present
     * @return the filter
     */
    public static Bson all(String fieldName, Iterable<?> values) {
        return () -> new Document(fieldName, new Document("$all", toList(values)));
    }

    /**
     * Creates an elemMatch filter.
     *
     * @param fieldName the field name
     * @param filter    the filter for array elements
     * @return the filter
     */
    public static Bson elemMatch(String fieldName, Bson filter) {
        return () -> new Document(fieldName, new Document("$elemMatch", filter.toBsonDocument()));
    }

    /**
     * Creates a size filter.
     *
     * @param fieldName the field name
     * @param size      the expected array size
     * @return the filter
     */
    public static Bson size(String fieldName, int size) {
        return () -> new Document(fieldName, new Document("$size", size));
    }

    // ============================================================================
    // Bitwise Operators
    // ============================================================================

    /**
     * Creates a bitsAllClear filter.
     *
     * @param fieldName the field name
     * @param bitmask   the bitmask
     * @return the filter
     */
    public static Bson bitsAllClear(String fieldName, long bitmask) {
        return () -> new Document(fieldName, new Document("$bitsAllClear", bitmask));
    }

    /**
     * Creates a bitsAllSet filter.
     *
     * @param fieldName the field name
     * @param bitmask   the bitmask
     * @return the filter
     */
    public static Bson bitsAllSet(String fieldName, long bitmask) {
        return () -> new Document(fieldName, new Document("$bitsAllSet", bitmask));
    }

    /**
     * Creates a bitsAnyClear filter.
     *
     * @param fieldName the field name
     * @param bitmask   the bitmask
     * @return the filter
     */
    public static Bson bitsAnyClear(String fieldName, long bitmask) {
        return () -> new Document(fieldName, new Document("$bitsAnyClear", bitmask));
    }

    /**
     * Creates a bitsAnySet filter.
     *
     * @param fieldName the field name
     * @param bitmask   the bitmask
     * @return the filter
     */
    public static Bson bitsAnySet(String fieldName, long bitmask) {
        return () -> new Document(fieldName, new Document("$bitsAnySet", bitmask));
    }

    // ============================================================================
    // Utility Methods
    // ============================================================================

    /**
     * Creates an empty filter that matches all documents.
     *
     * @return an empty filter
     */
    public static Bson empty() {
        return Document::new;
    }

    /**
     * Converts an Iterable to a List.
     */
    private static List<?> toList(Iterable<?> iterable) {
        if (iterable instanceof List) {
            return (List<?>) iterable;
        }
        List<Object> list = new java.util.ArrayList<>();
        for (Object item : iterable) {
            list.add(item);
        }
        return list;
    }
}
