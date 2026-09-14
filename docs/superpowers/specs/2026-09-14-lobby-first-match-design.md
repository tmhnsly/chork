# Lobby-first match — design

*2026-09-14. Decided with Tom after prototyping the profile and
reviewing the create-match wizard. Option A of two.*

## What it is

**Starting a match is one tap.** The match exists immediately with
sensible defaults, and the empty match screen is the **lobby**: the
join code and QR, players arriving live, and the match's settings as
pills the host can change until the first route goes up.

Today four questions stand between a climber and a match (game,
discipline, scale, details), and the reward for answering them is a
screen with a dashed square on it. Every comparable product — Kahoot,
Jackbox, the golf scorecards, Strava — does it the other way round:
one choice that looks like a game, then a lobby where people show up.
The setup *is* the lobby.

Vocabulary (add to CONTEXT.md when built):

- **Lobby** — a live match with no routes yet. Not a status; derived
  from `routes.length === 0`.
- **Setup** — the settings a host may change while in the lobby:
  name, where, discipline, grading (scale, custom ladder, mixed
  day's second scale). Game mode and handicap are already changeable
  any time and stay that way.
- **Poster** — the full-width accent-solid card a game is chosen from.
  `--accent-solid` with `--accent-on-solid` ink: the sent tile at
  card scale, the treatment CLAUDE.md already names.

## Not in this slice

- A co-host / admin role. Needs a permission model; separate spec.
- Inviting friends before the match exists. Invites hang off the
  match id, so they happen in the lobby, which is the point.
- Changing the grading after a route exists. Locked, by the RPC.
- Realtime for anything new. Player arrivals already stream through
  `use-match-realtime`; the lobby just renders them.

## Rules

**One tap creates.** `/match/new` shows two posters, Points and
Chork. Tapping one calls `createMatchAction` with the defaults and
lands in the match. No review, no Next.

Defaults: discipline `boulder`, scale `v`, range the whole ladder
(`SCALE_HARD_MAX`), handicap off, no second scale, name
`{first name}'s match` (stored, not a display fallback — every list
shows it; legacy null names keep "Untitled match"). Chork posters
still create then `setMatchGameMode`, as today.

**League weeks stay one tap.** `/match/new?league=…` shows the same
posters under a "Week N of {league}" line; tapping creates with last
week's settings (the prefill the wizard computed) instead of the
defaults. A page must never create on load — refresh would duplicate.

**Setup is the host's, and only in the lobby.** A new RPC
`set_match_setup` updates name, location, discipline, scale, range,
custom grades (replacing `set_grades`), alt scale + range, and
optionally saves the custom ladder. It refuses unless the caller
hosts the match, the match is live, and it has no routes:
`'Routes are already up — grading is locked'`, errcode `22023`.
Validation is the same as `create_match`'s, so it moves into one
SQL function, `match_setup_check(...)`, that both call. A scoring
rule with two homes drifts.

**The lobby has one primary action.** "Add the first route" (Chork:
"Set the first challenge"), accent, full width. Invite is the second
action, secondary. Nothing else on the screen is a button that looks
like one.

**One add-route control, ever.** The floating + goes. In play, the
grid's last tile is a labelled tile, "Add route" / "Set a route",
hidden for non-setters in Chork with "Waiting for @x" in its place.

## Screens

### `/match/new` — posters

Two full-width posters, stacked. Each: the game's name in the display
voice, one line on how it's won, a glyph. Points: "Most points wins.
Every send scores." Chork: "Set a route and send it. Everyone else
matches you or takes a letter." Tapping shows the poster's own loading
state; a failure toasts and re-enables. The League line above when
`?league` is present.

### Match screen — lobby (no routes)

1. **Hero.** Title, wrapping to two lines. Beneath, a row of pills:
   `Points` · `Boulders` · `V-scale` · `Handicap off` · `Where`.
   Host: each pill opens its setup sheet. Others: static, low
   contrast. The ⋮ menu keeps end / leave only.
2. **Join card.** Code at number 3xl, QR, `Share link`, `Invite
   friends`, `Add guest`. This is the menu sheet's content promoted
   to the page, because in the lobby it is the whole job. After the
   first route it collapses to an `Invite` pill in the hero that opens
   the same content as a sheet.
3. **Players card.** Every seat as it joins: avatar, name, "host" on
   the host. One seat reads "Waiting for players…" under it. Rows
   flush to the card edge with hairline dividers, no inset tint.
4. **Primary CTA.** "Add the first route". Opens the add-route sheet,
   whose header names the scale ("Grading in V-scale") with a
   `Change` link while in the lobby, so a host who never opened the
   pill still meets the choice once, in place.

### Match screen — playing (≥1 route)

As today, plus: title wraps; `Invite` pill in the hero; board rows
flush; one labelled add tile; FAB removed.

### Setup sheets (host, lobby only)

- **Game** — Points / Chork tiles. `setMatchGameMode`, existing.
- **Climbing** — Boulders / Ropes / Mixed tiles, the scale chips
  beneath, the mixed day's second scale, the custom ladder editor
  with saved scales. This is the wizard's step two, lifted out of
  `CreateMatchForm` into a `GradingSetup` component that both the
  sheet and (until deleted) the form could host. `set_match_setup`.
- **Details** — name, where. `set_match_setup`.
- **Handicap** — `setMatchHandicapAction`, existing.

The sheets reuse `createMatchReducer` and `buildCreateMatchPayload`:
the reducer already models exactly this state, and the payload it
builds is what `set_match_setup` takes. Hydrate from the match on
open, dispatch as today, submit on Save.

## Data

- **Migration 136** — `match_setup_check(...)` (validation extracted
  from `create_match`), `create_match` rewritten to call it,
  `set_match_setup(...)` (host + live + no routes gate; updates
  `sets`; deletes and re-inserts `set_grades` for custom; optional
  `user_custom_scales` save). Grant execute to `authenticated`,
  revoke from `anon, public`. Regenerate types.
- **Action** — `setMatchSetupAction(matchId, payload)` in
  `src/app/match/actions.ts`: `gateSignedInMutation` with the
  `mutationsWrite` bucket, `isUuid` on the id, payload validated by
  the same client-side rules the create action uses. Returns
  `ActionResult<MatchRecord>`. Revalidates the match's tag.
- **Default name** — computed client-side from the profile's name
  (first word) at creation; the create action already accepts a
  name.
- **Lobby** — `isLobby(state)` selector in `matchScreenReducer.ts`.

## Deleted

`CreateMatchForm`'s wizard chrome (steps, dots, review ticket, nav).
Its grading section survives as `GradingSetup`. The form's reducer
and tests stay — they now serve the sheets.

## Tests

- `match/actions.test.ts` — `setMatchSetupAction`: malformed id,
  gate failure, locked-by-routes error mapped to a friendly string.
- `matchScreenReducer.test.ts` — `isLobby` true at zero routes,
  false after `route-added`.
- A pure `matchTitle(match)` helper with its test: stored name, else
  "Untitled match".
- `action-hygiene.test.ts` picks the new action up automatically.
- The SQL gate is checked by hand after `db push`: setup succeeds on
  a fresh match, fails after one route, fails for a non-host.

## Copy

- Empty players card: "Waiting for players — share the code."
- Locked grading (playing state, host taps the pill): "Grading is
  locked once a route is up."
- Non-setter Chork add tile: "Waiting for @{setter}".
