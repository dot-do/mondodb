import { useState, useCallback, useMemo } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import Icon from '@leafygreen-ui/icon'
import IconButton from '@leafygreen-ui/icon-button'
import { Menu, MenuItem, MenuSeparator } from '@leafygreen-ui/menu'
import Tooltip from '@leafygreen-ui/tooltip'
import { useToast } from '@leafygreen-ui/toast'
import { CreateDocument } from './CreateDocument'
import { EditDocument } from './EditDocument'
import { DeleteDocument } from './DeleteDocument'
import { useInsertDocumentMutation } from '@hooks/useQueries'
import type { Document } from '@lib/rpc-client'

// Document action types
export type DocumentAction =
  | 'view'
  | 'edit'
  | 'duplicate'
  | 'delete'
  | 'copy_id'
  | 'copy_json'
  | 'export_json'

export interface DocumentActionsProps {
  database: string
  collection: string
  document: Document
  onView?: () => void
  onActionComplete?: (action: DocumentAction) => void
  /** Actions to show. Defaults to all actions. */
  actions?: DocumentAction[]
  /** Render as menu or inline buttons */
  variant?: 'menu' | 'inline'
  /** Size for inline buttons (maps to IconButton default) */
  size?: 'default' | 'small'
}

// IconButton only supports 'default' | 'large' | 'xlarge', so we map
const mapToIconButtonSize = (_size: 'default' | 'small'): 'default' | 'large' | 'xlarge' =>
  'default' as const

const inlineActionsStyles = css`
  display: flex;
  align-items: center;
  gap: 4px;
`

const menuTriggerStyles = css`
  &:hover {
    background: ${palette.gray.light2};
  }
`

