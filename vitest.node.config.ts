import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: [
      'test/unit/agentfs/**/*.test.ts',
      'test/mcp/**/*.test.ts',
      'test/unit/mcp/**/*.test.ts',
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
