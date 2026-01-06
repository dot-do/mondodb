import { useState, useCallback, useRef } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { H3, Body, InlineCode } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import Modal from '@leafygreen-ui/modal'
import Icon from '@leafygreen-ui/icon'
import IconButton from '@leafygreen-ui/icon-button'
import Tooltip from '@leafygreen-ui/tooltip'
import { useInsertManyDocumentsMutation } from '@hooks/useQueries'

const modalContentStyles = css`
  padding: 24px;
`

const headerStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
`

const headerLeftStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
`

const descriptionStyles = css`
  color: ${palette.gray.dark1};
  margin-bottom: 16px;
`

const dropZoneStyles = css`
  border: 2px dashed ${palette.gray.light1};
  border-radius: 8px;
  padding: 48px 24px;
  text-align: center;
  transition: all 0.2s;
  cursor: pointer;
  margin-bottom: 16px;

  &:hover {
    border-color: ${palette.blue.base};
    background: ${palette.blue.light3};
  }
`

const dropZoneActiveStyles = css`
  border-color: ${palette.blue.base};
  background: ${palette.blue.light3};
`

const dropZoneIconStyles = css`
  color: ${palette.gray.dark1};
  margin-bottom: 8px;
`

const fileInfoStyles = css`
  margin-bottom: 16px;
  padding: 12px;
  background: ${palette.gray.light3};
  border-radius: 6px;
`

const fileNameStyles = css`
  font-weight: 600;
  margin-bottom: 4px;
`

const progressContainerStyles = css`
  margin-bottom: 16px;
`

const progressBarStyles = css`
  height: 8px;
  background: ${palette.gray.light2};
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
`

const progressFillStyles = css`
  height: 100%;
  background: ${palette.green.base};
  transition: width 0.3s ease;
`

const progressTextStyles = css`
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: ${palette.gray.dark1};
`

const footerStyles = css`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-top: 16px;
  border-top: 1px solid ${palette.gray.light2};
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
  color: ${palette.green.dark2};
  font-size: 13px;
  padding: 8px 12px;
  background: ${palette.green.light3};
  border-radius: 4px;
  margin-bottom: 16px;
`

const optionsStyles = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px;
  background: ${palette.gray.light3};
  border-radius: 6px;
