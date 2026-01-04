/**
 * CRUD Commands
 *
 * find, insert, update, delete, count, distinct, getMore, killCursors
 */

import { Long, type Document } from 'bson'
import type { CommandHandler, CommandContext, CommandResult } from './types.js'
import { successResponse, errorResponse, ErrorCode } from './types.js'
import type { MondoBackend, FindOptions } from '../backend/interface.js'

export class FindCommand implements CommandHandler {
  constructor(private backend: MondoBackend) {}

  async execute(command: Document, context: CommandContext): Promise<CommandResult> {
    const collection = command.find as string
    if (!collection || typeof collection !== 'string') {
      return {
        response: errorResponse(ErrorCode.BAD_VALUE, 'find requires a collection name'),
      }
    }

    const options: FindOptions = {
      filter: command.filter as Document,
      projection: command.projection as Document,
      sort: command.sort as Document,
      limit: command.limit as number,
      skip: command.skip as number,
      batchSize: command.batchSize as number || 101,
      hint: command.hint as Document | string,
      collation: command.collation as Document,
      allowDiskUse: command.allowDiskUse as boolean,
    }

    // Handle singleBatch option
    if (command.singleBatch === true) {
      options.batchSize = options.limit || 1000000
    }

    const result = await this.backend.find(context.db, collection, options)

    return {
      response: successResponse({
        cursor: {
          id: Long.fromBigInt(result.cursorId),
          ns: `${context.db}.${collection}`,
          firstBatch: result.documents,
        },
      }),
    }
  }
}

export class InsertCommand implements CommandHandler {
  constructor(private backend: MondoBackend) {}

  async execute(command: Document, context: CommandContext): Promise<CommandResult> {
    const collection = command.insert as string
    if (!collection || typeof collection !== 'string') {
      return {
        response: errorResponse(ErrorCode.BAD_VALUE, 'insert requires a collection name'),
      }
    }

    // Get documents from command or from document sequence
    let documents = command.documents as Document[]
    if (!documents && context.documentSequences.has('documents')) {
      documents = context.documentSequences.get('documents')!
    }

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return {
        response: errorResponse(ErrorCode.BAD_VALUE, 'insert requires documents array'),
      }
    }

    const ordered = command.ordered !== false

    try {
      const result = await this.backend.insertMany(context.db, collection, documents)

      return {
        response: successResponse({
          n: result.insertedCount,
        }),
      }
    } catch (error) {
      if (ordered) {
        return {
          response: errorResponse(
            ErrorCode.INTERNAL_ERROR,
            error instanceof Error ? error.message : 'Insert failed'
          ),
        }
      }
      // For unordered, we would need to track partial success
      throw error
    }
  }
}

export class UpdateCommand implements CommandHandler {
  constructor(private backend: MondoBackend) {}

  async execute(command: Document, context: CommandContext): Promise<CommandResult> {
    const collection = command.update as string
    if (!collection || typeof collection !== 'string') {
      return {
        response: errorResponse(ErrorCode.BAD_VALUE, 'update requires a collection name'),
      }
    }

    // Get updates from command or document sequence
    let updates = command.updates as Document[]
    if (!updates && context.documentSequences.has('updates')) {
      updates = context.documentSequences.get('updates')!
    }

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return {
        response: errorResponse(ErrorCode.BAD_VALUE, 'update requires updates array'),
      }
    }

    let totalMatched = 0
    let totalModified = 0
    let upserted: Array<{ index: number; _id: unknown }> = []

    for (let i = 0; i < updates.length; i++) {
      const op = updates[i] as Document
      const filter = op?.q as Document
      const update = op?.u as Document
      const multi = op?.multi === true
      const upsert = op?.upsert === true
      const arrayFilters = op?.arrayFilters as Document[]

      const result = multi
        ? await this.backend.updateMany(context.db, collection, filter, update, {
            upsert,
            arrayFilters,
          })
        : await this.backend.updateOne(context.db, collection, filter, update, {
            upsert,
            arrayFilters,
          })

      totalMatched += result.matchedCount
      totalModified += result.modifiedCount

      if (result.upsertedId !== undefined) {
        upserted.push({ index: i, _id: result.upsertedId })
      }
    }

    const response: Document = {
      n: totalMatched,
      nModified: totalModified,
      ok: 1,
    }

    if (upserted.length > 0) {
      response.upserted = upserted
    }

    return { response }
  }
}

export class DeleteCommand implements CommandHandler {
  constructor(private backend: MondoBackend) {}

  async execute(command: Document, context: CommandContext): Promise<CommandResult> {
    const collection = command.delete as string
    if (!collection || typeof collection !== 'string') {
      return {
        response: errorResponse(ErrorCode.BAD_VALUE, 'delete requires a collection name'),
      }
    }

    // Get deletes from command or document sequence
    let deletes = command.deletes as Document[]
    if (!deletes && context.documentSequences.has('deletes')) {
      deletes = context.documentSequences.get('deletes')!
    }

    if (!deletes || !Array.isArray(deletes) || deletes.length === 0) {
      return {
        response: errorResponse(ErrorCode.BAD_VALUE, 'delete requires deletes array'),
      }
    }

    let totalDeleted = 0

    for (const op of deletes) {
      const filter = op.q as Document
      const limit = op.limit as number // 0 = deleteMany, 1 = deleteOne

      const result =
        limit === 0 || limit === undefined
          ? await this.backend.deleteMany(context.db, collection, filter)
          : await this.backend.deleteOne(context.db, collection, filter)

      totalDeleted += result.deletedCount
    }

    return {
      response: successResponse({
        n: totalDeleted,
      }),
    }
  }
}

