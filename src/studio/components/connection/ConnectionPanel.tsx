/**
 * ConnectionPanel Component
 *
 * Main panel for managing database connections in mondodb Studio.
 * Combines connection form, connection list, and status indicator.
 */

import React, { useState, useCallback, useMemo } from 'react'
import { ConnectionForm } from './ConnectionForm'
import { ConnectionList } from './ConnectionList'
import { ConnectionConfig, ConnectionFormValues, DEFAULT_CONNECTION_FORM_VALUES, ConnectionStatus } from '../../types/connection'

/**
 * Connection panel view
 */
type PanelView = 'list' | 'new' | 'edit' | 'quick'

/**
 * ConnectionStatusIndicator props
 */
export interface ConnectionStatusIndicatorProps {
  /**
   * Current connection status
   */
  status: ConnectionStatus

  /**
   * Active connection name
   */
  connectionName?: string

  /**
   * Connection latency in ms
   */
  latencyMs?: number

  /**
   * Server version
   */
  serverVersion?: string

  /**
   * Callback when disconnect is clicked
   */
  onDisconnect?: () => void

  /**
   * Callback when refresh is clicked
   */
  onRefresh?: () => void

  /**
   * Custom class name
   */
  className?: string
}

/**
 * Connection status indicator component
 */
export function ConnectionStatusIndicator({
  status,
  connectionName,
  latencyMs,
  serverVersion,
  onDisconnect,
  onRefresh,
  className = '',
}: ConnectionStatusIndicatorProps): React.ReactElement {
  const statusConfig = useMemo(() => {
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
  }, [status])

  const indicatorStyles = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px 16px',
      backgroundColor: '#2d2d2d',
      borderRadius: '6px',
      border: `1px solid ${statusConfig.color}`,
    },
    statusDot: {
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      backgroundColor: statusConfig.color,
      boxShadow: `0 0 8px ${statusConfig.color}`,
    },
    content: {
      flex: 1,
    },
    status: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '14px',
      fontWeight: 500,
      color: '#e0e0e0',
    },
    meta: {
      display: 'flex',
      gap: '16px',
      marginTop: '4px',
      fontSize: '12px',
      color: '#888',
    },
    actions: {
      display: 'flex',
      gap: '8px',
    },
    button: {
      padding: '6px 12px',
      backgroundColor: 'transparent',
      border: '1px solid #444',
      borderRadius: '4px',
      color: '#888',
      fontSize: '12px',
      cursor: 'pointer',
    },
    disconnectButton: {
      padding: '6px 12px',
      backgroundColor: 'transparent',
      border: '1px solid #f44336',
      borderRadius: '4px',
      color: '#f44336',
      fontSize: '12px',
      cursor: 'pointer',
    },
  }

  return (
    <div
      className={`connection-status ${className}`}
      style={indicatorStyles.container}
      data-testid="connection-status"
    >
      <div style={indicatorStyles.statusDot} data-testid="status-dot" />

      <div style={indicatorStyles.content}>
        <div style={indicatorStyles.status}>
          <span>{statusConfig.icon}</span>
          <span>{statusConfig.text}</span>
          {connectionName && status === 'connected' && (
            <span style={{ color: '#4fc3f7' }}>- {connectionName}</span>
          )}
        </div>

        {status === 'connected' && (
          <div style={indicatorStyles.meta}>
            {latencyMs !== undefined && <span>Latency: {latencyMs}ms</span>}
            {serverVersion && <span>Version: {serverVersion}</span>}
          </div>
        )}
      </div>

      {status === 'connected' && (
        <div style={indicatorStyles.actions}>
          {onRefresh && (
            <button
              style={indicatorStyles.button}
              onClick={onRefresh}
              data-testid="refresh-button"
            >
              Refresh
            </button>
          )}
          {onDisconnect && (
            <button
              style={indicatorStyles.disconnectButton}
              onClick={onDisconnect}
              data-testid="disconnect-button"
            >
              Disconnect
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * QuickConnect component
 */
interface QuickConnectProps {
  onConnect: (uri: string) => void
  isLoading: boolean
  recentConnections: ConnectionConfig[]
}

function QuickConnect({ onConnect, isLoading, recentConnections }: QuickConnectProps): React.ReactElement {
  const [uri, setUri] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (uri.trim()) {
      onConnect(uri.trim())
    }
  }

  const quickConnectStyles = {
    container: {
      padding: '16px',
      backgroundColor: '#2d2d2d',
      borderRadius: '6px',
      border: '1px solid #444',
    },
    title: {
      fontSize: '14px',
      fontWeight: 600,
      color: '#e0e0e0',
      marginBottom: '12px',
    },
    form: {
      display: 'flex',
      gap: '8px',
    },
    input: {
      flex: 1,
      padding: '10px 12px',
      backgroundColor: '#1e1e1e',
      border: '1px solid #444',
      borderRadius: '4px',
      color: '#e0e0e0',
      fontSize: '14px',
      outline: 'none',
    },
    button: {
      padding: '10px 20px',
      backgroundColor: '#4fc3f7',
      border: 'none',
      borderRadius: '4px',
      color: '#000',
      fontWeight: 500,
      fontSize: '14px',
      cursor: isLoading ? 'not-allowed' : 'pointer',
      opacity: isLoading ? 0.7 : 1,
    },
    recent: {
      marginTop: '12px',
    },
    recentTitle: {
      fontSize: '12px',
      color: '#888',
      marginBottom: '8px',
    },
    recentList: {
      display: 'flex',
      flexWrap: 'wrap' as const,
      gap: '8px',
    },
    recentItem: {
      padding: '6px 12px',
      backgroundColor: '#1e1e1e',
      border: '1px solid #444',
      borderRadius: '4px',
      color: '#888',
      fontSize: '12px',
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
  }

  return (
    <div style={quickConnectStyles.container} data-testid="quick-connect">
      <div style={quickConnectStyles.title}>Quick Connect</div>
      <form style={quickConnectStyles.form} onSubmit={handleSubmit}>
        <input
          type="text"
          value={uri}
          onChange={(e) => setUri(e.target.value)}
          placeholder="mongodo://localhost:27017"
          style={quickConnectStyles.input}
          data-testid="quick-connect-input"
        />
        <button
          type="submit"
          style={quickConnectStyles.button}
          disabled={isLoading || !uri.trim()}
          data-testid="quick-connect-button"
        >
          {isLoading ? 'Connecting...' : 'Connect'}
        </button>
      </form>

      {recentConnections.length > 0 && (
        <div style={quickConnectStyles.recent}>
          <div style={quickConnectStyles.recentTitle}>Recent:</div>
          <div style={quickConnectStyles.recentList}>
            {recentConnections.slice(0, 5).map((conn) => (
              <button
                key={conn.id}
                style={quickConnectStyles.recentItem}
                onClick={() => setUri(conn.uri)}
                data-testid={`recent-${conn.id}`}
              >
                {conn.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * ConnectionPanel props
 */
export interface ConnectionPanelProps {
  /**
   * Current connection status
   */
  status: ConnectionStatus

  /**
   * Error message
   */
  error?: string

  /**
   * Currently active connection
   */
  activeConnection?: ConnectionConfig

  /**
   * List of saved connections
   */
  savedConnections: ConnectionConfig[]

  /**
   * Recent connections (sorted by lastConnectedAt)
   */
  recentConnections: ConnectionConfig[]

  /**
   * Connection latency in ms
   */
  latencyMs?: number

  /**
   * Server version
   */
  serverVersion?: string

  /**
   * Callback when connecting with form values
   */
  onConnect: (values: ConnectionFormValues) => void

  /**
   * Callback when connecting to saved connection
   */
  onConnectTo: (connectionId: string) => void

  /**
   * Callback when quick connecting with URI
   */
  onQuickConnect: (uri: string) => void

  /**
   * Callback when disconnecting
   */
  onDisconnect: () => void

  /**
   * Callback when saving connection
   */
  onSave: (values: ConnectionFormValues, id?: string) => void

  /**
   * Callback when deleting connection
   */
  onDelete: (connectionId: string) => void

  /**
   * Callback when duplicating connection
   */
  onDuplicate: (connectionId: string) => void

  /**
   * Callback when toggling favorite
   */
  onToggleFavorite: (connectionId: string) => void

  /**
   * Callback when testing connection
   */
  onTest: (values: ConnectionFormValues) => Promise<{ success: boolean; error?: string; latencyMs?: number }>

  /**
   * Callback when refreshing server info
   */
  onRefresh: () => void

  /**
   * Custom class name
   */
  className?: string
}

/**
 * ConnectionPanel component
 */
export function ConnectionPanel({
  status,
  error,
  activeConnection,
  savedConnections,
  recentConnections,
  latencyMs,
  serverVersion,
  onConnect,
  onConnectTo,
  onQuickConnect,
  onDisconnect,
  onSave,
  onDelete,
  onDuplicate,
  onToggleFavorite,
  onTest,
  onRefresh,
  className = '',
}: ConnectionPanelProps): React.ReactElement {
  const [view, setView] = useState<PanelView>('list')
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null)

  /**
   * Get initial values for form
   */
  const getFormInitialValues = useCallback((): Partial<ConnectionFormValues> => {
    if (view === 'edit' && editingConnectionId) {
      const connection = savedConnections.find((c) => c.id === editingConnectionId)
      if (connection) {
        return {
          name: connection.name,
          connectionMethod: 'uri',
          uri: connection.uri,
          host: connection.host,
          port: connection.port,
          database: connection.database || 'test',
          authType: connection.auth.type,
          username: connection.auth.username || '',
          password: connection.auth.password || '',
          authSource: connection.auth.authSource || 'admin',
          tlsEnabled: connection.tls.enabled,
          tlsAllowInvalidCertificates: connection.tls.allowInvalidCertificates || false,
          connectTimeoutMS: connection.connectTimeoutMS || 10000,
          maxPoolSize: connection.maxPoolSize || 100,
        }
      }
    }
    return DEFAULT_CONNECTION_FORM_VALUES
  }, [view, editingConnectionId, savedConnections])

  /**
   * Handle form submit
   */
  const handleFormSubmit = useCallback(
    (values: ConnectionFormValues) => {
      onConnect(values)
    },
    [onConnect]
  )

  /**
   * Handle form save
   */
  const handleFormSave = useCallback(
    (values: ConnectionFormValues) => {
      onSave(values, editingConnectionId || undefined)
      setView('list')
      setEditingConnectionId(null)
    },
    [onSave, editingConnectionId]
  )

  /**
   * Handle edit click
   */
  const handleEdit = useCallback((connectionId: string) => {
    setEditingConnectionId(connectionId)
    setView('edit')
  }, [])

  /**
   * Handle cancel
   */
  const handleCancel = useCallback(() => {
    setView('list')
    setEditingConnectionId(null)
  }, [])

  /**
   * Handle new connection
   */
  const handleNewConnection = useCallback(() => {
    setEditingConnectionId(null)
    setView('new')
  }, [])

  const panelStyles = {
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '16px',
      padding: '20px',
      backgroundColor: '#1e1e1e',
      borderRadius: '8px',
      color: '#e0e0e0',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      minWidth: '400px',
      maxWidth: '600px',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
    logo: {
      width: '32px',
      height: '32px',
      backgroundColor: '#4fc3f7',
      borderRadius: '6px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 700,
      color: '#000',
      fontSize: '16px',
    },
    title: {
      fontSize: '18px',
      fontWeight: 600,
      margin: 0,
    },
    tabs: {
      display: 'flex',
      gap: '4px',
      backgroundColor: '#2d2d2d',
      padding: '4px',
      borderRadius: '6px',
    },
    tab: (active: boolean) => ({
      padding: '8px 16px',
      backgroundColor: active ? '#444' : 'transparent',
      border: 'none',
      borderRadius: '4px',
      color: active ? '#e0e0e0' : '#888',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: active ? 500 : 400,
      transition: 'all 0.2s',
    }),
    content: {
      flex: 1,
    },
  }

  return (
    <div
      className={`connection-panel ${className}`}
      style={panelStyles.container}
      data-testid="connection-panel"
    >
      {/* Header */}
      <div style={panelStyles.header}>
        <div style={panelStyles.logo}>M</div>
        <h2 style={panelStyles.title}>mondodb Studio</h2>
      </div>

      {/* Status Indicator */}
      <ConnectionStatusIndicator
        status={status}
        connectionName={activeConnection?.name}
        latencyMs={latencyMs}
        serverVersion={serverVersion}
        onDisconnect={status === 'connected' ? onDisconnect : undefined}
        onRefresh={status === 'connected' ? onRefresh : undefined}
      />

      {/* View Tabs (only show when not connected) */}
      {status !== 'connected' && (
        <div style={panelStyles.tabs}>
          <button
            style={panelStyles.tab(view === 'list')}
            onClick={() => setView('list')}
            data-testid="tab-list"
          >
            Saved
          </button>
          <button
            style={panelStyles.tab(view === 'new' || view === 'edit')}
            onClick={handleNewConnection}
            data-testid="tab-new"
          >
            New
          </button>
          <button
            style={panelStyles.tab(view === 'quick')}
            onClick={() => setView('quick')}
            data-testid="tab-quick"
          >
            Quick
          </button>
        </div>
      )}

      {/* Content */}
      <div style={panelStyles.content}>
        {/* List View */}
        {view === 'list' && status !== 'connected' && (
          <ConnectionList
            connections={savedConnections}
            activeConnectionId={activeConnection?.id}
            status={status}
            onConnect={onConnectTo}
            onEdit={handleEdit}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onToggleFavorite={onToggleFavorite}
            onNewConnection={handleNewConnection}
          />
        )}

        {/* New/Edit Form View */}
        {(view === 'new' || view === 'edit') && status !== 'connected' && (
          <ConnectionForm
            initialValues={getFormInitialValues()}
            isEditing={view === 'edit'}
            isLoading={status === 'connecting'}
            error={error}
            onSubmit={handleFormSubmit}
            onSave={handleFormSave}
            onTest={onTest}
            onCancel={handleCancel}
          />
        )}

        {/* Quick Connect View */}
        {view === 'quick' && status !== 'connected' && (
          <QuickConnect
            onConnect={onQuickConnect}
            isLoading={status === 'connecting'}
            recentConnections={recentConnections}
          />
        )}

        {/* Connected State - Show connection info */}
        {status === 'connected' && activeConnection && (
          <div
            style={{
              padding: '16px',
              backgroundColor: '#2d2d2d',
              borderRadius: '6px',
              border: '1px solid #444',
            }}
            data-testid="connected-info"
          >
            <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
              Connection Details
            </div>
            <div style={{ fontSize: '13px', color: '#888', lineHeight: 1.6 }}>
              <div>Host: {activeConnection.host}:{activeConnection.port}</div>
              <div>Database: {activeConnection.database || 'default'}</div>
              <div>URI: {activeConnection.uri}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ConnectionPanel
