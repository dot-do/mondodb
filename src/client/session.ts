/**
 * ClientSession - MongoDB-compatible session for transaction support
 *
 * Provides transaction management APIs compatible with MongoDB driver:
 * - startTransaction(options)
 * - commitTransaction()
 * - abortTransaction()
 * - withTransaction(callback, options)
 *
 * Maps MongoDB transactions to SQLite BEGIN/COMMIT/ROLLBACK semantics.
 */

import { ObjectId } from '../types/objectid'

/**
 * Read concern levels supported by MongoDB
 */
export interface ReadConcern {
  level: 'local' | 'available' | 'majority' | 'linearizable' | 'snapshot'
}

/**
 * Write concern options supported by MongoDB
 */
export interface WriteConcern {
  w?: number | 'majority'
  wtimeoutMS?: number
  journal?: boolean
}

/**
 * Transaction options for startTransaction and withTransaction
 */
export interface TransactionOptions {
  readConcern?: ReadConcern
  writeConcern?: WriteConcern
  maxCommitTimeMS?: number
}

/**
 * Session options for startSession
 */
export interface ClientSessionOptions {
  defaultTransactionOptions?: TransactionOptions
  causalConsistency?: boolean
  snapshot?: boolean
}

/**
 * Transaction states
 */
export type TransactionState =
  | 'none'           // No transaction
  | 'starting'       // Transaction started but no operations yet
  | 'in_progress'    // Transaction has operations
  | 'committed'      // Transaction committed
  | 'aborted'        // Transaction aborted

/**
 * Session ID structure (MongoDB compatible)
 */
export class SessionId {
  readonly id: Buffer | Uint8Array
  private readonly _hexString: string

  constructor(id: Buffer | Uint8Array) {
    this.id = id
    // Pre-compute hex string for faster comparisons
    this._hexString = Array.from(id as Uint8Array)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  toString(): string {
    return this._hexString
  }

  toHexString(): string {
    return this._hexString
  }
}

/**
 * MongoDB-compatible error with error labels
 */
export interface MongoError extends Error {
  hasErrorLabel?: (label: string) => boolean
}

/**
 * Transaction callback function type
 */
export type TransactionCallback<T> = (session: ClientSession) => Promise<T>

/**
 * Forward reference to MongoClient (to avoid circular imports)
 */
export interface MongoClientLike {
  // Add methods as needed
}

/**
 * Represents a snapshot of collection data for transaction rollback
 */
export interface CollectionSnapshot {
  collectionKey: string
  documents: Map<string, Record<string, unknown>>
}

/**
 * Interface for collections that support transaction rollback
 */
export interface TransactableCollection {
  _getCollectionKey(): string
  _createSnapshot(): Map<string, Record<string, unknown>>
  _restoreFromSnapshot(snapshot: Map<string, Record<string, unknown>>): void
}

/**
 * ClientSession provides MongoDB-compatible session and transaction support
 *
 * Transactions are mapped to SQLite as follows:
 * - startTransaction() -> BEGIN TRANSACTION
 * - commitTransaction() -> COMMIT
 * - abortTransaction() -> ROLLBACK
 */
export class ClientSession {
  private readonly _client: MongoClientLike
  private readonly _id: SessionId
  private readonly _options: ClientSessionOptions
  private _transactionState: TransactionState = 'none'
  private _transactionOptions: TransactionOptions | null = null
  private _transactionNumber: number = 0
  private _hasEnded: boolean = false

  // Pending SQL operations for transaction batching
  private _pendingOperations: Array<{
    type: 'begin' | 'commit' | 'rollback'
    resolve: () => void
    reject: (error: Error) => void
  }> = []

  // Transaction snapshot tracking for rollback support
  private _collectionSnapshots: Map<string, CollectionSnapshot> = new Map()
  private _trackedCollections: Map<string, TransactableCollection> = new Map()

  constructor(client: MongoClientLike, options?: ClientSessionOptions) {
    this._client = client
    this._options = options || {}
    this._id = this._generateSessionId()
  }

  /**
   * Generate a unique session ID
   */
  private _generateSessionId(): SessionId {
    const objectId = new ObjectId()
    // Convert hex string to bytes
    const hex = objectId.toHexString()
    const bytes = new Uint8Array(12)
    for (let i = 0; i < 12; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
    }
    return new SessionId(bytes)
  }

  /**
   * Get the session ID
   */
  get id(): SessionId {
    return this._id
  }

  /**
   * Get the client that created this session
   */
  get client(): MongoClientLike {
    return this._client
  }

  /**
   * Check if the session is currently in a transaction
   */
  get inTransaction(): boolean {
    return (
      this._transactionState === 'starting' ||
      this._transactionState === 'in_progress'
    )
  }

  /**
   * Get the current transaction state
   */
  get transactionState(): TransactionState {
    return this._transactionState
  }

  /**
   * Get the current transaction options
   */
  get transactionOptions(): TransactionOptions | null {
    return this._transactionOptions
  }

  /**
   * Get the current transaction number
   */
  get transactionNumber(): number {
    return this._transactionNumber
  }

  /**
   * Check if the session has ended
   */
  get hasEnded(): boolean {
    return this._hasEnded
  }

