/**
 * useConnection Hook
 *
 * React hook for managing database connections in mongo.do Studio.
 * Handles connection state, persistence, and lifecycle.
 */

import { useReducer, useCallback, useEffect, useMemo } from 'react'
import {
  ConnectionState,
  ConnectionConfig,
  ConnectionStatus,
  ConnectionAction,
  ConnectionFormValues,
  ServerInfo,
  SavedConnection,
  AuthConfig,
  TLSConfig,
  generateConnectionId,
  buildConnectionURI,
  savedToConfig,
  configToSaved,
  DEFAULT_CONNECTION_FORM_VALUES,
} from '../types/connection'

const STORAGE_KEY = 'mongodo_studio_connections'

/**
 * Initial connection state
 */
const initialState: ConnectionState = {
  status: 'disconnected',
  savedConnections: [],
}

/**
 * Connection state reducer
 */
function connectionReducer(state: ConnectionState, action: ConnectionAction): ConnectionState {
  switch (action.type) {
    case 'SET_STATUS':
      return { ...state, status: action.payload }

    case 'SET_ERROR':
      return { ...state, status: 'error', error: action.payload }

    case 'CLEAR_ERROR':
      return { ...state, error: undefined }

    case 'SET_ACTIVE_CONNECTION':
      return { ...state, activeConnection: action.payload, status: 'connected' }

    case 'CLEAR_ACTIVE_CONNECTION':
      return {
        ...state,
        activeConnection: undefined,
        status: 'disconnected',
        serverInfo: undefined,
        latencyMs: undefined,
      }

    case 'ADD_SAVED_CONNECTION':
      return {
        ...state,
        savedConnections: [...state.savedConnections, action.payload],
      }

    case 'UPDATE_SAVED_CONNECTION':
      return {
        ...state,
        savedConnections: state.savedConnections.map((conn) =>
          conn.id === action.payload.id ? action.payload : conn
        ),
        activeConnection:
          state.activeConnection?.id === action.payload.id
            ? action.payload
            : state.activeConnection,
      }

    case 'REMOVE_SAVED_CONNECTION':
      return {
        ...state,
        savedConnections: state.savedConnections.filter((conn) => conn.id !== action.payload),
        activeConnection:
          state.activeConnection?.id === action.payload ? undefined : state.activeConnection,
      }

    case 'SET_SAVED_CONNECTIONS':
      return { ...state, savedConnections: action.payload }

    case 'SET_SERVER_INFO':
      return { ...state, serverInfo: action.payload }

    case 'SET_LATENCY':
      return { ...state, latencyMs: action.payload }

    default:
      return state
  }
}

/**
 * Load saved connections from localStorage
 */
function loadSavedConnections(): ConnectionConfig[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return []
    }

    const saved: SavedConnection[] = JSON.parse(stored)
    return saved.map(savedToConfig)
  } catch (error) {
    console.error('Failed to load saved connections:', error)
    return []
  }
}

/**
 * Save connections to localStorage
 */
function persistConnections(connections: ConnectionConfig[]): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const toSave: SavedConnection[] = connections.map(configToSaved)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  } catch (error) {
    console.error('Failed to save connections:', error)
  }
}

/**
 * Connection hook options
 */
export interface UseConnectionOptions {
  /**
   * Whether to auto-load saved connections on mount
   */
  autoLoad?: boolean

  /**
   * Whether to auto-persist connections on change
   */
  autoPersist?: boolean

  /**
   * Callback when connection status changes
   */
  onStatusChange?: (status: ConnectionStatus) => void

  /**
   * Callback when connection is established
   */
  onConnect?: (config: ConnectionConfig) => void

  /**
   * Callback when disconnected
   */
  onDisconnect?: () => void

  /**
   * Callback on connection error
   */
  onError?: (error: string) => void
}

/**
 * Connection hook return type
 */
export interface UseConnectionReturn {
  /**
   * Current connection state
   */
  state: ConnectionState

  /**
   * Whether currently connected
   */
  isConnected: boolean

  /**
   * Whether currently connecting
   */
  isConnecting: boolean

  /**
   * Whether there's an error
   */
  hasError: boolean

