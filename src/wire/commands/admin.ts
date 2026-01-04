/**
 * Admin Commands
 *
 * Database and collection management commands
 */

import type { Document } from 'bson'
import type { CommandHandler, CommandContext, CommandResult } from './types.js'
import { successResponse, errorResponse, ErrorCode } from './types.js'
import type { MondoBackend } from '../backend/interface.js'

export class ListDatabasesCommand implements CommandHandler {
  constructor(private backend: MondoBackend) {}

  async execute(command: Document, _context: CommandContext): Promise<CommandResult> {
    const databases = await this.backend.listDatabases()

    // Apply nameOnly filter if requested
    const nameOnly = command.nameOnly === true

    // Apply filter if provided
    let filteredDbs = databases
    if (command.filter && typeof command.filter === 'object') {
      const filter = command.filter as Document
      if (filter.name) {
        if (typeof filter.name === 'string') {
          filteredDbs = databases.filter((db) => db.name === filter.name)
        } else if (filter.name.$regex) {
          const regex = new RegExp(filter.name.$regex, filter.name.$options)
          filteredDbs = databases.filter((db) => regex.test(db.name))
        }
      }
    }

    const totalSize = filteredDbs.reduce((sum, db) => sum + db.sizeOnDisk, 0)

    if (nameOnly) {
      return {
        response: successResponse({
          databases: filteredDbs.map((db) => ({ name: db.name })),
        }),
      }
    }

    return {
      response: successResponse({
        databases: filteredDbs,
        totalSize,
        totalSizeMb: totalSize / (1024 * 1024),
      }),
    }
  }
}

export class ListCollectionsCommand implements CommandHandler {
  constructor(private backend: MondoBackend) {}

  async execute(command: Document, context: CommandContext): Promise<CommandResult> {
    const db = context.db
    const filter = command.filter as Document | undefined
    const nameOnly = command.nameOnly === true

    const collections = await this.backend.listCollections(db, filter)

    if (nameOnly) {
      return {
        response: successResponse({
          cursor: {
            id: 0n,
            ns: `${db}.$cmd.listCollections`,
            firstBatch: collections.map((c) => ({ name: c.name, type: c.type })),
          },
        }),
      }
    }

    return {
      response: successResponse({
        cursor: {
          id: 0n,
          ns: `${db}.$cmd.listCollections`,
          firstBatch: collections,
        },
      }),
    }
  }
}

export class CreateCommand implements CommandHandler {
  constructor(private backend: MondoBackend) {}

  async execute(command: Document, context: CommandContext): Promise<CommandResult> {
    const collectionName = command.create as string
    if (!collectionName || typeof collectionName !== 'string') {
      return {
        response: errorResponse(ErrorCode.BAD_VALUE, 'create requires a string collection name'),
      }
    }

    // Extract options
    const options: Document = {}
    if (command.capped) options.capped = command.capped
    if (command.size) options.size = command.size
    if (command.max) options.max = command.max
    if (command.validator) options.validator = command.validator
    if (command.validationLevel) options.validationLevel = command.validationLevel
    if (command.validationAction) options.validationAction = command.validationAction

    await this.backend.createCollection(context.db, collectionName, options)

    return { response: successResponse() }
  }
}

export class DropCommand implements CommandHandler {
  constructor(private backend: MondoBackend) {}

  async execute(command: Document, context: CommandContext): Promise<CommandResult> {
    const collectionName = command.drop as string
    if (!collectionName || typeof collectionName !== 'string') {
      return {
        response: errorResponse(ErrorCode.BAD_VALUE, 'drop requires a string collection name'),
      }
    }

    const exists = await this.backend.collectionExists(context.db, collectionName)
    if (!exists) {
      return {
        response: errorResponse(
          ErrorCode.NAMESPACE_NOT_FOUND,
          `ns not found: ${context.db}.${collectionName}`
        ),
      }
    }

    await this.backend.dropCollection(context.db, collectionName)

    return {
      response: successResponse({
        nIndexesWas: 1,
        ns: `${context.db}.${collectionName}`,
      }),
    }
  }
}

