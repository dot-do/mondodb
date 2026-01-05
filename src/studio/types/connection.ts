/**
 * Connection types for mondodb Studio
 *
 * Types and interfaces for managing database connections
 * in the mondodb Studio UI.
 */

import { randomUUID } from 'crypto'

/**
 * Authentication type for database connections
 */
export type AuthType = 'none' | 'basic' | 'x509' | 'aws' | 'kerberos'

/**
 * Authentication configuration
 */
export interface AuthConfig {
  type: AuthType
  username?: string
  password?: string
  authSource?: string
  authMechanism?: string
  x509Certificate?: string
  awsAccessKeyId?: string
  awsSecretAccessKey?: string
  awsSessionToken?: string
}

/**
 * Connection status
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

/**
 * SSL/TLS configuration
 */
export interface TLSConfig {
  enabled: boolean
  allowInvalidCertificates?: boolean
  allowInvalidHostnames?: boolean
  caFile?: string
  certificateKeyFile?: string
}

/**
 * Connection configuration
 */
export interface ConnectionConfig {
  /**
   * Unique identifier for the connection
   */
  id: string

  /**
   * Display name for the connection
   */
  name: string

  /**
   * Connection URI (mondodb:// or mongodb://)
   */
  uri: string

  /**
   * Host address
   */
  host: string

  /**
   * Port number
   */
  port: number

  /**
   * Default database name
   */
  database?: string

  /**
   * Authentication configuration
   */
  auth: AuthConfig

  /**
   * TLS/SSL configuration
   */
  tls: TLSConfig

  /**
   * Connection timeout in milliseconds
   */
  connectTimeoutMS?: number

  /**
   * Socket timeout in milliseconds
   */
  socketTimeoutMS?: number

  /**
   * Maximum connection pool size
   */
  maxPoolSize?: number

  /**
   * Minimum connection pool size
   */
  minPoolSize?: number

  /**
   * Whether this is a favorite connection
   */
  isFavorite?: boolean

  /**
   * Color label for the connection
   */
  color?: string

  /**
   * Creation timestamp
   */
  createdAt: Date

  /**
   * Last modified timestamp
   */
  updatedAt: Date

  /**
   * Last successful connection timestamp
   */
  lastConnectedAt?: Date
}

/**
 * Saved connection (stored in localStorage)
 */
export interface SavedConnection {
  id: string
  name: string
  uri: string
  host: string
  port: number
  database?: string
  auth: AuthConfig
  tls: TLSConfig
  isFavorite?: boolean
  color?: string
  createdAt: string
  updatedAt: string
  lastConnectedAt?: string
}

/**
 * Connection state
 */
export interface ConnectionState {
  /**
   * Current connection status
   */
  status: ConnectionStatus

  /**
   * Error message if status is 'error'
   */
  error?: string

  /**
   * Currently active connection config
   */
  activeConnection?: ConnectionConfig

  /**
   * List of saved connections
   */
  savedConnections: ConnectionConfig[]

  /**
   * Connection latency in ms (for connected state)
   */
  latencyMs?: number

  /**
   * Server information (for connected state)
   */
  serverInfo?: ServerInfo
}

/**
 * Server information returned after connection
 */
export interface ServerInfo {
  /**
   * Server version
   */
  version: string

  /**
   * Server type (mondodb, mongodb, etc.)
   */
  serverType: 'mondodb' | 'mongodb' | 'unknown'

  /**
   * Whether the server is a replica set
   */
  isReplicaSet: boolean

  /**
   * Replica set name if applicable
   */
  replicaSetName?: string

  /**
   * List of available databases
   */
  databases: string[]

  /**
   * Server uptime in seconds
   */
  uptimeSeconds?: number
}

/**
 * Connection form values
 */
export interface ConnectionFormValues {
  name: string
  connectionMethod: 'uri' | 'form'
  uri: string
  host: string
  port: number
  database: string
  authType: AuthType
  username: string
  password: string
  authSource: string
  tlsEnabled: boolean
  tlsAllowInvalidCertificates: boolean
  connectTimeoutMS: number
  maxPoolSize: number
}

/**
 * Default connection form values
 */
export const DEFAULT_CONNECTION_FORM_VALUES: ConnectionFormValues = {
  name: 'New Connection',
  connectionMethod: 'uri',
  uri: 'mondodb://localhost:27017',
  host: 'localhost',
  port: 27017,
  database: 'test',
  authType: 'none',
  username: '',
  password: '',
  authSource: 'admin',
  tlsEnabled: false,
  tlsAllowInvalidCertificates: false,
  connectTimeoutMS: 10000,
  maxPoolSize: 100,
}

/**
 * Connection action types
 */
