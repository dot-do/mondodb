/**
 * SQL Safety Utilities
 *
 * Functions to validate and sanitize field names and identifiers
 * to prevent SQL injection attacks.
 */

/**
 * Regular expression pattern for valid MongoDB field names.
 * Allows alphanumeric characters, underscores, dots (for nested paths),
 * hyphens, and dollar signs (for operators/special fields).
 */
const SAFE_FIELD_PATTERN = /^[a-zA-Z0-9_.$-]+$/

/**
 * Regular expression pattern for valid SQL identifiers.
 * Only allows alphanumeric characters and underscores.
 */
const SAFE_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/

/**
 * Validates and returns a field name/path for safe use in SQL json_extract expressions.
 * Prevents SQL injection by only allowing safe characters in field paths.
 *
 * @param field - The field name or dot-notation path to validate
 * @returns The validated field name (unchanged if valid)
 * @throws Error if field name contains invalid characters
 *
 * @example
 * validateFieldPath('name')           // returns 'name'
 * validateFieldPath('user.address')   // returns 'user.address'
 * validateFieldPath("foo'; DROP--")   // throws Error
 */
export function validateFieldPath(field: string): string {
  if (!field || field.length === 0) {
    throw new Error('Field name cannot be empty')
  }

  // Check for null bytes
  if (field.includes('\0')) {
    throw new Error('Field name cannot contain null characters')
  }

  // Check against safe pattern
  if (!SAFE_FIELD_PATTERN.test(field)) {
    throw new Error(
      `Invalid field name: "${field}". Field names can only contain alphanumeric characters, underscores, dots, hyphens, and dollar signs.`
    )
  }

  // Validate dot notation structure
  if (field.includes('..') || field.startsWith('.') || field.endsWith('.')) {
    throw new Error(
      `Invalid field path: "${field}". Field paths cannot have consecutive, leading, or trailing dots.`
    )
  }

  return field
}

/**
 * Validates an identifier (table name, index name, column name) for safe use in SQL.
 * Only allows alphanumeric characters and underscores, must start with letter or underscore.
 *
 * @param identifier - The identifier to validate
 * @returns The validated identifier (unchanged if valid)
 * @throws Error if identifier contains invalid characters
 *
 * @example
 * validateIdentifier('users')         // returns 'users'
 * validateIdentifier('my_table_1')    // returns 'my_table_1'
 * validateIdentifier('1table')        // throws Error (starts with number)
 * validateIdentifier("users'; DROP--")// throws Error
 */
export function validateIdentifier(identifier: string): string {
  if (!identifier || identifier.length === 0) {
    throw new Error('Identifier cannot be empty')
  }

  // Check for null bytes
  if (identifier.includes('\0')) {
    throw new Error('Identifier cannot contain null characters')
  }

  // Check against safe pattern
  if (!SAFE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(
      `Invalid identifier: "${identifier}". Identifiers can only contain alphanumeric characters and underscores, and must start with a letter or underscore.`
    )
  }

  return identifier
}

/**
 * Creates a safe JSON path expression for use in json_extract().
 * Validates the field name and returns the properly formatted path.
 *
 * @param field - The field name or dot-notation path
 * @returns The JSON path string (e.g., '$.field.name')
 * @throws Error if field name is invalid
 *
 * @example
 * safeJsonPath('name')         // returns '$.name'
 * safeJsonPath('user.address') // returns '$.user.address'
 * safeJsonPath('$special')     // returns '$.$special' (preserves leading $)
 */
export function safeJsonPath(field: string): string {
  const validField = validateFieldPath(field)
  return validField.startsWith('$') ? validField : `$.${validField}`
}

/**
 * Creates a safe json_extract expression for use in SQL.
 * Validates the field name and returns the complete expression.
 *
 * @param dataColumn - The name of the JSON data column (e.g., 'data', 'value')
 * @param field - The field name or dot-notation path
 * @returns The json_extract expression (e.g., "json_extract(data, '$.field')")
 * @throws Error if field name is invalid
 *
 * @example
 * safeJsonExtract('data', 'name')    // returns "json_extract(data, '$.name')"
 * safeJsonExtract('value', 'a.b')    // returns "json_extract(value, '$.a.b')"
 */
export function safeJsonExtract(dataColumn: string, field: string): string {
  validateIdentifier(dataColumn)
  const jsonPath = safeJsonPath(field)
  return `json_extract(${dataColumn}, '${jsonPath}')`
}
