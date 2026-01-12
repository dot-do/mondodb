<?php

declare(strict_types=1);

namespace MongoDo;

use MongoDo\Exception\TransportException;

/**
 * MockRpcTransport - In-memory mock transport for testing.
 *
 * Implements a full in-memory MongoDB-like document store for testing
 * without requiring an actual RPC connection.
 */
class MockRpcTransport implements RpcTransport
{
    /** @var array<string, array<string, array<array<string, mixed>>>> */
    private array $data = [];

    private int $nextId = 1;
    private bool $closed = false;

    /** @var array<array{method: string, args: array<mixed>}> */
    private array $callLog = [];

    /**
     * Get the call log for testing.
     *
     * @return array<array{method: string, args: array<mixed>}>
     */
    public function getCallLog(): array
    {
        return $this->callLog;
    }

    /**
     * Clear the call log.
     */
    public function clearCallLog(): void
    {
        $this->callLog = [];
    }

    /**
     * Seed data for testing.
     *
     * @param string $dbName Database name
     * @param string $collName Collection name
     * @param array<array<string, mixed>> $documents Documents to seed
     */
    public function seed(string $dbName, string $collName, array $documents): void
    {
        if (!isset($this->data[$dbName])) {
            $this->data[$dbName] = [];
        }
        if (!isset($this->data[$dbName][$collName])) {
            $this->data[$dbName][$collName] = [];
        }

        foreach ($documents as $doc) {
            if (!isset($doc['_id'])) {
                $doc['_id'] = 'id_' . ($this->nextId++);
            }
            $this->data[$dbName][$collName][] = $doc;
        }
    }

    /**
     * {@inheritdoc}
     */
    public function call(string $method, mixed ...$args): mixed
    {
        if ($this->closed) {
            throw new TransportException('Transport is closed');
        }

        $this->callLog[] = ['method' => $method, 'args' => $args];

        return match ($method) {
            'connect' => ['ok' => 1],
            'ping' => ['ok' => 1],
            'insertOne' => $this->handleInsertOne($args[0], $args[1], $args[2]),
            'insertMany' => $this->handleInsertMany($args[0], $args[1], $args[2]),
            'find' => $this->handleFind($args[0], $args[1], $args[2], $args[3] ?? []),
            'findOne' => $this->handleFindOne($args[0], $args[1], $args[2], $args[3] ?? []),
            'findOneAndUpdate' => $this->handleFindOneAndUpdate($args[0], $args[1], $args[2], $args[3], $args[4] ?? []),
            'findOneAndDelete' => $this->handleFindOneAndDelete($args[0], $args[1], $args[2]),
            'findOneAndReplace' => $this->handleFindOneAndReplace($args[0], $args[1], $args[2], $args[3], $args[4] ?? []),
            'updateOne' => $this->handleUpdateOne($args[0], $args[1], $args[2], $args[3], $args[4] ?? []),
            'updateMany' => $this->handleUpdateMany($args[0], $args[1], $args[2], $args[3], $args[4] ?? []),
            'replaceOne' => $this->handleReplaceOne($args[0], $args[1], $args[2], $args[3], $args[4] ?? []),
            'deleteOne' => $this->handleDeleteOne($args[0], $args[1], $args[2]),
            'deleteMany' => $this->handleDeleteMany($args[0], $args[1], $args[2]),
            'countDocuments' => $this->handleCountDocuments($args[0], $args[1], $args[2], $args[3] ?? []),
            'estimatedDocumentCount' => $this->handleEstimatedDocumentCount($args[0], $args[1]),
            'aggregate' => $this->handleAggregate($args[0], $args[1], $args[2]),
            'distinct' => $this->handleDistinct($args[0], $args[1], $args[2], $args[3] ?? []),
            'createCollection' => $this->handleCreateCollection($args[0], $args[1]),
            'dropCollection' => $this->handleDropCollection($args[0], $args[1]),
            'dropDatabase' => $this->handleDropDatabase($args[0]),
            'listCollections' => $this->handleListCollections($args[0]),
            'listDatabases' => $this->handleListDatabases(),
            'createIndex' => 'index_name',
            'createIndexes' => ['index_1', 'index_2'],
            'dropIndex', 'dropIndexes' => null,
            'listIndexes' => [['v' => 2, 'key' => ['_id' => 1], 'name' => '_id_']],
            'runCommand' => ['ok' => 1],
            'serverStatus' => ['host' => 'localhost', 'version' => '1.0.0', 'ok' => 1],
            'adminCommand' => ['ok' => 1],
            default => throw new TransportException("Unknown method: {$method}"),
        };
    }

