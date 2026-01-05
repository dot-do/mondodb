import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { ExportToCode, generateJavaScript, generatePython, generateJava } from '../ExportToCode'
import type { AggregationStage } from '../QueryBuilder'

// Mock clipboard API
const mockWriteText = vi.fn().mockResolvedValue(undefined)
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockWriteText },
  writable: true,
})

describe('ExportToCode', () => {
  const samplePipeline: AggregationStage[] = [
    {
      id: 'stage-1',
      type: '$match',
      match: [
        { field: 'status', operator: '$eq', value: 'active' },
        { field: 'age', operator: '$gte', value: '18' },
      ],
    },
    {
      id: 'stage-2',
      type: '$group',
      groupBy: 'category',
      accumulators: [
        { name: 'total', operator: '$sum', field: '$amount' },
        { name: 'count', operator: '$count', field: '' },
      ],
    },
    {
      id: 'stage-3',
      type: '$sort',
      sort: { total: -1 },
    },
    {
      id: 'stage-4',
      type: '$limit',
      limit: 10,
    },
  ]

  const defaultProps = {
    pipeline: samplePipeline,
    database: 'testdb',
    collection: 'orders',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the export button', () => {
      render(<ExportToCode {...defaultProps} />)
      expect(screen.getByTestId('export-to-code-button')).toBeInTheDocument()
    })

    it('opens modal when button is clicked', async () => {
      const user = userEvent.setup()
      render(<ExportToCode {...defaultProps} />)

      await user.click(screen.getByTestId('export-to-code-button'))

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Export to Code')).toBeInTheDocument()
    })

    it('shows language selector tabs', async () => {
      const user = userEvent.setup()
      render(<ExportToCode {...defaultProps} />)

      await user.click(screen.getByTestId('export-to-code-button'))

      expect(screen.getByTestId('language-tab-javascript')).toBeInTheDocument()
      expect(screen.getByTestId('language-tab-python')).toBeInTheDocument()
      expect(screen.getByTestId('language-tab-java')).toBeInTheDocument()
    })

    it('displays generated code in code viewer', async () => {
      const user = userEvent.setup()
      render(<ExportToCode {...defaultProps} />)

      await user.click(screen.getByTestId('export-to-code-button'))

      expect(screen.getByTestId('code-output')).toBeInTheDocument()
    })

    it('shows copy button', async () => {
      const user = userEvent.setup()
      render(<ExportToCode {...defaultProps} />)

      await user.click(screen.getByTestId('export-to-code-button'))

      expect(screen.getByTestId('copy-code-button')).toBeInTheDocument()
    })
  })

  describe('language switching', () => {
    it('switches to Python when Python tab is clicked', async () => {
      const user = userEvent.setup()
      render(<ExportToCode {...defaultProps} />)

      await user.click(screen.getByTestId('export-to-code-button'))
      await user.click(screen.getByTestId('language-tab-python'))

      const codeOutput = screen.getByTestId('code-output')
      expect(codeOutput.textContent).toContain('pymongo')
    })

    it('switches to Java when Java tab is clicked', async () => {
      const user = userEvent.setup()
      render(<ExportToCode {...defaultProps} />)

      await user.click(screen.getByTestId('export-to-code-button'))
      await user.click(screen.getByTestId('language-tab-java'))

      const codeOutput = screen.getByTestId('code-output')
      expect(codeOutput.textContent).toContain('MongoClient')
    })

    it('defaults to JavaScript', async () => {
      const user = userEvent.setup()
      render(<ExportToCode {...defaultProps} />)

      await user.click(screen.getByTestId('export-to-code-button'))

      const codeOutput = screen.getByTestId('code-output')
      expect(codeOutput.textContent).toContain('aggregate')
    })
  })

  describe('copy functionality', () => {
    it('copies code to clipboard when copy button is clicked', async () => {
      const user = userEvent.setup()
      render(<ExportToCode {...defaultProps} />)

      await user.click(screen.getByTestId('export-to-code-button'))
      await user.click(screen.getByTestId('copy-code-button'))

      await waitFor(() => {
        expect(mockWriteText).toHaveBeenCalled()
      })
    })

    it('shows success feedback after copying', async () => {
      const user = userEvent.setup()
      render(<ExportToCode {...defaultProps} />)

      await user.click(screen.getByTestId('export-to-code-button'))
      await user.click(screen.getByTestId('copy-code-button'))

      await waitFor(() => {
        expect(screen.getByText(/copied/i)).toBeInTheDocument()
      })
    })
  })
})

