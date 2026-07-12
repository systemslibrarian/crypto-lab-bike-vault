import { defineConfig } from 'vitest/config';

/**
 * Unit-test config for the BIKE crypto core.
 *
 * The Playwright accessibility/e2e suite lives in ./e2e and must NOT be
 * collected by vitest (it uses @playwright/test's `test`, not vitest's).
 * We restrict vitest to test/ and explicitly exclude e2e.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
  },
});
