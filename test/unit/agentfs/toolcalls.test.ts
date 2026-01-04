import { describe, it, expect, beforeEach, vi } from 'vitest'
// These imports will fail initially - RED phase
import {
  ToolCallAuditLog,
  createInMemoryAuditBackend,
  type ToolCallEntry,
  type AuditBackend,
  type AuditQueryOptions,
  type TimeRange,
  ImmutableEntryError,
} from '../../../src/agentfs/toolcalls'

/**
 * Create a mock database backend that stores tool call entries in memory
 */
function createMockDb(): AuditBackend {
  const entries = new Map<string, ToolCallEntry>()
  let sequence = 0

  return {
    append: async (entry: Omit<ToolCallEntry, 'id' | 'timestamp'>) => {
      sequence++
      const id = `tc_${sequence}_${Date.now()}`
      const timestamp = new Date()
      const fullEntry: ToolCallEntry = { ...entry, id, timestamp }
      entries.set(id, fullEntry)
      return id
    },

    findById: async (id: string) => {
      return entries.get(id) || null
    },

    list: async (options?: AuditQueryOptions) => {
      let results = Array.from(entries.values())

      // Sort by timestamp (oldest first by default)
      results.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

      // Apply pagination
      const offset = options?.offset ?? 0
      const limit = options?.limit ?? results.length
      return results.slice(offset, offset + limit)
    },

    findByTool: async (toolName: string) => {
      return Array.from(entries.values()).filter(e => e.tool === toolName)
    },

    findByTimeRange: async (start: Date, end: Date) => {
      return Array.from(entries.values()).filter(
        e => e.timestamp >= start && e.timestamp <= end
      )
    },

    count: async () => entries.size,

    // These should throw - audit logs are immutable
    update: async () => {
      throw new ImmutableEntryError('Cannot update audit log entries')
    },

    delete: async () => {
      throw new ImmutableEntryError('Cannot delete audit log entries')
    },
  }
}

