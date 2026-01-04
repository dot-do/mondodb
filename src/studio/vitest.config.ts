import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['**/__tests__/**/*.test.{ts,tsx}'],
    setupFiles: [
      resolve(__dirname, './components/browser/__tests__/setup.ts'),
      resolve(__dirname, './components/connection/__tests__/setup.ts'),
      resolve(__dirname, './components/crud/__tests__/setup.ts'),
    ],
    // Memory optimization: limit concurrent workers to prevent 21GB+ memory usage
    poolOptions: {
      threads: {
        maxThreads: 4,
        minThreads: 1,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      '@components': resolve(__dirname, './components'),
      '@hooks': resolve(__dirname, './hooks'),
      '@stores': resolve(__dirname, './stores'),
      '@lib': resolve(__dirname, './lib'),
    },
  },
})
