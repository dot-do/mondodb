<?php

declare(strict_types=1);

namespace MongoDo;

use MongoDo\Exception\ConnectionException;

/**
 * MongoClient - Main entry point for MongoDB connections.
 *
 * Provides a MongoDB-compatible API using RPC transport.
 *
 * @example
 * ```php
 * $client = new MongoClient('mongodb://localhost:27017');
 * $db = $client->selectDatabase('mydb');
 * $collection = $db->selectCollection('users');
 *
 * // Or use the property accessor
 * $client->mydb->users->insertOne(['name' => 'Alice']);
 * ```
 */
class MongoClient
{
    private string $uri;
    private array $options;
    private ?RpcTransport $transport = null;
    private bool $connected = false;

    /** @var array<string, Database> */
    private array $databases = [];
    private ?string $defaultDbName = null;

    /**
     * Create a new MongoClient.
     *
     * @param string $uri MongoDB connection URI
     * @param array $options Connection options
     */
    public function __construct(string $uri = 'mongodb://localhost:27017', array $options = [])
    {
        $this->uri = $uri;
        $this->options = $options;
        $this->parseUri();
    }

    /**
     * Parse the connection URI.
     */
    private function parseUri(): void
    {
        // Extract default database from URI
        if (preg_match('#mongodb(?:\+srv)?://[^/]+/([^?]+)#', $this->uri, $matches)) {
            $this->defaultDbName = $matches[1];
        }
    }

    /**
     * Connect to MongoDB.
     *
     * @throws ConnectionException
     */
    public function connect(): self
    {
        if ($this->connected) {
            return $this;
        }

        $this->transport = new MockRpcTransport();

        try {
            $this->transport->call('connect', $this->uri);
        } catch (\Exception $e) {
            throw new ConnectionException('Failed to connect: ' . $e->getMessage(), 0, $e);
        }

        $this->connected = true;
        return $this;
    }

    /**
     * Static factory method for connection.
     *
     * @param string $uri MongoDB connection URI
     * @param array $options Connection options
     * @throws ConnectionException
     */
    public static function create(string $uri = 'mongodb://localhost:27017', array $options = []): self
    {
        $client = new self($uri, $options);
        return $client->connect();
    }

    /**
     * Get a database by name.
     *
     * @param string|null $name Database name (uses default from URI if null)
     */
    public function selectDatabase(?string $name = null): Database
    {
        $this->ensureConnected();

        $dbName = $name ?? $this->defaultDbName ?? 'test';

        if (!isset($this->databases[$dbName])) {
            $this->databases[$dbName] = new Database($this->transport, $dbName);
        }

        return $this->databases[$dbName];
    }

    /**
     * Get a database by name (alias for selectDatabase).
     */
    public function db(?string $name = null): Database
    {
        return $this->selectDatabase($name);
    }

    /**
     * List all databases.
     *
     * @return array<array{name: string, sizeOnDisk: int, empty: bool}>
     */
    public function listDatabases(): array
    {
        $this->ensureConnected();

        $result = $this->transport->call('listDatabases');
        return $result['databases'] ?? [];
    }

    /**
     * List database names.
     *
     * @return array<string>
     */
    public function listDatabaseNames(): array
    {
        return array_column($this->listDatabases(), 'name');
    }

    /**
     * Drop a database.
     */
    public function dropDatabase(string $name): bool
    {
        $this->ensureConnected();

        $this->transport->call('dropDatabase', $name);
        unset($this->databases[$name]);

        return true;
    }

    /**
     * Close the connection.
     */
    public function close(): void
    {
        if ($this->transport !== null) {
            $this->transport->close();
            $this->transport = null;
        }

        $this->connected = false;
        $this->databases = [];
    }

    /**
     * Ping the server.
     */
    public function ping(): array
    {
        $this->ensureConnected();

        return $this->transport->call('ping');
    }

    /**
     * Check if connected.
     */
    public function isConnected(): bool
    {
        return $this->connected;
    }

    /**
     * Get the connection URI.
     */
    public function getUri(): string
    {
        return $this->uri;
    }

    /**
     * Get the internal transport (for testing).
     */
    public function getTransport(): ?RpcTransport
    {
        return $this->transport;
    }

    /**
     * Set a custom transport (for testing).
     */
    public function setTransport(RpcTransport $transport): void
    {
        $this->transport = $transport;
        $this->connected = true;
    }

    /**
     * Magic method to access databases as properties.
     *
     * @example $client->mydb->collection
     */
    public function __get(string $name): Database
    {
        return $this->selectDatabase($name);
    }

    /**
     * Ensure the client is connected.
     *
     * @throws ConnectionException
     */
    private function ensureConnected(): void
    {
        if (!$this->connected) {
            $this->connect();
        }
    }

    /**
     * Destructor - close connection.
     */
    public function __destruct()
    {
        $this->close();
    }
}
