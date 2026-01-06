import { useState, useCallback, useMemo, useRef, ChangeEvent } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { H3, Body, InlineCode, Subtitle } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import Modal from '@leafygreen-ui/modal'
import Icon from '@leafygreen-ui/icon'
import IconButton from '@leafygreen-ui/icon-button'
import Tooltip from '@leafygreen-ui/tooltip'
import { SegmentedControl, SegmentedControlOption } from '@leafygreen-ui/segmented-control'
import TextInput from '@leafygreen-ui/text-input'
import { useInsertManyDocumentsMutation } from '@hooks/useQueries'

// Types
export type ImportFormat = 'json' | 'csv'

export interface FieldMapping {
  csvColumn: string
  documentField: string
  type: 'string' | 'number' | 'boolean' | 'auto'
}

export interface ParsedImportData {
  documents: Record<string, unknown>[]
  headers?: string[]
  rawData?: string[][]
}

// Styles
const modalContentStyles = css`
  padding: 24px;
  min-height: 500px;
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

const uploadAreaStyles = css`
  border: 2px dashed ${palette.gray.light1};
  border-radius: 8px;
  padding: 32px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 16px;

  &:hover {
    border-color: ${palette.blue.base};
    background: ${palette.blue.light3}20;
  }

  &[data-dragging='true'] {
    border-color: ${palette.blue.base};
    background: ${palette.blue.light3}40;
  }
`

const uploadIconStyles = css`
  color: ${palette.gray.dark1};
  margin-bottom: 12px;
`

const uploadTextStyles = css`
  color: ${palette.gray.dark2};
  margin-bottom: 8px;
`

const uploadSubtextStyles = css`
  color: ${palette.gray.dark1};
  font-size: 12px;
`

const hiddenInputStyles = css`
  display: none;
`

const fileInfoStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: ${palette.gray.light3};
  border-radius: 6px;
  margin-bottom: 16px;
`

const fileInfoLeftStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
`

const fileNameStyles = css`
  font-weight: 500;
`

const fileSizeStyles = css`
  color: ${palette.gray.dark1};
  font-size: 12px;
`

const sectionStyles = css`
  margin-bottom: 20px;
`

const sectionTitleStyles = css`
  margin-bottom: 12px;
`

const previewContainerStyles = css`
  border: 1px solid ${palette.gray.light2};
  border-radius: 6px;
  overflow: hidden;
  max-height: 300px;
  overflow-y: auto;
`

const previewTableStyles = css`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th, td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid ${palette.gray.light2};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  th {
    background: ${palette.gray.light3};
    font-weight: 600;
    position: sticky;
    top: 0;
  }

  tr:hover td {
    background: ${palette.blue.light3}20;
  }
`

const jsonPreviewStyles = css`
  padding: 12px;
  background: ${palette.gray.light3};
  font-family: 'Source Code Pro', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 250px;
  overflow-y: auto;
`

const mappingRowStyles = css`
  display: grid;
  grid-template-columns: 1fr 24px 1fr 120px;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid ${palette.gray.light2};

  &:last-child {
    border-bottom: none;
  }
`

const mappingHeaderStyles = css`
  display: grid;
  grid-template-columns: 1fr 24px 1fr 120px;
  gap: 12px;
  padding: 8px 0;
  font-weight: 600;
  color: ${palette.gray.dark2};
  font-size: 12px;
  text-transform: uppercase;
  border-bottom: 2px solid ${palette.gray.light2};
`

const arrowStyles = css`
  color: ${palette.gray.dark1};
  display: flex;
  justify-content: center;
`

const typeSelectStyles = css`
  padding: 6px 8px;
  border: 1px solid ${palette.gray.light2};
  border-radius: 4px;
  font-size: 13px;
  background: white;

  &:focus {
    outline: none;
    border-color: ${palette.blue.base};
  }
`

const footerStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 16px;
  border-top: 1px solid ${palette.gray.light2};
  margin-top: 16px;
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

const statsStyles = css`
  display: flex;
  gap: 16px;
  color: ${palette.gray.dark1};
  font-size: 13px;
`

const statItemStyles = css`
  display: flex;
  align-items: center;
  gap: 4px;
`

const progressStyles = css`
  width: 100%;
  height: 4px;
  background: ${palette.gray.light2};
  border-radius: 2px;
  overflow: hidden;
  margin-top: 8px;