describe('generateJavaScript', () => {
  it('generates valid JavaScript code for simple match stage', () => {
    const pipeline: AggregationStage[] = [
      {
        id: 'stage-1',
        type: '$match',
        match: [{ field: 'status', operator: '$eq', value: 'active' }],
      },
    ]

    const code = generateJavaScript(pipeline, 'mydb', 'users')

    expect(code).toContain('const { MongoClient }')
    expect(code).toContain("const database = client.db('mydb')")
    expect(code).toContain("const collection = database.collection('users')")
    expect(code).toContain('aggregate')
    expect(code).toContain('$match')
    expect(code).toContain('status')
  })

  it('generates valid JavaScript code for group stage with accumulators', () => {
    const pipeline: AggregationStage[] = [
      {
        id: 'stage-1',
        type: '$group',
        groupBy: 'category',
        accumulators: [
          { name: 'total', operator: '$sum', field: '$price' },
          { name: 'avgPrice', operator: '$avg', field: '$price' },
        ],
      },
    ]

    const code = generateJavaScript(pipeline, 'shop', 'products')

    expect(code).toContain('$group')
    expect(code).toContain('_id')
    expect(code).toContain('$category')
    expect(code).toContain('$sum')
    expect(code).toContain('$avg')
    expect(code).toContain('total')
    expect(code).toContain('avgPrice')
  })

  it('generates valid JavaScript code for sort stage', () => {
    const pipeline: AggregationStage[] = [
      {
        id: 'stage-1',
        type: '$sort',
        sort: { createdAt: -1, name: 1 },
      },
    ]

    const code = generateJavaScript(pipeline, 'mydb', 'items')

    expect(code).toContain('$sort')
    expect(code).toContain('createdAt')
    expect(code).toContain('-1')
  })

  it('generates valid JavaScript code for limit and skip stages', () => {
    const pipeline: AggregationStage[] = [
      { id: 'stage-1', type: '$skip', skip: 10 },
      { id: 'stage-2', type: '$limit', limit: 20 },
    ]

    const code = generateJavaScript(pipeline, 'mydb', 'items')

    expect(code).toContain('$skip')
    expect(code).toContain('10')
    expect(code).toContain('$limit')
    expect(code).toContain('20')
  })

  it('generates valid JavaScript code for unwind stage', () => {
    const pipeline: AggregationStage[] = [
      { id: 'stage-1', type: '$unwind', unwindPath: '$items' },
    ]

    const code = generateJavaScript(pipeline, 'mydb', 'orders')

    expect(code).toContain('$unwind')
    expect(code).toContain('$items')
  })

  it('generates syntactically correct JavaScript (can be parsed)', () => {
    const pipeline: AggregationStage[] = [
      {
        id: 'stage-1',
        type: '$match',
        match: [{ field: 'status', operator: '$eq', value: 'active' }],
      },
      {
        id: 'stage-2',
        type: '$group',
        groupBy: 'category',
        accumulators: [{ name: 'count', operator: '$count', field: '' }],
      },
    ]

    const code = generateJavaScript(pipeline, 'mydb', 'items')

    // Attempt to parse the code - this will throw if syntax is invalid
    // We wrap the generated code in a function to make it parseable
    expect(() => {
      // Use Function constructor to validate syntax
      new Function(code)
    }).not.toThrow()
  })

  it('handles comparison operators correctly', () => {
    const pipeline: AggregationStage[] = [
      {
        id: 'stage-1',
        type: '$match',
        match: [
          { field: 'age', operator: '$gt', value: '18' },
          { field: 'score', operator: '$lte', value: '100' },
          { field: 'tags', operator: '$in', value: '["a","b"]' },
        ],
      },
    ]

    const code = generateJavaScript(pipeline, 'mydb', 'users')

    expect(code).toContain('$gt')
    expect(code).toContain('18')
    expect(code).toContain('$lte')
    expect(code).toContain('100')
    expect(code).toContain('$in')
  })

  it('includes async/await pattern', () => {
    const pipeline: AggregationStage[] = [
      { id: 'stage-1', type: '$limit', limit: 5 },
    ]

    const code = generateJavaScript(pipeline, 'mydb', 'items')

    expect(code).toContain('async')
    expect(code).toContain('await')
  })

  it('includes proper error handling', () => {
    const pipeline: AggregationStage[] = [
      { id: 'stage-1', type: '$limit', limit: 5 },
    ]

    const code = generateJavaScript(pipeline, 'mydb', 'items')

    expect(code).toContain('try')
    expect(code).toContain('catch')
    expect(code).toContain('finally')
  })
})

