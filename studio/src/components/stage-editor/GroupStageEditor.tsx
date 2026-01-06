/**
 * Group Stage Editor
 * UI for building $group stage with accumulators
 */

import { useCallback, useMemo, useState } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body, Label } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import IconButton from '@leafygreen-ui/icon-button'
import Icon from '@leafygreen-ui/icon'
import TextInput from '@leafygreen-ui/text-input'
import { Select, Option } from '@leafygreen-ui/select'
import Checkbox from '@leafygreen-ui/checkbox'
import TextArea from '@leafygreen-ui/text-area'
import type { GroupStage, GroupAccumulator, AccumulatorOperator } from './types'

// Styles
const containerStyles = css`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const sectionStyles = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const groupByRowStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const fieldInputStyles = css`
  flex: 1;
`

const accumulatorRowStyles = css`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  background: ${palette.gray.light3};
  border-radius: 6px;
`

const warningStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: ${palette.yellow.light3};
  border: 1px solid ${palette.yellow.light2};
  border-radius: 4px;
  color: ${palette.yellow.dark2};
  font-size: 13px;
`

const errorStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: ${palette.red.light3};
  border: 1px solid ${palette.red.light2};
  border-radius: 4px;
  color: ${palette.red.dark2};
  font-size: 13px;
`

const compoundKeyEditorStyles = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: ${palette.gray.light3};
  border-radius: 6px;
`

const constantToggleStyles = css`
  display: flex;
  align-items: center;
  gap: 4px;
`

// Accumulator operators
const ACCUMULATOR_OPERATORS: { value: AccumulatorOperator; label: string }[] = [
  { value: '$sum', label: '$sum' },
  { value: '$avg', label: '$avg' },
  { value: '$min', label: '$min' },
  { value: '$max', label: '$max' },
  { value: '$first', label: '$first' },
  { value: '$last', label: '$last' },
  { value: '$push', label: '$push' },
  { value: '$addToSet', label: '$addToSet' },
  { value: '$count', label: '$count' },
]

export interface GroupStageEditorProps {
  stage: GroupStage
  onChange: (stage: GroupStage) => void
  availableFields?: string[]
}

