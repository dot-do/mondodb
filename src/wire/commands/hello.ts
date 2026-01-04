/**
 * hello/isMaster command handler
 *
 * This is the first command clients send to discover server capabilities.
 * Critical for Compass and driver compatibility.
 */

import { ObjectId, Long, type Document } from 'bson'
import type { CommandHandler, CommandContext, CommandResult } from './types.js'
import { successResponse } from './types.js'
import { DEFAULT_CAPABILITIES } from '../types.js'

export class HelloCommand implements CommandHandler {
  private processId = new ObjectId()
  private counter = 0n

  async execute(command: Document, context: CommandContext): Promise<CommandResult> {
    const now = new Date()

    // Build base response matching MongoDB 6.0
    const response: Document = {
      // Primary fields
      ismaster: true,
      isWritablePrimary: true,

      // Topology version (changes when server state changes)
      topologyVersion: {
        processId: this.processId,
        counter: Long.fromBigInt(this.counter++),
      },

      // Size limits
      maxBsonObjectSize: DEFAULT_CAPABILITIES.maxBsonObjectSize,
      maxMessageSizeBytes: DEFAULT_CAPABILITIES.maxMessageSizeBytes,
      maxWriteBatchSize: DEFAULT_CAPABILITIES.maxWriteBatchSize,

      // Time
      localTime: now,

      // Session support
      logicalSessionTimeoutMinutes: DEFAULT_CAPABILITIES.logicalSessionTimeoutMinutes,

      // Connection info
      connectionId: context.connectionId,

      // Wire version (MongoDB 6.0 = 17)
      minWireVersion: DEFAULT_CAPABILITIES.minWireVersion,
      maxWireVersion: DEFAULT_CAPABILITIES.maxWireVersion,

      // Not read-only
      readOnly: DEFAULT_CAPABILITIES.readOnly,

      // Success
      ok: 1,
    }

    // If client supports hello command, indicate we do too
    if (command.hello || command.helloOk) {
      response.helloOk = true
    }

    // If client requested auth mechanisms for a user
    if (command.saslSupportedMechs) {
      // Support standard auth mechanisms
      response.saslSupportedMechs = ['SCRAM-SHA-256', 'SCRAM-SHA-1']
    }

    // If client is probing for compression
    if (command.compression && Array.isArray(command.compression)) {
      // We don't support compression yet, but acknowledge the request
      response.compression = []
    }

    // Add client info echo if provided (for debugging)
    if (command.client) {
      // Don't echo back, but we could log it
    }

    // Indicate this is not a mongos or replica set
    // (standalone server mode)

    return { response }
  }
}

export class PingCommand implements CommandHandler {
  async execute(_command: Document, _context: CommandContext): Promise<CommandResult> {
    return { response: successResponse() }
  }
}

export class BuildInfoCommand implements CommandHandler {
  async execute(_command: Document, _context: CommandContext): Promise<CommandResult> {
    const response = successResponse({
      version: '6.0.0-mondodb',
      gitVersion: 'mondodb-0.1.0',
      modules: [],
      allocator: 'system',
      javascriptEngine: 'none',
      sysInfo: 'mondodb-on-workers',
      versionArray: [6, 0, 0, 0],
      openssl: {
        running: 'not-applicable',
        compiled: 'not-applicable',
      },
      buildEnvironment: {
        target_os: 'cloudflare-workers',
        target_arch: 'wasm',
      },
      bits: 64,
      debug: false,
      maxBsonObjectSize: DEFAULT_CAPABILITIES.maxBsonObjectSize,
      storageEngines: ['sqlite'],
    })

    return { response }
  }
}

export class HostInfoCommand implements CommandHandler {
  async execute(_command: Document, _context: CommandContext): Promise<CommandResult> {
    const now = new Date()
    const response = successResponse({
      system: {
        currentTime: now,
        hostname: 'mondodb-server',
        cpuAddrSize: 64,
        memSizeMB: 512,
        memLimitMB: 512,
        numCores: 1,
        cpuArch: 'wasm',
        numaEnabled: false,
      },
      os: {
        type: 'cloudflare-workers',
        name: 'MondoDB',
        version: '0.1.0',
      },
      extra: {
        note: 'Running on Cloudflare Workers Durable Objects',
      },
    })

    return { response }
  }
}

export class WhatsmyuriCommand implements CommandHandler {
  async execute(_command: Document, _context: CommandContext): Promise<CommandResult> {
    // This command returns the client's IP address
    // In our case, we return localhost since we're running locally
    return {
      response: successResponse({
        you: '127.0.0.1:0',
      }),
    }
  }
}

export class GetLogCommand implements CommandHandler {
  async execute(command: Document, _context: CommandContext): Promise<CommandResult> {
    const logType = command.getLog

    if (logType === '*') {
      // Return available log types
      return {
        response: successResponse({
          names: ['global', 'startupWarnings'],
        }),
      }
    }

    if (logType === 'startupWarnings') {
      return {
        response: successResponse({
          totalLinesWritten: 1,
          log: [
            JSON.stringify({
              t: { $date: new Date().toISOString() },
              s: 'I',
              c: 'STORAGE',
              msg: 'MondoDB using SQLite storage engine',
            }),
          ],
        }),
      }
    }

    return {
      response: successResponse({
        totalLinesWritten: 0,
        log: [],
      }),
    }
  }
}

export class GetParameterCommand implements CommandHandler {
  async execute(command: Document, _context: CommandContext): Promise<CommandResult> {
    // Handle getParameter: '*' to return all parameters
    const param = command.getParameter

    const parameters: Document = {
      featureCompatibilityVersion: { version: '6.0' },
      authenticationMechanisms: ['SCRAM-SHA-256', 'SCRAM-SHA-1'],
    }

    if (param === '*') {
      return { response: successResponse(parameters) }
    }

    // Return specific parameter if requested
    if (typeof param === 'string' && param in parameters) {
      return {
        response: successResponse({
          [param]: parameters[param],
        }),
      }
    }

    return { response: successResponse({}) }
  }
}

export class GetCmdLineOptsCommand implements CommandHandler {
  async execute(_command: Document, _context: CommandContext): Promise<CommandResult> {
    return {
      response: successResponse({
        argv: ['mondodb-server'],
        parsed: {
          storage: {
            engine: 'sqlite',
          },
        },
      }),
    }
  }
}
