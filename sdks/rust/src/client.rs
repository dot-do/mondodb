//! MongoClient for connecting to MongoDB via RPC.

use crate::db::Database;
use crate::error::{MongoError, Result};
use std::sync::Arc;

/// Options for connecting to MongoDB.
#[derive(Debug, Clone)]
pub struct ClientOptions {
    /// Connection timeout in milliseconds.
    pub connect_timeout_ms: Option<u64>,
    /// Server selection timeout in milliseconds.
    pub server_selection_timeout_ms: Option<u64>,
    /// Maximum number of connections in the pool.
    pub max_pool_size: Option<u32>,
    /// Minimum number of connections in the pool.
    pub min_pool_size: Option<u32>,
    /// Application name for server logs.
    pub app_name: Option<String>,
    /// Whether to use TLS.
    pub tls: Option<bool>,
    /// Direct connection (bypass replica set discovery).
    pub direct_connection: Option<bool>,
}

impl Default for ClientOptions {
    fn default() -> Self {
        Self {
            connect_timeout_ms: Some(30_000),
            server_selection_timeout_ms: Some(30_000),
            max_pool_size: Some(100),
            min_pool_size: Some(0),
            app_name: None,
            tls: None,
            direct_connection: None,
        }
    }
}

impl ClientOptions {
    /// Create a new ClientOptions with defaults.
    pub fn builder() -> ClientOptionsBuilder {
        ClientOptionsBuilder::default()
    }

    /// Parse options from a connection string.
    pub fn parse(uri: &str) -> Result<Self> {
        let mut options = ClientOptions::default();

        // Parse the URI to extract options
        if let Some(query_start) = uri.find('?') {
            let query = &uri[query_start + 1..];
            for param in query.split('&') {
                if let Some(eq_pos) = param.find('=') {
                    let key = &param[..eq_pos];
                    let value = &param[eq_pos + 1..];

                    match key {
                        "connectTimeoutMS" => {
                            if let Ok(v) = value.parse() {
                                options.connect_timeout_ms = Some(v);
                            }
                        }
                        "serverSelectionTimeoutMS" => {
                            if let Ok(v) = value.parse() {
                                options.server_selection_timeout_ms = Some(v);
                            }
                        }
                        "maxPoolSize" => {
                            if let Ok(v) = value.parse() {
                                options.max_pool_size = Some(v);
                            }
                        }
                        "minPoolSize" => {
                            if let Ok(v) = value.parse() {
                                options.min_pool_size = Some(v);
                            }
                        }
                        "appName" => {
                            options.app_name = Some(value.to_string());
                        }
                        "tls" | "ssl" => {
                            options.tls = Some(value == "true");
                        }
                        "directConnection" => {
                            options.direct_connection = Some(value == "true");
                        }
                        _ => {}
                    }
                }
            }
        }

        Ok(options)
    }
}

/// Builder for ClientOptions.
#[derive(Debug, Clone, Default)]
pub struct ClientOptionsBuilder {
    options: ClientOptions,
}

impl ClientOptionsBuilder {
    /// Set the connection timeout.
    pub fn connect_timeout_ms(mut self, timeout: u64) -> Self {
        self.options.connect_timeout_ms = Some(timeout);
        self
    }

    /// Set the server selection timeout.
    pub fn server_selection_timeout_ms(mut self, timeout: u64) -> Self {
        self.options.server_selection_timeout_ms = Some(timeout);
        self
    }

    /// Set the maximum pool size.
    pub fn max_pool_size(mut self, size: u32) -> Self {
        self.options.max_pool_size = Some(size);
        self
    }

    /// Set the minimum pool size.
    pub fn min_pool_size(mut self, size: u32) -> Self {
        self.options.min_pool_size = Some(size);
        self
    }

    /// Set the application name.
    pub fn app_name(mut self, name: impl Into<String>) -> Self {
        self.options.app_name = Some(name.into());
        self
    }

    /// Enable or disable TLS.
    pub fn tls(mut self, enabled: bool) -> Self {
        self.options.tls = Some(enabled);
        self
    }

    /// Enable or disable direct connection.
    pub fn direct_connection(mut self, direct: bool) -> Self {
        self.options.direct_connection = Some(direct);
        self
    }

    /// Build the options.
    pub fn build(self) -> ClientOptions {
        self.options
    }
}

