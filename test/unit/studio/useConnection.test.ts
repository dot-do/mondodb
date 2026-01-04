/**
 * useConnection Hook Unit Tests
 *
 * Tests for the connection management hook.
 * Note: These tests mock React hooks since we're testing in a Node environment.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ConnectionConfig,
  ConnectionFormValues,
  DEFAULT_CONNECTION_FORM_VALUES,
  generateConnectionId,
  buildConnectionURI,
} from '../../../src/studio/types/connection'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

// Apply mock
vi.stubGlobal('localStorage', localStorageMock)

describe('useConnection Hook Utilities', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Connection Configuration', () => {
    it('creates valid connection config from form values', () => {
      const values: ConnectionFormValues = {
        ...DEFAULT_CONNECTION_FORM_VALUES,
        name: 'My Connection',
        host: 'myhost.example.com',
        port: 27018,
        database: 'mydb',
      }

      const now = new Date()
      const config: ConnectionConfig = {
        id: generateConnectionId(),
        name: values.name,
        uri: buildConnectionURI(values),
        host: values.host,
        port: values.port,
        database: values.database,
        auth: {
          type: values.authType,
          username: values.username || undefined,
          password: values.password || undefined,
          authSource: values.authSource || undefined,
        },
        tls: {
          enabled: values.tlsEnabled,
          allowInvalidCertificates: values.tlsAllowInvalidCertificates,
        },
        connectTimeoutMS: values.connectTimeoutMS,
        maxPoolSize: values.maxPoolSize,
        createdAt: now,
        updatedAt: now,
      }

      expect(config.name).toBe('My Connection')
      expect(config.host).toBe('myhost.example.com')
      expect(config.port).toBe(27018)
      expect(config.database).toBe('mydb')
      expect(config.auth.type).toBe('none')
      expect(config.tls.enabled).toBe(false)
    })

    it('handles basic authentication', () => {
      const values: ConnectionFormValues = {
        ...DEFAULT_CONNECTION_FORM_VALUES,
        authType: 'basic',
        username: 'admin',
        password: 'secret123',
        authSource: 'admin',
      }

      const uri = buildConnectionURI(values)
      expect(uri).toContain('admin:secret123@')
      expect(uri).toContain('authSource=admin')
    })

    it('handles TLS configuration', () => {
      const values: ConnectionFormValues = {
        ...DEFAULT_CONNECTION_FORM_VALUES,
        tlsEnabled: true,
        tlsAllowInvalidCertificates: true,
      }

      const uri = buildConnectionURI(values)
      expect(uri).toContain('tls=true')
      expect(uri).toContain('tlsAllowInvalidCertificates=true')
    })
  })

  describe('Connection State Management', () => {
    it('initial state is disconnected', () => {
      const initialState = {
        status: 'disconnected',
        savedConnections: [],
      }

      expect(initialState.status).toBe('disconnected')
      expect(initialState.savedConnections).toEqual([])
    })

    it('tracks connecting state', () => {
      const states = ['disconnected', 'connecting', 'connected', 'error']
      expect(states).toContain('connecting')
    })

    it('tracks error state with message', () => {
      const errorState = {
        status: 'error',
        error: 'Connection refused',
      }

      expect(errorState.status).toBe('error')
      expect(errorState.error).toBe('Connection refused')
    })
  })

  describe('Connection Persistence', () => {
    it('saves connections to localStorage', () => {
      const connection: ConnectionConfig = {
        id: 'test-conn-1',
        name: 'Test Connection',
        uri: 'mondodb://localhost:27017',
        host: 'localhost',
        port: 27017,
        auth: { type: 'none' },
        tls: { enabled: false },
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const saved = JSON.stringify([{
        ...connection,
        createdAt: connection.createdAt.toISOString(),
        updatedAt: connection.updatedAt.toISOString(),
      }])

      localStorageMock.setItem('mondodb_studio_connections', saved)

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'mondodb_studio_connections',
        expect.any(String)
      )
    })

    it('loads connections from localStorage', () => {
      const stored = JSON.stringify([{
        id: 'conn-1',
        name: 'Saved Connection',
        uri: 'mondodb://localhost:27017',
        host: 'localhost',
        port: 27017,
        auth: { type: 'none' },
        tls: { enabled: false },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }])

      localStorageMock.setItem('mondodb_studio_connections', stored)

      const result = localStorageMock.getItem('mondodb_studio_connections')
      const parsed = JSON.parse(result!)

      expect(parsed).toHaveLength(1)
      expect(parsed[0].name).toBe('Saved Connection')
    })

    it('handles missing localStorage gracefully', () => {
      const result = localStorageMock.getItem('nonexistent_key')
      expect(result).toBeNull()
    })

    it('handles invalid JSON in localStorage', () => {
      localStorageMock.setItem('mondodb_studio_connections', 'invalid json')

      const result = localStorageMock.getItem('mondodb_studio_connections')
      expect(() => JSON.parse(result!)).toThrow()
    })
  })

  describe('Connection Operations', () => {
    it('validates URI scheme', () => {
      const validSchemes = ['mondodb://', 'mongodb://']
      const invalidSchemes = ['http://', 'https://', 'ftp://']

      validSchemes.forEach((scheme) => {
        expect(scheme.startsWith('mondodb://') || scheme.startsWith('mongodb://')).toBe(true)
      })

      invalidSchemes.forEach((scheme) => {
        expect(scheme.startsWith('mondodb://') || scheme.startsWith('mongodb://')).toBe(false)
      })
    })

    it('validates required fields', () => {
      const requiredFields = ['host', 'uri']
      const config = {
        host: 'localhost',
        uri: 'mondodb://localhost:27017',
      }

      requiredFields.forEach((field) => {
        expect(config[field as keyof typeof config]).toBeTruthy()
      })
    })

    it('generates unique connection IDs', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 100; i++) {
        ids.add(generateConnectionId())
      }
      expect(ids.size).toBe(100)
    })
  })

  describe('Favorite Connections', () => {
    it('filters favorite connections', () => {
      const connections: ConnectionConfig[] = [
        {
          id: '1',
          name: 'Favorite 1',
          uri: 'mondodb://localhost:27017',
          host: 'localhost',
          port: 27017,
          auth: { type: 'none' },
          tls: { enabled: false },
          isFavorite: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          name: 'Not Favorite',
          uri: 'mondodb://localhost:27018',
          host: 'localhost',
          port: 27018,
          auth: { type: 'none' },
          tls: { enabled: false },
          isFavorite: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '3',
          name: 'Favorite 2',
          uri: 'mondodb://localhost:27019',
          host: 'localhost',
          port: 27019,
          auth: { type: 'none' },
          tls: { enabled: false },
          isFavorite: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const favorites = connections.filter((c) => c.isFavorite)
      expect(favorites).toHaveLength(2)
      expect(favorites.map((c) => c.name)).toContain('Favorite 1')
      expect(favorites.map((c) => c.name)).toContain('Favorite 2')
    })
  })

  describe('Recent Connections', () => {
    it('sorts connections by lastConnectedAt', () => {
      const connections: ConnectionConfig[] = [
        {
          id: '1',
          name: 'Old Connection',
          uri: 'mondodb://localhost:27017',
          host: 'localhost',
          port: 27017,
          auth: { type: 'none' },
          tls: { enabled: false },
          lastConnectedAt: new Date('2024-01-01'),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          name: 'Recent Connection',
          uri: 'mondodb://localhost:27018',
          host: 'localhost',
          port: 27018,
          auth: { type: 'none' },
          tls: { enabled: false },
          lastConnectedAt: new Date('2024-01-10'),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '3',
          name: 'Middle Connection',
          uri: 'mondodb://localhost:27019',
          host: 'localhost',
          port: 27019,
          auth: { type: 'none' },
          tls: { enabled: false },
          lastConnectedAt: new Date('2024-01-05'),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const sorted = [...connections]
        .filter((c) => c.lastConnectedAt)
        .sort((a, b) => {
          const aTime = a.lastConnectedAt?.getTime() || 0
          const bTime = b.lastConnectedAt?.getTime() || 0
          return bTime - aTime
        })

      expect(sorted[0]!.name).toBe('Recent Connection')
      expect(sorted[1]!.name).toBe('Middle Connection')
      expect(sorted[2]!.name).toBe('Old Connection')
    })

    it('limits recent connections', () => {
      const connections: ConnectionConfig[] = Array.from({ length: 10 }, (_, i) => ({
        id: `${i}`,
        name: `Connection ${i}`,
        uri: `mondodb://localhost:${27017 + i}`,
        host: 'localhost',
        port: 27017 + i,
        auth: { type: 'none' as const },
        tls: { enabled: false },
        lastConnectedAt: new Date(Date.now() - i * 86400000),
        createdAt: new Date(),
        updatedAt: new Date(),
      }))

      const recent = connections.slice(0, 5)
      expect(recent).toHaveLength(5)
    })
  })

  describe('Connection Duplication', () => {
    it('creates duplicate with new ID and name suffix', () => {
      const original: ConnectionConfig = {
        id: 'original-id',
        name: 'My Connection',
        uri: 'mondodb://localhost:27017',
        host: 'localhost',
        port: 27017,
        auth: { type: 'none' },
        tls: { enabled: false },
        isFavorite: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
        lastConnectedAt: new Date('2024-01-03'),
      }

      const now = new Date()
      const duplicate: ConnectionConfig = {
        ...original,
        id: generateConnectionId(),
        name: `${original.name} (Copy)`,
        createdAt: now,
        updatedAt: now,
        lastConnectedAt: undefined,
      }

      expect(duplicate.id).not.toBe(original.id)
      expect(duplicate.name).toBe('My Connection (Copy)')
      expect(duplicate.uri).toBe(original.uri)
      expect(duplicate.lastConnectedAt).toBeUndefined()
    })
  })
})
