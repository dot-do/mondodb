import { useCallback } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body, InlineCode } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import Icon from '@leafygreen-ui/icon'
import IconButton from '@leafygreen-ui/icon-button'
import { Menu, MenuItem } from '@leafygreen-ui/menu'
import TextInput from '@leafygreen-ui/text-input'
import { Select, Option } from '@leafygreen-ui/select'

const builderStyles = css`
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  overflow: auto;
`

const stageListStyles = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const stageItemStyles = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: ${palette.gray.light3};
  border-radius: 6px;
  border: 1px solid ${palette.gray.light2};
`

const stageHeaderStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const stageTitleStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const stageContentStyles = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const fieldRowStyles = css`
  display: flex;
  gap: 8px;
  align-items: center;
`

const emptyStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: ${palette.gray.dark1};
  text-align: center;
  border: 2px dashed ${palette.gray.light2};
  border-radius: 6px;
`

const previewStyles = css`
  padding: 12px;
  background: ${palette.gray.dark3};
  border-radius: 6px;
  font-family: monospace;
  font-size: 12px;
  color: ${palette.gray.light1};
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
`

export type StageType = '$match' | '$group' | '$project' | '$sort' | '$limit' | '$skip' | '$unwind'

export interface MatchCondition {
  field: string
  operator: '$eq' | '$ne' | '$gt' | '$gte' | '$lt' | '$lte' | '$in' | '$nin' | '$regex'
  value: string
}

export interface GroupAccumulator {
  name: string
  operator: '$sum' | '$avg' | '$min' | '$max' | '$first' | '$last' | '$push' | '$count'
  field: string
}

export interface AggregationStage {
  id: string
  type: StageType
  match?: MatchCondition[]
  groupBy?: string
  accumulators?: GroupAccumulator[]
  project?: Record<string, 0 | 1>
  sort?: Record<string, 1 | -1>
  limit?: number
  skip?: number
  unwindPath?: string
}

export interface QueryBuilderProps {
  pipeline: AggregationStage[]
  onChange: (pipeline: AggregationStage[]) => void
}

const STAGE_TYPES: { value: StageType; label: string; icon: string }[] = [
  { value: '$match', label: 'Match', icon: 'Filter' },
  { value: '$group', label: 'Group', icon: 'Aggregate' },
  { value: '$project', label: 'Project', icon: 'Visibility' },
  { value: '$sort', label: 'Sort', icon: 'SortAscending' },
  { value: '$limit', label: 'Limit', icon: 'Minus' },
  { value: '$skip', label: 'Skip', icon: 'ArrowRight' },
  { value: '$unwind', label: 'Unwind', icon: 'Array' },
]

