/**
 * MongoDB Wire Protocol Server
 *
 * TCP server that speaks the MongoDB wire protocol.
 * Can run locally with Bun for development/Compass support.
 */

import type { Socket, ServerWebSocket } from 'bun'
import { parseMessage, extractCommand, serializeOpMsg, serializeOpReply } from './message.js'
import { CommandRouter } from './commands/router.js'
import type { MondoBackend } from './backend/interface.js'
import type { ConnectionState, OpQueryMessage, OpMsgMessage } from './types.js'
import { OpCode } from './types.js'
import { requiresAuthentication, UNAUTHENTICATED_COMMANDS } from './commands/auth.js'
import { ScramAuthenticator, InMemoryCredentialsProvider } from './auth/scram.js'
import { SaslStartCommand, SaslContinueCommand, LogoutCommand } from './commands/auth.js'

/** TLS configuration options for secure connections */
export interface TlsOptions {
  /**
   * Private key in PEM format.
   * Can be a string path, Buffer, or Bun.file()
   */
  key: string | Buffer | ReturnType<typeof Bun.file>
  /**
   * Certificate chain in PEM format.
   * Can be a string path, Buffer, or Bun.file()
   */
  cert: string | Buffer | ReturnType<typeof Bun.file>
  /**
   * Optionally override the trusted CA certificates.
   * Default is to trust well-known CAs curated by Mozilla.
   */
  ca?: string | Buffer | ReturnType<typeof Bun.file> | Array<string | Buffer | ReturnType<typeof Bun.file>>
  /**
   * Passphrase for encrypted private key
   */
  passphrase?: string
  /**
   * Request a certificate from clients (mutual TLS)
   * Default: false
   */
  requestCert?: boolean
  /**
   * Reject connections from clients with invalid/untrusted certificates
   * Only has effect when requestCert is true
   * Default: true
   */
  rejectUnauthorized?: boolean
  /**
   * Minimum TLS version to allow
   * Default: 'TLSv1.2'
   */
  minVersion?: 'TLSv1' | 'TLSv1.1' | 'TLSv1.2' | 'TLSv1.3'
  /**
   * Maximum TLS version to allow
   * Default: 'TLSv1.3'
   */
  maxVersion?: 'TLSv1' | 'TLSv1.1' | 'TLSv1.2' | 'TLSv1.3'
  /**
   * Server name for SNI (Server Name Indication)
   */
  serverName?: string
  /**
   * ALPN protocols to advertise
   */
  ALPNProtocols?: string[]
}

/** Authentication configuration options */
export interface AuthOptions {
  /** Enable authentication (default: false for local development) */
  enabled: boolean
  /** Username for SCRAM-SHA-256 authentication */
  username: string
  /** Password for SCRAM-SHA-256 authentication */
  password: string
}

/** Server configuration options */
export interface ServerOptions {
  /** Port to listen on (default: 27017) */
  port?: number
  /** Host to bind to (default: 'localhost') */
  host?: string
  /** Enable verbose logging */
  verbose?: boolean
  /**
   * TLS configuration for secure connections.
   * When provided, the server will use TLS/SSL.
   * If not provided, the server runs without encryption (for local development).
   */
  tls?: TlsOptions
  /**
   * SECURITY: Authentication configuration
   * When enabled, clients must authenticate before executing most commands
   */
  auth?: AuthOptions
}

const DEFAULT_OPTIONS: ServerOptions = {
  port: 27017,
  host: 'localhost',
  verbose: false,
}

/**
 * Wire Protocol Server
 *
 * Handles TCP connections and dispatches commands to the router.
 * SECURITY: Supports optional authentication via SCRAM-SHA-256.
 */
export class WireProtocolServer {
  private options: Required<ServerOptions>
  private router: CommandRouter
  private connections: Map<number, ConnectionState> = new Map()
  private nextConnectionId = 1
  private nextRequestId = 1
  private server: ReturnType<typeof Bun.listen> | null = null
  private authenticator: ScramAuthenticator | null = null

  constructor(backend: MondoBackend, options: ServerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options } as Required<ServerOptions>
    this.router = new CommandRouter(backend)

