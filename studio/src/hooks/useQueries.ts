import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