  /**
   * Connect to a database using form values
   */
  connect: (values: ConnectionFormValues) => Promise<void>

  /**
   * Connect to an existing saved connection
   */
  connectTo: (connectionId: string) => Promise<void>

  /**
   * Quick connect using a URI string
   */
  quickConnect: (uri: string, name?: string) => Promise<void>

  /**
   * Disconnect from current connection
   */
  disconnect: () => Promise<void>

  /**
   * Save a connection configuration
   */
  saveConnection: (values: ConnectionFormValues, id?: string) => ConnectionConfig

  /**
   * Delete a saved connection
   */
  deleteConnection: (connectionId: string) => void

  /**
   * Duplicate a connection
   */
  duplicateConnection: (connectionId: string) => ConnectionConfig | null

  /**
   * Toggle favorite status
   */
  toggleFavorite: (connectionId: string) => void

  /**
   * Update connection color
   */
  setConnectionColor: (connectionId: string, color: string) => void

  /**
   * Test a connection without saving
   */
  testConnection: (values: ConnectionFormValues) => Promise<{ success: boolean; error?: string; latencyMs?: number }>

  /**
   * Refresh server info for current connection
   */
  refreshServerInfo: () => Promise<void>

  /**
   * Clear all saved connections
   */
  clearAllConnections: () => void

  /**
   * Get connection by ID
   */
  getConnection: (connectionId: string) => ConnectionConfig | undefined

  /**
   * Get favorite connections
   */
  favoriteConnections: ConnectionConfig[]

  /**
   * Get recent connections (sorted by lastConnectedAt)
   */
  recentConnections: ConnectionConfig[]
}

/**
 * Hook for managing database connections
 */
