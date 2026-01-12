//! Collection struct with CRUD operations.

use crate::cursor::Cursor;
use crate::error::{MongoError, Result};
use bson::{doc, oid::ObjectId, Document};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value as JsonValue;
use std::marker::PhantomData;
use std::sync::Arc;

/// Result of an insert_one operation.
#[derive(Debug, Clone)]
pub struct InsertOneResult {
    /// The ID of the inserted document.
    pub inserted_id: bson::Bson,
}

/// Result of an insert_many operation.
#[derive(Debug, Clone)]
pub struct InsertManyResult {
    /// Map of index to inserted ID.
    pub inserted_ids: std::collections::HashMap<usize, bson::Bson>,
}

/// Result of an update operation.
#[derive(Debug, Clone)]
pub struct UpdateResult {
    /// Number of documents matched.
    pub matched_count: u64,
    /// Number of documents modified.
    pub modified_count: u64,
    /// The ID of the upserted document, if any.
    pub upserted_id: Option<bson::Bson>,
}

/// Result of a delete operation.
#[derive(Debug, Clone)]
pub struct DeleteResult {
    /// Number of documents deleted.
    pub deleted_count: u64,
}

/// Options for find operations.
#[derive(Debug, Clone, Default)]
pub struct FindOptions {
    /// Maximum number of documents to return.
    pub limit: Option<i64>,
    /// Number of documents to skip.
    pub skip: Option<u64>,
    /// Sort order.
    pub sort: Option<Document>,
    /// Projection (fields to include/exclude).
    pub projection: Option<Document>,
    /// Batch size for cursor.
    pub batch_size: Option<u32>,
}

impl FindOptions {
    /// Create new find options.
    pub fn builder() -> FindOptionsBuilder {
        FindOptionsBuilder::default()
    }
}

/// Builder for FindOptions.
#[derive(Debug, Clone, Default)]
pub struct FindOptionsBuilder {
    options: FindOptions,
}

impl FindOptionsBuilder {
    /// Set the limit.
    pub fn limit(mut self, limit: i64) -> Self {
        self.options.limit = Some(limit);
        self
    }

    /// Set the skip.
    pub fn skip(mut self, skip: u64) -> Self {
        self.options.skip = Some(skip);
        self
    }

    /// Set the sort order.
    pub fn sort(mut self, sort: Document) -> Self {
        self.options.sort = Some(sort);
        self
    }

    /// Set the projection.
    pub fn projection(mut self, projection: Document) -> Self {
        self.options.projection = Some(projection);
        self
    }

    /// Set the batch size.
    pub fn batch_size(mut self, batch_size: u32) -> Self {
        self.options.batch_size = Some(batch_size);
        self
    }

    /// Build the options.
    pub fn build(self) -> FindOptions {
        self.options
    }
}

/// Options for update operations.
#[derive(Debug, Clone, Default)]
pub struct UpdateOptions {
    /// Whether to insert if no documents match.
    pub upsert: Option<bool>,
    /// Array filters for updating nested arrays.
    pub array_filters: Option<Vec<Document>>,
}

impl UpdateOptions {
    /// Create a builder.
    pub fn builder() -> UpdateOptionsBuilder {
        UpdateOptionsBuilder::default()
    }
}

/// Builder for UpdateOptions.
#[derive(Debug, Clone, Default)]
pub struct UpdateOptionsBuilder {
    options: UpdateOptions,
}

impl UpdateOptionsBuilder {
    /// Set upsert option.
    pub fn upsert(mut self, upsert: bool) -> Self {
        self.options.upsert = Some(upsert);
        self
    }

    /// Set array filters.
    pub fn array_filters(mut self, filters: Vec<Document>) -> Self {
        self.options.array_filters = Some(filters);
        self
    }

    /// Build the options.
    pub fn build(self) -> UpdateOptions {
        self.options
    }
}

