/**
 * Vercel AI SDK Adapter Tests
 *
 * TDD Red Phase: Tests for the Vercel AI SDK adapter that converts
 * AgentFS operations into Vercel AI SDK tool definitions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { z } from 'zod'
import {
  createAgentFSVercelTools,
  type AgentFSToolContext,
  type VercelToolDefinition,
} from '../../../src/agentfs/adapters/vercel'
import { AgentFilesystem, type AgentFSDatabase } from '../../../src/agentfs/vfs'
import { AgentGrep } from '../../../src/agentfs/grep'

/**
 * Create a mock database that stores files and directories in memory
 */
function createMockDb(): AgentFSDatabase {
  const collections = new Map<string, Map<string, Record<string, unknown>>>()

  const getCollection = (name: string) => {
    if (!collections.has(name)) {
      collections.set(name, new Map())
    }
    return collections.get(name)!
  }

  return {
    findOne: async (collection: string, query: Record<string, unknown>) => {
      const col = getCollection(collection)
      const id = query._id as string
      return col.get(id) || null
    },

    find: async (collection: string, query: Record<string, unknown>) => {
      const col = getCollection(collection)
      const results: Record<string, unknown>[] = []

      for (const [_id, doc] of col) {
        // Handle regex queries on path field
        if (query.path && typeof query.path === 'object' && '$regex' in query.path) {
          const regex = new RegExp(query.path.$regex as string)
          if (regex.test(doc.path as string)) {
            results.push(doc)
          }
        } else if (!query.path) {
          results.push(doc)
        }
      }
      return results
    },

    insertOne: async (collection: string, document: Record<string, unknown>) => {
      const col = getCollection(collection)
      const id = document._id as string
      col.set(id, { ...document })
      return { insertedId: id }
    },

    updateOne: async (
      collection: string,
      filter: Record<string, unknown>,
      update: { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown> },
      options?: { upsert?: boolean }
    ) => {
      const col = getCollection(collection)
      const id = filter._id as string
      const existing = col.get(id)

      if (existing) {
        if (update.$set) {
          col.set(id, { ...existing, ...update.$set })
        }
        return { matchedCount: 1, modifiedCount: 1 }
      } else if (options?.upsert) {
        const newDoc = { _id: id, ...update.$set, ...update.$setOnInsert }
        col.set(id, newDoc)
        return { matchedCount: 0, modifiedCount: 0, upsertedId: id }
      }
      return { matchedCount: 0, modifiedCount: 0 }
    },

    deleteOne: async (collection: string, filter: Record<string, unknown>) => {
      const col = getCollection(collection)
      const id = filter._id as string
      const deleted = col.delete(id)
      return { deletedCount: deleted ? 1 : 0 }
    },

    deleteMany: async (collection: string, filter: Record<string, unknown>) => {
      const col = getCollection(collection)
      let count = 0

      if (filter.path && typeof filter.path === 'object' && '$regex' in filter.path) {
        const regex = new RegExp(filter.path.$regex as string)
        for (const [id, doc] of col) {
          if (regex.test(doc.path as string)) {
            col.delete(id)
            count++
          }
        }
      }
      return { deletedCount: count }
    },
  }
}

/**
 * Create a test context with filesystem and grep
 */
function createTestContext(): AgentFSToolContext {
  const db = createMockDb()
  const fs = new AgentFilesystem(db)
  const grep = new AgentGrep(fs)
  return { fs, grep }
}

