package do_.mongo;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Flow;
import java.util.function.Consumer;

/**
 * Iterable for MongoDB change streams.
 * <p>
 * Change streams allow applications to watch for real-time changes to a collection,
 * database, or cluster. Changes are delivered as events that include the operation
 * type and the affected document.
 * </p>
 *
 * <pre>{@code
 * // Watch for changes to a collection
 * collection.watch()
 *     .forEach(change -> {
 *         System.out.println("Operation: " + change.getOperationType());
 *         System.out.println("Document: " + change.getFullDocument());
 *     });
 *
 * // Filter for specific operations
 * collection.watch(Arrays.asList(
 *     new Document("$match", new Document("operationType", "insert"))
 * )).forEach(change -> handleInsert(change));
 *
 * // Resume from a specific point
 * collection.watch()
 *     .resumeAfter(resumeToken)
 *     .forEach(change -> processChange(change));
 * }</pre>
 *
 * @param <T> the result document type
 */
public class ChangeStreamIterable<T> implements Iterable<ChangeStreamDocument<T>> {

    private final RpcTransport transport;
    private final String dbName;
    private final String collectionName;
    private final List<Document> pipeline;
    private final Class<T> resultClass;

    // Options
    private String fullDocument = "default";
    private Document resumeToken;
    private Long startAtOperationTime;
    private Integer batchSize;
    private Long maxAwaitTimeMS;
    private Document collation;

    /**
     * Creates a new ChangeStreamIterable.
     *
     * @param transport      the RPC transport
     * @param dbName         the database name
     * @param collectionName the collection name (null for database/cluster level)
     * @param pipeline       the aggregation pipeline for filtering
     * @param resultClass    the result document class
     */
    public ChangeStreamIterable(RpcTransport transport, String dbName, String collectionName,
                                 List<Document> pipeline, Class<T> resultClass) {
        this.transport = transport;
        this.dbName = dbName;
        this.collectionName = collectionName;
        this.pipeline = pipeline != null ? new ArrayList<>(pipeline) : new ArrayList<>();
        this.resultClass = resultClass;
    }

    // ============================================================================
    // Configuration
    // ============================================================================

    /**
     * Sets the fullDocument option.
     *
     * @param fullDocument "default", "updateLookup", or "whenAvailable"
     * @return this for chaining
     */
    public ChangeStreamIterable<T> fullDocument(String fullDocument) {
        this.fullDocument = fullDocument;
        return this;
    }

    /**
     * Sets the resume token to resume the stream from.
     *
     * @param resumeToken the resume token
     * @return this for chaining
     */
    public ChangeStreamIterable<T> resumeAfter(Document resumeToken) {
        this.resumeToken = resumeToken;
        return this;
    }

    /**
     * Sets the operation time to start the stream from.
     *
     * @param operationTime the operation time as timestamp
     * @return this for chaining
     */
    public ChangeStreamIterable<T> startAtOperationTime(long operationTime) {
        this.startAtOperationTime = operationTime;
        return this;
    }

    /**
     * Sets the batch size.
     *
     * @param batchSize the batch size
     * @return this for chaining
     */
    public ChangeStreamIterable<T> batchSize(int batchSize) {
        this.batchSize = batchSize;
        return this;
    }

    /**
     * Sets the maximum await time for events.
     *
     * @param duration the maximum await time
     * @return this for chaining
     */
    public ChangeStreamIterable<T> maxAwaitTime(Duration duration) {
        this.maxAwaitTimeMS = duration.toMillis();
        return this;
    }

    /**
     * Sets the collation options.
     *
     * @param collation the collation document
     * @return this for chaining
     */
    public ChangeStreamIterable<T> collation(Document collation) {
        this.collation = collation;
        return this;
    }

    // ============================================================================
    // Execution
    // ============================================================================

    /**
     * Gets a cursor for iterating change events.
     *
     * @return the change stream cursor
     */
    public ChangeStreamCursor<T> cursor() {
        Document options = buildOptions();
        return new ChangeStreamCursor<>(transport, dbName, collectionName, pipeline, options, resultClass);
    }

    /**
     * Gets the first change event (blocks until available).
     *
     * @return the first change event
     */
    public ChangeStreamDocument<T> first() {
        try (ChangeStreamCursor<T> cursor = cursor()) {
            return cursor.hasNext() ? cursor.next() : null;
        }
    }

    /**
     * Iterates over change events with a callback.
     *
     * @param action the callback
     */
    @Override
    public void forEach(Consumer<? super ChangeStreamDocument<T>> action) {
        try (ChangeStreamCursor<T> cursor = cursor()) {
            while (cursor.hasNext()) {
                action.accept(cursor.next());
            }
        }
    }

