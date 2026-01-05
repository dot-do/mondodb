import { useState, useCallback, useMemo } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { H2, Body, Subtitle, InlineCode } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import Icon from '@leafygreen-ui/icon'
import Badge from '@leafygreen-ui/badge'
import Card from '@leafygreen-ui/card'
import rpcClient, { Document } from '@lib/rpc-client'

// Schema type definitions
export interface FieldSchema {
  name: string
  path: string
  types: TypeInfo[]
  count: number
  probability: number
  hasMixedTypes: boolean
  children?: FieldSchema[]
}

export interface TypeInfo {
  bsonType: string
  count: number
  probability: number
  values?: {
    min?: unknown
    max?: unknown
    avg?: number
    distinct?: number
    sample?: unknown[]
  }
}

export interface SchemaAnalysisResult {
  fields: FieldSchema[]
  documentCount: number
  sampleSize: number
  analyzedAt: Date
}

// Styles
const analyzerStyles = css`
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
`

const headerStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const headerLeftStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
`

const statsStyles = css`
  display: flex;
  gap: 16px;
  align-items: center;
`

const statItemStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 12px;
  background: ${palette.gray.light3};
  border-radius: 6px;
`

const statLabelStyles = css`
  font-size: 11px;
  color: ${palette.gray.dark1};
  text-transform: uppercase;
`

const statValueStyles = css`
  font-size: 16px;
  font-weight: 600;
  color: ${palette.gray.dark3};
`

const actionsStyles = css`
  display: flex;
  gap: 8px;
`

const contentStyles = css`
  flex: 1;
  overflow: auto;
`

const fieldListStyles = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const fieldCardStyles = css`
  padding: 12px 16px;
  border: 1px solid ${palette.gray.light2};
  border-radius: 8px;
  background: ${palette.white};
`

const fieldHeaderStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
`

const fieldNameStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const fieldMetaStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
`

const typeListStyles = css`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`

const typeBadgeStyles = css`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  background: ${palette.gray.light3};
`

const nestedFieldsStyles = css`
  margin-left: 20px;
  padding-left: 16px;
  border-left: 2px solid ${palette.gray.light2};
  margin-top: 12px;
`

const placeholderStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: ${palette.gray.dark1};
  text-align: center;
  gap: 12px;
  min-height: 300px;
`

const errorStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: ${palette.red.dark2};
  text-align: center;
  gap: 12px;
  min-height: 300px;
`

const sampleSizeInputStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const inputStyles = css`
  width: 80px;
  padding: 4px 8px;
  border: 1px solid ${palette.gray.light2};
  border-radius: 4px;
  font-size: 14px;
  &:focus {
    outline: none;
    border-color: ${palette.green.base};
  }
`

export interface SchemaAnalyzerProps {
  database: string
  collection: string
}

