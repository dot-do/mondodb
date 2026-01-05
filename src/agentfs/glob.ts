/**
 * Glob Pattern Matching for AgentFS
 *
 * Implements glob pattern matching functionality for file/path matching.
 * Supports standard glob patterns including:
 * - * : matches any sequence of characters except /
 * - ** : matches any sequence including /
 * - ? : matches any single character except /
 * - [abc] : matches any character in the set
 * - [a-z] : matches any character in the range
 * - [!abc] or [^abc] : matches any character NOT in the set
 * - {a,b,c} : matches any of the alternatives
 *
 * Performance optimizations:
 * - LRU cache for compiled patterns (configurable size)
 * - Pre-compiled regex constants
 * - Early bailout for literal patterns
 */

import type { GlobOptions } from './types'

// =============================================================================
// CONSTANTS & CONFIGURATION
// =============================================================================

/** Default cache size for compiled glob patterns */
const DEFAULT_CACHE_SIZE = 1000

/** Maximum pattern length to cache (longer patterns are unlikely to repeat) */
const MAX_CACHEABLE_PATTERN_LENGTH = 500

// Pre-compiled regex for performance
const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g
const MULTIPLE_SLASHES = /\/+/g
const GLOB_SPECIAL_CHARS = /[*?[\]{}!]/

/**
 * Result of glob pattern matching
 */
export interface GlobMatchResult {
  /** Whether the path matches the pattern */
  matched: boolean
  /** The matched path segments (useful for captures) */
  captures?: string[]
}

/**
 * Compiled glob pattern for efficient repeated matching
 */
export interface CompiledGlob {
  /** Original pattern string */
  pattern: string
  /** Compiled regex for matching */
  regex: RegExp
  /** Whether pattern is negated (starts with !) */
  negated: boolean
  /** Match a path against this pattern */
  match(path: string): boolean
}

// =============================================================================
// LRU CACHE IMPLEMENTATION
// =============================================================================

/**
 * Simple LRU (Least Recently Used) cache for compiled glob patterns.
 * Provides O(1) get/set operations with automatic eviction of least used items.
 */
class GlobPatternCache {
  private cache: Map<string, CompiledGlob> = new Map()
  private readonly maxSize: number

  constructor(maxSize: number = DEFAULT_CACHE_SIZE) {
    this.maxSize = maxSize
  }

  /**
   * Generate a cache key from pattern and options
   */
  private getCacheKey(pattern: string, options: Pick<GlobOptions, 'nocase' | 'dot'>): string {
    const nocase = options.nocase ? '1' : '0'
    const dot = options.dot ? '1' : '0'
    return `${pattern}|${nocase}|${dot}`
  }

  /**
   * Get a compiled pattern from the cache.
   * Moves the item to the end (most recently used).
   */
  get(pattern: string, options: Pick<GlobOptions, 'nocase' | 'dot'>): CompiledGlob | undefined {
    const key = this.getCacheKey(pattern, options)
    const compiled = this.cache.get(key)

    if (compiled) {
      // Move to end (most recently used) by deleting and re-adding
      this.cache.delete(key)
      this.cache.set(key, compiled)
    }

    return compiled
  }

  /**
   * Store a compiled pattern in the cache.
   * Evicts least recently used items if cache is full.
   */
  set(pattern: string, options: Pick<GlobOptions, 'nocase' | 'dot'>, compiled: CompiledGlob): void {
    // Don't cache very long patterns (unlikely to repeat)
    if (pattern.length > MAX_CACHEABLE_PATTERN_LENGTH) {
      return
    }

    const key = this.getCacheKey(pattern, options)

    // If already exists, delete first to update position
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      // Evict oldest (first) entry
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }

    this.cache.set(key, compiled)
  }

  /**
   * Clear all cached patterns
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get current cache size
   */
  get size(): number {
    return this.cache.size
  }
}

/** Global cache instance for compiled patterns */
const globalPatternCache = new GlobPatternCache()

/**
 * Clear the global pattern cache.
 * Useful for testing or when memory needs to be freed.
 */
export function clearGlobCache(): void {
  globalPatternCache.clear()
}

/**
 * Get the current size of the global pattern cache.
 */
export function getGlobCacheSize(): number {
  return globalPatternCache.size
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(REGEX_SPECIAL_CHARS, '\\$&')
}

