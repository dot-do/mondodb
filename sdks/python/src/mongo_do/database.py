"""
Database - MongoDB database operations.

Provides a PyMongo-compatible Database interface with async operations
backed by RPC calls.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Generic, TypeVar

from .collection import Collection

if TYPE_CHECKING:
    from rpc_do import RpcClient

    from .client import MongoClient

T = TypeVar("T", bound=dict[str, Any])

__all__ = ["Database"]


class Database:
    """
    MongoDB database with async operations.

    Provides a PyMongo-compatible API for interacting with a MongoDB
    database over RPC. Collections can be accessed using either
    attribute access or subscript notation.

    Example:
        db = client["myapp"]

        # Access collections
        users = db.users
        orders = db["orders"]

        # List collections
        names = await db.list_collection_names()

        # Drop database
        await db.drop_database()
    """

    __slots__ = ("_rpc", "_client", "_name", "_collections")

    def __init__(
        self,
        rpc: RpcClient,
        client: MongoClient,
        name: str,
    ) -> None:
        """
        Initialize a database.

        Args:
            rpc: The RPC client for making calls.
            client: Parent MongoClient instance.
            name: Database name.
        """
        self._rpc = rpc
        self._client = client
        self._name = name
        self._collections: dict[str, Collection[Any]] = {}

    @property
    def name(self) -> str:
        """Get the database name."""
        return self._name

    @property
    def client(self) -> MongoClient:
        """Get the parent client."""
        return self._client

    def __getitem__(self, name: str) -> Collection[Any]:
        """
        Get a collection by name using subscript notation.

        Args:
            name: Collection name.

        Returns:
            Collection instance.

        Example:
            users = db["users"]
        """
        if name not in self._collections:
            self._collections[name] = Collection(self._rpc, self, name)
        return self._collections[name]

    def __getattr__(self, name: str) -> Collection[Any]:
        """
        Get a collection by name using attribute access.

        Args:
            name: Collection name.

        Returns:
            Collection instance.

        Example:
            users = db.users
        """
        if name.startswith("_"):
            raise AttributeError(f"'{type(self).__name__}' has no attribute '{name}'")

        return self[name]

    def get_collection(
        self,
        name: str,
        document_class: type[T] | None = None,
    ) -> Collection[T]:
        """
        Get a typed collection.

        Args:
            name: Collection name.
            document_class: Optional document type for type hints.

        Returns:
            Typed Collection instance.

        Example:
            from typing import TypedDict

            class User(TypedDict):
                _id: str
                name: str
                email: str

            users = db.get_collection("users", User)
            user: User | None = await users.find_one({"email": "alice@example.com"})
        """
        if name not in self._collections:
            self._collections[name] = Collection(self._rpc, self, name)
        return self._collections[name]  # type: ignore

    async def list_collection_names(self, filter: dict[str, Any] | None = None) -> list[str]:
        """
        List all collection names in the database.

        Args:
            filter: Optional filter for collection names.

        Returns:
            List of collection names.
        """
        result = await self._rpc.mongo.listCollectionNames(
            self._name,
            filter or {},
        )
        return result if isinstance(result, list) else []

    async def list_collections(
        self,
        filter: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """
        List all collections in the database with metadata.

        Args:
            filter: Optional filter for collections.

        Returns:
            List of collection info dicts.
        """
        result = await self._rpc.mongo.listCollections(
            self._name,
            filter or {},
        )
        return result if isinstance(result, list) else []

    async def create_collection(
        self,
        name: str,
        **kwargs: Any,
    ) -> Collection[Any]:
        """
        Create a new collection.

        Args:
            name: Collection name.
            **kwargs: Collection options (capped, size, max, etc.).

        Returns:
            The created Collection instance.
        """
        await self._rpc.mongo.createCollection(
            self._name,
            name,
            kwargs,
        )
        return self[name]

    async def drop_collection(self, name: str) -> None:
        """
        Drop a collection.

        Args:
            name: Name of the collection to drop.
        """
        await self._rpc.mongo.dropCollection(self._name, name)
        self._collections.pop(name, None)

    async def drop_database(self) -> None:
        """Drop the database."""
        await self._rpc.mongo.dropDatabase(self._name)
        self._collections.clear()

    async def command(
        self,
        command: str | dict[str, Any],
        value: Any = 1,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """
        Run a database command.

        Args:
            command: Command name or command document.
            value: Command value (default 1).
            **kwargs: Additional command options.

        Returns:
            Command result.
        """
        if isinstance(command, str):
            cmd = {command: value, **kwargs}
        else:
            cmd = command

        result = await self._rpc.mongo.command(self._name, cmd)
        return result if isinstance(result, dict) else {}

    def __repr__(self) -> str:
        return f"Database({self._name!r})"
