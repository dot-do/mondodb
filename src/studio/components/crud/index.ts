/**
 * CRUD Components
 *
 * Components for creating, reading, updating, and deleting documents.
 */

export { DocumentEditor } from "./DocumentEditor"
export type { DocumentEditorProps } from "./DocumentEditor"

// Insert Document Dialog
export {
  InsertDocumentDialog,
  JsonEditor,
  formatJson,
  parseJsonSafe,
} from './InsertDocumentDialog'

export type {
  InsertDocumentDialogProps,
  JsonEditorProps,
} from './InsertDocumentDialog'

// Delete Document Dialog
export {
  DeleteDocumentDialog,
  DeleteDocumentsBulk,
  DeleteDocumentInline,
} from './DeleteDocumentDialog'

export type {
  DeleteDocumentDialogProps,
  DeleteDocumentsBulkProps,
  DeleteDocumentInlineProps,
  DeletionResult,
  Document,
} from './DeleteDocumentDialog'

