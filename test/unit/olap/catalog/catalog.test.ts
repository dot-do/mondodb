/**
 * R2 Data Catalog Operations Tests (TDD - RED phase)
 *
 * Tests for Cloudflare R2 Data Catalog management including:
 * - Catalog enablement on R2 buckets
 * - Namespace management (list, create, delete)
 * - Table listing and discovery
 * - Error handling for catalog operations
 *
 * Issue: mondodb-jtgp - R2 Data Catalog Management Tests
 *
 * NOTE: All describe blocks are marked with .skip because the implementations
 * for R2DataCatalog and related functions do not yet exist in src/olap/catalog/.
 * These are intentional RED tests awaiting implementation.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// =============================================================================
// Type Definitions (to be implemented in src/olap/catalog/index.ts)
// =============================================================================

/**
 * R2 Catalog configuration options
 */
interface R2CatalogConfig {
  /** Account ID for the Cloudflare account */
  accountId: string;
  /** Bucket name where the catalog is stored */
  bucketName: string;
  /** Optional API token for authentication */
  apiToken?: string;
  /** Optional region for R2 bucket */
  region?: string;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
}

/**
 * Represents an R2 Data Catalog
 */
interface R2DataCatalog {
  /** Catalog name */
  name: string;
  /** R2 bucket name */
  bucket: string;
  /** Whether the catalog is enabled */
  enabled: boolean;
  /** Catalog location (R2 path) */
  location: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Last updated timestamp */
  updatedAt?: Date;
  /** Number of namespaces in the catalog */
  namespaceCount?: number;
  /** Number of tables in the catalog */
  tableCount?: number;
}

/**
 * Represents a namespace (schema) in the catalog
 */
interface CatalogNamespace {
  /** Namespace name */
  name: string;
  /** Full path in R2 */
  location: string;
  /** Number of tables in this namespace */
  tableCount: number;
  /** Creation timestamp */
  createdAt: Date;
  /** Namespace properties */
  properties?: Record<string, string>;
}

/**
 * Table summary returned when listing tables
 */
interface CatalogTableSummary {
  /** Table name */
  name: string;
  /** Namespace containing this table */
  namespace: string;
  /** Table type (iceberg, etc.) */
  type: string;
  /** Table location in R2 */
  location: string;
  /** Current snapshot ID */
  currentSnapshotId?: string;
}

/**
 * Options for enabling catalog on a bucket
 */
interface EnableCatalogOptions {
  /** Catalog name (defaults to bucket name) */
  catalogName?: string;
  /** Initial namespace to create */
  defaultNamespace?: string;
  /** Metadata location within bucket */
  metadataLocation?: string;
}

/**
 * Options for listing namespaces
 */
interface ListNamespacesOptions {
  /** Maximum number of namespaces to return */
  limit?: number;
  /** Continuation token for pagination */
  cursor?: string;
  /** Filter by namespace prefix */
  prefix?: string;
}

/**
 * Options for listing tables
 */
interface ListTablesOptions {
  /** Namespace to list tables from */
  namespace: string;
  /** Maximum number of tables to return */
  limit?: number;
  /** Continuation token for pagination */
  cursor?: string;
  /** Filter by table prefix */
  prefix?: string;
}

/**
 * Result of a paginated list operation
 */
interface PaginatedResult<T> {
  items: T[];
  cursor?: string;
  hasMore: boolean;
}

/**
 * Error thrown when catalog operations fail
 */
class CatalogError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'CatalogError';
  }
}

// =============================================================================
// Mock R2 Catalog Client (to be implemented)
// =============================================================================

class R2CatalogClient {
  private _config: R2CatalogConfig;
  private _closed = false;

  constructor(config: R2CatalogConfig) {
    this._config = config;
    // Not implemented - will throw in tests
    throw new Error('Not implemented');
  }

  getConfig(): R2CatalogConfig {
    throw new Error('Not implemented');
  }

  isClosed(): boolean {
    throw new Error('Not implemented');
  }

