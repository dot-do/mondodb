"""
Pytest fixtures for mongo-do tests.

Provides mocked RPC client and MongoDB client fixtures for testing
without actual network connections.
"""

from __future__ import annotations

import sys
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest


class MockRpcMongo:
    """Mock for the RPC mongo namespace."""

    def __init__(self) -> None:
        self._data: dict[str, dict[str, list[dict[str, Any]]]] = {}

    def _get_collection_data(self, database: str, collection: str) -> list[dict[str, Any]]:
        """Get or create collection data."""
        if database not in self._data:
            self._data[database] = {}
        if collection not in self._data[database]:
            self._data[database][collection] = []
        return self._data[database][collection]

    async def insertOne(
        self,
        database: str,
        collection: str,
        document: dict[str, Any],
    ) -> dict[str, Any]:
        """Mock insertOne."""
        data = self._get_collection_data(database, collection)
        # Check for duplicate
        for doc in data:
            if doc.get("_id") == document.get("_id"):
                return {"error": True, "message": "E11000 duplicate key error"}
        data.append(dict(document))
        return {"insertedId": document.get("_id"), "acknowledged": True}

    async def insertMany(
        self,
        database: str,
        collection: str,
        documents: list[dict[str, Any]],
        options: dict[str, Any],
    ) -> dict[str, Any]:
        """Mock insertMany."""
        data = self._get_collection_data(database, collection)
        inserted_ids = []
        for doc in documents:
            data.append(dict(doc))
            inserted_ids.append(doc.get("_id"))
        return {"insertedIds": inserted_ids, "acknowledged": True}

    async def findOne(
        self,
        database: str,
        collection: str,
        filter: dict[str, Any],
        options: dict[str, Any],
    ) -> dict[str, Any] | None:
        """Mock findOne."""
        data = self._get_collection_data(database, collection)
        for doc in data:
            if self._matches(doc, filter):
                return self._project(doc, options.get("projection"))
        return None

    async def find(
        self,
        database: str,
        collection: str,
        filter: dict[str, Any],
        options: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """Mock find."""
        data = self._get_collection_data(database, collection)
        results = [doc for doc in data if self._matches(doc, filter)]

        # Apply projection
        projection = options.get("projection")
        if projection:
            results = [self._project(doc, projection) for doc in results]

        # Apply sort
        sort = options.get("sort")
        if sort:
            for field, direction in reversed(sort):
                results.sort(key=lambda x: x.get(field, ""), reverse=(direction == -1))

        # Apply skip
        skip = options.get("skip", 0)
        if skip:
            results = results[skip:]

        # Apply limit
        limit = options.get("limit", 0)
        if limit:
            results = results[:limit]

        return results

    async def updateOne(
        self,
        database: str,
        collection: str,
        filter: dict[str, Any],
        update: dict[str, Any],
        options: dict[str, Any],
    ) -> dict[str, Any]:
        """Mock updateOne."""
        data = self._get_collection_data(database, collection)
        matched = 0
        modified = 0
        upserted_id = None

        for doc in data:
            if self._matches(doc, filter):
                matched += 1
                if self._apply_update(doc, update):
                    modified += 1
                break

        if matched == 0 and options.get("upsert"):
            new_doc = dict(filter)
            self._apply_update(new_doc, update)
            if "_id" not in new_doc:
                new_doc["_id"] = "upserted-id"
            data.append(new_doc)
            upserted_id = new_doc["_id"]

        return {
            "matchedCount": matched,
            "modifiedCount": modified,
            "upsertedId": upserted_id,
            "acknowledged": True,
        }

    async def updateMany(
        self,
        database: str,
        collection: str,
        filter: dict[str, Any],
        update: dict[str, Any],
        options: dict[str, Any],
    ) -> dict[str, Any]:
        """Mock updateMany."""
        data = self._get_collection_data(database, collection)
        matched = 0
        modified = 0

        for doc in data:
            if self._matches(doc, filter):
                matched += 1
                if self._apply_update(doc, update):
                    modified += 1

        return {
            "matchedCount": matched,
            "modifiedCount": modified,
            "acknowledged": True,
        }

    async def replaceOne(
        self,
        database: str,
        collection: str,
        filter: dict[str, Any],
        replacement: dict[str, Any],
        options: dict[str, Any],
    ) -> dict[str, Any]:
        """Mock replaceOne."""
        data = self._get_collection_data(database, collection)
        matched = 0
        modified = 0

        for i, doc in enumerate(data):
            if self._matches(doc, filter):
                matched += 1
                old_id = doc.get("_id")
                data[i] = dict(replacement)
                if old_id and "_id" not in replacement:
                    data[i]["_id"] = old_id
                modified += 1
                break

        return {
            "matchedCount": matched,
            "modifiedCount": modified,
            "acknowledged": True,
        }

    async def deleteOne(
        self,
        database: str,
        collection: str,
        filter: dict[str, Any],
    ) -> dict[str, Any]:
        """Mock deleteOne."""
        data = self._get_collection_data(database, collection)
        deleted = 0

        for i, doc in enumerate(data):
            if self._matches(doc, filter):
                del data[i]
                deleted += 1
                break

        return {"deletedCount": deleted, "acknowledged": True}

    async def deleteMany(
        self,
        database: str,
        collection: str,
        filter: dict[str, Any],
    ) -> dict[str, Any]:
        """Mock deleteMany."""
        data = self._get_collection_data(database, collection)
        original_len = len(data)

        self._data[database][collection] = [
            doc for doc in data if not self._matches(doc, filter)
        ]
        deleted = original_len - len(self._data[database][collection])

        return {"deletedCount": deleted, "acknowledged": True}

    async def countDocuments(
        self,
        database: str,
        collection: str,
        filter: dict[str, Any],
    ) -> int:
        """Mock countDocuments."""
        data = self._get_collection_data(database, collection)
        return sum(1 for doc in data if self._matches(doc, filter))

    async def estimatedDocumentCount(
        self,
        database: str,
        collection: str,
    ) -> int:
        """Mock estimatedDocumentCount."""
        data = self._get_collection_data(database, collection)
        return len(data)

    async def distinct(
        self,
        database: str,
        collection: str,
        key: str,
        filter: dict[str, Any],
    ) -> list[Any]:
        """Mock distinct."""
        data = self._get_collection_data(database, collection)
        values = set()
        for doc in data:
            if self._matches(doc, filter) and key in doc:
                values.add(doc[key])
        return list(values)

    async def aggregate(
        self,
        database: str,
        collection: str,
        pipeline: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Mock aggregate (simplified)."""
        data = self._get_collection_data(database, collection)
        return list(data)

    async def createIndex(
        self,
        database: str,
        collection: str,
        keys: list[tuple[str, int]],
        options: dict[str, Any],
    ) -> str:
        """Mock createIndex."""
        name = "_".join(f"{k}_{d}" for k, d in keys)
        return name

    async def dropIndex(
        self,
        database: str,
        collection: str,
        index_name: str,
    ) -> None:
        """Mock dropIndex."""
        pass

    async def dropCollection(
        self,
        database: str,
        collection: str,
    ) -> None:
        """Mock dropCollection."""
        if database in self._data:
            self._data[database].pop(collection, None)

    async def listCollectionNames(
        self,
        database: str,
        filter: dict[str, Any],
    ) -> list[str]:
        """Mock listCollectionNames."""
        if database in self._data:
            return list(self._data[database].keys())
        return []

    async def listCollections(
        self,
        database: str,
        filter: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """Mock listCollections."""
        if database in self._data:
            return [{"name": name} for name in self._data[database].keys()]
        return []

    async def createCollection(
        self,
        database: str,
        collection: str,
        options: dict[str, Any],
    ) -> None:
        """Mock createCollection."""
        self._get_collection_data(database, collection)

    async def dropDatabase(self, database: str) -> None:
        """Mock dropDatabase."""
        self._data.pop(database, None)

    async def listDatabaseNames(self) -> list[str]:
        """Mock listDatabaseNames."""
        return list(self._data.keys())

    async def listDatabases(self) -> list[dict[str, Any]]:
        """Mock listDatabases."""
        return [{"name": name} for name in self._data.keys()]

    async def serverInfo(self) -> dict[str, Any]:
        """Mock serverInfo."""
        return {"version": "1.0.0", "ok": 1}

    async def command(
        self,
        database: str,
        command: dict[str, Any],
    ) -> dict[str, Any]:
        """Mock command."""
        return {"ok": 1}

    def _matches(self, doc: dict[str, Any], filter: dict[str, Any]) -> bool:
        """Check if document matches filter."""
        if not filter:
            return True

        for key, value in filter.items():
            if key.startswith("$"):
                # Handle operators
                if key == "$and":
                    if not all(self._matches(doc, f) for f in value):
                        return False
                elif key == "$or":
                    if not any(self._matches(doc, f) for f in value):
                        return False
                continue

            doc_value = doc.get(key)

            if isinstance(value, dict):
                # Handle comparison operators
                for op, op_value in value.items():
                    if op == "$eq":
                        if doc_value != op_value:
                            return False
                    elif op == "$ne":
                        if doc_value == op_value:
                            return False
                    elif op == "$gt":
                        if doc_value is None or doc_value <= op_value:
                            return False
                    elif op == "$gte":
                        if doc_value is None or doc_value < op_value:
                            return False
                    elif op == "$lt":
                        if doc_value is None or doc_value >= op_value:
                            return False
                    elif op == "$lte":
                        if doc_value is None or doc_value > op_value:
                            return False
                    elif op == "$in":
                        if doc_value not in op_value:
                            return False
                    elif op == "$nin":
                        if doc_value in op_value:
                            return False
                    elif op == "$exists":
                        if op_value and key not in doc:
                            return False
                        if not op_value and key in doc:
                            return False
            elif doc_value != value:
                return False

        return True

    def _apply_update(self, doc: dict[str, Any], update: dict[str, Any]) -> bool:
        """Apply update operators to document."""
        modified = False

        for op, fields in update.items():
            if op == "$set":
                for key, value in fields.items():
                    if doc.get(key) != value:
                        doc[key] = value
                        modified = True
            elif op == "$unset":
                for key in fields:
                    if key in doc:
                        del doc[key]
                        modified = True
            elif op == "$inc":
                for key, value in fields.items():
                    doc[key] = doc.get(key, 0) + value
                    modified = True
            elif op == "$push":
                for key, value in fields.items():
                    if key not in doc:
                        doc[key] = []
                    doc[key].append(value)
                    modified = True
            elif op == "$pull":
                for key, value in fields.items():
                    if key in doc and isinstance(doc[key], list):
                        doc[key] = [x for x in doc[key] if x != value]
                        modified = True
            elif op == "$addToSet":
                for key, value in fields.items():
                    if key not in doc:
                        doc[key] = []
                    if value not in doc[key]:
                        doc[key].append(value)
                        modified = True
            elif op == "$min":
                for key, value in fields.items():
                    if key not in doc or value < doc[key]:
                        doc[key] = value
                        modified = True
            elif op == "$max":
                for key, value in fields.items():
                    if key not in doc or value > doc[key]:
                        doc[key] = value
                        modified = True
            elif op == "$mul":
                for key, value in fields.items():
                    doc[key] = doc.get(key, 0) * value
                    modified = True
            elif op == "$rename":
                for old_key, new_key in fields.items():
                    if old_key in doc:
                        doc[new_key] = doc.pop(old_key)
                        modified = True

        return modified

    def _project(
        self,
        doc: dict[str, Any],
        projection: dict[str, int] | None,
    ) -> dict[str, Any]:
        """Apply projection to document."""
        if not projection:
            return doc

        # Check if projection is inclusion or exclusion
        include_mode = any(v == 1 for v in projection.values() if v != 0)

        if include_mode:
            # Include specified fields
            result = {}
            for key, include in projection.items():
                if include and key in doc:
                    result[key] = doc[key]
            # Always include _id unless explicitly excluded
            if "_id" in doc and projection.get("_id", 1) != 0:
                result["_id"] = doc["_id"]
            return result
        else:
            # Exclude specified fields
            return {k: v for k, v in doc.items() if projection.get(k, 1) != 0}


class MockRpcClient:
    """Mock RPC client for testing."""

    def __init__(self) -> None:
        self.mongo = MockRpcMongo()
        self._closed = False

    async def close(self) -> None:
        """Close the mock client."""
        self._closed = True


@pytest.fixture
def mock_rpc() -> MockRpcClient:
    """Create a mock RPC client."""
    return MockRpcClient()


@pytest.fixture
def mock_connect(mock_rpc: MockRpcClient, monkeypatch: pytest.MonkeyPatch):
    """Mock the rpc_do.connect function."""
    # Create a mock module
    mock_rpc_do = MagicMock()
    mock_rpc_do.connect = AsyncMock(return_value=mock_rpc)

    # Add to sys.modules
    monkeypatch.setitem(sys.modules, "rpc_do", mock_rpc_do)

    return mock_rpc_do


@pytest.fixture
async def client(mock_connect, mock_rpc: MockRpcClient):
    """Create a connected MongoClient."""
    from mongo_do import MongoClient

    client = MongoClient("https://test.mongo.do")
    await client.connect()
    return client


@pytest.fixture
async def database(client):
    """Create a database."""
    return client["testdb"]


@pytest.fixture
async def collection(database):
    """Create a collection."""
    return database["testcollection"]