/// A handle to a MongoDB collection.
///
/// # Type Parameters
///
/// * `T` - The type of documents in this collection.
///
/// # Example
///
/// ```ignore
/// use mongo_do::{Client, bson::doc};
/// use serde::{Serialize, Deserialize};
///
/// #[derive(Debug, Serialize, Deserialize)]
/// struct User {
///     name: String,
///     email: String,
/// }
///
/// let client = Client::new("mongodb://localhost").await?;
/// let db = client.database("mydb");
/// let users = db.collection::<User>("users");
///
/// users.insert_one(User { name: "John".to_string(), email: "john@example.com".to_string() }).await?;
/// ```
pub struct Collection<T> {
    /// Database name.
    pub(crate) db_name: String,
    /// Collection name.
    pub(crate) name: String,
    /// RPC client.
    pub(crate) rpc_client: Arc<rpc_do::RpcClient>,
    /// Type marker.
    _marker: PhantomData<T>,
}

impl<T> Collection<T> {
    /// Create a new collection handle.
    pub(crate) fn new(db_name: String, name: String, rpc_client: Arc<rpc_do::RpcClient>) -> Self {
        Self {
            db_name,
            name,
            rpc_client,
            _marker: PhantomData,
        }
    }

    /// Get the collection name.
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Get the database name.
    pub fn database_name(&self) -> &str {
        &self.db_name
    }

    /// Get the full namespace (db.collection).
    pub fn namespace(&self) -> String {
        format!("{}.{}", self.db_name, self.name)
    }

    /// Clone this collection with a new type parameter.
    pub fn clone_with_type<U>(&self) -> Collection<U> {
        Collection {
            db_name: self.db_name.clone(),
            name: self.name.clone(),
            rpc_client: self.rpc_client.clone(),
            _marker: PhantomData,
        }
    }
}

impl<T> Clone for Collection<T> {
    fn clone(&self) -> Self {
        Self {
            db_name: self.db_name.clone(),
            name: self.name.clone(),
            rpc_client: self.rpc_client.clone(),
            _marker: PhantomData,
        }
    }
}

