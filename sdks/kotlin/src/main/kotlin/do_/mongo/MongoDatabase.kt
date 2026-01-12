package do_.mongo

/**
 * MongoDB Database - provides access to collections.
 *
 * Example usage:
 * ```kotlin
 * val db = client.getDatabase("myapp")
 *
 * // Get a collection
 * val users = db.getCollection<Document>("users")
 *
 * // List collections
 * val collections = db.listCollectionNames()
 *
 * // Create a collection
 * db.createCollection("logs")
 * ```
 */
class MongoDatabase(
    internal val transport: RpcTransport,
    internal val dbName: String
) {
    /**
     * Gets the database name.
     */
    val name: String get() = dbName

    /**
     * Gets a collection by name.
     */
    fun getCollection(name: String): MongoCollection<Document> =
        MongoCollection(transport, dbName, name, Document::class.java)

    /**
     * Gets a typed collection.
     */
    fun <T : Any> getCollection(name: String, documentClass: Class<T>): MongoCollection<T> =
        MongoCollection(transport, dbName, name, documentClass)

    /**
     * Lists all collection names.
     */
    @Suppress("UNCHECKED_CAST")
    fun listCollectionNames(): List<String> {
        val result = transport.call("listCollections", dbName)
        return when (result) {
            is List<*> -> result.mapNotNull { item ->
                when (item) {
                    is Document -> item.getString("name")
                    is Map<*, *> -> item["name"]?.toString()
                    is String -> item
                    else -> null
                }
            }
            else -> emptyList()
        }
    }

    /**
     * Lists all collection names asynchronously.
     */
    @Suppress("UNCHECKED_CAST")
    suspend fun listCollectionNamesAsync(): List<String> {
        val result = transport.callAsync("listCollections", dbName)
        return when (result) {
            is List<*> -> result.mapNotNull { item ->
                when (item) {
                    is Document -> item.getString("name")
                    is Map<*, *> -> item["name"]?.toString()
                    is String -> item
                    else -> null
                }
            }
            else -> emptyList()
        }
    }

    /**
     * Lists all collections with full info.
     */
    @Suppress("UNCHECKED_CAST")
    fun listCollections(): List<Document> {
        val result = transport.call("listCollections", dbName)
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
     * Creates a new collection.
     */
    fun createCollection(name: String, options: Document = Document()) {
        transport.call("createCollection", dbName, name, options)
    }

    /**
     * Creates a new collection asynchronously.
     */
    suspend fun createCollectionAsync(name: String, options: Document = Document()) {
        transport.callAsync("createCollection", dbName, name, options)
    }

    /**
     * Drops the database.
     */
    fun drop() {
        transport.call("dropDatabase", dbName)
    }

    /**
     * Drops the database asynchronously.
     */
    suspend fun dropAsync() {
        transport.callAsync("dropDatabase", dbName)
    }

    /**
     * Runs a command on the database.
     */
    @Suppress("UNCHECKED_CAST")
    fun runCommand(command: Document): Document {
        val result = transport.call("runCommand", dbName, command)
        return when (result) {
            is Document -> result
            is Map<*, *> -> Document(result as Map<String, Any?>)
            else -> Document()
        }
    }

    /**
     * Runs a command on the database asynchronously.
     */
    @Suppress("UNCHECKED_CAST")
    suspend fun runCommandAsync(command: Document): Document {
        val result = transport.callAsync("runCommand", dbName, command)
        return when (result) {
            is Document -> result
            is Map<*, *> -> Document(result as Map<String, Any?>)
            else -> Document()
        }
    }

    override fun toString(): String = "MongoDatabase($dbName)"
}
