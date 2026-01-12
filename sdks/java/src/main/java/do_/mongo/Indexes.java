package do_.mongo;

import java.util.Arrays;
import java.util.List;

/**
 * Utility class for creating MongoDB index specifications.
 * <p>
 * This class provides static factory methods for building index key documents.
 * </p>
 *
 * <pre>{@code
 * import static do_.mongo.Indexes.*;
 *
 * // Single field ascending
 * Bson index = ascending("email");
 *
 * // Compound index
 * Bson index = compoundIndex(ascending("lastName"), descending("age"));
 *
 * // Text index
 * Bson index = text("content");
 *
 * // Geospatial index
 * Bson index = geo2dsphere("location");
 *
 * // Create with options
 * collection.createIndex(ascending("email"),
 *     new Document("unique", true).append("sparse", true));
 * }</pre>
 */
public final class Indexes {

    private Indexes() {
        // Utility class
    }

    /**
     * Creates an ascending index specification for a single field.
     *
     * @param fieldName the field name
     * @return the index specification
     */
    public static Bson ascending(String fieldName) {
        return () -> new Document(fieldName, 1);
    }

    /**
     * Creates an ascending index specification for multiple fields.
     *
     * @param fieldNames the field names
     * @return the index specification
     */
    public static Bson ascending(String... fieldNames) {
        return ascending(Arrays.asList(fieldNames));
    }

    /**
     * Creates an ascending index specification for multiple fields.
     *
     * @param fieldNames the field names
     * @return the index specification
     */
    public static Bson ascending(List<String> fieldNames) {
        return () -> {
            Document index = new Document();
            for (String field : fieldNames) {
                index.append(field, 1);
            }
            return index;
        };
    }

    /**
     * Creates a descending index specification for a single field.
     *
     * @param fieldName the field name
     * @return the index specification
     */
    public static Bson descending(String fieldName) {
        return () -> new Document(fieldName, -1);
    }

    /**
     * Creates a descending index specification for multiple fields.
     *
     * @param fieldNames the field names
     * @return the index specification
     */
    public static Bson descending(String... fieldNames) {
        return descending(Arrays.asList(fieldNames));
    }

    /**
     * Creates a descending index specification for multiple fields.
     *
     * @param fieldNames the field names
     * @return the index specification
     */
    public static Bson descending(List<String> fieldNames) {
        return () -> {
            Document index = new Document();
            for (String field : fieldNames) {
                index.append(field, -1);
            }
            return index;
        };
    }

    /**
     * Creates a compound index from multiple index specifications.
     *
     * @param indexes the index specifications
     * @return the compound index specification
     */
    public static Bson compoundIndex(Bson... indexes) {
        return compoundIndex(Arrays.asList(indexes));
    }

    /**
     * Creates a compound index from multiple index specifications.
     *
     * @param indexes the index specifications
     * @return the compound index specification
     */
    public static Bson compoundIndex(Iterable<Bson> indexes) {
        return () -> {
            Document combined = new Document();
            for (Bson index : indexes) {
                combined.putAll(index.toBsonDocument());
            }
            return combined;
        };
    }

    /**
     * Creates a text index specification.
     *
     * @param fieldName the field name
     * @return the index specification
     */
    public static Bson text(String fieldName) {
        return () -> new Document(fieldName, "text");
    }

    /**
     * Creates a text index specification for multiple fields.
     *
     * @param fieldNames the field names
     * @return the index specification
     */
    public static Bson text(String... fieldNames) {
        return text(Arrays.asList(fieldNames));
    }

    /**
     * Creates a text index specification for multiple fields.
     *
     * @param fieldNames the field names
     * @return the index specification
     */
    public static Bson text(List<String> fieldNames) {
        return () -> {
            Document index = new Document();
            for (String field : fieldNames) {
                index.append(field, "text");
            }
            return index;
        };
    }

    /**
     * Creates a wildcard text index for all string fields.
     *
     * @return the index specification
     */
    public static Bson textAll() {
        return () -> new Document("$**", "text");
    }

