import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { analyse, type Files } from "./client-boundary";

/**
 * A server component may take COMPONENTS from a "use client" module,
 * and nothing else.
 *
 * On the server every export of a "use client" module is a client
 * reference: a component renders fine (that is the point), but a
 * function is a stub that throws when called, and a constant is a
 * proxy with nothing in it. `toLeaderboardRowData` shipped in
 * `ui/LeaderboardRow.tsx` beside the component it feeds, and
 * `FriendsBoard` — a server component — called it through the ui
 * barrel: /friends threw on every load (bdb60d4, 2026-09-30). The
 * barrel is why nothing looked wrong at the call site.
 *
 * So: walk the server module graph from every route entry, server
 * action and the proxy, stopping at "use client" boundaries; for each
 * value a server file uses, follow barrels to the module that defines
 * it; if that module is a client module and the value isn't a
 * component, fail. A pure helper both sides need belongs in a module
 * with no directive. The analysis lives in `./client-boundary.ts`.
 */

const SRC = resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

describe("client boundary — the codebase", () => {
  // All of src (test HARNESSES are in: the landing fixtures import
  // `@/test/mocks`, so it's in the server graph), plus the repo-root
  // server files Next runs: the instrumentation hook and the Sentry
  // configs it imports.
  const ROOT = join(SRC, "..");
  const rootServerFiles = readdirSync(ROOT)
    .filter((n) => /^(instrumentation|sentry\.[a-z]+\.config)\.ts$/.test(n))
    .map((n) => join(ROOT, n))
    .filter((f) => existsSync(f));
  const paths = [...walk(SRC), ...rootServerFiles];
  const files: Files = new Map(paths.map((f) => [f, readFileSync(f, "utf8")]));
  const { server, violations, unresolved } = analyse(files, SRC);

  it("finds the server graph", () => {
    // A resolver that silently stopped following imports would pass
    // everything. These are known server files, one per kind of root.
    for (const known of ["app/friends/page.tsx", "app/match/actions.ts", "proxy.ts", "lib/auth.ts"]) {
      expect(server, known).toContain(join(SRC, known));
    }
    expect(server.length).toBeGreaterThan(50);
  });

  it("resolves every internal import in the server graph", () => {
    // An import the analyser can't resolve is a file it never reads —
    // a silent hole, not a pass.
    expect(unresolved).toEqual([]);
  });

  it("a server file takes only components from a client module", () => {
    expect(
      violations,
      "On the server a client module's non-component export is a client " +
        "reference: calling it throws, reading it gives nothing. Move the " +
        "helper or constant to a module with no directive and import it " +
        "from there.",
    ).toEqual([]);
  });
});

/**
 * The analyser against small trees. Each case is a shape a regex
 * version of this guard got wrong, found by adversarial review.
 */
