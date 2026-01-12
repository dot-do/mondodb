package do_.mongo

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/**
 * MongoDB Collection - provides CRUD operations with coroutines support.
 *
 * Example usage:
 * ```kotlin
 * val collection = db.getCollection<Document>("users")
 *
 * // Insert
 * collection.insertOne(document {
 *     "name" to "John"
 *     "age" to 30
 * })
 *
 * // Find with DSL
 * val users = collection.find {
 *     "status" eq "active"
 *     "age" gte 18
 * }.sort(Sorts.descending("createdAt"))
 *   .limit(10)
 *   .toList()
 *
 * // Update
 * collection.updateOne(
 *     filter { "name" eq "John" },
 *     update { "age" inc 1 }
 * )
 *
 * // Async operations
 * val result = collection.insertOneAsync(doc)
 * ```
 */
class MongoCollection<T : Any>(
    internal val transport: RpcTransport,
    internal val dbName: String,
    internal val collectionName: String,
    internal val documentClass: Class<T>
) {
    /**
     * Gets the collection namespace.
     */
    val namespace: String get() = "$dbName.$collectionName"

    /**
     * Gets the collection name.
     */
    val name: String get() = collectionName

    // =========================================================================
    // Insert Operations
    // =========================================================================

    /**
     * Inserts a single document.
     */
    fun insertOne(document: T): InsertOneResult {
        val doc = toDocument(document)
        val result = transport.call("insertOne", dbName, collectionName, doc)
        return InsertOneResult.fromDocument(result)
    }

    /**
     * Inserts a single document asynchronously.
     */
    suspend fun insertOneAsync(document: T): InsertOneResult {
        val doc = toDocument(document)
        val result = transport.callAsync("insertOne", dbName, collectionName, doc)
        return InsertOneResult.fromDocument(result)
    }

    /**
     * Inserts multiple documents.
     */
    fun insertMany(documents: List<T>): InsertManyResult {
        val docs = documents.map { toDocument(it) }
        val result = transport.call("insertMany", dbName, collectionName, docs)
        return InsertManyResult.fromDocument(result)
    }

    /**
     * Inserts multiple documents asynchronously.
     */
    suspend fun insertManyAsync(documents: List<T>): InsertManyResult {
        val docs = documents.map { toDocument(it) }
        val result = transport.callAsync("insertMany", dbName, collectionName, docs)
        return InsertManyResult.fromDocument(result)
    }

    /**
     * Inserts multiple documents using vararg.
     */
    fun insertMany(vararg documents: T): InsertManyResult = insertMany(documents.toList())

    // =========================================================================
    // Find Operations
    // =========================================================================

    /**
     * Finds all documents.
     */
    fun find(): FindIterable<T> = FindIterable(transport, dbName, collectionName, Document(), documentClass)

    /**
     * Finds documents matching a filter.
     */
    fun find(filter: Bson): FindIterable<T> =
        FindIterable(transport, dbName, collectionName, filter.toBsonDocument(), documentClass)

    /**
     * Finds documents matching a filter.
     */
    fun find(filter: Document): FindIterable<T> =
        FindIterable(transport, dbName, collectionName, filter, documentClass)

    /**
     * Finds documents using filter DSL.
     */
    inline fun find(block: FilterBuilder.() -> Unit): FindIterable<T> =
        find(filter(block))

    /**
     * Finds a single document.
     */
    fun findOne(filter: Bson): T? = find(filter).first()

    /**
     * Finds a single document.
     */
    fun findOne(filter: Document): T? = find(filter).first()

    /**
     * Finds a single document using filter DSL.
     */
    inline fun findOne(block: FilterBuilder.() -> Unit): T? = findOne(filter(block))

    /**
     * Finds a single document asynchronously.
     */
    suspend fun findOneAsync(filter: Bson): T? = find(filter).firstAsync()

    /**
     * Finds a document by ID.
     */
    fun findById(id: Any): T? = findOne(Document("_id", id))

    /**
     * Finds a document by ID asynchronously.
     */
    suspend fun findByIdAsync(id: Any): T? = findOneAsync(Filters.eq("_id", id))

    // =========================================================================
    // Update Operations
    // =========================================================================

    /**
     * Updates a single document.
     */
    fun updateOne(filter: Bson, update: Bson, upsert: Boolean = false): UpdateResult {
        val options = Document("upsert", upsert)
        val result = transport.call("updateOne", dbName, collectionName,
            filter.toBsonDocument(), update.toBsonDocument(), options)
        return UpdateResult.fromDocument(result)
    }

    /**
     * Updates a single document asynchronously.
     */
    suspend fun updateOneAsync(filter: Bson, update: Bson, upsert: Boolean = false): UpdateResult {
        val options = Document("upsert", upsert)
        val result = transport.callAsync("updateOne", dbName, collectionName,
            filter.toBsonDocument(), update.toBsonDocument(), options)
        return UpdateResult.fromDocument(result)
    }

    /**
     * Updates a single document using DSL.
     */
    inline fun updateOne(
        filterBlock: FilterBuilder.() -> Unit,
        updateBlock: UpdateBuilder.() -> Unit,
        upsert: Boolean = false
    ): UpdateResult = updateOne(filter(filterBlock), update(updateBlock), upsert)

    /**
     * Updates multiple documents.
     */
    fun updateMany(filter: Bson, update: Bson, upsert: Boolean = false): UpdateResult {
        val options = Document("upsert", upsert)
        val result = transport.call("updateMany", dbName, collectionName,
            filter.toBsonDocument(), update.toBsonDocument(), options)
        return UpdateResult.fromDocument(result)
    }

    /**
     * Updates multiple documents asynchronously.
     */
    suspend fun updateManyAsync(filter: Bson, update: Bson, upsert: Boolean = false): UpdateResult {
        val options = Document("upsert", upsert)
        val result = transport.callAsync("updateMany", dbName, collectionName,
            filter.toBsonDocument(), update.toBsonDocument(), options)
        return UpdateResult.fromDocument(result)
    }

    /**
     * Updates multiple documents using DSL.
     */
    inline fun updateMany(
        filterBlock: FilterBuilder.() -> Unit,
        updateBlock: UpdateBuilder.() -> Unit,
        upsert: Boolean = false
    ): UpdateResult = updateMany(filter(filterBlock), update(updateBlock), upsert)

    /**
     * Replaces a single document.
     */
    fun replaceOne(filter: Bson, replacement: T, upsert: Boolean = false): UpdateResult {
        val options = Document("upsert", upsert)
        val result = transport.call("replaceOne", dbName, collectionName,
            filter.toBsonDocument(), toDocument(replacement), options)
        return UpdateResult.fromDocument(result)
    }

    /**
     * Replaces a single document asynchronously.
     */
    suspend fun replaceOneAsync(filter: Bson, replacement: T, upsert: Boolean = false): UpdateResult {
        val options = Document("upsert", upsert)
        val result = transport.callAsync("replaceOne", dbName, collectionName,
            filter.toBsonDocument(), toDocument(replacement), options)
        return UpdateResult.fromDocument(result)
    }

    // =========================================================================
    // Find and Modify Operations
    // =========================================================================

    /**
     * Finds a document and updates it, returning the original.
     */
    fun findOneAndUpdate(filter: Bson, update: Bson, returnAfter: Boolean = false): T? {
        val options = Document("returnDocument", if (returnAfter) "after" else "before")
        val result = transport.call("findOneAndUpdate", dbName, collectionName,
            filter.toBsonDocument(), update.toBsonDocument(), options)
        return resultToDocument(result)
    }

    /**
     * Finds a document and updates it asynchronously.
     */
    suspend fun findOneAndUpdateAsync(filter: Bson, update: Bson, returnAfter: Boolean = false): T? {
        val options = Document("returnDocument", if (returnAfter) "after" else "before")
        val result = transport.callAsync("findOneAndUpdate", dbName, collectionName,
            filter.toBsonDocument(), update.toBsonDocument(), options)
        return resultToDocument(result)
    }

    /**
     * Finds a document and deletes it.
     */
    fun findOneAndDelete(filter: Bson): T? {
        val result = transport.call("findOneAndDelete", dbName, collectionName, filter.toBsonDocument())
        return resultToDocument(result)
    }

    /**
     * Finds a document and deletes it asynchronously.
     */
    suspend fun findOneAndDeleteAsync(filter: Bson): T? {
        val result = transport.callAsync("findOneAndDelete", dbName, collectionName, filter.toBsonDocument())
        return resultToDocument(result)
    }

    /**
     * Finds a document and replaces it.
     */
    fun findOneAndReplace(filter: Bson, replacement: T, returnAfter: Boolean = false): T? {
        val options = Document("returnDocument", if (returnAfter) "after" else "before")
        val result = transport.call("findOneAndReplace", dbName, collectionName,
            filter.toBsonDocument(), toDocument(replacement), options)
        return resultToDocument(result)
    }

    // =========================================================================
    // Delete Operations
    // =========================================================================

    /**
     * Deletes a single document.
     */
    fun deleteOne(filter: Bson): DeleteResult {
        val result = transport.call("deleteOne", dbName, collectionName, filter.toBsonDocument())
        return DeleteResult.fromDocument(result)
    }

    /**
     * Deletes a single document asynchronously.
     */
    suspend fun deleteOneAsync(filter: Bson): DeleteResult {
        val result = transport.callAsync("deleteOne", dbName, collectionName, filter.toBsonDocument())
        return DeleteResult.fromDocument(result)
    }

    /**
     * Deletes a single document using DSL.
     */
    inline fun deleteOne(block: FilterBuilder.() -> Unit): DeleteResult =
        deleteOne(filter(block))

    /**
     * Deletes multiple documents.
     */
    fun deleteMany(filter: Bson): DeleteResult {
        val result = transport.call("deleteMany", dbName, collectionName, filter.toBsonDocument())
        return DeleteResult.fromDocument(result)
    }

    /**
     * Deletes multiple documents asynchronously.
     */
    suspend fun deleteManyAsync(filter: Bson): DeleteResult {
        val result = transport.callAsync("deleteMany", dbName, collectionName, filter.toBsonDocument())
        return DeleteResult.fromDocument(result)
    }

    /**
     * Deletes multiple documents using DSL.
     */
    inline fun deleteMany(block: FilterBuilder.() -> Unit): DeleteResult =
        deleteMany(filter(block))

    /**
     * Deletes a document by ID.
     */
    fun deleteById(id: Any): DeleteResult = deleteOne(Filters.eq("_id", id))

    // =========================================================================
    // Count Operations
    // =========================================================================

    /**
     * Counts all documents.
     */
    fun countDocuments(): Long {
        val result = transport.call("countDocuments", dbName, collectionName, Document(), Document())
        return (result as? Number)?.toLong() ?: 0L
    }

    /**
     * Counts documents matching a filter.
     */
    fun countDocuments(filter: Bson): Long {
        val result = transport.call("countDocuments", dbName, collectionName, filter.toBsonDocument(), Document())
        return (result as? Number)?.toLong() ?: 0L
    }

    /**
     * Counts documents asynchronously.
     */
    suspend fun countDocumentsAsync(filter: Bson = Filters.empty()): Long {
        val result = transport.callAsync("countDocuments", dbName, collectionName, filter.toBsonDocument(), Document())
        return (result as? Number)?.toLong() ?: 0L
    }

    /**
     * Gets an estimated document count.
     */
    fun estimatedDocumentCount(): Long {
        val result = transport.call("estimatedDocumentCount", dbName, collectionName)
        return (result as? Number)?.toLong() ?: 0L
    }

    // =========================================================================
    // Aggregation Operations
    // =========================================================================

    /**
     * Creates an aggregation pipeline builder.
     */
    @Suppress("UNCHECKED_CAST")
    fun aggregate(): AggregateIterable<Document> =
        AggregateIterable(transport, dbName, collectionName, Document::class.java)

    /**
     * Runs an aggregation pipeline.
     */
    @Suppress("UNCHECKED_CAST")
    fun aggregate(pipeline: List<Document>): List<Document> {
        val result = transport.call("aggregate", dbName, collectionName, pipeline, Document())
        return when (result) {
            is List<*> -> result.mapNotNull { item ->
                when (item) {
                    is Document -> item
                    is Map<*, *> -> Document(item as Map<String, Any?>)
                    else -> null
                }
            }
            else -> emptyList()
        }
    }

    /**
     * Runs an aggregation pipeline asynchronously.
     */
    @Suppress("UNCHECKED_CAST")
    suspend fun aggregateAsync(pipeline: List<Document>): List<Document> {
        val result = transport.callAsync("aggregate", dbName, collectionName, pipeline, Document())
        return when (result) {
            is List<*> -> result.mapNotNull { item ->
                when (item) {
                    is Document -> item
                    is Map<*, *> -> Document(item as Map<String, Any?>)
                    else -> null
                }
            }
            else -> emptyList()
        }
    }

    // =========================================================================
    // Distinct Operations
    // =========================================================================

    /**
     * Gets distinct values for a field.
     */
    @Suppress("UNCHECKED_CAST")
    fun <V> distinct(fieldName: String, filter: Bson = Filters.empty()): List<V> {
        val result = transport.call("distinct", dbName, collectionName, fieldName, filter.toBsonDocument())
        return (result as? List<V>) ?: emptyList()
    }

    /**
     * Gets distinct values for a field asynchronously.
     */
    @Suppress("UNCHECKED_CAST")
    suspend fun <V> distinctAsync(fieldName: String, filter: Bson = Filters.empty()): List<V> {
        val result = transport.callAsync("distinct", dbName, collectionName, fieldName, filter.toBsonDocument())
        return (result as? List<V>) ?: emptyList()
    }

    // =========================================================================
    // Index Operations
    // =========================================================================

    /**
     * Creates an index.
     */
    fun createIndex(keys: Bson, options: Document = Document()): String {
        val result = transport.call("createIndex", dbName, collectionName, keys.toBsonDocument(), options)
        return result?.toString() ?: ""
    }

    /**
     * Creates an index asynchronously.
     */
    suspend fun createIndexAsync(keys: Bson, options: Document = Document()): String {
        val result = transport.callAsync("createIndex", dbName, collectionName, keys.toBsonDocument(), options)
        return result?.toString() ?: ""
    }

    /**
     * Drops an index.
     */
    fun dropIndex(indexName: String) {
        transport.call("dropIndex", dbName, collectionName, indexName)
    }

    /**
     * Drops all indexes.
     */
    fun dropIndexes() {
        transport.call("dropIndexes", dbName, collectionName)
    }

    /**
     * Lists all indexes.
     */
    @Suppress("UNCHECKED_CAST")
    fun listIndexes(): List<Document> {
        val result = transport.call("listIndexes", dbName, collectionName)
        return when (result) {
            is List<*> -> result.mapNotNull { item ->
                when (item) {
                    is Document -> item
                    is Map<*, *> -> Document(item as Map<String, Any?>)
                    else -> null
                }
            }
            else -> emptyList()
        }
    }

    // =========================================================================
    // Collection Operations
    // =========================================================================

    /**
     * Drops this collection.
     */
    fun drop() {
        transport.call("dropCollection", dbName, collectionName)
    }

    /**
     * Renames this collection.
     */
    fun rename(newName: String) {
        transport.call("renameCollection", dbName, collectionName, newName)
    }

    // =========================================================================
    // Watch (Change Streams)
    // =========================================================================

    /**
     * Watches for changes to this collection as a Flow.
     */
    fun watch(pipeline: List<Document> = emptyList()): Flow<Document> = flow {
        // In a real implementation, this would use change streams
        // For now, this is a placeholder that simulates the API
        throw UnsupportedOperationException("Change streams require a persistent connection")
    }

    // =========================================================================
    // Helper Methods
    // =========================================================================

    @Suppress("UNCHECKED_CAST")
    private fun toDocument(value: T): Document {
        return when (value) {
            is Document -> value
            is Map<*, *> -> Document(value as Map<String, Any?>)
            else -> throw IllegalArgumentException("Cannot convert ${value::class} to Document")
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun resultToDocument(result: Any?): T? {
        return when {
            result == null -> null
            documentClass.isInstance(result) -> result as T
            result is Map<*, *> -> Document(result as Map<String, Any?>) as T
            else -> null
        }
    }
}

// =========================================================================
// Extension Functions
// =========================================================================

/**
 * Gets a typed collection.
 */
inline fun <reified T : Any> MongoDatabase.getCollection(name: String): MongoCollection<T> =
    MongoCollection(transport, this.name, name, T::class.java)

/**
 * Converts a collection to use a different document type.
 */
inline fun <reified T : Any> MongoCollection<*>.withDocumentClass(): MongoCollection<T> =
    MongoCollection(transport, dbName, collectionName, T::class.java)
