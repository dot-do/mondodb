package do_.mongo;

import java.util.Arrays;
import java.util.List;

/**
 * Utility class for creating MongoDB projection specifications.
 * <p>
 * Projections control which fields are included or excluded from query results.
 * </p>
 *
 * <pre>{@code
 * import static do_.mongo.Projections.*;
 *
 * // Include specific fields
 * Bson projection = include("name", "email");
 *
 * // Exclude fields
 * Bson projection = exclude("password", "internalId");
 *
 * // Combine projections
 * Bson projection = fields(include("name"), excludeId());
 *
 * // Array operations
 * Bson projection = slice("comments", 5);
 * Bson projection = elemMatch("grades", gte("score", 85));
 * }</pre>
 */
public final class Projections {

    private Projections() {
        // Utility class
    }

    /**
     * Creates a projection to include specific fields.
     *
     * @param fieldNames the fields to include
     * @return the projection
     */
    public static Bson include(String... fieldNames) {
        return include(Arrays.asList(fieldNames));
    }

    /**
     * Creates a projection to include specific fields.
     *
     * @param fieldNames the fields to include
     * @return the projection
     */
    public static Bson include(List<String> fieldNames) {
        return () -> {
            Document projection = new Document();
            for (String field : fieldNames) {
                projection.append(field, 1);
            }
            return projection;
        };
    }

    /**
     * Creates a projection to exclude specific fields.
     *
     * @param fieldNames the fields to exclude
     * @return the projection
     */
    public static Bson exclude(String... fieldNames) {
        return exclude(Arrays.asList(fieldNames));
    }

    /**
     * Creates a projection to exclude specific fields.
     *
     * @param fieldNames the fields to exclude
     * @return the projection
     */
    public static Bson exclude(List<String> fieldNames) {
        return () -> {
            Document projection = new Document();
            for (String field : fieldNames) {
                projection.append(field, 0);
            }
            return projection;
        };
    }

    /**
     * Creates a projection to exclude the _id field.
     *
     * @return the projection
     */
    public static Bson excludeId() {
        return () -> new Document("_id", 0);
    }

    /**
     * Combines multiple projections.
     *
     * @param projections the projections to combine
     * @return the combined projection
     */
    public static Bson fields(Bson... projections) {
        return fields(Arrays.asList(projections));
    }

    /**
     * Combines multiple projections.
     *
     * @param projections the projections to combine
     * @return the combined projection
     */
    public static Bson fields(Iterable<Bson> projections) {
        return () -> {
            Document combined = new Document();
            for (Bson projection : projections) {
                combined.putAll(projection.toBsonDocument());
            }
            return combined;
        };
    }

    /**
     * Creates a projection to include the first n elements of an array.
     *
     * @param fieldName the array field name
     * @param limit     the number of elements to include (positive) or exclude (negative)
     * @return the projection
     */
    public static Bson slice(String fieldName, int limit) {
        return () -> new Document(fieldName, new Document("$slice", limit));
    }

    /**
     * Creates a projection to include a range of array elements.
     *
     * @param fieldName the array field name
     * @param skip      the number of elements to skip
     * @param limit     the number of elements to include
     * @return the projection
     */
    public static Bson slice(String fieldName, int skip, int limit) {
        return () -> new Document(fieldName, new Document("$slice", Arrays.asList(skip, limit)));
    }

    /**
     * Creates a projection to include the first matching array element.
     *
     * @param fieldName the array field name
     * @param filter    the filter for matching elements
     * @return the projection
     */
    public static Bson elemMatch(String fieldName, Bson filter) {
        return () -> new Document(fieldName, new Document("$elemMatch", filter.toBsonDocument()));
    }

    /**
     * Creates a projection to include the text search score.
     *
     * @param fieldName the field name to store the score
     * @return the projection
     */
    public static Bson metaTextScore(String fieldName) {
        return () -> new Document(fieldName, new Document("$meta", "textScore"));
    }

    /**
     * Creates a computed field projection.
     *
     * @param fieldName  the output field name
     * @param expression the expression to compute the value
     * @return the projection
     */
    public static Bson computed(String fieldName, Object expression) {
        return () -> new Document(fieldName, expression);
    }

    /**
     * Creates a $filter projection for array elements.
     *
     * @param fieldName the array field name
     * @param asName    the variable name for each element
     * @param condition the filter condition
     * @return the projection
     */
    public static Bson filter(String fieldName, String asName, Bson condition) {
        return () -> new Document(fieldName, new Document("$filter",
                new Document("input", "$" + fieldName)
                        .append("as", asName)
                        .append("cond", condition.toBsonDocument())));
    }

    /**
     * Creates a $map projection for transforming array elements.
     *
     * @param fieldName  the array field name
     * @param asName     the variable name for each element
     * @param expression the transformation expression
     * @return the projection
     */
    public static Bson map(String fieldName, String asName, Object expression) {
        return () -> new Document(fieldName, new Document("$map",
                new Document("input", "$" + fieldName)
                        .append("as", asName)
                        .append("in", expression)));
    }

    /**
     * Creates a $literal projection for constant values.
     *
     * @param fieldName the field name
     * @param value     the literal value
     * @return the projection
     */
    public static Bson literal(String fieldName, Object value) {
        return () -> new Document(fieldName, new Document("$literal", value));
    }

    /**
     * Creates a $cond projection for conditional values.
     *
     * @param fieldName   the field name
     * @param condition   the condition expression
     * @param thenValue   the value if condition is true
     * @param elseValue   the value if condition is false
     * @return the projection
     */
    public static Bson cond(String fieldName, Object condition, Object thenValue, Object elseValue) {
        return () -> new Document(fieldName, new Document("$cond",
                Arrays.asList(condition, thenValue, elseValue)));
    }

    /**
     * Creates an $ifNull projection.
     *
     * @param fieldName        the field name
     * @param expression       the expression to check
     * @param replacementValue the value to use if expression is null
     * @return the projection
     */
    public static Bson ifNull(String fieldName, Object expression, Object replacementValue) {
        return () -> new Document(fieldName, new Document("$ifNull",
                Arrays.asList(expression, replacementValue)));
    }

    /**
     * Creates a $concat projection for string concatenation.
     *
     * @param fieldName   the field name
     * @param expressions the expressions to concatenate
     * @return the projection
     */
    public static Bson concat(String fieldName, Object... expressions) {
        return () -> new Document(fieldName, new Document("$concat", Arrays.asList(expressions)));
    }

    /**
     * Creates a $size projection for array length.
     *
     * @param fieldName    the output field name
     * @param arrayFieldName the array field to get size of
     * @return the projection
     */
    public static Bson arraySize(String fieldName, String arrayFieldName) {
        return () -> new Document(fieldName, new Document("$size",
                arrayFieldName.startsWith("$") ? arrayFieldName : "$" + arrayFieldName));
    }
}
