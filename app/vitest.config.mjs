import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit_*.test.mjs'],
    reporters: ['default'],
    globals: false,
    watch: false
  }
});
