import { ReactElement } from 'react'
import { render, RenderOptions, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import LeafyGreenProvider from '@leafygreen-ui/leafygreen-provider'
import { afterEach } from 'vitest'

// Singleton QueryClient for tests - cleared between tests to prevent memory leaks
let testQueryClient: QueryClient | null = null

// Clean up LeafyGreen portals and QueryClient cache after each test
afterEach(() => {
  cleanup()
  // Clear query cache to prevent memory accumulation
  if (testQueryClient) {
    testQueryClient.clear()
  }
})

const createTestQueryClient = () => {
  // Reuse singleton to reduce memory overhead, but always clear cache between tests
  if (!testQueryClient) {
    testQueryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          // Disable caching for tests to prevent memory buildup
          gcTime: 0,
          staleTime: 0,
        },
      },
    })
  }
  // Clear any existing cache data
  testQueryClient.clear()
  return testQueryClient
}

interface WrapperProps {
  children: React.ReactNode
}

function AllProviders({ children }: WrapperProps) {
  const queryClient = createTestQueryClient()

  return (
    <LeafyGreenProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    </LeafyGreenProvider>
  )
}

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllProviders, ...options })

export * from '@testing-library/react'
export { customRender as render }
