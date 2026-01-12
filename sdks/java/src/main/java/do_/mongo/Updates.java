package do_.mongo;

import java.util.Arrays;
import java.util.List;

/**
 * Utility class for creating MongoDB update operations.
 * <p>
 * This class provides static factory methods for all standard MongoDB update operators.
 * </p>
 *
 * <pre>{@code
 * import static do_.mongo.Updates.*;
 *
 * // Set a field
 * Bson update = set("status", "active");
 *
 * // Increment a field
 * Bson update = inc("count", 1);
 *
 * // Combine updates
 * Bson update = combine(
 *     set("status", "active"),
 *     inc("loginCount", 1),
 *     currentDate("lastLogin")
 * );
 * }</pre>
 */
public final class Updates {

    private Updates() {
        // Utility class
    }

    // ============================================================================
    // Field Update Operators
    // ============================================================================

    /**
     * Creates a $set update.
     *
     * @param fieldName the field name
     * @param value     the new value
     * @return the update
     */
    public static Bson set(String fieldName, Object value) {
        return () -> new Document("$set", new Document(fieldName, value));
    }

    /**
     * Creates a $setOnInsert update.
     *
     * @param fieldName the field name
     * @param value     the value to set on insert
     * @return the update
     */
    public static Bson setOnInsert(String fieldName, Object value) {
        return () -> new Document("$setOnInsert", new Document(fieldName, value));
    }

    /**
     * Creates an $unset update.
     *
     * @param fieldName the field to unset
     * @return the update
     */
    public static Bson unset(String fieldName) {
        return () -> new Document("$unset", new Document(fieldName, ""));
    }

    /**
     * Creates a $rename update.
     *
     * @param fieldName    the current field name
     * @param newFieldName the new field name
     * @return the update
     */
    public static Bson rename(String fieldName, String newFieldName) {
        return () -> new Document("$rename", new Document(fieldName, newFieldName));
    }

    // ============================================================================
    // Numeric Update Operators
    // ============================================================================

    /**
     * Creates an $inc update.
     *
     * @param fieldName the field name
     * @param number    the amount to increment
     * @return the update
     */
    public static Bson inc(String fieldName, Number number) {
        return () -> new Document("$inc", new Document(fieldName, number));
    }

    /**
     * Creates a $mul update.
     *
     * @param fieldName the field name
     * @param number    the multiplier
     * @return the update
     */
    public static Bson mul(String fieldName, Number number) {
        return () -> new Document("$mul", new Document(fieldName, number));
    }

    /**
     * Creates a $min update.
     *
     * @param fieldName the field name
     * @param value     the minimum value
     * @return the update
     */
    public static Bson min(String fieldName, Object value) {
        return () -> new Document("$min", new Document(fieldName, value));
    }

    /**
     * Creates a $max update.
     *
     * @param fieldName the field name
     * @param value     the maximum value
     * @return the update
     */
    public static Bson max(String fieldName, Object value) {
        return () -> new Document("$max", new Document(fieldName, value));
    }

    // ============================================================================
    // Date Update Operators
    // ============================================================================

    /**
     * Creates a $currentDate update that sets the field to the current date.
     *
     * @param fieldName the field name
     * @return the update
     */
    public static Bson currentDate(String fieldName) {
        return () -> new Document("$currentDate", new Document(fieldName, true));
    }

    /**
     * Creates a $currentDate update that sets the field to the current timestamp.
     *
     * @param fieldName the field name
     * @return the update
     */
    public static Bson currentTimestamp(String fieldName) {
        return () -> new Document("$currentDate",
                new Document(fieldName, new Document("$type", "timestamp")));
    }

    // ============================================================================
    // Array Update Operators
    // ============================================================================

    /**
     * Creates a $push update.
     *
     * @param fieldName the field name
     * @param value     the value to push
     * @return the update
     */
    public static Bson push(String fieldName, Object value) {
        return () -> new Document("$push", new Document(fieldName, value));
    }

    /**
     * Creates a $push update with $each.
     *
     * @param fieldName the field name
     * @param values    the values to push
     * @return the update
     */
    public static Bson pushEach(String fieldName, Object... values) {
        return pushEach(fieldName, Arrays.asList(values));
    }

    /**
     * Creates a $push update with $each.
     *
     * @param fieldName the field name
     * @param values    the values to push
     * @return the update
     */
    public static Bson pushEach(String fieldName, List<?> values) {
        return () -> new Document("$push",
                new Document(fieldName, new Document("$each", values)));
    }

    /**
     * Creates a $push update with $each and $slice.
     *
     * @param fieldName the field name
     * @param values    the values to push
     * @param slice     the slice limit
     * @return the update
     */
    public static Bson pushEach(String fieldName, List<?> values, int slice) {
        return () -> new Document("$push",
                new Document(fieldName, new Document("$each", values).append("$slice", slice)));
    }

