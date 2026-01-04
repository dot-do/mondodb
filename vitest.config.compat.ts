import { defineConfig } from 'vitest/config'

/**
 * Vitest configuration for MongoDB compatibility tests
 *
 * These tests run in a Node.js environment (not Cloudflare Workers)
 * because they use MongoMemoryServer which requires a real Node.js runtime.
 *
 * ESM/CommonJS compatibility notes:
 * - mongodb and mongodb-memory-server have CommonJS internals
 * - We use deps.interopDefault to handle default export issues
 * - server.deps.inline ensures problematic deps are bundled properly
 */
export default defineConfig({
  test: {
    include: [
      'test/compat/**/*.test.ts',
      'test/compatibility/**/*.test.ts',
    ],
    exclude: ['node_modules', 'dist'],
    testTimeout: 60000, // MongoMemoryServer can take time to start
    hookTimeout: 30000,
    environment: 'node',
    globals: true,
    reporters: ['verbose'],
    // Run tests sequentially to avoid port conflicts with MongoMemoryServer
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Handle ESM/CommonJS interop for mongodb packages
    deps: {
      interopDefault: true,
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
