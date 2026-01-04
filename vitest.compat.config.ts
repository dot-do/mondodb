import { defineConfig } from 'vitest/config'

/**
 * Vitest configuration for MongoDB compatibility tests
 *
 * These tests run in a Node.js environment (not Cloudflare Workers)
 * because they use MongoMemoryServer which requires a real Node.js runtime.
 */
export default defineConfig({
  test: {
    globals: true,
    include: ['test/compat/**/*.test.ts', 'test/compatibility/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 60000, // MongoMemoryServer can take time to start
    environment: 'node',
    // Run tests sequentially to avoid port conflicts with MongoMemoryServer
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
