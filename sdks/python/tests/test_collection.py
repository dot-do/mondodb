"""
Tests for Collection and Cursor classes.

Covers all CRUD operations, query filtering, update operators,
async iteration, and error handling.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest


class TestCollection:
    """Tests for Collection class."""

    async def test_name_property(self, collection):
        """Test collection name property."""
        assert collection.name == "testcollection"

    async def test_full_name_property(self, collection):
        """Test collection full_name property."""
        assert collection.full_name == "testdb.testcollection"

    async def test_database_property(self, collection, database):
        """Test collection database property."""
        assert collection.database is database

    async def test_repr(self, collection):
        """Test collection repr."""
        assert "testdb.testcollection" in repr(collection)


class TestInsertOperations:
    """Tests for insert operations."""

    async def test_insert_one(self, collection):
        """Test inserting a single document."""
        from mongo_do import InsertOneResult

        result = await collection.insert_one({"name": "Alice", "age": 30})

        assert isinstance(result, InsertOneResult)
        assert result.inserted_id is not None
        assert result.acknowledged is True

    async def test_insert_one_with_id(self, collection):
        """Test inserting with explicit _id."""
        result = await collection.insert_one({"_id": "custom-id", "name": "Bob"})

        assert result.inserted_id == "custom-id"

    async def test_insert_one_duplicate_key(self, collection):
        """Test inserting duplicate key raises error."""
        from mongo_do import DuplicateKeyError

        await collection.insert_one({"_id": "dup-id", "name": "First"})

        with pytest.raises(DuplicateKeyError):
            await collection.insert_one({"_id": "dup-id", "name": "Second"})

    async def test_insert_many(self, collection):
        """Test inserting multiple documents."""
        from mongo_do import InsertManyResult

        docs = [
            {"name": "Alice", "age": 30},
            {"name": "Bob", "age": 25},
            {"name": "Charlie", "age": 35},
        ]
        result = await collection.insert_many(docs)

        assert isinstance(result, InsertManyResult)
        assert len(result.inserted_ids) == 3
        assert result.acknowledged is True

    async def test_insert_many_with_ids(self, collection):
        """Test inserting multiple documents with explicit _ids."""
        docs = [
            {"_id": "id1", "name": "Alice"},
            {"_id": "id2", "name": "Bob"},
        ]
        result = await collection.insert_many(docs)

        assert result.inserted_ids == ["id1", "id2"]


class TestFindOperations:
    """Tests for find operations."""

    async def test_find_one(self, collection):
        """Test finding a single document."""
        await collection.insert_one({"_id": "find-1", "name": "Alice", "age": 30})

        doc = await collection.find_one({"name": "Alice"})

        assert doc is not None
        assert doc["name"] == "Alice"
        assert doc["age"] == 30

    async def test_find_one_not_found(self, collection):
        """Test finding document that doesn't exist."""
        doc = await collection.find_one({"name": "NonExistent"})
        assert doc is None

    async def test_find_one_with_projection(self, collection):
        """Test finding with field projection."""
        await collection.insert_one({"_id": "proj-1", "name": "Alice", "age": 30, "email": "a@b.com"})

        # Dict projection
        doc = await collection.find_one({"_id": "proj-1"}, {"name": 1})
        assert "name" in doc
        assert "_id" in doc  # _id is included by default

        # List projection
        doc = await collection.find_one({"_id": "proj-1"}, ["name", "email"])
        assert "name" in doc

    async def test_find_empty(self, collection):
        """Test finding with no results."""
        cursor = collection.find({"name": "NonExistent"})
        docs = await cursor.to_list()
        assert docs == []

    async def test_find_all(self, collection):
        """Test finding all documents."""
        await collection.insert_many([
            {"_id": "all-1", "name": "Alice"},
            {"_id": "all-2", "name": "Bob"},
            {"_id": "all-3", "name": "Charlie"},
        ])

        docs = await collection.find({}).to_list()
        assert len(docs) == 3

    async def test_find_with_filter(self, collection):
        """Test finding with filter."""
        await collection.insert_many([
            {"_id": "f1", "status": "active", "name": "Alice"},
            {"_id": "f2", "status": "inactive", "name": "Bob"},
            {"_id": "f3", "status": "active", "name": "Charlie"},
        ])

        docs = await collection.find({"status": "active"}).to_list()
        assert len(docs) == 2
        assert all(d["status"] == "active" for d in docs)

    async def test_find_async_iteration(self, collection):
        """Test async iteration over results."""
        await collection.insert_many([
            {"_id": "iter-1", "name": "Alice"},
            {"_id": "iter-2", "name": "Bob"},
        ])

        names = []
        async for doc in collection.find({}):
            names.append(doc["name"])

        assert set(names) == {"Alice", "Bob"}


