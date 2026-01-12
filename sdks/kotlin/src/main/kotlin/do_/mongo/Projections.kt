package do_.mongo

/**
 * Projection builders for MongoDB queries.
 *
 * Example usage:
 * ```kotlin
 * import do_.mongo.Projections.*
 *
 * // Include specific fields
 * val projection = include("name", "email")
 *
 * // Exclude fields
 * val projection = exclude("password", "internal")
 *
 * // Combine projections
 * val projection = fields(
 *     include("name", "email"),
 *     excludeId()
 * )
 * ```
 */
object Projections {

    /**
     * Creates a projection that includes the specified fields.
     */
    fun include(vararg fields: String): Bson =
        Document(fields.associateWith { 1 })

    /**
     * Creates a projection that excludes the specified fields.
     */
    fun exclude(vararg fields: String): Bson =
        Document(fields.associateWith { 0 })

    /**
     * Creates a projection that excludes the _id field.
     */
    fun excludeId(): Bson = Document("_id", 0)

    /**
     * Creates a projection for the first matching array element using $.
     */
    fun elemMatch(field: String, filter: Bson): Bson =
        Document(field, Document("\$elemMatch", filter.toBsonDocument()))

    /**
     * Creates a projection for text search score.
     */
    fun metaTextScore(field: String): Bson =
        Document(field, Document("\$meta", "textScore"))

    /**
     * Creates a slice projection for arrays.
     */
    fun slice(field: String, limit: Int): Bson =
        Document(field, Document("\$slice", limit))

    /**
     * Creates a slice projection with skip and limit.
     */
    fun slice(field: String, skip: Int, limit: Int): Bson =
        Document(field, Document("\$slice", listOf(skip, limit)))

    /**
     * Combines multiple projections.
     */
    fun fields(vararg projections: Bson): Bson {
        val combined = Document()
        for (projection in projections) {
            combined.putAll(projection.toBsonDocument())
        }
        return combined
    }

    /**
     * Combines a collection of projections.
     */
    fun fields(projections: Collection<Bson>): Bson = fields(*projections.toTypedArray())

    /**
     * Creates a computed field projection.
     */
    fun computed(field: String, expression: Any?): Bson =
        Document(field, expression)
}