/// A MongoDB client that uses RPC transport.
///
/// # Example
///
/// ```ignore
/// use mongo_do::MongoClient;
///
/// #[tokio::main]
/// async fn main() -> mongo_do::Result<()> {
///     let client = MongoClient::new("mongodb://localhost").await?;
///     let db = client.database("mydb");
///     let users = db.collection::<User>("users");
///
///     // Perform operations...
///
///     client.close().await?;
///     Ok(())
/// }
/// ```
pub struct MongoClient {
    /// RPC client for transport.
    rpc_client: Arc<rpc_do::RpcClient>,
    /// Connection URI.
    uri: String,
    /// Client options.
    options: ClientOptions,
}

impl MongoClient {
    /// Create a new MongoDB client with the given URI.
    ///
    /// # Arguments
    ///
    /// * `uri` - A MongoDB connection string (mongodb:// or https:// for RPC)
    ///
    /// # Example
    ///
    /// ```ignore
    /// let client = MongoClient::new("mongodb://localhost:27017").await?;
    /// ```
    pub async fn new(uri: &str) -> Result<Self> {
        let options = ClientOptions::parse(uri)?;
        Self::with_options(uri, options).await
    }

    /// Create a new MongoDB client with custom options.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let options = ClientOptions::builder()
    ///     .connect_timeout_ms(10_000)
    ///     .app_name("my-app")
    ///     .build();
    /// let client = MongoClient::with_options("mongodb://localhost", options).await?;
    /// ```
    pub async fn with_options(uri: &str, options: ClientOptions) -> Result<Self> {
        // Convert MongoDB URI to WebSocket URL for RPC
        let ws_url = convert_uri_to_ws(uri)?;

        // Create RPC client configuration
        let rpc_config = rpc_do::RpcClientConfig {
            timeout_ms: options.connect_timeout_ms.unwrap_or(30_000),
            max_retries: 3,
            auto_reconnect: true,
            health_check_interval_ms: 0,
        };

        // Connect via RPC
        let rpc_client = rpc_do::RpcClient::connect_with_config(&ws_url, rpc_config)
            .await
            .map_err(|e| MongoError::Connection(e.to_string()))?;

        Ok(Self {
            rpc_client: Arc::new(rpc_client),
            uri: uri.to_string(),
            options,
        })
    }

    /// Create a client with an existing RPC client (useful for testing).
    pub fn with_rpc_client(uri: String, rpc_client: Arc<rpc_do::RpcClient>, options: ClientOptions) -> Self {
        Self {
            rpc_client,
            uri,
            options,
        }
    }

    /// Get a database handle.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let db = client.database("mydb");
    /// ```
    pub fn database(&self, name: &str) -> Database {
        Database::new(name.to_string(), self.rpc_client.clone())
    }

    /// Get the default database from the connection URI.
    ///
    /// Returns `None` if no default database is specified in the URI.
    pub fn default_database(&self) -> Option<Database> {
        // Parse database name from URI
        // mongodb://host:port/dbname
        let uri = &self.uri;
        let without_scheme = uri
            .strip_prefix("mongodb://")
            .or_else(|| uri.strip_prefix("mongodb+srv://"))
            .or_else(|| uri.strip_prefix("https://"))
            .or_else(|| uri.strip_prefix("wss://"))?;

        // Find the path part after host:port
        let path_start = without_scheme.find('/')?;
        let path = &without_scheme[path_start + 1..];

        // Remove query string if present
        let db_name = path.split('?').next()?;

        if db_name.is_empty() {
            None
        } else {
            Some(self.database(db_name))
        }
    }

    /// List all database names.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let names = client.list_database_names().await?;
    /// for name in names {
    ///     println!("Database: {}", name);
    /// }
    /// ```
    pub async fn list_database_names(&self) -> Result<Vec<String>> {
        let result = self
            .rpc_client
            .call_raw("mongo.listDatabases", vec![])
            .await?;

        if let Some(arr) = result.as_array() {
            Ok(arr
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect())
        } else {
            Ok(vec![])
        }
    }

    /// Get the connection URI.
    pub fn uri(&self) -> &str {
        &self.uri
    }

    /// Get the client options.
    pub fn options(&self) -> &ClientOptions {
        &self.options
    }

    /// Check if the client is connected.
    pub async fn is_connected(&self) -> bool {
        self.rpc_client.is_connected().await
    }

