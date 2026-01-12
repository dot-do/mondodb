package do_.mongo;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;

import java.lang.reflect.Type;
import java.time.Instant;
import java.util.*;

/**
 * BSON Document wrapper - MongoDB-compatible document representation.
 * <p>
 * Documents are the basic unit of data in MongoDB. This class provides a
 * Map-like interface for creating and manipulating documents.
 * </p>
 *
 * <pre>{@code
 * Document doc = new Document("name", "John")
 *     .append("age", 30)
 *     .append("email", "john@example.com");
 *
 * String name = doc.getString("name");
 * int age = doc.getInteger("age");
 * }</pre>
 */
public class Document implements Map<String, Object>, Bson {

    private static final Gson GSON = new GsonBuilder()
            .serializeNulls()
            .create();

    private final LinkedHashMap<String, Object> data;

    /**
     * Creates an empty Document.
     */
    public Document() {
        this.data = new LinkedHashMap<>();
    }

    /**
     * Creates a Document with a single key-value pair.
     *
     * @param key   the key
     * @param value the value
     */
    public Document(String key, Object value) {
        this.data = new LinkedHashMap<>();
        this.data.put(key, value);
    }

    /**
     * Creates a Document from an existing Map.
     *
     * @param map the map to copy from
     */
    public Document(Map<String, Object> map) {
        this.data = new LinkedHashMap<>(map);
    }

    /**
     * Appends a key-value pair to the document and returns this for chaining.
     *
     * @param key   the key
     * @param value the value
     * @return this Document for method chaining
     */
    public Document append(String key, Object value) {
        data.put(key, value);
        return this;
    }

    /**
     * Gets the document's ID as a String.
     *
     * @return the _id field as String, or null if not present
     */
    public String getId() {
        Object id = get("_id");
        if (id == null) return null;
        if (id instanceof ObjectId) return ((ObjectId) id).toHexString();
        return id.toString();
    }

    /**
     * Gets a value as String.
     *
     * @param key the key
     * @return the value as String, or null if not present
     */
    public String getString(String key) {
        Object value = get(key);
        return value == null ? null : value.toString();
    }

    /**
     * Gets a value as String with a default.
     *
     * @param key          the key
     * @param defaultValue the default value if key not found
     * @return the value as String, or defaultValue if not present
     */
    public String getString(String key, String defaultValue) {
        String value = getString(key);
        return value != null ? value : defaultValue;
    }

    /**
     * Gets a value as Integer.
     *
     * @param key the key
     * @return the value as Integer, or null if not present
     */
    public Integer getInteger(String key) {
        Object value = get(key);
        if (value == null) return null;
        if (value instanceof Number) return ((Number) value).intValue();
        return Integer.parseInt(value.toString());
    }

    /**
     * Gets a value as Integer with a default.
     *
     * @param key          the key
     * @param defaultValue the default value if key not found
     * @return the value as Integer, or defaultValue if not present
     */
    public int getInteger(String key, int defaultValue) {
        Integer value = getInteger(key);
        return value != null ? value : defaultValue;
    }

    /**
     * Gets a value as Long.
     *
     * @param key the key
     * @return the value as Long, or null if not present
     */
    public Long getLong(String key) {
        Object value = get(key);
        if (value == null) return null;
        if (value instanceof Number) return ((Number) value).longValue();
        return Long.parseLong(value.toString());
    }

    /**
     * Gets a value as Long with a default.
     *
     * @param key          the key
     * @param defaultValue the default value if key not found
     * @return the value as Long, or defaultValue if not present
     */
    public long getLong(String key, long defaultValue) {
        Long value = getLong(key);
        return value != null ? value : defaultValue;
    }

    /**
     * Gets a value as Double.
     *
     * @param key the key
     * @return the value as Double, or null if not present
     */
    public Double getDouble(String key) {
        Object value = get(key);
        if (value == null) return null;
        if (value instanceof Number) return ((Number) value).doubleValue();
        return Double.parseDouble(value.toString());
    }

    /**
     * Gets a value as Double with a default.
     *
     * @param key          the key
     * @param defaultValue the default value if key not found
     * @return the value as Double, or defaultValue if not present
     */
    public double getDouble(String key, double defaultValue) {
        Double value = getDouble(key);
        return value != null ? value : defaultValue;
    }

    /**
     * Gets a value as Boolean.
     *
     * @param key the key
     * @return the value as Boolean, or null if not present
     */
    public Boolean getBoolean(String key) {
        Object value = get(key);
        if (value == null) return null;
        if (value instanceof Boolean) return (Boolean) value;
        return Boolean.parseBoolean(value.toString());
    }

