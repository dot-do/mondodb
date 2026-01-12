package do_.mongo;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;

/**
 * Fluent interface for building and executing aggregation pipelines.
 * <p>
 * Aggregation pipelines process data through a series of stages, each
 * transforming the documents as they pass through.
 * </p>
 *
 * <pre>{@code
 * // Build and execute a pipeline
 * List<Document> results = collection.aggregate(Arrays.asList(
 *     new Document("$match", new Document("status", "active")),
 *     new Document("$group", new Document("_id", "$category")
 *         .append("total", new Document("$sum", "$amount"))),
 *     new Document("$sort", new Document("total", -1))
 * )).toList();
 *
 * // Fluent API
 * collection.aggregate()
 *     .match(eq("status", "active"))
 *     .group("$category", sum("total", "$amount"))
 *     .sort(descending("total"))
 *     .forEach(doc -> System.out.println(doc));
 * }</pre>
 *
 * @param <T> the result document type
 */
public class AggregateIterable<T> implements Iterable<T> {

    private final RpcTransport transport;
    private final String dbName;
    private final String collectionName;
    private final List<Document> pipeline;
    private final Class<T> resultClass;

    // Pipeline options
    private Boolean allowDiskUse;
    private Integer batchSize;
    private Long maxTimeMS;
    private Document collation;
    private String comment;
    private String hint;

    /**
     * Creates a new AggregateIterable.
     *
     * @param transport      the RPC transport
     * @param dbName         the database name
     * @param collectionName the collection name
     * @param pipeline       the initial pipeline stages
     * @param resultClass    the result document class
     */
    public AggregateIterable(RpcTransport transport, String dbName, String collectionName,
                             List<Document> pipeline, Class<T> resultClass) {
        this.transport = transport;
        this.dbName = dbName;
        this.collectionName = collectionName;
        this.pipeline = new ArrayList<>(pipeline);
        this.resultClass = resultClass;
    }

    /**
     * Creates a new empty AggregateIterable.
     *
     * @param transport      the RPC transport
     * @param dbName         the database name
     * @param collectionName the collection name
     * @param resultClass    the result document class
     */
    public AggregateIterable(RpcTransport transport, String dbName, String collectionName,
                             Class<T> resultClass) {
        this(transport, dbName, collectionName, new ArrayList<>(), resultClass);
    }

    // ============================================================================
    // Pipeline Stage Methods
    // ============================================================================

    /**
     * Adds a $match stage to filter documents.
     *
     * @param filter the filter
     * @return this for chaining
     */
    public AggregateIterable<T> match(Bson filter) {
        return match(filter.toBsonDocument());
    }

    /**
     * Adds a $match stage to filter documents.
     *
     * @param filter the filter
     * @return this for chaining
     */
    public AggregateIterable<T> match(Document filter) {
        pipeline.add(new Document("$match", filter));
        return this;
    }

    /**
     * Adds a $project stage to reshape documents.
     *
     * @param projection the projection
     * @return this for chaining
     */
    public AggregateIterable<T> project(Bson projection) {
        return project(projection.toBsonDocument());
    }

    /**
     * Adds a $project stage to reshape documents.
     *
     * @param projection the projection
     * @return this for chaining
     */
    public AggregateIterable<T> project(Document projection) {
        pipeline.add(new Document("$project", projection));
        return this;
    }

    /**
     * Adds a $group stage to group documents.
     *
     * @param id           the grouping key expression
     * @param accumulators the accumulator expressions
     * @return this for chaining
     */
    public AggregateIterable<T> group(Object id, Document... accumulators) {
        Document groupDoc = new Document("_id", id);
        for (Document acc : accumulators) {
            groupDoc.putAll(acc);
        }
        pipeline.add(new Document("$group", groupDoc));
        return this;
    }

    /**
     * Adds a $group stage to group documents.
     *
     * @param groupSpec the full group specification
     * @return this for chaining
     */
    public AggregateIterable<T> group(Document groupSpec) {
        pipeline.add(new Document("$group", groupSpec));
        return this;
    }

    /**
     * Adds a $sort stage to order documents.
     *
     * @param sort the sort specification
     * @return this for chaining
     */
    public AggregateIterable<T> sort(Bson sort) {
        return sort(sort.toBsonDocument());
    }

    /**
     * Adds a $sort stage to order documents.
     *
     * @param sort the sort specification
     * @return this for chaining
     */
    public AggregateIterable<T> sort(Document sort) {
        pipeline.add(new Document("$sort", sort));
        return this;
    }

    /**
     * Adds a $limit stage to limit results.
     *
     * @param limit the maximum number of documents
     * @return this for chaining
     */
    public AggregateIterable<T> limit(int limit) {
        pipeline.add(new Document("$limit", limit));
        return this;
    }

