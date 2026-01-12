//! Comprehensive tests for mongo-do SDK.
//!
//! These tests verify the MongoDB-compatible API works correctly
//! by testing all major functionality with mocked RPC responses.

use bson::{doc, oid::ObjectId, Document};
use mongo_do::{
    client::{ClientOptions, ClientOptionsBuilder},
    collection::{
        DeleteResult, FindOptions, FindOptionsBuilder, InsertManyResult, InsertOneResult,
        UpdateOptions, UpdateOptionsBuilder, UpdateResult,
    },
    cursor::Cursor,
    db::{CreateCollectionOptions, CreateCollectionOptionsBuilder},
    error::{ErrorKind, MongoError},
    prelude::*,
};
use serde::{Deserialize, Serialize};

// ============================================================================
// Test Document Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct User {
    #[serde(skip_serializing_if = "Option::is_none")]
    _id: Option<ObjectId>,
    name: String,
    email: String,
    #[serde(default)]
    age: i32,
    #[serde(default)]
    active: bool,
}

impl User {
    fn new(name: &str, email: &str) -> Self {
        Self {
            _id: None,
            name: name.to_string(),
            email: email.to_string(),
            age: 0,
            active: true,
        }
    }

    fn with_id(mut self, id: ObjectId) -> Self {
        self._id = Some(id);
        self
    }

