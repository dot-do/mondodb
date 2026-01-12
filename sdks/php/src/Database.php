<?php

declare(strict_types=1);

namespace MongoDo;

/**
 * Database - MongoDB database operations.
 *
 * Provides access to collections and database-level operations.
 *
 * @example
 * ```php
 * $db = $client->selectDatabase('mydb');
 * $users = $db->selectCollection('users');
 *
 * // Or use property accessor
 * $db->users->insertOne(['name' => 'Alice']);
 *
 * // List collections
 * foreach ($db->listCollections() as $info) {
 *     echo $info['name'] . "\n";
 * }
 * ```
 */
class Database
{
    private RpcTransport $transport;
    private string $name;

    /** @var array<string, Collection> */
    private array $collections = [];

    /**
     * Create a new Database instance.
     *
     * @param RpcTransport $transport RPC transport
     * @param string $name Database name
     */
    public function __construct(RpcTransport $transport, string $name)
    {
        $this->transport = $transport;
        $this->name = $name;
    }

    /**
     * Get the database name.
     */
    public function getName(): string
    {
        return $this->name;
    }

    /**
     * Get a collection by name.
     *
     * @param string $name Collection name
     */
    public function selectCollection(string $name): Collection
    {
        if (!isset($this->collections[$name])) {
            $this->collections[$name] = new Collection($this->transport, $this->name, $name);
        }

        return $this->collections[$name];
    }

    /**
     * Alias for selectCollection.
     */
    public function collection(string $name): Collection
    {
        return $this->selectCollection($name);
    }

    /**
     * List all collections in the database.
     *
     * @return array<array{name: string, type: string}>
     */
    public function listCollections(): array
    {
        return $this->transport->call('listCollections', $this->name);
    }

    /**
     * List collection names.
     *
     * @return array<string>
     */
    public function listCollectionNames(): array
    {
        return array_column($this->listCollections(), 'name');
    }

    /**
     * Create a new collection.
     *
     * @param string $name Collection name
     * @param array $options Creation options
     */
    public function createCollection(string $name, array $options = []): Collection
    {
        $this->transport->call('createCollection', $this->name, $name, $options);
        return $this->selectCollection($name);
    }

    /**
     * Drop a collection.
     *
     * @param string $name Collection name
     */
    public function dropCollection(string $name): bool
    {
        $result = $this->transport->call('dropCollection', $this->name, $name);
        unset($this->collections[$name]);
        return (bool) $result;
    }

    /**
     * Drop the database.
     */
    public function drop(): bool
    {
        $result = $this->transport->call('dropDatabase', $this->name);
        $this->collections = [];
        return (bool) $result;
    }

    /**
     * Run a database command.
     *
     * @param array $command The command document
     */
    public function command(array $command): array
    {
        return $this->transport->call('runCommand', $this->name, $command);
    }

    /**
     * Get collection stats.
     */
    public function stats(): array
    {
        return $this->command(['dbStats' => 1]);
    }

    /**
     * Magic method to access collections as properties.
     *
     * @example $db->users->find()
     */
    public function __get(string $name): Collection
    {
        return $this->selectCollection($name);
    }

    /**
     * Array access to collections.
     *
     * @example $db['users']->find()
     */
    public function __isset(string $name): bool
    {
        return true; // Collections are always available
    }
}