impl<T: Serialize + DeserializeOwned + Send + Sync + Unpin + 'static> Collection<T> {
    /// Insert a single document.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let result = collection.insert_one(doc! { "name": "John" }).await?;
    /// println!("Inserted ID: {:?}", result.inserted_id);
    /// ```
    pub async fn insert_one(&self, doc: impl Into<T>) -> Result<InsertOneResult> {
        let document = doc.into();
        let json_doc = serde_json::to_value(&document)?;

        let result = self
            .rpc_client
            .call_raw(
                "mongo.insertOne",
                vec![
                    serde_json::json!(self.db_name),
                    serde_json::json!(self.name),
                    json_doc,
                ],
            )
            .await?;

        let inserted_id = if let Some(id) = result.get("insertedId") {
            json_to_bson(id)
        } else {
            bson::Bson::Null
        };

        Ok(InsertOneResult { inserted_id })
    }

    /// Insert multiple documents.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let docs = vec![
    ///     doc! { "name": "John" },
    ///     doc! { "name": "Jane" },
    /// ];
    /// let result = collection.insert_many(docs).await?;
    /// ```
    pub async fn insert_many(&self, docs: impl IntoIterator<Item = T>) -> Result<InsertManyResult> {
        let json_docs: Vec<JsonValue> = docs
            .into_iter()
            .map(|d| serde_json::to_value(&d))
            .collect::<std::result::Result<_, _>>()?;

        let result = self
            .rpc_client
            .call_raw(
                "mongo.insertMany",
                vec![
                    serde_json::json!(self.db_name),
                    serde_json::json!(self.name),
                    serde_json::json!(json_docs),
                ],
            )
            .await?;

        let mut inserted_ids = std::collections::HashMap::new();
        if let Some(ids) = result.get("insertedIds").and_then(|v| v.as_object()) {
            for (k, v) in ids {
                if let Ok(idx) = k.parse::<usize>() {
                    inserted_ids.insert(idx, json_to_bson(v));
                }
            }
        }

        Ok(InsertManyResult { inserted_ids })
    }

    /// Find documents matching a filter.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let cursor = collection.find(doc! { "status": "active" }).await?;
    /// let docs: Vec<User> = cursor.collect().await?;
    /// ```
    pub async fn find(&self, filter: impl Into<Option<Document>>) -> Result<Cursor<T>> {
        self.find_with_options(filter, None).await
    }

    /// Find documents with options.
    pub async fn find_with_options(
        &self,
        filter: impl Into<Option<Document>>,
        options: impl Into<Option<FindOptions>>,
    ) -> Result<Cursor<T>> {
        let filter_doc = filter.into().unwrap_or_default();
        let options = options.into().unwrap_or_default();

        let filter_json = bson_doc_to_json(&filter_doc)?;
        let mut args = vec![
            serde_json::json!(self.db_name),
            serde_json::json!(self.name),
            filter_json,
        ];

        // Add options
        let mut opts_json = serde_json::Map::new();
        if let Some(limit) = options.limit {
            opts_json.insert("limit".to_string(), serde_json::json!(limit));
        }
        if let Some(skip) = options.skip {
            opts_json.insert("skip".to_string(), serde_json::json!(skip));
        }
        if let Some(ref sort) = options.sort {
            opts_json.insert("sort".to_string(), bson_doc_to_json(sort)?);
        }
        if let Some(ref projection) = options.projection {
            opts_json.insert("projection".to_string(), bson_doc_to_json(projection)?);
        }
        if let Some(batch_size) = options.batch_size {
            opts_json.insert("batchSize".to_string(), serde_json::json!(batch_size));
        }
        args.push(JsonValue::Object(opts_json));

        let result = self.rpc_client.call_raw("mongo.find", args).await?;

        let documents = result
            .get("documents")
            .and_then(|v| v.as_array())
            .map(|arr| arr.clone())
            .unwrap_or_default();

        let cursor_id = result
            .get("cursorId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        Ok(Cursor::new(self.namespace(), documents, cursor_id)
            .with_rpc_client(self.rpc_client.clone()))
    }

    /// Find a single document.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let user = collection.find_one(doc! { "email": "john@example.com" }).await?;
    /// ```
    pub async fn find_one(&self, filter: impl Into<Option<Document>>) -> Result<Option<T>> {
        let filter_doc = filter.into().unwrap_or_default();
        let filter_json = bson_doc_to_json(&filter_doc)?;

        let result = self
            .rpc_client
            .call_raw(
                "mongo.findOne",
                vec![
                    serde_json::json!(self.db_name),
                    serde_json::json!(self.name),
                    filter_json,
                ],
            )
            .await?;

        if result.is_null() {
            return Ok(None);
        }

        serde_json::from_value(result)
            .map(Some)
            .map_err(|e| MongoError::Deserialization(e.to_string()))
    }

    /// Update a single document.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let result = collection.update_one(
    ///     doc! { "_id": id },
    ///     doc! { "$set": { "name": "Jane" } },
    /// ).await?;
    /// ```
    pub async fn update_one(
        &self,
        filter: Document,
        update: Document,
    ) -> Result<UpdateResult> {
        self.update_one_with_options(filter, update, None).await
    }

    /// Update a single document with options.
    pub async fn update_one_with_options(
        &self,
        filter: Document,
        update: Document,
        options: impl Into<Option<UpdateOptions>>,
    ) -> Result<UpdateResult> {
        let options = options.into().unwrap_or_default();

        let filter_json = bson_doc_to_json(&filter)?;
        let update_json = bson_doc_to_json(&update)?;

        let mut args = vec![
            serde_json::json!(self.db_name),
            serde_json::json!(self.name),
            filter_json,
            update_json,
        ];

        let mut opts_json = serde_json::Map::new();
        if let Some(upsert) = options.upsert {
            opts_json.insert("upsert".to_string(), serde_json::json!(upsert));
        }
        if let Some(ref array_filters) = options.array_filters {
            let filters: Vec<JsonValue> = array_filters
                .iter()
                .map(|f| bson_doc_to_json(f))
                .collect::<Result<_>>()?;
            opts_json.insert("arrayFilters".to_string(), serde_json::json!(filters));
        }
        args.push(JsonValue::Object(opts_json));

        let result = self.rpc_client.call_raw("mongo.updateOne", args).await?;

        Ok(UpdateResult {
            matched_count: result
                .get("matchedCount")
                .and_then(|v| v.as_u64())
                .unwrap_or(0),
            modified_count: result
                .get("modifiedCount")
                .and_then(|v| v.as_u64())
                .unwrap_or(0),
            upserted_id: result.get("upsertedId").map(json_to_bson),
        })
    }

    /// Update multiple documents.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let result = collection.update_many(
    ///     doc! { "status": "pending" },
    ///     doc! { "$set": { "status": "processed" } },
    /// ).await?;
    /// ```
    pub async fn update_many(
        &self,
        filter: Document,
        update: Document,
    ) -> Result<UpdateResult> {
        self.update_many_with_options(filter, update, None).await
    }

    /// Update multiple documents with options.
    pub async fn update_many_with_options(
        &self,
        filter: Document,
        update: Document,
        options: impl Into<Option<UpdateOptions>>,
    ) -> Result<UpdateResult> {
        let options = options.into().unwrap_or_default();

        let filter_json = bson_doc_to_json(&filter)?;
        let update_json = bson_doc_to_json(&update)?;

        let mut args = vec![
            serde_json::json!(self.db_name),
            serde_json::json!(self.name),
            filter_json,
            update_json,
        ];

        let mut opts_json = serde_json::Map::new();
        if let Some(upsert) = options.upsert {
            opts_json.insert("upsert".to_string(), serde_json::json!(upsert));
        }
        if let Some(ref array_filters) = options.array_filters {
            let filters: Vec<JsonValue> = array_filters
                .iter()
                .map(|f| bson_doc_to_json(f))
                .collect::<Result<_>>()?;
            opts_json.insert("arrayFilters".to_string(), serde_json::json!(filters));
        }
        args.push(JsonValue::Object(opts_json));

        let result = self.rpc_client.call_raw("mongo.updateMany", args).await?;

        Ok(UpdateResult {
            matched_count: result
                .get("matchedCount")
                .and_then(|v| v.as_u64())
                .unwrap_or(0),
            modified_count: result
                .get("modifiedCount")
                .and_then(|v| v.as_u64())
                .unwrap_or(0),
            upserted_id: result.get("upsertedId").map(json_to_bson),
        })
    }

    /// Delete a single document.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let result = collection.delete_one(doc! { "_id": id }).await?;
    /// ```
    pub async fn delete_one(&self, filter: Document) -> Result<DeleteResult> {
        let filter_json = bson_doc_to_json(&filter)?;

        let result = self
            .rpc_client
            .call_raw(
                "mongo.deleteOne",
                vec![
                    serde_json::json!(self.db_name),
                    serde_json::json!(self.name),
                    filter_json,
                ],
            )
            .await?;

        Ok(DeleteResult {
            deleted_count: result
                .get("deletedCount")
                .and_then(|v| v.as_u64())
                .unwrap_or(0),
        })
    }

    /// Delete multiple documents.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let result = collection.delete_many(doc! { "status": "deleted" }).await?;
    /// ```
    pub async fn delete_many(&self, filter: Document) -> Result<DeleteResult> {
        let filter_json = bson_doc_to_json(&filter)?;

        let result = self
            .rpc_client
            .call_raw(
                "mongo.deleteMany",
                vec![
                    serde_json::json!(self.db_name),
                    serde_json::json!(self.name),
                    filter_json,
                ],
            )
            .await?;

        Ok(DeleteResult {
            deleted_count: result
                .get("deletedCount")
                .and_then(|v| v.as_u64())
                .unwrap_or(0),
        })
    }

    /// Count documents matching a filter.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let count = collection.count_documents(doc! { "status": "active" }).await?;
    /// ```
    pub async fn count_documents(&self, filter: impl Into<Option<Document>>) -> Result<u64> {
        let filter_doc = filter.into().unwrap_or_default();
        let filter_json = bson_doc_to_json(&filter_doc)?;

        let result = self
            .rpc_client
            .call_raw(
                "mongo.countDocuments",
                vec![
                    serde_json::json!(self.db_name),
                    serde_json::json!(self.name),
                    filter_json,
                ],
            )
            .await?;

        result
            .as_u64()
            .ok_or_else(|| MongoError::Deserialization("Expected count as number".to_string()))
    }

    /// Estimated document count (fast).
    pub async fn estimated_document_count(&self) -> Result<u64> {
        let result = self
            .rpc_client
            .call_raw(
                "mongo.estimatedDocumentCount",
                vec![
                    serde_json::json!(self.db_name),
                    serde_json::json!(self.name),
                ],
            )
            .await?;

        result
            .as_u64()
            .ok_or_else(|| MongoError::Deserialization("Expected count as number".to_string()))
    }

    /// Run an aggregation pipeline.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let pipeline = vec![
    ///     doc! { "$match": { "status": "active" } },
    ///     doc! { "$group": { "_id": "$category", "count": { "$sum": 1 } } },
    /// ];
    /// let cursor = collection.aggregate(pipeline).await?;
    /// ```
    pub async fn aggregate(&self, pipeline: impl IntoIterator<Item = Document>) -> Result<Cursor<Document>> {
        let pipeline_json: Vec<JsonValue> = pipeline
            .into_iter()
            .map(|d| bson_doc_to_json(&d))
            .collect::<Result<_>>()?;

        let result = self
            .rpc_client
            .call_raw(
                "mongo.aggregate",
                vec![
                    serde_json::json!(self.db_name),
                    serde_json::json!(self.name),
                    serde_json::json!(pipeline_json),
                ],
            )
            .await?;

        let documents = result
            .get("documents")
            .and_then(|v| v.as_array())
            .map(|arr| arr.clone())
            .unwrap_or_default();

        let cursor_id = result
            .get("cursorId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        Ok(Cursor::new(self.namespace(), documents, cursor_id)
            .with_rpc_client(self.rpc_client.clone()))
    }

    /// Get distinct values for a field.
    pub async fn distinct(&self, field_name: &str, filter: impl Into<Option<Document>>) -> Result<Vec<bson::Bson>> {
        let filter_doc = filter.into().unwrap_or_default();
        let filter_json = bson_doc_to_json(&filter_doc)?;

        let result = self
            .rpc_client
            .call_raw(
                "mongo.distinct",
                vec![
                    serde_json::json!(self.db_name),
                    serde_json::json!(self.name),
                    serde_json::json!(field_name),
                    filter_json,
                ],
            )
            .await?;

        if let Some(arr) = result.as_array() {
            Ok(arr.iter().map(json_to_bson).collect())
        } else {
            Ok(vec![])
        }
    }

    /// Find one document and update it.
    pub async fn find_one_and_update(
        &self,
        filter: Document,
        update: Document,
    ) -> Result<Option<T>> {
        let filter_json = bson_doc_to_json(&filter)?;
        let update_json = bson_doc_to_json(&update)?;

        let result = self
            .rpc_client
            .call_raw(
                "mongo.findOneAndUpdate",
                vec![
                    serde_json::json!(self.db_name),
                    serde_json::json!(self.name),
                    filter_json,
                    update_json,
                ],
            )
            .await?;

        if result.is_null() {
            return Ok(None);
        }

        serde_json::from_value(result)
            .map(Some)
            .map_err(|e| MongoError::Deserialization(e.to_string()))
    }

    /// Find one document and delete it.
    pub async fn find_one_and_delete(&self, filter: Document) -> Result<Option<T>> {
        let filter_json = bson_doc_to_json(&filter)?;

        let result = self
            .rpc_client
            .call_raw(
                "mongo.findOneAndDelete",
                vec![
                    serde_json::json!(self.db_name),
                    serde_json::json!(self.name),
                    filter_json,
                ],
            )
            .await?;

        if result.is_null() {
            return Ok(None);
        }

        serde_json::from_value(result)
            .map(Some)
            .map_err(|e| MongoError::Deserialization(e.to_string()))
    }

    /// Find one document and replace it.
    pub async fn find_one_and_replace(
        &self,
        filter: Document,
        replacement: T,
    ) -> Result<Option<T>> {
        let filter_json = bson_doc_to_json(&filter)?;
        let replacement_json = serde_json::to_value(&replacement)?;

        let result = self
            .rpc_client
            .call_raw(
                "mongo.findOneAndReplace",
                vec![
                    serde_json::json!(self.db_name),
                    serde_json::json!(self.name),
                    filter_json,
                    replacement_json,
                ],
            )
            .await?;

        if result.is_null() {
            return Ok(None);
        }

        serde_json::from_value(result)
            .map(Some)
            .map_err(|e| MongoError::Deserialization(e.to_string()))
    }

    /// Drop the collection.
    pub async fn drop(&self) -> Result<()> {
        self.rpc_client
            .call_raw(
                "mongo.dropCollection",
                vec![
                    serde_json::json!(self.db_name),
                    serde_json::json!(self.name),
                ],
            )
            .await?;
        Ok(())
    }

    /// Create an index.
    pub async fn create_index(&self, keys: Document, options: impl Into<Option<Document>>) -> Result<String> {
        let keys_json = bson_doc_to_json(&keys)?;
        let options_json = match options.into() {
            Some(doc) => bson_doc_to_json(&doc)?,
            None => serde_json::json!({}),
        };

        let result = self
            .rpc_client
            .call_raw(
                "mongo.createIndex",
                vec![
                    serde_json::json!(self.db_name),
                    serde_json::json!(self.name),
                    keys_json,
                    options_json,
                ],
            )
            .await?;

        result
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| MongoError::Deserialization("Expected index name".to_string()))
    }

    /// Drop an index.
    pub async fn drop_index(&self, index_name: &str) -> Result<()> {
        self.rpc_client
            .call_raw(
                "mongo.dropIndex",
                vec![
                    serde_json::json!(self.db_name),
                    serde_json::json!(self.name),
                    serde_json::json!(index_name),
                ],
            )
            .await?;
        Ok(())
    }

    /// List all indexes.
    pub async fn list_indexes(&self) -> Result<Vec<Document>> {
        let result = self
            .rpc_client
            .call_raw(
                "mongo.listIndexes",
                vec![
                    serde_json::json!(self.db_name),
                    serde_json::json!(self.name),
                ],
            )
            .await?;

        if let Some(arr) = result.as_array() {
            arr.iter()
                .map(|v| json_to_bson_doc(v))
                .collect()
        } else {
            Ok(vec![])
        }
    }
}