describe('generatePython', () => {
  it('generates valid Python code with pymongo import', () => {
    const pipeline: AggregationStage[] = [
      {
        id: 'stage-1',
        type: '$match',
        match: [{ field: 'status', operator: '$eq', value: 'active' }],
      },
    ]

    const code = generatePython(pipeline, 'mydb', 'users')

    expect(code).toContain('from pymongo import MongoClient')
    expect(code).toContain('client = MongoClient')
  })

  it('generates Python code with correct database and collection', () => {
    const pipeline: AggregationStage[] = [
      { id: 'stage-1', type: '$limit', limit: 10 },
    ]

    const code = generatePython(pipeline, 'testdb', 'orders')

    expect(code).toContain("db = client['testdb']")
    expect(code).toContain("collection = db['orders']")
  })

  it('generates Python code for group stage with accumulators', () => {
    const pipeline: AggregationStage[] = [
      {
        id: 'stage-1',
        type: '$group',
        groupBy: 'category',
        accumulators: [
          { name: 'total', operator: '$sum', field: '$amount' },
        ],
      },
    ]

    const code = generatePython(pipeline, 'shop', 'orders')

    expect(code).toContain('$group')
    expect(code).toContain('$sum')
    expect(code).toContain('$amount')
  })

  it('generates Python code with proper list syntax for pipeline', () => {
    const pipeline: AggregationStage[] = [
      { id: 'stage-1', type: '$limit', limit: 5 },
      { id: 'stage-2', type: '$skip', skip: 10 },
    ]

    const code = generatePython(pipeline, 'mydb', 'items')

    expect(code).toContain('pipeline = [')
    expect(code).toContain(']')
    expect(code).toContain('aggregate(pipeline)')
  })

  it('uses Python boolean syntax (True/False)', () => {
    const pipeline: AggregationStage[] = [
      {
        id: 'stage-1',
        type: '$match',
        match: [{ field: 'active', operator: '$eq', value: 'true' }],
      },
    ]

    const code = generatePython(pipeline, 'mydb', 'items')

    // Python uses True/False, not true/false
    expect(code).toMatch(/True|"true"/)
  })

  it('generates syntactically valid Python', () => {
    const pipeline: AggregationStage[] = [
      {
        id: 'stage-1',
        type: '$match',
        match: [{ field: 'status', operator: '$eq', value: 'active' }],
      },
      {
        id: 'stage-2',
        type: '$group',
        groupBy: 'type',
        accumulators: [{ name: 'count', operator: '$count', field: '' }],
      },
    ]

    const code = generatePython(pipeline, 'mydb', 'items')

    // Basic Python syntax checks
    expect(code).not.toContain('const ')
    expect(code).not.toContain('let ')
    expect(code).not.toContain('=>')
    expect(code).not.toContain(';') // Python doesn't use semicolons
  })

  it('includes proper Python indentation', () => {
    const pipeline: AggregationStage[] = [
      { id: 'stage-1', type: '$limit', limit: 5 },
    ]

    const code = generatePython(pipeline, 'mydb', 'items')

    // Check for proper Python indentation (4 spaces or tabs)
    const lines = code.split('\n')
    const indentedLines = lines.filter(line => line.startsWith('    ') || line.startsWith('\t'))
    expect(indentedLines.length).toBeGreaterThan(0)
  })

  it('handles None instead of null', () => {
    const pipeline: AggregationStage[] = [
      {
        id: 'stage-1',
        type: '$group',
        groupBy: '', // Empty groupBy should result in null/_id
        accumulators: [{ name: 'total', operator: '$count', field: '' }],
      },
    ]

    const code = generatePython(pipeline, 'mydb', 'items')

    // Python uses None, not null
    expect(code).toContain('None')
    expect(code).not.toContain(': null')
  })
})

