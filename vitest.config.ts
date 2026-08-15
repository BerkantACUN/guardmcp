import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // picocolors reads env once at import time — force plain output so
    // formatter snapshot tests aren't flaky/OS-dependent (CI vs local TTY).
    env: { NO_COLOR: '1' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
