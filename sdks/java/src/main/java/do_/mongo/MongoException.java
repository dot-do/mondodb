package do_.mongo;

/**
 * Base exception for all MongoDB operations.
 * <p>
 * This exception hierarchy mirrors the MongoDB Java driver's exception types
 * to ensure compatibility and familiar error handling patterns.
 * </p>
 */
public class MongoException extends RuntimeException {

    private final int errorCode;
    private final String errorLabel;

    /**
     * Creates a MongoException with a message.
     *
     * @param message the error message
     */
    public MongoException(String message) {
        this(message, -1, null, null);
    }

    /**
     * Creates a MongoException with a message and cause.
     *
     * @param message the error message
     * @param cause   the underlying cause
     */
    public MongoException(String message, Throwable cause) {
        this(message, -1, null, cause);
    }

    /**
     * Creates a MongoException with a message and error code.
     *
     * @param message   the error message
     * @param errorCode the MongoDB error code
     */
    public MongoException(String message, int errorCode) {
        this(message, errorCode, null, null);
    }

    /**
     * Creates a MongoException with full details.
     *
     * @param message    the error message
     * @param errorCode  the MongoDB error code
     * @param errorLabel the error label
     * @param cause      the underlying cause
     */
    public MongoException(String message, int errorCode, String errorLabel, Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
        this.errorLabel = errorLabel;
    }

    /**
     * Gets the MongoDB error code.
     *
     * @return the error code, or -1 if not set
     */
    public int getErrorCode() {
        return errorCode;
    }

    /**
     * Gets the error label.
     *
     * @return the error label, or null if not set
     */
    public String getErrorLabel() {
        return errorLabel;
    }

    /**
     * Checks if this exception has a specific error label.
     *
     * @param label the label to check
     * @return true if the exception has this label
     */
    public boolean hasErrorLabel(String label) {
        return label != null && label.equals(errorLabel);
    }

    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder(getClass().getSimpleName());
        sb.append(": ");
        if (errorCode != -1) {
            sb.append("[").append(errorCode).append("] ");
        }
        if (errorLabel != null) {
            sb.append("[").append(errorLabel).append("] ");
        }
        sb.append(getMessage());
        return sb.toString();
    }
}
