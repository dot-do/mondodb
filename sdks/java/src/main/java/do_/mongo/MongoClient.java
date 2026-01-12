package do_.mongo;

import java.io.Closeable;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * MongoDB Client - the main entry point for database connections.
 * <p>
 * This client manages connections and provides access to databases.
 * </p>
 *
 * <pre>{@code
 * // Create client from connection string
 * MongoClient client = MongoClient.create("mongodb://localhost:27017");
 *
 * // Get a database
 * MongoDatabase db = client.getDatabase("myapp");
 *
 * // Get a collection
 * MongoCollection<Document> users = db.getCollection("users");
 *
 * // Perform operations
 * users.insertOne(new Document("name", "John"));
 *
 * // Close when done
 * client.close();
 * }</pre>
 */
public class MongoClient implements Closeable {

    private static final Pattern URI_PATTERN = Pattern.compile(
            "^(mongodb(?:\\+srv)?)://" +
                    "(?:([^:@]+)(?::([^@]*))?@)?" +
                    "([^/?]+)" +
                    "(?:/([^?]*))?" +
                    "(?:\\?(.*))?$"
    );

    private final MongoClientSettings settings;
    private final Map<String, MongoDatabase> databases;
    private RpcTransport transport;
    private boolean connected;
    private boolean closed;
    private String defaultDatabase;

    /**
     * Creates a MongoClient with settings.
     *
     * @param settings the client settings
     */
    private MongoClient(MongoClientSettings settings) {
        this.settings = settings;
        this.databases = new HashMap<>();
        this.connected = false;
        this.closed = false;
        this.defaultDatabase = settings.getDefaultDatabase();

        // Parse default database from connection string if not set
        if (this.defaultDatabase == null && settings.getConnectionString() != null) {
            ParsedUri parsed = parseUri(settings.getConnectionString());
            this.defaultDatabase = parsed.database;
        }
    }

    /**
     * Creates a MongoClient from a connection string.
     *
     * @param connectionString the MongoDB connection string
     * @return the client
     */
    public static MongoClient create(String connectionString) {
        MongoClientSettings settings = MongoClientSettings.fromConnectionString(connectionString);
        return new MongoClient(settings);
    }

    /**
     * Creates a MongoClient from settings.
     *
     * @param settings the client settings
     * @return the client
     */
    public static MongoClient create(MongoClientSettings settings) {
        return new MongoClient(settings);
    }

    /**
     * Creates and connects a MongoClient asynchronously.
     *
     * @param connectionString the MongoDB connection string
     * @return a CompletableFuture with the connected client
     */
    public static CompletableFuture<MongoClient> connectAsync(String connectionString) {
        MongoClient client = create(connectionString);
        return client.connectAsync().thenApply(v -> client);
    }

    /**
     * Connects to the database.
     *
     * @return this client
     * @throws MongoConnectionException if connection fails
     */
    public MongoClient connect() {
        if (connected) return this;
        if (closed) throw new MongoException("Client is closed");

        try {
            // Create transport (mock for now, real implementation would use HTTP/WebSocket)
            transport = new MockRpcTransport();

            // Perform handshake
            transport.call("connect", settings.getConnectionString());
            connected = true;
            return this;
        } catch (Exception e) {
            throw new MongoConnectionException("Failed to connect: " + e.getMessage(), e);
        }
    }

    /**
     * Connects to the database asynchronously.
     *
     * @return a CompletableFuture
     */
    public CompletableFuture<Void> connectAsync() {
        if (connected) return CompletableFuture.completedFuture(null);
        if (closed) return CompletableFuture.failedFuture(new MongoException("Client is closed"));

        return CompletableFuture.supplyAsync(() -> {
            connect();
            return null;
        });
    }

    /**
     * Gets a database by name.
     *
     * @param name the database name
     * @return the database
     */
    public MongoDatabase getDatabase(String name) {
        ensureConnected();
        return databases.computeIfAbsent(name, n -> new MongoDatabase(transport, n));
    }

    /**
     * Gets the default database (from connection string).
     *
     * @return the default database, or test if not specified
     */
    public MongoDatabase getDatabase() {
        return getDatabase(defaultDatabase != null ? defaultDatabase : "test");
    }