`

const optionRowStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

// Constants for batch processing
const DEFAULT_BATCH_SIZE = 100
const MAX_BATCH_SIZE = 1000
const MIN_BATCH_SIZE = 10

export interface ImportDocumentsProps {
  database: string
  collection: string
  open: boolean
  onClose: () => void
  onSuccess?: (insertedCount: number) => void
}

interface ImportProgress {
  total: number
  processed: number
  inserted: number
  failed: number
  status: 'idle' | 'parsing' | 'importing' | 'complete' | 'error'
}

export function ImportDocuments({
  database,
  collection,
  open,
  onClose,
  onSuccess,
}: ImportDocumentsProps) {
  const [file, setFile] = useState<File | null>(null)
  const [documents, setDocuments] = useState<Record<string, unknown>[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [batchSize, setBatchSize] = useState(DEFAULT_BATCH_SIZE)
  const [progress, setProgress] = useState<ImportProgress>({
    total: 0,
    processed: 0,
    inserted: 0,
    failed: 0,
    status: 'idle',
  })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const insertManyMutation = useInsertManyDocumentsMutation(database, collection)

  const resetState = useCallback(() => {
    setFile(null)
    setDocuments([])
    setError(null)
    setProgress({
      total: 0,
      processed: 0,
      inserted: 0,
      failed: 0,
      status: 'idle',
    })
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])

  const handleClose = useCallback(() => {
    resetState()
    onClose()
  }, [resetState, onClose])

  const parseFile = useCallback(async (file: File): Promise<Record<string, unknown>[]> => {
    const text = await file.text()

    // Try to parse as JSON
    try {
      const parsed = JSON.parse(text)

      // Check if it's an array of documents
      if (Array.isArray(parsed)) {
        // Validate that all items are objects
        for (let i = 0; i < parsed.length; i++) {
          if (typeof parsed[i] !== 'object' || parsed[i] === null || Array.isArray(parsed[i])) {
            throw new Error(`Item at index ${i} is not a valid document object`)
          }
        }
        return parsed
      }

      // Single document - wrap in array
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return [parsed]
      }

      throw new Error('Invalid JSON format: expected object or array of objects')
    } catch (e) {
      // Try to parse as newline-delimited JSON (NDJSON)
      const lines = text.split('\n').filter(line => line.trim())
      const docs: Record<string, unknown>[] = []

      for (let i = 0; i < lines.length; i++) {
        try {
          const doc = JSON.parse(lines[i] ?? '')
          if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
            throw new Error(`Line ${i + 1} is not a valid document object`)
          }
          docs.push(doc)
        } catch (lineError) {
          if (e instanceof SyntaxError) {
            throw new Error(`Invalid JSON at line ${i + 1}: ${(lineError as Error).message}`)
          }
          throw lineError
        }
      }

      if (docs.length === 0) {
        throw new Error('No valid documents found in file')
      }

      return docs
    }
  }, [])

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setError(null)
    setFile(selectedFile)
    setProgress(prev => ({ ...prev, status: 'parsing' }))

    try {
      const docs = await parseFile(selectedFile)
      setDocuments(docs)
      setProgress({
        total: docs.length,
        processed: 0,
        inserted: 0,
        failed: 0,
        status: 'idle',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse file')
      setDocuments([])
      setProgress(prev => ({ ...prev, status: 'error' }))
    }
  }, [parseFile])

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = e.dataTransfer.files
    if (files?.[0]) {
      handleFileSelect(files[0])
    }
  }, [handleFileSelect])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files?.[0]) {
      handleFileSelect(files[0])
    }
  }, [handleFileSelect])

  const handleImport = useCallback(async () => {
    if (documents.length === 0) return

    setError(null)
    abortControllerRef.current = new AbortController()

    setProgress({
      total: documents.length,
      processed: 0,
      inserted: 0,
      failed: 0,
      status: 'importing',
    })

    let totalInserted = 0
    let totalFailed = 0

    // Process documents in batches
    for (let i = 0; i < documents.length; i += batchSize) {
      // Check for abort
      if (abortControllerRef.current?.signal.aborted) {
        setProgress(prev => ({ ...prev, status: 'error' }))
        setError('Import cancelled')
        return
      }

      const batch = documents.slice(i, Math.min(i + batchSize, documents.length))

      try {
        // Remove _id fields if they exist to let server generate new ones
        const cleanedBatch = batch.map(doc => {
          const { _id, ...rest } = doc
          return rest
        })

        const result = await insertManyMutation.mutateAsync(cleanedBatch)
        totalInserted += result.insertedIds.length
      } catch (e) {
        totalFailed += batch.length
        console.error('Batch insert failed:', e)
      }

      const processed = Math.min(i + batchSize, documents.length)
      setProgress({
        total: documents.length,
        processed,
        inserted: totalInserted,
        failed: totalFailed,
        status: processed >= documents.length ? 'complete' : 'importing',
      })
    }

    if (totalInserted > 0) {
      onSuccess?.(totalInserted)
    }
  }, [documents, batchSize, insertManyMutation, onSuccess])

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }, [])

  const progressPercent = progress.total > 0
    ? Math.round((progress.processed / progress.total) * 100)
    : 0

  return (
    <Modal open={open} setOpen={handleClose} size="large">
      <div className={modalContentStyles}>
        <div className={headerStyles}>
          <div className={headerLeftStyles}>
            <Icon glyph="Upload" />
            <H3>Import Documents</H3>
          </div>
        </div>

        <Body className={descriptionStyles}>
          Import documents into <strong>{collection}</strong> from a JSON file.
          Supports JSON arrays, single objects, and newline-delimited JSON (NDJSON).
        </Body>

        {error && (
          <div className={errorStyles} role="alert" data-testid="import-error">
            {error}
          </div>
        )}

        {progress.status === 'complete' && progress.inserted > 0 && (
          <div className={successStyles} role="status" data-testid="import-success">
            Successfully imported {progress.inserted} documents
            {progress.failed > 0 && ` (${progress.failed} failed)`}
          </div>
        )}

        {!file && (
          <div
            className={`${dropZoneStyles} ${dragActive ? dropZoneActiveStyles : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            data-testid="import-drop-zone"
          >
            <Icon glyph="Upload" size="xlarge" className={dropZoneIconStyles} />
            <Body>
              <strong>Drop a JSON file here</strong> or click to browse
            </Body>
            <Body style={{ fontSize: 13, color: palette.gray.dark1, marginTop: 8 }}>
              Supported formats: .json, .ndjson
            </Body>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.ndjson"
              onChange={handleInputChange}
              style={{ display: 'none' }}
              data-testid="import-file-input"
            />
          </div>
        )}

        {file && documents.length > 0 && (
          <>
            <div className={fileInfoStyles}>
              <Body className={fileNameStyles}>{file.name}</Body>
              <Body style={{ fontSize: 13, color: palette.gray.dark1 }}>
                {documents.length.toLocaleString()} documents to import
                {' '}({(file.size / 1024).toFixed(1)} KB)
              </Body>
            </div>

            <div className={optionsStyles}>
              <Body style={{ fontWeight: 600, marginBottom: 4 }}>Import Options</Body>
              <div className={optionRowStyles}>
                <label htmlFor="batch-size">Batch size:</label>
                <select
                  id="batch-size"
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  disabled={progress.status === 'importing'}
                  style={{ padding: '4px 8px', borderRadius: 4 }}
                >
                  <option value={10}>10 documents</option>
                  <option value={50}>50 documents</option>
                  <option value={100}>100 documents</option>
                  <option value={500}>500 documents</option>
                  <option value={1000}>1000 documents</option>
                </select>
                <Tooltip
                  trigger={
                    <IconButton aria-label="Batch size info" size="default">
                      <Icon glyph="InfoWithCircle" size="small" />
                    </IconButton>
                  }
                >
                  Larger batches are faster but may timeout for large documents
                </Tooltip>
              </div>
            </div>
          </>
        )}

        {progress.status === 'importing' && (
          <div className={progressContainerStyles}>
            <div className={progressBarStyles}>
              <div
                className={progressFillStyles}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className={progressTextStyles}>
              <span>
                {progress.processed.toLocaleString()} / {progress.total.toLocaleString()} documents
              </span>
              <span>{progressPercent}%</span>
            </div>
          </div>
        )}

        <div className={footerStyles}>
          {progress.status === 'importing' ? (
            <Button variant="dangerOutline" onClick={handleCancel}>
              Cancel
            </Button>
          ) : (
            <>
              {file && (
                <Button
                  variant="default"
                  onClick={resetState}
                >
                  Clear
                </Button>
              )}
              <Button variant="default" onClick={handleClose}>
                {progress.status === 'complete' ? 'Done' : 'Cancel'}
              </Button>
              {documents.length > 0 && progress.status !== 'complete' && (
                <Button
                  variant="primary"
                  onClick={handleImport}
                  disabled={insertManyMutation.isPending}
                  data-testid="import-submit"
                >
                  Import {documents.length.toLocaleString()} Documents
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

/**
 * Trigger button for opening the import documents modal
 */
export interface ImportDocumentsButtonProps {
  onClick: () => void
  disabled?: boolean
}

export function ImportDocumentsButton({
  onClick,
  disabled = false,
}: ImportDocumentsButtonProps) {
  return (
    <Button
      variant="default"
      onClick={onClick}
      disabled={disabled}
      leftGlyph={<Icon glyph="Upload" />}
      data-testid="import-documents-button"
    >
      Import
    </Button>
  )
}
