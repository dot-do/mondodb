package do_.mongo;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.function.Consumer;

/**
 * Cursor for iterating over MongoDB query results.
 * <p>
 * The cursor provides various methods for consuming query results:
 * <ul>
 *   <li>{@link #next()} - Get the next document</li>
 *   <li>{@link #hasNext()} - Check if more documents exist</li>
 *   <li>{@link #toList()} - Convert to a list</li>
 *   <li>{@link #forEach(Consumer)} - Iterate with a callback</li>
 *   <li>{@link #first()} - Get only the first document</li>
 * </ul>
 * </p>
 *
 * @param <T> the document type
 */
public class MongoCursor<T> implements Iterator<T>, Iterable<T>, AutoCloseable {

    private final RpcTransport transport;
    private final String dbName;
    private final String collectionName;
    private final Document filter;
    private final FindOptions options;
    private final Class<T> documentClass;

    private List<T> buffer;
    private int position;
    private boolean fetched;
    private boolean closed;

    /**
     * Creates a new cursor.
     *
     * @param transport      the RPC transport
     * @param dbName         the database name
     * @param collectionName the collection name
     * @param filter         the query filter
     * @param options        the find options
     * @param documentClass  the document class
     */
    MongoCursor(RpcTransport transport, String dbName, String collectionName,
                Document filter, FindOptions options, Class<T> documentClass) {
        this.transport = transport;
        this.dbName = dbName;
        this.collectionName = collectionName;
        this.filter = filter != null ? filter : new Document();
        this.options = options != null ? options : new FindOptions();
        this.documentClass = documentClass;
        this.buffer = new ArrayList<>();
        this.position = 0;
        this.fetched = false;
        this.closed = false;
    }

    /**
     * Fetches data from the server.
     */
    @SuppressWarnings("unchecked")
    private void ensureFetched() {
        if (fetched || closed) return;

        Document findOptions = options.toBsonDocument();
        Object result = transport.call("find", dbName, collectionName, filter, findOptions);

        if (result instanceof List) {
            List<?> list = (List<?>) result;
            for (Object item : list) {
                if (item instanceof Document) {
                    buffer.add((T) item);
                } else if (item instanceof java.util.Map) {
                    buffer.add((T) new Document((java.util.Map<String, Object>) item));
                }
            }
        }

        fetched = true;
    }

    @Override
    public boolean hasNext() {
        if (closed) return false;
        ensureFetched();
        return position < buffer.size();
    }

    @Override
    public T next() {
        if (!hasNext()) {
            throw new NoSuchElementException();
        }
        return buffer.get(position++);
    }

    /**
     * Gets the first document or null if none.
     *
     * @return the first document or null
     */
    public T first() {
        if (closed) return null;
        ensureFetched();
        if (buffer.isEmpty()) return null;
        T result = buffer.get(0);
        close();
        return result;
    }

    /**
     * Converts all remaining documents to a list.
     *
     * @return a list of documents
     */
    public List<T> toList() {
        if (closed) return new ArrayList<>();
        ensureFetched();
        List<T> result = new ArrayList<>(buffer.subList(position, buffer.size()));
        position = buffer.size();
        close();
        return result;
    }

    /**
     * Iterates over all documents with a callback.
     *
     * @param action the callback
     */
    @Override
    public void forEach(Consumer<? super T> action) {
        if (closed) return;
        ensureFetched();
        while (position < buffer.size()) {
            action.accept(buffer.get(position++));
        }
    }

    /**
     * Counts the remaining documents.
     *
     * @return the count
     */
    public int count() {
        ensureFetched();
        return buffer.size() - position;
    }

    /**
     * Rewinds the cursor to the beginning.
     */
    public void rewind() {
        position = 0;
        fetched = false;
        closed = false;
        buffer.clear();
    }

    @Override
    public void close() {
        if (closed) return;
        closed = true;
        buffer.clear();
        position = 0;
    }

    @Override
    public Iterator<T> iterator() {
        return this;
    }

    /**
     * Checks if the cursor is closed.
     *
     * @return true if closed
     */
    public boolean isClosed() {
        return closed;
    }

    /**
     * Find options for configuring the query.
     */
    public static class FindOptions implements Bson {
        private Document sort;
        private Integer limit;
        private Integer skip;
        private Document projection;
        private Integer batchSize;
        private Long maxTimeMS;
        private String hint;
        private String comment;

        public FindOptions sort(Document sort) {
            this.sort = sort;
            return this;
        }

        public FindOptions sort(String field, int direction) {
            this.sort = new Document(field, direction);
            return this;
        }

        public FindOptions limit(int limit) {
            this.limit = limit;
            return this;
        }

        public FindOptions skip(int skip) {
            this.skip = skip;
            return this;
        }

        public FindOptions projection(Document projection) {
            this.projection = projection;
            return this;
        }

        public FindOptions batchSize(int batchSize) {
            this.batchSize = batchSize;
            return this;
        }

        public FindOptions maxTimeMS(long maxTimeMS) {
            this.maxTimeMS = maxTimeMS;
            return this;
        }

        public FindOptions hint(String hint) {
            this.hint = hint;
            return this;
        }

        public FindOptions comment(String comment) {
            this.comment = comment;
            return this;
        }

        @Override
        public Document toBsonDocument() {
            Document doc = new Document();
            if (sort != null) doc.append("sort", sort);
            if (limit != null) doc.append("limit", limit);
            if (skip != null) doc.append("skip", skip);
            if (projection != null) doc.append("projection", projection);
            if (batchSize != null) doc.append("batchSize", batchSize);
            if (maxTimeMS != null) doc.append("maxTimeMS", maxTimeMS);
            if (hint != null) doc.append("hint", hint);
            if (comment != null) doc.append("comment", comment);
            return doc;
        }
    }
}
