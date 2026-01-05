import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body } from '@leafygreen-ui/typography'
import Badge from '@leafygreen-ui/badge'
import Icon from '@leafygreen-ui/icon'
import IconButton from '@leafygreen-ui/icon-button'
import Tooltip from '@leafygreen-ui/tooltip'
import { useConnectionStore } from '@stores/connection'

const headerStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 100%;
`

const leftStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
`

const rightStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const connectionStatusStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

export function Header() {
  const { isConnected, activeConnectionId, connections, disconnect } =
    useConnectionStore()
  const activeConnection = connections.find((c) => c.id === activeConnectionId)

  return (
    <header className={headerStyles}>
      <div className={leftStyles}>
        {isConnected && activeConnection && (
          <div className={connectionStatusStyles}>
            <Badge variant="green">Connected</Badge>
            <Body>{activeConnection.name}</Body>
          </div>
        )}
        {!isConnected && (
          <div className={connectionStatusStyles}>
            <Badge variant="lightgray">Disconnected</Badge>
          </div>
        )}
      </div>

      <div className={rightStyles}>
        {isConnected && (
          <IconButton
            aria-label="Disconnect"
            onClick={disconnect}
          >
            <Icon glyph="Disconnect" />
          </IconButton>
        )}
        <Tooltip trigger={
          <IconButton aria-label="Settings" disabled>
            <Icon glyph="Settings" />
          </IconButton>
        }>
          Coming soon
        </Tooltip>
      </div>
    </header>
  )
}
