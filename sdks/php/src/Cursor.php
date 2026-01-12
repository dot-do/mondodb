<?php

declare(strict_types=1);

namespace MongoDo;

use Iterator;
use Countable;
use Generator;

/**
 * Cursor - Iterable cursor for find results.
 *
 * Provides a chainable, iterable interface for MongoDB query results.
 * Supports both foreach iteration and generator-based consumption.
 *
 * @template TDocument of array
 * @implements Iterator<int, TDocument>
 */
class Cursor implements Iterator, Countable
{
    private RpcTransport $transport;
    private string $dbName;
    private string $collName;
    private array $filter;
    private array $options;

    /** @var array<TDocument>|null */
    private ?array $results = null;
    private int $position = 0;

    /**
     * Create a new Cursor.
     */
    public function __construct(
        RpcTransport $transport,
        string $dbName,
        string $collName,
        array $filter = [],
        array $options = []
    ) {
        $this->transport = $transport;
        $this->dbName = $dbName;
        $this->collName = $collName;
        $this->filter = $filter;
        $this->options = $options;
    }

    /**
     * Set sort order.
     *
     * @param array $sort Sort specification (e.g., ['name' => 1, 'age' => -1])
     * @return $this
     */
    public function sort(array $sort): self
    {
        $this->ensureNotExecuted();
        $this->options['sort'] = $sort;
        return $this;
    }

    /**
     * Limit results.
     *
     * @param int $limit Maximum number of documents
     * @return $this
     */
    public function limit(int $limit): self
    {
        $this->ensureNotExecuted();
        $this->options['limit'] = $limit;
        return $this;
    }

    /**
     * Skip documents.
     *
     * @param int $skip Number of documents to skip
     * @return $this
     */
    public function skip(int $skip): self
    {
        $this->ensureNotExecuted();
        $this->options['skip'] = $skip;
        return $this;
    }

    /**
     * Project fields.
     *
     * @param array $projection Projection specification
     * @return $this
     */
    public function project(array $projection): self
    {
        $this->ensureNotExecuted();
        $this->options['projection'] = $projection;
        return $this;
    }

    /**
     * Set batch size.
     *
     * @param int $batchSize Number of documents per batch
     * @return $this
     */
    public function batchSize(int $batchSize): self
    {
        $this->ensureNotExecuted();
        $this->options['batchSize'] = $batchSize;
        return $this;
    }

    /**
     * Set max time for the query.
     *
     * @param int $maxTimeMS Maximum execution time in milliseconds
     * @return $this
     */
    public function maxTimeMS(int $maxTimeMS): self
    {
        $this->ensureNotExecuted();
        $this->options['maxTimeMS'] = $maxTimeMS;
        return $this;
    }

    /**
     * Set index hint.
     *
     * @param string|array $hint Index hint
     * @return $this
     */
    public function hint(string|array $hint): self
    {
        $this->ensureNotExecuted();
        $this->options['hint'] = $hint;
        return $this;
    }

    /**
     * Add a comment to the query.
     *
     * @param string $comment Query comment
     * @return $this
     */
    public function comment(string $comment): self
    {
        $this->ensureNotExecuted();
        $this->options['comment'] = $comment;
        return $this;
    }

    /**
     * Convert cursor to array.
     *
     * @return array<TDocument>
     */
    public function toArray(): array
    {
        $this->execute();
        return $this->results;
    }

    /**
     * Get all documents (alias for toArray).
     *
     * @return array<TDocument>
     */
    public function all(): array
    {
        return $this->toArray();
    }

    /**
     * Get the first document.
     *
     * @return TDocument|null
     */
    public function first(): ?array
    {
        $this->execute();
        return $this->results[0] ?? null;
    }

    /**
     * Get the next document.
     *
     * @return TDocument|null
     */
    public function next(): mixed
    {
        $this->execute();
        $this->position++;
        return $this->results[$this->position] ?? null;
    }

    /**
     * Iterate as a generator (memory efficient).
     *
     * @return Generator<int, TDocument>
     */
    public function iterate(): Generator
    {
        $this->execute();
        foreach ($this->results as $index => $doc) {
            yield $index => $doc;
        }
    }

    /**
     * Execute a callback for each document.
     *
     * @param callable(TDocument, int): void $callback
     */
    public function each(callable $callback): void
    {
        $this->execute();
        foreach ($this->results as $index => $doc) {
            $callback($doc, $index);
        }
    }

    /**
     * Map documents to new values.
     *
     * @template U
     * @param callable(TDocument, int): U $callback
     * @return array<U>
     */
    public function map(callable $callback): array
    {
        $this->execute();
        return array_map($callback, $this->results, array_keys($this->results));
    }

    /**
     * Filter documents.
     *
     * @param callable(TDocument, int): bool $callback
     * @return array<TDocument>
     */
    public function filter(callable $callback): array
    {
        $this->execute();
        return array_values(array_filter($this->results, $callback, ARRAY_FILTER_USE_BOTH));
    }

    // =========================================================================
    // Iterator Implementation
    // =========================================================================

    /**
     * {@inheritdoc}
     */
    public function current(): mixed
    {
        $this->execute();
        return $this->results[$this->position] ?? null;
    }

    /**
     * {@inheritdoc}
     */
    public function key(): int
    {
        return $this->position;
    }

    /**
     * {@inheritdoc}
     */
    public function valid(): bool
    {
        $this->execute();
        return isset($this->results[$this->position]);
    }

    /**
     * {@inheritdoc}
     */
    public function rewind(): void
    {
        $this->position = 0;
    }

    // =========================================================================
    // Countable Implementation
    // =========================================================================

    /**
     * {@inheritdoc}
     */
    public function count(): int
    {
        $this->execute();
        return count($this->results);
    }

    // =========================================================================
    // Private Methods
    // =========================================================================

    /**
     * Execute the query if not already executed.
     */
    private function execute(): void
    {
        if ($this->results === null) {
            $this->results = $this->transport->call(
                'find',
                $this->dbName,
                $this->collName,
                $this->filter,
                $this->options
            );
        }
    }

    /**
     * Ensure the cursor hasn't been executed yet.
     *
     * @throws \RuntimeException
     */
    private function ensureNotExecuted(): void
    {
        if ($this->results !== null) {
            throw new \RuntimeException('Cannot modify cursor after execution');
        }
    }
}
