package do_.mongo

import kotlinx.serialization.Serializable
import java.security.SecureRandom
import java.time.Instant

/**
 * MongoDB ObjectId implementation.
 *
 * An ObjectId is a 12-byte identifier consisting of:
 * - 4-byte timestamp
 * - 5-byte random value
 * - 3-byte incrementing counter
 */
@Serializable
data class ObjectId(val hexString: String) : Comparable<ObjectId> {

    init {
        require(hexString.length == 24) { "ObjectId must be 24 hex characters" }
        require(hexString.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' }) {
            "ObjectId must contain only hex characters"
        }
    }

    /**
     * Gets the timestamp from this ObjectId.
     */
    val timestamp: Instant
        get() {
            val seconds = hexString.substring(0, 8).toLong(16)
            return Instant.ofEpochSecond(seconds)
        }

    /**
     * Gets the raw bytes of this ObjectId.
     */
    fun toByteArray(): ByteArray {
        return hexString.chunked(2)
            .map { it.toInt(16).toByte() }
            .toByteArray()
    }

    override fun compareTo(other: ObjectId): Int = hexString.compareTo(other.hexString)

    override fun toString(): String = hexString

    companion object {
        private val random = SecureRandom()
        private var counter = random.nextInt() and 0xffffff

        /**
         * Generates a new ObjectId.
         */
        fun generate(): ObjectId {
            val bytes = ByteArray(12)

            // 4-byte timestamp
            val timestamp = (System.currentTimeMillis() / 1000).toInt()
            bytes[0] = (timestamp shr 24).toByte()
            bytes[1] = (timestamp shr 16).toByte()
            bytes[2] = (timestamp shr 8).toByte()
            bytes[3] = timestamp.toByte()

            // 5-byte random value
            val randomBytes = ByteArray(5)
            random.nextBytes(randomBytes)
            System.arraycopy(randomBytes, 0, bytes, 4, 5)

            // 3-byte counter
            val count = synchronized(this) { counter++ }
            bytes[9] = (count shr 16).toByte()
            bytes[10] = (count shr 8).toByte()
            bytes[11] = count.toByte()

            return ObjectId(bytes.toHexString())
        }

        /**
         * Creates an ObjectId from a hex string.
         */
        fun fromString(hex: String): ObjectId = ObjectId(hex.lowercase())

        /**
         * Creates an ObjectId from bytes.
         */
        fun fromBytes(bytes: ByteArray): ObjectId {
            require(bytes.size == 12) { "ObjectId must be 12 bytes" }
            return ObjectId(bytes.toHexString())
        }

        private fun ByteArray.toHexString(): String =
            joinToString("") { "%02x".format(it) }
    }
}