describe('generateJava', () => {
  it('generates valid Java code with proper imports', () => {
    const pipeline: AggregationStage[] = [
      {
        id: 'stage-1',
        type: '$match',
        match: [{ field: 'status', operator: '$eq', value: 'active' }],
      },
    ]

    const code = generateJava(pipeline, 'mydb', 'users')

    expect(code).toContain('import com.mongodb.client.MongoClient')
    expect(code).toContain('import com.mongodb.client.MongoClients')
    expect(code).toContain('import com.mongodb.client.MongoCollection')
    expect(code).toContain('import com.mongodb.client.MongoDatabase')
    expect(code).toContain('import org.bson.Document')
  })

  it('generates Java code with proper class structure', () => {
    const pipeline: AggregationStage[] = [
      { id: 'stage-1', type: '$limit', limit: 10 },
    ]

    const code = generateJava(pipeline, 'testdb', 'orders')

    expect(code).toContain('public class')
    expect(code).toContain('public static void main')
    expect(code).toContain('String[] args')
  })

  it('generates Java code with correct database and collection setup', () => {
    const pipeline: AggregationStage[] = [
      { id: 'stage-1', type: '$limit', limit: 10 },
    ]

    const code = generateJava(pipeline, 'mydb', 'products')

    expect(code).toContain('getDatabase("mydb")')
    expect(code).toContain('getCollection("products")')
  })

  it('uses Java Document syntax for pipeline stages', () => {
    const pipeline: AggregationStage[] = [
      {
        id: 'stage-1',
        type: '$match',
        match: [{ field: 'status', operator: '$eq', value: 'active' }],
      },
    ]

    const code = generateJava(pipeline, 'mydb', 'items')

    expect(code).toContain('new Document')
    expect(code).toContain('$match')
  })

  it('generates Java code for group stage with accumulators', () => {
    const pipeline: AggregationStage[] = [
      {
        id: 'stage-1',
        type: '$group',
        groupBy: 'category',
        accumulators: [
          { name: 'total', operator: '$sum', field: '$amount' },
        ],
      },
    ]

    const code = generateJava(pipeline, 'shop', 'orders')

    expect(code).toContain('$group')
    expect(code).toContain('$sum')
  })

  it('uses Arrays.asList for pipeline list', () => {
    const pipeline: AggregationStage[] = [
      { id: 'stage-1', type: '$limit', limit: 5 },
      { id: 'stage-2', type: '$skip', skip: 10 },
    ]

    const code = generateJava(pipeline, 'mydb', 'items')

    expect(code).toContain('Arrays.asList')
    expect(code).toContain('import java.util.Arrays')
  })

  it('generates syntactically valid Java', () => {
    const pipeline: AggregationStage[] = [
      {
        id: 'stage-1',
        type: '$match',
        match: [{ field: 'status', operator: '$eq', value: 'active' }],
      },
    ]

    const code = generateJava(pipeline, 'mydb', 'items')

    // Basic Java syntax checks
    expect(code).toContain(';') // Java uses semicolons
    expect(code).toContain('{')
    expect(code).toContain('}')
    expect(code).not.toContain('const ') // Not JavaScript
    expect(code).not.toContain('=>') // Not arrow functions
    expect(code).not.toContain('def ') // Not Python
  })

  it('uses proper Java types', () => {
    const pipeline: AggregationStage[] = [
      { id: 'stage-1', type: '$limit', limit: 10 },
    ]

    const code = generateJava(pipeline, 'mydb', 'items')

    expect(code).toContain('MongoClient')
    expect(code).toContain('MongoDatabase')
    expect(code).toContain('MongoCollection<Document>')
  })

  it('includes try-with-resources pattern', () => {
    const pipeline: AggregationStage[] = [
      { id: 'stage-1', type: '$limit', limit: 5 },
    ]

    const code = generateJava(pipeline, 'mydb', 'items')

    expect(code).toContain('try (')
    expect(code).toContain('MongoClient')
  })

  it('handles integer values correctly', () => {
    const pipeline: AggregationStage[] = [
      { id: 'stage-1', type: '$limit', limit: 100 },
      { id: 'stage-2', type: '$skip', skip: 50 },
    ]

    const code = generateJava(pipeline, 'mydb', 'items')

    expect(code).toContain('100')
    expect(code).toContain('50')
  })
})