/// Convert a BSON document to JSON.
fn bson_doc_to_json(doc: &Document) -> Result<JsonValue> {
    // Convert BSON to JSON-compatible format
    let bson_value = bson::Bson::Document(doc.clone());
    bson_to_json(&bson_value)
}

/// Convert a BSON value to JSON.
fn bson_to_json(bson: &bson::Bson) -> Result<JsonValue> {
    match bson {
        bson::Bson::Double(v) => Ok(serde_json::json!(*v)),
        bson::Bson::String(v) => Ok(serde_json::json!(v)),
        bson::Bson::Array(arr) => {
            let json_arr: Vec<JsonValue> = arr
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
            Ok(JsonValue::Object(map))
        }
        bson::Bson::Boolean(v) => Ok(serde_json::json!(*v)),
        bson::Bson::Null => Ok(JsonValue::Null),
        bson::Bson::Int32(v) => Ok(serde_json::json!(*v)),
        bson::Bson::Int64(v) => Ok(serde_json::json!(*v)),
        bson::Bson::ObjectId(oid) => Ok(serde_json::json!({ "$oid": oid.to_hex() })),
        bson::Bson::DateTime(dt) => Ok(serde_json::json!({ "$date": dt.timestamp_millis() })),
        bson::Bson::Binary(bin) => {
            let base64 = base64_encode(&bin.bytes);
            Ok(serde_json::json!({ "$binary": { "base64": base64, "subType": format!("{:02x}", bin.subtype as u8) } }))
        }
        bson::Bson::RegularExpression(regex) => {
            Ok(serde_json::json!({ "$regex": regex.pattern.clone(), "$options": regex.options.clone() }))
        }
        bson::Bson::Timestamp(ts) => {
            Ok(serde_json::json!({ "$timestamp": { "t": ts.time, "i": ts.increment } }))
        }
        _ => Ok(serde_json::json!(bson.to_string())),
    }
}

