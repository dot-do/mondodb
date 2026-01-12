<?php

declare(strict_types=1);

namespace MongoDo;

use MongoDo\Exception\WriteException;
use Generator;

/**
 * Collection - MongoDB collection operations.
 *
 * Provides CRUD operations on a MongoDB collection with
 * a PyMongo/MongoDB PHP Driver compatible API.
 *
 * @template TDocument of array
 */
class Collection
{
    private RpcTransport $transport;
    private string $dbName;
    private string $name;

    /**
     * Create a new Collection instance.
     */
    public function __construct(RpcTransport $transport, string $dbName, string $name)
    {
        $this->transport = $transport;
        $this->dbName = $dbName;
        $this->name = $name;
    }

    /**
     * Get the collection name.
     */
    public function getCollectionName(): string
    {
        return $this->name;
    }

    /**
     * Get the database name.
     */
    public function getDatabaseName(): string
    {
        return $this->dbName;
    }

    /**
     * Get the namespace (db.collection).
     */
    public function getNamespace(): string
    {
        return "{$this->dbName}.{$this->name}";
    }

    // =========================================================================
    // Insert Operations
    // =========================================================================

    /**
     * Insert a single document.
     *
     * @param array $document The document to insert
     * @return InsertOneResult
     * @throws WriteException
     */
    public function insertOne(array $document): InsertOneResult
    {
        if (!isset($document['_id'])) {
            $document['_id'] = $this->generateId();
        }

        $result = $this->transport->call('insertOne', $this->dbName, $this->name, $document);

        if (isset($result['error'])) {
            throw new WriteException($result['message'] ?? 'Insert failed');
        }

        return new InsertOneResult(
            $result['insertedId'] ?? $document['_id'],
            $result['acknowledged'] ?? true
        );
    }

    /**
     * Insert multiple documents.
     *
     * @param array<array> $documents The documents to insert
     * @param array $options Insert options (ordered)
     * @return InsertManyResult
     * @throws WriteException
     */
    public function insertMany(array $documents, array $options = []): InsertManyResult
    {
        foreach ($documents as &$doc) {
            if (!isset($doc['_id'])) {
                $doc['_id'] = $this->generateId();
            }
        }
        unset($doc);

        $result = $this->transport->call('insertMany', $this->dbName, $this->name, $documents, $options);

        if (isset($result['error'])) {
            throw new WriteException($result['message'] ?? 'Insert failed');
        }

        return new InsertManyResult(
            $result['insertedIds'] ?? array_column($documents, '_id'),
            $result['insertedCount'] ?? count($documents),
            $result['acknowledged'] ?? true
        );
    }

    // =========================================================================
    // Find Operations
    // =========================================================================

    /**
     * Find documents matching a filter - returns a Cursor.
     *
     * @param array $filter Query filter
     * @param array $options Find options (sort, limit, skip, projection)
     * @return Cursor
     */
    public function find(array $filter = [], array $options = []): Cursor
    {
        return new Cursor($this->transport, $this->dbName, $this->name, $filter, $options);
    }

    /**
     * Find a single document.
     *
     * @param array $filter Query filter
     * @param array $options Find options
     * @return array|null
     */
    public function findOne(array $filter = [], array $options = []): ?array
    {
        $result = $this->transport->call('findOne', $this->dbName, $this->name, $filter, $options);
        return $result;
    }

    /**
     * Find a document and update it atomically.
     *
     * @param array $filter Query filter
     * @param array $update Update operations
     * @param array $options Options (returnDocument, upsert)
     * @return array|null
     */
    public function findOneAndUpdate(array $filter, array $update, array $options = []): ?array
    {
        return $this->transport->call('findOneAndUpdate', $this->dbName, $this->name, $filter, $update, $options);
    }

    /**
     * Find a document and delete it atomically.
     *
     * @param array $filter Query filter
     * @return array|null The deleted document
     */
    public function findOneAndDelete(array $filter): ?array
    {
        return $this->transport->call('findOneAndDelete', $this->dbName, $this->name, $filter);
    }