export function QueryBuilder({ pipeline, onChange }: QueryBuilderProps) {
  const addStage = useCallback((type: StageType) => {
    const newStage: AggregationStage = {
      id: `stage-${Date.now()}`,
      type,
      ...(type === '$match' && { match: [{ field: '', operator: '$eq', value: '' }] }),
      ...(type === '$group' && { groupBy: '', accumulators: [] }),
      ...(type === '$project' && { project: {} }),
      ...(type === '$sort' && { sort: {} }),
      ...(type === '$limit' && { limit: 10 }),
      ...(type === '$skip' && { skip: 0 }),
      ...(type === '$unwind' && { unwindPath: '' }),
    }
    onChange([...pipeline, newStage])
  }, [pipeline, onChange])

  const updateStage = useCallback((id: string, updates: Partial<AggregationStage>) => {
    onChange(pipeline.map(stage =>
      stage.id === id ? { ...stage, ...updates } : stage
    ))
  }, [pipeline, onChange])

  const removeStage = useCallback((id: string) => {
    onChange(pipeline.filter(stage => stage.id !== id))
  }, [pipeline, onChange])

  const pipelineJson = pipelineToJson(pipeline)

  return (
    <div className={builderStyles}>
      <div className={stageListStyles}>
        {pipeline.length === 0 ? (
          <div className={emptyStyles} data-testid="pipeline-preview">
            <Icon glyph="Plus" />
            <Body>No stages added</Body>
            <Body style={{ fontSize: 12 }}>Click "Add Stage" to build your pipeline</Body>
          </div>
        ) : (
          pipeline.map((stage, index) => (
            <StageEditor
              key={stage.id}
              stage={stage}
              index={index}
              onUpdate={(updates) => updateStage(stage.id, updates)}
              onRemove={() => removeStage(stage.id)}
            />
          ))
        )}
      </div>

      <Menu
        trigger={
          <Button
            variant="default"
            leftGlyph={<Icon glyph="Plus" />}
            data-testid="add-stage"
          >
            Add Stage
          </Button>
        }
      >
        {STAGE_TYPES.map(({ value, label }) => (
          <MenuItem
            key={value}
            onClick={() => addStage(value)}
            data-testid={`stage-type-${value.slice(1)}`}
          >
            {label} ({value})
          </MenuItem>
        ))}
      </Menu>

      {pipeline.length > 0 && (
        <div>
          <Body style={{ marginBottom: 8, fontWeight: 600 }}>Pipeline Preview</Body>
          <div className={previewStyles} data-testid="pipeline-preview">
            {pipelineJson}
          </div>
        </div>
      )}
    </div>
  )
}

interface StageEditorProps {
  stage: AggregationStage
  index: number
  onUpdate: (updates: Partial<AggregationStage>) => void
  onRemove: () => void
}

function StageEditor({ stage, index, onUpdate, onRemove }: StageEditorProps) {
  return (
    <div className={stageItemStyles} data-testid={`stage-${index}`}>
      <div className={stageHeaderStyles}>
        <div className={stageTitleStyles}>
          <InlineCode>{stage.type}</InlineCode>
        </div>
        <IconButton
          aria-label="Remove stage"
          onClick={onRemove}
          data-testid={`stage-${index}-remove`}
        >
          <Icon glyph="X" />
        </IconButton>
      </div>

      <div className={stageContentStyles}>
        {stage.type === '$match' && (
          <MatchStageEditor
            conditions={stage.match || []}
            onChange={(match) => onUpdate({ match })}
          />
        )}

        {stage.type === '$group' && (
          <GroupStageEditor
            groupBy={stage.groupBy || ''}
            accumulators={stage.accumulators || []}
            onChange={(groupBy, accumulators) => onUpdate({ groupBy, accumulators })}
          />
        )}

        {stage.type === '$sort' && (
          <SortStageEditor
            sort={stage.sort || {}}
            onChange={(sort) => onUpdate({ sort })}
          />
        )}

        {stage.type === '$limit' && (
          <TextInput
            label="Limit"
            type="number"
            value={String(stage.limit || 10)}
            onChange={(e) => onUpdate({ limit: parseInt(e.target.value) || 10 })}
            data-testid="limit-input"
          />
        )}

        {stage.type === '$skip' && (
          <TextInput
            label="Skip"
            type="number"
            value={String(stage.skip || 0)}
            onChange={(e) => onUpdate({ skip: parseInt(e.target.value) || 0 })}
            data-testid="skip-input"
          />
        )}

        {stage.type === '$unwind' && (
          <TextInput
            label="Array Path"
            placeholder="$items"
            value={stage.unwindPath || ''}
            onChange={(e) => onUpdate({ unwindPath: e.target.value })}
            data-testid="unwind-path"
          />
        )}
      </div>
    </div>
  )
}

interface MatchStageEditorProps {
  conditions: MatchCondition[]
  onChange: (conditions: MatchCondition[]) => void
}

