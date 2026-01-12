package do_.mongo;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;

/**
 * Mock RPC transport for testing and development.
 * <p>
 * This transport simulates a MongoDB backend in memory, useful for:
 * </p>
 * <ul>
 *   <li>Unit testing without a real database</li>
 *   <li>Local development without network connectivity</li>
 *   <li>Prototyping and experimentation</li>
 * </ul>
 *
 * <pre>{@code
 * MockRpcTransport transport = new MockRpcTransport();
 * MongoClient client = MongoClient.create("mongodb://localhost");
 * client.setTransport(transport);
 *
 * // Operations work in memory
 * var db = client.getDatabase("test");
 * var coll = db.getCollection("users");
 * coll.insertOne(new Document("name", "Alice"));
 * }</pre>
 */
public class MockRpcTransport implements RpcTransport {

    private final Map<String, Map<String, List<Document>>> databases;
    private final Map<String, Function<Object[], Object>> handlers;
    private volatile boolean closed = false;

    /**
     * Creates a new MockRpcTransport.
     */
    public MockRpcTransport() {
        this.databases = new ConcurrentHashMap<>();
        this.handlers = new HashMap<>();
        registerDefaultHandlers();
    }

    @Override
    public Object call(String method, Object... args) {
        if (closed) {
            throw new MongoConnectionException("Transport is closed");
        }

        Function<Object[], Object> handler = handlers.get(method);
        if (handler != null) {
            return handler.apply(args);
        }

        // Default behavior: return success
        return new Document("ok", 1);
    }

    @Override
    public CompletableFuture<Object> callAsync(String method, Object... args) {
        return CompletableFuture.supplyAsync(() -> call(method, args));
    }

    @Override
    public void close() {
        closed = true;
    }

    @Override
    public boolean isClosed() {
        return closed;
    }

    /**
     * Registers a custom handler for a method.
     *
     * @param method  the method name
     * @param handler the handler function
     */
    public void registerHandler(String method, Function<Object[], Object> handler) {
        handlers.put(method, handler);
    }

    /**
     * Clears all data.
     */
    public void clear() {
        databases.clear();
    }

    /**
     * Gets the in-memory database.
     *
     * @param dbName the database name
     * @return the database map
     */
    public Map<String, List<Document>> getDatabase(String dbName) {
        return databases.computeIfAbsent(dbName, k -> new ConcurrentHashMap<>());
    }

    /**
     * Gets a collection from the in-memory database.
     *
     * @param dbName         the database name
     * @param collectionName the collection name
     * @return the collection list
     */
    public List<Document> getCollection(String dbName, String collectionName) {
        return getDatabase(dbName).computeIfAbsent(collectionName, k -> new ArrayList<>());
    }

