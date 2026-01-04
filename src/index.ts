/**
 * mondodb - MongoDB-compatible database backed by Cloudflare Durable Objects SQLite
 *
 * Main entry point for the package.
 */

// Types
export { ObjectId } from './types/objectid';

// Durable Object
export { MondoDatabase } from './durable-object/mondo-database';
export { SchemaManager, SCHEMA_VERSION, SCHEMA_TABLES } from './durable-object/schema';
export {
  IndexManager,
  generateIndexName,
  generateSQLiteIndexName,
  buildCreateIndexSQL,
} from './durable-object/index-manager';
export type { SQLStorage, SQLStatement } from './durable-object/index-manager';

// Index types
export type {
  IndexSpec,
  CreateIndexOptions,
  CreateIndexResult,
  IndexInfo,
  DropIndexResult,
} from './types';

// Client collection with index support
export { MongoCollection } from './client/mongo-collection';

// RPC Server
export {
  RpcTarget,
  MondoRpcTarget,
  newWorkersRpcResponse,
  BatchedRpcExecutor,
  PipelineTracker,
  PipelinedRpcProxy,
} from './rpc/rpc-target';

export type {
  MondoEnv as RpcMondoEnv,
  DurableObjectNamespace,
  DurableObjectId,
  DurableObjectStub,
  DatabaseRef,
  CollectionRef,
  RpcRequest,
  RpcResponse,
  BatchResponse,
  BatchedExecutorOptions,
  PipelineOp,
} from './rpc/rpc-target';

// RPC Client
export {
  RpcClient,
  MongoClient,
  WebSocketRpcTransport,
  RequestDeduplicator,
} from './rpc/rpc-client';

export type {
  RpcClientOptions,
  DeduplicatorOptions,
  ReconnectEvent,
  EventHandler,
} from './rpc/rpc-client';

// Worker Entrypoint
export {
  WorkerEntrypoint,
  MondoEntrypoint,
  validateEnv,
  isMondoEnv,
  DEFAULT_OPTIONS,
} from './rpc/worker-entrypoint';

export type {
  ExecutionContext,
  MondoEnv,
  MondoBindings,
  MondoEntrypointOptions,
} from './rpc/worker-entrypoint';

// Default export for Workers
export { MondoEntrypoint as default } from './rpc/worker-entrypoint';
