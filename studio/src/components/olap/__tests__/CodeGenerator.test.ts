/**
 * CodeGenerator Interface Unit Tests
 *
 * RED Phase: These tests define the expected behavior for the CodeGenerator interface
 * and its language-specific implementations (JavaScriptGenerator, PythonGenerator).
 *
 * The CodeGenerator interface should:
 * 1. Define a common contract for language-specific code generators
 * 2. Have a `language` property identifying the target language
 * 3. Have a `generate(pipeline, options)` method that produces driver code
 *
 * Each generator implementation should:
 * - Implement the CodeGenerator interface
 * - Generate valid, syntactically correct code for its target language
 * - Include proper imports/requires for the MongoDB driver
 * - Handle empty pipelines gracefully
 * - Support connection URI options
 */

import { describe, it, expect } from 'vitest'
import {
  CodeGenerator,
  JavaScriptGenerator,
  PythonGenerator,
} from '../CodeGenerator'

describe('CodeGenerator Interface', () => {
  describe('interface contract', () => {
    it('CodeGenerator interface exists and can be implemented', () => {
      // Verify the interface shape by checking implementations
      const jsGenerator: CodeGenerator = new JavaScriptGenerator()
      const pyGenerator: CodeGenerator = new PythonGenerator()

      expect(jsGenerator).toBeDefined()
      expect(pyGenerator).toBeDefined()
    })

    it('has language property', () => {
      const jsGenerator: CodeGenerator = new JavaScriptGenerator()
      const pyGenerator: CodeGenerator = new PythonGenerator()

      expect(jsGenerator.language).toBeDefined()
      expect(typeof jsGenerator.language).toBe('string')
      expect(pyGenerator.language).toBeDefined()
      expect(typeof pyGenerator.language).toBe('string')
    })

    it('has generate method', () => {
      const jsGenerator: CodeGenerator = new JavaScriptGenerator()
      const pyGenerator: CodeGenerator = new PythonGenerator()

      expect(typeof jsGenerator.generate).toBe('function')
      expect(typeof pyGenerator.generate).toBe('function')
    })

    it('generate method accepts pipeline and options parameters', () => {
      const generator: CodeGenerator = new JavaScriptGenerator()
      const pipeline: unknown[] = []
      const options = { connectionUri: 'mongodb://localhost:27017' }

      // Should not throw
      const result = generator.generate(pipeline, options)
      expect(typeof result).toBe('string')
    })

    it('generate method returns a string', () => {
      const generator: CodeGenerator = new JavaScriptGenerator()
      const pipeline = [{ $match: { status: 'active' } }]

      const result = generator.generate(pipeline, {})
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })
  })
})

