/**
 * Unwind Stage Editor
 * UI for building $unwind stage
 */

import { useCallback, useState } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body, Label } from '@leafygreen-ui/typography'
import TextInput from '@leafygreen-ui/text-input'
import Checkbox from '@leafygreen-ui/checkbox'
import type { UnwindStage } from './types'

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

const labelStyles = css`
  font-weight: 500;
  font-size: 13px;
`

const errorStyles = css`
  color: ${palette.red.base};
  font-size: 12px;
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

const inputWrapperStyles = css`
  position: relative;
`

const optionsStyles = css`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: ${palette.gray.light3};
  border-radius: 6px;
`

export interface UnwindStageEditorProps {
  stage: UnwindStage
  onChange: (stage: UnwindStage) => void
  availableFields?: string[]
}

export function UnwindStageEditor({
  stage,
  onChange,
  availableFields = [],
}: UnwindStageEditorProps) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [includeArrayIndex, setIncludeArrayIndex] = useState(
    !!stage.config.includeArrayIndex
  )

  // Update path (auto-prepend $ if needed)
  const updatePath = useCallback(
    (value: string) => {
      // Auto-prepend $ if not present
      let path = value
      if (value && !value.startsWith('$')) {
        path = `$${value}`
      }
      onChange({
        ...stage,
        config: {
          ...stage.config,
          path,
        },
      })
    },
    [stage, onChange]
  )

  // Toggle preserveNullAndEmptyArrays
  const togglePreserveNull = useCallback(() => {
    onChange({
      ...stage,
      config: {
        ...stage.config,
        preserveNullAndEmptyArrays: !stage.config.preserveNullAndEmptyArrays,
      },
    })
  }, [stage, onChange])

  // Toggle includeArrayIndex
  const toggleIncludeArrayIndex = useCallback(() => {
    const newValue = !includeArrayIndex
    setIncludeArrayIndex(newValue)
    onChange({
      ...stage,
      config: {
        ...stage.config,
        includeArrayIndex: newValue ? 'arrayIndex' : undefined,
      },
    })
  }, [stage, onChange, includeArrayIndex])

  // Update array index field name
  const updateArrayIndexField = useCallback(
    (value: string) => {
      onChange({
        ...stage,
        config: {
          ...stage.config,
          includeArrayIndex: value,
        },
      })
    },
    [stage, onChange]
  )

  // Get path value without $
  const pathWithoutDollar = stage.config.path.startsWith('$')
    ? stage.config.path.slice(1)
    : stage.config.path

  // Validation
  const pathError = stage.config.path === '' || stage.config.path === '$'
    ? 'Path is required'
    : null

  return (
    <div className={containerStyles} data-testid="unwind-stage-editor">
      <Body weight="medium">Deconstruct an array field</Body>

      {/* Path input */}
      <div className={fieldRowStyles}>
        <label className={labelStyles}>Array Path</label>
        <div className={inputWrapperStyles}>
          <TextInput
            aria-label="Array path"
            placeholder="arrayField"
            value={pathWithoutDollar}
            onChange={(e) => updatePath(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            data-testid="unwind-path-input"
          />
          {showSuggestions && availableFields.length > 0 && (
            <div className={suggestionListStyles}>
              {availableFields
                .filter((f) =>
                  f.toLowerCase().includes(pathWithoutDollar.toLowerCase())
                )
                .map((field) => (
                  <div
                    key={field}
                    className={suggestionItemStyles}
                    onMouseDown={() => updatePath(field)}
                  >
                    {field}
                  </div>
                ))}
            </div>
          )}
        </div>
        {pathError && (
          <div className={errorStyles} data-testid="path-required-error">
            {pathError}
          </div>
        )}
      </div>

      {/* Options */}
      <div className={optionsStyles}>
        <Label>Options</Label>

        <Checkbox
          label="Preserve null and empty arrays"
          description="If the path is null, missing, or empty array, output the document without the array field"
          checked={stage.config.preserveNullAndEmptyArrays}
          onChange={togglePreserveNull}
          data-testid="unwind-preserve-null-checkbox"
        />

        <Checkbox
          label="Include array index"
          description="Add a field containing the array index of the element"
          checked={includeArrayIndex}
          onChange={toggleIncludeArrayIndex}
          data-testid="unwind-include-array-index-checkbox"
        />

        {includeArrayIndex && (
          <div className={fieldRowStyles}>
            <label className={labelStyles}>Index Field Name</label>
            <TextInput
              aria-label="Array index field name"
              placeholder="arrayIndex"
              value={stage.config.includeArrayIndex || ''}
              onChange={(e) => updateArrayIndexField(e.target.value)}
              data-testid="unwind-array-index-field-input"
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default UnwindStageEditor