/**
 * Convert a glob pattern to a regular expression
 *
 * @param pattern - Glob pattern to convert
 * @param options - Glob options (nocase, dot)
 * @returns Compiled regex and metadata
 */
export function globToRegex(
  pattern: string,
  options: Pick<GlobOptions, 'nocase' | 'dot'> = {}
): { regex: RegExp; negated: boolean } {
  const { nocase = false, dot = false } = options

  // Handle negation
  let negated = false
  let workingPattern = pattern
  if (workingPattern.startsWith('!')) {
    negated = true
    workingPattern = workingPattern.slice(1)
  }

  // Build regex pattern
  let regexStr = ''
  let i = 0
  const len = workingPattern.length

  // Pattern that matches any character except path separator
  const notSlash = '[^/]'
  // Pattern for matching dotfiles (if not dot option, exclude leading dots)
  const notDot = dot ? '' : '(?!\\.)'

  while (i < len) {
    const char = workingPattern[i] as string
    const nextChar = workingPattern[i + 1]

    if (char === '*') {
      if (nextChar === '*') {
        // ** globstar - matches any path segment including /
        const afterStar = workingPattern[i + 2]
        if (afterStar === '/' || afterStar === undefined) {
          // **/ or ** at end
          if (afterStar === '/') {
            // Match zero or more path segments
            regexStr += `(?:${notDot}${notSlash}*(?:/${notDot}${notSlash}*)*)?/?`
            i += 3
          } else {
            // ** at end - match everything remaining
            regexStr += `(?:${notDot}${notSlash}*(?:/${notDot}${notSlash}*)*)?`
            i += 2
          }
        } else {
          // ** not followed by / - treat as two single *
          regexStr += `${notDot}${notSlash}*${notSlash}*`
          i += 2
        }
      } else {
        // Single * - match any sequence except /
        regexStr += `${notDot}${notSlash}*`
        i++
      }
    } else if (char === '?') {
      // ? matches any single character except /
      regexStr += `${notDot}${notSlash}`
      i++
    } else if (char === '[') {
      // Character class
      let classEnd = workingPattern.indexOf(']', i + 1)
      if (classEnd === -1) {
        // No closing bracket - treat as literal
        regexStr += escapeRegex(char)
        i++
      } else {
        let classContent = workingPattern.slice(i + 1, classEnd)
        // Handle negation [!...] or [^...]
        if (classContent.startsWith('!') || classContent.startsWith('^')) {
          classContent = '^' + classContent.slice(1)
        }
        // Escape special regex chars within class but preserve ranges
        classContent = classContent.replace(/([\\])/g, '\\$1')
        regexStr += `[${classContent}]`
        i = classEnd + 1
      }
    } else if (char === '{') {
      // Brace expansion {a,b,c}
      let braceEnd = workingPattern.indexOf('}', i + 1)
      if (braceEnd === -1) {
        // No closing brace - treat as literal
        regexStr += escapeRegex(char)
        i++
      } else {
        const alternatives = workingPattern.slice(i + 1, braceEnd).split(',')
        const altPatterns = alternatives.map((alt) => {
          // Recursively convert each alternative (but without anchors)
          const { regex } = globToRegex(alt, options)
          // Extract the pattern without anchors
          return regex.source.replace(/^\^/, '').replace(/\$$/, '')
        })
        regexStr += `(?:${altPatterns.join('|')})`
        i = braceEnd + 1
      }
    } else if (char === '/') {
      regexStr += '/'
      i++
    } else {
      // Literal character
      regexStr += escapeRegex(char)
      i++
    }
  }

  // Anchor pattern to full string
  const flags = nocase ? 'i' : ''
  const regex = new RegExp(`^${regexStr}$`, flags)

  return { regex, negated }
}

/**
 * Compile a glob pattern for efficient repeated matching.
 * Uses LRU caching for frequently used patterns.
 *
 * @param pattern - Glob pattern to compile
 * @param options - Glob options
 * @param useCache - Whether to use the global cache (default: true)
 * @returns Compiled glob object
 */