`

const progressBarStyles = css`
  height: 100%;
  background: ${palette.green.base};
  transition: width 0.3s ease;
`

// CSV Parser utility
function parseCSV(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.trim().split('\n')
  if (lines.length === 0) {
    return { headers: [], rows: [] }
  }

  const parseRow = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      const nextChar = line[i + 1]

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"'
          i++ // Skip next quote
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseRow(lines[0] || '')
  const rows = lines.slice(1).map(parseRow).filter(row => row.some(cell => cell !== ''))

  return { headers, rows }
}

// Convert value based on type
function convertValue(value: string, type: 'string' | 'number' | 'boolean' | 'auto'): unknown {
  if (value === '' || value === null || value === undefined) {
    return null
  }

  if (type === 'string') {
    return value
  }

  if (type === 'number') {
    const num = Number(value)
    return isNaN(num) ? value : num
  }

  if (type === 'boolean') {
    const lower = value.toLowerCase()
    if (lower === 'true' || lower === '1' || lower === 'yes') return true
    if (lower === 'false' || lower === '0' || lower === 'no') return false
    return value
  }

  // Auto-detect type
  const lower = value.toLowerCase()
  if (lower === 'true' || lower === 'false') {
    return lower === 'true'
  }
  const num = Number(value)
  if (!isNaN(num) && value.trim() !== '') {
    return num
  }
  return value
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export interface ImportDialogProps {
  database: string
  collection: string
  open: boolean
  onClose: () => void
  onSuccess?: (count: number) => void
}

export function ImportDialog({
  database,
  collection,
  open,
  onClose,
  onSuccess,
}: ImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [format, setFormat] = useState<ImportFormat>('json')
  const [fileContent, setFileContent] = useState<string>('')
  const [parsedData, setParsedData] = useState<ParsedImportData | null>(null)
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [importProgress, setImportProgress] = useState<number>(0)

  const insertManyMutation = useInsertManyDocumentsMutation(database, collection)

  // Reset state when closing
  const handleClose = useCallback(() => {
    setFile(null)
    setFileContent('')
    setParsedData(null)
    setFieldMappings([])
    setError(null)
    setIsDragging(false)
    setImportProgress(0)
    onClose()
  }, [onClose])

  // Parse file content
  const parseFile = useCallback((content: string, fileFormat: ImportFormat) => {
    setError(null)

    try {
      if (fileFormat === 'json') {
        const parsed = JSON.parse(content)
        let documents: Record<string, unknown>[]

        if (Array.isArray(parsed)) {
          documents = parsed
        } else if (typeof parsed === 'object' && parsed !== null) {
          documents = [parsed]
        } else {
          throw new Error('JSON must be an array of objects or a single object')
        }

        // Validate that all items are objects
        for (let i = 0; i < documents.length; i++) {
          if (typeof documents[i] !== 'object' || documents[i] === null || Array.isArray(documents[i])) {
            throw new Error(`Item at index ${i} is not a valid document object`)
          }
        }

        setParsedData({ documents })
        setFieldMappings([])
      } else {
        // CSV parsing
        const { headers, rows } = parseCSV(content)

        if (headers.length === 0) {
          throw new Error('CSV file appears to be empty or has no headers')
        }

        // Initialize field mappings from headers
        const mappings: FieldMapping[] = headers.map(header => ({
          csvColumn: header,
          documentField: header.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
          type: 'auto' as const,
        }))

        setFieldMappings(mappings)
        setParsedData({
          documents: [],
          headers,
          rawData: rows,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file')
      setParsedData(null)
    }
  }, [])

  // Handle file selection
  const handleFileSelect = useCallback((selectedFile: File) => {
    // Detect format from extension
    const extension = selectedFile.name.split('.').pop()?.toLowerCase()
    const detectedFormat: ImportFormat = extension === 'csv' ? 'csv' : 'json'

    setFile(selectedFile)
    setFormat(detectedFormat)
    setError(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setFileContent(content)
      parseFile(content, detectedFormat)
    }
    reader.onerror = () => {
      setError('Failed to read file')
    }
    reader.readAsText(selectedFile)
  }, [parseFile])

  // Handle file input change
  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      handleFileSelect(selectedFile)
    }
  }, [handleFileSelect])

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      handleFileSelect(droppedFile)
    }
  }, [handleFileSelect])

  // Handle field mapping change
  const handleMappingChange = useCallback((index: number, field: keyof FieldMapping, value: string) => {
    setFieldMappings(prev => {
      const updated = [...prev]
      const mapping = updated[index]
      if (mapping) {
        updated[index] = { ...mapping, [field]: value }
      }
      return updated
    })
  }, [])

  // Convert CSV data to documents using field mappings
  const csvToDocuments = useMemo((): Record<string, unknown>[] => {
    if (!parsedData?.rawData || !parsedData.headers) {
      return []
    }

    return parsedData.rawData.map(row => {
      const doc: Record<string, unknown> = {}
      fieldMappings.forEach((mapping, index) => {
        if (mapping.documentField && row[index] !== undefined) {
          doc[mapping.documentField] = convertValue(row[index] ?? '', mapping.type)
        }
      })
      return doc
    })
  }, [parsedData, fieldMappings])

  // Get documents to import
  const documentsToImport = useMemo(() => {
    if (format === 'json') {
      return parsedData?.documents ?? []
    }
    return csvToDocuments
  }, [format, parsedData, csvToDocuments])

  // Handle import
  const handleImport = useCallback(async () => {
    if (documentsToImport.length === 0) {
      setError('No documents to import')
      return
    }

    setError(null)
    setImportProgress(0)

    try {
      // Import in batches to show progress
      const batchSize = 100
      let imported = 0

      for (let i = 0; i < documentsToImport.length; i += batchSize) {
        const batch = documentsToImport.slice(i, i + batchSize)
        await insertManyMutation.mutateAsync(batch)
        imported += batch.length
        setImportProgress((imported / documentsToImport.length) * 100)
      }

      onSuccess?.(documentsToImport.length)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import documents')
    }
  }, [documentsToImport, insertManyMutation, onSuccess, handleClose])

  // Handle format change (re-parse file)
  const handleFormatChange = useCallback((value: string) => {
    const newFormat = value as ImportFormat
    setFormat(newFormat)
    if (fileContent) {
      parseFile(fileContent, newFormat)
    }
  }, [fileContent, parseFile])

  // Clear file selection
  const handleClearFile = useCallback(() => {
    setFile(null)
    setFileContent('')
    setParsedData(null)
    setFieldMappings([])
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const isImporting = insertManyMutation.isPending

  return (
    <Modal open={open} setOpen={handleClose} size="large">
      <div className={modalContentStyles}>
        <div className={headerStyles}>
          <div className={headerLeftStyles}>
            <Icon glyph="Import" />
            <H3>Import Documents</H3>
          </div>
        </div>

        <Body className={descriptionStyles}>
          Import documents into <strong>{collection}</strong> from a JSON or CSV file.
        </Body>

        {error && (
          <div className={errorStyles} role="alert" data-testid="import-error">
            {error}
          </div>
        )}

        {!file ? (
          <>
            <div
              className={uploadAreaStyles}
              data-dragging={isDragging}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              data-testid="upload-area"
            >
              <Icon glyph="Upload" size="xlarge" className={uploadIconStyles} />
              <Body className={uploadTextStyles}>
                Drag and drop a file here, or click to browse
              </Body>
              <Body className={uploadSubtextStyles}>
                Supports JSON and CSV files
              </Body>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv"
              onChange={handleInputChange}
              className={hiddenInputStyles}
              data-testid="file-input"
            />
          </>
        ) : (
          <>
            <div className={fileInfoStyles}>
              <div className={fileInfoLeftStyles}>
                <Icon glyph="File" />
                <div>
                  <Body className={fileNameStyles}>{file.name}</Body>
                  <Body className={fileSizeStyles}>{formatFileSize(file.size)}</Body>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <SegmentedControl
                  value={format}
                  onChange={handleFormatChange}
                  size="small"
                  data-testid="format-selector"
                >
                  <SegmentedControlOption value="json">JSON</SegmentedControlOption>
                  <SegmentedControlOption value="csv">CSV</SegmentedControlOption>
                </SegmentedControl>
                <Tooltip trigger={
                  <IconButton
                    aria-label="Remove file"
                    onClick={handleClearFile}
                    data-testid="clear-file"
                  >
                    <Icon glyph="X" />
                  </IconButton>
                }>
                  Remove file
                </Tooltip>
              </div>
            </div>

            {/* CSV Field Mapping */}
            {format === 'csv' && fieldMappings.length > 0 && (
              <div className={sectionStyles}>
                <Subtitle className={sectionTitleStyles}>Field Mapping</Subtitle>
                <div className={mappingHeaderStyles}>
                  <span>CSV Column</span>
                  <span />
                  <span>Document Field</span>
                  <span>Type</span>
                </div>
                {fieldMappings.map((mapping, index) => (
                  <div key={index} className={mappingRowStyles} data-testid={`mapping-row-${index}`}>
                    <InlineCode>{mapping.csvColumn}</InlineCode>
                    <span className={arrowStyles}>
                      <Icon glyph="ArrowRight" size="small" />
                    </span>
                    <TextInput
                      value={mapping.documentField}
                      onChange={(e) => handleMappingChange(index, 'documentField', e.target.value)}
                      aria-label={`Field name for ${mapping.csvColumn}`}
                      sizeVariant="small"
                      data-testid={`mapping-field-${index}`}
                    />
                    <select
                      value={mapping.type}
                      onChange={(e) => handleMappingChange(index, 'type', e.target.value)}
                      className={typeSelectStyles}
                      data-testid={`mapping-type-${index}`}
                    >
                      <option value="auto">Auto</option>
                      <option value="string">String</option>
                      <option value="number">Number</option>
                      <option value="boolean">Boolean</option>
                    </select>
                  </div>
                ))}
              </div>
            )}

            {/* Data Preview */}
            {parsedData && (
              <div className={sectionStyles}>
                <Subtitle className={sectionTitleStyles}>Preview</Subtitle>
                <div className={previewContainerStyles}>
                  {format === 'json' ? (
                    <div className={jsonPreviewStyles} data-testid="json-preview">
                      {JSON.stringify(documentsToImport.slice(0, 5), null, 2)}
                      {documentsToImport.length > 5 && (
                        <div style={{ marginTop: '8px', color: palette.gray.dark1 }}>
                          ... and {documentsToImport.length - 5} more documents
                        </div>
                      )}
                    </div>
                  ) : (
                    <table className={previewTableStyles} data-testid="csv-preview">
                      <thead>
                        <tr>
                          {fieldMappings.map((mapping, i) => (
                            <th key={i}>{mapping.documentField || mapping.csvColumn}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvToDocuments.slice(0, 10).map((doc, rowIndex) => (
                          <tr key={rowIndex}>
                            {fieldMappings.map((mapping, colIndex) => (
                              <td key={colIndex}>
                                {String(doc[mapping.documentField] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* Import Progress */}
            {isImporting && (
              <div className={progressStyles}>
                <div
                  className={progressBarStyles}
                  style={{ width: `${importProgress}%` }}
                  data-testid="import-progress"
                />
              </div>
            )}
          </>
        )}

        <div className={footerStyles}>
          <div className={footerLeftStyles}>
            {parsedData && (
              <div className={statsStyles}>
                <span className={statItemStyles}>
                  <Icon glyph="File" size="small" />
                  {documentsToImport.length} documents
                </span>
                {format === 'csv' && fieldMappings.length > 0 && (
                  <span className={statItemStyles}>
                    <Icon glyph="CurlyBraces" size="small" />
                    {fieldMappings.length} fields
                  </span>
                )}
              </div>
            )}
          </div>
          <div className={footerRightStyles}>
            <Button variant="default" onClick={handleClose} disabled={isImporting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleImport}
              disabled={!parsedData || documentsToImport.length === 0 || isImporting}
              data-testid="import-submit"
            >
              {isImporting
                ? `Importing... (${Math.round(importProgress)}%)`
                : `Import ${documentsToImport.length} Document${documentsToImport.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Trigger button for opening the import dialog
 */
export interface ImportButtonProps {
  onClick: () => void
  disabled?: boolean
  variant?: 'primary' | 'primaryOutline' | 'default'
}

export function ImportButton({
  onClick,
  disabled = false,
  variant = 'default',
}: ImportButtonProps) {
  return (
    <Button
      variant={variant}
      onClick={onClick}
      disabled={disabled}
      leftGlyph={<Icon glyph="Import" />}
      data-testid="import-button"
    >
      Import
    </Button>
  )
}
