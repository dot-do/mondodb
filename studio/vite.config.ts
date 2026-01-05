import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Polyfills needed for @leafygreen-ui/emotion -> @emotion/server -> html-tokenize
      include: ['buffer', 'stream', 'util', 'events', 'process'],
      globals: {
        Buffer: true,
        process: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@components': resolve(__dirname, './src/components'),
      '@hooks': resolve(__dirname, './src/hooks'),
      '@stores': resolve(__dirname, './src/stores'),
      '@lib': resolve(__dirname, './src/lib'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'leafygreen': [
            '@leafygreen-ui/button',
            '@leafygreen-ui/card',
            '@leafygreen-ui/icon',
            '@leafygreen-ui/modal',
            '@leafygreen-ui/table',
            '@leafygreen-ui/tabs',
            '@leafygreen-ui/typography',
          ],
          'codemirror': [
            '@codemirror/autocomplete',
            '@codemirror/commands',
            '@codemirror/lang-javascript',
            '@codemirror/lang-json',
            '@codemirror/state',
            '@codemirror/view',
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/rpc': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
