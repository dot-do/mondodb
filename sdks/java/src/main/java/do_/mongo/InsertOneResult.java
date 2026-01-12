package do_.mongo;

/**
 * Result of an insertOne operation.
 */
public class InsertOneResult {

    private final boolean acknowledged;
    private final Object insertedId;

    /**
     * Creates an InsertOneResult.
     *
     * @param acknowledged whether the write was acknowledged
     * @param insertedId   the ID of the inserted document
     */
    public InsertOneResult(boolean acknowledged, Object insertedId) {
        this.acknowledged = acknowledged;
        this.insertedId = insertedId;
    }

    /**
     * Creates an InsertOneResult from a response document.
     *
     * @param response the response document
     * @return the result
     */
    @SuppressWarnings("unchecked")
    public static InsertOneResult fromDocument(Object response) {
        if (response instanceof Document) {
            Document doc = (Document) response;
            return new InsertOneResult(
                    doc.getBoolean("acknowledged", true),
                    doc.get("insertedId")
            );
        } else if (response instanceof java.util.Map) {
            java.util.Map<String, Object> map = (java.util.Map<String, Object>) response;
            return new InsertOneResult(
                    (Boolean) map.getOrDefault("acknowledged", true),
                    map.get("insertedId")
            );
        }
        return new InsertOneResult(true, null);
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
     * Gets the ID of the inserted document.
     *
     * @return the inserted ID
     */
    public Object getInsertedId() {
        return insertedId;
    }

    @Override
    public String toString() {
        return "InsertOneResult{acknowledged=" + acknowledged + ", insertedId=" + insertedId + "}";
    }
}
