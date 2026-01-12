package do_.mongo;

/**
 * Exception thrown when a write operation fails.
 */
public class MongoWriteException extends MongoException {

    private final String writeError;
    private final Document writeResult;

    /**
     * Creates a MongoWriteException with a message.
     *
     * @param message the error message
     */
    public MongoWriteException(String message) {
        this(message, null, null);
    }

    /**
     * Creates a MongoWriteException with a message and write error details.
     *
     * @param message    the error message
     * @param writeError the write error message
     * @param writeResult the partial write result
     */
    public MongoWriteException(String message, String writeError, Document writeResult) {
        super(message);
        this.writeError = writeError;
        this.writeResult = writeResult;
    }

    /**
     * Creates a MongoWriteException with full details.
     *
     * @param message     the error message
     * @param errorCode   the MongoDB error code
     * @param writeError  the write error message
     * @param writeResult the partial write result
     */
    public MongoWriteException(String message, int errorCode, String writeError, Document writeResult) {
        super(message, errorCode);
        this.writeError = writeError;
        this.writeResult = writeResult;
    }

    /**
     * Gets the write error message.
     *
     * @return the write error, or null if not available
     */
    public String getWriteError() {
        return writeError;
    }

    /**
     * Gets the partial write result.
     *
     * @return the write result, or null if not available
     */
    public Document getWriteResult() {
        return writeResult;
    }
}
