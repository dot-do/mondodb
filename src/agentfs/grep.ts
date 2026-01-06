/**
 * AgentFS Grep - Content Search Implementation
 *
 * Provides grep-like content search functionality for the AgentFS system.
 * Searches through files in the virtual filesystem using regex patterns.
 *
 * Performance optimizations:
 * - Early termination when maxResults is reached
 * - File-level early exit optimization
 * - Streaming support for processing large result sets
 * - Line-by-line processing to handle large files efficiently
 *
 * Edge case handling:
 * - Windows (CRLF) and Unix (LF) line endings
 * - Binary file detection with null byte check
 * - Empty file handling
 * - Invalid regex pattern error handling
 */

import type { FileSystem, GrepOptions, GrepMatch } from './types'

// =============================================================================
// CONSTANTS & CONFIGURATION
// =============================================================================

/** Threshold for considering a file binary (percentage of null bytes) */
const BINARY_DETECTION_SAMPLE_SIZE = 8192

/** Maximum number of null bytes in sample before considering file binary */
const MAX_NULL_BYTES_FOR_TEXT = 10

// Pre-compiled regex for performance
const WINDOWS_LINE_ENDING = /\r\n/g
const CARRIAGE_RETURN = /\r$/

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
   * Compile a regex pattern safely, handling invalid patterns gracefully.
   * @param pattern - The regex pattern string
   * @param flags - Regex flags to apply
   * @returns Compiled RegExp or null if pattern is invalid
   */
  private compilePattern(pattern: string, flags: string): RegExp | null {
    try {
      return new RegExp(pattern, flags)
    } catch {
      return null
    }
  }

  /**
   * Check if content appears to be binary by looking for null bytes.
   * Only samples the beginning of the content for performance.
   * @param content - File content to check
   * @returns True if content appears to be binary
   */
  private _isBinaryContent(content: string): boolean {
    const sampleSize = Math.min(content.length, BINARY_DETECTION_SAMPLE_SIZE)
    let nullCount = 0

    for (let i = 0; i < sampleSize; i++) {
      if (content.charCodeAt(i) === 0) {
        nullCount++
        if (nullCount > MAX_NULL_BYTES_FOR_TEXT) {
          return true
        }
      }
    }

    return false
  }

  /**
   * Normalize line endings by converting CRLF to LF and removing trailing CR.
   * This ensures consistent line handling across platforms.
   * @param content - Content with potentially mixed line endings
   * @returns Content with normalized line endings
   */
  private normalizeLineEndings(content: string): string {
    // Convert Windows line endings to Unix
    return content.replace(WINDOWS_LINE_ENDING, '\n')
  }

  /**
   * Clean a line by removing trailing carriage return if present.
   * @param line - Line that may have trailing CR
   * @returns Line without trailing CR
   */
  private cleanLine(line: string): string {
    return line.replace(CARRIAGE_RETURN, '')
  }

  /**
   * Search for a pattern in files matching the specified criteria.
   *
   * @param pattern - Regular expression pattern to search for
   * @param options - Search options including file filter, case sensitivity, etc.
   * @returns Array of GrepMatch objects representing found matches
   * @throws {Error} If pattern is an invalid regular expression
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

    // Compile pattern with error handling
    const regex = this.compilePattern(pattern, flags)
    if (!regex) {
      throw new Error(`Invalid regular expression pattern: ${pattern}`)
    }

    const contextLines = options?.contextLines ?? 0
    const maxResults = options?.maxResults ?? Infinity

    // Get files to search using glob pattern or default to all files
    const filePattern = options?.glob ?? '**/*'
    const files = await this.globMatcher.glob(filePattern)

    const results: GrepMatch[] = []

    for (const file of files) {
      // Early termination: stop if we've reached maxResults
      if (results.length >= maxResults) break

      try {
        const content = await this.fs.readFile(file)

        // Skip empty files
        if (!content) continue

        // Skip binary files
        if (this._isBinaryContent(content)) continue

        // Normalize line endings for consistent processing
        const normalizedContent = this.normalizeLineEndings(content)
        const lines = normalizedContent.split('\n')

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (line === undefined) continue

          // Clean the line (remove any remaining CR)
          const cleanedLine = this.cleanLine(line)

          // Reset regex lastIndex for global flag
          regex.lastIndex = 0
          const match = regex.exec(cleanedLine)

          if (match) {
            const result: GrepMatch = {
              file,
              line: i + 1, // 1-indexed
              column: match.index + 1, // 1-indexed
              content: cleanedLine,
            }

            // Add context if requested
            if (contextLines > 0) {
              const beforeLines = lines.slice(Math.max(0, i - contextLines), i)
              const afterLines = lines.slice(i + 1, i + 1 + contextLines)

              result.context = {
                before: beforeLines.map((l) => this.cleanLine(l)),
                after: afterLines.map((l) => this.cleanLine(l)),
              }
            }

            results.push(result)

            // Early termination: stop if we've reached maxResults
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
   * Processes matches as they are found, enabling real-time result handling.
   *
   * @param pattern - Regular expression pattern to search for
   * @param options - Search options
   * @param callback - Function to call for each match (can be async)
   * @throws {Error} If pattern is an invalid regular expression
   */
  async grepStream(
    pattern: string,
    options: Omit<GrepOptions, 'pattern'> | undefined,
    callback: (match: GrepMatch) => void | Promise<void>
  ): Promise<void> {
    const flags = options?.caseInsensitive ? 'gi' : 'g'

    // Compile pattern with error handling
    const regex = this.compilePattern(pattern, flags)
    if (!regex) {
      throw new Error(`Invalid regular expression pattern: ${pattern}`)
    }

    const contextLines = options?.contextLines ?? 0
    const maxResults = options?.maxResults ?? Infinity

    const filePattern = options?.glob ?? '**/*'
    const files = await this.globMatcher.glob(filePattern)

    let count = 0

    for (const file of files) {
      // Early termination
      if (count >= maxResults) break

      try {
        const content = await this.fs.readFile(file)
        if (!content) continue

        // Skip binary files
        if (this._isBinaryContent(content)) continue

        // Normalize line endings for consistent processing
        const normalizedContent = this.normalizeLineEndings(content)
        const lines = normalizedContent.split('\n')

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (line === undefined) continue

          // Clean the line
          const cleanedLine = this.cleanLine(line)

          regex.lastIndex = 0
          const match = regex.exec(cleanedLine)

          if (match) {
            const result: GrepMatch = {
              file,
              line: i + 1,
              column: match.index + 1,
              content: cleanedLine,
            }

            if (contextLines > 0) {
              const beforeLines = lines.slice(Math.max(0, i - contextLines), i)
              const afterLines = lines.slice(i + 1, i + 1 + contextLines)

              result.context = {
                before: beforeLines.map((l) => this.cleanLine(l)),
                after: afterLines.map((l) => this.cleanLine(l)),
              }
            }

            await callback(result)
            count++

            // Early termination
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
