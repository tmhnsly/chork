import { vi } from "vitest";

type Response = { data?: unknown; error?: unknown; count?: number | null };

/**
 * Creates a chainable mock that mimics the Supabase client's fluent API.
 * Every method returns the chain merged with the pending response,
 * so destructuring { data, error } works at any point in the chain.
 *
 * Usage:
 *   const mock = createMockSupabase();
 *   mock._resolveWith({ data: { id: "1" }, error: null });
 *   const { data, error } = await mock.from("table").update({}).eq("id", "1");
 */
export function createMockSupabase() {
  let pendingResponse: Response = { data: null, error: null };

  // Every method returns this proxy - chainable AND destructurable
  const makeChainable = () => ({ ...chain, ...pendingResponse });

  const chain: Record<string, ReturnType<typeof vi.fn>> & {
    _resolveWith: (r: Response) => void;
    auth: { getUser: ReturnType<typeof vi.fn>; admin: { deleteUser: ReturnType<typeof vi.fn> } };
  } = {
    _resolveWith(r: Response) {
      pendingResponse = r;
    },

    from: vi.fn(() => makeChainable()),
    select: vi.fn(() => makeChainable()),
    insert: vi.fn(() => makeChainable()),
    update: vi.fn(() => makeChainable()),
    delete: vi.fn(() => makeChainable()),
    upsert: vi.fn(() => makeChainable()),
    eq: vi.fn(() => makeChainable()),
    neq: vi.fn(() => makeChainable()),
    in: vi.fn(() => makeChainable()),
    ilike: vi.fn(() => makeChainable()),
    order: vi.fn(() => makeChainable()),
    limit: vi.fn(() => makeChainable()),
    range: vi.fn(() => makeChainable()),
    single: vi.fn(() => pendingResponse),
    maybeSingle: vi.fn(() => pendingResponse),
    rpc: vi.fn(() => pendingResponse),

    auth: {
      getUser: vi.fn(),
      admin: { deleteUser: vi.fn() },
    },
  };

  return chain;
}
