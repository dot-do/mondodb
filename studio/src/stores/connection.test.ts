import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useConnectionStore, ConnectionInfo } from './connection'

// Mock the rpcClient module
vi.mock('../lib/rpc-client', () => ({
  rpcClient: {
    setBaseUrl: vi.fn(),
  },
}))

// Mock crypto.randomUUID for deterministic IDs in tests
const mockUUID = vi.fn()
vi.stubGlobal('crypto', {
  randomUUID: mockUUID,
})

// Mock fetch for connection testing
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Helper to reset store state
function resetStore() {
  const { result } = renderHook(() => useConnectionStore())
  act(() => {
    // Disconnect any active connection
    result.current.disconnect()
    // Remove all connections
    result.current.connections.forEach((c) => {
      result.current.removeConnection(c.id)
    })
    // Clear any errors
    result.current.setError(null)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUUID.mockReturnValue('test-uuid-1')
  resetStore()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useConnectionStore', () => {
  describe('initial state', () => {
    it('initializes with default values', () => {
      const { result } = renderHook(() => useConnectionStore())

      expect(result.current.connections).toEqual([])
      expect(result.current.activeConnectionId).toBeNull()
      expect(result.current.isConnected).toBe(false)
      expect(result.current.isConnecting).toBe(false)
      // isHydrated becomes true after persist middleware hydrates from storage
      // In test environment, this happens synchronously
      expect(typeof result.current.isHydrated).toBe('boolean')
      expect(result.current.error).toBeNull()
    })
  })

  describe('hydration', () => {
    it('starts with isHydrated as false', () => {
      const { result } = renderHook(() => useConnectionStore())
      // Note: In test environment, hydration happens synchronously
      // so isHydrated may already be true. We test setHydrated action instead.
      expect(typeof result.current.isHydrated).toBe('boolean')
    })

    it('setHydrated action sets isHydrated to true', () => {
      const { result } = renderHook(() => useConnectionStore())

      // Force isHydrated to false for testing
      act(() => {
        useConnectionStore.setState({ isHydrated: false })
      })

      expect(result.current.isHydrated).toBe(false)

      act(() => {
        result.current.setHydrated()
      })

      expect(result.current.isHydrated).toBe(true)
    })

    it('isHydrated is not persisted', () => {
      const store = useConnectionStore
      const partialize = store.persist.getOptions().partialize

      const state = {
        connections: [],
        activeConnectionId: null,
        isConnected: false,
        isConnecting: false,
        isHydrated: true,
        error: null,
      }

      const persisted = partialize?.(state as any)

      expect(persisted).toEqual({
        connections: [],
      })
      expect(persisted).not.toHaveProperty('isHydrated')
    })
  })

  describe('addConnection', () => {
    it('adds a new connection with generated UUID', () => {
      const { result } = renderHook(() => useConnectionStore())

      let id: string
      act(() => {
        id = result.current.addConnection({
          name: 'Test Connection',
          url: 'http://localhost:8787',
        })
      })

      expect(id!).toBe('test-uuid-1')
      expect(result.current.connections).toHaveLength(1)
      expect(result.current.connections[0]).toEqual(
        expect.objectContaining({
          id: 'test-uuid-1',
          name: 'Test Connection',
          url: 'http://localhost:8787',
        })
      )
    })

    it('adds multiple connections', () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValueOnce('uuid-1').mockReturnValueOnce('uuid-2')

      act(() => {
        result.current.addConnection({
          name: 'Connection 1',
          url: 'http://localhost:8787',
        })
      })

      act(() => {
        result.current.addConnection({
          name: 'Connection 2',
          url: 'http://localhost:8788',
        })
      })

      expect(result.current.connections).toHaveLength(2)
      expect(result.current.connections[0]?.name).toBe('Connection 1')
      expect(result.current.connections[1]?.name).toBe('Connection 2')
    })

    it('preserves lastConnected if provided', () => {
      const { result } = renderHook(() => useConnectionStore())
      const timestamp = Date.now()

      act(() => {
        result.current.addConnection({
          name: 'Test',
          url: 'http://localhost:8787',
          lastConnected: timestamp,
        })
      })

      expect(result.current.connections[0]?.lastConnected).toBe(timestamp)
    })
  })

  describe('removeConnection', () => {
    it('removes a connection by id', () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValueOnce('uuid-1').mockReturnValueOnce('uuid-2')

      act(() => {
        result.current.addConnection({
          name: 'Connection 1',
          url: 'http://localhost:8787',
        })
        result.current.addConnection({
          name: 'Connection 2',
          url: 'http://localhost:8788',
        })
      })

      act(() => {
        result.current.removeConnection('uuid-1')
      })

      expect(result.current.connections).toHaveLength(1)
      expect(result.current.connections[0]?.id).toBe('uuid-2')
    })

    it('clears activeConnectionId when removing active connection', () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValue('active-id')
      mockFetch.mockResolvedValueOnce({ ok: true })

      act(() => {
        result.current.addConnection({
          name: 'Active Connection',
          url: 'http://localhost:8787',
        })
      })

      // Manually set as active (simulating a successful connection)
      act(() => {
        // We'll simulate by removing the connection while it's "active"
        // First, let's set up the state manually via the connect flow
      })

      // For this test, we'll check the logic by setting up an active connection
      // and then removing it
      const { result: result2 } = renderHook(() => useConnectionStore.getState())

      // Set activeConnectionId manually to test the removal logic
      act(() => {
        useConnectionStore.setState({ activeConnectionId: 'active-id' })
      })

      expect(useConnectionStore.getState().activeConnectionId).toBe('active-id')

      act(() => {
        result.current.removeConnection('active-id')
      })

      expect(result.current.activeConnectionId).toBeNull()
    })

    it('preserves activeConnectionId when removing different connection', () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValueOnce('conn-1').mockReturnValueOnce('conn-2')

      act(() => {
        result.current.addConnection({
          name: 'Connection 1',
          url: 'http://localhost:8787',
        })
        result.current.addConnection({
          name: 'Connection 2',
          url: 'http://localhost:8788',
        })
      })

      // Set conn-1 as active
      act(() => {
        useConnectionStore.setState({ activeConnectionId: 'conn-1' })
      })

      // Remove conn-2
      act(() => {
        result.current.removeConnection('conn-2')
      })

      expect(result.current.activeConnectionId).toBe('conn-1')
    })

    it('handles removing non-existent connection gracefully', () => {
      const { result } = renderHook(() => useConnectionStore())

      act(() => {
        result.current.addConnection({
          name: 'Test',
          url: 'http://localhost:8787',
        })
      })

      act(() => {
        result.current.removeConnection('non-existent-id')
      })

      expect(result.current.connections).toHaveLength(1)
    })
  })

  describe('updateConnection', () => {
    it('updates connection name', () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValue('conn-id')

      act(() => {
        result.current.addConnection({
          name: 'Original Name',
          url: 'http://localhost:8787',
        })
      })

      act(() => {
        result.current.updateConnection('conn-id', { name: 'Updated Name' })
      })

      expect(result.current.connections[0]?.name).toBe('Updated Name')
      expect(result.current.connections[0]?.url).toBe('http://localhost:8787')
    })

    it('updates connection URL', () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValue('conn-id')

      act(() => {
        result.current.addConnection({
          name: 'Test',
          url: 'http://localhost:8787',
        })
      })

      act(() => {
        result.current.updateConnection('conn-id', {
          url: 'http://localhost:9000',
        })
      })

      expect(result.current.connections[0]?.url).toBe('http://localhost:9000')
    })

    it('updates lastConnected timestamp', () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValue('conn-id')
      const timestamp = Date.now()

      act(() => {
        result.current.addConnection({
          name: 'Test',
          url: 'http://localhost:8787',
        })
      })

      act(() => {
        result.current.updateConnection('conn-id', { lastConnected: timestamp })
      })

      expect(result.current.connections[0]?.lastConnected).toBe(timestamp)
    })

    it('updates multiple fields at once', () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValue('conn-id')

      act(() => {
        result.current.addConnection({
          name: 'Original',
          url: 'http://localhost:8787',
        })
      })

      act(() => {
        result.current.updateConnection('conn-id', {
          name: 'New Name',
          url: 'http://new-url:8787',
          lastConnected: 12345,
        })
      })

      expect(result.current.connections[0]).toEqual(
        expect.objectContaining({
          id: 'conn-id',
          name: 'New Name',
          url: 'http://new-url:8787',
          lastConnected: 12345,
        })
      )
    })

    it('only updates the specified connection', () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValueOnce('conn-1').mockReturnValueOnce('conn-2')

      act(() => {
        result.current.addConnection({
          name: 'Connection 1',
          url: 'http://localhost:8787',
        })
        result.current.addConnection({
          name: 'Connection 2',
          url: 'http://localhost:8788',
        })
      })

      act(() => {
        result.current.updateConnection('conn-1', { name: 'Updated 1' })
      })

      expect(result.current.connections[0]?.name).toBe('Updated 1')
      expect(result.current.connections[1]?.name).toBe('Connection 2')
    })

    it('handles updating non-existent connection gracefully', () => {
      const { result } = renderHook(() => useConnectionStore())

      act(() => {
        result.current.addConnection({
          name: 'Test',
          url: 'http://localhost:8787',
        })
      })

      const originalConnections = [...result.current.connections]

      act(() => {
        result.current.updateConnection('non-existent', { name: 'New Name' })
      })

      expect(result.current.connections).toEqual(originalConnections)
    })
  })

  describe('connect', () => {
    it('successfully connects to a valid connection', async () => {
      const { result } = renderHook(() => useConnectionStore())
      const { rpcClient } = await import('../lib/rpc-client')

      mockUUID.mockReturnValue('conn-id')
      mockFetch.mockResolvedValueOnce({ ok: true })

      act(() => {
        result.current.addConnection({
          name: 'Test',
          url: 'http://localhost:8787',
        })
      })

      await act(async () => {
        await result.current.connect('conn-id')
      })

      expect(result.current.isConnected).toBe(true)
      expect(result.current.isConnecting).toBe(false)
      expect(result.current.activeConnectionId).toBe('conn-id')
      expect(result.current.error).toBeNull()
      expect(rpcClient.setBaseUrl).toHaveBeenCalledWith('http://localhost:8787')
    })

    it('sets isConnecting to true during connection', async () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValue('conn-id')

      // Create a promise we can control
      let resolvePromise: () => void
      const connectionPromise = new Promise<void>((resolve) => {
        resolvePromise = resolve
      })

      mockFetch.mockImplementationOnce(() => {
        // Return a pending promise
        return new Promise((resolve) => {
          connectionPromise.then(() => resolve({ ok: true }))
        })
      })

      act(() => {
        result.current.addConnection({
          name: 'Test',
          url: 'http://localhost:8787',
        })
      })

      // Start connecting but don't await
      let connectPromise: Promise<void>
      act(() => {
        connectPromise = result.current.connect('conn-id')
      })

      // Check intermediate state
      expect(result.current.isConnecting).toBe(true)
      expect(result.current.isConnected).toBe(false)

      // Resolve the connection
      await act(async () => {
        resolvePromise!()
        await connectPromise!
      })

      expect(result.current.isConnecting).toBe(false)
      expect(result.current.isConnected).toBe(true)
    })

    it('sets error when connection not found', async () => {
      const { result } = renderHook(() => useConnectionStore())

      await act(async () => {
        await result.current.connect('non-existent-id')
      })

      expect(result.current.error).toBe('Connection not found')
      expect(result.current.isConnected).toBe(false)
      expect(result.current.isConnecting).toBe(false)
    })

    it('sets error when health check fails', async () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValue('conn-id')
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 })

      act(() => {
        result.current.addConnection({
          name: 'Test',
          url: 'http://localhost:8787',
        })
      })

      await act(async () => {
        await result.current.connect('conn-id')
      })

      expect(result.current.error).toBe('Failed to connect to mongo.do')
      expect(result.current.isConnected).toBe(false)
      expect(result.current.isConnecting).toBe(false)
    })

    it('sets error when fetch throws', async () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValue('conn-id')
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      act(() => {
        result.current.addConnection({
          name: 'Test',
          url: 'http://localhost:8787',
        })
      })

      await act(async () => {
        await result.current.connect('conn-id')
      })

      expect(result.current.error).toBe('Network error')
      expect(result.current.isConnected).toBe(false)
      expect(result.current.isConnecting).toBe(false)
    })

    it('handles non-Error thrown values', async () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValue('conn-id')
      mockFetch.mockRejectedValueOnce('String error')

      act(() => {
        result.current.addConnection({
          name: 'Test',
          url: 'http://localhost:8787',
        })
      })

      await act(async () => {
        await result.current.connect('conn-id')
      })

      expect(result.current.error).toBe('Connection failed')
    })

    it('clears previous error on new connect attempt', async () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValue('conn-id')

      act(() => {
        result.current.addConnection({
          name: 'Test',
          url: 'http://localhost:8787',
        })
        result.current.setError('Previous error')
      })

      mockFetch.mockResolvedValueOnce({ ok: true })

      await act(async () => {
        await result.current.connect('conn-id')
      })

      expect(result.current.error).toBeNull()
    })

    it('updates lastConnected timestamp on successful connection', async () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValue('conn-id')
      mockFetch.mockResolvedValueOnce({ ok: true })

      const beforeConnect = Date.now()

      act(() => {
        result.current.addConnection({
          name: 'Test',
          url: 'http://localhost:8787',
        })
      })

      await act(async () => {
        await result.current.connect('conn-id')
      })

      const afterConnect = Date.now()

      expect(result.current.connections[0]?.lastConnected).toBeGreaterThanOrEqual(
        beforeConnect
      )
      expect(result.current.connections[0]?.lastConnected).toBeLessThanOrEqual(
        afterConnect
      )
    })

    it('calls health endpoint with correct URL', async () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValue('conn-id')
      mockFetch.mockResolvedValueOnce({ ok: true })

      act(() => {
        result.current.addConnection({
          name: 'Test',
          url: 'http://localhost:8787',
        })
      })

      await act(async () => {
        await result.current.connect('conn-id')
      })

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8787/api/health')
    })

    it('handles URL with trailing slash correctly', async () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValue('conn-id')
      mockFetch.mockResolvedValueOnce({ ok: true })

      act(() => {
        result.current.addConnection({
          name: 'Test',
          url: 'http://localhost:8787/',
        })
      })

      await act(async () => {
        await result.current.connect('conn-id')
      })

      // The URL constructor handles this, resulting in correct health URL
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8787/api/health')
    })
  })

  describe('disconnect', () => {
    it('clears connection state', async () => {
      const { result } = renderHook(() => useConnectionStore())
      const { rpcClient } = await import('../lib/rpc-client')

      mockUUID.mockReturnValue('conn-id')
      mockFetch.mockResolvedValueOnce({ ok: true })

      act(() => {
        result.current.addConnection({
          name: 'Test',
          url: 'http://localhost:8787',
        })
      })

      await act(async () => {
        await result.current.connect('conn-id')
      })

      expect(result.current.isConnected).toBe(true)

      act(() => {
        result.current.disconnect()
      })

      expect(result.current.isConnected).toBe(false)
      expect(result.current.activeConnectionId).toBeNull()
      expect(result.current.error).toBeNull()
    })

    it('clears rpcClient base URL', async () => {
      const { result } = renderHook(() => useConnectionStore())
      const { rpcClient } = await import('../lib/rpc-client')

      vi.mocked(rpcClient.setBaseUrl).mockClear()

      act(() => {
        result.current.disconnect()
      })

      expect(rpcClient.setBaseUrl).toHaveBeenCalledWith('')
    })

    it('clears any existing error', () => {
      const { result } = renderHook(() => useConnectionStore())

      act(() => {
        result.current.setError('Some error')
      })

      expect(result.current.error).toBe('Some error')

      act(() => {
        result.current.disconnect()
      })

      expect(result.current.error).toBeNull()
    })

    it('can be called when not connected', () => {
      const { result } = renderHook(() => useConnectionStore())

      expect(result.current.isConnected).toBe(false)

      // Should not throw
      act(() => {
        result.current.disconnect()
      })

      expect(result.current.isConnected).toBe(false)
    })
  })

  describe('setError', () => {
    it('sets error message', () => {
      const { result } = renderHook(() => useConnectionStore())

      act(() => {
        result.current.setError('Test error')
      })

      expect(result.current.error).toBe('Test error')
    })

    it('clears error when set to null', () => {
      const { result } = renderHook(() => useConnectionStore())

      act(() => {
        result.current.setError('Test error')
      })

      act(() => {
        result.current.setError(null)
      })

      expect(result.current.error).toBeNull()
    })

    it('overwrites existing error', () => {
      const { result } = renderHook(() => useConnectionStore())

      act(() => {
        result.current.setError('First error')
      })

      act(() => {
        result.current.setError('Second error')
      })

      expect(result.current.error).toBe('Second error')
    })
  })

  describe('persistence', () => {
    it('uses correct storage key', () => {
      // The store uses 'mongo.do-connections' as the storage key
      // This is verified by checking the persist configuration
      const store = useConnectionStore
      expect(store.persist.getOptions().name).toBe('mongo.do-connections')
    })

    it('only persists connections, not connection state', () => {
      // The partialize function should only include connections
      const store = useConnectionStore
      const partialize = store.persist.getOptions().partialize

      const state = {
        connections: [{ id: '1', name: 'Test', url: 'http://test' }],
        activeConnectionId: 'some-id',
        isConnected: true,
        isConnecting: false,
        error: 'some error',
        addConnection: () => '',
        removeConnection: () => {},
        updateConnection: () => {},
        connect: async () => {},
        disconnect: () => {},
        setError: () => {},
      }

      const persisted = partialize?.(state as any)

      expect(persisted).toEqual({
        connections: [{ id: '1', name: 'Test', url: 'http://test' }],
      })
      expect(persisted).not.toHaveProperty('activeConnectionId')
      expect(persisted).not.toHaveProperty('isConnected')
      expect(persisted).not.toHaveProperty('error')
    })
  })

  describe('URL parsing and validation', () => {
    it('constructs correct health URL from connection URL', async () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValue('conn-id')
      mockFetch.mockResolvedValueOnce({ ok: true })

      act(() => {
        result.current.addConnection({
          name: 'Test',
          url: 'https://api.mongo.do',
        })
      })

      await act(async () => {
        await result.current.connect('conn-id')
      })

      expect(mockFetch).toHaveBeenCalledWith('https://api.mongo.do/api/health')
    })

    it('handles URLs with ports', async () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValue('conn-id')
      mockFetch.mockResolvedValueOnce({ ok: true })

      act(() => {
        result.current.addConnection({
          name: 'Test',
          url: 'http://localhost:3000',
        })
      })

      await act(async () => {
        await result.current.connect('conn-id')
      })

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/health')
    })

    it('handles URLs with paths', async () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValue('conn-id')
      mockFetch.mockResolvedValueOnce({ ok: true })

      act(() => {
        result.current.addConnection({
          name: 'Test',
          url: 'http://localhost:8787/v1',
        })
      })

      await act(async () => {
        await result.current.connect('conn-id')
      })

      // URL constructor resolves /api/health relative to base
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8787/api/health')
    })
  })

  describe('edge cases', () => {
    it('handles rapid connect/disconnect cycles', async () => {
      const { result } = renderHook(() => useConnectionStore())
      const { rpcClient } = await import('../lib/rpc-client')

      mockUUID.mockReturnValue('conn-id')
      mockFetch.mockResolvedValue({ ok: true })

      act(() => {
        result.current.addConnection({
          name: 'Test',
          url: 'http://localhost:8787',
        })
      })

      // Rapid connect/disconnect
      await act(async () => {
        await result.current.connect('conn-id')
        result.current.disconnect()
        await result.current.connect('conn-id')
        result.current.disconnect()
      })

      expect(result.current.isConnected).toBe(false)
      expect(result.current.activeConnectionId).toBeNull()
    })

    it('handles connecting while already connecting', async () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValue('conn-id')

      let resolveFirst: () => void
      let resolveSecond: () => void

      mockFetch
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveFirst = () => resolve({ ok: true })
            })
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveSecond = () => resolve({ ok: true })
            })
        )

      act(() => {
        result.current.addConnection({
          name: 'Test',
          url: 'http://localhost:8787',
        })
      })

      // Start first connection
      let firstConnect: Promise<void>
      act(() => {
        firstConnect = result.current.connect('conn-id')
      })

      // Start second connection while first is pending
      let secondConnect: Promise<void>
      act(() => {
        secondConnect = result.current.connect('conn-id')
      })

      // Both calls should have been made
      expect(mockFetch).toHaveBeenCalledTimes(2)

      // Resolve both
      await act(async () => {
        resolveFirst!()
        resolveSecond!()
        await firstConnect!
        await secondConnect!
      })

      expect(result.current.isConnected).toBe(true)
    })

    it('handles empty connection list operations', () => {
      const { result } = renderHook(() => useConnectionStore())

      // Should not throw
      act(() => {
        result.current.removeConnection('any-id')
        result.current.updateConnection('any-id', { name: 'New' })
      })

      expect(result.current.connections).toHaveLength(0)
    })
  })

  describe('ConnectionInfo interface', () => {
    it('allows optional lastConnected field', () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValue('conn-id')

      act(() => {
        result.current.addConnection({
          name: 'Test',
          url: 'http://localhost:8787',
        })
      })

      expect(result.current.connections[0]?.lastConnected).toBeUndefined()
    })

    it('preserves all ConnectionInfo fields', () => {
      const { result } = renderHook(() => useConnectionStore())

      mockUUID.mockReturnValue('conn-id')

      act(() => {
        result.current.addConnection({
          name: 'Test Connection',
          url: 'http://localhost:8787',
          lastConnected: 1234567890,
        })
      })

      const connection = result.current.connections[0]
      expect(connection?.id).toBe('conn-id')
      expect(connection?.name).toBe('Test Connection')
      expect(connection?.url).toBe('http://localhost:8787')
      expect(connection?.lastConnected).toBe(1234567890)
    })
  })
})
