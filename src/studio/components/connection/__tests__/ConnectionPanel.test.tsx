/**
 * ConnectionPanel Component Unit Tests
 *
 * React Testing Library tests for the ConnectionPanel, ConnectionForm,
 * ConnectionList, and ConnectionStatusIndicator components.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  ConnectionPanel,
  ConnectionStatusIndicator,
  type ConnectionPanelProps,
} from '../ConnectionPanel'
import { ConnectionForm, type ConnectionFormProps } from '../ConnectionForm'
import { ConnectionList, type ConnectionListProps } from '../ConnectionList'
import type { ConnectionConfig } from '../../../types/connection'

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockConnection = (overrides: Partial<ConnectionConfig> = {}): ConnectionConfig => ({
  id: 'conn-1',
  name: 'Test Connection',
  uri: 'mongodo://localhost:27017',
  host: 'localhost',
  port: 27017,
  database: 'testdb',
  auth: { type: 'none' },
  tls: { enabled: false },
  isFavorite: false,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  lastConnectedAt: new Date('2024-01-10'),
  ...overrides,
})

const createMockConnections = (): ConnectionConfig[] => [
  createMockConnection({ id: 'conn-1', name: 'Alpha Connection', isFavorite: true }),
  createMockConnection({
    id: 'conn-2',
    name: 'Beta Connection',
    host: 'beta.host.com',
    lastConnectedAt: new Date('2024-01-05'),
  }),
  createMockConnection({
    id: 'conn-3',
    name: 'Gamma Connection',
    isFavorite: true,
    lastConnectedAt: undefined,
  }),
]

const createDefaultPanelProps = (): ConnectionPanelProps => ({
  status: 'disconnected',
  savedConnections: createMockConnections(),
  recentConnections: createMockConnections().slice(0, 2),
  onConnect: vi.fn(),
  onConnectTo: vi.fn(),
  onQuickConnect: vi.fn(),
  onDisconnect: vi.fn(),
  onSave: vi.fn(),
  onDelete: vi.fn(),
  onDuplicate: vi.fn(),
  onToggleFavorite: vi.fn(),
  onTest: vi.fn().mockResolvedValue({ success: true, latencyMs: 50 }),
  onRefresh: vi.fn(),
})

// ============================================================================
// ConnectionStatusIndicator Tests
// ============================================================================

describe('ConnectionStatusIndicator', () => {
  describe('status display', () => {
    it('renders disconnected status correctly', () => {
      render(<ConnectionStatusIndicator status="disconnected" />)

      expect(screen.getByTestId('connection-status')).toBeInTheDocument()
      expect(screen.getByText('Disconnected')).toBeInTheDocument()
      expect(screen.getByText('[ ]')).toBeInTheDocument()
    })

    it('renders connecting status correctly', () => {
      render(<ConnectionStatusIndicator status="connecting" />)

      expect(screen.getByText('Connecting...')).toBeInTheDocument()
      expect(screen.getByText('[~]')).toBeInTheDocument()
    })

    it('renders connected status correctly', () => {
      render(<ConnectionStatusIndicator status="connected" />)

      expect(screen.getByText('Connected')).toBeInTheDocument()
      expect(screen.getByText('[O]')).toBeInTheDocument()
    })

    it('renders error status correctly', () => {
      render(<ConnectionStatusIndicator status="error" />)

      expect(screen.getByText('Error')).toBeInTheDocument()
      expect(screen.getByText('[X]')).toBeInTheDocument()
    })
  })

  describe('connection info', () => {
    it('displays connection name when connected', () => {
      render(
        <ConnectionStatusIndicator
          status="connected"
          connectionName="My Database"
        />
      )

      expect(screen.getByText(/My Database/)).toBeInTheDocument()
    })

    it('displays latency when connected', () => {
      render(
        <ConnectionStatusIndicator
          status="connected"
          latencyMs={42}
        />
      )

      expect(screen.getByText(/42ms/)).toBeInTheDocument()
    })

    it('displays server version when connected', () => {
      render(
        <ConnectionStatusIndicator
          status="connected"
          serverVersion="1.0.0"
        />
      )

      expect(screen.getByText(/1.0.0/)).toBeInTheDocument()
    })

    it('does not display meta info when not connected', () => {
      render(
        <ConnectionStatusIndicator
          status="disconnected"
          latencyMs={42}
          serverVersion="1.0.0"
        />
      )

      expect(screen.queryByText(/42ms/)).not.toBeInTheDocument()
      expect(screen.queryByText(/1.0.0/)).not.toBeInTheDocument()
    })
  })

  describe('actions', () => {
    it('shows disconnect button when connected', () => {
      const onDisconnect = vi.fn()
      render(
        <ConnectionStatusIndicator
          status="connected"
          onDisconnect={onDisconnect}
        />
      )

      const disconnectButton = screen.getByTestId('disconnect-button')
      expect(disconnectButton).toBeInTheDocument()

      fireEvent.click(disconnectButton)
      expect(onDisconnect).toHaveBeenCalled()
    })

    it('shows refresh button when connected', () => {
      const onRefresh = vi.fn()
      render(
        <ConnectionStatusIndicator
          status="connected"
          onRefresh={onRefresh}
        />
      )

      const refreshButton = screen.getByTestId('refresh-button')
      expect(refreshButton).toBeInTheDocument()

      fireEvent.click(refreshButton)
      expect(onRefresh).toHaveBeenCalled()
    })

    it('hides action buttons when not connected', () => {
      render(
        <ConnectionStatusIndicator
          status="disconnected"
          onDisconnect={vi.fn()}
          onRefresh={vi.fn()}
        />
      )

      expect(screen.queryByTestId('disconnect-button')).not.toBeInTheDocument()
      expect(screen.queryByTestId('refresh-button')).not.toBeInTheDocument()
    })
  })
})

// ============================================================================
// ConnectionForm Tests
// ============================================================================

describe('ConnectionForm', () => {
  const defaultFormProps: ConnectionFormProps = {
    onSubmit: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the form container', () => {
      render(<ConnectionForm {...defaultFormProps} />)
      expect(screen.getByTestId('connection-form')).toBeInTheDocument()
    })

    it('renders connection name input', () => {
      render(<ConnectionForm {...defaultFormProps} />)
      expect(screen.getByTestId('connection-name-input')).toBeInTheDocument()
    })

    it('renders URI input by default', () => {
      render(<ConnectionForm {...defaultFormProps} />)
      expect(screen.getByTestId('connection-uri-input')).toBeInTheDocument()
    })

    it('renders tab buttons', () => {
      render(<ConnectionForm {...defaultFormProps} />)
      expect(screen.getByTestId('uri-tab')).toBeInTheDocument()
      expect(screen.getByTestId('form-tab')).toBeInTheDocument()
    })

    it('renders connect button', () => {
      render(<ConnectionForm {...defaultFormProps} />)
      expect(screen.getByTestId('connect-button')).toBeInTheDocument()
    })

    it('renders title as "New Connection" by default', () => {
      render(<ConnectionForm {...defaultFormProps} />)
      expect(screen.getByText('New Connection')).toBeInTheDocument()
    })

    it('renders title as "Edit Connection" when editing', () => {
      render(<ConnectionForm {...defaultFormProps} isEditing={true} />)
      expect(screen.getByText('Edit Connection')).toBeInTheDocument()
    })
  })

  describe('tab switching', () => {
    it('switches to advanced form tab', async () => {
      render(<ConnectionForm {...defaultFormProps} />)

      const formTab = screen.getByTestId('form-tab')
      await userEvent.click(formTab)

      expect(screen.getByTestId('connection-host-input')).toBeInTheDocument()
      expect(screen.getByTestId('connection-port-input')).toBeInTheDocument()
    })

    it('shows authentication options in form tab', async () => {
      render(<ConnectionForm {...defaultFormProps} />)

      await userEvent.click(screen.getByTestId('form-tab'))

      expect(screen.getByTestId('connection-auth-select')).toBeInTheDocument()
    })

    it('shows TLS options in form tab', async () => {
      render(<ConnectionForm {...defaultFormProps} />)

      await userEvent.click(screen.getByTestId('form-tab'))

      expect(screen.getByTestId('connection-tls-checkbox')).toBeInTheDocument()
    })
  })

  describe('basic auth fields', () => {
    it('shows username/password fields when basic auth is selected', async () => {
      render(<ConnectionForm {...defaultFormProps} />)

      await userEvent.click(screen.getByTestId('form-tab'))

      const authSelect = screen.getByTestId('connection-auth-select')
      await userEvent.selectOptions(authSelect, 'basic')

      expect(screen.getByTestId('connection-username-input')).toBeInTheDocument()
      expect(screen.getByTestId('connection-password-input')).toBeInTheDocument()
      expect(screen.getByTestId('connection-authsource-input')).toBeInTheDocument()
    })

    it('hides username/password fields for no auth', async () => {
      render(<ConnectionForm {...defaultFormProps} />)

      await userEvent.click(screen.getByTestId('form-tab'))

      expect(screen.queryByTestId('connection-username-input')).not.toBeInTheDocument()
      expect(screen.queryByTestId('connection-password-input')).not.toBeInTheDocument()
    })
  })

  describe('form submission', () => {
    it('calls onSubmit when form is submitted', async () => {
      const onSubmit = vi.fn()
      render(<ConnectionForm {...defaultFormProps} onSubmit={onSubmit} />)

      const connectButton = screen.getByTestId('connect-button')
      await userEvent.click(connectButton)

      expect(onSubmit).toHaveBeenCalled()
    })

    it('includes form values in onSubmit call', async () => {
      const onSubmit = vi.fn()
      render(<ConnectionForm {...defaultFormProps} onSubmit={onSubmit} />)

      const nameInput = screen.getByTestId('connection-name-input')
      await userEvent.clear(nameInput)
      await userEvent.type(nameInput, 'Custom Name')

      const connectButton = screen.getByTestId('connect-button')
      await userEvent.click(connectButton)

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Custom Name' })
      )
    })
  })

  describe('test connection', () => {
    it('renders test button when onTest is provided', () => {
      const onTest = vi.fn().mockResolvedValue({ success: true })
      render(<ConnectionForm {...defaultFormProps} onTest={onTest} />)

      expect(screen.getByTestId('test-button')).toBeInTheDocument()
    })

    it('does not render test button when onTest is not provided', () => {
      render(<ConnectionForm {...defaultFormProps} />)

      expect(screen.queryByTestId('test-button')).not.toBeInTheDocument()
    })

    it('calls onTest when test button is clicked', async () => {
      const onTest = vi.fn().mockResolvedValue({ success: true })
      render(<ConnectionForm {...defaultFormProps} onTest={onTest} />)

      await userEvent.click(screen.getByTestId('test-button'))

      expect(onTest).toHaveBeenCalled()
    })

    it('shows success result after successful test', async () => {
      const onTest = vi.fn().mockResolvedValue({ success: true, latencyMs: 50 })
      render(<ConnectionForm {...defaultFormProps} onTest={onTest} />)

      await userEvent.click(screen.getByTestId('test-button'))

      await waitFor(() => {
        expect(screen.getByTestId('test-result')).toBeInTheDocument()
        expect(screen.getByText(/Connection successful/)).toBeInTheDocument()
        expect(screen.getByText(/50ms/)).toBeInTheDocument()
      })
    })

    it('shows error result after failed test', async () => {
      const onTest = vi.fn().mockResolvedValue({ success: false, error: 'Connection refused' })
      render(<ConnectionForm {...defaultFormProps} onTest={onTest} />)

      await userEvent.click(screen.getByTestId('test-button'))

      await waitFor(() => {
        expect(screen.getByTestId('test-result')).toBeInTheDocument()
        expect(screen.getByText(/Connection refused/)).toBeInTheDocument()
      })
    })
  })

  describe('save and cancel', () => {
    it('renders save button when onSave is provided', () => {
      const onSave = vi.fn()
      render(<ConnectionForm {...defaultFormProps} onSave={onSave} />)

      expect(screen.getByTestId('save-button')).toBeInTheDocument()
    })

    it('renders cancel button when onCancel is provided', () => {
      const onCancel = vi.fn()
      render(<ConnectionForm {...defaultFormProps} onCancel={onCancel} />)

      expect(screen.getByTestId('cancel-button')).toBeInTheDocument()
    })

    it('calls onSave when save button is clicked', async () => {
      const onSave = vi.fn()
      render(<ConnectionForm {...defaultFormProps} onSave={onSave} />)

      await userEvent.click(screen.getByTestId('save-button'))

      expect(onSave).toHaveBeenCalled()
    })

    it('calls onCancel when cancel button is clicked', async () => {
      const onCancel = vi.fn()
      render(<ConnectionForm {...defaultFormProps} onCancel={onCancel} />)

      await userEvent.click(screen.getByTestId('cancel-button'))

      expect(onCancel).toHaveBeenCalled()
    })
  })

  describe('loading state', () => {
    it('shows loading text on connect button', () => {
      render(<ConnectionForm {...defaultFormProps} isLoading={true} />)

      expect(screen.getByText('Connecting...')).toBeInTheDocument()
    })

    it('disables buttons when loading', () => {
      const onTest = vi.fn()
      const onSave = vi.fn()
      const onCancel = vi.fn()
      render(
        <ConnectionForm
          {...defaultFormProps}
          isLoading={true}
          onTest={onTest}
          onSave={onSave}
          onCancel={onCancel}
        />
      )

      expect(screen.getByTestId('connect-button')).toBeDisabled()
      expect(screen.getByTestId('test-button')).toBeDisabled()
      expect(screen.getByTestId('save-button')).toBeDisabled()
      expect(screen.getByTestId('cancel-button')).toBeDisabled()
    })
  })

  describe('error display', () => {
    it('displays error message when error prop is set', () => {
      render(<ConnectionForm {...defaultFormProps} error="Connection failed" />)

      expect(screen.getByTestId('connection-error')).toBeInTheDocument()
      expect(screen.getByText('Connection failed')).toBeInTheDocument()
    })
  })

  describe('initial values', () => {
    it('populates form with initial values', () => {
      render(
        <ConnectionForm
          {...defaultFormProps}
          initialValues={{
            name: 'Preset Connection',
            uri: 'mongodo://preset.host:27018/preset',
          }}
        />
      )

      expect(screen.getByTestId('connection-name-input')).toHaveValue('Preset Connection')
      expect(screen.getByTestId('connection-uri-input')).toHaveValue('mongodo://preset.host:27018/preset')
    })
  })
})

// ============================================================================
// ConnectionList Tests
// ============================================================================

describe('ConnectionList', () => {
  const defaultListProps: ConnectionListProps = {
    connections: createMockConnections(),
    onConnect: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the list container', () => {
      render(<ConnectionList {...defaultListProps} />)
      expect(screen.getByTestId('connection-list')).toBeInTheDocument()
    })

    it('renders all connections', () => {
      render(<ConnectionList {...defaultListProps} />)

      expect(screen.getByTestId('connection-item-conn-1')).toBeInTheDocument()
      expect(screen.getByTestId('connection-item-conn-2')).toBeInTheDocument()
      expect(screen.getByTestId('connection-item-conn-3')).toBeInTheDocument()
    })

    it('displays connection names', () => {
      render(<ConnectionList {...defaultListProps} />)

      expect(screen.getByText('Alpha Connection')).toBeInTheDocument()
      expect(screen.getByText('Beta Connection')).toBeInTheDocument()
      expect(screen.getByText('Gamma Connection')).toBeInTheDocument()
    })

    it('displays connection count', () => {
      render(<ConnectionList {...defaultListProps} />)

      expect(screen.getByTestId('connection-count')).toHaveTextContent('3 of 3 connections')
    })
  })

  describe('search functionality', () => {
    it('filters connections by name', async () => {
      render(<ConnectionList {...defaultListProps} />)

      const searchInput = screen.getByTestId('search-input')
      await userEvent.type(searchInput, 'Alpha')

      expect(screen.getByText('Alpha Connection')).toBeInTheDocument()
      expect(screen.queryByText('Beta Connection')).not.toBeInTheDocument()
      expect(screen.queryByText('Gamma Connection')).not.toBeInTheDocument()
    })

    it('filters connections by host', async () => {
      render(<ConnectionList {...defaultListProps} />)

      const searchInput = screen.getByTestId('search-input')
      await userEvent.type(searchInput, 'beta.host')

      expect(screen.getByText('Beta Connection')).toBeInTheDocument()
      expect(screen.queryByText('Alpha Connection')).not.toBeInTheDocument()
    })

    it('updates connection count when filtered', async () => {
      render(<ConnectionList {...defaultListProps} />)

      const searchInput = screen.getByTestId('search-input')
      await userEvent.type(searchInput, 'Alpha')

      expect(screen.getByTestId('connection-count')).toHaveTextContent('1 of 3 connections')
    })

    it('shows empty state when no matches', async () => {
      render(<ConnectionList {...defaultListProps} />)

      const searchInput = screen.getByTestId('search-input')
      await userEvent.type(searchInput, 'nonexistent')

      expect(screen.getByText('No matching connections')).toBeInTheDocument()
    })
  })

  describe('sorting', () => {
    it('sorts by name when selected', async () => {
      render(<ConnectionList {...defaultListProps} />)

      const sortSelect = screen.getByTestId('sort-select')
      await userEvent.selectOptions(sortSelect, 'name')

      const items = screen.getAllByTestId(/connection-item-/)
      expect(items[0]).toHaveAttribute('data-testid', 'connection-item-conn-1')
    })

    it('sorts by recent when selected', async () => {
      render(<ConnectionList {...defaultListProps} />)

      const sortSelect = screen.getByTestId('sort-select')
      await userEvent.selectOptions(sortSelect, 'recent')

      // Alpha has most recent lastConnectedAt
      const items = screen.getAllByTestId(/connection-item-/)
      expect(items[0]).toHaveAttribute('data-testid', 'connection-item-conn-1')
    })
  })

  describe('favorites filter', () => {
    it('filters to show only favorites', async () => {
      render(<ConnectionList {...defaultListProps} />)

      const favoritesToggle = screen.getByTestId('favorites-toggle')
      await userEvent.click(favoritesToggle)

      expect(screen.getByText('Alpha Connection')).toBeInTheDocument()
      expect(screen.getByText('Gamma Connection')).toBeInTheDocument()
      expect(screen.queryByText('Beta Connection')).not.toBeInTheDocument()
    })
  })

  describe('connection actions', () => {
    it('calls onConnect when connection is clicked', async () => {
      const onConnect = vi.fn()
      render(<ConnectionList {...defaultListProps} onConnect={onConnect} />)

      const connectionItem = screen.getByTestId('connection-item-conn-1')
      await userEvent.click(connectionItem)

      expect(onConnect).toHaveBeenCalledWith('conn-1')
    })

    it('shows menu button when edit/duplicate/delete callbacks are provided', () => {
      render(
        <ConnectionList
          {...defaultListProps}
          onEdit={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
        />
      )

      expect(screen.getByTestId('menu-conn-1')).toBeInTheDocument()
    })

    it('opens dropdown menu when menu button is clicked', async () => {
      render(
        <ConnectionList
          {...defaultListProps}
          onEdit={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
        />
      )

      await userEvent.click(screen.getByTestId('menu-conn-1'))

      expect(screen.getByTestId('menu-dropdown-conn-1')).toBeInTheDocument()
    })

    it('calls onEdit when edit is clicked', async () => {
      const onEdit = vi.fn()
      render(
        <ConnectionList
          {...defaultListProps}
          onEdit={onEdit}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
        />
      )

      await userEvent.click(screen.getByTestId('menu-conn-1'))
      await userEvent.click(screen.getByTestId('edit-conn-1'))

      expect(onEdit).toHaveBeenCalledWith('conn-1')
    })

    it('calls onDelete when delete is clicked', async () => {
      const onDelete = vi.fn()
      render(
        <ConnectionList
          {...defaultListProps}
          onEdit={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={onDelete}
        />
      )

      await userEvent.click(screen.getByTestId('menu-conn-1'))
      await userEvent.click(screen.getByTestId('delete-conn-1'))

      expect(onDelete).toHaveBeenCalledWith('conn-1')
    })

    it('calls onDuplicate when duplicate is clicked', async () => {
      const onDuplicate = vi.fn()
      render(
        <ConnectionList
          {...defaultListProps}
          onEdit={vi.fn()}
          onDuplicate={onDuplicate}
          onDelete={vi.fn()}
        />
      )

      await userEvent.click(screen.getByTestId('menu-conn-1'))
      await userEvent.click(screen.getByTestId('duplicate-conn-1'))

      expect(onDuplicate).toHaveBeenCalledWith('conn-1')
    })

    it('calls onToggleFavorite when favorite is clicked', async () => {
      const onToggleFavorite = vi.fn()
      render(
        <ConnectionList
          {...defaultListProps}
          onToggleFavorite={onToggleFavorite}
        />
      )

      await userEvent.click(screen.getByTestId('favorite-conn-1'))

      expect(onToggleFavorite).toHaveBeenCalledWith('conn-1')
    })
  })

  describe('new connection button', () => {
    it('renders new connection button when callback is provided', () => {
      render(
        <ConnectionList
          {...defaultListProps}
          onNewConnection={vi.fn()}
        />
      )

      expect(screen.getByTestId('new-connection-button')).toBeInTheDocument()
    })

    it('calls onNewConnection when clicked', async () => {
      const onNewConnection = vi.fn()
      render(
        <ConnectionList
          {...defaultListProps}
          onNewConnection={onNewConnection}
        />
      )

      await userEvent.click(screen.getByTestId('new-connection-button'))

      expect(onNewConnection).toHaveBeenCalled()
    })
  })

  describe('empty state', () => {
    it('shows empty state when no connections', () => {
      render(<ConnectionList connections={[]} onConnect={vi.fn()} />)

      expect(screen.getByText('No saved connections')).toBeInTheDocument()
    })
  })

  describe('active connection', () => {
    it('highlights active connection', () => {
      render(
        <ConnectionList
          {...defaultListProps}
          activeConnectionId="conn-1"
          status="connected"
        />
      )

      // The active connection should have specific styling - we check that it exists
      const activeItem = screen.getByTestId('connection-item-conn-1')
      expect(activeItem).toBeInTheDocument()
    })

    it('shows connecting status for connecting connection', () => {
      render(
        <ConnectionList
          {...defaultListProps}
          activeConnectionId="conn-1"
          status="connecting"
        />
      )

      expect(screen.getByText('Connecting')).toBeInTheDocument()
    })
  })
})

// ============================================================================
// ConnectionPanel Tests
// ============================================================================

describe('ConnectionPanel', () => {
  let defaultProps: ConnectionPanelProps

  beforeEach(() => {
    vi.clearAllMocks()
    defaultProps = createDefaultPanelProps()
  })

  describe('rendering', () => {
    it('renders the panel container', () => {
      render(<ConnectionPanel {...defaultProps} />)
      expect(screen.getByTestId('connection-panel')).toBeInTheDocument()
    })

    it('renders header with title', () => {
      render(<ConnectionPanel {...defaultProps} />)
      expect(screen.getByText('mondodb Studio')).toBeInTheDocument()
    })

    it('renders status indicator', () => {
      render(<ConnectionPanel {...defaultProps} />)
      expect(screen.getByTestId('connection-status')).toBeInTheDocument()
    })

    it('renders view tabs when disconnected', () => {
      render(<ConnectionPanel {...defaultProps} />)

      expect(screen.getByTestId('tab-list')).toBeInTheDocument()
      expect(screen.getByTestId('tab-new')).toBeInTheDocument()
      expect(screen.getByTestId('tab-quick')).toBeInTheDocument()
    })
  })

  describe('view switching', () => {
    it('shows connection list by default', () => {
      render(<ConnectionPanel {...defaultProps} />)
      expect(screen.getByTestId('connection-list')).toBeInTheDocument()
    })

    it('switches to new connection form', async () => {
      render(<ConnectionPanel {...defaultProps} />)

      await userEvent.click(screen.getByTestId('tab-new'))

      expect(screen.getByTestId('connection-form')).toBeInTheDocument()
    })

    it('switches to quick connect view', async () => {
      render(<ConnectionPanel {...defaultProps} />)

      await userEvent.click(screen.getByTestId('tab-quick'))

      expect(screen.getByTestId('quick-connect')).toBeInTheDocument()
    })
  })

  describe('connected state', () => {
    it('hides tabs when connected', () => {
      render(
        <ConnectionPanel
          {...defaultProps}
          status="connected"
          activeConnection={createMockConnection()}
        />
      )

      expect(screen.queryByTestId('tab-list')).not.toBeInTheDocument()
      expect(screen.queryByTestId('tab-new')).not.toBeInTheDocument()
    })

    it('shows connected info when connected', () => {
      const connection = createMockConnection()
      render(
        <ConnectionPanel
          {...defaultProps}
          status="connected"
          activeConnection={connection}
        />
      )

      expect(screen.getByTestId('connected-info')).toBeInTheDocument()
    })

    it('displays connection details when connected', () => {
      const connection = createMockConnection({
        host: 'myhost.com',
        port: 27018,
        database: 'mydb',
      })
      render(
        <ConnectionPanel
          {...defaultProps}
          status="connected"
          activeConnection={connection}
        />
      )

      expect(screen.getByText(/myhost.com:27018/)).toBeInTheDocument()
    })
  })

  describe('quick connect', () => {
    it('renders quick connect input', async () => {
      render(<ConnectionPanel {...defaultProps} />)

      await userEvent.click(screen.getByTestId('tab-quick'))

      expect(screen.getByTestId('quick-connect-input')).toBeInTheDocument()
    })

    it('calls onQuickConnect when form is submitted', async () => {
      render(<ConnectionPanel {...defaultProps} />)

      await userEvent.click(screen.getByTestId('tab-quick'))

      const input = screen.getByTestId('quick-connect-input')
      await userEvent.type(input, 'mongodo://localhost:27017')

      const connectButton = screen.getByTestId('quick-connect-button')
      await userEvent.click(connectButton)

      expect(defaultProps.onQuickConnect).toHaveBeenCalledWith('mongodo://localhost:27017')
    })

    it('shows recent connections in quick connect', async () => {
      render(<ConnectionPanel {...defaultProps} />)

      await userEvent.click(screen.getByTestId('tab-quick'))

      expect(screen.getByTestId('recent-conn-1')).toBeInTheDocument()
      expect(screen.getByTestId('recent-conn-2')).toBeInTheDocument()
    })
  })

  describe('connection actions', () => {
    it('calls onConnectTo when connection is selected from list', async () => {
      render(<ConnectionPanel {...defaultProps} />)

      await userEvent.click(screen.getByTestId('connection-item-conn-1'))

      expect(defaultProps.onConnectTo).toHaveBeenCalledWith('conn-1')
    })

    it('calls onDisconnect when disconnect button is clicked', async () => {
      render(
        <ConnectionPanel
          {...defaultProps}
          status="connected"
          activeConnection={createMockConnection()}
        />
      )

      await userEvent.click(screen.getByTestId('disconnect-button'))

      expect(defaultProps.onDisconnect).toHaveBeenCalled()
    })

    it('calls onRefresh when refresh button is clicked', async () => {
      render(
        <ConnectionPanel
          {...defaultProps}
          status="connected"
          activeConnection={createMockConnection()}
        />
      )

      await userEvent.click(screen.getByTestId('refresh-button'))

      expect(defaultProps.onRefresh).toHaveBeenCalled()
    })
  })

  describe('status indicator integration', () => {
    it('shows latency when provided', () => {
      render(
        <ConnectionPanel
          {...defaultProps}
          status="connected"
          activeConnection={createMockConnection()}
          latencyMs={42}
        />
      )

      expect(screen.getByText(/42ms/)).toBeInTheDocument()
    })

    it('shows server version when provided', () => {
      render(
        <ConnectionPanel
          {...defaultProps}
          status="connected"
          activeConnection={createMockConnection()}
          serverVersion="2.0.0"
        />
      )

      expect(screen.getByText(/2.0.0/)).toBeInTheDocument()
    })
  })

  describe('form operations', () => {
    it('calls onConnect when form is submitted', async () => {
      render(<ConnectionPanel {...defaultProps} />)

      await userEvent.click(screen.getByTestId('tab-new'))
      await userEvent.click(screen.getByTestId('connect-button'))

      expect(defaultProps.onConnect).toHaveBeenCalled()
    })

    it('calls onSave when save is clicked in form', async () => {
      render(<ConnectionPanel {...defaultProps} />)

      await userEvent.click(screen.getByTestId('tab-new'))
      await userEvent.click(screen.getByTestId('save-button'))

      expect(defaultProps.onSave).toHaveBeenCalled()
    })

    it('returns to list view after save', async () => {
      render(<ConnectionPanel {...defaultProps} />)

      await userEvent.click(screen.getByTestId('tab-new'))
      await userEvent.click(screen.getByTestId('save-button'))

      // Should be back on list view
      expect(screen.getByTestId('connection-list')).toBeInTheDocument()
    })
  })

  describe('error handling', () => {
    it('displays error in form when provided', async () => {
      render(<ConnectionPanel {...defaultProps} error="Connection failed" />)

      await userEvent.click(screen.getByTestId('tab-new'))

      expect(screen.getByTestId('connection-error')).toBeInTheDocument()
      expect(screen.getByText('Connection failed')).toBeInTheDocument()
    })
  })
})
