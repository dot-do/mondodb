import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      'test/compat/**',
      'test/compatibility/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', 'test'],
    },
    testTimeout: 30000,
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
        // Disable isolated storage to prevent "Failed to pop isolated storage stack frame" errors
        // This is required when testing Durable Objects with SQLite storage that may have
        // concurrent operations or when errors are thrown from DO RPC methods.
        // See: https://github.com/cloudflare/workers-sdk/issues/7707
        // See: https://github.com/cloudflare/workers-sdk/issues/11031
        isolatedStorage: false,
        // Run all tests in the same worker to avoid storage cleanup issues between tests
        singleWorker: true,
        miniflare: {
          // Persist DO SQLite data to this directory
          durableObjectsPersist: './test-data',
          // Enable debug endpoints for testing
          bindings: {
            ENABLE_DEBUG_ENDPOINTS: 'true',
          },
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
