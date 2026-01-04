/**
 * Authentication Commands
 *
 * saslStart, saslContinue - SCRAM-SHA-256 authentication
 */

import { Binary, type Document } from 'bson'
import type { CommandHandler, CommandContext, CommandResult } from './types.js'
import { successResponse, errorResponse, ErrorCode } from './types.js'
import type { ScramAuthenticator } from '../auth/scram.js'

/** Extended context with authentication state management */
export interface AuthCommandContext extends CommandContext {
  /** Set authenticated user after successful auth */
  setAuthenticated?: (username: string, db: string) => void
}

/**
 * saslStart command - begin SASL authentication
 *
 * Initiates SCRAM-SHA-256 authentication exchange.
 */
export class SaslStartCommand implements CommandHandler {
  constructor(private authenticator: ScramAuthenticator) {}

  async execute(command: Document, context: AuthCommandContext): Promise<CommandResult> {
    const mechanism = command.mechanism as string
    const payload = command.payload as Binary | Buffer | Uint8Array
    const options = command.options as Document | undefined

    if (!mechanism) {
      return {
        response: errorResponse(
          ErrorCode.BAD_VALUE,
          'saslStart requires mechanism field'
        ),
      }
    }

    if (!payload) {
      return {
        response: errorResponse(
          ErrorCode.BAD_VALUE,
          'saslStart requires payload field'
        ),
      }
    }

    // Determine auth database (default to $external for X.509, otherwise the $db)
    let authDb = context.db
    if (options?.authdb) {
      authDb = options.authdb as string
    }

    const result = await this.authenticator.saslStart(mechanism, payload, authDb)

    if (!result.success) {
      return {
        response: errorResponse(
          ErrorCode.AUTHENTICATION_FAILED,
          result.error || 'Authentication failed'
        ),
      }
    }

    return {
      response: successResponse({
        conversationId: result.conversationId,
        payload: new Binary(result.payload!),
        done: result.done,
      }),
    }
  }
}

/**
 * saslContinue command - continue SASL authentication
 *
 * Continues SCRAM-SHA-256 authentication exchange.
 */
export class SaslContinueCommand implements CommandHandler {
  constructor(private authenticator: ScramAuthenticator) {}

  async execute(command: Document, context: AuthCommandContext): Promise<CommandResult> {
    const conversationId = command.conversationId as number
    const payload = command.payload as Binary | Buffer | Uint8Array

    if (conversationId === undefined || conversationId === null) {
      return {
        response: errorResponse(
          ErrorCode.BAD_VALUE,
          'saslContinue requires conversationId field'
        ),
      }
    }

    if (!payload) {
      return {
        response: errorResponse(
          ErrorCode.BAD_VALUE,
          'saslContinue requires payload field'
        ),
      }
    }

    const result = await this.authenticator.saslContinue(conversationId, payload)

    if (!result.success) {
      return {
        response: errorResponse(
          ErrorCode.AUTHENTICATION_FAILED,
          result.error || 'Authentication failed'
        ),
      }
    }

    // If authentication completed successfully, update connection state
    if (result.done) {
      const user = this.authenticator.getConversationUser(conversationId)
      if (user && context.setAuthenticated) {
        context.setAuthenticated(user.username, user.db)
      }
      // Clean up conversation
      this.authenticator.cleanupConversation(conversationId)
    }

    return {
      response: successResponse({
        conversationId: result.conversationId,
        payload: new Binary(result.payload!),
        done: result.done,
      }),
    }
  }
}

/**
 * authenticate command - legacy authentication (deprecated but needed for compat)
 *
 * Modern drivers use SASL, but some tools may still use this.
 */
export class AuthenticateCommand implements CommandHandler {
  async execute(command: Document, _context: CommandContext): Promise<CommandResult> {
    // The legacy authenticate command is deprecated
    // Direct clients to use SASL authentication
    return {
      response: errorResponse(
        ErrorCode.AUTHENTICATION_FAILED,
        'Legacy authenticate command is not supported. Use SCRAM-SHA-256 via saslStart/saslContinue.'
      ),
    }
  }
}

/**
 * logout command - clear authentication state
 */
export class LogoutCommand implements CommandHandler {
  constructor(
    private clearAuthentication: (connectionId: number) => void
  ) {}

  async execute(_command: Document, context: CommandContext): Promise<CommandResult> {
    this.clearAuthentication(context.connectionId)
    return {
      response: successResponse({
        // MongoDB returns ok: 1 for logout
      }),
    }
  }
}

/**
 * Commands that should be allowed without authentication
 */
export const UNAUTHENTICATED_COMMANDS = new Set([
  // Handshake commands
  'hello',
  'ismaster',
  'isMaster',
  'buildInfo',
  'buildinfo',

  // Authentication commands
  'saslStart',
  'saslContinue',
  'authenticate',
  'logout',

  // Basic connectivity
  'ping',
  'whatsmyuri',

  // Required for driver initialization
  'getParameter',
  'getCmdLineOpts',
])

/**
 * Check if a command requires authentication
 */
export function requiresAuthentication(commandName: string): boolean {
  return !UNAUTHENTICATED_COMMANDS.has(commandName)
}
