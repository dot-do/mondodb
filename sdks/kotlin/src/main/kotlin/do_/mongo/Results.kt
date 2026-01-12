package do_.mongo

/**
 * Result of an insertOne operation.
 */
data class InsertOneResult(
    val acknowledged: Boolean,
    val insertedId: Any?
) {
    companion object {
        @Suppress("UNCHECKED_CAST")
        fun fromDocument(result: Any?): InsertOneResult {
            return when (result) {
                is Document -> InsertOneResult(
                    acknowledged = result.getBoolean("acknowledged", true),
                    insertedId = result["insertedId"]
                )
                is Map<*, *> -> InsertOneResult(
                    acknowledged = (result["acknowledged"] as? Boolean) ?: true,
                    insertedId = result["insertedId"]
                )
                else -> InsertOneResult(acknowledged = true, insertedId = null)
            }
        }
    }
}

/**
 * Result of an insertMany operation.
 */
data class InsertManyResult(
    val acknowledged: Boolean,
    val insertedIds: Map<Int, Any?>
) {
    val insertedCount: Int get() = insertedIds.size

    companion object {
        @Suppress("UNCHECKED_CAST")
        fun fromDocument(result: Any?): InsertManyResult {
            return when (result) {
                is Document -> InsertManyResult(
                    acknowledged = result.getBoolean("acknowledged", true),
                    insertedIds = parseInsertedIds(result["insertedIds"])
                )
                is Map<*, *> -> InsertManyResult(
                    acknowledged = (result["acknowledged"] as? Boolean) ?: true,
                    insertedIds = parseInsertedIds(result["insertedIds"])
                )
                else -> InsertManyResult(acknowledged = true, insertedIds = emptyMap())
            }
        }

        @Suppress("UNCHECKED_CAST")
        private fun parseInsertedIds(ids: Any?): Map<Int, Any?> {
            return when (ids) {
                is Map<*, *> -> ids.entries.associate { (k, v) ->
                    (k.toString().toIntOrNull() ?: 0) to v
                }
                is List<*> -> ids.mapIndexed { index, id -> index to id }.toMap()
                else -> emptyMap()
            }
        }
    }
}

/**
 * Result of an update operation.
 */
data class UpdateResult(
    val acknowledged: Boolean,
    val matchedCount: Long,
    val modifiedCount: Long,
    val upsertedId: Any?
) {
    val wasAcknowledged: Boolean get() = acknowledged
    val upsertedCount: Long get() = if (upsertedId != null) 1 else 0

    companion object {
        @Suppress("UNCHECKED_CAST")
        fun fromDocument(result: Any?): UpdateResult {
            return when (result) {
                is Document -> UpdateResult(
                    acknowledged = result.getBoolean("acknowledged", true),
                    matchedCount = result.getLong("matchedCount") ?: 0,
                    modifiedCount = result.getLong("modifiedCount") ?: 0,
                    upsertedId = result["upsertedId"]
                )
                is Map<*, *> -> UpdateResult(
                    acknowledged = (result["acknowledged"] as? Boolean) ?: true,
                    matchedCount = (result["matchedCount"] as? Number)?.toLong() ?: 0,
                    modifiedCount = (result["modifiedCount"] as? Number)?.toLong() ?: 0,
                    upsertedId = result["upsertedId"]
                )
                else -> UpdateResult(acknowledged = true, matchedCount = 0, modifiedCount = 0, upsertedId = null)
            }
        }
    }
}

/**
 * Result of a delete operation.
 */
data class DeleteResult(
    val acknowledged: Boolean,
    val deletedCount: Long
) {
    val wasAcknowledged: Boolean get() = acknowledged

    companion object {
        @Suppress("UNCHECKED_CAST")
        fun fromDocument(result: Any?): DeleteResult {
            return when (result) {
                is Document -> DeleteResult(
                    acknowledged = result.getBoolean("acknowledged", true),
                    deletedCount = result.getLong("deletedCount") ?: 0
                )
                is Map<*, *> -> DeleteResult(
                    acknowledged = (result["acknowledged"] as? Boolean) ?: true,
                    deletedCount = (result["deletedCount"] as? Number)?.toLong() ?: 0
                )
                else -> DeleteResult(acknowledged = true, deletedCount = 0)
            }
        }
    }
}

/**
 * Result of a bulk write operation.
 */
data class BulkWriteResult(
    val acknowledged: Boolean,
    val insertedCount: Int,
    val matchedCount: Int,
    val modifiedCount: Int,
    val deletedCount: Int,
    val upsertedCount: Int,
    val insertedIds: Map<Int, Any?>,
    val upsertedIds: Map<Int, Any?>
) {
    companion object {
        @Suppress("UNCHECKED_CAST")
        fun fromDocument(result: Any?): BulkWriteResult {
            return when (result) {
                is Document -> BulkWriteResult(
                    acknowledged = result.getBoolean("acknowledged", true),
                    insertedCount = result.getInt("insertedCount") ?: 0,
                    matchedCount = result.getInt("matchedCount") ?: 0,
                    modifiedCount = result.getInt("modifiedCount") ?: 0,
                    deletedCount = result.getInt("deletedCount") ?: 0,
                    upsertedCount = result.getInt("upsertedCount") ?: 0,
                    insertedIds = (result["insertedIds"] as? Map<Int, Any?>) ?: emptyMap(),
                    upsertedIds = (result["upsertedIds"] as? Map<Int, Any?>) ?: emptyMap()
                )
                else -> BulkWriteResult(
                    acknowledged = true,
                    insertedCount = 0,
                    matchedCount = 0,
                    modifiedCount = 0,
                    deletedCount = 0,
                    upsertedCount = 0,
                    insertedIds = emptyMap(),
                    upsertedIds = emptyMap()
                )
            }
        }
    }
}
