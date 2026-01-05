/**
 * TLS Support Tests
 *
 * Tests for TLS configuration in the wire protocol server.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  WireProtocolServer,
  type ServerOptions,
  type TlsOptions,
} from '../../../src/wire/server.js'
import type { MondoBackend } from '../../../src/wire/backend/interface.js'

// Mock backend for testing
const createMockBackend = (): MondoBackend => ({
  listDatabases: async () => [],
  listCollections: async () => [],
  getDbStats: async () => ({
    db: 'test',
    collections: 0,
    objects: 0,
    avgObjSize: 0,
    dataSize: 0,
    storageSize: 0,
    indexes: 0,
    indexSize: 0,
  }),
  getCollectionStats: async () => ({
    ns: 'test.test',
    count: 0,
    size: 0,
    avgObjSize: 0,
    storageSize: 0,
    capped: false,
    nindexes: 0,
    totalIndexSize: 0,
  }),
  find: async () => ({ documents: [], cursorId: BigInt(0) }),
  insertOne: async () => ({ insertedId: { $oid: 'test' } }),
  insertMany: async () => ({ insertedIds: [] }),
  updateOne: async () => ({ matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }),
  updateMany: async () => ({ matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }),
  deleteOne: async () => ({ deletedCount: 0 }),
  deleteMany: async () => ({ deletedCount: 0 }),
  aggregate: async () => ({ documents: [], cursorId: BigInt(0) }),
  createCollection: async () => ({ ok: 1 }),
  dropCollection: async () => true,
  dropDatabase: async () => true,
  createIndex: async () => 'index_name',
  dropIndex: async () => ({ ok: 1 }),
  listIndexes: async () => [],
  getMore: async () => ({ documents: [], cursorId: BigInt(0) }),
  killCursors: async () => ({ ok: 1, cursorsKilled: [] }),
  count: async () => 0,
  distinct: async () => [],
  findAndModify: async () => ({ value: null }),
})

describe('TLS Configuration', () => {
  describe('ServerOptions with TLS', () => {
    it('should accept TLS configuration', () => {
      const options: ServerOptions = {
        port: 27018,
        host: 'localhost',
        tls: {
          key: '/path/to/key.pem',
          cert: '/path/to/cert.pem',
        },
      }

      expect(options.tls).toBeDefined()
      expect(options.tls!.key).toBe('/path/to/key.pem')
      expect(options.tls!.cert).toBe('/path/to/cert.pem')
    })

    it('should accept full TLS configuration', () => {
      const tlsOptions: TlsOptions = {
        key: Buffer.from('private-key-content'),
        cert: Buffer.from('certificate-content'),
        ca: Buffer.from('ca-certificate'),
        passphrase: 'secret',
        requestCert: true,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3',
        serverName: 'mongo.do.example.com',
        ALPNProtocols: ['mongodb'],
      }

      expect(tlsOptions.passphrase).toBe('secret')
      expect(tlsOptions.requestCert).toBe(true)
      expect(tlsOptions.minVersion).toBe('TLSv1.2')
      expect(tlsOptions.maxVersion).toBe('TLSv1.3')
    })

    it('should accept CA as array', () => {
      const tlsOptions: TlsOptions = {
        key: '/path/to/key.pem',
        cert: '/path/to/cert.pem',
        ca: [
          '/path/to/ca1.pem',
          '/path/to/ca2.pem',
          Buffer.from('ca-cert-content'),
        ],
      }

      expect(Array.isArray(tlsOptions.ca)).toBe(true)
      expect((tlsOptions.ca as any[]).length).toBe(3)
    })
  })

  describe('WireProtocolServer with TLS', () => {
    let server: WireProtocolServer
    const mockBackend = createMockBackend()

    afterEach(async () => {
      if (server) {
        await server.stop()
      }
    })

    it('should create server without TLS (default)', () => {
      server = new WireProtocolServer(mockBackend, {
        port: 27020,
        host: 'localhost',
      })

      expect(server.isTls).toBe(false)
    })

    it('should report TLS status when configured', () => {
      server = new WireProtocolServer(mockBackend, {
        port: 27021,
        host: 'localhost',
        tls: {
          key: '/path/to/key.pem',
          cert: '/path/to/cert.pem',
        },
      })

      expect(server.isTls).toBe(true)
    })

    it('should include TLS in address info', () => {
      server = new WireProtocolServer(mockBackend, {
        port: 27022,
        host: 'localhost',
        tls: {
          key: '/path/to/key.pem',
          cert: '/path/to/cert.pem',
        },
      })

      const address = server.address
      expect(address.host).toBe('localhost')
      expect(address.port).toBe(27022)
      expect(address.tls).toBe(true)
    })

    it('should generate correct connection string for non-TLS', () => {
      server = new WireProtocolServer(mockBackend, {
        port: 27023,
        host: 'localhost',
      })

      expect(server.connectionString).toBe('mongodb://localhost:27023')
    })

    it('should generate correct connection string for TLS', () => {
      server = new WireProtocolServer(mockBackend, {
        port: 27024,
        host: 'localhost',
        tls: {
          key: '/path/to/key.pem',
          cert: '/path/to/cert.pem',
        },
      })

      expect(server.connectionString).toBe('mongodb+ssl://localhost:27024')
    })
  })

  describe('TLS graceful fallback', () => {
    it('should work without TLS config (development mode)', () => {
      const server = new WireProtocolServer(createMockBackend(), {
        port: 27025,
      })

      // Server should be created successfully without TLS
      expect(server.isTls).toBe(false)
      expect(server.address.tls).toBe(false)
    })

    it('should work with empty options', () => {
      const server = new WireProtocolServer(createMockBackend())

      expect(server.isTls).toBe(false)
      expect(server.address.port).toBe(27017)
      expect(server.address.host).toBe('localhost')
    })
  })

  describe('TLS + Auth combined configuration', () => {
    it('should support both TLS and auth together', () => {
      const options: ServerOptions = {
        port: 27026,
        host: 'localhost',
        tls: {
          key: '/path/to/key.pem',
          cert: '/path/to/cert.pem',
          minVersion: 'TLSv1.2',
        },
        auth: {
          enabled: true,
          username: 'admin',
          password: 'secret',
        },
      }

      const server = new WireProtocolServer(createMockBackend(), options)

      expect(server.isTls).toBe(true)
      expect(server.address.tls).toBe(true)
    })
  })
})

describe('TLS Version Configuration', () => {
  it('should accept all valid TLS versions', () => {
    const versions: Array<'TLSv1' | 'TLSv1.1' | 'TLSv1.2' | 'TLSv1.3'> = [
      'TLSv1',
      'TLSv1.1',
      'TLSv1.2',
      'TLSv1.3',
    ]

    for (const version of versions) {
      const options: TlsOptions = {
        key: '/path/to/key.pem',
        cert: '/path/to/cert.pem',
        minVersion: version,
        maxVersion: version,
      }

      expect(options.minVersion).toBe(version)
      expect(options.maxVersion).toBe(version)
    }
  })
})

describe('Mutual TLS (mTLS) Configuration', () => {
  it('should support client certificate request', () => {
    const tlsOptions: TlsOptions = {
      key: '/path/to/key.pem',
      cert: '/path/to/cert.pem',
      ca: '/path/to/client-ca.pem',
      requestCert: true,
      rejectUnauthorized: true,
    }

    expect(tlsOptions.requestCert).toBe(true)
    expect(tlsOptions.rejectUnauthorized).toBe(true)
  })

  it('should allow optional client certs', () => {
    const tlsOptions: TlsOptions = {
      key: '/path/to/key.pem',
      cert: '/path/to/cert.pem',
      requestCert: true,
      rejectUnauthorized: false, // Accept connections even without valid client cert
    }

    expect(tlsOptions.requestCert).toBe(true)
    expect(tlsOptions.rejectUnauthorized).toBe(false)
  })
})
