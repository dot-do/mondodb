/**
 * ChangeStream - MongoDB-compatible change stream implementation
 *
 * Provides real-time notifications for data changes in a collection.
 * Supports filtering with $match pipeline stages and resume tokens for
 * reliable resumption after disconnections.
 *
 * @see https://www.mongodb.com/docs/manual/changeStreams/
 */

import { ObjectId } from '../types/objectid'

// ============================================================================
// Types
// ============================================================================

/**
 * Change event operation types
 */
export type OperationType = 'insert' | 'update' | 'replace' | 'delete' | 'drop' | 'invalidate'

/**
 * Namespace identifying the collection
 */
export interface ChangeStreamNamespace {
  db: string
  coll: string
}

/**
 * Document key identifying the changed document
 */
export interface DocumentKey {
  _id: ObjectId
}

/**
 * Description of fields updated/removed in an update operation
 */
export interface UpdateDescription {
  updatedFields: Record<string, unknown>
  removedFields: string[]
  truncatedArrays?: Array<{ field: string; newSize: number }>
}

/**
 * Resume token for resuming a change stream
 */
export interface ResumeToken {
  _data: string
}

/**
 * A change event emitted by the change stream
 */
export interface ChangeEvent<TDocument = Record<string, unknown>> {
  /** Resume token for this event */
  _id: ResumeToken
  /** Type of operation that triggered this event */
  operationType: OperationType
  /** Timestamp when the change occurred */
  clusterTime: Date
  /** Database and collection namespace */
  ns: ChangeStreamNamespace
  /** The _id of the affected document */
  documentKey: DocumentKey
  /** Full document (for insert, replace, or update with fullDocument option) */
  fullDocument?: TDocument
  /** Description of updated/removed fields (for update operations) */
  updateDescription?: UpdateDescription
}

/**
 * Options for creating a change stream
 */
export interface ChangeStreamOptions {
  /** How to handle fullDocument for update operations */
  fullDocument?: 'default' | 'updateLookup' | 'whenAvailable' | 'required'
  /** Resume after this token (exclusive) */
  resumeAfter?: ResumeToken
  /** Start after this token (exclusive) - similar to resumeAfter */
  startAfter?: ResumeToken
  /** Start at a specific operation time */
  startAtOperationTime?: Date
  /** Maximum time to wait for new events in ms */
  maxAwaitTimeMS?: number
  /** Batch size for fetching events */
  batchSize?: number
}

/**
 * Aggregation pipeline stage for filtering change events
 */
export interface MatchStage {
  $match: Record<string, unknown>
}

export type ChangeStreamPipeline = MatchStage[]

// ============================================================================
// ResumeToken Utility
// ============================================================================

/**
 * Parsed resume token data
 */
export interface ParsedResumeToken {
  database: string
  collection: string
  sequence: number
  timestamp: number
}

/**
 * Utility class for generating and parsing resume tokens
 */
export const ResumeToken = {
  /**
   * Generate a new resume token
   */
  generate(database: string, collection: string, sequence: number): ResumeToken {
    const timestamp = Date.now()
    const data = {
      db: database,
      coll: collection,
      seq: sequence,
      ts: timestamp,
    }
    // Encode as base64 for compact representation
    const encoded = btoa(JSON.stringify(data))
    // Pad with timestamp prefix for ordering
    const paddedTs = timestamp.toString(36).padStart(12, '0')
    const paddedSeq = sequence.toString(36).padStart(8, '0')
    return { _data: `${paddedTs}${paddedSeq}${encoded}` }
  },

  /**
   * Parse a resume token back to its components
   */
  parse(token: ResumeToken): ParsedResumeToken {
    try {
      // Extract the base64 portion (after timestamp and sequence prefixes)
      const encoded = token._data.slice(20) // 12 for ts + 8 for seq
      const decoded = atob(encoded)
      const data = JSON.parse(decoded)

      return {
        database: data.db,
        collection: data.coll,
        sequence: data.seq,
        timestamp: data.ts,
      }
    } catch (error) {
      throw new Error(`Invalid resume token: ${token._data}`)
    }
  },

  /**
   * Compare two tokens for ordering
   */
  compare(a: ResumeToken, b: ResumeToken): number {
    return a._data.localeCompare(b._data)
  },
}

// ============================================================================
// ChangeStream Class
// ============================================================================

/**
 * MongoDB-compatible change stream cursor
 *
 * Allows watching for changes on a collection in real-time.
 * Supports filtering, resume tokens, and async iteration.
 *
 * @example
 * ```typescript
 * const changeStream = collection.watch([
 *   { $match: { operationType: 'insert' } }
 * ])
 *
 * for await (const event of changeStream) {
 *   console.log('Change:', event.operationType, event.fullDocument)
 * }
 * ```
 */