export class DropDatabaseCommand implements CommandHandler {
  constructor(private backend: MondoBackend) {}

  async execute(_command: Document, context: CommandContext): Promise<CommandResult> {
    await this.backend.dropDatabase(context.db)

    return {
      response: successResponse({
        dropped: context.db,
      }),
    }
  }
}

export class CollStatsCommand implements CommandHandler {
  constructor(private backend: MondoBackend) {}

  async execute(command: Document, context: CommandContext): Promise<CommandResult> {
    const collectionName = command.collStats as string
    if (!collectionName || typeof collectionName !== 'string') {
      return {
        response: errorResponse(ErrorCode.BAD_VALUE, 'collStats requires a collection name'),
      }
    }

    const exists = await this.backend.collectionExists(context.db, collectionName)
    if (!exists) {
      return {
        response: errorResponse(
          ErrorCode.NAMESPACE_NOT_FOUND,
          `Collection [${context.db}.${collectionName}] not found`
        ),
      }
    }

    const stats = await this.backend.collStats(context.db, collectionName)

    return {
      response: successResponse({
        ...stats,
        wiredTiger: {}, // Empty for SQLite
        indexDetails: {},
        scaleFactor: 1,
      }),
    }
  }
}

export class DbStatsCommand implements CommandHandler {
  constructor(private backend: MondoBackend) {}

  async execute(command: Document, context: CommandContext): Promise<CommandResult> {
    const scale = typeof command.scale === 'number' ? command.scale : 1
    const stats = await this.backend.dbStats(context.db)

    return {
      response: successResponse({
        db: stats.db,
        collections: stats.collections,
        views: stats.views,
        objects: stats.objects,
        avgObjSize: stats.avgObjSize,
        dataSize: stats.dataSize / scale,
        storageSize: stats.storageSize / scale,
        indexes: stats.indexes,
        indexSize: stats.indexSize / scale,
        totalSize: (stats.dataSize + stats.indexSize) / scale,
        scaleFactor: scale,
        fsUsedSize: stats.storageSize / scale,
        fsTotalSize: stats.storageSize * 10 / scale, // Estimate
      }),
    }
  }
}

export class ServerStatusCommand implements CommandHandler {
  private startTime = new Date()

  constructor(private backend: MondoBackend) {}

  async execute(_command: Document, _context: CommandContext): Promise<CommandResult> {
    const now = new Date()
    const uptimeSeconds = Math.floor((now.getTime() - this.startTime.getTime()) / 1000)

    return {
      response: successResponse({
        host: 'mondodb-server',
        version: '6.0.0-mondodb',
        process: 'mondodb-server',
        pid: process.pid || 1,
        uptime: uptimeSeconds,
        uptimeMillis: uptimeSeconds * 1000,
        uptimeEstimate: uptimeSeconds,
        localTime: now,

        connections: {
          current: 1,
          available: 100,
          totalCreated: 1,
          active: 1,
        },

        opcounters: {
          insert: 0,
          query: 0,
          update: 0,
          delete: 0,
          getmore: 0,
          command: 0,
        },

        mem: {
          bits: 64,
          resident: 50,
          virtual: 100,
          supported: true,
        },

        storageEngine: {
          name: 'sqlite',
          supportsCommittedReads: true,
          oldestRequiredTimestampForCrashRecovery: null,
          supportsPendingDrops: false,
          dropPendingIdents: 0,
          supportsSnapshotReadConcern: true,
          readOnly: false,
          persistent: true,
          backupCursorOpen: false,
        },

        asserts: {
          regular: 0,
          warning: 0,
          msg: 0,
          user: 0,
          tripwire: 0,
          rollovers: 0,
        },

        network: {
          bytesIn: 0,
          bytesOut: 0,
          numRequests: 0,
        },
      }),
    }
  }
}
