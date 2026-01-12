package do_.mongo;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.function.Consumer;

/**
 * Fluent interface for building find queries with MongoDB-compatible cursor iteration.
 *
 * <pre>{@code
 * collection.find(eq("status", "active"))
 *     .sort(new Document("createdAt", -1))
 *     .limit(10)
 *     .forEach(doc -> System.out.println(doc));
 * }</pre>
 *
 * @param <T> the document type
 */
public class FindIterable<T> implements Iterable<T> {

    private final RpcTransport transport;
    private final String dbName;
    private final String collectionName;
    private final Document filter;
    private final Class<T> documentClass;

    private Document sort;
    private Integer limit;
    private Integer skip;
    private Document projection;
    private Integer batchSize;
    private Long maxTimeMS;
    private String hint;
    private String comment;

    /**
     * Creates a new FindIterable.
     *
     * @param transport      the RPC transport
     * @param dbName         the database name
     * @param collectionName the collection name
     * @param filter         the query filter
     * @param documentClass  the document class
     */
    FindIterable(RpcTransport transport, String dbName, String collectionName,
                 Document filter, Class<T> documentClass) {
        this.transport = transport;
        this.dbName = dbName;
        this.collectionName = collectionName;
        this.filter = filter != null ? filter : new Document();
        this.documentClass = documentClass;
    }

    /**
     * Sets the sort order.
     *
     * @param sort the sort document
     * @return this for chaining
     */
    public FindIterable<T> sort(Bson sort) {
        this.sort = sort.toBsonDocument();
        return this;
    }

    /**
     * Sets the sort order.
     *
     * @param sort the sort document
     * @return this for chaining
     */
    public FindIterable<T> sort(Document sort) {
        this.sort = sort;
        return this;
    }

    /**
     * Sets the maximum number of documents to return.
     *
     * @param limit the limit
     * @return this for chaining
     */
    public FindIterable<T> limit(int limit) {
        if (limit < 0) throw new IllegalArgumentException("Limit must be non-negative");
        this.limit = limit;
        return this;
    }

    /**
     * Sets the number of documents to skip.
     *
     * @param skip the skip count
     * @return this for chaining
     */
    public FindIterable<T> skip(int skip) {
        if (skip < 0) throw new IllegalArgumentException("Skip must be non-negative");
        this.skip = skip;
        return this;
    }

    /**
     * Sets the projection.
     *
     * @param projection the projection document
     * @return this for chaining
     */
    public FindIterable<T> projection(Bson projection) {
        this.projection = projection.toBsonDocument();
        return this;
    }

    /**
     * Sets the projection.
     *
     * @param projection the projection document
     * @return this for chaining
     */
    public FindIterable<T> projection(Document projection) {
        this.projection = projection;
        return this;
    }

    /**
     * Sets the batch size.
     *
     * @param batchSize the batch size
     * @return this for chaining
     */
    public FindIterable<T> batchSize(int batchSize) {
        this.batchSize = batchSize;
        return this;
    }

    /**
     * Sets the maximum execution time.
     *
     * @param maxTimeMS the maximum time in milliseconds
     * @return this for chaining
     */
    public FindIterable<T> maxTimeMS(long maxTimeMS) {
        this.maxTimeMS = maxTimeMS;
        return this;
    }

    /**
     * Sets the index hint.
     *
     * @param hint the hint
     * @return this for chaining
     */
    public FindIterable<T> hint(String hint) {
        this.hint = hint;
        return this;
    }

    /**
     * Sets the query comment.
     *
     * @param comment the comment
     * @return this for chaining
     */
    public FindIterable<T> comment(String comment) {
        this.comment = comment;
        return this;
    }

    /**
     * Gets the first document or null if none.
     *
     * @return the first document or null
     */
    public T first() {
        return cursor().first();
    }

    /**
     * Converts all documents to a list.
     *
     * @return a list of documents
     */
    public List<T> toList() {
        return cursor().toList();
    }

    /**
     * Converts to an ArrayList (alias for toList for MongoDB compatibility).
     *
     * @return a list of documents
     */
    public ArrayList<T> into(ArrayList<T> target) {
        target.addAll(toList());
        return target;
    }

    /**
     * Iterates over all documents with a callback.
     *
     * @param action the callback
     */
    @Override
    public void forEach(Consumer<? super T> action) {
        cursor().forEach(action);
    }

    /**
     * Gets a cursor for iteration.
     *
     * @return the cursor
     */
    public MongoCursor<T> cursor() {
        MongoCursor.FindOptions options = new MongoCursor.FindOptions();
        if (sort != null) options.sort(sort);
        if (limit != null) options.limit(limit);
        if (skip != null) options.skip(skip);
        if (projection != null) options.projection(projection);
        if (batchSize != null) options.batchSize(batchSize);
        if (maxTimeMS != null) options.maxTimeMS(maxTimeMS);
        if (hint != null) options.hint(hint);
        if (comment != null) options.comment(comment);

        return new MongoCursor<>(transport, dbName, collectionName, filter, options, documentClass);
    }

    @Override
    public Iterator<T> iterator() {
        return cursor();
    }
}
