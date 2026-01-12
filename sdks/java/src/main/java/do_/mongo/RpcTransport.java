package do_.mongo;

import java.util.concurrent.CompletableFuture;

/**
 * Interface for RPC transport abstraction.
 * <p>
 * This interface abstracts the underlying RPC mechanism, allowing for different
 * implementations (HTTP, WebSocket, Cap'n Proto, etc.) and enabling easy testing
 * through mock implementations.
 * </p>
 */
public interface RpcTransport {

    /**
     * Makes a synchronous RPC call.
     *
     * @param method the method name
     * @param args   the method arguments
     * @return the result
     * @throws MongoException if the call fails
     */
    Object call(String method, Object... args);

    /**
     * Makes an asynchronous RPC call.
     *
     * @param method the method name
     * @param args   the method arguments
     * @return a CompletableFuture with the result
     */
    CompletableFuture<Object> callAsync(String method, Object... args);

    /**
     * Closes the transport.
     */
    void close();

    /**
     * Checks if the transport is closed.
     *
     * @return true if closed
     */
    boolean isClosed();
}
