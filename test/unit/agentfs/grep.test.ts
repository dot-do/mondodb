import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AgentGrep, createGrep } from '../../../src/agentfs/grep'
import type { FileSystem, FileStat, GrepMatch } from '../../../src/agentfs/types'

/**
 * Create a mock FileSystem with in-memory files
 */
function createMockFS(files: Record<string, string>): FileSystem {
  const fileMap = new Map(Object.entries(files))

  return {
    async readFile(path: string): Promise<string> {
      const content = fileMap.get(path)
      if (content === undefined) {
        throw new Error(`ENOENT: no such file or directory: ${path}`)
      }
      return content
    },
    async writeFile(path: string, content: string): Promise<void> {
      fileMap.set(path, content)
    },
    async deleteFile(path: string): Promise<void> {
      fileMap.delete(path)
    },
    async readdir(path: string): Promise<string[]> {
      const entries: string[] = []
      for (const filePath of fileMap.keys()) {
        if (filePath.startsWith(path)) {
          const relativePath = filePath.slice(path.length + 1)
          const firstPart = relativePath.split('/')[0]
          if (firstPart && !entries.includes(firstPart)) {
            entries.push(firstPart)
          }
        }
      }
      return entries
    },
    async mkdir(): Promise<void> {},
    async rmdir(): Promise<void> {},
    async stat(path: string): Promise<FileStat> {
      if (fileMap.has(path)) {
        return {
          type: 'file',
          size: fileMap.get(path)!.length,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      }
      throw new Error(`ENOENT: no such file or directory: ${path}`)
    },
    async exists(path: string): Promise<boolean> {
      return fileMap.has(path)
    },
    async glob(pattern: string): Promise<string[]> {
      // Simple glob implementation for testing
      const allFiles = Array.from(fileMap.keys())
      if (pattern === '**/*') {
        return allFiles
      }
      // Basic extension matching
      if (pattern.startsWith('**/*.')) {
        const ext = pattern.slice(4)
        return allFiles.filter((f) => f.endsWith(ext))
      }
      // Exact match
      return allFiles.filter((f) => f === pattern || f.endsWith(`/${pattern}`))
    },
  }
}

describe('AgentGrep', () => {
  describe('basic grep', () => {
    it('finds simple string matches', async () => {
      const fs = createMockFS({
        '/src/index.ts': 'const hello = "world"\nexport { hello }',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('hello')

      expect(matches).toHaveLength(2)
      expect(matches[0].file).toBe('/src/index.ts')
      expect(matches[0].line).toBe(1)
      expect(matches[0].content).toBe('const hello = "world"')
      expect(matches[1].line).toBe(2)
    })

    it('finds regex pattern matches', async () => {
      const fs = createMockFS({
        '/src/app.ts': 'function greet() {}\nfunction sayHello() {}\nconst x = 1',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('function\\s+\\w+')

      expect(matches).toHaveLength(2)
      expect(matches[0].content).toContain('function greet')
      expect(matches[1].content).toContain('function sayHello')
    })

    it('returns correct column position (1-indexed)', async () => {
      const fs = createMockFS({
        '/test.txt': '   hello world',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('hello')

      expect(matches).toHaveLength(1)
      expect(matches[0].column).toBe(4) // 1-indexed, after 3 spaces
    })

    it('returns correct line number (1-indexed)', async () => {
      const fs = createMockFS({
        '/test.txt': 'line 1\nline 2\nfind me\nline 4',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('find me')

      expect(matches).toHaveLength(1)
      expect(matches[0].line).toBe(3)
    })

    it('returns empty array when no matches found', async () => {
      const fs = createMockFS({
        '/src/index.ts': 'const x = 1',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('nonexistent')

      expect(matches).toHaveLength(0)
    })

    it('handles empty files', async () => {
      const fs = createMockFS({
        '/empty.txt': '',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('test')

      expect(matches).toHaveLength(0)
    })
  })

  describe('case insensitive search', () => {
    it('matches case-insensitively when option is set', async () => {
      const fs = createMockFS({
        '/test.txt': 'Hello HELLO hello hElLo',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('hello', { caseInsensitive: true })

      // Note: with 'g' flag, regex.exec finds first match per line
      expect(matches).toHaveLength(1)
      expect(matches[0].content).toContain('Hello')
    })

    it('is case-sensitive by default', async () => {
      const fs = createMockFS({
        '/test.txt': 'Hello\nhello\nHELLO',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('hello')

      expect(matches).toHaveLength(1)
      expect(matches[0].line).toBe(2)
    })
  })

  describe('glob file filtering', () => {
    it('filters files by glob pattern', async () => {
      const fs = createMockFS({
        '/src/index.ts': 'const error = 1',
        '/src/app.js': 'const error = 2',
        '/test/test.ts': 'const error = 3',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('error', { glob: '**/*.ts' })

      expect(matches).toHaveLength(2)
      expect(matches.every((m) => m.file.endsWith('.ts'))).toBe(true)
    })

    it('searches all files when no glob specified', async () => {
      const fs = createMockFS({
        '/a.txt': 'test',
        '/b.js': 'test',
        '/c.ts': 'test',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('test')

      expect(matches).toHaveLength(3)
    })
  })

  describe('maxResults', () => {
    it('limits number of results', async () => {
      const fs = createMockFS({
        '/file.txt': 'match\nmatch\nmatch\nmatch\nmatch',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('match', { maxResults: 3 })

      expect(matches).toHaveLength(3)
    })

    it('returns all matches when fewer than limit', async () => {
      const fs = createMockFS({
        '/file.txt': 'match\nmatch',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('match', { maxResults: 10 })

      expect(matches).toHaveLength(2)
    })

    it('stops searching files once limit reached', async () => {
      const readFileSpy = vi.fn()
      const fs = createMockFS({
        '/a.txt': 'match',
        '/b.txt': 'match',
        '/c.txt': 'match',
      })
      const originalReadFile = fs.readFile.bind(fs)
      fs.readFile = async (path: string) => {
        readFileSpy(path)
        return originalReadFile(path)
      }
      const grep = new AgentGrep(fs)

      await grep.grep('match', { maxResults: 1 })

      // Should have stopped after first file with match
      expect(readFileSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('context lines', () => {
    it('includes context lines when specified', async () => {
      const fs = createMockFS({
        '/test.txt': 'line 1\nline 2\nTARGET\nline 4\nline 5',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('TARGET', { contextLines: 2 })

      expect(matches).toHaveLength(1)
      expect(matches[0].context?.before).toEqual(['line 1', 'line 2'])
      expect(matches[0].context?.after).toEqual(['line 4', 'line 5'])
    })

    it('handles context at file start', async () => {
      const fs = createMockFS({
        '/test.txt': 'TARGET\nline 2\nline 3',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('TARGET', { contextLines: 2 })

      expect(matches[0].context?.before).toEqual([])
      expect(matches[0].context?.after).toEqual(['line 2', 'line 3'])
    })

    it('handles context at file end', async () => {
      const fs = createMockFS({
        '/test.txt': 'line 1\nline 2\nTARGET',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('TARGET', { contextLines: 2 })

      expect(matches[0].context?.before).toEqual(['line 1', 'line 2'])
      expect(matches[0].context?.after).toEqual([])
    })

    it('does not include context when option is 0', async () => {
      const fs = createMockFS({
        '/test.txt': 'line 1\nTARGET\nline 3',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('TARGET', { contextLines: 0 })

      expect(matches[0].context).toBeUndefined()
    })

    it('does not include context when option is not set', async () => {
      const fs = createMockFS({
        '/test.txt': 'line 1\nTARGET\nline 3',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('TARGET')

      expect(matches[0].context).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('skips unreadable files', async () => {
      const fs = createMockFS({
        '/readable.txt': 'find me',
      })
      // Override glob to return a non-existent file
      fs.glob = async () => ['/readable.txt', '/nonexistent.txt']

      const grep = new AgentGrep(fs)
      const matches = await grep.grep('find')

      expect(matches).toHaveLength(1)
      expect(matches[0].file).toBe('/readable.txt')
    })

    it('handles files with no content gracefully', async () => {
      const fs = createMockFS({})
      fs.readFile = async () => ''
      fs.glob = async () => ['/empty.txt']

      const grep = new AgentGrep(fs)
      const matches = await grep.grep('test')

      expect(matches).toHaveLength(0)
    })
  })

  describe('grepFiles', () => {
    it('returns unique file paths with matches', async () => {
      const fs = createMockFS({
        '/a.txt': 'match\nmatch\nmatch',
        '/b.txt': 'match',
        '/c.txt': 'no hit here',
      })
      const grep = new AgentGrep(fs)

      const files = await grep.grepFiles('match')

      expect(files).toHaveLength(2)
      expect(files).toContain('/a.txt')
      expect(files).toContain('/b.txt')
      expect(files).not.toContain('/c.txt')
    })
  })

  describe('grepCount', () => {
    it('counts matches per file', async () => {
      const fs = createMockFS({
        '/a.txt': 'match\nmatch\nmatch',
        '/b.txt': 'match',
        '/c.txt': 'no hit',
      })
      const grep = new AgentGrep(fs)

      const counts = await grep.grepCount('match')

      expect(counts.get('/a.txt')).toBe(3)
      expect(counts.get('/b.txt')).toBe(1)
      expect(counts.has('/c.txt')).toBe(false)
    })
  })

  describe('grepAny', () => {
    it('finds matches for any of multiple patterns', async () => {
      const fs = createMockFS({
        '/test.txt': 'foo\nbar\nbaz',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grepAny(['foo', 'bar'])

      expect(matches).toHaveLength(2)
      expect(matches[0].content).toBe('foo')
      expect(matches[1].content).toBe('bar')
    })
  })

  describe('grepStream', () => {
    it('calls callback for each match', async () => {
      const fs = createMockFS({
        '/test.txt': 'match 1\nmatch 2\nmatch 3',
      })
      const grep = new AgentGrep(fs)
      const results: GrepMatch[] = []

      await grep.grepStream('match', undefined, (match) => {
        results.push(match)
      })

      expect(results).toHaveLength(3)
    })

    it('supports async callbacks', async () => {
      const fs = createMockFS({
        '/test.txt': 'match 1\nmatch 2',
      })
      const grep = new AgentGrep(fs)
      const results: GrepMatch[] = []

      await grep.grepStream('match', undefined, async (match) => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        results.push(match)
      })

      expect(results).toHaveLength(2)
    })

    it('respects maxResults option', async () => {
      const fs = createMockFS({
        '/test.txt': 'match\nmatch\nmatch\nmatch',
      })
      const grep = new AgentGrep(fs)
      const results: GrepMatch[] = []

      await grep.grepStream('match', { maxResults: 2 }, (match) => {
        results.push(match)
      })

      expect(results).toHaveLength(2)
    })
  })

  describe('createGrep factory', () => {
    it('creates an AgentGrep instance', () => {
      const fs = createMockFS({})
      const grep = createGrep(fs)

      expect(grep).toBeInstanceOf(AgentGrep)
    })
  })

  describe('custom glob matcher', () => {
    it('accepts custom glob matcher', async () => {
      const fs = createMockFS({
        '/included.txt': 'find me',
        '/excluded.txt': 'find me too',
      })
      const customGlobMatcher = {
        glob: async () => ['/included.txt'],
      }
      const grep = new AgentGrep(fs, customGlobMatcher)

      const matches = await grep.grep('find')

      expect(matches).toHaveLength(1)
      expect(matches[0].file).toBe('/included.txt')
    })
  })

  describe('multiline content', () => {
    it('handles Windows line endings', async () => {
      const fs = createMockFS({
        '/windows.txt': 'line1\r\nfind me\r\nline3',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('find me')

      expect(matches).toHaveLength(1)
      // Note: The content will include the \r if present
      expect(matches[0].content).toContain('find me')
    })

    it('handles mixed line endings', async () => {
      const fs = createMockFS({
        '/mixed.txt': 'line1\nfind me\r\nline3\rline4',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('find me')

      expect(matches).toHaveLength(1)
    })
  })

  describe('special regex characters', () => {
    it('searches for literal regex characters when escaped', async () => {
      const fs = createMockFS({
        '/regex.txt': 'find (this) and [that]',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('\\(this\\)')

      expect(matches).toHaveLength(1)
    })

    it('uses regex features when not escaped', async () => {
      const fs = createMockFS({
        '/test.txt': 'cat\ncar\ncan',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('ca.')

      expect(matches).toHaveLength(3)
    })
  })

  describe('unicode support', () => {
    it('finds unicode patterns', async () => {
      const fs = createMockFS({
        '/unicode.txt': 'Hello world\nBonjour monde',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('monde')

      expect(matches).toHaveLength(1)
      expect(matches[0].line).toBe(2)
    })

    it('handles emojis', async () => {
      const fs = createMockFS({
        '/emoji.txt': 'Hello World',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('World')

      expect(matches).toHaveLength(1)
    })
  })

  describe('multiple matches per line', () => {
    it('returns only first match per line by default', async () => {
      const fs = createMockFS({
        '/test.txt': 'foo bar foo baz foo',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('foo')

      // Current implementation returns only first match per line
      expect(matches).toHaveLength(1)
      expect(matches[0].column).toBe(1) // First 'foo' at position 1
    })

    it.todo('returns all matches per line when allMatches option is set', async () => {
      // RED phase: This test documents desired behavior not yet implemented
      const fs = createMockFS({
        '/test.txt': 'foo bar foo baz foo',
      })
      const grep = new AgentGrep(fs)

      // This option doesn't exist yet - RED phase test
      const matches = await grep.grep('foo', { allMatches: true } as any)

      // Should return 3 matches on the same line
      expect(matches).toHaveLength(3)
      expect(matches[0].column).toBe(1)  // First 'foo'
      expect(matches[1].column).toBe(9)  // Second 'foo'
      expect(matches[2].column).toBe(17) // Third 'foo'
    })

    it('counts all occurrences across multiple lines', async () => {
      const fs = createMockFS({
        '/test.txt': 'error here\nanother error\nlast error',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('error')

      expect(matches).toHaveLength(3)
      expect(matches.map((m) => m.line)).toEqual([1, 2, 3])
    })
  })

  describe('very long lines', () => {
    it('handles lines exceeding 1000 characters', async () => {
      const longLine = 'a'.repeat(500) + 'TARGET' + 'b'.repeat(500)
      const fs = createMockFS({
        '/long.txt': longLine,
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('TARGET')

      expect(matches).toHaveLength(1)
      expect(matches[0].column).toBe(501)
      expect(matches[0].content.length).toBe(1006)
    })

    it('handles lines exceeding 10000 characters', async () => {
      const veryLongLine = 'x'.repeat(5000) + 'NEEDLE' + 'y'.repeat(5000)
      const fs = createMockFS({
        '/verylong.txt': veryLongLine,
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('NEEDLE')

      expect(matches).toHaveLength(1)
      expect(matches[0].column).toBe(5001)
    })

    it.todo('truncates returned content for extremely long lines', async () => {
      // RED phase: Test for potential future optimization
      const extremelyLongLine = 'z'.repeat(50000) + 'FIND' + 'z'.repeat(50000)
      const fs = createMockFS({
        '/extreme.txt': extremelyLongLine,
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('FIND', { maxLineLength: 1000 } as any)

      // Should truncate content to maxLineLength while preserving match context
      expect(matches[0].content.length).toBeLessThanOrEqual(1000)
    })

    it('correctly calculates column position in long lines', async () => {
      const prefix = 'prefix_'.repeat(100) // 700 chars
      const content = prefix + 'MARKER'
      const fs = createMockFS({
        '/test.txt': content,
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('MARKER')

      expect(matches).toHaveLength(1)
      expect(matches[0].column).toBe(701) // After 700 char prefix
    })
  })

  describe('binary-like content', () => {
    it('searches through files with null characters', async () => {
      const fs = createMockFS({
        '/binary.txt': 'text\x00before\x00FIND_ME\x00after',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('FIND_ME')

      expect(matches).toHaveLength(1)
    })

    it.todo('skips binary files when detectBinary option is set', async () => {
      // RED phase: Binary detection not yet implemented
      const binaryContent = '\x00\x01\x02\x03SEARCHTERM\x04\x05'
      const fs = createMockFS({
        '/binary.bin': binaryContent,
        '/text.txt': 'SEARCHTERM in text file',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('SEARCHTERM', { detectBinary: true } as any)

      // Should only find match in text file, skipping binary
      expect(matches).toHaveLength(1)
      expect(matches[0].file).toBe('/text.txt')
    })

    it('handles files with control characters', async () => {
      const fs = createMockFS({
        '/control.txt': 'line1\t\ttabs\nline2\rcarriage\nFIND_THIS',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('FIND_THIS')

      expect(matches).toHaveLength(1)
      expect(matches[0].line).toBe(3)
    })

    it('handles high-byte characters', async () => {
      const fs = createMockFS({
        '/highbyte.txt': 'cafe\u00e9 and na\u00efve with SEARCH_TARGET',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('SEARCH_TARGET')

      expect(matches).toHaveLength(1)
    })
  })

  describe('result structure validation', () => {
    it('GrepMatch contains all required fields', async () => {
      const fs = createMockFS({
        '/src/test.ts': 'const value = "test"',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('value')

      expect(matches).toHaveLength(1)
      const match = matches[0]

      // Validate GrepMatch interface compliance
      expect(match).toHaveProperty('file')
      expect(match).toHaveProperty('line')
      expect(match).toHaveProperty('column')
      expect(match).toHaveProperty('content')

      // Validate types
      expect(typeof match.file).toBe('string')
      expect(typeof match.line).toBe('number')
      expect(typeof match.column).toBe('number')
      expect(typeof match.content).toBe('string')

      // Validate values
      expect(match.file).toBe('/src/test.ts')
      expect(match.line).toBeGreaterThan(0)
      expect(match.column).toBeGreaterThan(0)
    })

    it('GrepMatch context is optional and has correct structure when present', async () => {
      const fs = createMockFS({
        '/test.txt': 'line1\nTARGET\nline3',
      })
      const grep = new AgentGrep(fs)

      const matchesWithoutContext = await grep.grep('TARGET')
      expect(matchesWithoutContext[0].context).toBeUndefined()

      const matchesWithContext = await grep.grep('TARGET', { contextLines: 1 })
      expect(matchesWithContext[0].context).toBeDefined()
      expect(matchesWithContext[0].context).toHaveProperty('before')
      expect(matchesWithContext[0].context).toHaveProperty('after')
      expect(Array.isArray(matchesWithContext[0].context!.before)).toBe(true)
      expect(Array.isArray(matchesWithContext[0].context!.after)).toBe(true)
    })
  })

  describe('search in specific file path', () => {
    it('searches only in the specified file', async () => {
      const fs = createMockFS({
        '/src/index.ts': 'export const API = "endpoint"',
        '/src/utils.ts': 'const API = "other"',
        '/test/api.test.ts': 'describe("API")',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('API', { glob: '/src/index.ts' })

      expect(matches).toHaveLength(1)
      expect(matches[0].file).toBe('/src/index.ts')
    })

    it('returns empty when pattern not found in specified file', async () => {
      const fs = createMockFS({
        '/src/index.ts': 'export const value = 1',
        '/src/utils.ts': 'const API = "endpoint"',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('API', { glob: '/src/index.ts' })

      expect(matches).toHaveLength(0)
    })
  })

  describe('complex multi-file scenarios', () => {
    it('finds TODO comments across multiple files', async () => {
      const fs = createMockFS({
        '/src/index.ts': `
import { foo } from './foo';
import { bar } from './bar';

// TODO: implement this feature
export function main() {
  // TODO: add logging
  return foo() + bar();
}
`,
        '/src/utils.ts': `
// Helper utilities
export function helper() {
  // TODO: refactor this
  return 42;
}
`,
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('TODO')

      expect(matches).toHaveLength(3)
      expect(matches.filter((m) => m.file === '/src/index.ts')).toHaveLength(2)
      expect(matches.filter((m) => m.file === '/src/utils.ts')).toHaveLength(1)
    })

    it('finds import statements with regex', async () => {
      const fs = createMockFS({
        '/src/index.ts': `
import { foo } from './foo';
import { bar } from './bar';
const x = 1;
`,
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('import.*from')

      expect(matches).toHaveLength(2)
    })

    it('finds function declarations with complex regex', async () => {
      const fs = createMockFS({
        '/src/app.ts': `
function publicMethod() {}
async function asyncMethod() {}
export function exportedMethod() {}
const arrowFn = () => {};
`,
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('function\\s+\\w+\\s*\\(')

      expect(matches).toHaveLength(3) // publicMethod, asyncMethod, exportedMethod
    })
  })

  describe('edge cases', () => {
    it('handles file with only whitespace', async () => {
      const fs = createMockFS({
        '/whitespace.txt': '   \n\t\t\n   \n',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('test')

      expect(matches).toHaveLength(0)
    })

    it('handles file with single character', async () => {
      const fs = createMockFS({
        '/single.txt': 'x',
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('x')

      expect(matches).toHaveLength(1)
      expect(matches[0].line).toBe(1)
      expect(matches[0].column).toBe(1)
    })

    it('handles pattern matching at exact line boundaries', async () => {
      const fs = createMockFS({
        '/boundary.txt': 'start\nend',
      })
      const grep = new AgentGrep(fs)

      const startMatches = await grep.grep('^start$')
      const endMatches = await grep.grep('^end$')

      expect(startMatches).toHaveLength(1)
      expect(endMatches).toHaveLength(1)
    })

    it('handles empty pattern (matches all lines)', async () => {
      const fs = createMockFS({
        '/test.txt': 'line1\nline2\nline3',
      })
      const grep = new AgentGrep(fs)

      // Empty pattern matches at position 0 of every line
      const matches = await grep.grep('')

      expect(matches).toHaveLength(3)
    })

    it('handles pattern with only special regex characters', async () => {
      const fs = createMockFS({
        '/special.txt': 'test $^.*+?()[]{}|\\ test',
      })
      const grep = new AgentGrep(fs)

      // Search for literal backslash followed by space
      const matches = await grep.grep('\\\\ ')

      expect(matches).toHaveLength(1)
    })

    it('handles very large number of matches with maxResults', async () => {
      const manyLines = Array.from({ length: 10000 }, (_, i) => `line ${i} match`).join('\n')
      const fs = createMockFS({
        '/many.txt': manyLines,
      })
      const grep = new AgentGrep(fs)

      const matches = await grep.grep('match', { maxResults: 50 })

      expect(matches).toHaveLength(50)
    })
  })
})
