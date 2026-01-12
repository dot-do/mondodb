//! Database struct for managing collections.

use crate::collection::Collection;
use crate::error::{MongoError, Result};
use bson::Document;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::sync::Arc;

/// A handle to a MongoDB database.
///
/// # Example
///
/// ```ignore
/// use mongo_do::Client;
///
/// let client = Client::new("mongodb://localhost").await?;
/// let db = client.database("mydb");
///
/// let collections = db.list_collection_names().await?;
/// println!("Collections: {:?}", collections);
/// ```
pub struct Database {
    /// Database name.
    pub(crate) name: String,
    /// RPC client.
    pub(crate) rpc_client: Arc<rpc_do::RpcClient>,
}

impl Database {
    /// Create a new database handle.
    pub(crate) fn new(name: String, rpc_client: Arc<rpc_do::RpcClient>) -> Self {
        Self { name, rpc_client }
    }

    /// Get the database name.
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Get a handle to a collection with a specific type.
    ///
    /// # Example
    ///
    /// ```ignore
    /// use serde::{Serialize, Deserialize};
    ///
    /// #[derive(Debug, Serialize, Deserialize)]
    /// struct User {
    ///     name: String,
    ///     email: String,
    /// }
    ///
    /// let users = db.collection::<User>("users");
    /// ```
    pub fn collection<T>(&self, name: &str) -> Collection<T>
    where
        T: Serialize + DeserializeOwned + Send + Sync + Unpin + 'static,
    {
        Collection::new(self.name.clone(), name.to_string(), self.rpc_client.clone())
    }

    /// Get a handle to a collection with Document type.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let users = db.collection_with_doc("users");
    /// ```
    pub fn collection_with_doc(&self, name: &str) -> Collection<Document> {
        Collection::new(self.name.clone(), name.to_string(), self.rpc_client.clone())
    }

