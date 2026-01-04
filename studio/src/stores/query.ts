import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface QueryHistoryEntry {
  id: string
  query: string
  database: string
  collection: string
  timestamp: number
  executionTime?: number
  resultCount?: number
  error?: string
  isFavorite: boolean
}

export interface QueryValidationError {
  message: string
  line?: number
  column?: number
}

interface QueryState {
  // Current query state
  currentQuery: string
  currentFilter: string
  currentProjection: string
  currentSort: string
  currentLimit: number

  // Validation
  validationErrors: QueryValidationError[]
  isValid: boolean

  // Execution state
  isExecuting: boolean
  lastExecutionTime: number | null
  lastResultCount: number | null
  lastError: string | null

  // History
  history: QueryHistoryEntry[]
  maxHistorySize: number

  // Actions
  setCurrentQuery: (query: string) => void
  setCurrentFilter: (filter: string) => void
  setCurrentProjection: (projection: string) => void
  setCurrentSort: (sort: string) => void
  setCurrentLimit: (limit: number) => void
  validateQuery: (query: string) => QueryValidationError[]
  setExecuting: (isExecuting: boolean) => void
  setExecutionResult: (result: { time: number; count: number } | null) => void
  setExecutionError: (error: string | null) => void
  addToHistory: (entry: Omit<QueryHistoryEntry, 'id' | 'timestamp' | 'isFavorite'>) => void
  removeFromHistory: (id: string) => void
  toggleFavorite: (id: string) => void
  clearHistory: () => void
  loadFromHistory: (id: string) => void
  clearValidationErrors: () => void
}

function generateId(): string {
  return crypto.randomUUID()
}

function parseJson(str: string): { value: unknown; error: QueryValidationError | null } {
  if (!str.trim()) {
    return { value: {}, error: null }
  }

  try {
    const value = JSON.parse(str)
    return { value, error: null }
  } catch (e) {
    const error = e as SyntaxError
    const match = error.message.match(/position (\d+)/)
    const position = match ? parseInt(match[1] ?? '0', 10) : 0

    // Calculate line and column from position
    let line = 1
    let column = 1
    for (let i = 0; i < position && i < str.length; i++) {
      if (str[i] === '\n') {
        line++
        column = 1
      } else {
        column++
      }
    }

    return {
      value: null,
      error: {
        message: error.message.replace(/^JSON\.parse: /, ''),
        line,
        column,
      },
    }
  }
}

function validateQueryObject(query: string): QueryValidationError[] {
  const errors: QueryValidationError[] = []

  if (!query.trim()) {
    return errors
  }

  const { error } = parseJson(query)
  if (error) {
    errors.push(error)
  }

  return errors
}

export const useQueryStore = create<QueryState>()(
  persist(
    (set, get) => ({
      // Current query state
      currentQuery: '{}',
      currentFilter: '{}',
      currentProjection: '',
      currentSort: '',
      currentLimit: 20,

      // Validation
      validationErrors: [],
      isValid: true,

      // Execution state
      isExecuting: false,
      lastExecutionTime: null,
      lastResultCount: null,
      lastError: null,

      // History
      history: [],
      maxHistorySize: 100,

      // Actions
      setCurrentQuery: (query: string) => {
        const errors = validateQueryObject(query)
        set({
          currentQuery: query,
          validationErrors: errors,
          isValid: errors.length === 0,
        })
      },

      setCurrentFilter: (filter: string) => {
        const errors = validateQueryObject(filter)
        set({
          currentFilter: filter,
          validationErrors: errors,
          isValid: errors.length === 0,
        })
      },

      setCurrentProjection: (projection: string) => {
        const errors = validateQueryObject(projection)
        set({
          currentProjection: projection,
          validationErrors: errors,
          isValid: errors.length === 0,
        })
      },

      setCurrentSort: (sort: string) => {
        const errors = validateQueryObject(sort)
        set({
          currentSort: sort,
          validationErrors: errors,
          isValid: errors.length === 0,
        })
      },

      setCurrentLimit: (limit: number) => {
        set({ currentLimit: Math.max(1, Math.min(1000, limit)) })
      },

      validateQuery: (query: string) => {
        return validateQueryObject(query)
      },

      setExecuting: (isExecuting: boolean) => {
        set({ isExecuting, lastError: null })
      },

      setExecutionResult: (result) => {
        if (result) {
          set({
            lastExecutionTime: result.time,
            lastResultCount: result.count,
            lastError: null,
          })
        } else {
          set({
            lastExecutionTime: null,
            lastResultCount: null,
          })
        }
      },

      setExecutionError: (error: string | null) => {
        set({ lastError: error, isExecuting: false })
      },

      addToHistory: (entry) => {
        const { history, maxHistorySize } = get()
        const newEntry: QueryHistoryEntry = {
          ...entry,
          id: generateId(),
          timestamp: Date.now(),
          isFavorite: false,
        }

        // Add to beginning of history, remove duplicates, limit size
        const filteredHistory = history.filter(
          (h) =>
            h.query !== entry.query ||
            h.database !== entry.database ||
            h.collection !== entry.collection
        )

        const newHistory = [newEntry, ...filteredHistory].slice(0, maxHistorySize)
        set({ history: newHistory })
      },

      removeFromHistory: (id: string) => {
        set((state) => ({
          history: state.history.filter((h) => h.id !== id),
        }))
      },

      toggleFavorite: (id: string) => {
        set((state) => ({
          history: state.history.map((h) =>
            h.id === id ? { ...h, isFavorite: !h.isFavorite } : h
          ),
        }))
      },

      clearHistory: () => {
        // Keep favorites when clearing
        set((state) => ({
          history: state.history.filter((h) => h.isFavorite),
        }))
      },

      loadFromHistory: (id: string) => {
        const entry = get().history.find((h) => h.id === id)
        if (entry) {
          set({
            currentQuery: entry.query,
            currentFilter: entry.query,
            validationErrors: [],
            isValid: true,
          })
        }
      },

      clearValidationErrors: () => {
        set({ validationErrors: [], isValid: true })
      },
    }),
    {
      name: 'mondodb-query-history',
      partialize: (state) => ({
        history: state.history,
        maxHistorySize: state.maxHistorySize,
      }),
    }
  )
)