export class ChangeStream<TDocument = Record<string, unknown>> {
  private readonly database: string
  private readonly collection: string
  private readonly pipeline: ChangeStreamPipeline
  private readonly options: ChangeStreamOptions
  private readonly getDocumentById: (id: ObjectId) => Promise<TDocument | null>
  private readonly getChangeEvents: (afterSequence: number) => Promise<StoredChangeEvent[]>
  private readonly onClose?: () => void

  private _closed: boolean = false
  private _resumeToken: ResumeToken | null = null
  private _currentSequence: number = 0
  private _pendingEvents: ChangeEvent<TDocument>[] = []

  constructor(
    database: string,
    collection: string,
    pipeline: ChangeStreamPipeline,
    options: ChangeStreamOptions,
    callbacks: {
      getDocumentById: (id: ObjectId) => Promise<TDocument | null>
      getChangeEvents: (afterSequence: number) => Promise<StoredChangeEvent[]>
      getCurrentSequence: () => number
      onClose?: () => void
    }
  ) {
    this.database = database
    this.collection = collection
    this.pipeline = pipeline || []
    this.options = options || {}
    this.getDocumentById = callbacks.getDocumentById
    this.getChangeEvents = callbacks.getChangeEvents
    // Start from the current sequence by default (real-time watching)
    // This follows MongoDB's behavior where change streams only see future events
    this._currentSequence = callbacks.getCurrentSequence()
    this.onClose = callbacks.onClose

    // Handle resume/start tokens - resume after the specified sequence
    // This allows resuming from a previous point in the event stream
    if (options.resumeAfter || options.startAfter) {
      const token = options.resumeAfter || options.startAfter
      try {
        const parsed = ResumeToken.parse(token!)
        this._currentSequence = parsed.sequence
      } catch {
        // Invalid token, start from current position
      }
    }
  }

  /**
   * Whether the change stream is closed
   */
  get closed(): boolean {
    return this._closed
  }

  /**
   * Get the current resume token (for the last received event)
   */
  getResumeToken(): ResumeToken | null {
    return this._resumeToken
  }

  /**
   * Get the next change event (blocking)
   * Returns null if the stream is closed
   */
  async next(): Promise<ChangeEvent<TDocument> | null> {
    if (this._closed) {
      return null
    }

    // Check for pending events first
    if (this._pendingEvents.length > 0) {
      const event = this._pendingEvents.shift()!
      this._resumeToken = event._id
      return event
    }

    // Poll for new events
    const maxWait = this.options.maxAwaitTimeMS || 30000
    const pollInterval = 50
    const startTime = Date.now()

    while (!this._closed && Date.now() - startTime < maxWait) {
      const events = await this.fetchNewEvents()

      if (events.length > 0) {
        // Store remaining events for subsequent calls
        this._pendingEvents = events.slice(1)
        const event = events[0]
        this._resumeToken = event._id
        return event
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    return null
  }

  /**
   * Try to get the next event without blocking
   * Returns null immediately if no events are available
   */
  async tryNext(): Promise<ChangeEvent<TDocument> | null> {
    if (this._closed) {
      return null
    }

    // Check pending events
    if (this._pendingEvents.length > 0) {
      const event = this._pendingEvents.shift()!
      this._resumeToken = event._id
      return event
    }

    // Fetch new events without waiting
    const events = await this.fetchNewEvents()

    if (events.length > 0) {
      this._pendingEvents = events.slice(1)
      const event = events[0]
      this._resumeToken = event._id
      return event
    }

    return null
  }

  /**
   * Check if there are more events available
   */
  async hasNext(): Promise<boolean> {
    if (this._closed) {
      return false
    }

    if (this._pendingEvents.length > 0) {
      return true
    }

    const events = await this.fetchNewEvents()
    if (events.length > 0) {
      this._pendingEvents = events
      return true
    }

    return false
  }

  /**
   * Close the change stream
   */
  async close(): Promise<void> {
    if (!this._closed) {
      this._closed = true
      this._pendingEvents = []
      if (this.onClose) {
        this.onClose()
      }
    }
  }

  /**
   * Get a stream interface for the change stream
   */
  stream(): AsyncIterable<ChangeEvent<TDocument>> {
    return this
  }

  /**
   * Async iterator implementation
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<ChangeEvent<TDocument>> {
    while (!this._closed) {
      const event = await this.tryNext()
      if (event) {
        yield event
      } else if (!this._closed) {
        // Small delay to prevent busy-waiting
        await new Promise(resolve => setTimeout(resolve, 10))
      }
    }
  }

  /**
   * Fetch new events from the change event store
   */
  private async fetchNewEvents(): Promise<ChangeEvent<TDocument>[]> {
    const stored = await this.getChangeEvents(this._currentSequence)

    const events: ChangeEvent<TDocument>[] = []

    for (const storedEvent of stored) {
      const event = await this.transformStoredEvent(storedEvent)

      // Apply pipeline filters
      if (this.matchesPipeline(event)) {
        events.push(event)
      }

      // Update current sequence
      this._currentSequence = storedEvent.sequence
    }

    return events
  }

  /**
   * Transform a stored event into a ChangeEvent
   */
  private async transformStoredEvent(stored: StoredChangeEvent): Promise<ChangeEvent<TDocument>> {
    const documentKey: DocumentKey = {
      _id: typeof stored.documentId === 'string'
        ? new ObjectId(stored.documentId)
        : stored.documentId,
    }

    const event: ChangeEvent<TDocument> = {
      _id: ResumeToken.generate(this.database, this.collection, stored.sequence),
      operationType: stored.operationType,
      clusterTime: new Date(stored.timestamp),
      ns: {
        db: this.database,
        coll: this.collection,
      },
      documentKey,
    }

    // Handle fullDocument based on operation type and options
    if (stored.operationType === 'insert' || stored.operationType === 'replace') {
      event.fullDocument = stored.fullDocument as TDocument
    } else if (stored.operationType === 'update') {
      // Include updateDescription for updates
      event.updateDescription = {
        updatedFields: stored.updatedFields || {},
        removedFields: stored.removedFields || [],
      }

      // Include fullDocument if updateLookup option is set
      if (this.options.fullDocument === 'updateLookup') {
        const doc = await this.getDocumentById(documentKey._id)
        if (doc) {
          event.fullDocument = doc
        }
      }
    }
    // delete operations don't include fullDocument

    return event
  }

  /**
   * Check if an event matches the pipeline filters
   */
  private matchesPipeline(event: ChangeEvent<TDocument>): boolean {
    for (const stage of this.pipeline) {
      if ('$match' in stage) {
        if (!this.matchesCondition(event, stage.$match)) {
          return false
        }
      }
    }
    return true
  }

  /**
   * Check if an event matches a $match condition
   */
  private matchesCondition(event: ChangeEvent<TDocument>, condition: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(condition)) {
      // Handle logical operators
      if (key === '$or') {
        const conditions = value as Record<string, unknown>[]
        if (!conditions.some(c => this.matchesCondition(event, c))) {
          return false
        }
        continue
      }

      if (key === '$and') {
        const conditions = value as Record<string, unknown>[]
        if (!conditions.every(c => this.matchesCondition(event, c))) {
          return false
        }
        continue
      }

      // Get the value from the event
      const eventValue = this.getNestedValue(event, key)

      // Handle comparison operators
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const operators = value as Record<string, unknown>
        for (const [op, opValue] of Object.entries(operators)) {
          if (!this.matchesOperator(eventValue, op, opValue)) {
            return false
          }
        }
        continue
      }

      // Direct comparison
      if (eventValue !== value) {
        return false
      }
    }

    return true
  }