    /// List all collection names in this database.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let names = db.list_collection_names().await?;
    /// for name in names {
    ///     println!("Collection: {}", name);
    /// }
    /// ```
    pub async fn list_collection_names(&self) -> Result<Vec<String>> {
        let result = self
            .rpc_client
            .call_raw("mongo.listCollections", vec![serde_json::json!(self.name)])
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

    /// Create a new collection.
    ///
    /// # Example
    ///
    /// ```ignore
    /// db.create_collection("new_collection").await?;
    /// ```
    pub async fn create_collection(&self, name: &str) -> Result<()> {
        self.rpc_client
            .call_raw(
                "mongo.createCollection",
                vec![serde_json::json!(self.name), serde_json::json!(name)],
            )
            .await?;
        Ok(())
    }

    /// Create a collection with options.
    pub async fn create_collection_with_options(
        &self,
        name: &str,
        options: CreateCollectionOptions,
    ) -> Result<()> {
        let mut opts = serde_json::Map::new();
        if let Some(capped) = options.capped {
            opts.insert("capped".to_string(), serde_json::json!(capped));
        }
        if let Some(size) = options.size {
            opts.insert("size".to_string(), serde_json::json!(size));
        }
        if let Some(max) = options.max {
            opts.insert("max".to_string(), serde_json::json!(max));
        }
        if let Some(ref validator) = options.validator {
            opts.insert(
                "validator".to_string(),
                bson_doc_to_json(validator)?,
            );
        }

        self.rpc_client
            .call_raw(
                "mongo.createCollection",
                vec![
                    serde_json::json!(self.name),
                    serde_json::json!(name),
                    serde_json::Value::Object(opts),
                ],
            )
            .await?;
        Ok(())
    }

    /// Drop the database.
    ///
    /// # Warning
    ///
    /// This will permanently delete the database and all its collections.
    ///
    /// # Example
    ///
    /// ```ignore
    /// db.drop().await?;
    /// ```
    pub async fn drop(&self) -> Result<()> {
        self.rpc_client
            .call_raw("mongo.dropDatabase", vec![serde_json::json!(self.name)])
            .await?;
        Ok(())
    }

    /// Run a database command.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let result = db.run_command(doc! { "ping": 1 }).await?;
    /// ```
    pub async fn run_command(&self, command: Document) -> Result<Document> {
        let command_json = bson_doc_to_json(&command)?;

        let result = self
            .rpc_client
            .call_raw(
                "mongo.runCommand",
                vec![serde_json::json!(self.name), command_json],
            )
            .await?;

        json_to_bson_doc(&result)
    }

    /// Run an aggregation pipeline on the database.
    ///
    /// This is useful for $currentOp, $listLocalSessions, etc.
    pub async fn aggregate(&self, pipeline: impl IntoIterator<Item = Document>) -> Result<Vec<Document>> {
        let pipeline_json: Vec<serde_json::Value> = pipeline
            .into_iter()
            .map(|d| bson_doc_to_json(&d))
            .collect::<Result<_>>()?;

        let result = self
            .rpc_client
            .call_raw(
                "mongo.aggregateDb",
                vec![serde_json::json!(self.name), serde_json::json!(pipeline_json)],
            )
            .await?;

        if let Some(arr) = result.as_array() {
            arr.iter().map(json_to_bson_doc).collect()
        } else {
            Ok(vec![])
        }
    }

    /// Get database statistics.
    pub async fn stats(&self) -> Result<Document> {
        self.run_command(bson::doc! { "dbStats": 1 }).await
    }

    /// Get server status.
    pub async fn server_status(&self) -> Result<Document> {
        self.run_command(bson::doc! { "serverStatus": 1 }).await
    }
}

impl Clone for Database {
    fn clone(&self) -> Self {
        Self {
            name: self.name.clone(),
            rpc_client: self.rpc_client.clone(),
        }
    }
}

/// Options for creating a collection.
#[derive(Debug, Clone, Default)]
pub struct CreateCollectionOptions {
    /// Whether the collection is capped.
    pub capped: Option<bool>,
    /// Maximum size in bytes for a capped collection.
    pub size: Option<u64>,
    /// Maximum number of documents in a capped collection.
    pub max: Option<u64>,
    /// Document validation rules.
    pub validator: Option<Document>,
}

impl CreateCollectionOptions {
    /// Create a new builder.
    pub fn builder() -> CreateCollectionOptionsBuilder {
        CreateCollectionOptionsBuilder::default()
    }
}

/// Builder for CreateCollectionOptions.
#[derive(Debug, Clone, Default)]
pub struct CreateCollectionOptionsBuilder {
    options: CreateCollectionOptions,
}

impl CreateCollectionOptionsBuilder {
    /// Set whether the collection is capped.
    pub fn capped(mut self, capped: bool) -> Self {
        self.options.capped = Some(capped);
        self
    }

    /// Set the maximum size for a capped collection.
    pub fn size(mut self, size: u64) -> Self {
        self.options.size = Some(size);
        self
    }

    /// Set the maximum number of documents for a capped collection.
    pub fn max(mut self, max: u64) -> Self {
        self.options.max = Some(max);
        self
    }

    /// Set document validation rules.
    pub fn validator(mut self, validator: Document) -> Self {
        self.options.validator = Some(validator);
        self
    }