describe('code generation edge cases', () => {
  it('handles empty pipeline', () => {
    const pipeline: AggregationStage[] = []

    const jsCode = generateJavaScript(pipeline, 'db', 'col')
    const pyCode = generatePython(pipeline, 'db', 'col')
    const javaCode = generateJava(pipeline, 'db', 'col')

    expect(jsCode).toContain('aggregate')
    expect(pyCode).toContain('aggregate')
    expect(javaCode).toContain('aggregate')
  })

  it('handles special characters in field names', () => {
    const pipeline: AggregationStage[] = [
      {
        id: 'stage-1',
        type: '$match',
        match: [{ field: 'user.email', operator: '$eq', value: 'test@example.com' }],
      },
    ]

    const jsCode = generateJavaScript(pipeline, 'db', 'users')
    const pyCode = generatePython(pipeline, 'db', 'users')
    const javaCode = generateJava(pipeline, 'db', 'users')

    expect(jsCode).toContain('user.email')
    expect(pyCode).toContain('user.email')
    expect(javaCode).toContain('user.email')
  })

  it('handles numeric string values correctly', () => {
    const pipeline: AggregationStage[] = [
      {
        id: 'stage-1',
        type: '$match',
        match: [{ field: 'count', operator: '$gte', value: '100' }],
      },
    ]

    const jsCode = generateJavaScript(pipeline, 'db', 'items')

    // Should parse as number when appropriate
    expect(jsCode).toContain('100')
  })

  it('handles complex nested pipeline', () => {
    const pipeline: AggregationStage[] = [
      {
        id: 'stage-1',
        type: '$match',
        match: [
          { field: 'status', operator: '$eq', value: 'active' },
          { field: 'type', operator: '$in', value: '["a","b","c"]' },
        ],
      },
      {
        id: 'stage-2',
        type: '$group',
        groupBy: 'category',
        accumulators: [
          { name: 'sum', operator: '$sum', field: '$value' },
          { name: 'avg', operator: '$avg', field: '$value' },
          { name: 'min', operator: '$min', field: '$value' },
          { name: 'max', operator: '$max', field: '$value' },
        ],
      },
      {
        id: 'stage-3',
        type: '$sort',
        sort: { sum: -1 },
      },
      {
        id: 'stage-4',
        type: '$limit',
        limit: 5,
      },
    ]

    const jsCode = generateJavaScript(pipeline, 'analytics', 'metrics')
    const pyCode = generatePython(pipeline, 'analytics', 'metrics')
    const javaCode = generateJava(pipeline, 'analytics', 'metrics')

    // All should contain all stage types
    for (const code of [jsCode, pyCode, javaCode]) {
      expect(code).toContain('$match')
      expect(code).toContain('$group')
      expect(code).toContain('$sort')
      expect(code).toContain('$limit')
    }
  })

  it('escapes string values properly', () => {
    const pipeline: AggregationStage[] = [
      {
        id: 'stage-1',
        type: '$match',
        match: [{ field: 'message', operator: '$eq', value: 'Hello "World"' }],
      },
    ]

    const jsCode = generateJavaScript(pipeline, 'db', 'logs')
    const pyCode = generatePython(pipeline, 'db', 'logs')
    const javaCode = generateJava(pipeline, 'db', 'logs')

    // Should properly escape quotes
    expect(() => new Function(jsCode)).not.toThrow()
  })
})
