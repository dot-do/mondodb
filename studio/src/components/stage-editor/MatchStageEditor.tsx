/**
 * Match Stage Editor
 * UI for building $match stage conditions
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
import TextArea from '@leafygreen-ui/text-area'
import type { MatchStage, MatchCondition, ComparisonOperator } from './types'

// Styles
const containerStyles = css`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const headerStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const conditionRowStyles = css`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  background: ${palette.gray.light3};
  border-radius: 6px;
`

const fieldInputStyles = css`
  flex: 1;
  min-width: 120px;
`

const operatorSelectStyles = css`
  min-width: 100px;
`

const valueInputStyles = css`
  flex: 1;
  min-width: 120px;
`

const removeButtonStyles = css`
  margin-top: 4px;
`

const addButtonContainerStyles = css`
  display: flex;
  gap: 8px;
`

const jsonEditorStyles = css`
  font-family: 'Source Code Pro', monospace;
  min-height: 120px;
`

const errorStyles = css`
  color: ${palette.red.base};
  font-size: 12px;
  margin-top: 4px;
`

const validStyles = css`
  color: ${palette.green.dark1};
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
`

const logicalOperatorStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
`

const suggestionListStyles = css`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 100;
  max-height: 200px;
  overflow-y: auto;
  background: white;
  border: 1px solid ${palette.gray.light2};
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
`

const suggestionItemStyles = css`
  padding: 8px 12px;
  cursor: pointer;
  &:hover {
    background: ${palette.gray.light3};
  }
`

const fieldWrapperStyles = css`
  position: relative;
  flex: 1;
  min-width: 120px;
`

const valueTypeStyles = css`
  min-width: 90px;
`

// Operators
const OPERATORS: { value: ComparisonOperator; label: string }[] = [
  { value: '$eq', label: '$eq (equals)' },
  { value: '$ne', label: '$ne (not equals)' },
  { value: '$gt', label: '$gt (greater than)' },
  { value: '$gte', label: '$gte (>=)' },
  { value: '$lt', label: '$lt (less than)' },
  { value: '$lte', label: '$lte (<=)' },
  { value: '$in', label: '$in (in array)' },
  { value: '$nin', label: '$nin (not in)' },
  { value: '$regex', label: '$regex (pattern)' },
  { value: '$exists', label: '$exists (exists)' },
]

const VALUE_TYPES = [
  { value: 'auto', label: 'Auto' },
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'null', label: 'Null' },
]

export interface MatchStageEditorProps {
  stage: MatchStage
  onChange: (stage: MatchStage) => void
  availableFields?: string[]
}

export function MatchStageEditor({
  stage,
  onChange,
  availableFields = [],
}: MatchStageEditorProps) {
  const [focusedFieldIndex, setFocusedFieldIndex] = useState<number | null>(null)
  const [fieldInputValues, setFieldInputValues] = useState<Record<number, string>>({})

  // Generate unique ID
  const generateId = () => `cond-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  // Add condition
  const addCondition = useCallback(() => {
    const newCondition: MatchCondition = {
      id: generateId(),
      field: '',
      operator: '$eq',
      value: '',
    }
    onChange({
      ...stage,
      conditions: [...stage.conditions, newCondition],
    })
  }, [stage, onChange])

  // Remove condition
  const removeCondition = useCallback(
    (index: number) => {
      onChange({
        ...stage,
        conditions: stage.conditions.filter((_, i) => i !== index),
      })
    },
    [stage, onChange]
  )

  // Update condition
  const updateCondition = useCallback(
    (index: number, updates: Partial<MatchCondition>) => {
      const newConditions = [...stage.conditions]
      newConditions[index] = { ...newConditions[index], ...updates }
      onChange({
        ...stage,
        conditions: newConditions,
      })
    },
    [stage, onChange]
  )

  // Toggle raw JSON mode
  const toggleRawJson = useCallback(() => {
    if (!stage.useRawJson) {
      // Converting to raw JSON - serialize current conditions
      const matchObj = conditionsToMatchObject(stage.conditions)
      onChange({
        ...stage,
        useRawJson: true,
        rawJson: JSON.stringify(matchObj, null, 2),
      })
    } else {
      onChange({
        ...stage,
        useRawJson: false,
      })
    }
  }, [stage, onChange])

  // Update raw JSON
  const updateRawJson = useCallback(
    (json: string) => {
      onChange({
        ...stage,
        rawJson: json,
      })
    },
    [stage, onChange]
  )

  // Update logical operator
  const updateLogicalOperator = useCallback(
    (op: '$and' | '$or') => {
      onChange({
        ...stage,
        logicalOperator: op,
      })
    },
    [stage, onChange]
  )

  // Filter suggestions based on input
  const getFilteredSuggestions = useCallback(
    (index: number) => {
      const inputValue = fieldInputValues[index] ?? stage.conditions[index]?.field ?? ''
      if (!inputValue) return availableFields
      return availableFields.filter((f) =>
        f.toLowerCase().includes(inputValue.toLowerCase())
      )
    },
    [availableFields, fieldInputValues, stage.conditions]
  )

  // Validate JSON
  const jsonError = useMemo(() => {
    if (!stage.useRawJson || !stage.rawJson.trim()) return null
    try {
      JSON.parse(stage.rawJson)
      return null
    } catch (e) {
      return (e as Error).message
    }
  }, [stage.useRawJson, stage.rawJson])

  // Check if conditions are valid
  const isValid = useMemo(() => {
    if (stage.useRawJson) {
      return !jsonError
    }
    return stage.conditions.every((c) => c.field.trim() !== '' || c.value.trim() === '')
  }, [stage, jsonError])

  return (
    <div className={containerStyles} data-testid="match-stage-editor">
      <Body weight="medium">$match</Body>
      <div className={headerStyles}>
        <Body>Conditions</Body>
        <Button
          variant="default"
          size="xsmall"
          onClick={toggleRawJson}
          data-testid="toggle-raw-json-mode"
        >
          {stage.useRawJson ? 'Visual Mode' : 'JSON Mode'}
        </Button>
      </div>

      {stage.useRawJson ? (
        <div>
          <TextArea
            label="Raw JSON"
            className={jsonEditorStyles}
            value={stage.rawJson}
            onChange={(e) => updateRawJson(e.target.value)}
            data-testid="raw-json-editor"
            aria-label="Raw JSON editor"
          />
          {jsonError && (
            <div className={errorStyles} data-testid="json-syntax-error">
              {jsonError}
            </div>
          )}
        </div>
      ) : (
        <div data-testid="match-condition-builder">
          {stage.conditions.length > 1 && (
            <div className={logicalOperatorStyles}>
              <Label>Combine with:</Label>
              <Select
                value={stage.logicalOperator || '$and'}
                onChange={(value) => updateLogicalOperator(value as '$and' | '$or')}
                aria-label="Logical operator"
                data-testid="logical-operator-selector"
              >
                <Option value="$and">AND</Option>
                <Option value="$or">OR</Option>
              </Select>
            </div>
          )}

          {stage.conditions.map((condition, index) => (
            <div
              key={condition.id}
              className={conditionRowStyles}
              data-testid={`match-condition-${index}`}
            >
              <div className={fieldWrapperStyles}>
                <TextInput
                  aria-label="Field name"
                  placeholder="field"
                  value={fieldInputValues[index] ?? condition.field}
                  onChange={(e) => {
                    setFieldInputValues((prev) => ({ ...prev, [index]: e.target.value }))
                    updateCondition(index, { field: e.target.value })
                  }}
                  onFocus={() => setFocusedFieldIndex(index)}
                  onBlur={() => setTimeout(() => setFocusedFieldIndex(null), 150)}
                  data-testid={`match-field-input-${index}`}
                />
                {condition.field === '' && condition.value !== '' && (
                  <div className={errorStyles} data-testid={`field-required-error-${index}`}>
                    Field is required
                  </div>
                )}
                {focusedFieldIndex === index && getFilteredSuggestions(index).length > 0 && (
                  <div className={suggestionListStyles}>
                    {getFilteredSuggestions(index).map((field) => (
                      <div
                        key={field}
                        className={suggestionItemStyles}
                        onMouseDown={() => {
                          setFieldInputValues((prev) => ({ ...prev, [index]: field }))
                          updateCondition(index, { field })
                        }}
                      >
                        {field}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Select
                className={operatorSelectStyles}
                aria-label="Operator"
                value={condition.operator}
                onChange={(value) =>
                  updateCondition(index, { operator: value as ComparisonOperator })
                }
                data-testid={`match-operator-select-${index}`}
              >
                {OPERATORS.map((op) => (
                  <Option key={op.value} value={op.value}>
                    {op.label}
                  </Option>
                ))}
              </Select>

              {condition.operator === '$in' || condition.operator === '$nin' ? (
                <TextInput
                  className={valueInputStyles}
                  aria-label="Array value"
                  placeholder='["val1", "val2"]'
                  value={condition.value}
                  onChange={(e) => updateCondition(index, { value: e.target.value })}
                  data-testid={`match-value-array-input-${index}`}
                />
              ) : condition.operator === '$exists' ? (
                <Select
                  className={valueInputStyles}
                  aria-label="Exists value"
                  value={condition.value || 'true'}
                  onChange={(value) => updateCondition(index, { value })}
                  data-testid={`match-value-boolean-select-${index}`}
                >
                  <Option value="true">true</Option>
                  <Option value="false">false</Option>
                </Select>
              ) : condition.operator === '$regex' ? (
                <>
                  <TextInput
                    className={valueInputStyles}
                    aria-label="Regex pattern"
                    placeholder="pattern"
                    value={condition.value}
                    onChange={(e) => updateCondition(index, { value: e.target.value })}
                    data-testid={`match-value-regex-input-${index}`}
                  />
                  <TextInput
                    style={{ width: 60 }}
                    aria-label="Regex options"
                    placeholder="i"
                    value={condition.regexOptions || ''}
                    onChange={(e) =>
                      updateCondition(index, { regexOptions: e.target.value })
                    }
                    data-testid={`match-regex-options-input-${index}`}
                  />
                </>
              ) : (
                <>
                  <TextInput
                    className={valueInputStyles}
                    aria-label="Value"
                    placeholder="value"
                    value={condition.value}
                    onChange={(e) => updateCondition(index, { value: e.target.value })}
                    data-testid={`match-value-input-${index}`}
                  />
                  <Select
                    className={valueTypeStyles}
                    aria-label="Value type"
                    value={condition.valueType || 'auto'}
                    onChange={(value) =>
                      updateCondition(index, {
                        valueType: value as MatchCondition['valueType'],
                      })
                    }
                    data-testid={`match-value-type-select-${index}`}
                  >
                    {VALUE_TYPES.map((t) => (
                      <Option key={t.value} value={t.value}>
                        {t.label}
                      </Option>
                    ))}
                  </Select>
                </>
              )}

              {stage.conditions.length > 1 && (
                <IconButton
                  className={removeButtonStyles}
                  aria-label="Remove condition"
                  onClick={() => removeCondition(index)}
                  data-testid={`remove-match-condition-${index}`}
                >
                  <Icon glyph="X" />
                </IconButton>
              )}
            </div>
          ))}

          <div className={addButtonContainerStyles}>
            <Button
              variant="default"
              size="small"
              leftGlyph={<Icon glyph="Plus" />}
              onClick={addCondition}
              data-testid="add-match-condition-button"
            >
              Add Condition
            </Button>
          </div>
        </div>
      )}

      {isValid && (
        <div className={validStyles} data-testid="stage-validation-valid">
          <Icon glyph="Checkmark" size="small" />
          Valid
        </div>
      )}
    </div>
  )
}

// Helper to convert conditions to match object
function conditionsToMatchObject(conditions: MatchCondition[]): Record<string, unknown> {
  if (conditions.length === 0) return {}

  return conditions.reduce((acc, c) => {
    if (!c.field) return acc
    if (c.operator === '$eq') {
      return { ...acc, [c.field]: parseValue(c.value, c.valueType) }
    }
    return { ...acc, [c.field]: { [c.operator]: parseValue(c.value, c.valueType) } }
  }, {} as Record<string, unknown>)
}

function parseValue(value: string, type?: string): unknown {
  if (type === 'null') return null
  if (type === 'boolean') return value === 'true'
  if (type === 'number') return Number(value)
  if (type === 'string') return value
  // Auto detection
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null') return null
  const num = Number(value)
  if (!isNaN(num) && value.trim() !== '') return num
  return value
}

export default MatchStageEditor
