package do_.mongo

/**
 * Update builders for MongoDB operations.
 *
 * Example usage:
 * ```kotlin
 * import do_.mongo.Updates.*
 *
 * // Simple set
 * val update = set("name", "Jane")
 *
 * // Multiple updates
 * val updates = combine(
 *     set("name", "Jane"),
 *     inc("age", 1),
 *     unset("oldField")
 * )
 *
 * // Using DSL
 * val update = update {
 *     "name" setTo "Jane"
 *     "age" inc 1
 *     "lastUpdated" currentDate true
 * }
 * ```
 */
object Updates {

    // =========================================================================
    // Field Update Operators
    // =========================================================================

    /**
     * Creates a $set update.
     */
    fun set(field: String, value: Any?): Bson =
        Document("\$set", Document(field, value))

    /**
     * Creates a $set update for multiple fields.
     */
    fun set(vararg pairs: Pair<String, Any?>): Bson =
        Document("\$set", Document(pairs.toMap()))

    /**
     * Creates a $setOnInsert update.
     */
    fun setOnInsert(field: String, value: Any?): Bson =
        Document("\$setOnInsert", Document(field, value))

    /**
     * Creates an $unset update.
     */
    fun unset(vararg fields: String): Bson =
        Document("\$unset", Document(fields.associateWith { "" }))

    /**
     * Creates a $rename update.
     */
    fun rename(field: String, newName: String): Bson =
        Document("\$rename", Document(field, newName))

    /**
     * Creates an $inc update.
     */
    fun inc(field: String, amount: Number): Bson =
        Document("\$inc", Document(field, amount))

    /**
     * Creates a $mul update.
     */
    fun mul(field: String, multiplier: Number): Bson =
        Document("\$mul", Document(field, multiplier))

    /**
     * Creates a $min update.
     */
    fun min(field: String, value: Any?): Bson =
        Document("\$min", Document(field, value))

    /**
     * Creates a $max update.
     */
    fun max(field: String, value: Any?): Bson =
        Document("\$max", Document(field, value))

    /**
     * Creates a $currentDate update.
     */
    fun currentDate(field: String): Bson =
        Document("\$currentDate", Document(field, true))

    /**
     * Creates a $currentDate update with timestamp type.
     */
    fun currentTimestamp(field: String): Bson =
        Document("\$currentDate", Document(field, Document("\$type", "timestamp")))

    // =========================================================================
    // Array Update Operators
    // =========================================================================

    /**
     * Creates a $push update.
     */
    fun push(field: String, value: Any?): Bson =
        Document("\$push", Document(field, value))

    /**
     * Creates a $push update with modifiers.
     */
    fun pushEach(field: String, values: List<Any?>, position: Int? = null, slice: Int? = null, sort: Any? = null): Bson {
        val eachDoc = Document("\$each", values)
        position?.let { eachDoc.append("\$position", it) }
        slice?.let { eachDoc.append("\$slice", it) }
        sort?.let { eachDoc.append("\$sort", it) }
        return Document("\$push", Document(field, eachDoc))
    }

    /**
     * Creates an $addToSet update.
     */
    fun addToSet(field: String, value: Any?): Bson =
        Document("\$addToSet", Document(field, value))

    /**
     * Creates an $addToSet update with multiple values.
     */
    fun addEachToSet(field: String, values: List<Any?>): Bson =
        Document("\$addToSet", Document(field, Document("\$each", values)))

    /**
     * Creates a $pop update (remove first element).
     */
    fun popFirst(field: String): Bson =
        Document("\$pop", Document(field, -1))

    /**
     * Creates a $pop update (remove last element).
     */
    fun popLast(field: String): Bson =
        Document("\$pop", Document(field, 1))

    /**
     * Creates a $pull update.
     */
    fun pull(field: String, value: Any?): Bson =
        Document("\$pull", Document(field, value))

    /**
     * Creates a $pull update with a filter.
     */
    fun pull(field: String, filter: Bson): Bson =
        Document("\$pull", Document(field, filter.toBsonDocument()))

    /**
     * Creates a $pullAll update.
     */
    fun pullAll(field: String, values: List<Any?>): Bson =
        Document("\$pullAll", Document(field, values))

    // =========================================================================
    // Bitwise Update Operators
    // =========================================================================

    /**
     * Creates a bitwise AND update.
     */
    fun bitwiseAnd(field: String, value: Long): Bson =
        Document("\$bit", Document(field, Document("and", value)))

    /**
     * Creates a bitwise OR update.
     */
    fun bitwiseOr(field: String, value: Long): Bson =
        Document("\$bit", Document(field, Document("or", value)))

    /**
     * Creates a bitwise XOR update.
     */
    fun bitwiseXor(field: String, value: Long): Bson =
        Document("\$bit", Document(field, Document("xor", value)))

    // =========================================================================
    // Combination
    // =========================================================================

    /**
     * Combines multiple updates into one.
     */
    fun combine(vararg updates: Bson): Bson {
        val combined = Document()
        for (update in updates) {
            val doc = update.toBsonDocument()
            for ((key, value) in doc) {
                val existing = combined[key]
                if (existing is Document && value is Document) {
                    existing.putAll(value)
                } else {
                    combined[key] = value
                }
            }
        }
        return combined
    }

    /**
     * Combines a collection of updates into one.
     */
    fun combine(updates: Collection<Bson>): Bson = combine(*updates.toTypedArray())
}

// =========================================================================
// DSL Support
// =========================================================================

/**
 * Update DSL builder.
 */
@DocumentDsl
class UpdateBuilder {
    private val updates = mutableListOf<Bson>()

    infix fun String.setTo(value: Any?) {
        updates.add(Updates.set(this, value))
    }

    infix fun String.inc(amount: Number) {
        updates.add(Updates.inc(this, amount))
    }

    infix fun String.mul(multiplier: Number) {
        updates.add(Updates.mul(this, multiplier))
    }

    infix fun String.min(value: Any?) {
        updates.add(Updates.min(this, value))
    }

    infix fun String.max(value: Any?) {
        updates.add(Updates.max(this, value))
    }

    infix fun String.push(value: Any?) {
        updates.add(Updates.push(this, value))
    }

    infix fun String.addToSet(value: Any?) {
        updates.add(Updates.addToSet(this, value))
    }

    infix fun String.pull(value: Any?) {
        updates.add(Updates.pull(this, value))
    }

    fun String.unset() {
        updates.add(Updates.unset(this))
    }

    infix fun String.currentDate(set: Boolean) {
        if (set) updates.add(Updates.currentDate(this))
    }

    infix fun String.renameTo(newName: String) {
        updates.add(Updates.rename(this, newName))
    }

    internal fun toBson(): Bson = Updates.combine(updates)
}

/**
 * Creates an update using DSL syntax.
 */
inline fun update(block: UpdateBuilder.() -> Unit): Bson =
    UpdateBuilder().apply(block).toBson()
