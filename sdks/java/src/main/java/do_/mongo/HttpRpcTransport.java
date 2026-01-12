package do_.mongo;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicLong;

/**
 * HTTP-based RPC transport implementation.
 * <p>
 * This transport uses HTTP POST requests to communicate with the MongoDB.do
 * backend service. It supports both synchronous and asynchronous operations.
 * </p>
 *
 * <pre>{@code
 * RpcTransport transport = new HttpRpcTransport("https://mongo.do/api/rpc");
 * Object result = transport.call("find", "mydb", "users", filter, options);
 * }</pre>
 */
public class HttpRpcTransport implements RpcTransport {

    private static final Gson GSON = new GsonBuilder()
            .serializeNulls()
            .create();

    private final String baseUrl;
    private final HttpClient httpClient;
    private final Duration timeout;
    private final String authToken;
    private final AtomicLong requestId;
    private volatile boolean closed;

    /**
     * Creates a new HttpRpcTransport.
     *
     * @param baseUrl the base URL of the RPC endpoint
     */
    public HttpRpcTransport(String baseUrl) {
        this(baseUrl, null, Duration.ofSeconds(30));
    }

    /**
     * Creates a new HttpRpcTransport with authentication.
     *
     * @param baseUrl   the base URL of the RPC endpoint
     * @param authToken the authentication token
     */
    public HttpRpcTransport(String baseUrl, String authToken) {
        this(baseUrl, authToken, Duration.ofSeconds(30));
    }

    /**
     * Creates a new HttpRpcTransport with full configuration.
     *
     * @param baseUrl   the base URL of the RPC endpoint
     * @param authToken the authentication token
     * @param timeout   the request timeout
     */
    public HttpRpcTransport(String baseUrl, String authToken, Duration timeout) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.authToken = authToken;
        this.timeout = timeout;
        this.requestId = new AtomicLong(0);
        this.closed = false;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(timeout)
                .build();
    }

    @Override
    public Object call(String method, Object... args) {
        if (closed) {
            throw new MongoConnectionException("Transport is closed");
        }

        try {
            String requestBody = buildRequest(method, args);
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .timeout(timeout);

            if (authToken != null) {
                builder.header("Authorization", "Bearer " + authToken);
            }

            HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            return parseResponse(response);
        } catch (MongoException e) {
            throw e;
        } catch (Exception e) {
            throw new MongoConnectionException("RPC call failed: " + e.getMessage(), e);
        }
    }

    @Override
    public CompletableFuture<Object> callAsync(String method, Object... args) {
        if (closed) {
            return CompletableFuture.failedFuture(new MongoConnectionException("Transport is closed"));
        }

        try {
            String requestBody = buildRequest(method, args);
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .timeout(timeout);

            if (authToken != null) {
                builder.header("Authorization", "Bearer " + authToken);
            }

            return httpClient.sendAsync(builder.build(), HttpResponse.BodyHandlers.ofString())
                    .thenApply(this::parseResponse);
        } catch (Exception e) {
            return CompletableFuture.failedFuture(new MongoConnectionException("RPC call failed: " + e.getMessage(), e));
        }
    }

    @Override
    public void close() {
        closed = true;
    }

    @Override
    public boolean isClosed() {
        return closed;
    }

    /**
     * Builds a JSON-RPC request.
     */
    private String buildRequest(String method, Object[] args) {
        Map<String, Object> request = new HashMap<>();
        request.put("jsonrpc", "2.0");
        request.put("id", requestId.incrementAndGet());
        request.put("method", method);
        request.put("params", args != null ? args : new Object[0]);
        return GSON.toJson(request);
    }

    /**
     * Parses a JSON-RPC response.
     */
    private Object parseResponse(HttpResponse<String> response) {
        int statusCode = response.statusCode();

        if (statusCode == 401) {
            throw new MongoConnectionException("Authentication failed");
        }

        if (statusCode == 429) {
            throw new MongoException("Rate limited", 429);
        }

        if (statusCode < 200 || statusCode >= 300) {
            throw new MongoConnectionException("HTTP " + statusCode + ": " + response.body());
        }

        String body = response.body();
        if (body == null || body.isEmpty()) {
            return null;
        }

        try {
            Map<String, Object> result = GSON.fromJson(body,
                    new TypeToken<Map<String, Object>>() {}.getType());

            // Check for JSON-RPC error
            if (result.containsKey("error")) {
                Object error = result.get("error");
                if (error instanceof Map) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> errorMap = (Map<String, Object>) error;
                    String message = (String) errorMap.get("message");
                    Number code = (Number) errorMap.get("code");
                    int errorCode = code != null ? code.intValue() : -1;

                    // Map error codes to specific exception types
                    if (message != null) {
                        if (message.contains("not found") || errorCode == 11000) {
                            throw new MongoQueryException(message, errorCode, null);
                        }
                        if (message.contains("write") || message.contains("duplicate")) {
                            throw new MongoWriteException(message, errorCode, message, null);
                        }
                        if (message.contains("timeout")) {
                            throw new MongoTimeoutException(message);
                        }
                    }

                    throw new MongoException(message != null ? message : "Unknown error", errorCode);
                }
            }

            // Return the result
            return result.get("result");
        } catch (MongoException e) {
            throw e;
        } catch (Exception e) {
            // If JSON parsing fails, try to return raw body as fallback
            throw new MongoException("Failed to parse response: " + e.getMessage(), e);
        }
    }

    /**
     * Gets the base URL.
     *
     * @return the base URL
     */
    public String getBaseUrl() {
        return baseUrl;
    }
}
