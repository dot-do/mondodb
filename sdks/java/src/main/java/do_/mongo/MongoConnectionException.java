package do_.mongo;

/**
 * Exception thrown when a connection to the database fails.
 */
public class MongoConnectionException extends MongoException {

    /**
     * Creates a MongoConnectionException with a message.
     *
     * @param message the error message
     */
    public MongoConnectionException(String message) {
        super(message);
    }

    /**
     * Creates a MongoConnectionException with a message and cause.
     *
     * @param message the error message
     * @param cause   the underlying cause
     */
    public MongoConnectionException(String message, Throwable cause) {
        super(message, cause);
    }
}
