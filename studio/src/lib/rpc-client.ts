/**
 * mondodb RPC Client
 *
 * Provides a type-safe interface for communicating with the mondodb Durable Object
 * via the RPC endpoint.
 */

export interface RpcRequest {
  id?: string
  method: string
  params: unknown[]
}

export interface RpcResponse<T = unknown> {
  id?: string
  result?: T
  error?: {
    code: number
    message: string
  }
}

export interface RpcBatchResponse<T = unknown> {
  results: RpcResponse<T>[]
}

export interface Document {
  _id: string
  [key: string]: unknown
}

export interface CollectionInfo {
  name: string
  type: 'collection' | 'view'
  options?: Record<string, unknown>
}

export interface DatabaseInfo {
  name: string
  sizeOnDisk?: number
  empty?: boolean
}

export interface IndexInfo {
  name: string
  key: Record<string, 1 | -1 | 'text' | '2dsphere'>
  unique?: boolean
  sparse?: boolean
  expireAfterSeconds?: number
}

export interface FindOptions {
  filter?: Record<string, unknown>
  projection?: Record<string, 0 | 1>
  sort?: Record<string, 1 | -1>
  limit?: number
  skip?: number
}

export interface UpdateResult {
  acknowledged: boolean
  matchedCount: number
  modifiedCount: number
  upsertedId?: string
}

export interface DeleteResult {
  acknowledged: boolean
  deletedCount: number
}

export interface InsertOneResult {
  acknowledged: boolean
  insertedId: string
}

export interface InsertManyResult {
  acknowledged: boolean
  insertedIds: string[]
}

class RpcClient {
  private baseUrl: string
  private requestId = 0

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl
  }

  private nextId(): string {
    return String(++this.requestId)
  }

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const response = await fetch(`${this.baseUrl}/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: this.nextId(),
        method,
        params,
      }),
    })

    if (!response.ok) {
      throw new Error(`RPC request failed: ${response.statusText}`)
    }

    const data: RpcResponse<T> = await response.json()

    if (data.error) {
      throw new Error(data.error.message)
    }

    return data.result as T
  }

  async batch<T>(requests: RpcRequest[]): Promise<T[]> {
    const response = await fetch(`${this.baseUrl}/rpc/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        requests.map((req, i) => ({
          ...req,
          id: req.id ?? this.nextId(),
        }))
      ),
    })

    if (!response.ok) {
      throw new Error(`RPC batch request failed: ${response.statusText}`)
    }

    const data: RpcBatchResponse<T> = await response.json()

    return data.results.map((r) => {
      if (r.error) {
        throw new Error(r.error.message)
      }
      return r.result as T
    })
  }

  // Database operations
  async listDatabases(): Promise<DatabaseInfo[]> {
    return this.call<DatabaseInfo[]>('listDatabases')
  }

  async listCollections(database: string): Promise<CollectionInfo[]> {
    return this.call<CollectionInfo[]>('listCollections', [database])
  }

  async createCollection(
    database: string,
    name: string,
    options?: Record<string, unknown>
  ): Promise<void> {
    return this.call<void>('createCollection', [database, name, options])
  }

  async dropCollection(database: string, name: string): Promise<void> {
    return this.call<void>('dropCollection', [database, name])
  }

  // Document operations
  async find(
    database: string,
    collection: string,
    options: FindOptions = {}
  ): Promise<Document[]> {
    return this.call<Document[]>('find', [database, collection, options])
  }

  async findOne(
    database: string,
    collection: string,
    filter: Record<string, unknown> = {}
  ): Promise<Document | null> {
    return this.call<Document | null>('findOne', [
      database,
      collection,
      filter,
    ])
  }

  async insertOne(
    database: string,
    collection: string,
    document: Record<string, unknown>
  ): Promise<InsertOneResult> {
    return this.call<InsertOneResult>('insertOne', [
      database,
      collection,
      document,
    ])
  }

  async insertMany(
    database: string,
    collection: string,
    documents: Record<string, unknown>[]
  ): Promise<InsertManyResult> {
    return this.call<InsertManyResult>('insertMany', [
      database,
      collection,
      documents,
    ])
  }

  async updateOne(
    database: string,
    collection: string,
    filter: Record<string, unknown>,
    update: Record<string, unknown>
  ): Promise<UpdateResult> {
    return this.call<UpdateResult>('updateOne', [
      database,
      collection,
      filter,
      update,
    ])
  }

  async updateMany(
    database: string,
    collection: string,
    filter: Record<string, unknown>,
    update: Record<string, unknown>
  ): Promise<UpdateResult> {
    return this.call<UpdateResult>('updateMany', [
      database,
      collection,
      filter,
      update,
    ])
  }

  async deleteOne(
    database: string,
    collection: string,
    filter: Record<string, unknown>
  ): Promise<DeleteResult> {
    return this.call<DeleteResult>('deleteOne', [database, collection, filter])
  }

  async deleteMany(
    database: string,
    collection: string,
    filter: Record<string, unknown>
  ): Promise<DeleteResult> {
    return this.call<DeleteResult>('deleteMany', [
      database,
      collection,
      filter,
    ])
  }

  async countDocuments(
    database: string,
    collection: string,
    filter: Record<string, unknown> = {}
  ): Promise<number> {
    return this.call<number>('countDocuments', [database, collection, filter])
  }

  async aggregate(
    database: string,
    collection: string,
    pipeline: Record<string, unknown>[]
  ): Promise<Document[]> {
    return this.call<Document[]>('aggregate', [database, collection, pipeline])
  }

  // Index operations
  async listIndexes(
    database: string,
    collection: string
  ): Promise<IndexInfo[]> {
    return this.call<IndexInfo[]>('listIndexes', [database, collection])
  }

  async createIndex(
    database: string,
    collection: string,
    keys: Record<string, 1 | -1 | 'text' | '2dsphere'>,
    options?: Record<string, unknown>
  ): Promise<string> {
    return this.call<string>('createIndex', [
      database,
      collection,
      keys,
      options,
    ])
  }

  async dropIndex(
    database: string,
    collection: string,
    indexName: string
  ): Promise<void> {
    return this.call<void>('dropIndex', [database, collection, indexName])
  }

  // Health check
  async health(): Promise<{ status: string }> {
    const response = await fetch(`${this.baseUrl}/api/health`)
    if (!response.ok) {
      throw new Error('Health check failed')
    }
    return response.json()
  }
}

export const rpcClient = new RpcClient()
export default rpcClient