    /**
     * {@inheritdoc}
     */
    public function close(): void
    {
        $this->closed = true;
    }

    /**
     * {@inheritdoc}
     */
    public function isClosed(): bool
    {
        return $this->closed;
    }

    // =========================================================================
    // Private handler methods
    // =========================================================================

    private function handleInsertOne(string $dbName, string $collName, array $doc): array
    {
        $collection = &$this->getOrCreateCollection($dbName, $collName);
        $id = $doc['_id'] ?? 'id_' . ($this->nextId++);
        $doc['_id'] = $id;
        $collection[] = $doc;

        return ['acknowledged' => true, 'insertedId' => $id];
    }

    private function handleInsertMany(string $dbName, string $collName, array $docs): array
    {
        $collection = &$this->getOrCreateCollection($dbName, $collName);
        $insertedIds = [];

        foreach ($docs as $i => $doc) {
            $id = $doc['_id'] ?? 'id_' . ($this->nextId++);
            $doc['_id'] = $id;
            $collection[] = $doc;
            $insertedIds[$i] = (string) $id;
        }

        return [
            'acknowledged' => true,
            'insertedCount' => count($docs),
            'insertedIds' => $insertedIds,
        ];
    }

    private function handleFind(string $dbName, string $collName, array $filter, array $options): array
    {
        $collection = $this->getCollection($dbName, $collName);
        $results = array_values(array_filter($collection, fn($doc) => $this->matchesFilter($doc, $filter)));

        if (isset($options['sort'])) {
            $results = $this->sortDocs($results, $options['sort']);
        }
        if (isset($options['skip'])) {
            $results = array_slice($results, $options['skip']);
        }
        if (isset($options['limit'])) {
            $results = array_slice($results, 0, $options['limit']);
        }
        if (isset($options['projection'])) {
            $results = array_map(fn($doc) => $this->applyProjection($doc, $options['projection']), $results);
        }

        return array_values($results);
    }

    private function handleFindOne(string $dbName, string $collName, array $filter, array $options): ?array
    {
        $results = $this->handleFind($dbName, $collName, $filter, ['limit' => 1] + $options);
        return $results[0] ?? null;
    }

    private function handleFindOneAndUpdate(string $dbName, string $collName, array $filter, array $update, array $options): ?array
    {
        $collection = &$this->getOrCreateCollection($dbName, $collName);

        foreach ($collection as $i => $doc) {
            if ($this->matchesFilter($doc, $filter)) {
                $original = $doc;
                $collection[$i] = $this->applyUpdate($doc, $update);
                return ($options['returnDocument'] ?? 'before') === 'after' ? $collection[$i] : $original;
            }
        }

        if ($options['upsert'] ?? false) {
            $id = 'id_' . ($this->nextId++);
            $newDoc = array_merge(['_id' => $id], $filter, $this->applyUpdate([], $update));
            $collection[] = $newDoc;
            return ($options['returnDocument'] ?? 'before') === 'after' ? $newDoc : null;
        }

        return null;
    }

    private function handleFindOneAndDelete(string $dbName, string $collName, array $filter): ?array
    {
        $collection = &$this->getOrCreateCollection($dbName, $collName);

        foreach ($collection as $i => $doc) {
            if ($this->matchesFilter($doc, $filter)) {
                array_splice($collection, $i, 1);
                return $doc;
            }
        }

        return null;
    }

    private function handleFindOneAndReplace(string $dbName, string $collName, array $filter, array $replacement, array $options): ?array
    {
        $collection = &$this->getOrCreateCollection($dbName, $collName);

        foreach ($collection as $i => $doc) {
            if ($this->matchesFilter($doc, $filter)) {
                $original = $doc;
                $collection[$i] = array_merge(['_id' => $doc['_id']], $replacement);
                return ($options['returnDocument'] ?? 'before') === 'after' ? $collection[$i] : $original;
            }
        }

        if ($options['upsert'] ?? false) {
            $id = 'id_' . ($this->nextId++);
            $newDoc = array_merge(['_id' => $id], $replacement);
            $collection[] = $newDoc;
            return ($options['returnDocument'] ?? 'before') === 'after' ? $newDoc : null;
        }

        return null;
    }

