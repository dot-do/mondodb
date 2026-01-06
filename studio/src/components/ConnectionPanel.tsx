import { useState, useEffect, useMemo } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { H2, H3, Body, Subtitle } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import TextInput from '@leafygreen-ui/text-input'
import Icon from '@leafygreen-ui/icon'
import IconButton from '@leafygreen-ui/icon-button'
import { useConnectionStore, ConnectionInfo } from '@stores/connection'

// Styles
const panelStyles = css`
  max-width: 600px;
  margin: 0 auto;
  padding: 24px;
`

const headerStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 24px;
  text-align: center;
`

const statusStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
`

const tabListStyles = css`
  display: flex;
  border-bottom: 1px solid ${palette.gray.light2};
  margin-bottom: 24px;
`

const tabStyles = css`
  padding: 12px 24px;
  cursor: pointer;
  border: none;
  background: transparent;
  font-size: 14px;
  font-weight: 500;
  color: ${palette.gray.dark1};
  border-bottom: 2px solid transparent;
  transition: all 0.15s ease;

  &:hover {
    color: ${palette.green.dark2};
  }

  &[data-active='true'] {
    color: ${palette.green.dark2};
    border-bottom-color: ${palette.green.dark2};
  }
`

const formStyles = css`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const formActionsStyles = css`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 16px;
`

const connectionListStyles = css`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const connectionItemStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: ${palette.gray.light3};
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${palette.gray.light2};
  }
`

const connectionInfoStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
`

const emptyStateStyles = css`
  text-align: center;
  padding: 48px 24px;
  color: ${palette.gray.dark1};
`

const errorStyles = css`
  padding: 12px;
  background: ${palette.red.light3};
  border: 1px solid ${palette.red.light1};
  border-radius: 4px;
  color: ${palette.red.dark2};
  margin-bottom: 16px;
`

const testResultStyles = css`
  padding: 12px;
  border-radius: 4px;
  margin-top: 16px;
`

const connectedInfoStyles = css`
  padding: 16px;
  background: ${palette.green.light3};
  border-radius: 8px;
  margin-bottom: 16px;
`

const quickConnectStyles = css`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const recentListStyles = css`
  margin-top: 16px;
`

const recentItemStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: ${palette.gray.light3};
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 8px;

  &:hover {
    background: ${palette.gray.light2};
  }
`

const searchContainerStyles = css`
  margin-bottom: 16px;
`

const filterRowStyles = css`
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
`

const connectionCountStyles = css`
  color: ${palette.gray.dark1};
  font-size: 12px;
`

const menuStyles = css`
  position: relative;
`

const menuDropdownStyles = css`
  position: absolute;
  right: 0;
  top: 100%;
  background: white;
  border: 1px solid ${palette.gray.light2};
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 10;
  min-width: 120px;
`

const menuItemStyles = css`
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: ${palette.gray.light3};
  }
`

const formTabsStyles = css`
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
`

const formTabStyles = css`
  padding: 8px 16px;
  border: 1px solid ${palette.gray.light2};
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;

  &[data-active='true'] {
    background: ${palette.green.light3};
    border-color: ${palette.green.dark2};
    color: ${palette.green.dark2};
  }
`

type ViewTab = 'saved' | 'new' | 'quick'
type FormTab = 'uri' | 'form'
type SortOption = 'name' | 'recent'

interface ConnectionFormState {
  name: string
  uri: string
  host: string
  port: string
  username: string
  password: string
  authSource: string
  authType: 'none' | 'basic'
  tlsEnabled: boolean
  database: string
}

const initialFormState: ConnectionFormState = {
  name: '',
  uri: 'mongodo://localhost:27017',
  host: 'localhost',
  port: '27017',
  username: '',
  password: '',
  authSource: 'admin',
  authType: 'none',
  tlsEnabled: false,
  database: '',
}