    /**
     * Find a document and replace it atomically.
     *
     * @param array $filter Query filter
     * @param array $replacement The replacement document
     * @param array $options Options (returnDocument, upsert)
     * @return array|null
     */
    public function findOneAndReplace(array $filter, array $replacement, array $options = []): ?array
    {
        return $this->transport->call('findOneAndReplace', $this->dbName, $this->name, $filter, $replacement, $options);
    }

    // =========================================================================
    // Update Operations
    // =========================================================================

    /**
     * Update a single document.
     *
     * @param array $filter Query filter
     * @param array $update Update operations ($set, $unset, $inc, etc.)
     * @param array $options Update options (upsert)
     * @return UpdateResult
     * @throws WriteException
     */
    public function updateOne(array $filter, array $update, array $options = []): UpdateResult
    {
        $result = $this->transport->call('updateOne', $this->dbName, $this->name, $filter, $update, $options);

        if (isset($result['error'])) {
            throw new WriteException($result['message'] ?? 'Update failed');
        }

        return new UpdateResult(
            $result['matchedCount'] ?? 0,
            $result['modifiedCount'] ?? 0,
            $result['upsertedId'] ?? null,
            $result['acknowledged'] ?? true
        );
    }

    /**
     * Update multiple documents.
     *
     * @param array $filter Query filter
     * @param array $update Update operations
     * @param array $options Update options
     * @return UpdateResult
     * @throws WriteException
     */
    public function updateMany(array $filter, array $update, array $options = []): UpdateResult
    {
        $result = $this->transport->call('updateMany', $this->dbName, $this->name, $filter, $update, $options);

        if (isset($result['error'])) {
            throw new WriteException($result['message'] ?? 'Update failed');
        }

        return new UpdateResult(
            $result['matchedCount'] ?? 0,
            $result['modifiedCount'] ?? 0,
            $result['upsertedId'] ?? null,
            $result['acknowledged'] ?? true
        );
    }

    /**
     * Replace a single document.
     *
     * @param array $filter Query filter
     * @param array $replacement The replacement document
     * @param array $options Replace options
     * @return UpdateResult
     * @throws WriteException
     */
    public function replaceOne(array $filter, array $replacement, array $options = []): UpdateResult
    {
        $result = $this->transport->call('replaceOne', $this->dbName, $this->name, $filter, $replacement, $options);

        if (isset($result['error'])) {
            throw new WriteException($result['message'] ?? 'Replace failed');
        }

        return new UpdateResult(
            $result['matchedCount'] ?? 0,
            $result['modifiedCount'] ?? 0,
            $result['upsertedId'] ?? null,
            $result['acknowledged'] ?? true
        );
    }

    // =========================================================================
    // Delete Operations
    // =========================================================================

    /**
     * Delete a single document.
     *
     * @param array $filter Query filter
     * @return DeleteResult
     * @throws WriteException
     */
    public function deleteOne(array $filter): DeleteResult
    {
        $result = $this->transport->call('deleteOne', $this->dbName, $this->name, $filter);

        if (isset($result['error'])) {
            throw new WriteException($result['message'] ?? 'Delete failed');
        }

        return new DeleteResult(
            $result['deletedCount'] ?? 0,
            $result['acknowledged'] ?? true
        );
    }

    /**
     * Delete multiple documents.
     *
     * @param array $filter Query filter
     * @return DeleteResult
     * @throws WriteException
     */
    public function deleteMany(array $filter): DeleteResult
    {
        $result = $this->transport->call('deleteMany', $this->dbName, $this->name, $filter);

        if (isset($result['error'])) {
            throw new WriteException($result['message'] ?? 'Delete failed');
        }

        return new DeleteResult(
            $result['deletedCount'] ?? 0,
            $result['acknowledged'] ?? true
        );
    }

    // =========================================================================
    // Count Operations
    // =========================================================================

