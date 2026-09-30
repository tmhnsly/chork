/**
 * A runtime list of a type's keys that the compiler keeps honest.
 *
 * Types are erased, so a test that wants to ask "does the SQL build
 * every field this interface declares" needs the field names as
 * values. A hand-typed list would drift the first time someone adds a
 * field. `keysOf<T>()([...])` fails to compile if the list names a key
 * `T` doesn't have, or misses one it does.
 *
 *     const PLAYER = keysOf<MatchPlayerView>()(["player_id", "user_id", …]);
 */
export function keysOf<T>() {
  return <const K extends ReadonlyArray<keyof T>>(
    keys: K & ([keyof T] extends [K[number]] ? unknown : { missing: Exclude<keyof T, K[number]> }),
  ): K => keys;
}
