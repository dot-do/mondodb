import { useParams, useNavigate } from 'react-router-dom'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { H2, Body, Subtitle } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import Card from '@leafygreen-ui/card'
import Icon from '@leafygreen-ui/icon'
import { useCollectionsQuery } from '@hooks/useQueries'
import { SkeletonLoader } from '../SkeletonLoader'

const pageStyles = css`
  max-width: 1200px;
`

const headerStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
`

const gridStyles = css`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
`

const cardStyles = css`
  cursor: pointer;
  transition: box-shadow 0.15s ease;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
`

const cardContentStyles = css`
  display: flex;
  align-items: center;
  gap: 16px;
`

const iconContainerStyles = css`
  width: 48px;
  height: 48px;
  background: ${palette.blue.light3};
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${palette.blue.dark2};
`

const emptyStateStyles = css`
  text-align: center;
  padding: 48px;
  background: ${palette.gray.light3};
  border-radius: 8px;
`

export function DatabasePage() {
  const { database } = useParams<{ database: string }>()
  const navigate = useNavigate()
  const { data: collections, isLoading, error } = useCollectionsQuery(database!)

  if (!database) {
    return <Body>No database selected</Body>
  }

  return (
    <div className={pageStyles}>
      <div className={headerStyles}>
        <div>
          <H2>{database}</H2>
          <Body>
            {collections?.length ?? 0} collection
            {collections?.length !== 1 ? 's' : ''}
          </Body>
        </div>
        <Button variant="primary" leftGlyph={<Icon glyph="Plus" />}>
          Create Collection
        </Button>
      </div>

      {isLoading ? (
        <div className={gridStyles}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <SkeletonLoader height={48} />
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card style={{ borderLeft: `4px solid ${palette.red.base}` }}>
          <Body style={{ color: palette.red.dark2 }}>
            Error loading collections: {String(error)}
          </Body>
        </Card>
      ) : collections?.length === 0 ? (
        <div className={emptyStateStyles}>
          <Icon glyph="Folder" size={48} />
          <Subtitle style={{ marginTop: 16 }}>No collections yet</Subtitle>
          <Body style={{ marginBottom: 24 }}>
            Create your first collection to start storing documents
          </Body>
          <Button variant="primary" leftGlyph={<Icon glyph="Plus" />}>
            Create Collection
          </Button>
        </div>
      ) : (
        <div className={gridStyles}>
          {collections?.map((coll) => (
            <Card
              key={coll.name}
              className={cardStyles}
              onClick={() => navigate(`/db/${database}/${coll.name}`)}
            >
              <div className={cardContentStyles}>
                <div className={iconContainerStyles}>
                  <Icon glyph="Folder" />
                </div>
                <div>
                  <Subtitle>{coll.name}</Subtitle>
                  <Body style={{ color: palette.gray.dark1 }}>
                    {coll.type === 'view' ? 'View' : 'Collection'}
                  </Body>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
