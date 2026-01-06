/**
 * CodeGenerator Interface and Language-Specific Implementations
 *
 * This module provides a common interface for generating MongoDB driver code
 * in different programming languages (JavaScript, Python, etc.).
 */

/**
 * Options for code generation
 */
export interface GeneratorOptions {
  connectionUri?: string
  database?: string
  collection?: string
}

/**
 * CodeGenerator interface defines the contract for language-specific code generators.
 * Each implementation must provide:
 * - language: string identifier for the target language
 * - generate(): method to produce driver code from a pipeline
 */
export interface CodeGenerator {
  /**
   * Identifier for the target programming language
   */
  language: string

  /**
   * Generate driver code for executing the given aggregation pipeline
   * @param pipeline - Array of MongoDB aggregation stages
   * @param options - Generation options (connection URI, database, collection)
   * @returns Generated code as a string
   */
  generate(pipeline: unknown[], options: GeneratorOptions): string
}

/**
 * Helper function to format a pipeline array as a JSON string with indentation
 */
function formatPipeline(pipeline: unknown[], indent: string = '  '): string {
  return JSON.stringify(pipeline, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : indent + line))
    .join('\n')
}

/**
 * JavaScript/Node.js code generator
 *
 * Generates code using the mongodb driver with require() syntax.
 */
export class JavaScriptGenerator implements CodeGenerator {
  language = 'javascript'

  generate(pipeline: unknown[], options: GeneratorOptions): string {
    const connectionUri = options.connectionUri || '<YOUR_CONNECTION_STRING>'
    const database = options.database || 'test'
    const collection = options.collection || 'collection'

    const pipelineStr = formatPipeline(pipeline)

    return `const { MongoClient } = require('mongodb');

const uri = '${connectionUri}';
const client = new MongoClient(uri);

const pipeline = ${pipelineStr};

async function run() {
  try {
    await client.connect();
    const db = client.db('${database}');
    const coll = db.collection('${collection}');

    const results = await coll.aggregate(pipeline).toArray();
    console.log(results);
  } finally {
    await client.close();
  }
}

run().catch(console.error);`
  }
}

/**
 * Helper function to convert a JavaScript value to Python syntax
 */
function toPythonValue(value: unknown): string {
  if (value === null) {
    return 'None'
  }
  if (value === true) {
    return 'True'
  }
  if (value === false) {
    return 'False'
  }
  if (typeof value === 'string') {
    // Escape backslashes and quotes, use double quotes
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return `"${escaped}"`
  }
  if (typeof value === 'number') {
    return String(value)
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]'
    }
    const items = value.map(toPythonValue)
    return `[${items.join(', ')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) {
      return '{}'
    }
    const items = entries.map(([k, v]) => `"${k}": ${toPythonValue(v)}`)
    return `{${items.join(', ')}}`
  }
  return String(value)
}

/**
 * Format a pipeline array as Python list syntax with proper indentation
 */
function formatPythonPipeline(pipeline: unknown[], baseIndent: string = ''): string {
  if (pipeline.length === 0) {
    return '[]'
  }

  const lines: string[] = ['[']
  for (let i = 0; i < pipeline.length; i++) {
    const stage = pipeline[i]
    const stageStr = formatPythonObject(stage as Record<string, unknown>, baseIndent + '    ')
    const comma = i < pipeline.length - 1 ? ',' : ''
    lines.push(`${baseIndent}    ${stageStr}${comma}`)
  }
  lines.push(`${baseIndent}]`)
  return lines.join('\n')
}

/**
 * Format a single object as Python dict with proper formatting
 */
function formatPythonObject(obj: Record<string, unknown>, baseIndent: string = ''): string {
  const entries = Object.entries(obj)
  if (entries.length === 0) {
    return '{}'
  }

  const parts: string[] = []
  for (const [key, value] of entries) {
    parts.push(`"${key}": ${formatPythonValuePretty(value, baseIndent)}`)
  }

  // Single line for simple objects
  if (parts.length <= 2 && parts.every(p => p.length < 40)) {
    return `{${parts.join(', ')}}`
  }

  // Multi-line for complex objects
  return `{\n${baseIndent}    ${parts.join(',\n' + baseIndent + '    ')}\n${baseIndent}}`
}

/**
 * Format a value with pretty printing for Python
 */
function formatPythonValuePretty(value: unknown, baseIndent: string = ''): string {
  if (value === null) {
    return 'None'
  }
  if (value === true) {
    return 'True'
  }
  if (value === false) {
    return 'False'
  }
  if (typeof value === 'string') {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return `"${escaped}"`
  }
  if (typeof value === 'number') {
    return String(value)
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]'
    }
    const items = value.map(v => formatPythonValuePretty(v, baseIndent + '    '))
    if (items.every(i => i.length < 30) && items.length <= 5) {
      return `[${items.join(', ')}]`
    }
    return `[\n${baseIndent}        ${items.join(',\n' + baseIndent + '        ')}\n${baseIndent}    ]`
  }
  if (typeof value === 'object') {
    return formatPythonObject(value as Record<string, unknown>, baseIndent + '    ')
  }
  return String(value)
}

/**
 * Python code generator
 *
 * Generates code using the pymongo driver with import syntax.
 * Converts JavaScript booleans and null to Python True/False/None.
 */
export class PythonGenerator implements CodeGenerator {
  language = 'python'

  generate(pipeline: unknown[], options: GeneratorOptions): string {
    const connectionUri = options.connectionUri || '<YOUR_CONNECTION_STRING>'
    const database = options.database || 'test'
    const collection = options.collection || 'collection'

    const pipelineStr = formatPythonPipeline(pipeline)

    return `from pymongo import MongoClient

uri = "${connectionUri}"
client = MongoClient(uri)

db = client["${database}"]
collection = db["${collection}"]

pipeline = ${pipelineStr}

results = list(collection.aggregate(pipeline))
print(results)

client.close()`
  }
}
