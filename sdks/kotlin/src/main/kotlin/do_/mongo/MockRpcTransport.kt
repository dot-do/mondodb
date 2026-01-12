package do_.mongo

import kotlinx.coroutines.delay
import java.util.concurrent.ConcurrentHashMap

/**
 * Mock RPC transport for testing purposes.
 */
class MockRpcTransport : RpcTransport {

    private val databases = ConcurrentHashMap<String, MutableMap<String, MutableList<Document>>>()
    private var closed = false

    override fun call(method: String, vararg args: Any?): Any? {
        if (closed) throw MongoException("Transport is closed")

        return when (method) {
            "connect" -> Document("ok", 1)
            "ping" -> Document("ok", 1)
            "listDatabases" -> listDatabases()
            "listCollections" -> listCollections(args.getOrNull(0) as? String ?: "test")
            "insertOne" -> insertOne(
                args.getOrNull(0) as? String ?: "test",
                args.getOrNull(1) as? String ?: "test",
                args.getOrNull(2) as? Document ?: Document()
            )
            "insertMany" -> insertMany(
                args.getOrNull(0) as? String ?: "test",
                args.getOrNull(1) as? String ?: "test",
                @Suppress("UNCHECKED_CAST")
                args.getOrNull(2) as? List<Document> ?: emptyList()
            )
            "find" -> find(
                args.getOrNull(0) as? String ?: "test",
                args.getOrNull(1) as? String ?: "test",
                args.getOrNull(2) as? Document ?: Document(),
                args.getOrNull(3) as? Document ?: Document()
            )
            "findOne" -> findOne(
                args.getOrNull(0) as? String ?: "test",
                args.getOrNull(1) as? String ?: "test",
                args.getOrNull(2) as? Document ?: Document()
            )
            "updateOne" -> updateOne(
                args.getOrNull(0) as? String ?: "test",
                args.getOrNull(1) as? String ?: "test",
                args.getOrNull(2) as? Document ?: Document(),
                args.getOrNull(3) as? Document ?: Document(),
                args.getOrNull(4) as? Document ?: Document()
            )
            "updateMany" -> updateMany(
                args.getOrNull(0) as? String ?: "test",
                args.getOrNull(1) as? String ?: "test",
                args.getOrNull(2) as? Document ?: Document(),
                args.getOrNull(3) as? Document ?: Document(),
                args.getOrNull(4) as? Document ?: Document()
            )
            "deleteOne" -> deleteOne(
                args.getOrNull(0) as? String ?: "test",
                args.getOrNull(1) as? String ?: "test",
                args.getOrNull(2) as? Document ?: Document()
            )
            "deleteMany" -> deleteMany(
                args.getOrNull(0) as? String ?: "test",
                args.getOrNull(1) as? String ?: "test",
                args.getOrNull(2) as? Document ?: Document()
            )
            "countDocuments" -> countDocuments(
                args.getOrNull(0) as? String ?: "test",
                args.getOrNull(1) as? String ?: "test",
                args.getOrNull(2) as? Document ?: Document()
            )
            "aggregate" -> aggregate(
                args.getOrNull(0) as? String ?: "test",
                args.getOrNull(1) as? String ?: "test",
                @Suppress("UNCHECKED_CAST")
                args.getOrNull(2) as? List<Document> ?: emptyList()
            )
            "createIndex" -> "index_${System.currentTimeMillis()}"
            "dropIndex" -> Document("ok", 1)
            "dropIndexes" -> Document("ok", 1)
            "listIndexes" -> listOf(Document("name", "_id_").append("key", Document("_id", 1)))
            "dropCollection" -> dropCollection(
                args.getOrNull(0) as? String ?: "test",
                args.getOrNull(1) as? String ?: "test"
            )
            "dropDatabase" -> dropDatabase(args.getOrNull(0) as? String ?: "test")
            "serverStatus" -> Document("ok", 1)
                .append("version", "6.0.0")
                .append("uptime", 12345)
            else -> null
        }
    }

    override suspend fun callAsync(method: String, vararg args: Any?): Any? {
        delay(1) // Simulate async operation
        return call(method, *args)
    }

    override fun close() {
        closed = true
        databases.clear()
    }

    private fun getCollection(dbName: String, collName: String): MutableList<Document> {
        return databases
            .getOrPut(dbName) { ConcurrentHashMap() }
            .getOrPut(collName) { mutableListOf() }
    }

    private fun listDatabases(): Document {
        val dbList = databases.keys.map { name ->
            Document("name", name)
                .append("sizeOnDisk", 1024L)
                .append("empty", databases[name]?.isEmpty() ?: true)
        }
        return Document("databases", dbList).append("ok", 1)
    }

