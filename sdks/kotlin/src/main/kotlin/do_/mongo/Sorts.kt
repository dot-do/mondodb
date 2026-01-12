package do_.mongo

/**
 * Sort builders for MongoDB queries.
 *
 * Example usage:
 * ```kotlin
 * import do_.mongo.Sorts.*
 *
 * // Single field sort
 * val sort = ascending("name")
 *
 * // Multiple field sort
 * val sort = orderBy(
 *     descending("createdAt"),
 *     ascending("name")
 * )
 * ```
 */
object Sorts {

    /**
     * Creates an ascending sort.
     */
    fun ascending(vararg fields: String): Bson =
        Document(fields.associateWith { 1 })

    /**
     * Creates a descending sort.
     */
    fun descending(vararg fields: String): Bson =
        Document(fields.associateWith { -1 })

    /**
     * Creates a text score sort for text search results.
     */
    fun metaTextScore(field: String): Bson =
        Document(field, Document("\$meta", "textScore"))

    /**
     * Combines multiple sort specifications.
     */
    fun orderBy(vararg sorts: Bson): Bson {
        val combined = Document()
        for (sort in sorts) {
            combined.putAll(sort.toBsonDocument())
        }
        return combined
    }

    /**
     * Combines a collection of sort specifications.
     */
    fun orderBy(sorts: Collection<Bson>): Bson = orderBy(*sorts.toTypedArray())
}
