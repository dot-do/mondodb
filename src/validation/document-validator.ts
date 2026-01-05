/**
 * Document Validator - JSON Schema validation for MongoDB documents
 *
 * Provides MongoDB-compatible document validation using JSON Schema.
 * Supports validation on insert/update operations with proper error reporting.
 */

import type { Document } from '../types/mongodb'

/**
 * MongoDB error code for document validation failure
 */
export const DOCUMENT_VALIDATION_FAILURE_CODE = 121
export const DOCUMENT_VALIDATION_FAILURE_NAME = 'DocumentValidationFailure'

/**
 * JSON Schema types supported by MongoDB
 */
export type JsonSchemaType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null'
  | 'binData'
  | 'objectId'
  | 'date'
  | 'regex'
  | 'double'
  | 'int'
  | 'long'
  | 'decimal'
  | 'timestamp'

/**
 * JSON Schema definition compatible with MongoDB's $jsonSchema
 */
export interface JsonSchema {
  bsonType?: JsonSchemaType | JsonSchemaType[]
  type?: JsonSchemaType | JsonSchemaType[]
  title?: string
  description?: string
  required?: string[]
  properties?: Record<string, JsonSchema>
  additionalProperties?: boolean | JsonSchema
  patternProperties?: Record<string, JsonSchema>
  items?: JsonSchema | JsonSchema[]
  additionalItems?: boolean | JsonSchema
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number | boolean
  exclusiveMaximum?: number | boolean
  multipleOf?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  enum?: unknown[]
  const?: unknown
  allOf?: JsonSchema[]
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  not?: JsonSchema
  if?: JsonSchema
  then?: JsonSchema
  else?: JsonSchema
}

/**
 * MongoDB validator specification
 */
export interface ValidatorSpec {
  $jsonSchema?: JsonSchema
  $and?: ValidatorSpec[]
  $or?: ValidatorSpec[]
  [key: string]: unknown
}

/**
 * Validation level: how strictly to enforce validation
 */
export type ValidationLevel = 'off' | 'strict' | 'moderate'

/**
 * Validation action: what to do when validation fails
 */
export type ValidationAction = 'error' | 'warn'

/**
 * Validation options for a collection
 */
export interface ValidationOptions {
  validator?: ValidatorSpec
  validationLevel?: ValidationLevel
  validationAction?: ValidationAction
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

/**
 * Validation error details
 */
export interface ValidationError {
  path: string
  message: string
  schemaPath?: string
  keyword?: string
  params?: Record<string, unknown>
}

/**
 * MongoDB-style document validation error
 */
export class DocumentValidationError extends Error {
  readonly code: number = DOCUMENT_VALIDATION_FAILURE_CODE
  readonly codeName: string = DOCUMENT_VALIDATION_FAILURE_NAME
  readonly ok: 0 = 0
  readonly errmsg: string
  readonly details: ValidationError[]

  constructor(message: string, details: ValidationError[] = []) {
    super(message)
    this.name = 'DocumentValidationError'
    this.errmsg = message
    this.details = details
  }

  /**
   * Convert to MongoDB error format
   */
  toMongoError(): {
    ok: 0
    errmsg: string
    code: number
    codeName: string
  } {
    return {
      ok: 0,
      errmsg: this.errmsg,
      code: this.code,
      codeName: this.codeName,
    }
  }
}

/**
 * Document Validator class
 *
 * Validates documents against JSON Schema specifications
 * following MongoDB's $jsonSchema format.
 */
export class DocumentValidator {
  private readonly validator: ValidatorSpec | undefined
  private readonly validationLevel: ValidationLevel
  private readonly validationAction: ValidationAction

  constructor(options: ValidationOptions = {}) {
    this.validator = options.validator
    this.validationLevel = options.validationLevel ?? 'strict'
    this.validationAction = options.validationAction ?? 'error'
  }

  /**
   * Check if validation is enabled
   */
  get isEnabled(): boolean {
    return this.validationLevel !== 'off' && this.validator !== undefined
  }

  /**
   * Check if validation should throw errors
   */
  get shouldError(): boolean {
    return this.validationAction === 'error'
  }

  /**
   * Validate a document for insert
   *
   * @param document - The document to validate
   * @returns Validation result
   */
  validateInsert(document: Document): ValidationResult {
    if (!this.isEnabled) {
      return { valid: true, errors: [] }
    }

    return this.validateDocument(document)
  }