    /**
     * Adds a $skip stage to skip documents.
     *
     * @param skip the number of documents to skip
     * @return this for chaining
     */
    public AggregateIterable<T> skip(int skip) {
        pipeline.add(new Document("$skip", skip));
        return this;
    }

    /**
     * Adds an $unwind stage to deconstruct an array field.
     *
     * @param path the field path to unwind
     * @return this for chaining
     */
    public AggregateIterable<T> unwind(String path) {
        pipeline.add(new Document("$unwind", path.startsWith("$") ? path : "$" + path));
        return this;
    }

    /**
     * Adds an $unwind stage with options.
     *
     * @param path                       the field path to unwind
     * @param preserveNullAndEmptyArrays whether to output null/missing arrays
     * @return this for chaining
     */
    public AggregateIterable<T> unwind(String path, boolean preserveNullAndEmptyArrays) {
        Document unwindDoc = new Document("path", path.startsWith("$") ? path : "$" + path)
                .append("preserveNullAndEmptyArrays", preserveNullAndEmptyArrays);
        pipeline.add(new Document("$unwind", unwindDoc));
        return this;
    }

    /**
     * Adds a $lookup stage to join with another collection.
     *
     * @param from         the collection to join
     * @param localField   the field from the input documents
     * @param foreignField the field from the documents of the "from" collection
     * @param as           the output array field name
     * @return this for chaining
     */
    public AggregateIterable<T> lookup(String from, String localField, String foreignField, String as) {
        Document lookupDoc = new Document()
                .append("from", from)
                .append("localField", localField)
                .append("foreignField", foreignField)
                .append("as", as);
        pipeline.add(new Document("$lookup", lookupDoc));
        return this;
    }

    /**
     * Adds a $lookup stage with pipeline.
     *
     * @param from     the collection to join
     * @param let      the variables to use in the pipeline
     * @param pipeline the pipeline to run on the joined collection
     * @param as       the output array field name
     * @return this for chaining
     */
    public AggregateIterable<T> lookup(String from, Document let, List<Document> pipeline, String as) {
        Document lookupDoc = new Document()
                .append("from", from)
                .append("let", let)
                .append("pipeline", pipeline)
                .append("as", as);
        this.pipeline.add(new Document("$lookup", lookupDoc));
        return this;
    }

    /**
     * Adds an $out stage to write results to a collection.
     *
     * @param collectionName the output collection name
     * @return this for chaining
     */
    public AggregateIterable<T> out(String collectionName) {
        pipeline.add(new Document("$out", collectionName));
        return this;
    }

    /**
     * Adds a $merge stage to write results to a collection.
     *
     * @param into the output collection name
     * @return this for chaining
     */
    public AggregateIterable<T> merge(String into) {
        pipeline.add(new Document("$merge", into));
        return this;
    }

    /**
     * Adds a $merge stage with options.
     *
     * @param mergeOptions the merge options
     * @return this for chaining
     */
    public AggregateIterable<T> merge(Document mergeOptions) {
        pipeline.add(new Document("$merge", mergeOptions));
        return this;
    }

    /**
     * Adds a $count stage.
     *
     * @param field the name of the output field
     * @return this for chaining
     */
    public AggregateIterable<T> count(String field) {
        pipeline.add(new Document("$count", field));
        return this;
    }

    /**
     * Adds a $addFields stage to add new fields.
     *
     * @param fields the fields to add
     * @return this for chaining
     */
    public AggregateIterable<T> addFields(Document fields) {
        pipeline.add(new Document("$addFields", fields));
        return this;
    }

    /**
     * Adds a $set stage (alias for $addFields).
     *
     * @param fields the fields to set
     * @return this for chaining
     */
    public AggregateIterable<T> set(Document fields) {
        pipeline.add(new Document("$set", fields));
        return this;
    }

    /**
     * Adds a $replaceRoot stage.
     *
     * @param newRoot the new root expression
     * @return this for chaining
     */
    public AggregateIterable<T> replaceRoot(Object newRoot) {
        pipeline.add(new Document("$replaceRoot", new Document("newRoot", newRoot)));
        return this;
    }

    /**
     * Adds a $bucket stage for bucketing documents.
     *
     * @param groupBy    the expression to group by
     * @param boundaries the bucket boundaries
     * @return this for chaining
     */
    public AggregateIterable<T> bucket(Object groupBy, List<Object> boundaries) {
        Document bucketDoc = new Document()
                .append("groupBy", groupBy)
                .append("boundaries", boundaries);
        pipeline.add(new Document("$bucket", bucketDoc));
        return this;
    }