export function DocumentActions({
  database,
  collection,
  document,
  onView,
  onActionComplete,
  actions = ['view', 'edit', 'duplicate', 'delete', 'copy_id', 'copy_json', 'export_json'],
  variant = 'menu',
  size = 'default',
}: DocumentActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const insertMutation = useInsertDocumentMutation(database, collection)

  // Filter actions based on provided list
  const hasAction = useCallback(
    (action: DocumentAction) => actions.includes(action),
    [actions]
  )

  const handleCopyId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(document._id)
      onActionComplete?.('copy_id')
    } catch {
      console.error('Failed to copy to clipboard')
    }
    setMenuOpen(false)
  }, [document._id, onActionComplete])

  const handleCopyJson = useCallback(async () => {
    try {
      const json = JSON.stringify(document, null, 2)
      await navigator.clipboard.writeText(json)
      onActionComplete?.('copy_json')
    } catch {
      console.error('Failed to copy to clipboard')
    }
    setMenuOpen(false)
  }, [document, onActionComplete])

  const handleExportJson = useCallback(() => {
    const json = JSON.stringify(document, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = window.document.createElement('a')
    a.href = url
    a.download = `${collection}-${document._id}.json`
    window.document.body.appendChild(a)
    a.click()
    window.document.body.removeChild(a)
    URL.revokeObjectURL(url)
    onActionComplete?.('export_json')
    setMenuOpen(false)
  }, [document, collection, onActionComplete])

  const handleDuplicate = useCallback(async () => {
    try {
      // Create a copy without _id
      const { _id, ...documentWithoutId } = document
      await insertMutation.mutateAsync(documentWithoutId)
      onActionComplete?.('duplicate')
    } catch {
      console.error('Failed to duplicate document')
    }
    setMenuOpen(false)
  }, [document, insertMutation, onActionComplete])

  const handleView = useCallback(() => {
    onView?.()
    onActionComplete?.('view')
    setMenuOpen(false)
  }, [onView, onActionComplete])

  const handleEdit = useCallback(() => {
    setEditOpen(true)
    setMenuOpen(false)
  }, [])

  const handleDelete = useCallback(() => {
    setDeleteOpen(true)
    setMenuOpen(false)
  }, [])

  const handleEditSuccess = useCallback(() => {
    onActionComplete?.('edit')
  }, [onActionComplete])

  const handleDeleteSuccess = useCallback(() => {
    onActionComplete?.('delete')
  }, [onActionComplete])

  if (variant === 'inline') {
    return (
      <>
        <div className={inlineActionsStyles}>
          {hasAction('view') && onView && (
            <Tooltip trigger={
              <IconButton
                aria-label="View document"
                onClick={handleView}
                size={mapToIconButtonSize(size)}
                data-testid="action-view"
              >
                <Icon glyph="Visibility" size={size === 'small' ? 'small' : 'default'} />
              </IconButton>
            }>
              View document
            </Tooltip>
          )}
          {hasAction('edit') && (
            <Tooltip trigger={
              <IconButton
                aria-label="Edit document"
                onClick={handleEdit}
                size={mapToIconButtonSize(size)}
                data-testid="action-edit"
              >
                <Icon glyph="Edit" size={size === 'small' ? 'small' : 'default'} />
              </IconButton>
            }>
              Edit document
            </Tooltip>
          )}
          {hasAction('copy_json') && (
            <Tooltip trigger={
              <IconButton
                aria-label="Copy as JSON"
                onClick={handleCopyJson}
                size={mapToIconButtonSize(size)}
                data-testid="action-copy-json"
              >
                <Icon glyph="Copy" size={size === 'small' ? 'small' : 'default'} />
              </IconButton>
            }>
              Copy as JSON
            </Tooltip>
          )}
          {hasAction('delete') && (
            <Tooltip trigger={
              <IconButton
                aria-label="Delete document"
                onClick={handleDelete}
                size={mapToIconButtonSize(size)}
                data-testid="action-delete"
              >
                <Icon glyph="Trash" size={size === 'small' ? 'small' : 'default'} />
              </IconButton>
            }>
              Delete document
            </Tooltip>
          )}
        </div>

        <EditDocument
          database={database}
          collection={collection}
          documentId={document._id}
          initialDocument={document}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSuccess={handleEditSuccess}
        />

        <DeleteDocument
          database={database}
          collection={collection}
          documentId={document._id}
          document={document}
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onSuccess={handleDeleteSuccess}
        />
      </>
    )
  }

  // Menu variant
  return (
    <>
      <Menu
        open={menuOpen}
        setOpen={setMenuOpen}
        trigger={
          <IconButton
            aria-label="Document actions"
            className={menuTriggerStyles}
            data-testid="document-actions-menu"
          >
            <Icon glyph="Ellipsis" />
          </IconButton>
        }
      >
        {hasAction('view') && onView && (
          <MenuItem
            glyph={<Icon glyph="Visibility" />}
            onClick={handleView}
            data-testid="menu-action-view"
          >
            View Document
          </MenuItem>
        )}
        {hasAction('edit') && (
          <MenuItem
            glyph={<Icon glyph="Edit" />}
            onClick={handleEdit}
            data-testid="menu-action-edit"
          >
            Edit Document
          </MenuItem>
        )}
        {hasAction('duplicate') && (
          <MenuItem
            glyph={<Icon glyph="Clone" />}
            onClick={handleDuplicate}
            disabled={insertMutation.isPending}
            data-testid="menu-action-duplicate"
          >
            {insertMutation.isPending ? 'Duplicating...' : 'Duplicate'}
          </MenuItem>
        )}

        {(hasAction('copy_id') || hasAction('copy_json') || hasAction('export_json')) && (
          <MenuSeparator />
        )}

        {hasAction('copy_id') && (
          <MenuItem
            glyph={<Icon glyph="Copy" />}
            onClick={handleCopyId}
            data-testid="menu-action-copy-id"
          >
            Copy _id
          </MenuItem>
        )}
        {hasAction('copy_json') && (
          <MenuItem
            glyph={<Icon glyph="CurlyBraces" />}
            onClick={handleCopyJson}
            data-testid="menu-action-copy-json"
          >
            Copy as JSON
          </MenuItem>
        )}
        {hasAction('export_json') && (
          <MenuItem
            glyph={<Icon glyph="Download" />}
            onClick={handleExportJson}
            data-testid="menu-action-export"
          >
            Export as JSON
          </MenuItem>
        )}

        {hasAction('delete') && (
          <>
            <MenuSeparator />
            <MenuItem
              glyph={<Icon glyph="Trash" />}
              onClick={handleDelete}
              data-testid="menu-action-delete"
            >
              Delete
            </MenuItem>
          </>
        )}
      </Menu>

      <EditDocument
        database={database}
        collection={collection}
        documentId={document._id}
        initialDocument={document}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSuccess={handleEditSuccess}
      />

      <DeleteDocument
        database={database}
        collection={collection}
        documentId={document._id}
        document={document}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onSuccess={handleDeleteSuccess}
      />
    </>
  )
}