  /**
   * Validate a document after update
   *
   * For 'strict' level: validates the resulting document
   * For 'moderate' level: only validates if the update modifies fields in the schema
   *
   * @param originalDocument - The document before update
   * @param resultingDocument - The document after update
   * @param modifiedFields - Set of field paths that were modified
   * @returns Validation result
   */
  validateUpdate(
    _originalDocument: Document,
    resultingDocument: Document,
    modifiedFields?: Set<string>
  ): ValidationResult {
    if (!this.isEnabled) {
      return { valid: true, errors: [] }
    }

    // For 'moderate' level, only validate if modified fields overlap with schema
    if (this.validationLevel === 'moderate' && modifiedFields) {
      const schemaFields = this.getSchemaFields()
      const hasOverlap = [...modifiedFields].some((field) => {
        // Check if field or any parent/child is in schema
        return schemaFields.some(
          (sf) => sf === field || sf.startsWith(field + '.') || field.startsWith(sf + '.')
        )
      })

      if (!hasOverlap) {
        return { valid: true, errors: [] }
      }
    }

    return this.validateDocument(resultingDocument)
  }

  /**
   * Validate a document for replace operation
   *
   * @param replacement - The replacement document
   * @returns Validation result
   */
  validateReplace(replacement: Document): ValidationResult {
    if (!this.isEnabled) {
      return { valid: true, errors: [] }
    }

    return this.validateDocument(replacement)
  }

  /**
   * Validate a document against the schema
   *
   * @param document - The document to validate
   * @returns Validation result
   */
  private validateDocument(document: Document): ValidationResult {
    if (!this.validator) {
      return { valid: true, errors: [] }
    }

    const errors: ValidationError[] = []

    // Handle $jsonSchema validator
    if (this.validator.$jsonSchema) {
      this.validateJsonSchema(document, this.validator.$jsonSchema, '', errors)
    }

    // Handle $and validator
    if (this.validator.$and) {
      for (const subValidator of this.validator.$and) {
        const subResult = new DocumentValidator({
          validator: subValidator,
          validationLevel: this.validationLevel,
          validationAction: this.validationAction,
        }).validateDocument(document)
        errors.push(...subResult.errors)
      }
    }

    // Handle $or validator
    if (this.validator.$or) {
      const orResults = this.validator.$or.map((subValidator) =>
        new DocumentValidator({
          validator: subValidator,
          validationLevel: this.validationLevel,
          validationAction: this.validationAction,
        }).validateDocument(document)
      )

      // At least one must pass
      const anyValid = orResults.some((r) => r.valid)
      if (!anyValid) {
        errors.push({
          path: '',
          message: 'Document failed all $or conditions',
          keyword: '$or',
        })
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * Validate against JSON Schema
   */
  private validateJsonSchema(
    value: unknown,
    schema: JsonSchema,
    path: string,
    errors: ValidationError[]
  ): void {
    // Handle type/bsonType validation
    const expectedType = schema.bsonType ?? schema.type
    if (expectedType) {
      const types = Array.isArray(expectedType) ? expectedType : [expectedType]
      const actualType = this.getBsonType(value)

      if (!types.includes(actualType as JsonSchemaType)) {
        errors.push({
          path,
          message: `Expected ${types.join(' or ')} but got ${actualType}`,
          keyword: 'bsonType',
          params: { expected: types, actual: actualType },
        })
        return // Don't continue validation if type doesn't match
      }
    }

    // Handle required fields (for objects)
    if (schema.required && typeof value === 'object' && value !== null) {
      const doc = value as Record<string, unknown>
      for (const field of schema.required) {
        if (!(field in doc) || doc[field] === undefined) {
          errors.push({
            path: path ? `${path}.${field}` : field,
            message: `Missing required field: ${field}`,
            keyword: 'required',
            params: { field },
          })
        }
      }
    }

    // Handle properties (for objects)
    if (schema.properties && typeof value === 'object' && value !== null) {
      const doc = value as Record<string, unknown>
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (propName in doc) {
          this.validateJsonSchema(
            doc[propName],
            propSchema,
            path ? `${path}.${propName}` : propName,
            errors
          )
        }
      }
    }

    // Handle additionalProperties
    if (schema.additionalProperties === false && typeof value === 'object' && value !== null) {
      const doc = value as Record<string, unknown>
      const allowedProps = new Set(Object.keys(schema.properties ?? {}))
      for (const key of Object.keys(doc)) {
        if (!allowedProps.has(key) && key !== '_id') {
          errors.push({
            path: path ? `${path}.${key}` : key,
            message: `Additional property not allowed: ${key}`,
            keyword: 'additionalProperties',
            params: { additionalProperty: key },
          })
        }
      }
    }

    // Handle array items
    if (schema.items && Array.isArray(value)) {
      const itemSchema = Array.isArray(schema.items) ? schema.items : [schema.items]
      for (let i = 0; i < value.length; i++) {
        const schemaForItem = itemSchema[Math.min(i, itemSchema.length - 1)]
        this.validateJsonSchema(value[i], schemaForItem, `${path}[${i}]`, errors)
      }
    }

    // Handle array constraints
    if (Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        errors.push({
          path,
          message: `Array must have at least ${schema.minItems} items`,
          keyword: 'minItems',
          params: { minItems: schema.minItems, actual: value.length },
        })
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        errors.push({
          path,
          message: `Array must have at most ${schema.maxItems} items`,
          keyword: 'maxItems',
          params: { maxItems: schema.maxItems, actual: value.length },
        })
      }
      if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) {
        errors.push({
          path,
          message: 'Array items must be unique',
          keyword: 'uniqueItems',
        })
      }
    }

    // Handle string constraints
    if (typeof value === 'string') {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push({
          path,
          message: `String must be at least ${schema.minLength} characters`,
          keyword: 'minLength',
          params: { minLength: schema.minLength, actual: value.length },
        })
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        errors.push({
          path,
          message: `String must be at most ${schema.maxLength} characters`,
          keyword: 'maxLength',
          params: { maxLength: schema.maxLength, actual: value.length },
        })
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
        errors.push({
          path,
          message: `String does not match pattern: ${schema.pattern}`,
          keyword: 'pattern',
          params: { pattern: schema.pattern },
        })
      }
    }

