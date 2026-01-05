import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'cli/index': 'src/cli/index.ts',
    worker: 'src/worker.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  treeshake: true,
  external: [
    // Cloudflare Workers runtime
    'cloudflare:workers',
    // Bun runtime
    'bun:sqlite',
    // Node.js built-ins (for CLI)
    'node:fs',
    'node:path',
    'node:crypto',
    'node:net',
    'node:os',
    'node:readline',
    'node:process',
    'node:child_process',
    'node:http',
    'node:https',
    'node:tls',
    'node:buffer',
    'node:stream',
    'node:util',
    'node:events',
    'node:url',
  ],
  // Mark dependencies as external (don't bundle them)
  noExternal: [],
  // Keep shebang from source for CLI
})
