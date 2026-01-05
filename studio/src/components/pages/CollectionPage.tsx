import { useState, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { H2, Body } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import { Tabs, Tab } from '@leafygreen-ui/tabs'
import Icon from '@leafygreen-ui/icon'
import Badge from '@leafygreen-ui/badge'
import { useInfiniteDocumentsQuery, useDocumentCountQuery } from '@hooks/useQueries'
import { DocumentList } from '../documents/DocumentList'
import { QueryBar, QueryHistory, type QueryOptions } from '../query'
import { SkeletonLoader } from '../SkeletonLoader'
import { CreateDocument } from '../documents/CreateDocument'
import { DeleteDocument } from '../documents/DeleteDocument'
import { AnalyticsDashboard } from '../olap'
import { SchemaAnalyzer } from '../schema'
import { ErrorBoundary } from '../ErrorBoundary'
import type { Document } from '@lib/rpc-client'

const pageStyles = css`
  display: flex;
  flex-direction: column;
  height: 100%;
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

const headerActionsStyles = css`
  display: flex;
  gap: 8px;
`

const contentStyles = css`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
`

const tabContentStyles = css`
  flex: 1;
  overflow: auto;
  padding-top: 16px;
`

const queryContainerStyles = css`
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
`

const queryBarContainerStyles = css`
  flex: 1;
  min-width: 0;
`

const historyPanelStyles = css`
  width: 400px;
  min-height: 300px;
  max-height: 500px;
  flex-shrink: 0;
`

export function CollectionPage() {
  const { database, collection } = useParams<{
    database: string
    collection: string
  }>()
  const [activeTab, setActiveTab] = useState(0)
  const [filter, setFilter] = useState<Record<string, unknown>>({})
  const [sort, setSort] = useState<Record<string, 1 | -1>>({ _id: 1 })
  const [pageSize, setPageSize] = useState(20)

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null)

  // Query history panel state
  const [showHistory, setShowHistory] = useState(false)

  // Use cursor-based infinite query for documents
  const {
    data,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteDocumentsQuery(
    database ?? '',
    collection ?? '',
    { filter, sort, pageSize }
  )

  // Flatten all pages of documents into a single array
  const documents = useMemo(() => {
    if (!data?.pages) return []
    return data.pages.flatMap((page) => page.documents)
  }, [data?.pages])

  const { data: count } = useDocumentCountQuery(database ?? '', collection ?? '', filter)

  // Early return after hooks - TypeScript narrows types below
  if (!database || !collection) {
    return <Body>No collection selected</Body>
  }

  const handleQueryExecute = useCallback(async (query: QueryOptions): Promise<{ count: number; time: number }> => {
    const startTime = performance.now()
    setFilter(query.filter)
    if (query.sort) setSort(query.sort as Record<string, 1 | -1>)
    if (query.limit !== undefined) setPageSize(query.limit)
    // Refetch will reset cursor pagination automatically
    await refetch()
    const endTime = performance.now()
    return { count: count ?? 0, time: endTime - startTime }
  }, [refetch, count])

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const handleDocumentDelete = useCallback((document: Document) => {
    setDeleteTarget(document)
    setDeleteOpen(true)
  }, [])

  const handleCreateSuccess = useCallback(() => {
    refetch()
  }, [refetch])

  const handleDeleteSuccess = useCallback(() => {
    setDeleteTarget(null)
    refetch()
  }, [refetch])

  return (
    <div className={pageStyles}>
      <div className={headerStyles}>
        <div className={headerLeftStyles}>
          <H2>{collection}</H2>
          <Badge variant="lightgray">
            {count !== undefined ? `${count} docs` : '...'}
          </Badge>
        </div>
        <div className={headerActionsStyles}>
          <Button variant="default" leftGlyph={<Icon glyph="Refresh" />} onClick={() => refetch()}>
            Refresh
          </Button>
          <Button
            variant="primary"
            leftGlyph={<Icon glyph="Plus" />}
            onClick={() => setCreateOpen(true)}
            data-testid="insert-document-button"
          >
            Insert Document
          </Button>
        </div>
      </div>

      <div className={contentStyles}>
        <Tabs
          selected={activeTab}
          setSelected={setActiveTab}
          aria-label="Collection tabs"
        >
          <Tab name="Documents">
            <div className={tabContentStyles}>
              <div className={queryContainerStyles}>
                <div className={queryBarContainerStyles}>
                  <QueryBar
                    database={database}
                    collection={collection}
                    onExecute={handleQueryExecute}
                    showHistory={showHistory}
                    onHistoryToggle={() => setShowHistory(!showHistory)}
                  />
                </div>
                {showHistory && (
                  <div className={historyPanelStyles}>
                    <QueryHistory
                      database={database}
                      collection={collection}
                    />
                  </div>
                )}
              </div>
              {isLoading ? (
                <SkeletonLoader count={5} height={40} />
              ) : error ? (
                <Body style={{ color: palette.red.dark2 }}>
                  Error loading documents: {String(error)}
                </Body>
              ) : (
                <DocumentList
                  documents={documents ?? []}
                  totalCount={count}
                  page={Math.floor(skip / limit) + 1}
                  pageSize={limit}
                  onPageChange={(page) => setSkip((page - 1) * limit)}
                  onPageSizeChange={setLimit}
                  onDocumentDelete={handleDocumentDelete}
                />
              )}
            </div>
          </Tab>
          <Tab name="Indexes">
            <div className={tabContentStyles}>
              <Body>Index management coming soon...</Body>
            </div>
          </Tab>
          <Tab name="Aggregation">
            <div className={tabContentStyles}>
              <Body>Aggregation pipeline builder coming soon...</Body>
            </div>
          </Tab>
          <Tab name="Schema">
            <div className={tabContentStyles}>
              <ErrorBoundary>
                <SchemaAnalyzer database={database} collection={collection} />
              </ErrorBoundary>
            </div>
          </Tab>
          <Tab name="Analytics">
            <div className={tabContentStyles}>
              <ErrorBoundary>
                <AnalyticsDashboard database={database} collection={collection} />
              </ErrorBoundary>
            </div>
          </Tab>
        </Tabs>
      </div>

      {/* Create Document Dialog */}
      <CreateDocument
        database={database}
        collection={collection}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={handleCreateSuccess}
      />

      {/* Delete Document Dialog */}
      {deleteTarget && (
        <DeleteDocument
          database={database}
          collection={collection}
          documentId={deleteTarget._id}
          document={deleteTarget}
          open={deleteOpen}
          onClose={() => {
            setDeleteOpen(false)
            setDeleteTarget(null)
          }}
          onSuccess={handleDeleteSuccess}
        />
      )}
    </div>
  )
}
