//! Cursor implementation for iterating over query results.

use crate::error::{MongoError, Result};
use futures::Stream;
use serde::de::DeserializeOwned;
use serde_json::Value as JsonValue;
use std::collections::VecDeque;
use std::marker::PhantomData;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use tokio::sync::Mutex;

/// Internal cursor state.
#[derive(Debug)]
pub(crate) struct CursorState {
    /// Cursor ID from the server.
    pub cursor_id: Option<String>,
    /// Whether the cursor is exhausted.
    pub exhausted: bool,
    /// Buffered documents.
    pub buffer: VecDeque<JsonValue>,
    /// The namespace (db.collection).
    pub namespace: String,
    /// Batch size for fetches.
    pub batch_size: usize,
}

impl CursorState {
    /// Create a new cursor state.
    pub fn new(namespace: String, batch_size: usize) -> Self {
        Self {
            cursor_id: None,
            exhausted: false,
            buffer: VecDeque::new(),
            namespace,
            batch_size,
        }
    }

    /// Create a cursor state with initial data.
    pub fn with_data(namespace: String, data: Vec<JsonValue>, cursor_id: Option<String>) -> Self {
        Self {
            cursor_id,
            exhausted: cursor_id.is_none(),
            buffer: data.into(),
            namespace,
            batch_size: 100,
        }
    }
}

/// A cursor for iterating over query results.
///
/// Cursors implement `Stream` and can be used with async iteration.
///
/// # Example
///
/// ```ignore
/// use futures::StreamExt;
///
/// let mut cursor = collection.find(doc! { "status": "active" }).await?;
/// while let Some(doc) = cursor.next().await {
///     println!("{:?}", doc?);
/// }
/// ```
pub struct Cursor<T> {
    /// Internal state.
    pub(crate) state: Arc<Mutex<CursorState>>,
    /// RPC client for fetching more data.
    pub(crate) rpc_client: Option<Arc<rpc_do::RpcClient>>,
    /// Fetch function for getting more documents.
    pub(crate) fetch_more: Option<Box<dyn Fn() -> futures::future::BoxFuture<'static, Result<Vec<JsonValue>>> + Send + Sync>>,
    /// Type marker.
    _marker: PhantomData<T>,
}

impl<T> Cursor<T> {
    /// Create a new cursor with initial data.
    pub fn new(namespace: String, data: Vec<JsonValue>, cursor_id: Option<String>) -> Self {
        Self {
            state: Arc::new(Mutex::new(CursorState::with_data(namespace, data, cursor_id))),
            rpc_client: None,
            fetch_more: None,
            _marker: PhantomData,
        }
    }

    /// Create an empty cursor.
    pub fn empty(namespace: String) -> Self {
        Self {
            state: Arc::new(Mutex::new(CursorState {
                cursor_id: None,
                exhausted: true,
                buffer: VecDeque::new(),
                namespace,
                batch_size: 100,
            })),
            rpc_client: None,
            fetch_more: None,
            _marker: PhantomData,
        }
    }

    /// Set the RPC client for fetching more data.
    pub fn with_rpc_client(mut self, client: Arc<rpc_do::RpcClient>) -> Self {
        self.rpc_client = Some(client);
        self
    }

    /// Check if the cursor is exhausted.
    pub async fn is_exhausted(&self) -> bool {
        let state = self.state.lock().await;
        state.exhausted && state.buffer.is_empty()
    }

    /// Get the cursor ID if available.
    pub async fn cursor_id(&self) -> Option<String> {
        let state = self.state.lock().await;
        state.cursor_id.clone()
    }

    /// Close the cursor.
    pub async fn close(&self) -> Result<()> {
        let mut state = self.state.lock().await;
        state.exhausted = true;
        state.buffer.clear();
        state.cursor_id = None;
        Ok(())
    }
}

