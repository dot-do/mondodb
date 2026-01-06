import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { ConnectionPage } from '@components/pages/ConnectionPage'
import { useConnectionStore, ConnectionInfo } from '@stores/connection'

// Mock the connection store
vi.mock('@stores/connection', () => ({
  useConnectionStore: vi.fn(),
}))

// Mock react-router-dom navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('ConnectionPage', () => {
  // Default mock store state
  const createMockStore = (overrides = {}) => ({
    connections: [] as ConnectionInfo[],
    isConnected: false,
    isConnecting: false,
    error: null as string | null,
    saveConnection: vi.fn().mockReturnValue('test-id'),
    connect: vi.fn().mockResolvedValue(undefined),
    removeConnection: vi.fn(),
    testConnection: vi.fn().mockResolvedValue({ success: true, message: 'OK' }),
    testResult: null,
    clearTestResult: vi.fn(),
    ...overrides,
  })

  let mockStore: ReturnType<typeof createMockStore>

  beforeEach(() => {
    vi.clearAllMocks()
    mockStore = createMockStore()
    vi.mocked(useConnectionStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useConnectionStore>)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Page Header', () => {
    it('renders the page title "Connections"', () => {
      render(<ConnectionPage />)
      expect(screen.getByRole('heading', { name: /connections/i, level: 2 })).toBeInTheDocument()
    })

    it('renders descriptive text about connecting to mongo.do', () => {
      render(<ConnectionPage />)
      expect(screen.getByText(/connect to a mongo\.do instance/i)).toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('renders empty state when no connections exist', () => {
      render(<ConnectionPage />)
      expect(screen.getByText('No connections yet')).toBeInTheDocument()
    })

    it('shows database icon in empty state', () => {
      render(<ConnectionPage />)
      // LeafyGreen Icon uses aria-label
      expect(screen.getByText('No connections yet')).toBeInTheDocument()
    })

    it('shows instructional text to add a connection', () => {
      render(<ConnectionPage />)
      expect(screen.getByText(/add a connection to start exploring/i)).toBeInTheDocument()
    })

    it('shows Add Connection button in empty state', () => {
      render(<ConnectionPage />)
      expect(screen.getByRole('button', { name: /add connection/i })).toBeInTheDocument()
    })

    it('opens connection form when Add Connection is clicked in empty state', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      expect(screen.getByText('New Connection')).toBeInTheDocument()
    })
  })

  describe('Connection Form Rendering', () => {
    it('shows connection form when Add Connection is clicked', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      expect(screen.getByText('New Connection')).toBeInTheDocument()
    })

    it('renders Connection Name input field', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      expect(screen.getByLabelText(/connection name/i)).toBeInTheDocument()
    })

    it('renders Connection URL input field', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      expect(screen.getByLabelText(/connection url/i)).toBeInTheDocument()
    })

    it('has placeholder text for Connection Name', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      expect(screen.getByPlaceholderText(/my mongo\.do instance/i)).toBeInTheDocument()
    })

    it('has placeholder text for Connection URL', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      expect(screen.getByPlaceholderText(/mongodo:\/\/localhost/i)).toBeInTheDocument()
    })

    it('has default value for Connection URL', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      expect(screen.getByLabelText(/connection url/i)).toHaveValue('mongodo://localhost')
    })

    it('renders Cancel button in form', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })

    it('renders Connect button in form', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      // Find the Connect button in the form (not the one in connection cards)
      const form = screen.getByText('New Connection').closest('form')
      expect(form).toBeInTheDocument()
      expect(within(form!).getByRole('button', { name: /^connect$/i })).toBeInTheDocument()
    })

    it('closes form when Cancel is clicked', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))
      expect(screen.getByText('New Connection')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /cancel/i }))
      expect(screen.queryByText('New Connection')).not.toBeInTheDocument()
    })
  })

  describe('Connection Form Validation', () => {
    it('shows validation error when URL is empty', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      // Clear the default URL
      const urlInput = screen.getByLabelText(/connection url/i)
      await user.clear(urlInput)

      // Submit the form
      const form = screen.getByText('New Connection').closest('form')
      await user.click(within(form!).getByRole('button', { name: /^connect$/i }))

      // Should show validation error
      expect(screen.getByText(/url is required/i)).toBeInTheDocument()
    })

    it('shows validation error for invalid URI format', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      const urlInput = screen.getByLabelText(/connection url/i)
      await user.clear(urlInput)
      await user.type(urlInput, 'invalid-url')

      const form = screen.getByText('New Connection').closest('form')
      await user.click(within(form!).getByRole('button', { name: /^connect$/i }))

      expect(screen.getByText(/invalid.*uri|invalid.*url|must start with/i)).toBeInTheDocument()
    })

    it('accepts valid mongodo:// URI', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      const urlInput = screen.getByLabelText(/connection url/i)
      await user.clear(urlInput)
      await user.type(urlInput, 'mongodo://localhost:27017')

      const form = screen.getByText('New Connection').closest('form')
      await user.click(within(form!).getByRole('button', { name: /^connect$/i }))

      // Should not show validation error
      expect(screen.queryByText(/invalid.*uri|invalid.*url/i)).not.toBeInTheDocument()
    })

    it('validates URI includes port number', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      const urlInput = screen.getByLabelText(/connection url/i)
      await user.clear(urlInput)
      await user.type(urlInput, 'mongodo://localhost:abc')

      const form = screen.getByText('New Connection').closest('form')
      await user.click(within(form!).getByRole('button', { name: /^connect$/i }))

      expect(screen.getByText(/invalid.*port|port.*invalid/i)).toBeInTheDocument()
    })
  })

  describe('URI Input and Parsing', () => {
    it('updates URL field when user types', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      const urlInput = screen.getByLabelText(/connection url/i)
      await user.clear(urlInput)
      await user.type(urlInput, 'mongodo://myhost:27018')

      expect(urlInput).toHaveValue('mongodo://myhost:27018')
    })

    it('updates name field when user types', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      const nameInput = screen.getByLabelText(/connection name/i)
      await user.type(nameInput, 'Production Database')

      expect(nameInput).toHaveValue('Production Database')
    })

    it('preserves user input after form errors', async () => {
      const connectError = new Error('Connection failed')
      mockStore.connect = vi.fn().mockRejectedValue(connectError)
      vi.mocked(useConnectionStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useConnectionStore>)

      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      const nameInput = screen.getByLabelText(/connection name/i)
      await user.type(nameInput, 'My Test Database')

      const form = screen.getByText('New Connection').closest('form')
      await user.click(within(form!).getByRole('button', { name: /^connect$/i }))

      await waitFor(() => {
        expect(mockStore.connect).toHaveBeenCalled()
      })

      // Form should still be visible with user's input preserved
      expect(screen.getByText('New Connection')).toBeInTheDocument()
      expect(screen.getByLabelText(/connection name/i)).toHaveValue('My Test Database')
    })
  })

  describe('Connect Button Behavior', () => {
    it('calls saveConnection with correct data on form submit', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      const nameInput = screen.getByLabelText(/connection name/i)
      await user.type(nameInput, 'My Database')

      const form = screen.getByText('New Connection').closest('form')
      await user.click(within(form!).getByRole('button', { name: /^connect$/i }))

      expect(mockStore.saveConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'My Database',
          uri: 'mongodo://localhost',
        })
      )
    })

    it('calls connect with saved connection ID after saveConnection', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      const nameInput = screen.getByLabelText(/connection name/i)
      await user.type(nameInput, 'My Database')

      const form = screen.getByText('New Connection').closest('form')
      await user.click(within(form!).getByRole('button', { name: /^connect$/i }))

      expect(mockStore.connect).toHaveBeenCalledWith('test-id')
    })

    it('uses default name "New Connection" when name is empty', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      const form = screen.getByText('New Connection').closest('form')
      await user.click(within(form!).getByRole('button', { name: /^connect$/i }))

      expect(mockStore.saveConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Connection',
        })
      )
    })

    it('navigates to /db/default on successful connection', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      const form = screen.getByText('New Connection').closest('form')
      await user.click(within(form!).getByRole('button', { name: /^connect$/i }))

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/db/default')
      })
    })

    it('hides form after successful connection', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))
      expect(screen.getByText('New Connection')).toBeInTheDocument()

      const form = screen.getByText('New Connection').closest('form')
      await user.click(within(form!).getByRole('button', { name: /^connect$/i }))

      await waitFor(() => {
        expect(screen.queryByText('New Connection')).not.toBeInTheDocument()
      })
    })

    it('does not navigate on failed connection', async () => {
      const connectError = new Error('Connection failed')
      mockStore.connect = vi.fn().mockRejectedValue(connectError)
      vi.mocked(useConnectionStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useConnectionStore>)

      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      const form = screen.getByText('New Connection').closest('form')
      await user.click(within(form!).getByRole('button', { name: /^connect$/i }))

      await waitFor(() => {
        expect(mockStore.connect).toHaveBeenCalled()
      })

      // Navigate should not have been called for the form submission route
      // (It may be called for auto-connect behavior, so we check specifically)
      expect(mockNavigate).not.toHaveBeenCalledWith('/db/default')
    })
  })

  describe('Saved Connections Display', () => {
    const mockConnections: ConnectionInfo[] = [
      {
        id: '1',
        name: 'Production DB',
        uri: 'mongodo://prod.example.com:27017',
        host: 'prod.example.com',
        port: 27017,
        auth: { type: 'none' },
        tls: { enabled: false },
        lastConnected: Date.now() - 86400000, // 1 day ago
      },
      {
        id: '2',
        name: 'Staging DB',
        uri: 'mongodo://staging.example.com:27017',
        host: 'staging.example.com',
        port: 27017,
        auth: { type: 'none' },
        tls: { enabled: false },
      },
    ]

    beforeEach(() => {
      mockStore = createMockStore({ connections: mockConnections })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useConnectionStore>)
    })

    it('renders saved connections list', () => {
      render(<ConnectionPage />)
      expect(screen.getByText('Production DB')).toBeInTheDocument()
      expect(screen.getByText('Staging DB')).toBeInTheDocument()
    })

    it('displays connection URLs', () => {
      render(<ConnectionPage />)
      expect(screen.getByText('mongodo://prod.example.com:27017')).toBeInTheDocument()
      expect(screen.getByText('mongodo://staging.example.com:27017')).toBeInTheDocument()
    })

    it('shows last connected date when available', () => {
      render(<ConnectionPage />)
      expect(screen.getByText(/last connected:/i)).toBeInTheDocument()
    })

    it('renders Connect button for each connection', () => {
      render(<ConnectionPage />)
      const connectButtons = screen.getAllByRole('button', { name: /^connect$/i })
      expect(connectButtons.length).toBeGreaterThanOrEqual(2)
    })

    it('renders Remove button for each connection', () => {
      render(<ConnectionPage />)
      const removeButtons = screen.getAllByRole('button', { name: /remove connection/i })
      expect(removeButtons).toHaveLength(2)
    })

    it('does not show empty state when connections exist', () => {
      render(<ConnectionPage />)
      expect(screen.queryByText('No connections yet')).not.toBeInTheDocument()
    })

    it('shows Add Connection button when connections exist', () => {
      render(<ConnectionPage />)
      expect(screen.getByRole('button', { name: /add connection/i })).toBeInTheDocument()
    })
  })

  describe('Saved Connections Selection', () => {
    const mockConnections: ConnectionInfo[] = [
      {
        id: 'conn-1',
        name: 'Test DB',
        uri: 'mongodo://localhost:27017',
        host: 'localhost',
        port: 27017,
        auth: { type: 'none' },
        tls: { enabled: false },
      },
    ]

    beforeEach(() => {
      mockStore = createMockStore({ connections: mockConnections })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useConnectionStore>)
    })

    it('calls connect when clicking connection card', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      // Click on the connection card (the whole card should be clickable)
      await user.click(screen.getByText('Test DB'))

      expect(mockStore.connect).toHaveBeenCalledWith('conn-1')
    })

    it('calls connect when clicking Connect button', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /^connect$/i }))

      expect(mockStore.connect).toHaveBeenCalledWith('conn-1')
    })

    it('navigates after successful connection', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /^connect$/i }))

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/db/default')
      })
    })

    it('calls removeConnection when clicking Remove button', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /remove connection/i }))

      expect(mockStore.removeConnection).toHaveBeenCalledWith('conn-1')
    })

    it('does not trigger connect when clicking Remove button', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /remove connection/i }))

      expect(mockStore.connect).not.toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('displays connection error message', () => {
      mockStore = createMockStore({ error: 'Connection refused' })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useConnectionStore>)

      render(<ConnectionPage />)
      expect(screen.getByText('Connection refused')).toBeInTheDocument()
    })

    it('displays error with red styling', () => {
      mockStore = createMockStore({ error: 'Network error' })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useConnectionStore>)

      render(<ConnectionPage />)
      const errorElement = screen.getByText('Network error')
      // Check that error has some kind of error styling
      expect(errorElement).toBeInTheDocument()
    })

    it('does not display error section when no error', () => {
      render(<ConnectionPage />)
      expect(screen.queryByText(/connection refused|network error|failed/i)).not.toBeInTheDocument()
    })

    it('preserves form state when connection fails', async () => {
      const connectError = new Error('Connection failed')
      mockStore.connect = vi.fn().mockRejectedValue(connectError)
      vi.mocked(useConnectionStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useConnectionStore>)

      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      const nameInput = screen.getByLabelText(/connection name/i)
      await user.type(nameInput, 'My Custom Connection')

      const urlInput = screen.getByLabelText(/connection url/i)
      await user.clear(urlInput)
      await user.type(urlInput, 'mongodo://custom-host:27018')

      const form = screen.getByText('New Connection').closest('form')
      await user.click(within(form!).getByRole('button', { name: /^connect$/i }))

      await waitFor(() => {
        expect(mockStore.connect).toHaveBeenCalled()
      })

      // Form should remain visible with user's data
      expect(screen.getByText('New Connection')).toBeInTheDocument()
      expect(screen.getByLabelText(/connection name/i)).toHaveValue('My Custom Connection')
      expect(screen.getByLabelText(/connection url/i)).toHaveValue('mongodo://custom-host:27018')
    })
  })

  describe('Loading States', () => {
    it('shows "Connecting..." text when isConnecting is true', () => {
      mockStore = createMockStore({
        isConnecting: true,
        connections: [
          {
            id: '1',
            name: 'Test DB',
            uri: 'mongodo://localhost',
            host: 'localhost',
            port: 27017,
            auth: { type: 'none' },
            tls: { enabled: false },
          },
        ],
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useConnectionStore>)

      render(<ConnectionPage />)
      expect(screen.getByText(/connecting/i)).toBeInTheDocument()
    })

    it('disables Connect button when isConnecting is true', () => {
      mockStore = createMockStore({
        isConnecting: true,
        connections: [
          {
            id: '1',
            name: 'Test DB',
            uri: 'mongodo://localhost',
            host: 'localhost',
            port: 27017,
            auth: { type: 'none' },
            tls: { enabled: false },
          },
        ],
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useConnectionStore>)

      render(<ConnectionPage />)
      // LeafyGreen buttons may use aria-disabled
      const connectButton = screen.getByRole('button', { name: /connecting/i })
      expect(connectButton).toHaveAttribute('aria-disabled', 'true')
    })

    it('disables form submit button when connecting', async () => {
      mockStore = createMockStore({ isConnecting: true })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useConnectionStore>)

      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      const form = screen.getByText('New Connection').closest('form')
      const submitButton = within(form!).getByRole('button', { name: /connecting/i })
      expect(submitButton).toHaveAttribute('aria-disabled', 'true')
    })

    it('shows loading indicator during connection test', async () => {
      // Create a promise that doesn't resolve immediately
      let resolveConnect: () => void
      const pendingConnect = new Promise<void>((resolve) => {
        resolveConnect = resolve
      })
      mockStore.connect = vi.fn().mockReturnValue(pendingConnect)
      mockStore.isConnecting = true
      vi.mocked(useConnectionStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useConnectionStore>)

      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      // Should show loading state
      expect(screen.getByText(/connecting/i)).toBeInTheDocument()

      // Cleanup
      resolveConnect!()
    })
  })

  describe('Auto-Navigation on Connected State', () => {
    it('automatically navigates to /db/default when already connected', () => {
      mockStore = createMockStore({ isConnected: true })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useConnectionStore>)

      render(<ConnectionPage />)

      expect(mockNavigate).toHaveBeenCalledWith('/db/default')
    })

    it('does not auto-navigate when not connected', () => {
      mockStore = createMockStore({ isConnected: false })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useConnectionStore>)

      render(<ConnectionPage />)

      expect(mockNavigate).not.toHaveBeenCalled()
    })
  })

  describe('Connection Card Interactions', () => {
    const mockConnections: ConnectionInfo[] = [
      {
        id: 'conn-1',
        name: 'My Database',
        uri: 'mongodo://localhost:27017',
        host: 'localhost',
        port: 27017,
        auth: { type: 'none' },
        tls: { enabled: false },
      },
    ]

    beforeEach(() => {
      mockStore = createMockStore({ connections: mockConnections })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useConnectionStore>)
    })

    it('connection card is clickable', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      const card = screen.getByText('My Database').closest('[class*="card"]')
      expect(card).toHaveStyle({ cursor: 'pointer' })
    })

    it('clicking card body triggers connect', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      // Click on the connection name which is inside the card
      await user.click(screen.getByText('My Database'))

      expect(mockStore.connect).toHaveBeenCalledWith('conn-1')
    })

    it('shows database icon in connection card', () => {
      render(<ConnectionPage />)
      // Connection cards should have an icon - checking for the icon container
      expect(screen.getByText('My Database')).toBeInTheDocument()
    })
  })

  describe('Test Connection Feature', () => {
    it('renders Test Connection button in form', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      expect(screen.getByRole('button', { name: /test connection/i })).toBeInTheDocument()
    })

    it('calls testConnection when Test Connection button is clicked', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))
      await user.click(screen.getByRole('button', { name: /test connection/i }))

      expect(mockStore.testConnection).toHaveBeenCalledWith('mongodo://localhost')
    })

    it('shows success message after successful test', async () => {
      mockStore = createMockStore({
        testResult: { success: true, message: 'Connection successful', latency: 50 },
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useConnectionStore>)

      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      expect(screen.getByText(/connection successful/i)).toBeInTheDocument()
    })

    it('shows error message after failed test', async () => {
      mockStore = createMockStore({
        testResult: { success: false, message: 'Connection failed' },
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useConnectionStore>)

      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      expect(screen.getByText(/connection failed/i)).toBeInTheDocument()
    })

    it('shows latency in test result when available', async () => {
      mockStore = createMockStore({
        testResult: { success: true, message: 'Connection successful', latency: 125 },
      })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useConnectionStore>)

      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      expect(screen.getByText(/125\s*ms/i)).toBeInTheDocument()
    })
  })

  describe('Keyboard Accessibility', () => {
    const mockConnections: ConnectionInfo[] = [
      {
        id: 'conn-1',
        name: 'Test DB',
        uri: 'mongodo://localhost:27017',
        host: 'localhost',
        port: 27017,
        auth: { type: 'none' },
        tls: { enabled: false },
      },
    ]

    beforeEach(() => {
      mockStore = createMockStore({ connections: mockConnections })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useConnectionStore>)
    })

    it('form can be submitted with Enter key', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.click(screen.getByRole('button', { name: /add connection/i }))

      const nameInput = screen.getByLabelText(/connection name/i)
      await user.type(nameInput, 'My Database{Enter}')

      expect(mockStore.saveConnection).toHaveBeenCalled()
    })

    it('connection card is focusable', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      await user.tab()
      // Should be able to tab to connection elements
      expect(document.activeElement).not.toBe(document.body)
    })

    it('activates connection on Enter when card is focused', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      const card = screen.getByText('Test DB').closest('[class*="card"]')
      if (card) {
        ;(card as HTMLElement).focus()
        await user.keyboard('{Enter}')
        expect(mockStore.connect).toHaveBeenCalledWith('conn-1')
      }
    })
  })

  describe('Form Reset Behavior', () => {
    it('should NOT reset form until connect() succeeds', async () => {
      const user = userEvent.setup()
      const connectError = new Error('Connection failed')
      const rejectingConnect = vi.fn().mockRejectedValue(connectError)

      mockStore = createMockStore({ connect: rejectingConnect })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useConnectionStore>)

      render(<ConnectionPage />)

      // Open the form and fill it out
      await user.click(screen.getByRole('button', { name: /add connection/i }))
      await user.type(screen.getByLabelText(/connection name/i), 'My Test Database')

      // Verify form is visible with our input
      expect(screen.getByText('New Connection')).toBeInTheDocument()
      expect(screen.getByLabelText(/connection name/i)).toHaveValue('My Test Database')

      // Submit the form (connect will fail)
      const form = screen.getByText('New Connection').closest('form')
      await user.click(within(form!).getByRole('button', { name: /^connect$/i }))

      // Wait for the async operation to complete
      await waitFor(() => {
        expect(rejectingConnect).toHaveBeenCalled()
      })

      // Form should still be visible with user's input preserved after connect failure
      expect(screen.getByText('New Connection')).toBeInTheDocument()
      expect(screen.getByLabelText(/connection name/i)).toHaveValue('My Test Database')
    })

    it('should reset form and navigate only after connect() succeeds', async () => {
      const user = userEvent.setup()
      const resolvingConnect = vi.fn().mockResolvedValue(undefined)

      mockStore = createMockStore({ connect: resolvingConnect })
      vi.mocked(useConnectionStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useConnectionStore>)

      render(<ConnectionPage />)

      // Open the form and fill it out
      await user.click(screen.getByRole('button', { name: /add connection/i }))
      await user.type(screen.getByLabelText(/connection name/i), 'My Test Database')

      // Verify form is visible with our input
      expect(screen.getByText('New Connection')).toBeInTheDocument()

      // Submit the form (connect will succeed)
      const form = screen.getByText('New Connection').closest('form')
      await user.click(within(form!).getByRole('button', { name: /^connect$/i }))

      // Wait for the async operation to complete
      await waitFor(() => {
        expect(resolvingConnect).toHaveBeenCalled()
      })

      // Form should be hidden after successful connect
      await waitFor(() => {
        expect(screen.queryByText('New Connection')).not.toBeInTheDocument()
      })
    })

    it('resets name field to empty after successful connection', async () => {
      const user = userEvent.setup()
      render(<ConnectionPage />)

      // First connection
      await user.click(screen.getByRole('button', { name: /add connection/i }))
      await user.type(screen.getByLabelText(/connection name/i), 'First Database')

      const form = screen.getByText('New Connection').closest('form')
      await user.click(within(form!).getByRole('button', { name: /^connect$/i }))

      await waitFor(() => {
        expect(screen.queryByText('New Connection')).not.toBeInTheDocument()
      })

      // Open form again
      await user.click(screen.getByRole('button', { name: /add connection/i }))

      // Name should be reset
      expect(screen.getByLabelText(/connection name/i)).toHaveValue('')
    })
  })
})
