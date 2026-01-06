import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
      ],
    },
    // Memory optimization: Use forks instead of threads for better memory isolation
    // Each test file runs in a separate process, preventing memory accumulation
    pool: 'forks',
    poolOptions: {
      forks: {
        // Single fork to minimize memory usage - tests run sequentially but safely
        maxForks: 1,
        minForks: 1,
        // Isolate each test file in its own process
        isolate: true,
      },
    },
    // Prevent runaway tests from consuming excessive memory/time
    testTimeout: 30000,
    hookTimeout: 10000,
    // Ensure test isolation - each test file gets fresh module state
    isolate: true,
    // Clear mocks between tests automatically
    clearMocks: true,
    // Restore mocks after each test
    restoreMocks: true,
    // Limit file parallelism when running
    fileParallelism: false,
    // Fail fast on first error to prevent memory buildup from cascading failures
    bail: 1,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@components': resolve(__dirname, './src/components'),
      '@hooks': resolve(__dirname, './src/hooks'),
      '@stores': resolve(__dirname, './src/stores'),
      '@lib': resolve(__dirname, './src/lib'),
    },
  },
})