    /// Build the options.
    pub fn build(self) -> CreateCollectionOptions {
        self.options
    }
}

/// Convert a BSON document to JSON.
fn bson_doc_to_json(doc: &Document) -> Result<serde_json::Value> {
    let bson_value = bson::Bson::Document(doc.clone());
    bson_to_json(&bson_value)
}

/// Convert a BSON value to JSON.
fn bson_to_json(bson: &bson::Bson) -> Result<serde_json::Value> {
    match bson {
        bson::Bson::Double(v) => Ok(serde_json::json!(*v)),
        bson::Bson::String(v) => Ok(serde_json::json!(v)),
        bson::Bson::Array(arr) => {
            let json_arr: Vec<serde_json::Value> = arr
                .iter()
                .map(bson_to_json)
                .collect::<Result<_>>()?;
            Ok(serde_json::json!(json_arr))
        }
        bson::Bson::Document(doc) => {
            let mut map = serde_json::Map::new();
            for (k, v) in doc {
                map.insert(k.clone(), bson_to_json(v)?);
            }
            Ok(serde_json::Value::Object(map))
        }
        bson::Bson::Boolean(v) => Ok(serde_json::json!(*v)),
        bson::Bson::Null => Ok(serde_json::Value::Null),
        bson::Bson::Int32(v) => Ok(serde_json::json!(*v)),
        bson::Bson::Int64(v) => Ok(serde_json::json!(*v)),
        bson::Bson::ObjectId(oid) => Ok(serde_json::json!({ "$oid": oid.to_hex() })),
        bson::Bson::DateTime(dt) => Ok(serde_json::json!({ "$date": dt.timestamp_millis() })),
        _ => Ok(serde_json::json!(bson.to_string())),
    }
}

/// Convert JSON to BSON.
fn json_to_bson(json: &serde_json::Value) -> bson::Bson {
    match json {
        serde_json::Value::Null => bson::Bson::Null,
        serde_json::Value::Bool(v) => bson::Bson::Boolean(*v),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                bson::Bson::Int64(i)
            } else if let Some(f) = n.as_f64() {
                bson::Bson::Double(f)
            } else {
                bson::Bson::Null
            }
        }
        serde_json::Value::String(s) => bson::Bson::String(s.clone()),
        serde_json::Value::Array(arr) => {
            bson::Bson::Array(arr.iter().map(json_to_bson).collect())
        }
        serde_json::Value::Object(obj) => {
            // Check for extended JSON types
            if let Some(oid) = obj.get("$oid").and_then(|v| v.as_str()) {
                if let Ok(oid) = bson::oid::ObjectId::parse_str(oid) {
                    return bson::Bson::ObjectId(oid);
                }
            }
            if let Some(date) = obj.get("$date").and_then(|v| v.as_i64()) {
                return bson::Bson::DateTime(bson::DateTime::from_millis(date));
            }

            let mut doc = Document::new();
            for (k, v) in obj {
                doc.insert(k.clone(), json_to_bson(v));
            }
            bson::Bson::Document(doc)
        }
    }
}