describe('JavaScriptGenerator', () => {
  describe('interface implementation', () => {
    it('implements CodeGenerator interface', () => {
      const generator = new JavaScriptGenerator()

      // TypeScript compile-time check - this assignment should work
      const codeGenerator: CodeGenerator = generator
      expect(codeGenerator).toBe(generator)
    })

    it('has language property set to "javascript"', () => {
      const generator = new JavaScriptGenerator()
      expect(generator.language).toBe('javascript')
    })

    it('has generate method with correct signature', () => {
      const generator = new JavaScriptGenerator()

      expect(generator.generate).toBeDefined()
      expect(typeof generator.generate).toBe('function')
      expect(generator.generate.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('code generation', () => {
    it('generates valid JavaScript code structure', () => {
      const generator = new JavaScriptGenerator()
      const pipeline = [{ $match: { status: 'active' } }]

      const code = generator.generate(pipeline, {})

      // Should be syntactically valid JavaScript (basic check)
      expect(code).toContain('const')
      expect(code).not.toContain('import ')  // Should use require for Node.js
    })

    it('includes mongodb driver require statement', () => {
      const generator = new JavaScriptGenerator()
      const pipeline = [{ $match: { status: 'active' } }]

      const code = generator.generate(pipeline, {})

      expect(code).toContain("require('mongodb')")
      expect(code).toContain('MongoClient')
    })

    it('includes proper imports/requires at the top', () => {
      const generator = new JavaScriptGenerator()
      const pipeline = [{ $match: { status: 'active' } }]

      const code = generator.generate(pipeline, {})
      const lines = code.split('\n')

      // First non-empty, non-comment line should be a require
      const firstCodeLine = lines.find(line =>
        line.trim() && !line.trim().startsWith('//')
      )
      expect(firstCodeLine).toMatch(/const.*=.*require/)
    })

    it('generates code with aggregate method call', () => {
      const generator = new JavaScriptGenerator()
      const pipeline = [
        { $match: { category: 'electronics' } },
        { $group: { _id: '$brand', count: { $sum: 1 } } },
      ]

      const code = generator.generate(pipeline, {})

      expect(code).toContain('.aggregate(')
      expect(code).toContain('pipeline')
    })

    it('produces valid JavaScript/Node.js code with mongodb driver', () => {
      const generator = new JavaScriptGenerator()
      const pipeline = [
        { $match: { status: 'active' } },
        { $sort: { createdAt: -1 } },
        { $limit: 10 },
      ]

      const code = generator.generate(pipeline, {})

      // Check for Node.js/mongodb driver patterns
      expect(code).toContain("require('mongodb')")
      expect(code).toContain('MongoClient')
      expect(code).toContain('.connect(')
      expect(code).toContain('.aggregate(')
      expect(code).toContain('.toArray()')
    })

    it('includes the pipeline stages in output', () => {
      const generator = new JavaScriptGenerator()
      const pipeline = [
        { $match: { status: 'active' } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
      ]

      const code = generator.generate(pipeline, {})

      expect(code).toContain('$match')
      expect(code).toContain('status')
      expect(code).toContain('active')
      expect(code).toContain('$group')
      expect(code).toContain('$category')
      expect(code).toContain('$sum')
    })

    it('formats pipeline as JavaScript array syntax', () => {
      const generator = new JavaScriptGenerator()
      const pipeline = [{ $match: { value: 100 } }]

      const code = generator.generate(pipeline, {})

      // Should use JavaScript array notation
      expect(code).toContain('[')
      expect(code).toContain(']')
      expect(code).toContain('{')
      expect(code).toContain('}')
    })
  })

  describe('empty pipeline handling', () => {
    it('handles empty pipeline array', () => {
      const generator = new JavaScriptGenerator()
      const pipeline: unknown[] = []

      const code = generator.generate(pipeline, {})

      expect(code).toBeDefined()
      expect(typeof code).toBe('string')
    })

    it('generates valid code for empty pipeline', () => {
      const generator = new JavaScriptGenerator()
      const pipeline: unknown[] = []

      const code = generator.generate(pipeline, {})

      // Should still include the driver setup
      expect(code).toContain("require('mongodb')")
      expect(code).toContain('aggregate')
    })

    it('represents empty pipeline as empty array in code', () => {
      const generator = new JavaScriptGenerator()
      const pipeline: unknown[] = []

      const code = generator.generate(pipeline, {})

      // Should contain an empty array for the pipeline
      expect(code).toMatch(/\[\s*\]/)
    })
  })

  describe('connection URI options', () => {
    it('handles connectionUri option', () => {
      const generator = new JavaScriptGenerator()
      const pipeline = [{ $match: { status: 'active' } }]
      const options = { connectionUri: 'mongodb://localhost:27017/testdb' }

      const code = generator.generate(pipeline, options)

      expect(code).toContain('mongodb://localhost:27017/testdb')
    })

    it('uses placeholder when connectionUri not provided', () => {
      const generator = new JavaScriptGenerator()
      const pipeline = [{ $match: { status: 'active' } }]
      const options = {}

      const code = generator.generate(pipeline, options)

      // Should have some placeholder or default
      expect(code).toMatch(/mongodb:\/\/|<connection-string>|YOUR_CONNECTION_STRING/i)
    })

    it('includes connection string in MongoClient constructor', () => {
      const generator = new JavaScriptGenerator()
      const pipeline = [{ $match: { status: 'active' } }]
      const options = { connectionUri: 'mongodb+srv://user:pass@cluster.mongodb.net/mydb' }

      const code = generator.generate(pipeline, options)

      expect(code).toContain('MongoClient')
      expect(code).toContain('mongodb+srv://user:pass@cluster.mongodb.net/mydb')
    })

    it('handles complex connection URIs with options', () => {
      const generator = new JavaScriptGenerator()
      const pipeline = [{ $match: {} }]
      const options = {
        connectionUri: 'mongodb://localhost:27017/testdb?retryWrites=true&w=majority',
      }

      const code = generator.generate(pipeline, options)

      expect(code).toContain('retryWrites=true')
      expect(code).toContain('w=majority')
    })
  })

  describe('additional options', () => {
    it('handles database option', () => {
      const generator = new JavaScriptGenerator()
      const pipeline = [{ $match: { status: 'active' } }]
      const options = {
        connectionUri: 'mongodb://localhost:27017',
        database: 'myDatabase',
      }

      const code = generator.generate(pipeline, options)

      expect(code).toContain('myDatabase')
    })

    it('handles collection option', () => {
      const generator = new JavaScriptGenerator()
      const pipeline = [{ $match: { status: 'active' } }]
      const options = {
        connectionUri: 'mongodb://localhost:27017',
        database: 'myDatabase',
        collection: 'myCollection',
      }

      const code = generator.generate(pipeline, options)

      expect(code).toContain('myCollection')
    })
  })
})

describe('PythonGenerator', () => {
  describe('interface implementation', () => {
    it('implements CodeGenerator interface', () => {
      const generator = new PythonGenerator()

      // TypeScript compile-time check - this assignment should work
      const codeGenerator: CodeGenerator = generator
      expect(codeGenerator).toBe(generator)
    })

    it('has language property set to "python"', () => {
      const generator = new PythonGenerator()
      expect(generator.language).toBe('python')
    })

    it('has generate method with correct signature', () => {
      const generator = new PythonGenerator()

      expect(generator.generate).toBeDefined()
      expect(typeof generator.generate).toBe('function')
      expect(generator.generate.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('code generation', () => {
    it('generates valid Python code structure', () => {
      const generator = new PythonGenerator()
      const pipeline = [{ $match: { status: 'active' } }]

      const code = generator.generate(pipeline, {})

      // Should use Python syntax
      expect(code).not.toContain('const ')
      expect(code).not.toContain('let ')
      expect(code).not.toContain('var ')
    })

    it('includes pymongo import statement', () => {
      const generator = new PythonGenerator()
      const pipeline = [{ $match: { status: 'active' } }]

      const code = generator.generate(pipeline, {})

      expect(code).toContain('pymongo')
      expect(code).toMatch(/from pymongo import|import pymongo/)
    })

    it('includes proper imports at the top', () => {
      const generator = new PythonGenerator()
      const pipeline = [{ $match: { status: 'active' } }]

      const code = generator.generate(pipeline, {})
      const lines = code.split('\n')

      // First non-empty, non-comment line should be an import
      const firstCodeLine = lines.find(line =>
        line.trim() && !line.trim().startsWith('#')
      )
      expect(firstCodeLine).toMatch(/^(from|import)/)
    })

    it('generates code with aggregate method call', () => {
      const generator = new PythonGenerator()
      const pipeline = [
        { $match: { category: 'electronics' } },
        { $group: { _id: '$brand', count: { $sum: 1 } } },
      ]

      const code = generator.generate(pipeline, {})

      expect(code).toContain('.aggregate(')
      expect(code).toContain('pipeline')
    })

    it('produces valid Python code with pymongo', () => {
      const generator = new PythonGenerator()
      const pipeline = [
        { $match: { status: 'active' } },
        { $sort: { createdAt: -1 } },
        { $limit: 10 },
      ]

      const code = generator.generate(pipeline, {})

      // Check for Python/pymongo patterns
      expect(code).toMatch(/from pymongo import|import pymongo/)
      expect(code).toContain('MongoClient')
      expect(code).toContain('.aggregate(')
      expect(code).toContain('list(')
    })

    it('includes the pipeline stages in output', () => {
      const generator = new PythonGenerator()
      const pipeline = [
        { $match: { status: 'active' } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
      ]

      const code = generator.generate(pipeline, {})

      expect(code).toContain('$match')
      expect(code).toContain('status')
      expect(code).toContain('active')
      expect(code).toContain('$group')
      expect(code).toContain('$category')
      expect(code).toContain('$sum')
    })

    it('formats pipeline as Python list syntax', () => {
      const generator = new PythonGenerator()
      const pipeline = [{ $match: { value: 100 } }]

      const code = generator.generate(pipeline, {})

      // Should use Python list notation
      expect(code).toContain('[')
      expect(code).toContain(']')
      expect(code).toContain('{')
      expect(code).toContain('}')
    })

    it('uses Python string syntax (quotes)', () => {
      const generator = new PythonGenerator()
      const pipeline = [{ $match: { name: 'test' } }]

      const code = generator.generate(pipeline, {})

      // Python uses quotes for strings
      expect(code).toMatch(/["']/)
    })
  })

  describe('empty pipeline handling', () => {
    it('handles empty pipeline array', () => {
      const generator = new PythonGenerator()
      const pipeline: unknown[] = []

      const code = generator.generate(pipeline, {})

      expect(code).toBeDefined()
      expect(typeof code).toBe('string')
    })

    it('generates valid code for empty pipeline', () => {
      const generator = new PythonGenerator()
      const pipeline: unknown[] = []

      const code = generator.generate(pipeline, {})

      // Should still include the driver setup
      expect(code).toContain('pymongo')
      expect(code).toContain('aggregate')
    })

    it('represents empty pipeline as empty list in code', () => {
      const generator = new PythonGenerator()
      const pipeline: unknown[] = []

      const code = generator.generate(pipeline, {})

      // Should contain an empty list for the pipeline
      expect(code).toMatch(/\[\s*\]/)
    })
  })

  describe('connection URI options', () => {
    it('handles connectionUri option', () => {
      const generator = new PythonGenerator()
      const pipeline = [{ $match: { status: 'active' } }]
      const options = { connectionUri: 'mongodb://localhost:27017/testdb' }

      const code = generator.generate(pipeline, options)

      expect(code).toContain('mongodb://localhost:27017/testdb')
    })

    it('uses placeholder when connectionUri not provided', () => {
      const generator = new PythonGenerator()
      const pipeline = [{ $match: { status: 'active' } }]
      const options = {}

      const code = generator.generate(pipeline, options)

      // Should have some placeholder or default
      expect(code).toMatch(/mongodb:\/\/|<connection-string>|YOUR_CONNECTION_STRING/i)
    })

    it('includes connection string in MongoClient constructor', () => {
      const generator = new PythonGenerator()
      const pipeline = [{ $match: { status: 'active' } }]
      const options = { connectionUri: 'mongodb+srv://user:pass@cluster.mongodb.net/mydb' }

      const code = generator.generate(pipeline, options)

      expect(code).toContain('MongoClient')
      expect(code).toContain('mongodb+srv://user:pass@cluster.mongodb.net/mydb')
    })

    it('handles complex connection URIs with options', () => {
      const generator = new PythonGenerator()
      const pipeline = [{ $match: {} }]
      const options = {
        connectionUri: 'mongodb://localhost:27017/testdb?retryWrites=true&w=majority',
      }

      const code = generator.generate(pipeline, options)

      expect(code).toContain('retryWrites=true')
      expect(code).toContain('w=majority')
    })
  })

  describe('additional options', () => {
    it('handles database option', () => {
      const generator = new PythonGenerator()
      const pipeline = [{ $match: { status: 'active' } }]
      const options = {
        connectionUri: 'mongodb://localhost:27017',
        database: 'myDatabase',
      }

      const code = generator.generate(pipeline, options)

      expect(code).toContain('myDatabase')
    })

    it('handles collection option', () => {
      const generator = new PythonGenerator()
      const pipeline = [{ $match: { status: 'active' } }]
      const options = {
        connectionUri: 'mongodb://localhost:27017',
        database: 'myDatabase',
        collection: 'myCollection',
      }

      const code = generator.generate(pipeline, options)

      expect(code).toContain('myCollection')
    })
  })

  describe('Python-specific syntax', () => {
    it('uses Python True/False instead of JavaScript true/false', () => {
      const generator = new PythonGenerator()
      const pipeline = [{ $match: { active: true, deleted: false } }]

      const code = generator.generate(pipeline, {})

      // Python uses True/False
      expect(code).toContain('True')
      expect(code).toContain('False')
      expect(code).not.toMatch(/:\s*true\b/)
      expect(code).not.toMatch(/:\s*false\b/)
    })

    it('uses Python None instead of JavaScript null', () => {
      const generator = new PythonGenerator()
      const pipeline = [{ $match: { deletedAt: null } }]

      const code = generator.generate(pipeline, {})

      expect(code).toContain('None')
      expect(code).not.toMatch(/:\s*null\b/)
    })
  })
})

describe('Generator comparison', () => {
  describe('same pipeline different output', () => {
    const testPipeline = [
      { $match: { status: 'active' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]

    it('JavaScript and Python generators produce different code', () => {
      const jsGenerator = new JavaScriptGenerator()
      const pyGenerator = new PythonGenerator()
      const options = { connectionUri: 'mongodb://localhost:27017/test' }

      const jsCode = jsGenerator.generate(testPipeline, options)
      const pyCode = pyGenerator.generate(testPipeline, options)

      expect(jsCode).not.toBe(pyCode)
    })

    it('JavaScript code uses require, Python uses import', () => {
      const jsGenerator = new JavaScriptGenerator()
      const pyGenerator = new PythonGenerator()
      const options = {}

      const jsCode = jsGenerator.generate(testPipeline, options)
      const pyCode = pyGenerator.generate(testPipeline, options)

      expect(jsCode).toContain('require')
      expect(jsCode).not.toContain('import ')

      expect(pyCode).toContain('import')
      expect(pyCode).not.toContain('require')
    })

    it('both generators include the same pipeline stages', () => {
      const jsGenerator = new JavaScriptGenerator()
      const pyGenerator = new PythonGenerator()
      const options = {}

      const jsCode = jsGenerator.generate(testPipeline, options)
      const pyCode = pyGenerator.generate(testPipeline, options)

      // Both should contain the stage operators
      expect(jsCode).toContain('$match')
      expect(pyCode).toContain('$match')

      expect(jsCode).toContain('$group')
      expect(pyCode).toContain('$group')

      expect(jsCode).toContain('$sort')
      expect(pyCode).toContain('$sort')
    })
  })
})

describe('Edge cases', () => {
  describe('special characters in values', () => {
    it('handles strings with quotes', () => {
      const jsGenerator = new JavaScriptGenerator()
      const pyGenerator = new PythonGenerator()
      const pipeline = [{ $match: { name: 'O\'Brien' } }]

      const jsCode = jsGenerator.generate(pipeline, {})
      const pyCode = pyGenerator.generate(pipeline, {})

      // Should escape quotes properly
      expect(jsCode).toContain('O')
      expect(jsCode).toContain('Brien')
      expect(pyCode).toContain('O')
      expect(pyCode).toContain('Brien')
    })

    it('handles strings with special characters', () => {
      const jsGenerator = new JavaScriptGenerator()
      const pipeline = [{ $match: { regex: '/test.*pattern/i' } }]

      const code = jsGenerator.generate(pipeline, {})

      expect(code).toContain('test')
      expect(code).toContain('pattern')
    })
  })

  describe('complex nested pipelines', () => {
    it('handles deeply nested objects', () => {
      const jsGenerator = new JavaScriptGenerator()
      const pipeline = [
        {
          $match: {
            'user.profile.settings.notifications.email': true,
          },
        },
      ]

      const code = jsGenerator.generate(pipeline, {})

      expect(code).toContain('user.profile.settings.notifications.email')
    })

    it('handles arrays in pipeline stages', () => {
      const jsGenerator = new JavaScriptGenerator()
      const pipeline = [
        {
          $match: {
            tags: { $in: ['javascript', 'python', 'mongodb'] },
          },
        },
      ]

      const code = jsGenerator.generate(pipeline, {})

      expect(code).toContain('$in')
      expect(code).toContain('javascript')
      expect(code).toContain('python')
      expect(code).toContain('mongodb')
    })

    it('handles $lookup with nested pipeline', () => {
      const jsGenerator = new JavaScriptGenerator()
      const pipeline = [
        {
          $lookup: {
            from: 'orders',
            let: { userId: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$customerId', '$$userId'] } } },
            ],
            as: 'userOrders',
          },
        },
      ]

      const code = jsGenerator.generate(pipeline, {})

      expect(code).toContain('$lookup')
      expect(code).toContain('let')
      expect(code).toContain('pipeline')
      expect(code).toContain('$expr')
    })
  })

  describe('numeric values', () => {
    it('handles integer values', () => {
      const jsGenerator = new JavaScriptGenerator()
      const pipeline = [{ $limit: 100 }]

      const code = jsGenerator.generate(pipeline, {})

      expect(code).toContain('100')
    })

    it('handles floating point values', () => {
      const jsGenerator = new JavaScriptGenerator()
      const pipeline = [{ $match: { price: { $gte: 19.99 } } }]

      const code = jsGenerator.generate(pipeline, {})

      expect(code).toContain('19.99')
    })

    it('handles negative numbers', () => {
      const jsGenerator = new JavaScriptGenerator()
      const pipeline = [{ $sort: { createdAt: -1 } }]

      const code = jsGenerator.generate(pipeline, {})

      expect(code).toContain('-1')
    })
  })
})
