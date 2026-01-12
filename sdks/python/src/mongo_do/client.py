"""
MongoClient - MongoDB client for .do services.

Provides a PyMongo-compatible MongoClient interface with async operations
backed by RPC calls to a .do MongoDB service.
"""

from __future__ import annotations

import os
from types import TracebackType
from typing import Any

from .database import Database
from .types import ConnectionError, MongoError

__all__ = ["MongoClient"]


class MongoClient:
    """
    MongoDB client for .do services.

    Provides a PyMongo-compatible API for connecting to MongoDB over RPC.
    Databases can be accessed using either attribute access or subscript
    notation.

    Example:
        # Create client
        client = MongoClient("https://mongo.do")
        await client.connect()

        # Access databases
        db = client["myapp"]
        db = client.myapp

        # List databases
        names = await client.list_database_names()

        # Close connection
        await client.close()

        # Or use as async context manager
        async with MongoClient("https://mongo.do") as client:
            db = client["myapp"]
            ...
    """

    __slots__ = ("_uri", "_rpc", "_connected", "_databases", "_options")

    def __init__(
        self,
        uri: str | None = None,
        **options: Any,
    ) -> None:
        """
        Initialize the MongoDB client.

        Args:
            uri: Connection URI (e.g., "https://mongo.do" or "wss://mongo.do/rpc").
                 If not provided, uses MONGO_URL environment variable.
            **options: Additional connection options.
                - timeout: Default timeout for operations (default: 30.0).
        """
        self._uri = uri or os.environ.get("MONGO_URL", "https://mongo.do")
        self._rpc: Any = None
        self._connected = False
        self._databases: dict[str, Database] = {}
        self._options = options

    @property
    def uri(self) -> str:
        """Get the connection URI."""
        return self._uri

    @property
    def is_connected(self) -> bool:
        """Check if the client is connected."""
        return self._connected

    async def connect(self) -> MongoClient:
        """
        Connect to the MongoDB service.

        Returns:
            Self for chaining.

        Raises:
            ConnectionError: If connection fails.
        """
        if self._connected:
            return self

        try:
            from rpc_do import connect

            timeout = self._options.get("timeout", 30.0)
            self._rpc = await connect(self._uri, timeout=timeout)
            self._connected = True
            return self
        except ImportError as e:
            raise ConnectionError(
                "rpc-do package is required. Install with: pip install rpc-do"
            ) from e
        except Exception as e:
            raise ConnectionError(f"Failed to connect to {self._uri}: {e}") from e

    async def close(self) -> None:
        """Close the connection."""
        if self._rpc is not None:
            await self._rpc.close()
            self._rpc = None
        self._connected = False
        self._databases.clear()

    def _ensure_connected(self) -> None:
        """Ensure the client is connected."""
        if not self._connected or self._rpc is None:
            raise MongoError("Client is not connected. Call connect() first.")

    def __getitem__(self, name: str) -> Database:
        """
        Get a database by name using subscript notation.

        Args:
            name: Database name.

        Returns:
            Database instance.

        Example:
            db = client["myapp"]
        """
        self._ensure_connected()

        if name not in self._databases:
            self._databases[name] = Database(self._rpc, self, name)
        return self._databases[name]

    def __getattr__(self, name: str) -> Database:
        """
        Get a database by name using attribute access.

        Args:
            name: Database name.

        Returns:
            Database instance.

        Example:
            db = client.myapp
        """
        if name.startswith("_"):
            raise AttributeError(f"'{type(self).__name__}' has no attribute '{name}'")

        return self[name]

    def get_database(self, name: str) -> Database:
        """
        Get a database by name.

        Args:
            name: Database name.

        Returns:
            Database instance.
        """
        return self[name]

    async def list_database_names(self) -> list[str]:
        """
        List all database names.

        Returns:
            List of database names.
        """
        self._ensure_connected()

        result = await self._rpc.mongo.listDatabaseNames()
        return result if isinstance(result, list) else []

    async def list_databases(self) -> list[dict[str, Any]]:
        """
        List all databases with metadata.

        Returns:
            List of database info dicts.
        """
        self._ensure_connected()

        result = await self._rpc.mongo.listDatabases()
        return result if isinstance(result, list) else []

    async def drop_database(self, name: str) -> None:
        """
        Drop a database.

        Args:
            name: Name of the database to drop.
        """
        self._ensure_connected()

        await self._rpc.mongo.dropDatabase(name)
        self._databases.pop(name, None)

    async def server_info(self) -> dict[str, Any]:
        """
        Get server information.

        Returns:
            Server info dict.
        """
        self._ensure_connected()

        result = await self._rpc.mongo.serverInfo()
        return result if isinstance(result, dict) else {}

    async def __aenter__(self) -> MongoClient:
        """Async context manager entry."""
        await self.connect()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        """Async context manager exit."""
        await self.close()

    def __repr__(self) -> str:
        status = "connected" if self._connected else "disconnected"
        return f"MongoClient({self._uri!r}, {status})"
