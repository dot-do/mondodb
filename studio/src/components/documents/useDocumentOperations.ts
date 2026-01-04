import { useState, useCallback, useMemo } from 'react'
import type { Document } from '@lib/rpc-client'

/**
 * Document operation state for managing CRUD modals
 */
export interface DocumentOperationState {
  // Modal states
  createOpen: boolean
  editOpen: boolean
  deleteOpen: boolean

  // Selected document for edit/delete
  selectedDocument: Document | null

  // Actions
  openCreate: () => void
  openEdit: (document: Document) => void
  openDelete: (document: Document) => void
  closeAll: () => void

  // Individual close methods
  closeCreate: () => void
  closeEdit: () => void
  closeDelete: () => void
}

/**
 * Hook to manage document CRUD operation states
 */
export function useDocumentOperations(): DocumentOperationState {
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)

  const openCreate = useCallback(() => {
    setCreateOpen(true)
  }, [])

  const openEdit = useCallback((document: Document) => {
    setSelectedDocument(document)
    setEditOpen(true)
  }, [])

  const openDelete = useCallback((document: Document) => {
    setSelectedDocument(document)
    setDeleteOpen(true)
  }, [])

  const closeCreate = useCallback(() => {
    setCreateOpen(false)
  }, [])

  const closeEdit = useCallback(() => {
    setEditOpen(false)
    setSelectedDocument(null)
  }, [])

  const closeDelete = useCallback(() => {
    setDeleteOpen(false)
    setSelectedDocument(null)
  }, [])

  const closeAll = useCallback(() => {
    setCreateOpen(false)
    setEditOpen(false)
    setDeleteOpen(false)
    setSelectedDocument(null)
  }, [])

  return useMemo(
    () => ({
      createOpen,
      editOpen,
      deleteOpen,
      selectedDocument,
      openCreate,
      openEdit,
      openDelete,
      closeAll,
      closeCreate,
      closeEdit,
      closeDelete,
    }),
    [
      createOpen,
      editOpen,
      deleteOpen,
      selectedDocument,
      openCreate,
      openEdit,
      openDelete,
      closeAll,
      closeCreate,
      closeEdit,
      closeDelete,
    ]
  )
}

/**
 * Document selection state for bulk operations
 */
export interface DocumentSelectionState {
  selectedIds: Set<string>
  selectedDocuments: Document[]
  isSelected: (id: string) => boolean
  toggle: (document: Document) => void
  select: (document: Document) => void
  deselect: (id: string) => void
  selectAll: (documents: Document[]) => void
  clear: () => void
  count: number
}

/**
 * Hook to manage document selection for bulk operations
 */
export function useDocumentSelection(): DocumentSelectionState {
  const [selectedMap, setSelectedMap] = useState<Map<string, Document>>(new Map())

  const selectedIds = useMemo(
    () => new Set(selectedMap.keys()),
    [selectedMap]
  )

  const selectedDocuments = useMemo(
    () => Array.from(selectedMap.values()),
    [selectedMap]
  )

  const isSelected = useCallback(
    (id: string) => selectedMap.has(id),
    [selectedMap]
  )

  const toggle = useCallback((document: Document) => {
    setSelectedMap((prev) => {
      const next = new Map(prev)
      if (next.has(document._id)) {
        next.delete(document._id)
      } else {
        next.set(document._id, document)
      }
      return next
    })
  }, [])

  const select = useCallback((document: Document) => {
    setSelectedMap((prev) => {
      const next = new Map(prev)
      next.set(document._id, document)
      return next
    })
  }, [])

  const deselect = useCallback((id: string) => {
    setSelectedMap((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const selectAll = useCallback((documents: Document[]) => {
    setSelectedMap(new Map(documents.map((d) => [d._id, d])))
  }, [])

  const clear = useCallback(() => {
    setSelectedMap(new Map())
  }, [])

  const count = selectedMap.size

  return useMemo(
    () => ({
      selectedIds,
      selectedDocuments,
      isSelected,
      toggle,
      select,
      deselect,
      selectAll,
      clear,
      count,
    }),
    [
      selectedIds,
      selectedDocuments,
      isSelected,
      toggle,
      select,
      deselect,
      selectAll,
      clear,
      count,
    ]
  )
}

/**
 * Copy document or field to clipboard
 */
export async function copyToClipboard(content: unknown): Promise<boolean> {
  try {
    const text =
      typeof content === 'string' ? content : JSON.stringify(content, null, 2)
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Download document(s) as JSON file
 */
export function downloadAsJson(
  data: unknown,
  filename: string
): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.json') ? filename : `${filename}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Prepare document for duplication (removes _id)
 */
export function prepareForDuplicate<T extends Document>(
  document: T
): Omit<T, '_id'> {
  const { _id, ...rest } = document
  return rest
}
