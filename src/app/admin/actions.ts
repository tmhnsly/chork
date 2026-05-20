/**
 * Barrel re-export of every admin server action. Production code
 * imports from the concern-scoped files directly
 * (`./gym-actions`, `./invites-actions`, `./sets-actions`,
 * `./routes-actions`, `./competitions-actions`) — this barrel exists
 * only so `src/app/admin/actions.test.ts` can pull every action
 * from a single dynamic import without re-shaping the 25 per-test
 * `await import("./actions")` call sites.
 *
 * No "use server" directive here. Re-exporting an already-tagged
 * server-action function doesn't create a new server endpoint — the
 * function carries its action id from the original module.
 */

export * from "./gym-actions";
export * from "./invites-actions";
export * from "./sets-actions";
export * from "./routes-actions";
export * from "./competitions-actions";
