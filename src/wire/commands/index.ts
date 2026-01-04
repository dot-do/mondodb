/**
 * Index Commands
 *
 * listIndexes, createIndexes, dropIndexes
 */

import { Long, type Document } from 'bson'
import type { CommandHandler, CommandContext, CommandResult } from './types.js'
import { successResponse, errorResponse, ErrorCode } from './types.js'
import type { MondoBackend, IndexSpec } from '../backend/interface.js'

export class ListIndexesCommand implements CommandHandler {
  constructor(private backend: MondoBackend) {}

  async execute(command: Document, context: CommandContext): Promise<CommandResult> {
    const collection = command.listIndexes as string
    if (!collection || typeof collection !== 'string') {
      return {
        response: errorResponse(ErrorCode.BAD_VALUE, 'listIndexes requires a collection name'),
      }
    }

    const exists = await this.backend.collectionExists(context.db, collection)
    if (!exists) {
      return {
        response: errorResponse(
          ErrorCode.NAMESPACE_NOT_FOUND,
          `ns not found: ${context.db}.${collection}`
        ),
      }
    }

    const indexes = await this.backend.listIndexes(context.db, collection)

    return {
      response: successResponse({
        cursor: {
          id: Long.ZERO,
          ns: `${context.db}.${collection}`,
          firstBatch: indexes,
        },
      }),
    }
  }
}

export class CreateIndexesCommand implements CommandHandler {
  constructor(private backend: MondoBackend) {}

  async execute(command: Document, context: CommandContext): Promise<CommandResult> {
    const collection = command.createIndexes as string
    if (!collection || typeof collection !== 'string') {
      return {
        response: errorResponse(ErrorCode.BAD_VALUE, 'createIndexes requires a collection name'),
      }
    }

    const indexes = command.indexes as Document[]
    if (!indexes || !Array.isArray(indexes) || indexes.length === 0) {
      return {
        response: errorResponse(ErrorCode.BAD_VALUE, 'createIndexes requires indexes array'),
      }
    }

    // Validate and convert index specifications
    const indexSpecs: IndexSpec[] = indexes.map((idx) => ({
      key: idx.key as Document,
      name: idx.name as string,
      unique: idx.unique as boolean,
      sparse: idx.sparse as boolean,
      background: idx.background as boolean,
      expireAfterSeconds: idx.expireAfterSeconds as number,
      partialFilterExpression: idx.partialFilterExpression as Document,
    }))

    // Get existing indexes for comparison
    let existingIndexes: string[] = []
    try {
      const existing = await this.backend.listIndexes(context.db, collection)
      existingIndexes = existing.map((idx) => idx.name)
    } catch {
      // Collection might not exist yet
    }

    const createdNames = await this.backend.createIndexes(context.db, collection, indexSpecs)

    // Count how many are new vs existing
    const numIndexesBefore = existingIndexes.length
    const numIndexesAfter = numIndexesBefore + createdNames.length

    return {
      response: successResponse({
        numIndexesBefore,
        numIndexesAfter,
        createdCollectionAutomatically: false,
        note: createdNames.length > 0 ? undefined : 'all indexes already exist',
      }),
    }
  }
}

export class DropIndexesCommand implements CommandHandler {
  constructor(private backend: MondoBackend) {}

  async execute(command: Document, context: CommandContext): Promise<CommandResult> {
    const collection = command.dropIndexes as string
    if (!collection || typeof collection !== 'string') {
      return {
        response: errorResponse(ErrorCode.BAD_VALUE, 'dropIndexes requires a collection name'),
      }
    }

    const index = command.index as string | string[] | Document

    if (index === '*') {
      // Drop all indexes except _id
      await this.backend.dropIndexes(context.db, collection)
      return {
        response: successResponse({
          msg: 'non-_id indexes dropped',
        }),
      }
    }

    if (typeof index === 'string') {
      // Drop by name
      if (index === '_id_') {
        return {
          response: errorResponse(
            ErrorCode.ILLEGAL_OPERATION,
            'cannot drop _id index'
          ),
        }
      }

      await this.backend.dropIndex(context.db, collection, index)
      return {
        response: successResponse({
          nIndexesWas: 1,
        }),
      }
    }

    if (Array.isArray(index)) {
      // Drop multiple by name
      for (const name of index) {
        if (name === '_id_') continue
        await this.backend.dropIndex(context.db, collection, name)
      }
      return { response: successResponse() }
    }

    if (typeof index === 'object') {
      // Drop by key specification - would need to find matching index
      return {
        response: errorResponse(
          ErrorCode.BAD_VALUE,
          'dropping index by key specification not yet supported'
        ),
      }
    }

    return {
      response: errorResponse(ErrorCode.BAD_VALUE, 'invalid index specification'),
    }
  }
}
