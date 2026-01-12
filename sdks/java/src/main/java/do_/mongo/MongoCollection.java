package do_.mongo;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * MongoDB Collection - provides CRUD operations for a collection.
 * <p>
 * This class follows the mongodb-driver-sync API pattern for familiarity.
 * </p>
 *
 * <pre>{@code
 * MongoCollection<Document> users = db.getCollection("users");
 *
 * // Insert
 * users.insertOne(new Document("name", "John").append("age", 30));
 *
 * // Find
 * Document user = users.find(eq("name", "John")).first();
 *
 * // Update
 * users.updateOne(eq("name", "John"), set("age", 31));
 *
 * // Delete
 * users.deleteOne(eq("name", "John"));
 * }</pre>
 *
 * @param <T> the document type
 */
public class MongoCollection<T> {

    private final RpcTransport transport;
    private final String dbName;
    private final String collectionName;
    private final Class<T> documentClass;

    /**
     * Creates a new MongoCollection.
     *
     * @param transport      the RPC transport
     * @param dbName         the database name
     * @param collectionName the collection name
     * @param documentClass  the document class
     */
    MongoCollection(RpcTransport transport, String dbName, String collectionName, Class<T> documentClass) {
        this.transport = transport;
        this.dbName = dbName;
        this.collectionName = collectionName;
        this.documentClass = documentClass;
    }

    /**
     * Gets the collection namespace.
     *
     * @return the namespace (database.collection)
     */
    public String getNamespace() {
        return dbName + "." + collectionName;
    }

    /**
     * Gets the collection name.
     *
     * @return the collection name
     */
    public String getName() {
        return collectionName;
    }

    /**
     * Gets the document class.
     *
     * @return the document class
     */
    public Class<T> getDocumentClass() {
        return documentClass;
    }

    // ============================================================================
    // Insert Operations
    // ============================================================================

    /**
     * Inserts a single document.
     *
     * @param document the document to insert
     * @return the insert result
     */
    public InsertOneResult insertOne(T document) {
        Document doc = toDocument(document);
        Object result = transport.call("insertOne", dbName, collectionName, doc);
        return InsertOneResult.fromDocument(result);
    }

    /**
     * Inserts a single document asynchronously.
     *
     * @param document the document to insert
     * @return a CompletableFuture with the result
     */
    public CompletableFuture<InsertOneResult> insertOneAsync(T document) {
        Document doc = toDocument(document);
        return transport.callAsync("insertOne", dbName, collectionName, doc)
                .thenApply(InsertOneResult::fromDocument);
    }

    /**
     * Inserts multiple documents.
     *
     * @param documents the documents to insert
     * @return the insert result
     */
    public InsertManyResult insertMany(List<T> documents) {
        List<Document> docs = new ArrayList<>();
        for (T document : documents) {
            docs.add(toDocument(document));
        }
        Object result = transport.call("insertMany", dbName, collectionName, docs);
        return InsertManyResult.fromDocument(result);
    }

    /**
     * Inserts multiple documents asynchronously.
     *
     * @param documents the documents to insert
     * @return a CompletableFuture with the result
     */
    public CompletableFuture<InsertManyResult> insertManyAsync(List<T> documents) {
        List<Document> docs = new ArrayList<>();
        for (T document : documents) {
            docs.add(toDocument(document));
        }
        return transport.callAsync("insertMany", dbName, collectionName, docs)
                .thenApply(InsertManyResult::fromDocument);
    }

    // ============================================================================
    // Find Operations
    // ============================================================================

    /**
     * Finds all documents.
     *
     * @return a FindIterable for the query
     */
    public FindIterable<T> find() {
        return find(new Document());
    }

    /**
     * Finds documents matching a filter.
     *
     * @param filter the query filter
     * @return a FindIterable for the query
     */
    public FindIterable<T> find(Bson filter) {
        return new FindIterable<>(transport, dbName, collectionName, filter.toBsonDocument(), documentClass);
    }

    /**
     * Finds documents matching a filter.
     *
     * @param filter the query filter
     * @return a FindIterable for the query
     */
    public FindIterable<T> find(Document filter) {
        return new FindIterable<>(transport, dbName, collectionName, filter, documentClass);
    }

