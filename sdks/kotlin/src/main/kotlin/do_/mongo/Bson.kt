package do_.mongo

/**
 * Interface for types that can be converted to a BSON document.
 */
interface Bson {
    /**
     * Converts this object to a Document.
     */
    fun toBsonDocument(): Document
}
