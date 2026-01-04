/**
 * MongoDB Wire Protocol Message Parsing and Serialization
 *
 * Handles the binary message format including:
 * - MsgHeader (16 bytes)
 * - OP_MSG (modern format)
 * - OP_QUERY (legacy, for handshake)
 * - OP_REPLY (legacy response)
 */

import { BSON, Document } from 'bson'
import {
  type MsgHeader,
  type OpMsgMessage,
  type OpQueryMessage,
  type Section,
  type Section0,
  type Section1,
  type OpCodeValue,
  OpCode,
  OpMsgFlags,
} from './types.js'

/** Header size in bytes */
const HEADER_SIZE = 16

/**
 * Parse the 16-byte message header
 */
export function parseHeader(buffer: Buffer): MsgHeader {
  if (buffer.length < HEADER_SIZE) {
    throw new Error(`Buffer too small for header: ${buffer.length} < ${HEADER_SIZE}`)
  }

  return {
    messageLength: buffer.readInt32LE(0),
    requestID: buffer.readInt32LE(4),
    responseTo: buffer.readInt32LE(8),
    opCode: buffer.readInt32LE(12) as OpCodeValue,
  }
}

/**
 * Serialize a message header to buffer
 */
export function serializeHeader(header: MsgHeader): Buffer {
  const buffer = Buffer.allocUnsafe(HEADER_SIZE)
  buffer.writeInt32LE(header.messageLength, 0)
  buffer.writeInt32LE(header.requestID, 4)
  buffer.writeInt32LE(header.responseTo, 8)
  buffer.writeInt32LE(header.opCode, 12)
  return buffer
}

/**
 * Parse a C-style null-terminated string
 */
function parseCString(buffer: Buffer, offset: number): [string, number] {
  let end = offset
  while (end < buffer.length && buffer[end] !== 0) {
    end++
  }
  const str = buffer.toString('utf8', offset, end)
  return [str, end + 1] // +1 to skip the null terminator
}

/**
 * Parse a BSON document from buffer
 */
function parseBSONDocument(buffer: Buffer, offset: number): [Document, number] {
  const length = buffer.readInt32LE(offset)
  const doc = BSON.deserialize(buffer.subarray(offset, offset + length))
  return [doc, offset + length]
}

/**
 * Parse OP_MSG message (opcode 2013)
 */
export function parseOpMsg(buffer: Buffer): OpMsgMessage {
  const header = parseHeader(buffer)

  if (header.opCode !== OpCode.OP_MSG) {
    throw new Error(`Expected OP_MSG (${OpCode.OP_MSG}), got ${header.opCode}`)
  }

  let offset = HEADER_SIZE

  // Flag bits (4 bytes)
  const flagBits = buffer.readUInt32LE(offset)
  offset += 4

  const hasChecksum = (flagBits & OpMsgFlags.CHECKSUM_PRESENT) !== 0
  const messageEnd = hasChecksum ? buffer.length - 4 : buffer.length

  // Parse sections
  const sections: Section[] = []

  while (offset < messageEnd) {
    const kind = buffer.readUInt8(offset)
    offset += 1

    if (kind === 0) {
      // Kind 0: Single BSON document
      const [body, newOffset] = parseBSONDocument(buffer, offset)
      sections.push({ kind: 0, body } as Section0)
      offset = newOffset
    } else if (kind === 1) {
      // Kind 1: Document sequence
      const sectionSize = buffer.readInt32LE(offset)
      const sectionEnd = offset + sectionSize
      offset += 4

      const [identifier, docStart] = parseCString(buffer, offset)
      offset = docStart

      const documents: Document[] = []
      while (offset < sectionEnd) {
        const [doc, newOffset] = parseBSONDocument(buffer, offset)
        documents.push(doc)
        offset = newOffset
      }

      sections.push({ kind: 1, identifier, documents } as Section1)
    } else {
      throw new Error(`Unknown section kind: ${kind}`)
    }
  }

  // Optional checksum
  const checksum = hasChecksum ? buffer.readUInt32LE(messageEnd) : undefined

  return { header, flagBits, sections, checksum }
}

/**
 * Parse OP_QUERY message (opcode 2004, legacy)
 * Still used for initial handshake by some clients
 */
export function parseOpQuery(buffer: Buffer): OpQueryMessage {
  const header = parseHeader(buffer)

  if (header.opCode !== OpCode.OP_QUERY) {
    throw new Error(`Expected OP_QUERY (${OpCode.OP_QUERY}), got ${header.opCode}`)
  }

  let offset = HEADER_SIZE

  // Flags (4 bytes)
  const flags = buffer.readInt32LE(offset)
  offset += 4

  // Full collection name (cstring)
  const [fullCollectionName, afterName] = parseCString(buffer, offset)
  offset = afterName

  // Number to skip (4 bytes)
  const numberToSkip = buffer.readInt32LE(offset)
  offset += 4

  // Number to return (4 bytes)
  const numberToReturn = buffer.readInt32LE(offset)
  offset += 4

  // Query document
  const [query, afterQuery] = parseBSONDocument(buffer, offset)
  offset = afterQuery

  // Optional return fields selector
  let returnFieldsSelector: Document | undefined
  if (offset < buffer.length) {
    ;[returnFieldsSelector] = parseBSONDocument(buffer, offset)
  }

  return {
    header,
    flags,
    fullCollectionName,
    numberToSkip,
    numberToReturn,
    query,
    returnFieldsSelector,
  }
}

/**
 * Serialize an OP_MSG response
 */
