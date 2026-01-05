import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LeafyGreenProvider from '@leafygreen-ui/leafygreen-provider'
import { useConnectionStore } from '@stores/connection'
import { ProtectedRoute } from '../App'

// Mock the connection store
vi.mock('@stores/connection', () => ({
  useConnectionStore: vi.fn(),
}))

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

interface TestWrapperProps {
  children: React.ReactNode
  initialEntries?: string[]
}

function TestWrapper({ children, initialEntries = ['/'] }: TestWrapperProps) {
  const queryClient = createTestQueryClient()

  return (
    <LeafyGreenProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      </QueryClientProvider>
    </LeafyGreenProvider>
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to / when user is not connected', () => {
    vi.mocked(useConnectionStore).mockReturnValue({
      isConnected: false,
      connections: [],
      activeConnectionId: null,
      isConnecting: false,
      error: null,
      addConnection: vi.fn(),
      removeConnection: vi.fn(),
      updateConnection: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      setError: vi.fn(),
    })

    let currentLocation = ''

    render(
      <TestWrapper initialEntries={['/db/testdb']}>
        <Routes>
          <Route path="/" element={<div>Home Page</div>} />
          <Route
            path="/db/:database"
            element={
              <ProtectedRoute>
                <div>Database Page</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="*"
            element={
              <RouteTracker
                onLocationChange={(path) => {
                  currentLocation = path
                }}
              />
            }
          />
        </Routes>
      </TestWrapper>
    )

    // Should redirect to home page, not show database page
    expect(screen.getByText('Home Page')).toBeInTheDocument()
    expect(screen.queryByText('Database Page')).not.toBeInTheDocument()
  })

  it('renders children when user is connected', () => {
    vi.mocked(useConnectionStore).mockReturnValue({
      isConnected: true,
      connections: [{ id: '1', name: 'Test', url: 'mondodb://localhost' }],
      activeConnectionId: '1',
      isConnecting: false,
      error: null,
      addConnection: vi.fn(),
      removeConnection: vi.fn(),
      updateConnection: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      setError: vi.fn(),
    })

    render(
      <TestWrapper initialEntries={['/db/testdb']}>
        <Routes>
          <Route path="/" element={<div>Home Page</div>} />
          <Route
            path="/db/:database"
            element={
              <ProtectedRoute>
                <div>Database Page</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </TestWrapper>
    )

    // Should show database page when connected
    expect(screen.getByText('Database Page')).toBeInTheDocument()
    expect(screen.queryByText('Home Page')).not.toBeInTheDocument()
  })

  it('redirects from collection route when not connected', () => {
    vi.mocked(useConnectionStore).mockReturnValue({
      isConnected: false,
      connections: [],
      activeConnectionId: null,
      isConnecting: false,
      error: null,
      addConnection: vi.fn(),
      removeConnection: vi.fn(),
      updateConnection: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      setError: vi.fn(),
    })

    render(
      <TestWrapper initialEntries={['/db/testdb/users']}>
        <Routes>
          <Route path="/" element={<div>Home Page</div>} />
          <Route
            path="/db/:database/:collection"
            element={
              <ProtectedRoute>
                <div>Collection Page</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </TestWrapper>
    )

    // Should redirect to home page, not show collection page
    expect(screen.getByText('Home Page')).toBeInTheDocument()
    expect(screen.queryByText('Collection Page')).not.toBeInTheDocument()
  })

  it('allows access to collection route when connected', () => {
    vi.mocked(useConnectionStore).mockReturnValue({
      isConnected: true,
      connections: [{ id: '1', name: 'Test', url: 'mondodb://localhost' }],
      activeConnectionId: '1',
      isConnecting: false,
      error: null,
      addConnection: vi.fn(),
      removeConnection: vi.fn(),
      updateConnection: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      setError: vi.fn(),
    })

    render(
      <TestWrapper initialEntries={['/db/testdb/users']}>
        <Routes>
          <Route path="/" element={<div>Home Page</div>} />
          <Route
            path="/db/:database/:collection"
            element={
              <ProtectedRoute>
                <div>Collection Page</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </TestWrapper>
    )

    // Should show collection page when connected
    expect(screen.getByText('Collection Page')).toBeInTheDocument()
    expect(screen.queryByText('Home Page')).not.toBeInTheDocument()
  })
})

// Helper component to track route changes (for debugging)
function RouteTracker({
  onLocationChange,
}: {
  onLocationChange: (path: string) => void
}) {
  return null
}