    /**
     * Creates a hashed index specification.
     *
     * @param fieldName the field name
     * @return the index specification
     */
    public static Bson hashed(String fieldName) {
        return () -> new Document(fieldName, "hashed");
    }

    /**
     * Creates a 2dsphere geospatial index.
     *
     * @param fieldName the field name
     * @return the index specification
     */
    public static Bson geo2dsphere(String fieldName) {
        return () -> new Document(fieldName, "2dsphere");
    }

    /**
     * Creates a 2dsphere geospatial index for multiple fields.
     *
     * @param fieldNames the field names
     * @return the index specification
     */
    public static Bson geo2dsphere(String... fieldNames) {
        return () -> {
            Document index = new Document();
            for (String field : fieldNames) {
                index.append(field, "2dsphere");
            }
            return index;
        };
    }

    /**
     * Creates a 2d geospatial index (for legacy coordinate pairs).
     *
     * @param fieldName the field name
     * @return the index specification
     */
    public static Bson geo2d(String fieldName) {
        return () -> new Document(fieldName, "2d");
    }

    /**
     * Creates a wildcard index.
     *
     * @return the index specification for all fields
     */
    public static Bson wildcard() {
        return () -> new Document("$**", 1);
    }

    /**
     * Creates a wildcard index for a specific path.
     *
     * @param fieldPath the field path (e.g., "metadata.$**")
     * @return the index specification
     */
    public static Bson wildcard(String fieldPath) {
        String path = fieldPath.endsWith("$**") ? fieldPath : fieldPath + ".$**";
        return () -> new Document(path, 1);
    }

    // ============================================================================
    // Index Options Helpers
    // ============================================================================

    /**
     * Creates index options for a unique index.
     *
     * @return the options document
     */
    public static Document uniqueOptions() {
        return new Document("unique", true);
    }

    /**
     * Creates index options for a sparse index.
     *
     * @return the options document
     */
    public static Document sparseOptions() {
        return new Document("sparse", true);
    }

    /**
     * Creates index options for a unique sparse index.
     *
     * @return the options document
     */
    public static Document uniqueSparseOptions() {
        return new Document("unique", true).append("sparse", true);
    }

    /**
     * Creates index options with a custom name.
     *
     * @param name the index name
     * @return the options document
     */
    public static Document namedOptions(String name) {
        return new Document("name", name);
    }

    /**
     * Creates index options for a TTL index.
     *
     * @param expireAfterSeconds the time in seconds after which documents expire
     * @return the options document
     */
    public static Document ttlOptions(long expireAfterSeconds) {
        return new Document("expireAfterSeconds", expireAfterSeconds);
    }

    /**
     * Creates index options for a partial index.
     *
     * @param filter the filter expression
     * @return the options document
     */
    public static Document partialOptions(Bson filter) {
        return new Document("partialFilterExpression", filter.toBsonDocument());
    }

    /**
     * Creates index options for a background build.
     *
     * @return the options document
     */
    public static Document backgroundOptions() {
        return new Document("background", true);
    }

    /**
     * Combines multiple index options.
     *
     * @param options the options to combine
     * @return the combined options document
     */
    public static Document combineOptions(Document... options) {
        Document combined = new Document();
        for (Document opt : options) {
            combined.putAll(opt);
        }
        return combined;
    }

    /**
     * Creates index options for a text index with weights.
     *
     * @param weights the field weights
     * @return the options document
     */
    public static Document textWeights(Document weights) {
        return new Document("weights", weights);
    }

    /**
     * Creates index options for a text index with language.
     *
     * @param language the default language
     * @return the options document
     */
    public static Document textLanguage(String language) {
        return new Document("default_language", language);
    }

    /**
     * Creates index options for a text index with a language override field.
     *
     * @param field the field that specifies document language
     * @return the options document
     */
    public static Document textLanguageOverride(String field) {
        return new Document("language_override", field);
    }

    /**
     * Creates index options for collation.
     *
     * @param collation the collation document
     * @return the options document
     */
    public static Document collationOptions(Document collation) {
        return new Document("collation", collation);
    }
}
