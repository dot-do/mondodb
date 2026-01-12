package do_.mongo

import kotlinx.serialization.json.*
import java.time.Instant

/**
 * MongoDB Document - a flexible document representation.
 *
 * Example usage:
 * ```kotlin
 * val doc = document {
 *     "name" to "John"
 *     "age" to 30
 *     "email" to "john@example.com"
 *     "address" to document {
 *         "city" to "New York"
 *         "zip" to "10001"
 *     }
 * }
 * ```
 */
class Document private constructor(
    private val data: MutableMap<String, Any?>
) : MutableMap<String, Any?> by data, Bson {

    constructor() : this(LinkedHashMap())

    constructor(key: String, value: Any?) : this(LinkedHashMap<String, Any?>().apply { put(key, value) })

    constructor(map: Map<String, Any?>) : this(LinkedHashMap(map))

    /**
     * Appends a key-value pair and returns this document for chaining.
     */
    fun append(key: String, value: Any?): Document {
        data[key] = value
        return this
    }

    /**
     * Gets the document ID as a string.
     */
    val id: String?
        get() = when (val idValue = get("_id")) {
            is ObjectId -> idValue.hexString
            is String -> idValue
            null -> null
            else -> idValue.toString()
        }

    /**
     * Gets a value as String.
     */
    fun getString(key: String): String? = get(key)?.toString()

    /**
     * Gets a value as String with default.
     */
    fun getString(key: String, default: String): String = getString(key) ?: default

    /**
     * Gets a value as Int.
     */
    fun getInt(key: String): Int? = when (val value = get(key)) {
        is Number -> value.toInt()
        is String -> value.toIntOrNull()
        else -> null
    }

    /**
     * Gets a value as Int with default.
     */
    fun getInt(key: String, default: Int): Int = getInt(key) ?: default

    /**
     * Gets a value as Long.
     */
    fun getLong(key: String): Long? = when (val value = get(key)) {
        is Number -> value.toLong()
        is String -> value.toLongOrNull()
        else -> null
    }

    /**
     * Gets a value as Long with default.
     */
    fun getLong(key: String, default: Long): Long = getLong(key) ?: default

    /**
     * Gets a value as Double.
     */
    fun getDouble(key: String): Double? = when (val value = get(key)) {
        is Number -> value.toDouble()
        is String -> value.toDoubleOrNull()
        else -> null
    }

    /**
     * Gets a value as Double with default.
     */
    fun getDouble(key: String, default: Double): Double = getDouble(key) ?: default

    /**
     * Gets a value as Boolean.
     */
    fun getBoolean(key: String): Boolean? = when (val value = get(key)) {
        is Boolean -> value
        is String -> value.toBooleanStrictOrNull()
        else -> null
    }

    /**
     * Gets a value as Boolean with default.
     */
    fun getBoolean(key: String, default: Boolean): Boolean = getBoolean(key) ?: default

    /**
     * Gets a value as Instant.
     */
    fun getInstant(key: String): Instant? = when (val value = get(key)) {
        is Instant -> value
        is Number -> Instant.ofEpochMilli(value.toLong())
        is String -> runCatching { Instant.parse(value) }.getOrNull()
        else -> null
    }

    /**
     * Gets a value as a nested Document.
     */
    @Suppress("UNCHECKED_CAST")
    fun getDocument(key: String): Document? = when (val value = get(key)) {
        is Document -> value
        is Map<*, *> -> Document(value as Map<String, Any?>)
        else -> null
    }

    /**
     * Gets a value as ObjectId.
     */
    fun getObjectId(key: String): ObjectId? = when (val value = get(key)) {
        is ObjectId -> value
        is String -> runCatching { ObjectId(value) }.getOrNull()
        else -> null
    }

    /**
     * Gets a value as a List.
     */
    @Suppress("UNCHECKED_CAST")
    fun <T> getList(key: String): List<T>? = get(key) as? List<T>

    /**
     * Gets a typed value.
     */
    @Suppress("UNCHECKED_CAST")
    inline fun <reified T> getAs(key: String): T? = when {
        T::class == String::class -> getString(key) as? T
        T::class == Int::class -> getInt(key) as? T
        T::class == Long::class -> getLong(key) as? T
        T::class == Double::class -> getDouble(key) as? T
        T::class == Boolean::class -> getBoolean(key) as? T
        T::class == Document::class -> getDocument(key) as? T
        else -> get(key) as? T
    }

    /**
     * Converts to JSON string.
     */
    fun toJson(): String = buildJsonObject {
        for ((key, value) in data) {
            put(key, value.toJsonElement())
        }
    }.toString()

    override fun toBsonDocument(): Document = this

    override fun toString(): String = toJson()

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is Document) return false
        return data == other.data
    }

    override fun hashCode(): Int = data.hashCode()

    companion object {
        private val json = Json { ignoreUnknownKeys = true }

        /**
         * Parses a JSON string into a Document.
         */
        fun parse(jsonString: String): Document {
            val element = json.parseToJsonElement(jsonString)
            return fromJsonElement(element) as? Document ?: Document()
        }

        /**
         * Creates a Document from a JsonElement.
         */
        @Suppress("UNCHECKED_CAST")
        private fun fromJsonElement(element: JsonElement): Any? = when (element) {
            is JsonNull -> null
            is JsonPrimitive -> when {
                element.isString -> element.content
                element.booleanOrNull != null -> element.boolean
                element.longOrNull != null -> element.long
                element.doubleOrNull != null -> element.double
                else -> element.content
            }
            is JsonArray -> element.map { fromJsonElement(it) }
            is JsonObject -> Document(element.mapValues { (_, v) -> fromJsonElement(v) })
        }

        private fun Any?.toJsonElement(): JsonElement = when (this) {
            null -> JsonNull
            is JsonElement -> this
            is Boolean -> JsonPrimitive(this)
            is Number -> JsonPrimitive(this)
            is String -> JsonPrimitive(this)
            is ObjectId -> JsonPrimitive(this.hexString)
            is Document -> buildJsonObject {
                for ((k, v) in this@toJsonElement) {
                    put(k, v.toJsonElement())
                }
            }
            is Map<*, *> -> buildJsonObject {
                for ((k, v) in this@toJsonElement) {
                    put(k.toString(), v.toJsonElement())
                }
            }
            is List<*> -> buildJsonArray {
                for (item in this@toJsonElement) {
                    add(item.toJsonElement())
                }
            }
            is Array<*> -> buildJsonArray {
                for (item in this@toJsonElement) {
                    add(item.toJsonElement())
                }
            }
            else -> JsonPrimitive(toString())
        }
    }
}