    private fun listCollections(dbName: String): List<Document> {
        return databases[dbName]?.keys?.map { name ->
            Document("name", name).append("type", "collection")
        } ?: emptyList()
    }

    private fun insertOne(dbName: String, collName: String, doc: Document): Document {
        val collection = getCollection(dbName, collName)
        val id = doc["_id"] ?: ObjectId.generate()
        doc["_id"] = id
        collection.add(doc)
        return Document("acknowledged", true).append("insertedId", id)
    }

    private fun insertMany(dbName: String, collName: String, docs: List<Document>): Document {
        val collection = getCollection(dbName, collName)
        val insertedIds = mutableMapOf<Int, Any?>()
        docs.forEachIndexed { index, doc ->
            val id = doc["_id"] ?: ObjectId.generate()
            doc["_id"] = id
            collection.add(doc)
            insertedIds[index] = id
        }
        return Document("acknowledged", true).append("insertedIds", insertedIds)
    }

    private fun find(dbName: String, collName: String, filter: Document, options: Document): List<Document> {
        val collection = getCollection(dbName, collName)
        val limit = (options["limit"] as? Number)?.toInt() ?: Int.MAX_VALUE
        val skip = (options["skip"] as? Number)?.toInt() ?: 0

        return collection
            .filter { matchesFilter(it, filter) }
            .drop(skip)
            .take(limit)
            .map { Document(it) }
    }

    private fun findOne(dbName: String, collName: String, filter: Document): Document? {
        val collection = getCollection(dbName, collName)
        return collection.firstOrNull { matchesFilter(it, filter) }?.let { Document(it) }
    }

    private fun updateOne(dbName: String, collName: String, filter: Document, update: Document, options: Document): Document {
        val collection = getCollection(dbName, collName)
        val upsert = options.getBoolean("upsert", false)

        val doc = collection.firstOrNull { matchesFilter(it, filter) }

        return if (doc != null) {
            applyUpdate(doc, update)
            Document("acknowledged", true)
                .append("matchedCount", 1L)
                .append("modifiedCount", 1L)
        } else if (upsert) {
            val newDoc = Document()
            applyUpdate(newDoc, update)
            val id = newDoc["_id"] ?: ObjectId.generate()
            newDoc["_id"] = id
            collection.add(newDoc)
            Document("acknowledged", true)
                .append("matchedCount", 0L)
                .append("modifiedCount", 0L)
                .append("upsertedId", id)
        } else {
            Document("acknowledged", true)
                .append("matchedCount", 0L)
                .append("modifiedCount", 0L)
        }
    }

    private fun updateMany(dbName: String, collName: String, filter: Document, update: Document, options: Document): Document {
        val collection = getCollection(dbName, collName)
        val matching = collection.filter { matchesFilter(it, filter) }

        matching.forEach { applyUpdate(it, update) }

        return Document("acknowledged", true)
            .append("matchedCount", matching.size.toLong())
            .append("modifiedCount", matching.size.toLong())
    }

    private fun deleteOne(dbName: String, collName: String, filter: Document): Document {
        val collection = getCollection(dbName, collName)
        val doc = collection.firstOrNull { matchesFilter(it, filter) }

        return if (doc != null) {
            collection.remove(doc)
            Document("acknowledged", true).append("deletedCount", 1L)
        } else {
            Document("acknowledged", true).append("deletedCount", 0L)
        }
    }

    private fun deleteMany(dbName: String, collName: String, filter: Document): Document {
        val collection = getCollection(dbName, collName)
        val matching = collection.filter { matchesFilter(it, filter) }
        val count = matching.size

        collection.removeAll(matching.toSet())

        return Document("acknowledged", true).append("deletedCount", count.toLong())
    }

    private fun countDocuments(dbName: String, collName: String, filter: Document): Long {
        val collection = getCollection(dbName, collName)
        return collection.count { matchesFilter(it, filter) }.toLong()
    }

    private fun aggregate(dbName: String, collName: String, pipeline: List<Document>): List<Document> {
        val collection = getCollection(dbName, collName)
        var result: List<Document> = collection.map { Document(it) }

        for (stage in pipeline) {
            result = applyAggregationStage(result, stage)
        }

        return result
    }

    private fun dropCollection(dbName: String, collName: String): Document {
        databases[dbName]?.remove(collName)
        return Document("ok", 1)
    }

    private fun dropDatabase(dbName: String): Document {
        databases.remove(dbName)
        return Document("ok", 1)
    }