impl<T: DeserializeOwned + Send + Unpin + 'static> Cursor<T> {
    /// Advance the cursor and return the next document.
    pub async fn advance(&mut self) -> Result<bool> {
        let mut state = self.state.lock().await;

        // Check if we have buffered documents
        if !state.buffer.is_empty() {
            return Ok(true);
        }

        // Check if exhausted
        if state.exhausted {
            return Ok(false);
        }

        // Try to fetch more if we have a cursor ID and RPC client
        if state.cursor_id.is_some() {
            if let Some(ref rpc_client) = self.rpc_client {
                let cursor_id = state.cursor_id.clone().unwrap();
                let namespace = state.namespace.clone();
                let batch_size = state.batch_size;
                drop(state);

                // Fetch more documents
                let result = rpc_client
                    .call_raw(
                        "mongo.getMore",
                        vec![
                            serde_json::json!(cursor_id),
                            serde_json::json!(namespace),
                            serde_json::json!(batch_size),
                        ],
                    )
                    .await;

                let mut state = self.state.lock().await;
                match result {
                    Ok(value) => {
                        if let Some(docs) = value.get("documents").and_then(|d| d.as_array()) {
                            for doc in docs {
                                state.buffer.push_back(doc.clone());
                            }
                        }
                        if let Some(new_cursor_id) = value.get("cursorId").and_then(|c| c.as_str()) {
                            state.cursor_id = Some(new_cursor_id.to_string());
                        } else {
                            state.cursor_id = None;
                            state.exhausted = true;
                        }
                    }
                    Err(e) => {
                        state.exhausted = true;
                        return Err(e.into());
                    }
                }

                return Ok(!state.buffer.is_empty());
            }
        }

        // No more data available
        state.exhausted = true;
        Ok(false)
    }

    /// Get the current document.
    pub async fn current(&self) -> Result<T> {
        let state = self.state.lock().await;
        if let Some(doc) = state.buffer.front() {
            serde_json::from_value(doc.clone()).map_err(|e| MongoError::Deserialization(e.to_string()))
        } else {
            Err(MongoError::CursorExhausted)
        }
    }

    /// Try to get the next document.
    pub async fn try_next(&mut self) -> Result<Option<T>> {
        let mut state = self.state.lock().await;

        if let Some(doc) = state.buffer.pop_front() {
            return serde_json::from_value(doc)
                .map(Some)
                .map_err(|e| MongoError::Deserialization(e.to_string()));
        }

        if state.exhausted {
            return Ok(None);
        }

        // Check if we need to fetch more
        if state.cursor_id.is_some() {
            if let Some(ref rpc_client) = self.rpc_client {
                let cursor_id = state.cursor_id.clone().unwrap();
                let namespace = state.namespace.clone();
                let batch_size = state.batch_size;
                drop(state);

                // Fetch more documents
                let result = rpc_client
                    .call_raw(
                        "mongo.getMore",
                        vec![
                            serde_json::json!(cursor_id),
                            serde_json::json!(namespace),
                            serde_json::json!(batch_size),
                        ],
                    )
                    .await;

                let mut state = self.state.lock().await;
                match result {
                    Ok(value) => {
                        if let Some(docs) = value.get("documents").and_then(|d| d.as_array()) {
                            for doc in docs {
                                state.buffer.push_back(doc.clone());
                            }
                        }
                        if let Some(new_cursor_id) = value.get("cursorId").and_then(|c| c.as_str()) {
                            state.cursor_id = Some(new_cursor_id.to_string());
                        } else {
                            state.cursor_id = None;
                            state.exhausted = true;
                        }
                    }
                    Err(e) => {
                        state.exhausted = true;
                        return Err(e.into());
                    }
                }

                if let Some(doc) = state.buffer.pop_front() {
                    return serde_json::from_value(doc)
                        .map(Some)
                        .map_err(|e| MongoError::Deserialization(e.to_string()));
                }
            }
        }

        let mut state = self.state.lock().await;
        state.exhausted = true;
        Ok(None)
    }

    /// Collect all documents into a vector.
    pub async fn collect(mut self) -> Result<Vec<T>> {
        let mut results = Vec::new();
        while let Some(doc) = self.try_next().await? {
            results.push(doc);
        }
        Ok(results)
    }
}

