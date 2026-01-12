/**
 * Tests for MongoClient and connection handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MongoClient, parseConnectionUri, MockRpcTransport } from '../src/client.js';

describe('MongoClient', () => {
  let client: MongoClient;

  beforeEach(() => {
    client = new MongoClient('mongodb://localhost:27017/testdb');
  });

  afterEach(async () => {
    if (client.isConnected) {
      await client.close();
    }
  });

  describe('constructor', () => {
    it('should create a client with URI', () => {
      expect(client).toBeInstanceOf(MongoClient);
      expect(client.isConnected).toBe(false);
    });

    it('should create a client with options', () => {
      const clientWithOptions = new MongoClient('mongodb://localhost/test', {
        timeout: 5000,
        autoReconnect: true,
      });
      expect(clientWithOptions).toBeInstanceOf(MongoClient);
    });

    it('should handle invalid URI gracefully', () => {
      // Should not throw during construction
      const invalidClient = new MongoClient('invalid-uri');
      expect(invalidClient).toBeInstanceOf(MongoClient);
    });
  });

  describe('connect', () => {
    it('should connect to the database', async () => {
      await client.connect();
      expect(client.isConnected).toBe(true);
    });

    it('should return the client instance', async () => {
      const result = await client.connect();
      expect(result).toBe(client);
    });

    it('should be idempotent', async () => {
      await client.connect();
      await client.connect();
      expect(client.isConnected).toBe(true);
    });
  });

  describe('db', () => {
    it('should return a database instance', async () => {
      await client.connect();
      const db = client.db('testdb');
      expect(db.databaseName).toBe('testdb');
    });

    it('should use default database from URI', async () => {
      await client.connect();
      const db = client.db();
      expect(db.databaseName).toBe('testdb');
    });

    it('should cache database instances', async () => {
      await client.connect();
      const db1 = client.db('testdb');
      const db2 = client.db('testdb');
      expect(db1).toBe(db2);
    });

    it('should throw if not connected', () => {
      expect(() => client.db('test')).toThrow('Client must be connected');
    });

    it('should use fallback database name when URI has no db', async () => {
      const noDbClient = new MongoClient('mongodb://localhost:27017');
      await noDbClient.connect();
      const db = noDbClient.db();
      expect(db.databaseName).toBe('test');
      await noDbClient.close();
    });
  });

  describe('close', () => {
    it('should close the connection', async () => {
      await client.connect();
      await client.close();
      expect(client.isConnected).toBe(false);
    });

    it('should be idempotent', async () => {
      await client.connect();
      await client.close();
      await client.close();
      expect(client.isConnected).toBe(false);
    });

    it('should clear database cache', async () => {
      await client.connect();
      client.db('testdb');
      await client.close();
      await client.connect();
      // Should create a new database instance
      const db = client.db('testdb');
      expect(db.databaseName).toBe('testdb');
    });
  });

  describe('static connect', () => {
    it('should create and connect a client', async () => {
      const staticClient = await MongoClient.connect('mongodb://localhost/test');
      expect(staticClient.isConnected).toBe(true);
      await staticClient.close();
    });
  });

  describe('transport', () => {
    it('should expose the transport', async () => {
      await client.connect();
      expect(client.transport).toBeInstanceOf(MockRpcTransport);
    });

    it('should allow setting custom transport', () => {
      const customTransport = new MockRpcTransport();
      client.setTransport(customTransport);
      expect(client.transport).toBe(customTransport);
      expect(client.isConnected).toBe(true);
    });
  });
});

describe('parseConnectionUri', () => {
  it('should parse basic URI', () => {
    const result = parseConnectionUri('mongodb://localhost');
    expect(result.protocol).toBe('mongodb');
    expect(result.host).toBe('localhost');
    expect(result.port).toBeUndefined();
    expect(result.database).toBeUndefined();
  });

  it('should parse URI with port', () => {
    const result = parseConnectionUri('mongodb://localhost:27017');
    expect(result.host).toBe('localhost');
    expect(result.port).toBe(27017);
  });

  it('should parse URI with database', () => {
    const result = parseConnectionUri('mongodb://localhost:27017/mydb');
    expect(result.database).toBe('mydb');
  });

  it('should parse URI with credentials', () => {
    const result = parseConnectionUri('mongodb://user:pass@localhost/mydb');
    expect(result.username).toBe('user');
    expect(result.password).toBe('pass');
  });

  it('should parse URI with encoded credentials', () => {
    const result = parseConnectionUri('mongodb://user%40domain:p%40ss@localhost/mydb');
    expect(result.username).toBe('user@domain');
    expect(result.password).toBe('p@ss');
  });

  it('should parse URI with query options', () => {
    const result = parseConnectionUri('mongodb://localhost/mydb?retryWrites=true&w=majority');
    expect(result.options.retryWrites).toBe('true');
    expect(result.options.w).toBe('majority');
  });

  it('should parse mongodb+srv protocol', () => {
    const result = parseConnectionUri('mongodb+srv://cluster.example.com/mydb');
    expect(result.protocol).toBe('mongodb+srv');
    expect(result.host).toBe('cluster.example.com');
  });

  it('should throw for invalid protocol', () => {
    expect(() => parseConnectionUri('http://localhost')).toThrow('Invalid MongoDB URI');
  });

  it('should handle username without password', () => {
    const result = parseConnectionUri('mongodb://user@localhost/mydb');
    expect(result.username).toBe('user');
    expect(result.password).toBeUndefined();
  });

  it('should handle empty database path', () => {
    const result = parseConnectionUri('mongodb://localhost/');
    expect(result.database).toBeUndefined();
  });
});

describe('MockRpcTransport', () => {
  let transport: MockRpcTransport;

  beforeEach(() => {
    transport = new MockRpcTransport();
  });

  afterEach(async () => {
    await transport.close();
  });

  it('should track call log', async () => {
    await transport.call('connect', 'mongodb://localhost');
    await transport.call('ping');
    expect(transport.callLog).toHaveLength(2);
    expect(transport.callLog[0].method).toBe('connect');
    expect(transport.callLog[1].method).toBe('ping');
  });

  it('should clear call log', async () => {
    await transport.call('connect', 'mongodb://localhost');
    transport.clearCallLog();
    expect(transport.callLog).toHaveLength(0);
  });

  it('should throw when closed', async () => {
    await transport.close();
    await expect(transport.call('ping')).rejects.toThrow('Transport is closed');
  });

  it('should report closed state', async () => {
    expect(transport.isClosed).toBe(false);
    await transport.close();
    expect(transport.isClosed).toBe(true);
  });

  it('should throw for unknown method', async () => {
    await expect(transport.call('unknownMethod')).rejects.toThrow('Unknown method');
  });
});
