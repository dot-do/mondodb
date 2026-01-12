"""
mongo-do - MongoDB on the Edge. PyMongo-compatible async client for .do services.

This package provides a PyMongo-compatible async client for connecting to
MongoDB services over RPC with support for:
- Full CRUD operations (insert, find, update, delete)
- Async/await native API
- Cursor iteration with chaining (sort, limit, skip)
- Aggregation pipelines
- Index management

Example usage:
    from mongo_do import MongoClient

    async def main():
        # Connect to MongoDB service
        client = MongoClient("https://mongo.do")
        await client.connect()

        # Access database and collection
        db = client["myapp"]
        users = db["users"]

        # Insert documents
        result = await users.insert_one({"name": "Alice", "email": "alice@example.com"})
        print(result.inserted_id)

        # Find documents
        user = await users.find_one({"email": "alice@example.com"})
        print(user)

        # Iterate over results
        async for user in users.find({"status": "active"}):
            print(user["name"])

        # Update documents
        await users.update_one(
            {"email": "alice@example.com"},
            {"$set": {"status": "vip"}}
        )

        # Delete documents
        await users.delete_one({"email": "alice@example.com"})

        await client.close()

    import asyncio
    asyncio.run(main())
"""

from __future__ import annotations

__version__ = "0.1.0"

from .client import MongoClient
from .collection import Collection
from .cursor import Cursor
from .database import Database
from .types import (
    BulkWriteResult,
    ConnectionError,
    DeleteResult,
    DuplicateKeyError,
    InsertManyResult,
    InsertOneResult,
    MongoError,
    OperationFailure,
    QueryError,
    UpdateResult,
    WriteError,
)

__all__ = [
    # Main classes
    "MongoClient",
    "Database",
    "Collection",
    "Cursor",
    # Result types
    "InsertOneResult",
    "InsertManyResult",
    "UpdateResult",
    "DeleteResult",
    "BulkWriteResult",
    # Exceptions
    "MongoError",
    "ConnectionError",
    "QueryError",
    "WriteError",
    "DuplicateKeyError",
    "OperationFailure",
    # Version
    "__version__",
]
