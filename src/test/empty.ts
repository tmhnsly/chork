// Vitest stub for Next.js's `client-only` / `server-only` marker
// packages. Those packages throw at webpack resolve time to enforce
// the runtime boundary; in the node test env we just want a no-op
// so modules that depend on the boundary are still importable.
export {};
