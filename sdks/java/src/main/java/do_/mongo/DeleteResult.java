package do_.mongo;

import java.util.Map;

/**
 * Result of a delete operation.
 */
public class DeleteResult {

    private final boolean acknowledged;
    private final long deletedCount;

    /**
     * Creates a DeleteResult.
     *
     * @param acknowledged whether the write was acknowledged
     * @param deletedCount the number of deleted documents
     */
    public DeleteResult(boolean acknowledged, long deletedCount) {
        this.acknowledged = acknowledged;
        this.deletedCount = deletedCount;
    }

    /**
     * Creates a DeleteResult from a response document.
     *
     * @param response the response document
     * @return the result
     */
    @SuppressWarnings("unchecked")
    public static DeleteResult fromDocument(Object response) {
        if (response instanceof Document) {
            Document doc = (Document) response;
            return new DeleteResult(
                    doc.getBoolean("acknowledged", true),
                    doc.getLong("deletedCount", 0)
            );
        } else if (response instanceof Map) {
            Map<String, Object> map = (Map<String, Object>) response;
            return new DeleteResult(
                    (Boolean) map.getOrDefault("acknowledged", true),
                    ((Number) map.getOrDefault("deletedCount", 0L)).longValue()
            );
        }
        return new DeleteResult(true, 0);
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
     * Gets the number of deleted documents.
     *
     * @return the deleted count
     */
    public long getDeletedCount() {
        return deletedCount;
    }

    @Override
    public String toString() {
        return "DeleteResult{acknowledged=" + acknowledged + ", deletedCount=" + deletedCount + "}";
    }
}
