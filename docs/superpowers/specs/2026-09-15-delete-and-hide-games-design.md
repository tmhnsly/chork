# Deleting and hiding games — design

**Status:** approved by Tom on 2026-09-15, with all three recommended
decisions below. Revised while planning: hides live in a private table,
not on the seat row (see "Removing a game from your games").

**Asked for:** "there is no way for a user to delete a game they've
created by accident or want to remove from their lists" (Tom, after
testing at Yonder).

**Model agreed:** the host deletes a game for everyone; any player
hides a finished game from their own lists.

## Summary

Two actions with two different reaches:

| Action | Who | When | Reach | Undo |
|---|---|---|---|---|
| **Delete game** | Host | Live or finished | Everyone: the game and everything in it is gone | None |
| **Remove from my games** | Any player | Finished only | Only your own lists and numbers | Put it back from the game's page |

## Decisions (approved)

1. **League weeks.** Agreed: a league week leaves its league before it
   can be deleted. Recommended refinement: a week that is **still live
   and has no routes** can be deleted directly. League posters still
   start a week in one tap, so this is the accidental start, it holds
   nothing, and it isn't counted anywhere yet. Every other week is
   removed from the league first (league page), because a finished
   week changes the table for everyone: its placings, and the week
   count that decides how many results each player drops
   (`league_drops(weeks)`, migration 134). Even an empty finished week
   moves the drops.
2. **A hidden game leaves your numbers, not just your list.**
   Recommended: hiding does in your own reads what leaving already
   does, so a hidden game drops out of your Games list, your profile's
   games and its career line, and your future badge progress. Badges
   already earned stay. The alternative, list only with numbers still
   counting, needs a second history query, because one RPC
   (`get_match_history`) feeds both the list and the career line.
3. **Where the controls live.** Recommended: the live game's menu
   (host: Delete game) and a new ⋮ menu on a finished game's summary
   page (everyone: Remove from my games; host: Delete game). No swipe
   or long-press on list rows in this version.

## Deleting a game

**Rules**

- Host only. Anyone else gets "Only the host can delete this game".
- Live or finished.
- League weeks follow decision 1.
- A hard delete. The `sets` row goes, and with it, all by
  `ON DELETE CASCADE`: routes, route logs, seats (`set_players`), the
  grade ladder (`set_grades`) and `user_set_stats`.
- Pending invites go too: the RPC deletes `match_invite_received`
  notifications whose payload names the game, so nobody taps a dead
  invite.

**What stays:** badges already earned (`user_achievements` has no link
to a game), saved scales, friendships.

**What every player loses with it:** the game in Games, profiles and
league lists; its sends in the grade charts (distribution and
progression read every route log); friend suggestions and moments that
came from it (both computed on read); its share link (`/r/<token>`
stops resolving).

**Confirmation** (`ConfirmInline`, like End game):

- With others: "Delete this game for everyone? @elmo, @sam and 2
  others lose it, with every route and send in it. This can't be
  undone."
- Alone: "Delete this game? Every route and send in it goes. This
  can't be undone."
- Confirm "Yes, delete game", pending "Deleting…".
- Names: up to two usernames with `@`, then "and N others". Guests
  count as others; a guest alone reads "a guest". One pure helper,
  unit-tested.

**After:** the host sees "Game deleted" and lands on Games
(`router.replace("/match")`).

**Players on the live screen.** The cascade emits a DELETE for every
seat. Seats have `REPLICA IDENTITY FULL` (migration 085), and Supabase
delivers filtered DELETE events only for such tables, so every live
screen of this game hears its own seat go. A probe with throwaway
accounts (2026-09-15) confirmed both halves: the filtered delete events
arrive, and each carries **only the row's `id`**, never its other
columns. So the screen matches the event against the viewer's own seat
id, which it already holds, not against a user id. Nothing else deletes
a seat (there is no DELETE policy, and leaving parks a seat with
`left_at`), so "my seat was deleted" means "this game was deleted". The
handler:

- The viewer's own seat was deleted: toast "This game was deleted"
  (warning) and `router.replace("/match")`. From then on the screen
  ignores realtime events and cancels its debounced board and Chork
  refetches, and it refreshes Games when it unmounts, once the
  navigation has landed.
- Another seat was deleted (the game is going, or that climber's
  account was deleted): take it off the screen by its id
  (`remove-player`). Never `router.refresh()` (revised after the final
  review): the refresh re-rendered a game on its way out, which bounces
  to the join screen, and it sat in Next's action queue where the
  navigation above could lose the refetch queued behind it.
- A join or a leave: `router.refresh()`, as today.
- The device that pressed Delete marks itself as leaving first, so its
  own seat's event doesn't toast or navigate twice, and it cancels its
  refetches too. A host's other devices take the first branch like
  anyone else.