  /**
   * Match a comparison operator
   */
  private matchesOperator(value: unknown, operator: string, operand: unknown): boolean {
    switch (operator) {
      case '$eq':
        return value === operand
      case '$ne':
        return value !== operand
      case '$gt':
        return typeof value === 'number' && value > (operand as number)
      case '$gte':
        return typeof value === 'number' && value >= (operand as number)
      case '$lt':
        return typeof value === 'number' && value < (operand as number)
      case '$lte':
        return typeof value === 'number' && value <= (operand as number)
      case '$in':
        return Array.isArray(operand) && operand.includes(value)
      case '$nin':
        return Array.isArray(operand) && !operand.includes(value)
      default:
        return true
    }
  }

  /**
   * Get a nested value from an object using dot notation
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.')
    let current: unknown = obj

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined
      }
      current = (current as Record<string, unknown>)[part]
    }

    return current
  }
}

// ============================================================================
// Stored Change Event Interface
// ============================================================================

/**
 * Internal structure for stored change events
 */
export interface StoredChangeEvent {
  sequence: number
  operationType: OperationType
  documentId: string | ObjectId
  timestamp: number
  fullDocument?: Record<string, unknown>
  updatedFields?: Record<string, unknown>
  removedFields?: string[]
}

// ============================================================================
// ChangeEventStore Class
// ============================================================================

/**
 * In-memory store for change events (for testing)
 * In production, this would be backed by SQLite
 */
export class ChangeEventStore {
  private events: StoredChangeEvent[] = []
  private sequence: number = 0

  /**
   * Record a new change event
   */
  addEvent(event: Omit<StoredChangeEvent, 'sequence' | 'timestamp'>): void {
    this.sequence++
    this.events.push({
      ...event,
      sequence: this.sequence,
      timestamp: Date.now(),
    })
  }

  /**
   * Get events after a given sequence number
   */
  getEventsAfter(sequence: number): StoredChangeEvent[] {
    return this.events.filter(e => e.sequence > sequence)
  }

  /**
   * Get the current sequence number
   */
  getCurrentSequence(): number {
    return this.sequence
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.events = []
    this.sequence = 0
  }
}

export default ChangeStream
