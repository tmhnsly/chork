import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Server-action hygiene — two rules that review kept missing, pinned
 * the way `cache/tags.test.ts` pins the reader-first rule.
 *
 * 1. **Every write is rate limited.** The 2026-08-20 audit found
 *    sixteen write actions with no limit, among them a privilege
 *    grant (`acceptAdminInvite`) and a 500 KB Storage write
 *    (`uploadAvatar`). Every one had re-typed the auth prelude by
 *    hand instead of calling a `gate*Mutation` helper — the exact
 *    failure `auth.ts` already documented from the time before the
 *    match gate existed. So: a function that writes must open with a
 *    gate, or pass a bucket to a resource gate, and must not switch
 *    the bucket off with `rateLimit: null`. Reads that go through a
 *    gate with the limit off are listed below, with the reason.
 *
 * 2. **One result contract.** 78 actions had four success shapes
 *    (`ActionResult<T>`, `{ ok: true }`, a hand-rolled
 *    `{ success: true }`, a bare payload). Callers narrow on
 *    `"error" in result` and it worked by accident; the offline queue
 *    and the toast helpers assume `success`. Every action now declares
 *    `Promise<ActionResult<…>>`, or a local alias of it. Reads that
 *    return a bare value are listed with the reason.
 *
 * Both rules read source text, not types, so they hold under Vitest's
 * no-typecheck transpile as well as under `pnpm typecheck:test`.
 */

const APP = join(process.cwd(), "src", "app");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Every server-action module: `actions.ts` or `*-actions.ts` under
 *  `src/app`. `src/lib/user-actions.ts` used to sit outside this glob,
 *  which is how it dodged three sweeps; it lives at
 *  `app/profile/actions.ts` now. */
const modules = walk(APP)
  .filter((f) => /(^|[\\/-])actions\.ts$/.test(f) && !/\.test\.ts$/.test(f))
  .map((f) => ({ path: relative(process.cwd(), f), text: readFileSync(f, "utf8") }));

interface Action {
  path: string;
  name: string;
  /** Declared `Promise<…>` payload, or null when not annotated. */
  returnType: string | null;
  body: string;
}

/** Read a balanced `<…>` starting at `text[open]` (which must be `<`). */
function balanced(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "<") depth++;
    else if (text[i] === ">") {
      depth--;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  throw new Error(`Unbalanced generic at ${open}`);
}

function actionsIn(path: string, text: string): Action[] {
  const out: Action[] = [];
  const re = /^export async function (\w+)\(/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = m.index;
    // The body runs to the next line that is a bare `}`.
    const close = text.indexOf("\n}\n", start);
    const chunk = text.slice(start, close === -1 ? text.length : close + 2);
    // The signature ends at the first line-ending `{` that closes a
    // `)` or a `>` — not one opening an inline object type.
    const sigEnd = chunk.search(/[)>]\s*\{\n/);
    const signature = chunk.slice(0, chunk.indexOf("{", sigEnd));
    const promise = signature.indexOf("Promise<");
    const returnType = promise === -1 ? null : balanced(signature, promise + "Promise".length).trim();
    out.push({ path, name: m[1], returnType, body: chunk.slice(sigEnd) });
  }
  return out;
}

const actions = modules.flatMap((m) => actionsIn(m.path, m.text));

const key = (a: { path: string; name: string }) => `${a.path} ${a.name}`;

// ────────────────────────────────────────────────────────────────
// Rule 1 — every write is rate limited
// ────────────────────────────────────────────────────────────────

