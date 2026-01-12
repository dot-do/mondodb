//! Error types for MongoDB operations.

use std::fmt;
use thiserror::Error;

/// All errors that can occur during MongoDB operations.
#[derive(Debug, Error)]
pub enum MongoError {
    /// Connection error.
    #[error("connection error: {0}")]
    Connection(String),

    /// Authentication error.
    #[error("authentication error: {0}")]
    Authentication(String),

    /// Write error.
    #[error("write error: {message}")]
    Write {
        /// Error code from server.
        code: Option<i32>,
        /// Error message.
        message: String,
    },

    /// Bulk write error.
    #[error("bulk write error: {0} errors")]
    BulkWrite(usize),

    /// Command error.
    #[error("command error: {message}")]
    Command {
        /// Error code from server.
        code: i32,
        /// Error message.
        message: String,
    },

    /// Query error.
    #[error("query error: {0}")]
    Query(String),

    /// Invalid argument.
    #[error("invalid argument: {0}")]
    InvalidArgument(String),

    /// Serialization error.
    #[error("serialization error: {0}")]
    Serialization(String),

    /// Deserialization error.
    #[error("deserialization error: {0}")]
    Deserialization(String),

    /// Cursor exhausted.
    #[error("cursor exhausted")]
    CursorExhausted,

    /// Operation timeout.
    #[error("operation timed out")]
    Timeout,

    /// Server selection error.
    #[error("server selection error: {0}")]
    ServerSelection(String),

    /// Network error.
    #[error("network error: {0}")]
    Network(String),

    /// Internal error.
    #[error("internal error: {0}")]
    Internal(String),

    /// RPC transport error.
    #[error("rpc error: {0}")]
    Rpc(#[from] rpc_do::RpcError),

    /// BSON error.
    #[error("bson error: {0}")]
    Bson(String),
}

impl MongoError {
    /// Create a connection error.
    pub fn connection(msg: impl Into<String>) -> Self {
        MongoError::Connection(msg.into())
    }

    /// Create an authentication error.
    pub fn authentication(msg: impl Into<String>) -> Self {
        MongoError::Authentication(msg.into())
    }

    /// Create a write error.
    pub fn write(code: Option<i32>, message: impl Into<String>) -> Self {
        MongoError::Write {
            code,
            message: message.into(),
        }
    }

    /// Create a command error.
    pub fn command(code: i32, message: impl Into<String>) -> Self {
        MongoError::Command {
            code,
            message: message.into(),
        }
    }

    /// Create a query error.
    pub fn query(msg: impl Into<String>) -> Self {
        MongoError::Query(msg.into())
    }

    /// Create an invalid argument error.
    pub fn invalid_argument(msg: impl Into<String>) -> Self {
        MongoError::InvalidArgument(msg.into())
    }

    /// Check if this is a connection error.
    pub fn is_connection_error(&self) -> bool {
        matches!(self, MongoError::Connection(_) | MongoError::Network(_))
    }

    /// Check if this is an authentication error.
    pub fn is_auth_error(&self) -> bool {
        matches!(self, MongoError::Authentication(_))
    }

    /// Check if this is a timeout error.
    pub fn is_timeout(&self) -> bool {
        matches!(self, MongoError::Timeout)
    }

    /// Get the error code if available.
    pub fn code(&self) -> Option<i32> {
        match self {
            MongoError::Write { code, .. } => *code,
            MongoError::Command { code, .. } => Some(*code),
            _ => None,
        }
    }

    /// Get the error message.
    pub fn message(&self) -> String {
        self.to_string()
    }
}

impl From<serde_json::Error> for MongoError {
    fn from(err: serde_json::Error) -> Self {
        MongoError::Serialization(err.to_string())
    }
}

impl From<bson::ser::Error> for MongoError {
    fn from(err: bson::ser::Error) -> Self {
        MongoError::Bson(err.to_string())
    }
}

impl From<bson::de::Error> for MongoError {
    fn from(err: bson::de::Error) -> Self {
        MongoError::Bson(err.to_string())
    }
}

/// Result type alias for MongoDB operations.
pub type Result<T> = std::result::Result<T, MongoError>;

/// Error kind enumeration for pattern matching.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ErrorKind {
    /// Connection error.
    Connection,
    /// Authentication error.
    Authentication,
    /// Write error.
    Write,
    /// Query error.
    Query,
    /// Command error.
    Command,
    /// Timeout error.
    Timeout,
    /// Serialization error.
    Serialization,
    /// Internal error.
    Internal,
    /// Network error.
    Network,
}

impl MongoError {
    /// Get the error kind.
    pub fn kind(&self) -> ErrorKind {
        match self {
            MongoError::Connection(_) => ErrorKind::Connection,
            MongoError::Authentication(_) => ErrorKind::Authentication,
            MongoError::Write { .. } | MongoError::BulkWrite(_) => ErrorKind::Write,
            MongoError::Query(_) => ErrorKind::Query,
            MongoError::Command { .. } => ErrorKind::Command,
            MongoError::Timeout => ErrorKind::Timeout,
            MongoError::Serialization(_) | MongoError::Deserialization(_) | MongoError::Bson(_) => {
                ErrorKind::Serialization
            }
            MongoError::Network(_) => ErrorKind::Network,
            MongoError::InvalidArgument(_)
            | MongoError::CursorExhausted
            | MongoError::ServerSelection(_)
            | MongoError::Internal(_)
            | MongoError::Rpc(_) => ErrorKind::Internal,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        let err = MongoError::connection("failed to connect");
        assert_eq!(err.to_string(), "connection error: failed to connect");
    }

    #[test]
    fn test_write_error() {
        let err = MongoError::write(Some(11000), "duplicate key error");
        assert!(err.to_string().contains("duplicate key error"));
        assert_eq!(err.code(), Some(11000));
    }

    #[test]
    fn test_command_error() {
        let err = MongoError::command(59, "command not found");
        assert!(err.to_string().contains("command not found"));
        assert_eq!(err.code(), Some(59));
    }

    #[test]
    fn test_error_kind() {
        assert_eq!(
            MongoError::connection("test").kind(),
            ErrorKind::Connection
        );
        assert_eq!(
            MongoError::authentication("test").kind(),
            ErrorKind::Authentication
        );
        assert_eq!(MongoError::Timeout.kind(), ErrorKind::Timeout);
    }

    #[test]
    fn test_is_connection_error() {
        assert!(MongoError::connection("test").is_connection_error());
        assert!(MongoError::Network("test".to_string()).is_connection_error());
        assert!(!MongoError::Timeout.is_connection_error());
    }

    #[test]
    fn test_is_auth_error() {
        assert!(MongoError::authentication("test").is_auth_error());
        assert!(!MongoError::connection("test").is_auth_error());
    }

    #[test]
    fn test_is_timeout() {
        assert!(MongoError::Timeout.is_timeout());
        assert!(!MongoError::connection("test").is_timeout());
    }

    #[test]
    fn test_error_message() {
        let err = MongoError::query("invalid query");
        assert_eq!(err.message(), "query error: invalid query");
    }

    #[test]
    fn test_invalid_argument() {
        let err = MongoError::invalid_argument("field cannot be empty");
        assert!(err.to_string().contains("field cannot be empty"));
    }

    #[test]
    fn test_from_serde_json_error() {
        let json_err = serde_json::from_str::<String>("invalid").unwrap_err();
        let err: MongoError = json_err.into();
        assert!(matches!(err, MongoError::Serialization(_)));
    }
}
