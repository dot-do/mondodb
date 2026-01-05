/**
 * Mock for bun:sqlite module
 *
 * This mock provides a minimal implementation of Bun's SQLite module
 * for use in Vitest tests running in the Cloudflare Workers pool.
 * The actual bun:sqlite module is only available in the Bun runtime.
 */

/**
 * Mock Statement class
 */
export class Statement {
  private sql: string

  constructor(sql: string) {
    this.sql = sql
  }

  run(..._params: unknown[]): { changes: number; lastInsertRowid: number } {
    return { changes: 0, lastInsertRowid: 0 }
  }

  get(..._params: unknown[]): unknown {
    return null
  }

  all(..._params: unknown[]): unknown[] {
    return []
  }

  values(..._params: unknown[]): unknown[][] {
    return []
  }

  finalize(): void {
    // No-op
  }

  toString(): string {
    return this.sql
  }
}

/**
 * Mock Database class
 */
export class Database {
  private filename: string
  private closed: boolean = false

  constructor(filename?: string, _options?: { readonly?: boolean; create?: boolean; readwrite?: boolean }) {
    this.filename = filename || ':memory:'
  }

  exec(sql: string): void {
    if (this.closed) {
      throw new Error('Database is closed')
    }
    // No-op for mock
    void sql
  }

  prepare(sql: string): Statement {
    if (this.closed) {
      throw new Error('Database is closed')
    }
    return new Statement(sql)
  }

  query(sql: string): Statement {
    if (this.closed) {
      throw new Error('Database is closed')
    }
    return new Statement(sql)
  }

  run(sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number } {
    if (this.closed) {
      throw new Error('Database is closed')
    }
    return this.prepare(sql).run(...params)
  }

  transaction<T>(fn: () => T): () => T {
    return () => {
      if (this.closed) {
        throw new Error('Database is closed')
      }
      return fn()
    }
  }

  close(): void {
    this.closed = true
  }

  get inTransaction(): boolean {
    return false
  }

  get filename(): string {
    return this.filename
  }
}

/**
 * SQL template tag (mock implementation)
 */
export function sql(strings: TemplateStringsArray, ...values: unknown[]): string {
  let result = strings[0] || ''
  for (let i = 0; i < values.length; i++) {
    result += String(values[i]) + (strings[i + 1] || '')
  }
  return result
}

// Type exports to match bun:sqlite types
export type SQLQueryBindings = string | number | bigint | boolean | null | Uint8Array

// Default export for compatibility
export default {
  Database,
  Statement,
  sql,
}
