/**
 * MCP Transport Module
 *
 * Provides transport implementations for MCP (Model Context Protocol):
 * - HTTP transport with SSE support for web clients
 * - stdio transport for CLI and pipe-based communication
 */

// HTTP Transport
export {
  createHttpMcpHandler,
  createStandardHandler,
  type CorsOptions,
  type RequestLogEntry,
  type RequestLogCallback,
  type AuthResult,
  type AuthHook,
  type RateLimitResult,
  type RateLimitOptions,
  type HttpTransportOptions,
  type HttpHandler,
} from './http';

// stdio Transport
export {
  createStdioTransport,
  JsonRpcErrorCodes,
  type DebugLogEntry,
  type DebugCallback,
  type BufferedWriteOptions,
  type GracefulShutdownOptions,
  type StdioTransportOptions,
  type StdioTransport,
} from './stdio';