    /// Ping the server to check connectivity.
    ///
    /// # Example
    ///
    /// ```ignore
    /// if client.ping().await.is_ok() {
    ///     println!("Connected to MongoDB");
    /// }
    /// ```
    pub async fn ping(&self) -> Result<()> {
        let result = self.rpc_client.call_raw("mongo.ping", vec![]).await?;

        if result.get("ok").and_then(|v| v.as_f64()).unwrap_or(0.0) >= 1.0 {
            Ok(())
        } else {
            Err(MongoError::Connection("Ping failed".to_string()))
        }
    }

    /// Close the client connection.
    ///
    /// # Example
    ///
    /// ```ignore
    /// client.close().await?;
    /// ```
    pub async fn close(self) -> Result<()> {
        // Get the RPC client from Arc
        match Arc::try_unwrap(self.rpc_client) {
            Ok(client) => {
                client.close().await?;
                Ok(())
            }
            Err(_) => {
                // Other references exist, just return ok
                Ok(())
            }
        }
    }

    /// Get the underlying RPC client (for advanced usage).
    pub fn rpc_client(&self) -> &Arc<rpc_do::RpcClient> {
        &self.rpc_client
    }

    /// Start a client session.
    ///
    /// Sessions enable causal consistency and transactions.
    pub async fn start_session(&self) -> Result<ClientSession> {
        let result = self.rpc_client.call_raw("mongo.startSession", vec![]).await?;

        let session_id = result
            .get("sessionId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| MongoError::Internal("No session ID returned".to_string()))?;

        Ok(ClientSession {
            session_id,
            rpc_client: self.rpc_client.clone(),
        })
    }
}

impl Clone for MongoClient {
    fn clone(&self) -> Self {
        Self {
            rpc_client: self.rpc_client.clone(),
            uri: self.uri.clone(),
            options: self.options.clone(),
        }
    }
}

/// A client session for causal consistency and transactions.
pub struct ClientSession {
    /// Session ID.
    session_id: String,
    /// RPC client.
    rpc_client: Arc<rpc_do::RpcClient>,
}

impl ClientSession {
    /// Get the session ID.
    pub fn id(&self) -> &str {
        &self.session_id
    }

    /// Start a transaction.
    pub async fn start_transaction(&self) -> Result<()> {
        self.rpc_client
            .call_raw(
                "mongo.startTransaction",
                vec![serde_json::json!(self.session_id)],
            )
            .await?;
        Ok(())
    }

    /// Commit the current transaction.
    pub async fn commit_transaction(&self) -> Result<()> {
        self.rpc_client
            .call_raw(
                "mongo.commitTransaction",
                vec![serde_json::json!(self.session_id)],
            )
            .await?;
        Ok(())
    }

    /// Abort the current transaction.
    pub async fn abort_transaction(&self) -> Result<()> {
        self.rpc_client
            .call_raw(
                "mongo.abortTransaction",
                vec![serde_json::json!(self.session_id)],
            )
            .await?;
        Ok(())
    }

    /// End the session.
    pub async fn end(self) -> Result<()> {
        self.rpc_client
            .call_raw("mongo.endSession", vec![serde_json::json!(self.session_id)])
            .await?;
        Ok(())
    }
}

/// Convert a MongoDB URI to a WebSocket URL for RPC.
fn convert_uri_to_ws(uri: &str) -> Result<String> {
    // If it's already a WebSocket URL, return it
    if uri.starts_with("ws://") || uri.starts_with("wss://") {
        return Ok(uri.to_string());
    }

    // If it's an HTTPS URL, convert to WSS
    if uri.starts_with("https://") {
        return Ok(uri.replace("https://", "wss://"));
    }

    // If it's an HTTP URL, convert to WS
    if uri.starts_with("http://") {
        return Ok(uri.replace("http://", "ws://"));
    }

    // Parse MongoDB URI
    if uri.starts_with("mongodb://") || uri.starts_with("mongodb+srv://") {
        let without_scheme = uri
            .strip_prefix("mongodb://")
            .or_else(|| uri.strip_prefix("mongodb+srv://"))
            .unwrap();

        // Extract host:port, ignoring credentials and database
        let host_part = without_scheme
            .split('@')
            .last()
            .unwrap_or(without_scheme)
            .split('/')
            .next()
            .unwrap_or("localhost:27017");

        // Use WSS for mongodb+srv, WS for mongodb
        let scheme = if uri.starts_with("mongodb+srv://") {
            "wss"
        } else {
            "ws"
        };

        return Ok(format!("{}://{}", scheme, host_part));
    }

    // Assume it's a host:port and use ws://
    Ok(format!("ws://{}", uri))
}

/// Alias for MongoClient for compatibility.
pub type Client = MongoClient;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_options_default() {
        let options = ClientOptions::default();
        assert_eq!(options.connect_timeout_ms, Some(30_000));
        assert_eq!(options.server_selection_timeout_ms, Some(30_000));
        assert_eq!(options.max_pool_size, Some(100));
        assert_eq!(options.min_pool_size, Some(0));
        assert!(options.app_name.is_none());
        assert!(options.tls.is_none());
        assert!(options.direct_connection.is_none());
    }

