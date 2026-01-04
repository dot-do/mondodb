/**
 * Types for the Database Browser components
 */

export interface DatabaseInfo {
  name: string
  sizeOnDisk?: number
  empty?: boolean
}

export interface CollectionInfo {
  name: string
  type: 'collection' | 'view'
  options?: Record<string, unknown>
}

export interface CollectionStats {
  name: string
  count: number
  size: number
  avgObjSize?: number
  storageSize?: number
  indexCount?: number
}

export interface DatabaseStats {
  name: string
  collections: number
  objects: number
  dataSize: number
}

export interface BrowserContextMenuAction {
  type: 'create-database' | 'drop-database' | 'create-collection' | 'drop-collection' | 'refresh'
  database?: string
  collection?: string
}
