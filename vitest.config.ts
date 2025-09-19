import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', '.next', 'dist']
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
  esbuild: {
    target: 'node18'
  }
})