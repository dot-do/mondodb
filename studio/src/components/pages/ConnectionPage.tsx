import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { H2, H3, Body, Subtitle } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import Card from '@leafygreen-ui/card'
import TextInput from '@leafygreen-ui/text-input'
import Icon from '@leafygreen-ui/icon'
import IconButton from '@leafygreen-ui/icon-button'
import { useConnectionStore, ConnectionInfo } from '@stores/connection'

const pageStyles = css`
  max-width: 800px;
  margin: 0 auto;
`

const headerStyles = css`
  margin-bottom: 32px;
`

const cardStyles = css`
  margin-bottom: 16px;
  cursor: pointer;
  transition: box-shadow 0.15s ease;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
`

const cardContentStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const connectionInfoStyles = css`
  display: flex;
  align-items: center;
  gap: 16px;
`

const iconContainerStyles = css`
  width: 48px;
  height: 48px;
  background: ${palette.green.light3};
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${palette.green.dark2};
`

const formStyles = css`
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 24px;
  padding: 24px;
  background: ${palette.gray.light3};
  border-radius: 8px;
`

const formActionsStyles = css`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
`

const emptyStateStyles = css`
  text-align: center;
  padding: 48px;
  background: ${palette.gray.light3};
  border-radius: 8px;
`

export function ConnectionPage() {
  const navigate = useNavigate()
  const {
    connections,
    isConnected,
    isConnecting,
    error,
    saveConnection,
    connect,
    removeConnection,
  } = useConnectionStore()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('mongodo://localhost')

  // Auto-navigate to database when already connected (e.g., from auto-connect)
  useEffect(() => {
    if (isConnected) {
      navigate('/db/default')
    }
  }, [isConnected, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const id = saveConnection({
      name: name || 'New Connection',
      uri: url,
      auth: { type: 'none' },
      tls: { enabled: false },
    })
    try {
      await connect(id)
      // Only reset form and navigate after successful connection
      setShowForm(false)
      setName('')
      navigate('/db/default')
    } catch {
      // Connection failed - keep form visible with user's input preserved
      // The error will be displayed via the error state from useConnectionStore
    }
  }

  const handleConnect = async (id: string) => {
    await connect(id)
    navigate('/db/default')
  }

  return (
    <div className={pageStyles}>
      <div className={headerStyles}>
        <H2>Connections</H2>
        <Body>Connect to a mongo.do instance to get started</Body>
      </div>

      {error && (
        <Card className={cardStyles} style={{ borderLeft: `4px solid ${palette.red.base}` }}>
          <Body style={{ color: palette.red.dark2 }}>{error}</Body>
        </Card>
      )}

      {connections.length === 0 && !showForm ? (
        <div className={emptyStateStyles}>
          <Icon glyph="Database" size={48} />
          <H3 style={{ marginTop: 16 }}>No connections yet</H3>
          <Body style={{ marginBottom: 24 }}>
            Add a connection to start exploring your data
          </Body>
          <Button variant="primary" onClick={() => setShowForm(true)}>
            Add Connection
          </Button>
        </div>
      ) : (
        <>
          {connections.map((conn) => (
            <ConnectionCard
              key={conn.id}
              connection={conn}
              isConnecting={isConnecting}
              onConnect={() => handleConnect(conn.id)}
              onRemove={() => removeConnection(conn.id)}
            />
          ))}

          {!showForm && (
            <Button
              variant="primaryOutline"
              leftGlyph={<Icon glyph="Plus" />}
              onClick={() => setShowForm(true)}
            >
              Add Connection
            </Button>
          )}
        </>
      )}

      {showForm && (
        <form className={formStyles} onSubmit={handleSubmit}>
          <H3>New Connection</H3>
          <TextInput
            label="Connection Name"
            placeholder="My mongo.do Instance"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextInput
            label="Connection URL"
            placeholder="mongodo://localhost"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className={formActionsStyles}>
            <Button variant="default" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isConnecting}>
              {isConnecting ? 'Connecting...' : 'Connect'}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

interface ConnectionCardProps {
  connection: ConnectionInfo
  isConnecting: boolean
  onConnect: () => void
  onRemove: () => void
}

function ConnectionCard({
  connection,
  isConnecting,
  onConnect,
  onRemove,
}: ConnectionCardProps) {
  return (
    <Card className={cardStyles} onClick={onConnect}>
      <div className={cardContentStyles}>
        <div className={connectionInfoStyles}>
          <div className={iconContainerStyles}>
            <Icon glyph="Database" />
          </div>
          <div>
            <Subtitle>{connection.name}</Subtitle>
            <Body>{connection.url}</Body>
            {connection.lastConnected && (
              <Body style={{ fontSize: 12, color: palette.gray.dark1 }}>
                Last connected:{' '}
                {new Date(connection.lastConnected).toLocaleDateString()}
              </Body>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            variant="primary"
            size="small"
            disabled={isConnecting}
            onClick={(e) => {
              e.stopPropagation()
              onConnect()
            }}
          >
            {isConnecting ? 'Connecting...' : 'Connect'}
          </Button>
          <IconButton
            aria-label="Remove connection"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            <Icon glyph="Trash" />
          </IconButton>
        </div>
      </div>
    </Card>
  )
}
