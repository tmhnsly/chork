import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';

import { playwright } from '@vitest/browser-playwright';

const dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(dirname, 'src'),
      // Stub Next's server/client-only boundary packages so modules
      // that use them for build-time safety stay importable under
      // vitest's node env (which has no webpack to resolve them).
      'client-only': path.join(dirname, 'src/test/empty.ts'),
      'server-only': path.join(dirname, 'src/test/empty.ts'),
    },
  },
  test: {
    projects: [
      // Unit + integration tests (Node environment, fast)
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['src/test/setup.ts'],
        },
      },
      // Storybook component tests (browser via Playwright)
      {
        extends: true,
        plugins: [
          storybookTest({ configDir: path.join(dirname, '.storybook') }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
