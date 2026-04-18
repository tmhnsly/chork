/**
 * Loads `.env.local` into `process.env` before the integration
 * suite reads its env. Vitest's default Vite-based loader only
 * exposes prefixed vars on `import.meta.env`, not on `process.env`
 * — the Supabase client needs the latter.
 *
 * Listed as a `setupFiles` entry on the integration project in
 * `vitest.config.ts`. Unit tests don't need this — they never
 * reach a Supabase endpoint.
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });
