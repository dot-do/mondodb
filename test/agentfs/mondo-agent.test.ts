/**
 * MonDoAgent Tests
 *
 * Tests for the main MonDoAgent class which provides:
 * - Virtual filesystem (VFS) operations
 * - Glob pattern matching
 * - Grep content search
 * - Key-value storage
 * - Tool call auditing
 * - WebSocket integration
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  MonDoAgent,
  createMonDoAgent,
  isMonDoAgent,
  type AgentContext,
  type AgentEnv,
} from '../../src/agentfs/mondo-agent'

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a mock AgentContext for testing
 */
function createMockContext(): AgentContext {
  return {
    id: 'test-agent-123',
    storage: {
      get: async () => null,
      put: async () => {},
      delete: async () => false,
      list: async () => new Map(),
    },
    blockConcurrencyWhile: async <T>(fn: () => Promise<T>) => fn(),
  }
}

/**
 * Create a mock AgentEnv for testing
 */
function createMockEnv(): AgentEnv {
  return {}
}

// =============================================================================
// MonDoAgent Creation Tests
// =============================================================================

describe('MonDoAgent', () => {
  describe('Creation', () => {
    it('should create agent with context and env', () => {
      const ctx = createMockContext()
      const env = createMockEnv()
      const agent = new MonDoAgent(ctx, env)

      expect(agent).toBeDefined()
      expect(agent.fs).toBeDefined()
      expect(agent.kv).toBeDefined()
      expect(agent.audit).toBeDefined()
      expect(agent.sql).toBeDefined()
    })

    it('should have fs interface with all file operations', () => {
      const agent = new MonDoAgent(createMockContext(), createMockEnv())

      expect(typeof agent.fs.readFile).toBe('function')
      expect(typeof agent.fs.writeFile).toBe('function')
      expect(typeof agent.fs.deleteFile).toBe('function')
      expect(typeof agent.fs.readdir).toBe('function')
      expect(typeof agent.fs.mkdir).toBe('function')
      expect(typeof agent.fs.rmdir).toBe('function')
      expect(typeof agent.fs.stat).toBe('function')
      expect(typeof agent.fs.exists).toBe('function')
      expect(typeof agent.fs.glob).toBe('function')
    })

    it('should have kv interface with all operations', () => {
      const agent = new MonDoAgent(createMockContext(), createMockEnv())

      expect(typeof agent.kv.get).toBe('function')
      expect(typeof agent.kv.set).toBe('function')
      expect(typeof agent.kv.delete).toBe('function')
      expect(typeof agent.kv.has).toBe('function')
      expect(typeof agent.kv.keys).toBe('function')
    })

    it('should have audit interface with all operations', () => {
      const agent = new MonDoAgent(createMockContext(), createMockEnv())

      expect(typeof agent.audit.record).toBe('function')
      expect(typeof agent.audit.list).toBe('function')
      expect(typeof agent.audit.findById).toBe('function')
      expect(typeof agent.audit.count).toBe('function')
    })

    it('should have glob method', () => {
      const agent = new MonDoAgent(createMockContext(), createMockEnv())
      expect(typeof agent.glob).toBe('function')
    })

    it('should have grep method', () => {
      const agent = new MonDoAgent(createMockContext(), createMockEnv())
      expect(typeof agent.grep).toBe('function')
    })
  })

  // ===========================================================================
  // State Management Tests
  // ===========================================================================

  describe('State Management', () => {
    it('should initialize with default state', () => {
      const agent = new MonDoAgent(createMockContext(), createMockEnv())
      const state = agent.getState()

      expect(state).toBeDefined()
      expect(state.initialized).toBe(false)
    })

    it('should set state', () => {
      const agent = new MonDoAgent(createMockContext(), createMockEnv())
      agent.setState({ initialized: true, customField: 'test' })

      const state = agent.getState()
      expect(state.initialized).toBe(true)
      expect(state.customField).toBe('test')
    })

    it('should merge state on setState', () => {
      const agent = new MonDoAgent(createMockContext(), createMockEnv())
      agent.setState({ field1: 'value1' })
      agent.setState({ field2: 'value2' })

      const state = agent.getState()
      expect(state.field1).toBe('value1')
      expect(state.field2).toBe('value2')
    })

    it('should mark initialized on init()', async () => {
      const agent = new MonDoAgent(createMockContext(), createMockEnv())
      expect(agent.getState().initialized).toBe(false)

      await agent.init()

      expect(agent.getState().initialized).toBe(true)
    })
  })

  // ===========================================================================
  // Filesystem Operations Tests
  // ===========================================================================

  describe('Filesystem Operations', () => {
    let agent: MonDoAgent

    beforeEach(() => {
      agent = new MonDoAgent(createMockContext(), createMockEnv())
    })

    it('should write and read files', async () => {
      await agent.fs.writeFile('/test.txt', 'Hello, World!')
      const content = await agent.fs.readFile('/test.txt')

      expect(content).toBe('Hello, World!')
    })

    it('should check if file exists', async () => {
      expect(await agent.fs.exists('/test.txt')).toBe(false)

      await agent.fs.writeFile('/test.txt', 'content')

      expect(await agent.fs.exists('/test.txt')).toBe(true)
    })

    it('should delete files', async () => {
      await agent.fs.writeFile('/test.txt', 'content')
      expect(await agent.fs.exists('/test.txt')).toBe(true)

      await agent.fs.deleteFile('/test.txt')

      expect(await agent.fs.exists('/test.txt')).toBe(false)
    })

    it('should get file stats', async () => {
      await agent.fs.writeFile('/test.txt', 'Hello!')
      const stat = await agent.fs.stat('/test.txt')

      expect(stat).toBeDefined()
      expect(stat.type).toBe('file')
      expect(stat.size).toBe(6) // 'Hello!' is 6 bytes
    })

    it('should create directories', async () => {
      await agent.fs.mkdir('/mydir')
      const stat = await agent.fs.stat('/mydir')

      expect(stat.type).toBe('directory')
    })

    it('should read directory contents', async () => {
      await agent.fs.mkdir('/mydir')
      await agent.fs.writeFile('/mydir/file1.txt', 'content1')
      await agent.fs.writeFile('/mydir/file2.txt', 'content2')

      const entries = await agent.fs.readdir('/mydir')

      expect(entries).toContain('file1.txt')
      expect(entries).toContain('file2.txt')
      expect(entries.length).toBe(2)
    })

    it('should throw on reading non-existent file', async () => {
      await expect(agent.fs.readFile('/nonexistent.txt')).rejects.toThrow()
    })
  })

  // ===========================================================================
  // Glob Tests
  // ===========================================================================

  describe('Glob', () => {
    let agent: MonDoAgent

    beforeEach(async () => {
      agent = new MonDoAgent(createMockContext(), createMockEnv())

      // Set up test files
      await agent.fs.mkdir('/src')
      await agent.fs.writeFile('/src/index.ts', 'export default {}')
      await agent.fs.writeFile('/src/utils.ts', 'export function foo() {}')
      await agent.fs.writeFile('/src/config.json', '{}')
      await agent.fs.writeFile('/README.md', '# README')
    })

    it('should find all TypeScript files', async () => {
      const files = await agent.glob('**/*.ts')

      expect(files).toContain('/src/index.ts')
      expect(files).toContain('/src/utils.ts')
      expect(files).not.toContain('/src/config.json')
      expect(files).not.toContain('/README.md')
    })

    it('should find files in specific directory', async () => {
      const files = await agent.glob('/src/*.ts')

      expect(files).toContain('/src/index.ts')
      expect(files).toContain('/src/utils.ts')
    })

    it('should find JSON files', async () => {
      const files = await agent.glob('**/*.json')

      expect(files).toContain('/src/config.json')
      expect(files).not.toContain('/src/index.ts')
    })

    it('should record glob operation in audit log', async () => {
      await agent.glob('**/*.ts')

      const entries = await agent.audit.list()
      const globEntry = entries.find(e => e.tool === 'glob')

      expect(globEntry).toBeDefined()
      expect(globEntry?.inputs).toHaveProperty('pattern', '**/*.ts')
    })
  })

  // ===========================================================================
  // Grep Tests
  // ===========================================================================

  describe('Grep', () => {
    let agent: MonDoAgent

    beforeEach(async () => {
      agent = new MonDoAgent(createMockContext(), createMockEnv())

      // Set up test files with content
      await agent.fs.writeFile('/file1.ts', 'function hello() {\n  return "hello";\n}')
      await agent.fs.writeFile('/file2.ts', 'function world() {\n  return "world";\n}')
      await agent.fs.writeFile('/file3.txt', 'This is a text file\nwith hello in it')
    })

    it('should find pattern in files', async () => {
      const matches = await agent.grep('hello')

      expect(matches.length).toBeGreaterThan(0)
      expect(matches.some(m => m.content.includes('hello'))).toBe(true)
    })

    it('should return file and line number', async () => {
      const matches = await agent.grep('function')

      expect(matches.length).toBe(2)
      matches.forEach(match => {
        expect(match.file).toBeDefined()
        expect(match.line).toBeDefined()
        expect(typeof match.line).toBe('number')
        expect(match.content).toBeDefined()
      })
    })

    it('should filter by glob pattern', async () => {
      const matches = await agent.grep('hello', { glob: '*.ts' })

      // All matches should be from .ts files
      expect(matches.length).toBeGreaterThan(0)
      expect(matches.every(m => m.file.endsWith('.ts'))).toBe(true)
    })

    it('should support case-insensitive search', async () => {
      await agent.fs.writeFile('/uppercase.txt', 'HELLO WORLD')

      const matches = await agent.grep('hello', { caseInsensitive: true })

      expect(matches.some(m => m.file === '/uppercase.txt')).toBe(true)
    })

    it('should limit results with maxResults', async () => {
      const matches = await agent.grep('return', { maxResults: 1 })

      expect(matches.length).toBe(1)
    })

    it('should record grep operation in audit log', async () => {
      await agent.grep('hello')

      const entries = await agent.audit.list()
      const grepEntry = entries.find(e => e.tool === 'grep')

      expect(grepEntry).toBeDefined()
      expect(grepEntry?.inputs).toHaveProperty('pattern', 'hello')
    })
  })

  // ===========================================================================
  // Key-Value Store Tests
  // ===========================================================================

  describe('Key-Value Store', () => {
    let agent: MonDoAgent

    beforeEach(() => {
      agent = new MonDoAgent(createMockContext(), createMockEnv())
    })

    it('should set and get values', async () => {
      await agent.kv.set('key1', 'value1')
      const value = await agent.kv.get('key1')

      expect(value).toBe('value1')
    })

    it('should return undefined for non-existent keys', async () => {
      const value = await agent.kv.get('nonexistent')
      expect(value).toBeUndefined()
    })

    it('should store complex objects', async () => {
      const obj = { name: 'test', count: 42, nested: { a: 1 } }
      await agent.kv.set('obj', obj)
      const value = await agent.kv.get('obj')

      expect(value).toEqual(obj)
    })

    it('should check if key exists', async () => {
      expect(await agent.kv.has('key1')).toBe(false)

      await agent.kv.set('key1', 'value1')

      expect(await agent.kv.has('key1')).toBe(true)
    })

    it('should delete keys', async () => {
      await agent.kv.set('key1', 'value1')
      expect(await agent.kv.has('key1')).toBe(true)

      await agent.kv.delete('key1')

      expect(await agent.kv.has('key1')).toBe(false)
    })

    it('should list keys', async () => {
      await agent.kv.set('user:1', 'Alice')
      await agent.kv.set('user:2', 'Bob')
      await agent.kv.set('session:1', 'active')

      const allKeys = await agent.kv.keys()
      expect(allKeys).toContain('user:1')
      expect(allKeys).toContain('user:2')
      expect(allKeys).toContain('session:1')
    })

    it('should list keys with prefix', async () => {
      await agent.kv.set('user:1', 'Alice')
      await agent.kv.set('user:2', 'Bob')
      await agent.kv.set('session:1', 'active')

      const userKeys = await agent.kv.keys('user:')

      expect(userKeys).toContain('user:1')
      expect(userKeys).toContain('user:2')
      expect(userKeys).not.toContain('session:1')
    })

    it('should record KV operations in audit log', async () => {
      await agent.kv.set('key1', 'value1')
      await agent.kv.get('key1')

      const entries = await agent.audit.list()
      const kvSetEntry = entries.find(e => e.tool === 'kv.set')
      const kvGetEntry = entries.find(e => e.tool === 'kv.get')

      expect(kvSetEntry).toBeDefined()
      expect(kvGetEntry).toBeDefined()
    })
  })

  // ===========================================================================
  // Audit Log Tests
  // ===========================================================================

  describe('Audit Log', () => {
    let agent: MonDoAgent

    beforeEach(() => {
      agent = new MonDoAgent(createMockContext(), createMockEnv())
    })

    it('should record custom tool calls', async () => {
      await agent.audit.record(
        'custom-tool',
        { input: 'test' },
        { output: 'result' }
      )

      const entries = await agent.audit.list()
      const entry = entries.find(e => e.tool === 'custom-tool')

      expect(entry).toBeDefined()
      expect(entry?.inputs).toEqual({ input: 'test' })
      expect(entry?.outputs).toEqual({ output: 'result' })
    })

    it('should count entries', async () => {
      expect(await agent.audit.count()).toBe(0)

      await agent.audit.record('tool1', {}, {})
      await agent.audit.record('tool2', {}, {})
      await agent.audit.record('tool3', {}, {})

      expect(await agent.audit.count()).toBe(3)
    })

    it('should find entries by tool name', async () => {
      await agent.audit.record('grep', { pattern: 'a' }, {})
      await agent.audit.record('glob', { pattern: '*' }, {})
      await agent.audit.record('grep', { pattern: 'b' }, {})

      const grepEntries = await agent.audit.findByTool('grep')

      expect(grepEntries.length).toBe(2)
      expect(grepEntries.every(e => e.tool === 'grep')).toBe(true)
    })

    it('should include timestamps', async () => {
      await agent.audit.record('test-tool', {}, {})

      const entries = await agent.audit.list()
      expect(entries[0].timestamp).toBeInstanceOf(Date)
    })

    it('should include duration when timing provided', async () => {
      const startTime = new Date(Date.now() - 100)
      const endTime = new Date()

      await agent.audit.record('timed-tool', {}, {}, { startTime, endTime })

      const entries = await agent.audit.list()
      expect(entries[0].durationMs).toBeDefined()
      expect(entries[0].durationMs).toBeGreaterThanOrEqual(0)
    })
  })
})

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('createMonDoAgent', () => {
  it('should create agent with legacy options', () => {
    const mockDatabase = {
      findOne: async () => null,
      find: async () => [],
      insertOne: async () => ({ insertedId: 'test' }),
      updateOne: async () => ({ matchedCount: 0, modifiedCount: 0 }),
      deleteOne: async () => ({ deletedCount: 0 }),
      deleteMany: async () => ({ deletedCount: 0 }),
    }

    const agent = createMonDoAgent({ database: mockDatabase })

    expect(agent).toBeInstanceOf(MonDoAgent)
    expect(agent.fs).toBeDefined()
  })
})

// =============================================================================
// Type Guard Tests
// =============================================================================

describe('isMonDoAgent', () => {
  it('should return true for MonDoAgent instance', () => {
    const agent = new MonDoAgent(createMockContext(), createMockEnv())
    expect(isMonDoAgent(agent)).toBe(true)
  })

  it('should return false for null', () => {
    expect(isMonDoAgent(null)).toBe(false)
  })

  it('should return false for regular objects', () => {
    expect(isMonDoAgent({ fs: {}, kv: {} })).toBe(false)
  })

  it('should return false for objects without required methods', () => {
    expect(isMonDoAgent({
      fs: {},
      kv: {},
      audit: {},
    })).toBe(false)
  })
})
