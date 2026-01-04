import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: [
      'test/unit/agentfs/**/*.test.ts',
      'test/mcp/**/*.test.ts',
      'test/unit/mcp/**/*.test.ts',
      'test/unit/rpc/**/*.test.ts',
      'test/unit/cli/**/*.test.ts',
      'test/unit/wire/**/*.test.ts',
      'test/unit/olap/**/*.test.ts',
      'test/integration/olap/**/*.test.ts',
      'test/unit/embedding/**/*.test.ts',
      'test/unit/http-cursor.test.ts',
      'test/unit/cursor.test.ts',
    ],
    exclude: ['node_modules', 'dist'],
    environment: 'node',
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
