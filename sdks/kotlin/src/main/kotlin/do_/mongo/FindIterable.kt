package do_.mongo

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/**
 * Iterable for find operations with fluent configuration.
 *
 * Example usage:
 * ```kotlin
 * val users = collection.find(Filters.eq("status", "active"))
 *     .sort(Sorts.descending("createdAt"))
 *     .limit(10)
 *     .projection(Projections.include("name", "email"))
 *     .toList()
 *
 * // Or as a Flow
 * collection.find()
 *     .asFlow()
 *     .collect { doc -> println(doc) }
 * ```
 */
class FindIterable<T : Any>(
    private val transport: RpcTransport,
    private val dbName: String,
    private val collectionName: String,
    private var filter: Document,
    private val documentClass: Class<T>
) {
    private var projection: Document? = null
    private var sort: Document? = null
    private var limit: Int? = null
    private var skip: Int? = null
    private var batchSize: Int? = null
    private var hint: Document? = null
    private var comment: String? = null
    private var maxTimeMs: Long? = null

    /**
     * Sets the query filter.
     */
    fun filter(filter: Bson): FindIterable<T> = apply {
        this.filter = filter.toBsonDocument()
    }

    /**
     * Sets the projection.
     */
    fun projection(projection: Bson): FindIterable<T> = apply {
        this.projection = projection.toBsonDocument()
    }

    /**
     * Sets the sort order.
     */
    fun sort(sort: Bson): FindIterable<T> = apply {
        this.sort = sort.toBsonDocument()
    }

    /**
     * Sets the maximum number of documents to return.
     */
    fun limit(limit: Int): FindIterable<T> = apply {
        this.limit = limit
    }

    /**
     * Sets the number of documents to skip.
     */
    fun skip(skip: Int): FindIterable<T> = apply {
        this.skip = skip
    }

    /**
     * Sets the batch size for the cursor.
     */
    fun batchSize(batchSize: Int): FindIterable<T> = apply {
        this.batchSize = batchSize
    }

    /**
     * Sets an index hint.
     */
    fun hint(hint: Bson): FindIterable<T> = apply {
        this.hint = hint.toBsonDocument()
    }

    /**
     * Sets a comment for the query.
     */
    fun comment(comment: String): FindIterable<T> = apply {
        this.comment = comment
    }

    /**
     * Sets the maximum execution time.
     */
    fun maxTime(maxTimeMs: Long): FindIterable<T> = apply {
        this.maxTimeMs = maxTimeMs
    }

    /**
     * Gets the first document.
     */
    fun first(): T? {
        val options = buildOptions().apply { put("limit", 1) }
        val result = transport.call("find", dbName, collectionName, filter, options)
        return parseFirst(result)
    }

    /**
     * Gets the first document asynchronously.
     */
    suspend fun firstAsync(): T? {
        val options = buildOptions().apply { put("limit", 1) }
        val result = transport.callAsync("find", dbName, collectionName, filter, options)
        return parseFirst(result)
    }

    /**
     * Collects all documents into a list.
     */
    fun toList(): List<T> {
        val result = transport.call("find", dbName, collectionName, filter, buildOptions())
        return parseResults(result)
    }

    /**
     * Collects all documents into a list asynchronously.
     */
    suspend fun toListAsync(): List<T> {
        val result = transport.callAsync("find", dbName, collectionName, filter, buildOptions())
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
     * Iterates over all documents.
     */
    inline fun forEach(action: (T) -> Unit) {
        toList().forEach(action)
    }

    /**
     * Iterates over all documents asynchronously.
     */
    suspend inline fun forEachAsync(action: (T) -> Unit) {
        toListAsync().forEach(action)
    }

    /**
     * Counts the matching documents.
     */
    fun count(): Long {
        val result = transport.call("countDocuments", dbName, collectionName, filter, Document())
        return (result as? Number)?.toLong() ?: 0L
    }

    /**
     * Counts the matching documents asynchronously.
     */
    suspend fun countAsync(): Long {
        val result = transport.callAsync("countDocuments", dbName, collectionName, filter, Document())
        return (result as? Number)?.toLong() ?: 0L
    }

    private fun buildOptions(): Document {
        val options = Document()
        projection?.let { options["projection"] = it }
        sort?.let { options["sort"] = it }
        limit?.let { options["limit"] = it }
        skip?.let { options["skip"] = it }
        batchSize?.let { options["batchSize"] = it }
        hint?.let { options["hint"] = it }
        comment?.let { options["comment"] = it }
        maxTimeMs?.let { options["maxTimeMS"] = it }
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

    @Suppress("UNCHECKED_CAST")
    private fun parseFirst(result: Any?): T? {
        return when (result) {
            is List<*> -> result.firstOrNull()?.let { item ->
                when {
                    documentClass.isInstance(item) -> item as T
                    item is Map<*, *> -> Document(item as Map<String, Any?>) as T
                    else -> null
                }
            }
            else -> null
        }
    }
}
