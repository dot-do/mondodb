/**
 * ClickHouse Iceberg Integration Tests (TDD - RED phase)
 *
 * Tests for connecting to ClickHouse with Apache Iceberg table format.
 * These tests define the expected behavior for Iceberg catalog discovery,
 * table schema introspection, and connection management.
 *
 * Issue: mongo.do-vyf4
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  ClickHouseIcebergClient,
  createIcebergConnection,
  discoverCatalog,
  discoverTables,
  getTableSchema,
  Iceberg,
  IcebergConnectionError,
  IcebergCatalogError,
  IcebergTableError,
  type IcebergConnectionConfig,
  type IcebergCatalog,
  type IcebergTable,
  type IcebergSchema,
  type IcebergColumn,
  type DiscoverTablesOptions,
  type GetSchemaOptions,
} from '../../../../src/olap/clickhouse/iceberg';

// ============================================================================
// Mock ClickHouse HTTP Response Helpers
// ============================================================================

function createMockClickHouseResponse<T>(data: T, meta?: { columns: string[] }) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data, meta: meta ?? { columns: [] } }),
    text: () => Promise.resolve(JSON.stringify({ data })),
  };
}

function createMockErrorResponse(error: string, code: number = 500) {
  return {
    ok: false,
    status: code,
    json: () => Promise.resolve({ exception: error, code }),
    text: () => Promise.resolve(error),
  };
}

// ============================================================================
// Iceberg Connection Tests
// ============================================================================

describe('ClickHouse Iceberg Integration', () => {
  let mockFetch: Mock;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  // ==========================================================================
  // Connection Configuration Tests
  // ==========================================================================

  describe('createIcebergConnection', () => {
    it('should create connection with valid configuration', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        username: 'user',
        password: 'secret',
        secure: true,
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch.mockResolvedValue(createMockClickHouseResponse([{ version: '24.3.1' }]));

      const connection = await createIcebergConnection(config);

      expect(connection).toBeDefined();
      expect(connection).toBeInstanceOf(ClickHouseIcebergClient);
    });

    it('should throw error for invalid host', async () => {
      const config: IcebergConnectionConfig = {
        host: '',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
      };

      await expect(createIcebergConnection(config)).rejects.toThrow(
        'Invalid connection configuration: host is required'
      );
    });

    it('should throw error for invalid port', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: -1,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
      };

      await expect(createIcebergConnection(config)).rejects.toThrow(
        'Invalid connection configuration: port must be positive'
      );
    });

    it('should default to port 8443 for secure connections', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        database: 'analytics',
        secure: true,
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch.mockResolvedValue(createMockClickHouseResponse([{ version: '24.3.1' }]));

      const connection = await createIcebergConnection(config);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://clickhouse.example.com:8443'),
        expect.any(Object)
      );
    });

    it('should default to port 8123 for insecure connections', async () => {
      const config: IcebergConnectionConfig = {
        host: 'localhost',
        database: 'analytics',
        secure: false,
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch.mockResolvedValue(createMockClickHouseResponse([{ version: '24.3.1' }]));

      const connection = await createIcebergConnection(config);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:8123'),
        expect.any(Object)
      );
    });

    it('should use basic auth when credentials provided', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        username: 'admin',
        password: 'secret123',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch.mockResolvedValue(createMockClickHouseResponse([{ version: '24.3.1' }]));

      await createIcebergConnection(config);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Basic /),
          }),
        })
      );
    });
  });

  // ==========================================================================
  // Authentication Tests
  // ==========================================================================

  describe('authentication', () => {
    it('should authenticate with username and password', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        username: 'testuser',
        password: 'testpass',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch.mockResolvedValue(createMockClickHouseResponse([{ version: '24.3.1' }]));

      const connection = await createIcebergConnection(config);
      const isAuthenticated = await connection.isAuthenticated();

      expect(isAuthenticated).toBe(true);
    });

    it('should throw error for invalid credentials', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        username: 'baduser',
        password: 'wrongpass',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch.mockResolvedValue(createMockErrorResponse('Authentication failed', 401));

      await expect(createIcebergConnection(config)).rejects.toThrow(
        'Authentication failed'
      );
    });

    it('should support JWT token authentication', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        jwtToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch.mockResolvedValue(createMockClickHouseResponse([{ version: '24.3.1' }]));

      await createIcebergConnection(config);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Bearer /),
          }),
        })
      );
    });
  });

  // ==========================================================================
  // Catalog Discovery Tests
  // ==========================================================================

  describe('discoverCatalog', () => {
    it('should discover Iceberg catalog from ClickHouse', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch
        .mockResolvedValueOnce(createMockClickHouseResponse([{ version: '24.3.1' }]))
        .mockResolvedValueOnce(
          createMockClickHouseResponse([
            {
              name: 'iceberg_catalog',
              type: 'iceberg',
              warehouse: 's3://data-lake/iceberg',
            },
          ])
        );

      const connection = await createIcebergConnection(config);
      const catalog = await discoverCatalog(connection, 'iceberg_catalog');

      expect(catalog).toBeDefined();
      expect(catalog.name).toBe('iceberg_catalog');
      expect(catalog.type).toBe('iceberg');
      expect(catalog.warehouse).toBe('s3://data-lake/iceberg');
    });

    it('should throw error when catalog not found', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'nonexistent_catalog',
      };

      mockFetch
        .mockResolvedValueOnce(createMockClickHouseResponse([{ version: '24.3.1' }]))
        .mockResolvedValueOnce(createMockClickHouseResponse([]));

      const connection = await createIcebergConnection(config);

      await expect(discoverCatalog(connection, 'nonexistent_catalog')).rejects.toThrow(
        "Catalog 'nonexistent_catalog' not found"
      );
    });

    it('should return catalog with metadata', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'production_catalog',
      };

      mockFetch
        .mockResolvedValueOnce(createMockClickHouseResponse([{ version: '24.3.1' }]))
        .mockResolvedValueOnce(
          createMockClickHouseResponse([
            {
              name: 'production_catalog',
              type: 'iceberg',
              warehouse: 's3://prod-lake/iceberg',
              metadata_path: 's3://prod-lake/iceberg/metadata',
              created_at: '2024-01-15T10:30:00Z',
            },
          ])
        );

      const connection = await createIcebergConnection(config);
      const catalog = await discoverCatalog(connection, 'production_catalog');

      expect(catalog.metadataPath).toBe('s3://prod-lake/iceberg/metadata');
      expect(catalog.createdAt).toBeInstanceOf(Date);
    });
  });

  // ==========================================================================
  // Table Discovery Tests
  // ==========================================================================

  describe('discoverTables', () => {
    it('should discover all tables in catalog', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch
        .mockResolvedValueOnce(createMockClickHouseResponse([{ version: '24.3.1' }]))
        .mockResolvedValueOnce(
          createMockClickHouseResponse([
            { namespace: 'analytics', table_name: 'events', format: 'Iceberg' },
            { namespace: 'analytics', table_name: 'users', format: 'Iceberg' },
            { namespace: 'analytics', table_name: 'orders', format: 'Iceberg' },
          ])
        );

      const connection = await createIcebergConnection(config);
      const tables = await discoverTables(connection);

      expect(tables).toHaveLength(3);
      expect(tables.map((t) => t.name)).toEqual(['events', 'users', 'orders']);
    });

    it('should filter tables by namespace', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch
        .mockResolvedValueOnce(createMockClickHouseResponse([{ version: '24.3.1' }]))
        .mockResolvedValueOnce(
          createMockClickHouseResponse([
            { namespace: 'production', table_name: 'events', format: 'Iceberg' },
            { namespace: 'production', table_name: 'metrics', format: 'Iceberg' },
          ])
        );

      const connection = await createIcebergConnection(config);
      const tables = await discoverTables(connection, { namespace: 'production' });

      expect(tables).toHaveLength(2);
      tables.forEach((t) => expect(t.namespace).toBe('production'));
    });

    it('should return empty array when no tables found', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'empty_catalog',
      };

      mockFetch
        .mockResolvedValueOnce(createMockClickHouseResponse([{ version: '24.3.1' }]))
        .mockResolvedValueOnce(createMockClickHouseResponse([]));

      const connection = await createIcebergConnection(config);
      const tables = await discoverTables(connection);

      expect(tables).toEqual([]);
    });

    it('should include table metadata', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch
        .mockResolvedValueOnce(createMockClickHouseResponse([{ version: '24.3.1' }]))
        .mockResolvedValueOnce(
          createMockClickHouseResponse([
            {
              namespace: 'analytics',
              table_name: 'events',
              format: 'Iceberg',
              location: 's3://data-lake/iceberg/events',
              partition_spec: 'month(timestamp)',
              current_snapshot_id: '1234567890',
              total_records: 1000000,
              total_size_bytes: 1073741824,
            },
          ])
        );

      const connection = await createIcebergConnection(config);
      const tables = await discoverTables(connection);

      expect(tables[0].location).toBe('s3://data-lake/iceberg/events');
      expect(tables[0].partitionSpec).toBe('month(timestamp)');
      expect(tables[0].currentSnapshotId).toBe('1234567890');
      expect(tables[0].totalRecords).toBe(1000000);
      expect(tables[0].totalSizeBytes).toBe(1073741824);
    });
  });

  // ==========================================================================
  // Schema Discovery Tests
  // ==========================================================================

  describe('getTableSchema', () => {
    it('should retrieve table schema', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch
        .mockResolvedValueOnce(createMockClickHouseResponse([{ version: '24.3.1' }]))
        .mockResolvedValueOnce(
          createMockClickHouseResponse([
            { name: 'id', type: 'String', nullable: false, position: 0 },
            { name: 'timestamp', type: 'DateTime64', nullable: false, position: 1 },
            { name: 'user_id', type: 'String', nullable: true, position: 2 },
            { name: 'event_type', type: 'String', nullable: false, position: 3 },
            { name: 'payload', type: 'String', nullable: true, position: 4 },
          ])
        );

      const connection = await createIcebergConnection(config);
      const schema = await getTableSchema(connection, 'events');

      expect(schema).toBeDefined();
      expect(schema.columns).toHaveLength(5);
      expect(schema.columns[0].name).toBe('id');
      expect(schema.columns[0].type).toBe('String');
      expect(schema.columns[0].nullable).toBe(false);
    });

    it('should include column metadata', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch
        .mockResolvedValueOnce(createMockClickHouseResponse([{ version: '24.3.1' }]))
        .mockResolvedValueOnce(
          createMockClickHouseResponse([
            {
              name: 'metadata',
              type: 'String',
              nullable: true,
              position: 0,
              default: null,
              comment: 'JSON metadata field',
              is_partition_key: false,
            },
          ])
        );

      const connection = await createIcebergConnection(config);
      const schema = await getTableSchema(connection, 'events');

      expect(schema.columns[0].comment).toBe('JSON metadata field');
      expect(schema.columns[0].isPartitionKey).toBe(false);
    });

    it('should throw error for non-existent table', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch
        .mockResolvedValueOnce(createMockClickHouseResponse([{ version: '24.3.1' }]))
        .mockResolvedValueOnce(createMockErrorResponse("Table 'nonexistent' not found", 404));

      const connection = await createIcebergConnection(config);

      await expect(getTableSchema(connection, 'nonexistent')).rejects.toThrow(
        "Table 'nonexistent' not found"
      );
    });

    it('should handle nested types (Array, Map, Struct)', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch
        .mockResolvedValueOnce(createMockClickHouseResponse([{ version: '24.3.1' }]))
        .mockResolvedValueOnce(
          createMockClickHouseResponse([
            { name: 'tags', type: 'Array(String)', nullable: true, position: 0 },
            { name: 'properties', type: 'Map(String, String)', nullable: true, position: 1 },
            {
              name: 'address',
              type: 'Tuple(street String, city String, zip String)',
              nullable: true,
              position: 2,
            },
          ])
        );

      const connection = await createIcebergConnection(config);
      const schema = await getTableSchema(connection, 'users');

      expect(schema.columns[0].type).toBe('Array(String)');
      expect(schema.columns[1].type).toBe('Map(String, String)');
      expect(schema.columns[2].type).toContain('Tuple');
    });
  });

  // ==========================================================================
  // Connection Timeout Tests
  // ==========================================================================

  describe('connection timeout', () => {
    it('should timeout after configured duration', async () => {
      const config: IcebergConnectionConfig = {
        host: 'slow-server.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
        connectionTimeout: 1000, // 1 second
      };

      // Simulate slow response
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(createMockClickHouseResponse([{ version: '24.3.1' }])), 5000)
          )
      );

      await expect(createIcebergConnection(config)).rejects.toThrow(
        'Connection timeout after 1000ms'
      );
    });

    it('should use default timeout when not specified', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch.mockResolvedValue(createMockClickHouseResponse([{ version: '24.3.1' }]));

      const connection = await createIcebergConnection(config);

      // Default timeout should be 30 seconds
      expect(connection.getTimeout()).toBe(30000);
    });

    it('should handle query timeout separately from connection timeout', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
        connectionTimeout: 5000,
        queryTimeout: 60000,
      };

      mockFetch.mockResolvedValue(createMockClickHouseResponse([{ version: '24.3.1' }]));

      const connection = await createIcebergConnection(config);

      expect(connection.getConnectionTimeout()).toBe(5000);
      expect(connection.getQueryTimeout()).toBe(60000);
    });
  });

  // ==========================================================================
  // Connection Lifecycle Tests
  // ==========================================================================

  describe('connection lifecycle', () => {
    it('should close connection gracefully', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch.mockResolvedValue(createMockClickHouseResponse([{ version: '24.3.1' }]));

      const connection = await createIcebergConnection(config);
      await connection.close();

      expect(connection.isClosed()).toBe(true);
    });

    it('should throw error when using closed connection', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch.mockResolvedValue(createMockClickHouseResponse([{ version: '24.3.1' }]));

      const connection = await createIcebergConnection(config);
      await connection.close();

      await expect(discoverTables(connection)).rejects.toThrow(
        'Connection is closed'
      );
    });

    it('should support connection pooling', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
        poolSize: 5,
      };

      mockFetch.mockResolvedValue(createMockClickHouseResponse([{ version: '24.3.1' }]));

      const connection = await createIcebergConnection(config);

      expect(connection.getPoolSize()).toBe(5);
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      const config: IcebergConnectionConfig = {
        host: 'unreachable.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch.mockRejectedValue(new Error('Network error: ECONNREFUSED'));

      await expect(createIcebergConnection(config)).rejects.toThrow(
        'Failed to connect to ClickHouse: Network error'
      );
    });

    it('should handle SSL/TLS errors', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        secure: true,
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch.mockRejectedValue(new Error('SSL certificate error'));

      await expect(createIcebergConnection(config)).rejects.toThrow(
        'SSL/TLS connection error'
      );
    });

    it('should retry on transient errors', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
        maxRetries: 3,
      };

      mockFetch
        .mockRejectedValueOnce(new Error('Connection reset'))
        .mockRejectedValueOnce(new Error('Connection reset'))
        .mockResolvedValueOnce(createMockClickHouseResponse([{ version: '24.3.1' }]));

      const connection = await createIcebergConnection(config);

      expect(connection).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  // ==========================================================================
  // Metadata Cache Tests (Refactor: workers-3p3vc)
  // ==========================================================================

  describe('metadata caching', () => {
    it('should cache catalog discovery results', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
        enableMetadataCache: true,
        metadataCacheTtl: 60000,
      };

      mockFetch
        .mockResolvedValueOnce(createMockClickHouseResponse([{ version: '24.3.1' }]))
        .mockResolvedValueOnce(
          createMockClickHouseResponse([
            {
              name: 'iceberg_catalog',
              type: 'iceberg',
              warehouse: 's3://data-lake/iceberg',
            },
          ])
        );

      const connection = await createIcebergConnection(config);

      // First call should hit the database
      const catalog1 = await discoverCatalog(connection, 'iceberg_catalog');
      expect(catalog1.name).toBe('iceberg_catalog');

      // Second call should return cached result (no additional fetch)
      const catalog2 = await discoverCatalog(connection, 'iceberg_catalog');
      expect(catalog2.name).toBe('iceberg_catalog');

      // Only 2 fetch calls: connection test + first catalog query
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should cache table discovery results', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
        enableMetadataCache: true,
      };

      mockFetch
        .mockResolvedValueOnce(createMockClickHouseResponse([{ version: '24.3.1' }]))
        .mockResolvedValueOnce(
          createMockClickHouseResponse([
            { namespace: 'analytics', table_name: 'events', format: 'Iceberg' },
          ])
        );

      const connection = await createIcebergConnection(config);

      const tables1 = await discoverTables(connection);
      const tables2 = await discoverTables(connection);

      expect(tables1).toEqual(tables2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should skip cache when skipCache option is set', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
        enableMetadataCache: true,
      };

      mockFetch
        .mockResolvedValueOnce(createMockClickHouseResponse([{ version: '24.3.1' }]))
        .mockResolvedValueOnce(
          createMockClickHouseResponse([
            { namespace: 'analytics', table_name: 'events', format: 'Iceberg' },
          ])
        )
        .mockResolvedValueOnce(
          createMockClickHouseResponse([
            { namespace: 'analytics', table_name: 'events', format: 'Iceberg' },
            { namespace: 'analytics', table_name: 'users', format: 'Iceberg' },
          ])
        );

      const connection = await createIcebergConnection(config);

      const tables1 = await discoverTables(connection);
      expect(tables1).toHaveLength(1);

      const tables2 = await discoverTables(connection, { skipCache: true });
      expect(tables2).toHaveLength(2);

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should clear cache on connection close', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
        enableMetadataCache: true,
      };

      mockFetch.mockResolvedValue(createMockClickHouseResponse([{ version: '24.3.1' }]));

      const connection = await createIcebergConnection(config);
      expect(connection.getCacheStats().enabled).toBe(true);

      await connection.close();
      expect(connection.getCacheStats().size).toBe(0);
    });

    it('should provide cache statistics', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
        enableMetadataCache: true,
        metadataCacheTtl: 120000,
      };

      mockFetch.mockResolvedValue(createMockClickHouseResponse([{ version: '24.3.1' }]));

      const connection = await createIcebergConnection(config);
      const stats = connection.getCacheStats();

      expect(stats.enabled).toBe(true);
      expect(stats.ttl).toBe(120000);
      expect(stats.size).toBe(0);
    });
  });

  // ==========================================================================
  // Unified Iceberg API Tests (Refactor: workers-3p3vc)
  // ==========================================================================

  describe('Unified Iceberg API', () => {
    it('should create connection via Iceberg.connect', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch.mockResolvedValue(createMockClickHouseResponse([{ version: '24.3.1' }]));

      const iceberg = await Iceberg.connect(config);

      expect(iceberg).toBeDefined();
      expect(iceberg.isClosed()).toBe(false);

      await iceberg.close();
      expect(iceberg.isClosed()).toBe(true);
    });

    it('should provide access to underlying client', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch.mockResolvedValue(createMockClickHouseResponse([{ version: '24.3.1' }]));

      const iceberg = await Iceberg.connect(config);

      expect(iceberg.client).toBeInstanceOf(ClickHouseIcebergClient);
      expect(iceberg.client.getConfig().database).toBe('analytics');
    });

    it('should discover catalog through unified API', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch
        .mockResolvedValueOnce(createMockClickHouseResponse([{ version: '24.3.1' }]))
        .mockResolvedValueOnce(
          createMockClickHouseResponse([
            {
              name: 'iceberg_catalog',
              type: 'iceberg',
              warehouse: 's3://data-lake/iceberg',
            },
          ])
        );

      const iceberg = await Iceberg.connect(config);
      const catalog = await iceberg.catalog();

      expect(catalog.name).toBe('iceberg_catalog');
      expect(catalog.warehouse).toBe('s3://data-lake/iceberg');
    });

    it('should list tables through unified API', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch
        .mockResolvedValueOnce(createMockClickHouseResponse([{ version: '24.3.1' }]))
        .mockResolvedValueOnce(
          createMockClickHouseResponse([
            { namespace: 'analytics', table_name: 'events', format: 'Iceberg' },
            { namespace: 'analytics', table_name: 'users', format: 'Iceberg' },
          ])
        );

      const iceberg = await Iceberg.connect(config);
      const tables = await iceberg.tables();

      expect(tables).toHaveLength(2);
      expect(tables[0].name).toBe('events');
    });

    it('should get schema through unified API', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch
        .mockResolvedValueOnce(createMockClickHouseResponse([{ version: '24.3.1' }]))
        .mockResolvedValueOnce(
          createMockClickHouseResponse([
            { name: 'id', type: 'String', position: 0 },
            { name: 'timestamp', type: 'DateTime64', position: 1 },
          ])
        );

      const iceberg = await Iceberg.connect(config);
      const schema = await iceberg.schema('events');

      expect(schema.columns).toHaveLength(2);
      expect(schema.columns[0].name).toBe('id');
    });

    it('should execute raw queries through unified API', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch
        .mockResolvedValueOnce(createMockClickHouseResponse([{ version: '24.3.1' }]))
        .mockResolvedValueOnce(createMockClickHouseResponse([{ count: 42 }]));

      const iceberg = await Iceberg.connect(config);
      const result = await iceberg.query<{ count: number }>('SELECT count() as count FROM events');

      expect(result.data[0].count).toBe(42);
    });
  });

  // ==========================================================================
  // Typed Error Tests (Refactor: workers-3p3vc)
  // ==========================================================================

  describe('typed errors', () => {
    it('should throw IcebergCatalogError when catalog not found', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'nonexistent',
      };

      mockFetch
        .mockResolvedValueOnce(createMockClickHouseResponse([{ version: '24.3.1' }]))
        .mockResolvedValueOnce(createMockClickHouseResponse([]));

      const connection = await createIcebergConnection(config);

      try {
        await discoverCatalog(connection, 'nonexistent');
        expect.fail('Should have thrown IcebergCatalogError');
      } catch (error) {
        expect(error).toBeInstanceOf(IcebergCatalogError);
        expect((error as IcebergCatalogError).catalogName).toBe('nonexistent');
      }
    });

    it('should throw IcebergTableError when table not found', async () => {
      const config: IcebergConnectionConfig = {
        host: 'clickhouse.example.com',
        port: 8443,
        database: 'analytics',
        icebergCatalog: 'iceberg_catalog',
      };

      mockFetch
        .mockResolvedValueOnce(createMockClickHouseResponse([{ version: '24.3.1' }]))
        .mockResolvedValueOnce(createMockClickHouseResponse([]));

      const connection = await createIcebergConnection(config);

      try {
        await getTableSchema(connection, 'nonexistent');
        expect.fail('Should have thrown IcebergTableError');
      } catch (error) {
        expect(error).toBeInstanceOf(IcebergTableError);
        expect((error as IcebergTableError).tableName).toBe('nonexistent');
      }
    });
  });
});