export function serializeOpMsg(
  requestID: number,
  responseTo: number,
  body: Document,
  additionalSections?: Section1[]
): Buffer {
  // Serialize the body document
  const bodyBson = Buffer.from(BSON.serialize(body))

  // Calculate section 0 size
  let sectionsSize = 1 + bodyBson.length // kind byte + BSON

  // Calculate additional sections size
  const serializedSections: Buffer[] = []
  if (additionalSections) {
    for (const section of additionalSections) {
      const identifierBuf = Buffer.from(section.identifier + '\0', 'utf8')
      const docsBufs = section.documents.map((doc) => Buffer.from(BSON.serialize(doc)))
      const docsSize = docsBufs.reduce((sum, buf) => sum + buf.length, 0)
      const sectionSize = 4 + identifierBuf.length + docsSize // size + identifier + docs

      const sectionBuf = Buffer.allocUnsafe(1 + sectionSize) // kind + section
      sectionBuf.writeUInt8(1, 0) // kind = 1
      sectionBuf.writeInt32LE(sectionSize, 1)
      identifierBuf.copy(sectionBuf, 5)
      let docOffset = 5 + identifierBuf.length
      for (const docBuf of docsBufs) {
        docBuf.copy(sectionBuf, docOffset)
        docOffset += docBuf.length
      }

      serializedSections.push(sectionBuf)
      sectionsSize += sectionBuf.length
    }
  }

  // Total message length
  const messageLength = HEADER_SIZE + 4 + sectionsSize // header + flagBits + sections

  // Allocate buffer
  const buffer = Buffer.allocUnsafe(messageLength)
  let offset = 0

  // Header
  buffer.writeInt32LE(messageLength, offset)
  offset += 4
  buffer.writeInt32LE(requestID, offset)
  offset += 4
  buffer.writeInt32LE(responseTo, offset)
  offset += 4
  buffer.writeInt32LE(OpCode.OP_MSG, offset)
  offset += 4

  // Flag bits (no flags set)
  buffer.writeUInt32LE(0, offset)
  offset += 4

  // Section 0 (body)
  buffer.writeUInt8(0, offset) // kind = 0
  offset += 1
  bodyBson.copy(buffer, offset)
  offset += bodyBson.length

  // Additional sections
  for (const sectionBuf of serializedSections) {
    sectionBuf.copy(buffer, offset)
    offset += sectionBuf.length
  }

  return buffer
}

/**
 * Serialize an OP_REPLY response (legacy)
 */
export function serializeOpReply(
  requestID: number,
  responseTo: number,
  documents: Document[],
  cursorID: bigint = 0n,
  responseFlags: number = 0
): Buffer {
  // Serialize documents
  const docBuffers = documents.map((doc) => Buffer.from(BSON.serialize(doc)))
  const docsSize = docBuffers.reduce((sum, buf) => sum + buf.length, 0)

  // Total message length
  // header(16) + responseFlags(4) + cursorID(8) + startingFrom(4) + numberReturned(4) + docs
  const messageLength = HEADER_SIZE + 20 + docsSize

  const buffer = Buffer.allocUnsafe(messageLength)
  let offset = 0

  // Header
  buffer.writeInt32LE(messageLength, offset)
  offset += 4
  buffer.writeInt32LE(requestID, offset)
  offset += 4
  buffer.writeInt32LE(responseTo, offset)
  offset += 4
  buffer.writeInt32LE(OpCode.OP_REPLY, offset)
  offset += 4

  // Response flags
  buffer.writeInt32LE(responseFlags, offset)
  offset += 4

  // Cursor ID
  buffer.writeBigInt64LE(cursorID, offset)
  offset += 8

  // Starting from
  buffer.writeInt32LE(0, offset)
  offset += 4

  // Number returned
  buffer.writeInt32LE(documents.length, offset)
  offset += 4

  // Documents
  for (const docBuf of docBuffers) {
    docBuf.copy(buffer, offset)
    offset += docBuf.length
  }

  return buffer
}

/**
 * Parse any incoming message based on opcode
 */
export function parseMessage(buffer: Buffer): OpMsgMessage | OpQueryMessage {
  const header = parseHeader(buffer)

  switch (header.opCode) {
    case OpCode.OP_MSG:
      return parseOpMsg(buffer)
    case OpCode.OP_QUERY:
      return parseOpQuery(buffer)
    default:
      throw new Error(`Unsupported opcode: ${header.opCode}`)
  }
}

/**
 * Extract the command document and database from parsed message
 */
export function extractCommand(message: OpMsgMessage | OpQueryMessage): {
  db: string
  command: Document
  documentSequences: Map<string, Document[]>
} {
  if ('sections' in message) {
    // OP_MSG
    const section0 = message.sections.find((s): s is Section0 => s.kind === 0)
    if (!section0) {
      throw new Error('OP_MSG missing section 0 (body)')
    }

    const command = section0.body
    const db = command.$db as string
    if (!db) {
      throw new Error('OP_MSG command missing $db field')
    }

    // Collect document sequences from kind=1 sections
    const documentSequences = new Map<string, Document[]>()
    for (const section of message.sections) {
      if (section.kind === 1) {
        documentSequences.set(section.identifier, section.documents)
      }
    }

    return { db, command, documentSequences }
  } else {
    // OP_QUERY
    const parts = message.fullCollectionName.split('.')
    const db = parts[0] || 'admin'
    const command = message.query

    return { db, command, documentSequences: new Map() }
  }
}
