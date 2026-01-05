/**
 * mongo.do Studio - UI components for database management
 */

// Connection components
export {
  ConnectionPanel,
  ConnectionStatusIndicator,
  ConnectionForm,
  ConnectionList,
} from './components/connection'

export type {
  ConnectionPanelProps,
  ConnectionStatusIndicatorProps,
  ConnectionFormProps,
  ConnectionListProps,
} from './components/connection'

// Browser components
export {
  DatabaseBrowser,
  ConnectedDatabaseBrowser,
  CollectionTree,
  CollectionItem,
} from './components/browser'

export type {
  DatabaseBrowserProps,
  ConnectedDatabaseBrowserProps,
  CollectionTreeProps,
  CollectionItemProps,
  DatabaseInfo,
  CollectionInfo,
  CollectionStats,
  DatabaseStats,
  BrowserContextMenuAction,
} from './components/browser'

// Hooks
export { useConnection } from './hooks/useConnection'
export type { UseConnectionOptions, UseConnectionReturn } from './hooks/useConnection'

export { useDatabaseBrowser } from './hooks/useDatabaseBrowser'
export type { UseDatabaseBrowserOptions, UseDatabaseBrowserReturn } from './hooks/useDatabaseBrowser'

// Types
export type {
  AuthType,
  AuthConfig,
  ConnectionStatus,
  TLSConfig,
  ConnectionConfig,
  SavedConnection,
  ConnectionState,
  ServerInfo,
  ConnectionFormValues,
  ConnectionAction,
} from './types/connection'

export {
  DEFAULT_CONNECTION_FORM_VALUES,
  parseConnectionURI,
  buildConnectionURI,
  generateConnectionId,
  savedToConfig,
  configToSaved,
} from './types/connection'

// CRUD components
export {
  InsertDocumentDialog,
  JsonEditor,
  formatJson,
  parseJsonSafe,
} from './components/crud'

export type { InsertDocumentDialogProps, JsonEditorProps } from './components/crud'
