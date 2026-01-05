/**
 * AgentFS Error Classes
 *
 * Hierarchical error classes for AgentFS operations.
 * Provides structured error handling with error codes following POSIX conventions.
 *
 * @module agentfs/errors
 *
 * @example
 * ```typescript
 * import { FileNotFoundError, DirectoryNotEmptyError } from './errors'
 *
 * try {
 *   await fs.readFile('/missing.txt')
 * } catch (error) {
 *   if (error instanceof FileNotFoundError) {
 *     console.log(`File not found: ${error.path}`)
 *   }
 * }
 * ```
 */

/**
 * POSIX-style error codes used by AgentFS
 */
export const AgentFSErrorCode = {
  /** No such file or directory */
  ENOENT: 'ENOENT',
  /** Is a directory (illegal operation on directory) */
  EISDIR: 'EISDIR',
  /** Not a directory */
  ENOTDIR: 'ENOTDIR',
  /** File or directory already exists */
  EEXIST: 'EEXIST',
  /** Directory not empty */
  ENOTEMPTY: 'ENOTEMPTY',
  /** Operation not permitted */
  EPERM: 'EPERM',
  /** Invalid argument */
  EINVAL: 'EINVAL',
  /** I/O error */
  EIO: 'EIO',
  /** Resource temporarily unavailable */
  EAGAIN: 'EAGAIN',
} as const

/**
 * Type for AgentFS error codes
 */
export type AgentFSErrorCodeType = (typeof AgentFSErrorCode)[keyof typeof AgentFSErrorCode]

/**
 * Base error class for all AgentFS errors.
 *
 * Provides structured error handling with:
 * - POSIX-style error codes
 * - Path context for file operations
 * - Retryable flag for transient errors
 * - Cause chaining for wrapped errors
 *
 * @example
 * ```typescript
 * throw new AgentFSError('ENOENT', '/missing.txt', 'no such file or directory')
 * ```
 */
export class AgentFSError extends Error {
  /** POSIX-style error code */
  readonly code: AgentFSErrorCodeType

  /** Path associated with the error (if applicable) */
  readonly path?: string

  /** Whether this error is retryable */
  readonly retryable: boolean

  /**
   * Create a new AgentFSError
   *
   * @param code - POSIX-style error code
   * @param path - Path that caused the error
   * @param message - Human-readable error message
   * @param options - Additional error options
   */
  constructor(
    code: AgentFSErrorCodeType,
    path: string | undefined,
    message: string,
    options?: { retryable?: boolean; cause?: Error }
  ) {
    const fullMessage = path ? `${code}: ${message}, '${path}'` : `${code}: ${message}`
    super(fullMessage, options?.cause ? { cause: options.cause } : undefined)

    this.name = 'AgentFSError'
    this.code = code
    this.path = path
    this.retryable = options?.retryable ?? false

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  /**
   * Create an AgentFSError from a raw Error
   *
   * Attempts to parse POSIX-style error messages like "ENOENT: no such file or directory, '/path'"
   */
  static fromError(error: Error): AgentFSError {
    const match = error.message.match(/^([A-Z]+): (.+?), '([^']+)'$/)
    if (match) {
      const [, code, message, path] = match
      if (code && isValidErrorCode(code) && message && path) {
        return new AgentFSError(code, path, message)
      }
    }

    // Fallback to generic I/O error
    return new AgentFSError(AgentFSErrorCode.EIO, undefined, error.message, { cause: error })
  }

  /**
   * Convert to a plain object for JSON serialization
   */
  toJSON(): { code: string; message: string; path?: string; retryable: boolean } {
    return {
      code: this.code,
      message: this.message,
      ...(this.path && { path: this.path }),
      retryable: this.retryable,
    }
  }
}

/**
 * Check if a string is a valid AgentFS error code
 */
function isValidErrorCode(code: string): code is AgentFSErrorCodeType {
  return Object.values(AgentFSErrorCode).includes(code as AgentFSErrorCodeType)
}

/**
 * Error thrown when a file or directory does not exist.
 *
 * @example
 * ```typescript
 * throw new FileNotFoundError('/missing.txt')
 * ```
 */
export class FileNotFoundError extends AgentFSError {
  constructor(path: string, options?: { cause?: Error }) {
    super(AgentFSErrorCode.ENOENT, path, 'no such file or directory', options)
    this.name = 'FileNotFoundError'
  }
}

/**
 * Error thrown when attempting a file operation on a directory.
 *
 * @example
 * ```typescript
 * // Thrown when trying to read a directory as a file
 * throw new IsDirectoryError('/some/directory')
 * ```
 */
export class IsDirectoryError extends AgentFSError {
  constructor(path: string, options?: { cause?: Error }) {
    super(AgentFSErrorCode.EISDIR, path, 'illegal operation on a directory', options)
    this.name = 'IsDirectoryError'
  }
}

