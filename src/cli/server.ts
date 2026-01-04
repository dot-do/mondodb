/**
 * CLI Server Module
 *
 * Enhanced CLI for MondoDB wire protocol server with support for
 * local SQLite backend and remote Cloudflare Workers proxy.
 *
 * @module cli/server
 *
 * @example
 * ```typescript
 * import { parseArgs, runServer, printStartupMessage } from './server'
 *
 * const options = parseArgs(process.argv.slice(2))
 * if (options.help) {
 *   printHelp()
 *   process.exit(0)
 * }
 *
 * const controller = await runServer(options)
 * printStartupMessage(options)
 *
 * // Later, gracefully shutdown
 * await controller.stop()
 * ```
 */

import type { MondoBackend } from '../wire/backend/interface.js'
import { WorkersProxyBackend } from '../wire/backend/workers-proxy.js'

// Lazy imports for Bun-specific modules (deferred to avoid bun:sqlite in Node tests)
let LocalSQLiteBackend: typeof import('../wire/backend/local-sqlite.js').LocalSQLiteBackend
let WireProtocolServer: typeof import('../wire/server.js').WireProtocolServer

/**
 * Lazy load Bun-specific modules to avoid issues in Node.js environments.
 * These modules depend on bun:sqlite which is not available in Node.
 *
 * @internal
 */
async function loadBunModules(): Promise<void> {
  if (!LocalSQLiteBackend) {
    const localModule = await import('../wire/backend/local-sqlite.js')
    LocalSQLiteBackend = localModule.LocalSQLiteBackend
  }
  if (!WireProtocolServer) {
    const serverModule = await import('../wire/server.js')
    WireProtocolServer = serverModule.WireProtocolServer
  }
}

// ============================================================================
// Types
// ============================================================================

/**
 * Command-line options for the MondoDB server.
 */
export interface CLIOptions {
  /** Port number to listen on (1-65535) */
  port: number
  /** Host address to bind to (e.g., 'localhost', '0.0.0.0') */
  host: string
  /** Directory path for local SQLite data storage */
  dataDir: string
  /** Optional URL for remote Cloudflare Workers endpoint */
  remote?: string
  /** Enable verbose logging output */
  verbose: boolean
  /** Display help message and exit */
  help: boolean
}

/**
 * Controller interface for managing a running server instance.
 * Provides methods and properties to monitor and control the server lifecycle.
 */
export interface ServerController {
  /** Gracefully stop the server and close all connections */
  stop(): Promise<void>
  /** Whether the server is currently running */
  isRunning: boolean
  /** Whether the server is accepting new connections */
  isAcceptingConnections: boolean
  /** Number of currently active client connections */
  activeConnections: number
  /** The address the server is bound to */
  address: { host: string; port: number }
}

// ============================================================================
// Argument Parsing
// ============================================================================

/**
 * Parse command-line arguments into a CLIOptions object.
 *
 * Supports both long-form (--port) and short-form (-p) arguments.
 * Unknown arguments are silently ignored.
 *
 * @param args - Array of command-line arguments (typically process.argv.slice(2))
 * @returns Parsed CLI options with defaults applied
 *
 * @example
 * ```typescript
 * const options = parseArgs(['--port', '27018', '--verbose'])
 * // options.port === 27018
 * // options.verbose === true
 * ```
 */
export function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    port: 27017,
    host: 'localhost',
    dataDir: './data',
    verbose: false,
    help: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    // Handle --help / -h
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }

    // Handle --verbose / -v
    if (arg === '--verbose' || arg === '-v') {
      options.verbose = true
      continue
    }

    // Handle --port / -p
    if (arg.startsWith('--port=')) {
      options.port = parseInt(arg.slice(7), 10)
      continue
    }
    if (arg.startsWith('-p=')) {
      options.port = parseInt(arg.slice(3), 10)
      continue
    }
    if (arg === '--port' || arg === '-p') {
      const nextArg = args[++i]
      if (nextArg) {
        options.port = parseInt(nextArg, 10)
      }
      continue
    }

    // Handle --host / -H (note: -h is for help)
    if (arg.startsWith('--host=')) {
      options.host = arg.slice(7)
      continue
    }
    if (arg.startsWith('-H=')) {
      options.host = arg.slice(3)
      continue
    }
    if (arg === '--host' || arg === '-H') {
      const nextArg = args[++i]
      if (nextArg) {
        options.host = nextArg
      }
      continue
    }

    // Handle --data / -d
    if (arg.startsWith('--data=')) {
      options.dataDir = arg.slice(7)
      continue
    }
    if (arg.startsWith('-d=')) {
      options.dataDir = arg.slice(3)
      continue
    }
    if (arg === '--data' || arg === '-d') {
      const nextArg = args[++i]
      if (nextArg) {
        options.dataDir = nextArg
      }
      continue
    }

    // Handle --remote / -r
    if (arg.startsWith('--remote=')) {
      options.remote = arg.slice(9)
      continue
    }
    if (arg.startsWith('-r=')) {
      options.remote = arg.slice(3)
      continue
    }
    if (arg === '--remote' || arg === '-r') {
      const nextArg = args[++i]
      if (nextArg) {
        options.remote = nextArg
      }
      continue
    }

    // Unknown options are ignored
  }

  return options
}

