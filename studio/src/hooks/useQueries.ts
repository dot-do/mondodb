import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import rpcClient, {
  Document,
  CollectionInfo,
  DatabaseInfo,
  IndexInfo,
  FindOptions,
} from '@lib/rpc-client'
import { useConnectionStore } from '@stores/connection'

// Query keys factory
export const queryKeys = {
  databases: ['databases'] as const,
  collections: (database: string) => ['collections', database] as const,
  documents: (database: string, collection: string, options?: FindOptions) =>
    ['documents', database, collection, options] as const,
  infiniteDocuments: (
    database: string,
    collection: string,
    filter?: Record<string, unknown>,
    sort?: Record<string, 1 | -1>
  ) => ['infiniteDocuments', database, collection, filter, sort] as const,
  document: (database: string, collection: string, id: string) =>
    ['document', database, collection, id] as const,
  count: (database: string, collection: string, filter?: Record<string, unknown>) =>
    ['count', database, collection, filter] as const,
  indexes: (database: string, collection: string) =>
    ['indexes', database, collection] as const,
}

// Database queries
export function useDatabasesQuery() {
  const { isConnected } = useConnectionStore()

  return useQuery({
    queryKey: queryKeys.databases,
    queryFn: () => rpcClient.listDatabases(),
    enabled: isConnected,
  })
}

export function useCollectionsQuery(database: string, enabled = true) {
  const { isConnected } = useConnectionStore()

  return useQuery({
    queryKey: queryKeys.collections(database),
    queryFn: () => rpcClient.listCollections(database),
    enabled: isConnected && enabled && !!database,
  })
}

// Document queries
export function useDocumentsQuery(
  database: string,
  collection: string,
  options: FindOptions = {}
) {
  const { isConnected } = useConnectionStore()

  return useQuery({
    queryKey: queryKeys.documents(database, collection, options),
    queryFn: () => rpcClient.find(database, collection, options),
    enabled: isConnected && !!database && !!collection,
  })
}

export interface InfiniteDocumentsOptions {
  filter?: Record<string, unknown>
  sort?: Record<string, 1 | -1>
  pageSize?: number
}

export interface InfiniteDocumentsPage {
  documents: Document[]
  nextCursor: string | null
  hasMore: boolean
}

/**
 * Hook for cursor-based pagination of documents.
 * Uses the last document's _id as the cursor for efficient pagination.
 */
export function useInfiniteDocumentsQuery(
  database: string,
  collection: string,
  options: InfiniteDocumentsOptions = {}
) {
  const { isConnected } = useConnectionStore()
  const { filter = {}, sort = { _id: 1 }, pageSize = 20 } = options

  return useInfiniteQuery({
    queryKey: queryKeys.infiniteDocuments(database, collection, filter, sort),
    queryFn: async ({ pageParam }): Promise<InfiniteDocumentsPage> => {
      // Build the filter with cursor for pagination
      // For cursor-based pagination, we use _id as the cursor
      const cursorFilter = pageParam
        ? {
            ...filter,
            _id: sort._id === -1 ? { $lt: pageParam } : { $gt: pageParam },
          }
        : filter

      const documents = await rpcClient.find(database, collection, {
        filter: cursorFilter,
        sort,
        limit: pageSize + 1, // Fetch one extra to check if there's more
      })

      // Check if there are more documents
      const hasMore = documents.length > pageSize
      const resultDocs = hasMore ? documents.slice(0, pageSize) : documents

      // Get the next cursor from the last document
      const lastDoc = resultDocs[resultDocs.length - 1]
      const nextCursor = hasMore && lastDoc ? lastDoc._id : null

      return {
        documents: resultDocs,
        nextCursor,
        hasMore,
      }
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: isConnected && !!database && !!collection,
  })
}

export function useDocumentQuery(
  database: string,
  collection: string,
  id: string
) {
  const { isConnected } = useConnectionStore()

  return useQuery({
    queryKey: queryKeys.document(database, collection, id),
    queryFn: () => rpcClient.findOne(database, collection, { _id: id }),
    enabled: isConnected && !!database && !!collection && !!id,
  })
}

export function useDocumentCountQuery(
  database: string,
  collection: string,
  filter: Record<string, unknown> = {}
) {
  const { isConnected } = useConnectionStore()

  return useQuery({
    queryKey: queryKeys.count(database, collection, filter),
    queryFn: () => rpcClient.countDocuments(database, collection, filter),
    enabled: isConnected && !!database && !!collection,
  })
}

// Index queries
export function useIndexesQuery(database: string, collection: string) {
  const { isConnected } = useConnectionStore()

  return useQuery({
    queryKey: queryKeys.indexes(database, collection),
    queryFn: () => rpcClient.listIndexes(database, collection),
    enabled: isConnected && !!database && !!collection,
  })
}

// Mutations
export function useInsertDocumentMutation(
  database: string,
  collection: string
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (document: Record<string, unknown>) =>
      rpcClient.insertOne(database, collection, document),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.documents(database, collection),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.count(database, collection),
      })
    },
  })
}

export function useInsertManyDocumentsMutation(
  database: string,
  collection: string
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (documents: Record<string, unknown>[]) =>
      rpcClient.insertMany(database, collection, documents),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.documents(database, collection),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.infiniteDocuments(database, collection),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.count(database, collection),
      })
    },
  })
}

export function useUpdateDocumentMutation(
  database: string,
  collection: string
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      filter,
      update,
    }: {
      filter: Record<string, unknown>
      update: Record<string, unknown>
    }) => rpcClient.updateOne(database, collection, filter, update),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.documents(database, collection),
      })
    },
  })
}

export function useDeleteDocumentMutation(
  database: string,
  collection: string
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (filter: Record<string, unknown>) =>
      rpcClient.deleteOne(database, collection, filter),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.documents(database, collection),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.count(database, collection),
      })
    },
  })
}

export function useCreateIndexMutation(database: string, collection: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      keys,
      options,
    }: {
      keys: Record<string, 1 | -1 | 'text' | '2dsphere'>
      options?: Record<string, unknown>
    }) => rpcClient.createIndex(database, collection, keys, options),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.indexes(database, collection),
      })
    },
  })
}

export function useDropIndexMutation(database: string, collection: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (indexName: string) =>
      rpcClient.dropIndex(database, collection, indexName),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.indexes(database, collection),
      })
    },
  })
}

export function useAggregateQuery(
  database: string,
  collection: string,
  pipeline: Record<string, unknown>[],
  enabled = true
) {
  const { isConnected } = useConnectionStore()

  return useQuery({
    queryKey: ['aggregate', database, collection, pipeline],
    queryFn: () => rpcClient.aggregate(database, collection, pipeline),
    enabled: isConnected && !!database && !!collection && enabled,
  })
}