  async close(): Promise<void> {
    throw new Error('Not implemented');
  }

  async enableCatalog(options?: EnableCatalogOptions): Promise<R2DataCatalog> {
    throw new Error('Not implemented');
  }

  async disableCatalog(): Promise<void> {
    throw new Error('Not implemented');
  }

  async getCatalogInfo(): Promise<R2DataCatalog | null> {
    throw new Error('Not implemented');
  }

  async isCatalogEnabled(): Promise<boolean> {
    throw new Error('Not implemented');
  }

  async listNamespaces(options?: ListNamespacesOptions): Promise<PaginatedResult<CatalogNamespace>> {
    throw new Error('Not implemented');
  }

  async createNamespace(name: string, properties?: Record<string, string>): Promise<CatalogNamespace> {
    throw new Error('Not implemented');
  }

  async deleteNamespace(name: string): Promise<void> {
    throw new Error('Not implemented');
  }

  async getNamespace(name: string): Promise<CatalogNamespace | null> {
    throw new Error('Not implemented');
  }

  async listTables(options: ListTablesOptions): Promise<PaginatedResult<CatalogTableSummary>> {
    throw new Error('Not implemented');
  }

  async getTableMetadata(namespace: string, tableName: string): Promise<Record<string, unknown> | null> {
    throw new Error('Not implemented');
  }
}

// Factory function to create client
async function createR2CatalogClient(config: R2CatalogConfig): Promise<R2CatalogClient> {
  throw new Error('Not implemented');
}

// =============================================================================
// Mock Helpers
// =============================================================================

function createMockR2Response<T>(data: T) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

function createMockErrorResponse(message: string, code: string, statusCode: number = 400) {
  return {
    ok: false,
    status: statusCode,
    json: () => Promise.resolve({ error: { message, code } }),
    text: () => Promise.resolve(JSON.stringify({ error: { message, code } })),
  };
}

// =============================================================================
// R2 Catalog Client Tests
// =============================================================================

