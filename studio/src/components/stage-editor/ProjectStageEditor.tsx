/**
 * Project Stage Editor
 * UI for building $project stage
 */

import { useCallback, useState } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body, Label } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import IconButton from '@leafygreen-ui/icon-button'
import Icon from '@leafygreen-ui/icon'
import TextInput from '@leafygreen-ui/text-input'
import TextArea from '@leafygreen-ui/text-area'
import Checkbox from '@leafygreen-ui/checkbox'
import type { ProjectStage, ProjectField } from './types'

// Styles
const containerStyles = css`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const optionsRowStyles = css`
  display: flex;
  align-items: center;
  gap: 16px;
`

const quickSelectStyles = css`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  background: ${palette.gray.light3};
  border-radius: 6px;
`

const quickSelectButtonStyles = css`
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid ${palette.gray.light2};
  border-radius: 4px;
  background: white;
  cursor: pointer;

  &:hover {
    background: ${palette.green.light3};
    border-color: ${palette.green.base};
  }
`

const fieldRowStyles = css`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  background: ${palette.gray.light3};
  border-radius: 6px;
`

const fieldInputStyles = css`
  flex: 1;
`

const toggleButtonStyles = css`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border: 1px solid ${palette.gray.light2};
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 12px;

  &:hover {
    background: ${palette.gray.light3};
  }
`

const includeToggleStyles = css`
  ${toggleButtonStyles}
  min-width: 80px;
  justify-content: center;
`

const includeActiveStyles = css`
  background: ${palette.green.light3};
  border-color: ${palette.green.base};
  color: ${palette.green.dark2};
`

const excludeActiveStyles = css`
  background: ${palette.red.light3};
  border-color: ${palette.red.base};
  color: ${palette.red.dark2};
`

const expressionInputStyles = css`
  flex: 2;
  font-family: 'Source Code Pro', monospace;
`

const emptyStateStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: ${palette.gray.light3};
  border-radius: 6px;
  color: ${palette.gray.dark1};
  text-align: center;
  gap: 8px;
`

export interface ProjectStageEditorProps {
  stage: ProjectStage
  onChange: (stage: ProjectStage) => void
  availableFields?: string[]
}

export function ProjectStageEditor({
  stage,
  onChange,
  availableFields = [],
}: ProjectStageEditorProps) {
  // Generate unique ID
  const generateId = () => `proj-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  // Toggle exclude _id
  const toggleExcludeId = useCallback(() => {
    onChange({
      ...stage,
      excludeId: !stage.excludeId,
    })
  }, [stage, onChange])

  // Add field
  const addField = useCallback(() => {
    const newField: ProjectField = {
      id: generateId(),
      field: '',
      include: true,
      isExpression: false,
    }
    onChange({
      ...stage,
      fields: [...stage.fields, newField],
    })
  }, [stage, onChange])

  // Add field from quick select
  const addFieldFromQuickSelect = useCallback(
    (fieldName: string) => {
      const newField: ProjectField = {
        id: generateId(),
        field: fieldName,
        include: true,
        isExpression: false,
      }
      onChange({
        ...stage,
        fields: [...stage.fields, newField],
      })
    },
    [stage, onChange]
  )

  // Remove field
  const removeField = useCallback(
    (index: number) => {
      onChange({
        ...stage,
        fields: stage.fields.filter((_, i) => i !== index),
      })
    },
    [stage, onChange]
  )

  // Update field
  const updateField = useCallback(
    (index: number, updates: Partial<ProjectField>) => {
      const newFields = [...stage.fields]
      newFields[index] = { ...newFields[index], ...updates }
      onChange({
        ...stage,
        fields: newFields,
      })
    },
    [stage, onChange]
  )

  // Toggle include/exclude
  const toggleInclude = useCallback(
    (index: number) => {
      const field = stage.fields[index]
      updateField(index, { include: !field.include })
    },
    [stage.fields, updateField]
  )

  // Toggle expression mode
  const toggleExpression = useCallback(
    (index: number) => {
      const field = stage.fields[index]
      updateField(index, {
        isExpression: !field.isExpression,
        expression: field.isExpression ? undefined : '',
      })
    },
    [stage.fields, updateField]
  )

  // Get available fields that haven't been added yet
  const remainingFields = availableFields.filter(
    (f) => !stage.fields.some((pf) => pf.field === f)
  )

  return (
    <div className={containerStyles} data-testid="project-stage-editor">
      {/* Options */}
      <div className={optionsRowStyles}>
        <Checkbox
          label="Exclude _id"
          checked={stage.excludeId || false}
          onChange={toggleExcludeId}
          data-testid="exclude-id-toggle"
        />
      </div>

      {/* Quick select for common fields */}
      {remainingFields.length > 0 && (
        <div className={quickSelectStyles} data-testid="quick-field-select">
          <Label>Quick add:</Label>
          {remainingFields.slice(0, 10).map((field) => (
            <button
              key={field}
              className={quickSelectButtonStyles}
              onClick={() => addFieldFromQuickSelect(field)}
            >
              {field}
            </button>
          ))}
        </div>
      )}

      {/* Field list */}
      <Label>Fields</Label>

      {stage.fields.length === 0 && (
        <div className={emptyStateStyles}>
          <Body>No fields defined</Body>
          <Body>Add fields to include or exclude from output</Body>
        </div>
      )}

      {stage.fields.map((field, index) => (
        <div key={field.id} className={fieldRowStyles} data-testid={`project-field-row-${index}`}>
          <TextInput
            className={fieldInputStyles}
            aria-label="Field name"
            placeholder="field name"
            value={field.field}
            onChange={(e) => updateField(index, { field: e.target.value })}
            data-testid={`project-field-input-${index}`}
          />

          {!field.isExpression && (
            <button
              className={`${includeToggleStyles} ${
                field.include ? includeActiveStyles : excludeActiveStyles
              }`}
              onClick={() => toggleInclude(index)}
              data-testid={`project-include-toggle-${index}`}
            >
              {field.include ? 'Include' : 'Exclude'}
            </button>
          )}

          <button
            className={toggleButtonStyles}
            onClick={() => toggleExpression(index)}
            data-testid={`project-expression-toggle-${index}`}
          >
            <Icon glyph="Code" size="small" />
            {field.isExpression ? 'Simple' : 'Expression'}
          </button>

          {field.isExpression && (
            <TextArea
              className={expressionInputStyles}
              aria-label="Expression"
              placeholder='{ "$concat": ["$firstName", " ", "$lastName"] }'
              value={typeof field.include === 'string' ? field.include : (field.expression || '')}
              onChange={(e) => updateField(index, { include: e.target.value, expression: e.target.value })}
              data-testid={`project-expression-input-${index}`}
            />
          )}

          <IconButton
            aria-label="Remove field"
            onClick={() => removeField(index)}
            data-testid={`remove-project-field-${index}`}
          >
            <Icon glyph="X" />
          </IconButton>
        </div>
      ))}

      <Button
        variant="default"
        size="small"
        leftGlyph={<Icon glyph="Plus" />}
        onClick={addField}
        data-testid="add-project-field-button"
      >
        Add Field
      </Button>
    </div>
  )
}

export default ProjectStageEditor
