import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['../tests/unit/**/*.test.mjs', '../tests/unit/**/*.spec.mjs'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      all: false,
      reporter: ['text', 'json', 'html'],
      reportsDirectory: '../reports/coverage',
      thresholds: {
        perFile: { lines: 0.8, functions: 0.8, branches: 0.6, statements: 0.8 }
      },
      exclude: [
        'renderer/**',
        'main/**',
        'db/**',
        'scripts/**',
        '**/*.config.*',
        '**/*.cjs',
        '**/playwright.config.js'
      ]
    }
  }
});
