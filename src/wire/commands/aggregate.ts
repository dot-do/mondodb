/**
 * Aggregate Command
 *
 * Handles MongoDB aggregation pipeline execution
 */

import { Long, type Document } from 'bson'
import type { CommandHandler, CommandContext, CommandResult } from './types.js'
import { successResponse, errorResponse, ErrorCode } from './types.js'
import type { MondoBackend } from '../backend/interface.js'

export class AggregateCommand implements CommandHandler {
  constructor(private backend: MondoBackend) {}

  async execute(command: Document, context: CommandContext): Promise<CommandResult> {
    const collection = command.aggregate as string
    if (!collection || typeof collection !== 'string') {
      // Could be aggregating on database (e.g., $listLocalSessions)
      // For now, require collection name
      return {
        response: errorResponse(ErrorCode.BAD_VALUE, 'aggregate requires a collection name'),
      }
    }

    const pipeline = command.pipeline as Document[]
    if (!pipeline || !Array.isArray(pipeline)) {
      return {
        response: errorResponse(ErrorCode.BAD_VALUE, 'aggregate requires a pipeline array'),
      }
    }

    // Check for special system aggregations
    if (collection === '1' || collection === 1) {
      // Database-level aggregation commands
      return this.handleDatabaseAggregation(pipeline, context)
    }

    // Extract options
    const batchSize = (command.cursor?.batchSize as number) || 101
    const allowDiskUse = command.allowDiskUse as boolean

    // Check for $out or $merge stages (not returning a cursor)
    const lastStage = pipeline[pipeline.length - 1]
    const hasOutputStage = lastStage && ('$out' in lastStage || '$merge' in lastStage)

    try {
      const result = await this.backend.aggregate(context.db, collection, pipeline, {
        batchSize,
        allowDiskUse,
      })

      if (hasOutputStage) {
        // For $out/$merge, return success without cursor
        return {
          response: successResponse(),
        }
      }

      return {
        response: successResponse({
          cursor: {
            id: Long.fromBigInt(result.cursorId),
            ns: `${context.db}.${collection}`,
            firstBatch: result.documents,
          },
        }),
      }
    } catch (error) {
      return {
        response: errorResponse(
          ErrorCode.INTERNAL_ERROR,
          error instanceof Error ? error.message : 'Aggregation failed'
        ),
      }
    }
  }

  private async handleDatabaseAggregation(
    pipeline: Document[],
    context: CommandContext
  ): Promise<CommandResult> {
    // Handle database-level aggregation stages
    const firstStage = pipeline[0]

    if (firstStage && '$listLocalSessions' in firstStage) {
      // Return empty sessions list
      return {
        response: successResponse({
          cursor: {
            id: Long.ZERO,
            ns: `${context.db}.$cmd.aggregate`,
            firstBatch: [],
          },
        }),
      }
    }

    if (firstStage && '$currentOp' in firstStage) {
      // Return empty operations list
      return {
        response: successResponse({
          cursor: {
            id: Long.ZERO,
            ns: `${context.db}.$cmd.aggregate`,
            firstBatch: [],
          },
        }),
      }
    }

    return {
      response: errorResponse(
        ErrorCode.COMMAND_NOT_FOUND,
        'Database-level aggregation not supported'
      ),
    }
  }
}