    /**
     * Registers default method handlers.
     */
    private void registerDefaultHandlers() {
        // Connection
        handlers.put("connect", args -> new Document("ok", 1));
        handlers.put("ping", args -> new Document("ok", 1));

        // Database operations
        handlers.put("listDatabases", args -> {
            List<Document> dbs = new ArrayList<>();
            for (String name : databases.keySet()) {
                dbs.add(new Document("name", name).append("empty", databases.get(name).isEmpty()));
            }
            return new Document("databases", dbs);
        });

        handlers.put("dropDatabase", args -> {
            String dbName = (String) args[0];
            databases.remove(dbName);
            return new Document("ok", 1).append("dropped", dbName);
        });

        // Collection operations
        handlers.put("listCollections", args -> {
            String dbName = (String) args[0];
            List<Document> collections = new ArrayList<>();
            Map<String, List<Document>> db = databases.get(dbName);
            if (db != null) {
                for (String name : db.keySet()) {
                    collections.add(new Document("name", name).append("type", "collection"));
                }
            }
            return collections;
        });

        handlers.put("createCollection", args -> {
            String dbName = (String) args[0];
            String collName = (String) args[1];
            getCollection(dbName, collName); // Creates if not exists
            return new Document("ok", 1);
        });

        handlers.put("dropCollection", args -> {
            String dbName = (String) args[0];
            String collName = (String) args[1];
            Map<String, List<Document>> db = databases.get(dbName);
            if (db != null) {
                db.remove(collName);
            }
            return new Document("ok", 1);
        });

        // CRUD operations
        handlers.put("insertOne", args -> {
            String dbName = (String) args[0];
            String collName = (String) args[1];
            Document doc = toDocument(args[2]);

            // Generate _id if not present
            if (!doc.containsKey("_id")) {
                doc.put("_id", ObjectId.get());
            }

            getCollection(dbName, collName).add(doc);
            return new Document("insertedId", doc.get("_id")).append("acknowledged", true);
        });

        handlers.put("insertMany", args -> {
            String dbName = (String) args[0];
            String collName = (String) args[1];
            @SuppressWarnings("unchecked")
            List<Object> docs = (List<Object>) args[2];

            List<Document> collection = getCollection(dbName, collName);
            Map<Integer, Object> insertedIds = new HashMap<>();
            int index = 0;

            for (Object item : docs) {
                Document doc = toDocument(item);
                if (!doc.containsKey("_id")) {
                    doc.put("_id", ObjectId.get());
                }
                collection.add(doc);
                insertedIds.put(index++, doc.get("_id"));
            }

            return new Document("insertedIds", insertedIds).append("acknowledged", true);
        });

        handlers.put("find", args -> {
            String dbName = (String) args[0];
            String collName = (String) args[1];
            Document filter = toDocument(args[2]);
            Document options = args.length > 3 ? toDocument(args[3]) : new Document();

            List<Document> collection = getCollection(dbName, collName);
            List<Document> results = new ArrayList<>();

            for (Document doc : collection) {
                if (matchesFilter(doc, filter)) {
                    results.add(doc);
                }
            }

            // Apply skip
            int skip = options.getInteger("skip", 0);
            if (skip > 0 && skip < results.size()) {
                results = results.subList(skip, results.size());
            }

            // Apply limit
            int limit = options.getInteger("limit", 0);
            if (limit > 0 && limit < results.size()) {
                results = results.subList(0, limit);
            }

            return results;
        });

        handlers.put("findOne", args -> {
            String dbName = (String) args[0];
            String collName = (String) args[1];
            Document filter = toDocument(args[2]);

            List<Document> collection = getCollection(dbName, collName);
            for (Document doc : collection) {
                if (matchesFilter(doc, filter)) {
                    return doc;
                }
            }
            return null;
        });

        handlers.put("updateOne", args -> {
            String dbName = (String) args[0];
            String collName = (String) args[1];
            Document filter = toDocument(args[2]);
            Document update = toDocument(args[3]);
            Document options = args.length > 4 ? toDocument(args[4]) : new Document();

            List<Document> collection = getCollection(dbName, collName);
            long matchedCount = 0;
            long modifiedCount = 0;
            Object upsertedId = null;

            for (Document doc : collection) {
                if (matchesFilter(doc, filter)) {
                    matchedCount++;
                    if (applyUpdate(doc, update)) {
                        modifiedCount++;
                    }
                    break;
                }
            }

            // Handle upsert
            if (matchedCount == 0 && options.getBoolean("upsert", false)) {
                Document newDoc = new Document();
                applyFilterAsDocument(newDoc, filter);
                applyUpdate(newDoc, update);
                if (!newDoc.containsKey("_id")) {
                    newDoc.put("_id", ObjectId.get());
                }
                collection.add(newDoc);
                upsertedId = newDoc.get("_id");
            }

            Document result = new Document("matchedCount", matchedCount)
                    .append("modifiedCount", modifiedCount)
                    .append("acknowledged", true);
            if (upsertedId != null) {
                result.append("upsertedId", upsertedId);
            }
            return result;
        });

        handlers.put("updateMany", args -> {
            String dbName = (String) args[0];
            String collName = (String) args[1];
            Document filter = toDocument(args[2]);
            Document update = toDocument(args[3]);

            List<Document> collection = getCollection(dbName, collName);
            long matchedCount = 0;
            long modifiedCount = 0;

            for (Document doc : collection) {
                if (matchesFilter(doc, filter)) {
                    matchedCount++;
                    if (applyUpdate(doc, update)) {
                        modifiedCount++;
                    }
                }
            }

            return new Document("matchedCount", matchedCount)
                    .append("modifiedCount", modifiedCount)
                    .append("acknowledged", true);
        });

        handlers.put("deleteOne", args -> {
            String dbName = (String) args[0];
            String collName = (String) args[1];
            Document filter = toDocument(args[2]);

            List<Document> collection = getCollection(dbName, collName);
            long deletedCount = 0;

            for (int i = 0; i < collection.size(); i++) {
                if (matchesFilter(collection.get(i), filter)) {
                    collection.remove(i);
                    deletedCount = 1;
                    break;
                }
            }

            return new Document("deletedCount", deletedCount).append("acknowledged", true);
        });

        handlers.put("deleteMany", args -> {
            String dbName = (String) args[0];
            String collName = (String) args[1];
            Document filter = toDocument(args[2]);

            List<Document> collection = getCollection(dbName, collName);
            long deletedCount = 0;

            collection.removeIf(doc -> {
                if (matchesFilter(doc, filter)) {
                    return true;
                }
                return false;
            });

            return new Document("deletedCount", deletedCount).append("acknowledged", true);
        });

        handlers.put("countDocuments", args -> {
            String dbName = (String) args[0];
            String collName = (String) args[1];
            Document filter = toDocument(args[2]);

            List<Document> collection = getCollection(dbName, collName);
            long count = 0;

            for (Document doc : collection) {
                if (matchesFilter(doc, filter)) {
                    count++;
                }
            }

            return count;
        });

        handlers.put("estimatedDocumentCount", args -> {
            String dbName = (String) args[0];
            String collName = (String) args[1];
            return (long) getCollection(dbName, collName).size();
        });

        handlers.put("aggregate", args -> {
            String dbName = (String) args[0];
            String collName = (String) args[1];
            @SuppressWarnings("unchecked")
            List<Object> pipeline = (List<Object>) args[2];

            List<Document> collection = getCollection(dbName, collName);
            List<Document> results = new ArrayList<>(collection);

            // Very basic pipeline execution
            for (Object stageObj : pipeline) {
                Document stage = toDocument(stageObj);
                if (stage.containsKey("$match")) {
                    Document filter = stage.get("$match", Document.class);
                    results.removeIf(doc -> !matchesFilter(doc, filter));
                } else if (stage.containsKey("$limit")) {
                    int limit = ((Number) stage.get("$limit")).intValue();
                    if (limit < results.size()) {
                        results = new ArrayList<>(results.subList(0, limit));
                    }
                } else if (stage.containsKey("$skip")) {
                    int skip = ((Number) stage.get("$skip")).intValue();
                    if (skip < results.size()) {
                        results = new ArrayList<>(results.subList(skip, results.size()));
                    }
                }
            }

            return results;
        });

        handlers.put("distinct", args -> {
            String dbName = (String) args[0];
            String collName = (String) args[1];
            String fieldName = (String) args[2];
            Document filter = args.length > 3 ? toDocument(args[3]) : new Document();

            List<Document> collection = getCollection(dbName, collName);
            List<Object> values = new ArrayList<>();

            for (Document doc : collection) {
                if (matchesFilter(doc, filter)) {
                    Object value = doc.get(fieldName);
                    if (value != null && !values.contains(value)) {
                        values.add(value);
                    }
                }
            }

            return values;
        });

        // Index operations (no-op in mock)
        handlers.put("createIndex", args -> "mock_index");
        handlers.put("dropIndex", args -> new Document("ok", 1));
        handlers.put("dropIndexes", args -> new Document("ok", 1));
        handlers.put("listIndexes", args -> {
            List<Document> indexes = new ArrayList<>();
            indexes.add(new Document("name", "_id_").append("key", new Document("_id", 1)));
            return indexes;
        });

        // Server status
        handlers.put("serverStatus", args -> new Document("ok", 1)
                .append("version", "0.1.0-mock")
                .append("uptime", 1000));

        // Run command
        handlers.put("runCommand", args -> {
            String dbName = (String) args[0];
            Document cmd = toDocument(args[1]);

            if (cmd.containsKey("dbStats")) {
                Map<String, List<Document>> db = databases.get(dbName);
                long objects = 0;
                if (db != null) {
                    for (List<Document> coll : db.values()) {
                        objects += coll.size();
                    }
                }
                return new Document("ok", 1)
                        .append("db", dbName)
                        .append("collections", db != null ? db.size() : 0)
                        .append("objects", objects);
            }

            return new Document("ok", 1);
        });
    }

