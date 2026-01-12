/**
 * MongoDB-compatible type definitions for mongo.do
 */

/**
 * MongoDB ObjectId representation
 */
export interface ObjectId {
  $oid: string;
}

/**
 * Generic document type
 */
export type Document = Record<string, unknown>;

/**
 * Document with optional _id
 */
export interface WithId<T extends Document> extends T {
  _id: string | ObjectId;
}

/**
 * Filter query for finding documents
 */
export type Filter<T extends Document> = {
  [P in keyof T]?: T[P] | FilterOperators<T[P]>;
} & RootFilterOperators<T>;

/**
 * Filter operators for query expressions
 */
export interface FilterOperators<T> {
  $eq?: T;
  $ne?: T;
  $gt?: T;
  $gte?: T;
  $lt?: T;
  $lte?: T;
  $in?: T[];
  $nin?: T[];
  $exists?: boolean;
  $type?: string | number;
  $regex?: string | RegExp;
  $options?: string;
  $not?: FilterOperators<T>;
  $elemMatch?: Filter<Document>;
  $size?: number;
  $all?: T[];
}

/**
 * Root-level filter operators
 */
export interface RootFilterOperators<T extends Document> {
  $and?: Filter<T>[];
  $or?: Filter<T>[];
  $nor?: Filter<T>[];
  $text?: { $search: string; $language?: string; $caseSensitive?: boolean; $diacriticSensitive?: boolean };
  $where?: string | ((this: T) => boolean);
  $comment?: string;
}

/**
 * Update operations
 */
export interface UpdateFilter<T extends Document> {
  $set?: Partial<T>;
  $unset?: { [P in keyof T]?: '' | true | 1 };
  $inc?: { [P in keyof T]?: number };
  $mul?: { [P in keyof T]?: number };
  $min?: Partial<T>;
  $max?: Partial<T>;
  $rename?: { [key: string]: string };
  $push?: { [P in keyof T]?: T[P] extends (infer U)[] ? U | PushModifiers<U> : never };
  $pull?: { [P in keyof T]?: T[P] extends (infer U)[] ? U | FilterOperators<U> : never };
  $pop?: { [P in keyof T]?: 1 | -1 };
  $addToSet?: { [P in keyof T]?: T[P] extends (infer U)[] ? U | { $each: U[] } : never };
  $currentDate?: { [P in keyof T]?: true | { $type: 'date' | 'timestamp' } };
  $bit?: { [P in keyof T]?: { and?: number; or?: number; xor?: number } };
}

/**
 * Push modifiers for array updates
 */
export interface PushModifiers<T> {
  $each: T[];
  $slice?: number;
  $sort?: 1 | -1 | { [key: string]: 1 | -1 };
  $position?: number;
}

/**
 * Sort specification
 */
export type SortDirection = 1 | -1 | 'asc' | 'desc' | 'ascending' | 'descending';
export type Sort<T extends Document> = { [P in keyof T]?: SortDirection } | [string, SortDirection][];

/**
 * Projection specification
 */
export type Projection<T extends Document> = { [P in keyof T]?: 0 | 1 | boolean } | { [key: string]: 0 | 1 | boolean };

/**
 * Find options
 */
export interface FindOptions<T extends Document> {
  sort?: Sort<T>;
  limit?: number;
  skip?: number;
  projection?: Projection<T>;
  hint?: string | Document;
  maxTimeMS?: number;
  allowDiskUse?: boolean;
  batchSize?: number;
  comment?: string;
}

/**
 * Insert one result
 */
export interface InsertOneResult {
  acknowledged: boolean;
  insertedId: string | ObjectId;
}

/**
 * Insert many result
 */
export interface InsertManyResult {
  acknowledged: boolean;
  insertedCount: number;
  insertedIds: Record<number, string | ObjectId>;
}

/**
 * Update result
 */
export interface UpdateResult {
  acknowledged: boolean;
  matchedCount: number;
  modifiedCount: number;
  upsertedId?: string | ObjectId;
  upsertedCount?: number;
}

/**
 * Delete result
 */
export interface DeleteResult {
  acknowledged: boolean;
  deletedCount: number;
}

/**
 * Count documents options
 */
export interface CountDocumentsOptions {
  skip?: number;
  limit?: number;
  maxTimeMS?: number;
  hint?: string | Document;
}

/**
 * Update options
 */
export interface UpdateOptions {
  upsert?: boolean;
  arrayFilters?: Document[];
  hint?: string | Document;
}

/**
 * Replace options
 */
export interface ReplaceOptions {
  upsert?: boolean;
  hint?: string | Document;
}

/**
 * Delete options
 */
export interface DeleteOptions {
  hint?: string | Document;
}

/**
 * Aggregation pipeline stage
 */
export type AggregationStage =
  | { $match: Filter<Document> }
  | { $group: Document }
  | { $sort: Sort<Document> }
  | { $limit: number }
  | { $skip: number }
  | { $project: Projection<Document> }
  | { $unwind: string | { path: string; preserveNullAndEmptyArrays?: boolean } }
  | { $lookup: { from: string; localField: string; foreignField: string; as: string } }
  | { $addFields: Document }
  | { $set: Document }
  | { $unset: string | string[] }
  | { $count: string }
  | { $facet: Record<string, AggregationStage[]> }
  | { $bucket: Document }
  | { $bucketAuto: Document }
  | { $sample: { size: number } }
  | { $replaceRoot: { newRoot: string | Document } }
  | { $merge: Document }
  | { $out: string | Document }
  | Document;

/**
 * Aggregation options
 */
export interface AggregateOptions {
  allowDiskUse?: boolean;
  maxTimeMS?: number;
  batchSize?: number;
  bypassDocumentValidation?: boolean;
  collation?: Document;
  hint?: string | Document;
  comment?: string;
  let?: Document;
}

/**
 * MongoDB client options
 */
export interface MongoClientOptions {
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Enable auto-reconnect */
  autoReconnect?: boolean;
  /** Maximum number of retries */
  maxRetries?: number;
  /** Reconnect interval in milliseconds */
  reconnectInterval?: number;
  /** Authentication token */
  token?: string;
}

/**
 * RPC transport interface - abstracts the underlying RPC client
 */
export interface RpcTransport {
  call(method: string, ...args: unknown[]): Promise<unknown>;
  close(): Promise<void>;
}

/**
 * Cursor iteration callback
 */
export type ForEachCallback<T> = (doc: T, index: number) => void | boolean | Promise<void | boolean>;
