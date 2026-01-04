/**
 * ConnectionList Component
 *
 * Displays a list of saved database connections with
 * options to connect, edit, duplicate, and delete.
 */

import React, { useState, useCallback, useMemo } from 'react'
import { ConnectionConfig, ConnectionStatus } from '../../types/connection'

/**
 * ConnectionList props
 */
export interface ConnectionListProps {
  /**
   * List of saved connections
   */
  connections: ConnectionConfig[]

  /**
   * Currently active connection ID
   */
  activeConnectionId?: string

  /**
   * Current connection status
   */
  status?: ConnectionStatus

  /**
   * Callback when connection is selected for connect
   */
  onConnect: (connectionId: string) => void

  /**
   * Callback when connection is selected for edit
   */
  onEdit?: (connectionId: string) => void

  /**
   * Callback when connection is duplicated
   */
  onDuplicate?: (connectionId: string) => void

  /**
   * Callback when connection is deleted
   */
  onDelete?: (connectionId: string) => void

  /**
   * Callback when favorite is toggled
   */
  onToggleFavorite?: (connectionId: string) => void

  /**
   * Callback when new connection is requested
   */
  onNewConnection?: () => void

  /**
   * Custom class name
   */
  className?: string
}

/**
 * Sort options
 */
type SortOption = 'name' | 'recent' | 'created'

/**
 * Connection list item component
 */
interface ConnectionItemProps {
  connection: ConnectionConfig
  isActive: boolean
  isConnecting: boolean
  onConnect: () => void
  onEdit?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  onToggleFavorite?: () => void
}

