/**
 * Validation functions for database and collection names.
 *
 * These functions are critical for security - they prevent path traversal attacks
 * and SQL injection attempts through malicious database/collection names.
 */

/**
 * Validate and sanitize a database name to prevent path traversal attacks.
 * Throws an error if the name contains dangerous characters or patterns.
 *
 * SECURITY: This function is critical for preventing attacks where malicious
 * database names like "../../../etc/passwd" could be used to read/write
 * files outside the data directory.
 *
 * @throws Error if the database name is invalid or contains path traversal attempts
 */
export function sanitizeDatabaseName(name: string): string {
  // Reject empty names
  if (!name || typeof name !== 'string') {
    throw new Error('Database name must be a non-empty string')
  }

  // Reject path traversal patterns
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw new Error(`Invalid database name "${name}": contains path traversal characters`)
  }

  // Reject null bytes (can bypass path checks in some systems)
  if (name.includes('\0')) {
    throw new Error('Invalid database name: contains null byte')
  }

  // Reject names starting with dots (hidden files)
  if (name.startsWith('.')) {
    throw new Error(`Invalid database name "${name}": cannot start with a dot`)
  }

  // Reject names that are too long (filesystem safety)
  if (name.length > 255) {
    throw new Error(`Database name too long: ${name.length} characters (max 255)`)
  }

  // Only allow alphanumeric, underscore, and hyphen (safe filename characters)
  // This is more restrictive than MongoDB but appropriate for filesystem safety
  const validNameRegex = /^[a-zA-Z0-9_-]+$/
  if (!validNameRegex.test(name)) {
    throw new Error(
      `Invalid database name "${name}": only alphanumeric characters, underscores, and hyphens are allowed`
    )
  }

  return name
}

/**
 * Validate a collection name to prevent injection attacks.
 * Collection names are stored in the database, not used in file paths,
 * but validation prevents SQL-related issues and maintains consistency.
 *
 * @throws Error if the collection name is invalid
 */
export function validateCollectionName(name: string): string {
  // Reject empty names
  if (!name || typeof name !== 'string') {
    throw new Error('Collection name must be a non-empty string')
  }

  // Reject null bytes
  if (name.includes('\0')) {
    throw new Error('Invalid collection name: contains null byte')
  }

  // Reject names that are too long
  if (name.length > 255) {
    throw new Error(`Collection name too long: ${name.length} characters (max 255)`)
  }

  // MongoDB allows more characters in collection names, but we restrict
  // to prevent potential issues. Allow alphanumeric, underscore, hyphen, and dot.
  // Dots are allowed for namespacing (e.g., "system.users")
  const validNameRegex = /^[a-zA-Z_][a-zA-Z0-9_.-]*$/
  if (!validNameRegex.test(name)) {
    throw new Error(
      `Invalid collection name "${name}": must start with a letter or underscore, and contain only alphanumeric characters, underscores, hyphens, and dots`
    )
  }

  // Reject system collection prefixes unless it's a known system collection
  if (name.startsWith('system.') && !['system.users', 'system.indexes', 'system.namespaces'].includes(name)) {
    throw new Error(`Invalid collection name "${name}": cannot use reserved 'system.' prefix`)
  }

  return name
}
