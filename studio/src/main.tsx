import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LeafyGreenProvider from '@leafygreen-ui/leafygreen-provider'
import { App } from './App'
import './styles/global.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LeafyGreenProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </LeafyGreenProvider>
  </React.StrictMode>
)
