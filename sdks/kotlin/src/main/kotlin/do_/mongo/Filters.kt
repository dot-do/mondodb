package do_.mongo

/**
 * Filter builders for MongoDB queries.
 *
 * Example usage:
 * ```kotlin
 * import do_.mongo.Filters.*
 *
 * // Simple equality
 * val filter = eq("name", "John")
 *
 * // Comparison
 * val adults = gte("age", 18)
 *
 * // Logical operators
 * val query = and(
 *     eq("status", "active"),
 *     gte("age", 18),
 *     lt("age", 65)
 * )
 *
 * // Using DSL
 * val filter = filter {
 *     "status" eq "active"
 *     "age" gte 18
 * }
 * ```
 */
object Filters {

    // =========================================================================
    // Comparison Operators
    // =========================================================================

    /**
     * Creates an equality filter.
     */
    fun eq(field: String, value: Any?): Bson = SimpleFilter(field, value)

    /**
     * Creates a not-equal filter.
     */
    fun ne(field: String, value: Any?): Bson =
        Document(field, Document("\$ne", value))

    /**
     * Creates a greater-than filter.
     */
    fun gt(field: String, value: Any?): Bson =
        Document(field, Document("\$gt", value))

    /**
     * Creates a greater-than-or-equal filter.
     */
    fun gte(field: String, value: Any?): Bson =
        Document(field, Document("\$gte", value))

    /**
     * Creates a less-than filter.
     */
    fun lt(field: String, value: Any?): Bson =
        Document(field, Document("\$lt", value))

    /**
     * Creates a less-than-or-equal filter.
     */
    fun lte(field: String, value: Any?): Bson =
        Document(field, Document("\$lte", value))

    /**
     * Creates an in filter.
     */
    fun `in`(field: String, vararg values: Any?): Bson =
        Document(field, Document("\$in", values.toList()))

    /**
     * Creates an in filter with a collection.
     */
    fun `in`(field: String, values: Collection<Any?>): Bson =
        Document(field, Document("\$in", values.toList()))

    /**
     * Creates a not-in filter.
     */
    fun nin(field: String, vararg values: Any?): Bson =
        Document(field, Document("\$nin", values.toList()))

    /**
     * Creates a not-in filter with a collection.
     */
    fun nin(field: String, values: Collection<Any?>): Bson =
        Document(field, Document("\$nin", values.toList()))

    // =========================================================================
    // Logical Operators
    // =========================================================================

    /**
     * Creates an AND filter.
     */
    fun and(vararg filters: Bson): Bson =
        Document("\$and", filters.map { it.toBsonDocument() })

    /**
     * Creates an AND filter with a collection.
     */
    fun and(filters: Collection<Bson>): Bson =
        Document("\$and", filters.map { it.toBsonDocument() })

    /**
     * Creates an OR filter.
     */
    fun or(vararg filters: Bson): Bson =
        Document("\$or", filters.map { it.toBsonDocument() })

    /**
     * Creates an OR filter with a collection.
     */
    fun or(filters: Collection<Bson>): Bson =
        Document("\$or", filters.map { it.toBsonDocument() })

    /**
     * Creates a NOT filter.
     */
    fun not(filter: Bson): Bson {
        val doc = filter.toBsonDocument()
        val result = Document()
        for ((key, value) in doc) {
            result[key] = Document("\$not", value)
        }
        return result
    }

    /**
     * Creates a NOR filter.
     */
    fun nor(vararg filters: Bson): Bson =
        Document("\$nor", filters.map { it.toBsonDocument() })

    // =========================================================================
    // Element Operators
    // =========================================================================

    /**
     * Creates an exists filter.
     */
    fun exists(field: String, exists: Boolean = true): Bson =
        Document(field, Document("\$exists", exists))

    /**
     * Creates a type filter.
     */
    fun type(field: String, type: String): Bson =
        Document(field, Document("\$type", type))

    /**
     * Creates a type filter with BSON type number.
     */
    fun type(field: String, type: Int): Bson =
        Document(field, Document("\$type", type))

    // =========================================================================
    // String Operators
    // =========================================================================

    /**
     * Creates a regex filter.
     */
    fun regex(field: String, pattern: String, options: String = ""): Bson =
        Document(field, Document("\$regex", pattern).apply {
            if (options.isNotEmpty()) append("\$options", options)
        })

    /**
     * Creates a text search filter.
     */
    fun text(search: String, language: String? = null, caseSensitive: Boolean? = null): Bson {
        val textDoc = Document("\$search", search)
        language?.let { textDoc.append("\$language", it) }
        caseSensitive?.let { textDoc.append("\$caseSensitive", it) }
        return Document("\$text", textDoc)
    }

