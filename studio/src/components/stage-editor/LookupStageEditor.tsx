/**
 * Lookup Stage Editor
 * UI for building $lookup stage
 */

import { useCallback, useState } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body, Label } from '@leafygreen-ui/typography'
import TextInput from '@leafygreen-ui/text-input'
import TextArea from '@leafygreen-ui/text-area'
import Checkbox from '@leafygreen-ui/checkbox'
import type { LookupStage } from './types'

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

const pipelineEditorStyles = css`
  font-family: 'Source Code Pro', monospace;
  min-height: 120px;
`

const sectionStyles = css`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: ${palette.gray.light3};
  border-radius: 6px;
`

export interface LookupStageEditorProps {
  stage: LookupStage
  onChange: (stage: LookupStage) => void
  availableCollections?: string[]
  availableFields?: string[]
}

export function LookupStageEditor({
  stage,
  onChange,
  availableCollections = [],
  availableFields = [],
}: LookupStageEditorProps) {
  const [focusedField, setFocusedField] = useState<string | null>(null)

  // Update config field
  const updateConfig = useCallback(
    (field: keyof typeof stage.config, value: string) => {
      onChange({
        ...stage,
        config: {
          ...stage.config,
          [field]: value,
        },
      })
    },
    [stage, onChange]
  )

  // Toggle pipeline mode
  const togglePipelineMode = useCallback(() => {
    onChange({
      ...stage,
      usePipeline: !stage.usePipeline,
    })
  }, [stage, onChange])

  // Update pipeline JSON
  const updatePipelineJson = useCallback(
    (json: string) => {
      onChange({
        ...stage,
        pipelineJson: json,
      })
    },
    [stage, onChange]
  )

  // Update let variables
  const updateLetVariables = useCallback(
    (vars: string) => {
      onChange({
        ...stage,
        letVariables: vars,
      })
    },
    [stage, onChange]
  )

  // Validation
  const errors = {
    from: stage.config.from === '' ? 'Collection name is required' : null,
    localField: !stage.usePipeline && stage.config.localField === '' ? 'Local field is required' : null,
    foreignField: !stage.usePipeline && stage.config.foreignField === '' ? 'Foreign field is required' : null,
    as: stage.config.as === '' ? 'Output field name is required' : null,
  }

  return (
    <div className={containerStyles} data-testid="lookup-stage-editor">
      <Body weight="medium">Join with another collection</Body>

      {/* From collection */}
      <div className={fieldRowStyles}>
        <label className={labelStyles}>From Collection</label>
        <div className={inputWrapperStyles}>
          <TextInput
            aria-label="From collection"
            placeholder="collection name"
            value={stage.config.from}
            onChange={(e) => updateConfig('from', e.target.value)}
            onFocus={() => setFocusedField('from')}
            onBlur={() => setTimeout(() => setFocusedField(null), 150)}
            data-testid="lookup-from-input"
          />
          {focusedField === 'from' && availableCollections.length > 0 && (
            <div className={suggestionListStyles}>
              {availableCollections
                .filter((c) =>
                  c.toLowerCase().includes(stage.config.from.toLowerCase())
                )
                .map((collection) => (
                  <div
                    key={collection}
                    className={suggestionItemStyles}
                    onMouseDown={() => updateConfig('from', collection)}
                  >
                    {collection}
                  </div>
                ))}
            </div>
          )}
        </div>
        {errors.from && (
          <div className={errorStyles} data-testid="from-required-error">
            {errors.from}
          </div>
        )}
      </div>

      {/* Pipeline mode toggle */}
      <Checkbox
        label="Use pipeline mode (advanced)"
        checked={stage.usePipeline}
        onChange={togglePipelineMode}
        data-testid="lookup-pipeline-mode-toggle"
      />

      {!stage.usePipeline ? (
        // Basic lookup fields
        <>
          <div className={fieldRowStyles}>
            <label className={labelStyles}>Local Field</label>
            <div className={inputWrapperStyles}>
              <TextInput
                aria-label="Local field"
                placeholder="field from this collection"
                value={stage.config.localField}
                onChange={(e) => updateConfig('localField', e.target.value)}
                onFocus={() => setFocusedField('localField')}
                onBlur={() => setTimeout(() => setFocusedField(null), 150)}
                data-testid="lookup-local-field-input"
              />
              {focusedField === 'localField' && availableFields.length > 0 && (
                <div className={suggestionListStyles}>
                  {availableFields
                    .filter((f) =>
                      f.toLowerCase().includes(stage.config.localField.toLowerCase())
                    )
                    .map((field) => (
                      <div
                        key={field}
                        className={suggestionItemStyles}
                        onMouseDown={() => updateConfig('localField', field)}
                      >
                        {field}
                      </div>
                    ))}
                </div>
              )}
            </div>
            {errors.localField && (
              <div className={errorStyles} data-testid="local-field-required-error">
                {errors.localField}
              </div>
            )}
          </div>

          <div className={fieldRowStyles}>
            <label className={labelStyles}>Foreign Field</label>
            <div className={inputWrapperStyles}>
              <TextInput
                aria-label="Foreign field"
                placeholder="field from foreign collection"
                value={stage.config.foreignField}
                onChange={(e) => updateConfig('foreignField', e.target.value)}
                onFocus={() => setFocusedField('foreignField')}
                onBlur={() => setTimeout(() => setFocusedField(null), 150)}
                data-testid="lookup-foreign-field-input"
              />
              {focusedField === 'foreignField' && (
                <div className={suggestionListStyles}>
                  <div
                    className={suggestionItemStyles}
                    onMouseDown={() => updateConfig('foreignField', '_id')}
                  >
                    _id
                  </div>
                </div>
              )}
            </div>
            {errors.foreignField && (
              <div className={errorStyles} data-testid="foreign-field-required-error">
                {errors.foreignField}
              </div>
            )}
          </div>
        </>
      ) : (
        // Pipeline mode
        <div className={sectionStyles}>
          <div className={fieldRowStyles}>
            <label className={labelStyles}>Let Variables (JSON)</label>
            <TextArea
              className={pipelineEditorStyles}
              aria-label="Let variables"
              placeholder='{ "localId": "$_id" }'
              value={stage.letVariables || ''}
              onChange={(e) => updateLetVariables(e.target.value)}
              data-testid="lookup-let-editor"
            />
          </div>

          <div className={fieldRowStyles}>
            <label className={labelStyles}>Pipeline (JSON Array)</label>
            <TextArea
              className={pipelineEditorStyles}
              aria-label="Pipeline"
              placeholder='[{ "$match": { "$expr": { "$eq": ["$_id", "$$localId"] } } }]'
              value={stage.pipelineJson}
              onChange={(e) => updatePipelineJson(e.target.value)}
              data-testid="lookup-pipeline-editor"
            />
          </div>
        </div>
      )}

      {/* Output field */}
      <div className={fieldRowStyles}>
        <label className={labelStyles}>As (Output Field)</label>
        <TextInput
          aria-label="Output field name"
          placeholder="output field name"
          value={stage.config.as}
          onChange={(e) => updateConfig('as', e.target.value)}
          data-testid="lookup-as-input"
        />
        {errors.as && (
          <div className={errorStyles} data-testid="as-required-error">
            {errors.as}
          </div>
        )}
      </div>
    </div>
  )
}

export default LookupStageEditor