    /**
     * Gets a value as Boolean with a default.
     *
     * @param key          the key
     * @param defaultValue the default value if key not found
     * @return the value as Boolean, or defaultValue if not present
     */
    public boolean getBoolean(String key, boolean defaultValue) {
        Boolean value = getBoolean(key);
        return value != null ? value : defaultValue;
    }

    /**
     * Gets a value as Date/Instant.
     *
     * @param key the key
     * @return the value as Instant, or null if not present
     */
    public Instant getInstant(String key) {
        Object value = get(key);
        if (value == null) return null;
        if (value instanceof Instant) return (Instant) value;
        if (value instanceof Date) return ((Date) value).toInstant();
        if (value instanceof Number) return Instant.ofEpochMilli(((Number) value).longValue());
        return Instant.parse(value.toString());
    }

    /**
     * Gets a value as a nested Document.
     *
     * @param key the key
     * @return the value as Document, or null if not present
     */
    @SuppressWarnings("unchecked")
    public Document getDocument(String key) {
        Object value = get(key);
        if (value == null) return null;
        if (value instanceof Document) return (Document) value;
        if (value instanceof Map) return new Document((Map<String, Object>) value);
        return null;
    }

    /**
     * Gets a value as an ObjectId.
     *
     * @param key the key
     * @return the value as ObjectId, or null if not present
     */
    public ObjectId getObjectId(String key) {
        Object value = get(key);
        if (value == null) return null;
        if (value instanceof ObjectId) return (ObjectId) value;
        if (value instanceof String) return new ObjectId((String) value);
        return null;
    }

    /**
     * Gets a value as a List.
     *
     * @param key the key
     * @param <T> the element type
     * @return the value as List, or null if not present
     */
    @SuppressWarnings("unchecked")
    public <T> List<T> getList(String key, Class<T> elementType) {
        Object value = get(key);
        if (value == null) return null;
        if (value instanceof List) {
            return (List<T>) value;
        }
        return null;
    }

    /**
     * Gets a typed value.
     *
     * @param key  the key
     * @param type the expected type
     * @param <T>  the type parameter
     * @return the value cast to the type, or null if not present
     */
    @SuppressWarnings("unchecked")
    public <T> T get(String key, Class<T> type) {
        Object value = get(key);
        if (value == null) return null;
        if (type.isInstance(value)) return (T) value;

        // Handle common type conversions
        if (type == String.class) return (T) getString(key);
        if (type == Integer.class) return (T) getInteger(key);
        if (type == Long.class) return (T) getLong(key);
        if (type == Double.class) return (T) getDouble(key);
        if (type == Boolean.class) return (T) getBoolean(key);

        return (T) value;
    }

    /**
     * Checks if the document contains a key.
     *
     * @param key the key to check
     * @return true if the key exists
     */
    public boolean containsKey(String key) {
        return data.containsKey(key);
    }

    /**
     * Converts the document to a JSON string.
     *
     * @return JSON representation of the document
     */
    public String toJson() {
        return GSON.toJson(data);
    }

    /**
     * Parses a JSON string into a Document.
     *
     * @param json the JSON string
     * @return a new Document
     */
    public static Document parse(String json) {
        Type type = new TypeToken<LinkedHashMap<String, Object>>() {}.getType();
        LinkedHashMap<String, Object> map = GSON.fromJson(json, type);
        return new Document(map);
    }

    /**
     * Converts the document to a plain Map.
     *
     * @return a copy of the internal map
     */
    public Map<String, Object> toMap() {
        return new LinkedHashMap<>(data);
    }

    /**
     * Implements the Bson interface - returns this document.
     *
     * @return this document
     */
    @Override
    public Document toBsonDocument() {
        return this;
    }

    // Map interface implementation

    @Override
    public int size() {
        return data.size();
    }

    @Override
    public boolean isEmpty() {
        return data.isEmpty();
    }

    @Override
    public boolean containsKey(Object key) {
        return data.containsKey(key);
    }

    @Override
    public boolean containsValue(Object value) {
        return data.containsValue(value);
    }

    @Override
    public Object get(Object key) {
        return data.get(key);
    }

    @Override
    public Object put(String key, Object value) {
        return data.put(key, value);
    }

    @Override
    public Object remove(Object key) {
        return data.remove(key);
    }

    @Override
    public void putAll(Map<? extends String, ?> m) {
        data.putAll(m);
    }

    @Override
    public void clear() {
        data.clear();
    }

    @Override
    public Set<String> keySet() {
        return data.keySet();
    }

    @Override
    public Collection<Object> values() {
        return data.values();
    }

    @Override
    public Set<Entry<String, Object>> entrySet() {
        return data.entrySet();
    }

    @Override
    public String toString() {
        return toJson();
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Document document = (Document) o;
        return Objects.equals(data, document.data);
    }

    @Override
    public int hashCode() {
        return Objects.hash(data);
    }
}
