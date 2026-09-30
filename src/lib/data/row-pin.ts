import type { Database } from "../database.types";

/**
 * Compile-time pins between the hand-written domain types and the
 * generated ones.
 *
 * `match-types.ts` and `league-types.ts` describe rows by hand so the
 * domain can narrow them (`status: "live" | "archived"`, not `string`).
 * Nothing tied those shapes to `database.types.ts`, so a column renamed
 * or dropped by a migration left a field that compiled and read
 * `undefined`. A pin makes that a type error in the file that declares
 * the shape, the next time the types are regenerated.
 *
 * Usage, beside the interface:
 *
 *     export type MatchPins = AllPinned<[
 *       Pinned<Match, TableRow<"sets">>,
 *       Pinned<MatchRoute, TableRow<"routes">>,
 *     ]>;
 *
 * A failing pin reports `{ unpinned: "the_field" }`, which names what
 * drifted.
 */

type Public = Database["public"];

export type TableRow<T extends keyof Public["Tables"]> = Public["Tables"][T]["Row"];

/** One row of a function declared `returns table (…)`. */
export type FunctionRow<F extends keyof Public["Functions"]> =
  Public["Functions"][F]["Returns"] extends Array<infer R> ? R : never;

/**
 * The fields of `Hand` that `Source` doesn't have, or has with a type
 * `Hand`'s can't be a narrowing of.
 */
type Unpinned<Hand, Source> = {
  [K in keyof Hand]: K extends keyof Source ? (Hand[K] extends Source[K] ? never : K) : K;
}[keyof Hand];

/** The fields of `Hand` that aren't fields of `Source` at all. */
type Unknown<Hand, Source> = Exclude<keyof Hand, keyof Source>;

/** Every field of `Hand` is a column of `Source`, with a type that narrows it. */
export type Pinned<Hand, Source> = [Unpinned<Hand, Source>] extends [never]
  ? true
  : { unpinned: Unpinned<Hand, Source> };

/**
 * Names only. Generated function returns carry no nullability (every
 * column reads as non-null), so a type comparison would reject an
 * honest `string | null`.
 */
export type PinnedKeys<Hand, Source> = [Unknown<Hand, Source>] extends [never]
  ? true
  : { unpinned: Unknown<Hand, Source> };

/** Fails to compile unless every entry is `true`. */
export type AllPinned<T extends readonly true[]> = T;
