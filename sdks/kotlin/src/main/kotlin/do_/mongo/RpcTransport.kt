package do_.mongo

import kotlinx.coroutines.Deferred

/**
 * Interface for RPC transport layer.
 */
interface RpcTransport {
    /**
     * Makes a synchronous RPC call.
     */
    fun call(method: String, vararg args: Any?): Any?

    /**
     * Makes an asynchronous RPC call.
     */
    suspend fun callAsync(method: String, vararg args: Any?): Any?

    /**
     * Closes the transport.
     */
    fun close()
}