/**
 * DSL builder for creating documents.
 */
@DslMarker
annotation class DocumentDsl

/**
 * Document builder for DSL syntax.
 */
@DocumentDsl
class DocumentBuilder {
    private val document = Document()

    /**
     * Adds a key-value pair using infix notation.
     */
    infix fun String.to(value: Any?) {
        document[this] = value
    }

    /**
     * Adds a nested document.
     */
    fun nested(key: String, block: DocumentBuilder.() -> Unit) {
        document[key] = DocumentBuilder().apply(block).build()
    }

    /**
     * Adds a list of values.
     */
    fun list(key: String, vararg values: Any?) {
        document[key] = values.toList()
    }

    /**
     * Adds a list with a builder.
     */
    fun list(key: String, block: MutableList<Any?>.() -> Unit) {
        document[key] = mutableListOf<Any?>().apply(block)
    }

    fun build(): Document = document
}

/**
 * Creates a Document using DSL syntax.
 *
 * Example:
 * ```kotlin
 * val doc = document {
 *     "name" to "John"
 *     "age" to 30
 *     nested("address") {
 *         "city" to "New York"
 *     }
 * }
 * ```
 */
inline fun document(block: DocumentBuilder.() -> Unit): Document =
    DocumentBuilder().apply(block).build()

/**
 * Creates a Document from key-value pairs.
 */
fun documentOf(vararg pairs: Pair<String, Any?>): Document =
    Document(pairs.toMap())

/**
 * Converts a Map to a Document.
 */
fun Map<String, Any?>.toDocument(): Document = Document(this)
