import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { rpcClient } from '../lib/rpc-client'

export interface AuthConfig {
  type: 'none' | 'basic'
  username?: string
  password?: string
  authSource?: string
}

export interface TlsConfig {
  enabled: boolean
}

export interface ConnectionInfo {
  id: string
  name: string
  uri: string
  host: string
  port: number
  database?: string
  auth: AuthConfig
  tls: TlsConfig
  isFavorite?: boolean
  createdAt?: string
  updatedAt?: string
  lastConnectedAt?: string
  // Legacy support
  url?: string
  lastConnected?: number
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

interface ConnectionState {
  connections: ConnectionInfo[]
  activeConnectionId: string | null
  status: ConnectionStatus
  isConnected: boolean
  isConnecting: boolean
  isHydrated: boolean
  error: string | null
  testResult: { success: boolean; message: string; latency?: number } | null

  // Actions
  addConnection: (connection: Omit<ConnectionInfo, 'id'>) => string
  saveConnection: (connection: Omit<ConnectionInfo, 'id' | 'createdAt' | 'updatedAt' | 'host' | 'port' | 'database'>) => string
  removeConnection: (id: string) => void
  updateConnection: (id: string, updates: Partial<ConnectionInfo>) => void
  duplicateConnection: (id: string) => void
  toggleFavorite: (id: string) => void
  connect: (id: string) => Promise<void>
  connectWithUri: (uri: string, name?: string) => Promise<void>
  testConnection: (uri: string) => Promise<{ success: boolean; message: string; latency?: number }>
  disconnect: () => void
  setError: (error: string | null) => void
  clearError: () => void
  clearTestResult: () => void
  setHydrated: () => void
}

// Parse a mongodo:// URI into components
function parseUri(uri: string): { host: string; port: number; database?: string } {
  try {
    // Handle mongodo:// protocol
    const urlStr = uri.replace(/^mongodo:\/\//, 'http://')
    const url = new URL(urlStr)
    const host = url.hostname || 'localhost'
    const port = url.port ? parseInt(url.port, 10) : 27017
    const database = url.pathname.slice(1) || undefined
    return { host, port, database }
  } catch {
    return { host: 'localhost', port: 27017 }
  }
}

// Convert URI to HTTP URL for API calls
function uriToHttpUrl(uri: string): string {
  // mongodo://localhost:27017 -> http://localhost:27017
  return uri.replace(/^mongodo:\/\//, 'http://')
}

// Validate URI format
function isValidUri(uri: string): boolean {
  if (!uri || !uri.trim()) return false
  // Must start with mongodo:// or mongodb+srv:// or mongodb://
  return /^mongodo:\/\//.test(uri) || /^mongodb(\+srv)?:\/\//.test(uri)
}

// Sanitize password from URI - replaces password with **** or removes it
function sanitizeUriPassword(uri: string): string {
  if (!uri) return uri
  try {
    // Handle mongodo:// protocol by temporarily converting to http://
    const protocol = uri.match(/^(mongodo|mongodb(\+srv)?):\/\//)?.[0] || ''
    if (!protocol) return uri

    const urlStr = uri.replace(/^(mongodo|mongodb(\+srv)?):\/\//, 'http://')
    const url = new URL(urlStr)

    if (url.password) {
      // Replace password with mask
      url.password = '****'
    }

    // Convert back to original protocol
    return url.toString().replace(/^http:\/\//, protocol)
  } catch {
    // If URL parsing fails, try regex-based sanitization as fallback
    // Matches user:password@ pattern and replaces password with ****
    return uri.replace(/(:\/\/[^:]+):([^@]+)@/, '$1:****@')
  }
}

// Sanitize connection for storage - removes sensitive data before persisting
function sanitizeConnectionForStorage(connection: ConnectionInfo): ConnectionInfo {
  return {
    ...connection,
    // Sanitize password from URI
    uri: sanitizeUriPassword(connection.uri),
    // Sanitize legacy url field if present
    url: connection.url ? sanitizeUriPassword(connection.url) : connection.url,
    // Remove password from auth config
    auth: {
      ...connection.auth,
      password: undefined,
    },
  }
}

// Auto-connect to same origin if health endpoint is available
async function autoConnectToSameOrigin(
  set: (state: Partial<ConnectionState>) => void
): Promise<boolean> {
  try {
    // Try /api/health first, then /health for compatibility
    let response = await fetch('/api/health')
    if (!response.ok) {
      response = await fetch('/health')
    }
    if (response.ok) {
      // Auto-connect to same origin - empty baseUrl defaults to same origin
      rpcClient.setBaseUrl('')
      set({
        activeConnectionId: '__same_origin__',
        isConnected: true,
        isConnecting: false,
        status: 'connected',
        error: null,
        isHydrated: true, // Set hydrated after auto-connect succeeds
      })
      return true
    }
  } catch {
    // Not served from a mongo.do worker
  }
  return false
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => ({
      connections: [],
      activeConnectionId: null,
      status: 'disconnected' as ConnectionStatus,
      isConnected: false,
      isConnecting: false,
      isHydrated: false,
      error: null,
      testResult: null,

      addConnection: (connection) => {
        const id = crypto.randomUUID()
        const now = new Date().toISOString()
        set((state) => ({
          connections: [...state.connections, {
            ...connection,
            id,
            createdAt: now,
            updatedAt: now,
          }],
        }))
        return id
      },

      saveConnection: (connection) => {
        const id = crypto.randomUUID()
        const now = new Date().toISOString()
        const { host, port, database } = parseUri(connection.uri)
        // Sanitize connection before storing - remove passwords for security
        const sanitizedConnection = sanitizeConnectionForStorage({
          ...connection,
          id,
          host,
          port,
          database,
          createdAt: now,
          updatedAt: now,
        } as ConnectionInfo)
        set((state) => ({
          connections: [...state.connections, sanitizedConnection],
        }))
        return id
      },

      removeConnection: (id) => {
        set((state) => ({
          connections: state.connections.filter((c) => c.id !== id),
          activeConnectionId:
            state.activeConnectionId === id ? null : state.activeConnectionId,
        }))
      },

      updateConnection: (id, updates) => {
        const now = new Date().toISOString()
        set((state) => ({
          connections: state.connections.map((c) =>
            c.id === id ? { ...c, ...updates, updatedAt: now } : c
          ),
        }))
      },

      duplicateConnection: (id) => {
        const connection = get().connections.find((c) => c.id === id)
        if (!connection) return

        const newId = crypto.randomUUID()
        const now = new Date().toISOString()
        set((state) => ({
          connections: [...state.connections, {
            ...connection,
            id: newId,
            name: `${connection.name} (Copy)`,
            createdAt: now,
            updatedAt: now,
            lastConnectedAt: undefined,
          }],
        }))
      },

      toggleFavorite: (id) => {
        set((state) => ({
          connections: state.connections.map((c) =>
            c.id === id ? { ...c, isFavorite: !c.isFavorite, updatedAt: new Date().toISOString() } : c
          ),
        }))
      },

      connect: async (id) => {
        const connection = get().connections.find((c) => c.id === id)
        if (!connection) {
          set({ error: 'Connection not found', status: 'error' })
          return
        }

        set({ isConnecting: true, status: 'connecting', error: null })

        try {
          // Use uri or legacy url field
          const uri = connection.uri || connection.url
          if (!uri) {
            throw new Error('No connection URI specified')
          }

          // Test connection by fetching health endpoint
          const httpUrl = uriToHttpUrl(uri)
          const healthUrl = new URL('/api/health', httpUrl).toString()
          const response = await fetch(healthUrl)
          if (!response.ok) {
            throw new Error('Failed to connect to mongo.do')
          }

          // Configure the RPC client to use this connection's URL
          rpcClient.setBaseUrl(httpUrl)

          const now = new Date().toISOString()
          set({
            activeConnectionId: id,
            isConnected: true,
            isConnecting: false,
            status: 'connected',
          })

          // Update last connected timestamp
          get().updateConnection(id, {
            lastConnectedAt: now,
            lastConnected: Date.now()
          })
        } catch (error) {
          set({
            isConnecting: false,
            status: 'error',
            error: error instanceof Error ? error.message : 'Connection failed',
          })
        }
      },

      connectWithUri: async (uri: string, name?: string) => {
        // Validate URI format
        if (!isValidUri(uri)) {
          set({
            error: 'Invalid connection string format. URI must start with mongodo://',
            status: 'error'
          })
          return
        }

        set({ isConnecting: true, status: 'connecting', error: null })

        try {
          // Test connection by fetching health endpoint
          const httpUrl = uriToHttpUrl(uri)
          const healthUrl = new URL('/api/health', httpUrl).toString()
          const response = await fetch(healthUrl)
          if (!response.ok) {
            throw new Error('Connection failed')
          }

          // Configure the RPC client to use this connection's URL
          rpcClient.setBaseUrl(httpUrl)

          // Parse URI to get components
          const { host, port, database } = parseUri(uri)

          // Create a temporary connection for quick connect
          const id = crypto.randomUUID()
          const now = new Date().toISOString()
          const connection: ConnectionInfo = {
            id,
            name: name || `${host}:${port}`,
            uri,
            host,
            port,
            database,
            auth: { type: 'none' },
            tls: { enabled: false },
            createdAt: now,
            updatedAt: now,
            lastConnectedAt: now,
          }

          set((state) => ({
            connections: [...state.connections, connection],
            activeConnectionId: id,
            isConnected: true,
            isConnecting: false,
            status: 'connected',
          }))
        } catch (error) {
          set({
            isConnecting: false,
            status: 'error',
            error: error instanceof Error ? error.message : 'Connection failed',
          })
        }
      },

      testConnection: async (uri: string) => {
        // Validate URI format
        if (!isValidUri(uri)) {
          const result = { success: false, message: 'Invalid connection string format' }
          set({ testResult: result })
          return result
        }

        const startTime = Date.now()
        try {
          const httpUrl = uriToHttpUrl(uri)
          const healthUrl = new URL('/api/health', httpUrl).toString()
          const response = await fetch(healthUrl)
          const latency = Date.now() - startTime

          if (!response.ok) {
            const result = { success: false, message: 'Connection failed', latency }
            set({ testResult: result })
            return result
          }

          const result = { success: true, message: 'Connection successful', latency }
          set({ testResult: result })
          return result
        } catch (error) {
          const latency = Date.now() - startTime
          const result = {
            success: false,
            message: error instanceof Error ? error.message : 'Connection failed',
            latency
          }
          set({ testResult: result })
          return result
        }
      },

      disconnect: () => {
        // Clear the RPC client's base URL
        rpcClient.setBaseUrl('')

        set({
          activeConnectionId: null,
          isConnected: false,
          isConnecting: false,
          status: 'disconnected',
          error: null,
        })
      },

      setError: (error) => {
        set({ error, status: error ? 'error' : 'disconnected' })
      },

      clearError: () => {
        set({ error: null })
      },

      clearTestResult: () => {
        set({ testResult: null })
      },

      setHydrated: () => {
        set({ isHydrated: true })
      },
    }),
    {
      name: 'mongo.do-connections',
      partialize: (state) => ({
        // Sanitize connections before storing - removes passwords for security
        connections: state.connections.map(sanitizeConnectionForStorage),
      }),
      onRehydrateStorage: () => (state) => {
        // Auto-connect to same origin if not already connected
        // Wait for auto-connect to complete before marking hydrated
        if (typeof window !== 'undefined' && state && !state.isConnected) {
          autoConnectToSameOrigin((updates) => {
            // Directly update using the store's setState through getState pattern
            useConnectionStore.setState(updates)
          }).then((connected) => {
            // If auto-connect failed, still mark as hydrated so app can proceed
            if (!connected) {
              state?.setHydrated()
            }
          })
        } else {
          // Already connected or not in browser, mark hydrated immediately
          state?.setHydrated()
        }
      },
    }
  )
)
