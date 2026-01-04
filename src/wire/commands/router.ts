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

export class CommandRouter {
  private handlers: Map<string, CommandHandler>

  constructor(private backend: MondoBackend) {
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