/**
 * Bulk actions toolbar for multiple selected documents
 */
export interface BulkDocumentActionsProps {
  database: string
  collection: string
  selectedDocuments: Document[]
  onClear: () => void
  onActionComplete?: (action: 'delete' | 'export' | 'copy') => void
}

const bulkActionsStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: ${palette.blue.light3};
  border-radius: 6px;
`

const bulkActionsCountStyles = css`
  font-weight: 600;
  color: ${palette.blue.dark2};
`

export function BulkDocumentActions({
  database,
  collection,
  selectedDocuments,
  onClear,
  onActionComplete,
}: BulkDocumentActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false)

  const documentIds = useMemo(
    () => selectedDocuments.map((d) => d._id),
    [selectedDocuments]
  )

  const handleExportAll = useCallback(() => {
    const json = JSON.stringify(selectedDocuments, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = window.document.createElement('a')
    a.href = url
    a.download = `${collection}-export-${Date.now()}.json`
    window.document.body.appendChild(a)
    a.click()
    window.document.body.removeChild(a)
    URL.revokeObjectURL(url)
    onActionComplete?.('export')
  }, [selectedDocuments, collection, onActionComplete])

  const handleCopyAll = useCallback(async () => {
    try {
      const json = JSON.stringify(selectedDocuments, null, 2)
      await navigator.clipboard.writeText(json)
      onActionComplete?.('copy')
    } catch {
      console.error('Failed to copy to clipboard')
    }
  }, [selectedDocuments, onActionComplete])

  const handleDeleteSuccess = useCallback(() => {
    onActionComplete?.('delete')
    onClear()
  }, [onActionComplete, onClear])

  if (selectedDocuments.length === 0) {
    return null
  }

  return (
    <>
      <div className={bulkActionsStyles} data-testid="bulk-actions">
        <Body className={bulkActionsCountStyles}>
          {selectedDocuments.length} selected
        </Body>

        <Button
          variant="default"
          size="small"
          leftGlyph={<Icon glyph="Copy" />}
          onClick={handleCopyAll}
          data-testid="bulk-copy"
        >
          Copy
        </Button>

        <Button
          variant="default"
          size="small"
          leftGlyph={<Icon glyph="Download" />}
          onClick={handleExportAll}
          data-testid="bulk-export"
        >
          Export
        </Button>

        <Button
          variant="dangerOutline"
          size="small"
          leftGlyph={<Icon glyph="Trash" />}
          onClick={() => setDeleteOpen(true)}
          data-testid="bulk-delete"
        >
          Delete
        </Button>

        <Button
          variant="default"
          size="small"
          onClick={onClear}
          data-testid="bulk-clear"
        >
          Clear Selection
        </Button>
      </div>

      {/* Bulk delete uses a custom dialog since ConfirmationModal doesn't support bulk */}
      <DeleteDocument
        database={database}
        collection={collection}
        documentId={documentIds[0] ?? ''}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onSuccess={handleDeleteSuccess}
      />
    </>
  )
}
