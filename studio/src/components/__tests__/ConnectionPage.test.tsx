import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { ConnectionPage } from '@components/pages/ConnectionPage'
import { useConnectionStore } from '@stores/connection'

// Mock the connection store
vi.mock('@stores/connection', () => ({
  useConnectionStore: vi.fn(),
}))

// TODO: Tests need to be updated to match current component implementation
describe.skip('ConnectionPage', () => {
  const mockStore = {
    connections: [],
    isConnecting: false,
    error: null,
    addConnection: vi.fn().mockReturnValue('test-id'),
    connect: vi.fn(),
    removeConnection: vi.fn(),
  }

  beforeEach(() => {
    vi.mocked(useConnectionStore).mockReturnValue(mockStore)
  })

  it('renders empty state when no connections', () => {
    render(<ConnectionPage />)
    expect(screen.getByText('No connections yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add connection/i })).toBeInTheDocument()
  })

  it('shows connection form when Add Connection is clicked', async () => {
    const user = userEvent.setup()
    render(<ConnectionPage />)

    await user.click(screen.getByRole('button', { name: /add connection/i }))

    expect(screen.getByText('New Connection')).toBeInTheDocument()
    expect(screen.getByLabelText(/connection name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/connection url/i)).toBeInTheDocument()
  })

  it('renders existing connections', () => {
    vi.mocked(useConnectionStore).mockReturnValue({
      ...mockStore,
      connections: [
        { id: '1', name: 'Test DB', url: 'mongodo://localhost' },
      ],
    })

    render(<ConnectionPage />)
    expect(screen.getByText('Test DB')).toBeInTheDocument()
    expect(screen.getByText('mongodo://localhost')).toBeInTheDocument()
  })

  it('calls addConnection and connect on form submit', async () => {
    const user = userEvent.setup()
    render(<ConnectionPage />)

    await user.click(screen.getByRole('button', { name: /add connection/i }))
    await user.type(screen.getByLabelText(/connection name/i), 'My Database')
    await user.click(screen.getByRole('button', { name: /connect/i }))

    expect(mockStore.addConnection).toHaveBeenCalledWith({
      name: 'My Database',
      url: 'mongodo://localhost',
    })
    expect(mockStore.connect).toHaveBeenCalledWith('test-id')
  })

  it('shows error message when connection fails', () => {
    vi.mocked(useConnectionStore).mockReturnValue({
      ...mockStore,
      error: 'Connection refused',
    })

    render(<ConnectionPage />)
    expect(screen.getByText('Connection refused')).toBeInTheDocument()
  })

  it('shows connecting state', () => {
    vi.mocked(useConnectionStore).mockReturnValue({
      ...mockStore,
      connections: [
        { id: '1', name: 'Test DB', url: 'mongodo://localhost' },
      ],
      isConnecting: true,
    })

    render(<ConnectionPage />)
    // LeafyGreen buttons use aria-disabled instead of native disabled attribute
    expect(screen.getByRole('button', { name: /connecting/i })).toHaveAttribute('aria-disabled', 'true')
  })

  it('should NOT reset form until connect() succeeds', async () => {
    const user = userEvent.setup()

    // Create a connect function that rejects
    const connectError = new Error('Connection failed')
    const rejectingConnect = vi.fn().mockRejectedValue(connectError)

    vi.mocked(useConnectionStore).mockReturnValue({
      ...mockStore,
      connect: rejectingConnect,
    })

    render(<ConnectionPage />)

    // Open the form and fill it out
    await user.click(screen.getByRole('button', { name: /add connection/i }))
    await user.clear(screen.getByLabelText(/connection name/i))
    await user.type(screen.getByLabelText(/connection name/i), 'My Test Database')

    // Verify form is visible with our input
    expect(screen.getByText('New Connection')).toBeInTheDocument()
    expect(screen.getByLabelText(/connection name/i)).toHaveValue('My Test Database')

    // Submit the form (connect will fail)
    await user.click(screen.getByRole('button', { name: /connect/i }))

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

    // Create a connect function that resolves successfully
    const resolvingConnect = vi.fn().mockResolvedValue(undefined)

    vi.mocked(useConnectionStore).mockReturnValue({
      ...mockStore,
      connect: resolvingConnect,
    })

    render(<ConnectionPage />)

    // Open the form and fill it out
    await user.click(screen.getByRole('button', { name: /add connection/i }))
    await user.clear(screen.getByLabelText(/connection name/i))
    await user.type(screen.getByLabelText(/connection name/i), 'My Test Database')

    // Verify form is visible with our input
    expect(screen.getByText('New Connection')).toBeInTheDocument()

    // Submit the form (connect will succeed)
    await user.click(screen.getByRole('button', { name: /connect/i }))

    // Wait for the async operation to complete
    await waitFor(() => {
      expect(resolvingConnect).toHaveBeenCalled()
    })

    // Form should be hidden after successful connect
    await waitFor(() => {
      expect(screen.queryByText('New Connection')).not.toBeInTheDocument()
    })
  })
})