/**
 * Error thrown when a directory operation is performed on a file.
 *
 * @example
 * ```typescript
 * // Thrown when trying to list a file as a directory
 * throw new NotDirectoryError('/some/file.txt')
 * ```
 */
export class NotDirectoryError extends AgentFSError {
  constructor(path: string, options?: { cause?: Error }) {
    super(AgentFSErrorCode.ENOTDIR, path, 'not a directory', options)
    this.name = 'NotDirectoryError'
  }
}

/**
 * Error thrown when a file or directory already exists.
 *
 * @example
 * ```typescript
 * // Thrown when trying to create a directory where a file exists
 * throw new FileExistsError('/existing/file.txt')
 * ```
 */
export class FileExistsError extends AgentFSError {
  constructor(path: string, options?: { cause?: Error }) {
    super(AgentFSErrorCode.EEXIST, path, 'file already exists', options)
    this.name = 'FileExistsError'
  }
}

/**
 * Error thrown when trying to remove a non-empty directory.
 *
 * @example
 * ```typescript
 * throw new DirectoryNotEmptyError('/non/empty/dir')
 * ```
 */
export class DirectoryNotEmptyError extends AgentFSError {
  constructor(path: string, options?: { cause?: Error }) {
    super(AgentFSErrorCode.ENOTEMPTY, path, 'directory not empty', options)
    this.name = 'DirectoryNotEmptyError'
  }
}

/**
 * Error thrown when an operation is not permitted.
 *
 * @example
 * ```typescript
 * // Thrown when trying to delete root directory
 * throw new OperationNotPermittedError('/')
 * ```
 */
export class OperationNotPermittedError extends AgentFSError {
  constructor(path: string, message?: string, options?: { cause?: Error }) {
    super(AgentFSErrorCode.EPERM, path, message ?? 'operation not permitted', options)
    this.name = 'OperationNotPermittedError'
  }
}

/**
 * Error thrown when an argument is invalid.
 *
 * @example
 * ```typescript
 * throw new InvalidArgumentError('path', 'Path must be absolute')
 * ```
 */
export class InvalidArgumentError extends AgentFSError {
  /** The argument name that was invalid */
  readonly argument: string

  constructor(argument: string, message: string, options?: { cause?: Error }) {
    super(AgentFSErrorCode.EINVAL, undefined, `${argument}: ${message}`, options)
    this.name = 'InvalidArgumentError'
    this.argument = argument
  }
}

/**
 * Error thrown for I/O operations that fail.
 *
 * @example
 * ```typescript
 * throw new IOError('/path', 'disk full')
 * ```
 */
export class IOError extends AgentFSError {
  constructor(path: string | undefined, message: string, options?: { retryable?: boolean; cause?: Error }) {
    super(AgentFSErrorCode.EIO, path, message, { retryable: options?.retryable ?? true, ...options })
    this.name = 'IOError'
  }
}

/**
 * Error thrown when a key is not found in the KV store.
 *
 * @example
 * ```typescript
 * throw new KeyNotFoundError('session:abc123')
 * ```
 */
export class KeyNotFoundError extends AgentFSError {
  /** The key that was not found */
  readonly key: string

  constructor(key: string, options?: { cause?: Error }) {
    super(AgentFSErrorCode.ENOENT, undefined, `key not found: ${key}`, options)
    this.name = 'KeyNotFoundError'
    this.key = key
  }
}

/**
 * Error thrown when an invalid glob or regex pattern is provided.
 *
 * @example
 * ```typescript
 * throw new PatternError('**[invalid', 'Unclosed character class')
 * ```
 */
export class PatternError extends AgentFSError {
  /** The invalid pattern */
  readonly pattern: string

  constructor(pattern: string, message: string, options?: { cause?: Error }) {
    super(AgentFSErrorCode.EINVAL, undefined, `invalid pattern '${pattern}': ${message}`, options)
    this.name = 'PatternError'
    this.pattern = pattern
  }
}

/**
 * Type guard to check if an error is an AgentFSError
 *
 * @example
 * ```typescript
 * if (isAgentFSError(error)) {
 *   console.log(`Error code: ${error.code}`)
 * }
 * ```
 */
export function isAgentFSError(error: unknown): error is AgentFSError {
  return error instanceof AgentFSError
}

/**
 * Type guard to check if an error has a specific code
 *
 * @example
 * ```typescript
 * if (hasErrorCode(error, 'ENOENT')) {
 *   // Handle file not found
 * }
 * ```
 */
export function hasErrorCode(error: unknown, code: AgentFSErrorCodeType): boolean {
  return isAgentFSError(error) && error.code === code
}
