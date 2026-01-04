/**
 * MongoDB-compatible type definitions
 */

/**
 * A BSON document - the fundamental data structure in MongoDB
 */
export interface Document {
  [key: string]: unknown
  _id?: string | ObjectId
}

/**
 * ObjectId type for document identifiers
 */
export interface ObjectId {
  toString(): string
  toHexString(): string
  getTimestamp(): Date
}

/**
 * Filter query type for finding documents
 */
export type Filter<T extends Document = Document> = {
  [P in keyof T]?: T[P] | FilterOperators<T[P]>
} & RootFilterOperators<T>

/**
 * Filter operators like $eq, $gt, $lt, etc.
 */
export interface FilterOperators<T> {
  $eq?: T
  $ne?: T
  $gt?: T
  $gte?: T
  $lt?: T
  $lte?: T
  $in?: T[]
  $nin?: T[]
  $exists?: boolean
  $type?: string | number
  $regex?: string | RegExp
  $options?: string
  $not?: FilterOperators<T>
  $elemMatch?: Filter<T extends (infer U)[] ? U : never>
  $size?: number
}

/**
 * Root-level filter operators like $and, $or, $nor
 */
export interface RootFilterOperators<T> {
  $and?: Filter<T>[]
  $or?: Filter<T>[]
  $nor?: Filter<T>[]
  $text?: {
    $search: string
    $language?: string
    $caseSensitive?: boolean
    $diacriticSensitive?: boolean
  }
  $where?: string | ((this: T) => boolean)
}

/**
 * Update filter type for modifying documents
 */
export interface UpdateFilter<T extends Document = Document> {
  $set?: Partial<T>
  $unset?: { [P in keyof T]?: '' | 1 | true }
  $inc?: { [P in keyof T]?: number }
  $mul?: { [P in keyof T]?: number }
  $min?: Partial<T>
  $max?: Partial<T>
  $rename?: { [key: string]: string }
  $push?: { [P in keyof T]?: T[P] extends (infer U)[] ? U | ArrayUpdateOperators<U> : never }
  $pull?: { [P in keyof T]?: T[P] extends (infer U)[] ? U | Filter<U> : never }
  $addToSet?: { [P in keyof T]?: T[P] extends (infer U)[] ? U | { $each: U[] } : never }
  $pop?: { [P in keyof T]?: 1 | -1 }
  $currentDate?: { [P in keyof T]?: true | { $type: 'date' | 'timestamp' } }
}

/**
 * Array update operators for $push
 */
export interface ArrayUpdateOperators<T> {
  $each?: T[]
  $slice?: number
  $sort?: 1 | -1 | { [key: string]: 1 | -1 }
  $position?: number
}

/**
 * Options for find operations
 */
export interface FindOptions<T extends Document = Document> {
  projection?: { [P in keyof T]?: 0 | 1 | boolean }
  sort?: { [P in keyof T]?: 1 | -1 } | [string, 1 | -1][]
  skip?: number
  limit?: number
  hint?: string | { [key: string]: 1 | -1 }
  maxTimeMS?: number
  readConcern?: { level: 'local' | 'majority' | 'linearizable' | 'available' | 'snapshot' }
}

/**
 * Result of insertOne operation
 */
export interface InsertOneResult {
  acknowledged: boolean
  insertedId: string | ObjectId
}

/**
 * Result of insertMany operation
 */
export interface InsertManyResult {
  acknowledged: boolean
  insertedCount: number
  insertedIds: { [key: number]: string | ObjectId }
}

/**
 * Result of update operations
 */
export interface UpdateResult {
  acknowledged: boolean
  matchedCount: number
  modifiedCount: number
  upsertedCount: number
  upsertedId?: string | ObjectId
}

/**
 * Result of delete operations
 */
export interface DeleteResult {
  acknowledged: boolean
  deletedCount: number
}

/**
 * Options for aggregation pipeline
 */
export interface AggregateOptions {
  allowDiskUse?: boolean
  maxTimeMS?: number
  bypassDocumentValidation?: boolean
  readConcern?: { level: string }
  collation?: CollationOptions
  hint?: string | Document
  comment?: string
  let?: Document
}

/**
 * Collation options for string comparison
 */
export interface CollationOptions {
  locale: string
  caseLevel?: boolean
  caseFirst?: 'upper' | 'lower' | 'off'
  strength?: 1 | 2 | 3 | 4 | 5
  numericOrdering?: boolean
  alternate?: 'non-ignorable' | 'shifted'
  maxVariable?: 'punct' | 'space'
  backwards?: boolean
}

/**
 * Index specification for createIndex
 */
export interface IndexSpecification {
  key: { [key: string]: 1 | -1 | 'text' | '2dsphere' | '2d' | 'hashed' }
  name?: string
  unique?: boolean
  sparse?: boolean
  background?: boolean
  expireAfterSeconds?: number
  partialFilterExpression?: Filter
  collation?: CollationOptions
}

/**
 * Aggregation pipeline stage types
 */
export type AggregationStage =
  | { $match: Filter }
  | { $project: Document }
  | { $group: { _id: unknown; [key: string]: unknown } }
  | { $sort: { [key: string]: 1 | -1 } }
  | { $limit: number }
  | { $skip: number }
  | { $unwind: string | { path: string; preserveNullAndEmptyArrays?: boolean } }
  | { $lookup: LookupStage }
  | { $addFields: Document }
  | { $replaceRoot: { newRoot: string | Document } }
  | { $count: string }
  | { $facet: { [key: string]: AggregationStage[] } }

/**
 * $lookup stage configuration
 */
export interface LookupStage {
  from: string
  localField?: string
  foreignField?: string
  as: string
  let?: Document
  pipeline?: AggregationStage[]
}