    // Handle number constraints
    if (typeof value === 'number') {
      if (schema.minimum !== undefined) {
        const excl =
          typeof schema.exclusiveMinimum === 'boolean' ? schema.exclusiveMinimum : false
        if (excl ? value <= schema.minimum : value < schema.minimum) {
          errors.push({
            path,
            message: `Value must be ${excl ? 'greater than' : 'at least'} ${schema.minimum}`,
            keyword: excl ? 'exclusiveMinimum' : 'minimum',
            params: { minimum: schema.minimum, exclusive: excl },
          })
        }
      }
      if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) {
        errors.push({
          path,
          message: `Value must be greater than ${schema.exclusiveMinimum}`,
          keyword: 'exclusiveMinimum',
          params: { exclusiveMinimum: schema.exclusiveMinimum },
        })
      }
      if (schema.maximum !== undefined) {
        const excl =
          typeof schema.exclusiveMaximum === 'boolean' ? schema.exclusiveMaximum : false
        if (excl ? value >= schema.maximum : value > schema.maximum) {
          errors.push({
            path,
            message: `Value must be ${excl ? 'less than' : 'at most'} ${schema.maximum}`,
            keyword: excl ? 'exclusiveMaximum' : 'maximum',
            params: { maximum: schema.maximum, exclusive: excl },
          })
        }
      }
      if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum) {
        errors.push({
          path,
          message: `Value must be less than ${schema.exclusiveMaximum}`,
          keyword: 'exclusiveMaximum',
          params: { exclusiveMaximum: schema.exclusiveMaximum },
        })
      }
      if (schema.multipleOf !== undefined && value % schema.multipleOf !== 0) {
        errors.push({
          path,
          message: `Value must be a multiple of ${schema.multipleOf}`,
          keyword: 'multipleOf',
          params: { multipleOf: schema.multipleOf },
        })
      }
    }

    // Handle enum constraint
    if (schema.enum !== undefined) {
      const matches = schema.enum.some((e) => this.deepEqual(e, value))
      if (!matches) {
        errors.push({
          path,
          message: `Value must be one of: ${JSON.stringify(schema.enum)}`,
          keyword: 'enum',
          params: { enum: schema.enum },
        })
      }
    }

    // Handle const constraint
    if (schema.const !== undefined && !this.deepEqual(schema.const, value)) {
      errors.push({
        path,
        message: `Value must be exactly: ${JSON.stringify(schema.const)}`,
        keyword: 'const',
        params: { const: schema.const },
      })
    }

    // Handle allOf
    if (schema.allOf) {
      for (const subSchema of schema.allOf) {
        this.validateJsonSchema(value, subSchema, path, errors)
      }
    }

    // Handle anyOf
    if (schema.anyOf) {
      const subErrors: ValidationError[][] = []
      let anyValid = false
      for (const subSchema of schema.anyOf) {
        const subErr: ValidationError[] = []
        this.validateJsonSchema(value, subSchema, path, subErr)
        if (subErr.length === 0) {
          anyValid = true
          break
        }
        subErrors.push(subErr)
      }
      if (!anyValid) {
        errors.push({
          path,
          message: 'Value does not match any of the allowed schemas',
          keyword: 'anyOf',
        })
      }
    }

    // Handle oneOf
    if (schema.oneOf) {
      let matchCount = 0
      for (const subSchema of schema.oneOf) {
        const subErr: ValidationError[] = []
        this.validateJsonSchema(value, subSchema, path, subErr)
        if (subErr.length === 0) {
          matchCount++
        }
      }
      if (matchCount !== 1) {
        errors.push({
          path,
          message: `Value must match exactly one schema, but matched ${matchCount}`,
          keyword: 'oneOf',
          params: { matchCount },
        })
      }
    }

    // Handle not
    if (schema.not) {
      const notErrors: ValidationError[] = []
      this.validateJsonSchema(value, schema.not, path, notErrors)
      if (notErrors.length === 0) {
        errors.push({
          path,
          message: 'Value must not match the schema',
          keyword: 'not',
        })
      }
    }

    // Handle if/then/else
    if (schema.if) {
      const ifErrors: ValidationError[] = []
      this.validateJsonSchema(value, schema.if, path, ifErrors)
      const conditionMet = ifErrors.length === 0

      if (conditionMet && schema.then) {
        this.validateJsonSchema(value, schema.then, path, errors)
      } else if (!conditionMet && schema.else) {
        this.validateJsonSchema(value, schema.else, path, errors)
      }
    }
  }

  /**
   * Get BSON type of a value
   */
  private getBsonType(value: unknown): string {
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'
    if (Array.isArray(value)) return 'array'
    if (value instanceof Date) return 'date'
    if (value instanceof RegExp) return 'regex'

    // Check for ObjectId-like objects
    if (
      typeof value === 'object' &&
      value !== null &&
      'toHexString' in value &&
      typeof (value as { toHexString: unknown }).toHexString === 'function'
    ) {
      return 'objectId'
    }

    const jsType = typeof value
    if (jsType === 'number') {
      if (Number.isInteger(value)) return 'int'
      return 'double'
    }

    return jsType // 'string', 'boolean', 'object'
  }

  /**
   * Deep equality check
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true
    if (a === null || b === null) return false
    if (typeof a !== typeof b) return false

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false
      return a.every((v, i) => this.deepEqual(v, b[i]))
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a as object)
      const keysB = Object.keys(b as object)
      if (keysA.length !== keysB.length) return false
      return keysA.every((key) =>
        this.deepEqual(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key]
        )
      )
    }

    return false
  }

  /**
   * Get all field paths defined in the schema
   */
  private getSchemaFields(): string[] {
    const fields: string[] = []
    if (this.validator?.$jsonSchema?.properties) {
      this.collectPropertyPaths(this.validator.$jsonSchema.properties, '', fields)
    }
    return fields
  }

  /**
   * Recursively collect property paths from schema
   */
  private collectPropertyPaths(
    properties: Record<string, JsonSchema>,
    prefix: string,
    fields: string[]
  ): void {
    for (const [key, schema] of Object.entries(properties)) {
      const path = prefix ? `${prefix}.${key}` : key
      fields.push(path)
      if (schema.properties) {
        this.collectPropertyPaths(schema.properties, path, fields)
      }
    }
  }
}

/**
 * Create a validation error for insert/update operations
 */
export function createValidationError(
  result: ValidationResult,
  _operation: 'insert' | 'update' | 'replace' = 'insert'
): DocumentValidationError {
  const message =
    result.errors.length > 0
      ? `Document failed validation: ${result.errors[0].message}`
      : 'Document failed validation'

  return new DocumentValidationError(message, result.errors)
}

/**
 * Validate a document and throw if validation fails
 */
export function validateOrThrow(
  validator: DocumentValidator,
  document: Document,
  operation: 'insert' | 'update' | 'replace' = 'insert'
): void {
  let result: ValidationResult

  switch (operation) {
    case 'insert':
      result = validator.validateInsert(document)
      break
    case 'replace':
      result = validator.validateReplace(document)
      break
    default:
      result = validator.validateInsert(document)
  }

  if (!result.valid && validator.shouldError) {
    throw createValidationError(result, operation)
  }
}
