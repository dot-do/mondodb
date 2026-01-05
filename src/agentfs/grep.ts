/**
 * AgentFS Grep - Content Search Implementation
 *
 * Provides grep-like content search functionality for the AgentFS system.
 * Searches through files in the virtual filesystem using regex patterns.
 */

import type { FileSystem, GrepOptions, GrepMatch } from './types'

/**
 * Interface for glob pattern matching functionality
 */
export interface GlobMatcher {
  glob(pattern: string): Promise<string[]>
}

/**
 * AgentGrep provides content search across the AgentFS filesystem.
 * Supports regex patterns, case-insensitive search, context lines, and file filtering.
 */
export class AgentGrep {
  private fs: FileSystem
  private globMatcher: GlobMatcher

  /**
   * Creates a new AgentGrep instance.
   * @param fs - FileSystem implementation for reading files
   * @param globMatcher - Optional glob matcher (defaults to fs.glob)
   */
  constructor(fs: FileSystem, globMatcher?: GlobMatcher) {
    this.fs = fs
    this.globMatcher = globMatcher ?? fs
  }

  /**
   * Search for a pattern in files matching the specified criteria.
   *
   * @param pattern - Regular expression pattern to search for
   * @param options - Search options including file filter, case sensitivity, etc.
   * @returns Array of GrepMatch objects representing found matches
   *
   * @example
   * ```typescript
   * const grep = new AgentGrep(fs);
   * const matches = await grep.grep('function\\s+\\w+', {
   *   glob: '**\/*.ts',
   *   caseInsensitive: false,
   *   maxResults: 100
   * });
   * ```
   */
  async grep(pattern: string, options?: Omit<GrepOptions, 'pattern'>): Promise<GrepMatch[]> {
    const flags = options?.caseInsensitive ? 'gi' : 'g'
    const regex = new RegExp(pattern, flags)
    const contextLines = options?.contextLines ?? 0
    const maxResults = options?.maxResults ?? Infinity

    // Get files to search using glob pattern or default to all files
    const filePattern = options?.glob ?? '**/*'
    const files = await this.globMatcher.glob(filePattern)

    const results: GrepMatch[] = []

    for (const file of files) {
      if (results.length >= maxResults) break

      try {
        const content = await this.fs.readFile(file)
        if (!content) continue

        const lines = content.split('\n')

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (line === undefined) continue

          // Reset regex lastIndex for global flag
          regex.lastIndex = 0
          const match = regex.exec(line)

          if (match) {
            const result: GrepMatch = {
              file,
              line: i + 1, // 1-indexed
              column: match.index + 1, // 1-indexed
              content: line,
            }

            // Add context if requested
            if (contextLines > 0) {
              result.context = {
                before: lines.slice(Math.max(0, i - contextLines), i),
                after: lines.slice(i + 1, i + 1 + contextLines),
              }
            }

            results.push(result)

            if (results.length >= maxResults) break
          }
        }
      } catch {
        // Skip files that can't be read (e.g., directories, binary files)
        continue
      }
    }

    return results
  }

  /**
   * Search and return only file paths containing matches.
   *
   * @param pattern - Regular expression pattern to search for
   * @param options - Search options
   * @returns Array of unique file paths containing matches
   */
  async grepFiles(pattern: string, options?: Omit<GrepOptions, 'pattern'>): Promise<string[]> {
    const matches = await this.grep(pattern, options)
    const uniqueFiles = new Set(matches.map((m) => m.file))
    return Array.from(uniqueFiles)
  }

  /**
   * Count matches per file.
   *
   * @param pattern - Regular expression pattern to search for
   * @param options - Search options
   * @returns Map of file path to match count
   */
  async grepCount(pattern: string, options?: Omit<GrepOptions, 'pattern'>): Promise<Map<string, number>> {
    const { maxResults: _maxResults, ...optionsWithoutLimit } = options ?? {}
    const matches = await this.grep(pattern, optionsWithoutLimit)
    const counts = new Map<string, number>()

    for (const match of matches) {
      counts.set(match.file, (counts.get(match.file) ?? 0) + 1)
    }

    return counts
  }

  /**
   * Search for multiple patterns and return matches for any of them.
   *
   * @param patterns - Array of regex patterns to search for
   * @param options - Search options
   * @returns Array of GrepMatch objects
   */
  async grepAny(patterns: string[], options?: Omit<GrepOptions, 'pattern'>): Promise<GrepMatch[]> {
    // Combine patterns with OR
    const combinedPattern = patterns.map((p) => `(${p})`).join('|')
    return this.grep(combinedPattern, options)
  }

  /**
   * Search with a callback for each match (useful for streaming results).
   *
   * @param pattern - Regular expression pattern to search for
   * @param options - Search options
   * @param callback - Function to call for each match
   */
  async grepStream(
    pattern: string,
    options: Omit<GrepOptions, 'pattern'> | undefined,
    callback: (match: GrepMatch) => void | Promise<void>
  ): Promise<void> {
    const flags = options?.caseInsensitive ? 'gi' : 'g'
    const regex = new RegExp(pattern, flags)
    const contextLines = options?.contextLines ?? 0
    const maxResults = options?.maxResults ?? Infinity

    const filePattern = options?.glob ?? '**/*'
    const files = await this.globMatcher.glob(filePattern)

    let count = 0

    for (const file of files) {
      if (count >= maxResults) break

      try {
        const content = await this.fs.readFile(file)
        if (!content) continue

        const lines = content.split('\n')

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (line === undefined) continue

          regex.lastIndex = 0
          const match = regex.exec(line)

          if (match) {
            const result: GrepMatch = {
              file,
              line: i + 1,
              column: match.index + 1,
              content: line,
            }

            if (contextLines > 0) {
              result.context = {
                before: lines.slice(Math.max(0, i - contextLines), i),
                after: lines.slice(i + 1, i + 1 + contextLines),
              }
            }

            await callback(result)
            count++

            if (count >= maxResults) break
          }
        }
      } catch {
        continue
      }
    }
  }
}

/**
 * Create a grep instance from a FileSystem.
 * Convenience factory function.
 */
export function createGrep(fs: FileSystem, globMatcher?: GlobMatcher): AgentGrep {
  return new AgentGrep(fs, globMatcher)
}
