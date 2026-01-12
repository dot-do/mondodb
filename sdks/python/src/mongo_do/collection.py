"""
Collection - MongoDB collection operations.

Provides a PyMongo-compatible Collection interface with async CRUD
operations backed by RPC calls.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any, Generic, TypeVar

from .cursor import Cursor
from .types import (
    DeleteResult,
    DuplicateKeyError,
    InsertManyResult,
    InsertOneResult,
    UpdateResult,
    WriteError,
)

if TYPE_CHECKING:
    from rpc_do import RpcClient

    from .database import Database
    from .types import Filter, Projection, Update

T = TypeVar("T", bound=dict[str, Any])

__all__ = ["Collection"]


class Collection(Generic[T]):
    """
    MongoDB collection with async CRUD operations.

    Provides a PyMongo-compatible API for interacting with a MongoDB
    collection over RPC. All operations are async.

    Example:
        users = db["users"]

        # Insert
        result = await users.insert_one({"name": "Alice"})
        print(result.inserted_id)

        # Find
        user = await users.find_one({"name": "Alice"})
        async for user in users.find({"status": "active"}):
            print(user)

        # Update
        await users.update_one({"name": "Alice"}, {"$set": {"status": "vip"}})

        # Delete
        await users.delete_one({"name": "Alice"})
    """

    __slots__ = ("_rpc", "_database", "_name", "_full_name")

    def __init__(
        self,
        rpc: RpcClient,
        database: Database,
        name: str,
    ) -> None:
        """
        Initialize a collection.

        Args:
            rpc: The RPC client for making calls.
            database: Parent database instance.
            name: Collection name.
        """
        self._rpc = rpc
        self._database = database
        self._name = name
        self._full_name = f"{database.name}.{name}"

    @property
    def name(self) -> str:
        """Get the collection name."""
        return self._name

    @property
    def full_name(self) -> str:
        """Get the full collection name (database.collection)."""
        return self._full_name

    @property
    def database(self) -> Database:
        """Get the parent database."""
        return self._database

    def _generate_id(self) -> str:
        """Generate a unique document ID."""
        return str(uuid.uuid4())

    async def insert_one(self, document: T) -> InsertOneResult:
        """
        Insert a single document.

        Args:
            document: The document to insert.

        Returns:
            InsertOneResult with the inserted ID.

        Raises:
            DuplicateKeyError: If a document with the same _id exists.
            WriteError: If the insert fails.
        """
        # Generate _id if not provided
        doc = dict(document)
        if "_id" not in doc:
            doc["_id"] = self._generate_id()

        try:
            result = await self._rpc.mongo.insertOne(
                self._database.name,
                self._name,
                doc,
            )

            # Handle RPC result
            if isinstance(result, dict):
                if result.get("error"):
                    error_msg = result.get("message", "Insert failed")
                    if "duplicate" in error_msg.lower() or "E11000" in error_msg:
                        raise DuplicateKeyError(error_msg)
                    raise WriteError(error_msg)
                return InsertOneResult(
                    inserted_id=result.get("insertedId", doc["_id"]),
                    acknowledged=result.get("acknowledged", True),
                )

            return InsertOneResult(inserted_id=doc["_id"])
        except DuplicateKeyError:
            raise
        except WriteError:
            raise
        except Exception as e:
            raise WriteError(str(e)) from e

    async def insert_many(
        self,
        documents: list[T],
        ordered: bool = True,
    ) -> InsertManyResult:
        """
        Insert multiple documents.

        Args:
            documents: List of documents to insert.
            ordered: If True, stop on first error. If False, continue.

        Returns:
            InsertManyResult with the inserted IDs.

        Raises:
            WriteError: If the insert fails.
        """
        # Generate _ids for documents without them
        docs = []
        for document in documents:
            doc = dict(document)
            if "_id" not in doc:
                doc["_id"] = self._generate_id()
            docs.append(doc)

        try:
            result = await self._rpc.mongo.insertMany(
                self._database.name,
                self._name,
                docs,
                {"ordered": ordered},
            )

            if isinstance(result, dict):
                if result.get("error"):
                    raise WriteError(result.get("message", "Insert failed"))
                return InsertManyResult(
                    inserted_ids=result.get("insertedIds", [doc["_id"] for doc in docs]),
                    acknowledged=result.get("acknowledged", True),
                )

            return InsertManyResult(inserted_ids=[doc["_id"] for doc in docs])
        except WriteError:
            raise
        except Exception as e:
            raise WriteError(str(e)) from e

    async def find_one(
        self,
        filter: Filter | None = None,
        projection: Projection = None,
    ) -> T | None:
        """
        Find a single document.

        Args:
            filter: Query filter.
            projection: Fields to include/exclude.

        Returns:
            The matching document, or None if not found.
        """
        options: dict[str, Any] = {}
        if projection:
            if isinstance(projection, list):
                options["projection"] = {field: 1 for field in projection}
            else:
                options["projection"] = dict(projection)

        result = await self._rpc.mongo.findOne(
            self._database.name,
            self._name,
            filter or {},
            options,
        )

        if result is None or (isinstance(result, dict) and result.get("error")):
            return None

        return result  # type: ignore

    def find(
        self,
        filter: Filter | None = None,
        projection: Projection = None,
    ) -> Cursor[T]:
        """
        Find documents matching the filter.

        Args:
            filter: Query filter.
            projection: Fields to include/exclude.

        Returns:
            Cursor for iterating over results.

        Example:
            async for doc in collection.find({"status": "active"}):
                print(doc)

            # With chaining
            cursor = collection.find({}).sort("name").limit(10)
            docs = await cursor.to_list()
        """
        return Cursor[T](
            self._rpc,
            self._database.name,
            self._name,
            filter,
            projection,
        )

    async def update_one(
        self,
        filter: Filter,
        update: Update,
        upsert: bool = False,
    ) -> UpdateResult:
        """
        Update a single document.

        Args:
            filter: Query filter to match the document.
            update: Update operations ($set, $unset, $inc, etc.).
            upsert: If True, insert if no document matches.

        Returns:
            UpdateResult with match/modify counts.

        Raises:
            WriteError: If the update fails.
        """
        try:
            result = await self._rpc.mongo.updateOne(
                self._database.name,
                self._name,
                filter,
                dict(update),
                {"upsert": upsert},
            )

            if isinstance(result, dict):
                if result.get("error"):
                    raise WriteError(result.get("message", "Update failed"))
                return UpdateResult(
                    matched_count=result.get("matchedCount", 0),
                    modified_count=result.get("modifiedCount", 0),
                    upserted_id=result.get("upsertedId"),
                    acknowledged=result.get("acknowledged", True),
                )

            return UpdateResult()
        except WriteError:
            raise
        except Exception as e:
            raise WriteError(str(e)) from e

    async def update_many(
        self,
        filter: Filter,
        update: Update,
        upsert: bool = False,
    ) -> UpdateResult:
        """
        Update multiple documents.

        Args:
            filter: Query filter to match documents.
            update: Update operations ($set, $unset, $inc, etc.).
            upsert: If True, insert if no document matches.

        Returns:
            UpdateResult with match/modify counts.

        Raises:
            WriteError: If the update fails.
        """
        try:
            result = await self._rpc.mongo.updateMany(
                self._database.name,
                self._name,
                filter,
                dict(update),
                {"upsert": upsert},
            )

            if isinstance(result, dict):
                if result.get("error"):
                    raise WriteError(result.get("message", "Update failed"))
                return UpdateResult(
                    matched_count=result.get("matchedCount", 0),
                    modified_count=result.get("modifiedCount", 0),
                    upserted_id=result.get("upsertedId"),
                    acknowledged=result.get("acknowledged", True),
                )

            return UpdateResult()
        except WriteError:
            raise
        except Exception as e:
            raise WriteError(str(e)) from e

    async def replace_one(
        self,
        filter: Filter,
        replacement: T,
        upsert: bool = False,
    ) -> UpdateResult:
        """
        Replace a single document.

        Args:
            filter: Query filter to match the document.
            replacement: The replacement document.
            upsert: If True, insert if no document matches.

        Returns:
            UpdateResult with match/modify counts.

        Raises:
            WriteError: If the replace fails.
        """
        try:
            result = await self._rpc.mongo.replaceOne(
                self._database.name,
                self._name,
                filter,
                dict(replacement),
                {"upsert": upsert},
            )

            if isinstance(result, dict):
                if result.get("error"):
                    raise WriteError(result.get("message", "Replace failed"))
                return UpdateResult(
                    matched_count=result.get("matchedCount", 0),
                    modified_count=result.get("modifiedCount", 0),
                    upserted_id=result.get("upsertedId"),
                    acknowledged=result.get("acknowledged", True),
                )

            return UpdateResult()
        except WriteError:
            raise
        except Exception as e:
            raise WriteError(str(e)) from e

    async def delete_one(self, filter: Filter) -> DeleteResult:
        """
        Delete a single document.

        Args:
            filter: Query filter to match the document.

        Returns:
            DeleteResult with the deleted count.

        Raises:
            WriteError: If the delete fails.
        """
        try:
            result = await self._rpc.mongo.deleteOne(
                self._database.name,
                self._name,
                filter,
            )

            if isinstance(result, dict):
                if result.get("error"):
                    raise WriteError(result.get("message", "Delete failed"))
                return DeleteResult(
                    deleted_count=result.get("deletedCount", 0),
                    acknowledged=result.get("acknowledged", True),
                )

            return DeleteResult()
        except WriteError:
            raise
        except Exception as e:
            raise WriteError(str(e)) from e

    async def delete_many(self, filter: Filter) -> DeleteResult:
        """
        Delete multiple documents.

        Args:
            filter: Query filter to match documents.

        Returns:
            DeleteResult with the deleted count.

        Raises:
            WriteError: If the delete fails.
        """
        try:
            result = await self._rpc.mongo.deleteMany(
                self._database.name,
                self._name,
                filter,
            )

            if isinstance(result, dict):
                if result.get("error"):
                    raise WriteError(result.get("message", "Delete failed"))
                return DeleteResult(
                    deleted_count=result.get("deletedCount", 0),
                    acknowledged=result.get("acknowledged", True),
                )

            return DeleteResult()
        except WriteError:
            raise
        except Exception as e:
            raise WriteError(str(e)) from e

    async def count_documents(self, filter: Filter | None = None) -> int:
        """
        Count documents matching the filter.

        Args:
            filter: Query filter.

        Returns:
            Number of matching documents.
        """
        result = await self._rpc.mongo.countDocuments(
            self._database.name,
            self._name,
            filter or {},
        )
        return result if isinstance(result, int) else 0

    async def estimated_document_count(self) -> int:
        """
        Get an estimated count of documents in the collection.

        This is faster than count_documents() but may not be accurate.

        Returns:
            Estimated number of documents.
        """
        result = await self._rpc.mongo.estimatedDocumentCount(
            self._database.name,
            self._name,
        )
        return result if isinstance(result, int) else 0

    async def distinct(
        self,
        key: str,
        filter: Filter | None = None,
    ) -> list[Any]:
        """
        Get distinct values for a field.

        Args:
            key: Field name to get distinct values for.
            filter: Query filter.

        Returns:
            List of distinct values.
        """
        result = await self._rpc.mongo.distinct(
            self._database.name,
            self._name,
            key,
            filter or {},
        )
        return result if isinstance(result, list) else []

    async def aggregate(self, pipeline: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """
        Run an aggregation pipeline.

        Args:
            pipeline: List of aggregation stages.

        Returns:
            List of aggregation results.
        """
        result = await self._rpc.mongo.aggregate(
            self._database.name,
            self._name,
            pipeline,
        )
        return result if isinstance(result, list) else []

    async def create_index(
        self,
        keys: list[tuple[str, int]] | str,
        **kwargs: Any,
    ) -> str:
        """
        Create an index on the collection.

        Args:
            keys: Index keys as list of (field, direction) tuples,
                  or a single field name.
            **kwargs: Additional index options (unique, sparse, etc.).

        Returns:
            Name of the created index.
        """
        if isinstance(keys, str):
            keys = [(keys, 1)]

        result = await self._rpc.mongo.createIndex(
            self._database.name,
            self._name,
            keys,
            kwargs,
        )
        return result if isinstance(result, str) else ""

    async def drop_index(self, index_name: str) -> None:
        """
        Drop an index from the collection.

        Args:
            index_name: Name of the index to drop.
        """
        await self._rpc.mongo.dropIndex(
            self._database.name,
            self._name,
            index_name,
        )

    async def drop(self) -> None:
        """Drop the collection."""
        await self._rpc.mongo.dropCollection(
            self._database.name,
            self._name,
        )

    def __repr__(self) -> str:
        return f"Collection({self._full_name!r})"