    #[test]
    fn test_client_options_builder() {
        let options = ClientOptions::builder()
            .connect_timeout_ms(10_000)
            .server_selection_timeout_ms(5_000)
            .max_pool_size(50)
            .min_pool_size(5)
            .app_name("test-app")
            .tls(true)
            .direct_connection(false)
            .build();

        assert_eq!(options.connect_timeout_ms, Some(10_000));
        assert_eq!(options.server_selection_timeout_ms, Some(5_000));
        assert_eq!(options.max_pool_size, Some(50));
        assert_eq!(options.min_pool_size, Some(5));
        assert_eq!(options.app_name, Some("test-app".to_string()));
        assert_eq!(options.tls, Some(true));
        assert_eq!(options.direct_connection, Some(false));
    }

    #[test]
    fn test_client_options_parse() {
        let uri = "mongodb://localhost:27017/mydb?connectTimeoutMS=5000&maxPoolSize=50&appName=myapp&tls=true&directConnection=true";
        let options = ClientOptions::parse(uri).unwrap();

        assert_eq!(options.connect_timeout_ms, Some(5000));
        assert_eq!(options.max_pool_size, Some(50));
        assert_eq!(options.app_name, Some("myapp".to_string()));
        assert_eq!(options.tls, Some(true));
        assert_eq!(options.direct_connection, Some(true));
    }

    #[test]
    fn test_client_options_parse_ssl() {
        let uri = "mongodb://localhost:27017/mydb?ssl=true";
        let options = ClientOptions::parse(uri).unwrap();
        assert_eq!(options.tls, Some(true));
    }

    #[test]
    fn test_client_options_parse_no_params() {
        let uri = "mongodb://localhost:27017/mydb";
        let options = ClientOptions::parse(uri).unwrap();
        assert_eq!(options.connect_timeout_ms, Some(30_000)); // default
    }

    #[test]
    fn test_convert_uri_to_ws_already_ws() {
        assert_eq!(
            convert_uri_to_ws("ws://localhost:8080").unwrap(),
            "ws://localhost:8080"
        );
        assert_eq!(
            convert_uri_to_ws("wss://secure.example.com").unwrap(),
            "wss://secure.example.com"
        );
    }

    #[test]
    fn test_convert_uri_to_ws_https() {
        assert_eq!(
            convert_uri_to_ws("https://api.example.com").unwrap(),
            "wss://api.example.com"
        );
    }

    #[test]
    fn test_convert_uri_to_ws_http() {
        assert_eq!(
            convert_uri_to_ws("http://localhost:8080").unwrap(),
            "ws://localhost:8080"
        );
    }

    #[test]
    fn test_convert_uri_to_ws_mongodb() {
        assert_eq!(
            convert_uri_to_ws("mongodb://localhost:27017").unwrap(),
            "ws://localhost:27017"
        );
        assert_eq!(
            convert_uri_to_ws("mongodb://localhost:27017/mydb").unwrap(),
            "ws://localhost:27017"
        );
    }

    #[test]
    fn test_convert_uri_to_ws_mongodb_srv() {
        assert_eq!(
            convert_uri_to_ws("mongodb+srv://cluster.example.com").unwrap(),
            "wss://cluster.example.com"
        );
    }

    #[test]
    fn test_convert_uri_to_ws_mongodb_with_auth() {
        assert_eq!(
            convert_uri_to_ws("mongodb://user:pass@localhost:27017/mydb").unwrap(),
            "ws://localhost:27017"
        );
    }

    #[test]
    fn test_convert_uri_to_ws_bare_host() {
        assert_eq!(
            convert_uri_to_ws("localhost:27017").unwrap(),
            "ws://localhost:27017"
        );
    }

}
