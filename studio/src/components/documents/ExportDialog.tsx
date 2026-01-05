import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { H3, Body, InlineCode } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import Modal from '@leafygreen-ui/modal'
import Icon from '@leafygreen-ui/icon'
import Checkbox from '@leafygreen-ui/checkbox'
import { RadioBox, RadioBoxGroup } from '@leafygreen-ui/radio-box-group'
import rpcClient, { Document, FindOptions } from '@lib/rpc-client'

// Export format types
export type ExportFormat = 'json' | 'csv'

// Export state
export type ExportState = 'idle' | 'fetching' | 'processing' | 'downloading' | 'complete' | 'error'

export interface ExportDialogProps {
  database: string
  collection: string
  open: boolean
  onClose: () => void
  /** Optional filter to apply to exported documents */
  filter?: Record<string, unknown>
  /** Optional documents to export directly (for bulk export) */
  documents?: Document[]
  /** Total count of documents matching the filter */
  totalCount?: number
  onSuccess?: () => void
}

const modalContentStyles = css`
  padding: 24px;
`

const headerStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
`

const sectionStyles = css`
  margin-bottom: 24px;
`

const sectionTitleStyles = css`
  font-weight: 600;
  margin-bottom: 12px;
  color: ${palette.gray.dark3};
`

const formatSelectorStyles = css`
  display: flex;
  gap: 12px;
`

const fieldSelectorStyles = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
  padding: 12px;
  background: ${palette.gray.light3};
  border-radius: 6px;
`

const fieldHeaderStyles = css`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`

const progressContainerStyles = css`
  margin-top: 16px;
  padding: 16px;
  background: ${palette.gray.light3};
  border-radius: 6px;
`

const progressBarContainerStyles = css`
  width: 100%;
  height: 8px;
  background: ${palette.gray.light2};
  border-radius: 4px;
  overflow: hidden;
  margin-top: 8px;
`

const progressBarStyles = css`
  height: 100%;
  background: ${palette.green.base};
  border-radius: 4px;
  transition: width 0.3s ease;
`

const progressTextStyles = css`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  font-size: 12px;
  color: ${palette.gray.dark1};
`

const footerStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 16px;
  border-top: 1px solid ${palette.gray.light2};
`

const footerLeftStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const footerRightStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
`

const errorStyles = css`
  color: ${palette.red.dark2};
  font-size: 13px;
  padding: 8px 12px;
  background: ${palette.red.light3};
  border-radius: 4px;
  margin-bottom: 16px;
`

const successStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  color: ${palette.green.dark2};
  font-size: 13px;
  padding: 8px 12px;
  background: ${palette.green.light3};
  border-radius: 4px;
  margin-bottom: 16px;
`

const infoStyles = css`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  background: ${palette.blue.light3};
  border-radius: 4px;
  margin-bottom: 16px;
  color: ${palette.blue.dark2};
  font-size: 13px;
`

// Helper to extract all unique fields from documents
function extractFields(documents: Document[]): string[] {
  const fieldSet = new Set<string>()
  for (const doc of documents) {
    extractFieldsRecursive(doc, '', fieldSet)
  }
  // Sort alphabetically but put _id first
  const fields = Array.from(fieldSet).sort()
  const idIndex = fields.indexOf('_id')
  if (idIndex > 0) {
    fields.splice(idIndex, 1)
    fields.unshift('_id')
  }
  return fields
}

function extractFieldsRecursive(
  obj: Record<string, unknown>,
  prefix: string,
  fieldSet: Set<string>
): void {
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    fieldSet.add(fullKey)
    // For nested objects, also extract nested fields (but not for arrays)
    const value = obj[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      extractFieldsRecursive(value as Record<string, unknown>, fullKey, fieldSet)
    }
  }
}

// Helper to get nested value from document
function getNestedValue(doc: Document, path: string): unknown {
  const parts = path.split('.')
  let value: unknown = doc
  for (const part of parts) {
    if (value === null || value === undefined) return undefined
    if (typeof value === 'object') {
      value = (value as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return value
}

// Convert documents to CSV
function convertToCSV(documents: Document[], fields: string[]): string {
  // Header row
  const header = fields.map((f) => `"${f.replace(/"/g, '""')}"`).join(',')

  // Data rows
  const rows = documents.map((doc) => {
    return fields
      .map((field) => {
        const value = getNestedValue(doc, field)
        if (value === null || value === undefined) return ''
        if (typeof value === 'object') {
          return `"${JSON.stringify(value).replace(/"/g, '""')}"`
        }
        if (typeof value === 'string') {
          return `"${value.replace(/"/g, '""')}"`
        }
        return String(value)
      })
      .join(',')
  })

  return [header, ...rows].join('\n')
}

