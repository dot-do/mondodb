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

/** Server configuration options */
export interface ServerOptions {
  /** Port to listen on (default: 27017) */
  port?: number
  /** Host to bind to (default: 'localhost') */
  host?: string
  /** Enable verbose logging */
  verbose?: boolean
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
 */
export class WireProtocolServer {
  private options: Required<ServerOptions>
  private router: CommandRouter
  private connections: Map<number, ConnectionState> = new Map()
  private nextConnectionId = 1
  private nextRequestId = 1
  private server: ReturnType<typeof Bun.listen> | null = null

  constructor(backend: MondoBackend, options: ServerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options } as Required<ServerOptions>
    this.router = new CommandRouter(backend)
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    const { port, host, verbose } = this.options

    this.server = Bun.listen<{ connectionId: number; buffer: Buffer }>({
      hostname: host,
      port,
      socket: {
        open: (socket) => {
          const connectionId = this.nextConnectionId++
          socket.data = { connectionId, buffer: Buffer.alloc(0) }

          this.connections.set(connectionId, {
            id: connectionId,
            authenticated: false,
            compressionEnabled: false,
            cursors: new Map(),
          })

          if (verbose) {
            console.log(`[${connectionId}] Connection opened`)
          }
        },

        data: async (socket, data) => {
          const { connectionId } = socket.data

          // Accumulate data in buffer
          socket.data.buffer = Buffer.concat([socket.data.buffer, data])

          // Process complete messages
          await this.processBuffer(socket)
        },

        close: (socket) => {
          const { connectionId } = socket.data

          if (verbose) {
            console.log(`[${connectionId}] Connection closed`)
          }

          this.connections.delete(connectionId)
        },

        error: (socket, error) => {
          const { connectionId } = socket.data
          console.error(`[${connectionId}] Socket error:`, error)
        },
      },
    })

    console.log(`MondoDB wire protocol server listening on ${host}:${port}`)
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

    if (this.options.verbose) {
      const cmdName = Object.keys(command).find((k) => !k.startsWith('$'))
      console.log(`[${connectionId}] ${cmdName} on ${db}`)
    }

    // Execute the command
    const result = await this.router.route(command, {
      db,
      connectionId,
      requestId: message.header.requestID,
      documentSequences,
    })

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
  get address(): { host: string; port: number } {
    return {
      host: this.options.host,
      port: this.options.port,
    }
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