    /**
     * Finds a single document matching a filter.
     *
     * @param filter the query filter
     * @return the first matching document, or null
     */
    public T findOne(Bson filter) {
        return find(filter).first();
    }

    /**
     * Finds a single document matching a filter.
     *
     * @param filter the query filter
     * @return the first matching document, or null
     */
    public T findOne(Document filter) {
        return find(filter).first();
    }

    /**
     * Finds a document by ID.
     *
     * @param id the document ID
     * @return the document, or null
     */
    public T findById(Object id) {
        return find(new Document("_id", id)).first();
    }

    // ============================================================================
    // Update Operations
    // ============================================================================

    /**
     * Updates a single document.
     *
     * @param filter the query filter
     * @param update the update operations
     * @return the update result
     */
    public UpdateResult updateOne(Bson filter, Bson update) {
        return updateOne(filter.toBsonDocument(), update.toBsonDocument(), false);
    }

    /**
     * Updates a single document.
     *
     * @param filter the query filter
     * @param update the update operations
     * @param upsert whether to insert if no match
     * @return the update result
     */
    public UpdateResult updateOne(Bson filter, Bson update, boolean upsert) {
        return updateOne(filter.toBsonDocument(), update.toBsonDocument(), upsert);
    }

    /**
     * Updates a single document.
     *
     * @param filter the query filter
     * @param update the update operations
     * @return the update result
     */
    public UpdateResult updateOne(Document filter, Document update) {
        return updateOne(filter, update, false);
    }

    /**
     * Updates a single document.
     *
     * @param filter the query filter
     * @param update the update operations
     * @param upsert whether to insert if no match
     * @return the update result
     */
    public UpdateResult updateOne(Document filter, Document update, boolean upsert) {
        Document options = new Document("upsert", upsert);
        Object result = transport.call("updateOne", dbName, collectionName, filter, update, options);
        return UpdateResult.fromDocument(result);
    }

    /**
     * Updates a single document asynchronously.
     *
     * @param filter the query filter
     * @param update the update operations
     * @return a CompletableFuture with the result
     */
    public CompletableFuture<UpdateResult> updateOneAsync(Bson filter, Bson update) {
        Document options = new Document("upsert", false);
        return transport.callAsync("updateOne", dbName, collectionName, filter.toBsonDocument(), update.toBsonDocument(), options)
                .thenApply(UpdateResult::fromDocument);
    }

    /**
     * Updates multiple documents.
     *
     * @param filter the query filter
     * @param update the update operations
     * @return the update result
     */
    public UpdateResult updateMany(Bson filter, Bson update) {
        return updateMany(filter.toBsonDocument(), update.toBsonDocument(), false);
    }

    /**
     * Updates multiple documents.
     *
     * @param filter the query filter
     * @param update the update operations
     * @param upsert whether to insert if no match
     * @return the update result
     */
    public UpdateResult updateMany(Bson filter, Bson update, boolean upsert) {
        return updateMany(filter.toBsonDocument(), update.toBsonDocument(), upsert);
    }

    /**
     * Updates multiple documents.
     *
     * @param filter the query filter
     * @param update the update operations
     * @return the update result
     */
    public UpdateResult updateMany(Document filter, Document update) {
        return updateMany(filter, update, false);
    }

    /**
     * Updates multiple documents.
     *
     * @param filter the query filter
     * @param update the update operations
     * @param upsert whether to insert if no match
     * @return the update result
     */
    public UpdateResult updateMany(Document filter, Document update, boolean upsert) {
        Document options = new Document("upsert", upsert);
        Object result = transport.call("updateMany", dbName, collectionName, filter, update, options);
        return UpdateResult.fromDocument(result);
    }

    /**
     * Updates multiple documents asynchronously.
     *
     * @param filter the query filter
     * @param update the update operations
     * @return a CompletableFuture with the result
     */
    public CompletableFuture<UpdateResult> updateManyAsync(Bson filter, Bson update) {
        Document options = new Document("upsert", false);
        return transport.callAsync("updateMany", dbName, collectionName, filter.toBsonDocument(), update.toBsonDocument(), options)
                .thenApply(UpdateResult::fromDocument);
    }