    /**
     * Subscribes to change events asynchronously.
     *
     * @param onNext    callback for each event
     * @param onError   callback for errors
     * @param onComplete callback when stream ends
     * @return a cancellation handle
     */
    public Subscription subscribe(Consumer<ChangeStreamDocument<T>> onNext,
                                   Consumer<Throwable> onError,
                                   Runnable onComplete) {
        ChangeStreamCursor<T> cursor = cursor();
        Thread thread = Thread.ofVirtual().start(() -> {
            try {
                while (!Thread.currentThread().isInterrupted() && cursor.hasNext()) {
                    onNext.accept(cursor.next());
                }
                if (onComplete != null) {
                    onComplete.run();
                }
            } catch (Exception e) {
                if (onError != null) {
                    onError.accept(e);
                }
            } finally {
                cursor.close();
            }
        });

        return () -> {
            thread.interrupt();
            cursor.close();
        };
    }

    /**
     * Converts to a reactive Flow.Publisher.
     *
     * @return a Flow.Publisher of change events
     */
    public Flow.Publisher<ChangeStreamDocument<T>> toPublisher() {
        return subscriber -> {
            ChangeStreamCursor<T> cursor = cursor();
            subscriber.onSubscribe(new Flow.Subscription() {
                private volatile boolean cancelled = false;

                @Override
                public void request(long n) {
                    if (cancelled) return;

                    Thread.ofVirtual().start(() -> {
                        try {
                            long count = 0;
                            while (!cancelled && count < n && cursor.hasNext()) {
                                subscriber.onNext(cursor.next());
                                count++;
                            }
                            if (!cancelled && !cursor.hasNext()) {
                                subscriber.onComplete();
                            }
                        } catch (Exception e) {
                            if (!cancelled) {
                                subscriber.onError(e);
                            }
                        }
                    });
                }

                @Override
                public void cancel() {
                    cancelled = true;
                    cursor.close();
                }
            });
        };
    }

    @Override
    public Iterator<ChangeStreamDocument<T>> iterator() {
        return cursor();
    }

    // ============================================================================
    // Private Helpers
    // ============================================================================

    private Document buildOptions() {
        Document options = new Document();
        if (fullDocument != null) options.append("fullDocument", fullDocument);
        if (resumeToken != null) options.append("resumeAfter", resumeToken);
        if (startAtOperationTime != null) options.append("startAtOperationTime", startAtOperationTime);
        if (batchSize != null) options.append("batchSize", batchSize);
        if (maxAwaitTimeMS != null) options.append("maxAwaitTimeMS", maxAwaitTimeMS);
        if (collation != null) options.append("collation", collation);
        return options;
    }

    // ============================================================================
    // Nested Types
    // ============================================================================

    /**
     * Subscription handle for cancelling change stream subscriptions.
     */
    @FunctionalInterface
    public interface Subscription {
        /**
         * Cancels the subscription.
         */
        void cancel();
    }

    /**
     * Cursor for iterating change stream events.
     */
    public static class ChangeStreamCursor<T> implements Iterator<ChangeStreamDocument<T>>, AutoCloseable {

        private final RpcTransport transport;
        private final String dbName;
        private final String collectionName;
        private final List<Document> pipeline;
        private final Document options;
        private final Class<T> resultClass;

        private boolean closed = false;
        private Document lastResumeToken;
        private List<ChangeStreamDocument<T>> buffer = new ArrayList<>();
        private int bufferIndex = 0;

        ChangeStreamCursor(RpcTransport transport, String dbName, String collectionName,
                          List<Document> pipeline, Document options, Class<T> resultClass) {
            this.transport = transport;
            this.dbName = dbName;
            this.collectionName = collectionName;
            this.pipeline = pipeline;
            this.options = options;
            this.resultClass = resultClass;
        }

        @Override
        public boolean hasNext() {
            if (closed) return false;
            if (bufferIndex < buffer.size()) return true;

            // Fetch more events
            try {
                fetchBatch();
                return bufferIndex < buffer.size();
            } catch (Exception e) {
                return false;
            }
        }

        @Override
        public ChangeStreamDocument<T> next() {
            if (!hasNext()) {
                throw new java.util.NoSuchElementException();
            }
            ChangeStreamDocument<T> event = buffer.get(bufferIndex++);
            lastResumeToken = event.getResumeToken();
            return event;
        }

        /**
         * Gets the resume token for the last returned event.
         *
         * @return the resume token
         */
        public Document getResumeToken() {
            return lastResumeToken;
        }

        /**
         * Tries to get the next event without blocking.
         *
         * @return the next event or null if none available
         */
        public ChangeStreamDocument<T> tryNext() {
            if (bufferIndex < buffer.size()) {
                return next();
            }
            return null;
        }

        @Override
        public void close() {
            closed = true;
            buffer.clear();
        }

