package do_.mongo;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * MongoDB Database - provides access to collections and database operations.
 *
 * <pre>{@code
 * MongoDatabase db = client.getDatabase("myapp");
 *
 * // Get a collection
 * MongoCollection<Document> users = db.getCollection("users");
 *
 * // List collections
 * for (String name : db.listCollectionNames()) {
 *     System.out.println(name);
 * }
 *
 * // Create a collection
 * db.createCollection("logs");
 *
 * // Drop the database
 * db.drop();
 * }</pre>
 */
public class MongoDatabase {

    private final RpcTransport transport;
    private final String name;
    private final Map<String, MongoCollection<?>> collections;

    /**
     * Creates a new MongoDatabase.
     *
     * @param transport the RPC transport
     * @param name      the database name
     */
    MongoDatabase(RpcTransport transport, String name) {
        this.transport = transport;
        this.name = name;
        this.collections = new HashMap<>();
    }

    /**
     * Gets the database name.
     *
     * @return the database name
     */
    public String getName() {
        return name;
    }

    // ============================================================================
    // Collection Access
    // ============================================================================

    /**
     * Gets a collection with Document type.
     *
     * @param collectionName the collection name
     * @return the collection
     */
    public MongoCollection<Document> getCollection(String collectionName) {
        return getCollection(collectionName, Document.class);
    }

    /**
     * Gets a collection with a specific document type.
     *
     * @param collectionName the collection name
     * @param documentClass  the document class
     * @return the collection
     */
    @SuppressWarnings("unchecked")
    public <T> MongoCollection<T> getCollection(String collectionName, Class<T> documentClass) {
        String key = collectionName + ":" + documentClass.getName();
        return (MongoCollection<T>) collections.computeIfAbsent(key,
                k -> new MongoCollection<>(transport, name, collectionName, documentClass));
    }

    // ============================================================================
    // Collection Management
    // ============================================================================

    /**
     * Creates a new collection.
     *
     * @param collectionName the collection name
     */
    public void createCollection(String collectionName) {
        createCollection(collectionName, new Document());
    }

    /**
     * Creates a new collection with options.
     *
     * @param collectionName the collection name
     * @param options        the collection options
     */
    public void createCollection(String collectionName, Document options) {
        transport.call("createCollection", name, collectionName, options);
    }

    /**
     * Creates a new collection asynchronously.
     *
     * @param collectionName the collection name
     * @return a CompletableFuture
     */
    public CompletableFuture<Void> createCollectionAsync(String collectionName) {
        return transport.callAsync("createCollection", name, collectionName, new Document())
                .thenApply(r -> null);
    }

    /**
     * Lists collection names.
     *
     * @return a list of collection names
     */
    @SuppressWarnings("unchecked")
    public List<String> listCollectionNames() {
        Object result = transport.call("listCollections", name, new Document());
        List<String> names = new ArrayList<>();
        if (result instanceof List) {
            for (Object item : (List<?>) result) {
                if (item instanceof Document) {
                    names.add(((Document) item).getString("name"));
                } else if (item instanceof Map) {
                    names.add((String) ((Map<?, ?>) item).get("name"));
                }
            }
        }
        return names;
    }

    /**
     * Lists collections with full information.
     *
     * @return a list of collection info documents
     */
    @SuppressWarnings("unchecked")
    public List<Document> listCollections() {
        Object result = transport.call("listCollections", name, new Document());
        List<Document> collections = new ArrayList<>();
        if (result instanceof List) {
            for (Object item : (List<?>) result) {
                if (item instanceof Document) {
                    collections.add((Document) item);
                } else if (item instanceof Map) {
                    collections.add(new Document((Map<String, Object>) item));
                }
            }
        }
        return collections;
    }

    /**
     * Renames a collection.
     *
     * @param oldName the current collection name
     * @param newName the new collection name
     */
    public void renameCollection(String oldName, String newName) {
        renameCollection(oldName, newName, false);
    }

    /**
     * Renames a collection.
     *
     * @param oldName    the current collection name
     * @param newName    the new collection name
     * @param dropTarget whether to drop the target collection if it exists
     */
    public void renameCollection(String oldName, String newName, boolean dropTarget) {
        Document options = new Document("dropTarget", dropTarget);
        transport.call("renameCollection", name, oldName, newName, options);
        // Update cache
        collections.remove(oldName + ":do_.mongo.Document");
    }

    // ============================================================================
    // Database Operations
    // ============================================================================

    /**
     * Drops the database.
     */
    public void drop() {
        transport.call("dropDatabase", name);
        collections.clear();
    }

    /**
     * Drops the database asynchronously.
     *
     * @return a CompletableFuture
     */
    public CompletableFuture<Void> dropAsync() {
        return transport.callAsync("dropDatabase", name)
                .thenApply(r -> {
                    collections.clear();
                    return null;
                });
    }

    /**
     * Gets database statistics.
     *
     * @return the database stats
     */
    @SuppressWarnings("unchecked")
    public Document getStats() {
        Object result = transport.call("runCommand", name, new Document("dbStats", 1));
        if (result instanceof Document) {
            return (Document) result;
        } else if (result instanceof Map) {
            return new Document((Map<String, Object>) result);
        }
        return new Document();
    }

    /**
     * Runs a database command.
     *
     * @param command the command document
     * @return the command result
     */
    @SuppressWarnings("unchecked")
    public Document runCommand(Document command) {
        Object result = transport.call("runCommand", name, command);
        if (result instanceof Document) {
            return (Document) result;
        } else if (result instanceof Map) {
            return new Document((Map<String, Object>) result);
        }
        return new Document();
    }

    /**
     * Runs a database command asynchronously.
     *
     * @param command the command document
     * @return a CompletableFuture with the result
     */
    @SuppressWarnings("unchecked")
    public CompletableFuture<Document> runCommandAsync(Document command) {
        return transport.callAsync("runCommand", name, command)
                .thenApply(result -> {
                    if (result instanceof Document) {
                        return (Document) result;
                    } else if (result instanceof Map) {
                        return new Document((Map<String, Object>) result);
                    }
                    return new Document();
                });
    }
}
