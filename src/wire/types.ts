/**
 * MongoDB Wire Protocol Types
 *
 * Based on: https://www.mongodb.com/docs/manual/reference/mongodb-wire-protocol/
 */

import type { Document, Long } from 'bson'

/** MongoDB wire protocol opcodes */
export const OpCode = {
  /** Standard message format for all operations (MongoDB 3.6+) */
  OP_MSG: 2013,
  /** Compressed message wrapper */
  OP_COMPRESSED: 2012,
  /** Legacy reply to client (removed in 5.1, but still used for backwards compat) */
  OP_REPLY: 1,
  /** Legacy query (deprecated, but still used for initial handshake) */
  OP_QUERY: 2004,
  /** Legacy get more (removed in 5.1) */
  OP_GET_MORE: 2005,
  /** Legacy kill cursors (removed in 5.1) */
  OP_KILL_CURSORS: 2007,
} as const

export type OpCodeValue = (typeof OpCode)[keyof typeof OpCode]

/** OP_MSG flag bits */
export const OpMsgFlags = {
  /** Message ends with CRC-32C checksum */
  CHECKSUM_PRESENT: 1 << 0,
  /** More messages follow; don't respond until bit=0 */
  MORE_TO_COME: 1 << 1,
  /** Client accepts multiple replies (exhaust cursors) */
  EXHAUST_ALLOWED: 1 << 16,
} as const

/** OP_QUERY flag bits (legacy) */
export const OpQueryFlags = {
  TAILABLE_CURSOR: 1 << 1,
  SLAVE_OK: 1 << 2,
  OPLOG_REPLAY: 1 << 3,  // Deprecated
  NO_CURSOR_TIMEOUT: 1 << 4,
  AWAIT_DATA: 1 << 5,
  EXHAUST: 1 << 6,
  PARTIAL: 1 << 7,
} as const

/** OP_REPLY response flags */
export const OpReplyFlags = {
  CURSOR_NOT_FOUND: 1 << 0,
  QUERY_FAILURE: 1 << 1,
  SHARD_CONFIG_STALE: 1 << 2,
  AWAIT_CAPABLE: 1 << 3,
} as const

/** Compression algorithm IDs */
export const Compressor = {
  NOOP: 0,
  SNAPPY: 1,
  ZLIB: 2,
  ZSTD: 3,
} as const

export type CompressorValue = (typeof Compressor)[keyof typeof Compressor]

/**
 * Message header structure (16 bytes)
 * All integers are little-endian
 */
export interface MsgHeader {
  /** Total message size including this header */
  messageLength: number
  /** Client-generated unique identifier */
  requestID: number
  /** For responses: requestID being replied to */
  responseTo: number
  /** Message type (OpCode) */
  opCode: OpCodeValue
}

/** OP_MSG section type 0 - single BSON body */
export interface Section0 {
  kind: 0
  body: Document
}

/** OP_MSG section type 1 - document sequence */
export interface Section1 {
  kind: 1
  identifier: string
  documents: Document[]
}

export type Section = Section0 | Section1

/** Parsed OP_MSG message */
export interface OpMsgMessage {
  header: MsgHeader
  flagBits: number
  sections: Section[]
  checksum?: number
}

/** Parsed OP_QUERY message (legacy, for handshake) */
export interface OpQueryMessage {
  header: MsgHeader
  flags: number
  fullCollectionName: string
  numberToSkip: number
  numberToReturn: number
  query: Document
  returnFieldsSelector?: Document
}

/** OP_REPLY message (legacy response format) */
export interface OpReplyMessage {
  header: MsgHeader
  responseFlags: number
  cursorID: Long
  startingFrom: number
  numberReturned: number
  documents: Document[]
}

/** Connection state for tracking client connections */
export interface ConnectionState {
  id: number
  authenticated: boolean
  authenticatedUser?: string
  authDb?: string
  compressionEnabled: boolean
  compressor?: CompressorValue
  cursors: Map<bigint, CursorState>
}

/** Cursor state for pagination */
export interface CursorState {
  id: bigint
  namespace: string
  documents: Document[]
  position: number
  batchSize: number
  createdAt: number
}

/** Server capabilities for hello response */
export interface ServerCapabilities {
  maxBsonObjectSize: number
  maxMessageSizeBytes: number
  maxWriteBatchSize: number
  minWireVersion: number
  maxWireVersion: number
  logicalSessionTimeoutMinutes: number
  readOnly: boolean
}

/** Default server capabilities (MongoDB 6.0 compatible) */
export const DEFAULT_CAPABILITIES: ServerCapabilities = {
  maxBsonObjectSize: 16 * 1024 * 1024,      // 16 MiB
  maxMessageSizeBytes: 48 * 1024 * 1024,    // 48 MiB
  maxWriteBatchSize: 100000,
  minWireVersion: 0,
  maxWireVersion: 17,                        // MongoDB 6.0
  logicalSessionTimeoutMinutes: 30,
  readOnly: false,
}
