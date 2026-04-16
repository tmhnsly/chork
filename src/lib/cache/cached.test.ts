import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: vi.fn((fn) => fn),
  revalidateTag: vi.fn(),
}));

describe("cachedQuery", () => {
  beforeEach(() => vi.resetAllMocks());

  it("forwards keyParts, tags, and revalidate to unstable_cache", async () => {
    const { unstable_cache } = await import("next/cache");
    const { cachedQuery } = await import("./cached");

    const fn = async (x: number) => x * 2;
    cachedQuery(["double", "v1"], fn, { tags: ["gym:abc"], revalidate: 60 });

    expect(unstable_cache).toHaveBeenCalledWith(
      fn,
      ["double", "v1"],
      { tags: ["gym:abc"], revalidate: 60 },
    );
  });

  it("returned function resolves to the wrapped function's result", async () => {
    const { cachedQuery } = await import("./cached");
    const fn = async (x: number) => x + 1;
    const cached = cachedQuery(["inc"], fn, { tags: ["gym:x"], revalidate: 60 });
    await expect(cached(5)).resolves.toBe(6);
  });
});
