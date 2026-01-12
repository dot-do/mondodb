"""
Cursor - Async cursor for iterating over query results.

Provides a PyMongo-compatible cursor interface for streaming
documents from MongoDB queries over RPC.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, AsyncIterator, Generic, TypeVar

if TYPE_CHECKING:
    from rpc_do import RpcClient

    from .types import Filter, Projection, Sort

T = TypeVar("T", bound=dict[str, Any])

__all__ = ["Cursor"]


class Cursor(Generic[T]):
    """
    Async cursor for iterating over query results.

    Cursor provides a lazy, async iterable interface for MongoDB query
    results. It supports chaining operations like sort, limit, skip,
    and projection before iteration begins.

    Example:
        async for doc in collection.find({"status": "active"}):
            print(doc)

        # With chaining
        cursor = collection.find({}).sort("created_at", -1).limit(10)
        async for doc in cursor:
            print(doc)
    """

    __slots__ = (
        "_rpc",
        "_database",
        "_collection",
        "_filter",
        "_projection",
        "_sort",
        "_limit",
        "_skip",
        "_batch_size",
        "_results",
        "_exhausted",
        "_position",
    )

    def __init__(
        self,
        rpc: RpcClient,
        database: str,
        collection: str,
        filter: Filter | None = None,
        projection: Projection = None,
    ) -> None:
        """
        Initialize a cursor.

        Args:
            rpc: The RPC client for making calls.
            database: Database name.
            collection: Collection name.
            filter: Query filter.
            projection: Fields to include/exclude.
        """
        self._rpc = rpc
        self._database = database
        self._collection = collection
        self._filter: Filter = filter or {}
        self._projection: Projection = projection
        self._sort: Sort = None
        self._limit: int = 0
        self._skip: int = 0
        self._batch_size: int = 100
        self._results: list[T] | None = None
        self._exhausted: bool = False
        self._position: int = 0

    def sort(self, key_or_list: str | list[tuple[str, int]], direction: int = 1) -> Cursor[T]:
        """
        Sort the results.

        Args:
            key_or_list: Field name or list of (field, direction) tuples.
            direction: Sort direction (1 for ascending, -1 for descending).
                       Only used if key_or_list is a string.

        Returns:
            Self for chaining.
        """
        if isinstance(key_or_list, str):
            self._sort = [(key_or_list, direction)]
        else:
            self._sort = key_or_list
        return self

    def limit(self, limit: int) -> Cursor[T]:
        """
        Limit the number of results.

        Args:
            limit: Maximum number of documents to return.

        Returns:
            Self for chaining.
        """
        self._limit = limit
        return self

    def skip(self, skip: int) -> Cursor[T]:
        """
        Skip the first N results.

        Args:
            skip: Number of documents to skip.

        Returns:
            Self for chaining.
        """
        self._skip = skip
        return self

    def batch_size(self, size: int) -> Cursor[T]:
        """
        Set the batch size for fetching results.

        Args:
            size: Number of documents per batch.

        Returns:
            Self for chaining.
        """
        self._batch_size = size
        return self

    def project(self, projection: Projection) -> Cursor[T]:
        """
        Set field projection.

        Args:
            projection: Fields to include/exclude.

        Returns:
            Self for chaining.
        """
        self._projection = projection
        return self

    async def _execute(self) -> list[T]:
        """
        Execute the query and fetch results.

        Returns:
            List of documents matching the query.
        """
        if self._results is not None:
            return self._results

        # Build the query options
        options: dict[str, Any] = {}

        if self._projection:
            if isinstance(self._projection, list):
                # Convert list of field names to projection dict
                options["projection"] = {field: 1 for field in self._projection}
            else:
                options["projection"] = dict(self._projection)

        if self._sort:
            options["sort"] = self._sort

        if self._limit > 0:
            options["limit"] = self._limit

        if self._skip > 0:
            options["skip"] = self._skip

        # Execute via RPC
        result = await self._rpc.mongo.find(
            self._database,
            self._collection,
            self._filter,
            options,
        )

        self._results = result if isinstance(result, list) else []
        return self._results

    async def to_list(self, length: int | None = None) -> list[T]:
        """
        Convert cursor to a list.

        Args:
            length: Maximum number of documents to return.
                    If None, returns all documents.

        Returns:
            List of documents.
        """
        results = await self._execute()
        if length is not None:
            return results[:length]
        return results

    def __aiter__(self) -> AsyncIterator[T]:
        """Return async iterator."""
        return self

    async def __anext__(self) -> T:
        """
        Get the next document.

        Returns:
            The next document.

        Raises:
            StopAsyncIteration: When all documents have been iterated.
        """
        # Lazy execute on first iteration
        if self._results is None:
            await self._execute()

        assert self._results is not None

        if self._position >= len(self._results):
            self._exhausted = True
            raise StopAsyncIteration

        doc = self._results[self._position]
        self._position += 1
        return doc

    async def next(self) -> T:
        """
        Get the next document.

        Returns:
            The next document.

        Raises:
            StopAsyncIteration: When all documents have been iterated.
        """
        return await self.__anext__()

    async def count(self) -> int:
        """
        Count documents matching the query.

        Returns:
            Number of documents.

        Note:
            This method is deprecated in PyMongo 4.0+.
            Use count_documents() on the collection instead.
        """
        result = await self._rpc.mongo.countDocuments(
            self._database,
            self._collection,
            self._filter,
        )
        return result if isinstance(result, int) else 0

    async def distinct(self, key: str) -> list[Any]:
        """
        Get distinct values for a field.

        Args:
            key: Field name to get distinct values for.

        Returns:
            List of distinct values.
        """
        result = await self._rpc.mongo.distinct(
            self._database,
            self._collection,
            key,
            self._filter,
        )
        return result if isinstance(result, list) else []

    def clone(self) -> Cursor[T]:
        """
        Clone this cursor.

        Returns:
            A new cursor with the same query parameters.
        """
        cursor = Cursor[T](
            self._rpc,
            self._database,
            self._collection,
            self._filter,
            self._projection,
        )
        cursor._sort = self._sort
        cursor._limit = self._limit
        cursor._skip = self._skip
        cursor._batch_size = self._batch_size
        return cursor

    @property
    def alive(self) -> bool:
        """Check if the cursor can still yield documents."""
        return not self._exhausted

    def rewind(self) -> Cursor[T]:
        """
        Rewind the cursor to the beginning.

        Returns:
            Self for chaining.
        """
        self._position = 0
        self._exhausted = False
        return self
