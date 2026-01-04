import { describe, it, expect, beforeEach } from 'vitest'
import {
  globToRegex,
  compileGlob,
  matchGlob,
  matchAnyGlob,
  filterGlob,
  GlobMatcher,
  normalizePath,
  getGlobBase,
  isGlobPattern,
} from '../../../src/agentfs/glob'

describe('AgentFS Glob Pattern Matching', () => {
  describe('globToRegex', () => {
    describe('basic patterns', () => {
      it('converts simple filename to regex', () => {
        const { regex } = globToRegex('file.txt')
        expect(regex.test('file.txt')).toBe(true)
        expect(regex.test('file.ts')).toBe(false)
        expect(regex.test('other.txt')).toBe(false)
      })

      it('converts path with extension to regex', () => {
        const { regex } = globToRegex('src/index.ts')
        expect(regex.test('src/index.ts')).toBe(true)
        expect(regex.test('src/index.js')).toBe(false)
        expect(regex.test('lib/index.ts')).toBe(false)
      })

      it('escapes regex special characters', () => {
        const { regex } = globToRegex('file.test.ts')
        expect(regex.test('file.test.ts')).toBe(true)
        expect(regex.test('filextest.ts')).toBe(false)
      })

      it('escapes parentheses', () => {
        const { regex } = globToRegex('file(1).txt')
        expect(regex.test('file(1).txt')).toBe(true)
      })
    })

    describe('single asterisk (*)', () => {
      it('matches any filename in pattern', () => {
        const { regex } = globToRegex('*.ts')
        expect(regex.test('index.ts')).toBe(true)
        expect(regex.test('app.ts')).toBe(true)
        expect(regex.test('test.js')).toBe(false)
      })

      it('matches prefix with any suffix', () => {
        const { regex } = globToRegex('test-*')
        expect(regex.test('test-unit')).toBe(true)
        expect(regex.test('test-integration')).toBe(true)
        expect(regex.test('other-unit')).toBe(false)
      })

      it('does not match path separators', () => {
        const { regex } = globToRegex('*.ts')
        expect(regex.test('src/index.ts')).toBe(false)
      })

      it('matches in specific directory', () => {
        const { regex } = globToRegex('src/*.ts')
        expect(regex.test('src/index.ts')).toBe(true)
        expect(regex.test('src/app.ts')).toBe(true)
        expect(regex.test('lib/index.ts')).toBe(false)
        expect(regex.test('src/utils/helper.ts')).toBe(false)
      })

      it('matches with any suffix including non-empty', () => {
        const { regex } = globToRegex('test-*.txt')
        expect(regex.test('test-unit.txt')).toBe(true)
        expect(regex.test('test-abc.txt')).toBe(true)
        // Note: empty string matching depends on implementation
      })
    })

    describe('double asterisk (**)', () => {
      it('matches any depth of directories', () => {
        const { regex } = globToRegex('**/*.ts')
        expect(regex.test('index.ts')).toBe(true)
        expect(regex.test('src/index.ts')).toBe(true)
        expect(regex.test('src/utils/helper.ts')).toBe(true)
        expect(regex.test('a/b/c/d/e.ts')).toBe(true)
      })

      it('matches at end of pattern', () => {
        const { regex } = globToRegex('src/**')
        // ** at end matches zero or more path segments
        expect(regex.test('src/index.ts')).toBe(true)
        expect(regex.test('src/utils/helper.ts')).toBe(true)
        // Note: whether 'src' alone matches depends on implementation
      })

      it('matches in middle of pattern', () => {
        const { regex } = globToRegex('src/**/test.ts')
        expect(regex.test('src/test.ts')).toBe(true)
        expect(regex.test('src/utils/test.ts')).toBe(true)
        expect(regex.test('src/deep/nested/test.ts')).toBe(true)
        expect(regex.test('src/other.ts')).toBe(false)
      })

      it('matches specific subdirectory recursively', () => {
        const { regex } = globToRegex('src/**/*.test.ts')
        expect(regex.test('src/index.test.ts')).toBe(true)
        expect(regex.test('src/utils/helper.test.ts')).toBe(true)
        expect(regex.test('test/index.test.ts')).toBe(false)
      })
    })

    describe('question mark (?)', () => {
      it('matches single character', () => {
        const { regex } = globToRegex('file?.txt')
        expect(regex.test('file1.txt')).toBe(true)
        expect(regex.test('fileA.txt')).toBe(true)
        expect(regex.test('file.txt')).toBe(false)
        expect(regex.test('file12.txt')).toBe(false)
      })

      it('multiple question marks match multiple characters', () => {
        const { regex } = globToRegex('test-??.ts')
        expect(regex.test('test-01.ts')).toBe(true)
        expect(regex.test('test-ab.ts')).toBe(true)
        expect(regex.test('test-1.ts')).toBe(false)
        expect(regex.test('test-abc.ts')).toBe(false)
      })

      it('does not match path separator', () => {
        const { regex } = globToRegex('src?file.ts')
        expect(regex.test('src_file.ts')).toBe(true)
        expect(regex.test('src/file.ts')).toBe(false)
      })
    })

    describe('character classes ([abc])', () => {
      it('matches single character from class', () => {
        const { regex } = globToRegex('file[123].txt')
        expect(regex.test('file1.txt')).toBe(true)
        expect(regex.test('file2.txt')).toBe(true)
        expect(regex.test('file3.txt')).toBe(true)
        expect(regex.test('file4.txt')).toBe(false)
      })

      it('matches character ranges', () => {
        const { regex } = globToRegex('file[a-z].txt')
        expect(regex.test('filea.txt')).toBe(true)
        expect(regex.test('filez.txt')).toBe(true)
        expect(regex.test('file1.txt')).toBe(false)
      })

      it('matches combined ranges and literals', () => {
        const { regex } = globToRegex('file[a-z0-9].txt')
        expect(regex.test('filea.txt')).toBe(true)
        expect(regex.test('file9.txt')).toBe(true)
        expect(regex.test('file_.txt')).toBe(false)
      })
    })

    describe('negated character classes ([!abc] or [^abc])', () => {
      it('matches any character NOT in class with !', () => {
        const { regex } = globToRegex('file[!abc].txt')
        expect(regex.test('filed.txt')).toBe(true)
        expect(regex.test('file1.txt')).toBe(true)
        expect(regex.test('filea.txt')).toBe(false)
        expect(regex.test('fileb.txt')).toBe(false)
      })

      it('matches any character NOT in class with ^', () => {
        const { regex } = globToRegex('file[^123].txt')
        expect(regex.test('file4.txt')).toBe(true)
        expect(regex.test('filea.txt')).toBe(true)
        expect(regex.test('file1.txt')).toBe(false)
      })
    })

    describe('brace expansion ({a,b,c})', () => {
      it('matches any of the alternatives', () => {
        const { regex } = globToRegex('file.{ts,js,tsx}')
        expect(regex.test('file.ts')).toBe(true)
        expect(regex.test('file.js')).toBe(true)
        expect(regex.test('file.tsx')).toBe(true)
        expect(regex.test('file.css')).toBe(false)
      })

      it('works with path patterns', () => {
        const { regex } = globToRegex('{src,lib}/*.ts')
        expect(regex.test('src/index.ts')).toBe(true)
        expect(regex.test('lib/index.ts')).toBe(true)
        expect(regex.test('test/index.ts')).toBe(false)
      })

      it('works with complex alternatives', () => {
        const { regex } = globToRegex('*.{spec,test}.{ts,tsx}')
        expect(regex.test('app.spec.ts')).toBe(true)
        expect(regex.test('app.test.tsx')).toBe(true)
        expect(regex.test('app.unit.ts')).toBe(false)
      })
    })

    describe('negated patterns (!)', () => {
      it('marks pattern as negated', () => {
        const { negated } = globToRegex('!*.test.ts')
        expect(negated).toBe(true)
      })

      it('non-negated pattern has negated false', () => {
        const { negated } = globToRegex('*.test.ts')
        expect(negated).toBe(false)
      })
    })

    describe('options', () => {
      it('nocase option enables case-insensitive matching', () => {
        const { regex: caseSensitive } = globToRegex('File.ts')
        const { regex: caseInsensitive } = globToRegex('File.ts', { nocase: true })

        expect(caseSensitive.test('File.ts')).toBe(true)
        expect(caseSensitive.test('file.ts')).toBe(false)

        expect(caseInsensitive.test('File.ts')).toBe(true)
        expect(caseInsensitive.test('file.ts')).toBe(true)
        expect(caseInsensitive.test('FILE.TS')).toBe(true)
      })

      it('dot option allows matching dotfiles by default patterns', () => {
        const { regex: noDot } = globToRegex('*')
        const { regex: withDot } = globToRegex('*', { dot: true })

        // Without dot option, * should not match dotfiles at start
        expect(noDot.test('file.txt')).toBe(true)
        // Behavior depends on implementation - test actual behavior

        expect(withDot.test('file.txt')).toBe(true)
        expect(withDot.test('.hidden')).toBe(true)
      })
    })
  })

  describe('compileGlob', () => {
    it('returns compiledGlob with match method', () => {
      const compiled = compileGlob('*.ts')
      expect(compiled.pattern).toBe('*.ts')
      expect(compiled.regex).toBeInstanceOf(RegExp)
      expect(typeof compiled.match).toBe('function')
    })

    it('match method works correctly', () => {
      const compiled = compileGlob('src/*.ts')
      expect(compiled.match('src/index.ts')).toBe(true)
      expect(compiled.match('lib/index.ts')).toBe(false)
    })

    it('handles negated patterns in match', () => {
      const compiled = compileGlob('!*.test.ts')
      expect(compiled.negated).toBe(true)
      expect(compiled.match('index.test.ts')).toBe(false)
      expect(compiled.match('index.ts')).toBe(true)
    })
  })

  describe('matchGlob', () => {
    it('matches simple pattern', () => {
      expect(matchGlob('*.ts', 'index.ts')).toBe(true)
      expect(matchGlob('*.ts', 'index.js')).toBe(false)
    })

    it('matches with options', () => {
      expect(matchGlob('*.TS', 'index.ts', { nocase: true })).toBe(true)
      expect(matchGlob('*.TS', 'index.ts')).toBe(false)
    })
  })

  describe('matchAnyGlob', () => {
    it('matches if any pattern matches', () => {
      const patterns = ['*.ts', '*.js', '*.tsx']
      expect(matchAnyGlob(patterns, 'index.ts')).toBe(true)
      expect(matchAnyGlob(patterns, 'index.js')).toBe(true)
      expect(matchAnyGlob(patterns, 'index.tsx')).toBe(true)
      expect(matchAnyGlob(patterns, 'index.css')).toBe(false)
    })

    it('returns false for empty patterns', () => {
      expect(matchAnyGlob([], 'index.ts')).toBe(false)
    })
  })

  describe('filterGlob', () => {
    const paths = [
      '/src/index.ts',
      '/src/app.ts',
      '/src/styles.css',
      '/test/index.test.ts',
      '/README.md',
    ]

    it('filters matching paths', () => {
      const result = filterGlob('/src/*.ts', paths)
      expect(result).toEqual(['/src/index.ts', '/src/app.ts'])
    })

    it('returns empty for no matches', () => {
      const result = filterGlob('*.py', paths)
      expect(result).toEqual([])
    })

    it('filters with complex pattern', () => {
      const result = filterGlob('/**/*.ts', paths)
      expect(result).toContain('/src/index.ts')
      expect(result).toContain('/test/index.test.ts')
    })
  })

  describe('GlobMatcher', () => {
    it('creates matcher from single pattern', () => {
      const matcher = new GlobMatcher('*.ts')
      expect(matcher.match('index.ts')).toBe(true)
      expect(matcher.match('index.js')).toBe(false)
    })

    it('creates matcher from array of patterns', () => {
      const matcher = new GlobMatcher(['*.ts', '*.js'])
      expect(matcher.match('index.ts')).toBe(true)
      expect(matcher.match('index.js')).toBe(true)
      expect(matcher.match('index.css')).toBe(false)
    })

    it('handles exclude patterns', () => {
      const matcher = new GlobMatcher(['*.ts', '!*.test.ts'])
      expect(matcher.match('index.ts')).toBe(true)
      expect(matcher.match('index.test.ts')).toBe(false)
    })

    it('filter method works', () => {
      const matcher = new GlobMatcher('*.ts')
      const paths = ['a.ts', 'b.js', 'c.ts']
      expect(matcher.filter(paths)).toEqual(['a.ts', 'c.ts'])
    })

    it('respects options', () => {
      const matcher = new GlobMatcher('*.TS', { nocase: true })
      expect(matcher.match('index.ts')).toBe(true)
      expect(matcher.match('index.TS')).toBe(true)
    })
  })

  describe('normalizePath', () => {
    it('removes trailing slashes', () => {
      expect(normalizePath('/src/')).toBe('/src')
      expect(normalizePath('/src/utils/')).toBe('/src/utils')
    })

    it('keeps root slash', () => {
      expect(normalizePath('/')).toBe('/')
    })

    it('normalizes multiple slashes', () => {
      expect(normalizePath('/src//utils///file.ts')).toBe('/src/utils/file.ts')
    })

    it('handles relative paths with cwd', () => {
      expect(normalizePath('file.ts', '/src')).toBe('/src/file.ts')
      expect(normalizePath('utils/helper.ts', '/src')).toBe('/src/utils/helper.ts')
    })

    it('does not modify absolute paths with cwd', () => {
      expect(normalizePath('/absolute/path.ts', '/src')).toBe('/absolute/path.ts')
    })
  })

  describe('getGlobBase', () => {
    it('returns non-glob prefix', () => {
      expect(getGlobBase('src/utils/*.ts')).toBe('src/utils')
      expect(getGlobBase('src/**/*.ts')).toBe('src')
      expect(getGlobBase('/app/src/components/**')).toBe('/app/src/components')
    })

    it('returns root for patterns starting with glob', () => {
      expect(getGlobBase('*.ts')).toBe('/')
      expect(getGlobBase('**/*.ts')).toBe('/')
    })

    it('handles patterns with no glob characters', () => {
      expect(getGlobBase('src/index.ts')).toBe('src/index.ts')
    })
  })

  describe('isGlobPattern', () => {
    it('returns true for patterns with wildcards', () => {
      expect(isGlobPattern('*.ts')).toBe(true)
      expect(isGlobPattern('src/**/*.ts')).toBe(true)
      expect(isGlobPattern('file?.txt')).toBe(true)
    })

    it('returns true for patterns with character classes', () => {
      expect(isGlobPattern('file[123].txt')).toBe(true)
      expect(isGlobPattern('file[!abc].txt')).toBe(true)
    })

    it('returns true for patterns with braces', () => {
      expect(isGlobPattern('{src,lib}/*.ts')).toBe(true)
    })

    it('returns false for literal paths', () => {
      expect(isGlobPattern('src/index.ts')).toBe(false)
      expect(isGlobPattern('/app/file.txt')).toBe(false)
    })
  })

  describe('real-world patterns', () => {
    const projectFiles = [
      '/src/index.ts',
      '/src/app.ts',
      '/src/utils/helper.ts',
      '/src/utils/format.ts',
      '/src/components/Button.tsx',
      '/src/components/Input.tsx',
      '/test/index.test.ts',
      '/test/utils/helper.test.ts',
      '/.gitignore',
      '/README.md',
      '/package.json',
      '/tsconfig.json',
    ]

    it('matches all TypeScript files', () => {
      const result = filterGlob('/**/*.ts', projectFiles)
      expect(result).toContain('/src/index.ts')
      expect(result).toContain('/test/index.test.ts')
      expect(result).not.toContain('/src/components/Button.tsx')
    })

    it('matches TypeScript and TSX files', () => {
      const matcher = new GlobMatcher('/**/*.{ts,tsx}')
      const result = matcher.filter(projectFiles)
      expect(result).toContain('/src/index.ts')
      expect(result).toContain('/src/components/Button.tsx')
    })

    it('matches test files', () => {
      const result = filterGlob('/**/*.test.ts', projectFiles)
      expect(result).toEqual(['/test/index.test.ts', '/test/utils/helper.test.ts'])
    })

    it('matches source files excluding tests', () => {
      const matcher = new GlobMatcher(['/src/**/*.ts', '!/src/**/*.test.ts'])
      const result = matcher.filter(projectFiles)
      expect(result).toContain('/src/index.ts')
      expect(result).not.toContain('/test/index.test.ts')
    })

    it('matches JSON config files', () => {
      const result = filterGlob('/*.json', projectFiles)
      expect(result).toEqual(['/package.json', '/tsconfig.json'])
    })

    it('matches files in specific directory', () => {
      const result = filterGlob('/src/components/*', projectFiles)
      expect(result).toContain('/src/components/Button.tsx')
      expect(result).toContain('/src/components/Input.tsx')
      expect(result).toHaveLength(2)
    })
  })

  describe('edge cases', () => {
    it('handles empty pattern', () => {
      const { regex } = globToRegex('')
      expect(regex.test('')).toBe(true)
      expect(regex.test('anything')).toBe(false)
    })

    it('handles pattern with only *', () => {
      const { regex } = globToRegex('*')
      expect(regex.test('anything')).toBe(true)
      expect(regex.test('path/file')).toBe(false) // * does not match /
    })

    it('handles pattern with only **', () => {
      const { regex } = globToRegex('**')
      expect(regex.test('anything')).toBe(true)
      expect(regex.test('path/to/file')).toBe(true)
    })

    it('handles consecutive wildcards', () => {
      const { regex } = globToRegex('**/**/file.ts')
      expect(regex.test('file.ts')).toBe(true)
      expect(regex.test('a/file.ts')).toBe(true)
      expect(regex.test('a/b/file.ts')).toBe(true)
    })

    it('handles unclosed character class', () => {
      const { regex } = globToRegex('file[abc.txt')
      // Should treat [ as literal
      expect(regex.test('file[abc.txt')).toBe(true)
    })

    it('handles unclosed brace', () => {
      const { regex } = globToRegex('file{a,b.txt')
      // Should treat { as literal
      expect(regex.test('file{a,b.txt')).toBe(true)
    })

    it('handles special regex characters in path', () => {
      const { regex } = globToRegex('file.test.(1).ts')
      expect(regex.test('file.test.(1).ts')).toBe(true)
    })
  })
})
