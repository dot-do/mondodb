package do_.mongo

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/**
 * Iterable for aggregation operations with fluent pipeline building.
 *
 * Example usage:
 * ```kotlin
 * val results = collection.aggregate()
 *     .match(Filters.eq("status", "active"))
 *     .group(document {
 *         "_id" to "\$category"
 *         "total" to document { "\$sum" to 1 }
 *     })
 *     .sort(Sorts.descending("total"))
 *     .limit(10)
 *     .toList()
 *
 * // Using DSL
 * val results = collection.aggregate {
 *     match { "status" eq "active" }
 *     group {
 *         "_id" to "\$category"
 *         "count" to sumOf(1)
 *     }
 *     sortBy("count", -1)
 *     limit(10)
 * }
 * ```
 */
class AggregateIterable<T : Any>(
    private val transport: RpcTransport,
    private val dbName: String,
    private val collectionName: String,
    private val documentClass: Class<T>
) {
    private val pipeline = mutableListOf<Document>()
    private var allowDiskUse: Boolean? = null
    private var batchSize: Int? = null
    private var maxTimeMs: Long? = null
    private var comment: String? = null

    constructor(
        transport: RpcTransport,
        dbName: String,
        collectionName: String,
        initialPipeline: List<Document>,
        documentClass: Class<T>
    ) : this(transport, dbName, collectionName, documentClass) {
        pipeline.addAll(initialPipeline)
    }

    // =========================================================================
    // Pipeline Stages
    // =========================================================================

    /**
     * Adds a $match stage.
     */
    fun match(filter: Bson): AggregateIterable<T> = apply {
        pipeline.add(Document("\$match", filter.toBsonDocument()))
    }

    /**
     * Adds a $project stage.
     */
    fun project(projection: Bson): AggregateIterable<T> = apply {
        pipeline.add(Document("\$project", projection.toBsonDocument()))
    }

    /**
     * Adds a $group stage.
     */
    fun group(groupDoc: Document): AggregateIterable<T> = apply {
        pipeline.add(Document("\$group", groupDoc))
    }

    /**
     * Adds a $group stage with an ID expression.
     */
    fun group(id: Any?, accumulators: Document): AggregateIterable<T> = apply {
        val groupDoc = Document("_id", id)
        groupDoc.putAll(accumulators)
        pipeline.add(Document("\$group", groupDoc))
    }

    /**
     * Adds a $sort stage.
     */
    fun sort(sort: Bson): AggregateIterable<T> = apply {
        pipeline.add(Document("\$sort", sort.toBsonDocument()))
    }

    /**
     * Adds a $limit stage.
     */
    fun limit(limit: Int): AggregateIterable<T> = apply {
        pipeline.add(Document("\$limit", limit))
    }

    /**
     * Adds a $skip stage.
     */
    fun skip(skip: Int): AggregateIterable<T> = apply {
        pipeline.add(Document("\$skip", skip))
    }

    /**
     * Adds an $unwind stage.
     */
    fun unwind(field: String): AggregateIterable<T> = apply {
        pipeline.add(Document("\$unwind", if (field.startsWith("$")) field else "\$$field"))
    }

    /**
     * Adds an $unwind stage with options.
     */
    fun unwind(field: String, preserveNullAndEmptyArrays: Boolean): AggregateIterable<T> = apply {
        val path = if (field.startsWith("$")) field else "\$$field"
        pipeline.add(Document("\$unwind", Document("path", path)
            .append("preserveNullAndEmptyArrays", preserveNullAndEmptyArrays)))
    }

    /**
     * Adds a $lookup stage.
     */
    fun lookup(from: String, localField: String, foreignField: String, `as`: String): AggregateIterable<T> = apply {
        pipeline.add(Document("\$lookup", Document()
            .append("from", from)
            .append("localField", localField)
            .append("foreignField", foreignField)
            .append("as", `as`)))
    }

    /**
     * Adds a $lookup stage with pipeline.
     */
    fun lookup(from: String, let: Document?, lookupPipeline: List<Document>, `as`: String): AggregateIterable<T> = apply {
        val lookupDoc = Document()
            .append("from", from)
            .append("pipeline", lookupPipeline)
            .append("as", `as`)
        let?.let { lookupDoc.append("let", it) }
        pipeline.add(Document("\$lookup", lookupDoc))
    }

    /**
     * Adds an $addFields stage.
     */
    fun addFields(fields: Document): AggregateIterable<T> = apply {
        pipeline.add(Document("\$addFields", fields))
    }

    /**
     * Adds a $set stage (alias for $addFields).
     */
    fun set(fields: Document): AggregateIterable<T> = addFields(fields)

    /**
     * Adds an $unset stage.
     */
    fun unset(vararg fields: String): AggregateIterable<T> = apply {
        pipeline.add(Document("\$unset", fields.toList()))
    }

    /**
     * Adds a $replaceRoot stage.
     */
    fun replaceRoot(newRoot: String): AggregateIterable<T> = apply {
        val root = if (newRoot.startsWith("$")) newRoot else "\$$newRoot"
        pipeline.add(Document("\$replaceRoot", Document("newRoot", root)))
    }

    /**
     * Adds a $replaceRoot stage with expression.
     */
    fun replaceRoot(newRoot: Document): AggregateIterable<T> = apply {
        pipeline.add(Document("\$replaceRoot", Document("newRoot", newRoot)))
    }

    /**
     * Adds a $count stage.
     */
    fun count(field: String): AggregateIterable<T> = apply {
        pipeline.add(Document("\$count", field))
    }

    /**
     * Adds a $bucket stage.
     */
    fun bucket(groupBy: String, boundaries: List<Any?>, default: Any? = null, output: Document? = null): AggregateIterable<T> = apply {
        val bucketDoc = Document()
            .append("groupBy", if (groupBy.startsWith("$")) groupBy else "\$$groupBy")
            .append("boundaries", boundaries)
        default?.let { bucketDoc.append("default", it) }
        output?.let { bucketDoc.append("output", it) }
        pipeline.add(Document("\$bucket", bucketDoc))
    }

    /**
     * Adds a $facet stage.
     */
    fun facet(facets: Map<String, List<Document>>): AggregateIterable<T> = apply {
        pipeline.add(Document("\$facet", Document(facets)))
    }

    /**
     * Adds a $sample stage.
     */
    fun sample(size: Int): AggregateIterable<T> = apply {
        pipeline.add(Document("\$sample", Document("size", size)))
    }

    /**
     * Adds a $out stage.
     */
    fun out(collection: String): AggregateIterable<T> = apply {
        pipeline.add(Document("\$out", collection))
    }

    /**
     * Adds a $merge stage.
     */
    fun merge(into: String, on: String? = null, whenMatched: String? = null, whenNotMatched: String? = null): AggregateIterable<T> = apply {
        val mergeDoc = Document("into", into)
        on?.let { mergeDoc.append("on", it) }
        whenMatched?.let { mergeDoc.append("whenMatched", it) }
        whenNotMatched?.let { mergeDoc.append("whenNotMatched", it) }
        pipeline.add(Document("\$merge", mergeDoc))
    }

    /**
     * Adds a raw stage document.
     */
    fun stage(stage: Document): AggregateIterable<T> = apply {
        pipeline.add(stage)
    }

    // =========================================================================
    // Options
    // =========================================================================

    /**
     * Allows the aggregation to use disk for large datasets.
     */
    fun allowDiskUse(allow: Boolean): AggregateIterable<T> = apply {
        this.allowDiskUse = allow
    }

    /**
     * Sets the batch size.
     */
    fun batchSize(size: Int): AggregateIterable<T> = apply {
        this.batchSize = size
    }

    /**
     * Sets the maximum execution time.
     */
    fun maxTime(maxTimeMs: Long): AggregateIterable<T> = apply {
        this.maxTimeMs = maxTimeMs
    }

    /**
     * Sets a comment for the aggregation.
     */
    fun comment(comment: String): AggregateIterable<T> = apply {
        this.comment = comment
    }

    // =========================================================================
    // Execution
    // =========================================================================

    /**
     * Gets the first result document.
     */
    fun first(): T? = toList().firstOrNull()

    /**
     * Gets the first result document asynchronously.
     */
    suspend fun firstAsync(): T? = toListAsync().firstOrNull()

    /**
     * Collects all results into a list.
     */
    fun toList(): List<T> {
        val options = buildOptions()
        val result = transport.call("aggregate", dbName, collectionName, pipeline, options)
        return parseResults(result)
    }

    /**
     * Collects all results into a list asynchronously.
     */
    suspend fun toListAsync(): List<T> {
        val options = buildOptions()
        val result = transport.callAsync("aggregate", dbName, collectionName, pipeline, options)
        return parseResults(result)
    }

    /**
     * Returns results as a Flow.
     */
    fun asFlow(): Flow<T> = flow {
        val results = toListAsync()
        for (doc in results) {
            emit(doc)
        }
    }

    /**
     * Iterates over all results.
     */
    inline fun forEach(action: (T) -> Unit) {
        toList().forEach(action)
    }

    /**
     * Gets the current pipeline.
     */
    fun getPipeline(): List<Document> = pipeline.toList()

    private fun buildOptions(): Document {
        val options = Document()
        allowDiskUse?.let { options["allowDiskUse"] = it }
        batchSize?.let { options["batchSize"] = it }
        maxTimeMs?.let { options["maxTimeMS"] = it }
        comment?.let { options["comment"] = it }
        return options
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseResults(result: Any?): List<T> {
        return when (result) {
            is List<*> -> result.mapNotNull { item ->
                when {
                    documentClass.isInstance(item) -> item as T
                    item is Map<*, *> -> Document(item as Map<String, Any?>) as T
                    else -> null
                }
            }
            else -> emptyList()
        }
    }
}

// =========================================================================
// Aggregation Helpers
// =========================================================================

/**
 * Creates a $sum accumulator.
 */
fun sumOf(expression: Any?): Document = Document("\$sum", expression)

/**
 * Creates an $avg accumulator.
 */
fun avgOf(expression: Any?): Document = Document("\$avg", expression)

/**
 * Creates a $min accumulator.
 */
fun minOf(expression: Any?): Document = Document("\$min", expression)

/**
 * Creates a $max accumulator.
 */
fun maxOf(expression: Any?): Document = Document("\$max", expression)

/**
 * Creates a $first accumulator.
 */
fun firstOf(expression: Any?): Document = Document("\$first", expression)

/**
 * Creates a $last accumulator.
 */
fun lastOf(expression: Any?): Document = Document("\$last", expression)

/**
 * Creates a $push accumulator.
 */
fun pushOf(expression: Any?): Document = Document("\$push", expression)

/**
 * Creates an $addToSet accumulator.
 */
fun addToSetOf(expression: Any?): Document = Document("\$addToSet", expression)

/**
 * Creates a $count accumulator.
 */
fun countAccumulator(): Document = Document("\$sum", 1)

/**
 * References a field in aggregation expressions.
 */
fun field(name: String): String = if (name.startsWith("$")) name else "\$$name"