class TestCursor:
    """Tests for Cursor class."""

    async def test_cursor_sort_ascending(self, collection):
        """Test cursor sort ascending."""
        await collection.insert_many([
            {"_id": "s1", "name": "Charlie", "age": 35},
            {"_id": "s2", "name": "Alice", "age": 30},
            {"_id": "s3", "name": "Bob", "age": 25},
        ])

        docs = await collection.find({}).sort("name", 1).to_list()
        assert [d["name"] for d in docs] == ["Alice", "Bob", "Charlie"]

    async def test_cursor_sort_descending(self, collection):
        """Test cursor sort descending."""
        await collection.insert_many([
            {"_id": "sd1", "age": 30},
            {"_id": "sd2", "age": 25},
            {"_id": "sd3", "age": 35},
        ])

        docs = await collection.find({}).sort("age", -1).to_list()
        assert [d["age"] for d in docs] == [35, 30, 25]

    async def test_cursor_sort_list(self, collection):
        """Test cursor sort with list of fields."""
        await collection.insert_many([
            {"_id": "sl1", "status": "active", "age": 30},
            {"_id": "sl2", "status": "active", "age": 25},
            {"_id": "sl3", "status": "inactive", "age": 35},
        ])

        docs = await collection.find({}).sort([("status", 1), ("age", -1)]).to_list()
        assert docs[0]["status"] == "active"
        assert docs[0]["age"] == 30

    async def test_cursor_limit(self, collection):
        """Test cursor limit."""
        await collection.insert_many([
            {"_id": f"lim-{i}", "index": i} for i in range(10)
        ])

        docs = await collection.find({}).limit(3).to_list()
        assert len(docs) == 3

    async def test_cursor_skip(self, collection):
        """Test cursor skip."""
        await collection.insert_many([
            {"_id": f"skip-{i}", "index": i} for i in range(10)
        ])

        docs = await collection.find({}).sort("index", 1).skip(5).to_list()
        assert len(docs) == 5
        assert docs[0]["index"] == 5

    async def test_cursor_limit_and_skip(self, collection):
        """Test cursor with both limit and skip."""
        await collection.insert_many([
            {"_id": f"ls-{i}", "index": i} for i in range(10)
        ])

        docs = await collection.find({}).sort("index", 1).skip(2).limit(3).to_list()
        assert len(docs) == 3
        assert [d["index"] for d in docs] == [2, 3, 4]

    async def test_cursor_to_list_with_length(self, collection):
        """Test cursor to_list with length parameter."""
        await collection.insert_many([
            {"_id": f"tl-{i}", "index": i} for i in range(10)
        ])

        docs = await collection.find({}).to_list(length=3)
        assert len(docs) == 3

    async def test_cursor_batch_size(self, collection):
        """Test cursor batch_size (just sets parameter)."""
        cursor = collection.find({}).batch_size(50)
        assert cursor._batch_size == 50

    async def test_cursor_project(self, collection):
        """Test cursor project method."""
        await collection.insert_one({"_id": "cp-1", "name": "Alice", "age": 30})

        docs = await collection.find({}).project({"name": 1}).to_list()
        assert len(docs) == 1
        assert "name" in docs[0]

    async def test_cursor_count(self, collection):
        """Test cursor count method."""
        await collection.insert_many([
            {"_id": f"cnt-{i}", "status": "active"} for i in range(5)
        ])

        cursor = collection.find({"status": "active"})
        count = await cursor.count()
        assert count == 5

    async def test_cursor_distinct(self, collection):
        """Test cursor distinct method."""
        await collection.insert_many([
            {"_id": "d1", "status": "active"},
            {"_id": "d2", "status": "inactive"},
            {"_id": "d3", "status": "active"},
        ])

        cursor = collection.find({})
        values = await cursor.distinct("status")
        assert set(values) == {"active", "inactive"}

    async def test_cursor_clone(self, collection):
        """Test cursor clone."""
        cursor = collection.find({"status": "active"}).sort("name").limit(10)
        cloned = cursor.clone()

        assert cloned._filter == cursor._filter
        assert cloned._sort == cursor._sort
        assert cloned._limit == cursor._limit
        assert cloned is not cursor

    async def test_cursor_alive(self, collection):
        """Test cursor alive property."""
        await collection.insert_one({"_id": "alive-1", "name": "Test"})

        cursor = collection.find({})
        assert cursor.alive is True

        async for _ in cursor:
            pass

        assert cursor.alive is False

    async def test_cursor_rewind(self, collection):
        """Test cursor rewind."""
        await collection.insert_many([
            {"_id": "rew-1", "name": "Alice"},
            {"_id": "rew-2", "name": "Bob"},
        ])

        cursor = collection.find({})

        # First iteration
        docs1 = []
        async for doc in cursor:
            docs1.append(doc)

        assert cursor.alive is False

        # Rewind
        cursor.rewind()
        assert cursor.alive is True

        # Second iteration
        docs2 = []
        async for doc in cursor:
            docs2.append(doc)

        assert len(docs1) == len(docs2)

    async def test_cursor_next(self, collection):
        """Test cursor next method."""
        await collection.insert_one({"_id": "next-1", "name": "Test"})

        cursor = collection.find({})
        doc = await cursor.next()
        assert doc["name"] == "Test"

        with pytest.raises(StopAsyncIteration):
            await cursor.next()


