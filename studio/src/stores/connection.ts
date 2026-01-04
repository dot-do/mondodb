import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ConnectionInfo {
  id: string
  name: string
  url: string
  lastConnected?: number
}

interface ConnectionState {
  connections: ConnectionInfo[]
  activeConnectionId: string | null
  isConnected: boolean
  isConnecting: boolean
  error: string | null

  // Actions
  addConnection: (connection: Omit<ConnectionInfo, 'id'>) => string
  removeConnection: (id: string) => void
  updateConnection: (id: string, updates: Partial<ConnectionInfo>) => void
  connect: (id: string) => Promise<void>
  disconnect: () => void
  setError: (error: string | null) => void
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => ({
      connections: [],
      activeConnectionId: null,
      isConnected: false,
      isConnecting: false,
      error: null,

      addConnection: (connection) => {
        const id = crypto.randomUUID()
        set((state) => ({
          connections: [...state.connections, { ...connection, id }],
        }))
        return id
      },

      removeConnection: (id) => {
        set((state) => ({
          connections: state.connections.filter((c) => c.id !== id),
          activeConnectionId:
            state.activeConnectionId === id ? null : state.activeConnectionId,
        }))
      },

      updateConnection: (id, updates) => {
        set((state) => ({
          connections: state.connections.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        }))
      },

      connect: async (id) => {
        const connection = get().connections.find((c) => c.id === id)
        if (!connection) {
          set({ error: 'Connection not found' })
          return
        }

        set({ isConnecting: true, error: null })

        try {
          // Test connection by fetching health endpoint
          const response = await fetch('/api/health')
          if (!response.ok) {
            throw new Error('Failed to connect to mondodb')
          }

          set({
            activeConnectionId: id,
            isConnected: true,
            isConnecting: false,
          })

          // Update last connected timestamp
          get().updateConnection(id, { lastConnected: Date.now() })
        } catch (error) {
          set({
            isConnecting: false,
            error: error instanceof Error ? error.message : 'Connection failed',
          })
        }
      },

      disconnect: () => {
        set({
          activeConnectionId: null,
          isConnected: false,
          error: null,
        })
      },

      setError: (error) => {
        set({ error })
      },
    }),
    {
      name: 'mondodb-connections',
      partialize: (state) => ({
        connections: state.connections,
      }),
    }
  )
)