    private function handleUpdateOne(string $dbName, string $collName, array $filter, array $update, array $options): array
    {
        $collection = &$this->getOrCreateCollection($dbName, $collName);

        foreach ($collection as $i => $doc) {
            if ($this->matchesFilter($doc, $filter)) {
                $collection[$i] = $this->applyUpdate($doc, $update);
                return ['acknowledged' => true, 'matchedCount' => 1, 'modifiedCount' => 1];
            }
        }

        if ($options['upsert'] ?? false) {
            $id = 'id_' . ($this->nextId++);
            $newDoc = array_merge(['_id' => $id], $this->applyUpdate([], $update));
            $collection[] = $newDoc;
            return ['acknowledged' => true, 'matchedCount' => 0, 'modifiedCount' => 0, 'upsertedId' => $id, 'upsertedCount' => 1];
        }

        return ['acknowledged' => true, 'matchedCount' => 0, 'modifiedCount' => 0];
    }

    private function handleUpdateMany(string $dbName, string $collName, array $filter, array $update, array $options): array
    {
        $collection = &$this->getOrCreateCollection($dbName, $collName);
        $matchedCount = 0;
        $modifiedCount = 0;

        foreach ($collection as $i => $doc) {
            if ($this->matchesFilter($doc, $filter)) {
                $matchedCount++;
                $updated = $this->applyUpdate($doc, $update);
                if (json_encode($updated) !== json_encode($doc)) {
                    $collection[$i] = $updated;
                    $modifiedCount++;
                }
            }
        }

        if ($matchedCount === 0 && ($options['upsert'] ?? false)) {
            $id = 'id_' . ($this->nextId++);
            $newDoc = array_merge(['_id' => $id], $this->applyUpdate([], $update));
            $collection[] = $newDoc;
            return ['acknowledged' => true, 'matchedCount' => 0, 'modifiedCount' => 0, 'upsertedId' => $id, 'upsertedCount' => 1];
        }

        return ['acknowledged' => true, 'matchedCount' => $matchedCount, 'modifiedCount' => $modifiedCount];
    }

    private function handleReplaceOne(string $dbName, string $collName, array $filter, array $replacement, array $options): array
    {
        $collection = &$this->getOrCreateCollection($dbName, $collName);

        foreach ($collection as $i => $doc) {
            if ($this->matchesFilter($doc, $filter)) {
                $collection[$i] = array_merge(['_id' => $doc['_id']], $replacement);
                return ['acknowledged' => true, 'matchedCount' => 1, 'modifiedCount' => 1];
            }
        }

        if ($options['upsert'] ?? false) {
            $id = 'id_' . ($this->nextId++);
            $newDoc = array_merge(['_id' => $id], $replacement);
            $collection[] = $newDoc;
            return ['acknowledged' => true, 'matchedCount' => 0, 'modifiedCount' => 0, 'upsertedId' => $id, 'upsertedCount' => 1];
        }

        return ['acknowledged' => true, 'matchedCount' => 0, 'modifiedCount' => 0];
    }

    private function handleDeleteOne(string $dbName, string $collName, array $filter): array
    {
        $collection = &$this->getOrCreateCollection($dbName, $collName);

        foreach ($collection as $i => $doc) {
            if ($this->matchesFilter($doc, $filter)) {
                array_splice($collection, $i, 1);
                return ['acknowledged' => true, 'deletedCount' => 1];
            }
        }

        return ['acknowledged' => true, 'deletedCount' => 0];
    }

    private function handleDeleteMany(string $dbName, string $collName, array $filter): array
    {
        $collection = &$this->getOrCreateCollection($dbName, $collName);
        $deletedCount = 0;

        for ($i = count($collection) - 1; $i >= 0; $i--) {
            if ($this->matchesFilter($collection[$i], $filter)) {
                array_splice($collection, $i, 1);
                $deletedCount++;
            }
        }

        return ['acknowledged' => true, 'deletedCount' => $deletedCount];
    }

    private function handleCountDocuments(string $dbName, string $collName, array $filter, array $options): int
    {
        $results = $this->handleFind($dbName, $collName, $filter, $options);
        return count($results);
    }

    private function handleEstimatedDocumentCount(string $dbName, string $collName): int
    {
        return count($this->getCollection($dbName, $collName));
    }

    private function handleAggregate(string $dbName, string $collName, array $pipeline): array
    {
        $results = $this->getCollection($dbName, $collName);

        foreach ($pipeline as $stage) {
            if (isset($stage['$match'])) {
                $results = array_values(array_filter($results, fn($doc) => $this->matchesFilter($doc, $stage['$match'])));
            } elseif (isset($stage['$limit'])) {
                $results = array_slice($results, 0, $stage['$limit']);
            } elseif (isset($stage['$skip'])) {
                $results = array_slice($results, $stage['$skip']);
            } elseif (isset($stage['$sort'])) {
                $results = $this->sortDocs($results, $stage['$sort']);
            } elseif (isset($stage['$project'])) {
                $results = array_map(fn($doc) => $this->applyProjection($doc, $stage['$project']), $results);
            } elseif (isset($stage['$count'])) {
                $results = [[$stage['$count'] => count($results)]];
            }
        }

        return array_values($results);
    }

