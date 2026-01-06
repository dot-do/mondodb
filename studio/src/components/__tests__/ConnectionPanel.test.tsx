import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { ConnectionPanel } from '@components/ConnectionPanel'
import { useConnectionStore } from '@stores/connection'

// Mock the connection store
vi.mock('@stores/connection', () => ({
  useConnectionStore: vi.fn(),
}))

describe('ConnectionPanel', () => {
  const createMockStore = (overrides = {}) => ({
    connections: [],
    activeConnectionId: null,
    status: 'disconnected' as const,
    isConnected: false,
    isConnecting: false,
    error: null,
    testResult: null,
    saveConnection: vi.fn().mockReturnValue('new-id'),
    connect: vi.fn(),
    connectWithUri: vi.fn(),
    testConnection: vi.fn(),
    disconnect: vi.fn(),
    removeConnection: vi.fn(),
    updateConnection: vi.fn(),
    duplicateConnection: vi.fn(),
    toggleFavorite: vi.fn(),
    clearError: vi.fn(),
    clearTestResult: vi.fn(),
    ...overrides,
  })

  let mockStore: ReturnType<typeof createMockStore>

  beforeEach(() => {
    mockStore = createMockStore()
    vi.mocked(useConnectionStore).mockReturnValue(mockStore)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('initial display', () => {
    it('displays the connection panel', () => {
      render(<ConnectionPanel />)
      expect(screen.getByTestId('connection-panel')).toBeInTheDocument()
    })

    it('displays mongo.do Studio title', () => {
      render(<ConnectionPanel />)
      expect(screen.getByText('mongo.do Studio')).toBeInTheDocument()
    })

    it('shows disconnected status', () => {
      render(<ConnectionPanel />)
      expect(screen.getByText('Disconnected')).toBeInTheDocument()
    })

    it('shows view tabs when disconnected', () => {
      render(<ConnectionPanel />)
      expect(screen.getByTestId('tab-list')).toBeInTheDocument()
      expect(screen.getByTestId('tab-new')).toBeInTheDocument()
      expect(screen.getByTestId('tab-quick')).toBeInTheDocument()
    })
  })

  describe('tab navigation', () => {
    it('can navigate to new connection form', async () => {
      const user = userEvent.setup()
      render(<ConnectionPanel />)

      await user.click(screen.getByTestId('tab-new'))

      expect(screen.getByTestId('connection-form')).toBeInTheDocument()
      expect(screen.getByTestId('connection-name-input')).toBeInTheDocument()
      expect(screen.getByTestId('connection-uri-input')).toBeInTheDocument()
    })

    it('can navigate to quick connect tab', async () => {
      const user = userEvent.setup()
      render(<ConnectionPanel />)

      await user.click(screen.getByTestId('tab-quick'))

      expect(screen.getByTestId('quick-connect')).toBeInTheDocument()
      expect(screen.getByTestId('quick-connect-input')).toBeInTheDocument()
    })
  })

  describe('new connection form', () => {
    it('can fill in connection details', async () => {
      const user = userEvent.setup()
      render(<ConnectionPanel />)

      await user.click(screen.getByTestId('tab-new'))

      const nameInput = screen.getByTestId('connection-name-input')
      const uriInput = screen.getByTestId('connection-uri-input')

      await user.clear(nameInput)
      await user.type(nameInput, 'Local Development')
      await user.clear(uriInput)
      await user.type(uriInput, 'mongodo://localhost:27017')

      expect(nameInput).toHaveValue('Local Development')
      expect(uriInput).toHaveValue('mongodo://localhost:27017')
    })

    it('calls connectWithUri when connect button is clicked', async () => {
      const user = userEvent.setup()
      render(<ConnectionPanel />)

      await user.click(screen.getByTestId('tab-new'))

      const uriInput = screen.getByTestId('connection-uri-input')
      await user.clear(uriInput)
      await user.type(uriInput, 'mongodo://localhost:27017')

      await user.click(screen.getByTestId('connect-button'))

      expect(mockStore.connectWithUri).toHaveBeenCalledWith('mongodo://localhost:27017', undefined)
    })

    it('shows connecting status when isConnecting is true', async () => {
      mockStore = createMockStore({ isConnecting: true, status: 'connecting' })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore)

      render(<ConnectionPanel />)

      expect(screen.getByText('Connecting...')).toBeInTheDocument()
    })

    it('can switch between URI and form tabs', async () => {
      const user = userEvent.setup()
      render(<ConnectionPanel />)

      await user.click(screen.getByTestId('tab-new'))

      // Default is URI tab
      expect(screen.getByTestId('connection-uri-input')).toBeInTheDocument()

      // Switch to form tab
      await user.click(screen.getByTestId('form-tab'))

      expect(screen.getByTestId('connection-host-input')).toBeInTheDocument()
      expect(screen.getByTestId('connection-port-input')).toBeInTheDocument()
    })

    it('shows authentication options in form tab', async () => {
      const user = userEvent.setup()
      render(<ConnectionPanel />)

      await user.click(screen.getByTestId('tab-new'))
      await user.click(screen.getByTestId('form-tab'))

      expect(screen.getByTestId('connection-auth-select')).toBeInTheDocument()
    })

    it('shows username/password fields when basic auth is selected', async () => {
      const user = userEvent.setup()
      render(<ConnectionPanel />)

      await user.click(screen.getByTestId('tab-new'))
      await user.click(screen.getByTestId('form-tab'))

      const authSelect = screen.getByTestId('connection-auth-select')
      await user.selectOptions(authSelect, 'basic')

      expect(screen.getByTestId('connection-username-input')).toBeInTheDocument()
      expect(screen.getByTestId('connection-password-input')).toBeInTheDocument()
      expect(screen.getByTestId('connection-authsource-input')).toBeInTheDocument()
    })

    it('shows TLS checkbox in form tab', async () => {
      const user = userEvent.setup()
      render(<ConnectionPanel />)

      await user.click(screen.getByTestId('tab-new'))
      await user.click(screen.getByTestId('form-tab'))

      expect(screen.getByTestId('connection-tls-checkbox')).toBeInTheDocument()
    })
  })

  describe('quick connect', () => {
    it('can quick connect with URI', async () => {
      const user = userEvent.setup()
      render(<ConnectionPanel />)

      await user.click(screen.getByTestId('tab-quick'))

      const quickInput = screen.getByTestId('quick-connect-input')
      await user.type(quickInput, 'mongodo://localhost:27017/testdb')

      await user.click(screen.getByTestId('quick-connect-button'))

      expect(mockStore.connectWithUri).toHaveBeenCalledWith('mongodo://localhost:27017/testdb')
    })

    it('shows recent connections', async () => {
      mockStore = createMockStore({
        connections: [
          {
            id: 'recent-1',
            name: 'Recent DB',
            uri: 'mongodo://localhost:27017',
            host: 'localhost',
            port: 27017,
            auth: { type: 'none' },
            tls: { enabled: false },
            lastConnectedAt: new Date().toISOString(),
          },
        ],
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore)

      const user = userEvent.setup()
      render(<ConnectionPanel />)

      await user.click(screen.getByTestId('tab-quick'))

      expect(screen.getByTestId('recent-recent-1')).toBeInTheDocument()
    })
  })

  describe('saved connections', () => {
    it('shows empty state when no saved connections', () => {
      render(<ConnectionPanel />)
      expect(screen.getByText('No saved connections')).toBeInTheDocument()
    })

    it('shows saved connections list', () => {
      mockStore = createMockStore({
        connections: [
          {
            id: 'saved-1',
            name: 'Saved Connection',
            uri: 'mongodo://localhost:27017',
            host: 'localhost',
            port: 27017,
            auth: { type: 'none' },
            tls: { enabled: false },
          },
        ],
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore)

      render(<ConnectionPanel />)

      expect(screen.getByTestId('connection-list')).toBeInTheDocument()
      expect(screen.getByText('Saved Connection')).toBeInTheDocument()
    })

    it('can connect to saved connection', async () => {
      mockStore = createMockStore({
        connections: [
          {
            id: 'saved-1',
            name: 'Saved Connection',
            uri: 'mongodo://localhost:27017',
            host: 'localhost',
            port: 27017,
            auth: { type: 'none' },
            tls: { enabled: false },
          },
        ],
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore)

      const user = userEvent.setup()
      render(<ConnectionPanel />)

      await user.click(screen.getByTestId('connection-item-saved-1'))

      expect(mockStore.connect).toHaveBeenCalledWith('saved-1')
    })

    it('shows connection count', () => {
      mockStore = createMockStore({
        connections: [
          { id: 'c1', name: 'Conn 1', uri: 'mongodo://localhost:27017', host: 'localhost', port: 27017, auth: { type: 'none' }, tls: { enabled: false } },
          { id: 'c2', name: 'Conn 2', uri: 'mongodo://localhost:27018', host: 'localhost', port: 27018, auth: { type: 'none' }, tls: { enabled: false } },
          { id: 'c3', name: 'Conn 3', uri: 'mongodo://localhost:27019', host: 'localhost', port: 27019, auth: { type: 'none' }, tls: { enabled: false } },
        ],
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore)

      render(<ConnectionPanel />)

      expect(screen.getByTestId('connection-count')).toHaveTextContent('3 of 3 connections')
    })

    it('can search connections', async () => {
      mockStore = createMockStore({
        connections: [
          { id: 'prod', name: 'Production DB', uri: 'mongodo://prod:27017', host: 'prod', port: 27017, auth: { type: 'none' }, tls: { enabled: false } },
          { id: 'dev', name: 'Development DB', uri: 'mongodo://dev:27017', host: 'dev', port: 27017, auth: { type: 'none' }, tls: { enabled: false } },
        ],
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore)

      const user = userEvent.setup()
      render(<ConnectionPanel />)

      const searchInput = screen.getByTestId('search-input')
      await user.type(searchInput, 'Production')

      expect(screen.getByText('Production DB')).toBeInTheDocument()
      expect(screen.queryByText('Development DB')).not.toBeInTheDocument()
    })

    it('can toggle favorites filter', async () => {
      mockStore = createMockStore({
        connections: [
          { id: 'fav', name: 'Favorite', uri: 'mongodo://localhost:27017', host: 'localhost', port: 27017, auth: { type: 'none' }, tls: { enabled: false }, isFavorite: true },
          { id: 'nonfav', name: 'Not Favorite', uri: 'mongodo://localhost:27018', host: 'localhost', port: 27018, auth: { type: 'none' }, tls: { enabled: false }, isFavorite: false },
        ],
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore)

      const user = userEvent.setup()
      render(<ConnectionPanel />)

      await user.click(screen.getByTestId('favorites-toggle'))

      expect(screen.getByText('Favorite')).toBeInTheDocument()
      expect(screen.queryByText('Not Favorite')).not.toBeInTheDocument()
    })
  })

  describe('connection management', () => {
    it('can delete connection', async () => {
      mockStore = createMockStore({
        connections: [
          { id: 'delete-me', name: 'Delete Me', uri: 'mongodo://localhost:27017', host: 'localhost', port: 27017, auth: { type: 'none' }, tls: { enabled: false } },
        ],
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore)

      const user = userEvent.setup()
      render(<ConnectionPanel />)

      await user.click(screen.getByTestId('menu-delete-me'))
      await user.click(screen.getByTestId('delete-delete-me'))

      expect(mockStore.removeConnection).toHaveBeenCalledWith('delete-me')
    })

    it('can duplicate connection', async () => {
      mockStore = createMockStore({
        connections: [
          { id: 'dup-me', name: 'Duplicate Me', uri: 'mongodo://localhost:27017', host: 'localhost', port: 27017, auth: { type: 'none' }, tls: { enabled: false } },
        ],
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore)

      const user = userEvent.setup()
      render(<ConnectionPanel />)

      await user.click(screen.getByTestId('menu-dup-me'))
      await user.click(screen.getByTestId('duplicate-dup-me'))

      expect(mockStore.duplicateConnection).toHaveBeenCalledWith('dup-me')
    })

    it('can toggle favorite', async () => {
      mockStore = createMockStore({
        connections: [
          { id: 'fav-toggle', name: 'Toggle Me', uri: 'mongodo://localhost:27017', host: 'localhost', port: 27017, auth: { type: 'none' }, tls: { enabled: false }, isFavorite: false },
        ],
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore)

      const user = userEvent.setup()
      render(<ConnectionPanel />)

      await user.click(screen.getByTestId('favorite-fav-toggle'))

      expect(mockStore.toggleFavorite).toHaveBeenCalledWith('fav-toggle')
    })
  })

  describe('save connection', () => {
    it('saves connection when save button is clicked', async () => {
      const user = userEvent.setup()
      render(<ConnectionPanel />)

      await user.click(screen.getByTestId('tab-new'))

      const nameInput = screen.getByTestId('connection-name-input')
      const uriInput = screen.getByTestId('connection-uri-input')

      await user.clear(nameInput)
      await user.type(nameInput, 'My Connection')
      await user.clear(uriInput)
      await user.type(uriInput, 'mongodo://localhost:27017')

      await user.click(screen.getByTestId('save-button'))

      expect(mockStore.saveConnection).toHaveBeenCalledWith(expect.objectContaining({
        name: 'My Connection',
        uri: 'mongodo://localhost:27017',
      }))
    })
  })

  describe('test connection', () => {
    it('shows test result when test button is clicked', async () => {
      mockStore = createMockStore({
        testResult: { success: true, message: 'Connection successful', latency: 50 },
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore)

      const user = userEvent.setup()
      render(<ConnectionPanel />)

      await user.click(screen.getByTestId('tab-new'))

      expect(screen.getByTestId('test-result')).toBeInTheDocument()
      expect(screen.getByText(/Connection successful/)).toBeInTheDocument()
      expect(screen.getByText(/50ms/)).toBeInTheDocument()
    })

    it('shows failure result', async () => {
      mockStore = createMockStore({
        testResult: { success: false, message: 'Connection failed' },
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore)

      const user = userEvent.setup()
      render(<ConnectionPanel />)

      await user.click(screen.getByTestId('tab-new'))

      expect(screen.getByTestId('test-result')).toBeInTheDocument()
      expect(screen.getByText(/Connection failed/)).toBeInTheDocument()
    })
  })

  describe('error handling', () => {
    it('shows error message', () => {
      mockStore = createMockStore({
        error: 'Invalid connection string format',
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore)

      render(<ConnectionPanel />)

      expect(screen.getByTestId('connection-error')).toBeInTheDocument()
      expect(screen.getByText('Invalid connection string format')).toBeInTheDocument()
    })

    it('shows validation error for empty URI', async () => {
      const user = userEvent.setup()
      render(<ConnectionPanel />)

      await user.click(screen.getByTestId('tab-new'))

      const uriInput = screen.getByTestId('connection-uri-input')
      await user.clear(uriInput)

      await user.click(screen.getByTestId('connect-button'))

      expect(screen.getByTestId('connection-error')).toBeInTheDocument()
    })

    it('clears error when switching tabs', async () => {
      mockStore = createMockStore({
        error: 'Some error',
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore)

      const user = userEvent.setup()
      render(<ConnectionPanel />)

      // Switch tabs
      await user.click(screen.getByTestId('tab-quick'))
      await user.click(screen.getByTestId('tab-new'))

      expect(mockStore.clearError).toHaveBeenCalled()
    })
  })

  describe('connected state', () => {
    it('shows connected info when connected', () => {
      mockStore = createMockStore({
        isConnected: true,
        status: 'connected',
        activeConnectionId: 'active-1',
        connections: [
          {
            id: 'active-1',
            name: 'Active Connection',
            uri: 'mongodo://localhost:27017/mydb',
            host: 'localhost',
            port: 27017,
            database: 'mydb',
            auth: { type: 'none' },
            tls: { enabled: false },
          },
        ],
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore)

      render(<ConnectionPanel />)

      expect(screen.getByTestId('connected-info')).toBeInTheDocument()
      expect(screen.getByText('Connected')).toBeInTheDocument()
      expect(screen.getByText(/localhost:27017/)).toBeInTheDocument()
    })

    it('hides tabs when connected', () => {
      mockStore = createMockStore({
        isConnected: true,
        status: 'connected',
        activeConnectionId: 'active-1',
        connections: [
          { id: 'active-1', name: 'Active', uri: 'mongodo://localhost:27017', host: 'localhost', port: 27017, auth: { type: 'none' }, tls: { enabled: false } },
        ],
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore)

      render(<ConnectionPanel />)

      expect(screen.queryByTestId('tab-list')).not.toBeInTheDocument()
      expect(screen.queryByTestId('tab-new')).not.toBeInTheDocument()
      expect(screen.queryByTestId('tab-quick')).not.toBeInTheDocument()
    })

    it('can disconnect', async () => {
      mockStore = createMockStore({
        isConnected: true,
        status: 'connected',
        activeConnectionId: 'active-1',
        connections: [
          { id: 'active-1', name: 'Active', uri: 'mongodo://localhost:27017', host: 'localhost', port: 27017, auth: { type: 'none' }, tls: { enabled: false } },
        ],
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore)

      const user = userEvent.setup()
      render(<ConnectionPanel />)

      await user.click(screen.getByTestId('disconnect-button'))

      expect(mockStore.disconnect).toHaveBeenCalled()
    })

    it('shows refresh button when connected', () => {
      mockStore = createMockStore({
        isConnected: true,
        status: 'connected',
        activeConnectionId: 'active-1',
        connections: [
          { id: 'active-1', name: 'Active', uri: 'mongodo://localhost:27017', host: 'localhost', port: 27017, auth: { type: 'none' }, tls: { enabled: false } },
        ],
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore)

      render(<ConnectionPanel />)

      expect(screen.getByTestId('refresh-button')).toBeInTheDocument()
    })
  })

  describe('status indicator', () => {
    it('shows error badge in status indicator when error', () => {
      mockStore = createMockStore({
        status: 'error',
        error: 'Connection failed',
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore)

      render(<ConnectionPanel />)

      expect(screen.getByText('[X]')).toBeInTheDocument()
      expect(screen.getByText('Error')).toBeInTheDocument()
    })
  })
})
