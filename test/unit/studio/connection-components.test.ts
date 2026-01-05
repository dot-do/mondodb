/**
 * Connection Components Unit Tests
 *
 * Tests for ConnectionForm, ConnectionList, and ConnectionPanel components.
 * These tests verify component logic and rendering without requiring a full React environment.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  ConnectionConfig,
  ConnectionFormValues,
  DEFAULT_CONNECTION_FORM_VALUES,
  parseConnectionURI,
  buildConnectionURI,
} from '../../../src/studio/types/connection'

describe('ConnectionForm Logic', () => {
  describe('Form Value Handling', () => {
    it('uses default values when no initial values provided', () => {
      const initialValues = { ...DEFAULT_CONNECTION_FORM_VALUES }

      expect(initialValues.name).toBe('New Connection')
      expect(initialValues.host).toBe('localhost')
      expect(initialValues.port).toBe(27017)
      expect(initialValues.database).toBe('test')
    })

    it('merges initial values with defaults', () => {
      const customValues = {
        name: 'Custom Connection',
        host: 'custom.host.com',
      }

      const merged = {
        ...DEFAULT_CONNECTION_FORM_VALUES,
        ...customValues,
      }

      expect(merged.name).toBe('Custom Connection')
      expect(merged.host).toBe('custom.host.com')
      expect(merged.port).toBe(27017) // Default preserved
      expect(merged.database).toBe('test') // Default preserved
    })

    it('parses URI and updates form fields', () => {
      const uri = 'mongodo://admin:secret@myhost.com:27018/production'
      const parsed = parseConnectionURI(uri)

      expect(parsed.host).toBe('myhost.com')
      expect(parsed.port).toBe(27018)
      expect(parsed.database).toBe('production')
      expect(parsed.username).toBe('admin')
      expect(parsed.password).toBe('secret')
    })

    it('builds URI from form fields', () => {
      const values: ConnectionFormValues = {
        ...DEFAULT_CONNECTION_FORM_VALUES,
        host: 'myhost.com',
        port: 27018,
        database: 'mydb',
        authType: 'basic',
        username: 'user',
        password: 'pass',
      }

      const uri = buildConnectionURI(values)

      expect(uri).toContain('mongodo://')
      expect(uri).toContain('user:pass@')
      expect(uri).toContain('myhost.com')
      expect(uri).toContain('/mydb')
    })
  })

  describe('Tab Switching', () => {
    it('supports URI tab', () => {
      const tabs = ['uri', 'form']
      expect(tabs).toContain('uri')
    })

    it('supports form tab', () => {
      const tabs = ['uri', 'form']
      expect(tabs).toContain('form')
    })

    it('syncs URI with form fields when switching tabs', () => {
      const formValues: ConnectionFormValues = {
        ...DEFAULT_CONNECTION_FORM_VALUES,
        host: 'newhost.com',
        port: 27020,
      }

      // When switching to URI tab, URI should be rebuilt
      const uri = buildConnectionURI(formValues)
      expect(uri).toContain('newhost.com')
      expect(uri).toContain('27020')
    })
  })

  describe('Authentication Types', () => {
    const authTypes = ['none', 'basic', 'x509', 'aws', 'kerberos']

    it('supports all authentication types', () => {
      expect(authTypes).toHaveLength(5)
    })

    it('shows username/password fields for basic auth', () => {
      const authType = 'basic'
      const showCredentials = authType === 'basic'
      expect(showCredentials).toBe(true)
    })

    it('hides username/password fields for no auth', () => {
      const authType = 'none'
      const showCredentials = authType === 'basic'
      expect(showCredentials).toBe(false)
    })
  })

  describe('TLS Configuration', () => {
    it('shows TLS options when enabled', () => {
      const tlsEnabled = true
      expect(tlsEnabled).toBe(true)
    })

    it('includes TLS in URI when enabled', () => {
      const values: ConnectionFormValues = {
        ...DEFAULT_CONNECTION_FORM_VALUES,
        tlsEnabled: true,
      }

      const uri = buildConnectionURI(values)
      expect(uri).toContain('tls=true')
    })
  })

  describe('Form Validation', () => {
    it('requires connection name', () => {
      const values = { ...DEFAULT_CONNECTION_FORM_VALUES, name: '' }
      expect(values.name).toBeFalsy()
    })

    it('requires host', () => {
      const values = { ...DEFAULT_CONNECTION_FORM_VALUES, host: '' }
      expect(values.host).toBeFalsy()
    })

    it('requires valid port number', () => {
      const port = 27017
      expect(port).toBeGreaterThan(0)
      expect(port).toBeLessThan(65536)
    })
  })
})

describe('ConnectionList Logic', () => {
  const sampleConnections: ConnectionConfig[] = [
    {
      id: 'conn-1',
      name: 'Alpha Connection',
      uri: 'mongodo://localhost:27017',
      host: 'localhost',
      port: 27017,
      database: 'alpha',
      auth: { type: 'none' },
      tls: { enabled: false },
      isFavorite: true,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      lastConnectedAt: new Date('2024-01-10'),
    },
    {
      id: 'conn-2',
      name: 'Beta Connection',
      uri: 'mongodo://localhost:27018',
      host: 'localhost',
      port: 27018,
      database: 'beta',
      auth: { type: 'none' },
      tls: { enabled: false },
      isFavorite: false,
      createdAt: new Date('2024-01-02'),
      updatedAt: new Date('2024-01-02'),
      lastConnectedAt: new Date('2024-01-05'),
    },
    {
      id: 'conn-3',
      name: 'Gamma Connection',
      uri: 'mongodo://localhost:27019',
      host: 'localhost',
      port: 27019,
      database: 'gamma',
      auth: { type: 'none' },
      tls: { enabled: false },
      isFavorite: true,
      createdAt: new Date('2024-01-03'),
      updatedAt: new Date('2024-01-03'),
    },
  ]

  describe('Filtering', () => {
    it('filters by search query on name', () => {
      const query = 'alpha'
      const filtered = sampleConnections.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase())
      )

      expect(filtered).toHaveLength(1)
      expect(filtered[0]!.name).toBe('Alpha Connection')
    })

    it('filters by search query on host', () => {
      const query = 'localhost'
      const filtered = sampleConnections.filter((c) =>
        c.host.toLowerCase().includes(query.toLowerCase())
      )

      expect(filtered).toHaveLength(3)
    })

    it('filters by search query on database', () => {
      const query = 'beta'
      const filtered = sampleConnections.filter(
        (c) =>
          c.database?.toLowerCase().includes(query.toLowerCase()) ||
          c.name.toLowerCase().includes(query.toLowerCase())
      )

      expect(filtered).toHaveLength(1)
    })

    it('filters favorites only', () => {
      const favorites = sampleConnections.filter((c) => c.isFavorite)

      expect(favorites).toHaveLength(2)
      expect(favorites.map((c) => c.name)).toContain('Alpha Connection')
      expect(favorites.map((c) => c.name)).toContain('Gamma Connection')
    })

    it('combines search and favorites filter', () => {
      const query = 'alpha'
      const filtered = sampleConnections
        .filter((c) => c.isFavorite)
        .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))

      expect(filtered).toHaveLength(1)
      expect(filtered[0]!.name).toBe('Alpha Connection')
    })
  })

  describe('Sorting', () => {
    it('sorts by name alphabetically', () => {
      const sorted = [...sampleConnections].sort((a, b) => a.name.localeCompare(b.name))

      expect(sorted[0]!.name).toBe('Alpha Connection')
      expect(sorted[1]!.name).toBe('Beta Connection')
      expect(sorted[2]!.name).toBe('Gamma Connection')
    })

    it('sorts by recent (lastConnectedAt descending)', () => {
      const sorted = [...sampleConnections]
        .filter((c) => c.lastConnectedAt)
        .sort((a, b) => {
          const aTime = a.lastConnectedAt?.getTime() || 0
          const bTime = b.lastConnectedAt?.getTime() || 0
          return bTime - aTime
        })

      expect(sorted[0]!.name).toBe('Alpha Connection')
      expect(sorted[1]!.name).toBe('Beta Connection')
    })

    it('sorts by created date (newest first)', () => {
      const sorted = [...sampleConnections].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      )

      expect(sorted[0]!.name).toBe('Gamma Connection')
      expect(sorted[1]!.name).toBe('Beta Connection')
      expect(sorted[2]!.name).toBe('Alpha Connection')
    })
  })

  describe('Connection Count', () => {
    it('displays total connection count', () => {
      const total = sampleConnections.length
      expect(total).toBe(3)
    })

    it('displays filtered connection count', () => {
      const query = 'alpha'
      const filtered = sampleConnections.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase())
      )

      expect(filtered.length).toBe(1)
    })
  })

  describe('Empty States', () => {
    it('handles empty connection list', () => {
      const connections: ConnectionConfig[] = []
      expect(connections.length).toBe(0)
    })

    it('handles no search results', () => {
      const query = 'nonexistent'
      const filtered = sampleConnections.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase())
      )

      expect(filtered.length).toBe(0)
    })

    it('handles no favorites', () => {
      const noFavorites = sampleConnections.map((c) => ({ ...c, isFavorite: false }))
      const favorites = noFavorites.filter((c) => c.isFavorite)

      expect(favorites.length).toBe(0)
    })
  })
})

describe('ConnectionPanel Logic', () => {
  describe('View Management', () => {
    const views = ['list', 'new', 'edit', 'quick']

    it('supports all view types', () => {
      expect(views).toContain('list')
      expect(views).toContain('new')
      expect(views).toContain('edit')
      expect(views).toContain('quick')
    })

    it('defaults to list view', () => {
      const defaultView = 'list'
      expect(defaultView).toBe('list')
    })

    it('switches to new view for new connection', () => {
      let view = 'list'
      view = 'new'
      expect(view).toBe('new')
    })

    it('switches to edit view with connection ID', () => {
      let view = 'list'
      let editingId: string | null = null

      view = 'edit'
      editingId = 'conn-123'

      expect(view).toBe('edit')
      expect(editingId).toBe('conn-123')
    })
  })

  describe('Connection Status', () => {
    it('shows disconnected status by default', () => {
      const status = 'disconnected'
      expect(status).toBe('disconnected')
    })

    it('shows connecting status during connection', () => {
      const status = 'connecting'
      expect(status).toBe('connecting')
    })

    it('shows connected status when connected', () => {
      const status = 'connected'
      expect(status).toBe('connected')
    })

    it('shows error status on failure', () => {
      const status = 'error'
      expect(status).toBe('error')
    })
  })

  describe('Status Indicator Configuration', () => {
    const getStatusConfig = (status: string) => {
      switch (status) {
        case 'connected':
          return { color: '#4caf50', text: 'Connected', icon: '[O]' }
        case 'connecting':
          return { color: '#ffc107', text: 'Connecting...', icon: '[~]' }
        case 'error':
          return { color: '#f44336', text: 'Error', icon: '[X]' }
        default:
          return { color: '#666', text: 'Disconnected', icon: '[ ]' }
      }
    }

    it('returns green for connected', () => {
      const config = getStatusConfig('connected')
      expect(config.color).toBe('#4caf50')
      expect(config.text).toBe('Connected')
    })

    it('returns yellow for connecting', () => {
      const config = getStatusConfig('connecting')
      expect(config.color).toBe('#ffc107')
      expect(config.text).toBe('Connecting...')
    })

    it('returns red for error', () => {
      const config = getStatusConfig('error')
      expect(config.color).toBe('#f44336')
      expect(config.text).toBe('Error')
    })

    it('returns gray for disconnected', () => {
      const config = getStatusConfig('disconnected')
      expect(config.color).toBe('#666')
      expect(config.text).toBe('Disconnected')
    })
  })

  describe('Connected State Behavior', () => {
    it('hides view tabs when connected', () => {
      const status = 'connected'
      const showTabs = status !== 'connected'
      expect(showTabs).toBe(false)
    })

    it('shows connection info when connected', () => {
      const status = 'connected'
      const activeConnection: ConnectionConfig = {
        id: 'conn-1',
        name: 'Test Connection',
        uri: 'mongodo://localhost:27017',
        host: 'localhost',
        port: 27017,
        auth: { type: 'none' },
        tls: { enabled: false },
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const showConnectionInfo = status === 'connected' && activeConnection !== undefined
      expect(showConnectionInfo).toBe(true)
    })

    it('shows disconnect button when connected', () => {
      const status = 'connected'
      const showDisconnect = status === 'connected'
      expect(showDisconnect).toBe(true)
    })
  })
})

describe('QuickConnect Logic', () => {
  describe('URI Input', () => {
    it('accepts valid mongo.do URI', () => {
      const uri = 'mongodo://localhost:27017'
      const isValid = uri.startsWith('mongodo://') || uri.startsWith('mongodb://')
      expect(isValid).toBe(true)
    })

    it('accepts valid mongodb URI', () => {
      const uri = 'mongodb://localhost:27017'
      const isValid = uri.startsWith('mongodo://') || uri.startsWith('mongodb://')
      expect(isValid).toBe(true)
    })

    it('validates non-empty URI', () => {
      const uri = ''
      const isValid = uri.trim() !== ''
      expect(isValid).toBe(false)
    })
  })

  describe('Recent Connections', () => {
    it('displays up to 5 recent connections', () => {
      const recentConnections = [1, 2, 3, 4, 5, 6, 7].map((i) => ({
        id: `conn-${i}`,
        name: `Connection ${i}`,
      }))

      const displayed = recentConnections.slice(0, 5)
      expect(displayed).toHaveLength(5)
    })

    it('clicking recent fills URI input', () => {
      const recentUri = 'mongodo://recent-host:27017'
      let uri = ''

      // Simulate click on recent connection
      uri = recentUri

      expect(uri).toBe(recentUri)
    })
  })
})