    // SECURITY: Set up authentication if configured
    if (this.options.auth?.enabled) {
      const credentialsProvider = new InMemoryCredentialsProvider()
      // Add the configured user
      credentialsProvider.addUser(
        this.options.auth.username,
        this.options.auth.password,
        'admin' // Default auth database
      ).then(() => {
        console.log(`Authentication enabled for user: ${this.options.auth!.username}`)
      })

      this.authenticator = new ScramAuthenticator(credentialsProvider)

      // Register auth commands
      this.router.registerCommand('saslStart', new SaslStartCommand(this.authenticator))
      this.router.registerCommand('saslContinue', new SaslContinueCommand(this.authenticator))
      this.router.registerCommand('logout', new LogoutCommand((connId) => {
        const conn = this.connections.get(connId)
        if (conn) {
          conn.authenticated = false
        }
      }))
    }
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    const { port, host, verbose, tls } = this.options

    // Socket data type
    type SocketData = { connectionId: number; buffer: Buffer }

    // Socket handlers shared between TLS and non-TLS modes
    const socketHandlers = {
      open: (socket: Socket<SocketData>) => {
        const connectionId = this.nextConnectionId++
        socket.data = { connectionId, buffer: Buffer.alloc(0) }

        this.connections.set(connectionId, {
          id: connectionId,
          authenticated: false,
          compressionEnabled: false,
          cursors: new Map(),
        })

        if (verbose) {
          const connType = tls ? 'TLS connection' : 'Connection'
          console.log(`[${connectionId}] ${connType} opened`)
        }
      },

      data: async (socket: Socket<SocketData>, data: Buffer) => {
        const { connectionId } = socket.data

        // Accumulate data in buffer
        socket.data.buffer = Buffer.concat([socket.data.buffer, data])

        // Process complete messages
        await this.processBuffer(socket)
      },

      close: (socket: Socket<SocketData>) => {
        const { connectionId } = socket.data

        if (verbose) {
          console.log(`[${connectionId}] Connection closed`)
        }

        this.connections.delete(connectionId)
      },

      error: (socket: Socket<SocketData>, error: Error) => {
        const { connectionId } = socket.data
        console.error(`[${connectionId}] Socket error:`, error)
      },
    }

