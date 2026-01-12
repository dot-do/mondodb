//! # mongo-do
//!
//! MongoDB-compatible SDK for the .do platform.
//!
//! This crate provides a MongoDB-compatible API that uses RPC transport
//! under the hood, enabling MongoDB operations on edge databases.
//!
//! ## Features
//!
//! - MongoDB-compatible API (similar to the official mongodb crate)
//! - Async/await support with tokio
//! - Promise pipelining for reduced round trips
//! - Full CRUD operations
//! - Aggregation pipelines
//! - Cursor-based iteration
//!
//! ## Quick Start
//!
//! ```ignore
//! use mongo_do::{MongoClient, bson::doc};
//! use serde::{Serialize, Deserialize};
//!
//! #[derive(Debug, Serialize, Deserialize)]
//! struct User {
//!     name: String,
//!     email: String,
//! }
//!
//! #[tokio::main]
//! async fn main() -> mongo_do::Result<()> {
//!     // Connect to MongoDB via RPC
//!     let client = MongoClient::new("mongodb://localhost").await?;
//!
//!     // Get a database and collection
//!     let db = client.database("mydb");
//!     let users = db.collection::<User>("users");
//!
//!     // Insert a document
//!     users.insert_one(User {
//!         name: "John".to_string(),
//!         email: "john@example.com".to_string(),
//!     }).await?;
//!
//!     // Find documents
//!     let cursor = users.find(doc! { "name": "John" }).await?;
//!     let results: Vec<User> = cursor.collect().await?;
//!
//!     // Update a document
//!     users.update_one(
//!         doc! { "email": "john@example.com" },
//!         doc! { "$set": { "name": "Jane" } },
//!     ).await?;
//!
//!     // Delete a document
//!     users.delete_one(doc! { "email": "john@example.com" }).await?;
//!
//!     client.close().await?;
//!     Ok(())
//! }
//! ```

pub mod client;
pub mod collection;
pub mod cursor;
pub mod db;
pub mod error;

// Re-export main types
pub use client::{Client, ClientOptions, ClientOptionsBuilder, ClientSession, MongoClient};
pub use collection::{
    Collection, DeleteResult, FindOptions, FindOptionsBuilder, InsertManyResult, InsertOneResult,
    UpdateOptions, UpdateOptionsBuilder, UpdateResult,
};
pub use cursor::Cursor;
pub use db::{CreateCollectionOptions, CreateCollectionOptionsBuilder, Database};
pub use error::{ErrorKind, MongoError, Result};

// Re-export bson for convenience
pub use bson;
pub use bson::doc;

/// Prelude module for common imports.
pub mod prelude {
    pub use super::client::{Client, ClientOptions, MongoClient};
    pub use super::collection::{
        Collection, DeleteResult, FindOptions, InsertManyResult, InsertOneResult, UpdateOptions,
        UpdateResult,
    };
    pub use super::cursor::Cursor;
    pub use super::db::Database;
    pub use super::error::{ErrorKind, MongoError, Result};
    pub use bson::{doc, Document};
    pub use serde::{Deserialize, Serialize};
}

/// Check if the SDK is fully implemented.
pub fn is_implemented() -> bool {
    true
}

/// Get the SDK version.
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version() {
        assert_eq!(version(), "0.1.0");
    }

    #[test]
    fn test_is_implemented() {
        assert!(is_implemented());
    }

    #[test]
    fn test_doc_macro() {
        let document = doc! {
            "name": "John",
            "age": 30,
            "active": true,
        };
        assert_eq!(document.get_str("name").unwrap(), "John");
        assert_eq!(document.get_i32("age").unwrap(), 30);
        assert_eq!(document.get_bool("active").unwrap(), true);
    }

    #[test]
    fn test_prelude_imports() {
        // This test verifies that the prelude exports are correct
        use crate::prelude::*;

        let _: Result<()> = Ok(());
        let _doc = doc! { "test": 1 };
    }

    #[test]
    fn test_error_kind_variants() {
        // Test that all error kinds are accessible
        let _ = ErrorKind::Connection;
        let _ = ErrorKind::Authentication;
        let _ = ErrorKind::Write;
        let _ = ErrorKind::Query;
        let _ = ErrorKind::Command;
        let _ = ErrorKind::Timeout;
        let _ = ErrorKind::Serialization;
        let _ = ErrorKind::Internal;
        let _ = ErrorKind::Network;
    }
}