describe("client boundary — the analyser", () => {
  const root = "/virtual/src";
  const at = (tree: Record<string, string>) =>
    analyse(new Map(Object.entries(tree).map(([k, v]) => [join(root, k), v])), root).violations;

  const client = `"use client";\nexport function helper() { return 1; }\nexport const ROWS = [1];\nexport function Thing() { return null; }\nexport default function notify() {}\n`;
  const barrel = `export { helper, ROWS, Thing } from "./c";\nexport * from "./other";\n`;

  it("flags a call through a barrel, and passes a component", () => {
    expect(at({
      "c.tsx": client, "index.ts": barrel, "other.ts": "export const x = 1;",
      "app/page.tsx": `import { helper, Thing } from "@/index";\nexport default function P() { helper(); return <Thing />; }`,
    })).toEqual(["app/page.tsx uses helper from c.tsx"]);
  });

  it("flags a constant read, not just a call", () => {
    expect(at({
      "c.tsx": client,
      "app/page.tsx": `import { ROWS } from "@/c";\nexport default function P() { return ROWS.length; }`,
    })).toEqual(["app/page.tsx uses ROWS from c.tsx"]);
  });

  it("sees code after an `export async function` (a regex swallowed it to the next `from`)", () => {
    expect(at({
      "c.tsx": client,
      "app/x-actions.ts": `"use server";\nimport { helper } from "@/c";\nexport async function a() { helper(); }\nexport type { T } from "./t";\n`,
      "app/t.ts": "export type T = 1;",
    })).toEqual(["app/x-actions.ts uses helper from c.tsx"]);
  });

  it("keeps a default import that follows a side-effect import", () => {
    expect(at({
      "c.tsx": client,
      "app/page.tsx": `import "server-only";\nimport notify from "@/c";\nexport default function P() { notify(); return null; }`,
    })).toEqual(["app/page.tsx uses notify from c.tsx"]);
  });

  it("checks members read off a namespace import", () => {
    expect(at({
      "c.tsx": client, "index.ts": barrel, "other.ts": "export const x = 1;",
      "app/page.tsx": `import * as ui from "@/index";\nexport default function P() { ui.helper(); return <ui.Thing />; }`,
    })).toEqual(["app/page.tsx uses ui.helper from c.tsx"]);
  });

  it("checks the exported name, so aliasing a helper to PascalCase doesn't hide it", () => {
    expect(at({
      "c.tsx": client,
      "app/page.tsx": `import { helper as Helper } from "@/c";\nexport default function P() { Helper(); return null; }`,
    })).toEqual(["app/page.tsx uses Helper from c.tsx"]);
  });

  it("ignores a name in a comment or a type position", () => {
    expect(at({
      "c.tsx": client,
      "app/page.tsx": `import { helper } from "@/c";\n// we used to call helper() here\ntype H = typeof helper;\nexport default function P(): H | null { return null; }`,
    })).toEqual([]);
  });

  it("stops at the client boundary: a client file may use anything", () => {
    expect(at({
      "c.tsx": client,
      "d.tsx": `"use client";\nimport { helper } from "./c";\nexport function Dash() { helper(); return null; }`,
      "app/page.tsx": `import { Dash } from "@/d";\nexport default function P() { return <Dash />; }`,
    })).toEqual([]);
  });

  it("counts any use of a namespace other than `ns.member` as the whole namespace", () => {
    const tree = { "c.tsx": client, "index.ts": barrel, "other.ts": "export const x = 1;" };
    for (const body of [
      `const { helper } = ui; helper();`,
      `ui["helper"]();`,
      `pick(ui);`,
      `const all = { ...ui }; all.helper();`,
    ]) {
      expect(at({ ...tree, "app/page.tsx": `import * as ui from "@/index";\nexport default function P() { ${body} return null; }` }), body)
        .toContain("app/page.tsx uses ui (whole namespace).helper from c.tsx");
    }
  });

  it("follows a namespace re-exported from a barrel", () => {
    for (const b of [`export * as ui from "./c";`, `import * as ui from "./c";\nexport { ui };`]) {
      expect(at({ "c.tsx": client, "b.ts": b, "app/page.tsx": `import { ui } from "@/b";\nexport default function P() { ui.helper(); return null; }` }), b)
        .toEqual(["app/page.tsx uses ui.helper from c.tsx"]);
    }
  });

  it("checks values taken from `await import()`", () => {
    expect(at({ "c.tsx": client, "app/page.tsx": `export default async function P() { const m = await import("@/c"); m.helper(); return null; }` }))
      .toEqual(["app/page.tsx uses m.helper from c.tsx"]);
    expect(at({ "c.tsx": client, "app/page.tsx": `export default async function P() { const { helper } = await import("@/c"); helper(); return null; }` }))
      .toEqual(["app/page.tsx uses helper from c.tsx"]);
  });

  it("judges the name the client module declares, not an alias one barrel away", () => {
    expect(at({ "c.tsx": client, "b.ts": `export { helper as Helper } from "./c";`, "app/page.tsx": `import { Helper } from "@/b";\nexport default function P() { Helper(); return null; }` }))
      .toEqual(["app/page.tsx uses Helper from c.tsx"]);
    expect(at({ "c.tsx": client, "b.ts": `export { helper as default } from "./c";`, "app/page.tsx": `import Fmt from "@/b";\nexport default function P() { Fmt(); return null; }` }))
      .toEqual(["app/page.tsx uses Fmt from c.tsx"]);
    expect(at({ "c.tsx": client, "app/page.tsx": `import Notify from "@/c";\nexport default function P() { Notify(); return null; }` }))
      .toEqual(["app/page.tsx uses Notify from c.tsx"]);
  });

  it("counts `extends` as a use, and a re-export specifier as not one", () => {
    expect(at({ "c.tsx": `"use client";\nexport class store {}`, "app/page.tsx": `import { store } from "@/c";\nclass S extends store {}\nexport default function P() { return String(new S()); }` }))
      .toEqual(["app/page.tsx uses store from c.tsx"]);
    expect(at({ "c.tsx": client, "b.ts": `import { helper } from "./c";\nexport { helper };`, "app/page.tsx": `import "@/b";\nexport default function P() { return null; }` }))
      .toEqual([]);
  });

  it("reaches forbidden / unauthorized / global-not-found, and `.js` specifiers", () => {
    for (const route of ["app/forbidden.tsx", "app/unauthorized.tsx", "app/global-not-found.tsx"]) {
      expect(at({ "c.tsx": client, [route]: `import { helper } from "@/c";\nexport default function P() { helper(); return null; }` }), route)
        .toEqual([`${route} uses helper from c.tsx`]);
    }
    expect(at({ "c.tsx": client, "app/page.tsx": `import { helper } from "../c.js";\nexport default function P() { helper(); return null; }` }))
      .toEqual(["app/page.tsx uses helper from c.tsx"]);
  });

  it("follows `import()` into the server graph", () => {
    expect(at({
      "c.tsx": client,
      "lazy.ts": `import { helper } from "./c";\nexport const run = () => helper();`,
      "app/page.tsx": `export default async function P() { const m = await import("@/lazy"); m.run(); return null; }`,
    })).toEqual(["lazy.ts uses helper from c.tsx"]);
  });
});
