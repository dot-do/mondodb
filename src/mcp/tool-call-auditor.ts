/**
 * Tool Call Auditor
 *
 * Provides auditing functionality to track and log tool invocations
 * for security and debugging purposes.
 */

import { randomUUID } from 'crypto'

/**
 * Types of audit events that can be logged
 */
export type AuditEventType = 'invoke' | 'success' | 'error' | 'timeout'

/**
 * Severity levels for audit log entries
 */
export type AuditLogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * Error information captured in audit entries
 */
export interface AuditError {
  message: string
  code?: string
  stack?: string
}

/**
 * Represents a single audit log entry for a tool call
 */
export interface ToolCallAuditEntry {
  /** Unique identifier for this audit entry */
  id: string
  /** Identifier of the tool call being audited */
  callId: string
  /** Name of the tool being called */
  tool: string
  /** Type of audit event */
  eventType: AuditEventType
  /** When this event occurred */
  timestamp: Date
  /** Severity level of this entry */
  level: AuditLogLevel
  /** Tool input parameters (optional) */
  inputs?: Record<string, unknown>
  /** Tool output results (optional) */
  outputs?: Record<string, unknown>
  /** Duration of the call in milliseconds (optional) */
  durationMs?: number
  /** Error information if eventType is 'error' (optional) */
  error?: AuditError
  /** Additional metadata for context (optional) */
  metadata?: Record<string, unknown>
}

/**
 * Filter criteria for querying audit entries
 */
export interface AuditFilter {
  /** Filter by tool name */
  tool?: string
  /** Filter by event type */
  eventType?: AuditEventType
  /** Filter by log level */
  level?: AuditLogLevel
  /** Filter by specific call ID */
  callId?: string
  /** Start of time range */
  from?: Date
  /** End of time range */
  to?: Date
  /** Maximum number of entries to return */
  limit?: number
  /** Number of entries to skip */
  offset?: number
}

/**
 * Summary statistics for audit entries
 */
export interface AuditSummary {
  /** Total number of tool invocations */
  totalCalls: number
  /** Number of successful completions */
  successCount: number
  /** Number of errors */
  errorCount: number
  /** Number of timeouts */
  timeoutCount: number
}

/**
 * Options for clearing audit entries
 */
export interface ClearOptions {
  /** Clear entries older than this date */
  before?: Date
}

/**
 * Storage interface for audit entries
 */
export interface AuditStorage {
  /** Store a single audit entry */
  store(entry: ToolCallAuditEntry): Promise<void>
  /** Query audit entries by filter */
  query(filter: AuditFilter): Promise<ToolCallAuditEntry[]>
  /** Count audit entries matching filter */
  count(filter: AuditFilter): Promise<number>
  /** Clear audit entries */
  clear(options?: ClearOptions): Promise<void>
}

/**
 * Configuration options for the ToolCallAuditor
 */
export interface ToolCallAuditorOptions {
  /** Storage backend for audit entries */
  storage: AuditStorage
  /** Minimum log level to record (entries below this level are discarded) */
  minLevel?: AuditLogLevel
  /** Whether to redact input parameters */
  redactInputs?: boolean
  /** Whether to redact output results */
  redactOutputs?: boolean
  /** Custom ID generator function */
  generateId?: () => string
  /** Whether auditing is enabled */
  enabled?: boolean
}

// Log level ordering for comparison
const LOG_LEVEL_ORDER: Record<AuditLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

/**
 * Generates a unique ID for audit entries
 */
function defaultGenerateId(): string {
  return `audit_${randomUUID()}`
}

/**
 * Tool Call Auditor
 *
 * Tracks and logs tool invocations for security and debugging purposes.
 * Provides methods for logging different event types, querying audit history,
 * and generating summary statistics.
 */
export class ToolCallAuditor {
  private storage: AuditStorage
  private minLevel: AuditLogLevel
  private redactInputs: boolean
  private redactOutputs: boolean
  private generateId: () => string
  private enabled: boolean

  constructor(options: ToolCallAuditorOptions) {
    this.storage = options.storage
    this.minLevel = options.minLevel ?? 'debug'
    this.redactInputs = options.redactInputs ?? false
    this.redactOutputs = options.redactOutputs ?? false
    this.generateId = options.generateId ?? defaultGenerateId
    this.enabled = options.enabled ?? true
  }

  /**
   * Check if a log level should be recorded based on minLevel threshold
   */
  private shouldLog(level: AuditLogLevel): boolean {
    if (!this.enabled) return false
    return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[this.minLevel]
  }

