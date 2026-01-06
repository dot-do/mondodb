export type {
  VectorSearchOptions,
  VectorMatch,
  VectorStorageAdapter,
} from './vector-types'

export interface Document {
  _id?: string
  [key: string]: unknown
}

export interface Filter {
  [key: string]: unknown
}

export interface FindOptions {
  limit?: number
  skip?: number
  sort?: Record<string, 1 | -1>
  projection?: Record<string, 0 | 1>
}

export interface UpdateOperators {
  $set?: Record<string, unknown>
  $unset?: Record<string, unknown>
  $inc?: Record<string, number>
  $push?: Record<string, unknown>
  $pull?: Record<string, unknown>
  $addToSet?: Record<string, unknown>
  [key: string]: unknown
}

export interface InsertOneResult {
  acknowledged: boolean
  insertedId: string
}

export interface InsertManyResult {
  acknowledged: boolean
  insertedCount: number
  insertedIds: Record<number, string>
}

export interface UpdateResult {
  acknowledged: boolean
  matchedCount: number
  modifiedCount: number
  upsertedCount: number
  upsertedId?: string
}

export interface DeleteResult {
  acknowledged: boolean
  deletedCount: number
}

export interface StorageAdapter {
  insertOne(collection: string, doc: Document): Promise<InsertOneResult>
  insertMany(collection: string, docs: Document[]): Promise<InsertManyResult>
  findOne(collection: string, filter: Filter): Promise<Document | null>
  find(collection: string, filter: Filter, options?: FindOptions): Promise<Document[]>
  updateOne(collection: string, filter: Filter, update: UpdateOperators): Promise<UpdateResult>
  updateMany(collection: string, filter: Filter, update: UpdateOperators): Promise<UpdateResult>
  deleteOne(collection: string, filter: Filter): Promise<DeleteResult>
  deleteMany(collection: string, filter: Filter): Promise<DeleteResult>
  countDocuments(collection: string, filter: Filter): Promise<number>
  close(): Promise<void>
}