    /**
     * Converts an object to a Document.
     */
    @SuppressWarnings("unchecked")
    private Document toDocument(Object obj) {
        if (obj == null) {
            return new Document();
        }
        if (obj instanceof Document) {
            return (Document) obj;
        }
        if (obj instanceof Map) {
            return new Document((Map<String, Object>) obj);
        }
        return new Document();
    }

    /**
     * Checks if a document matches a filter.
     */
    @SuppressWarnings("unchecked")
    private boolean matchesFilter(Document doc, Document filter) {
        if (filter == null || filter.isEmpty()) {
            return true;
        }

        for (Map.Entry<String, Object> entry : filter.entrySet()) {
            String key = entry.getKey();
            Object filterValue = entry.getValue();

            // Handle logical operators
            if (key.equals("$and")) {
                List<Document> conditions = (List<Document>) filterValue;
                for (Object condition : conditions) {
                    if (!matchesFilter(doc, toDocument(condition))) {
                        return false;
                    }
                }
                continue;
            }

            if (key.equals("$or")) {
                List<Document> conditions = (List<Document>) filterValue;
                boolean anyMatch = false;
                for (Object condition : conditions) {
                    if (matchesFilter(doc, toDocument(condition))) {
                        anyMatch = true;
                        break;
                    }
                }
                if (!anyMatch) return false;
                continue;
            }

            if (key.equals("$nor")) {
                List<Document> conditions = (List<Document>) filterValue;
                for (Object condition : conditions) {
                    if (matchesFilter(doc, toDocument(condition))) {
                        return false;
                    }
                }
                continue;
            }

            // Regular field comparison
            Object docValue = doc.get(key);

            // Handle comparison operators
            if (filterValue instanceof Document) {
                Document opDoc = (Document) filterValue;
                for (Map.Entry<String, Object> opEntry : opDoc.entrySet()) {
                    String op = opEntry.getKey();
                    Object opValue = opEntry.getValue();

                    switch (op) {
                        case "$eq":
                            if (!equals(docValue, opValue)) return false;
                            break;
                        case "$ne":
                            if (equals(docValue, opValue)) return false;
                            break;
                        case "$gt":
                            if (compare(docValue, opValue) <= 0) return false;
                            break;
                        case "$gte":
                            if (compare(docValue, opValue) < 0) return false;
                            break;
                        case "$lt":
                            if (compare(docValue, opValue) >= 0) return false;
                            break;
                        case "$lte":
                            if (compare(docValue, opValue) > 0) return false;
                            break;
                        case "$in":
                            List<?> inValues = (List<?>) opValue;
                            if (!inValues.contains(docValue)) return false;
                            break;
                        case "$nin":
                            List<?> ninValues = (List<?>) opValue;
                            if (ninValues.contains(docValue)) return false;
                            break;
                        case "$exists":
                            boolean exists = doc.containsKey(key);
                            boolean shouldExist = (Boolean) opValue;
                            if (exists != shouldExist) return false;
                            break;
                        case "$regex":
                            String pattern = (String) opValue;
                            String options = opDoc.getString("$options");
                            int flags = 0;
                            if (options != null) {
                                if (options.contains("i")) flags |= java.util.regex.Pattern.CASE_INSENSITIVE;
                                if (options.contains("m")) flags |= java.util.regex.Pattern.MULTILINE;
                            }
                            if (docValue == null || !java.util.regex.Pattern.compile(pattern, flags)
                                    .matcher(docValue.toString()).find()) {
                                return false;
                            }
                            break;
                        case "$size":
                            if (!(docValue instanceof List) ||
                                ((List<?>) docValue).size() != ((Number) opValue).intValue()) {
                                return false;
                            }
                            break;
                        case "$all":
                            if (!(docValue instanceof List)) return false;
                            List<?> docList = (List<?>) docValue;
                            List<?> allValues = (List<?>) opValue;
                            if (!docList.containsAll(allValues)) return false;
                            break;
                    }
                }
            } else {
                // Simple equality
                if (!equals(docValue, filterValue)) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Applies an update to a document.
     */
    @SuppressWarnings("unchecked")
    private boolean applyUpdate(Document doc, Document update) {
        boolean modified = false;

        for (Map.Entry<String, Object> entry : update.entrySet()) {
            String op = entry.getKey();
            Document fields = (Document) entry.getValue();

            switch (op) {
                case "$set":
                    for (Map.Entry<String, Object> field : fields.entrySet()) {
                        Object oldValue = doc.get(field.getKey());
                        if (!equals(oldValue, field.getValue())) {
                            doc.put(field.getKey(), field.getValue());
                            modified = true;
                        }
                    }
                    break;
                case "$unset":
                    for (String field : fields.keySet()) {
                        if (doc.containsKey(field)) {
                            doc.remove(field);
                            modified = true;
                        }
                    }
                    break;
                case "$inc":
                    for (Map.Entry<String, Object> field : fields.entrySet()) {
                        Number current = doc.get(field.getKey()) instanceof Number
                                ? (Number) doc.get(field.getKey()) : 0;
                        Number increment = (Number) field.getValue();
                        if (current instanceof Double || increment instanceof Double) {
                            doc.put(field.getKey(), current.doubleValue() + increment.doubleValue());
                        } else {
                            doc.put(field.getKey(), current.longValue() + increment.longValue());
                        }
                        modified = true;
                    }
                    break;
                case "$mul":
                    for (Map.Entry<String, Object> field : fields.entrySet()) {
                        Number current = doc.get(field.getKey()) instanceof Number
                                ? (Number) doc.get(field.getKey()) : 0;
                        Number multiplier = (Number) field.getValue();
                        if (current instanceof Double || multiplier instanceof Double) {
                            doc.put(field.getKey(), current.doubleValue() * multiplier.doubleValue());
                        } else {
                            doc.put(field.getKey(), current.longValue() * multiplier.longValue());
                        }
                        modified = true;
                    }
                    break;
                case "$min":
                    for (Map.Entry<String, Object> field : fields.entrySet()) {
                        Object current = doc.get(field.getKey());
                        Object newValue = field.getValue();
                        if (current == null || compare(newValue, current) < 0) {
                            doc.put(field.getKey(), newValue);
                            modified = true;
                        }
                    }
                    break;
                case "$max":
                    for (Map.Entry<String, Object> field : fields.entrySet()) {
                        Object current = doc.get(field.getKey());
                        Object newValue = field.getValue();
                        if (current == null || compare(newValue, current) > 0) {
                            doc.put(field.getKey(), newValue);
                            modified = true;
                        }
                    }
                    break;
                case "$rename":
                    for (Map.Entry<String, Object> field : fields.entrySet()) {
                        if (doc.containsKey(field.getKey())) {
                            Object value = doc.remove(field.getKey());
                            doc.put((String) field.getValue(), value);
                            modified = true;
                        }
                    }
                    break;
                case "$push":
                    for (Map.Entry<String, Object> field : fields.entrySet()) {
                        List<Object> arr = (List<Object>) doc.computeIfAbsent(field.getKey(), k -> new ArrayList<>());
                        arr.add(field.getValue());
                        modified = true;
                    }
                    break;
                case "$pull":
                    for (Map.Entry<String, Object> field : fields.entrySet()) {
                        List<Object> arr = (List<Object>) doc.get(field.getKey());
                        if (arr != null && arr.remove(field.getValue())) {
                            modified = true;
                        }
                    }
                    break;
                case "$addToSet":
                    for (Map.Entry<String, Object> field : fields.entrySet()) {
                        List<Object> arr = (List<Object>) doc.computeIfAbsent(field.getKey(), k -> new ArrayList<>());
                        if (!arr.contains(field.getValue())) {
                            arr.add(field.getValue());
                            modified = true;
                        }
                    }
                    break;
                case "$pop":
                    for (Map.Entry<String, Object> field : fields.entrySet()) {
                        List<Object> arr = (List<Object>) doc.get(field.getKey());
                        if (arr != null && !arr.isEmpty()) {
                            Number direction = (Number) field.getValue();
                            if (direction.intValue() >= 0) {
                                arr.remove(arr.size() - 1);
                            } else {
                                arr.remove(0);
                            }
                            modified = true;
                        }
                    }
                    break;
                case "$currentDate":
                    for (Map.Entry<String, Object> field : fields.entrySet()) {
                        doc.put(field.getKey(), java.time.Instant.now().toString());
                        modified = true;
                    }
                    break;
            }
        }

        return modified;
    }

    /**
     * Applies filter conditions as document fields (for upsert).
     */
    private void applyFilterAsDocument(Document doc, Document filter) {
        for (Map.Entry<String, Object> entry : filter.entrySet()) {
            String key = entry.getKey();
            Object value = entry.getValue();

            // Skip operators
            if (key.startsWith("$")) continue;

            // For simple equality, set the value
            if (!(value instanceof Document)) {
                doc.put(key, value);
            }
        }
    }

    /**
     * Checks equality between two values.
     */
    private boolean equals(Object a, Object b) {
        if (a == null && b == null) return true;
        if (a == null || b == null) return false;

        // Handle ObjectId comparison
        if (a instanceof ObjectId && b instanceof ObjectId) {
            return a.toString().equals(b.toString());
        }
        if (a instanceof ObjectId) {
            return a.toString().equals(b.toString());
        }
        if (b instanceof ObjectId) {
            return a.toString().equals(b.toString());
        }

        return a.equals(b);
    }

    /**
     * Compares two values.
     */
    @SuppressWarnings("unchecked")
    private int compare(Object a, Object b) {
        if (a == null && b == null) return 0;
        if (a == null) return -1;
        if (b == null) return 1;

        if (a instanceof Number && b instanceof Number) {
            return Double.compare(((Number) a).doubleValue(), ((Number) b).doubleValue());
        }

        if (a instanceof Comparable && b.getClass().equals(a.getClass())) {
            return ((Comparable<Object>) a).compareTo(b);
        }

        return a.toString().compareTo(b.toString());
    }
}