    // =========================================================================
    // Array Operators
    // =========================================================================

    /**
     * Creates an all filter (array contains all values).
     */
    fun all(field: String, vararg values: Any?): Bson =
        Document(field, Document("\$all", values.toList()))

    /**
     * Creates an all filter with a collection.
     */
    fun all(field: String, values: Collection<Any?>): Bson =
        Document(field, Document("\$all", values.toList()))

    /**
     * Creates an elemMatch filter.
     */
    fun elemMatch(field: String, filter: Bson): Bson =
        Document(field, Document("\$elemMatch", filter.toBsonDocument()))

    /**
     * Creates a size filter.
     */
    fun size(field: String, size: Int): Bson =
        Document(field, Document("\$size", size))

    // =========================================================================
    // Geospatial Operators
    // =========================================================================

    /**
     * Creates a near filter for geospatial queries.
     */
    fun near(field: String, x: Double, y: Double, maxDistance: Double? = null, minDistance: Double? = null): Bson {
        val nearDoc = Document("\$geometry", Document("type", "Point").append("coordinates", listOf(x, y)))
        maxDistance?.let { nearDoc.append("\$maxDistance", it) }
        minDistance?.let { nearDoc.append("\$minDistance", it) }
        return Document(field, Document("\$near", nearDoc))
    }

    /**
     * Creates a geoWithin filter.
     */
    fun geoWithin(field: String, geometry: Document): Bson =
        Document(field, Document("\$geoWithin", Document("\$geometry", geometry)))

    // =========================================================================
    // Bitwise Operators
    // =========================================================================

    /**
     * Creates a bitsAllClear filter.
     */
    fun bitsAllClear(field: String, bitmask: Long): Bson =
        Document(field, Document("\$bitsAllClear", bitmask))

    /**
     * Creates a bitsAllSet filter.
     */
    fun bitsAllSet(field: String, bitmask: Long): Bson =
        Document(field, Document("\$bitsAllSet", bitmask))

    /**
     * Creates a bitsAnyClear filter.
     */
    fun bitsAnyClear(field: String, bitmask: Long): Bson =
        Document(field, Document("\$bitsAnyClear", bitmask))

    /**
     * Creates a bitsAnySet filter.
     */
    fun bitsAnySet(field: String, bitmask: Long): Bson =
        Document(field, Document("\$bitsAnySet", bitmask))

    // =========================================================================
    // Misc
    // =========================================================================

    /**
     * Creates a filter that matches all documents.
     */
    fun empty(): Bson = Document()

    /**
     * Creates a filter from a raw document.
     */
    fun raw(document: Document): Bson = document

    /**
     * Simple filter wrapper for equality.
     */
    private class SimpleFilter(private val field: String, private val value: Any?) : Bson {
        override fun toBsonDocument(): Document = Document(field, value)
    }
}

// =========================================================================
// DSL Support
// =========================================================================

/**
 * Filter DSL builder.
 */
@DocumentDsl
class FilterBuilder {
    private val filters = mutableListOf<Bson>()

    infix fun String.eq(value: Any?) {
        filters.add(Filters.eq(this, value))
    }

    infix fun String.ne(value: Any?) {
        filters.add(Filters.ne(this, value))
    }

    infix fun String.gt(value: Any?) {
        filters.add(Filters.gt(this, value))
    }

    infix fun String.gte(value: Any?) {
        filters.add(Filters.gte(this, value))
    }

    infix fun String.lt(value: Any?) {
        filters.add(Filters.lt(this, value))
    }

    infix fun String.lte(value: Any?) {
        filters.add(Filters.lte(this, value))
    }

    infix fun String.`in`(values: Collection<Any?>) {
        filters.add(Filters.`in`(this, values))
    }

    infix fun String.nin(values: Collection<Any?>) {
        filters.add(Filters.nin(this, values))
    }

    infix fun String.regex(pattern: String) {
        filters.add(Filters.regex(this, pattern))
    }

    fun String.exists(exists: Boolean = true) {
        filters.add(Filters.exists(this, exists))
    }

    fun and(block: FilterBuilder.() -> Unit) {
        val builder = FilterBuilder().apply(block)
        filters.add(Filters.and(builder.build()))
    }

    fun or(block: FilterBuilder.() -> Unit) {
        val builder = FilterBuilder().apply(block)
        filters.add(Filters.or(builder.build()))
    }

    internal fun build(): List<Bson> = filters

    internal fun toBson(): Bson = when (filters.size) {
        0 -> Filters.empty()
        1 -> filters.first()
        else -> Filters.and(filters)
    }
}

/**
 * Creates a filter using DSL syntax.
 */
inline fun filter(block: FilterBuilder.() -> Unit): Bson =
    FilterBuilder().apply(block).toBson()