  /**
   * Create an audit entry with common fields
   */
  private createEntry(
    callId: string,
    tool: string,
    eventType: AuditEventType,
    level: AuditLogLevel
  ): ToolCallAuditEntry {
    return {
      id: this.generateId(),
      callId,
      tool,
      eventType,
      timestamp: new Date(),
      level,
    }
  }

  /**
   * Log a tool invocation event
   */
  async logInvoke(
    callId: string,
    tool: string,
    inputs: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.shouldLog('info')) return

    const entry = this.createEntry(callId, tool, 'invoke', 'info')
    entry.inputs = this.redactInputs ? ('[REDACTED]' as any) : inputs
    if (metadata) {
      entry.metadata = metadata
    }

    await this.storage.store(entry)
  }

  /**
   * Log a successful tool completion event
   */
  async logSuccess(
    callId: string,
    tool: string,
    outputs: Record<string, unknown>,
    durationMs: number,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.shouldLog('info')) return

    const entry = this.createEntry(callId, tool, 'success', 'info')
    entry.outputs = this.redactOutputs ? ('[REDACTED]' as any) : outputs
    entry.durationMs = durationMs
    if (metadata) {
      entry.metadata = metadata
    }

    await this.storage.store(entry)
  }

  /**
   * Log a tool error event
   */
  async logError(
    callId: string,
    tool: string,
    error: Error,
    durationMs: number,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.shouldLog('error')) return

    const entry = this.createEntry(callId, tool, 'error', 'error')
    const auditError: AuditError = {
      message: error.message,
    }
    if ((error as any).code) {
      auditError.code = (error as any).code
    }
    if (error.stack) {
      auditError.stack = error.stack
    }
    entry.error = auditError
    entry.durationMs = durationMs
    if (metadata) {
      entry.metadata = metadata
    }

    await this.storage.store(entry)
  }

  /**
   * Log a tool timeout event
   */
  async logTimeout(
    callId: string,
    tool: string,
    durationMs: number,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.shouldLog('warn')) return

    const entry = this.createEntry(callId, tool, 'timeout', 'warn')
    entry.durationMs = durationMs
    if (metadata) {
      entry.metadata = metadata
    }

    await this.storage.store(entry)
  }

  /**
   * Query audit entries based on filter criteria
   */
  async query(filter: AuditFilter): Promise<ToolCallAuditEntry[]> {
    return this.storage.query(filter)
  }

  /**
   * Get all audit entries for a specific tool call
   */
  async getCallAuditTrail(callId: string): Promise<ToolCallAuditEntry[]> {
    return this.storage.query({ callId })
  }

  /**
   * Get summary statistics for audit entries
   */
  async getSummary(filter?: { from?: Date; to?: Date }): Promise<AuditSummary> {
    const buildFilter = (eventType: AuditEventType): AuditFilter => {
      const f: AuditFilter = { eventType }
      if (filter?.from) {
        f.from = filter.from
      }
      if (filter?.to) {
        f.to = filter.to
      }
      return f
    }

    const [totalCalls, successCount, errorCount, timeoutCount] = await Promise.all([
      this.storage.count(buildFilter('invoke')),
      this.storage.count(buildFilter('success')),
      this.storage.count(buildFilter('error')),
      this.storage.count(buildFilter('timeout')),
    ])

    return {
      totalCalls,
      successCount,
      errorCount,
      timeoutCount,
    }
  }

  /**
   * Clear audit entries
   */
  async clear(options?: ClearOptions): Promise<void> {
    await this.storage.clear(options)
  }

  /**
   * Wrap a tool function with automatic auditing
   *
   * @param toolName - Name of the tool being wrapped
   * @param toolFn - The tool function to wrap
   * @returns A wrapped function that automatically logs invoke/success/error events
   */
  wrapTool<TInput extends Record<string, unknown>, TOutput>(
    toolName: string,
    toolFn: (input: TInput) => Promise<TOutput>
  ): (input: TInput) => Promise<TOutput> {
    return async (input: TInput): Promise<TOutput> => {
      const callId = this.generateId()
      const startTime = Date.now()

      await this.logInvoke(callId, toolName, input)

      try {
        const result = await toolFn(input)
        const durationMs = Date.now() - startTime
        await this.logSuccess(callId, toolName, result as Record<string, unknown>, durationMs)
        return result
      } catch (error) {
        const durationMs = Date.now() - startTime
        await this.logError(callId, toolName, error as Error, durationMs)
        throw error
      }
    }
  }
}
