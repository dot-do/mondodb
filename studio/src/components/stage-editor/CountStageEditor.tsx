/**
 * Count Stage Editor
 * UI for building $count stage
 */

import { useCallback, useMemo } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body, Label } from '@leafygreen-ui/typography'
import TextInput from '@leafygreen-ui/text-input'
import type { CountStage } from './types'

// Styles
const containerStyles = css`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const fieldRowStyles = css`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const inputStyles = css`
  max-width: 250px;
`

const errorStyles = css`
  color: ${palette.red.base};
  font-size: 12px;
`

export interface CountStageEditorProps {
  stage: CountStage
  onChange: (stage: CountStage) => void
}

export function CountStageEditor({ stage, onChange }: CountStageEditorProps) {
  // Update output field
  const updateOutputField = useCallback(
    (value: string) => {
      onChange({
        ...stage,
        outputField: value,
      })
    },
    [stage, onChange]
  )

  // Validation
  const validationErrors = useMemo(() => {
    const errors: string[] = []
    if (stage.outputField === '') {
      errors.push('Output field name is required')
    }
    if (stage.outputField.startsWith('$')) {
      errors.push('Field name cannot start with $')
    }
    return errors
  }, [stage.outputField])

  return (
    <div className={containerStyles} data-testid="count-stage-editor">
      <Body weight="medium">Count all documents in pipeline</Body>

      <div className={fieldRowStyles}>
        <Label>Output Field Name</Label>
        <TextInput
          className={inputStyles}
          aria-label="Output field name"
          placeholder="count"
          value={stage.outputField}
          onChange={(e) => updateOutputField(e.target.value)}
          data-testid="count-output-field-input"
        />

        {stage.outputField === '' && (
          <div className={errorStyles} data-testid="output-field-required-error">
            Output field name is required
          </div>
        )}

        {stage.outputField.startsWith('$') && (
          <div className={errorStyles} data-testid="invalid-field-name-error">
            Field name cannot start with $
          </div>
        )}
      </div>

      <Body>
        Counts and returns the total number of documents that reach this stage.
        The output will be a single document with the specified field containing
        the count.
      </Body>
    </div>
  )
}

export default CountStageEditor
