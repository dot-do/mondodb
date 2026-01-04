import { useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { H2, Body } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import { Tabs, Tab } from '@leafygreen-ui/tabs'
import Icon from '@leafygreen-ui/icon'
import Badge from '@leafygreen-ui/badge'
import { useDocumentsQuery, useDocumentCountQuery } from '@hooks/useQueries'
import { DocumentList } from '../documents/DocumentList'
import { QueryBar, type QueryOptions } from '../query/QueryBar'
import { SkeletonLoader } from '../SkeletonLoader'

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

export function CollectionPage() {
  const { database, collection } = useParams<{
    database: string
    collection: string
  }>()
  const [activeTab, setActiveTab] = useState(0)
  const [filter, setFilter] = useState<Record<string, unknown>>({})
  const [sort, setSort] = useState<Record<string, 1 | -1>>({})
  const [limit, setLimit] = useState(20)
  const [skip, setSkip] = useState(0)

  // Use empty string fallbacks for hooks (they'll be no-ops when undefined)
  // This avoids non-null assertions while maintaining hook call order
  const { data: documents, isLoading, error, refetch } = useDocumentsQuery(
    database ?? '',
    collection ?? '',
    { filter, sort, limit, skip }
  )
  const { data: count } = useDocumentCountQuery(database ?? '', collection ?? '', filter)

  // Early return after hooks - TypeScript narrows types below
  if (!database || !collection) {
    return <Body>No collection selected</Body>
  }

  const handleQueryExecute = useCallback(async (query: QueryOptions): Promise<{ count: number; time: number }> => {
    const startTime = performance.now()
    setFilter(query.filter)
    if (query.sort) setSort(query.sort as Record<string, 1 | -1>)
    if (query.limit !== undefined) setLimit(query.limit)
    await refetch()
    const endTime = performance.now()
    return { count: count ?? 0, time: endTime - startTime }
  }, [refetch, count])

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
          <Button variant="primary" leftGlyph={<Icon glyph="Plus" />}>
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
              <QueryBar
                database={database}
                collection={collection}
                onExecute={handleQueryExecute}
              />
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
              <Body>Schema analysis coming soon...</Body>
            </div>
          </Tab>
        </Tabs>
      </div>
    </div>
  )
}
