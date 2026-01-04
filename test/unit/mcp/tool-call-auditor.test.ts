import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  ToolCallAuditor,
  ToolCallAuditEntry,
  AuditEventType,
  AuditLogLevel,
  AuditStorage,
  AuditFilter,
  AuditSummary,
} from '../../../src/mcp/tool-call-auditor'

describe('Tool Call Auditor', () => {
  let auditor: ToolCallAuditor
  let mockStorage: AuditStorage

  beforeEach(() => {
    mockStorage = {
      store: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      clear: vi.fn().mockResolvedValue(undefined),
    }
    auditor = new ToolCallAuditor({ storage: mockStorage })
  })

  describe('AuditEventType', () => {
    it('defines tool call lifecycle events', () => {
      const types: AuditEventType[] = ['invoke', 'success', 'error', 'timeout']
      expect(types).toContain('invoke')
      expect(types).toContain('success')
      expect(types).toContain('error')
      expect(types).toContain('timeout')
    })
  })

  describe('AuditLogLevel', () => {
    it('defines log severity levels', () => {
      const levels: AuditLogLevel[] = ['debug', 'info', 'warn', 'error']
      expect(levels).toContain('debug')
      expect(levels).toContain('info')
      expect(levels).toContain('warn')
      expect(levels).toContain('error')
    })
  })

  describe('ToolCallAuditEntry', () => {
    it('has required fields for tracking tool calls', () => {
      const entry: ToolCallAuditEntry = {
        id: 'audit_123',
        callId: 'call_456',
        tool: 'search',
        eventType: 'invoke',
        timestamp: new Date(),
        level: 'info',
      }

      expect(entry.id).toBe('audit_123')
      expect(entry.callId).toBe('call_456')
      expect(entry.tool).toBe('search')
      expect(entry.eventType).toBe('invoke')
      expect(entry.timestamp).toBeInstanceOf(Date)
      expect(entry.level).toBe('info')
    })

    it('supports optional inputs and outputs', () => {
      const entry: ToolCallAuditEntry = {
        id: 'audit_789',
        callId: 'call_101',
        tool: 'fetch',
        eventType: 'success',
        timestamp: new Date(),
        level: 'info',
        inputs: { url: 'https://example.com' },
        outputs: { content: 'Hello World' },
      }

      expect(entry.inputs).toEqual({ url: 'https://example.com' })
      expect(entry.outputs).toEqual({ content: 'Hello World' })
    })

    it('supports duration in milliseconds', () => {
      const entry: ToolCallAuditEntry = {
        id: 'audit_dur',
        callId: 'call_dur',
        tool: 'slow_tool',
        eventType: 'success',
        timestamp: new Date(),
        level: 'info',
        durationMs: 1500,
      }

      expect(entry.durationMs).toBe(1500)
    })

    it('supports error information', () => {
      const entry: ToolCallAuditEntry = {
        id: 'audit_err',
        callId: 'call_err',
        tool: 'failing_tool',
        eventType: 'error',
        timestamp: new Date(),
        level: 'error',
        error: {
          message: 'Connection refused',
          code: 'ECONNREFUSED',
          stack: 'Error: Connection refused\n  at ...',
        },
      }

      expect(entry.error?.message).toBe('Connection refused')
      expect(entry.error?.code).toBe('ECONNREFUSED')
      expect(entry.error?.stack).toContain('Connection refused')
    })

    it('supports metadata for additional context', () => {
      const entry: ToolCallAuditEntry = {
        id: 'audit_meta',
        callId: 'call_meta',
        tool: 'do',
        eventType: 'invoke',
        timestamp: new Date(),
        level: 'info',
        metadata: {
          sessionId: 'session_123',
          userId: 'user_456',
          requestId: 'req_789',
        },
      }

      expect(entry.metadata?.sessionId).toBe('session_123')
      expect(entry.metadata?.userId).toBe('user_456')
    })
  })

  describe('ToolCallAuditor', () => {
    describe('logInvoke', () => {
      it('logs tool invocation with inputs', async () => {
        await auditor.logInvoke('call_1', 'search', { query: 'test' })

        expect(mockStorage.store).toHaveBeenCalledTimes(1)
        const storedEntry = (mockStorage.store as any).mock.calls[0][0]
        expect(storedEntry.callId).toBe('call_1')
        expect(storedEntry.tool).toBe('search')
        expect(storedEntry.eventType).toBe('invoke')
        expect(storedEntry.inputs).toEqual({ query: 'test' })
        expect(storedEntry.level).toBe('info')
      })

      it('generates unique audit entry id', async () => {
        await auditor.logInvoke('call_1', 'search', {})
        await auditor.logInvoke('call_2', 'fetch', {})

        const entries = (mockStorage.store as any).mock.calls.map((call: any) => call[0])
        expect(entries[0].id).not.toBe(entries[1].id)
      })

      it('supports optional metadata', async () => {
        await auditor.logInvoke('call_1', 'search', { query: 'test' }, {
          sessionId: 'sess_123',
        })

        const storedEntry = (mockStorage.store as any).mock.calls[0][0]
        expect(storedEntry.metadata?.sessionId).toBe('sess_123')
      })
    })

    describe('logSuccess', () => {
      it('logs successful tool completion with outputs', async () => {
        await auditor.logSuccess('call_1', 'search', { results: [] }, 150)

        expect(mockStorage.store).toHaveBeenCalledTimes(1)
        const storedEntry = (mockStorage.store as any).mock.calls[0][0]
        expect(storedEntry.callId).toBe('call_1')
        expect(storedEntry.tool).toBe('search')
        expect(storedEntry.eventType).toBe('success')
        expect(storedEntry.outputs).toEqual({ results: [] })
        expect(storedEntry.durationMs).toBe(150)
      })
    })

    describe('logError', () => {
      it('logs tool call errors', async () => {
        const error = new Error('Tool failed')
        await auditor.logError('call_1', 'search', error, 50)

        expect(mockStorage.store).toHaveBeenCalledTimes(1)
        const storedEntry = (mockStorage.store as any).mock.calls[0][0]
        expect(storedEntry.callId).toBe('call_1')
        expect(storedEntry.tool).toBe('search')
        expect(storedEntry.eventType).toBe('error')
        expect(storedEntry.level).toBe('error')
        expect(storedEntry.error?.message).toBe('Tool failed')
        expect(storedEntry.durationMs).toBe(50)
      })

      it('captures error stack traces', async () => {
        const error = new Error('Stack trace test')
        await auditor.logError('call_1', 'search', error, 10)

        const storedEntry = (mockStorage.store as any).mock.calls[0][0]
        expect(storedEntry.error?.stack).toContain('Stack trace test')
      })
    })

    describe('logTimeout', () => {
      it('logs tool call timeouts', async () => {
        await auditor.logTimeout('call_1', 'slow_tool', 30000)

        expect(mockStorage.store).toHaveBeenCalledTimes(1)
        const storedEntry = (mockStorage.store as any).mock.calls[0][0]
        expect(storedEntry.callId).toBe('call_1')
        expect(storedEntry.tool).toBe('slow_tool')
        expect(storedEntry.eventType).toBe('timeout')
        expect(storedEntry.level).toBe('warn')
        expect(storedEntry.durationMs).toBe(30000)
      })
    })

    describe('query', () => {
      it('queries audit entries by filter', async () => {
        const mockEntries: ToolCallAuditEntry[] = [
          {
            id: 'audit_1',
            callId: 'call_1',
            tool: 'search',
            eventType: 'invoke',
            timestamp: new Date(),
            level: 'info',
          },
        ]
        ;(mockStorage.query as any).mockResolvedValue(mockEntries)

        const filter: AuditFilter = { tool: 'search' }
        const result = await auditor.query(filter)

        expect(mockStorage.query).toHaveBeenCalledWith(filter)
        expect(result).toEqual(mockEntries)
      })

      it('supports filtering by event type', async () => {
        const filter: AuditFilter = { eventType: 'error' }
        await auditor.query(filter)

        expect(mockStorage.query).toHaveBeenCalledWith(filter)
      })

      it('supports filtering by time range', async () => {
        const from = new Date('2024-01-01')
        const to = new Date('2024-01-31')
        const filter: AuditFilter = { from, to }
        await auditor.query(filter)

        expect(mockStorage.query).toHaveBeenCalledWith(filter)
      })

      it('supports filtering by level', async () => {
        const filter: AuditFilter = { level: 'error' }
        await auditor.query(filter)

        expect(mockStorage.query).toHaveBeenCalledWith(filter)
      })

      it('supports pagination with limit and offset', async () => {
        const filter: AuditFilter = { limit: 10, offset: 20 }
        await auditor.query(filter)

        expect(mockStorage.query).toHaveBeenCalledWith(filter)
      })
    })

    describe('getCallAuditTrail', () => {
      it('retrieves all audit entries for a specific call', async () => {
        const mockEntries: ToolCallAuditEntry[] = [
          {
            id: 'audit_1',
            callId: 'call_123',
            tool: 'search',
            eventType: 'invoke',
            timestamp: new Date('2024-01-01T10:00:00'),
            level: 'info',
          },
          {
            id: 'audit_2',
            callId: 'call_123',
            tool: 'search',
            eventType: 'success',
            timestamp: new Date('2024-01-01T10:00:01'),
            level: 'info',
          },
        ]
        ;(mockStorage.query as any).mockResolvedValue(mockEntries)

        const trail = await auditor.getCallAuditTrail('call_123')

        expect(mockStorage.query).toHaveBeenCalledWith({ callId: 'call_123' })
        expect(trail).toHaveLength(2)
      })
    })

    describe('getSummary', () => {
      it('returns summary statistics', async () => {
        ;(mockStorage.count as any)
          .mockResolvedValueOnce(100) // total
          .mockResolvedValueOnce(90)  // success
          .mockResolvedValueOnce(8)   // error
          .mockResolvedValueOnce(2)   // timeout

        const summary: AuditSummary = await auditor.getSummary()

        expect(summary.totalCalls).toBe(100)
        expect(summary.successCount).toBe(90)
        expect(summary.errorCount).toBe(8)
        expect(summary.timeoutCount).toBe(2)
      })

      it('supports filtering summary by time range', async () => {
        ;(mockStorage.count as any)
          .mockResolvedValueOnce(50)
          .mockResolvedValueOnce(45)
          .mockResolvedValueOnce(4)
          .mockResolvedValueOnce(1)

        const from = new Date('2024-01-01')
        const to = new Date('2024-01-31')
        const summary = await auditor.getSummary({ from, to })

        expect(mockStorage.count).toHaveBeenCalledWith({ eventType: 'invoke', from, to })
        expect(summary.totalCalls).toBe(50)
      })
    })

    describe('clear', () => {
      it('clears all audit entries', async () => {
        await auditor.clear()

        expect(mockStorage.clear).toHaveBeenCalled()
      })

      it('supports clearing entries older than a date', async () => {
        const before = new Date('2024-01-01')
        await auditor.clear({ before })

        expect(mockStorage.clear).toHaveBeenCalledWith({ before })
      })
    })

    describe('wrapTool', () => {
      it('wraps a tool function with automatic auditing', async () => {
        const mockTool = vi.fn().mockResolvedValue({ data: 'result' })
        const wrappedTool = auditor.wrapTool('test_tool', mockTool)

        const result = await wrappedTool({ input: 'value' })

        expect(result).toEqual({ data: 'result' })
        expect(mockTool).toHaveBeenCalledWith({ input: 'value' })
        expect(mockStorage.store).toHaveBeenCalledTimes(2) // invoke + success
      })

      it('logs error when wrapped tool throws', async () => {
        const mockTool = vi.fn().mockRejectedValue(new Error('Tool error'))
        const wrappedTool = auditor.wrapTool('failing_tool', mockTool)

        await expect(wrappedTool({ input: 'value' })).rejects.toThrow('Tool error')

        expect(mockStorage.store).toHaveBeenCalledTimes(2) // invoke + error
        const errorEntry = (mockStorage.store as any).mock.calls[1][0]
        expect(errorEntry.eventType).toBe('error')
        expect(errorEntry.error?.message).toBe('Tool error')
      })
    })
  })

  describe('AuditFilter', () => {
    it('supports multiple filter criteria', () => {
      const filter: AuditFilter = {
        tool: 'search',
        eventType: 'error',
        level: 'error',
        callId: 'call_123',
        from: new Date('2024-01-01'),
        to: new Date('2024-01-31'),
        limit: 100,
        offset: 0,
      }

      expect(filter.tool).toBe('search')
      expect(filter.eventType).toBe('error')
      expect(filter.level).toBe('error')
      expect(filter.callId).toBe('call_123')
      expect(filter.from).toBeInstanceOf(Date)
      expect(filter.to).toBeInstanceOf(Date)
      expect(filter.limit).toBe(100)
      expect(filter.offset).toBe(0)
    })

    it('all fields are optional', () => {
      const emptyFilter: AuditFilter = {}
      expect(emptyFilter.tool).toBeUndefined()
      expect(emptyFilter.eventType).toBeUndefined()
    })
  })

  describe('AuditStorage interface', () => {
    it('defines store method for persisting entries', async () => {
      const entry: ToolCallAuditEntry = {
        id: 'audit_1',
        callId: 'call_1',
        tool: 'test',
        eventType: 'invoke',
        timestamp: new Date(),
        level: 'info',
      }

      await mockStorage.store(entry)
      expect(mockStorage.store).toHaveBeenCalledWith(entry)
    })

    it('defines query method for retrieving entries', async () => {
      await mockStorage.query({ tool: 'test' })
      expect(mockStorage.query).toHaveBeenCalledWith({ tool: 'test' })
    })

    it('defines count method for counting entries', async () => {
      await mockStorage.count({ eventType: 'error' })
      expect(mockStorage.count).toHaveBeenCalledWith({ eventType: 'error' })
    })

    it('defines clear method for removing entries', async () => {
      await mockStorage.clear()
      expect(mockStorage.clear).toHaveBeenCalled()
    })
  })

  describe('Configuration', () => {
    it('supports log level threshold', async () => {
      const quietAuditor = new ToolCallAuditor({
        storage: mockStorage,
        minLevel: 'warn',
      })

      await quietAuditor.logInvoke('call_1', 'test', {})
      // Should not store because 'info' < 'warn'
      expect(mockStorage.store).not.toHaveBeenCalled()
    })

    it('supports input/output redaction', async () => {
      const redactingAuditor = new ToolCallAuditor({
        storage: mockStorage,
        redactInputs: true,
        redactOutputs: true,
      })

      await redactingAuditor.logInvoke('call_1', 'test', { secret: 'password' })
      await redactingAuditor.logSuccess('call_1', 'test', { data: 'sensitive' }, 100)

      const invokeEntry = (mockStorage.store as any).mock.calls[0][0]
      const successEntry = (mockStorage.store as any).mock.calls[1][0]

      expect(invokeEntry.inputs).toBe('[REDACTED]')
      expect(successEntry.outputs).toBe('[REDACTED]')
    })

    it('supports custom ID generator', async () => {
      let counter = 0
      const customAuditor = new ToolCallAuditor({
        storage: mockStorage,
        generateId: () => `custom_${++counter}`,
      })

      await customAuditor.logInvoke('call_1', 'test', {})
      await customAuditor.logInvoke('call_2', 'test', {})

      const entries = (mockStorage.store as any).mock.calls.map((call: any) => call[0])
      expect(entries[0].id).toBe('custom_1')
      expect(entries[1].id).toBe('custom_2')
    })

    it('supports enabling/disabling auditing', async () => {
      const disabledAuditor = new ToolCallAuditor({
        storage: mockStorage,
        enabled: false,
      })

      await disabledAuditor.logInvoke('call_1', 'test', {})
      expect(mockStorage.store).not.toHaveBeenCalled()
    })
  })
})
