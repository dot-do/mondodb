<?php

declare(strict_types=1);

namespace MongoDo;

/**
 * InsertOneResult - Result of an insertOne operation.
 */
readonly class InsertOneResult
{
    public function __construct(
        public string|int $insertedId,
        public bool $acknowledged = true,
    ) {}

    /**
     * Get the inserted document ID.
     */
    public function getInsertedId(): string|int
    {
        return $this->insertedId;
    }

    /**
     * Check if the write was acknowledged.
     */
    public function isAcknowledged(): bool
    {
        return $this->acknowledged;
    }
}

/**
 * InsertManyResult - Result of an insertMany operation.
 */
readonly class InsertManyResult
{
    /**
     * @param array<int, string|int> $insertedIds
     */
    public function __construct(
        public array $insertedIds,
        public int $insertedCount,
        public bool $acknowledged = true,
    ) {}

    /**
     * Get the inserted document IDs.
     *
     * @return array<int, string|int>
     */
    public function getInsertedIds(): array
    {
        return $this->insertedIds;
    }

    /**
     * Get the count of inserted documents.
     */
    public function getInsertedCount(): int
    {
        return $this->insertedCount;
    }

    /**
     * Check if the write was acknowledged.
     */
    public function isAcknowledged(): bool
    {
        return $this->acknowledged;
    }
}

/**
 * UpdateResult - Result of an update/replace operation.
 */
readonly class UpdateResult
{
    public function __construct(
        public int $matchedCount = 0,
        public int $modifiedCount = 0,
        public string|int|null $upsertedId = null,
        public bool $acknowledged = true,
    ) {}

    /**
     * Get the count of matched documents.
     */
    public function getMatchedCount(): int
    {
        return $this->matchedCount;
    }

    /**
     * Get the count of modified documents.
     */
    public function getModifiedCount(): int
    {
        return $this->modifiedCount;
    }

    /**
     * Get the upserted document ID, if any.
     */
    public function getUpsertedId(): string|int|null
    {
        return $this->upsertedId;
    }

    /**
     * Check if the write was acknowledged.
     */
    public function isAcknowledged(): bool
    {
        return $this->acknowledged;
    }

    /**
     * Check if a document was upserted.
     */
    public function wasUpserted(): bool
    {
        return $this->upsertedId !== null;
    }
}

/**
 * DeleteResult - Result of a delete operation.
 */
readonly class DeleteResult
{
    public function __construct(
        public int $deletedCount = 0,
        public bool $acknowledged = true,
    ) {}

    /**
     * Get the count of deleted documents.
     */
    public function getDeletedCount(): int
    {
        return $this->deletedCount;
    }

    /**
     * Check if the write was acknowledged.
     */
    public function isAcknowledged(): bool
    {
        return $this->acknowledged;
    }
}

/**
 * BulkWriteResult - Result of a bulk write operation.
 */
readonly class BulkWriteResult
{
    /**
     * @param array<int, string|int> $upsertedIds
     */
    public function __construct(
        public int $insertedCount = 0,
        public int $matchedCount = 0,
        public int $modifiedCount = 0,
        public int $deletedCount = 0,
        public int $upsertedCount = 0,
        public array $upsertedIds = [],
        public bool $acknowledged = true,
    ) {}

    /**
     * Get the count of inserted documents.
     */
    public function getInsertedCount(): int
    {
        return $this->insertedCount;
    }

    /**
     * Get the count of matched documents.
     */
    public function getMatchedCount(): int
    {
        return $this->matchedCount;
    }

    /**
     * Get the count of modified documents.
     */
    public function getModifiedCount(): int
    {
        return $this->modifiedCount;
    }

    /**
     * Get the count of deleted documents.
     */
    public function getDeletedCount(): int
    {
        return $this->deletedCount;
    }

    /**
     * Get the count of upserted documents.
     */
    public function getUpsertedCount(): int
    {
        return $this->upsertedCount;
    }

    /**
     * Get the upserted document IDs.
     *
     * @return array<int, string|int>
     */
    public function getUpsertedIds(): array
    {
        return $this->upsertedIds;
    }

    /**
     * Check if the write was acknowledged.
     */
    public function isAcknowledged(): bool
    {
        return $this->acknowledged;
    }
}