export class CountCommand implements CommandHandler {
  constructor(private backend: MondoBackend) {}

  async execute(command: Document, context: CommandContext): Promise<CommandResult> {
    const collection = command.count as string
    if (!collection || typeof collection !== 'string') {
      return {
        response: errorResponse(ErrorCode.BAD_VALUE, 'count requires a collection name'),
      }
    }

    const query = command.query as Document | undefined
    const count = await this.backend.count(context.db, collection, query)

    // Apply skip and limit if provided
    let adjustedCount = count
    if (command.skip && typeof command.skip === 'number') {
      adjustedCount = Math.max(0, adjustedCount - command.skip)
    }
    if (command.limit && typeof command.limit === 'number' && command.limit > 0) {
      adjustedCount = Math.min(adjustedCount, command.limit)
    }

    return {
      response: successResponse({
        n: adjustedCount,
      }),
    }
  }
}

export class DistinctCommand implements CommandHandler {
  constructor(private backend: MondoBackend) {}

  async execute(command: Document, context: CommandContext): Promise<CommandResult> {
    const collection = command.distinct as string
    if (!collection || typeof collection !== 'string') {
      return {
        response: errorResponse(ErrorCode.BAD_VALUE, 'distinct requires a collection name'),
      }
    }

    const key = command.key as string
    if (!key || typeof key !== 'string') {
      return {
        response: errorResponse(ErrorCode.BAD_VALUE, 'distinct requires a key field'),
      }
    }

    const query = command.query as Document | undefined
    const values = await this.backend.distinct(context.db, collection, key, query)

    return {
      response: successResponse({
        values,
      }),
    }
  }
}

export class GetMoreCommand implements CommandHandler {
  constructor(private backend: MondoBackend) {}

  async execute(command: Document, context: CommandContext): Promise<CommandResult> {
    const cursorId = command.getMore
    const collection = command.collection as string
    const batchSize = (command.batchSize as number) || 101

    if (cursorId === undefined) {
      return {
        response: errorResponse(ErrorCode.BAD_VALUE, 'getMore requires a cursor id'),
      }
    }

    // Convert to bigint
    let cursorBigInt: bigint
    if (typeof cursorId === 'bigint') {
      cursorBigInt = cursorId
    } else if (cursorId instanceof Long) {
      cursorBigInt = cursorId.toBigInt()
    } else {
      cursorBigInt = BigInt(cursorId)
    }

    const cursor = this.backend.getCursor(cursorBigInt)
    if (!cursor) {
      return {
        response: errorResponse(
          ErrorCode.NAMESPACE_NOT_FOUND,
          `cursor id ${cursorId} not found`
        ),
      }
    }

    const documents = this.backend.advanceCursor(cursorBigInt, batchSize)
    const updatedCursor = this.backend.getCursor(cursorBigInt)
    const hasMore = updatedCursor ? updatedCursor.position < updatedCursor.documents.length : false

    // If no more documents, close the cursor
    if (!hasMore) {
      this.backend.closeCursor(cursorBigInt)
    }

    return {
      response: successResponse({
        cursor: {
          id: hasMore ? Long.fromBigInt(cursorBigInt) : Long.ZERO,
          ns: `${context.db}.${collection}`,
          nextBatch: documents,
        },
      }),
    }
  }
}

export class KillCursorsCommand implements CommandHandler {
  constructor(private backend: MondoBackend) {}

  async execute(command: Document, _context: CommandContext): Promise<CommandResult> {
    const cursors = command.cursors as (Long | bigint | number)[]

    if (!cursors || !Array.isArray(cursors)) {
      return {
        response: errorResponse(ErrorCode.BAD_VALUE, 'killCursors requires cursors array'),
      }
    }

    const cursorsKilled: Long[] = []
    const cursorsNotFound: Long[] = []
    const cursorsAlive: Long[] = []
    const cursorsUnknown: Long[] = []

    for (const cursorId of cursors) {
      let cursorBigInt: bigint
      if (typeof cursorId === 'bigint') {
        cursorBigInt = cursorId
      } else if (cursorId instanceof Long) {
        cursorBigInt = cursorId.toBigInt()
      } else {
        cursorBigInt = BigInt(cursorId)
      }

      const killed = this.backend.closeCursor(cursorBigInt)
      const longId = Long.fromBigInt(cursorBigInt)

      if (killed) {
        cursorsKilled.push(longId)
      } else {
        cursorsNotFound.push(longId)
      }
    }

    return {
      response: successResponse({
        cursorsKilled,
        cursorsNotFound,
        cursorsAlive,
        cursorsUnknown,
      }),
    }
  }
}