    /**
     * Replaces a single document.
     *
     * @param filter      the query filter
     * @param replacement the replacement document
     * @return the update result
     */
    public UpdateResult replaceOne(Bson filter, T replacement) {
        return replaceOne(filter.toBsonDocument(), toDocument(replacement), false);
    }

    /**
     * Replaces a single document.
     *
     * @param filter      the query filter
     * @param replacement the replacement document
     * @param upsert      whether to insert if no match
     * @return the update result
     */
    public UpdateResult replaceOne(Bson filter, T replacement, boolean upsert) {
        return replaceOne(filter.toBsonDocument(), toDocument(replacement), upsert);
    }

    /**
     * Replaces a single document.
     *
     * @param filter      the query filter
     * @param replacement the replacement document
     * @return the update result
     */
    public UpdateResult replaceOne(Document filter, Document replacement) {
        return replaceOne(filter, replacement, false);
    }

    /**
     * Replaces a single document.
     *
     * @param filter      the query filter
     * @param replacement the replacement document
     * @param upsert      whether to insert if no match
     * @return the update result
     */
    public UpdateResult replaceOne(Document filter, Document replacement, boolean upsert) {
        Document options = new Document("upsert", upsert);
        Object result = transport.call("replaceOne", dbName, collectionName, filter, replacement, options);
        return UpdateResult.fromDocument(result);
    }

    // ============================================================================
    // Find and Modify Operations
    // ============================================================================

    /**
     * Finds a document and updates it.
     *
     * @param filter the query filter
     * @param update the update operations
     * @return the original document (before update)
     */
    @SuppressWarnings("unchecked")
    public T findOneAndUpdate(Bson filter, Bson update) {
        Document options = new Document("returnDocument", "before");
        Object result = transport.call("findOneAndUpdate", dbName, collectionName,
                filter.toBsonDocument(), update.toBsonDocument(), options);
        return resultToDocument(result);
    }

    /**
     * Finds a document and updates it.
     *
     * @param filter         the query filter
     * @param update         the update operations
     * @param returnDocument whether to return "before" or "after"
     * @return the document
     */
    @SuppressWarnings("unchecked")
    public T findOneAndUpdate(Bson filter, Bson update, String returnDocument) {
        Document options = new Document("returnDocument", returnDocument);
        Object result = transport.call("findOneAndUpdate", dbName, collectionName,
                filter.toBsonDocument(), update.toBsonDocument(), options);
        return resultToDocument(result);
    }

    /**
     * Finds a document and deletes it.
     *
     * @param filter the query filter
     * @return the deleted document
     */
    @SuppressWarnings("unchecked")
    public T findOneAndDelete(Bson filter) {
        Object result = transport.call("findOneAndDelete", dbName, collectionName, filter.toBsonDocument());
        return resultToDocument(result);
    }

    /**
     * Finds a document and replaces it.
     *
     * @param filter      the query filter
     * @param replacement the replacement document
     * @return the original document
     */
    @SuppressWarnings("unchecked")
    public T findOneAndReplace(Bson filter, T replacement) {
        Document options = new Document("returnDocument", "before");
        Object result = transport.call("findOneAndReplace", dbName, collectionName,
                filter.toBsonDocument(), toDocument(replacement), options);
        return resultToDocument(result);
    }

    // ============================================================================
    // Delete Operations
    // ============================================================================

    /**
     * Deletes a single document.
     *
     * @param filter the query filter
     * @return the delete result
     */
    public DeleteResult deleteOne(Bson filter) {
        Object result = transport.call("deleteOne", dbName, collectionName, filter.toBsonDocument());
        return DeleteResult.fromDocument(result);
    }

    /**
     * Deletes a single document.
     *
     * @param filter the query filter
     * @return the delete result
     */
    public DeleteResult deleteOne(Document filter) {
        Object result = transport.call("deleteOne", dbName, collectionName, filter);
        return DeleteResult.fromDocument(result);
    }