    /**
     * Count documents matching a filter.
     *
     * @param array $filter Query filter
     * @param array $options Count options
     * @return int
     */
    public function countDocuments(array $filter = [], array $options = []): int
    {
        return (int) $this->transport->call('countDocuments', $this->dbName, $this->name, $filter, $options);
    }

    /**
     * Get an estimated document count.
     *
     * @return int
     */
    public function estimatedDocumentCount(): int
    {
        return (int) $this->transport->call('estimatedDocumentCount', $this->dbName, $this->name);
    }

    // =========================================================================
    // Aggregation Operations
    // =========================================================================

    /**
     * Run an aggregation pipeline.
     *
     * @param array $pipeline Aggregation pipeline stages
     * @param array $options Aggregation options
     * @return array
     */
    public function aggregate(array $pipeline, array $options = []): array
    {
        return $this->transport->call('aggregate', $this->dbName, $this->name, $pipeline, $options);
    }

    /**
     * Get distinct values for a field.
     *
     * @param string $field Field name
     * @param array $filter Query filter
     * @return array
     */
    public function distinct(string $field, array $filter = []): array
    {
        return $this->transport->call('distinct', $this->dbName, $this->name, $field, $filter);
    }

    // =========================================================================
    // Index Operations
    // =========================================================================

    /**
     * Create an index.
     *
     * @param array $keys Index keys
     * @param array $options Index options
     * @return string Index name
     */
    public function createIndex(array $keys, array $options = []): string
    {
        return $this->transport->call('createIndex', $this->dbName, $this->name, $keys, $options);
    }

    /**
     * Create multiple indexes.
     *
     * @param array $indexes Array of index specifications
     * @return array<string> Index names
     */
    public function createIndexes(array $indexes): array
    {
        return $this->transport->call('createIndexes', $this->dbName, $this->name, $indexes);
    }

    /**
     * Drop an index.
     *
     * @param string $indexName Index name
     */
    public function dropIndex(string $indexName): void
    {
        $this->transport->call('dropIndex', $this->dbName, $this->name, $indexName);
    }

    /**
     * Drop all indexes.
     */
    public function dropIndexes(): void
    {
        $this->transport->call('dropIndexes', $this->dbName, $this->name);
    }

    /**
     * List all indexes.
     *
     * @return array
     */
    public function listIndexes(): array
    {
        return $this->transport->call('listIndexes', $this->dbName, $this->name);
    }

    // =========================================================================
    // Collection Operations
    // =========================================================================

    /**
     * Drop the collection.
     *
     * @return bool
     */
    public function drop(): bool
    {
        return (bool) $this->transport->call('dropCollection', $this->dbName, $this->name);
    }

    /**
     * Rename the collection.
     *
     * @param string $newName New collection name
     * @param array $options Rename options
     */
    public function rename(string $newName, array $options = []): void
    {
        $this->transport->call('renameCollection', $this->dbName, $this->name, $newName, $options);
        $this->name = $newName;
    }

    // =========================================================================
    // Bulk Operations
    // =========================================================================

    /**
     * Perform bulk write operations.
     *
     * @param array $operations Array of operations
     * @param array $options Bulk options
     * @return BulkWriteResult
     */
    public function bulkWrite(array $operations, array $options = []): BulkWriteResult
    {
        $result = $this->transport->call('bulkWrite', $this->dbName, $this->name, $operations, $options);

        return new BulkWriteResult(
            $result['insertedCount'] ?? 0,
            $result['matchedCount'] ?? 0,
            $result['modifiedCount'] ?? 0,
            $result['deletedCount'] ?? 0,
            $result['upsertedCount'] ?? 0,
            $result['upsertedIds'] ?? [],
            $result['acknowledged'] ?? true
        );
    }

    // =========================================================================
    // Private Helpers
    // =========================================================================

    /**
     * Generate a unique document ID.
     */
    private function generateId(): string
    {
        return bin2hex(random_bytes(12));
    }
}
