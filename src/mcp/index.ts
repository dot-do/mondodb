/**
 * MCP (Model Context Protocol) module
 *
 * Provides:
 * - Core MCP types and protocol messages
 * - MCP Server factory for creating server instances
 * - DatabaseProxy WorkerEntrypoint for sandboxed database access
 * - SDK adapters for Anthropic and Vercel AI SDK integration
 */

// Core types
export * from './types';

// Server factory
export {
  createMcpServer,
  createMockDatabaseAccess,
  type McpServer,
  type McpServerConfig,
  type CodeLoader,
} from './server';

// Sandbox module with DatabaseProxy
export * from './sandbox';

// SDK adapters for AI integration
export * from './adapters';

// Transport implementations (HTTP and stdio)
export * from './transport';
