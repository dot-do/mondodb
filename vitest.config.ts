import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', 'test'],
    },
    testTimeout: 30000,
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          // Persist DO SQLite data to this directory
          durableObjectsPersist: './test-data',
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