class TestUpdateOperations:
    """Tests for update operations."""

    async def test_update_one(self, collection):
        """Test updating a single document."""
        from mongo_do import UpdateResult

        await collection.insert_one({"_id": "u1", "name": "Alice", "age": 30})

        result = await collection.update_one(
            {"_id": "u1"},
            {"$set": {"age": 31}}
        )

        assert isinstance(result, UpdateResult)
        assert result.matched_count == 1
        assert result.modified_count == 1

        doc = await collection.find_one({"_id": "u1"})
        assert doc["age"] == 31

    async def test_update_one_no_match(self, collection):
        """Test update_one with no matching document."""
        result = await collection.update_one(
            {"_id": "nonexistent"},
            {"$set": {"name": "Test"}}
        )

        assert result.matched_count == 0
        assert result.modified_count == 0

    async def test_update_one_upsert(self, collection):
        """Test update_one with upsert."""
        result = await collection.update_one(
            {"_id": "upsert-1"},
            {"$set": {"name": "Upserted"}},
            upsert=True
        )

        assert result.upserted_id is not None

        doc = await collection.find_one({"_id": "upsert-1"})
        assert doc is not None
        assert doc["name"] == "Upserted"

    async def test_update_many(self, collection):
        """Test updating multiple documents."""
        await collection.insert_many([
            {"_id": "um1", "status": "pending", "count": 0},
            {"_id": "um2", "status": "pending", "count": 0},
            {"_id": "um3", "status": "done", "count": 0},
        ])

        result = await collection.update_many(
            {"status": "pending"},
            {"$set": {"status": "processed"}}
        )

        assert result.matched_count == 2
        assert result.modified_count == 2

    async def test_replace_one(self, collection):
        """Test replacing a document."""
        await collection.insert_one({"_id": "rep-1", "name": "Old", "extra": "data"})

        result = await collection.replace_one(
            {"_id": "rep-1"},
            {"name": "New"}
        )

        assert result.matched_count == 1
        assert result.modified_count == 1

        doc = await collection.find_one({"_id": "rep-1"})
        assert doc["name"] == "New"
        assert "extra" not in doc


class TestUpdateOperators:
    """Tests for MongoDB update operators."""

    async def test_set_operator(self, collection):
        """Test $set operator."""
        await collection.insert_one({"_id": "set-1", "name": "Alice"})

        await collection.update_one(
            {"_id": "set-1"},
            {"$set": {"name": "Bob", "age": 25}}
        )

        doc = await collection.find_one({"_id": "set-1"})
        assert doc["name"] == "Bob"
        assert doc["age"] == 25

    async def test_unset_operator(self, collection):
        """Test $unset operator."""
        await collection.insert_one({"_id": "unset-1", "name": "Alice", "temp": "value"})

        await collection.update_one(
            {"_id": "unset-1"},
            {"$unset": {"temp": ""}}
        )

        doc = await collection.find_one({"_id": "unset-1"})
        assert "temp" not in doc

    async def test_inc_operator(self, collection):
        """Test $inc operator."""
        await collection.insert_one({"_id": "inc-1", "count": 10})

        await collection.update_one(
            {"_id": "inc-1"},
            {"$inc": {"count": 5}}
        )

        doc = await collection.find_one({"_id": "inc-1"})
        assert doc["count"] == 15

    async def test_inc_operator_negative(self, collection):
        """Test $inc with negative value."""
        await collection.insert_one({"_id": "inc-2", "count": 10})

        await collection.update_one(
            {"_id": "inc-2"},
            {"$inc": {"count": -3}}
        )

        doc = await collection.find_one({"_id": "inc-2"})
        assert doc["count"] == 7

    async def test_push_operator(self, collection):
        """Test $push operator."""
        await collection.insert_one({"_id": "push-1", "tags": ["a", "b"]})

        await collection.update_one(
            {"_id": "push-1"},
            {"$push": {"tags": "c"}}
        )

        doc = await collection.find_one({"_id": "push-1"})
        assert doc["tags"] == ["a", "b", "c"]

    async def test_pull_operator(self, collection):
        """Test $pull operator."""
        await collection.insert_one({"_id": "pull-1", "tags": ["a", "b", "c"]})

        await collection.update_one(
            {"_id": "pull-1"},
            {"$pull": {"tags": "b"}}
        )

        doc = await collection.find_one({"_id": "pull-1"})
        assert doc["tags"] == ["a", "c"]

    async def test_addtoset_operator(self, collection):
        """Test $addToSet operator."""
        await collection.insert_one({"_id": "ats-1", "tags": ["a", "b"]})

        # Add new value
        await collection.update_one(
            {"_id": "ats-1"},
            {"$addToSet": {"tags": "c"}}
        )

        doc = await collection.find_one({"_id": "ats-1"})
        assert "c" in doc["tags"]

        # Try to add existing value (should not duplicate)
        await collection.update_one(
            {"_id": "ats-1"},
            {"$addToSet": {"tags": "a"}}
        )

        doc = await collection.find_one({"_id": "ats-1"})
        assert doc["tags"].count("a") == 1

    async def test_min_operator(self, collection):
        """Test $min operator."""
        await collection.insert_one({"_id": "min-1", "low": 10})

        # Update with lower value
        await collection.update_one(
            {"_id": "min-1"},
            {"$min": {"low": 5}}
        )

        doc = await collection.find_one({"_id": "min-1"})
        assert doc["low"] == 5

        # Update with higher value (should not change)
        await collection.update_one(
            {"_id": "min-1"},
            {"$min": {"low": 15}}
        )

        doc = await collection.find_one({"_id": "min-1"})
        assert doc["low"] == 5

    async def test_max_operator(self, collection):
        """Test $max operator."""
        await collection.insert_one({"_id": "max-1", "high": 10})

        # Update with higher value
        await collection.update_one(
            {"_id": "max-1"},
            {"$max": {"high": 15}}
        )

        doc = await collection.find_one({"_id": "max-1"})
        assert doc["high"] == 15

    async def test_mul_operator(self, collection):
        """Test $mul operator."""
        await collection.insert_one({"_id": "mul-1", "value": 10})

        await collection.update_one(
            {"_id": "mul-1"},
            {"$mul": {"value": 2}}
        )

        doc = await collection.find_one({"_id": "mul-1"})
        assert doc["value"] == 20

    async def test_rename_operator(self, collection):
        """Test $rename operator."""
        await collection.insert_one({"_id": "ren-1", "oldName": "value"})

        await collection.update_one(
            {"_id": "ren-1"},
            {"$rename": {"oldName": "newName"}}
        )

        doc = await collection.find_one({"_id": "ren-1"})
        assert "oldName" not in doc
        assert doc["newName"] == "value"