function MatchStageEditor({ conditions, onChange }: MatchStageEditorProps) {
  const updateCondition = (index: number, updates: Partial<MatchCondition>) => {
    onChange(conditions.map((c, i) => i === index ? { ...c, ...updates } : c))
  }

  const addCondition = () => {
    onChange([...conditions, { field: '', operator: '$eq', value: '' }])
  }

  const removeCondition = (index: number) => {
    onChange(conditions.filter((_, i) => i !== index))
  }

  return (
    <>
      {conditions.map((condition, index) => (
        <div key={index} className={fieldRowStyles}>
          <TextInput
            aria-label="Field name"
            placeholder="field"
            value={condition.field}
            onChange={(e) => updateCondition(index, { field: e.target.value })}
            data-testid="match-field"
          />
          <Select
            aria-label="Operator"
            value={condition.operator}
            onChange={(val) => updateCondition(index, { operator: val as MatchCondition['operator'] })}
            data-testid="match-operator"
          >
            <Option value="$eq">=</Option>
            <Option value="$ne">!=</Option>
            <Option value="$gt">&gt;</Option>
            <Option value="$gte">&gt;=</Option>
            <Option value="$lt">&lt;</Option>
            <Option value="$lte">&lt;=</Option>
            <Option value="$in">in</Option>
            <Option value="$regex">regex</Option>
          </Select>
          <TextInput
            aria-label="Value"
            placeholder="value"
            value={condition.value}
            onChange={(e) => updateCondition(index, { value: e.target.value })}
            data-testid="match-value"
          />
          {conditions.length > 1 && (
            <IconButton
              aria-label="Remove condition"
              onClick={() => removeCondition(index)}
            >
              <Icon glyph="X" />
            </IconButton>
          )}
        </div>
      ))}
      <Button
        variant="default"
        size="xsmall"
        leftGlyph={<Icon glyph="Plus" />}
        onClick={addCondition}
      >
        Add Condition
      </Button>
    </>
  )
}

interface GroupStageEditorProps {
  groupBy: string
  accumulators: GroupAccumulator[]
  onChange: (groupBy: string, accumulators: GroupAccumulator[]) => void
}

function GroupStageEditor({ groupBy, accumulators, onChange }: GroupStageEditorProps) {
  const addAccumulator = () => {
    onChange(groupBy, [...accumulators, { name: '', operator: '$sum', field: '' }])
  }

  const updateAccumulator = (index: number, updates: Partial<GroupAccumulator>) => {
    onChange(groupBy, accumulators.map((a, i) => i === index ? { ...a, ...updates } : a))
  }

  const removeAccumulator = (index: number) => {
    onChange(groupBy, accumulators.filter((_, i) => i !== index))
  }

  return (
    <>
      <TextInput
        label="Group By Field"
        placeholder="$category"
        value={groupBy}
        onChange={(e) => onChange(e.target.value, accumulators)}
        data-testid="group-by-field"
      />

      <Body style={{ fontWeight: 600, fontSize: 13, marginTop: 8 }}>Accumulators</Body>

      {accumulators.map((acc, index) => (
        <div key={index} className={fieldRowStyles}>
          <TextInput
            aria-label="Output field name"
            placeholder="name"
            value={acc.name}
            onChange={(e) => updateAccumulator(index, { name: e.target.value })}
            data-testid="accumulator-name"
          />
          <Select
            aria-label="Accumulator type"
            value={acc.operator}
            onChange={(val) => updateAccumulator(index, { operator: val as GroupAccumulator['operator'] })}
            data-testid="accumulator-type"
          >
            <Option value="$sum">sum</Option>
            <Option value="$avg">avg</Option>
            <Option value="$min">min</Option>
            <Option value="$max">max</Option>
            <Option value="$count">count</Option>
            <Option value="$first">first</Option>
            <Option value="$last">last</Option>
          </Select>
          <TextInput
            aria-label="Field to aggregate"
            placeholder="$field"
            value={acc.field}
            onChange={(e) => updateAccumulator(index, { field: e.target.value })}
            data-testid="accumulator-value"
          />
          <IconButton
            aria-label="Remove accumulator"
            onClick={() => removeAccumulator(index)}
          >
            <Icon glyph="X" />
          </IconButton>
        </div>
      ))}

      <Button
        variant="default"
        size="xsmall"
        leftGlyph={<Icon glyph="Plus" />}
        onClick={addAccumulator}
        data-testid="add-accumulator"
      >
        Add Accumulator
      </Button>
    </>
  )
}