Anyone not on the live screen simply no longer sees the game listed.
An old link behaves as a missing game does today: `/match/<id>` falls
through to the join screen, and the summary page 404s.

**Offline:** a log queued offline for a game that has since been
deleted is dropped on its first replay. Today the queue treats any
refused write as retryable: it retries up to its limit, then drops the
entry with `offline_queue_dropped_mutation`, an error that reaches
Sentry as lost data. When the RPC says the route no longer exists
('Route not found', P0002), the log action returns a shared sentinel,
`ROUTE_GONE_ERROR`, the way `isAuthRequiredError` works for auth, and
the queue discards entries carrying it at once, logged at info level
rather than as lost data.

## Removing a game from your games

**Rules**

- Any player with a seat. Finished (archived) games only: a live game
  already has Leave for players, and End or Delete for the host.
- Stored in a private table, `hidden_matches`, one row per player per
  hidden game. Not `left_at`, which marks you as left on everyone's
  board and summary. Not a column on `set_players` either: every player
  of a game can read all of its seat rows (`set_players_select` is
  `can_read_set`), so a column there would show your hide to them.
  `hidden_matches` has no Data API grant and no policies, like
  `friends`; only SECURITY DEFINER functions read or write it. The flag
  is private: nobody else can read it. The change isn't: someone who
  shared the game can see it leave your profile (revised after review).
- In your own reads it follows `left_at` (decision 2):
  `get_match_history` (the Games tab's recent games, a profile's games
  list and the gymless career line) and
  `get_match_achievement_context` (badge progress, your seat only).
- Unchanged: everyone else's lists, boards and summaries; league
  tables; friend suggestions and moments; share links; grade charts;
  the game's own summary page, which stays reachable by link.
- Reversible: while hidden, the summary page's menu offers "Put back
  in my games".

**Copy:** menu item "Remove from my games"; confirm "Remove this game
from your games? It stays for everyone else, and you can put it back
from this page."; toasts "Removed from your games" and "Back in your
games". The page stays put after either, refreshed.

## Data and API

**Migration 141, `delete_and_hide_games.sql`**

- `public.hidden_matches (user_id, set_id, hidden_at)`, primary key
  `(user_id, set_id)`, both keys cascading from `profiles` and `sets`,
  so deleting a game or an account takes its hides. RLS enabled with
  no policies, and every privilege revoked from `anon` and
  `authenticated`.
- `public.delete_match(p_set_id uuid) returns uuid`: SECURITY DEFINER,
  `set search_path = ''`, shaped like `end_match` (103).
  - No caller: 'Not authenticated' (42501).
  - The row is locked `for update`. Missing, or not
    `owner_kind = 'climber'`: 'Game not found' (P0002).
  - Caller isn't `host_id`: 'Only the host can delete this game'
    (42501).
  - `league_id` set, unless the game is live with no routes:
    'Remove this week from its league before deleting it' (22023).
  - Deletes the game's invite notifications, then the set. Returns the
    id.
  - Execute revoked from `anon` and `public`, granted to
    `authenticated`.
- `public.set_match_hidden(p_set_id uuid, p_hidden boolean) returns boolean`:
  SECURITY DEFINER, `set search_path = ''`.
  - The caller's seat in a climber game, or 'Game not found' (P0002),
    so a non-player can't tell a real game from a missing one.
  - Hiding a game that isn't archived: 'Only a finished game can be
    removed from your games' (22023).
  - Inserts the caller's row (kept if already there) or deletes it,
    and returns whether the game is now hidden. Same grants as above.
- Redefine `get_match_history` (latest: 137) and
  `get_match_achievement_context` (latest: 085) to skip games the
  subject has a `hidden_matches` row for, beside the **subject's** seat
  filter `sp.left_at is null`. The filters on other players' seats
  inside them stay as they are, so nobody's hide changes anyone else's
  badges.
- Redefine `get_match_state_for_user` (latest: 138) with one more key,
  `viewer_hidden`: whether the viewer has hidden this game.
- Regenerate `database.types.ts`.

**Server actions** (`src/app/match/actions.ts`, both opening with
`gateSignedInMutation(matchId, "match id")` and ending with
`refreshGamesPage()`, so action-hygiene covers them):

- `deleteMatchAction(matchId): Promise<ActionResult<{ id: string }>>`
- `setMatchHiddenAction(matchId, hidden): Promise<ActionResult<{ hidden: boolean }>>`

**No new query:** the summary page reads `viewer_hidden` from the
state bundle it already loads. The bundle is built per viewer, so it
carries only the viewer's own flag.

**Client**

- `MatchMenuSheet`: for the host, "Delete game" (`variant="ghost"`)
  under End game, with the confirmation above. Offered only where the
  RPC allows it (`canDeleteGame`): not a league week, or a live week
  with no routes.