describe('AgentFS ToolCalls (Audit Log)', () => {
  let auditLog: ToolCallAuditLog
  let mockDb: AuditBackend

  beforeEach(() => {
    mockDb = createMockDb()
    auditLog = new ToolCallAuditLog(mockDb)
  })

  describe('ToolCallEntry structure', () => {
    it('has required fields: id, tool, inputs, outputs, timestamp', () => {
      const entry: ToolCallEntry = {
        id: 'tc_123',
        tool: 'read_file',
        inputs: { path: '/src/index.ts' },
        outputs: { content: 'export {}', success: true },
        timestamp: new Date(),
      }

      expect(entry.id).toBe('tc_123')
      expect(entry.tool).toBe('read_file')
      expect(entry.inputs).toEqual({ path: '/src/index.ts' })
      expect(entry.outputs).toEqual({ content: 'export {}', success: true })
      expect(entry.timestamp).toBeInstanceOf(Date)
    })

    it('supports optional duration field', () => {
      const entry: ToolCallEntry = {
        id: 'tc_456',
        tool: 'bash',
        inputs: { command: 'npm install' },
        outputs: { stdout: 'done', exitCode: 0 },
        timestamp: new Date(),
        durationMs: 1500,
      }

      expect(entry.durationMs).toBe(1500)
    })

    it('supports optional metadata field', () => {
      const entry: ToolCallEntry = {
        id: 'tc_789',
        tool: 'write_file',
        inputs: { path: '/test.txt', content: 'hello' },
        outputs: { success: true },
        timestamp: new Date(),
        metadata: {
          sessionId: 'session_abc',
          conversationId: 'conv_123',
          toolVersion: '1.0.0',
        },
      }

      expect(entry.metadata?.sessionId).toBe('session_abc')
      expect(entry.metadata?.conversationId).toBe('conv_123')
    })

    it('is append-only (no updatedAt or deletedAt fields)', () => {
      const entry: ToolCallEntry = {
        id: 'tc_immutable',
        tool: 'glob',
        inputs: { pattern: '**/*.ts' },
        outputs: { files: ['/src/index.ts'] },
        timestamp: new Date(),
      }

      // ToolCallEntry should NOT have mutation-related fields
      expect(entry).not.toHaveProperty('updatedAt')
      expect(entry).not.toHaveProperty('deletedAt')
      expect(entry).not.toHaveProperty('modifiedAt')
    })
  })

  describe('record', () => {
    it('creates immutable entry with tool, inputs, and outputs', async () => {
      const id = await auditLog.record('read_file', { path: '/test.txt' }, { content: 'hello' })

      expect(id).toBeDefined()
      expect(typeof id).toBe('string')

      const entry = await auditLog.findById(id)
      expect(entry).not.toBeNull()
      expect(entry?.tool).toBe('read_file')
      expect(entry?.inputs).toEqual({ path: '/test.txt' })
      expect(entry?.outputs).toEqual({ content: 'hello' })
    })

    it('automatically adds timestamp', async () => {
      const before = new Date()
      const id = await auditLog.record('bash', { command: 'ls' }, { stdout: 'file.txt' })
      const after = new Date()

      const entry = await auditLog.findById(id)
      expect(entry?.timestamp).toBeInstanceOf(Date)
      expect(entry!.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(entry!.timestamp.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it('calculates duration if start/end times provided', async () => {
      const startTime = new Date('2024-01-01T10:00:00.000Z')
      const endTime = new Date('2024-01-01T10:00:01.500Z') // 1.5 seconds later

      const id = await auditLog.record(
        'slow_operation',
        { data: 'input' },
        { result: 'output' },
        { startTime, endTime }
      )

      const entry = await auditLog.findById(id)
      expect(entry?.durationMs).toBe(1500)
    })

    it('returns unique ID for each entry', async () => {
      const id1 = await auditLog.record('tool1', {}, {})
      const id2 = await auditLog.record('tool1', {}, {})
      const id3 = await auditLog.record('tool2', {}, {})

      expect(id1).not.toBe(id2)
      expect(id2).not.toBe(id3)
      expect(id1).not.toBe(id3)
    })

    it('stores complex nested inputs and outputs', async () => {
      const complexInputs = {
        query: { $match: { status: 'active' } },
        options: { limit: 10, skip: 0, projection: { name: 1 } },
        nested: { deep: { value: [1, 2, 3] } },
      }

      const complexOutputs = {
        results: [{ id: 1, name: 'Item 1' }, { id: 2, name: 'Item 2' }],
        metadata: { totalCount: 100, executionTime: 50 },
      }

      const id = await auditLog.record('aggregate', complexInputs, complexOutputs)
      const entry = await auditLog.findById(id)

      expect(entry?.inputs).toEqual(complexInputs)
      expect(entry?.outputs).toEqual(complexOutputs)
    })

    it('stores error outputs correctly', async () => {
      const errorOutput = {
        success: false,
        error: {
          message: 'File not found',
          code: 'ENOENT',
          path: '/nonexistent.txt',
        },
      }

      const id = await auditLog.record('read_file', { path: '/nonexistent.txt' }, errorOutput)
      const entry = await auditLog.findById(id)

      expect(entry?.outputs.success).toBe(false)
      expect(entry?.outputs.error.code).toBe('ENOENT')
    })

    it('accepts optional metadata', async () => {
      const metadata = {
        sessionId: 'sess_123',
        requestId: 'req_456',
        userId: 'user_789',
      }

      const id = await auditLog.record(
        'search',
        { query: 'test' },
        { results: [] },
        { metadata }
      )

      const entry = await auditLog.findById(id)
      expect(entry?.metadata).toEqual(metadata)
    })
  })

  describe('querying', () => {
    beforeEach(async () => {
      // Seed with test data
      await auditLog.record('read_file', { path: '/a.txt' }, { content: 'a' })
      await auditLog.record('write_file', { path: '/b.txt', content: 'b' }, { success: true })
      await auditLog.record('read_file', { path: '/c.txt' }, { content: 'c' })
      await auditLog.record('bash', { command: 'ls' }, { stdout: 'files' })
      await auditLog.record('read_file', { path: '/d.txt' }, { content: 'd' })
    })

    describe('list', () => {
      it('returns all entries when no options provided', async () => {
        const entries = await auditLog.list()
        expect(entries).toHaveLength(5)
      })

      it('supports pagination with limit', async () => {
        const entries = await auditLog.list({ limit: 2 })
        expect(entries).toHaveLength(2)
      })

      it('supports pagination with offset', async () => {
        const allEntries = await auditLog.list()
        const offsetEntries = await auditLog.list({ offset: 2 })

        expect(offsetEntries).toHaveLength(3)
        expect(offsetEntries[0].id).toBe(allEntries[2].id)
      })

      it('supports combined limit and offset', async () => {
        const allEntries = await auditLog.list()
        const paginatedEntries = await auditLog.list({ limit: 2, offset: 1 })

        expect(paginatedEntries).toHaveLength(2)
        expect(paginatedEntries[0].id).toBe(allEntries[1].id)
        expect(paginatedEntries[1].id).toBe(allEntries[2].id)
      })

      it('returns entries in chronological order by default', async () => {
        const entries = await auditLog.list()
        for (let i = 1; i < entries.length; i++) {
          expect(entries[i].timestamp.getTime()).toBeGreaterThanOrEqual(
            entries[i - 1].timestamp.getTime()
          )
        }
      })

      it('returns empty array when offset exceeds count', async () => {
        const entries = await auditLog.list({ offset: 100 })
        expect(entries).toEqual([])
      })
    })

    describe('findByTool', () => {
      it('filters entries by tool name', async () => {
        const entries = await auditLog.findByTool('read_file')
        expect(entries).toHaveLength(3)
        expect(entries.every(e => e.tool === 'read_file')).toBe(true)
      })

      it('returns empty array for non-existent tool', async () => {
        const entries = await auditLog.findByTool('nonexistent_tool')
        expect(entries).toEqual([])
      })

      it('is case-sensitive', async () => {
        const entries = await auditLog.findByTool('READ_FILE')
        expect(entries).toEqual([])
      })
    })

    describe('findByTimeRange', () => {
      it('filters entries within time range', async () => {
        const allEntries = await auditLog.list()
        const start = allEntries[1].timestamp
        const end = allEntries[3].timestamp

        const rangeEntries = await auditLog.findByTimeRange(start, end)
        expect(rangeEntries.length).toBeGreaterThanOrEqual(2)
        expect(rangeEntries.every(e =>
          e.timestamp >= start && e.timestamp <= end
        )).toBe(true)
      })

      it('returns empty array for range with no entries', async () => {
        const futureStart = new Date('2099-01-01')
        const futureEnd = new Date('2099-12-31')

        const entries = await auditLog.findByTimeRange(futureStart, futureEnd)
        expect(entries).toEqual([])
      })

      it('includes entries at exact boundary times', async () => {
        const allEntries = await auditLog.list()
        const exactTime = allEntries[2].timestamp

        const entries = await auditLog.findByTimeRange(exactTime, exactTime)
        expect(entries.some(e => e.id === allEntries[2].id)).toBe(true)
      })
    })

    describe('count', () => {
      it('returns total count of entries', async () => {
        const count = await auditLog.count()
        expect(count).toBe(5)
      })

      it('returns 0 for empty log', async () => {
        const emptyLog = new ToolCallAuditLog(createMockDb())
        const count = await emptyLog.count()
        expect(count).toBe(0)
      })

      it('updates after new entries', async () => {
        const countBefore = await auditLog.count()
        await auditLog.record('new_tool', {}, {})
        const countAfter = await auditLog.count()

        expect(countAfter).toBe(countBefore + 1)
      })
    })

    describe('findById', () => {
      it('returns entry by ID', async () => {
        const id = await auditLog.record('test_tool', { input: 1 }, { output: 2 })
        const entry = await auditLog.findById(id)

        expect(entry).not.toBeNull()
        expect(entry?.id).toBe(id)
        expect(entry?.tool).toBe('test_tool')
      })

      it('returns null for non-existent ID', async () => {
        const entry = await auditLog.findById('nonexistent_id')
        expect(entry).toBeNull()
      })

      it('returns null for empty string ID', async () => {
        const entry = await auditLog.findById('')
        expect(entry).toBeNull()
      })
    })
  })

  describe('immutability (CRITICAL)', () => {
    it('throws ImmutableEntryError on update attempt', async () => {
      const id = await auditLog.record('test', { input: 1 }, { output: 1 })

      await expect(
        auditLog.update(id, { outputs: { output: 2 } })
      ).rejects.toThrow(ImmutableEntryError)

      await expect(
        auditLog.update(id, { outputs: { output: 2 } })
      ).rejects.toThrow('Cannot update audit log entries')

      // Verify original entry is unchanged
      const entry = await auditLog.findById(id)
      expect(entry?.outputs).toEqual({ output: 1 })
    })

    it('throws ImmutableEntryError on delete attempt', async () => {
      const id = await auditLog.record('test', { input: 1 }, { output: 1 })

      await expect(auditLog.delete(id)).rejects.toThrow(ImmutableEntryError)
      await expect(auditLog.delete(id)).rejects.toThrow('Cannot delete audit log entries')

      // Verify entry still exists
      const entry = await auditLog.findById(id)
      expect(entry).not.toBeNull()
    })

    it('throws ImmutableEntryError on bulk delete attempt', async () => {
      await auditLog.record('test1', {}, {})
      await auditLog.record('test2', {}, {})

      await expect(auditLog.deleteMany({ tool: 'test1' })).rejects.toThrow(ImmutableEntryError)

      // Verify entries still exist
      const count = await auditLog.count()
      expect(count).toBe(2)
    })

    it('throws ImmutableEntryError on clear attempt', async () => {
      await auditLog.record('test1', {}, {})
      await auditLog.record('test2', {}, {})

      await expect(auditLog.clear()).rejects.toThrow(ImmutableEntryError)

      // Verify entries still exist
      const count = await auditLog.count()
      expect(count).toBe(2)
    })

    it('timestamps are monotonically increasing', async () => {
      const ids: string[] = []

      for (let i = 0; i < 10; i++) {
        const id = await auditLog.record(`tool_${i}`, { i }, { i })
        ids.push(id)
      }

      const entries = await Promise.all(ids.map(id => auditLog.findById(id)))

      for (let i = 1; i < entries.length; i++) {
        expect(entries[i]!.timestamp.getTime()).toBeGreaterThanOrEqual(
          entries[i - 1]!.timestamp.getTime()
        )
      }
    })

    it('entry fields cannot be mutated after retrieval', async () => {
      const id = await auditLog.record('test', { input: 'original' }, { output: 'original' })

      const entry = await auditLog.findById(id)

      // Attempt to mutate the retrieved entry
      if (entry) {
        entry.inputs = { input: 'mutated' }
        entry.outputs = { output: 'mutated' }
      }

      // Fetch again - should still have original values
      const freshEntry = await auditLog.findById(id)
      expect(freshEntry?.inputs).toEqual({ input: 'original' })
      expect(freshEntry?.outputs).toEqual({ output: 'original' })
    })

    it('ImmutableEntryError has correct error type', async () => {
      const id = await auditLog.record('test', {}, {})

      try {
        await auditLog.update(id, {})
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(ImmutableEntryError)
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).name).toBe('ImmutableEntryError')
      }
    })
  })

  describe('advanced querying', () => {
    beforeEach(async () => {
      // Create entries with specific timestamps for testing
      const baseTime = new Date('2024-06-01T10:00:00Z')

      for (let i = 0; i < 20; i++) {
        const timestamp = new Date(baseTime.getTime() + i * 60000) // 1 minute apart
        await auditLog.record(
          i % 2 === 0 ? 'read_file' : 'write_file',
          { index: i, path: `/file${i}.txt` },
          { success: true, index: i },
          { metadata: { batch: Math.floor(i / 5) } }
        )
      }
    })

    it('supports filtering by multiple criteria', async () => {
      const entries = await auditLog.findByTool('read_file')
      expect(entries).toHaveLength(10) // Every other entry
    })

    it('handles large result sets with pagination', async () => {
      const page1 = await auditLog.list({ limit: 5, offset: 0 })
      const page2 = await auditLog.list({ limit: 5, offset: 5 })
      const page3 = await auditLog.list({ limit: 5, offset: 10 })
      const page4 = await auditLog.list({ limit: 5, offset: 15 })

      expect(page1).toHaveLength(5)
      expect(page2).toHaveLength(5)
      expect(page3).toHaveLength(5)
      expect(page4).toHaveLength(5)

      // Verify no overlap between pages
      const allIds = new Set([
        ...page1.map(e => e.id),
        ...page2.map(e => e.id),
        ...page3.map(e => e.id),
        ...page4.map(e => e.id),
      ])
      expect(allIds.size).toBe(20)
    })
  })

  describe('error handling', () => {
    it('handles null inputs gracefully', async () => {
      const id = await auditLog.record('tool', null as any, { output: 1 })
      const entry = await auditLog.findById(id)
      expect(entry?.inputs).toBeNull()
    })

    it('handles undefined outputs gracefully', async () => {
      const id = await auditLog.record('tool', { input: 1 }, undefined as any)
      const entry = await auditLog.findById(id)
      expect(entry?.outputs).toBeUndefined()
    })

    it('handles empty tool name', async () => {
      const id = await auditLog.record('', { input: 1 }, { output: 1 })
      const entry = await auditLog.findById(id)
      expect(entry?.tool).toBe('')
    })

    it('handles special characters in tool name', async () => {
      const toolName = 'tool:with/special\\chars.and[brackets]'
      const id = await auditLog.record(toolName, {}, {})
      const entry = await auditLog.findById(id)
      expect(entry?.tool).toBe(toolName)

      const found = await auditLog.findByTool(toolName)
      expect(found).toHaveLength(1)
    })
  })

  describe('concurrent operations', () => {
    it('handles concurrent record operations', async () => {
      const promises = Array.from({ length: 50 }, (_, i) =>
        auditLog.record(`tool_${i}`, { i }, { i })
      )

      const ids = await Promise.all(promises)
      expect(new Set(ids).size).toBe(50) // All unique IDs

      const count = await auditLog.count()
      expect(count).toBe(50)
    })

    it('handles concurrent read and write operations', async () => {
      const writes = Array.from({ length: 10 }, (_, i) =>
        auditLog.record(`tool_${i}`, { i }, { i })
      )

      const reads = Array.from({ length: 10 }, () => auditLog.count())

      await Promise.all([...writes, ...reads])

      const finalCount = await auditLog.count()
      expect(finalCount).toBe(10)
    })
  })

  describe('createInMemoryAuditBackend', () => {
    it('creates an isolated backend instance', async () => {
      const backend1 = createInMemoryAuditBackend()
      const backend2 = createInMemoryAuditBackend()

      const log1 = new ToolCallAuditLog(backend1)
      const log2 = new ToolCallAuditLog(backend2)

      await log1.record('tool1', {}, {})
      await log2.record('tool2', {}, {})
      await log2.record('tool3', {}, {})

      expect(await log1.count()).toBe(1)
      expect(await log2.count()).toBe(2)
    })

    it('returns compliant AuditBackend interface', () => {
      const backend = createInMemoryAuditBackend()

      expect(typeof backend.append).toBe('function')
      expect(typeof backend.findById).toBe('function')
      expect(typeof backend.list).toBe('function')
      expect(typeof backend.findByTool).toBe('function')
      expect(typeof backend.findByTimeRange).toBe('function')
      expect(typeof backend.count).toBe('function')
      expect(typeof backend.update).toBe('function')
      expect(typeof backend.delete).toBe('function')
    })
  })

  describe('statistics and analytics', () => {
    beforeEach(async () => {
      // Seed with varied data
      for (let i = 0; i < 10; i++) {
        await auditLog.record('read_file', {}, { success: true })
      }
      for (let i = 0; i < 5; i++) {
        await auditLog.record('write_file', {}, { success: true })
      }
      for (let i = 0; i < 3; i++) {
        await auditLog.record('bash', {}, { success: false, error: 'failed' })
      }
    })

    it('can compute tool call frequency', async () => {
      const readCalls = await auditLog.findByTool('read_file')
      const writeCalls = await auditLog.findByTool('write_file')
      const bashCalls = await auditLog.findByTool('bash')

      expect(readCalls).toHaveLength(10)
      expect(writeCalls).toHaveLength(5)
      expect(bashCalls).toHaveLength(3)
    })

    it('total count matches sum of individual tool counts', async () => {
      const total = await auditLog.count()
      const readCount = (await auditLog.findByTool('read_file')).length
      const writeCount = (await auditLog.findByTool('write_file')).length
      const bashCount = (await auditLog.findByTool('bash')).length

      expect(total).toBe(readCount + writeCount + bashCount)
    })
  })
})
