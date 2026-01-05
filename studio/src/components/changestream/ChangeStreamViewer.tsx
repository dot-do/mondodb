import { useState, useCallback, useEffect, useRef } from 'react'
import { css, cx, keyframes } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { H2, Body, Subtitle, InlineCode } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import IconButton from '@leafygreen-ui/icon-button'
import Icon from '@leafygreen-ui/icon'
import Badge from '@leafygreen-ui/badge'
import TextInput from '@leafygreen-ui/text-input'
import Toggle from '@leafygreen-ui/toggle'
import Tooltip from '@leafygreen-ui/tooltip'
import { Select, Option } from '@leafygreen-ui/select'
import { useConnectionStore } from '@stores/connection'
import { rpcClient } from '@lib/rpc-client'

// Animation for new events
const slideIn = keyframes`
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`

const pulseAnimation = keyframes`
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
`

// Styles
const containerStyles = css`
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
`

const headerStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const headerLeftStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
`

const headerRightStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
`

const controlsStyles = css`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: ${palette.gray.light3};
  border-radius: 8px;
  flex-wrap: wrap;
`

const controlGroupStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const filterInputStyles = css`
  width: 300px;
`

const streamContainerStyles = css`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid ${palette.gray.light2};
  border-radius: 8px;
  overflow: hidden;
`

const streamHeaderStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: ${palette.gray.light3};
  border-bottom: 1px solid ${palette.gray.light2};
`

const streamHeaderLeftStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
`

const streamHeaderRightStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const eventListStyles = css`
  flex: 1;
  overflow-y: auto;
  padding: 0;
  margin: 0;
  list-style: none;
`

const eventItemStyles = css`
  padding: 12px 16px;
  border-bottom: 1px solid ${palette.gray.light2};
  animation: ${slideIn} 0.3s ease-out;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: ${palette.gray.light3};
  }

  &:last-child {
    border-bottom: none;
  }
`

const eventHeaderStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
`

const eventTypeStyles = css`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
`

const insertTypeStyles = css`
  background: ${palette.green.light3};
  color: ${palette.green.dark2};
`

const updateTypeStyles = css`
  background: ${palette.blue.light3};
  color: ${palette.blue.dark2};
`

const deleteTypeStyles = css`
  background: ${palette.red.light3};
  color: ${palette.red.dark2};
`

const replaceTypeStyles = css`
  background: ${palette.yellow.light3};
  color: ${palette.yellow.dark2};
`

const dropTypeStyles = css`
  background: ${palette.purple.light3};
  color: ${palette.purple.dark2};
`

const invalidateTypeStyles = css`
  background: ${palette.gray.light2};
  color: ${palette.gray.dark2};
`

const eventTimestampStyles = css`
  font-size: 12px;
  color: ${palette.gray.dark1};
`

const eventDocIdStyles = css`
  font-family: 'Source Code Pro', Menlo, Monaco, 'Courier New', monospace;
  font-size: 12px;
  color: ${palette.gray.dark2};
`

const eventBodyStyles = css`
  font-family: 'Source Code Pro', Menlo, Monaco, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
  background: ${palette.gray.light3};
  padding: 8px 12px;
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
`

const expandedEventStyles = css`
  background: ${palette.white};
  border-left: 3px solid ${palette.green.base};
`

const emptyStateStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: ${palette.gray.dark1};
  text-align: center;
  gap: 12px;
  padding: 48px;
`

const connectionStatusStyles = css`
  display: flex;
  align-items: center;
  gap: 6px;
`

const statusDotStyles = css`
  width: 8px;
  height: 8px;
  border-radius: 50%;
`

const statusConnectedStyles = css`
  background: ${palette.green.base};
`

const statusConnectingStyles = css`
  background: ${palette.yellow.base};
  animation: ${pulseAnimation} 1s ease-in-out infinite;
`

const statusDisconnectedStyles = css`
  background: ${palette.gray.base};
`

const statusErrorStyles = css`
  background: ${palette.red.base};
`

const eventCountStyles = css`
  font-size: 12px;
  color: ${palette.gray.dark1};
`

const statsContainerStyles = css`
  display: flex;
  gap: 24px;
  padding: 8px 16px;
  background: ${palette.gray.light3};
  border-top: 1px solid ${palette.gray.light2};
`

const statItemStyles = css`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: ${palette.gray.dark1};
`