/// Simple base64 encoding.
fn base64_encode(data: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    let mut i = 0;
    while i < data.len() {
        let b0 = data[i] as usize;
        let b1 = if i + 1 < data.len() { data[i + 1] as usize } else { 0 };
        let b2 = if i + 2 < data.len() { data[i + 2] as usize } else { 0 };

        result.push(ALPHABET[b0 >> 2] as char);
        result.push(ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)] as char);

        if i + 1 < data.len() {
            result.push(ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] as char);
        } else {
            result.push('=');
        }

        if i + 2 < data.len() {
            result.push(ALPHABET[b2 & 0x3f] as char);
        } else {
            result.push('=');
        }

        i += 3;
    }
    result
}

/// Convert JSON to BSON.
fn json_to_bson(json: &JsonValue) -> bson::Bson {
    match json {
        JsonValue::Null => bson::Bson::Null,
        JsonValue::Bool(v) => bson::Bson::Boolean(*v),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                bson::Bson::Int64(i)
            } else if let Some(f) = n.as_f64() {
                bson::Bson::Double(f)
            } else {
                bson::Bson::Null
            }
        }
        JsonValue::String(s) => bson::Bson::String(s.clone()),
        JsonValue::Array(arr) => {
            bson::Bson::Array(arr.iter().map(json_to_bson).collect())
        }
        JsonValue::Object(obj) => {
            // Check for extended JSON types
            if let Some(oid) = obj.get("$oid").and_then(|v| v.as_str()) {
                if let Ok(oid) = ObjectId::parse_str(oid) {
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
fn json_to_bson_doc(json: &JsonValue) -> Result<Document> {
    match json_to_bson(json) {
        bson::Bson::Document(doc) => Ok(doc),
        _ => Err(MongoError::Deserialization("Expected document".to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_insert_one_result() {
        let result = InsertOneResult {
            inserted_id: bson::Bson::ObjectId(ObjectId::new()),
        };
        assert!(!result.inserted_id.as_object_id().is_none());
    }

    #[test]
    fn test_insert_many_result() {
        let mut ids = std::collections::HashMap::new();
        ids.insert(0, bson::Bson::Int32(1));
        ids.insert(1, bson::Bson::Int32(2));
        let result = InsertManyResult { inserted_ids: ids };
        assert_eq!(result.inserted_ids.len(), 2);
    }

    #[test]
    fn test_update_result() {
        let result = UpdateResult {
            matched_count: 5,
            modified_count: 3,
            upserted_id: None,
        };
        assert_eq!(result.matched_count, 5);
        assert_eq!(result.modified_count, 3);
        assert!(result.upserted_id.is_none());
    }

    #[test]
    fn test_delete_result() {
        let result = DeleteResult { deleted_count: 10 };
        assert_eq!(result.deleted_count, 10);
    }

    #[test]
    fn test_find_options_builder() {
        let options = FindOptions::builder()
            .limit(10)
            .skip(5)
            .sort(doc! { "created": -1 })
            .projection(doc! { "name": 1, "email": 1 })
            .batch_size(100)
            .build();

        assert_eq!(options.limit, Some(10));
        assert_eq!(options.skip, Some(5));
        assert!(options.sort.is_some());
        assert!(options.projection.is_some());
        assert_eq!(options.batch_size, Some(100));
    }

    #[test]
    fn test_update_options_builder() {
        let options = UpdateOptions::builder()
            .upsert(true)
            .array_filters(vec![doc! { "elem.status": "active" }])
            .build();

        assert_eq!(options.upsert, Some(true));
        assert!(options.array_filters.is_some());
    }

    #[test]
    fn test_bson_doc_to_json() {
        let doc = doc! {
            "name": "John",
            "age": 30,
            "active": true,
            "tags": ["a", "b"],
        };
        let json = bson_doc_to_json(&doc).unwrap();
        assert_eq!(json.get("name").unwrap().as_str().unwrap(), "John");
        assert_eq!(json.get("age").unwrap().as_i64().unwrap(), 30);
        assert_eq!(json.get("active").unwrap().as_bool().unwrap(), true);
    }

    #[test]
    fn test_json_to_bson() {
        let json = serde_json::json!({
            "name": "John",
            "age": 30,
            "active": true,
        });
        let bson = json_to_bson(&json);
        assert!(matches!(bson, bson::Bson::Document(_)));
    }

    #[test]
    fn test_json_to_bson_with_oid() {
        let oid = ObjectId::new();
        let json = serde_json::json!({ "$oid": oid.to_hex() });
        let bson = json_to_bson(&json);
        assert!(matches!(bson, bson::Bson::ObjectId(_)));
    }

    #[test]
    fn test_json_to_bson_with_date() {
        let json = serde_json::json!({ "$date": 1704067200000_i64 });
        let bson = json_to_bson(&json);
        assert!(matches!(bson, bson::Bson::DateTime(_)));
    }

    #[test]
    fn test_json_to_bson_doc() {
        let json = serde_json::json!({ "key": "value" });
        let doc = json_to_bson_doc(&json).unwrap();
        assert_eq!(doc.get_str("key").unwrap(), "value");
    }

    #[test]
    fn test_json_to_bson_doc_error() {
        let json = serde_json::json!("not a document");
        let result = json_to_bson_doc(&json);
        assert!(matches!(result, Err(MongoError::Deserialization(_))));
    }

    #[test]
    fn test_base64_encode() {
        assert_eq!(base64_encode(b"hello"), "aGVsbG8=");
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"a"), "YQ==");
        assert_eq!(base64_encode(b"ab"), "YWI=");
        assert_eq!(base64_encode(b"abc"), "YWJj");
    }

    #[test]
    fn test_bson_to_json_all_types() {
        // Double
        let bson = bson::Bson::Double(3.14);
        let json = bson_to_json(&bson).unwrap();
        assert_eq!(json.as_f64().unwrap(), 3.14);

        // String
        let bson = bson::Bson::String("test".to_string());
        let json = bson_to_json(&bson).unwrap();
        assert_eq!(json.as_str().unwrap(), "test");

        // Boolean
        let bson = bson::Bson::Boolean(true);
        let json = bson_to_json(&bson).unwrap();
        assert_eq!(json.as_bool().unwrap(), true);

        // Null
        let bson = bson::Bson::Null;
        let json = bson_to_json(&bson).unwrap();
        assert!(json.is_null());

        // Int32
        let bson = bson::Bson::Int32(42);
        let json = bson_to_json(&bson).unwrap();
        assert_eq!(json.as_i64().unwrap(), 42);

        // Int64
        let bson = bson::Bson::Int64(42);
        let json = bson_to_json(&bson).unwrap();
        assert_eq!(json.as_i64().unwrap(), 42);

        // ObjectId
        let oid = ObjectId::new();
        let bson = bson::Bson::ObjectId(oid);
        let json = bson_to_json(&bson).unwrap();
        assert!(json.get("$oid").is_some());

        // DateTime
        let dt = bson::DateTime::now();
        let bson = bson::Bson::DateTime(dt);
        let json = bson_to_json(&bson).unwrap();
        assert!(json.get("$date").is_some());

        // Array
        let bson = bson::Bson::Array(vec![bson::Bson::Int32(1), bson::Bson::Int32(2)]);
        let json = bson_to_json(&bson).unwrap();
        assert!(json.is_array());
        assert_eq!(json.as_array().unwrap().len(), 2);
    }

    #[test]
    fn test_json_to_bson_all_types() {
        // Null
        let json = JsonValue::Null;
        let bson = json_to_bson(&json);
        assert!(matches!(bson, bson::Bson::Null));

        // Bool
        let json = serde_json::json!(true);
        let bson = json_to_bson(&json);
        assert!(matches!(bson, bson::Bson::Boolean(true)));

        // Integer
        let json = serde_json::json!(42);
        let bson = json_to_bson(&json);
        assert!(matches!(bson, bson::Bson::Int64(42)));

        // Float
        let json = serde_json::json!(3.14);
        let bson = json_to_bson(&json);
        assert!(matches!(bson, bson::Bson::Double(_)));

        // String
        let json = serde_json::json!("test");
        let bson = json_to_bson(&json);
        assert!(matches!(bson, bson::Bson::String(_)));

        // Array
        let json = serde_json::json!([1, 2, 3]);
        let bson = json_to_bson(&json);
        assert!(matches!(bson, bson::Bson::Array(_)));
    }

    #[test]
    fn test_find_options_default() {
        let options = FindOptions::default();
        assert!(options.limit.is_none());
        assert!(options.skip.is_none());
        assert!(options.sort.is_none());
        assert!(options.projection.is_none());
        assert!(options.batch_size.is_none());
    }

    #[test]
    fn test_update_options_default() {
        let options = UpdateOptions::default();
        assert!(options.upsert.is_none());
        assert!(options.array_filters.is_none());
    }
}
