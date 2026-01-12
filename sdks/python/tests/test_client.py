"""
Tests for MongoClient and Database classes.

Covers connection handling, database access, and database operations.
"""

from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, MagicMock

import pytest


class TestMongoClient:
    """Tests for MongoClient class."""

    async def test_create_client_with_uri(self, mock_connect):
        """Test creating client with explicit URI."""
        from mongo_do import MongoClient

        client = MongoClient("https://custom.mongo.do")
        assert client.uri == "https://custom.mongo.do"
        assert not client.is_connected

    async def test_create_client_from_env(self, mock_connect, monkeypatch):
        """Test creating client from environment variable."""
        from mongo_do import MongoClient

        monkeypatch.setenv("MONGO_URL", "https://env.mongo.do")
        client = MongoClient()
        assert client.uri == "https://env.mongo.do"

    async def test_create_client_default(self, mock_connect, monkeypatch):
        """Test creating client with default URI."""
        from mongo_do import MongoClient

        monkeypatch.delenv("MONGO_URL", raising=False)
        client = MongoClient()
        assert client.uri == "https://mongo.do"

    async def test_connect(self, mock_connect):
        """Test connecting to MongoDB."""
        from mongo_do import MongoClient

        client = MongoClient("https://test.mongo.do")
        assert not client.is_connected

        result = await client.connect()
        assert result is client  # Returns self for chaining
        assert client.is_connected

    async def test_connect_already_connected(self, client):
        """Test connecting when already connected."""
        # Should return without error
        result = await client.connect()
        assert result is client

    async def test_connect_import_error(self, monkeypatch):
        """Test connection when rpc_do is not installed."""
        import builtins

        from mongo_do import ConnectionError, MongoClient

        # Remove rpc_do from modules
        monkeypatch.delitem(sys.modules, "rpc_do", raising=False)

        # Get original import
        original_import = builtins.__import__

        def mock_import(name, *args, **kwargs):
            if name == "rpc_do":
                raise ImportError("No module named 'rpc_do'")
            return original_import(name, *args, **kwargs)

        monkeypatch.setattr(builtins, "__import__", mock_import)

        client = MongoClient("https://test.mongo.do")
        with pytest.raises(ConnectionError) as exc_info:
            await client.connect()

        assert "rpc-do package is required" in str(exc_info.value)

    async def test_connect_error(self, monkeypatch):
        """Test connection error handling."""
        from mongo_do import ConnectionError, MongoClient

        mock_rpc_do = MagicMock()
        mock_rpc_do.connect = AsyncMock(side_effect=Exception("Connection refused"))
        monkeypatch.setitem(sys.modules, "rpc_do", mock_rpc_do)

        client = MongoClient("https://test.mongo.do")
        with pytest.raises(ConnectionError) as exc_info:
            await client.connect()

        assert "Failed to connect" in str(exc_info.value)

    async def test_close(self, client):
        """Test closing connection."""
        assert client.is_connected
        await client.close()
        assert not client.is_connected

    async def test_close_not_connected(self, mock_connect):
        """Test closing when not connected."""
        from mongo_do import MongoClient

        client = MongoClient("https://test.mongo.do")
        await client.close()  # Should not raise

    async def test_get_database_subscript(self, client):
        """Test getting database via subscript."""
        from mongo_do import Database

        db = client["mydb"]
        assert isinstance(db, Database)
        assert db.name == "mydb"

    async def test_get_database_attribute(self, client):
        """Test getting database via attribute access."""
        from mongo_do import Database

        db = client.mydb
        assert isinstance(db, Database)
        assert db.name == "mydb"

    async def test_get_database_cached(self, client):
        """Test that databases are cached."""
        db1 = client["mydb"]
        db2 = client["mydb"]
        assert db1 is db2

    async def test_get_database_method(self, client):
        """Test get_database method."""
        from mongo_do import Database

        db = client.get_database("mydb")
        assert isinstance(db, Database)
        assert db.name == "mydb"

    async def test_get_database_not_connected(self, mock_connect):
        """Test getting database when not connected raises error."""
        from mongo_do import MongoClient, MongoError

        client = MongoClient("https://test.mongo.do")
        with pytest.raises(MongoError) as exc_info:
            _ = client["mydb"]

        assert "not connected" in str(exc_info.value)

    async def test_get_attr_private(self, client):
        """Test that private attributes raise AttributeError."""
        with pytest.raises(AttributeError):
            _ = client._private

    async def test_list_database_names(self, client, mock_rpc):
        """Test listing database names."""
        # Add some data to create databases
        mock_rpc.mongo._data["db1"] = {}
        mock_rpc.mongo._data["db2"] = {}

        names = await client.list_database_names()
        assert set(names) == {"db1", "db2"}

    async def test_list_databases(self, client, mock_rpc):
        """Test listing databases with metadata."""
        mock_rpc.mongo._data["db1"] = {}
        mock_rpc.mongo._data["db2"] = {}

        dbs = await client.list_databases()
        assert len(dbs) == 2
        assert any(d["name"] == "db1" for d in dbs)
        assert any(d["name"] == "db2" for d in dbs)

    async def test_drop_database(self, client, mock_rpc):
        """Test dropping a database."""
        mock_rpc.mongo._data["toDrop"] = {"col": []}

        await client.drop_database("toDrop")
        assert "toDrop" not in mock_rpc.mongo._data

    async def test_server_info(self, client):
        """Test getting server info."""
        info = await client.server_info()
        assert info["version"] == "1.0.0"
        assert info["ok"] == 1

    async def test_context_manager(self, mock_connect):
        """Test async context manager."""
        from mongo_do import MongoClient

        async with MongoClient("https://test.mongo.do") as client:
            assert client.is_connected
            db = client["mydb"]
            assert db.name == "mydb"

        assert not client.is_connected

    async def test_repr(self, mock_connect):
        """Test client repr."""
        from mongo_do import MongoClient

        client = MongoClient("https://test.mongo.do")
        assert "disconnected" in repr(client)
        assert "https://test.mongo.do" in repr(client)

        await client.connect()
        assert "connected" in repr(client)