export function GroupStageEditor({
  stage,
  onChange,
  availableFields = [],
}: GroupStageEditorProps) {
  const [focusedField, setFocusedField] = useState<string | null>(null)

  // Generate unique ID
  const generateId = () => `acc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  // Update group by field
  const updateGroupByField = useCallback(
    (field: string) => {
      onChange({
        ...stage,
        groupByField: field,
      })
    },
    [stage, onChange]
  )

  // Set group by to null
  const setGroupByNull = useCallback(() => {
    onChange({
      ...stage,
      groupByField: '',
    })
  }, [stage, onChange])

  // Toggle compound key mode
  const toggleCompoundKey = useCallback(() => {
    onChange({
      ...stage,
      useCompoundKey: !stage.useCompoundKey,
    })
  }, [stage, onChange])

  // Add accumulator
  const addAccumulator = useCallback(() => {
    const newAccumulator: GroupAccumulator = {
      id: generateId(),
      outputField: '',
      operator: '$sum',
      inputField: '',
    }
    onChange({
      ...stage,
      accumulators: [...stage.accumulators, newAccumulator],
    })
  }, [stage, onChange])

  // Remove accumulator
  const removeAccumulator = useCallback(
    (index: number) => {
      onChange({
        ...stage,
        accumulators: stage.accumulators.filter((_, i) => i !== index),
      })
    },
    [stage, onChange]
  )

  // Update accumulator
  const updateAccumulator = useCallback(
    (index: number, updates: Partial<GroupAccumulator>) => {
      const newAccumulators = [...stage.accumulators]
      newAccumulators[index] = { ...newAccumulators[index], ...updates }
      onChange({
        ...stage,
        accumulators: newAccumulators,
      })
    },
    [stage, onChange]
  )

  // Check for duplicate output fields
  const duplicateFields = useMemo(() => {
    const fields = stage.accumulators.map((a) => a.outputField).filter(Boolean)
    const seen = new Set<string>()
    const duplicates = new Set<string>()
    for (const field of fields) {
      if (seen.has(field)) {
        duplicates.add(field)
      }
      seen.add(field)
    }
    return duplicates
  }, [stage.accumulators])

  return (
    <div className={containerStyles} data-testid="group-stage-editor">
      {/* Group By Section */}
      <div className={sectionStyles}>
        <Label>Group By (_id)</Label>
        <div className={groupByRowStyles}>
          <TextInput
            className={fieldInputStyles}
            aria-label="Group by field"
            placeholder="field name (or leave empty for null)"
            value={stage.groupByField}
            onChange={(e) => updateGroupByField(e.target.value)}
            data-testid="group-by-field-input"
          />
          <Button
            variant="default"
            size="small"
            onClick={setGroupByNull}
            data-testid="group-by-null-option"
          >
            Set Null
          </Button>
        </div>
        <Checkbox
          label="Use compound key"
          checked={stage.useCompoundKey}
          onChange={toggleCompoundKey}
          data-testid="use-compound-key-toggle"
        />
        {stage.useCompoundKey && (
          <div className={compoundKeyEditorStyles} data-testid="compound-key-editor">
            <TextArea
              label="Compound key expression (JSON)"
              placeholder='{ "field1": "$field1", "field2": "$field2" }'
              value={stage.groupByExpression}
              onChange={(e) =>
                onChange({ ...stage, groupByExpression: e.target.value })
              }
            />
          </div>
        )}
      </div>

      {/* Accumulators Section */}
      <div className={sectionStyles}>
        <Label>Accumulators</Label>

        {stage.accumulators.length === 0 && (
          <div className={warningStyles} data-testid="no-accumulators-warning">
            <Icon glyph="Warning" />
            No accumulators defined. Add at least one accumulator.
          </div>
        )}

        {duplicateFields.size > 0 && (
          <div className={errorStyles} data-testid="duplicate-field-error">
            <Icon glyph="Warning" />
            Duplicate output field names: {Array.from(duplicateFields).join(', ')}
          </div>
        )}

        {stage.accumulators.map((accumulator, index) => (
          <div
            key={accumulator.id}
            className={accumulatorRowStyles}
            data-testid={`accumulator-row-${index}`}
          >
            <TextInput
              aria-label="Output field name"
              placeholder="outputField"
              value={accumulator.outputField}
              onChange={(e) =>
                updateAccumulator(index, { outputField: e.target.value })
              }
              data-testid={`accumulator-name-input-${index}`}
            />

            <Select
              aria-label="Accumulator operator"
              value={accumulator.operator}
              onChange={(value) =>
                updateAccumulator(index, { operator: value as AccumulatorOperator })
              }
              data-testid={`accumulator-operator-select-${index}`}
            >
              {ACCUMULATOR_OPERATORS.map((op) => (
                <Option key={op.value} value={op.value}>
                  {op.label}
                </Option>
              ))}
            </Select>

            {accumulator.operator !== '$count' && (
              <>
                <TextInput
                  aria-label="Input field"
                  placeholder="inputField"
                  value={accumulator.inputField}
                  onChange={(e) =>
                    updateAccumulator(index, { inputField: e.target.value })
                  }
                  data-testid={`accumulator-field-input-${index}`}
                />

                {accumulator.operator === '$sum' && (
                  <div
                    className={constantToggleStyles}
                    data-testid={`accumulator-use-constant-toggle-${index}`}
                  >
                    <Checkbox
                      label="Constant"
                      checked={accumulator.useConstant || false}
                      onChange={(e) =>
                        updateAccumulator(index, {
                          useConstant: e.target.checked,
                          constantValue: e.target.checked ? 1 : undefined,
                        })
                      }
                    />
                  </div>
                )}
              </>
            )}

            <IconButton
              aria-label="Remove accumulator"
              onClick={() => removeAccumulator(index)}
              data-testid={`remove-accumulator-${index}`}
            >
              <Icon glyph="X" />
            </IconButton>
          </div>
        ))}

        <Button
          variant="default"
          size="small"
          leftGlyph={<Icon glyph="Plus" />}
          onClick={addAccumulator}
          data-testid="add-accumulator-button"
        >
          Add Accumulator
        </Button>
      </div>
    </div>
  )
}

export default GroupStageEditor