    @Suppress("UNCHECKED_CAST")
    private fun matchesFilter(doc: Document, filter: Document): Boolean {
        if (filter.isEmpty()) return true

        for ((key, value) in filter) {
            when {
                key.startsWith("$") -> {
                    // Logical operators
                    when (key) {
                        "\$and" -> {
                            val conditions = value as? List<Document> ?: return false
                            if (!conditions.all { matchesFilter(doc, it) }) return false
                        }
                        "\$or" -> {
                            val conditions = value as? List<Document> ?: return false
                            if (!conditions.any { matchesFilter(doc, it) }) return false
                        }
                        "\$nor" -> {
                            val conditions = value as? List<Document> ?: return false
                            if (conditions.any { matchesFilter(doc, it) }) return false
                        }
                        else -> return false
                    }
                }
                value is Document -> {
                    // Comparison operators
                    val docValue = doc[key]
                    for ((op, opValue) in value) {
                        val matches = when (op) {
                            "\$eq" -> docValue == opValue
                            "\$ne" -> docValue != opValue
                            "\$gt" -> compareValues(docValue, opValue) > 0
                            "\$gte" -> compareValues(docValue, opValue) >= 0
                            "\$lt" -> compareValues(docValue, opValue) < 0
                            "\$lte" -> compareValues(docValue, opValue) <= 0
                            "\$in" -> (opValue as? List<*>)?.contains(docValue) ?: false
                            "\$nin" -> (opValue as? List<*>)?.contains(docValue)?.not() ?: true
                            "\$exists" -> (opValue as? Boolean == true) == (docValue != null)
                            "\$regex" -> {
                                val pattern = opValue.toString()
                                docValue?.toString()?.matches(Regex(pattern)) ?: false
                            }
                            else -> true
                        }
                        if (!matches) return false
                    }
                }
                else -> {
                    // Simple equality
                    if (doc[key] != value) return false
                }
            }
        }
        return true
    }

    @Suppress("UNCHECKED_CAST")
    private fun compareValues(a: Any?, b: Any?): Int {
        if (a == null && b == null) return 0
        if (a == null) return -1
        if (b == null) return 1

        return when {
            a is Number && b is Number -> a.toDouble().compareTo(b.toDouble())
            a is Comparable<*> && b is Comparable<*> -> {
                try {
                    (a as Comparable<Any>).compareTo(b)
                } catch (e: Exception) {
                    a.toString().compareTo(b.toString())
                }
            }
            else -> a.toString().compareTo(b.toString())
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun applyUpdate(doc: Document, update: Document) {
        for ((op, value) in update) {
            when (op) {
                "\$set" -> {
                    val fields = value as? Document ?: continue
                    doc.putAll(fields)
                }
                "\$unset" -> {
                    val fields = value as? Document ?: continue
                    fields.keys.forEach { doc.remove(it) }
                }
                "\$inc" -> {
                    val fields = value as? Document ?: continue
                    for ((field, amount) in fields) {
                        val current = (doc[field] as? Number)?.toDouble() ?: 0.0
                        val increment = (amount as? Number)?.toDouble() ?: 0.0
                        doc[field] = current + increment
                    }
                }
                "\$push" -> {
                    val fields = value as? Document ?: continue
                    for ((field, item) in fields) {
                        val list = doc.getOrPut(field) { mutableListOf<Any?>() } as MutableList<Any?>
                        list.add(item)
                    }
                }
                "\$pull" -> {
                    val fields = value as? Document ?: continue
                    for ((field, item) in fields) {
                        val list = doc[field] as? MutableList<*> ?: continue
                        list.remove(item)
                    }
                }
                "\$addToSet" -> {
                    val fields = value as? Document ?: continue
                    for ((field, item) in fields) {
                        val list = doc.getOrPut(field) { mutableListOf<Any?>() } as MutableList<Any?>
                        if (!list.contains(item)) list.add(item)
                    }
                }
            }
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun applyAggregationStage(docs: List<Document>, stage: Document): List<Document> {
        for ((op, value) in stage) {
            return when (op) {
                "\$match" -> docs.filter { matchesFilter(it, value as Document) }
                "\$limit" -> docs.take((value as Number).toInt())
                "\$skip" -> docs.drop((value as Number).toInt())
                "\$sort" -> {
                    val sortDoc = value as Document
                    docs.sortedWith { a, b ->
                        for ((field, direction) in sortDoc) {
                            val cmp = compareValues(a[field], b[field]) * (direction as Number).toInt()
                            if (cmp != 0) return@sortedWith cmp
                        }
                        0
                    }
                }
                "\$project" -> {
                    val projection = value as Document
                    docs.map { doc ->
                        val result = Document()
                        for ((field, include) in projection) {
                            if ((include as? Number)?.toInt() == 1 || include == true) {
                                result[field] = doc[field]
                            }
                        }
                        result
                    }
                }
                "\$count" -> {
                    val fieldName = value as String
                    listOf(Document(fieldName, docs.size))
                }
                else -> docs
            }
        }
        return docs
    }
}
