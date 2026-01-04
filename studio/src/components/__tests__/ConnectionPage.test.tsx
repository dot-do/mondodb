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

describe('ConnectionPage', () => {
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
        { id: '1', name: 'Test DB', url: 'mondodb://localhost' },
      ],
    })

    render(<ConnectionPage />)
    expect(screen.getByText('Test DB')).toBeInTheDocument()
    expect(screen.getByText('mondodb://localhost')).toBeInTheDocument()
  })

  it('calls addConnection and connect on form submit', async () => {
    const user = userEvent.setup()
    render(<ConnectionPage />)

    await user.click(screen.getByRole('button', { name: /add connection/i }))
    await user.type(screen.getByLabelText(/connection name/i), 'My Database')
    await user.click(screen.getByRole('button', { name: /connect/i }))

    expect(mockStore.addConnection).toHaveBeenCalledWith({
      name: 'My Database',
      url: 'mondodb://localhost',
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
        { id: '1', name: 'Test DB', url: 'mondodb://localhost' },
      ],
      isConnecting: true,
    })

    render(<ConnectionPage />)
    expect(screen.getByRole('button', { name: /connecting/i })).toBeDisabled()
  })
})
