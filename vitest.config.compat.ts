import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/compatibility/**/*.compat.test.ts', 'test/compatibility/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 60000,  // mongo-memory-server can be slow to start
    hookTimeout: 30000,
    globals: true,
    reporters: ['verbose'],
    pool: 'forks',  // Isolate tests
    poolOptions: {
      forks: {
        singleFork: true  // Run sequentially to avoid port conflicts
      }
    }
  }
})
