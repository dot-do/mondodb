package do_.mongo;

import java.util.Map;

/**
 * Result of an update operation.
 */
public class UpdateResult {

    private final boolean acknowledged;
    private final long matchedCount;
    private final long modifiedCount;
    private final Object upsertedId;

    /**
     * Creates an UpdateResult.
     *
     * @param acknowledged  whether the write was acknowledged
     * @param matchedCount  the number of matched documents
     * @param modifiedCount the number of modified documents
     * @param upsertedId    the ID of the upserted document (if any)
     */
    public UpdateResult(boolean acknowledged, long matchedCount, long modifiedCount, Object upsertedId) {
        this.acknowledged = acknowledged;
        this.matchedCount = matchedCount;
        this.modifiedCount = modifiedCount;
        this.upsertedId = upsertedId;
    }

    /**
     * Creates an UpdateResult from a response document.
     *
     * @param response the response document
     * @return the result
     */
    @SuppressWarnings("unchecked")
    public static UpdateResult fromDocument(Object response) {
        if (response instanceof Document) {
            Document doc = (Document) response;
            return new UpdateResult(
                    doc.getBoolean("acknowledged", true),
                    doc.getLong("matchedCount", 0),
                    doc.getLong("modifiedCount", 0),
                    doc.get("upsertedId")
            );
        } else if (response instanceof Map) {
            Map<String, Object> map = (Map<String, Object>) response;
            return new UpdateResult(
                    (Boolean) map.getOrDefault("acknowledged", true),
                    ((Number) map.getOrDefault("matchedCount", 0L)).longValue(),
                    ((Number) map.getOrDefault("modifiedCount", 0L)).longValue(),
                    map.get("upsertedId")
            );
        }
        return new UpdateResult(true, 0, 0, null);
    }

    /**
     * Whether the write was acknowledged.
     *
     * @return true if acknowledged
     */
    public boolean wasAcknowledged() {
        return acknowledged;
    }

    /**
     * Gets the number of matched documents.
     *
     * @return the matched count
     */
    public long getMatchedCount() {
        return matchedCount;
    }

    /**
     * Gets the number of modified documents.
     *
     * @return the modified count
     */
    public long getModifiedCount() {
        return modifiedCount;
    }

    /**
     * Gets the upserted ID (if any).
     *
     * @return the upserted ID, or null
     */
    public Object getUpsertedId() {
        return upsertedId;
    }

    /**
     * Checks if an upsert occurred.
     *
     * @return true if an upsert occurred
     */
    public boolean wasUpserted() {
        return upsertedId != null;
    }

    @Override
    public String toString() {
        return "UpdateResult{acknowledged=" + acknowledged +
                ", matchedCount=" + matchedCount +
                ", modifiedCount=" + modifiedCount +
                ", upsertedId=" + upsertedId + "}";
    }
}
