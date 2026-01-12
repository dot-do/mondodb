package do_.mongo;

import java.time.Duration;

/**
 * Settings for configuring a MongoClient.
 *
 * <pre>{@code
 * MongoClientSettings settings = MongoClientSettings.builder()
 *     .connectionString("mongodb://localhost:27017")
 *     .connectTimeout(Duration.ofSeconds(10))
 *     .maxRetries(3)
 *     .build();
 *
 * MongoClient client = MongoClient.create(settings);
 * }</pre>
 */
public class MongoClientSettings {

    private final String connectionString;
    private final Duration connectTimeout;
    private final Duration socketTimeout;
    private final int maxRetries;
    private final Duration retryDelay;
    private final boolean autoReconnect;
    private final String authToken;
    private final String defaultDatabase;

    private MongoClientSettings(Builder builder) {
        this.connectionString = builder.connectionString;
        this.connectTimeout = builder.connectTimeout;
        this.socketTimeout = builder.socketTimeout;
        this.maxRetries = builder.maxRetries;
        this.retryDelay = builder.retryDelay;
        this.autoReconnect = builder.autoReconnect;
        this.authToken = builder.authToken;
        this.defaultDatabase = builder.defaultDatabase;
    }

    /**
     * Creates a new builder.
     *
     * @return the builder
     */
    public static Builder builder() {
        return new Builder();
    }

    /**
     * Creates default settings with a connection string.
     *
     * @param connectionString the connection string
     * @return the settings
     */
    public static MongoClientSettings fromConnectionString(String connectionString) {
        return builder().connectionString(connectionString).build();
    }

    public String getConnectionString() {
        return connectionString;
    }

    public Duration getConnectTimeout() {
        return connectTimeout;
    }

    public Duration getSocketTimeout() {
        return socketTimeout;
    }

    public int getMaxRetries() {
        return maxRetries;
    }

    public Duration getRetryDelay() {
        return retryDelay;
    }

    public boolean isAutoReconnect() {
        return autoReconnect;
    }

    public String getAuthToken() {
        return authToken;
    }

    public String getDefaultDatabase() {
        return defaultDatabase;
    }

    /**
     * Builder for MongoClientSettings.
     */
    public static class Builder {
        private String connectionString;
        private Duration connectTimeout = Duration.ofSeconds(30);
        private Duration socketTimeout = Duration.ofSeconds(60);
        private int maxRetries = 3;
        private Duration retryDelay = Duration.ofMillis(500);
        private boolean autoReconnect = true;
        private String authToken;
        private String defaultDatabase;

        private Builder() {
        }

        public Builder connectionString(String connectionString) {
            this.connectionString = connectionString;
            return this;
        }

        public Builder connectTimeout(Duration connectTimeout) {
            this.connectTimeout = connectTimeout;
            return this;
        }

        public Builder socketTimeout(Duration socketTimeout) {
            this.socketTimeout = socketTimeout;
            return this;
        }

        public Builder maxRetries(int maxRetries) {
            this.maxRetries = maxRetries;
            return this;
        }

        public Builder retryDelay(Duration retryDelay) {
            this.retryDelay = retryDelay;
            return this;
        }

        public Builder autoReconnect(boolean autoReconnect) {
            this.autoReconnect = autoReconnect;
            return this;
        }

        public Builder authToken(String authToken) {
            this.authToken = authToken;
            return this;
        }

        public Builder defaultDatabase(String defaultDatabase) {
            this.defaultDatabase = defaultDatabase;
            return this;
        }

        public MongoClientSettings build() {
            return new MongoClientSettings(this);
        }
    }
}