describe.skip('R2CatalogClient', () => {
  let mockFetch: Mock;
  const testConfig: R2CatalogConfig = {
    accountId: 'test-account-123',
    bucketName: 'analytics-bucket',
    apiToken: 'test-api-token',
    region: 'auto',
  };

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  // ==========================================================================
  // Client Creation Tests
  // ==========================================================================

  describe('createR2CatalogClient', () => {
    it('should create client with valid configuration', async () => {
      mockFetch.mockResolvedValue(createMockR2Response({ success: true }));

      const client = await createR2CatalogClient(testConfig);

      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(R2CatalogClient);
    });

    it('should throw error for missing account ID', async () => {
      const invalidConfig = { ...testConfig, accountId: '' };

      await expect(createR2CatalogClient(invalidConfig)).rejects.toThrow(
        'Invalid configuration: accountId is required'
      );
    });

    it('should throw error for missing bucket name', async () => {
      const invalidConfig = { ...testConfig, bucketName: '' };

      await expect(createR2CatalogClient(invalidConfig)).rejects.toThrow(
        'Invalid configuration: bucketName is required'
      );
    });

    it('should use default timeout when not specified', async () => {
      mockFetch.mockResolvedValue(createMockR2Response({ success: true }));

      const client = await createR2CatalogClient({
        accountId: 'test',
        bucketName: 'test',
      });

      expect(client.getConfig().connectionTimeout).toBe(30000);
    });

    it('should handle authentication errors', async () => {
      mockFetch.mockResolvedValue(
        createMockErrorResponse('Invalid API token', 'AUTH_ERROR', 401)
      );

      await expect(createR2CatalogClient(testConfig)).rejects.toThrow(
        'Authentication failed'
      );
    });
  });

  // ==========================================================================
  // Catalog Enablement Tests
  // ==========================================================================

  describe('enableCatalog', () => {
    it('should enable catalog on bucket', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockR2Response({
            catalog: {
              name: 'analytics-bucket',
              bucket: 'analytics-bucket',
              enabled: true,
              location: 's3://analytics-bucket/catalog/',
              createdAt: '2024-01-15T10:00:00Z',
            },
          })
        );

      const client = await createR2CatalogClient(testConfig);
      const catalog = await client.enableCatalog();

      expect(catalog).toBeDefined();
      expect(catalog.enabled).toBe(true);
      expect(catalog.bucket).toBe('analytics-bucket');
    });

    it('should enable catalog with custom name', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockR2Response({
            catalog: {
              name: 'my-custom-catalog',
              bucket: 'analytics-bucket',
              enabled: true,
              location: 's3://analytics-bucket/catalog/',
              createdAt: '2024-01-15T10:00:00Z',
            },
          })
        );

      const client = await createR2CatalogClient(testConfig);
      const catalog = await client.enableCatalog({ catalogName: 'my-custom-catalog' });

      expect(catalog.name).toBe('my-custom-catalog');
    });

    it('should create default namespace when specified', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockR2Response({
            catalog: {
              name: 'analytics-bucket',
              bucket: 'analytics-bucket',
              enabled: true,
              location: 's3://analytics-bucket/catalog/',
              createdAt: '2024-01-15T10:00:00Z',
              namespaceCount: 1,
            },
          })
        );

      const client = await createR2CatalogClient(testConfig);
      const catalog = await client.enableCatalog({ defaultNamespace: 'default' });

      expect(catalog.namespaceCount).toBe(1);
    });

    it('should throw error if catalog already enabled', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockErrorResponse('Catalog already enabled on this bucket', 'CATALOG_EXISTS', 409)
        );

      const client = await createR2CatalogClient(testConfig);

      await expect(client.enableCatalog()).rejects.toThrow(
        'Catalog already enabled on this bucket'
      );
    });

    it('should handle bucket not found error', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockErrorResponse('Bucket not found', 'BUCKET_NOT_FOUND', 404)
        );

      const client = await createR2CatalogClient(testConfig);

      await expect(client.enableCatalog()).rejects.toThrow(
        'Bucket not found'
      );
    });
  });

  // ==========================================================================
  // Catalog Info Tests
  // ==========================================================================

  describe('getCatalogInfo', () => {
    it('should get catalog information', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockR2Response({
            catalog: {
              name: 'analytics-bucket',
              bucket: 'analytics-bucket',
              enabled: true,
              location: 's3://analytics-bucket/catalog/',
              createdAt: '2024-01-15T10:00:00Z',
              updatedAt: '2024-01-16T14:30:00Z',
              namespaceCount: 3,
              tableCount: 15,
            },
          })
        );

      const client = await createR2CatalogClient(testConfig);
      const catalog = await client.getCatalogInfo();

      expect(catalog).toBeDefined();
      expect(catalog!.name).toBe('analytics-bucket');
      expect(catalog!.namespaceCount).toBe(3);
      expect(catalog!.tableCount).toBe(15);
    });

    it('should return null when catalog not enabled', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(createMockR2Response({ catalog: null }));

      const client = await createR2CatalogClient(testConfig);
      const catalog = await client.getCatalogInfo();

      expect(catalog).toBeNull();
    });

    it('should include catalog timestamps as Date objects', async () => {
      const createdAt = '2024-01-15T10:00:00Z';
      const updatedAt = '2024-01-16T14:30:00Z';

      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockR2Response({
            catalog: {
              name: 'test',
              bucket: 'test',
              enabled: true,
              location: 's3://test/',
              createdAt,
              updatedAt,
            },
          })
        );

      const client = await createR2CatalogClient(testConfig);
      const catalog = await client.getCatalogInfo();

      expect(catalog!.createdAt).toBeInstanceOf(Date);
      expect(catalog!.updatedAt).toBeInstanceOf(Date);
      expect(catalog!.createdAt.toISOString()).toBe(createdAt);
    });
  });

  // ==========================================================================
  // Catalog Status Tests
  // ==========================================================================

  describe('isCatalogEnabled', () => {
    it('should return true when catalog is enabled', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(createMockR2Response({ enabled: true }));

      const client = await createR2CatalogClient(testConfig);
      const enabled = await client.isCatalogEnabled();

      expect(enabled).toBe(true);
    });

    it('should return false when catalog is not enabled', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(createMockR2Response({ enabled: false }));

      const client = await createR2CatalogClient(testConfig);
      const enabled = await client.isCatalogEnabled();

      expect(enabled).toBe(false);
    });
  });

  // ==========================================================================
  // Disable Catalog Tests
  // ==========================================================================

  describe('disableCatalog', () => {
    it('should disable catalog', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(createMockR2Response({ success: true }));

      const client = await createR2CatalogClient(testConfig);
      await expect(client.disableCatalog()).resolves.toBeUndefined();
    });

    it('should throw error if catalog has tables', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockErrorResponse(
            'Cannot disable catalog with existing tables',
            'CATALOG_NOT_EMPTY',
            400
          )
        );

      const client = await createR2CatalogClient(testConfig);

      await expect(client.disableCatalog()).rejects.toThrow(
        'Cannot disable catalog with existing tables'
      );
    });

    it('should throw error if catalog not enabled', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockErrorResponse('Catalog not enabled', 'CATALOG_NOT_FOUND', 404)
        );

      const client = await createR2CatalogClient(testConfig);

      await expect(client.disableCatalog()).rejects.toThrow(
        'Catalog not enabled'
      );
    });
  });
});