- `use-match-realtime`: pass the `set_players` payload to
  `onPlayerChange`.
- `useMatchScreenState`: `handleDelete`, and `onPlayerChange` deciding
  through a pure `seatEventOutcome(evt, viewerSeatId)` beside the
  reducer, comparing `evt.old.id` with the viewer's own seat. Three
  outcomes (revised after the final review): `deleted` (the viewer's own
  seat), `gone` with the seat id (anyone else's), `refresh` (a join or a
  leave).
- Summary page: a ⋮ `IconButton` (`FaEllipsisVertical`, label "Game
  options") at the right of the top row, opening a new
  `GameOptionsSheet` in `components/Match`. It holds Remove from my
  games or Put back in my games, and for the host Delete game. On a
  league week the host sees "This is a week of {league}. Remove it
  from the league first." linking to the league page, instead of
  Delete.
- `deleteGameWarning(players, viewerId)` and `canDeleteGame(game, viewerId)`:
  the confirmation's names and the rule for offering Delete, in a new
  pure module `src/lib/data/match-deletion.ts`.
- `matchScreenReducer`: a new `remove-log-by-id` removes a log found by
  its id, because a delete event carries nothing else. Deleting a game
  fires one per log. `remove-log` stays for the local rollback, which
  knows the owner and route.

## Security

- Both writes are SECURITY DEFINER RPCs that check the caller
  themselves. Sets, seats and routes have no DELETE policy, so nothing
  else can delete them.
- A non-player gets 'Game not found' from both, exactly as for a
  missing game, so an id can't be probed.
- Delete touches one game: a single `where id = p_set_id`, its
  cascades, and the invite notifications that name it.
- Hides stay private: `hidden_matches` is unreachable through the
  Data API, and the one read that returns a flag returns the viewer's
  own.
- Deleting a game emits a DELETE event per route, log and seat to that
  game's channel. Each carries only the row's id (probe, 2026-09-15),
  so nothing about anyone's climbing travels with it. Supabase doesn't
  apply RLS to delete events, so a stranger who knows the game's id and
  subscribes hears those ids too, which reveals only that rows went.

## Testing

- **Integration**, new `delete-and-hide.integration.test.ts`, with
  service-role fixtures like the existing suites:
  - The host deletes a live game with a second player, routes and logs:
    the set, seats, routes, logs and invite notification are gone, and
    a badge row is untouched.
  - A player and a stranger are refused, and nothing changes.
  - A league week with routes is refused; a live league week with no
    routes is deleted (if decision 1 is approved).
  - Hiding an archived game removes it from the hider's history and
    badge context, and it stays in the other player's.
  - Hiding a live game is refused; putting a game back restores it; a
    non-player's hide gets 'Game not found'.
- **Unit:** both actions (malformed id, signed out, each RPC error
  mapped to its message), `deleteGameWarning`, `seatEventOutcome`,
  `canDeleteGame`, `remove-log-by-id` in the reducer, and the offline
  queue discarding a route-gone refusal on its first replay.
- **Live**, headless with two throwaway accounts deleted afterwards:
  the player is on the live screen when the host deletes, and lands on
  Games with the toast; the host removes a finished game from their
  games on its summary page, and it leaves their Games list but stays
  on the other account's.

## Docs to update

CLAUDE.md's game rule; CONTEXT.md (Delete game, Remove from my games,
hidden versus left); `docs/schema.md`; `docs/migrations.md` row 141;
`docs/roadmap.md`.

## Not in this version

Swipe or long-press on list rows; deleting several games at once; host
hand-over; removing one player's seat; anything else league-shaped,
which belongs to the Games session.

## Found while mapping (separate from this spec)

- **Climbers can delete their own logs in finished games.** Confirmed
  by the probe: once the game had ended, the player's edit to their own
  log was refused, because the UPDATE policy's check requires a live
  set, but deleting the log went through. The `route_logs` DELETE
  policy (012) is `user_id = auth.uid()` with no check on the set's
  status, so through the Data API a climber can change a finished
  game's result, a league week's placings or an archived gym set's
  board after the fact. **Fixed by migration 140**, which removes the
  policy and the grant.
- **Delete events, corrected.** The first draft of this spec said
  removed logs reach subscribers as full rows with raw attempt counts.
  The probe showed otherwise: every delete event carried only the row's
  `id`, to a player and to a stranger alike. A stranger with the game's
  id learns only that rows were deleted, and their ids.
- **The live screen's log-delete handler reads fields a delete event
  doesn't carry.** `remove-log` takes the owner and route from
  `evt.old`, which holds only `id`, so its dispatch matches no log.
  **Folded into this work** (see Client).