    private function handleDistinct(string $dbName, string $collName, string $field, array $filter): array
    {
        $collection = $this->getCollection($dbName, $collName);
        $filtered = empty($filter) ? $collection : array_filter($collection, fn($doc) => $this->matchesFilter($doc, $filter));
        $values = [];

        foreach ($filtered as $doc) {
            $value = $this->getFieldValue($doc, $field);
            if ($value !== null && !in_array($value, $values, true)) {
                $values[] = $value;
            }
        }

        return $values;
    }

    private function handleCreateCollection(string $dbName, string $collName): array
    {
        $this->getOrCreateCollection($dbName, $collName);
        return ['ok' => 1];
    }

    private function handleDropCollection(string $dbName, string $collName): bool
    {
        if (isset($this->data[$dbName][$collName])) {
            unset($this->data[$dbName][$collName]);
        }
        return true;
    }

    private function handleDropDatabase(string $dbName): bool
    {
        unset($this->data[$dbName]);
        return true;
    }

    private function handleListCollections(string $dbName): array
    {
        if (!isset($this->data[$dbName])) {
            return [];
        }

        return array_map(
            fn($name) => ['name' => $name, 'type' => 'collection'],
            array_keys($this->data[$dbName])
        );
    }

    private function handleListDatabases(): array
    {
        $databases = array_map(
            fn($name) => [
                'name' => $name,
                'sizeOnDisk' => 0,
                'empty' => empty($this->data[$name]),
            ],
            array_keys($this->data)
        );

        return ['databases' => $databases, 'totalSize' => 0];
    }

    // =========================================================================
    // Helper methods
    // =========================================================================

    private function &getOrCreateCollection(string $dbName, string $collName): array
    {
        if (!isset($this->data[$dbName])) {
            $this->data[$dbName] = [];
        }
        if (!isset($this->data[$dbName][$collName])) {
            $this->data[$dbName][$collName] = [];
        }
        return $this->data[$dbName][$collName];
    }

    private function getCollection(string $dbName, string $collName): array
    {
        return $this->data[$dbName][$collName] ?? [];
    }

    private function matchesFilter(array $doc, array $filter): bool
    {
        if (empty($filter)) {
            return true;
        }

        foreach ($filter as $key => $value) {
            // Handle logical operators
            if ($key === '$and') {
                foreach ($value as $subFilter) {
                    if (!$this->matchesFilter($doc, $subFilter)) {
                        return false;
                    }
                }
                continue;
            }
            if ($key === '$or') {
                $matched = false;
                foreach ($value as $subFilter) {
                    if ($this->matchesFilter($doc, $subFilter)) {
                        $matched = true;
                        break;
                    }
                }
                if (!$matched) {
                    return false;
                }
                continue;
            }

            $docValue = $this->getFieldValue($doc, $key);

            // Handle operator objects
            if (is_array($value) && !array_is_list($value)) {
                foreach ($value as $op => $opValue) {
                    if (!str_starts_with($op, '$')) {
                        // Regular nested object comparison
                        if (!$this->compareValues($docValue, $value)) {
                            return false;
                        }
                        break;
                    }

                    $matches = match ($op) {
                        '$eq' => $this->compareValues($docValue, $opValue),
                        '$ne' => !$this->compareValues($docValue, $opValue),
                        '$gt' => $docValue !== null && $docValue > $opValue,
                        '$gte' => $docValue !== null && $docValue >= $opValue,
                        '$lt' => $docValue !== null && $docValue < $opValue,
                        '$lte' => $docValue !== null && $docValue <= $opValue,
                        '$in' => is_array($opValue) && in_array($docValue, $opValue, false),
                        '$nin' => is_array($opValue) && !in_array($docValue, $opValue, false),
                        '$exists' => $opValue ? ($docValue !== null) : ($docValue === null),
                        '$regex' => is_string($docValue) && preg_match("/{$opValue}/", $docValue),
                        '$size' => is_array($docValue) && count($docValue) === $opValue,
                        default => true,
                    };

                    if (!$matches) {
                        return false;
                    }
                }
            } else {
                // Direct value comparison
                if (!$this->compareValues($docValue, $value)) {
                    return false;
                }
            }
        }

        return true;
    }

    private function getFieldValue(array $doc, string $path): mixed
    {
        $parts = explode('.', $path);
        $value = $doc;

        foreach ($parts as $part) {
            if (!is_array($value) || !isset($value[$part])) {
                return null;
            }
            $value = $value[$part];
        }

        return $value;
    }

