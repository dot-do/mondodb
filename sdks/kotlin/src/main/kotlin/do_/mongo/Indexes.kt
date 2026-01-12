package do_.mongo

/**
 * Index key builders for MongoDB.
 *
 * Example usage:
 * ```kotlin
 * import do_.mongo.Indexes.*
 *
 * // Single field ascending index
 * collection.createIndex(ascending("email"))
 *
 * // Compound index
 * collection.createIndex(compoundIndex(
 *     ascending("status"),
 *     descending("createdAt")
 * ))
 *
 * // Text index
 * collection.createIndex(text("content"))
 *
 * // Geospatial index
 * collection.createIndex(geo2dsphere("location"))
 * ```
 */
object Indexes {

    /**
     * Creates an ascending index on the specified fields.
     */
    fun ascending(vararg fields: String): Bson =
        Document(fields.associateWith { 1 })

    /**
     * Creates a descending index on the specified fields.
     */
    fun descending(vararg fields: String): Bson =
        Document(fields.associateWith { -1 })

    /**
     * Creates a 2dsphere geospatial index.
     */
    fun geo2dsphere(vararg fields: String): Bson =
        Document(fields.associateWith { "2dsphere" })

    /**
     * Creates a 2d geospatial index.
     */
    fun geo2d(field: String): Bson =
        Document(field, "2d")

    /**
     * Creates a text index on the specified fields.
     */
    fun text(vararg fields: String): Bson =
        Document(fields.associateWith { "text" })

    /**
     * Creates a text index on all string fields.
     */
    fun textAll(): Bson = Document("\$**", "text")

    /**
     * Creates a hashed index.
     */
    fun hashed(field: String): Bson =
        Document(field, "hashed")

    /**
     * Combines multiple index specifications into a compound index.
     */
    fun compoundIndex(vararg indexes: Bson): Bson {
        val combined = Document()
        for (index in indexes) {
            combined.putAll(index.toBsonDocument())
        }
        return combined
    }

    /**
     * Combines a collection of index specifications into a compound index.
     */
    fun compoundIndex(indexes: Collection<Bson>): Bson =
        compoundIndex(*indexes.toTypedArray())
}

/**
 * Index options builder.
 */
class IndexOptions {
    private val options = Document()

    /**
     * Sets the index name.
     */
    fun name(name: String): IndexOptions = apply {
        options["name"] = name
    }

    /**
     * Makes this a unique index.
     */
    fun unique(unique: Boolean = true): IndexOptions = apply {
        options["unique"] = unique
    }

    /**
     * Makes this a sparse index.
     */
    fun sparse(sparse: Boolean = true): IndexOptions = apply {
        options["sparse"] = sparse
    }

    /**
     * Makes this a background index (deprecated in MongoDB 4.2+).
     */
    fun background(background: Boolean = true): IndexOptions = apply {
        options["background"] = background
    }

    /**
     * Sets the TTL (time to live) in seconds.
     */
    fun expireAfter(seconds: Long): IndexOptions = apply {
        options["expireAfterSeconds"] = seconds
    }

    /**
     * Sets a partial filter expression.
     */
    fun partialFilterExpression(filter: Bson): IndexOptions = apply {
        options["partialFilterExpression"] = filter.toBsonDocument()
    }

    /**
     * Sets the collation.
     */
    fun collation(collation: Document): IndexOptions = apply {
        options["collation"] = collation
    }

    /**
     * Sets the default language for text indexes.
     */
    fun defaultLanguage(language: String): IndexOptions = apply {
        options["default_language"] = language
    }

    /**
     * Sets the language override field for text indexes.
     */
    fun languageOverride(field: String): IndexOptions = apply {
        options["language_override"] = field
    }

    /**
     * Sets text index weights.
     */
    fun weights(weights: Document): IndexOptions = apply {
        options["weights"] = weights
    }

    /**
     * Sets the 2dsphere index version.
     */
    fun sphereVersion(version: Int): IndexOptions = apply {
        options["2dsphereIndexVersion"] = version
    }

    /**
     * Sets the bits for 2d indexes.
     */
    fun bits(bits: Int): IndexOptions = apply {
        options["bits"] = bits
    }

    /**
     * Sets the min value for 2d indexes.
     */
    fun min(min: Double): IndexOptions = apply {
        options["min"] = min
    }

    /**
     * Sets the max value for 2d indexes.
     */
    fun max(max: Double): IndexOptions = apply {
        options["max"] = max
    }

    /**
     * Sets wildcard projection for wildcard indexes.
     */
    fun wildcardProjection(projection: Document): IndexOptions = apply {
        options["wildcardProjection"] = projection
    }

    /**
     * Makes this a hidden index.
     */
    fun hidden(hidden: Boolean = true): IndexOptions = apply {
        options["hidden"] = hidden
    }

    /**
     * Builds the options document.
     */
    fun build(): Document = Document(options)
}

/**
 * Creates index options using DSL syntax.
 */
inline fun indexOptions(block: IndexOptions.() -> Unit): Document =
    IndexOptions().apply(block).build()
