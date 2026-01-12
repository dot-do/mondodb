package do_.mongo

import java.io.Closeable
import java.util.concurrent.ConcurrentHashMap

/**
 * MongoDB Client - the main entry point for database connections.
 *
 * Example usage:
 * ```kotlin
 * // Create client from connection string
 * val client = MongoClient.create("mongodb://localhost:27017")
 *
 * // Or using DSL
 * val client = mongoClient {
 *     connectionString = "mongodb://localhost:27017"
 *     database = "myapp"
 * }
 *
 * // Get a database
 * val db = client.getDatabase("myapp")
 *
 * // Get a collection
 * val users = db.getCollection<Document>("users")
 *
 * // Perform operations
 * users.insertOne(document { "name" to "John" })
 *
 * // Close when done
 * client.close()
 *
 * // Or use 'use' extension
 * MongoClient.create("mongodb://localhost:27017").use { client ->
 *     // operations
 * }
 * ```
 */
class MongoClient private constructor(
    private val settings: MongoClientSettings
) : Closeable {

    private val databases = ConcurrentHashMap<String, MongoDatabase>()
    private var transport: RpcTransport? = null
    private var connected = false
    private var closed = false
    private var defaultDatabase: String? = settings.defaultDatabase

    init {
        // Parse default database from connection string if not set
        if (defaultDatabase == null && settings.connectionString != null) {
            defaultDatabase = parseDatabase(settings.connectionString)
        }
    }

    /**
     * Creates and connects to the database.
     */
    fun connect(): MongoClient {
        if (connected) return this
        if (closed) throw MongoException("Client is closed")

        try {
            transport = MockRpcTransport()
            transport?.call("connect", settings.connectionString)
            connected = true
            return this
        } catch (e: Exception) {
            throw MongoConnectionException("Failed to connect: ${e.message}", e)
        }
    }

    /**
     * Creates and connects to the database asynchronously.
     */
    suspend fun connectAsync(): MongoClient {
        if (connected) return this
        if (closed) throw MongoException("Client is closed")

        try {
            transport = MockRpcTransport()
            transport?.callAsync("connect", settings.connectionString)
            connected = true
            return this
        } catch (e: Exception) {
            throw MongoConnectionException("Failed to connect: ${e.message}", e)
        }
    }

    /**
     * Gets a database by name.
     */
    fun getDatabase(name: String): MongoDatabase {
        ensureConnected()
        return databases.getOrPut(name) { MongoDatabase(transport!!, name) }
    }

    /**
     * Gets the default database (from connection string).
     */
    fun getDatabase(): MongoDatabase = getDatabase(defaultDatabase ?: "test")

    /**
     * Lists all database names.
     */
    @Suppress("UNCHECKED_CAST")
    fun listDatabaseNames(): List<String> {
        ensureConnected()
        val result = transport?.call("listDatabases")
        return extractDatabaseNames(result)
    }

    /**
     * Lists all database names asynchronously.
     */
    @Suppress("UNCHECKED_CAST")
    suspend fun listDatabaseNamesAsync(): List<String> {
        ensureConnected()
        val result = transport?.callAsync("listDatabases")
        return extractDatabaseNames(result)
    }

    /**
     * Lists all databases with full info.
     */
    @Suppress("UNCHECKED_CAST")
    fun listDatabases(): List<Document> {
        ensureConnected()
        val result = transport?.call("listDatabases")
        return extractDatabases(result)
    }

    /**
     * Lists all databases with full info asynchronously.
     */
    @Suppress("UNCHECKED_CAST")
    suspend fun listDatabasesAsync(): List<Document> {
        ensureConnected()
        val result = transport?.callAsync("listDatabases")
        return extractDatabases(result)
    }

    /**
     * Drops a database.
     */
    fun dropDatabase(databaseName: String) {
        ensureConnected()
        transport?.call("dropDatabase", databaseName)
        databases.remove(databaseName)
    }

    /**
     * Drops a database asynchronously.
     */
    suspend fun dropDatabaseAsync(databaseName: String) {
        ensureConnected()
        transport?.callAsync("dropDatabase", databaseName)
        databases.remove(databaseName)
    }

    /**
     * Pings the server.
     */
    fun ping(): Boolean {
        ensureConnected()
        return try {
            val result = transport?.call("ping")
            when (result) {
                is Document -> result.getInt("ok") == 1
                is Map<*, *> -> (result["ok"] as? Number)?.toInt() == 1
                else -> true
            }
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Pings the server asynchronously.
     */
    suspend fun pingAsync(): Boolean {
        ensureConnected()
        return try {
            val result = transport?.callAsync("ping")
            when (result) {
                is Document -> result.getInt("ok") == 1
                is Map<*, *> -> (result["ok"] as? Number)?.toInt() == 1
                else -> true
            }
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Gets the server status.
     */
    @Suppress("UNCHECKED_CAST")
    fun getServerStatus(): Document {
        ensureConnected()
        val result = transport?.call("serverStatus")
        return when (result) {
            is Document -> result
            is Map<*, *> -> Document(result as Map<String, Any?>)
            else -> Document()
        }
    }

    /**
     * Checks if the client is connected.
     */
    val isConnected: Boolean get() = connected && !closed

    /**
     * Gets the settings.
     */
    fun getSettings(): MongoClientSettings = settings

    /**
     * Sets a custom transport (for testing).
     */
    fun setTransport(transport: RpcTransport) {
        this.transport = transport
        this.connected = true
    }

    /**
     * Gets the transport (for testing).
     */
    fun getTransport(): RpcTransport? = transport

    override fun close() {
        if (closed) return
        closed = true
        connected = false
        transport?.close()
        transport = null
        databases.clear()
    }

    private fun ensureConnected() {
        if (closed) throw MongoException("Client is closed")
        if (!connected) connect()
    }

    @Suppress("UNCHECKED_CAST")
    private fun extractDatabaseNames(result: Any?): List<String> {
        val dbs = when (result) {
            is Document -> result["databases"]
            is Map<*, *> -> result["databases"]
            else -> null
        }
        return when (dbs) {
            is List<*> -> dbs.mapNotNull { db ->
                when (db) {
                    is Document -> db.getString("name")
                    is Map<*, *> -> db["name"]?.toString()
                    else -> null
                }
            }
            else -> emptyList()
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun extractDatabases(result: Any?): List<Document> {
        val dbs = when (result) {
            is Document -> result["databases"]
            is Map<*, *> -> result["databases"]
            else -> null
        }
        return when (dbs) {
            is List<*> -> dbs.mapNotNull { db ->
                when (db) {
                    is Document -> db
                    is Map<*, *> -> Document(db as Map<String, Any?>)
                    else -> null
                }
            }
            else -> emptyList()
        }
    }

    private fun parseDatabase(connectionString: String): String? {
        val regex = Regex("^mongodb(?:\\+srv)?://[^/]+/([^?]+)")
        return regex.find(connectionString)?.groupValues?.getOrNull(1)
    }

    companion object {
        /**
         * Creates a MongoClient from a connection string.
         */
        fun create(connectionString: String): MongoClient {
            val settings = MongoClientSettings(connectionString = connectionString)
            return MongoClient(settings)
        }

        /**
         * Creates a MongoClient from settings.
         */
        fun create(settings: MongoClientSettings): MongoClient {
            return MongoClient(settings)
        }

        /**
         * Creates and connects a MongoClient asynchronously.
         */
        suspend fun connectAsync(connectionString: String): MongoClient {
            return create(connectionString).connectAsync()
        }
    }
}

/**
 * Client settings.
 */
data class MongoClientSettings(
    val connectionString: String? = null,
    val host: String = "localhost",
    val port: Int = 27017,
    val defaultDatabase: String? = null,
    val username: String? = null,
    val password: String? = null,
    val authDatabase: String? = null,
    val connectTimeoutMs: Long = 10000,
    val socketTimeoutMs: Long = 0,
    val maxPoolSize: Int = 100,
    val minPoolSize: Int = 0,
    val retryWrites: Boolean = true,
    val retryReads: Boolean = true
) {
    companion object {
        fun fromConnectionString(connectionString: String): MongoClientSettings {
            return MongoClientSettings(connectionString = connectionString)
        }
    }
}

/**
 * DSL builder for MongoClient.
 */
@DocumentDsl
class MongoClientBuilder {
    var connectionString: String? = null
    var host: String = "localhost"
    var port: Int = 27017
    var database: String? = null
    var username: String? = null
    var password: String? = null
    var authDatabase: String? = null
    var connectTimeoutMs: Long = 10000
    var socketTimeoutMs: Long = 0
    var maxPoolSize: Int = 100
    var minPoolSize: Int = 0
    var retryWrites: Boolean = true
    var retryReads: Boolean = true

    fun build(): MongoClient {
        val settings = MongoClientSettings(
            connectionString = connectionString,
            host = host,
            port = port,
            defaultDatabase = database,
            username = username,
            password = password,
            authDatabase = authDatabase,
            connectTimeoutMs = connectTimeoutMs,
            socketTimeoutMs = socketTimeoutMs,
            maxPoolSize = maxPoolSize,
            minPoolSize = minPoolSize,
            retryWrites = retryWrites,
            retryReads = retryReads
        )
        return MongoClient.create(settings)
    }
}

/**
 * Creates a MongoClient using DSL syntax.
 */
inline fun mongoClient(block: MongoClientBuilder.() -> Unit): MongoClient =
    MongoClientBuilder().apply(block).build()

/**
 * Creates a MongoClient and executes a block, closing the client afterwards.
 */
inline fun <T> withMongoClient(connectionString: String, block: (MongoClient) -> T): T {
    return MongoClient.create(connectionString).use { client ->
        client.connect()
        block(client)
    }
}

/**
 * Creates a MongoClient and executes a suspend block, closing the client afterwards.
 */
suspend inline fun <T> withMongoClientAsync(connectionString: String, block: (MongoClient) -> T): T {
    val client = MongoClient.connectAsync(connectionString)
    return try {
        block(client)
    } finally {
        client.close()
    }
}
