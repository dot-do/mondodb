/**
 * ObjectId - MongoDB-compatible 12-byte unique identifier
 *
 * Structure (12 bytes = 24 hex characters):
 * - 4 bytes: Unix timestamp (seconds since epoch)
 * - 5 bytes: Random value (generated once per process)
 * - 3 bytes: Incrementing counter (initialized to random value)
 *
 * Compatible with MongoDB BSON ObjectId specification.
 */

// Pre-computed hex lookup table for fast byte-to-hex conversion
const HEX_LOOKUP: string[] = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, '0')
)

// Pre-computed hex char to nibble map for fast hex-to-byte conversion
const HEX_CHAR_TO_NIBBLE: Record<string, number> = {}
for (let i = 0; i < 16; i++) {
  const hex = i.toString(16)
  HEX_CHAR_TO_NIBBLE[hex] = i
  HEX_CHAR_TO_NIBBLE[hex.toUpperCase()] = i
}

// Regex pattern for validation (compiled once)
const OBJECTID_PATTERN = /^[0-9a-fA-F]{24}$/

/**
 * Process-level state for ObjectId generation
 */
class ObjectIdState {
  private randomBytes: Uint8Array | null = null
  private counter: number

  constructor() {
    // Initialize counter to random value
    this.counter = Math.floor(Math.random() * 0xffffff)
  }

  getRandomBytes(): Uint8Array {
    if (!this.randomBytes) {
      this.randomBytes = new Uint8Array(5)
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(this.randomBytes)
      } else {
        // Fallback for environments without Web Crypto API
        for (let i = 0; i < 5; i++) {
          this.randomBytes[i] = Math.floor(Math.random() * 256)
        }
      }
    }
    return this.randomBytes
  }

  getNextCounter(): number {
    const value = this.counter
    this.counter = (this.counter + 1) & 0xffffff // Wrap at 24 bits
    return value
  }
}

// Singleton state instance
const state = new ObjectIdState()

/**
 * Fast bytes to hex conversion using lookup table
 */
function bytesToHex(bytes: Uint8Array): string {
  let result = ''
  for (let i = 0; i < bytes.length; i++) {
    result += HEX_LOOKUP[bytes[i]]
  }
  return result
}

/**
 * Fast hex to bytes conversion using nibble map
 */
function hexToBytes(hex: string): Uint8Array {
  const len = hex.length >> 1
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    const hi = HEX_CHAR_TO_NIBBLE[hex[i * 2]]
    const lo = HEX_CHAR_TO_NIBBLE[hex[i * 2 + 1]]
    bytes[i] = (hi << 4) | lo
  }
  return bytes
}

/**
 * Write a 32-bit integer as 4 big-endian bytes
 */
function writeUInt32BE(buffer: Uint8Array, value: number, offset: number): void {
  buffer[offset] = (value >>> 24) & 0xff
  buffer[offset + 1] = (value >>> 16) & 0xff
  buffer[offset + 2] = (value >>> 8) & 0xff
  buffer[offset + 3] = value & 0xff
}

/**
 * Read 4 big-endian bytes as a 32-bit unsigned integer
 */
function readUInt32BE(buffer: Uint8Array, offset: number): number {
  return (
    ((buffer[offset] << 24) |
      (buffer[offset + 1] << 16) |
      (buffer[offset + 2] << 8) |
      buffer[offset + 3]) >>>
    0
  )
}

/**
 * Type guard for ObjectId-like values
 */
export type ObjectIdLike = ObjectId | string | Uint8Array

/**
 * Input types accepted by ObjectId constructor
 */
export type ObjectIdInput = ObjectIdLike | null | undefined

/**
 * ObjectId class - MongoDB-compatible unique identifier
 *
 * @example
 * ```typescript
 * // Generate new ObjectId
 * const id = new ObjectId()
 *
 * // Create from hex string
 * const id2 = ObjectId.createFromHexString('507f1f77bcf86cd799439011')
 *
 * // Get timestamp
 * const timestamp = id.getTimestamp()
 *
 * // Compare ObjectIds
 * id.equals(id2) // false
 * ```
 */
export class ObjectId {
  /** BSON type identifier for serialization compatibility */
  readonly _bsontype = 'ObjectId' as const

  /** The raw 12-byte buffer containing the ObjectId data */
  readonly id: Uint8Array

  /** Cached hex string representation (computed lazily) */
  private _hexString: string | null = null

  /**
   * Create a new ObjectId
   *
   * @param input - Optional: hex string, Uint8Array, or another ObjectId.
   *                If omitted, generates a new unique ObjectId.
   * @throws {TypeError} If input is invalid
   */
  constructor(input?: ObjectIdInput) {
    if (input === undefined || input === null) {
      this.id = this.generate()
    } else if (typeof input === 'string') {
      if (!ObjectId.isValidHex(input)) {
        throw new TypeError(
          `Invalid ObjectId hex string: "${input}". Must be 24 hex characters.`
        )
      }
      this.id = hexToBytes(input.toLowerCase())
      this._hexString = input.toLowerCase()
    } else if (input instanceof Uint8Array) {
      if (input.length !== 12) {
        throw new TypeError(
          `ObjectId buffer must be exactly 12 bytes, received ${input.length}`
        )
      }
      this.id = new Uint8Array(input)
    } else if (input instanceof ObjectId) {
      this.id = new Uint8Array(input.id)
      this._hexString = input._hexString
    } else {
      throw new TypeError(
        `Invalid ObjectId input type. Expected string, Uint8Array, or ObjectId.`
      )
    }
  }

