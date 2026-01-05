import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from '@components/Layout'
import { ConnectionPage } from '@components/pages/ConnectionPage'
import { DatabasePage } from '@components/pages/DatabasePage'
import { CollectionPage } from '@components/pages/CollectionPage'
import { useConnectionStore } from '@stores/connection'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isConnected } = useConnectionStore()
  if (!isConnected) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<ConnectionPage />} />
          <Route
            path="db/:database"
            element={
              <ProtectedRoute>
                <DatabasePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="db/:database/:collection"
            element={
              <ProtectedRoute>
                <CollectionPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