class TestDatabase:
    """Tests for Database class."""

    async def test_name_property(self, database):
        """Test database name property."""
        assert database.name == "testdb"

    async def test_client_property(self, database, client):
        """Test database client property."""
        assert database.client is client

    async def test_get_collection_subscript(self, database):
        """Test getting collection via subscript."""
        from mongo_do import Collection

        col = database["users"]
        assert isinstance(col, Collection)
        assert col.name == "users"

    async def test_get_collection_attribute(self, database):
        """Test getting collection via attribute access."""
        from mongo_do import Collection

        col = database.users
        assert isinstance(col, Collection)
        assert col.name == "users"

    async def test_get_collection_cached(self, database):
        """Test that collections are cached via subscript."""
        col1 = database["users"]
        col2 = database["users"]
        assert col1 is col2

    async def test_get_collection_attr_cached(self, database):
        """Test that collections are cached via attribute."""
        col1 = database.orders
        col2 = database.orders
        assert col1 is col2

    async def test_get_collection_typed(self, database):
        """Test get_collection with type parameter."""
        from typing import TypedDict

        from mongo_do import Collection

        class User(TypedDict):
            _id: str
            name: str

        users = database.get_collection("users", User)
        assert isinstance(users, Collection)

    async def test_get_collection_cached(self, database):
        """Test that get_collection returns cached collection."""
        col1 = database.get_collection("users")
        col2 = database.get_collection("users")
        assert col1 is col2

    async def test_get_attr_private(self, database):
        """Test that private attributes raise AttributeError."""
        with pytest.raises(AttributeError):
            _ = database._private

    async def test_list_collection_names(self, database, mock_rpc):
        """Test listing collection names."""
        mock_rpc.mongo._data["testdb"] = {"col1": [], "col2": []}

        names = await database.list_collection_names()
        assert set(names) == {"col1", "col2"}

    async def test_list_collections(self, database, mock_rpc):
        """Test listing collections with metadata."""
        mock_rpc.mongo._data["testdb"] = {"col1": [], "col2": []}

        cols = await database.list_collections()
        assert len(cols) == 2

    async def test_create_collection(self, database):
        """Test creating a collection."""
        from mongo_do import Collection

        col = await database.create_collection("newcol")
        assert isinstance(col, Collection)
        assert col.name == "newcol"

    async def test_drop_collection(self, database, mock_rpc):
        """Test dropping a collection."""
        mock_rpc.mongo._data["testdb"] = {"toDrop": []}
        database["toDrop"]  # Cache it

        await database.drop_collection("toDrop")
        assert "toDrop" not in mock_rpc.mongo._data.get("testdb", {})

    async def test_drop_database(self, database, mock_rpc):
        """Test dropping the database."""
        mock_rpc.mongo._data["testdb"] = {"col": []}

        await database.drop_database()
        assert "testdb" not in mock_rpc.mongo._data

    async def test_command(self, database):
        """Test running database command."""
        result = await database.command("ping")
        assert result["ok"] == 1

    async def test_command_with_dict(self, database):
        """Test running database command with dict."""
        result = await database.command({"ping": 1})
        assert result["ok"] == 1

    async def test_repr(self, database):
        """Test database repr."""
        assert "testdb" in repr(database)