    /**
     * Lists all database names.
     *
     * @return a list of database names
     */
    @SuppressWarnings("unchecked")
    public List<String> listDatabaseNames() {
        ensureConnected();
        Object result = transport.call("listDatabases");
        List<String> names = new ArrayList<>();
        if (result instanceof Document) {
            Object dbs = ((Document) result).get("databases");
            if (dbs instanceof List) {
                for (Object db : (List<?>) dbs) {
                    if (db instanceof Document) {
                        names.add(((Document) db).getString("name"));
                    } else if (db instanceof Map) {
                        names.add((String) ((Map<?, ?>) db).get("name"));
                    }
                }
            }
        } else if (result instanceof Map) {
            Object dbs = ((Map<?, ?>) result).get("databases");
            if (dbs instanceof List) {
                for (Object db : (List<?>) dbs) {
                    if (db instanceof Map) {
                        names.add((String) ((Map<?, ?>) db).get("name"));
                    }
                }
            }
        }
        return names;
    }

    /**
     * Lists all databases with full information.
     *
     * @return a list of database info documents
     */
    @SuppressWarnings("unchecked")
    public List<Document> listDatabases() {
        ensureConnected();
        Object result = transport.call("listDatabases");
        List<Document> databases = new ArrayList<>();
        if (result instanceof Document) {
            Object dbs = ((Document) result).get("databases");
            if (dbs instanceof List) {
                for (Object db : (List<?>) dbs) {
                    if (db instanceof Document) {
                        databases.add((Document) db);
                    } else if (db instanceof Map) {
                        databases.add(new Document((Map<String, Object>) db));
                    }
                }
            }
        } else if (result instanceof Map) {
            Object dbs = ((Map<?, ?>) result).get("databases");
            if (dbs instanceof List) {
                for (Object db : (List<?>) dbs) {
                    if (db instanceof Map) {
                        databases.add(new Document((Map<String, Object>) db));
                    }
                }
            }
        }
        return databases;
    }

    /**
     * Drops a database.
     *
     * @param databaseName the database name
     */
    public void dropDatabase(String databaseName) {
        ensureConnected();
        transport.call("dropDatabase", databaseName);
        databases.remove(databaseName);
    }

    /**
     * Pings the server.
     *
     * @return true if server is reachable
     */
    public boolean ping() {
        ensureConnected();
        try {
            Object result = transport.call("ping");
            if (result instanceof Document) {
                return ((Document) result).getInteger("ok", 0) == 1;
            } else if (result instanceof Map) {
                Object ok = ((Map<?, ?>) result).get("ok");
                return ok instanceof Number && ((Number) ok).intValue() == 1;
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Gets the server status.
     *
     * @return the server status
     */
    @SuppressWarnings("unchecked")
    public Document getServerStatus() {
        ensureConnected();
        Object result = transport.call("serverStatus");
        if (result instanceof Document) {
            return (Document) result;
        } else if (result instanceof Map) {
            return new Document((Map<String, Object>) result);
        }
        return new Document();
    }

    /**
     * Checks if the client is connected.
     *
     * @return true if connected
     */
    public boolean isConnected() {
        return connected && !closed;
    }

    /**
     * Closes the client.
     */
    @Override
    public void close() {
        if (closed) return;
        closed = true;
        connected = false;
        if (transport != null) {
            transport.close();
            transport = null;
        }
        databases.clear();
    }

    /**
     * Gets the settings.
     *
     * @return the client settings
     */
    public MongoClientSettings getSettings() {
        return settings;
    }

    /**
     * Sets a custom transport (for testing).
     *
     * @param transport the transport to use
     */
    public void setTransport(RpcTransport transport) {
        this.transport = transport;
        this.connected = true;
    }

    /**
     * Gets the transport (for testing).
     *
     * @return the transport
     */
    public RpcTransport getTransport() {
        return transport;
    }

    /**
     * Ensures the client is connected.
     */
    private void ensureConnected() {
        if (closed) {
            throw new MongoException("Client is closed");
        }
        if (!connected) {
            connect();
        }
    }

    /**
     * Parses a MongoDB connection URI.
     */
    private ParsedUri parseUri(String uri) {
        ParsedUri parsed = new ParsedUri();
        Matcher matcher = URI_PATTERN.matcher(uri);
        if (matcher.matches()) {
            parsed.protocol = matcher.group(1);
            parsed.username = matcher.group(2);
            parsed.password = matcher.group(3);
            parsed.host = matcher.group(4);
            parsed.database = matcher.group(5);
            parsed.options = matcher.group(6);
        }
        return parsed;
    }

    /**
     * Parsed URI components.
     */
    private static class ParsedUri {
        String protocol;
        String username;
        String password;
        String host;
        String database;
        String options;
    }
}