    /**
     * Deletes a single document asynchronously.
     *
     * @param filter the query filter
     * @return a CompletableFuture with the result
     */
    public CompletableFuture<DeleteResult> deleteOneAsync(Bson filter) {
        return transport.callAsync("deleteOne", dbName, collectionName, filter.toBsonDocument())
                .thenApply(DeleteResult::fromDocument);
    }

    /**
     * Deletes multiple documents.
     *
     * @param filter the query filter
     * @return the delete result
     */
    public DeleteResult deleteMany(Bson filter) {
        Object result = transport.call("deleteMany", dbName, collectionName, filter.toBsonDocument());
        return DeleteResult.fromDocument(result);
    }

    /**
     * Deletes multiple documents.
     *
     * @param filter the query filter
     * @return the delete result
     */
    public DeleteResult deleteMany(Document filter) {
        Object result = transport.call("deleteMany", dbName, collectionName, filter);
        return DeleteResult.fromDocument(result);
    }

    /**
     * Deletes multiple documents asynchronously.
     *
     * @param filter the query filter
     * @return a CompletableFuture with the result
     */
    public CompletableFuture<DeleteResult> deleteManyAsync(Bson filter) {
        return transport.callAsync("deleteMany", dbName, collectionName, filter.toBsonDocument())
                .thenApply(DeleteResult::fromDocument);
    }

    // ============================================================================
    // Count Operations
    // ============================================================================

    /**
     * Counts all documents.
     *
     * @return the count
     */
    public long countDocuments() {
        return countDocuments(new Document());
    }

    /**
     * Counts documents matching a filter.
     *
     * @param filter the query filter
     * @return the count
     */
    public long countDocuments(Bson filter) {
        return countDocuments(filter.toBsonDocument());
    }

    /**
     * Counts documents matching a filter.
     *
     * @param filter the query filter
     * @return the count
     */
    public long countDocuments(Document filter) {
        Object result = transport.call("countDocuments", dbName, collectionName, filter, new Document());
        if (result instanceof Number) {
            return ((Number) result).longValue();
        }
        return 0;
    }

    /**
     * Counts documents asynchronously.
     *
     * @param filter the query filter
     * @return a CompletableFuture with the count
     */
    public CompletableFuture<Long> countDocumentsAsync(Bson filter) {
        return transport.callAsync("countDocuments", dbName, collectionName, filter.toBsonDocument(), new Document())
                .thenApply(result -> result instanceof Number ? ((Number) result).longValue() : 0L);
    }

    /**
     * Gets an estimated document count.
     *
     * @return the estimated count
     */
    public long estimatedDocumentCount() {
        Object result = transport.call("estimatedDocumentCount", dbName, collectionName);
        if (result instanceof Number) {
            return ((Number) result).longValue();
        }
        return 0;
    }

    // ============================================================================
    // Aggregation Operations
    // ============================================================================

    /**
     * Runs an aggregation pipeline.
     *
     * @param pipeline the aggregation pipeline
     * @return the aggregation results
     */
    @SuppressWarnings("unchecked")
    public List<Document> aggregate(List<Document> pipeline) {
        Object result = transport.call("aggregate", dbName, collectionName, pipeline, new Document());
        if (result instanceof List) {
            List<Document> docs = new ArrayList<>();
            for (Object item : (List<?>) result) {
                if (item instanceof Document) {
                    docs.add((Document) item);
                } else if (item instanceof Map) {
                    docs.add(new Document((Map<String, Object>) item));
                }
            }
            return docs;
        }
        return new ArrayList<>();
    }

    /**
     * Creates an aggregation pipeline builder.
     *
     * @return an AggregateIterable for building the pipeline
     */
    public AggregateIterable<Document> aggregate() {
        return new AggregateIterable<>(transport, dbName, collectionName, Document.class);
    }

    /**
     * Creates an aggregation pipeline builder with initial stages.
     *
     * @param pipeline the initial pipeline stages
     * @return an AggregateIterable for building the pipeline
     */
    public AggregateIterable<Document> aggregateIterable(List<Document> pipeline) {
        return new AggregateIterable<>(transport, dbName, collectionName, pipeline, Document.class);
    }

    // ============================================================================
    // Change Streams
    // ============================================================================