describe('Vercel AI SDK Adapter', () => {
  let tools: ReturnType<typeof createAgentFSVercelTools>
  let context: AgentFSToolContext

  beforeEach(() => {
    context = createTestContext()
    tools = createAgentFSVercelTools(context)
  })

  describe('Tool Creation', () => {
    it('creates tools object with all operations', () => {
      expect(tools.glob).toBeDefined()
      expect(tools.grep).toBeDefined()
      expect(tools.read).toBeDefined()
      expect(tools.write).toBeDefined()
      expect(tools.edit).toBeDefined()
      expect(tools.ls).toBeDefined()
      expect(tools.mkdir).toBeDefined()
      expect(tools.rm).toBeDefined()
    })

    it('each tool has description property', () => {
      expect(tools.glob.description).toBe('Find files matching glob pattern')
      expect(tools.grep.description).toBe('Search file contents with regex')
      expect(tools.read.description).toBe('Read file contents')
      expect(tools.write.description).toBe('Write content to file')
      expect(tools.edit.description).toBe('Edit file by replacing text')
      expect(tools.ls.description).toBe('List directory contents')
      expect(tools.mkdir.description).toBe('Create a directory')
      expect(tools.rm.description).toBe('Delete a file')
    })

    it('each tool has parameters (Zod schema)', () => {
      expect(tools.glob.parameters).toBeDefined()
      expect(tools.grep.parameters).toBeDefined()
      expect(tools.read.parameters).toBeDefined()
      expect(tools.write.parameters).toBeDefined()
      expect(tools.edit.parameters).toBeDefined()
      expect(tools.ls.parameters).toBeDefined()
      expect(tools.mkdir.parameters).toBeDefined()
      expect(tools.rm.parameters).toBeDefined()
    })

    it('each tool has execute function', () => {
      expect(typeof tools.glob.execute).toBe('function')
      expect(typeof tools.grep.execute).toBe('function')
      expect(typeof tools.read.execute).toBe('function')
      expect(typeof tools.write.execute).toBe('function')
      expect(typeof tools.edit.execute).toBe('function')
      expect(typeof tools.ls.execute).toBe('function')
      expect(typeof tools.mkdir.execute).toBe('function')
      expect(typeof tools.rm.execute).toBe('function')
    })
  })

  describe('Tool Schemas', () => {
    it('glob schema requires pattern string', () => {
      const schema = tools.glob.parameters

      // Valid input
      const validResult = schema.safeParse({ pattern: '**/*.ts' })
      expect(validResult.success).toBe(true)

      // Missing pattern
      const invalidResult = schema.safeParse({})
      expect(invalidResult.success).toBe(false)

      // Wrong type
      const wrongTypeResult = schema.safeParse({ pattern: 123 })
      expect(wrongTypeResult.success).toBe(false)
    })

    it('grep schema requires pattern and supports optional fields', () => {
      const schema = tools.grep.parameters

      // Minimal valid input
      const minimalResult = schema.safeParse({ pattern: 'function' })
      expect(minimalResult.success).toBe(true)

      // Full valid input
      const fullResult = schema.safeParse({
        pattern: 'function\\s+\\w+',
        glob: '**/*.ts',
        caseInsensitive: true,
        maxResults: 100,
      })
      expect(fullResult.success).toBe(true)

      // Missing required pattern
      const invalidResult = schema.safeParse({ glob: '**/*.ts' })
      expect(invalidResult.success).toBe(false)
    })

    it('read schema requires path string', () => {
      const schema = tools.read.parameters

      const validResult = schema.safeParse({ path: '/src/index.ts' })
      expect(validResult.success).toBe(true)

      const invalidResult = schema.safeParse({})
      expect(invalidResult.success).toBe(false)
    })

    it('write schema requires path and content', () => {
      const schema = tools.write.parameters

      const validResult = schema.safeParse({
        path: '/src/new-file.ts',
        content: 'export const x = 1',
      })
      expect(validResult.success).toBe(true)

      // Missing content
      const missingContent = schema.safeParse({ path: '/src/file.ts' })
      expect(missingContent.success).toBe(false)

      // Missing path
      const missingPath = schema.safeParse({ content: 'hello' })
      expect(missingPath.success).toBe(false)
    })

    it('edit schema requires path, old_string, and new_string', () => {
      const schema = tools.edit.parameters

      const validResult = schema.safeParse({
        path: '/src/file.ts',
        old_string: 'const x = 1',
        new_string: 'const x = 2',
      })
      expect(validResult.success).toBe(true)

      // Missing old_string
      const missingOld = schema.safeParse({
        path: '/src/file.ts',
        new_string: 'const x = 2',
      })
      expect(missingOld.success).toBe(false)
    })

    it('ls schema requires path string', () => {
      const schema = tools.ls.parameters

      const validResult = schema.safeParse({ path: '/src' })
      expect(validResult.success).toBe(true)
    })

    it('mkdir schema requires path string', () => {
      const schema = tools.mkdir.parameters

      const validResult = schema.safeParse({ path: '/src/new-dir' })
      expect(validResult.success).toBe(true)
    })

    it('rm schema requires path string', () => {
      const schema = tools.rm.parameters

      const validResult = schema.safeParse({ path: '/src/file.ts' })
      expect(validResult.success).toBe(true)
    })
  })

  describe('Tool Execution - glob', () => {
    beforeEach(async () => {
      await context.fs.writeFile('/src/index.ts', 'export {}')
      await context.fs.writeFile('/src/app.ts', 'export const app = {}')
      await context.fs.writeFile('/src/utils/helper.ts', 'export function helper() {}')
      await context.fs.writeFile('/README.md', '# Readme')
    })

    it('glob tool executes correctly and returns matching files', async () => {
      const result = await tools.glob.execute({ pattern: '**/*.ts' })

      expect(Array.isArray(result)).toBe(true)
      expect(result).toContain('/src/index.ts')
      expect(result).toContain('/src/app.ts')
      expect(result).toContain('/src/utils/helper.ts')
      expect(result).not.toContain('/README.md')
    })

    it('glob tool returns empty array for no matches', async () => {
      const result = await tools.glob.execute({ pattern: '**/*.xyz' })

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(0)
    })

    it('glob tool supports specific directory patterns', async () => {
      const result = await tools.glob.execute({ pattern: '/src/*.ts' })

      expect(result).toContain('/src/index.ts')
      expect(result).toContain('/src/app.ts')
      expect(result).not.toContain('/src/utils/helper.ts')
    })
  })

  describe('Tool Execution - grep', () => {
    beforeEach(async () => {
      await context.fs.writeFile('/src/index.ts', 'export function main() {\n  console.log("hello");\n}')
      await context.fs.writeFile('/src/app.ts', 'export const app = { name: "myapp" }')
      await context.fs.writeFile('/src/utils.ts', 'export function helper() { return 42; }')
    })

    it('grep tool finds matches in files', async () => {
      const result = await tools.grep.execute({ pattern: 'function' })

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
      expect(result.some((m: { file: string }) => m.file === '/src/index.ts')).toBe(true)
      expect(result.some((m: { file: string }) => m.file === '/src/utils.ts')).toBe(true)
    })

    it('grep tool respects glob filter', async () => {
      const result = await tools.grep.execute({
        pattern: 'export',
        glob: '/src/index.ts',
      })

      expect(result.length).toBe(1)
      expect(result[0].file).toBe('/src/index.ts')
    })

    it('grep tool supports case insensitive search', async () => {
      await context.fs.writeFile('/case-test.txt', 'Hello World')

      // Search specifically in our test file to avoid interference from beforeEach files
      const caseSensitive = await tools.grep.execute({
        pattern: 'hello',
        glob: '/case-test.txt',
      })
      const caseInsensitive = await tools.grep.execute({
        pattern: 'hello',
        glob: '/case-test.txt',
        caseInsensitive: true,
      })

      expect(caseSensitive.length).toBe(0)
      expect(caseInsensitive.length).toBe(1)
    })

    it('grep tool respects maxResults limit', async () => {
      const result = await tools.grep.execute({
        pattern: 'export',
        maxResults: 1,
      })

      expect(result.length).toBe(1)
    })
  })

  describe('Tool Execution - read', () => {
    beforeEach(async () => {
      await context.fs.writeFile('/src/index.ts', 'export const x = 1')
    })

    it('read tool returns file content', async () => {
      const result = await tools.read.execute({ path: '/src/index.ts' })

      expect(result).toBe('export const x = 1')
    })

    it('read tool throws error for non-existent file', async () => {
      await expect(
        tools.read.execute({ path: '/nonexistent.ts' })
      ).rejects.toThrow(/ENOENT/i)
    })
  })

  describe('Tool Execution - write', () => {
    it('write tool creates new file', async () => {
      const result = await tools.write.execute({
        path: '/new-file.ts',
        content: 'export const y = 2',
      })

      expect(result).toEqual({ success: true, path: '/new-file.ts' })

      const content = await context.fs.readFile('/new-file.ts')
      expect(content).toBe('export const y = 2')
    })

    it('write tool updates existing file', async () => {
      await context.fs.writeFile('/existing.ts', 'old content')

      const result = await tools.write.execute({
        path: '/existing.ts',
        content: 'new content',
      })

      expect(result.success).toBe(true)
      const content = await context.fs.readFile('/existing.ts')
      expect(content).toBe('new content')
    })
  })

  describe('Tool Execution - edit', () => {
    beforeEach(async () => {
      await context.fs.writeFile('/src/file.ts', 'const x = 1;\nconst y = 2;')
    })

    it('edit tool replaces text in file', async () => {
      const result = await tools.edit.execute({
        path: '/src/file.ts',
        old_string: 'const x = 1',
        new_string: 'const x = 100',
      })

      expect(result.success).toBe(true)
      const content = await context.fs.readFile('/src/file.ts')
      expect(content).toBe('const x = 100;\nconst y = 2;')
    })

    it('edit tool throws error if old_string not found', async () => {
      await expect(
        tools.edit.execute({
          path: '/src/file.ts',
          old_string: 'nonexistent text',
          new_string: 'replacement',
        })
      ).rejects.toThrow(/not found/i)
    })

    it('edit tool throws error for non-existent file', async () => {
      await expect(
        tools.edit.execute({
          path: '/nonexistent.ts',
          old_string: 'x',
          new_string: 'y',
        })
      ).rejects.toThrow(/ENOENT/i)
    })
  })

  describe('Tool Execution - ls', () => {
    beforeEach(async () => {
      await context.fs.writeFile('/src/index.ts', 'export {}')
      await context.fs.writeFile('/src/app.ts', 'export {}')
      await context.fs.mkdir('/src/utils')
    })

    it('ls tool lists directory contents', async () => {
      const result = await tools.ls.execute({ path: '/src' })

      expect(Array.isArray(result)).toBe(true)
      expect(result).toContain('index.ts')
      expect(result).toContain('app.ts')
      expect(result).toContain('utils')
    })

    it('ls tool throws error for non-existent directory', async () => {
      await expect(
        tools.ls.execute({ path: '/nonexistent' })
      ).rejects.toThrow(/ENOENT/i)
    })
  })

  describe('Tool Execution - mkdir', () => {
    it('mkdir tool creates directory', async () => {
      const result = await tools.mkdir.execute({ path: '/new-dir' })

      expect(result).toEqual({ success: true, path: '/new-dir' })
      expect(await context.fs.exists('/new-dir')).toBe(true)
    })

    it('mkdir tool creates nested directories', async () => {
      const result = await tools.mkdir.execute({ path: '/a/b/c' })

      expect(result.success).toBe(true)
      expect(await context.fs.exists('/a/b/c')).toBe(true)
    })
  })

  describe('Tool Execution - rm', () => {
    beforeEach(async () => {
      await context.fs.writeFile('/to-delete.ts', 'content')
    })

    it('rm tool deletes file', async () => {
      const result = await tools.rm.execute({ path: '/to-delete.ts' })

      expect(result).toEqual({ success: true, path: '/to-delete.ts' })
      expect(await context.fs.exists('/to-delete.ts')).toBe(false)
    })

    it('rm tool throws error for non-existent file', async () => {
      await expect(
        tools.rm.execute({ path: '/nonexistent.ts' })
      ).rejects.toThrow(/ENOENT/i)
    })
  })

  describe('Vercel AI SDK Compatibility', () => {
    it('tools object can be used with generateText pattern', () => {
      // Vercel AI SDK expects tools to be an object with tool definitions
      // Each tool should have: description, parameters, execute
      const toolNames = Object.keys(tools)

      for (const name of toolNames) {
        const tool = tools[name as keyof typeof tools]
        expect(tool).toHaveProperty('description')
        expect(tool).toHaveProperty('parameters')
        expect(tool).toHaveProperty('execute')
        expect(typeof tool.description).toBe('string')
        expect(typeof tool.execute).toBe('function')
      }
    })

    it('tool results are JSON-serializable', async () => {
      await context.fs.writeFile('/test.ts', 'hello')

      // Test various tool outputs
      const globResult = await tools.glob.execute({ pattern: '**/*.ts' })
      const readResult = await tools.read.execute({ path: '/test.ts' })
      const writeResult = await tools.write.execute({ path: '/new.ts', content: 'world' })
      const grepResult = await tools.grep.execute({ pattern: 'hello' })

      // All results should be JSON-serializable (no circular refs, no functions)
      expect(() => JSON.stringify(globResult)).not.toThrow()
      expect(() => JSON.stringify(readResult)).not.toThrow()
      expect(() => JSON.stringify(writeResult)).not.toThrow()
      expect(() => JSON.stringify(grepResult)).not.toThrow()
    })
  })

  describe('Error Handling', () => {
    it('tools handle errors gracefully with descriptive messages', async () => {
      try {
        await tools.read.execute({ path: '/nonexistent.ts' })
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toMatch(/ENOENT|no such file/i)
      }
    })

    it('edit tool validates old_string is not empty', async () => {
      await context.fs.writeFile('/test.ts', 'content')

      // Empty old_string should fail validation or throw
      const result = tools.edit.parameters.safeParse({
        path: '/test.ts',
        old_string: '',
        new_string: 'new',
      })

      // Schema should reject empty old_string
      expect(result.success).toBe(false)
    })
  })

  describe('Integration with maxSteps pattern', () => {
    it('tools support sequential execution (simulating multi-step agent)', async () => {
      // Step 1: Create file
      await tools.write.execute({ path: '/step1.ts', content: 'const step = 1' })

      // Step 2: Read and verify
      const content1 = await tools.read.execute({ path: '/step1.ts' })
      expect(content1).toBe('const step = 1')

      // Step 3: Edit file
      await tools.edit.execute({
        path: '/step1.ts',
        old_string: 'const step = 1',
        new_string: 'const step = 2',
      })

      // Step 4: Verify edit
      const content2 = await tools.read.execute({ path: '/step1.ts' })
      expect(content2).toBe('const step = 2')

      // Step 5: Search for content using specific file glob
      const grepResult = await tools.grep.execute({
        pattern: 'step = 2',
        glob: '/step1.ts',
      })
      expect(grepResult.length).toBe(1)
      expect(grepResult[0].file).toBe('/step1.ts')
    })

    it('tools can be called in parallel for independent operations', async () => {
      // Setup
      await context.fs.writeFile('/file1.ts', 'content1')
      await context.fs.writeFile('/file2.ts', 'content2')
      await context.fs.writeFile('/file3.ts', 'content3')

      // Parallel reads
      const [read1, read2, read3] = await Promise.all([
        tools.read.execute({ path: '/file1.ts' }),
        tools.read.execute({ path: '/file2.ts' }),
        tools.read.execute({ path: '/file3.ts' }),
      ])

      expect(read1).toBe('content1')
      expect(read2).toBe('content2')
      expect(read3).toBe('content3')
    })
  })
})

describe('createAgentFSVercelTools type safety', () => {
  it('returns properly typed tools object', () => {
    const context = createTestContext()
    const tools = createAgentFSVercelTools(context)

    // TypeScript should infer the correct types
    type ToolsType = typeof tools
    type GlobTool = ToolsType['glob']

    // This is a compile-time check - if types are wrong, this won't compile
    const _typeCheck: GlobTool = tools.glob
    expect(_typeCheck).toBeDefined()
  })
})
