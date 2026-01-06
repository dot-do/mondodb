/**
 * Limit Stage Editor
 * UI for building $limit stage
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body, Label } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import TextInput from '@leafygreen-ui/text-input'
import type { LimitStage } from './types'

// Styles
const containerStyles = css`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const inputRowStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
`

const inputStyles = css`
  max-width: 150px;
`

const quickSelectStyles = css`
  display: flex;
  gap: 8px;
`

const quickButtonStyles = css`
  padding: 6px 12px;
  border: 1px solid ${palette.gray.light2};
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 13px;

  &:hover {
    background: ${palette.green.light3};
    border-color: ${palette.green.base};
  }
`

const activeButtonStyles = css`
  background: ${palette.green.light3};
  border-color: ${palette.green.base};
  color: ${palette.green.dark2};
`

const errorStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  color: ${palette.red.base};
  font-size: 13px;
`

const QUICK_VALUES = [10, 25, 50, 100]

export interface LimitStageEditorProps {
  stage: LimitStage
  onChange: (stage: LimitStage) => void
}

export function LimitStageEditor({ stage, onChange }: LimitStageEditorProps) {
  const [inputValue, setInputValue] = useState(String(stage.limit))

  // Update limit value
  const updateLimit = useCallback(
    (value: number) => {
      onChange({
        ...stage,
        limit: value,
      })
    },
    [stage, onChange]
  )

  // Handle input change
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const strValue = e.target.value
      setInputValue(strValue)
      const value = parseInt(strValue, 10)
      if (!isNaN(value)) {
        updateLimit(value)
      } else if (strValue === '') {
        updateLimit(0)
      }
    },
    [updateLimit]
  )

  // Sync input value when stage changes externally
  useEffect(() => {
    setInputValue(String(stage.limit))
  }, [stage.limit])

  // Validation based on the displayed input value
  const validationError = useMemo(() => {
    const floatValue = parseFloat(inputValue)
    if (inputValue === '' || isNaN(floatValue) || floatValue <= 0) {
      return 'Limit must be positive'
    }
    if (!Number.isInteger(floatValue)) {
      return 'Limit must be an integer'
    }
    return null
  }, [inputValue])

  return (
    <div className={containerStyles} data-testid="limit-stage-editor">
      <Label>Limit Value</Label>

      <div className={inputRowStyles}>
        <TextInput
          className={inputStyles}
          type="number"
          aria-label="Limit value"
          value={inputValue}
          onChange={handleInputChange}
          data-testid="limit-value-input"
        />

        <div className={quickSelectStyles}>
          {QUICK_VALUES.map((value) => (
            <button
              key={value}
              className={`${quickButtonStyles} ${
                stage.limit === value ? activeButtonStyles : ''
              }`}
              onClick={() => updateLimit(value)}
              data-testid={`quick-limit-${value}`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {validationError && (
        <div className={errorStyles} data-testid="limit-validation-error">
          {validationError}
        </div>
      )}

      <Body>
        Limits the number of documents passed to the next stage in the pipeline.
      </Body>
    </div>
  )
}

export default LimitStageEditor