    // Start server with or without TLS
    if (tls) {
      // TLS mode
      this.server = Bun.listen<SocketData>({
        hostname: host,
        port,
        socket: socketHandlers,
        tls: this.buildTlsConfig(tls),
      })
      console.log(`MondoDB wire protocol server listening on TLS ${host}:${port}`)
    } else {
      // Non-TLS mode (default for local development)
      this.server = Bun.listen<SocketData>({
        hostname: host,
        port,
        socket: socketHandlers,
      })
      console.log(`MondoDB wire protocol server listening on TCP ${host}:${port}`)
    }
  }

  /**
   * Build TLS configuration object from TlsOptions
   */
  private buildTlsConfig(tlsOptions: TlsOptions): Record<string, any> {
    const config: Record<string, any> = {
      key: tlsOptions.key,
      cert: tlsOptions.cert,
    }

    // Add optional TLS settings
    if (tlsOptions.ca !== undefined) {
      config.ca = tlsOptions.ca
    }
    if (tlsOptions.passphrase !== undefined) {
      config.passphrase = tlsOptions.passphrase
    }
    if (tlsOptions.requestCert !== undefined) {
      config.requestCert = tlsOptions.requestCert
    }
    if (tlsOptions.rejectUnauthorized !== undefined) {
      config.rejectUnauthorized = tlsOptions.rejectUnauthorized
    }
    if (tlsOptions.minVersion !== undefined) {
      config.minVersion = tlsOptions.minVersion
    }
    if (tlsOptions.maxVersion !== undefined) {
      config.maxVersion = tlsOptions.maxVersion
    }
    if (tlsOptions.serverName !== undefined) {
      config.serverName = tlsOptions.serverName
    }
    if (tlsOptions.ALPNProtocols !== undefined) {
      config.ALPNProtocols = tlsOptions.ALPNProtocols
    }

    return config
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (this.server) {
      this.server.stop()
      this.server = null
      console.log('Server stopped')
    }
  }

  /**
   * Process accumulated buffer for complete messages
   */
  private async processBuffer(
    socket: Socket<{ connectionId: number; buffer: Buffer }>
  ): Promise<void> {
    const { connectionId, buffer } = socket.data

    // Need at least 4 bytes to read message length
    while (buffer.length >= 4) {
      const messageLength = buffer.readInt32LE(0)

      // Check if we have the complete message
      if (buffer.length < messageLength) {
        break
      }

      // Extract the complete message
      const messageBuffer = buffer.subarray(0, messageLength)
      socket.data.buffer = buffer.subarray(messageLength)

      try {
        const response = await this.handleMessage(connectionId, messageBuffer)
        if (response) {
          socket.write(response)
        }
      } catch (error) {
        console.error(`[${connectionId}] Error handling message:`, error)
        // Send error response
        const errorResponse = serializeOpMsg(
          this.nextRequestId++,
          messageBuffer.readInt32LE(4), // responseTo = requestID
          { ok: 0, errmsg: error instanceof Error ? error.message : 'Unknown error', code: 1 }
        )
        socket.write(errorResponse)
      }
    }
  }

  /**
   * Handle a single message
   */
  private async handleMessage(
    connectionId: number,
    buffer: Buffer
  ): Promise<Buffer | null> {
    const message = parseMessage(buffer)
    const { db, command, documentSequences } = extractCommand(message)

    const cmdName = Object.keys(command).find((k) => !k.startsWith('$'))

    if (this.options.verbose) {
      console.log(`[${connectionId}] ${cmdName} on ${db}`)
    }

    // SECURITY: Check authentication before executing most commands
    const connection = this.connections.get(connectionId)
    if (this.options.auth?.enabled && connection) {
      const isAuthRequired = requiresAuthentication(cmdName || '')

      if (isAuthRequired && !connection.authenticated) {
        // Return authentication error
        const errorResult = {
          ok: 0,
          errmsg: 'Authentication required. Use SCRAM-SHA-256 to authenticate.',
          code: 13, // Unauthorized
          codeName: 'Unauthorized',
        }

        if (message.header.opCode === OpCode.OP_QUERY) {
          return serializeOpReply(this.nextRequestId++, message.header.requestID, [errorResult])
        } else {
          return serializeOpMsg(this.nextRequestId++, message.header.requestID, errorResult)
        }
      }
    }

    // Execute the command
    const result = await this.router.route(command, {
      db,
      connectionId,
      requestId: message.header.requestID,
      documentSequences,
      // Pass auth info for SASL handlers
      auth: this.options.auth,
      connection,
    })

    // Check if this was a successful authentication
    if (cmdName === 'saslContinue' && result.response.ok === 1 && result.response.done === true) {
      if (connection) {
        connection.authenticated = true
      }
    }

    // Determine response format based on request format
    if (message.header.opCode === OpCode.OP_QUERY) {
      // Legacy OP_QUERY - respond with OP_REPLY
      return serializeOpReply(
        this.nextRequestId++,
        message.header.requestID,
        [result.response]
      )
    } else {
      // OP_MSG - respond with OP_MSG
      return serializeOpMsg(
        this.nextRequestId++,
        message.header.requestID,
        result.response
      )
    }
  }

  /**
   * Get server address info
   */
  get address(): { host: string; port: number; tls: boolean } {
    return {
      host: this.options.host,
      port: this.options.port,
      tls: this.isTls,
    }
  }

  /**
   * Check if server is using TLS
   */
  get isTls(): boolean {
    return this.options.tls !== undefined
  }

  /**
   * Get the MongoDB connection string for this server
   * Returns mongodb:// for non-TLS or mongodb+srv:// style for TLS
   */
  get connectionString(): string {
    const { host, port } = this.options
    const protocol = this.isTls ? 'mongodb+ssl' : 'mongodb'
    return `${protocol}://${host}:${port}`
  }
}

/**
 * Create and start a wire protocol server
 */
export async function createServer(
  backend: MondoBackend,
  options: ServerOptions = {}
): Promise<WireProtocolServer> {
  const server = new WireProtocolServer(backend, options)
  await server.start()
  return server
}