// ============================================================================
// Option Validation
// ============================================================================

/**
 * Validate CLI options and throw descriptive errors if invalid.
 *
 * Validates:
 * - Port is a valid integer between 1 and 65535
 * - Host is a non-empty string
 * - Data directory is a non-empty string
 * - Remote URL (if provided) is a valid HTTP/HTTPS URL
 *
 * @param options - CLI options to validate
 * @throws {Error} If any option is invalid with a descriptive message
 *
 * @example
 * ```typescript
 * try {
 *   validateOptions({ port: 0, host: 'localhost', ... })
 * } catch (error) {
 *   // "Invalid port: 0. Port must be an integer between 1 and 65535."
 * }
 * ```
 */
export function validateOptions(options: CLIOptions): void {
  // Validate port
  if (
    typeof options.port !== 'number' ||
    isNaN(options.port) ||
    !Number.isInteger(options.port) ||
    options.port < 1 ||
    options.port > 65535
  ) {
    throw new Error(`Invalid port: ${options.port}. Port must be an integer between 1 and 65535.`)
  }

  // Validate host
  if (!options.host || typeof options.host !== 'string') {
    throw new Error('Invalid host: host cannot be empty')
  }

  // Validate dataDir
  if (!options.dataDir || typeof options.dataDir !== 'string') {
    throw new Error('Invalid data directory: path cannot be empty')
  }

  // Validate remote URL if provided
  if (options.remote !== undefined) {
    if (!options.remote || typeof options.remote !== 'string') {
      throw new Error('Invalid remote URL: URL cannot be empty')
    }

    try {
      const url = new URL(options.remote)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`Invalid remote URL: unsupported protocol "${url.protocol}"`)
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('unsupported protocol')) {
        throw e
      }
      throw new Error(`Invalid remote URL: "${options.remote}" is not a valid URL`)
    }
  }
}

// ============================================================================
// Backend Creation
// ============================================================================

/**
 * Create the appropriate storage backend based on CLI options.
 *
 * - If `options.remote` is set, creates a WorkersProxyBackend that forwards
 *   requests to a remote Cloudflare Workers endpoint.
 * - Otherwise, creates a LocalSQLiteBackend for local file-based storage.
 *
 * @param options - CLI options containing backend configuration
 * @returns Promise resolving to the configured backend instance
 *
 * @example
 * ```typescript
 * // Local backend
 * const local = await createBackend({ dataDir: './data', ... })
 *
 * // Remote backend
 * const remote = await createBackend({ remote: 'https://my-worker.dev', ... })
 * ```
 */
export async function createBackend(options: CLIOptions): Promise<MondoBackend> {
  if (options.remote) {
    // Use WorkersProxyBackend for remote mode
    return new WorkersProxyBackend({
      endpoint: options.remote,
    })
  }

  // Use LocalSQLiteBackend for local mode (lazy load Bun modules)
  await loadBunModules()
  return new LocalSQLiteBackend(options.dataDir)
}

// ============================================================================
// Output Functions
// ============================================================================

/**
 * Print usage help message to stdout.
 * Displays all available command-line options with descriptions and examples.
 */
export function printHelp(): void {
  console.log(`
Usage: mondodb serve [options]

Start a MongoDB wire protocol server backed by SQLite.

Options:
  -p, --port <port>     Port to listen on (default: 27017)
  -H, --host <host>     Host to bind to (default: localhost)
  -d, --data <path>     Data directory for local SQLite storage (default: ./data)
  -r, --remote <url>    Proxy/forward to remote Cloudflare Workers endpoint
  -v, --verbose         Enable verbose logging
  -V, --version         Show version number
  -h, --help            Show this help message

Examples:
  # Start local server on default port
  mondodb serve

  # Start on custom port with verbose logging
  mondodb serve --port 27018 --verbose

  # Bind to all interfaces
  mondodb serve --host 0.0.0.0

  # Use custom data directory
  mondodb serve --data /var/lib/mondodb

  # Proxy to remote Cloudflare Workers
  mondodb serve --remote https://my-mondodb.workers.dev

  # Combine options
  mondodb serve --port 27018 --host 0.0.0.0 --verbose
`)
}

