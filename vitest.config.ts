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
      // Unit tests (Node environment, fast). Integration tests live
      // in a separate project (below) so the default `pnpm test` run
      // stays offline and doesn't require Supabase creds.
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: [
            'node_modules/**',
            'src/**/*.integration.test.ts',
          ],
          environment: 'node',
          setupFiles: ['src/test/setup.ts'],
        },
      },
      // Integration tests — hit the real Supabase instance. Each
      // file self-skips when SUPABASE_SERVICE_ROLE_KEY isn't set, so
      // running this project in a fork / CI without credentials is
      // a silent no-op rather than a hard failure.
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['src/**/*.integration.test.ts'],
          environment: 'node',
          setupFiles: ['src/test/integration/env-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
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