export function compileGlob(
  pattern: string,
  options: Pick<GlobOptions, 'nocase' | 'dot'> = {},
  useCache: boolean = true
): CompiledGlob {
  // Normalize options for consistent caching
  const normalizedOptions = {
    nocase: options.nocase ?? false,
    dot: options.dot ?? false,
  }

  // Check cache first
  if (useCache) {
    const cached = globalPatternCache.get(pattern, normalizedOptions)
    if (cached) {
      return cached
    }
  }

  const { regex, negated } = globToRegex(pattern, normalizedOptions)

  const compiled: CompiledGlob = {
    pattern,
    regex,
    negated,
    match(path: string): boolean {
      const matches = regex.test(path)
      return negated ? !matches : matches
    },
  }

  // Store in cache
  if (useCache) {
    globalPatternCache.set(pattern, normalizedOptions, compiled)
  }

  return compiled
}

/**
 * Test if a path matches a glob pattern
 *
 * @param pattern - Glob pattern
 * @param path - Path to test
 * @param options - Glob options
 * @returns True if path matches pattern
 */
export function matchGlob(
  pattern: string,
  path: string,
  options: Pick<GlobOptions, 'nocase' | 'dot'> = {}
): boolean {
  const compiled = compileGlob(pattern, options)
  return compiled.match(path)
}

/**
 * Test if a path matches any of the given glob patterns
 *
 * @param patterns - Array of glob patterns
 * @param path - Path to test
 * @param options - Glob options
 * @returns True if path matches any pattern
 */
export function matchAnyGlob(
  patterns: string[],
  path: string,
  options: Pick<GlobOptions, 'nocase' | 'dot'> = {}
): boolean {
  return patterns.some((pattern) => matchGlob(pattern, path, options))
}

/**
 * Filter paths that match a glob pattern
 *
 * @param pattern - Glob pattern
 * @param paths - Array of paths to filter
 * @param options - Glob options
 * @returns Paths that match the pattern
 */
export function filterGlob(
  pattern: string,
  paths: string[],
  options: Pick<GlobOptions, 'nocase' | 'dot'> = {}
): string[] {
  const compiled = compileGlob(pattern, options)
  return paths.filter((path) => compiled.match(path))
}

/**
 * GlobMatcher class for matching paths against multiple patterns
 */
export class GlobMatcher {
  private includePatterns: CompiledGlob[] = []
  private excludePatterns: CompiledGlob[] = []
  readonly options: Pick<GlobOptions, 'nocase' | 'dot'>

  constructor(
    patterns: string | string[],
    options: Pick<GlobOptions, 'nocase' | 'dot'> = {}
  ) {
    this.options = options
    const patternArray = Array.isArray(patterns) ? patterns : [patterns]

    for (const pattern of patternArray) {
      const compiled = compileGlob(pattern, options)
      if (compiled.negated) {
        this.excludePatterns.push(compiled)
      } else {
        this.includePatterns.push(compiled)
      }
    }
  }

  /**
   * Test if a path matches the patterns
   */
  match(path: string): boolean {
    // Must match at least one include pattern
    const included =
      this.includePatterns.length === 0 ||
      this.includePatterns.some((p) => p.regex.test(path))

    if (!included) return false

    // Must not match any exclude pattern
    return !this.excludePatterns.some((p) => p.regex.test(path))
  }

  /**
   * Filter paths that match the patterns
   */
  filter(paths: string[]): string[] {
    return paths.filter((path) => this.match(path))
  }
}

/**
 * Normalize a path for glob matching
 * - Removes trailing slashes
 * - Normalizes multiple slashes
 * - Handles relative paths with cwd
 */
export function normalizePath(path: string, cwd?: string): string {
  // Normalize multiple slashes using pre-compiled regex
  let normalized = path.replace(MULTIPLE_SLASHES, '/')

  // Remove trailing slash unless root
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }

  // Handle relative paths with cwd
  if (cwd && !normalized.startsWith('/')) {
    const normalizedCwd = cwd.endsWith('/') ? cwd.slice(0, -1) : cwd
    normalized = `${normalizedCwd}/${normalized}`
  }

  return normalized
}

/**
 * Get the base directory from a glob pattern
 * Returns the longest non-glob prefix path
 */
export function getGlobBase(pattern: string): string {
  const parts = pattern.split('/')
  const baseParts: string[] = []

  for (const part of parts) {
    if (part.includes('*') || part.includes('?') || part.includes('[') || part.includes('{')) {
      break
    }
    baseParts.push(part)
  }

  return baseParts.join('/') || '/'
}

/**
 * Check if a pattern contains glob special characters.
 * Uses pre-compiled regex for performance.
 */
export function isGlobPattern(pattern: string): boolean {
  return GLOB_SPECIAL_CHARS.test(pattern)
}
