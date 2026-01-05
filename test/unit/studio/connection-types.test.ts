/**
 * Connection Types Unit Tests
 *
 * Tests for connection type utilities and helpers.
 */

import { describe, it, expect } from 'vitest'
import {
  parseConnectionURI,
  buildConnectionURI,
  generateConnectionId,
  savedToConfig,
  configToSaved,
  DEFAULT_CONNECTION_FORM_VALUES,
  ConnectionFormValues,
  ConnectionConfig,
  SavedConnection,
} from '../../../src/studio/types/connection'

describe('Connection Types', () => {
  describe('parseConnectionURI', () => {
    it('parses basic mondodb URI', () => {
      const result = parseConnectionURI('mondodb://localhost:27017')
      expect(result.host).toBe('localhost')
      expect(result.port).toBe(27017)
    })

    it('parses mongodb URI (compatibility)', () => {
      const result = parseConnectionURI('mongodb://localhost:27017')
      expect(result.host).toBe('localhost')
      expect(result.port).toBe(27017)
    })

    it('parses URI with database name', () => {
      const result = parseConnectionURI('mondodb://localhost:27017/mydb')
      expect(result.database).toBe('mydb')
    })

    it('parses URI with authentication', () => {
      const result = parseConnectionURI('mondodb://user:pass@localhost:27017/mydb')
      expect(result.username).toBe('user')
      expect(result.password).toBe('pass')
      expect(result.authType).toBe('basic')
    })

    it('parses URI with encoded credentials', () => {
      const result = parseConnectionURI('mondodb://user%40domain:pass%3Aword@localhost:27017')
      expect(result.username).toBe('user@domain')
      expect(result.password).toBe('pass:word')
    })

    it('parses URI without port (uses default)', () => {
      const result = parseConnectionURI('mondodb://myhost/mydb')
      expect(result.host).toBe('myhost')
      expect(result.port).toBeUndefined()
    })

    it('handles custom port', () => {
      const result = parseConnectionURI('mondodb://localhost:12345')
      expect(result.port).toBe(12345)
    })

    it('returns original URI on parse failure', () => {
      const result = parseConnectionURI('invalid-uri')
      expect(result.uri).toBe('invalid-uri')
    })

    it('parses empty database as undefined', () => {
      const result = parseConnectionURI('mondodb://localhost:27017/')
      expect(result.database).toBe('test')
    })
  })

  describe('buildConnectionURI', () => {
    it('builds URI with default database', () => {
      const values: ConnectionFormValues = {
        ...DEFAULT_CONNECTION_FORM_VALUES,
        host: 'localhost',
        port: 27017,
      }
      const uri = buildConnectionURI(values)
      // Default database 'test' is included
      expect(uri).toBe('mondodb://localhost/test')
    })

    it('includes custom port with database', () => {
      const values: ConnectionFormValues = {
        ...DEFAULT_CONNECTION_FORM_VALUES,
        host: 'localhost',
        port: 12345,
      }
      const uri = buildConnectionURI(values)
      expect(uri).toBe('mondodb://localhost:12345/test')
    })

    it('includes database name', () => {
      const values: ConnectionFormValues = {
        ...DEFAULT_CONNECTION_FORM_VALUES,
        host: 'localhost',
        port: 27017,
        database: 'mydb',
      }
      const uri = buildConnectionURI(values)
      expect(uri).toBe('mondodb://localhost/mydb')
    })

    it('includes authentication with database', () => {
      const values: ConnectionFormValues = {
        ...DEFAULT_CONNECTION_FORM_VALUES,
        host: 'localhost',
        port: 27017,
        authType: 'basic',
        username: 'user',
        password: 'pass',
        authSource: '',
      }
      const uri = buildConnectionURI(values)
      expect(uri).toBe('mondodb://user:pass@localhost/test')
    })

    it('encodes special characters in credentials', () => {
      const values: ConnectionFormValues = {
        ...DEFAULT_CONNECTION_FORM_VALUES,
        host: 'localhost',
        port: 27017,
        authType: 'basic',
        username: 'user@domain',
        password: 'pass:word',
      }
      const uri = buildConnectionURI(values)
      expect(uri).toContain('user%40domain')
      expect(uri).toContain('pass%3Aword')
    })

    it('includes authSource for basic auth', () => {
      const values: ConnectionFormValues = {
        ...DEFAULT_CONNECTION_FORM_VALUES,
        host: 'localhost',
        port: 27017,
        authType: 'basic',
        username: 'user',
        password: 'pass',
        authSource: 'admin',
      }
      const uri = buildConnectionURI(values)
      expect(uri).toContain('authSource=admin')
    })

    it('includes TLS parameters', () => {
      const values: ConnectionFormValues = {
        ...DEFAULT_CONNECTION_FORM_VALUES,
        host: 'localhost',
        port: 27017,
        tlsEnabled: true,
      }
      const uri = buildConnectionURI(values)
      expect(uri).toContain('tls=true')
    })

    it('includes TLS invalid certificates option', () => {
      const values: ConnectionFormValues = {
        ...DEFAULT_CONNECTION_FORM_VALUES,
        host: 'localhost',
        port: 27017,
        tlsEnabled: true,
        tlsAllowInvalidCertificates: true,
      }
      const uri = buildConnectionURI(values)
      expect(uri).toContain('tlsAllowInvalidCertificates=true')
    })

    it('includes custom timeout', () => {
      const values: ConnectionFormValues = {
        ...DEFAULT_CONNECTION_FORM_VALUES,
        host: 'localhost',
        port: 27017,
        connectTimeoutMS: 5000,
      }
      const uri = buildConnectionURI(values)
      expect(uri).toContain('connectTimeoutMS=5000')
    })

    it('includes custom pool size', () => {
      const values: ConnectionFormValues = {
        ...DEFAULT_CONNECTION_FORM_VALUES,
        host: 'localhost',
        port: 27017,
        maxPoolSize: 50,
      }
      const uri = buildConnectionURI(values)
      expect(uri).toContain('maxPoolSize=50')
    })
  })

  describe('generateConnectionId', () => {
    it('generates unique IDs', () => {
      const id1 = generateConnectionId()
      const id2 = generateConnectionId()
      expect(id1).not.toBe(id2)
    })

    it('generates IDs with conn_ prefix', () => {
      const id = generateConnectionId()
      expect(id).toMatch(/^conn_/)
    })

    it('generates IDs with UUID format', () => {
      const id = generateConnectionId()
      // UUID format after conn_ prefix: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const uuidPart = id.slice('conn_'.length)
      expect(uuidPart).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    })
  })

  describe('savedToConfig', () => {
    it('converts SavedConnection to ConnectionConfig', () => {
      const saved: SavedConnection = {
        id: 'test-id',
        name: 'Test Connection',
        uri: 'mondodb://localhost:27017',
        host: 'localhost',
        port: 27017,
        database: 'testdb',
        auth: { type: 'none' },
        tls: { enabled: false },
        isFavorite: true,
        color: '#ff0000',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
        lastConnectedAt: '2024-01-03T00:00:00.000Z',
      }

      const config = savedToConfig(saved)

      expect(config.id).toBe('test-id')
      expect(config.name).toBe('Test Connection')
      expect(config.createdAt).toBeInstanceOf(Date)
      expect(config.updatedAt).toBeInstanceOf(Date)
      expect(config.lastConnectedAt).toBeInstanceOf(Date)
    })

    it('handles missing lastConnectedAt', () => {
      const saved: SavedConnection = {
        id: 'test-id',
        name: 'Test',
        uri: 'mondodb://localhost:27017',
        host: 'localhost',
        port: 27017,
        auth: { type: 'none' },
        tls: { enabled: false },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }

      const config = savedToConfig(saved)
      expect(config.lastConnectedAt).toBeUndefined()
    })
  })

  describe('configToSaved', () => {
    it('converts ConnectionConfig to SavedConnection', () => {
      const config: ConnectionConfig = {
        id: 'test-id',
        name: 'Test Connection',
        uri: 'mondodb://localhost:27017',
        host: 'localhost',
        port: 27017,
        database: 'testdb',
        auth: { type: 'none' },
        tls: { enabled: false },
        isFavorite: true,
        color: '#ff0000',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
        lastConnectedAt: new Date('2024-01-03T00:00:00.000Z'),
      }

      const saved = configToSaved(config)

      expect(saved.id).toBe('test-id')
      expect(saved.name).toBe('Test Connection')
      expect(typeof saved.createdAt).toBe('string')
      expect(typeof saved.updatedAt).toBe('string')
      expect(typeof saved.lastConnectedAt).toBe('string')
    })

    it('handles missing lastConnectedAt', () => {
      const config: ConnectionConfig = {
        id: 'test-id',
        name: 'Test',
        uri: 'mondodb://localhost:27017',
        host: 'localhost',
        port: 27017,
        auth: { type: 'none' },
        tls: { enabled: false },
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const saved = configToSaved(config)
      expect(saved.lastConnectedAt).toBeUndefined()
    })
  })

  describe('DEFAULT_CONNECTION_FORM_VALUES', () => {
    it('has expected default values', () => {
      expect(DEFAULT_CONNECTION_FORM_VALUES.name).toBe('New Connection')
      expect(DEFAULT_CONNECTION_FORM_VALUES.connectionMethod).toBe('uri')
      expect(DEFAULT_CONNECTION_FORM_VALUES.uri).toBe('mondodb://localhost:27017')
      expect(DEFAULT_CONNECTION_FORM_VALUES.host).toBe('localhost')
      expect(DEFAULT_CONNECTION_FORM_VALUES.port).toBe(27017)
      expect(DEFAULT_CONNECTION_FORM_VALUES.database).toBe('test')
      expect(DEFAULT_CONNECTION_FORM_VALUES.authType).toBe('none')
      expect(DEFAULT_CONNECTION_FORM_VALUES.tlsEnabled).toBe(false)
      expect(DEFAULT_CONNECTION_FORM_VALUES.connectTimeoutMS).toBe(10000)
      expect(DEFAULT_CONNECTION_FORM_VALUES.maxPoolSize).toBe(100)
    })
  })
})
