import { useNavigate, useParams } from 'react-router-dom'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { H3, Body } from '@leafygreen-ui/typography'
import Icon from '@leafygreen-ui/icon'
import IconButton from '@leafygreen-ui/icon-button'
import { useConnectionStore } from '@stores/connection'
import { useDatabasesQuery, useCollectionsQuery } from '@hooks/useQueries'
import { SkeletonLoader } from './SkeletonLoader'

const sidebarHeaderStyles = css`
  padding: 16px;
  border-bottom: 1px solid ${palette.gray.light2};
  display: flex;
  align-items: center;
  gap: 8px;
`

const logoStyles = css`
  width: 32px;
  height: 32px;
  background: ${palette.green.dark1};
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  font-size: 18px;
`

const navStyles = css`
  padding: 8px;
`

const navItemStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: ${palette.gray.light2};
  }

  &[data-active='true'] {
    background: ${palette.green.light3};
    color: ${palette.green.dark2};
  }
`

const collectionListStyles = css`
  padding-left: 24px;
`

const emptyStateStyles = css`
  padding: 16px;
  text-align: center;
  color: ${palette.gray.dark1};
`

export function Sidebar() {
  const navigate = useNavigate()
  const { database, collection } = useParams()
  const { isConnected } = useConnectionStore()
  const { data: databases, isLoading: isLoadingDbs } = useDatabasesQuery()

  return (
    <div>
      <div className={sidebarHeaderStyles}>
        <div className={logoStyles}>M</div>
        <H3>mondodb Studio</H3>
      </div>

      <nav className={navStyles}>
        {!isConnected ? (
          <div className={emptyStateStyles}>
            <Body>Connect to a database to get started</Body>
          </div>
        ) : isLoadingDbs ? (
          <SkeletonLoader count={3} />
        ) : databases?.length === 0 ? (
          <div className={emptyStateStyles}>
            <Body>No databases found</Body>
          </div>
        ) : (
          databases?.map((db) => (
            <DatabaseNavItem
              key={db.name}
              name={db.name}
              isActive={db.name === database}
              isExpanded={db.name === database}
              activeCollection={collection}
            />
          ))
        )}
      </nav>
    </div>
  )
}

interface DatabaseNavItemProps {
  name: string
  isActive: boolean
  isExpanded: boolean
  activeCollection?: string
}

function DatabaseNavItem({
  name,
  isActive,
  isExpanded,
  activeCollection,
}: DatabaseNavItemProps) {
  const navigate = useNavigate()
  const { data: collections, isLoading } = useCollectionsQuery(
    name,
    isExpanded
  )

  return (
    <div>
      <div
        className={navItemStyles}
        data-active={isActive}
        onClick={() => navigate(`/db/${name}`)}
      >
        <Icon glyph="Database" />
        <Body>{name}</Body>
      </div>

      {isExpanded && (
        <div className={collectionListStyles}>
          {isLoading ? (
            <SkeletonLoader count={2} />
          ) : (
            collections?.map((coll) => (
              <div
                key={coll.name}
                className={navItemStyles}
                data-active={coll.name === activeCollection}
                onClick={() => navigate(`/db/${name}/${coll.name}`)}
              >
                <Icon glyph="Folder" />
                <Body>{coll.name}</Body>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