export function ConnectionPanel() {
  const {
    connections,
    activeConnectionId,
    status,
    isConnected,
    isConnecting,
    error,
    testResult,
    saveConnection,
    connect,
    connectWithUri,
    testConnection,
    disconnect,
    removeConnection,
    updateConnection,
    duplicateConnection,
    toggleFavorite,
    clearError,
    clearTestResult,
  } = useConnectionStore()

  const [activeTab, setActiveTab] = useState<ViewTab>('saved')
  const [formTab, setFormTab] = useState<FormTab>('uri')
  const [form, setForm] = useState<ConnectionFormState>(initialFormState)
  const [quickUri, setQuickUri] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>('name')
  const [validationError, setValidationError] = useState<string | null>(null)

  // Reset error when switching tabs
  useEffect(() => {
    clearError()
    clearTestResult()
    setValidationError(null)
  }, [activeTab, clearError, clearTestResult])

  // Get active connection details
  const activeConnection = connections.find((c) => c.id === activeConnectionId)

  // Filter and sort connections
  const filteredConnections = useMemo(() => {
    let result = [...connections]

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.uri?.toLowerCase().includes(query) ||
          c.host?.toLowerCase().includes(query)
      )
    }

    // Favorites filter
    if (showFavoritesOnly) {
      result = result.filter((c) => c.isFavorite)
    }

    // Sort
    if (sortBy === 'recent') {
      result.sort((a, b) => {
        const aTime = a.lastConnectedAt ? new Date(a.lastConnectedAt).getTime() : 0
        const bTime = b.lastConnectedAt ? new Date(b.lastConnectedAt).getTime() : 0
        return bTime - aTime
      })
    } else {
      result.sort((a, b) => a.name.localeCompare(b.name))
    }

    return result
  }, [connections, searchQuery, showFavoritesOnly, sortBy])

  // Get recent connections for quick connect
  const recentConnections = useMemo(() => {
    return [...connections]
      .filter((c) => c.lastConnectedAt)
      .sort((a, b) => {
        const aTime = a.lastConnectedAt ? new Date(a.lastConnectedAt).getTime() : 0
        const bTime = b.lastConnectedAt ? new Date(b.lastConnectedAt).getTime() : 0
        return bTime - aTime
      })
      .slice(0, 5)
  }, [connections])

  const handleTabChange = (tab: ViewTab) => {
    setActiveTab(tab)
    setEditingId(null)
    setForm(initialFormState)
  }

  const handleFormChange = (field: keyof ConnectionFormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setValidationError(null)
  }

  const validateForm = (): boolean => {
    if (formTab === 'uri') {
      if (!form.uri || !form.uri.trim()) {
        setValidationError('Connection URI is required. Please enter a valid connection string.')
        return false
      }
    } else {
      if (!form.host || !form.host.trim()) {
        setValidationError('Host is required')
        return false
      }
    }
    return true
  }

  const buildUriFromForm = (): string => {
    let uri = 'mongodo://'

    if (form.authType === 'basic' && form.username) {
      uri += `${encodeURIComponent(form.username)}`
      if (form.password) {
        uri += `:${encodeURIComponent(form.password)}`
      }
      uri += '@'
    }

    uri += `${form.host}:${form.port || '27017'}`

    if (form.database) {
      uri += `/${form.database}`
    }

    return uri
  }

  const handleConnect = async () => {
    if (!validateForm()) return

    const uri = formTab === 'uri' ? form.uri : buildUriFromForm()
    await connectWithUri(uri, form.name || undefined)
  }

  const handleSave = () => {
    if (!validateForm()) return

    const uri = formTab === 'uri' ? form.uri : buildUriFromForm()

    if (editingId) {
      updateConnection(editingId, {
        name: form.name || 'Unnamed Connection',
        uri,
        auth: {
          type: form.authType,
          username: form.username || undefined,
          password: form.password || undefined,
          authSource: form.authSource || undefined,
        },
        tls: { enabled: form.tlsEnabled },
      })
      setEditingId(null)
    } else {
      saveConnection({
        name: form.name || 'Unnamed Connection',
        uri,
        auth: {
          type: form.authType,
          username: form.username || undefined,
          password: form.password || undefined,
          authSource: form.authSource || undefined,
        },
        tls: { enabled: form.tlsEnabled },
      })
    }

    setForm(initialFormState)
    setActiveTab('saved')
  }

  const handleTest = async () => {
    if (!validateForm()) return

    const uri = formTab === 'uri' ? form.uri : buildUriFromForm()
    await testConnection(uri)
  }

  const handleQuickConnect = async () => {
    if (!quickUri || !quickUri.trim()) {
      setValidationError('Please enter a connection URI')
      return
    }
    await connectWithUri(quickUri)
  }

  const handleConnectionClick = async (id: string) => {
    await connect(id)
  }

  const handleEdit = (conn: ConnectionInfo) => {
    setEditingId(conn.id)
    setForm({
      name: conn.name,
      uri: conn.uri || '',
      host: conn.host || 'localhost',
      port: String(conn.port || 27017),
      username: conn.auth?.username || '',
      password: conn.auth?.password || '',
      authSource: conn.auth?.authSource || 'admin',
      authType: conn.auth?.type || 'none',
      tlsEnabled: conn.tls?.enabled || false,
      database: conn.database || '',
    })
    setActiveTab('new')
    setOpenMenuId(null)
  }

  const handleDelete = (id: string) => {
    removeConnection(id)
    setOpenMenuId(null)
  }

  const handleDuplicate = (id: string) => {
    duplicateConnection(id)
    setOpenMenuId(null)
  }

  const handleRecentClick = (conn: ConnectionInfo) => {
    setQuickUri(conn.uri || '')
  }

  const formatRelativeTime = (dateStr: string): string => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    const diffMins = Math.floor(diffSecs / 60)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffSecs < 60) return 'just now'
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  }

  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return palette.green.dark1
      case 'connecting':
        return palette.yellow.dark2
      case 'error':
        return palette.red.dark1
      default:
        return palette.gray.dark1
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'connected':
        return 'Connected'
      case 'connecting':
        return 'Connecting...'
      case 'error':
        return 'Error'
      default:
        return 'Disconnected'
    }
  }

  const getStatusBadge = () => {
    switch (status) {
      case 'connected':
        return '[+]'
      case 'error':
        return '[X]'
      default:
        return '[ ]'
    }
  }

  // Render connected view
  if (isConnected) {
    return (
      <div data-testid="connection-panel" className={panelStyles}>
        <div className={headerStyles}>
          <H2>mongo.do Studio</H2>
          <div
            data-testid="connection-status"
            className={statusStyles}
            style={{ background: palette.green.light3, color: palette.green.dark2 }}
          >
            <span>{getStatusBadge()}</span>
            <span>{getStatusText()}</span>
            {activeConnection && <span> - {activeConnection.name}</span>}
          </div>
        </div>

        <div data-testid="connected-info" className={connectedInfoStyles}>
          <Subtitle>Connection Details</Subtitle>
          <Body>Host: {activeConnection?.host || 'localhost'}:{activeConnection?.port || 27017}</Body>
          {activeConnection?.database && <Body>Database: {activeConnection.database}</Body>}
        </div>

        <div className={formActionsStyles}>
          <IconButton
            data-testid="refresh-button"
            aria-label="Refresh connection"
            onClick={() => {
              // Refresh is essentially a no-op that verifies connection is still valid
              // In a real implementation this might ping the server
            }}
          >
            <Icon glyph="Refresh" />
          </IconButton>
          <Button
            data-testid="disconnect-button"
            variant="dangerOutline"
            onClick={disconnect}
          >
            Disconnect
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="connection-panel" className={panelStyles}>
      <div className={headerStyles}>
        <H2>mongo.do Studio</H2>
        <div
          data-testid="connection-status"
          className={statusStyles}
          style={{ color: getStatusColor() }}
        >
          <span>{getStatusBadge()}</span>
          <span>{getStatusText()}</span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div data-testid="tab-list" className={tabListStyles}>
        <button
          data-testid="tab-saved"
          className={tabStyles}
          data-active={activeTab === 'saved'}
          onClick={() => handleTabChange('saved')}
        >
          Saved
        </button>
        <button
          data-testid="tab-new"
          className={tabStyles}
          data-active={activeTab === 'new'}
          onClick={() => handleTabChange('new')}
        >
          New
        </button>
        <button
          data-testid="tab-quick"
          className={tabStyles}
          data-active={activeTab === 'quick'}
          onClick={() => handleTabChange('quick')}
        >
          Quick
        </button>
      </div>

      {/* Error Display */}
      {(error || validationError) && (
        <div data-testid="connection-error" className={errorStyles}>
          {error || validationError}
        </div>
      )}

      {/* Saved Connections Tab */}
      {activeTab === 'saved' && (
        <div>
          {/* Search and Filters */}
          <div className={searchContainerStyles}>
            <TextInput
              data-testid="search-input"
              placeholder="Search connections..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className={filterRowStyles}>
            <button
              data-testid="favorites-toggle"
              className={formTabStyles}
              data-active={showFavoritesOnly}
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            >
              Favorites
            </button>
            <select
              data-testid="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              style={{ padding: '8px', borderRadius: '4px', border: `1px solid ${palette.gray.light2}` }}
            >
              <option value="name">Sort by Name</option>
              <option value="recent">Sort by Recent</option>
            </select>
            <span data-testid="connection-count" className={connectionCountStyles}>
              {filteredConnections.length} of {connections.length} connections
            </span>
          </div>

          {/* Connection List */}
          {connections.length === 0 ? (
            <div className={emptyStateStyles}>
              <Icon glyph="Database" size="xlarge" />
              <Body>No saved connections</Body>
              <Button
                variant="primary"
                onClick={() => setActiveTab('new')}
                style={{ marginTop: '16px' }}
              >
                Add Connection
              </Button>
            </div>
          ) : filteredConnections.length === 0 ? (
            <div className={emptyStateStyles}>
              <Body>No connections match your search</Body>
            </div>
          ) : (
            <div data-testid="connection-list" className={connectionListStyles}>
              {filteredConnections.map((conn) => (
                <div
                  key={conn.id}
                  data-testid={`connection-item-${conn.id}`}
                  className={connectionItemStyles}
                  onClick={() => handleConnectionClick(conn.id)}
                >
                  <div className={connectionInfoStyles}>
                    <IconButton
                      data-testid={`favorite-${conn.id}`}
                      aria-label="Toggle favorite"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleFavorite(conn.id)
                      }}
                    >
                      <Icon glyph={conn.isFavorite ? 'Favorite' : 'NotAllowed'} />
                    </IconButton>
                    <div>
                      <Subtitle>{conn.name}</Subtitle>
                      <Body style={{ color: palette.gray.dark1 }}>{conn.uri || conn.host}</Body>
                      {conn.lastConnectedAt && (
                        <Body style={{ fontSize: '12px', color: palette.gray.base }}>
                          {formatRelativeTime(conn.lastConnectedAt)}
                        </Body>
                      )}
                    </div>
                  </div>

                  <div className={menuStyles}>
                    <IconButton
                      data-testid={`menu-${conn.id}`}
                      aria-label="Connection menu"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenMenuId(openMenuId === conn.id ? null : conn.id)
                      }}
                    >
                      <Icon glyph="Ellipsis" />
                    </IconButton>

                    {openMenuId === conn.id && (
                      <div className={menuDropdownStyles}>
                        <div
                          data-testid={`edit-${conn.id}`}
                          className={menuItemStyles}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEdit(conn)
                          }}
                        >
                          Edit
                        </div>
                        <div
                          data-testid={`duplicate-${conn.id}`}
                          className={menuItemStyles}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDuplicate(conn.id)
                          }}
                        >
                          Duplicate
                        </div>
                        <div
                          data-testid={`delete-${conn.id}`}
                          className={menuItemStyles}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(conn.id)
                          }}
                          style={{ color: palette.red.dark2 }}
                        >
                          Delete
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New Connection Tab */}
      {activeTab === 'new' && (
        <div data-testid="connection-form" className={formStyles}>
          <TextInput
            data-testid="connection-name-input"
            label="Connection Name"
            placeholder="My Connection"
            value={form.name}
            onChange={(e) => handleFormChange('name', e.target.value)}
          />

          {/* URI / Form Toggle */}
          <div className={formTabsStyles}>
            <button
              data-testid="uri-tab"
              className={formTabStyles}
              data-active={formTab === 'uri'}
              onClick={() => setFormTab('uri')}
            >
              URI
            </button>
            <button
              data-testid="form-tab"
              className={formTabStyles}
              data-active={formTab === 'form'}
              onClick={() => setFormTab('form')}
            >
              Form
            </button>
          </div>

          {formTab === 'uri' ? (
            <TextInput
              data-testid="connection-uri-input"
              label="Connection URI"
              placeholder="mongodo://localhost:27017"
              value={form.uri}
              onChange={(e) => handleFormChange('uri', e.target.value)}
            />
          ) : (
            <>
              <div style={{ display: 'flex', gap: '16px' }}>
                <TextInput
                  data-testid="connection-host-input"
                  label="Host"
                  placeholder="localhost"
                  value={form.host}
                  onChange={(e) => handleFormChange('host', e.target.value)}
                  style={{ flex: 2 }}
                />
                <TextInput
                  data-testid="connection-port-input"
                  label="Port"
                  placeholder="27017"
                  value={form.port}
                  onChange={(e) => handleFormChange('port', e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>

              <TextInput
                data-testid="connection-database-input"
                label="Database (optional)"
                placeholder="mydb"
                value={form.database}
                onChange={(e) => handleFormChange('database', e.target.value)}
              />

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                  Authentication
                </label>
                <select
                  data-testid="connection-auth-select"
                  value={form.authType}
                  onChange={(e) => handleFormChange('authType', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '4px',
                    border: `1px solid ${palette.gray.light2}`,
                  }}
                >
                  <option value="none">None</option>
                  <option value="basic">Username / Password</option>
                </select>
              </div>

              {form.authType === 'basic' && (
                <>
                  <TextInput
                    data-testid="connection-username-input"
                    label="Username"
                    placeholder="admin"
                    value={form.username}
                    onChange={(e) => handleFormChange('username', e.target.value)}
                  />
                  <TextInput
                    data-testid="connection-password-input"
                    label="Password"
                    type="password"
                    placeholder="********"
                    value={form.password}
                    onChange={(e) => handleFormChange('password', e.target.value)}
                  />
                  <TextInput
                    data-testid="connection-authsource-input"
                    label="Auth Source"
                    placeholder="admin"
                    value={form.authSource}
                    onChange={(e) => handleFormChange('authSource', e.target.value)}
                  />
                </>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  data-testid="connection-tls-checkbox"
                  type="checkbox"
                  checked={form.tlsEnabled}
                  onChange={(e) => handleFormChange('tlsEnabled', e.target.checked)}
                  id="tls-checkbox"
                />
                <label htmlFor="tls-checkbox">Enable TLS/SSL</label>
              </div>
            </>
          )}

          {/* Test Result */}
          {testResult && (
            <div
              data-testid="test-result"
              className={testResultStyles}
              style={{
                background: testResult.success ? palette.green.light3 : palette.red.light3,
                color: testResult.success ? palette.green.dark2 : palette.red.dark2,
              }}
            >
              <Body>
                {testResult.message}
                {testResult.latency !== undefined && ` (${testResult.latency}ms)`}
              </Body>
            </div>
          )}

          <div className={formActionsStyles}>
            <Button
              data-testid="test-button"
              variant="default"
              onClick={handleTest}
              disabled={isConnecting}
            >
              Test
            </Button>
            <Button
              data-testid="save-button"
              variant="primaryOutline"
              onClick={handleSave}
              disabled={isConnecting}
            >
              {editingId ? 'Update' : 'Save'}
            </Button>
            <Button
              data-testid="connect-button"
              variant="primary"
              onClick={handleConnect}
              disabled={isConnecting}
            >
              {isConnecting ? 'Connecting...' : 'Connect'}
            </Button>
          </div>
        </div>
      )}

      {/* Quick Connect Tab */}
      {activeTab === 'quick' && (
        <div data-testid="quick-connect" className={quickConnectStyles}>
          <TextInput
            data-testid="quick-connect-input"
            label="Connection URI"
            placeholder="mongodo://localhost:27017"
            value={quickUri}
            onChange={(e) => {
              setQuickUri(e.target.value)
              setValidationError(null)
            }}
          />

          <Button
            data-testid="quick-connect-button"
            variant="primary"
            onClick={handleQuickConnect}
            disabled={isConnecting}
          >
            {isConnecting ? 'Connecting...' : 'Connect'}
          </Button>

          {/* Recent Connections */}
          {recentConnections.length > 0 && (
            <div className={recentListStyles}>
              <Subtitle style={{ marginBottom: '12px' }}>Recent Connections</Subtitle>
              {recentConnections.map((conn) => (
                <div
                  key={conn.id}
                  data-testid={`recent-${conn.id}`}
                  className={recentItemStyles}
                  onClick={() => handleRecentClick(conn)}
                >
                  <Icon glyph="Clock" />
                  <div>
                    <Body>{conn.name}</Body>
                    <Body style={{ fontSize: '12px', color: palette.gray.dark1 }}>{conn.uri}</Body>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ConnectionPanel
