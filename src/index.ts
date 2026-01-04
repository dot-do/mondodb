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

// Consolidated RPC Types (from types/rpc.ts)
export {
  // Error codes and helpers
  ErrorCode,
  getErrorCodeName,
  successResponse,
  errorResponse,
  legacySuccessResponse,
  legacyErrorResponse,
  // Legacy RPC message types
  MessageType,
} from './types/rpc';

export type {
  // Cloudflare types
  DurableObjectNamespace,
  DurableObjectId,
  DurableObjectStub,
  // Environment types
  MondoEnv,
  // Worker loader types
  WorkerLoader,
  WorkerCode,
  WorkerStub,
  WorkerEntrypoint as WorkerEntrypointType,
  // JSON-RPC style types
  RpcRequest,
  RpcResponse,
  BatchResponse,
  // HTTP RPC types
  HttpRpcRequest,
  HttpRpcSuccessResponse,
  HttpRpcErrorResponse,
  HttpRpcResponse,
  // Legacy RPC types
  LegacyRpcRequest,
  LegacyRpcResponse,
  // Database reference types
  DatabaseRef,
  CollectionRef,
  // Batched executor types
  BatchedExecutorOptions,
  PipelineOp,
  // RPC client types
  RpcClientOptions,
  DeduplicatorOptions,
  EventHandler,
  ReconnectEvent,
  // RPC handler types
  RpcHandler,
  ErrorCodeValue,
} from './types/rpc';

// RPC Server (classes and functions)
export {
  RpcTarget,
  MondoRpcTarget,
  newWorkersRpcResponse,
  BatchedRpcExecutor,
  PipelineTracker,
  PipelinedRpcProxy,
} from './rpc/rpc-target';

// Backward compatibility: re-export RpcMondoEnv alias
export type { MondoEnv as RpcMondoEnv } from './types/rpc';

// RPC Client (classes)
export {
  RpcClient,
  MongoClient,
  WebSocketRpcTransport,
  RequestDeduplicator,
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
  MondoBindings,
  MondoEntrypointOptions,
} from './rpc/worker-entrypoint';

// Default export for Workers
export { MondoEntrypoint as default } from './rpc/worker-entrypoint';
