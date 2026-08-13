/**
 * Split a username into the chunks a line break is allowed to fall
 * between.
 *
 * CSS has no line-break opportunity at an underscore. `@EMIL_
 * BROKENBERGER` is therefore one unbreakable word as far as the
 * browser is concerned, so a narrow column leaves it two choices:
 * overflow, or — with `overflow-wrap: anywhere` — split at whatever
 * character happens to land on the edge. The podium did the latter and
 * rendered "@EMIL_BROKENBERG / ER".
 *
 * Climbers pick handles like `dave_gravelgrinder` and
 * `chris_sharmageddon`, so the underscore is almost always where a
 * human would break it anyway. Emitting a `<wbr>` there gives the
 * browser a sensible place to wrap and keeps whole words intact.
 *
 * The trailing underscore stays attached to the chunk before it — a
 * line ending "@EMIL_" reads as continuing, where a line ending
 * "@EMIL" looks like the whole handle.
 *
 * Returns chunks without the leading `@`; the caller owns that, since
 * it should never be orphaned on its own line.
 */
export function usernameChunks(username: string): string[] {
  if (!username) return [];
  // Split *after* each run of underscores, keeping them on the left.
  const parts = username.match(/[^_]*_+|[^_]+/g);
  return parts ?? [username];
}
