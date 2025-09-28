import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
    setupFiles: ['./vitest.setup.js'],
    clearMocks: true,
    watch: false,
  },
});