class TestDeleteOperations:
    """Tests for delete operations."""

    async def test_delete_one(self, collection):
        """Test deleting a single document."""
        from mongo_do import DeleteResult

        await collection.insert_one({"_id": "del-1", "name": "ToDelete"})

        result = await collection.delete_one({"_id": "del-1"})

        assert isinstance(result, DeleteResult)
        assert result.deleted_count == 1
        assert result.acknowledged is True

        doc = await collection.find_one({"_id": "del-1"})
        assert doc is None

    async def test_delete_one_no_match(self, collection):
        """Test delete_one with no matching document."""
        result = await collection.delete_one({"_id": "nonexistent"})
        assert result.deleted_count == 0

    async def test_delete_many(self, collection):
        """Test deleting multiple documents."""
        await collection.insert_many([
            {"_id": "dm1", "status": "delete"},
            {"_id": "dm2", "status": "delete"},
            {"_id": "dm3", "status": "keep"},
        ])

        result = await collection.delete_many({"status": "delete"})

        assert result.deleted_count == 2

        remaining = await collection.find({}).to_list()
        assert len(remaining) == 1
        assert remaining[0]["status"] == "keep"


class TestQueryOperators:
    """Tests for query filter operators."""

    async def test_eq_operator(self, collection):
        """Test $eq operator."""
        await collection.insert_many([
            {"_id": "eq1", "value": 10},
            {"_id": "eq2", "value": 20},
        ])

        docs = await collection.find({"value": {"$eq": 10}}).to_list()
        assert len(docs) == 1
        assert docs[0]["value"] == 10

    async def test_ne_operator(self, collection):
        """Test $ne operator."""
        await collection.insert_many([
            {"_id": "ne1", "value": 10},
            {"_id": "ne2", "value": 20},
        ])

        docs = await collection.find({"value": {"$ne": 10}}).to_list()
        assert len(docs) == 1
        assert docs[0]["value"] == 20

    async def test_gt_operator(self, collection):
        """Test $gt operator."""
        await collection.insert_many([
            {"_id": "gt1", "value": 10},
            {"_id": "gt2", "value": 20},
            {"_id": "gt3", "value": 30},
        ])

        docs = await collection.find({"value": {"$gt": 15}}).to_list()
        assert len(docs) == 2

    async def test_gte_operator(self, collection):
        """Test $gte operator."""
        await collection.insert_many([
            {"_id": "gte1", "value": 10},
            {"_id": "gte2", "value": 20},
        ])

        docs = await collection.find({"value": {"$gte": 20}}).to_list()
        assert len(docs) == 1

    async def test_lt_operator(self, collection):
        """Test $lt operator."""
        await collection.insert_many([
            {"_id": "lt1", "value": 10},
            {"_id": "lt2", "value": 20},
        ])

        docs = await collection.find({"value": {"$lt": 15}}).to_list()
        assert len(docs) == 1

    async def test_lte_operator(self, collection):
        """Test $lte operator."""
        await collection.insert_many([
            {"_id": "lte1", "value": 10},
            {"_id": "lte2", "value": 20},
        ])

        docs = await collection.find({"value": {"$lte": 10}}).to_list()
        assert len(docs) == 1

    async def test_in_operator(self, collection):
        """Test $in operator."""
        await collection.insert_many([
            {"_id": "in1", "status": "active"},
            {"_id": "in2", "status": "pending"},
            {"_id": "in3", "status": "inactive"},
        ])

        docs = await collection.find({"status": {"$in": ["active", "pending"]}}).to_list()
        assert len(docs) == 2

    async def test_nin_operator(self, collection):
        """Test $nin operator."""
        await collection.insert_many([
            {"_id": "nin1", "status": "active"},
            {"_id": "nin2", "status": "pending"},
            {"_id": "nin3", "status": "inactive"},
        ])

        docs = await collection.find({"status": {"$nin": ["active", "pending"]}}).to_list()
        assert len(docs) == 1
        assert docs[0]["status"] == "inactive"

    async def test_exists_operator(self, collection):
        """Test $exists operator."""
        await collection.insert_many([
            {"_id": "ex1", "name": "Alice", "email": "a@b.com"},
            {"_id": "ex2", "name": "Bob"},
        ])

        # Field exists
        docs = await collection.find({"email": {"$exists": True}}).to_list()
        assert len(docs) == 1
        assert docs[0]["name"] == "Alice"

        # Field does not exist
        docs = await collection.find({"email": {"$exists": False}}).to_list()
        assert len(docs) == 1
        assert docs[0]["name"] == "Bob"

    async def test_and_operator(self, collection):
        """Test $and operator."""
        await collection.insert_many([
            {"_id": "and1", "status": "active", "age": 30},
            {"_id": "and2", "status": "active", "age": 20},
            {"_id": "and3", "status": "inactive", "age": 30},
        ])

        docs = await collection.find({
            "$and": [
                {"status": "active"},
                {"age": {"$gte": 25}}
            ]
        }).to_list()

        assert len(docs) == 1
        assert docs[0]["_id"] == "and1"

    async def test_or_operator(self, collection):
        """Test $or operator."""
        await collection.insert_many([
            {"_id": "or1", "status": "active"},
            {"_id": "or2", "status": "pending"},
            {"_id": "or3", "status": "inactive"},
        ])

        docs = await collection.find({
            "$or": [
                {"status": "active"},
                {"status": "pending"}
            ]
        }).to_list()

        assert len(docs) == 2