impl<T: DeserializeOwned + Send + Unpin + 'static> Stream for Cursor<T> {
    type Item = Result<T>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();

        // Create a future for try_next
        let state = this.state.clone();
        let rpc_client = this.rpc_client.clone();

        // Use a boxed future to avoid lifetime issues
        let fut = async move {
            let mut state_guard = state.lock().await;

            if let Some(doc) = state_guard.buffer.pop_front() {
                return Some(
                    serde_json::from_value(doc)
                        .map_err(|e| MongoError::Deserialization(e.to_string())),
                );
            }

            if state_guard.exhausted {
                return None;
            }

            // Check if we need to fetch more
            if state_guard.cursor_id.is_some() {
                if let Some(ref client) = rpc_client {
                    let cursor_id = state_guard.cursor_id.clone().unwrap();
                    let namespace = state_guard.namespace.clone();
                    let batch_size = state_guard.batch_size;
                    drop(state_guard);

                    // Fetch more documents
                    let result = client
                        .call_raw(
                            "mongo.getMore",
                            vec![
                                serde_json::json!(cursor_id),
                                serde_json::json!(namespace),
                                serde_json::json!(batch_size),
                            ],
                        )
                        .await;

                    let mut state_guard = state.lock().await;
                    match result {
                        Ok(value) => {
                            if let Some(docs) = value.get("documents").and_then(|d| d.as_array()) {
                                for doc in docs {
                                    state_guard.buffer.push_back(doc.clone());
                                }
                            }
                            if let Some(new_cursor_id) = value.get("cursorId").and_then(|c| c.as_str()) {
                                state_guard.cursor_id = Some(new_cursor_id.to_string());
                            } else {
                                state_guard.cursor_id = None;
                                state_guard.exhausted = true;
                            }
                        }
                        Err(e) => {
                            state_guard.exhausted = true;
                            return Some(Err(e.into()));
                        }
                    }

                    if let Some(doc) = state_guard.buffer.pop_front() {
                        return Some(
                            serde_json::from_value(doc)
                                .map_err(|e| MongoError::Deserialization(e.to_string())),
                        );
                    }
                }
            }

            let mut state_guard = state.lock().await;
            state_guard.exhausted = true;
            None
        };

        // Poll the future
        let mut boxed = Box::pin(fut);
        boxed.as_mut().poll(cx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    struct TestDoc {
        name: String,
        value: i32,
    }

    #[tokio::test]
    async fn test_cursor_new() {
        let data = vec![
            serde_json::json!({"name": "doc1", "value": 1}),
            serde_json::json!({"name": "doc2", "value": 2}),
        ];
        let cursor: Cursor<TestDoc> = Cursor::new("test.docs".to_string(), data, None);

        assert!(!cursor.is_exhausted().await);
        assert!(cursor.cursor_id().await.is_none());
    }

    #[tokio::test]
    async fn test_cursor_empty() {
        let cursor: Cursor<TestDoc> = Cursor::empty("test.docs".to_string());
        assert!(cursor.is_exhausted().await);
    }

    #[tokio::test]
    async fn test_cursor_try_next() {
        let data = vec![
            serde_json::json!({"name": "doc1", "value": 1}),
            serde_json::json!({"name": "doc2", "value": 2}),
        ];
        let mut cursor: Cursor<TestDoc> = Cursor::new("test.docs".to_string(), data, None);

        let doc1 = cursor.try_next().await.unwrap();
        assert!(doc1.is_some());
        assert_eq!(doc1.unwrap().name, "doc1");

        let doc2 = cursor.try_next().await.unwrap();
        assert!(doc2.is_some());
        assert_eq!(doc2.unwrap().name, "doc2");

        let doc3 = cursor.try_next().await.unwrap();
        assert!(doc3.is_none());
    }

    #[tokio::test]
    async fn test_cursor_collect() {
        let data = vec![
            serde_json::json!({"name": "doc1", "value": 1}),
            serde_json::json!({"name": "doc2", "value": 2}),
            serde_json::json!({"name": "doc3", "value": 3}),
        ];
        let cursor: Cursor<TestDoc> = Cursor::new("test.docs".to_string(), data, None);

        let docs = cursor.collect().await.unwrap();
        assert_eq!(docs.len(), 3);
        assert_eq!(docs[0].name, "doc1");
        assert_eq!(docs[1].name, "doc2");
        assert_eq!(docs[2].name, "doc3");
    }

    #[tokio::test]
    async fn test_cursor_advance_and_current() {
        let data = vec![
            serde_json::json!({"name": "doc1", "value": 1}),
        ];
        let mut cursor: Cursor<TestDoc> = Cursor::new("test.docs".to_string(), data, None);

        let has_doc = cursor.advance().await.unwrap();
        assert!(has_doc);

        let doc = cursor.current().await.unwrap();
        assert_eq!(doc.name, "doc1");
    }

    #[tokio::test]
    async fn test_cursor_close() {
        let data = vec![
            serde_json::json!({"name": "doc1", "value": 1}),
        ];
        let cursor: Cursor<TestDoc> = Cursor::new("test.docs".to_string(), data, Some("cursor123".to_string()));

        assert!(!cursor.is_exhausted().await);
        cursor.close().await.unwrap();
        assert!(cursor.is_exhausted().await);
        assert!(cursor.cursor_id().await.is_none());
    }

    #[tokio::test]
    async fn test_cursor_with_cursor_id() {
        let data = vec![
            serde_json::json!({"name": "doc1", "value": 1}),
        ];
        let cursor: Cursor<TestDoc> = Cursor::new("test.docs".to_string(), data, Some("cursor123".to_string()));

        assert_eq!(cursor.cursor_id().await, Some("cursor123".to_string()));
    }

    #[tokio::test]
    async fn test_cursor_current_exhausted() {
        let cursor: Cursor<TestDoc> = Cursor::empty("test.docs".to_string());

        let result = cursor.current().await;
        assert!(matches!(result, Err(MongoError::CursorExhausted)));
    }

    #[tokio::test]
    async fn test_cursor_deserialization_error() {
        let data = vec![
            serde_json::json!({"invalid": "structure"}),
        ];
        let mut cursor: Cursor<TestDoc> = Cursor::new("test.docs".to_string(), data, None);

        let result = cursor.try_next().await;
        assert!(matches!(result, Err(MongoError::Deserialization(_))));
    }

    #[tokio::test]
    async fn test_cursor_state_new() {
        let state = CursorState::new("test.collection".to_string(), 50);
        assert!(state.cursor_id.is_none());
        assert!(!state.exhausted);
        assert!(state.buffer.is_empty());
        assert_eq!(state.namespace, "test.collection");
        assert_eq!(state.batch_size, 50);
    }

    #[tokio::test]
    async fn test_cursor_state_with_data() {
        let data = vec![serde_json::json!({"a": 1})];
        let state = CursorState::with_data("test.collection".to_string(), data, Some("cursor1".to_string()));
        assert_eq!(state.cursor_id, Some("cursor1".to_string()));
        assert!(!state.exhausted);
        assert_eq!(state.buffer.len(), 1);
    }
}
