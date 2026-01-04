/**
 * Tool Call Audit Log - Append-only immutable audit trail for AI agent tool calls
 *
 * This module provides an append-only audit log for recording tool calls made by AI agents.
 * Entries are immutable and cannot be updated or deleted, ensuring a complete and
 * tamper-evident audit trail.
 */

/**
 * Error thrown when attempting to modify an immutable audit log entry
 */
export class ImmutableEntryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImmutableEntryError'
    Object.setPrototypeOf(this, ImmutableEntryError.prototype)
  }
}

/**
 * Time range for filtering entries
 */
export interface TimeRange {
  start: Date
  end: Date
}

/**
 * Query options for listing audit log entries
 */
export interface AuditQueryOptions {
  limit?: number
  offset?: number
  tool?: string
  timeRange?: TimeRange
}

/**
 * A single tool call entry in the audit log
 */
export interface ToolCallEntry {
  /** Unique identifier for this entry */
  id: string
  /** Name of the tool that was called */
  tool: string
  /** Input parameters passed to the tool */
  inputs: Record<string, unknown>
  /** Output/result from the tool */
  outputs: Record<string, unknown>
  /** When the tool call was recorded */
  timestamp: Date
  /** Optional duration in milliseconds */
  durationMs?: number
  /** Optional metadata (session ID, request ID, etc.) */
  metadata?: Record<string, unknown>
}

/**
 * Options for recording a new entry
 */
export interface RecordOptions {
  startTime?: Date
  endTime?: Date
  metadata?: Record<string, unknown>
}

/**
 * Backend interface for storing audit log entries
 */
export interface AuditBackend {
  append(entry: Omit<ToolCallEntry, 'id' | 'timestamp'>): Promise<string>
  findById(id: string): Promise<ToolCallEntry | null>
  list(options?: AuditQueryOptions): Promise<ToolCallEntry[]>
  findByTool(toolName: string): Promise<ToolCallEntry[]>
  findByTimeRange(start: Date, end: Date): Promise<ToolCallEntry[]>
  count(): Promise<number>
  update(id: string, updates: Partial<ToolCallEntry>): Promise<void>
  delete(id: string): Promise<void>
}

/**
 * Deep clone an object to prevent mutation
 */
function deepClone<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj
  }
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T
  }
  if (typeof obj !== 'object') {
    return obj
  }
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as unknown as T
  }
  const cloned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    cloned[key] = deepClone(value)
  }
  return cloned as T
}

/**
 * Tool Call Audit Log - Append-only immutable audit trail
 */
export class ToolCallAuditLog {
  constructor(private backend: AuditBackend) {}

  /**
   * Record a new tool call entry
   * @returns The ID of the newly created entry
   */
  async record(
    tool: string,
    inputs: Record<string, unknown>,
    outputs: Record<string, unknown>,
    options?: RecordOptions
  ): Promise<string> {
    const entry: Omit<ToolCallEntry, 'id' | 'timestamp'> = {
      tool,
      inputs: deepClone(inputs),
      outputs: deepClone(outputs),
    }

    // Calculate duration if start/end times provided
    if (options?.startTime && options?.endTime) {
      entry.durationMs = options.endTime.getTime() - options.startTime.getTime()
    }

    // Add metadata if provided
    if (options?.metadata) {
      entry.metadata = deepClone(options.metadata)
    }

    return this.backend.append(entry)
  }

  /**
   * Find an entry by its ID
   * @returns A deep clone of the entry, or null if not found
   */
  async findById(id: string): Promise<ToolCallEntry | null> {
    const entry = await this.backend.findById(id)
    return entry ? deepClone(entry) : null
  }

  /**
   * List entries with optional pagination
   * @returns Deep clones of the entries
   */
  async list(options?: AuditQueryOptions): Promise<ToolCallEntry[]> {
    const entries = await this.backend.list(options)
    return entries.map(e => deepClone(e))
  }

  /**
   * Find all entries for a specific tool
   * @returns Deep clones of the entries
   */
  async findByTool(toolName: string): Promise<ToolCallEntry[]> {
    const entries = await this.backend.findByTool(toolName)
    return entries.map(e => deepClone(e))
  }

  /**
   * Find entries within a time range
   * @returns Deep clones of the entries
   */
  async findByTimeRange(start: Date, end: Date): Promise<ToolCallEntry[]> {
    const entries = await this.backend.findByTimeRange(start, end)
    return entries.map(e => deepClone(e))
  }

  /**
   * Get the total count of entries
   */
  async count(): Promise<number> {
    return this.backend.count()
  }

  /**
   * Update is NOT allowed - audit logs are immutable
   * @throws ImmutableEntryError always
   */
  async update(_id: string, _updates: Partial<ToolCallEntry>): Promise<void> {
    throw new ImmutableEntryError('Cannot update audit log entries')
  }

  /**
   * Delete is NOT allowed - audit logs are immutable
   * @throws ImmutableEntryError always
   */
  async delete(_id: string): Promise<void> {
    throw new ImmutableEntryError('Cannot delete audit log entries')
  }

  /**
   * Delete many is NOT allowed - audit logs are immutable
   * @throws ImmutableEntryError always
   */
  async deleteMany(_filter: Record<string, unknown>): Promise<void> {
    throw new ImmutableEntryError('Cannot delete audit log entries')
  }

  /**
   * Clear is NOT allowed - audit logs are immutable
   * @throws ImmutableEntryError always
   */
  async clear(): Promise<void> {
    throw new ImmutableEntryError('Cannot delete audit log entries')
  }
}

/**
 * Create an in-memory audit backend for testing
 */
export function createInMemoryAuditBackend(): AuditBackend {
  const entries = new Map<string, ToolCallEntry>()
  let sequence = 0

  return {
    append: async (entry: Omit<ToolCallEntry, 'id' | 'timestamp'>) => {
      sequence++
      const id = `tc_${sequence}_${Date.now()}`
      const timestamp = new Date()
      const fullEntry: ToolCallEntry = { ...entry, id, timestamp }
      entries.set(id, fullEntry)
      return id
    },

    findById: async (id: string) => {
      return entries.get(id) || null
    },

    list: async (options?: AuditQueryOptions) => {
      let results = Array.from(entries.values())

      // Sort by timestamp (oldest first by default)
      results.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

      // Apply pagination
      const offset = options?.offset ?? 0
      const limit = options?.limit ?? results.length
      return results.slice(offset, offset + limit)
    },

    findByTool: async (toolName: string) => {
      return Array.from(entries.values()).filter(e => e.tool === toolName)
    },

    findByTimeRange: async (start: Date, end: Date) => {
      return Array.from(entries.values()).filter(
        e => e.timestamp >= start && e.timestamp <= end
      )
    },

    count: async () => entries.size,

    // These should throw - audit logs are immutable
    update: async () => {
      throw new ImmutableEntryError('Cannot update audit log entries')
    },

    delete: async () => {
      throw new ImmutableEntryError('Cannot delete audit log entries')
    },
  }
}