class TestCollectionMethods:
    """Tests for other collection methods."""

    async def test_count_documents(self, collection):
        """Test count_documents method."""
        await collection.insert_many([
            {"_id": "cd1", "status": "active"},
            {"_id": "cd2", "status": "active"},
            {"_id": "cd3", "status": "inactive"},
        ])

        count = await collection.count_documents({"status": "active"})
        assert count == 2

        count = await collection.count_documents({})
        assert count == 3

    async def test_estimated_document_count(self, collection):
        """Test estimated_document_count method."""
        await collection.insert_many([
            {"_id": f"edc-{i}"} for i in range(10)
        ])

        count = await collection.estimated_document_count()
        assert count == 10

    async def test_distinct(self, collection):
        """Test distinct method."""
        await collection.insert_many([
            {"_id": "dist1", "category": "A"},
            {"_id": "dist2", "category": "B"},
            {"_id": "dist3", "category": "A"},
            {"_id": "dist4", "category": "C"},
        ])

        values = await collection.distinct("category")
        assert set(values) == {"A", "B", "C"}

    async def test_distinct_with_filter(self, collection):
        """Test distinct with filter."""
        await collection.insert_many([
            {"_id": "df1", "category": "A", "active": True},
            {"_id": "df2", "category": "B", "active": False},
            {"_id": "df3", "category": "A", "active": True},
        ])

        values = await collection.distinct("category", {"active": True})
        assert set(values) == {"A"}

    async def test_aggregate(self, collection):
        """Test aggregate method."""
        await collection.insert_many([
            {"_id": "agg1", "amount": 100},
            {"_id": "agg2", "amount": 200},
        ])

        results = await collection.aggregate([
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ])

        # Our mock just returns the documents
        assert isinstance(results, list)

    async def test_create_index(self, collection):
        """Test create_index method."""
        name = await collection.create_index("email", unique=True)
        assert "email" in name

    async def test_create_index_compound(self, collection):
        """Test create_index with compound keys."""
        name = await collection.create_index([("name", 1), ("age", -1)])
        assert "name" in name
        assert "age" in name

    async def test_drop_index(self, collection):
        """Test drop_index method."""
        await collection.drop_index("email_1")  # Should not raise

    async def test_drop_collection(self, collection, mock_rpc):
        """Test drop method."""
        mock_rpc.mongo._data["testdb"] = {"testcollection": [{"_id": "1"}]}

        await collection.drop()

        assert "testcollection" not in mock_rpc.mongo._data.get("testdb", {})