export function useConnection(options: UseConnectionOptions = {}): UseConnectionReturn {
  const { autoLoad = true, autoPersist = true, onStatusChange, onConnect, onDisconnect, onError } = options

  const [state, dispatch] = useReducer(connectionReducer, initialState)

  // Load saved connections on mount
  useEffect(() => {
    if (autoLoad) {
      const saved = loadSavedConnections()
      dispatch({ type: 'SET_SAVED_CONNECTIONS', payload: saved })
    }
  }, [autoLoad])

  // Persist connections when they change
  useEffect(() => {
    if (autoPersist && state.savedConnections.length > 0) {
      persistConnections(state.savedConnections)
    }
  }, [autoPersist, state.savedConnections])

  // Call onStatusChange when status changes
  useEffect(() => {
    onStatusChange?.(state.status)
  }, [state.status, onStatusChange])

  // Call onError when error occurs
  useEffect(() => {
    if (state.error) {
      onError?.(state.error)
    }
  }, [state.error, onError])

  /**
   * Convert form values to connection config
   */
  const formValuesToConfig = useCallback(
    (values: ConnectionFormValues, existingId?: string): ConnectionConfig => {
      const now = new Date()
      const uri = values.connectionMethod === 'uri' ? values.uri : buildConnectionURI(values)

      const auth: AuthConfig = {
        type: values.authType,
        username: values.username || undefined,
        password: values.password || undefined,
        authSource: values.authSource || undefined,
      }

      const tls: TLSConfig = {
        enabled: values.tlsEnabled,
        allowInvalidCertificates: values.tlsAllowInvalidCertificates,
      }

      return {
        id: existingId || generateConnectionId(),
        name: values.name,
        uri,
        host: values.host,
        port: values.port,
        database: values.database || undefined,
        auth,
        tls,
        connectTimeoutMS: values.connectTimeoutMS,
        maxPoolSize: values.maxPoolSize,
        createdAt: existingId
          ? state.savedConnections.find((c) => c.id === existingId)?.createdAt || now
          : now,
        updatedAt: now,
      }
    },
    [state.savedConnections]
  )

  /**
   * Simulate connection to database
   * In a real implementation, this would use the MongoClient
   */
  const performConnect = useCallback(
    async (config: ConnectionConfig): Promise<{ success: boolean; error?: string; latencyMs: number }> => {
      const startTime = performance.now()

      try {
        // Simulate connection delay
        await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 500))

        // Basic validation
        if (!config.uri) {
          return { success: false, error: 'Connection URI is required', latencyMs: 0 }
        }

        if (!config.host) {
          return { success: false, error: 'Host is required', latencyMs: 0 }
        }

        // Check for valid URI scheme
        if (!config.uri.startsWith('mongodo://') && !config.uri.startsWith('mongodb://')) {
          return { success: false, error: 'Invalid URI scheme. Expected mongodo:// or mongodb://', latencyMs: 0 }
        }

        const latencyMs = Math.round(performance.now() - startTime)

        return { success: true, latencyMs }
      } catch (error) {
        const latencyMs = Math.round(performance.now() - startTime)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown connection error',
          latencyMs,
        }
      }
    },
    []
  )

  /**
   * Get mock server info
   * In a real implementation, this would query the server
   */
  const getServerInfo = useCallback(async (): Promise<ServerInfo> => {
    // Simulate server info retrieval
    await new Promise((resolve) => setTimeout(resolve, 200))

    return {
      version: '1.0.0',
      serverType: 'mongodo',
      isReplicaSet: false,
      databases: ['admin', 'config', 'local', 'test'],
      uptimeSeconds: 3600,
    }
  }, [])

  /**
   * Connect to database using form values
   */
  const connect = useCallback(
    async (values: ConnectionFormValues): Promise<void> => {
      dispatch({ type: 'SET_STATUS', payload: 'connecting' })
      dispatch({ type: 'CLEAR_ERROR' })

      const config = formValuesToConfig(values)
      const result = await performConnect(config)

      if (result.success) {
        config.lastConnectedAt = new Date()
        dispatch({ type: 'SET_ACTIVE_CONNECTION', payload: config })
        dispatch({ type: 'SET_LATENCY', payload: result.latencyMs })

        const serverInfo = await getServerInfo()
        dispatch({ type: 'SET_SERVER_INFO', payload: serverInfo })

        onConnect?.(config)
      } else {
        dispatch({ type: 'SET_ERROR', payload: result.error || 'Connection failed' })
      }
    },
    [formValuesToConfig, performConnect, getServerInfo, onConnect]
  )

  /**
   * Connect to existing saved connection
   */
  const connectTo = useCallback(
    async (connectionId: string): Promise<void> => {
      const config = state.savedConnections.find((c) => c.id === connectionId)
      if (!config) {
        dispatch({ type: 'SET_ERROR', payload: 'Connection not found' })
        return
      }

      dispatch({ type: 'SET_STATUS', payload: 'connecting' })
      dispatch({ type: 'CLEAR_ERROR' })

      const result = await performConnect(config)

      if (result.success) {
        const updatedConfig: ConnectionConfig = {
          ...config,
          lastConnectedAt: new Date(),
        }

        dispatch({ type: 'UPDATE_SAVED_CONNECTION', payload: updatedConfig })
        dispatch({ type: 'SET_ACTIVE_CONNECTION', payload: updatedConfig })
        dispatch({ type: 'SET_LATENCY', payload: result.latencyMs })

        const serverInfo = await getServerInfo()
        dispatch({ type: 'SET_SERVER_INFO', payload: serverInfo })

        onConnect?.(updatedConfig)
      } else {
        dispatch({ type: 'SET_ERROR', payload: result.error || 'Connection failed' })
      }
    },
    [state.savedConnections, performConnect, getServerInfo, onConnect]
  )

  /**
   * Quick connect using URI
   */
  const quickConnect = useCallback(
    async (uri: string, name?: string): Promise<void> => {
      const values: ConnectionFormValues = {
        ...DEFAULT_CONNECTION_FORM_VALUES,
        name: name || 'Quick Connection',
        connectionMethod: 'uri',
        uri,
      }

      await connect(values)
    },
    [connect]
  )

  /**
   * Disconnect from current connection
   */
  const disconnect = useCallback(async (): Promise<void> => {
    dispatch({ type: 'CLEAR_ACTIVE_CONNECTION' })
    onDisconnect?.()
  }, [onDisconnect])

  /**
   * Save a connection
   */
  const saveConnection = useCallback(
    (values: ConnectionFormValues, id?: string): ConnectionConfig => {
      const config = formValuesToConfig(values, id)

      if (id) {
        dispatch({ type: 'UPDATE_SAVED_CONNECTION', payload: config })
      } else {
        dispatch({ type: 'ADD_SAVED_CONNECTION', payload: config })
      }

      return config
    },
    [formValuesToConfig]
  )

  /**
   * Delete a saved connection
   */
  const deleteConnection = useCallback((connectionId: string): void => {
    dispatch({ type: 'REMOVE_SAVED_CONNECTION', payload: connectionId })
  }, [])

  /**
   * Duplicate a connection
   */
  const duplicateConnection = useCallback(
    (connectionId: string): ConnectionConfig | null => {
      const original = state.savedConnections.find((c) => c.id === connectionId)
      if (!original) {
        return null
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

      dispatch({ type: 'ADD_SAVED_CONNECTION', payload: duplicate })
      return duplicate
    },
    [state.savedConnections]
  )

  /**
   * Toggle favorite status
   */
  const toggleFavorite = useCallback(
    (connectionId: string): void => {
      const config = state.savedConnections.find((c) => c.id === connectionId)
      if (!config) return

      const updated: ConnectionConfig = {
        ...config,
        isFavorite: !config.isFavorite,
        updatedAt: new Date(),
      }

      dispatch({ type: 'UPDATE_SAVED_CONNECTION', payload: updated })
    },
    [state.savedConnections]
  )

  /**
   * Set connection color
   */
  const setConnectionColor = useCallback(
    (connectionId: string, color: string): void => {
      const config = state.savedConnections.find((c) => c.id === connectionId)
      if (!config) return

      const updated: ConnectionConfig = {
        ...config,
        color,
        updatedAt: new Date(),
      }

      dispatch({ type: 'UPDATE_SAVED_CONNECTION', payload: updated })
    },
    [state.savedConnections]
  )

  /**
   * Test connection without saving
   */
  const testConnection = useCallback(
    async (
      values: ConnectionFormValues
    ): Promise<{ success: boolean; error?: string; latencyMs?: number }> => {
      const config = formValuesToConfig(values)
      return performConnect(config)
    },
    [formValuesToConfig, performConnect]
  )

  /**
   * Refresh server info
   */
  const refreshServerInfo = useCallback(async (): Promise<void> => {
    if (state.status !== 'connected') return

    const serverInfo = await getServerInfo()
    dispatch({ type: 'SET_SERVER_INFO', payload: serverInfo })
  }, [state.status, getServerInfo])

  /**
   * Clear all saved connections
   */
  const clearAllConnections = useCallback((): void => {
    dispatch({ type: 'SET_SAVED_CONNECTIONS', payload: [] })
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  /**
   * Get connection by ID
   */
  const getConnection = useCallback(
    (connectionId: string): ConnectionConfig | undefined => {
      return state.savedConnections.find((c) => c.id === connectionId)
    },
    [state.savedConnections]
  )

  /**
   * Get favorite connections
   */
  const favoriteConnections = useMemo(
    () => state.savedConnections.filter((c) => c.isFavorite),
    [state.savedConnections]
  )

  /**
   * Get recent connections
   */
  const recentConnections = useMemo(
    () =>
      [...state.savedConnections]
        .filter((c) => c.lastConnectedAt)
        .sort((a, b) => {
          const aTime = a.lastConnectedAt?.getTime() || 0
          const bTime = b.lastConnectedAt?.getTime() || 0
          return bTime - aTime
        })
        .slice(0, 5),
    [state.savedConnections]
  )

  return {
    state,
    isConnected: state.status === 'connected',
    isConnecting: state.status === 'connecting',
    hasError: state.status === 'error',
    connect,
    connectTo,
    quickConnect,
    disconnect,
    saveConnection,
    deleteConnection,
    duplicateConnection,
    toggleFavorite,
    setConnectionColor,
    testConnection,
    refreshServerInfo,
    clearAllConnections,
    getConnection,
    favoriteConnections,
    recentConnections,
  }
}

export default useConnection
