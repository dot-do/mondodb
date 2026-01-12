package do_.mongo;

/**
 * Exception thrown when an operation times out.
 */
public class MongoTimeoutException extends MongoException {

    /**
     * Creates a MongoTimeoutException with a message.
     *
     * @param message the error message
     */
    public MongoTimeoutException(String message) {
        super(message);
    }

    /**
     * Creates a MongoTimeoutException with a message and cause.
     *
     * @param message the error message
     * @param cause   the underlying cause
     */
    public MongoTimeoutException(String message, Throwable cause) {
        super(message, cause);
    }
}