class TestErrorHandling:
    """Tests for error handling."""

    async def test_insert_write_error(self, collection, mock_rpc, monkeypatch):
        """Test WriteError on insert failure."""
        from mongo_do import WriteError

        # Make insertOne raise an error
        async def failing_insert(*args):
            raise Exception("Database error")

        monkeypatch.setattr(mock_rpc.mongo, "insertOne", failing_insert)

        with pytest.raises(WriteError):
            await collection.insert_one({"name": "Test"})

    async def test_insert_many_error(self, collection, mock_rpc, monkeypatch):
        """Test WriteError on insert_many failure."""
        from mongo_do import WriteError

        async def failing_insert(*args):
            return {"error": True, "message": "Bulk insert failed"}

        monkeypatch.setattr(mock_rpc.mongo, "insertMany", failing_insert)

        with pytest.raises(WriteError):
            await collection.insert_many([{"name": "Test"}])

    async def test_update_error(self, collection, mock_rpc, monkeypatch):
        """Test WriteError on update failure."""
        from mongo_do import WriteError

        async def failing_update(*args):
            return {"error": True, "message": "Update failed"}

        monkeypatch.setattr(mock_rpc.mongo, "updateOne", failing_update)

        with pytest.raises(WriteError):
            await collection.update_one({}, {"$set": {"name": "Test"}})

    async def test_update_many_error(self, collection, mock_rpc, monkeypatch):
        """Test WriteError on update_many failure."""
        from mongo_do import WriteError

        async def failing_update(*args):
            return {"error": True, "message": "Update failed"}

        monkeypatch.setattr(mock_rpc.mongo, "updateMany", failing_update)

        with pytest.raises(WriteError):
            await collection.update_many({}, {"$set": {"name": "Test"}})

    async def test_replace_error(self, collection, mock_rpc, monkeypatch):
        """Test WriteError on replace failure."""
        from mongo_do import WriteError

        async def failing_replace(*args):
            return {"error": True, "message": "Replace failed"}

        monkeypatch.setattr(mock_rpc.mongo, "replaceOne", failing_replace)

        with pytest.raises(WriteError):
            await collection.replace_one({}, {"name": "New"})

    async def test_delete_error(self, collection, mock_rpc, monkeypatch):
        """Test WriteError on delete failure."""
        from mongo_do import WriteError

        async def failing_delete(*args):
            return {"error": True, "message": "Delete failed"}

        monkeypatch.setattr(mock_rpc.mongo, "deleteOne", failing_delete)

        with pytest.raises(WriteError):
            await collection.delete_one({})

    async def test_delete_many_error(self, collection, mock_rpc, monkeypatch):
        """Test WriteError on delete_many failure."""
        from mongo_do import WriteError

        async def failing_delete(*args):
            return {"error": True, "message": "Delete failed"}

        monkeypatch.setattr(mock_rpc.mongo, "deleteMany", failing_delete)

        with pytest.raises(WriteError):
            await collection.delete_many({})

    async def test_find_one_error_result(self, collection, mock_rpc, monkeypatch):
        """Test find_one returns None on error result."""
        async def error_find(*args):
            return {"error": True, "message": "Find failed"}

        monkeypatch.setattr(mock_rpc.mongo, "findOne", error_find)

        doc = await collection.find_one({})
        assert doc is None


class TestCursorEdgeCases:
    """Tests for cursor edge cases."""

    async def test_cursor_projection_list(self, collection, mock_rpc):
        """Test cursor with list projection via constructor."""
        await collection.insert_one({"_id": "pl-1", "name": "Alice", "age": 30})

        cursor = collection.find({}, projection=["name"])
        docs = await cursor.to_list()
        assert len(docs) == 1
        assert "name" in docs[0]

    async def test_cursor_execute_caches_results(self, collection, mock_rpc):
        """Test that cursor caches results after first execute."""
        await collection.insert_one({"_id": "cache-1", "name": "Test"})

        cursor = collection.find({})
        # First call executes
        docs1 = await cursor.to_list()
        # Second call uses cache
        docs2 = await cursor.to_list()

        assert docs1 == docs2

    async def test_cursor_find_non_list_result(self, collection, mock_rpc, monkeypatch):
        """Test cursor when find returns non-list."""

        async def non_list_find(*args):
            return None  # Non-list result

        monkeypatch.setattr(mock_rpc.mongo, "find", non_list_find)

        docs = await collection.find({}).to_list()
        assert docs == []

    async def test_cursor_count_non_int_result(self, collection, mock_rpc, monkeypatch):
        """Test cursor count when RPC returns non-int."""

        async def non_int_count(*args):
            return None  # Non-int result

        monkeypatch.setattr(mock_rpc.mongo, "countDocuments", non_int_count)

        cursor = collection.find({})
        count = await cursor.count()
        assert count == 0

    async def test_cursor_distinct_non_list_result(self, collection, mock_rpc, monkeypatch):
        """Test cursor distinct when RPC returns non-list."""

        async def non_list_distinct(*args):
            return None  # Non-list result

        monkeypatch.setattr(mock_rpc.mongo, "distinct", non_list_distinct)

        cursor = collection.find({})
        values = await cursor.distinct("field")
        assert values == []