export type ConnectionAction =
  | { type: 'SET_STATUS'; payload: ConnectionStatus }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_ACTIVE_CONNECTION'; payload: ConnectionConfig }
  | { type: 'CLEAR_ACTIVE_CONNECTION' }
  | { type: 'ADD_SAVED_CONNECTION'; payload: ConnectionConfig }
  | { type: 'UPDATE_SAVED_CONNECTION'; payload: ConnectionConfig }
  | { type: 'REMOVE_SAVED_CONNECTION'; payload: string }
  | { type: 'SET_SAVED_CONNECTIONS'; payload: ConnectionConfig[] }
  | { type: 'SET_SERVER_INFO'; payload: ServerInfo }
  | { type: 'SET_LATENCY'; payload: number }

/**
 * Parse a connection URI into form values
 */
export function parseConnectionURI(uri: string): Partial<ConnectionFormValues> {
  try {
    const result: Partial<ConnectionFormValues> = { uri }

    // Match scheme
    const schemeMatch = uri.match(/^(mondodb|mongodb):\/\//)
    if (!schemeMatch) {
      return result
    }

    let remaining = uri.slice(schemeMatch[0].length)

    // Extract query string
    const queryIndex = remaining.indexOf('?')
    if (queryIndex !== -1) {
      remaining = remaining.slice(0, queryIndex)
    }

    // Extract database name
    const pathIndex = remaining.indexOf('/')
    if (pathIndex !== -1) {
      result.database = remaining.slice(pathIndex + 1) || 'test'
      remaining = remaining.slice(0, pathIndex)
    }

    // Check for authentication (user:pass@)
    const atIndex = remaining.lastIndexOf('@')
    if (atIndex !== -1) {
      const authPart = remaining.slice(0, atIndex)
      remaining = remaining.slice(atIndex + 1)
      const colonIndex = authPart.indexOf(':')
      if (colonIndex !== -1) {
        result.username = decodeURIComponent(authPart.slice(0, colonIndex))
        result.password = decodeURIComponent(authPart.slice(colonIndex + 1))
        result.authType = 'basic'
      } else {
        result.username = decodeURIComponent(authPart)
        result.authType = 'basic'
      }
    }

    // Parse host and port
    const colonIndex = remaining.lastIndexOf(':')
    if (colonIndex !== -1) {
      result.host = remaining.slice(0, colonIndex) || 'localhost'
      const portStr = remaining.slice(colonIndex + 1)
      if (portStr) {
        const port = parseInt(portStr, 10)
        if (!isNaN(port)) {
          result.port = port
        }
      }
    } else {
      result.host = remaining || 'localhost'
    }

    return result
  } catch {
    return { uri }
  }
}

/**
 * Build a connection URI from form values
 */
export function buildConnectionURI(values: ConnectionFormValues): string {
  let uri = 'mondodb://'

  // Add authentication if present
  if (values.authType === 'basic' && values.username) {
    uri += encodeURIComponent(values.username)
    if (values.password) {
      uri += ':' + encodeURIComponent(values.password)
    }
    uri += '@'
  }

  // Add host and port
  uri += values.host || 'localhost'
  if (values.port && values.port !== 27017) {
    uri += ':' + values.port
  }

  // Add database
  if (values.database) {
    uri += '/' + values.database
  }

  // Add query parameters
  const params: string[] = []
  if (values.authSource && values.authType === 'basic') {
    params.push(`authSource=${encodeURIComponent(values.authSource)}`)
  }
  if (values.tlsEnabled) {
    params.push('tls=true')
    if (values.tlsAllowInvalidCertificates) {
      params.push('tlsAllowInvalidCertificates=true')
    }
  }
  if (values.connectTimeoutMS && values.connectTimeoutMS !== 10000) {
    params.push(`connectTimeoutMS=${values.connectTimeoutMS}`)
  }
  if (values.maxPoolSize && values.maxPoolSize !== 100) {
    params.push(`maxPoolSize=${values.maxPoolSize}`)
  }

  if (params.length > 0) {
    uri += '?' + params.join('&')
  }

  return uri
}

/**
 * Generate a unique connection ID
 */
export function generateConnectionId(): string {
  return `conn_${randomUUID()}`
}

/**
 * Convert SavedConnection to ConnectionConfig
 */
export function savedToConfig(saved: SavedConnection): ConnectionConfig {
  return {
    ...saved,
    createdAt: new Date(saved.createdAt),
    updatedAt: new Date(saved.updatedAt),
    lastConnectedAt: saved.lastConnectedAt ? new Date(saved.lastConnectedAt) : undefined,
  }
}

/**
 * Convert ConnectionConfig to SavedConnection
 */
export function configToSaved(config: ConnectionConfig): SavedConnection {
  return {
    ...config,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
    lastConnectedAt: config.lastConnectedAt?.toISOString(),
  }
}