// =============================================================================
// Namespace Management Tests
// =============================================================================

describe.skip('Namespace Management', () => {
  let mockFetch: Mock;
  const testConfig: R2CatalogConfig = {
    accountId: 'test-account-123',
    bucketName: 'analytics-bucket',
    apiToken: 'test-api-token',
  };

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  // ==========================================================================
  // List Namespaces Tests
  // ==========================================================================

  describe('listNamespaces', () => {
    it('should list all namespaces', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockR2Response({
            namespaces: [
              {
                name: 'default',
                location: 's3://analytics-bucket/catalog/default/',
                tableCount: 5,
                createdAt: '2024-01-15T10:00:00Z',
              },
              {
                name: 'staging',
                location: 's3://analytics-bucket/catalog/staging/',
                tableCount: 2,
                createdAt: '2024-01-16T10:00:00Z',
              },
              {
                name: 'production',
                location: 's3://analytics-bucket/catalog/production/',
                tableCount: 10,
                createdAt: '2024-01-17T10:00:00Z',
              },
            ],
            hasMore: false,
          })
        );

      const client = await createR2CatalogClient(testConfig);
      const result = await client.listNamespaces();

      expect(result.items).toHaveLength(3);
      expect(result.items.map((ns) => ns.name)).toEqual(['default', 'staging', 'production']);
      expect(result.hasMore).toBe(false);
    });

    it('should support pagination with limit', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockR2Response({
            namespaces: [
              { name: 'ns1', location: 's3://bucket/ns1/', tableCount: 1, createdAt: '2024-01-15T10:00:00Z' },
              { name: 'ns2', location: 's3://bucket/ns2/', tableCount: 2, createdAt: '2024-01-15T11:00:00Z' },
            ],
            cursor: 'next-page-token',
            hasMore: true,
          })
        );

      const client = await createR2CatalogClient(testConfig);
      const result = await client.listNamespaces({ limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.cursor).toBe('next-page-token');
      expect(result.hasMore).toBe(true);
    });

    it('should support pagination with cursor', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockR2Response({
            namespaces: [
              { name: 'ns3', location: 's3://bucket/ns3/', tableCount: 3, createdAt: '2024-01-15T12:00:00Z' },
            ],
            hasMore: false,
          })
        );

      const client = await createR2CatalogClient(testConfig);
      const result = await client.listNamespaces({ cursor: 'next-page-token' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('ns3');
      expect(result.hasMore).toBe(false);
    });

    it('should filter namespaces by prefix', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockR2Response({
            namespaces: [
              { name: 'prod_us', location: 's3://bucket/prod_us/', tableCount: 5, createdAt: '2024-01-15T10:00:00Z' },
              { name: 'prod_eu', location: 's3://bucket/prod_eu/', tableCount: 3, createdAt: '2024-01-15T11:00:00Z' },
            ],
            hasMore: false,
          })
        );

      const client = await createR2CatalogClient(testConfig);
      const result = await client.listNamespaces({ prefix: 'prod_' });

      expect(result.items).toHaveLength(2);
      expect(result.items.every((ns) => ns.name.startsWith('prod_'))).toBe(true);
    });

    it('should return empty list when no namespaces exist', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockR2Response({
            namespaces: [],
            hasMore: false,
          })
        );

      const client = await createR2CatalogClient(testConfig);
      const result = await client.listNamespaces();

      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it('should throw error when catalog not enabled', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockErrorResponse('Catalog not enabled', 'CATALOG_NOT_ENABLED', 400)
        );

      const client = await createR2CatalogClient(testConfig);

      await expect(client.listNamespaces()).rejects.toThrow(
        'Catalog not enabled'
      );
    });
  });

  // ==========================================================================
  // Create Namespace Tests
  // ==========================================================================

  describe('createNamespace', () => {
    it('should create namespace', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockR2Response({
            namespace: {
              name: 'analytics',
              location: 's3://analytics-bucket/catalog/analytics/',
              tableCount: 0,
              createdAt: '2024-01-15T10:00:00Z',
            },
          })
        );

      const client = await createR2CatalogClient(testConfig);
      const namespace = await client.createNamespace('analytics');

      expect(namespace).toBeDefined();
      expect(namespace.name).toBe('analytics');
      expect(namespace.tableCount).toBe(0);
    });

    it('should create namespace with properties', async () => {
      const properties = {
        owner: 'data-team',
        environment: 'production',
      };

      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockR2Response({
            namespace: {
              name: 'analytics',
              location: 's3://analytics-bucket/catalog/analytics/',
              tableCount: 0,
              createdAt: '2024-01-15T10:00:00Z',
              properties,
            },
          })
        );

      const client = await createR2CatalogClient(testConfig);
      const namespace = await client.createNamespace('analytics', properties);

      expect(namespace.properties).toEqual(properties);
    });

    it('should throw error for invalid namespace name', async () => {
      mockFetch.mockResolvedValueOnce(createMockR2Response({ success: true }));

      const client = await createR2CatalogClient(testConfig);

      await expect(client.createNamespace('invalid/name')).rejects.toThrow(
        'Invalid namespace name'
      );
    });

    it('should throw error if namespace already exists', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockErrorResponse('Namespace already exists', 'NAMESPACE_EXISTS', 409)
        );

      const client = await createR2CatalogClient(testConfig);

      await expect(client.createNamespace('existing')).rejects.toThrow(
        'Namespace already exists'
      );
    });

    it('should throw error when catalog not enabled', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockErrorResponse('Catalog not enabled', 'CATALOG_NOT_ENABLED', 400)
        );

      const client = await createR2CatalogClient(testConfig);

      await expect(client.createNamespace('test')).rejects.toThrow(
        'Catalog not enabled'
      );
    });
  });

  // ==========================================================================
  // Delete Namespace Tests
  // ==========================================================================

  describe('deleteNamespace', () => {
    it('should delete empty namespace', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(createMockR2Response({ success: true }));

      const client = await createR2CatalogClient(testConfig);

      await expect(client.deleteNamespace('empty-ns')).resolves.toBeUndefined();
    });

    it('should throw error if namespace has tables', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockErrorResponse(
            'Cannot delete namespace with existing tables',
            'NAMESPACE_NOT_EMPTY',
            400
          )
        );

      const client = await createR2CatalogClient(testConfig);

      await expect(client.deleteNamespace('non-empty')).rejects.toThrow(
        'Cannot delete namespace with existing tables'
      );
    });

    it('should throw error if namespace not found', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockErrorResponse('Namespace not found', 'NAMESPACE_NOT_FOUND', 404)
        );

      const client = await createR2CatalogClient(testConfig);

      await expect(client.deleteNamespace('nonexistent')).rejects.toThrow(
        'Namespace not found'
      );
    });
  });

  // ==========================================================================
  // Get Namespace Tests
  // ==========================================================================

  describe('getNamespace', () => {
    it('should get namespace details', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockR2Response({
            namespace: {
              name: 'production',
              location: 's3://analytics-bucket/catalog/production/',
              tableCount: 10,
              createdAt: '2024-01-15T10:00:00Z',
              properties: { owner: 'data-team' },
            },
          })
        );

      const client = await createR2CatalogClient(testConfig);
      const namespace = await client.getNamespace('production');

      expect(namespace).toBeDefined();
      expect(namespace!.name).toBe('production');
      expect(namespace!.tableCount).toBe(10);
      expect(namespace!.properties).toEqual({ owner: 'data-team' });
    });

    it('should return null for non-existent namespace', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(createMockR2Response({ namespace: null }));

      const client = await createR2CatalogClient(testConfig);
      const namespace = await client.getNamespace('nonexistent');

      expect(namespace).toBeNull();
    });
  });
});

