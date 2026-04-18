import { vi } from "vitest";

// Mock server-only module so tests can import from files that use it
// (mutations.ts, queries.ts, auth.ts all start with `import "server-only"`)
vi.mock("server-only", () => ({}));

// The typed env schema (`src/lib/env.ts`) throws at module-load when
// required vars are missing. Under vitest we're not actually calling
// Supabase, but the module is imported transitively by nearly every
// production file we test — so seed the required vars with inert
// values. Any test that exercises a code path actually touching
// Supabase mocks the client anyway; these placeholders only need to
// satisfy Zod's shape checks.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.NEXT_PUBLIC_SITE_URL ??= "http://localhost:3000";