function ConnectionItem({
  connection,
  isActive,
  isConnecting,
  onConnect,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleFavorite,
}: ConnectionItemProps): React.ReactElement {
  const [showMenu, setShowMenu] = useState(false)

  const handleMenuToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowMenu((prev) => !prev)
  }, [])

  const handleAction = useCallback(
    (action: () => void | undefined) => {
      return (e: React.MouseEvent) => {
        e.stopPropagation()
        setShowMenu(false)
        action?.()
      }
    },
    []
  )

  const formatDate = (date?: Date) => {
    if (!date) return 'Never'
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const itemStyles = {
    container: {
      display: 'flex',
      alignItems: 'center',
      padding: '12px 16px',
      backgroundColor: isActive ? 'rgba(79, 195, 247, 0.1)' : '#2d2d2d',
      borderRadius: '6px',
      cursor: 'pointer',
      border: isActive ? '1px solid #4fc3f7' : '1px solid #444',
      transition: 'all 0.2s',
      position: 'relative' as const,
    },
    colorIndicator: {
      width: '4px',
      height: '36px',
      borderRadius: '2px',
      backgroundColor: connection.color || '#4fc3f7',
      marginRight: '12px',
    },
    content: {
      flex: 1,
      minWidth: 0,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    name: {
      fontSize: '14px',
      fontWeight: 600,
      color: '#e0e0e0',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap' as const,
    },
    favorite: {
      color: connection.isFavorite ? '#ffc107' : '#666',
      cursor: 'pointer',
      fontSize: '14px',
    },
    host: {
      fontSize: '12px',
      color: '#888',
      marginTop: '4px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap' as const,
    },
    meta: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      marginLeft: '12px',
    },
    lastConnected: {
      fontSize: '11px',
      color: '#666',
      whiteSpace: 'nowrap' as const,
    },
    status: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    },
    statusDot: (active: boolean, connecting: boolean) => ({
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      backgroundColor: connecting ? '#ffc107' : active ? '#4caf50' : '#666',
    }),
    statusText: {
      fontSize: '11px',
      color: '#888',
    },
    menuButton: {
      padding: '4px 8px',
      backgroundColor: 'transparent',
      border: 'none',
      color: '#888',
      cursor: 'pointer',
      fontSize: '16px',
      marginLeft: '8px',
    },
    menu: {
      position: 'absolute' as const,
      right: '8px',
      top: '100%',
      marginTop: '4px',
      backgroundColor: '#333',
      borderRadius: '4px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
      zIndex: 10,
      overflow: 'hidden',
      minWidth: '120px',
    },
    menuItem: {
      display: 'block',
      width: '100%',
      padding: '8px 12px',
      backgroundColor: 'transparent',
      border: 'none',
      color: '#e0e0e0',
      textAlign: 'left' as const,
      cursor: 'pointer',
      fontSize: '13px',
      transition: 'background-color 0.2s',
    },
    menuItemDanger: {
      color: '#f44336',
    },
  }

  return (
    <div
      style={itemStyles.container}
      onClick={onConnect}
      data-testid={`connection-item-${connection.id}`}
    >
      {/* Color Indicator */}
      <div style={itemStyles.colorIndicator} />

      {/* Content */}
      <div style={itemStyles.content}>
        <div style={itemStyles.header}>
          <span style={itemStyles.name}>{connection.name}</span>
          {onToggleFavorite && (
            <span
              style={itemStyles.favorite}
              onClick={handleAction(onToggleFavorite)}
              title={connection.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              data-testid={`favorite-${connection.id}`}
            >
              {connection.isFavorite ? '[*]' : '[ ]'}
            </span>
          )}
        </div>
        <div style={itemStyles.host}>
          {connection.host}:{connection.port}
          {connection.database && ` / ${connection.database}`}
        </div>
      </div>

      {/* Meta */}
      <div style={itemStyles.meta}>
        <span style={itemStyles.lastConnected}>
          Last: {formatDate(connection.lastConnectedAt)}
        </span>

        <div style={itemStyles.status}>
          <div style={itemStyles.statusDot(isActive, isConnecting)} />
          <span style={itemStyles.statusText}>
            {isConnecting ? 'Connecting' : isActive ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Menu Button */}
      {(onEdit || onDuplicate || onDelete) && (
        <button
          style={itemStyles.menuButton}
          onClick={handleMenuToggle}
          data-testid={`menu-${connection.id}`}
        >
          [...]
        </button>
      )}

      {/* Dropdown Menu */}
      {showMenu && (
        <div style={itemStyles.menu} data-testid={`menu-dropdown-${connection.id}`}>
          {onEdit && (
            <button
              style={itemStyles.menuItem}
              onClick={handleAction(onEdit)}
              data-testid={`edit-${connection.id}`}
            >
              Edit
            </button>
          )}
          {onDuplicate && (
            <button
              style={itemStyles.menuItem}
              onClick={handleAction(onDuplicate)}
              data-testid={`duplicate-${connection.id}`}
            >
              Duplicate
            </button>
          )}
          {onDelete && (
            <button
              style={{ ...itemStyles.menuItem, ...itemStyles.menuItemDanger }}
              onClick={handleAction(onDelete)}
              data-testid={`delete-${connection.id}`}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * ConnectionList component
 */
export function ConnectionList({
  connections,
  activeConnectionId,
  status = 'disconnected',
  onConnect,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleFavorite,
  onNewConnection,
  className = '',
}: ConnectionListProps): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('recent')
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)

  /**
   * Filter and sort connections
   */
  const filteredConnections = useMemo(() => {
    let result = [...connections]

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (conn) =>
          conn.name.toLowerCase().includes(query) ||
          conn.host.toLowerCase().includes(query) ||
          conn.database?.toLowerCase().includes(query)
      )
    }

    // Filter favorites only
    if (showFavoritesOnly) {
      result = result.filter((conn) => conn.isFavorite)
    }

    // Sort
    switch (sortBy) {
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'recent':
        result.sort((a, b) => {
          const aTime = a.lastConnectedAt?.getTime() || 0
          const bTime = b.lastConnectedAt?.getTime() || 0
          return bTime - aTime
        })
        break
      case 'created':
        result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        break
    }

    return result
  }, [connections, searchQuery, sortBy, showFavoritesOnly])

  const listStyles = {
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '12px',
      padding: '16px',
      backgroundColor: '#1e1e1e',
      borderRadius: '8px',
      color: '#e0e0e0',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    title: {
      fontSize: '16px',
      fontWeight: 600,
      margin: 0,
    },
    newButton: {
      padding: '6px 12px',
      backgroundColor: '#4fc3f7',
      border: 'none',
      borderRadius: '4px',
      color: '#000',
      fontWeight: 500,
      fontSize: '13px',
      cursor: 'pointer',
    },
    controls: {
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
    },
    searchInput: {
      flex: 1,
      padding: '8px 12px',
      backgroundColor: '#2d2d2d',
      border: '1px solid #444',
      borderRadius: '4px',
      color: '#e0e0e0',
      fontSize: '13px',
      outline: 'none',
    },
    select: {
      padding: '8px 12px',
      backgroundColor: '#2d2d2d',
      border: '1px solid #444',
      borderRadius: '4px',
      color: '#e0e0e0',
      fontSize: '13px',
      outline: 'none',
      cursor: 'pointer',
    },
    favoriteToggle: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '8px 12px',
      backgroundColor: showFavoritesOnly ? 'rgba(255, 193, 7, 0.2)' : '#2d2d2d',
      border: showFavoritesOnly ? '1px solid #ffc107' : '1px solid #444',
      borderRadius: '4px',
      color: showFavoritesOnly ? '#ffc107' : '#888',
      cursor: 'pointer',
      fontSize: '13px',
    },
    list: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '8px',
      maxHeight: '400px',
      overflowY: 'auto' as const,
    },
    empty: {
      padding: '40px 20px',
      textAlign: 'center' as const,
      color: '#666',
    },
    emptyTitle: {
      fontSize: '14px',
      fontWeight: 500,
      marginBottom: '8px',
    },
    emptyText: {
      fontSize: '13px',
    },
    count: {
      fontSize: '12px',
      color: '#666',
      padding: '8px 0',
    },
  }

  return (
    <div
      className={`connection-list ${className}`}
      style={listStyles.container}
      data-testid="connection-list"
    >
      {/* Header */}
      <div style={listStyles.header}>
        <h3 style={listStyles.title}>Saved Connections</h3>
        {onNewConnection && (
          <button
            style={listStyles.newButton}
            onClick={onNewConnection}
            data-testid="new-connection-button"
          >
            + New
          </button>
        )}
      </div>

      {/* Controls */}
      <div style={listStyles.controls}>
        <input
          type="text"
          placeholder="Search connections..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={listStyles.searchInput}
          data-testid="search-input"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          style={listStyles.select}
          data-testid="sort-select"
        >
          <option value="recent">Recent</option>
          <option value="name">Name</option>
          <option value="created">Created</option>
        </select>
        <button
          style={listStyles.favoriteToggle}
          onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
          data-testid="favorites-toggle"
        >
          [*] Favorites
        </button>
      </div>

      {/* Connection Count */}
      <div style={listStyles.count} data-testid="connection-count">
        {filteredConnections.length} of {connections.length} connections
      </div>

      {/* Connection List */}
      <div style={listStyles.list}>
        {filteredConnections.length === 0 ? (
          <div style={listStyles.empty}>
            <div style={listStyles.emptyTitle}>
              {searchQuery || showFavoritesOnly ? 'No matching connections' : 'No saved connections'}
            </div>
            <div style={listStyles.emptyText}>
              {searchQuery || showFavoritesOnly
                ? 'Try adjusting your search or filters'
                : 'Create a new connection to get started'}
            </div>
          </div>
        ) : (
          filteredConnections.map((connection) => (
            <ConnectionItem
              key={connection.id}
              connection={connection}
              isActive={connection.id === activeConnectionId}
              isConnecting={connection.id === activeConnectionId && status === 'connecting'}
              onConnect={() => onConnect(connection.id)}
              onEdit={onEdit ? () => onEdit(connection.id) : undefined}
              onDuplicate={onDuplicate ? () => onDuplicate(connection.id) : undefined}
              onDelete={onDelete ? () => onDelete(connection.id) : undefined}
              onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(connection.id) : undefined}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default ConnectionList
