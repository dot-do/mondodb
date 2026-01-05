/**
 * Document CRUD Components
 *
 * Provides React components for creating, reading, updating, and deleting
 * MongoDB documents in the mongo.do Studio.
 */

// Document List View Components
export { DocumentList } from './DocumentList'
export type {
  DocumentListProps,
  ColumnConfig,
  SortConfig,
  FilterConfig,
  ViewMode,
  SortDirection,
} from './DocumentList'

export { DocumentRow } from './DocumentRow'
export type { DocumentRowProps } from './DocumentRow'

export { Pagination } from './Pagination'
export type { PaginationProps } from './Pagination'

export { JsonTreeView } from './JsonTreeView'
export type { JsonTreeViewProps } from './JsonTreeView'

export { DocumentViewer } from './DocumentViewer'

// JSON Editor
export { JsonEditor, formatJson, parseJsonSafe } from './JsonEditor'
export type { JsonEditorProps } from './JsonEditor'

// Create Document
export { CreateDocument, CreateDocumentButton } from './CreateDocument'
export type { CreateDocumentProps, CreateDocumentButtonProps } from './CreateDocument'

// Edit Document
export { EditDocument, EditDocumentInline } from './EditDocument'
export type { EditDocumentProps, EditDocumentInlineProps } from './EditDocument'

// Delete Document
export {
  DeleteDocument,
  DeleteDocumentsBulk,
  DeleteDocumentInline,
} from './DeleteDocument'
export type {
  DeleteDocumentProps,
  DeleteDocumentsBulkProps,
  DeleteDocumentInlineProps,
} from './DeleteDocument'

// Export Document
export {
  ExportDialog,
  ExportDialogInline,
} from './ExportDialog'
export type {
  ExportDialogProps,
  ExportDialogInlineProps,
  ExportFormat,
  ExportState,
} from './ExportDialog'

// Document Actions
export {
  DocumentActions,
  BulkDocumentActions,
} from './DocumentActions'
export type {
  DocumentAction,
  DocumentActionsProps,
  BulkDocumentActionsProps,
} from './DocumentActions'

// Document hooks (re-exported from useQueries for convenience)
export {
  useDocumentQuery,
  useDocumentsQuery,
  useDocumentCountQuery,
  useInsertDocumentMutation,
  useUpdateDocumentMutation,
  useDeleteDocumentMutation,
} from '@hooks/useQueries'

// Document operations hooks
export {
  useDocumentOperations,
  useDocumentSelection,
  copyToClipboard,
  downloadAsJson,
  prepareForDuplicate,
} from './useDocumentOperations'
export type {
  DocumentOperationState,
  DocumentSelectionState,
} from './useDocumentOperations'