class TestEdgeCases:
    """Tests for edge cases and non-dict RPC responses."""

    async def test_insert_one_non_dict_result(self, collection, mock_rpc, monkeypatch):
        """Test insert_one when RPC returns non-dict."""

        async def non_dict_insert(*args):
            return None  # Non-dict result

        monkeypatch.setattr(mock_rpc.mongo, "insertOne", non_dict_insert)

        result = await collection.insert_one({"_id": "test-id", "name": "Test"})
        assert result.inserted_id == "test-id"

    async def test_insert_one_generic_write_error(self, collection, mock_rpc, monkeypatch):
        """Test insert_one non-duplicate write error."""
        from mongo_do import WriteError

        async def error_insert(*args):
            return {"error": True, "message": "Generic error"}

        monkeypatch.setattr(mock_rpc.mongo, "insertOne", error_insert)

        with pytest.raises(WriteError) as exc_info:
            await collection.insert_one({"name": "Test"})
        assert "Generic error" in str(exc_info.value)

    async def test_insert_many_non_dict_result(self, collection, mock_rpc, monkeypatch):
        """Test insert_many when RPC returns non-dict."""

        async def non_dict_insert(*args):
            return None  # Non-dict result

        monkeypatch.setattr(mock_rpc.mongo, "insertMany", non_dict_insert)

        docs = [{"_id": "id1"}, {"_id": "id2"}]
        result = await collection.insert_many(docs)
        assert result.inserted_ids == ["id1", "id2"]

    async def test_insert_many_exception(self, collection, mock_rpc, monkeypatch):
        """Test insert_many raises WriteError on exception."""
        from mongo_do import WriteError

        async def failing_insert(*args):
            raise RuntimeError("Unexpected error")

        monkeypatch.setattr(mock_rpc.mongo, "insertMany", failing_insert)

        with pytest.raises(WriteError):
            await collection.insert_many([{"name": "Test"}])

    async def test_update_one_non_dict_result(self, collection, mock_rpc, monkeypatch):
        """Test update_one when RPC returns non-dict."""

        async def non_dict_update(*args):
            return None  # Non-dict result

        monkeypatch.setattr(mock_rpc.mongo, "updateOne", non_dict_update)

        result = await collection.update_one({}, {"$set": {"name": "Test"}})
        assert result.matched_count == 0
        assert result.modified_count == 0

    async def test_update_one_exception(self, collection, mock_rpc, monkeypatch):
        """Test update_one raises WriteError on exception."""
        from mongo_do import WriteError

        async def failing_update(*args):
            raise RuntimeError("Unexpected error")

        monkeypatch.setattr(mock_rpc.mongo, "updateOne", failing_update)

        with pytest.raises(WriteError):
            await collection.update_one({}, {"$set": {"name": "Test"}})

    async def test_update_many_non_dict_result(self, collection, mock_rpc, monkeypatch):
        """Test update_many when RPC returns non-dict."""

        async def non_dict_update(*args):
            return None  # Non-dict result

        monkeypatch.setattr(mock_rpc.mongo, "updateMany", non_dict_update)

        result = await collection.update_many({}, {"$set": {"name": "Test"}})
        assert result.matched_count == 0
        assert result.modified_count == 0

    async def test_update_many_exception(self, collection, mock_rpc, monkeypatch):
        """Test update_many raises WriteError on exception."""
        from mongo_do import WriteError

        async def failing_update(*args):
            raise RuntimeError("Unexpected error")

        monkeypatch.setattr(mock_rpc.mongo, "updateMany", failing_update)

        with pytest.raises(WriteError):
            await collection.update_many({}, {"$set": {"name": "Test"}})

    async def test_replace_one_non_dict_result(self, collection, mock_rpc, monkeypatch):
        """Test replace_one when RPC returns non-dict."""

        async def non_dict_replace(*args):
            return None  # Non-dict result

        monkeypatch.setattr(mock_rpc.mongo, "replaceOne", non_dict_replace)

        result = await collection.replace_one({}, {"name": "Test"})
        assert result.matched_count == 0
        assert result.modified_count == 0

    async def test_replace_one_exception(self, collection, mock_rpc, monkeypatch):
        """Test replace_one raises WriteError on exception."""
        from mongo_do import WriteError

        async def failing_replace(*args):
            raise RuntimeError("Unexpected error")

        monkeypatch.setattr(mock_rpc.mongo, "replaceOne", failing_replace)

        with pytest.raises(WriteError):
            await collection.replace_one({}, {"name": "Test"})

    async def test_delete_one_non_dict_result(self, collection, mock_rpc, monkeypatch):
        """Test delete_one when RPC returns non-dict."""

        async def non_dict_delete(*args):
            return None  # Non-dict result

        monkeypatch.setattr(mock_rpc.mongo, "deleteOne", non_dict_delete)

        result = await collection.delete_one({})
        assert result.deleted_count == 0

    async def test_delete_one_exception(self, collection, mock_rpc, monkeypatch):
        """Test delete_one raises WriteError on exception."""
        from mongo_do import WriteError

        async def failing_delete(*args):
            raise RuntimeError("Unexpected error")

        monkeypatch.setattr(mock_rpc.mongo, "deleteOne", failing_delete)

        with pytest.raises(WriteError):
            await collection.delete_one({})

    async def test_delete_many_non_dict_result(self, collection, mock_rpc, monkeypatch):
        """Test delete_many when RPC returns non-dict."""

        async def non_dict_delete(*args):
            return None  # Non-dict result

        monkeypatch.setattr(mock_rpc.mongo, "deleteMany", non_dict_delete)

        result = await collection.delete_many({})
        assert result.deleted_count == 0

    async def test_delete_many_exception(self, collection, mock_rpc, monkeypatch):
        """Test delete_many raises WriteError on exception."""
        from mongo_do import WriteError

        async def failing_delete(*args):
            raise RuntimeError("Unexpected error")

        monkeypatch.setattr(mock_rpc.mongo, "deleteMany", failing_delete)

        with pytest.raises(WriteError):
            await collection.delete_many({})

    async def test_count_documents_non_int_result(self, collection, mock_rpc, monkeypatch):
        """Test count_documents when RPC returns non-int."""

        async def non_int_count(*args):
            return None  # Non-int result

        monkeypatch.setattr(mock_rpc.mongo, "countDocuments", non_int_count)

        count = await collection.count_documents({})
        assert count == 0

    async def test_estimated_document_count_non_int(self, collection, mock_rpc, monkeypatch):
        """Test estimated_document_count when RPC returns non-int."""

        async def non_int_count(*args):
            return None  # Non-int result

        monkeypatch.setattr(mock_rpc.mongo, "estimatedDocumentCount", non_int_count)

        count = await collection.estimated_document_count()
        assert count == 0

    async def test_distinct_non_list_result(self, collection, mock_rpc, monkeypatch):
        """Test distinct when RPC returns non-list."""

        async def non_list_distinct(*args):
            return None  # Non-list result

        monkeypatch.setattr(mock_rpc.mongo, "distinct", non_list_distinct)

        values = await collection.distinct("field")
        assert values == []

    async def test_aggregate_non_list_result(self, collection, mock_rpc, monkeypatch):
        """Test aggregate when RPC returns non-list."""

        async def non_list_aggregate(*args):
            return None  # Non-list result

        monkeypatch.setattr(mock_rpc.mongo, "aggregate", non_list_aggregate)

        results = await collection.aggregate([])
        assert results == []

    async def test_create_index_non_str_result(self, collection, mock_rpc, monkeypatch):
        """Test create_index when RPC returns non-str."""

        async def non_str_create(*args):
            return None  # Non-str result

        monkeypatch.setattr(mock_rpc.mongo, "createIndex", non_str_create)

        name = await collection.create_index("field")
        assert name == ""


