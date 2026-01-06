import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from '@components/Layout'
import { SkeletonLoader } from '@components/SkeletonLoader'
import { useConnectionStore } from '@stores/connection'

// Lazy load page components for better performance
const ConnectionPanel = lazy(() => import('@components/ConnectionPanel').then(m => ({ default: m.ConnectionPanel })))
const DatabasePage = lazy(() => import('@components/pages/DatabasePage').then(m => ({ default: m.DatabasePage })))
const CollectionPage = lazy(() => import('@components/pages/CollectionPage').then(m => ({ default: m.CollectionPage })))

// Loading fallback component for Suspense and hydration
function PageLoader() {
  return (
    <div style={{ padding: '24px' }}>
      <SkeletonLoader count={5} height={32} />
    </div>
  )
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isConnected, isHydrated } = useConnectionStore()

  // Wait for store hydration before checking connection status
  // This prevents UI flash where user is redirected before persisted state loads
  if (!isHydrated) {
    return <PageLoader />
  }

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
          <Route
            index
            element={
              <Suspense fallback={<PageLoader />}>
                <ConnectionPanel />
              </Suspense>
            }
          />
          <Route
            path="db/:database"
            element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <DatabasePage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="db/:database/:collection"
            element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <CollectionPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