// =============================================================================
// Table Listing Tests
// =============================================================================

describe.skip('Table Listing', () => {
  let mockFetch: Mock;
  const testConfig: R2CatalogConfig = {
    accountId: 'test-account-123',
    bucketName: 'analytics-bucket',
    apiToken: 'test-api-token',
  };

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  // ==========================================================================
  // List Tables Tests
  // ==========================================================================

  describe('listTables', () => {
    it('should list tables in namespace', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockR2Response({
            tables: [
              {
                name: 'events',
                namespace: 'production',
                type: 'iceberg',
                location: 's3://analytics-bucket/catalog/production/events/',
                currentSnapshotId: 'snap-123',
              },
              {
                name: 'users',
                namespace: 'production',
                type: 'iceberg',
                location: 's3://analytics-bucket/catalog/production/users/',
                currentSnapshotId: 'snap-456',
              },
            ],
            hasMore: false,
          })
        );

      const client = await createR2CatalogClient(testConfig);
      const result = await client.listTables({ namespace: 'production' });

      expect(result.items).toHaveLength(2);
      expect(result.items.map((t) => t.name)).toEqual(['events', 'users']);
    });

    it('should support pagination', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockR2Response({
            tables: [
              { name: 't1', namespace: 'ns', type: 'iceberg', location: 's3://bucket/t1/' },
            ],
            cursor: 'page-2',
            hasMore: true,
          })
        );

      const client = await createR2CatalogClient(testConfig);
      const result = await client.listTables({ namespace: 'ns', limit: 1 });

      expect(result.items).toHaveLength(1);
      expect(result.cursor).toBe('page-2');
      expect(result.hasMore).toBe(true);
    });

    it('should filter by table prefix', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockR2Response({
            tables: [
              { name: 'events_2024_01', namespace: 'production', type: 'iceberg', location: 's3://bucket/events_2024_01/' },
              { name: 'events_2024_02', namespace: 'production', type: 'iceberg', location: 's3://bucket/events_2024_02/' },
            ],
            hasMore: false,
          })
        );

      const client = await createR2CatalogClient(testConfig);
      const result = await client.listTables({ namespace: 'production', prefix: 'events_' });

      expect(result.items).toHaveLength(2);
      expect(result.items.every((t) => t.name.startsWith('events_'))).toBe(true);
    });

    it('should return empty list for namespace with no tables', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockR2Response({
            tables: [],
            hasMore: false,
          })
        );

      const client = await createR2CatalogClient(testConfig);
      const result = await client.listTables({ namespace: 'empty' });

      expect(result.items).toHaveLength(0);
    });

    it('should throw error for non-existent namespace', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockErrorResponse('Namespace not found', 'NAMESPACE_NOT_FOUND', 404)
        );

      const client = await createR2CatalogClient(testConfig);

      await expect(client.listTables({ namespace: 'nonexistent' })).rejects.toThrow(
        'Namespace not found'
      );
    });
  });

  // ==========================================================================
  // Get Table Metadata Tests
  // ==========================================================================

  describe('getTableMetadata', () => {
    it('should get table metadata', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockR2Response({
            metadata: {
              'format-version': 2,
              'table-uuid': 'uuid-123',
              location: 's3://analytics-bucket/catalog/production/events/',
              'last-updated-ms': 1705320000000,
              'current-snapshot-id': 'snap-123',
              schemas: [
                {
                  'schema-id': 0,
                  fields: [
                    { id: 1, name: 'id', type: 'string', required: true },
                    { id: 2, name: 'timestamp', type: 'timestamp', required: true },
                    { id: 3, name: 'event_type', type: 'string', required: false },
                  ],
                },
              ],
            },
          })
        );

      const client = await createR2CatalogClient(testConfig);
      const metadata = await client.getTableMetadata('production', 'events');

      expect(metadata).toBeDefined();
      expect(metadata!['format-version']).toBe(2);
      expect(metadata!['table-uuid']).toBe('uuid-123');
    });

    it('should return null for non-existent table', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(createMockR2Response({ metadata: null }));

      const client = await createR2CatalogClient(testConfig);
      const metadata = await client.getTableMetadata('production', 'nonexistent');

      expect(metadata).toBeNull();
    });

    it('should throw error for invalid namespace', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockR2Response({ success: true }))
        .mockResolvedValueOnce(
          createMockErrorResponse('Namespace not found', 'NAMESPACE_NOT_FOUND', 404)
        );

      const client = await createR2CatalogClient(testConfig);

      await expect(client.getTableMetadata('invalid', 'events')).rejects.toThrow(
        'Namespace not found'
      );
    });
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe.skip('Catalog Error Handling', () => {
  let mockFetch: Mock;
  const testConfig: R2CatalogConfig = {
    accountId: 'test-account-123',
    bucketName: 'analytics-bucket',
    apiToken: 'test-api-token',
  };

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValue(new Error('Network error: ECONNREFUSED'));

    await expect(createR2CatalogClient(testConfig)).rejects.toThrow(
      'Failed to connect to R2: Network error'
    );
  });

  it('should handle timeout errors', async () => {
    const config = { ...testConfig, connectionTimeout: 100 };

    mockFetch.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(createMockR2Response({ success: true })), 5000))
    );

    await expect(createR2CatalogClient(config)).rejects.toThrow(
      'Connection timeout'
    );
  });

  it('should handle rate limiting', async () => {
    mockFetch.mockResolvedValue(
      createMockErrorResponse('Rate limit exceeded', 'RATE_LIMIT', 429)
    );

    await expect(createR2CatalogClient(testConfig)).rejects.toThrow(
      'Rate limit exceeded'
    );
  });

  it('should handle server errors', async () => {
    mockFetch.mockResolvedValue(
      createMockErrorResponse('Internal server error', 'INTERNAL_ERROR', 500)
    );

    await expect(createR2CatalogClient(testConfig)).rejects.toThrow(
      'Internal server error'
    );
  });

  it('should throw error when using closed client', async () => {
    mockFetch.mockResolvedValue(createMockR2Response({ success: true }));

    const client = await createR2CatalogClient(testConfig);
    await client.close();

    await expect(client.listNamespaces()).rejects.toThrow(
      'Client is closed'
    );
  });

  it('should provide error code in CatalogError', async () => {
    mockFetch
      .mockResolvedValueOnce(createMockR2Response({ success: true }))
      .mockResolvedValueOnce(
        createMockErrorResponse('Permission denied', 'PERMISSION_DENIED', 403)
      );

    const client = await createR2CatalogClient(testConfig);

    try {
      await client.listNamespaces();
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogError);
      expect((error as CatalogError).code).toBe('PERMISSION_DENIED');
      expect((error as CatalogError).statusCode).toBe(403);
    }
  });
});