/** Something in the body reaches a table, a bucket, or the auth admin API. */
const WRITE = /\.(insert|update|delete|upsert|upload)\(|\.rpc\(|auth\.admin\.|auth\.sign(In|Up|Out)/;

/**
 * …or calls into the climber-write layer. `route-log-actions` and
 * `comment-actions` never touch a table themselves — every write goes
 * through `@/lib/data/mutations` — so the table regex alone would
 * pass a new one that forgot its gate.
 */
function writesThroughMutations(action: Action): boolean {
  const text = modules.find((m) => m.path === action.path)!.text;
  const imported = text.match(/import \{([^}]+)\} from "@\/lib\/data\/mutations"/);
  if (!imported) return false;
  const names = imported[1].split(",").map((n) => n.trim().split(/\s+as\s+/).pop()!).filter(Boolean);
  return names.some((n) => new RegExp(`\\b${n}\\(`).test(action.body));
}
/** The prelude went through a gate, or a resource gate was given a bucket. */
const LIMITED = /\bgate(Climber|GymAdmin|SignedIn)Mutation\(|\benforce(RateLimit)?\(|rateLimit: "/;
const UNLIMITED = /rateLimit: null/;

/**
 * Writes-by-regex that are not rate-limited writes, each with the
 * reason. An entry here is a decision; a write that is merely
 * forgotten fails the test instead.
 */
const RATE_LIMIT_EXEMPT: Record<string, string> = {
  "src/app/login/actions.ts signInAction":
    "no session yet, so no user to key a bucket on — Supabase Auth rate-limits sign-in itself",
  "src/app/login/actions.ts signUpAction":
    "no session yet — Supabase Auth rate-limits sign-up itself",
  "src/app/login/actions.ts signOutAction":
    "ends the session; nothing to protect and nothing to key on",
  "src/app/match/actions.ts fetchChorkAllowance":
    "a read through an RPC, gated with the limit explicitly off — it runs on every attempt tap",
  "src/app/match/actions.ts fetchChorkStandings":
    "a read through an RPC, gated with the limit explicitly off — polled by the live board",
  "src/app/friends/actions.ts getFriendStatusAction":
    "a read through an RPC, gated with the limit explicitly off — one call per profile view",
};

describe("server-action hygiene: every write is rate limited", () => {
  it("found the action modules", () => {
    expect(modules.length).toBeGreaterThan(10);
    expect(actions.length).toBeGreaterThan(50);
  });

  it("has no exemption that no longer names an action", () => {
    const known = new Set(actions.map(key));
    expect(Object.keys(RATE_LIMIT_EXEMPT).filter((k) => !known.has(k))).toEqual([]);
  });

  const writes = actions.filter((a) => WRITE.test(a.body) || writesThroughMutations(a));

  it.each(writes.map((a) => [key(a), a] as const))(
    "%s opens with a gate that applies a rate limit",
    (id, action) => {
      if (id in RATE_LIMIT_EXEMPT) return;
      expect(
        LIMITED.test(action.body) && !UNLIMITED.test(action.body),
        `${action.name} writes but never rate-limits. Open it with gateSignedInMutation / gateClimberMutation / gateGymAdminMutation, or pass { rateLimit: "mutationsWrite" } to its resource gate — never re-type the auth prelude by hand (auth.ts). A read that goes through a gate with the limit off belongs in RATE_LIMIT_EXEMPT here, with its reason.`,
      ).toBe(true);
    },
  );
});

// ────────────────────────────────────────────────────────────────
// Rule 2 — one result contract
// ────────────────────────────────────────────────────────────────

/**
 * Actions that deliberately return a bare value rather than an
 * `ActionResult`. Each is a read whose caller renders "absent" the
 * same as "failed" (the read contract in docs/architecture.md), or a
 * form action bound to `useActionState`, whose state shape is the
 * form's, not ours.
 */
const RESULT_SHAPE_EXEMPT: Record<string, string> = {
  "src/app/login/actions.ts signInAction": "useActionState form contract (AuthActionState)",
  "src/app/login/actions.ts signUpAction": "useActionState form contract (AuthActionState)",
  "src/app/login/actions.ts signOutAction":
    "auth-context's sign-out contract: `{ error?: string }`, retried on failure",
  "src/app/onboarding/actions.ts fetchListedGyms": "read — an empty list renders the same as a failed one",
  "src/app/profile/actions.ts checkUsernameAvailable": "read — a boolean the form debounces on",
  "src/app/(app)/rank-actions.ts fetchMyRank": "read — null renders as 'no rank yet'",
  "src/app/(app)/comment-actions.ts fetchComments": "read — an empty page renders the same as a failed one",
  "src/app/(app)/comment-actions.ts fetchRouteData": "read — the sheet's hydration payload; absent fields render empty",
};

describe("server-action hygiene: one result contract", () => {
  it("has no exemption that no longer names an action", () => {
    const known = new Set(actions.map(key));
    expect(Object.keys(RESULT_SHAPE_EXEMPT).filter((k) => !known.has(k))).toEqual([]);
  });

  it.each(actions.map((a) => [key(a), a] as const))(
    "%s returns Promise<ActionResult<…>>",
    (id, action) => {
      if (id in RESULT_SHAPE_EXEMPT) return;
      const type = action.returnType;
      expect(type, `${action.name} has no declared Promise<…> return type — declare Promise<ActionResult<…>> so the contract is visible at the boundary`).not.toBeNull();
      const direct = /^ActionResult\b/.test(type!);
      // A local alias counts when it is itself an ActionResult.
      const alias = /^\w+$/.test(type!)
        && new RegExp(`type ${type} = ActionResult<`).test(modules.find((m) => m.path === action.path)!.text);
      expect(
        direct || alias,
        `${action.name} returns Promise<${type}>. Every action returns ActionResult<T> — { error } | ({ success: true } & T) — so callers narrow the same way everywhere. A bare-value read belongs in RESULT_SHAPE_EXEMPT here, with its reason.`,
      ).toBe(true);
    },
  );
});
