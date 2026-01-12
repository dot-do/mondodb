package do_.mongo;

import java.util.HashMap;
import java.util.Map;

/**
 * Result of an insertMany operation.
 */
public class InsertManyResult {

    private final boolean acknowledged;
    private final Map<Integer, Object> insertedIds;

    /**
     * Creates an InsertManyResult.
     *
     * @param acknowledged whether the write was acknowledged
     * @param insertedIds  the IDs of the inserted documents
     */
    public InsertManyResult(boolean acknowledged, Map<Integer, Object> insertedIds) {
        this.acknowledged = acknowledged;
        this.insertedIds = insertedIds != null ? insertedIds : new HashMap<>();
    }

    /**
     * Creates an InsertManyResult from a response document.
     *
     * @param response the response document
     * @return the result
     */
    @SuppressWarnings("unchecked")
    public static InsertManyResult fromDocument(Object response) {
        if (response instanceof Document) {
            Document doc = (Document) response;
            Map<Integer, Object> ids = new HashMap<>();
            Object insertedIds = doc.get("insertedIds");
            if (insertedIds instanceof Map) {
                Map<?, ?> idsMap = (Map<?, ?>) insertedIds;
                for (Map.Entry<?, ?> entry : idsMap.entrySet()) {
                    int index = entry.getKey() instanceof Number
                            ? ((Number) entry.getKey()).intValue()
                            : Integer.parseInt(entry.getKey().toString());
                    ids.put(index, entry.getValue());
                }
            }
            return new InsertManyResult(doc.getBoolean("acknowledged", true), ids);
        } else if (response instanceof Map) {
            Map<String, Object> map = (Map<String, Object>) response;
            Map<Integer, Object> ids = new HashMap<>();
            Object insertedIds = map.get("insertedIds");
            if (insertedIds instanceof Map) {
                Map<?, ?> idsMap = (Map<?, ?>) insertedIds;
                for (Map.Entry<?, ?> entry : idsMap.entrySet()) {
                    int index = entry.getKey() instanceof Number
                            ? ((Number) entry.getKey()).intValue()
                            : Integer.parseInt(entry.getKey().toString());
                    ids.put(index, entry.getValue());
                }
            }
            return new InsertManyResult((Boolean) map.getOrDefault("acknowledged", true), ids);
        }
        return new InsertManyResult(true, new HashMap<>());
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
     * Gets the IDs of the inserted documents.
     *
     * @return a map of index to inserted ID
     */
    public Map<Integer, Object> getInsertedIds() {
        return insertedIds;
    }

    /**
     * Gets the count of inserted documents.
     *
     * @return the count
     */
    public int getInsertedCount() {
        return insertedIds.size();
    }

    @Override
    public String toString() {
        return "InsertManyResult{acknowledged=" + acknowledged + ", insertedCount=" + getInsertedCount() + "}";
    }
}
