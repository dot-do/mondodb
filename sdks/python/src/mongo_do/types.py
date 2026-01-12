"""
Type definitions for mongo-do SDK.

Provides result types that mirror PyMongo's result objects for
insert, update, and delete operations.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping, Sequence


@dataclass
class InsertOneResult:
    """
    Result of an insert_one operation.

    Attributes:
        inserted_id: The _id of the inserted document.
        acknowledged: Whether the write was acknowledged.
    """

    inserted_id: Any
    acknowledged: bool = True


@dataclass
class InsertManyResult:
    """
    Result of an insert_many operation.

    Attributes:
        inserted_ids: List of _ids of the inserted documents.
        acknowledged: Whether the write was acknowledged.
    """

    inserted_ids: list[Any] = field(default_factory=list)
    acknowledged: bool = True


@dataclass
class UpdateResult:
    """
    Result of an update_one or update_many operation.

    Attributes:
        matched_count: Number of documents matched.
        modified_count: Number of documents modified.
        upserted_id: The _id of the upserted document (if any).
        acknowledged: Whether the write was acknowledged.
    """

    matched_count: int = 0
    modified_count: int = 0
    upserted_id: Any = None
    acknowledged: bool = True

    @property
    def raw_result(self) -> dict[str, Any]:
        """Return raw result dict for compatibility."""
        return {
            "n": self.matched_count,
            "nModified": self.modified_count,
            "ok": 1.0 if self.acknowledged else 0.0,
        }


@dataclass
class DeleteResult:
    """
    Result of a delete_one or delete_many operation.

    Attributes:
        deleted_count: Number of documents deleted.
        acknowledged: Whether the write was acknowledged.
    """

    deleted_count: int = 0
    acknowledged: bool = True

    @property
    def raw_result(self) -> dict[str, Any]:
        """Return raw result dict for compatibility."""
        return {
            "n": self.deleted_count,
            "ok": 1.0 if self.acknowledged else 0.0,
        }


@dataclass
class BulkWriteResult:
    """
    Result of a bulk_write operation.

    Attributes:
        inserted_count: Number of documents inserted.
        matched_count: Number of documents matched for update.
        modified_count: Number of documents modified.
        deleted_count: Number of documents deleted.
        upserted_count: Number of documents upserted.
        upserted_ids: Mapping of operation index to upserted _id.
        acknowledged: Whether the write was acknowledged.
    """

    inserted_count: int = 0
    matched_count: int = 0
    modified_count: int = 0
    deleted_count: int = 0
    upserted_count: int = 0
    upserted_ids: dict[int, Any] = field(default_factory=dict)
    acknowledged: bool = True


# Type aliases for clarity
Document = Mapping[str, Any]
MutableDocument = dict[str, Any]
Filter = Mapping[str, Any]
Update = Mapping[str, Any]
Projection = Mapping[str, Any] | Sequence[str] | None
Sort = list[tuple[str, int]] | None


class MongoError(Exception):
    """Base exception for MongoDB operations."""

    def __init__(self, message: str, code: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.code = code


class ConnectionError(MongoError):
    """Error raised when connection to MongoDB fails."""

    pass


class QueryError(MongoError):
    """Error raised when a query fails."""

    def __init__(
        self,
        message: str,
        code: int | None = None,
        suggestion: str | None = None,
    ) -> None:
        super().__init__(message, code)
        self.suggestion = suggestion


class WriteError(MongoError):
    """Error raised when a write operation fails."""

    pass


class DuplicateKeyError(WriteError):
    """Error raised when inserting a document with a duplicate key."""

    pass


class OperationFailure(MongoError):
    """Error raised when an operation fails on the server."""

    pass
