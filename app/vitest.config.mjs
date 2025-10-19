import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['../tests/**/*.test.mjs', '../tests/**/*.spec.mjs'],
    reporters: ['default'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      provider: 'v8',
      reportsDirectory: '../reports/coverage'
    }
  }
});
