import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    include: ['src/**/*.{test,spec}.ts'],
    // Integration tests require separate vitest run to avoid parallel DB issues
    // Run with: vitest run --config vitest.config.ts
  },
})