    fn with_age(mut self, age: i32) -> Self {
        self.age = age;
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct Order {
    #[serde(skip_serializing_if = "Option::is_none")]
    _id: Option<ObjectId>,
    user_id: ObjectId,
    product: String,
    quantity: i32,
    price: f64,
    status: String,
}

impl Order {
    fn new(user_id: ObjectId, product: &str, quantity: i32, price: f64) -> Self {
        Self {
            _id: None,
            user_id,
            product: product.to_string(),
            quantity,
            price,
            status: "pending".to_string(),
        }
    }
}

// ============================================================================
// Client Tests
// ============================================================================

mod client_tests {
    use super::*;

    #[test]
    fn test_client_options_default_values() {
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
    fn test_client_options_builder_all_options() {
        let options = ClientOptions::builder()
            .connect_timeout_ms(5_000)
            .server_selection_timeout_ms(10_000)
            .max_pool_size(25)
            .min_pool_size(5)
            .app_name("test-app")
            .tls(true)
            .direct_connection(true)
            .build();

        assert_eq!(options.connect_timeout_ms, Some(5_000));
        assert_eq!(options.server_selection_timeout_ms, Some(10_000));
        assert_eq!(options.max_pool_size, Some(25));
        assert_eq!(options.min_pool_size, Some(5));
        assert_eq!(options.app_name, Some("test-app".to_string()));
        assert_eq!(options.tls, Some(true));
        assert_eq!(options.direct_connection, Some(true));
    }

    #[test]
    fn test_client_options_parse_full_uri() {
        let uri = "mongodb://user:pass@host1:27017,host2:27017/testdb?connectTimeoutMS=5000&serverSelectionTimeoutMS=10000&maxPoolSize=50&minPoolSize=10&appName=myapp&tls=true&directConnection=false";
        let options = ClientOptions::parse(uri).unwrap();

        assert_eq!(options.connect_timeout_ms, Some(5000));
        assert_eq!(options.server_selection_timeout_ms, Some(10000));
        assert_eq!(options.max_pool_size, Some(50));
        assert_eq!(options.min_pool_size, Some(10));
        assert_eq!(options.app_name, Some("myapp".to_string()));
        assert_eq!(options.tls, Some(true));
        assert_eq!(options.direct_connection, Some(false));
    }

    #[test]
    fn test_client_options_parse_ssl_alias() {
        let uri = "mongodb://localhost/db?ssl=true";
        let options = ClientOptions::parse(uri).unwrap();
        assert_eq!(options.tls, Some(true));
    }

    #[test]
    fn test_client_options_parse_minimal_uri() {
        let uri = "mongodb://localhost";
        let options = ClientOptions::parse(uri).unwrap();
        // Should have defaults
        assert_eq!(options.connect_timeout_ms, Some(30_000));
    }

    #[test]
    fn test_client_options_builder_chain() {
        let options = ClientOptionsBuilder::default()
            .connect_timeout_ms(1000)
            .app_name("chained")
            .build();

        assert_eq!(options.connect_timeout_ms, Some(1000));
        assert_eq!(options.app_name, Some("chained".to_string()));
    }
}

// ============================================================================
// Collection Tests
// ============================================================================

mod collection_tests {
    use super::*;

    #[test]
    fn test_find_options_builder() {
        let options = FindOptions::builder()
            .limit(100)
            .skip(10)
            .sort(doc! { "created_at": -1 })
            .projection(doc! { "name": 1, "email": 1 })
            .batch_size(50)
            .build();

        assert_eq!(options.limit, Some(100));
        assert_eq!(options.skip, Some(10));
        assert!(options.sort.is_some());
        assert!(options.projection.is_some());
        assert_eq!(options.batch_size, Some(50));
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
    fn test_update_options_builder() {
        let options = UpdateOptions::builder()
            .upsert(true)
            .array_filters(vec![doc! { "elem.status": "active" }])
            .build();

        assert_eq!(options.upsert, Some(true));
        assert!(options.array_filters.is_some());
        assert_eq!(options.array_filters.unwrap().len(), 1);
    }

    #[test]
    fn test_update_options_default() {
        let options = UpdateOptions::default();
        assert!(options.upsert.is_none());
        assert!(options.array_filters.is_none());
    }

    #[test]
    fn test_insert_one_result() {
        let oid = ObjectId::new();
        let result = InsertOneResult {
            inserted_id: bson::Bson::ObjectId(oid),
        };
        assert_eq!(result.inserted_id.as_object_id().unwrap(), oid);
    }

    #[test]
    fn test_insert_many_result() {
        let mut ids = std::collections::HashMap::new();
        ids.insert(0, bson::Bson::Int32(1));
        ids.insert(1, bson::Bson::Int32(2));
        ids.insert(2, bson::Bson::Int32(3));

        let result = InsertManyResult { inserted_ids: ids };
        assert_eq!(result.inserted_ids.len(), 3);
        assert_eq!(result.inserted_ids.get(&0).unwrap().as_i32().unwrap(), 1);
    }

    #[test]
    fn test_update_result_with_upsert() {
        let oid = ObjectId::new();
        let result = UpdateResult {
            matched_count: 0,
            modified_count: 0,
            upserted_id: Some(bson::Bson::ObjectId(oid)),
        };

        assert_eq!(result.matched_count, 0);
        assert_eq!(result.modified_count, 0);
        assert!(result.upserted_id.is_some());
    }

    #[test]
    fn test_update_result_no_upsert() {
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
        let result = DeleteResult { deleted_count: 42 };
        assert_eq!(result.deleted_count, 42);
    }
}

// ============================================================================
// Cursor Tests
// ============================================================================

mod cursor_tests {
    use super::*;

    #[tokio::test]
    async fn test_cursor_empty() {
        let cursor: Cursor<User> = Cursor::empty("test.users".to_string());
        assert!(cursor.is_exhausted().await);
        assert!(cursor.cursor_id().await.is_none());
    }

    #[tokio::test]
    async fn test_cursor_with_data() {
        let data = vec![
            serde_json::json!({"name": "Alice", "email": "alice@test.com", "age": 25, "active": true}),
            serde_json::json!({"name": "Bob", "email": "bob@test.com", "age": 30, "active": true}),
        ];
        let cursor: Cursor<User> = Cursor::new("test.users".to_string(), data, None);

        assert!(!cursor.is_exhausted().await);
        let users = cursor.collect().await.unwrap();
        assert_eq!(users.len(), 2);
        assert_eq!(users[0].name, "Alice");
        assert_eq!(users[1].name, "Bob");
    }

    #[tokio::test]
    async fn test_cursor_with_cursor_id() {
        let cursor: Cursor<User> = Cursor::new(
            "test.users".to_string(),
            vec![],
            Some("cursor-123".to_string()),
        );

        assert_eq!(cursor.cursor_id().await, Some("cursor-123".to_string()));
    }

    #[tokio::test]
    async fn test_cursor_try_next() {
        let data = vec![
            serde_json::json!({"name": "One", "email": "one@test.com", "age": 1, "active": true}),
            serde_json::json!({"name": "Two", "email": "two@test.com", "age": 2, "active": true}),
            serde_json::json!({"name": "Three", "email": "three@test.com", "age": 3, "active": true}),
        ];
        let mut cursor: Cursor<User> = Cursor::new("test.users".to_string(), data, None);

        let first = cursor.try_next().await.unwrap().unwrap();
        assert_eq!(first.name, "One");

        let second = cursor.try_next().await.unwrap().unwrap();
        assert_eq!(second.name, "Two");

        let third = cursor.try_next().await.unwrap().unwrap();
        assert_eq!(third.name, "Three");

        let none = cursor.try_next().await.unwrap();
        assert!(none.is_none());
    }

    #[tokio::test]
    async fn test_cursor_close() {
        let data = vec![serde_json::json!({"name": "Test", "email": "test@test.com", "age": 0, "active": true})];
        let cursor: Cursor<User> = Cursor::new(
            "test.users".to_string(),
            data,
            Some("cursor-to-close".to_string()),
        );

        assert!(!cursor.is_exhausted().await);
        cursor.close().await.unwrap();
        assert!(cursor.is_exhausted().await);
        assert!(cursor.cursor_id().await.is_none());
    }

    #[tokio::test]
    async fn test_cursor_advance_and_current() {
        let data = vec![
            serde_json::json!({"name": "Current", "email": "current@test.com", "age": 100, "active": true}),
        ];
        let mut cursor: Cursor<User> = Cursor::new("test.users".to_string(), data, None);

        let has_next = cursor.advance().await.unwrap();
        assert!(has_next);

        let current = cursor.current().await.unwrap();
        assert_eq!(current.name, "Current");
    }

    #[tokio::test]
    async fn test_cursor_current_exhausted_error() {
        let cursor: Cursor<User> = Cursor::empty("test.users".to_string());
        let result = cursor.current().await;
        assert!(matches!(result, Err(MongoError::CursorExhausted)));
    }

    #[tokio::test]
    async fn test_cursor_deserialization_error() {
        let data = vec![serde_json::json!({"invalid_field": "no name or email"})];
        let mut cursor: Cursor<User> = Cursor::new("test.users".to_string(), data, None);

        let result = cursor.try_next().await;
        assert!(matches!(result, Err(MongoError::Deserialization(_))));
    }
}

// ============================================================================
// Database Tests
// ============================================================================

mod database_tests {
    use super::*;

    #[test]
    fn test_create_collection_options_builder() {
        let options = CreateCollectionOptions::builder()
            .capped(true)
            .size(10 * 1024 * 1024) // 10MB
            .max(10000)
            .validator(doc! { "$jsonSchema": { "bsonType": "object" } })
            .build();

        assert_eq!(options.capped, Some(true));
        assert_eq!(options.size, Some(10 * 1024 * 1024));
        assert_eq!(options.max, Some(10000));
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
}

// ============================================================================
// Error Tests
// ============================================================================

mod error_tests {
    use super::*;

    #[test]
    fn test_error_connection() {
        let err = MongoError::connection("Connection refused");
        assert!(err.is_connection_error());
        assert!(!err.is_auth_error());
        assert!(!err.is_timeout());
        assert_eq!(err.kind(), ErrorKind::Connection);
        assert!(err.to_string().contains("Connection refused"));
    }

    #[test]
    fn test_error_authentication() {
        let err = MongoError::authentication("Invalid credentials");
        assert!(!err.is_connection_error());
        assert!(err.is_auth_error());
        assert!(!err.is_timeout());
        assert_eq!(err.kind(), ErrorKind::Authentication);
    }

    #[test]
    fn test_error_write() {
        let err = MongoError::write(Some(11000), "Duplicate key error");
        assert_eq!(err.code(), Some(11000));
        assert_eq!(err.kind(), ErrorKind::Write);
        assert!(err.to_string().contains("Duplicate key error"));
    }

    #[test]
    fn test_error_command() {
        let err = MongoError::command(59, "Unknown command");
        assert_eq!(err.code(), Some(59));
        assert_eq!(err.kind(), ErrorKind::Command);
    }

    #[test]
    fn test_error_query() {
        let err = MongoError::query("Invalid query syntax");
        assert_eq!(err.kind(), ErrorKind::Query);
        assert!(err.code().is_none());
    }

    #[test]
    fn test_error_timeout() {
        let err = MongoError::Timeout;
        assert!(err.is_timeout());
        assert_eq!(err.kind(), ErrorKind::Timeout);
    }

    #[test]
    fn test_error_network() {
        let err = MongoError::Network("Network unreachable".to_string());
        assert!(err.is_connection_error());
        assert_eq!(err.kind(), ErrorKind::Network);
    }

    #[test]
    fn test_error_bulk_write() {
        let err = MongoError::BulkWrite(5);
        assert_eq!(err.kind(), ErrorKind::Write);
        assert!(err.to_string().contains("5 errors"));
    }

    #[test]
    fn test_error_cursor_exhausted() {
        let err = MongoError::CursorExhausted;
        assert_eq!(err.kind(), ErrorKind::Internal);
    }

    #[test]
    fn test_error_serialization() {
        let err = MongoError::Serialization("Failed to serialize".to_string());
        assert_eq!(err.kind(), ErrorKind::Serialization);
    }

    #[test]
    fn test_error_deserialization() {
        let err = MongoError::Deserialization("Failed to deserialize".to_string());
        assert_eq!(err.kind(), ErrorKind::Serialization);
    }

    #[test]
    fn test_error_message() {
        let err = MongoError::connection("Test error message");
        assert_eq!(err.message(), "connection error: Test error message");
    }

    #[test]
    fn test_error_invalid_argument() {
        let err = MongoError::invalid_argument("Field cannot be empty");
        assert!(err.to_string().contains("Field cannot be empty"));
        assert_eq!(err.kind(), ErrorKind::Internal);
    }
}

// ============================================================================
// Document/BSON Tests
// ============================================================================

mod bson_tests {
    use super::*;

    #[test]
    fn test_doc_macro_basic() {
        let document = doc! {
            "string": "value",
            "number": 42,
            "float": 3.14,
            "boolean": true,
            "null": null,
        };

        assert_eq!(document.get_str("string").unwrap(), "value");
        assert_eq!(document.get_i32("number").unwrap(), 42);
        assert_eq!(document.get_f64("float").unwrap(), 3.14);
        assert_eq!(document.get_bool("boolean").unwrap(), true);
        assert!(document.get("null").unwrap().as_null().is_some());
    }

    #[test]
    fn test_doc_macro_nested() {
        let document = doc! {
            "user": {
                "name": "John",
                "address": {
                    "city": "Austin",
                    "state": "TX"
                }
            }
        };

        let user = document.get_document("user").unwrap();
        assert_eq!(user.get_str("name").unwrap(), "John");
        let address = user.get_document("address").unwrap();
        assert_eq!(address.get_str("city").unwrap(), "Austin");
    }

    #[test]
    fn test_doc_macro_array() {
        let document = doc! {
            "tags": ["rust", "mongodb", "async"],
            "numbers": [1, 2, 3, 4, 5]
        };

        let tags = document.get_array("tags").unwrap();
        assert_eq!(tags.len(), 3);
        assert_eq!(tags[0].as_str().unwrap(), "rust");
    }

    #[test]
    fn test_doc_macro_object_id() {
        let oid = ObjectId::new();
        let document = doc! {
            "_id": oid,
            "name": "Test"
        };

        assert_eq!(document.get_object_id("_id").unwrap(), oid);
    }

    #[test]
    fn test_doc_macro_update_operators() {
        let update = doc! {
            "$set": { "name": "Jane", "updated": true },
            "$inc": { "count": 1 },
            "$push": { "tags": "new-tag" }
        };

        assert!(update.get_document("$set").is_ok());
        assert!(update.get_document("$inc").is_ok());
        assert!(update.get_document("$push").is_ok());
    }

    #[test]
    fn test_doc_macro_query_operators() {
        let query = doc! {
            "age": { "$gte": 18, "$lte": 65 },
            "status": { "$in": ["active", "pending"] },
            "$or": [
                { "role": "admin" },
                { "permissions": { "$exists": true } }
            ]
        };

        let age = query.get_document("age").unwrap();
        assert_eq!(age.get_i32("$gte").unwrap(), 18);
    }

    #[test]
    fn test_document_iteration() {
        let document = doc! {
            "a": 1,
            "b": 2,
            "c": 3
        };

        let keys: Vec<&String> = document.keys().collect();
        assert_eq!(keys.len(), 3);
    }

    #[test]
    fn test_document_contains_key() {
        let document = doc! { "key": "value" };
        assert!(document.contains_key("key"));
        assert!(!document.contains_key("nonexistent"));
    }
}

// ============================================================================
// Serialization Tests
// ============================================================================

mod serialization_tests {
    use super::*;

    #[test]
    fn test_user_serialization() {
        let user = User::new("John", "john@example.com").with_age(30);
        let json = serde_json::to_string(&user).unwrap();
        assert!(json.contains("\"name\":\"John\""));
        assert!(json.contains("\"email\":\"john@example.com\""));
        assert!(json.contains("\"age\":30"));
    }

    #[test]
    fn test_user_deserialization() {
        let json = r#"{"name":"Jane","email":"jane@example.com","age":25,"active":true}"#;
        let user: User = serde_json::from_str(json).unwrap();
        assert_eq!(user.name, "Jane");
        assert_eq!(user.email, "jane@example.com");
        assert_eq!(user.age, 25);
        assert!(user.active);
    }

    #[test]
    fn test_user_with_object_id() {
        let oid = ObjectId::new();
        let user = User::new("Test", "test@test.com").with_id(oid);
        let json = serde_json::to_string(&user).unwrap();
        assert!(json.contains(&oid.to_hex()));
    }

    #[test]
    fn test_order_serialization() {
        let user_id = ObjectId::new();
        let order = Order::new(user_id, "Widget", 5, 19.99);
        let json = serde_json::to_string(&order).unwrap();
        assert!(json.contains("\"product\":\"Widget\""));
        assert!(json.contains("\"quantity\":5"));
    }

    #[test]
    fn test_optional_fields() {
        let user = User::new("NoId", "noid@test.com");
        let json = serde_json::to_string(&user).unwrap();
        // _id should be skipped when None
        assert!(!json.contains("\"_id\""));
    }

    #[test]
    fn test_default_fields() {
        let json = r#"{"name":"Minimal","email":"min@test.com"}"#;
        let user: User = serde_json::from_str(json).unwrap();
        assert_eq!(user.age, 0); // default
        assert!(!user.active); // default (bool defaults to false in serde)
    }
}

// ============================================================================
// Integration-style Tests (without actual RPC)
// ============================================================================

mod integration_tests {
    use super::*;

    #[tokio::test]
    async fn test_cursor_collect_typed() {
        let data = vec![
            serde_json::json!({
                "_id": { "$oid": ObjectId::new().to_hex() },
                "name": "Alice",
                "email": "alice@test.com",
                "age": 28,
                "active": true
            }),
            serde_json::json!({
                "_id": { "$oid": ObjectId::new().to_hex() },
                "name": "Bob",
                "email": "bob@test.com",
                "age": 35,
                "active": false
            }),
        ];

        let cursor: Cursor<User> = Cursor::new("test.users".to_string(), data, None);
        let users = cursor.collect().await.unwrap();

        assert_eq!(users.len(), 2);
        assert_eq!(users[0].name, "Alice");
        assert_eq!(users[0].age, 28);
        assert!(users[0].active);
        assert_eq!(users[1].name, "Bob");
        assert!(!users[1].active);
    }

    #[tokio::test]
    async fn test_cursor_with_orders() {
        let user_id = ObjectId::new();
        let data = vec![
            serde_json::json!({
                "user_id": { "$oid": user_id.to_hex() },
                "product": "Laptop",
                "quantity": 1,
                "price": 999.99,
                "status": "shipped"
            }),
            serde_json::json!({
                "user_id": { "$oid": user_id.to_hex() },
                "product": "Mouse",
                "quantity": 2,
                "price": 29.99,
                "status": "delivered"
            }),
        ];

        let cursor: Cursor<Order> = Cursor::new("test.orders".to_string(), data, None);
        let orders = cursor.collect().await.unwrap();

        assert_eq!(orders.len(), 2);
        assert_eq!(orders[0].product, "Laptop");
        assert_eq!(orders[0].status, "shipped");
        assert_eq!(orders[1].quantity, 2);
    }

    #[test]
    fn test_aggregation_pipeline_doc() {
        let pipeline = vec![
            doc! { "$match": { "status": "active" } },
            doc! { "$group": { "_id": "$category", "count": { "$sum": 1 } } },
            doc! { "$sort": { "count": -1 } },
            doc! { "$limit": 10 },
        ];

        assert_eq!(pipeline.len(), 4);
        assert!(pipeline[0].get_document("$match").is_ok());
        assert!(pipeline[1].get_document("$group").is_ok());
    }

    #[test]
    fn test_complex_query_doc() {
        let query = doc! {
            "$and": [
                { "status": "active" },
                { "created_at": { "$gte": "2024-01-01" } },
                { "$or": [
                    { "role": "admin" },
                    { "permissions": { "$all": ["read", "write"] } }
                ]}
            ]
        };

        let and_clause = query.get_array("$and").unwrap();
        assert_eq!(and_clause.len(), 3);
    }
}

// ============================================================================
// Prelude Tests
// ============================================================================

mod prelude_tests {
    use mongo_do::prelude::*;

    #[test]
    fn test_prelude_doc_macro() {
        let document = doc! { "test": "value" };
        assert_eq!(document.get_str("test").unwrap(), "value");
    }

    #[test]
    fn test_prelude_document_type() {
        let _doc: Document = doc! { "key": "value" };
    }

    #[test]
    fn test_prelude_result_type() {
        let result: Result<i32> = Ok(42);
        assert_eq!(result.unwrap(), 42);
    }

    #[test]
    fn test_prelude_error_type() {
        let err: Result<()> = Err(MongoError::Timeout);
        assert!(err.is_err());
    }

    #[derive(Debug, Serialize, Deserialize)]
    struct PreludeTest {
        name: String,
    }

    #[test]
    fn test_prelude_serde() {
        let test = PreludeTest {
            name: "test".to_string(),
        };
        let json = serde_json::to_string(&test).unwrap();
        assert!(json.contains("test"));
    }
}

// ============================================================================
// Library Function Tests
// ============================================================================

mod lib_tests {
    #[test]
    fn test_version() {
        assert_eq!(mongo_do::version(), "0.1.0");
    }

    #[test]
    fn test_is_implemented() {
        assert!(mongo_do::is_implemented());
    }
}
