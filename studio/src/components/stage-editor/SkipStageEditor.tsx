/**
 * Skip Stage Editor
 * UI for building $skip stage
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body, Label } from '@leafygreen-ui/typography'
import TextInput from '@leafygreen-ui/text-input'
import type { SkipStage } from './types'

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

const errorStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  color: ${palette.red.base};
  font-size: 13px;
`

export interface SkipStageEditorProps {
  stage: SkipStage
  onChange: (stage: SkipStage) => void
}

export function SkipStageEditor({ stage, onChange }: SkipStageEditorProps) {
  const [inputValue, setInputValue] = useState(String(stage.skip))

  // Update skip value
  const updateSkip = useCallback(
    (value: number) => {
      onChange({
        ...stage,
        skip: value,
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
        updateSkip(value)
      } else if (strValue === '') {
        updateSkip(0)
      }
    },
    [updateSkip]
  )

  // Sync input value when stage changes externally
  useEffect(() => {
    setInputValue(String(stage.skip))
  }, [stage.skip])

  // Validation based on the displayed input value
  const validationError = useMemo(() => {
    const parsedValue = parseInt(inputValue, 10)
    if (inputValue !== '' && (isNaN(parsedValue) || parsedValue < 0)) {
      return 'Skip must be non-negative'
    }
    if (!isNaN(parsedValue) && !Number.isInteger(parsedValue)) {
      return 'Skip must be an integer'
    }
    return null
  }, [inputValue])

  return (
    <div className={containerStyles} data-testid="skip-stage-editor">
      <Label>Skip Value</Label>

      <div className={inputRowStyles}>
        <TextInput
          className={inputStyles}
          type="number"
          aria-label="Skip value"
          value={inputValue}
          onChange={handleInputChange}
          data-testid="skip-value-input"
        />
      </div>

      {validationError && (
        <div className={errorStyles} data-testid="skip-validation-error">
          {validationError}
        </div>
      )}

      <Body>
        Skips over the specified number of documents that pass into the stage.
      </Body>
    </div>
  )
}

export default SkipStageEditor