/// Convert JSON to BSON document.
fn json_to_bson_doc(json: &serde_json::Value) -> Result<Document> {
    match json_to_bson(json) {
        bson::Bson::Document(doc) => Ok(doc),
        _ => Err(MongoError::Deserialization("Expected document".to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_collection_options_builder() {
        let options = CreateCollectionOptions::builder()
            .capped(true)
            .size(1024 * 1024)
            .max(1000)
            .validator(bson::doc! { "$jsonSchema": { "bsonType": "object" } })
            .build();

        assert_eq!(options.capped, Some(true));
        assert_eq!(options.size, Some(1024 * 1024));
        assert_eq!(options.max, Some(1000));
        assert!(options.validator.is_some());
    }

    #[test]
    fn test_create_collection_options_default() {
        let options = CreateCollectionOptions::default();
        assert!(options.capped.is_none());
        assert!(options.size.is_none());
        assert!(options.max.is_none());
        assert!(options.validator.is_none());
    }

    #[test]
    fn test_bson_doc_to_json() {
        let doc = bson::doc! {
            "name": "test",
            "value": 42,
            "active": true,
        };
        let json = bson_doc_to_json(&doc).unwrap();
        assert_eq!(json.get("name").unwrap().as_str().unwrap(), "test");
        assert_eq!(json.get("value").unwrap().as_i64().unwrap(), 42);
        assert_eq!(json.get("active").unwrap().as_bool().unwrap(), true);
    }

    #[test]
    fn test_json_to_bson_doc() {
        let json = serde_json::json!({
            "name": "test",
            "value": 42,
        });
        let doc = json_to_bson_doc(&json).unwrap();
        assert_eq!(doc.get_str("name").unwrap(), "test");
        assert_eq!(doc.get_i64("value").unwrap(), 42);
    }

    #[test]
    fn test_json_to_bson_doc_error() {
        let json = serde_json::json!("not a document");
        let result = json_to_bson_doc(&json);
        assert!(matches!(result, Err(MongoError::Deserialization(_))));
    }

    #[test]
    fn test_bson_to_json_types() {
        // Test various BSON types
        let double = bson_to_json(&bson::Bson::Double(3.14)).unwrap();
        assert_eq!(double.as_f64().unwrap(), 3.14);

        let string = bson_to_json(&bson::Bson::String("test".to_string())).unwrap();
        assert_eq!(string.as_str().unwrap(), "test");

        let boolean = bson_to_json(&bson::Bson::Boolean(true)).unwrap();
        assert_eq!(boolean.as_bool().unwrap(), true);

        let null = bson_to_json(&bson::Bson::Null).unwrap();
        assert!(null.is_null());

        let int32 = bson_to_json(&bson::Bson::Int32(42)).unwrap();
        assert_eq!(int32.as_i64().unwrap(), 42);

        let int64 = bson_to_json(&bson::Bson::Int64(42)).unwrap();
        assert_eq!(int64.as_i64().unwrap(), 42);
    }

    #[test]
    fn test_json_to_bson_types() {
        // Null
        let null = json_to_bson(&serde_json::Value::Null);
        assert!(matches!(null, bson::Bson::Null));

        // Bool
        let boolean = json_to_bson(&serde_json::json!(true));
        assert!(matches!(boolean, bson::Bson::Boolean(true)));

        // Number
        let number = json_to_bson(&serde_json::json!(42));
        assert!(matches!(number, bson::Bson::Int64(42)));

        // Float
        let float = json_to_bson(&serde_json::json!(3.14));
        assert!(matches!(float, bson::Bson::Double(_)));

        // String
        let string = json_to_bson(&serde_json::json!("test"));
        assert!(matches!(string, bson::Bson::String(_)));

        // Array
        let array = json_to_bson(&serde_json::json!([1, 2, 3]));
        assert!(matches!(array, bson::Bson::Array(_)));

        // Object
        let object = json_to_bson(&serde_json::json!({"key": "value"}));
        assert!(matches!(object, bson::Bson::Document(_)));
    }

    #[test]
    fn test_json_to_bson_extended_types() {
        // ObjectId
        let oid = bson::oid::ObjectId::new();
        let json = serde_json::json!({ "$oid": oid.to_hex() });
        let bson = json_to_bson(&json);
        assert!(matches!(bson, bson::Bson::ObjectId(_)));

        // DateTime
        let json = serde_json::json!({ "$date": 1704067200000_i64 });
        let bson = json_to_bson(&json);
        assert!(matches!(bson, bson::Bson::DateTime(_)));
    }

    #[test]
    fn test_bson_to_json_objectid() {
        let oid = bson::oid::ObjectId::new();
        let json = bson_to_json(&bson::Bson::ObjectId(oid)).unwrap();
        assert!(json.get("$oid").is_some());
    }

    #[test]
    fn test_bson_to_json_datetime() {
        let dt = bson::DateTime::now();
        let json = bson_to_json(&bson::Bson::DateTime(dt)).unwrap();
        assert!(json.get("$date").is_some());
    }

    #[test]
    fn test_bson_to_json_array() {
        let arr = bson::Bson::Array(vec![
            bson::Bson::Int32(1),
            bson::Bson::Int32(2),
            bson::Bson::Int32(3),
        ]);
        let json = bson_to_json(&arr).unwrap();
        assert!(json.is_array());
        assert_eq!(json.as_array().unwrap().len(), 3);
    }

    #[test]
    fn test_bson_to_json_document() {
        let doc = bson::Bson::Document(bson::doc! { "a": 1, "b": 2 });
        let json = bson_to_json(&doc).unwrap();
        assert!(json.is_object());
        assert_eq!(json.get("a").unwrap().as_i64().unwrap(), 1);
        assert_eq!(json.get("b").unwrap().as_i64().unwrap(), 2);
    }
}
