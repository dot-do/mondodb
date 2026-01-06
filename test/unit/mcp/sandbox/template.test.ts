import { describe, it, expect } from 'vitest'
import {
  generateSandboxCode,
  SANDBOX_TYPE_DEFINITIONS,
  validateUserCode,
  escapeUserCode,
  generateSafeSandboxCode,
  SandboxResult,
  ConsoleLogEntry,
  SandboxOptions,
} from '../../../../src/mcp/sandbox/template'

describe('Sandbox Code Template', () => {
  describe('generateSandboxCode', () => {
    it('generates valid JavaScript code', () => {
      const userCode = 'return 42'
      const code = generateSandboxCode(userCode)

      expect(code).toBeDefined()
      expect(typeof code).toBe('string')
      expect(code.length).toBeGreaterThan(0)
    })

    it('includes export default with evaluate method', () => {
      const code = generateSandboxCode('return 1')

      expect(code).toContain('export default')
      expect(code).toContain('async evaluate')
    })

    it('wraps user code in async IIFE', () => {
      const userCode = 'return await db.collection("users").find()'
      const code = generateSandboxCode(userCode)

      expect(code).toContain('(async () => {')
      expect(code).toContain(userCode)
    })

    it('captures console.log output', () => {
      const code = generateSandboxCode('console.log("test")')

      expect(code).toContain('const logs = []')
      expect(code).toContain('const originalConsole = {')
      expect(code).toContain('logs.push')
    })

    it('restores console.log after execution', () => {
      const code = generateSandboxCode('return 1')

      expect(code).toContain('console.log = originalConsole.log')
    })

    it('exposes db API with collection method', () => {
      const code = generateSandboxCode('return db.collection("test").find()')

      expect(code).toContain('const db = {')
      expect(code).toContain('collection: (name)')
    })

    it('routes db operations through DB_PROXY', () => {
      const code = generateSandboxCode('return 1')

      expect(code).toContain('env.DB_PROXY.find')
      expect(code).toContain('env.DB_PROXY.findOne')
      expect(code).toContain('env.DB_PROXY.insertOne')
      expect(code).toContain('env.DB_PROXY.insertMany')
      expect(code).toContain('env.DB_PROXY.updateOne')
      expect(code).toContain('env.DB_PROXY.updateMany')
      expect(code).toContain('env.DB_PROXY.deleteOne')
      expect(code).toContain('env.DB_PROXY.deleteMany')
      expect(code).toContain('env.DB_PROXY.aggregate')
      expect(code).toContain('env.DB_PROXY.countDocuments')
    })

    it('exposes listCollections and listDatabases', () => {
      const code = generateSandboxCode('return 1')

      expect(code).toContain('listCollections: () => env.DB_PROXY.listCollections()')
      expect(code).toContain('listDatabases: () => env.DB_PROXY.listDatabases()')
    })

    it('returns success result with value and logs', () => {
      const code = generateSandboxCode('return 42')

      expect(code).toContain('return { success: true, value: result, logs }')
    })

    it('handles errors gracefully', () => {
      const code = generateSandboxCode('throw new Error("test")')

      expect(code).toContain('catch (error)')
      expect(code).toContain('success: false')
      expect(code).toContain('error: formatError(error)')
    })

    it('preserves user code exactly as provided', () => {
      const userCode = 'const x = 1;\nconst y = 2;\nreturn x + y;'
      const code = generateSandboxCode(userCode)

      expect(code).toContain(userCode)
    })
  })

  describe('SANDBOX_TYPE_DEFINITIONS', () => {
    it('defines db type with collection method', () => {
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('declare const db')
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('collection(name: string)')
    })

    it('defines all collection methods', () => {
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('find(filter?: object): Promise<Document[]>')
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('findOne(filter?: object): Promise<Document | null>')
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('insertOne(doc: object): Promise<{ insertedId: string }>')
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('insertMany(docs: object[]): Promise<{ insertedIds: string[] }>')
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('updateOne(filter: object, update: object): Promise<{ modifiedCount: number }>')
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('updateMany(filter: object, update: object): Promise<{ modifiedCount: number }>')
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('deleteOne(filter: object): Promise<{ deletedCount: number }>')
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('deleteMany(filter: object): Promise<{ deletedCount: number }>')
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('aggregate(pipeline: object[]): Promise<Document[]>')
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('countDocuments(filter?: object): Promise<number>')
    })

    it('defines listCollections and listDatabases', () => {
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('listCollections(): Promise<string[]>')
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('listDatabases(): Promise<string[]>')
    })

    it('defines Document type', () => {
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('type Document = Record<string, unknown>')
    })
  })

  describe('validateUserCode', () => {
    it('returns valid for safe code', () => {
      const result = validateUserCode('return db.collection("users").find()')
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('rejects code with process access', () => {
      const result = validateUserCode('return process.env.SECRET')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('process')
    })

    it('rejects code with require', () => {
      const result = validateUserCode('const fs = require("fs")')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('require')
    })

    it('rejects code with dynamic import', () => {
      const result = validateUserCode('const mod = await import("./secret")')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('import')
    })

    it('rejects code with __dirname', () => {
      const result = validateUserCode('return __dirname')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('__dirname')
    })

    it('rejects code with __filename', () => {
      const result = validateUserCode('return __filename')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('__filename')
    })

    it('rejects code with eval', () => {
      const result = validateUserCode('return eval("1 + 1")')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('eval')
    })

    it('rejects code with Function constructor', () => {
      const result = validateUserCode('return new Function("return 1")()')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Function')
    })

    it('rejects code with globalThis', () => {
      const result = validateUserCode('return globalThis.fetch')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('globalThis')
    })

    it('rejects code with self access', () => {
      const result = validateUserCode('return self.postMessage("data")')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('self')
    })

    it('allows code with similar but safe patterns', () => {
      // "processing" contains "process" but shouldn't be rejected
      const result = validateUserCode('const processing = true; return processing')
      expect(result.valid).toBe(true)
    })
  })

  describe('escapeUserCode', () => {
    it('escapes backticks', () => {
      const code = 'const str = `hello`'
      const escaped = escapeUserCode(code)
      expect(escaped).toBe('const str = \\`hello\\`')
    })

    it('escapes template literal expressions', () => {
      const code = 'const str = `${name}`'
      const escaped = escapeUserCode(code)
      expect(escaped).toBe('const str = \\`\\${name}\\`')
    })

    it('escapes backslashes', () => {
      const code = 'const path = "C:\\Users"'
      const escaped = escapeUserCode(code)
      expect(escaped).toBe('const path = "C:\\\\Users"')
    })

    it('handles complex escaping scenarios', () => {
      const code = 'const str = `path: ${path}\\n`'
      const escaped = escapeUserCode(code)
      expect(escaped).toContain('\\`')
      expect(escaped).toContain('\\${')
      expect(escaped).toContain('\\\\')
    })

    it('preserves regular code', () => {
      const code = 'return db.collection("users").find()'
      const escaped = escapeUserCode(code)
      expect(escaped).toBe(code)
    })
  })

  describe('generateSafeSandboxCode', () => {
    it('validates and generates code for safe input', () => {
      const result = generateSafeSandboxCode('return 42')

      expect(result.error).toBeUndefined()
      expect(result.code).toBeDefined()
      expect(result.code.length).toBeGreaterThan(0)
    })

    it('returns error for dangerous code', () => {
      const result = generateSafeSandboxCode('return process.env.SECRET')

      expect(result.error).toBeDefined()
      expect(result.error).toContain('process')
      expect(result.code).toBe('')
    })

    it('escapes template literals in user code', () => {
      const result = generateSafeSandboxCode('return `hello ${name}`')

      expect(result.error).toBeUndefined()
      expect(result.code).toContain('\\`hello \\${name}\\`')
    })

    it('handles complex valid code', () => {
      const userCode = `
        const users = await db.collection("users").find({ active: true });
        console.log("Found users:", users.length);
        return users.map(u => u.name);
      `
      const result = generateSafeSandboxCode(userCode)

      expect(result.error).toBeUndefined()
      expect(result.code).toBeDefined()
    })
  })

  describe('SandboxResult interface', () => {
    it('allows success result with value', () => {
      const result: SandboxResult = {
        success: true,
        value: { users: [{ name: 'Alice' }] },
        logs: ['Found 1 user'],
      }

      expect(result.success).toBe(true)
      expect(result.value).toEqual({ users: [{ name: 'Alice' }] })
      expect(result.logs).toEqual(['Found 1 user'])
    })

    it('allows error result with message', () => {
      const result: SandboxResult = {
        success: false,
        error: 'Collection not found',
        logs: ['Attempting to access collection...'],
      }

      expect(result.success).toBe(false)
      expect(result.error).toBe('Collection not found')
      expect(result.logs).toEqual(['Attempting to access collection...'])
    })

    it('requires logs array even when empty', () => {
      const result: SandboxResult = {
        success: true,
        value: null,
        logs: [],
      }

      expect(result.logs).toEqual([])
    })
  })

  describe('Timeout handling', () => {
    it('includes default timeout of 30000ms', () => {
      const code = generateSandboxCode('return 1')
      expect(code).toContain('const timeoutMs = 30000')
    })

    it('accepts custom timeout via options', () => {
      const code = generateSandboxCode('return 1', { timeout: 5000 })
      expect(code).toContain('const timeoutMs = 5000')
    })

    it('includes timeout promise race', () => {
      const code = generateSandboxCode('return 1')
      expect(code).toContain('Promise.race([executionPromise, timeoutPromise])')
    })

    it('creates timeout error message', () => {
      const code = generateSandboxCode('return 1', { timeout: 10000 })
      expect(code).toContain('Execution timeout after')
    })
  })

  describe('Console method support', () => {
    it('captures console.log', () => {
      const code = generateSandboxCode('console.log("test")')
      expect(code).toContain("console.log = createLogger('log')")
    })

    it('captures console.error', () => {
      const code = generateSandboxCode('console.error("error")')
      expect(code).toContain("console.error = createLogger('error')")
    })

    it('captures console.warn', () => {
      const code = generateSandboxCode('console.warn("warning")')
      expect(code).toContain("console.warn = createLogger('warn')")
    })

    it('captures console.info', () => {
      const code = generateSandboxCode('console.info("info")')
      expect(code).toContain("console.info = createLogger('info')")
    })

    it('includes formatArgs helper for object serialization', () => {
      const code = generateSandboxCode('console.log({ key: "value" })')
      expect(code).toContain('function formatArgs(args)')
      expect(code).toContain('JSON.stringify(a, null, 2)')
    })

    it('restores all console methods after execution', () => {
      const code = generateSandboxCode('return 1')
      expect(code).toContain('console.log = originalConsole.log')
      expect(code).toContain('console.error = originalConsole.error')
      expect(code).toContain('console.warn = originalConsole.warn')
      expect(code).toContain('console.info = originalConsole.info')
    })
  })

  describe('Utility functions', () => {
    it('exposes sleep utility', () => {
      const code = generateSandboxCode('await utils.sleep(100)')
      expect(code).toContain('sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms))')
    })

    it('exposes ObjectId utility', () => {
      const code = generateSandboxCode('utils.ObjectId("123")')
      expect(code).toContain("ObjectId: (id) => ({ $oid: id || generateObjectId() })")
    })

    it('exposes ISODate utility', () => {
      const code = generateSandboxCode('utils.ISODate()')
      expect(code).toContain('ISODate: (date) => ({ $date:')
    })

    it('exposes UUID utility', () => {
      const code = generateSandboxCode('utils.UUID()')
      expect(code).toContain('UUID: () => crypto.randomUUID()')
    })

    it('includes ObjectId generator helper', () => {
      const code = generateSandboxCode('return 1')
      expect(code).toContain('function generateObjectId()')
      expect(code).toContain('const timestamp = Math.floor(Date.now() / 1000)')
    })
  })

  describe('Source map support', () => {
    it('includes SOURCE_LINE_OFFSET constant', () => {
      const code = generateSandboxCode('return 1')
      expect(code).toContain('const SOURCE_LINE_OFFSET =')
    })

    it('accepts custom source line offset', () => {
      const code = generateSandboxCode('return 1', { sourceLineOffset: 100 })
      expect(code).toContain('const SOURCE_LINE_OFFSET = 100')
    })

    it('includes formatError function', () => {
      const code = generateSandboxCode('throw new Error("test")')
      expect(code).toContain('function formatError(error)')
    })

    it('adjusts line numbers in stack traces', () => {
      const code = generateSandboxCode('return 1')
      expect(code).toContain('sandbox\\.js:(\\d+):(\\d+)')
      expect(code).toContain('user-code:')
    })
  })

  describe('SandboxOptions', () => {
    it('supports timeout option', () => {
      const options: SandboxOptions = { timeout: 5000 }
      const code = generateSandboxCode('return 1', options)
      expect(code).toContain('5000')
    })

    it('supports includeTimestamps option', () => {
      const code = generateSandboxCode('return 1', { includeTimestamps: true })
      expect(code).toContain('timestamp: Date.now()')
    })

    it('excludes timestamps by default', () => {
      const code = generateSandboxCode('return 1', { includeTimestamps: false })
      // Check that the timestamp line doesn't appear in the log entry creation
      const logEntryMatch = code.match(/const entry = \{[^}]+\}/s)
      expect(logEntryMatch?.[0]).not.toContain('timestamp')
    })

    it('supports sourceLineOffset option', () => {
      const options: SandboxOptions = { sourceLineOffset: 50 }
      const code = generateSandboxCode('return 1', options)
      expect(code).toContain('const SOURCE_LINE_OFFSET = 50')
    })
  })

  describe('ConsoleLogEntry interface', () => {
    it('supports log level', () => {
      const entry: ConsoleLogEntry = {
        level: 'log',
        message: 'test message',
      }
      expect(entry.level).toBe('log')
    })

    it('supports all log levels', () => {
      const levels: ConsoleLogEntry['level'][] = ['log', 'error', 'warn', 'info']
      for (const level of levels) {
        const entry: ConsoleLogEntry = { level, message: 'test' }
        expect(entry.level).toBe(level)
      }
    })

    it('supports optional timestamp', () => {
      const entry: ConsoleLogEntry = {
        level: 'log',
        message: 'test',
        timestamp: Date.now(),
      }
      expect(entry.timestamp).toBeDefined()
      expect(typeof entry.timestamp).toBe('number')
    })
  })

  describe('Type definitions', () => {
    it('includes utils type definitions', () => {
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('declare const utils')
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('sleep(ms: number): Promise<void>')
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('ObjectId(id?: string): { $oid: string }')
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('ISODate(date?: string | Date): { $date: string }')
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('UUID(): string')
    })

    it('includes console type definitions', () => {
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('declare const console')
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('log(...args: unknown[]): void')
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('error(...args: unknown[]): void')
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('warn(...args: unknown[]): void')
      expect(SANDBOX_TYPE_DEFINITIONS).toContain('info(...args: unknown[]): void')
    })
  })
})