    /**
     * Adds a $bucketAuto stage for automatic bucketing.
     *
     * @param groupBy the expression to group by
     * @param buckets the number of buckets
     * @return this for chaining
     */
    public AggregateIterable<T> bucketAuto(Object groupBy, int buckets) {
        Document bucketDoc = new Document()
                .append("groupBy", groupBy)
                .append("buckets", buckets);
        pipeline.add(new Document("$bucketAuto", bucketDoc));
        return this;
    }

    /**
     * Adds a $facet stage for multi-faceted aggregation.
     *
     * @param facets the facet specifications
     * @return this for chaining
     */
    public AggregateIterable<T> facet(Document facets) {
        pipeline.add(new Document("$facet", facets));
        return this;
    }

    /**
     * Adds a $graphLookup stage for recursive lookup.
     *
     * @param from             the collection to query
     * @param startWith        the expression for starting points
     * @param connectFromField the field to connect from
     * @param connectToField   the field to connect to
     * @param as               the output array field name
     * @return this for chaining
     */
    public AggregateIterable<T> graphLookup(String from, Object startWith,
                                            String connectFromField, String connectToField, String as) {
        Document graphLookupDoc = new Document()
                .append("from", from)
                .append("startWith", startWith)
                .append("connectFromField", connectFromField)
                .append("connectToField", connectToField)
                .append("as", as);
        pipeline.add(new Document("$graphLookup", graphLookupDoc));
        return this;
    }

    /**
     * Adds a $sample stage to randomly select documents.
     *
     * @param size the number of documents to sample
     * @return this for chaining
     */
    public AggregateIterable<T> sample(int size) {
        pipeline.add(new Document("$sample", new Document("size", size)));
        return this;
    }

    /**
     * Adds a custom pipeline stage.
     *
     * @param stage the stage document
     * @return this for chaining
     */
    public AggregateIterable<T> stage(Document stage) {
        pipeline.add(stage);
        return this;
    }

    // ============================================================================
    // Options
    // ============================================================================

    /**
     * Enables writing temporary files to disk.
     *
     * @param allowDiskUse true to allow disk use
     * @return this for chaining
     */
    public AggregateIterable<T> allowDiskUse(boolean allowDiskUse) {
        this.allowDiskUse = allowDiskUse;
        return this;
    }

    /**
     * Sets the batch size for cursor retrieval.
     *
     * @param batchSize the batch size
     * @return this for chaining
     */
    public AggregateIterable<T> batchSize(int batchSize) {
        this.batchSize = batchSize;
        return this;
    }

    /**
     * Sets the maximum execution time.
     *
     * @param maxTimeMS the maximum time in milliseconds
     * @return this for chaining
     */
    public AggregateIterable<T> maxTimeMS(long maxTimeMS) {
        this.maxTimeMS = maxTimeMS;
        return this;
    }

    /**
     * Sets the collation options.
     *
     * @param collation the collation document
     * @return this for chaining
     */
    public AggregateIterable<T> collation(Document collation) {
        this.collation = collation;
        return this;
    }

    /**
     * Sets a comment for the operation.
     *
     * @param comment the comment
     * @return this for chaining
     */
    public AggregateIterable<T> comment(String comment) {
        this.comment = comment;
        return this;
    }

    /**
     * Sets an index hint.
     *
     * @param hint the hint
     * @return this for chaining
     */
    public AggregateIterable<T> hint(String hint) {
        this.hint = hint;
        return this;
    }

    // ============================================================================
    // Execution
    // ============================================================================

    /**
     * Executes the pipeline and returns results as a list.
     *
     * @return the result list
     */
    @SuppressWarnings("unchecked")
    public List<T> toList() {
        Document options = buildOptions();
        Object result = transport.call("aggregate", dbName, collectionName, pipeline, options);

        List<T> results = new ArrayList<>();
        if (result instanceof List) {
            for (Object item : (List<?>) result) {
                results.add(convertResult(item));
            }
        }
        return results;
    }

    /**
     * Executes the pipeline and returns the first result.
     *
     * @return the first document or null
     */
    public T first() {
        List<T> results = limit(1).toList();
        return results.isEmpty() ? null : results.get(0);
    }

    /**
     * Executes the pipeline asynchronously.
     *
     * @return a CompletableFuture with the results
     */
    public CompletableFuture<List<T>> toListAsync() {
        Document options = buildOptions();
        return transport.callAsync("aggregate", dbName, collectionName, pipeline, options)
                .thenApply(result -> {
                    List<T> results = new ArrayList<>();
                    if (result instanceof List) {
                        for (Object item : (List<?>) result) {
                            results.add(convertResult(item));
                        }
                    }
                    return results;
                });
    }

    /**
     * Iterates over all results with a callback.
     *
     * @param action the callback
     */
    @Override
    public void forEach(Consumer<? super T> action) {
        toList().forEach(action);
    }