/**
 * Print server startup message to stdout.
 * Displays connection string and backend mode information.
 *
 * @param options - CLI options used to start the server
 */
export function printStartupMessage(options: CLIOptions): void {
  const connectionString = `mongodb://${options.host}:${options.port}`

  if (options.remote) {
    console.log(`MondoDB server started in proxy/remote mode`)
    console.log(`  Connect: ${connectionString}`)
    console.log(`  Proxying to: ${options.remote}`)
  } else {
    console.log(`MondoDB server started in local/SQLite mode`)
    console.log(`  Connect: ${connectionString}`)
    console.log(`  Data directory: ${options.dataDir}`)
  }
}

/**
 * Print server shutdown message to stdout.
 * Called after graceful server shutdown completes.
 */
export function printShutdownMessage(): void {
  console.log('MondoDB server gracefully shutdown. Clean stop complete.')
}

// ============================================================================
// Server Runner
// ============================================================================

/**
 * Start the MongoDB wire protocol server with the given options.
 *
 * This is the main entry point for starting a MondoDB server. It:
 * 1. Validates the provided options
 * 2. Creates the appropriate backend (local or remote)
 * 3. Starts the wire protocol server
 * 4. Sets up signal handlers for graceful shutdown
 *
 * @param options - Server configuration options
 * @param backend - Optional pre-configured backend (for testing)
 * @returns Promise resolving to a ServerController for managing the server
 * @throws {Error} If options are invalid or server fails to start
 *
 * @example
 * ```typescript
 * const controller = await runServer({
 *   port: 27017,
 *   host: 'localhost',
 *   dataDir: './data',
 *   verbose: false,
 *   help: false,
 * })
 *
 * // Check server status
 * console.log(controller.isRunning) // true
 *
 * // Graceful shutdown
 * await controller.stop()
 * ```
 */
export async function runServer(
  options: CLIOptions,
  backend?: MondoBackend
): Promise<ServerController> {
  // Validate options first
  validateOptions(options)

  // Create backend if not provided
  const serverBackend = backend ?? await createBackend(options)

  // Test remote connection if using remote backend
  if (options.remote && !backend) {
    try {
      // Try to list databases to verify connection
      await serverBackend.listDatabases()
    } catch (e) {
      throw new Error(`Failed to connect to remote worker: ${options.remote}. Network unreachable or worker not responding.`)
    }
  }

  // Lazy load WireProtocolServer
  await loadBunModules()

  // Create and start the wire protocol server
  const wireServer = new WireProtocolServer(serverBackend, {
    port: options.port,
    host: options.host,
    verbose: options.verbose,
  })

  let running = false
  let acceptingConnections = false
  let connectionCount = 0

  // Signal handlers
  const handleSignal = async () => {
    if (running) {
      await controller.stop()
    }
  }

  const sigintHandler = handleSignal
  const sigtermHandler = handleSignal

  // Controller object
  const controller: ServerController = {
    get isRunning() {
      return running
    },
    get isAcceptingConnections() {
      return acceptingConnections
    },
    get activeConnections() {
      return connectionCount
    },
    get address() {
      return { host: options.host, port: options.port }
    },
    async stop() {
      if (!running) return

      running = false
      acceptingConnections = false
      connectionCount = 0

      // Stop the wire server
      await wireServer.stop()

      // Clean up backend if it has a close method
      if ('close' in serverBackend && typeof serverBackend.close === 'function') {
        await (serverBackend as { close: () => Promise<void> }).close()
      }

      // Remove signal handlers
      process.removeListener('SIGINT', sigintHandler)
      process.removeListener('SIGTERM', sigtermHandler)
    },
  }

  // Register signal handlers
  process.on('SIGINT', sigintHandler)
  process.on('SIGTERM', sigtermHandler)

  // Start the server
  try {
    await wireServer.start()
    running = true
    acceptingConnections = true
  } catch (e) {
    // Clean up signal handlers on failure
    process.removeListener('SIGINT', sigintHandler)
    process.removeListener('SIGTERM', sigtermHandler)

    // Rethrow with better error message for port in use
    if (e instanceof Error && e.message.includes('EADDRINUSE')) {
      throw new Error(`Port ${options.port} is already in use (EADDRINUSE)`)
    }
    throw e
  }

  return controller
}