  /**
   * Start a new transaction
   *
   * Maps to SQLite: BEGIN TRANSACTION
   *
   * @param options - Transaction options (readConcern, writeConcern, maxCommitTimeMS)
   * @throws Error if a transaction is already in progress
   */
  startTransaction(options?: TransactionOptions): void {
    if (this._hasEnded) {
      throw new Error('Cannot start transaction on ended session')
    }

    if (this.inTransaction) {
      throw new Error('Transaction already in progress')
    }

    // Increment transaction number
    this._transactionNumber++

    // Merge with default options
    this._transactionOptions = {
      ...this._options.defaultTransactionOptions,
      ...options,
    }

    // Clear any previous snapshots
    this._collectionSnapshots.clear()
    this._trackedCollections.clear()

    this._transactionState = 'starting'
  }

  /**
   * Commit the current transaction
   *
   * Maps to SQLite: COMMIT
   *
   * @throws Error if no transaction is in progress
   */
  async commitTransaction(): Promise<void> {
    if (this._hasEnded) {
      throw new Error('Cannot commit transaction on ended session')
    }

    if (!this.inTransaction) {
      throw new Error('No transaction started')
    }

    // In SQLite, COMMIT would be executed here
    // For the in-memory client, we just update state
    // Clear snapshots - changes are now permanent
    this._collectionSnapshots.clear()
    this._trackedCollections.clear()

    this._transactionState = 'committed'
    this._transactionOptions = null
  }

  /**
   * Abort the current transaction
   *
   * Maps to SQLite: ROLLBACK
   *
   * @throws Error if no transaction is in progress
   */
  async abortTransaction(): Promise<void> {
    if (this._hasEnded) {
      throw new Error('Cannot abort transaction on ended session')
    }

    if (!this.inTransaction) {
      throw new Error('No transaction started')
    }

    // In SQLite, ROLLBACK would be executed here
    // For the in-memory client, restore from snapshots
    for (const [collectionKey, snapshot] of this._collectionSnapshots) {
      const collection = this._trackedCollections.get(collectionKey)
      if (collection) {
        collection._restoreFromSnapshot(snapshot.documents)
      }
    }

    // Clear snapshots after rollback
    this._collectionSnapshots.clear()
    this._trackedCollections.clear()

    this._transactionState = 'aborted'
    this._transactionOptions = null
  }

  /**
   * Execute a callback within a transaction with automatic commit/abort
   *
   * This method:
   * 1. Starts a transaction
   * 2. Executes the callback
   * 3. Commits on success, aborts on error
   * 4. Retries on transient transaction errors
   *
   * @param callback - Function to execute within the transaction
   * @param options - Transaction options
   * @returns The result of the callback
   */
  async withTransaction<T>(
    callback: TransactionCallback<T>,
    options?: TransactionOptions
  ): Promise<T> {
    const MAX_RETRIES = 120 // MongoDB default: 120 seconds worth of retries
    const RETRY_DELAY_MS = 100
    let attempts = 0

    while (true) {
      attempts++

      try {
        // Start transaction
        this.startTransaction(options)

        // Execute callback
        const result = await callback(this)

        // Commit transaction
        await this.commitTransaction()

        return result
      } catch (error) {
        // Check if we should retry
        const mongoError = error as MongoError
        const isTransientError =
          mongoError.hasErrorLabel?.('TransientTransactionError') ?? false

        if (isTransientError && attempts < MAX_RETRIES) {
          // Abort and retry
          try {
            if (this.inTransaction) {
              await this.abortTransaction()
            }
          } catch {
            // Ignore abort errors during retry
          }

          // Reset state for retry
          this._transactionState = 'none'
          this._transactionOptions = null

          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
          continue
        }

        // Abort transaction on non-retryable error
        try {
          if (this.inTransaction) {
            await this.abortTransaction()
          }
        } catch {
          // Ignore abort errors
        }

        throw error
      }
    }
  }

  /**
   * End the session
   *
   * If a transaction is in progress, it will be aborted.
   */
  async endSession(): Promise<void> {
    if (this._hasEnded) {
      return
    }

    // Abort any active transaction
    if (this.inTransaction) {
      try {
        await this.abortTransaction()
      } catch {
        // Ignore abort errors during session end
      }
    }

    this._hasEnded = true
  }

  /**
   * Mark the transaction as in progress (called on first operation)
   * @internal
   */
  _markInProgress(): void {
    if (this._transactionState === 'starting') {
      this._transactionState = 'in_progress'
    }
  }

  /**
   * Track a collection for transaction rollback support
   * Creates a snapshot of the collection's data on first write operation
   * @internal
   */
  _trackCollection(collection: TransactableCollection): void {
    if (!this.inTransaction) {
      return
    }

    const collectionKey = collection._getCollectionKey()

    // Only snapshot once per collection per transaction
    if (!this._collectionSnapshots.has(collectionKey)) {
      this._collectionSnapshots.set(collectionKey, {
        collectionKey,
        documents: collection._createSnapshot(),
      })
      this._trackedCollections.set(collectionKey, collection)
    }
  }

  /**
   * Get the SQL command for starting a transaction
   * @internal
   */
  _getBeginCommand(): string {
    // SQLite transaction modes based on read/write concern
    // IMMEDIATE acquires a write lock immediately
    // DEFERRED is the default and delays lock acquisition
    return 'BEGIN IMMEDIATE TRANSACTION'
  }

  /**
   * Get the SQL command for committing a transaction
   * @internal
   */
  _getCommitCommand(): string {
    return 'COMMIT'
  }

  /**
   * Get the SQL command for rolling back a transaction
   * @internal
   */
  _getRollbackCommand(): string {
    return 'ROLLBACK'
  }
}

export default ClientSession
