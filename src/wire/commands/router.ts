/**
 * Command Router
 *
 * Dispatches incoming commands to their handlers
 */

import type { Document } from 'bson'
import type { CommandHandler, CommandContext, CommandResult } from './types.js'
import { errorResponse, ErrorCode } from './types.js'
import type { MondoBackend } from '../backend/interface.js'
import {
  HelloCommand,
  PingCommand,
  BuildInfoCommand,
  HostInfoCommand,
  WhatsmyuriCommand,
  GetLogCommand,
  GetParameterCommand,
  GetCmdLineOptsCommand,
} from './hello.js'
import {
  ListDatabasesCommand,
  ListCollectionsCommand,
  CreateCommand,
  DropCommand,
  DropDatabaseCommand,
  CollStatsCommand,
  DbStatsCommand,
  ServerStatusCommand,
} from './admin.js'
import {
  FindCommand,
  InsertCommand,
  UpdateCommand,
  DeleteCommand,
  CountCommand,
  DistinctCommand,
  GetMoreCommand,
  KillCursorsCommand,
} from './crud.js'
import { AggregateCommand } from './aggregate.js'
import { ListIndexesCommand, CreateIndexesCommand, DropIndexesCommand } from './index.js'
import {
  SaslStartCommand,
  SaslContinueCommand,
  AuthenticateCommand,
  LogoutCommand,
  requiresAuthentication,
  type AuthCommandContext,
} from './auth.js'
import { ScramAuthenticator, type CredentialsProvider } from '../auth/scram.js'
import type { ConnectionState } from '../types.js'

/** Router configuration options */
export interface RouterOptions {
  /** Enable authentication requirement */
  authEnabled?: boolean
  /** Credentials provider for authentication */
  credentialsProvider?: CredentialsProvider
  /** Function to get connection state */
  getConnectionState?: (connectionId: number) => ConnectionState | undefined
  /** Function to update connection state after authentication */
  setConnectionAuthenticated?: (connectionId: number, username: string, db: string) => void
  /** Function to clear authentication */
  clearConnectionAuthentication?: (connectionId: number) => void
}

export class CommandRouter {
  private handlers: Map<string, CommandHandler>
  private authEnabled: boolean
  private authenticator?: ScramAuthenticator
  private getConnectionState?: (connectionId: number) => ConnectionState | undefined
  private setConnectionAuthenticated?: (connectionId: number, username: string, db: string) => void
  private clearConnectionAuthentication?: (connectionId: number) => void

  constructor(backend: MondoBackend, options: RouterOptions = {}) {
    this.authEnabled = options.authEnabled ?? false
    this.getConnectionState = options.getConnectionState
    this.setConnectionAuthenticated = options.setConnectionAuthenticated
    this.clearConnectionAuthentication = options.clearConnectionAuthentication

    // Initialize authenticator if credentials provider is given
    if (options.credentialsProvider) {
      this.authenticator = new ScramAuthenticator(options.credentialsProvider)
    }

    // Initialize all command handlers
    this.handlers = new Map<string, CommandHandler>([
      // Handshake & discovery
      ['hello', new HelloCommand()],
      ['ismaster', new HelloCommand()],
      ['isMaster', new HelloCommand()],

      // System info
      ['ping', new PingCommand()],
      ['buildInfo', new BuildInfoCommand()],
      ['buildinfo', new BuildInfoCommand()],
      ['hostInfo', new HostInfoCommand()],
      ['whatsmyuri', new WhatsmyuriCommand()],
      ['getLog', new GetLogCommand()],
      ['getParameter', new GetParameterCommand()],
      ['getCmdLineOpts', new GetCmdLineOptsCommand()],

      // Admin commands
      ['listDatabases', new ListDatabasesCommand(backend)],
      ['listCollections', new ListCollectionsCommand(backend)],
      ['create', new CreateCommand(backend)],
      ['drop', new DropCommand(backend)],
      ['dropDatabase', new DropDatabaseCommand(backend)],
      ['collStats', new CollStatsCommand(backend)],
      ['dbStats', new DbStatsCommand(backend)],
      ['serverStatus', new ServerStatusCommand(backend)],

      // CRUD
      ['find', new FindCommand(backend)],
      ['insert', new InsertCommand(backend)],
      ['update', new UpdateCommand(backend)],
      ['delete', new DeleteCommand(backend)],
      ['count', new CountCommand(backend)],
      ['distinct', new DistinctCommand(backend)],
      ['getMore', new GetMoreCommand(backend)],
      ['killCursors', new KillCursorsCommand(backend)],

      // Aggregation
      ['aggregate', new AggregateCommand(backend)],

      // Indexes
      ['listIndexes', new ListIndexesCommand(backend)],
      ['createIndexes', new CreateIndexesCommand(backend)],
      ['dropIndexes', new DropIndexesCommand(backend)],
    ])

    // Register authentication commands if authenticator is available
    if (this.authenticator) {
      this.handlers.set('saslStart', new SaslStartCommand(this.authenticator))
      this.handlers.set('saslContinue', new SaslContinueCommand(this.authenticator))
    }

    // Always register authenticate and logout (even if auth not fully enabled)
    this.handlers.set('authenticate', new AuthenticateCommand())
    if (this.clearConnectionAuthentication) {
      this.handlers.set('logout', new LogoutCommand(this.clearConnectionAuthentication))
    }
  }

  /**
   * Route a command to its handler
   */
  async route(command: Document, context: CommandContext): Promise<CommandResult> {
    // Get the command name (first key in the document)
    const commandName = Object.keys(command).find((key) => !key.startsWith('$'))

    if (!commandName) {
      return {
        response: errorResponse(
          ErrorCode.COMMAND_NOT_FOUND,
          'no command found in request'
        ),
      }
    }

    // Check authentication if enabled
    if (this.authEnabled && requiresAuthentication(commandName)) {
      const connState = this.getConnectionState?.(context.connectionId)
      if (!connState?.authenticated) {
        return {
          response: errorResponse(
            ErrorCode.UNAUTHORIZED,
            `command ${commandName} requires authentication`
          ),
        }
      }
    }

    const handler = this.handlers.get(commandName)

    if (!handler) {
      // Check for case-insensitive match
      const lowerName = commandName.toLowerCase()
      for (const [name, h] of this.handlers) {
        if (name.toLowerCase() === lowerName) {
          return this.executeHandler(h, command, context, commandName)
        }
      }

      return {
        response: errorResponse(
          ErrorCode.COMMAND_NOT_FOUND,
          `no such command: '${commandName}'`
        ),
      }
    }

    return this.executeHandler(handler, command, context, commandName)
  }

  private async executeHandler(
    handler: CommandHandler,
    command: Document,
    context: CommandContext,
    commandName: string
  ): Promise<CommandResult> {
    try {
      // For auth commands, extend context with setAuthenticated callback
      if (commandName === 'saslStart' || commandName === 'saslContinue') {
        const authContext: AuthCommandContext = {
          ...context,
          setAuthenticated: (username: string, db: string) => {
            this.setConnectionAuthenticated?.(context.connectionId, username, db)
          },
        }
        return await handler.execute(command, authContext)
      }

      return await handler.execute(command, context)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`Error executing command '${commandName}':`, message)

      return {
        response: errorResponse(ErrorCode.INTERNAL_ERROR, message),
      }
    }
  }

  /**
   * Check if a command exists
   */
  hasCommand(name: string): boolean {
    return this.handlers.has(name)
  }

  /**
   * Register a new command handler
   */
  registerCommand(name: string, handler: CommandHandler): void {
    this.handlers.set(name, handler)
  }
}
