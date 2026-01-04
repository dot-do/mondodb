import { useState } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body, InlineCode } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import IconButton from '@leafygreen-ui/icon-button'
import Icon from '@leafygreen-ui/icon'
import { Document } from '@lib/rpc-client'
import { DocumentViewer } from './DocumentViewer'

const listStyles = css`
  margin-top: 16px;
`

const documentCardStyles = css`
  border: 1px solid ${palette.gray.light2};
  border-radius: 8px;
  margin-bottom: 8px;
  overflow: hidden;
`

const documentHeaderStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: ${palette.gray.light3};
  cursor: pointer;

  &:hover {
    background: ${palette.gray.light2};
  }
`

const documentIdStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const documentActionsStyles = css`
  display: flex;
  gap: 4px;
`

const documentBodyStyles = css`
  padding: 16px;
  background: ${palette.white};
  border-top: 1px solid ${palette.gray.light2};
`

const emptyStateStyles = css`
  text-align: center;
  padding: 48px;
  background: ${palette.gray.light3};
  border-radius: 8px;
  margin-top: 16px;
`

const viewToggleStyles = css`
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
`

interface DocumentListProps {
  documents: Document[]
  database: string
  collection: string
}

export function DocumentList({
  documents,
  database,
  collection,
}: DocumentListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'list' | 'json'>('list')

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  if (documents.length === 0) {
    return (
      <div className={emptyStateStyles}>
        <Icon glyph="File" size={48} />
        <Body style={{ marginTop: 16 }}>No documents found</Body>
        <Body style={{ color: palette.gray.dark1 }}>
          Insert a document or adjust your query
        </Body>
      </div>
    )
  }

  return (
    <div className={listStyles}>
      <div className={viewToggleStyles}>
        <Button
          variant={viewMode === 'list' ? 'primary' : 'default'}
          size="xsmall"
          onClick={() => setViewMode('list')}
        >
          List
        </Button>
        <Button
          variant={viewMode === 'json' ? 'primary' : 'default'}
          size="xsmall"
          onClick={() => setViewMode('json')}
        >
          JSON
        </Button>
      </div>

      {viewMode === 'json' ? (
        <DocumentViewer document={{ documents }} expanded />
      ) : (
        documents.map((doc) => (
          <div key={doc._id} className={documentCardStyles}>
            <div
              className={documentHeaderStyles}
              onClick={() => toggleExpanded(doc._id)}
            >
              <div className={documentIdStyles}>
                <Icon
                  glyph={expandedIds.has(doc._id) ? 'ChevronDown' : 'ChevronRight'}
                  size={16}
                />
                <InlineCode>_id: {doc._id}</InlineCode>
              </div>
              <div className={documentActionsStyles}>
                <IconButton aria-label="Edit document" size="small">
                  <Icon glyph="Edit" />
                </IconButton>
                <IconButton aria-label="Copy document" size="small">
                  <Icon glyph="Copy" />
                </IconButton>
                <IconButton aria-label="Delete document" size="small">
                  <Icon glyph="Trash" />
                </IconButton>
              </div>
            </div>
            {expandedIds.has(doc._id) && (
              <div className={documentBodyStyles}>
                <DocumentViewer document={doc} expanded />
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
