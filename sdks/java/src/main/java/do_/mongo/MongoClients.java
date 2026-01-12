package do_.mongo;

import java.time.Duration;
import java.util.concurrent.CompletableFuture;

/**
 * Factory class for creating MongoClient instances.
 * <p>
 * This class provides static factory methods for creating MongoDB clients
 * with various configurations.
 * </p>
 *
 * <pre>{@code
 * // Simple connection
 * MongoClient client = MongoClients.create("https://mongo.do/api/mydb");
 *
 * // With settings
 * MongoClient client = MongoClients.create(
 *     MongoClientSettings.builder()
 *         .applyConnectionString("https://mongo.do/api/mydb")
 *         .timeout(Duration.ofSeconds(10))
 *         .build()
 * );
 *
 * // Async connection
 * MongoClient client = MongoClients.createAsync("https://mongo.do/api/mydb").join();
 * }</pre>
 */
public final class MongoClients {

    private MongoClients() {
        // Utility class
    }

    /**
     * Creates a MongoClient from a connection string.
     * <p>
     * Supported connection string formats:
     * </p>
     * <ul>
     *   <li>https://mongo.do/api/database</li>
     *   <li>mongodb://host:port/database</li>
     *   <li>mongodb+srv://host/database</li>
     * </ul>
     *
     * @param connectionString the connection string
     * @return a new MongoClient
     */
    public static MongoClient create(String connectionString) {
        return MongoClient.create(connectionString);
    }

    /**
     * Creates a MongoClient with settings.
     *
     * @param settings the client settings
     * @return a new MongoClient
     */
    public static MongoClient create(MongoClientSettings settings) {
        return MongoClient.create(settings);
    }

    /**
     * Creates a MongoClient with default settings.
     * <p>
     * The connection string is read from the MONGO_URL environment variable.
     * </p>
     *
     * @return a new MongoClient
     * @throws IllegalStateException if MONGO_URL is not set
     */
    public static MongoClient create() {
        String connectionString = System.getenv("MONGO_URL");
        if (connectionString == null) {
            connectionString = System.getProperty("mongo.url");
        }
        if (connectionString == null) {
            throw new IllegalStateException(
                    "No connection string provided. Set MONGO_URL environment variable or mongo.url system property.");
        }
        return create(connectionString);
    }

    /**
     * Creates and connects a MongoClient asynchronously.
     *
     * @param connectionString the connection string
     * @return a CompletableFuture with the connected client
     */
    public static CompletableFuture<MongoClient> createAsync(String connectionString) {
        return MongoClient.connectAsync(connectionString);
    }

    /**
     * Creates and connects a MongoClient asynchronously with settings.
     *
     * @param settings the client settings
     * @return a CompletableFuture with the connected client
     */
    public static CompletableFuture<MongoClient> createAsync(MongoClientSettings settings) {
        MongoClient client = create(settings);
        return client.connectAsync().thenApply(v -> client);
    }

    // ============================================================================
    // Builder Methods
    // ============================================================================

    /**
     * Creates a new settings builder.
     *
     * @return a new MongoClientSettings.Builder
     */
    public static MongoClientSettings.Builder settings() {
        return MongoClientSettings.builder();
    }

    /**
     * Creates a new settings builder from a connection string.
     *
     * @param connectionString the connection string
     * @return a new MongoClientSettings.Builder
     */
    public static MongoClientSettings.Builder settings(String connectionString) {
        return MongoClientSettings.builder().applyConnectionString(connectionString);
    }

    // ============================================================================
    // Convenience Factory Methods
    // ============================================================================

    /**
     * Creates a MongoClient for local development.
     * <p>
     * Connects to mongodb://localhost:27017
     * </p>
     *
     * @return a new MongoClient
     */
    public static MongoClient createLocal() {
        return create("mongodb://localhost:27017");
    }

    /**
     * Creates a MongoClient for local development with a specific database.
     *
     * @param database the database name
     * @return a new MongoClient
     */
    public static MongoClient createLocal(String database) {
        return create("mongodb://localhost:27017/" + database);
    }

    /**
     * Creates a MongoClient with a mock transport for testing.
     *
     * @return a new MongoClient with mock transport
     */
    public static MongoClient createMock() {
        MongoClientSettings settings = MongoClientSettings.builder()
                .applyConnectionString("mongodb://mock/test")
                .build();
        MongoClient client = create(settings);
        client.setTransport(new MockRpcTransport());
        return client;
    }

    /**
     * Creates a MongoClient with a mock transport for testing.
     *
     * @param database the database name
     * @return a new MongoClient with mock transport
     */
    public static MongoClient createMock(String database) {
        MongoClientSettings settings = MongoClientSettings.builder()
                .applyConnectionString("mongodb://mock/" + database)
                .build();
        MongoClient client = create(settings);
        client.setTransport(new MockRpcTransport());
        return client;
    }

    /**
     * Creates a MongoClient connecting to mongo.do cloud service.
     *
     * @param apiKey   the API key
     * @param database the database name
     * @return a new MongoClient
     */
    public static MongoClient createCloud(String apiKey, String database) {
        MongoClientSettings settings = MongoClientSettings.builder()
                .applyConnectionString("https://mongo.do/api/" + database)
                .credential(apiKey)
                .build();
        MongoClient client = create(settings);
        client.setTransport(new HttpRpcTransport("https://mongo.do/api/" + database, apiKey));
        return client;
    }

    /**
     * Creates a MongoClient connecting to a custom mongo.do endpoint.
     *
     * @param baseUrl  the base URL (e.g., "https://my-db.mongo.do")
     * @param apiKey   the API key
     * @param database the database name
     * @return a new MongoClient
     */
    public static MongoClient createCloud(String baseUrl, String apiKey, String database) {
        String url = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        MongoClientSettings settings = MongoClientSettings.builder()
                .applyConnectionString(url + "/" + database)
                .credential(apiKey)
                .build();
        MongoClient client = create(settings);
        client.setTransport(new HttpRpcTransport(url + "/" + database, apiKey));
        return client;
    }

    /**
     * Creates a MongoClient with custom timeout settings.
     *
     * @param connectionString the connection string
     * @param connectTimeout   the connection timeout
     * @param requestTimeout   the request timeout
     * @return a new MongoClient
     */
    public static MongoClient create(String connectionString, Duration connectTimeout, Duration requestTimeout) {
        MongoClientSettings settings = MongoClientSettings.builder()
                .applyConnectionString(connectionString)
                .connectTimeout(connectTimeout)
                .socketTimeout(requestTimeout)
                .build();
        return create(settings);
    }
}