    @Override
    public Iterator<T> iterator() {
        return toList().iterator();
    }

    /**
     * Collects results into a target collection.
     *
     * @param target the target collection
     * @return the target collection with results added
     */
    public <C extends java.util.Collection<T>> C into(C target) {
        target.addAll(toList());
        return target;
    }

    /**
     * Returns the pipeline stages.
     *
     * @return the pipeline
     */
    public List<Document> getPipeline() {
        return new ArrayList<>(pipeline);
    }

    /**
     * Explains the execution plan.
     *
     * @return the explain document
     */
    @SuppressWarnings("unchecked")
    public Document explain() {
        Document options = buildOptions();
        options.append("explain", true);
        Object result = transport.call("aggregate", dbName, collectionName, pipeline, options);
        if (result instanceof Document) {
            return (Document) result;
        } else if (result instanceof Map) {
            return new Document((Map<String, Object>) result);
        }
        return new Document();
    }

    // ============================================================================
    // Private Helpers
    // ============================================================================

    private Document buildOptions() {
        Document options = new Document();
        if (allowDiskUse != null) options.append("allowDiskUse", allowDiskUse);
        if (batchSize != null) options.append("batchSize", batchSize);
        if (maxTimeMS != null) options.append("maxTimeMS", maxTimeMS);
        if (collation != null) options.append("collation", collation);
        if (comment != null) options.append("comment", comment);
        if (hint != null) options.append("hint", hint);
        return options;
    }

    @SuppressWarnings("unchecked")
    private T convertResult(Object item) {
        if (resultClass.isInstance(item)) {
            return (T) item;
        }
        if (item instanceof Map && resultClass == Document.class) {
            return (T) new Document((Map<String, Object>) item);
        }
        if (item instanceof Map) {
            return (T) new Document((Map<String, Object>) item);
        }
        return null;
    }

    // ============================================================================
    // Static Accumulator Helpers
    // ============================================================================

    /**
     * Creates a $sum accumulator.
     *
     * @param field      the output field name
     * @param expression the expression to sum
     * @return the accumulator document
     */
    public static Document sum(String field, Object expression) {
        return new Document(field, new Document("$sum", expression));
    }

    /**
     * Creates an $avg accumulator.
     *
     * @param field      the output field name
     * @param expression the expression to average
     * @return the accumulator document
     */
    public static Document avg(String field, Object expression) {
        return new Document(field, new Document("$avg", expression));
    }

    /**
     * Creates a $min accumulator.
     *
     * @param field      the output field name
     * @param expression the expression to find minimum
     * @return the accumulator document
     */
    public static Document min(String field, Object expression) {
        return new Document(field, new Document("$min", expression));
    }

    /**
     * Creates a $max accumulator.
     *
     * @param field      the output field name
     * @param expression the expression to find maximum
     * @return the accumulator document
     */
    public static Document max(String field, Object expression) {
        return new Document(field, new Document("$max", expression));
    }

    /**
     * Creates a $first accumulator.
     *
     * @param field      the output field name
     * @param expression the expression
     * @return the accumulator document
     */
    public static Document first(String field, Object expression) {
        return new Document(field, new Document("$first", expression));
    }

    /**
     * Creates a $last accumulator.
     *
     * @param field      the output field name
     * @param expression the expression
     * @return the accumulator document
     */
    public static Document last(String field, Object expression) {
        return new Document(field, new Document("$last", expression));
    }

    /**
     * Creates a $push accumulator.
     *
     * @param field      the output field name
     * @param expression the expression
     * @return the accumulator document
     */
    public static Document push(String field, Object expression) {
        return new Document(field, new Document("$push", expression));
    }

    /**
     * Creates an $addToSet accumulator.
     *
     * @param field      the output field name
     * @param expression the expression
     * @return the accumulator document
     */
    public static Document addToSet(String field, Object expression) {
        return new Document(field, new Document("$addToSet", expression));
    }

    /**
     * Creates a $count accumulator.
     *
     * @param field the output field name
     * @return the accumulator document
     */
    public static Document countAcc(String field) {
        return new Document(field, new Document("$sum", 1));
    }

    /**
     * Creates a $stdDevPop accumulator.
     *
     * @param field      the output field name
     * @param expression the expression
     * @return the accumulator document
     */
    public static Document stdDevPop(String field, Object expression) {
        return new Document(field, new Document("$stdDevPop", expression));
    }

    /**
     * Creates a $stdDevSamp accumulator.
     *
     * @param field      the output field name
     * @param expression the expression
     * @return the accumulator document
     */
    public static Document stdDevSamp(String field, Object expression) {
        return new Document(field, new Document("$stdDevSamp", expression));
    }
}
