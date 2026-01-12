package do_.mongo;

/**
 * Interface for BSON document representations.
 * <p>
 * This interface allows different types (Document, filters, updates) to be
 * used interchangeably where a BSON document is expected.
 * </p>
 */
public interface Bson {

    /**
     * Converts this Bson to a Document representation.
     *
     * @return the Document representation
     */
    Document toBsonDocument();
}