  /**
   * Generate a new 12-byte ObjectId buffer
   * Structure: 4-byte timestamp | 5-byte random | 3-byte counter
   */
  private generate(): Uint8Array {
    const buffer = new Uint8Array(12)

    // 4 bytes: Unix timestamp in seconds (big-endian)
    const timestamp = Math.floor(Date.now() / 1000)
    writeUInt32BE(buffer, timestamp, 0)

    // 5 bytes: Random value (cached per process)
    const randomBytes = state.getRandomBytes()
    buffer.set(randomBytes, 4)

    // 3 bytes: Incrementing counter (big-endian, 24-bit)
    const counterValue = state.getNextCounter()
    buffer[9] = (counterValue >>> 16) & 0xff
    buffer[10] = (counterValue >>> 8) & 0xff
    buffer[11] = counterValue & 0xff

    return buffer
  }

  /**
   * Get the timestamp component of this ObjectId as a Date
   *
   * @returns Date object representing when this ObjectId was generated
   */
  getTimestamp(): Date {
    const seconds = readUInt32BE(this.id, 0)
    return new Date(seconds * 1000)
  }

  /**
   * Get the generation time as Unix timestamp (seconds)
   */
  getGenerationTime(): number {
    return readUInt32BE(this.id, 0)
  }

  /**
   * Return the ObjectId as a 24-character lowercase hex string
   */
  toHexString(): string {
    if (!this._hexString) {
      this._hexString = bytesToHex(this.id)
    }
    return this._hexString
  }

  /**
   * String representation of the ObjectId (same as toHexString)
   */
  toString(): string {
    return this.toHexString()
  }

  /**
   * JSON serialization - returns hex string
   * This allows ObjectIds to serialize naturally in JSON.stringify()
   */
  toJSON(): string {
    return this.toHexString()
  }

  /**
   * Compare this ObjectId to another value for equality
   *
   * @param other - ObjectId, hex string, or null/undefined to compare
   * @returns true if the ObjectIds are equal, false otherwise
   */
  equals(other: ObjectId | string | null | undefined): boolean {
    if (other === null || other === undefined) {
      return false
    }

    if (other instanceof ObjectId) {
      // Fast path: compare bytes directly if hex strings are cached
      if (this._hexString && other._hexString) {
        return this._hexString === other._hexString
      }
      // Compare bytes
      for (let i = 0; i < 12; i++) {
        if (this.id[i] !== other.id[i]) {
          return false
        }
      }
      return true
    }

    // Compare with string
    return this.toHexString() === other.toLowerCase()
  }

  /**
   * Primitive value conversion (returns hex string)
   */
  valueOf(): string {
    return this.toHexString()
  }

  /**
   * Symbol.toStringTag for better debugging output
   */
  get [Symbol.toStringTag](): string {
    return 'ObjectId'
  }

  /**
   * Create custom inspect output for Node.js console
   */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return `ObjectId("${this.toHexString()}")`
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Static Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create an ObjectId from a 24-character hex string
   *
   * @param hexString - 24-character hex string
   * @returns New ObjectId instance
   * @throws {TypeError} If hexString is invalid
   */
  static createFromHexString(hexString: string): ObjectId {
    if (!ObjectId.isValidHex(hexString)) {
      throw new TypeError(
        `Invalid ObjectId hex string: "${hexString}". Must be 24 hex characters.`
      )
    }
    return new ObjectId(hexString)
  }

  /**
   * Create an ObjectId with a specific timestamp
   * Useful for range queries on _id fields
   *
   * @param time - Unix timestamp in seconds
   * @returns New ObjectId with the given timestamp and zeroed remaining bytes
   */
  static createFromTime(time: number): ObjectId {
    const buffer = new Uint8Array(12)
    writeUInt32BE(buffer, time, 0)
    // Remaining 8 bytes are already zero from Uint8Array initialization
    return new ObjectId(buffer)
  }

  /**
   * Generate a new ObjectId (factory method, equivalent to new ObjectId())
   *
   * @returns New unique ObjectId instance
   */
  static generate(): ObjectId {
    return new ObjectId()
  }

  /**
   * Check if a value is a valid ObjectId or ObjectId hex string
   *
   * @param value - Value to check
   * @returns true if valid ObjectId or 24-char hex string
   */
  static isValid(value: unknown): value is ObjectId | string {
    if (value instanceof ObjectId) {
      return true
    }
    if (typeof value === 'string') {
      return ObjectId.isValidHex(value)
    }
    return false
  }

  /**
   * Check if a string is a valid 24-character hex string
   */
  private static isValidHex(str: string): boolean {
    return (
      typeof str === 'string' && str.length === 24 && OBJECTID_PATTERN.test(str)
    )
  }
}

export default ObjectId
