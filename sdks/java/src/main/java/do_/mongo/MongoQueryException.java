package do_.mongo;

/**
 * Exception thrown when a query operation fails.
 */
public class MongoQueryException extends MongoException {

    private final String suggestion;

    /**
     * Creates a MongoQueryException with a message.
     *
     * @param message the error message
     */
    public MongoQueryException(String message) {
        this(message, null);
    }

    /**
     * Creates a MongoQueryException with a message and suggestion.
     *
     * @param message    the error message
     * @param suggestion a suggestion for fixing the query
     */
    public MongoQueryException(String message, String suggestion) {
        super(message);
        this.suggestion = suggestion;
    }

    /**
     * Creates a MongoQueryException with a message, error code, and suggestion.
     *
     * @param message    the error message
     * @param errorCode  the MongoDB error code
     * @param suggestion a suggestion for fixing the query
     */
    public MongoQueryException(String message, int errorCode, String suggestion) {
        super(message, errorCode);
        this.suggestion = suggestion;
    }

    /**
     * Gets the suggestion for fixing the query.
     *
     * @return the suggestion, or null if not available
     */
    public String getSuggestion() {
        return suggestion;
    }
}
