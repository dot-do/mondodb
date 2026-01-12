package do_.mongo;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.*;

/**
 * Unit tests for MongoClient.
 */
@DisplayName("MongoClient")
class MongoClientTest {

    private MongoClient client;

    @BeforeEach
    void setUp() {
        client = MongoClients.createMock();
    }

    @AfterEach
    void tearDown() {
        if (client != null) {
            client.close();
        }
    }

    @Nested
    @DisplayName("Connection")
    class ConnectionTests {

        @Test
        @DisplayName("should create client from connection string")
        void shouldCreateClientFromConnectionString() {
            MongoClient client = MongoClient.create("mongodb://localhost:27017/test");
            assertThat(client).isNotNull();
            client.close();
        }

        @Test
        @DisplayName("should connect automatically when accessing database")
        void shouldConnectAutomatically() {
            assertThat(client.isConnected()).isTrue();
            MongoDatabase db = client.getDatabase("test");
            assertThat(db).isNotNull();
            assertThat(db.getName()).isEqualTo("test");
        }

        @Test
        @DisplayName("should ping successfully")
        void shouldPingSuccessfully() {
            assertThat(client.ping()).isTrue();
        }

        @Test
        @DisplayName("should throw when using closed client")
        void shouldThrowWhenClosed() {
            client.close();
            assertThatThrownBy(() -> client.getDatabase("test"))
                    .isInstanceOf(MongoException.class)
                    .hasMessageContaining("closed");
        }
    }

    @Nested
    @DisplayName("Database Operations")
    class DatabaseOperationTests {

        @Test
        @DisplayName("should get database by name")
        void shouldGetDatabaseByName() {
            MongoDatabase db = client.getDatabase("myapp");
            assertThat(db).isNotNull();
            assertThat(db.getName()).isEqualTo("myapp");
        }

        @Test
        @DisplayName("should list databases")
        void shouldListDatabases() {
            // First create some databases by inserting data
            client.getDatabase("db1").getCollection("test").insertOne(new Document("x", 1));
            client.getDatabase("db2").getCollection("test").insertOne(new Document("x", 2));

            List<String> names = client.listDatabaseNames();
            assertThat(names).contains("db1", "db2");
        }

        @Test
        @DisplayName("should drop database")
        void shouldDropDatabase() {
            MongoDatabase db = client.getDatabase("toDelete");
            db.getCollection("test").insertOne(new Document("x", 1));

            client.dropDatabase("toDelete");

            // After dropping, the collection should be empty
            MongoDatabase freshDb = client.getDatabase("toDelete");
            assertThat(freshDb.getCollection("test").countDocuments()).isEqualTo(0);
        }
    }

    @Nested
    @DisplayName("Settings")
    class SettingsTests {

        @Test
        @DisplayName("should create client with settings")
        void shouldCreateWithSettings() {
            MongoClientSettings settings = MongoClientSettings.builder()
                    .applyConnectionString("mongodb://localhost/mydb")
                    .connectTimeout(java.time.Duration.ofSeconds(5))
                    .build();

            MongoClient client = MongoClients.create(settings);
            assertThat(client).isNotNull();
            assertThat(client.getSettings().getConnectionString()).isEqualTo("mongodb://localhost/mydb");
            client.close();
        }
    }
}
