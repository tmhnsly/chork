import { vi } from "vitest";

// Mock server-only module so tests can import from files that use it
// (mutations.ts, queries.ts, auth.ts all start with `import "server-only"`)
vi.mock("server-only", () => ({}));