    private function setFieldValue(array &$doc, string $path, mixed $value): void
    {
        $parts = explode('.', $path);
        $current = &$doc;

        for ($i = 0; $i < count($parts) - 1; $i++) {
            if (!isset($current[$parts[$i]]) || !is_array($current[$parts[$i]])) {
                $current[$parts[$i]] = [];
            }
            $current = &$current[$parts[$i]];
        }

        $current[$parts[count($parts) - 1]] = $value;
    }

    private function compareValues(mixed $a, mixed $b): bool
    {
        if ($a === $b) {
            return true;
        }

        if (is_array($a) && is_array($b)) {
            if (count($a) !== count($b)) {
                return false;
            }
            foreach ($a as $key => $value) {
                if (!isset($b[$key]) || !$this->compareValues($value, $b[$key])) {
                    return false;
                }
            }
            return true;
        }

        return false;
    }

    private function sortDocs(array $docs, array $sort): array
    {
        usort($docs, function ($a, $b) use ($sort) {
            foreach ($sort as $key => $direction) {
                $aVal = $this->getFieldValue($a, $key);
                $bVal = $this->getFieldValue($b, $key);

                if ($aVal === $bVal) {
                    continue;
                }
                if ($aVal === null) {
                    return $direction;
                }
                if ($bVal === null) {
                    return -$direction;
                }

                return ($aVal <=> $bVal) * $direction;
            }
            return 0;
        });

        return $docs;
    }

    private function applyProjection(array $doc, array $projection): array
    {
        $hasInclusion = in_array(1, $projection, true);
        $hasExclusion = in_array(0, $projection, true);

        if ($hasInclusion) {
            $result = [];
            if (!isset($projection['_id']) || $projection['_id'] !== 0) {
                $result['_id'] = $doc['_id'] ?? null;
            }
            foreach ($projection as $key => $value) {
                if ($value === 1 && $key !== '_id') {
                    $result[$key] = $this->getFieldValue($doc, $key);
                }
            }
            return $result;
        }

        // Exclusion only
        $result = $doc;
        foreach ($projection as $key => $value) {
            if ($value === 0) {
                unset($result[$key]);
            }
        }
        return $result;
    }

    private function applyUpdate(array $doc, array $update): array
    {
        $result = $doc;

        if (isset($update['$set'])) {
            foreach ($update['$set'] as $key => $value) {
                $this->setFieldValue($result, $key, $value);
            }
        }

        if (isset($update['$unset'])) {
            foreach (array_keys($update['$unset']) as $key) {
                unset($result[$key]);
            }
        }

        if (isset($update['$inc'])) {
            foreach ($update['$inc'] as $key => $value) {
                $current = $this->getFieldValue($result, $key) ?? 0;
                $this->setFieldValue($result, $key, $current + $value);
            }
        }

        if (isset($update['$push'])) {
            foreach ($update['$push'] as $key => $value) {
                $current = $this->getFieldValue($result, $key) ?? [];
                if (!is_array($current)) {
                    $current = [];
                }

                if (is_array($value) && isset($value['$each'])) {
                    $current = array_merge($current, $value['$each']);
                } else {
                    $current[] = $value;
                }

                $this->setFieldValue($result, $key, $current);
            }
        }

        if (isset($update['$addToSet'])) {
            foreach ($update['$addToSet'] as $key => $value) {
                $current = $this->getFieldValue($result, $key) ?? [];
                if (!is_array($current)) {
                    $current = [];
                }

                if (is_array($value) && isset($value['$each'])) {
                    foreach ($value['$each'] as $item) {
                        if (!in_array($item, $current, true)) {
                            $current[] = $item;
                        }
                    }
                } else {
                    if (!in_array($value, $current, true)) {
                        $current[] = $value;
                    }
                }

                $this->setFieldValue($result, $key, $current);
            }
        }

        if (isset($update['$pull'])) {
            foreach ($update['$pull'] as $key => $value) {
                $current = $this->getFieldValue($result, $key);
                if (is_array($current)) {
                    $current = array_values(array_filter($current, fn($item) => !$this->compareValues($item, $value)));
                    $this->setFieldValue($result, $key, $current);
                }
            }
        }

        if (isset($update['$pop'])) {
            foreach ($update['$pop'] as $key => $direction) {
                $current = $this->getFieldValue($result, $key);
                if (is_array($current)) {
                    if ($direction === 1) {
                        array_pop($current);
                    } else {
                        array_shift($current);
                    }
                    $this->setFieldValue($result, $key, $current);
                }
            }
        }

        return $result;
    }
}