// Convert documents to JSON with selected fields
function convertToJSON(documents: Document[], fields: string[]): string {
  const filtered = documents.map((doc) => {
    const result: Record<string, unknown> = {}
    for (const field of fields) {
      const value = getNestedValue(doc, field)
      if (value !== undefined) {
        // Handle nested fields
        const parts = field.split('.')
        let current = result
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i]
          if (!current[part]) {
            current[part] = {}
          }
          current = current[part] as Record<string, unknown>
        }
        current[parts[parts.length - 1]] = value
      }
    }
    return result
  })
  return JSON.stringify(filtered, null, 2)
}

export function ExportDialog({
  database,
  collection,
  open,
  onClose,
  filter = {},
  documents: providedDocuments,
  totalCount,
  onSuccess,
}: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('json')
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set())
  const [availableFields, setAvailableFields] = useState<string[]>([])
  const [exportState, setExportState] = useState<ExportState>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [exportedCount, setExportedCount] = useState(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Calculate estimated count
  const estimatedCount = totalCount ?? providedDocuments?.length ?? 0

  // Extract fields from provided documents or fetch sample
  useEffect(() => {
    if (!open) return

    const fetchFields = async () => {
      if (providedDocuments && providedDocuments.length > 0) {
        const fields = extractFields(providedDocuments)
        setAvailableFields(fields)
        setSelectedFields(new Set(fields))
      } else {
        // Fetch a sample of documents to extract fields
        try {
          const sample = await rpcClient.find(database, collection, {
            filter,
            limit: 100,
          })
          const fields = extractFields(sample)
          setAvailableFields(fields)
          setSelectedFields(new Set(fields))
        } catch (err) {
          console.error('Failed to fetch sample documents:', err)
          setError('Failed to load available fields')
        }
      }
    }

    fetchFields()
  }, [open, database, collection, filter, providedDocuments])

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setExportState('idle')
      setProgress(0)
      setError(null)
      setExportedCount(0)
    }
  }, [open])

  const handleFieldToggle = useCallback((field: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev)
      if (next.has(field)) {
        next.delete(field)
      } else {
        next.add(field)
      }
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    setSelectedFields(new Set(availableFields))
  }, [availableFields])

  const handleSelectNone = useCallback(() => {
    setSelectedFields(new Set())
  }, [])

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setExportState('idle')
    setProgress(0)
  }, [])

  const handleExport = useCallback(async () => {
    if (selectedFields.size === 0) {
      setError('Please select at least one field to export')
      return
    }

    setError(null)
    setExportState('fetching')
    setProgress(0)
    setExportedCount(0)

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    try {
      let allDocuments: Document[]

      if (providedDocuments && providedDocuments.length > 0) {
        // Use provided documents directly
        allDocuments = providedDocuments
        setProgress(50)
      } else {
        // Fetch all documents in batches
        const batchSize = 1000
        allDocuments = []
        let lastId: string | null = null
        let hasMore = true
        const total = estimatedCount || 1000 // Estimate for progress

        while (hasMore && !abortController.signal.aborted) {
          const batchFilter = lastId
            ? { ...filter, _id: { $gt: lastId } }
            : filter

          const batch = await rpcClient.find(database, collection, {
            filter: batchFilter,
            sort: { _id: 1 },
            limit: batchSize,
          })

          if (batch.length === 0) {
            hasMore = false
          } else {
            allDocuments.push(...batch)
            lastId = batch[batch.length - 1]._id
            hasMore = batch.length === batchSize
            setExportedCount(allDocuments.length)
            setProgress(Math.min(45, (allDocuments.length / total) * 45))
          }
        }

        if (abortController.signal.aborted) {
          return
        }
      }

      setExportState('processing')
      setProgress(50)

      // Convert to selected format
      const fieldsArray = Array.from(selectedFields)
      let content: string
      let mimeType: string
      let extension: string

      if (format === 'csv') {
        content = convertToCSV(allDocuments, fieldsArray)
        mimeType = 'text/csv'
        extension = 'csv'
      } else {
        content = convertToJSON(allDocuments, fieldsArray)
        mimeType = 'application/json'
        extension = 'json'
      }

      setProgress(75)
      setExportState('downloading')

      // Create and download the file
      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const filename = `${collection}-export-${timestamp}.${extension}`

      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setProgress(100)
      setExportState('complete')
      setExportedCount(allDocuments.length)
      onSuccess?.()
    } catch (err) {
      if (abortController.signal.aborted) {
        return
      }
      setError(err instanceof Error ? err.message : 'Export failed')
      setExportState('error')
    } finally {
      abortControllerRef.current = null
    }
  }, [
    database,
    collection,
    filter,
    format,
    selectedFields,
    providedDocuments,
    estimatedCount,
    onSuccess,
  ])

  const handleClose = useCallback(() => {
    if (exportState === 'fetching' || exportState === 'processing') {
      handleCancel()
    }
    onClose()
  }, [exportState, handleCancel, onClose])

  const isExporting = exportState === 'fetching' || exportState === 'processing' || exportState === 'downloading'

  // Get status message based on export state
  const getStatusMessage = (): string => {
    switch (exportState) {
      case 'fetching':
        return `Fetching documents... (${exportedCount} loaded)`
      case 'processing':
        return 'Processing data...'
      case 'downloading':
        return 'Preparing download...'
      case 'complete':
        return `Successfully exported ${exportedCount} documents`
      default:
        return ''
    }
  }

  return (
    <Modal open={open} setOpen={handleClose} size="large">
      <div className={modalContentStyles}>
        <div className={headerStyles}>
          <Icon glyph="Download" />
          <H3>Export Documents</H3>
        </div>

        {/* Info section */}
        <div className={infoStyles}>
          <Icon glyph="InfoWithCircle" size="small" />
          <div>
            Exporting from <strong>{collection}</strong>
            {estimatedCount > 0 && (
              <> - approximately <strong>{estimatedCount.toLocaleString()}</strong> documents</>
            )}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className={errorStyles} role="alert" data-testid="export-error">
            {error}
          </div>
        )}

        {/* Success message */}
        {exportState === 'complete' && (
          <div className={successStyles} data-testid="export-success">
            <Icon glyph="Checkmark" size="small" />
            {getStatusMessage()}
          </div>
        )}

        {/* Format selection */}
        <div className={sectionStyles}>
          <Body className={sectionTitleStyles}>Export Format</Body>
          <RadioBoxGroup
            className={formatSelectorStyles}
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
            data-testid="format-selector"
          >
            <RadioBox value="json" data-testid="format-json">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon glyph="CurlyBraces" />
                <span>JSON</span>
              </div>
            </RadioBox>
            <RadioBox value="csv" data-testid="format-csv">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon glyph="Menu" />
                <span>CSV</span>
              </div>
            </RadioBox>
          </RadioBoxGroup>
        </div>

        {/* Field selection */}
        <div className={sectionStyles}>
          <div className={fieldHeaderStyles}>
            <Body className={sectionTitleStyles} style={{ marginBottom: 0 }}>
              Fields to Export ({selectedFields.size} of {availableFields.length})
            </Body>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                size="xsmall"
                variant="default"
                onClick={handleSelectAll}
                disabled={isExporting}
                data-testid="select-all-fields"
              >
                Select All
              </Button>
              <Button
                size="xsmall"
                variant="default"
                onClick={handleSelectNone}
                disabled={isExporting}
                data-testid="select-none-fields"
              >
                Select None
              </Button>
            </div>
          </div>
          <div className={fieldSelectorStyles} data-testid="field-selector">
            {availableFields.length === 0 ? (
              <Body style={{ color: palette.gray.dark1 }}>Loading fields...</Body>
            ) : (
              availableFields.map((field) => (
                <Checkbox
                  key={field}
                  label={field}
                  checked={selectedFields.has(field)}
                  onChange={() => handleFieldToggle(field)}
                  disabled={isExporting}
                  data-testid={`field-checkbox-${field}`}
                />
              ))
            )}
          </div>
        </div>

        {/* Progress indicator */}
        {isExporting && (
          <div className={progressContainerStyles} data-testid="export-progress">
            <Body>{getStatusMessage()}</Body>
            <div className={progressBarContainerStyles}>
              <div
                className={progressBarStyles}
                style={{ width: `${progress}%` }}
                data-testid="progress-bar"
              />
            </div>
            <div className={progressTextStyles}>
              <span>{Math.round(progress)}%</span>
              {exportState === 'fetching' && (
                <Button
                  size="xsmall"
                  variant="dangerOutline"
                  onClick={handleCancel}
                  data-testid="cancel-export"
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className={footerStyles}>
          <div className={footerLeftStyles}>
            {format === 'csv' && (
              <Body style={{ fontSize: 12, color: palette.gray.dark1 }}>
                Note: Nested objects will be serialized as JSON strings in CSV
              </Body>
            )}
          </div>
          <div className={footerRightStyles}>
            <Button variant="default" onClick={handleClose} data-testid="close-export">
              {exportState === 'complete' ? 'Done' : 'Cancel'}
            </Button>
            {exportState !== 'complete' && (
              <Button
                variant="primary"
                onClick={handleExport}
                disabled={isExporting || selectedFields.size === 0}
                leftGlyph={<Icon glyph="Download" />}
                data-testid="start-export"
              >
                {isExporting ? 'Exporting...' : 'Export'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Inline export dialog that manages its own open state
 */
export interface ExportDialogInlineProps {
  database: string
  collection: string
  filter?: Record<string, unknown>
  documents?: Document[]
  totalCount?: number
  onSuccess?: () => void
  children: (props: { onClick: () => void }) => React.ReactNode
}

export function ExportDialogInline({
  database,
  collection,
  filter,
  documents,
  totalCount,
  onSuccess,
  children,
}: ExportDialogInlineProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {children({ onClick: () => setOpen(true) })}
      <ExportDialog
        database={database}
        collection={collection}
        filter={filter}
        documents={documents}
        totalCount={totalCount}
        open={open}
        onClose={() => setOpen(false)}
        onSuccess={onSuccess}
      />
    </>
  )
}