    /**
     * Watches for changes to the collection.
     *
     * @return a ChangeStreamIterable
     */
    public ChangeStreamIterable<Document> watch() {
        return watch(new ArrayList<>());
    }

    /**
     * Watches for changes to the collection with a pipeline filter.
     *
     * @param pipeline the aggregation pipeline for filtering events
     * @return a ChangeStreamIterable
     */
    public ChangeStreamIterable<Document> watch(List<Document> pipeline) {
        return new ChangeStreamIterable<>(transport, dbName, collectionName, pipeline, Document.class);
    }

    /**
     * Gets distinct values for a field.
     *
     * @param fieldName the field name
     * @return the distinct values
     */
    @SuppressWarnings("unchecked")
    public <V> List<V> distinct(String fieldName, Class<V> resultClass) {
        return distinct(fieldName, new Document(), resultClass);
    }

    /**
     * Gets distinct values for a field.
     *
     * @param fieldName the field name
     * @param filter    the query filter
     * @return the distinct values
     */
    @SuppressWarnings("unchecked")
    public <V> List<V> distinct(String fieldName, Bson filter, Class<V> resultClass) {
        Object result = transport.call("distinct", dbName, collectionName, fieldName, filter.toBsonDocument());
        if (result instanceof List) {
            return (List<V>) result;
        }
        return new ArrayList<>();
    }

    // ============================================================================
    // Index Operations
    // ============================================================================

    /**
     * Creates an index.
     *
     * @param keys the index keys
     * @return the index name
     */
    public String createIndex(Bson keys) {
        Object result = transport.call("createIndex", dbName, collectionName, keys.toBsonDocument(), new Document());
        return result != null ? result.toString() : null;
    }

    /**
     * Creates an index with options.
     *
     * @param keys    the index keys
     * @param options the index options
     * @return the index name
     */
    public String createIndex(Bson keys, Document options) {
        Object result = transport.call("createIndex", dbName, collectionName, keys.toBsonDocument(), options);
        return result != null ? result.toString() : null;
    }

    /**
     * Drops an index.
     *
     * @param indexName the index name
     */
    public void dropIndex(String indexName) {
        transport.call("dropIndex", dbName, collectionName, indexName);
    }

    /**
     * Drops all indexes.
     */
    public void dropIndexes() {
        transport.call("dropIndexes", dbName, collectionName);
    }

    /**
     * Lists all indexes.
     *
     * @return the indexes
     */
    @SuppressWarnings("unchecked")
    public List<Document> listIndexes() {
        Object result = transport.call("listIndexes", dbName, collectionName);
        if (result instanceof List) {
            List<Document> indexes = new ArrayList<>();
            for (Object item : (List<?>) result) {
                if (item instanceof Document) {
                    indexes.add((Document) item);
                } else if (item instanceof Map) {
                    indexes.add(new Document((Map<String, Object>) item));
                }
            }
            return indexes;
        }
        return new ArrayList<>();
    }

    // ============================================================================
    // Collection Operations
    // ============================================================================

    /**
     * Drops the collection.
     */
    public void drop() {
        transport.call("dropCollection", dbName, collectionName);
    }

    /**
     * Renames the collection.
     *
     * @param newName the new name
     */
    public void rename(String newName) {
        transport.call("renameCollection", dbName, collectionName, newName);
    }

    // ============================================================================
    // Helper Methods
    // ============================================================================

    /**
     * Converts a document of type T to a Document.
     */
    @SuppressWarnings("unchecked")
    private Document toDocument(T document) {
        if (document instanceof Document) {
            return (Document) document;
        } else if (document instanceof Map) {
            return new Document((Map<String, Object>) document);
        }
        throw new IllegalArgumentException("Cannot convert " + document.getClass() + " to Document");
    }

    /**
     * Converts a result to the document type.
     */
    @SuppressWarnings("unchecked")
    private T resultToDocument(Object result) {
        if (result == null) return null;
        if (documentClass.isInstance(result)) {
            return (T) result;
        }
        if (result instanceof Map) {
            return (T) new Document((Map<String, Object>) result);
        }
        return null;
    }
}
