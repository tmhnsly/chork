import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

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
      // No Storybook project. There used to be one running every
      // story in headless chromium, but it had been silently failing
      // to load for some time — `addon-vitest` needs a Vite-based
      // Storybook and `.storybook/main.ts` uses the webpack framework,
      // so the config never resolved. The run reported its unit total
      // and moved on, which made the suite look bigger than it was.
      //
      // Removed rather than repaired because of what it would have
      // asserted: not one story has a `play` function or an `expect`,
      // so the project could only ever check that each story mounted
      // without throwing. Stories stay what they already are — a
      // visual workbench (`pnpm storybook`) and the place design work
      // gets reviewed.
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
    ],
  },
});