const statValueStyles = css`
  font-weight: 600;
  color: ${palette.gray.dark2};
`

// Types
export type OperationType = 'insert' | 'update' | 'replace' | 'delete' | 'drop' | 'dropDatabase' | 'invalidate' | 'rename'

export interface ChangeEvent {
  _id: string
  operationType: OperationType
  clusterTime?: string
  timestamp: Date
  ns?: {
    db: string
    coll: string
  }
  documentKey?: {
    _id: string
  }
  fullDocument?: Record<string, unknown>
  updateDescription?: {
    updatedFields?: Record<string, unknown>
    removedFields?: string[]
    truncatedArrays?: Array<{ field: string; newSize: number }>
  }
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ChangeStreamViewerProps {
  database: string
  collection: string
}

export function ChangeStreamViewer({ database, collection }: ChangeStreamViewerProps) {
  const { isConnected } = useConnectionStore()

  // State
  const [events, setEvents] = useState<ChangeEvent[]>([])
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [error, setError] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null)
  const [filterText, setFilterText] = useState('')
  const [operationFilter, setOperationFilter] = useState<OperationType | 'all'>('all')
  const [maxEvents, setMaxEvents] = useState(100)
  const [autoScroll, setAutoScroll] = useState(true)

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    inserts: 0,
    updates: 0,
    deletes: 0,
    other: 0,
  })

  // Refs
  const wsRef = useRef<WebSocket | null>(null)
  const eventListRef = useRef<HTMLUListElement>(null)
  const pausedEventsRef = useRef<ChangeEvent[]>([])

  // Get WebSocket URL from RPC client base URL
  const getWebSocketUrl = useCallback(() => {
    const baseUrl = rpcClient.getBaseUrl()
    if (!baseUrl) return null

    // Convert HTTP URL to WebSocket URL
    const wsUrl = baseUrl
      .replace(/^http:/, 'ws:')
      .replace(/^https:/, 'wss:')

    return `${wsUrl}/ws/changestream/${database}/${collection}`
  }, [database, collection])

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!isConnected) {
      setError('Not connected to database')
      return
    }

    const wsUrl = getWebSocketUrl()
    if (!wsUrl) {
      setError('Could not determine WebSocket URL')
      return
    }

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close()
    }

    setStatus('connecting')
    setError(null)

    try {
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        setStatus('connected')
        setError(null)
      }

      ws.onmessage = (event) => {
        try {
          const changeEvent: ChangeEvent = JSON.parse(event.data)
          changeEvent.timestamp = new Date()
          changeEvent._id = changeEvent._id || crypto.randomUUID()

          if (isPaused) {
            pausedEventsRef.current.push(changeEvent)
            return
          }

          setEvents((prev) => {
            const newEvents = [changeEvent, ...prev].slice(0, maxEvents)
            return newEvents
          })

          // Update stats
          setStats((prev) => {
            const newStats = { ...prev, total: prev.total + 1 }
            switch (changeEvent.operationType) {
              case 'insert':
                newStats.inserts++
                break
              case 'update':
              case 'replace':
                newStats.updates++
                break
              case 'delete':
                newStats.deletes++
                break
              default:
                newStats.other++
            }
            return newStats
          })
        } catch (err) {
          console.error('Failed to parse change event:', err)
        }
      }

      ws.onerror = () => {
        setStatus('error')
        setError('WebSocket connection error')
      }

      ws.onclose = (event) => {
        if (event.code !== 1000) {
          setStatus('error')
          setError(`Connection closed: ${event.reason || 'Unknown reason'}`)
        } else {
          setStatus('disconnected')
        }
      }

      wsRef.current = ws
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to connect')
    }
  }, [isConnected, getWebSocketUrl, isPaused, maxEvents])

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected')
      wsRef.current = null
    }
    setStatus('disconnected')
  }, [])

  // Toggle pause
  const togglePause = useCallback(() => {
    if (isPaused) {
      // Resume - add paused events
      setEvents((prev) => {
        const newEvents = [...pausedEventsRef.current.reverse(), ...prev].slice(0, maxEvents)
        pausedEventsRef.current = []
        return newEvents
      })
    }
    setIsPaused(!isPaused)
  }, [isPaused, maxEvents])

  // Clear events
  const clearEvents = useCallback(() => {
    setEvents([])
    pausedEventsRef.current = []
    setStats({
      total: 0,
      inserts: 0,
      updates: 0,
      deletes: 0,
      other: 0,
    })
  }, [])

  // Filter events
  const filteredEvents = events.filter((event) => {
    // Filter by operation type
    if (operationFilter !== 'all' && event.operationType !== operationFilter) {
      return false
    }

    // Filter by text
    if (filterText) {
      const searchText = filterText.toLowerCase()
      const docId = event.documentKey?._id?.toLowerCase() || ''
      const fullDoc = JSON.stringify(event.fullDocument || {}).toLowerCase()
      const updateDesc = JSON.stringify(event.updateDescription || {}).toLowerCase()

      return docId.includes(searchText) ||
             fullDoc.includes(searchText) ||
             updateDesc.includes(searchText)
    }

    return true
  })

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && eventListRef.current && !isPaused) {
      eventListRef.current.scrollTop = 0
    }
  }, [events, autoScroll, isPaused])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  // Get operation type styles
  const getOperationTypeStyles = (type: OperationType) => {
    switch (type) {
      case 'insert':
        return insertTypeStyles
      case 'update':
        return updateTypeStyles
      case 'replace':
        return replaceTypeStyles
      case 'delete':
        return deleteTypeStyles
      case 'drop':
      case 'dropDatabase':
        return dropTypeStyles
      case 'invalidate':
      case 'rename':
        return invalidateTypeStyles
      default:
        return ''
    }
  }

  // Get operation icon
  const getOperationIcon = (type: OperationType): string => {
    switch (type) {
      case 'insert':
        return 'Plus'
      case 'update':
      case 'replace':
        return 'Edit'
      case 'delete':
        return 'Trash'
      case 'drop':
      case 'dropDatabase':
        return 'Warning'
      case 'invalidate':
      case 'rename':
        return 'InfoWithCircle'
      default:
        return 'File'
    }
  }

  // Format event body
  const formatEventBody = (event: ChangeEvent): string => {
    switch (event.operationType) {
      case 'insert':
        return JSON.stringify(event.fullDocument, null, 2)
      case 'update':
        return JSON.stringify(event.updateDescription, null, 2)
      case 'replace':
        return JSON.stringify(event.fullDocument, null, 2)
      case 'delete':
        return JSON.stringify(event.documentKey, null, 2)
      default:
        return JSON.stringify(event, null, 2)
    }
  }

  // Get status dot styles
  const getStatusDotStyles = () => {
    switch (status) {
      case 'connected':
        return statusConnectedStyles
      case 'connecting':
        return statusConnectingStyles
      case 'error':
        return statusErrorStyles
      default:
        return statusDisconnectedStyles
    }
  }

  return (
    <div className={containerStyles} data-testid="change-stream-viewer">
      {/* Header */}
      <div className={headerStyles}>
        <div className={headerLeftStyles}>
          <Icon glyph="Visibility" size="large" />
          <H2>Change Stream</H2>
          <Badge variant="blue">{collection}</Badge>
          <div className={connectionStatusStyles}>
            <span className={cx(statusDotStyles, getStatusDotStyles())} />
            <Body>{status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting...' : status === 'error' ? 'Error' : 'Disconnected'}</Body>
          </div>
        </div>
        <div className={headerRightStyles}>
          {status === 'connected' ? (
            <Button
              variant="danger"
              leftGlyph={<Icon glyph="X" />}
              onClick={disconnect}
              data-testid="disconnect-button"
            >
              Disconnect
            </Button>
          ) : (
            <Button
              variant="primary"
              leftGlyph={<Icon glyph="Play" />}
              onClick={connect}
              disabled={!isConnected || status === 'connecting'}
              data-testid="connect-button"
            >
              {status === 'connecting' ? 'Connecting...' : 'Start Watching'}
            </Button>
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div style={{ padding: '12px 16px', background: palette.red.light3, borderRadius: 8, color: palette.red.dark2 }}>
          <Body>{error}</Body>
        </div>
      )}

      {/* Controls */}
      <div className={controlsStyles}>
        <div className={controlGroupStyles}>
          <TextInput
            className={filterInputStyles}
            aria-label="Filter events"
            placeholder="Filter by document ID or content..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            data-testid="filter-input"
          />
        </div>

        <div className={controlGroupStyles}>
          <Body>Operation:</Body>
          <Select
            aria-label="Filter by operation type"
            value={operationFilter}
            onChange={(value) => setOperationFilter(value as OperationType | 'all')}
            data-testid="operation-filter"
          >
            <Option value="all">All</Option>
            <Option value="insert">Insert</Option>
            <Option value="update">Update</Option>
            <Option value="replace">Replace</Option>
            <Option value="delete">Delete</Option>
          </Select>
        </div>

        <div className={controlGroupStyles}>
          <Toggle
            aria-label="Auto-scroll"
            checked={autoScroll}
            onChange={setAutoScroll}
            data-testid="auto-scroll-toggle"
          />
          <Body>Auto-scroll</Body>
        </div>
      </div>

      {/* Stream container */}
      <div className={streamContainerStyles}>
        <div className={streamHeaderStyles}>
          <div className={streamHeaderLeftStyles}>
            <Subtitle>Events</Subtitle>
            <span className={eventCountStyles}>
              {filteredEvents.length} of {events.length} events
              {isPaused && pausedEventsRef.current.length > 0 && (
                <> ({pausedEventsRef.current.length} paused)</>
              )}
            </span>
          </div>
          <div className={streamHeaderRightStyles}>
            <Tooltip
              trigger={
                <IconButton
                  aria-label={isPaused ? 'Resume' : 'Pause'}
                  onClick={togglePause}
                  disabled={status !== 'connected'}
                  data-testid="pause-button"
                >
                  <Icon glyph={isPaused ? 'Play' : 'Pause'} />
                </IconButton>
              }
            >
              {isPaused ? 'Resume stream' : 'Pause stream'}
            </Tooltip>
            <Tooltip
              trigger={
                <IconButton
                  aria-label="Clear events"
                  onClick={clearEvents}
                  disabled={events.length === 0}
                  data-testid="clear-button"
                >
                  <Icon glyph="Trash" />
                </IconButton>
              }
            >
              Clear all events
            </Tooltip>
          </div>
        </div>

        {filteredEvents.length === 0 ? (
          <div className={emptyStateStyles}>
            {status === 'connected' ? (
              <>
                <Icon glyph="Visibility" size="xlarge" />
                <Subtitle>Waiting for changes...</Subtitle>
                <Body>
                  Make changes to documents in <InlineCode>{collection}</InlineCode> to see them appear here in real-time.
                </Body>
              </>
            ) : (
              <>
                <Icon glyph="Connect" size="xlarge" />
                <Subtitle>Not watching</Subtitle>
                <Body>
                  Click "Start Watching" to begin receiving real-time change events from the collection.
                </Body>
              </>
            )}
          </div>
        ) : (
          <ul className={eventListStyles} ref={eventListRef} data-testid="event-list">
            {filteredEvents.map((event) => (
              <li
                key={event._id}
                className={cx(eventItemStyles, expandedEventId === event._id && expandedEventStyles)}
                onClick={() => setExpandedEventId(expandedEventId === event._id ? null : event._id)}
                data-testid={`event-${event._id}`}
              >
                <div className={eventHeaderStyles}>
                  <span className={cx(eventTypeStyles, getOperationTypeStyles(event.operationType))}>
                    <Icon glyph={getOperationIcon(event.operationType)} size="small" />
                    {event.operationType}
                  </span>
                  {event.documentKey?._id && (
                    <span className={eventDocIdStyles}>
                      _id: {event.documentKey._id}
                    </span>
                  )}
                  <span className={eventTimestampStyles}>
                    {event.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                {(expandedEventId === event._id || event.operationType === 'insert') && (
                  <pre className={eventBodyStyles}>
                    {formatEventBody(event)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Stats footer */}
        {stats.total > 0 && (
          <div className={statsContainerStyles}>
            <div className={statItemStyles}>
              <Body>Total:</Body>
              <span className={statValueStyles}>{stats.total}</span>
            </div>
            <div className={statItemStyles}>
              <Badge variant="green">Inserts</Badge>
              <span className={statValueStyles}>{stats.inserts}</span>
            </div>
            <div className={statItemStyles}>
              <Badge variant="blue">Updates</Badge>
              <span className={statValueStyles}>{stats.updates}</span>
            </div>
            <div className={statItemStyles}>
              <Badge variant="red">Deletes</Badge>
              <span className={statValueStyles}>{stats.deletes}</span>
            </div>
            {stats.other > 0 && (
              <div className={statItemStyles}>
                <Badge variant="lightgray">Other</Badge>
                <span className={statValueStyles}>{stats.other}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ChangeStreamViewer