class TestTypes:
    """Tests for type definitions."""

    def test_insert_one_result(self):
        """Test InsertOneResult."""
        from mongo_do import InsertOneResult

        result = InsertOneResult(inserted_id="test-id")
        assert result.inserted_id == "test-id"
        assert result.acknowledged is True

    def test_insert_many_result(self):
        """Test InsertManyResult."""
        from mongo_do import InsertManyResult

        result = InsertManyResult(inserted_ids=["id1", "id2"])
        assert result.inserted_ids == ["id1", "id2"]
        assert result.acknowledged is True

    def test_update_result(self):
        """Test UpdateResult."""
        from mongo_do import UpdateResult

        result = UpdateResult(matched_count=1, modified_count=1)
        assert result.matched_count == 1
        assert result.modified_count == 1
        assert result.raw_result["n"] == 1
        assert result.raw_result["nModified"] == 1

    def test_delete_result(self):
        """Test DeleteResult."""
        from mongo_do import DeleteResult

        result = DeleteResult(deleted_count=5)
        assert result.deleted_count == 5
        assert result.raw_result["n"] == 5

    def test_bulk_write_result(self):
        """Test BulkWriteResult."""
        from mongo_do import BulkWriteResult

        result = BulkWriteResult(
            inserted_count=1,
            matched_count=2,
            modified_count=2,
            deleted_count=1,
        )
        assert result.inserted_count == 1
        assert result.matched_count == 2

    def test_mongo_error(self):
        """Test MongoError."""
        from mongo_do import MongoError

        error = MongoError("Test error", code=123)
        assert str(error) == "Test error"
        assert error.code == 123

    def test_query_error(self):
        """Test QueryError."""
        from mongo_do import QueryError

        error = QueryError("Invalid query", code=100, suggestion="Check syntax")
        assert error.message == "Invalid query"
        assert error.suggestion == "Check syntax"