    /**
     * Creates a $push update with $each, $slice, and $sort.
     *
     * @param fieldName     the field name
     * @param values        the values to push
     * @param slice         the slice limit
     * @param sortField     the field to sort by
     * @param sortDirection 1 for ascending, -1 for descending
     * @return the update
     */
    public static Bson pushEach(String fieldName, List<?> values, int slice, String sortField, int sortDirection) {
        return () -> new Document("$push",
                new Document(fieldName, new Document("$each", values)
                        .append("$slice", slice)
                        .append("$sort", new Document(sortField, sortDirection))));
    }

    /**
     * Creates an $addToSet update.
     *
     * @param fieldName the field name
     * @param value     the value to add
     * @return the update
     */
    public static Bson addToSet(String fieldName, Object value) {
        return () -> new Document("$addToSet", new Document(fieldName, value));
    }

    /**
     * Creates an $addToSet update with $each.
     *
     * @param fieldName the field name
     * @param values    the values to add
     * @return the update
     */
    public static Bson addEachToSet(String fieldName, Object... values) {
        return addEachToSet(fieldName, Arrays.asList(values));
    }

    /**
     * Creates an $addToSet update with $each.
     *
     * @param fieldName the field name
     * @param values    the values to add
     * @return the update
     */
    public static Bson addEachToSet(String fieldName, List<?> values) {
        return () -> new Document("$addToSet",
                new Document(fieldName, new Document("$each", values)));
    }

    /**
     * Creates a $pop update to remove the first element.
     *
     * @param fieldName the field name
     * @return the update
     */
    public static Bson popFirst(String fieldName) {
        return () -> new Document("$pop", new Document(fieldName, -1));
    }

    /**
     * Creates a $pop update to remove the last element.
     *
     * @param fieldName the field name
     * @return the update
     */
    public static Bson popLast(String fieldName) {
        return () -> new Document("$pop", new Document(fieldName, 1));
    }

    /**
     * Creates a $pull update.
     *
     * @param fieldName the field name
     * @param value     the value to remove
     * @return the update
     */
    public static Bson pull(String fieldName, Object value) {
        return () -> new Document("$pull", new Document(fieldName, value));
    }

    /**
     * Creates a $pull update with a filter.
     *
     * @param fieldName the field name
     * @param filter    the filter for elements to remove
     * @return the update
     */
    public static Bson pullByFilter(String fieldName, Bson filter) {
        return () -> new Document("$pull", new Document(fieldName, filter.toBsonDocument()));
    }

    /**
     * Creates a $pullAll update.
     *
     * @param fieldName the field name
     * @param values    the values to remove
     * @return the update
     */
    public static Bson pullAll(String fieldName, Object... values) {
        return pullAll(fieldName, Arrays.asList(values));
    }

    /**
     * Creates a $pullAll update.
     *
     * @param fieldName the field name
     * @param values    the values to remove
     * @return the update
     */
    public static Bson pullAll(String fieldName, List<?> values) {
        return () -> new Document("$pullAll", new Document(fieldName, values));
    }

    // ============================================================================
    // Bitwise Update Operators
    // ============================================================================

    /**
     * Creates a $bit update with AND.
     *
     * @param fieldName the field name
     * @param value     the bitmask
     * @return the update
     */
    public static Bson bitwiseAnd(String fieldName, long value) {
        return () -> new Document("$bit", new Document(fieldName, new Document("and", value)));
    }

    /**
     * Creates a $bit update with OR.
     *
     * @param fieldName the field name
     * @param value     the bitmask
     * @return the update
     */
    public static Bson bitwiseOr(String fieldName, long value) {
        return () -> new Document("$bit", new Document(fieldName, new Document("or", value)));
    }

    /**
     * Creates a $bit update with XOR.
     *
     * @param fieldName the field name
     * @param value     the bitmask
     * @return the update
     */
    public static Bson bitwiseXor(String fieldName, long value) {
        return () -> new Document("$bit", new Document(fieldName, new Document("xor", value)));
    }

    // ============================================================================
    // Combination
    // ============================================================================

    /**
     * Combines multiple updates into a single update.
     *
     * @param updates the updates to combine
     * @return the combined update
     */
    public static Bson combine(Bson... updates) {
        return combine(Arrays.asList(updates));
    }

    /**
     * Combines multiple updates into a single update.
     *
     * @param updates the updates to combine
     * @return the combined update
     */
    public static Bson combine(List<Bson> updates) {
        return () -> {
            Document combined = new Document();
            for (Bson update : updates) {
                Document doc = update.toBsonDocument();
                for (String key : doc.keySet()) {
                    if (combined.containsKey(key)) {
                        // Merge operators with the same key
                        Object existing = combined.get(key);
                        Object newValue = doc.get(key);
                        if (existing instanceof Document && newValue instanceof Document) {
                            ((Document) existing).putAll((Document) newValue);
                        } else {
                            combined.put(key, newValue);
                        }
                    } else {
                        combined.put(key, doc.get(key));
                    }
                }
            }
            return combined;
        };
    }
}
