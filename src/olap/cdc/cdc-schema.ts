/**
 * CDC Event Schema
 *
 * Defines the schema for Change Data Capture events.
 * These events represent document changes (insert, update, delete)
 * that can be emitted to downstream systems like Pipelines/ClickHouse.
 */

import { ObjectId } from '../../types/objectid';
import { serialize, type Document } from 'bson';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Namespace containing database and collection information
 */
export interface CDCNamespace {
  db: string;
  coll: string;
}

/**
 * Document key containing the _id field
 */
export interface DocumentKey {
  _id: ObjectId;
}

/**
 * Update description with changed and removed fields
 */
export interface UpdateDescription {
  updatedFields: Record<string, unknown>;
  removedFields: string[];
}

/**
 * Base interface for all CDC events
 */
export interface CDCEventBase {
  eventId: string;
  operationType: 'insert' | 'update' | 'delete';
  ns: CDCNamespace;
  documentKey: DocumentKey;
  timestamp: Date;
}

/**
 * Insert event - emitted when a document is inserted
 */
export interface InsertEvent extends CDCEventBase {
  operationType: 'insert';
  fullDocument: Record<string, unknown>;
}

/**
 * Update event - emitted when a document is updated
 */
export interface UpdateEvent extends CDCEventBase {
  operationType: 'update';
  fullDocumentBeforeChange: Record<string, unknown> | null;
  fullDocument: Record<string, unknown>;
  updateDescription: UpdateDescription;
}

/**
 * Delete event - emitted when a document is deleted
 */
export interface DeleteEvent extends CDCEventBase {
  operationType: 'delete';
  fullDocumentBeforeChange: Record<string, unknown> | null;
}

/**
 * Union type for all CDC events
 */
export type CDCEvent = InsertEvent | UpdateEvent | DeleteEvent;

// ============================================================================
// Event Creation Functions
// ============================================================================

/**
 * Generate a unique event ID
 */
function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create insert event parameters
 */
export interface CreateInsertEventParams {
  database: string;
  collection: string;
  document: Record<string, unknown> & { _id: ObjectId };
}

/**
 * Create an insert event for a new document
 */
export function createInsertEvent(params: CreateInsertEventParams): InsertEvent {
  const { database, collection, document } = params;

  return {
    eventId: generateEventId(),
    operationType: 'insert',
    ns: { db: database, coll: collection },
    documentKey: { _id: document._id },
    fullDocument: document,
    timestamp: new Date(),
  };
}

/**
 * Create update event parameters
 */
export interface CreateUpdateEventParams {
  database: string;
  collection: string;
  documentKey: DocumentKey;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
}

/**
 * Compute the difference between before and after documents
 */
function computeUpdateDescription(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>
): UpdateDescription {
  const updatedFields: Record<string, unknown> = {};
  const removedFields: string[] = [];

  if (before === null) {
    // If no before document, all fields in after are considered updated (except _id)
    for (const key of Object.keys(after)) {
      if (key !== '_id') {
        updatedFields[key] = after[key];
      }
    }
    return { updatedFields, removedFields };
  }

  // Find updated fields (changed or added)
  for (const key of Object.keys(after)) {
    if (key === '_id') continue;
    if (!(key in before) || !deepEquals(before[key], after[key])) {
      updatedFields[key] = after[key];
    }
  }

  // Find removed fields
  for (const key of Object.keys(before)) {
    if (key === '_id') continue;
    if (!(key in after)) {
      removedFields.push(key);
    }
  }

  return { updatedFields, removedFields };
}

/**
 * Deep equality check for values
 */
function deepEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;

  if (a instanceof ObjectId && b instanceof ObjectId) {
    return a.equals(b);
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEquals(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as object);
    const bKeys = Object.keys(b as object);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!deepEquals((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
        return false;
      }
    }
    return true;
  }

  return false;
}

/**
 * Create an update event for a document change
 */
export function createUpdateEvent(params: CreateUpdateEventParams): UpdateEvent {
  const { database, collection, documentKey, before, after } = params;

  return {
    eventId: generateEventId(),
    operationType: 'update',
    ns: { db: database, coll: collection },
    documentKey,
    fullDocumentBeforeChange: before,
    fullDocument: after,
    updateDescription: computeUpdateDescription(before, after),
    timestamp: new Date(),
  };
}

/**
 * Create delete event parameters
 */
export interface CreateDeleteEventParams {
  database: string;
  collection: string;
  documentKey: DocumentKey;
  deletedDocument: Record<string, unknown> | null;
}

/**
 * Create a delete event for a removed document
 */
export function createDeleteEvent(params: CreateDeleteEventParams): DeleteEvent {
  const { database, collection, documentKey, deletedDocument } = params;

  return {
    eventId: generateEventId(),
    operationType: 'delete',
    ns: { db: database, coll: collection },
    documentKey,
    fullDocumentBeforeChange: deletedDocument,
    timestamp: new Date(),
  };
}

// ============================================================================
// Serialization Functions
// ============================================================================

/**
 * Custom JSON replacer for ObjectId and Date values
 */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof ObjectId) {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

/**
 * Recursively convert ObjectId and Date instances to serializable format
 */
function convertForJSON(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof ObjectId) {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(convertForJSON);
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = convertForJSON(val);
    }
    return result;
  }

  return value;
}

/**
 * Serialize a CDC event to JSON string
 */
export function serializeToJSON(event: CDCEvent): string {
  const converted = convertForJSON(event);
  return JSON.stringify(converted, jsonReplacer);
}

/**
 * Recursively convert ObjectId instances to BSON-compatible format
 */
function convertForBSON(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof ObjectId) {
    // Convert to a plain object that BSON can serialize
    return { $oid: value.toString() };
  }

  if (value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(convertForBSON);
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = convertForBSON(val);
    }
    return result;
  }

  return value;
}

/**
 * Serialize a CDC event to BSON format
 */
export function serializeToBSON(event: CDCEvent): Uint8Array {
  const converted = convertForBSON(event);
  return serialize(converted as Document);
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Valid operation types for CDC events
 */
const VALID_OPERATION_TYPES = ['insert', 'update', 'delete'];

/**
 * Validate a CDC event structure
 */
export function validateEvent(event: CDCEvent): boolean {
  if (!event || typeof event !== 'object') {
    return false;
  }

  // Check operationType
  if (!event.operationType || !VALID_OPERATION_TYPES.includes(event.operationType)) {
    return false;
  }

  // Check namespace
  if (!event.ns || typeof event.ns !== 'object') {
    return false;
  }
  if (!event.ns.db || typeof event.ns.db !== 'string') {
    return false;
  }
  if (!event.ns.coll || typeof event.ns.coll !== 'string') {
    return false;
  }

  // Check documentKey
  if (!event.documentKey || typeof event.documentKey !== 'object') {
    return false;
  }
  if (!event.documentKey._id) {
    return false;
  }

  return true;
}