interface SortStageEditorProps {
  sort: Record<string, 1 | -1>
  onChange: (sort: Record<string, 1 | -1>) => void
}

function SortStageEditor({ sort, onChange }: SortStageEditorProps) {
  const entries = Object.entries(sort)

  const addSort = () => {
    onChange({ ...sort, '': 1 })
  }

  const updateSort = (oldField: string, newField: string, direction: 1 | -1) => {
    const newSort: Record<string, 1 | -1> = {}
    for (const [field, dir] of Object.entries(sort)) {
      if (field === oldField) {
        if (newField) newSort[newField] = direction
      } else {
        newSort[field] = dir
      }
    }
    onChange(newSort)
  }

  const removeSort = (field: string) => {
    const newSort = { ...sort }
    delete newSort[field]
    onChange(newSort)
  }

  return (
    <>
      {entries.map(([field, direction], index) => (
        <div key={index} className={fieldRowStyles}>
          <TextInput
            aria-label="Sort field"
            placeholder="field"
            value={field}
            onChange={(e) => updateSort(field, e.target.value, direction)}
            data-testid="sort-field"
          />
          <Select
            aria-label="Sort direction"
            value={String(direction)}
            onChange={(val) => updateSort(field, field, parseInt(val) as 1 | -1)}
            data-testid="sort-direction"
          >
            <Option value="1">Ascending</Option>
            <Option value="-1">Descending</Option>
          </Select>
          <IconButton
            aria-label="Remove sort"
            onClick={() => removeSort(field)}
          >
            <Icon glyph="X" />
          </IconButton>
        </div>
      ))}

      <Button
        variant="default"
        size="xsmall"
        leftGlyph={<Icon glyph="Plus" />}
        onClick={addSort}
      >
        Add Sort Field
      </Button>
    </>
  )
}

function pipelineToJson(pipeline: AggregationStage[]): string {
  const stages = pipeline.map(stage => {
    switch (stage.type) {
      case '$match': {
        const conditions: Record<string, unknown> = {}
        for (const c of stage.match || []) {
          if (!c.field) continue
          if (c.operator === '$eq') {
            conditions[c.field] = parseValue(c.value)
          } else {
            conditions[c.field] = { [c.operator]: parseValue(c.value) }
          }
        }
        return { $match: conditions }
      }

      case '$group': {
        const group: Record<string, unknown> = {
          _id: stage.groupBy ? `$${stage.groupBy.replace(/^\$/, '')}` : null
        }
        for (const acc of stage.accumulators || []) {
          if (!acc.name) continue
          if (acc.operator === '$count') {
            group[acc.name] = { $sum: 1 }
          } else {
            group[acc.name] = { [acc.operator]: acc.field || 1 }
          }
        }
        return { $group: group }
      }

      case '$project':
        return { $project: stage.project || {} }

      case '$sort':
        return { $sort: stage.sort || {} }

      case '$limit':
        return { $limit: stage.limit || 10 }

      case '$skip':
        return { $skip: stage.skip || 0 }

      case '$unwind':
        return { $unwind: stage.unwindPath || '' }

      default:
        return {}
    }
  })

  return JSON.stringify(stages, null, 2)
}

function parseValue(value: string): unknown {
  // Try to parse as number
  const num = Number(value)
  if (!isNaN(num)) return num

  // Try to parse as boolean
  if (value === 'true') return true
  if (value === 'false') return false

  // Try to parse as null
  if (value === 'null') return null

  // Return as string
  return value
}
