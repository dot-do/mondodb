import { describe, it, expect } from 'vitest'
// These imports will fail initially - RED phase
import type {
  AgentFSFile,
  AgentFSKVEntry,
  AgentFSToolCall,
  GlobOptions,
  GrepOptions,
  GrepMatch,
  FileSystem,
  FileStat,
  FileType,
} from '../../../src/agentfs/types'

describe('AgentFS Types', () => {
  describe('AgentFSFile', () => {
    it('has required fields: _id, path, content, metadata, createdAt, updatedAt', () => {
      const file: AgentFSFile = {
        _id: '/src/index.ts',
        path: '/src/index.ts',
        content: 'export {}',
        metadata: { type: 'text/typescript' },
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(file._id).toBe('/src/index.ts')
      expect(file.path).toBe('/src/index.ts')
      expect(file.content).toBe('export {}')
      expect(file.metadata).toEqual({ type: 'text/typescript' })
      expect(file.createdAt).toBeInstanceOf(Date)
      expect(file.updatedAt).toBeInstanceOf(Date)
    })

    it('_id equals path (path as MongoDB _id)', () => {
      const file: AgentFSFile = {
        _id: '/src/app.ts',
        path: '/src/app.ts',
        content: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(file._id).toBe(file.path)
    })

    it('path must be absolute (starts with /)', () => {
      const validFile: AgentFSFile = {
        _id: '/absolute/path/file.ts',
        path: '/absolute/path/file.ts',
        content: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(validFile.path).toMatch(/^\//)
    })

    it('metadata is optional', () => {
      const file: AgentFSFile = {
        _id: '/file.txt',
        path: '/file.txt',
        content: 'hello',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(file.metadata).toBeUndefined()
    })

    it('metadata can contain nested JSON objects', () => {
      const file: AgentFSFile = {
        _id: '/config.json',
        path: '/config.json',
        content: '{}',
        metadata: {
          encoding: 'utf-8',
          permissions: { read: true, write: true },
          tags: ['config', 'important'],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(file.metadata?.encoding).toBe('utf-8')
      expect(file.metadata?.permissions).toEqual({ read: true, write: true })
      expect(file.metadata?.tags).toEqual(['config', 'important'])
    })

    it('content can be empty string', () => {
      const file: AgentFSFile = {
        _id: '/empty.txt',
        path: '/empty.txt',
        content: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(file.content).toBe('')
    })

    it('content can contain binary data as base64', () => {
      const binaryData = Buffer.from('hello').toString('base64')
      const file: AgentFSFile = {
        _id: '/image.png',
        path: '/image.png',
        content: binaryData,
        metadata: { encoding: 'base64', mimeType: 'image/png' },
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(file.content).toBe(binaryData)
      expect(file.metadata?.encoding).toBe('base64')
    })
  })

  describe('AgentFSKVEntry', () => {
    it('has _id, key (string) and value (JSON-serializable)', () => {
      const entry: AgentFSKVEntry = {
        _id: 'user:preferences',
        key: 'user:preferences',
        value: { theme: 'dark', language: 'en' },
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(entry._id).toBe('user:preferences')
      expect(entry.key).toBe('user:preferences')
      expect(entry.value).toEqual({ theme: 'dark', language: 'en' })
    })

    it('_id equals key (key as MongoDB _id)', () => {
      const entry: AgentFSKVEntry = {
        _id: 'session:token',
        key: 'session:token',
        value: 'abc123',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(entry._id).toBe(entry.key)
    })

    it('value can be primitive types', () => {
      const stringEntry: AgentFSKVEntry = {
        _id: 'name',
        key: 'name',
        value: 'Claude',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const numberEntry: AgentFSKVEntry = {
        _id: 'count',
        key: 'count',
        value: 42,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const boolEntry: AgentFSKVEntry = {
        _id: 'enabled',
        key: 'enabled',
        value: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const nullEntry: AgentFSKVEntry = {
        _id: 'empty',
        key: 'empty',
        value: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(stringEntry.value).toBe('Claude')
      expect(numberEntry.value).toBe(42)
      expect(boolEntry.value).toBe(true)
      expect(nullEntry.value).toBeNull()
    })

    it('value can be arrays', () => {
      const entry: AgentFSKVEntry = {
        _id: 'recent_files',
        key: 'recent_files',
        value: ['/src/index.ts', '/src/app.ts', '/README.md'],
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(entry.value).toEqual(['/src/index.ts', '/src/app.ts', '/README.md'])
    })

    it('has timestamps for created/updated', () => {
      const created = new Date('2024-01-01')
      const updated = new Date('2024-01-02')

      const entry: AgentFSKVEntry = {
        _id: 'test',
        key: 'test',
        value: 'value',
        createdAt: created,
        updatedAt: updated,
      }

      expect(entry.createdAt).toEqual(created)
      expect(entry.updatedAt).toEqual(updated)
    })
  })

  describe('AgentFSToolCall', () => {
    it('has immutable structure: _id, id, tool, inputs, outputs, timestamp', () => {
      const toolCall: AgentFSToolCall = {
        _id: 'call_123',
        id: 'call_123',
        tool: 'read_file',
        inputs: { path: '/src/index.ts' },
        outputs: { content: 'export {}', success: true },
        timestamp: new Date(),
      }

      expect(toolCall._id).toBe('call_123')
      expect(toolCall.id).toBe('call_123')
      expect(toolCall.tool).toBe('read_file')
      expect(toolCall.inputs).toEqual({ path: '/src/index.ts' })
      expect(toolCall.outputs).toEqual({ content: 'export {}', success: true })
      expect(toolCall.timestamp).toBeInstanceOf(Date)
    })

    it('_id equals id (ObjectId as MongoDB _id)', () => {
      const toolCall: AgentFSToolCall = {
        _id: '507f1f77bcf86cd799439011',
        id: '507f1f77bcf86cd799439011',
        tool: 'test',
        inputs: {},
        outputs: {},
        timestamp: new Date(),
      }

      expect(toolCall._id).toBe(toolCall.id)
    })

    it('supports optional durationMs field', () => {
      const toolCall: AgentFSToolCall = {
        _id: 'call_with_duration',
        id: 'call_with_duration',
        tool: 'read_file',
        inputs: { path: '/file.txt' },
        outputs: { content: 'hello' },
        timestamp: new Date(),
        durationMs: 150,
      }

      expect(toolCall.durationMs).toBe(150)
    })

    it('durationMs is optional', () => {
      const toolCall: AgentFSToolCall = {
        _id: 'call_no_duration',
        id: 'call_no_duration',
        tool: 'read_file',
        inputs: { path: '/file.txt' },
        outputs: { content: 'hello' },
        timestamp: new Date(),
      }

      expect(toolCall.durationMs).toBeUndefined()
    })

    it('supports various tool types', () => {
      const readCall: AgentFSToolCall = {
        _id: 'call_1',
        id: 'call_1',
        tool: 'read_file',
        inputs: { path: '/file.txt' },
        outputs: { content: 'hello' },
        timestamp: new Date(),
      }

      const writeCall: AgentFSToolCall = {
        _id: 'call_2',
        id: 'call_2',
        tool: 'write_file',
        inputs: { path: '/file.txt', content: 'world' },
        outputs: { success: true },
        timestamp: new Date(),
      }

      const globCall: AgentFSToolCall = {
        _id: 'call_3',
        id: 'call_3',
        tool: 'glob',
        inputs: { pattern: '**/*.ts' },
        outputs: { files: ['/src/index.ts', '/src/app.ts'] },
        timestamp: new Date(),
      }

      expect(readCall.tool).toBe('read_file')
      expect(writeCall.tool).toBe('write_file')
      expect(globCall.tool).toBe('glob')
    })

    it('outputs can include error information', () => {
      const failedCall: AgentFSToolCall = {
        _id: 'call_err',
        id: 'call_err',
        tool: 'read_file',
        inputs: { path: '/nonexistent.txt' },
        outputs: {
          success: false,
          error: 'ENOENT: no such file or directory',
        },
        timestamp: new Date(),
      }

      expect((failedCall.outputs as Record<string, unknown>).success).toBe(false)
      expect((failedCall.outputs as Record<string, unknown>).error).toBe('ENOENT: no such file or directory')
    })

    it('is append-only (no update/delete fields)', () => {
      const toolCall: AgentFSToolCall = {
        _id: 'call_immutable',
        id: 'call_immutable',
        tool: 'bash',
        inputs: { command: 'ls -la' },
        outputs: { stdout: 'file1.txt\nfile2.txt' },
        timestamp: new Date(),
      }

      // AgentFSToolCall should not have updatedAt or any mutation fields
      expect(toolCall).not.toHaveProperty('updatedAt')
      expect(toolCall).not.toHaveProperty('deletedAt')
    })
  })

  describe('GlobOptions', () => {
    it('pattern is required string', () => {
      const options: GlobOptions = {
        pattern: '**/*.ts',
      }

      expect(options.pattern).toBe('**/*.ts')
    })

    it('cwd is optional, defaults conceptually to /', () => {
      const withCwd: GlobOptions = {
        pattern: '*.ts',
        cwd: '/src',
      }

      const withoutCwd: GlobOptions = {
        pattern: '*.ts',
      }

      expect(withCwd.cwd).toBe('/src')
      expect(withoutCwd.cwd).toBeUndefined()
    })

    it('supports dot option for hidden files', () => {
      const options: GlobOptions = {
        pattern: '*',
        dot: true,
      }

      expect(options.dot).toBe(true)
    })

    it('supports nocase option for case-insensitive matching', () => {
      const options: GlobOptions = {
        pattern: '*.TXT',
        nocase: true,
      }

      expect(options.nocase).toBe(true)
    })
  })

  describe('GrepOptions', () => {
    it('pattern is required string', () => {
      const options: GrepOptions = {
        pattern: 'function\\s+\\w+',
      }

      expect(options.pattern).toBe('function\\s+\\w+')
    })

    it('glob is optional file filter', () => {
      const withGlob: GrepOptions = {
        pattern: 'TODO',
        glob: '**/*.ts',
      }

      const withoutGlob: GrepOptions = {
        pattern: 'TODO',
      }

      expect(withGlob.glob).toBe('**/*.ts')
      expect(withoutGlob.glob).toBeUndefined()
    })

    it('caseInsensitive is optional boolean', () => {
      const caseInsensitive: GrepOptions = {
        pattern: 'error',
        caseInsensitive: true,
      }

      const caseSensitive: GrepOptions = {
        pattern: 'Error',
        caseInsensitive: false,
      }

      expect(caseInsensitive.caseInsensitive).toBe(true)
      expect(caseSensitive.caseInsensitive).toBe(false)
    })

    it('maxResults is optional number', () => {
      const limited: GrepOptions = {
        pattern: 'import',
        maxResults: 100,
      }

      const unlimited: GrepOptions = {
        pattern: 'import',
      }

      expect(limited.maxResults).toBe(100)
      expect(unlimited.maxResults).toBeUndefined()
    })

    it('supports context lines option', () => {
      const options: GrepOptions = {
        pattern: 'error',
        contextLines: 3,
      }

      expect(options.contextLines).toBe(3)
    })
  })

  describe('GrepMatch', () => {
    it('has file, line, column, content fields', () => {
      const match: GrepMatch = {
        file: '/src/index.ts',
        line: 42,
        column: 10,
        content: 'const error = new Error("test")',
      }

      expect(match.file).toBe('/src/index.ts')
      expect(match.line).toBe(42)
      expect(match.column).toBe(10)
      expect(match.content).toBe('const error = new Error("test")')
    })

    it('has optional context field', () => {
      const matchWithContext: GrepMatch = {
        file: '/src/app.ts',
        line: 15,
        column: 5,
        content: 'throw new Error("failed")',
        context: {
          before: ['try {', '  doSomething()'],
          after: ['} catch (e) {', '  console.log(e)'],
        },
      }

      expect(matchWithContext.context?.before).toEqual(['try {', '  doSomething()'])
      expect(matchWithContext.context?.after).toEqual(['} catch (e) {', '  console.log(e)'])
    })

    it('line and column are 1-indexed', () => {
      const match: GrepMatch = {
        file: '/test.ts',
        line: 1,
        column: 1,
        content: 'first line',
      }

      expect(match.line).toBeGreaterThanOrEqual(1)
      expect(match.column).toBeGreaterThanOrEqual(1)
    })
  })

  describe('FileStat', () => {
    it('has type, size, createdAt, updatedAt fields', () => {
      const stat: FileStat = {
        type: 'file',
        size: 1024,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(stat.type).toBe('file')
      expect(stat.size).toBe(1024)
      expect(stat.createdAt).toBeInstanceOf(Date)
      expect(stat.updatedAt).toBeInstanceOf(Date)
    })

    it('type can be file or directory', () => {
      const fileStat: FileStat = {
        type: 'file',
        size: 512,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const dirStat: FileStat = {
        type: 'directory',
        size: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(fileStat.type).toBe('file')
      expect(dirStat.type).toBe('directory')
    })

    it('directories have size 0', () => {
      const dirStat: FileStat = {
        type: 'directory',
        size: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(dirStat.size).toBe(0)
    })
  })

  describe('FileType', () => {
    it('is a union of file and directory', () => {
      const fileType: FileType = 'file'
      const dirType: FileType = 'directory'

      expect(fileType).toBe('file')
      expect(dirType).toBe('directory')
    })
  })

  describe('FileSystem interface', () => {
    it('defines readFile method', async () => {
      const mockFS: FileSystem = {
        readFile: async (path: string) => 'content',
        writeFile: async () => {},
        deleteFile: async () => {},
        readdir: async () => [],
        mkdir: async () => {},
        rmdir: async () => {},
        stat: async () => ({ type: 'file', size: 0, createdAt: new Date(), updatedAt: new Date() }),
        exists: async () => true,
        glob: async () => [],
      }

      const content = await mockFS.readFile('/test.txt')
      expect(content).toBe('content')
    })

    it('defines writeFile method', async () => {
      let written = false
      const mockFS: FileSystem = {
        readFile: async () => '',
        writeFile: async (path: string, content: string) => {
          written = true
        },
        deleteFile: async () => {},
        readdir: async () => [],
        mkdir: async () => {},
        rmdir: async () => {},
        stat: async () => ({ type: 'file', size: 0, createdAt: new Date(), updatedAt: new Date() }),
        exists: async () => true,
        glob: async () => [],
      }

      await mockFS.writeFile('/test.txt', 'hello')
      expect(written).toBe(true)
    })

    it('defines deleteFile method', async () => {
      let deleted = false
      const mockFS: FileSystem = {
        readFile: async () => '',
        writeFile: async () => {},
        deleteFile: async (path: string) => {
          deleted = true
        },
        readdir: async () => [],
        mkdir: async () => {},
        rmdir: async () => {},
        stat: async () => ({ type: 'file', size: 0, createdAt: new Date(), updatedAt: new Date() }),
        exists: async () => true,
        glob: async () => [],
      }

      await mockFS.deleteFile('/test.txt')
      expect(deleted).toBe(true)
    })

    it('defines readdir method', async () => {
      const mockFS: FileSystem = {
        readFile: async () => '',
        writeFile: async () => {},
        deleteFile: async () => {},
        readdir: async (path: string) => ['file1.txt', 'file2.txt', 'subdir'],
        mkdir: async () => {},
        rmdir: async () => {},
        stat: async () => ({ type: 'file', size: 0, createdAt: new Date(), updatedAt: new Date() }),
        exists: async () => true,
        glob: async () => [],
      }

      const entries = await mockFS.readdir('/src')
      expect(entries).toEqual(['file1.txt', 'file2.txt', 'subdir'])
    })

    it('defines mkdir method', async () => {
      let created = false
      const mockFS: FileSystem = {
        readFile: async () => '',
        writeFile: async () => {},
        deleteFile: async () => {},
        readdir: async () => [],
        mkdir: async (path: string) => {
          created = true
        },
        rmdir: async () => {},
        stat: async () => ({ type: 'file', size: 0, createdAt: new Date(), updatedAt: new Date() }),
        exists: async () => true,
        glob: async () => [],
      }

      await mockFS.mkdir('/new-dir')
      expect(created).toBe(true)
    })

    it('defines rmdir method', async () => {
      let removed = false
      const mockFS: FileSystem = {
        readFile: async () => '',
        writeFile: async () => {},
        deleteFile: async () => {},
        readdir: async () => [],
        mkdir: async () => {},
        rmdir: async (path: string) => {
          removed = true
        },
        stat: async () => ({ type: 'file', size: 0, createdAt: new Date(), updatedAt: new Date() }),
        exists: async () => true,
        glob: async () => [],
      }

      await mockFS.rmdir('/old-dir')
      expect(removed).toBe(true)
    })

    it('defines stat method', async () => {
      const now = new Date()
      const mockFS: FileSystem = {
        readFile: async () => '',
        writeFile: async () => {},
        deleteFile: async () => {},
        readdir: async () => [],
        mkdir: async () => {},
        rmdir: async () => {},
        stat: async (path: string) => ({
          type: 'file' as FileType,
          size: 1024,
          createdAt: now,
          updatedAt: now,
        }),
        exists: async () => true,
        glob: async () => [],
      }

      const stat = await mockFS.stat('/file.txt')
      expect(stat.type).toBe('file')
      expect(stat.size).toBe(1024)
    })

    it('defines exists method', async () => {
      const mockFS: FileSystem = {
        readFile: async () => '',
        writeFile: async () => {},
        deleteFile: async () => {},
        readdir: async () => [],
        mkdir: async () => {},
        rmdir: async () => {},
        stat: async () => ({ type: 'file', size: 0, createdAt: new Date(), updatedAt: new Date() }),
        exists: async (path: string) => path === '/exists.txt',
        glob: async () => [],
      }

      expect(await mockFS.exists('/exists.txt')).toBe(true)
      expect(await mockFS.exists('/not-exists.txt')).toBe(false)
    })

    it('defines glob method', async () => {
      const mockFS: FileSystem = {
        readFile: async () => '',
        writeFile: async () => {},
        deleteFile: async () => {},
        readdir: async () => [],
        mkdir: async () => {},
        rmdir: async () => {},
        stat: async () => ({ type: 'file', size: 0, createdAt: new Date(), updatedAt: new Date() }),
        exists: async () => true,
        glob: async (pattern: string) => ['/src/index.ts', '/src/app.ts'],
      }

      const files = await mockFS.glob('**/*.ts')
      expect(files).toEqual(['/src/index.ts', '/src/app.ts'])
    })
  })
})
