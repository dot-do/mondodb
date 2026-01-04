import { Outlet } from 'react-router-dom'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { ErrorBoundary } from './ErrorBoundary'

const layoutStyles = css`
  display: grid;
  grid-template-columns: 280px 1fr;
  grid-template-rows: 56px 1fr;
  grid-template-areas:
    'sidebar header'
    'sidebar main';
  height: 100vh;
  width: 100vw;
`

const headerStyles = css`
  grid-area: header;
  border-bottom: 1px solid ${palette.gray.light2};
  background: ${palette.white};
`

const sidebarStyles = css`
  grid-area: sidebar;
  border-right: 1px solid ${palette.gray.light2};
  background: ${palette.gray.light3};
  overflow-y: auto;
`

const mainStyles = css`
  grid-area: main;
  overflow-y: auto;
  background: ${palette.white};
  padding: 24px;
`

export function Layout() {
  return (
    <div className={layoutStyles}>
      <aside className={sidebarStyles}>
        <Sidebar />
      </aside>
      <header className={headerStyles}>
        <Header />
      </header>
      <main className={mainStyles}>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  )
}