export function SchemaAnalyzer({ database, collection }: SchemaAnalyzerProps) {
  const [schema, setSchema] = useState<SchemaAnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sampleSize, setSampleSize] = useState(100)
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set())

  const handleAnalyze = useCallback(async () => {
    setIsAnalyzing(true)
    setError(null)

    try {
      // Sample documents from the collection using RPC
      const documents = await rpcClient.find(database, collection, {
        limit: sampleSize,
      })

      // Compute schema from sampled documents
      const analysisResult = analyzeSchema(documents, sampleSize)
      setSchema(analysisResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Schema analysis failed')
    } finally {
      setIsAnalyzing(false)
    }
  }, [database, collection, sampleSize])

  const handleClear = useCallback(() => {
    setSchema(null)
    setError(null)
    setExpandedFields(new Set())
  }, [])

  const toggleField = useCallback((path: string) => {
    setExpandedFields(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const totalFields = useMemo(() => {
    if (!schema) return 0
    return countFields(schema.fields)
  }, [schema])

  return (
    <div className={analyzerStyles} data-testid="schema-analyzer">
      <div className={headerStyles}>
        <div className={headerLeftStyles}>
          <Icon glyph="Diagram" size="large" />
          <H2>Schema Analysis</H2>
          <Badge variant="blue">{collection}</Badge>
        </div>

        {schema && (
          <div className={statsStyles}>
            <div className={statItemStyles}>
              <span className={statLabelStyles}>Documents Sampled</span>
              <span className={statValueStyles}>{schema.sampleSize}</span>
            </div>
            <div className={statItemStyles}>
              <span className={statLabelStyles}>Total Fields</span>
              <span className={statValueStyles}>{totalFields}</span>
            </div>
          </div>
        )}
      </div>

      <div className={actionsStyles}>
        <div className={sampleSizeInputStyles}>
          <Body>Sample size:</Body>
          <input
            type="number"
            min={1}
            max={10000}
            value={sampleSize}
            onChange={(e) => setSampleSize(Math.max(1, Math.min(10000, parseInt(e.target.value) || 100)))}
            className={inputStyles}
            data-testid="sample-size-input"
          />
        </div>
        <Button
          variant="primary"
          leftGlyph={<Icon glyph="Refresh" />}
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          data-testid="analyze-button"
        >
          {isAnalyzing ? 'Analyzing...' : 'Analyze Schema'}
        </Button>
        {schema && (
          <Button
            variant="default"
            leftGlyph={<Icon glyph="X" />}
            onClick={handleClear}
          >
            Clear
          </Button>
        )}
      </div>

      <div className={contentStyles}>
        {error ? (
          <div className={errorStyles}>
            <Icon glyph="Warning" size="xlarge" />
            <Body>{error}</Body>
            <Button variant="default" onClick={handleAnalyze}>
              Retry
            </Button>
          </div>
        ) : schema ? (
          <div className={fieldListStyles}>
            {schema.fields.map((field) => (
              <FieldCard
                key={field.path}
                field={field}
                expandedFields={expandedFields}
                onToggle={toggleField}
              />
            ))}
          </div>
        ) : (
          <div className={placeholderStyles}>
            <Icon glyph="Diagram" size="xlarge" />
            <Body>Click "Analyze Schema" to analyze the collection structure</Body>
            <Body style={{ fontSize: 13, maxWidth: 400 }}>
              Schema analysis samples documents from the collection to determine
              field names, types, and their frequencies.
            </Body>
          </div>
        )}
      </div>
    </div>
  )
}

interface FieldCardProps {
  field: FieldSchema
  expandedFields: Set<string>
  onToggle: (path: string) => void
  depth?: number
}

function FieldCard({ field, expandedFields, onToggle, depth = 0 }: FieldCardProps) {
  const hasChildren = field.children && field.children.length > 0
  const isExpanded = expandedFields.has(field.path)

  return (
    <div className={fieldCardStyles} style={{ marginLeft: depth > 0 ? 0 : undefined }}>
      <div className={fieldHeaderStyles}>
        <div className={fieldNameStyles}>
          {hasChildren && (
            <Button
              size="xsmall"
              variant="default"
              onClick={() => onToggle(field.path)}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              <Icon glyph={isExpanded ? 'ChevronDown' : 'ChevronRight'} size="small" />
            </Button>
          )}
          <InlineCode>{field.name}</InlineCode>
          {field.hasMixedTypes && (
            <Badge variant="yellow">Mixed Types</Badge>
          )}
        </div>
        <div className={fieldMetaStyles}>
          <Body style={{ fontSize: 12, color: palette.gray.dark1 }}>
            {(field.probability * 100).toFixed(0)}% present
          </Body>
        </div>
      </div>

      <div className={typeListStyles}>
        {field.types.map((typeInfo, idx) => (
          <TypeBadge key={idx} typeInfo={typeInfo} />
        ))}
      </div>

      {hasChildren && isExpanded && (
        <div className={nestedFieldsStyles}>
          {field.children!.map((child) => (
            <FieldCard
              key={child.path}
              field={child}
              expandedFields={expandedFields}
              onToggle={onToggle}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TypeBadge({ typeInfo }: { typeInfo: TypeInfo }) {
  const typeColor = getTypeColor(typeInfo.bsonType)

  return (
    <div className={typeBadgeStyles} style={{ backgroundColor: typeColor }}>
      <span style={{ fontWeight: 600 }}>{typeInfo.bsonType}</span>
      <span style={{ color: palette.gray.dark1 }}>
        ({(typeInfo.probability * 100).toFixed(0)}%)
      </span>
      {typeInfo.values?.distinct !== undefined && (
        <span style={{ color: palette.gray.dark1, fontSize: 11 }}>
          {typeInfo.values.distinct} unique
        </span>
      )}
    </div>
  )
}

function getTypeColor(bsonType: string): string {
  const colors: Record<string, string> = {
    string: palette.green.light3,
    number: palette.blue.light3,
    int: palette.blue.light3,
    double: palette.blue.light3,
    boolean: palette.purple.light3,
    object: palette.yellow.light3,
    array: palette.red.light3,
    null: palette.gray.light2,
    date: palette.blue.light3,
    objectId: palette.gray.light3,
    undefined: palette.gray.light2,
  }
  return colors[bsonType] ?? palette.gray.light3
}

function countFields(fields: FieldSchema[]): number {
  let count = fields.length
  for (const field of fields) {
    if (field.children) {
      count += countFields(field.children)
    }
  }
  return count
}

/**
 * Analyze schema from sampled documents.
 * This function computes field names, types, and their frequencies.
 */
function analyzeSchema(documents: Document[], requestedSampleSize: number): SchemaAnalysisResult {
  const fieldMap = new Map<string, {
    name: string
    path: string
    types: Map<string, { count: number; values: unknown[] }>
    count: number
    children: Map<string, unknown>
  }>()

  const documentCount = documents.length

  // Process each document
  for (const doc of documents) {
    processDocument(doc, '', fieldMap)
  }

  // Convert field map to schema
  const fields = buildFieldSchema(fieldMap, documentCount)

  return {
    fields,
    documentCount,
    sampleSize: documentCount,
    analyzedAt: new Date(),
  }
}

function processDocument(
  obj: Record<string, unknown>,
  parentPath: string,
  fieldMap: Map<string, {
    name: string
    path: string
    types: Map<string, { count: number; values: unknown[] }>
    count: number
    children: Map<string, unknown>
  }>
): void {
  for (const [key, value] of Object.entries(obj)) {
    const path = parentPath ? `${parentPath}.${key}` : key
    const bsonType = getBsonType(value)

    // Get or create field entry
    let field = fieldMap.get(path)
    if (!field) {
      field = {
        name: key,
        path,
        types: new Map(),
        count: 0,
        children: new Map(),
      }
      fieldMap.set(path, field)
    }

    field.count++

    // Track type info
    let typeInfo = field.types.get(bsonType)
    if (!typeInfo) {
      typeInfo = { count: 0, values: [] }
      field.types.set(bsonType, typeInfo)
    }
    typeInfo.count++

    // Sample some values for statistics (limit to 100)
    if (typeInfo.values.length < 100 && value !== null && value !== undefined) {
      if (bsonType !== 'object' && bsonType !== 'array') {
        typeInfo.values.push(value)
      }
    }

    // Recursively process nested objects
    if (bsonType === 'object' && value !== null) {
      processDocument(value as Record<string, unknown>, path, fieldMap)
    }

    // Process array elements
    if (bsonType === 'array' && Array.isArray(value)) {
      for (const item of value) {
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          processDocument(item as Record<string, unknown>, `${path}[]`, fieldMap)
        }
      }
    }
  }
}

function getBsonType(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return 'array'
  if (value instanceof Date) return 'date'

  const type = typeof value
  if (type === 'object') {
    // Check for ObjectId-like structure
    if (
      typeof (value as Record<string, unknown>)._id === 'string' ||
      typeof (value as Record<string, unknown>).$oid === 'string'
    ) {
      return 'objectId'
    }
    // Check for date-like structure
    if ((value as Record<string, unknown>).$date !== undefined) {
      return 'date'
    }
    return 'object'
  }
  if (type === 'number') {
    return Number.isInteger(value) ? 'int' : 'double'
  }
  return type
}

function buildFieldSchema(
  fieldMap: Map<string, {
    name: string
    path: string
    types: Map<string, { count: number; values: unknown[] }>
    count: number
    children: Map<string, unknown>
  }>,
  documentCount: number
): FieldSchema[] {
  const rootFields: FieldSchema[] = []
  const fieldsByParent = new Map<string, FieldSchema[]>()

  // Sort fields by path for consistent ordering
  const sortedEntries = Array.from(fieldMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )

  for (const [path, field] of sortedEntries) {
    const types: TypeInfo[] = []

    for (const [bsonType, typeData] of field.types.entries()) {
      const typeInfo: TypeInfo = {
        bsonType,
        count: typeData.count,
        probability: typeData.count / field.count,
      }

      // Calculate value statistics
      if (typeData.values.length > 0) {
        const values = typeData.values

        if (bsonType === 'string') {
          const distinctSet = new Set(values as string[])
          typeInfo.values = {
            distinct: distinctSet.size,
            sample: Array.from(distinctSet).slice(0, 5),
          }
        } else if (bsonType === 'int' || bsonType === 'double' || bsonType === 'number') {
          const nums = values as number[]
          typeInfo.values = {
            min: Math.min(...nums),
            max: Math.max(...nums),
            avg: nums.reduce((a, b) => a + b, 0) / nums.length,
            distinct: new Set(nums).size,
          }
        } else if (bsonType === 'boolean') {
          const bools = values as boolean[]
          const trueCount = bools.filter(Boolean).length
          typeInfo.values = {
            sample: [`true: ${trueCount}`, `false: ${bools.length - trueCount}`],
          }
        }
      }

      types.push(typeInfo)
    }

    // Sort types by count (most common first)
    types.sort((a, b) => b.count - a.count)

    const fieldSchema: FieldSchema = {
      name: field.name,
      path: field.path,
      types,
      count: field.count,
      probability: field.count / documentCount,
      hasMixedTypes: types.length > 1,
      children: [],
    }

    // Determine parent path
    const pathParts = path.split('.')
    if (pathParts.length === 1) {
      // Root level field
      rootFields.push(fieldSchema)
    } else {
      // Nested field - find parent
      const parentPath = pathParts.slice(0, -1).join('.')
      let siblings = fieldsByParent.get(parentPath)
      if (!siblings) {
        siblings = []
        fieldsByParent.set(parentPath, siblings)
      }
      siblings.push(fieldSchema)
    }
  }

  // Attach children to their parents
  for (const [parentPath, children] of fieldsByParent.entries()) {
    const parent = findFieldByPath(rootFields, parentPath)
    if (parent) {
      parent.children = children
    }
  }

  return rootFields
}

function findFieldByPath(fields: FieldSchema[], path: string): FieldSchema | null {
  for (const field of fields) {
    if (field.path === path) return field
    if (field.children) {
      const found = findFieldByPath(field.children, path)
      if (found) return found
    }
  }
  return null
}

export default SchemaAnalyzer