        @SuppressWarnings("unchecked")
        private void fetchBatch() {
            Document watchOptions = new Document(options);
            if (lastResumeToken != null) {
                watchOptions.put("resumeAfter", lastResumeToken);
            }

            Object result = transport.call("watch", dbName, collectionName, pipeline, watchOptions);

            buffer.clear();
            bufferIndex = 0;

            if (result instanceof List) {
                for (Object item : (List<?>) result) {
                    buffer.add(parseChangeEvent(item));
                }
            }
        }

        @SuppressWarnings("unchecked")
        private ChangeStreamDocument<T> parseChangeEvent(Object item) {
            Document doc;
            if (item instanceof Document) {
                doc = (Document) item;
            } else if (item instanceof Map) {
                doc = new Document((Map<String, Object>) item);
            } else {
                return null;
            }

            String operationType = doc.getString("operationType");
            Document ns = doc.get("ns", Document.class);
            String database = ns != null ? ns.getString("db") : dbName;
            String collection = ns != null ? ns.getString("coll") : collectionName;

            Object fullDoc = doc.get("fullDocument");
            T fullDocument = null;
            if (fullDoc != null) {
                if (resultClass.isInstance(fullDoc)) {
                    fullDocument = (T) fullDoc;
                } else if (fullDoc instanceof Map) {
                    fullDocument = (T) new Document((Map<String, Object>) fullDoc);
                }
            }

            Document documentKey = doc.get("documentKey", Document.class);
            Document updateDescription = doc.get("updateDescription", Document.class);
            Document resumeToken = doc.get("_id", Document.class);
            Long clusterTime = doc.getLong("clusterTime");

            return new ChangeStreamDocument<>(
                    operationType,
                    database,
                    collection,
                    documentKey,
                    fullDocument,
                    updateDescription,
                    resumeToken,
                    clusterTime
            );
        }
    }
}

/**
 * Represents a single change stream event.
 *
 * @param <T> the document type
 */
class ChangeStreamDocument<T> {

    private final String operationType;
    private final String database;
    private final String collection;
    private final Document documentKey;
    private final T fullDocument;
    private final Document updateDescription;
    private final Document resumeToken;
    private final Long clusterTime;

    ChangeStreamDocument(String operationType, String database, String collection,
                        Document documentKey, T fullDocument, Document updateDescription,
                        Document resumeToken, Long clusterTime) {
        this.operationType = operationType;
        this.database = database;
        this.collection = collection;
        this.documentKey = documentKey;
        this.fullDocument = fullDocument;
        this.updateDescription = updateDescription;
        this.resumeToken = resumeToken;
        this.clusterTime = clusterTime;
    }

    /**
     * Gets the operation type (insert, update, replace, delete, drop, rename, etc.).
     */
    public String getOperationType() {
        return operationType;
    }

    /**
     * Gets the database name.
     */
    public String getDatabase() {
        return database;
    }

    /**
     * Gets the collection name.
     */
    public String getCollection() {
        return collection;
    }

    /**
     * Gets the document key (_id).
     */
    public Document getDocumentKey() {
        return documentKey;
    }

    /**
     * Gets the full document (for insert/update/replace with fullDocument enabled).
     */
    public T getFullDocument() {
        return fullDocument;
    }

    /**
     * Gets the update description (for update operations).
     */
    public Document getUpdateDescription() {
        return updateDescription;
    }

    /**
     * Gets the updated fields (from updateDescription).
     */
    public Document getUpdatedFields() {
        return updateDescription != null ? updateDescription.get("updatedFields", Document.class) : null;
    }

    /**
     * Gets the removed fields (from updateDescription).
     */
    @SuppressWarnings("unchecked")
    public List<String> getRemovedFields() {
        return updateDescription != null ? (List<String>) updateDescription.get("removedFields") : null;
    }

    /**
     * Gets the resume token for this event.
     */
    public Document getResumeToken() {
        return resumeToken;
    }

    /**
     * Gets the cluster time of this event.
     */
    public Long getClusterTime() {
        return clusterTime;
    }

    /**
     * Checks if this is an insert operation.
     */
    public boolean isInsert() {
        return "insert".equals(operationType);
    }

    /**
     * Checks if this is an update operation.
     */
    public boolean isUpdate() {
        return "update".equals(operationType);
    }

    /**
     * Checks if this is a replace operation.
     */
    public boolean isReplace() {
        return "replace".equals(operationType);
    }

    /**
     * Checks if this is a delete operation.
     */
    public boolean isDelete() {
        return "delete".equals(operationType);
    }

    /**
     * Checks if this is a drop operation.
     */
    public boolean isDrop() {
        return "drop".equals(operationType);
    }

    @Override
    public String toString() {
        return "ChangeStreamDocument{" +
                "operationType='" + operationType + '\'' +
                ", database='" + database + '\'' +
                ", collection='" + collection + '\'' +
                ", documentKey=" + documentKey +
                ", fullDocument=" + fullDocument +
                '}';
    }
}
