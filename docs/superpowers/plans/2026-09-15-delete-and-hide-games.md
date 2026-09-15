# Deleting and Hiding Games Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A game's host can delete it for everyone, and any player can remove a finished game from their own lists and put it back.

**Architecture:** Two SECURITY DEFINER RPCs own the rules: `delete_match` (host, hard delete, league-week guard) and `set_match_hidden` (a player's own finished games). Hides live in a private `hidden_matches` table with no Data API access; history, badge context and the state bundle honour them for their owner only. Server actions wrap the RPCs. The live game screen treats a DELETE of its own seat (the event carries only the id) as "this game was deleted"; the game menu gains Delete, a finished game's summary page gains a ⋮ options sheet, and the offline queue discards a log whose route is gone instead of retrying it.

**Tech Stack:** Next 16 App Router, React 19, Supabase (plpgsql RPCs, realtime postgres_changes), vitest (`unit` and `integration` projects), SCSS modules with design tokens, Playwright for the live check.

**Spec:** `docs/superpowers/specs/2026-09-15-delete-and-hide-games-design.md`

## Global Constraints

- User copy says "game", never "match". Code, RPCs and routes keep `match`.
- Copy, verbatim. RPC refusals: `'Game not found'` (P0002), `'Only the host can delete this game'` (42501), `'Remove this week from its league before deleting it'` (22023), `'Only a finished game can be removed from your games'` (22023). Toasts: "Game deleted", "This game was deleted" (warning), "Removed from your games", "Back in your games". Confirm labels: "Yes, delete game" / "Deleting…", "Yes, remove it" / "Removing…". Menu items: "Delete game", "Remove from my games", "Put back in my games". Trigger label: "Game options".
- Every server action opens with `gateSignedInMutation(matchId, "match id")` and returns `Promise<ActionResult<…>>` (`src/lib/action-hygiene.test.ts` enforces).
- A realtime DELETE payload carries only `old.id` (verified against production, 2026-09-15). Never read any other field from one.
- `hidden_matches` has no Data API grant and no policies. Only SECURITY DEFINER functions touch it, and no read ever returns another player's hide.
- Tom applies migrations. At a "Tom applies" step, stop and ask him to run `! npx supabase db push --linked`; this session can't push migrations or push to `main`.
- Page chrome is round: the summary page's menu trigger is `IconButton` with `FaEllipsisVertical` (`src/styles/design-system.test.ts`).
- SCSS modules and tokens only. Text that isn't on a card plane uses `--mono-text`, never `--mono-text-low-contrast`.
- Before each commit run `pnpm test`, `pnpm lint`, `pnpm typecheck` and `pnpm typecheck:test`. Never run `pnpm build` while the dev server is up. Commit on `feat/match-flow`; don't push.

## File map

| File | Change |
|---|---|
| `supabase/migrations/141_delete_and_hide_games.sql` | Create: `hidden_matches`, `delete_match`, `set_match_hidden`, three redefined reads |
| `src/test/integration/delete-and-hide.integration.test.ts` | Create |
| `src/lib/database.types.ts` | Regenerate |
| `src/lib/data/match-types.ts` | `MatchState.viewer_hidden` |
| `src/lib/data/match-deletion.ts` (+ test) | Create: `deleteGameWarning`, `canDeleteGame` |
| `src/app/match/actions.ts` (+ test) | `deleteMatchAction`, `setMatchHiddenAction`, route-gone mapping |
| `src/lib/offline/refusals.ts` | Create: `ROUTE_GONE_ERROR`, `isPermanentRefusal` |
| `src/lib/offline/mutation-queue.ts` (+ test) | Discard permanent refusals at once |
| `src/components/Match/matchScreenReducer.ts` (+ test) | `remove-log-by-id`, `seatEventOutcome` |
| `src/hooks/use-match-realtime.ts` | Seat payload to `onPlayerChange`; DELETE caveat |
| `src/components/Match/useMatchScreenState.ts` | `handleDelete`, own-seat deletion, log DELETE by id |
| `src/components/Match/MatchMenuSheet.tsx`, `matchMenuSheet.module.scss` | Delete game |
| `src/components/Match/MatchScreen.tsx` | Wire the menu |
| `src/components/Match/GameOptionsSheet.tsx`, `gameOptionsSheet.module.scss` | Create |
| `src/app/match/summary/[id]/page.tsx`, `summary.module.scss` | Options menu in the top row |
| `CLAUDE.md`, `CONTEXT.md`, `docs/schema.md`, `docs/migrations.md`, `docs/roadmap.md` | Docs |

---

### Task 1: Migration 141 and its integration test

**Files:**
- Create: `src/test/integration/delete-and-hide.integration.test.ts`
- Create: `supabase/migrations/141_delete_and_hide_games.sql`
- Regenerate: `src/lib/database.types.ts`
- Modify: `src/lib/data/match-types.ts`, `docs/migrations.md`, `docs/schema.md`

**Interfaces:**
- Produces RPC `public.delete_match(p_set_id uuid) returns uuid`, executable by `authenticated`.
- Produces RPC `public.set_match_hidden(p_set_id uuid, p_hidden boolean) returns boolean`, executable by `authenticated`.
- Produces table `public.hidden_matches (user_id uuid, set_id uuid, hidden_at timestamptz)`, primary key `(user_id, set_id)`.
- `get_match_state_for_user` gains the top-level key `viewer_hidden: boolean`. `get_match_history` and `get_match_achievement_context` keep their signatures and skip games their subject hid.
- Produces `MatchState.viewer_hidden?: boolean` in `src/lib/data/match-types.ts`.

- [ ] **Step 1: Write the failing integration test**

Create `src/test/integration/delete-and-hide.integration.test.ts`:

```ts
/**
 * Deleting and hiding games (migration 141), against the real database.
 *
 * Spec: docs/superpowers/specs/2026-09-15-delete-and-hide-games-design.md.
 * The host deletes a game for everyone; any player takes a finished game
 * off their own lists, privately, and can put it back.
 *
 * Fixtures follow match-state.integration.test.ts: `integration-` users,
 * `int:` names, and one delete per Set in `afterAll`.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canRunIntegration, makeServiceClient, makeUserClient } from "./supabase-client";
import { createTestUser, deleteTestUser, signInAsUser } from "./fixtures";

const BADGE = "int-delete-keeps-badges";

describe.skipIf(!canRunIntegration)("deleting and hiding games (integration)", () => {
  const service = makeServiceClient();
  const hostClient = makeUserClient();
  const playerClient = makeUserClient();
  const strangerClient = makeUserClient();
  let hostId: string;
  let playerId: string;
  let strangerId: string;
  const createdSetIds = new Set<string>();
  const createdLeagueIds = new Set<string>();

  /** A game with the player seated: a route and their send unless `withRoute: false`, finished if `end`. */
  async function game(name: string, opts: { withRoute?: boolean; end?: boolean } = {}): Promise<string> {
    const { withRoute = true, end = false } = opts;
    // create_match hands the host their empty live game back (137), so
    // end the last one first, the way a host would.
    const { data: live } = await service
      .from("sets")
      .select("id")
      .eq("host_id", hostId)
      .eq("status", "live");
    for (const { id } of live ?? []) {
      await service
        .from("sets")
        .update({ status: "archived", ends_at: new Date().toISOString() })
        .eq("id", id);
    }

    const { data, error } = await hostClient.rpc("create_match", {
      p_name: name,
      p_grading_scale: "v",
      p_min_grade: 0,
      p_max_grade: 8,
    });
    expect(error, "create_match").toBeNull();
    const setId = (data as Array<{ id: string }>)[0].id;
    createdSetIds.add(setId);

    const { error: joinError } = await playerClient.rpc("join_match", { p_set_id: setId });
    expect(joinError, "join_match").toBeNull();

    if (withRoute) {
      const { data: route, error: routeError } = await hostClient.rpc("add_match_route", {
        p_set_id: setId,
        p_description: `${name} route`,
        p_grade: 4,
        p_has_zone: false,
      });
      expect(routeError, "add_match_route").toBeNull();
      const { error: logError } = await playerClient.rpc("upsert_match_log", {
        p_route_id: (route as { id: string }).id,
        p_attempts: 2,
        p_completed: true,
        p_zone: false,
      });
      expect(logError, "upsert_match_log").toBeNull();
    }

    if (end) {
      const { error: endError } = await hostClient.rpc("end_match", { p_set_id: setId });
      expect(endError, "end_match").toBeNull();
    }
    return setId;
  }

  async function count(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
    const { count: n, error } = await query;
    expect(error).toBeNull();
    return n ?? 0;
  }

  const setRows = (setId: string) =>
    count(service.from("sets").select("id", { count: "exact", head: true }).eq("id", setId));
  const seatRows = (setId: string) =>
    count(service.from("set_players").select("id", { count: "exact", head: true }).eq("set_id", setId));
  const routeRows = (setId: string) =>
    count(service.from("routes").select("id", { count: "exact", head: true }).eq("set_id", setId));
  const logRows = (setId: string) =>
    count(service.from("route_logs").select("id", { count: "exact", head: true }).eq("set_id", setId));

  async function historyIds(userId: string): Promise<string[]> {
    const { data, error } = await service.rpc("get_match_history", { p_user_id: userId, p_limit: 100 });
    expect(error).toBeNull();
    return ((data ?? []) as Array<{ set_id: string }>).map((row) => row.set_id);
  }

  async function gamesPlayed(userId: string): Promise<number> {
    const { data, error } = await service.rpc("get_match_achievement_context", { p_user_id: userId });
    expect(error).toBeNull();
    return Number((data as Array<{ matches_played: number }> | null)?.[0]?.matches_played ?? 0);
  }

  async function viewerHidden(setId: string, userId: string): Promise<boolean> {
    const { data, error } = await service.rpc("get_match_state_for_user", {
      p_set_id: setId,
      p_user_id: userId,
    });
    expect(error).toBeNull();
    return (data as { viewer_hidden?: boolean } | null)?.viewer_hidden === true;
  }

  beforeAll(async () => {
    const host = await createTestUser(service);
    hostId = host.userId;
    await signInAsUser(hostClient, host.email, host.password);

    const player = await createTestUser(service);
    playerId = player.userId;
    await signInAsUser(playerClient, player.email, player.password);

    const stranger = await createTestUser(service);
    strangerId = stranger.userId;
    await signInAsUser(strangerClient, stranger.email, stranger.password);
  }, 60_000);

  afterAll(async () => {
    for (const setId of createdSetIds) {
      await service.from("sets").delete().eq("id", setId);
    }
    for (const leagueId of createdLeagueIds) {
      await service.from("leagues").delete().eq("id", leagueId);
    }
    if (playerId) {
      await service.from("user_achievements").delete().eq("user_id", playerId).eq("badge_id", BADGE);
    }
    for (const id of [hostId, playerId, strangerId]) {
      if (id) await deleteTestUser(service, id);
    }
  }, 60_000);

  describe("delete_match", () => {
    it("takes a live game's seats, routes, logs and invites with it, and leaves badges", async () => {
      const setId = await game("int: delete a live game");
      const { error: inviteError } = await service.from("notifications").insert({
        user_id: strangerId,
        kind: "match_invite_received",
        payload: { set_id: setId },
      });
      expect(inviteError).toBeNull();
      const { error: badgeError } = await service
        .from("user_achievements")
        .insert({ user_id: playerId, badge_id: BADGE });
      expect(badgeError).toBeNull();

      const { data, error } = await hostClient.rpc("delete_match", { p_set_id: setId });

      expect(error).toBeNull();
      expect(data).toBe(setId);
      createdSetIds.delete(setId);
      expect(await setRows(setId)).toBe(0);
      expect(await seatRows(setId)).toBe(0);
      expect(await routeRows(setId)).toBe(0);
      expect(await logRows(setId)).toBe(0);
      expect(
        await count(
          service
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("kind", "match_invite_received")
            .eq("payload->>set_id", setId),
        ),
      ).toBe(0);
      expect(
        await count(
          service
            .from("user_achievements")
            .select("id", { count: "exact", head: true })
            .eq("user_id", playerId)
            .eq("badge_id", BADGE),
        ),
      ).toBe(1);
    });

    it("deletes a finished game", async () => {
      const setId = await game("int: delete a finished game", { end: true });

      const { error } = await hostClient.rpc("delete_match", { p_set_id: setId });

      expect(error).toBeNull();
      createdSetIds.delete(setId);
      expect(await setRows(setId)).toBe(0);
    });

    it("refuses a player, and nothing changes", async () => {
      const setId = await game("int: a player can't delete");

      const { error } = await playerClient.rpc("delete_match", { p_set_id: setId });

      expect(error?.code).toBe("42501");
      expect(error?.message).toBe("Only the host can delete this game");
      expect(await setRows(setId)).toBe(1);
      expect(await logRows(setId)).toBe(1);
    });

    it("answers a stranger exactly as it answers a missing game", async () => {
      const setId = await game("int: a stranger can't delete");

      const refused = await strangerClient.rpc("delete_match", { p_set_id: setId });
      const missing = await strangerClient.rpc("delete_match", { p_set_id: randomUUID() });

      expect(refused.error?.code).toBe("P0002");
      expect(refused.error?.message).toBe("Game not found");
      expect(missing.error?.code).toBe(refused.error?.code);
      expect(missing.error?.message).toBe(refused.error?.message);
      expect(await setRows(setId)).toBe(1);
    });

    it("refuses a league week with routes, and lets a live week with none go", async () => {
      const { data: league, error: leagueError } = await service
        .from("leagues")
        .insert({ host_id: hostId, name: "int: delete a week" })
        .select("id")
        .single();
      expect(leagueError).toBeNull();
      createdLeagueIds.add(league!.id);

      const played = await game("int: a played week");
      await service.from("sets").update({ league_id: league!.id }).eq("id", played);
      const refused = await hostClient.rpc("delete_match", { p_set_id: played });
      expect(refused.error?.code).toBe("22023");
      expect(refused.error?.message).toBe("Remove this week from its league before deleting it");
      expect(await setRows(played)).toBe(1);

      const accidental = await game("int: an accidental week", { withRoute: false });
      await service.from("sets").update({ league_id: league!.id }).eq("id", accidental);
      const { error } = await hostClient.rpc("delete_match", { p_set_id: accidental });
      expect(error).toBeNull();
      createdSetIds.delete(accidental);
      expect(await setRows(accidental)).toBe(0);
    });
  });

  describe("set_match_hidden", () => {
    it("takes a finished game out of the player's own history and badge count only, and puts it back", async () => {
      const setId = await game("int: hide a finished game", { end: true });
      const playedBefore = await gamesPlayed(playerId);
      expect(await historyIds(playerId)).toContain(setId);

      const { data, error } = await playerClient.rpc("set_match_hidden", { p_set_id: setId, p_hidden: true });

      expect(error).toBeNull();
      expect(data).toBe(true);
      expect(await historyIds(playerId)).not.toContain(setId);
      expect(await gamesPlayed(playerId)).toBe(playedBefore - 1);
      expect(await viewerHidden(setId, playerId)).toBe(true);
      // Nobody else's view moves.
      expect(await historyIds(hostId)).toContain(setId);
      expect(await viewerHidden(setId, hostId)).toBe(false);

      const back = await playerClient.rpc("set_match_hidden", { p_set_id: setId, p_hidden: false });

      expect(back.error).toBeNull();
      expect(back.data).toBe(false);
      expect(await historyIds(playerId)).toContain(setId);
      expect(await gamesPlayed(playerId)).toBe(playedBefore);
    });

    it("refuses to hide a live game", async () => {
      const setId = await game("int: can't hide a live game");

      const { error } = await playerClient.rpc("set_match_hidden", { p_set_id: setId, p_hidden: true });

      expect(error?.code).toBe("22023");
      expect(error?.message).toBe("Only a finished game can be removed from your games");
    });

    it("answers a stranger as a missing game", async () => {
      const setId = await game("int: a stranger can't hide", { end: true });

      const { error } = await strangerClient.rpc("set_match_hidden", { p_set_id: setId, p_hidden: true });

      expect(error?.code).toBe("P0002");
      expect(error?.message).toBe("Game not found");
    });

    it("keeps hides out of the Data API's reach", async () => {
      const { error } = await playerClient.from("hidden_matches").select("set_id");

      expect(error?.code).toBe("42501");
    });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test:integration`
Expected: FAIL in `delete-and-hide.integration.test.ts`. The RPC calls return `PGRST202` ("Could not find the function public.delete_match…"), and the `hidden_matches` query fails because the table doesn't exist. Other integration files pass.

- [ ] **Step 3: Write the migration**

Create the head of `supabase/migrations/141_delete_and_hide_games.sql`:

```bash
cat > supabase/migrations/141_delete_and_hide_games.sql <<'EOF'
-- ────────────────────────────────────────────────────────────────
-- Deleting and hiding games
-- ────────────────────────────────────────────────────────────────
--
-- Spec: docs/superpowers/specs/2026-09-15-delete-and-hide-games-design.md
--
-- Tom, after testing at Yonder: there was no way to delete a game made by
-- accident, or to take one off your lists. Two actions, two reaches:
--
--   • delete_match: the host deletes a game for everyone. The set goes,
--     its seats, routes, logs and grade ladder cascade with it, and its
--     pending invites are deleted. Badges already earned stay:
--     user_achievements has no link to a game.
--   • set_match_hidden: any player takes a finished game off their own
--     lists, or puts it back.
--
-- Hides live in their own table, not on `set_players`: every player of a
-- game can read all of its seat rows (`set_players_select` is
-- `can_read_set`), so a column there would show your hide to them. Like
-- `leagues`, `hidden_matches` has no Data API grant. History and badge
-- context skip a game its subject hid, and the state bundle carries
-- `viewer_hidden`, the viewer's own flag.

create table public.hidden_matches (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  set_id    uuid not null references public.sets(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, set_id)
);
comment on table public.hidden_matches is
  'Finished games a player took off their own lists (migration 141). '
  'Read and written only through SECURITY DEFINER functions — deliberately NO Data API grant.';

-- The primary key leads with user_id; deleting a set scans by set_id.
create index hidden_matches_set_id_idx on public.hidden_matches (set_id);

alter table public.hidden_matches enable row level security;
revoke all on public.hidden_matches from anon, authenticated;

-- ── delete_match ──────────────────────────────────────────────────

create or replace function public.delete_match(p_set_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target public.sets;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into target
    from public.sets
   where id = p_set_id
     and owner_kind = 'climber'
   for update;

  -- A non-player and a missing game get the same answer, so an id can't
  -- be probed.
  if target.id is null
     or not exists (
       select 1 from public.set_players sp
        where sp.set_id = p_set_id
          and sp.user_id = caller_id
     ) then
    raise exception 'Game not found' using errcode = 'P0002';
  end if;

  if target.host_id is distinct from caller_id then
    raise exception 'Only the host can delete this game' using errcode = '42501';
  end if;

  -- A league week leaves its league first: a finished week holds
  -- placings, and the week count decides everyone's drops (134). A live
  -- week with no routes is the accidental one-tap start and counts for
  -- nothing yet, so it can go directly.
  if target.league_id is not null
     and not (
       target.status = 'live'
       and not exists (select 1 from public.routes r where r.set_id = p_set_id)
     ) then
    raise exception 'Remove this week from its league before deleting it'
      using errcode = '22023';
  end if;

  -- An invite to a game that no longer exists would open a dead join.
  delete from public.notifications
   where kind = 'match_invite_received'
     and payload ->> 'set_id' = p_set_id::text;

  delete from public.sets where id = p_set_id;

  return p_set_id;
end;
$$;

revoke execute on function public.delete_match(uuid) from anon, public;
grant execute on function public.delete_match(uuid) to authenticated;

-- ── set_match_hidden ──────────────────────────────────────────────

create or replace function public.set_match_hidden(p_set_id uuid, p_hidden boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  v_status text;
  hide boolean := coalesce(p_hidden, false);
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select s.status into v_status
    from public.sets s
    join public.set_players sp
      on sp.set_id = s.id
     and sp.user_id = caller_id
   where s.id = p_set_id
     and s.owner_kind = 'climber';

  if v_status is null then
    raise exception 'Game not found' using errcode = 'P0002';
  end if;

  if hide and v_status <> 'archived' then
    raise exception 'Only a finished game can be removed from your games'
      using errcode = '22023';
  end if;

  if hide then
    insert into public.hidden_matches (user_id, set_id)
    values (caller_id, p_set_id)
    on conflict (user_id, set_id) do nothing;
  else
    delete from public.hidden_matches
     where user_id = caller_id
       and set_id = p_set_id;
  end if;

  return hide;
end;
$$;

revoke execute on function public.set_match_hidden(uuid, boolean) from anon, public;
grant execute on function public.set_match_hidden(uuid, boolean) to authenticated;
EOF
```

Append the three reads it redefines, copied verbatim from their latest migrations:

```bash
M=supabase/migrations/141_delete_and_hide_games.sql
{
  printf '\n-- ── get_match_history: skips games the subject hid ──────────────\n\n'
  awk '/^create or replace function public.get_match_history\(/,/^\$\$;/' supabase/migrations/137_empty_lobbies.sql
  printf '\nrevoke execute on function public.get_match_history(uuid, integer, timestamptz) from anon, authenticated, public;\n'
  printf 'grant execute on function public.get_match_history(uuid, integer, timestamptz) to service_role;\n'
  printf '\n-- ── get_match_achievement_context: skips games the subject hid ───\n\n'
  awk '/^create or replace function public.get_match_achievement_context\(/,/^\$\$;/' supabase/migrations/085_*.sql
  printf '\nrevoke execute on function public.get_match_achievement_context(uuid) from anon, authenticated, public;\n'
  printf 'grant execute on function public.get_match_achievement_context(uuid) to service_role;\n'
  printf '\n-- ── get_match_state_for_user: carries viewer_hidden ─────────────\n\n'
  awk '/^create or replace function public.get_match_state_for_user\(/,/^\$\$;/' supabase/migrations/138_other_players_logs.sql
} >> "$M"
```

Patch the copies:

```bash
python3 - <<'EOF'
p = "supabase/migrations/141_delete_and_hide_games.sql"
s = open(p).read()

HIDDEN = """      -- Taken off their own games (migration 141).
      and not exists (
        select 1 from public.hidden_matches hm
        where hm.set_id = s.id and hm.user_id = p_user_id
      )
"""

history_old = "      and s.status = 'archived'\n      and s.ends_at is not null\n"
assert s.count(history_old) == 1, "get_match_history anchor"
s = s.replace(history_old, history_old + HIDDEN, 1)

context_old = "      and s.status = 'archived'\n  ),\n"
assert s.count(context_old) == 1, "get_match_achievement_context anchor"
s = s.replace(context_old, "      and s.status = 'archived'\n" + HIDDEN + "  ),\n", 1)

state_old = """      from public.get_match_leaderboard(p_set_id, p_user_id) lb
    ), '[]'::jsonb)
  );
"""
assert s.count(state_old) == 1, "get_match_state_for_user anchor"
s = s.replace(state_old, """      from public.get_match_leaderboard(p_set_id, p_user_id) lb
    ), '[]'::jsonb),
    -- The viewer's own hide (migration 141). The bundle is built per
    -- viewer, so no other player's flag can ride along.
    'viewer_hidden', exists (
      select 1 from public.hidden_matches hm
      where hm.set_id = p_set_id and hm.user_id = p_user_id
    )
  );
""", 1)

open(p, "w").write(s)
print("patched")
EOF
```

Check the result: `grep -c "hidden_matches" supabase/migrations/141_delete_and_hide_games.sql`
Expected: `11` or more (the table, its comment and index, the two RPCs, and one filter in each of the three reads).

- [ ] **Step 4: Tom applies the migration**

Run: `npx supabase db push --linked --dry-run`
Expected: lists `141_delete_and_hide_games.sql` (and `140_climbers_cannot_delete_logs.sql` if it hasn't been applied yet). Then stop and ask Tom to run:

```
! npx supabase db push --linked
```

- [ ] **Step 5: Regenerate the database types**

Run: `pnpm typegen && grep -n "hidden_matches\|delete_match\|set_match_hidden" src/lib/database.types.ts | head`
Expected: the table and both functions appear.

- [ ] **Step 6: Add `viewer_hidden` to the state type**

In `src/lib/data/match-types.ts`, inside `export interface MatchState`, replace:

```ts
  leaderboard: MatchLeaderboardRow[];
}
```

with:

```ts
  leaderboard: MatchLeaderboardRow[];
  /**
   * Whether the viewer took this game off their own games (migration
   * 141). Only ever the viewer's own flag: the bundle is built per
   * viewer. Absent from a bundle served before 141.
   */
  viewer_hidden?: boolean;
}
```

- [ ] **Step 7: Run the integration suite and typechecks**

Run: `pnpm test:integration && pnpm typecheck && pnpm typecheck:test`
Expected: every integration file passes, including `delete-and-hide` and `route-log-deletes`. Both typechecks exit 0.

- [ ] **Step 8: Document the migration**

```bash
python3 - <<'EOF'
import re
p = "docs/migrations.md"; s = open(p).read()
m = re.search(r"^\| 140 \|.*$", s, re.M)
assert m, "row 140"
row = ("| 141 | `delete_and_hide_games.sql` | **Deleting and hiding games.** `delete_match(p_set_id)`: host only, a hard delete for everyone "
       "(seats, routes, logs and grade ladder cascade; pending invite notifications deleted; badges stay). A league week must leave its league "
       "first unless it is live with no routes (22023); a non-player gets 'Game not found', like a missing game. `set_match_hidden(p_set_id, p_hidden)`: "
       "a player takes a finished game off their own lists or puts it back, stored in the new `hidden_matches` (no Data API grant, like `leagues`, "
       "because every player can read a game's seat rows). `get_match_history` and `get_match_achievement_context` skip the subject's hidden games; "
       "`get_match_state_for_user` gains `viewer_hidden`. Integration-tested in `delete-and-hide.integration.test.ts` |")
s = s[:m.end()] + "\n" + row + s[m.end():]
open(p, "w").write(s)

p = "docs/schema.md"; s = open(p).read()
anchor = "### set_grades"
assert s.count(anchor) == 1, "set_grades heading"
s = s.replace(anchor, """### hidden_matches

Finished games a player took off their own lists (migration 141). One
row per player per hidden game; deleting the game or the account takes
it.

| Field       | Type        | Notes |
|---|---|---|
| `user_id`   | uuid FK     | PK part 1, cascades from `profiles` |
| `set_id`    | uuid FK     | PK part 2, cascades from `sets` |
| `hidden_at` | timestamptz | |

**No Data API grant and no policies**, like `leagues`. Every player of
a game can read all of its `set_players` rows, so the flag can't live
there. Only `set_match_hidden` writes it; `get_match_history` and
`get_match_achievement_context` skip hidden games for their subject,
and `get_match_state_for_user` returns the viewer's own flag as
`viewer_hidden`.

""" + anchor, 1)

rpc_anchor = "- `set_match_setup(set_id, name, location, discipline, grading_scale,"
assert s.count(rpc_anchor) == 1, "set_match_setup bullet"
s = s.replace(rpc_anchor, """- `delete_match(set_id)` → uuid — the host deletes a game for everyone
  (migration 141). Seats, routes, logs, the grade ladder and pending
  `match_invite_received` notifications go with it; badges stay.
  'Game not found' (P0002) for a missing game and a non-player alike;
  'Only the host can delete this game' (42501); a finished league week,
  or a live one with routes, gets 'Remove this week from its league
  before deleting it' (22023)
- `set_match_hidden(set_id, hidden)` → boolean — the caller takes a
  finished game off their own lists, or puts it back (migration 141).
  Hiding a live game is refused (22023); a non-player gets 'Game not
  found'
""" + rpc_anchor, 1)
open(p, "w").write(s)
print("docs updated")
EOF
```

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/141_delete_and_hide_games.sql src/test/integration/delete-and-hide.integration.test.ts src/lib/database.types.ts src/lib/data/match-types.ts docs/migrations.md docs/schema.md
git commit -m "feat(games): the host deletes a game, a player hides one (migration 141)"
```

---

### Task 2: The confirmation's words and the rule for offering Delete

**Files:**
- Create: `src/lib/data/match-deletion.ts`
- Test: `src/lib/data/match-deletion.test.ts`

**Interfaces:**
- Produces `interface DeletionSeat { user_id: string | null; username: string | null; is_guest: boolean }`. `MatchPlayerView` satisfies it.
- Produces `deleteGameWarning(seats: DeletionSeat[], viewerId: string): string`.
- Produces `interface DeletableGame { hostId: string; leagueId: string | null; status: MatchStatus; routeCount: number }`.
- Produces `canDeleteGame(game: DeletableGame, viewerId: string): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data/match-deletion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canDeleteGame, deleteGameWarning, type DeletionSeat } from "./match-deletion";

const HOST = "host-id";
const host: DeletionSeat = { user_id: HOST, username: "tom", is_guest: false };
const guest: DeletionSeat = { user_id: null, username: null, is_guest: true };
const climber = (username: string): DeletionSeat => ({
  user_id: `${username}-id`,
  username,
  is_guest: false,
});
const TAIL = "with every route and send in it. This can't be undone.";

describe("deleteGameWarning", () => {
  it("tells a host playing alone that everything goes", () => {
    expect(deleteGameWarning([host], HOST)).toBe(
      "Delete this game? Every route and send in it goes. This can't be undone.",
    );
  });

  it("names one other player with a verb that agrees", () => {
    expect(deleteGameWarning([host, climber("elmo")], HOST)).toBe(
      `Delete this game for everyone? @elmo loses it, ${TAIL}`,
    );
  });

  it("names two players", () => {
    expect(deleteGameWarning([host, climber("elmo"), climber("sam")], HOST)).toBe(
      `Delete this game for everyone? @elmo and @sam lose it, ${TAIL}`,
    );
  });

  it("names two and counts everyone else, guests included", () => {
    expect(
      deleteGameWarning([host, climber("elmo"), climber("sam"), climber("kit"), guest], HOST),
    ).toBe(`Delete this game for everyone? @elmo, @sam and 2 others lose it, ${TAIL}`);
  });

  it("counts a single other after one name", () => {
    expect(deleteGameWarning([host, climber("elmo"), guest], HOST)).toBe(
      `Delete this game for everyone? @elmo and 1 other lose it, ${TAIL}`,
    );
  });

  it("says a guest when guests are all there is", () => {
    expect(deleteGameWarning([host, guest], HOST)).toBe(
      `Delete this game for everyone? A guest loses it, ${TAIL}`,
    );
    expect(deleteGameWarning([host, guest, guest], HOST)).toBe(
      `Delete this game for everyone? 2 guests lose it, ${TAIL}`,
    );
  });
});

describe("canDeleteGame", () => {
  const game = { hostId: HOST, leagueId: null, status: "live" as const, routeCount: 3 };

  it("lets the host delete a game outside a league, live or finished", () => {
    expect(canDeleteGame(game, HOST)).toBe(true);
    expect(canDeleteGame({ ...game, status: "archived" }, HOST)).toBe(true);
  });

  it("never offers it to anyone else", () => {
    expect(canDeleteGame(game, "someone-else")).toBe(false);
  });

  it("offers it on a league week only while the week is live with no routes", () => {
    const week = { ...game, leagueId: "league-1" };
    expect(canDeleteGame({ ...week, routeCount: 0 }, HOST)).toBe(true);
    expect(canDeleteGame(week, HOST)).toBe(false);
    expect(canDeleteGame({ ...week, status: "archived", routeCount: 0 }, HOST)).toBe(false);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm vitest run --project unit src/lib/data/match-deletion.test.ts`
Expected: FAIL, "Failed to resolve import ./match-deletion".

- [ ] **Step 3: Implement**

Create `src/lib/data/match-deletion.ts`:

```ts
import { countOf } from "@/lib/plural";
import type { MatchStatus } from "./match-types";

/** A seat, as much as the delete confirmation needs of it. */
export interface DeletionSeat {
  user_id: string | null;
  username: string | null;
  is_guest: boolean;
}

const TAIL = "with every route and send in it. This can't be undone.";

/**
 * The delete confirmation, naming who else loses the game.
 *
 * Up to two account holders by @username, then a count of everyone
 * else, guests included. The verb agrees with how many people that is.
 */
export function deleteGameWarning(seats: DeletionSeat[], viewerId: string): string {
  const others = seats.filter((s) => s.user_id !== viewerId);
  if (others.length === 0) {
    return "Delete this game? Every route and send in it goes. This can't be undone.";
  }
  const verb = others.length === 1 ? "loses" : "lose";
  return `Delete this game for everyone? ${whoElse(others)} ${verb} it, ${TAIL}`;
}

function whoElse(others: DeletionSeat[]): string {
  const named = others
    .filter((s) => !s.is_guest && s.username)
    .slice(0, 2)
    .map((s) => `@${s.username}`);
  const rest = others.length - named.length;
  if (named.length === 0) return rest === 1 ? "A guest" : countOf(rest, "guest");
  if (rest === 0) return named.join(" and ");
  return `${named.join(", ")} and ${countOf(rest, "other")}`;
}

/** The facts `delete_match` decides on. */
export interface DeletableGame {
  hostId: string;
  leagueId: string | null;
  status: MatchStatus;
  routeCount: number;
}

/**
 * Whether to offer Delete game. Mirrors `delete_match` (migration 141),
 * which is the real gate: the host only, and a league week only while it
 * is live with no routes, the accidental one-tap start.
 */
export function canDeleteGame(game: DeletableGame, viewerId: string): boolean {
  if (game.hostId !== viewerId) return false;
  if (game.leagueId === null) return true;
  return game.status === "live" && game.routeCount === 0;
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm vitest run --project unit src/lib/data/match-deletion.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/match-deletion.ts src/lib/data/match-deletion.test.ts
git commit -m "feat(games): the delete confirmation names who loses the game"
```

---

### Task 3: The two server actions

**Files:**
- Modify: `src/app/match/actions.ts`
- Test: `src/app/match/actions.test.ts`

**Interfaces:**
- Consumes RPCs `delete_match` and `set_match_hidden` (Task 1).
- Produces `deleteMatchAction(matchId: string): Promise<ActionResult<{ id: string }>>`.
- Produces `setMatchHiddenAction(matchId: string, hidden: boolean): Promise<ActionResult<{ hidden: boolean }>>`.

- [ ] **Step 1: Write the failing tests**

Append to `src/app/match/actions.test.ts` (after the `describe("game lifecycle refreshes the Games page", …)` block; `mockSignedIn`, `mockAuthFailure`, `MATCH_1` and `AUTH_REQUIRED` are defined at the top of the file):

```ts
describe("deleteMatchAction", () => {
  it("rejects a malformed match id", async () => {
    const { deleteMatchAction } = await import("./actions");
    expect(await deleteMatchAction("not-a-uuid")).toEqual({ error: "Invalid match id" });
  });

  it("surfaces auth failure", async () => {
    await mockAuthFailure();
    const { deleteMatchAction } = await import("./actions");
    expect(await deleteMatchAction(MATCH_1)).toEqual({ error: AUTH_REQUIRED });
  });

  it("deletes and refreshes the Games page", async () => {
    await mockSignedIn({ "rpc:delete_match": { data: MATCH_1, error: null } });
    const { revalidatePath } = await import("next/cache");
    vi.mocked(revalidatePath).mockClear();
    const { deleteMatchAction } = await import("./actions");

    expect(await deleteMatchAction(MATCH_1)).toEqual({ success: true, id: MATCH_1 });
    expect(revalidatePath).toHaveBeenCalledWith("/match");
  });

  it("maps a refusal to a friendly error and refreshes nothing", async () => {
    await mockSignedIn({
      "rpc:delete_match": {
        data: null,
        error: { code: "42501", message: "Only the host can delete this game" },
      },
    });
    const { revalidatePath } = await import("next/cache");
    vi.mocked(revalidatePath).mockClear();
    const { deleteMatchAction } = await import("./actions");

    expect(await deleteMatchAction(MATCH_1)).toEqual({ error: "You don't have permission to do that." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("passes the league-week refusal through in the database's words", async () => {
    await mockSignedIn({
      "rpc:delete_match": {
        data: null,
        error: { code: "22023", message: "Remove this week from its league before deleting it" },
      },
    });
    const { deleteMatchAction } = await import("./actions");

    expect(await deleteMatchAction(MATCH_1)).toEqual({
      error: "Remove this week from its league before deleting it",
    });
  });
});

describe("setMatchHiddenAction", () => {
  it("rejects a malformed match id", async () => {
    const { setMatchHiddenAction } = await import("./actions");
    expect(await setMatchHiddenAction("not-a-uuid", true)).toEqual({ error: "Invalid match id" });
  });

  it("surfaces auth failure", async () => {
    await mockAuthFailure();
    const { setMatchHiddenAction } = await import("./actions");
    expect(await setMatchHiddenAction(MATCH_1, true)).toEqual({ error: AUTH_REQUIRED });
  });

  it("hides, puts back, and refreshes the Games page", async () => {
    await mockSignedIn({ "rpc:set_match_hidden": { data: true, error: null } });
    const { revalidatePath } = await import("next/cache");
    vi.mocked(revalidatePath).mockClear();
    const { setMatchHiddenAction } = await import("./actions");

    expect(await setMatchHiddenAction(MATCH_1, true)).toEqual({ success: true, hidden: true });
    expect(await setMatchHiddenAction(MATCH_1, false)).toEqual({ success: true, hidden: false });
    expect(revalidatePath).toHaveBeenCalledWith("/match");
  });

  it("passes a live-game refusal through in the database's words", async () => {
    await mockSignedIn({
      "rpc:set_match_hidden": {
        data: null,
        error: { code: "22023", message: "Only a finished game can be removed from your games" },
      },
    });
    const { setMatchHiddenAction } = await import("./actions");

    expect(await setMatchHiddenAction(MATCH_1, true)).toEqual({
      error: "Only a finished game can be removed from your games",
    });
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm vitest run --project unit src/app/match/actions.test.ts`
Expected: FAIL, `deleteMatchAction is not a function` and `setMatchHiddenAction is not a function`.

- [ ] **Step 3: Implement**

In `src/app/match/actions.ts`, directly after `leaveMatchAction` (it ends with `refreshGamesPage();\n  return { success: true };\n}`), add:

```ts
/**
 * The host deletes a game for everyone: its seats, routes and logs go
 * with it (migration 141). Live or finished; a league week only while it
 * is live with no routes. `delete_match` enforces all of it, and answers
 * a non-player exactly as it would a missing game.
 */
export async function deleteMatchAction(
  matchId: string,
): Promise<ActionResult<{ id: string }>> {
  const auth = await gateSignedInMutation(matchId, "match id");
  if ("error" in auth) return { error: auth.error };
  const { error } = await auth.supabase.rpc("delete_match", { p_set_id: matchId });
  if (error) return { error: formatError(error) };
  refreshGamesPage();
  return { success: true, id: matchId };
}

/**
 * A player takes a finished game off their own lists, or puts it back
 * (migration 141). Private: nobody else's view of the game changes.
 */
export async function setMatchHiddenAction(
  matchId: string,
  hidden: boolean,
): Promise<ActionResult<{ hidden: boolean }>> {
  const auth = await gateSignedInMutation(matchId, "match id");
  if ("error" in auth) return { error: auth.error };
  const { error } = await auth.supabase.rpc("set_match_hidden", {
    p_set_id: matchId,
    p_hidden: hidden,
  });
  if (error) return { error: formatError(error) };
  refreshGamesPage();
  return { success: true, hidden };
}
```

- [ ] **Step 4: Run them and see them pass, with the hygiene sweep**

Run: `pnpm vitest run --project unit src/app/match/actions.test.ts src/lib/action-hygiene.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/match/actions.ts src/app/match/actions.test.ts
git commit -m "feat(games): actions to delete a game and to take one off your games"
```

---

### Task 4: A log for a route that's gone is discarded, not retried

**Files:**
- Create: `src/lib/offline/refusals.ts`
- Modify: `src/app/match/actions.ts` (`upsertMatchLogAction`), `src/lib/offline/mutation-queue.ts`
- Test: `src/app/match/actions.test.ts`, `src/lib/offline/mutation-queue.test.ts`

**Interfaces:**
- Produces `ROUTE_GONE_ERROR: string` and `isPermanentRefusal(error: string): boolean` in `src/lib/offline/refusals.ts` (zero dependencies, client-safe).
- `upsertMatchLogAction` returns `{ error: ROUTE_GONE_ERROR }` when `upsert_match_log` raises `'Route not found'` (P0002).

- [ ] **Step 1: Write the failing tests**

Append inside `describe("upsertMatchLogAction", …)` in `src/app/match/actions.test.ts`:

```ts
  it("names a route that's gone with the sentinel the offline queue discards", async () => {
    await mockSignedIn({
      "rpc:upsert_match_log": { data: null, error: { code: "P0002", message: "Route not found" } },
    });
    const { upsertMatchLogAction } = await import("./actions");
    const { ROUTE_GONE_ERROR } = await import("@/lib/offline/refusals");

    const result = await upsertMatchLogAction({
      matchRouteId: ROUTE_1,
      attempts: 1,
      completed: true,
      zone: false,
    });

    expect(result).toEqual({ error: ROUTE_GONE_ERROR });
  });
```

Append inside `describe("MutationQueue data-loss guards", …)` in `src/lib/offline/mutation-queue.test.ts`, after the last test:

```ts
  it("discards a refusal that can never succeed on its first replay, without reporting lost data", async () => {
    const { logger } = await import("@/lib/logger");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    const { ROUTE_GONE_ERROR } = await import("@/lib/offline/refusals");

    const { queue, fakeDb } = await loadQueue();
    queue.setCurrentUserResolver(async () => "user-a");
    fakeDb.entries.set("gone", {
      id: "gone",
      userId: "user-a",
      action: "upsertMatchLog",
      args: [{ matchRouteId: "r1", attempts: 1, completed: true, zone: false }],
      routeId: "r1",
      createdAt: 1,
      retries: 0,
    });

    queue.setActionRunner((async () => ({ error: ROUTE_GONE_ERROR })) as never);
    await queue.flush();

    expect(fakeDb.entries.size).toBe(0);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      "offline_queue_discarded_refusal",
      expect.objectContaining({ action: "upsertMatchLog", routeId: "r1" }),
    );
    errorSpy.mockRestore();
    infoSpy.mockRestore();
  });
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm vitest run --project unit src/app/match/actions.test.ts src/lib/offline/mutation-queue.test.ts`
Expected: FAIL, "Failed to resolve import @/lib/offline/refusals".

- [ ] **Step 3: Implement**

Create `src/lib/offline/refusals.ts`:

```ts
// Refusals the offline queue must never retry. Server action results
// cross the server→client boundary as plain strings, so, like
// `auth-errors.ts`, this module has no dependencies and is imported from
// both sides. The queue matches these exact strings.

/**
 * The route a log was for no longer exists: withdrawn, or its game was
 * deleted (migration 141). Shown as-is when it happens online.
 */
export const ROUTE_GONE_ERROR = "That route isn't in the game any more";

/** True when retrying can never succeed, so the queue discards the entry. */
export function isPermanentRefusal(error: string): boolean {
  return error === ROUTE_GONE_ERROR;
}
```

In `src/app/match/actions.ts`, add the import beside the other `@/lib` imports:

```ts
import { ROUTE_GONE_ERROR } from "@/lib/offline/refusals";
```

In `upsertMatchLogAction`, replace:

```ts
  if (error) return { error: formatError(error) };
  // `{ success: true, log: null }` matches the synthetic shape
```

with:

```ts
  if (error) {
    // The route is gone: withdrawn, or its game deleted. A shared
    // sentinel, so an offline replay is discarded rather than retried.
    if (error.code === "P0002" && error.message === "Route not found") {
      return { error: ROUTE_GONE_ERROR };
    }
    return { error: formatError(error) };
  }
  // `{ success: true, log: null }` matches the synthetic shape
```

In `src/lib/offline/mutation-queue.ts`, add the import under the `auth-errors` import:

```ts
import { isPermanentRefusal } from "./refusals";
```

In `flush`, replace:

```ts
            if (isAuthRequiredError(error)) {
              break;
            }

            // Validation or other server error — retry or discard
```

with:

```ts
            if (isAuthRequiredError(error)) {
              break;
            }

            // What it was for is gone — a deleted game, a withdrawn
            // route. Retrying can't succeed, and it isn't lost work
            // either, so it goes now, logged as expected.
            if (isPermanentRefusal(error)) {
              logger.info("offline_queue_discarded_refusal", {
                action: entry.action,
                routeId: entry.routeId,
                detail: error,
              });
              await db.delete(STORE_NAME, entry.id);
              this.notify();
              continue;
            }

            // Validation or other server error — retry or discard
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm vitest run --project unit src/app/match/actions.test.ts src/lib/offline/mutation-queue.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/offline/refusals.ts src/app/match/actions.ts src/app/match/actions.test.ts src/lib/offline/mutation-queue.ts src/lib/offline/mutation-queue.test.ts
git commit -m "fix(offline): a log for a route that's gone is discarded, not retried"
```

---

### Task 5: The live screen hears a deletion

**Files:**
- Modify: `src/components/Match/matchScreenReducer.ts`, `src/hooks/use-match-realtime.ts`, `src/components/Match/useMatchScreenState.ts`
- Test: `src/components/Match/matchScreenReducer.test.ts`

**Interfaces:**
- Consumes `deleteMatchAction` (Task 3).
- Produces reducer action `{ type: "remove-log-by-id"; id: string }`. `remove-log` stays for the local rollback.
- Produces `seatEventOutcome(evt: { eventType: "INSERT" | "UPDATE" | "DELETE"; old: { id?: string } }, viewerSeatId: string | null): "deleted" | "refresh"`.
- `useMatchRealtime`'s `onPlayerChange` becomes `(evt: MatchRealtimeEvent<{ id: string }>) => void`.
- `useMatchScreenState` returns `handleDelete: () => void`.

- [ ] **Step 1: Write the failing tests**

In `src/components/Match/matchScreenReducer.test.ts`, add `seatEventOutcome` to the import from `./matchScreenReducer`. Inside `describe("matchReducer", …)`, directly after the `describe("remove-log", …)` block, add:

```ts
  describe("remove-log-by-id", () => {
    it("deletes the log with that id, whoever owns it", () => {
      const logs = new Map([
        [logKey("u1", "r1"), mkLog("u1", "r1")],
        [logKey("u2", "r1"), mkLog("u2", "r1")],
      ]);
      const next = matchReducer({ ...emptyState, logs }, { type: "remove-log-by-id", id: "u1-r1" });
      expect(next.logs.size).toBe(1);
      expect(next.logs.has(logKey("u1", "r1"))).toBe(false);
      expect(next.logs.has(logKey("u2", "r1"))).toBe(true);
    });

    it("returns the same state for an id it doesn't hold", () => {
      const state: MatchLocalState = {
        ...emptyState,
        logs: new Map([[logKey("u1", "r1"), mkLog("u1", "r1")]]),
      };
      expect(matchReducer(state, { type: "remove-log-by-id", id: "ghost" })).toBe(state);
    });
  });
```

At the end of the file, add:

```ts
describe("seatEventOutcome", () => {
  it("reads the viewer's own seat being deleted as the game going", () => {
    expect(seatEventOutcome({ eventType: "DELETE", old: { id: "seat-me" } }, "seat-me")).toBe("deleted");
  });

  it("refreshes for anyone else's seat, and for joins and leaves", () => {
    expect(seatEventOutcome({ eventType: "DELETE", old: { id: "seat-other" } }, "seat-me")).toBe("refresh");
    expect(seatEventOutcome({ eventType: "UPDATE", old: { id: "seat-me" } }, "seat-me")).toBe("refresh");
    expect(seatEventOutcome({ eventType: "INSERT", old: {} }, "seat-me")).toBe("refresh");
  });

  it("never reads a deletion when the viewer has no seat", () => {
    expect(seatEventOutcome({ eventType: "DELETE", old: { id: "seat-x" } }, null)).toBe("refresh");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm vitest run --project unit src/components/Match/matchScreenReducer.test.ts`
Expected: FAIL, `seatEventOutcome is not a function`, and the `remove-log-by-id` cases leave the map unchanged.

- [ ] **Step 3: Implement the reducer pieces**

In `src/components/Match/matchScreenReducer.ts`, replace:

```ts
  | { type: "remove-log"; userId: string; routeId: string }
```

with:

```ts
  | { type: "remove-log"; userId: string; routeId: string }
  /**
   * A log deleted elsewhere, from its realtime DELETE, which carries
   * nothing but the row's id (checked 2026-09-15). `remove-log` stays
   * for the local rollback, which knows the owner and route.
   */
  | { type: "remove-log-by-id"; id: string }
```

In `matchReducer`, directly after the `case "remove-log": { … }` block, add:

```ts
    case "remove-log-by-id": {
      for (const [key, log] of state.logs) {
        if (log.id !== action.id) continue;
        const logs = new Map(state.logs);
        logs.delete(key);
        return { ...state, logs };
      }
      return state;
    }
```

Directly after the `isLobby` function, add:

```ts
/**
 * What a seat's realtime event means for the viewer. A DELETE carries
 * only the row's id (checked 2026-09-15), and nothing but deleting the
 * game deletes a seat: leaving parks it with `left_at`. So the viewer's
 * own seat going means the game went.
 */
export function seatEventOutcome(
  evt: { eventType: "INSERT" | "UPDATE" | "DELETE"; old: { id?: string } },
  viewerSeatId: string | null,
): "deleted" | "refresh" {
  if (evt.eventType === "DELETE" && viewerSeatId !== null && evt.old.id === viewerSeatId) {
    return "deleted";
  }
  return "refresh";
}
```

- [ ] **Step 4: Run the reducer tests and see them pass**

Run: `pnpm vitest run --project unit src/components/Match/matchScreenReducer.test.ts`
Expected: PASS.

- [ ] **Step 5: Pass the seat event through the realtime hook**

In `src/hooks/use-match-realtime.ts`, replace the caveat in the `MatchRealtimeEvent` comment:

```ts
 * Caveat carried over from the raw payloads: on DELETE, `new` is an
 * empty object and only `old` is populated (`routes`, `route_logs`
 * and `set_players` run REPLICA IDENTITY FULL — migration 085 — so
 * `old` carries the full row); on INSERT/UPDATE,
 * `old` may be partial. Branch on `eventType` before trusting either
 * side.
```

with:

```ts
 * Caveat carried over from the raw payloads: on DELETE, `new` is an
 * empty object and `old` carries ONLY the row's `id`. `routes`,
 * `route_logs` and `set_players` run REPLICA IDENTITY FULL (migration
 * 085), which is what lets the `set_id` filter apply to deletes at
 * all, but the payload is still just the key: checked against
 * production with throwaway accounts on 2026-09-15. On INSERT/UPDATE,
 * `old` may be partial. Branch on `eventType` before trusting either
 * side, and read nothing but `old.id` from a DELETE.
```

Replace the handler type:

```ts
    /** Join/leave events — payload deliberately untyped; the current
     *  strategy is a full refresh, not a patch. */
    onPlayerChange: () => void;
```

with:

```ts
    /**
     * Seat events. A join or leave is a full refresh, not a patch; a
     * DELETE of the viewer's own seat means the game was deleted.
     */
    onPlayerChange: (evt: MatchRealtimeEvent<{ id: string }>) => void;
```

Replace the `set_players` callback:

```ts
        () => handlersRef.current.onPlayerChange(),
```

with:

```ts
        (payload: unknown) =>
          handlersRef.current.onPlayerChange(payload as MatchRealtimeEvent<{ id: string }>),
```

- [ ] **Step 6: Handle deletion in the screen state**

In `src/components/Match/useMatchScreenState.ts`:

1. Add `useRef` to the `react` import list, `deleteMatchAction` to the `@/app/match/actions` import list, and `seatEventOutcome` to the `./matchScreenReducer` import list.

2. Directly before `useMatchRealtime(initialState.match.id, {`, add:

```ts
  // Set by the device that presses Delete, so its own seat's DELETE
  // event doesn't toast and navigate a second time.
  const deletingRef = useRef(false);
  const viewerSeatId = state.players.find((p) => p.user_id === userId)?.player_id ?? null;
```

3. In `onLogChange`, replace:

```ts
      if (evt.eventType === "DELETE") {
        dispatch({
          type: "remove-log",
          userId: ownerIdOf(evt.old),
          routeId: evt.old.route_id,
        });
      } else {
```

with:

```ts
      if (evt.eventType === "DELETE") {
        // A DELETE event carries only the log's id (checked 2026-09-15).
        dispatch({ type: "remove-log-by-id", id: evt.old.id });
      } else {
```

4. Replace `onPlayerChange`:

```ts
    onPlayerChange: () => {
      // Player changes come as scattered events — a full state
      // refresh is cheaper to reason about than hand-patched set
      // maths when someone joins or leaves. The refreshed roster
      // reaches the reducer via the render-time sync above.
      router.refresh();
    },
```

with:

```ts
    onPlayerChange: (evt) => {
      // Nothing but deleting the game deletes a seat, so the viewer's
      // own seat going means the game went (migration 141).
      if (seatEventOutcome(evt, viewerSeatId) === "deleted") {
        // The device that pressed Delete is already on its way out.
        if (deletingRef.current) return;
        showToast("This game was deleted", "warning");
        router.replace("/match");
        return;
      }
      // Player changes come as scattered events — a full state
      // refresh is cheaper to reason about than hand-patched set
      // maths when someone joins or leaves. The refreshed roster
      // reaches the reducer via the render-time sync above.
      router.refresh();
    },
```

5. Directly after `handleEnd` (it ends with `}, [initialState.match.id, router]);`), add:

```ts
  const handleDelete = useCallback(() => {
    deletingRef.current = true;
    startTransition(async () => {
      const result = await deleteMatchAction(initialState.match.id);
      if ("error" in result) {
        deletingRef.current = false;
        showToast(result.error, "error");
        return;
      }
      showToast("Game deleted");
      router.replace("/match");
    });
  }, [initialState.match.id, router]);
```

6. In the returned object, add `handleDelete,` directly after `handleLeave,`.

7. If `ownerIdOf` is no longer used anywhere in the file, delete its import line (`pnpm lint` reports it).

- [ ] **Step 7: Check**

Run: `pnpm vitest run --project unit src/components/Match && pnpm typecheck && pnpm lint`
Expected: PASS, exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/components/Match/matchScreenReducer.ts src/components/Match/matchScreenReducer.test.ts src/hooks/use-match-realtime.ts src/components/Match/useMatchScreenState.ts
git commit -m "feat(games): a live screen sends everyone to Games when its game is deleted"
```

---

### Task 6: Delete game in the live game's menu

**Files:**
- Modify: `src/components/Match/MatchMenuSheet.tsx`, `src/components/Match/MatchScreen.tsx`
- Create: `src/components/Match/matchMenuSheet.module.scss`

**Interfaces:**
- Consumes `canDeleteGame`, `deleteGameWarning` (Task 2) and `handleDelete` (Task 5).
- `MatchMenuSheet` gains props `canDelete: boolean`, `deleteWarning: string`, `onDelete: () => void`.

- [ ] **Step 1: Rewrite the menu sheet**

Replace `src/components/Match/MatchMenuSheet.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { FaFlag, FaRightFromBracket, FaTrashCan } from "react-icons/fa6";
import {
  BottomSheet,
  Button,
  ConfirmInline,
  SheetBody,
} from "@/components/ui";
import styles from "./matchMenuSheet.module.scss";

interface Props {
  /** The host ends; everyone else leaves. */
  isHost: boolean;
  /**
   * Offer Delete game: `canDeleteGame`, the rule `delete_match`
   * enforces. Only ever true for the host.
   */
  canDelete: boolean;
  /** The delete confirmation, naming who else loses the game. */
  deleteWarning: string;
  onClose: () => void;
  onEnd: () => void;
  /**
   * Park the caller's seat. Everyone except the host — the host ends
   * the Match instead, and `leaveMatchAction` deliberately has no
   * hand-over path for them (see the refusal in crew-lifecycle for
   * the same shape).
   */
  onLeave: () => void;
  /** Delete the game for everyone. */
  onDelete: () => void;
  pending: boolean;
}

export function MatchMenuSheet({
  isHost,
  canDelete,
  deleteWarning,
  onClose,
  onEnd,
  onLeave,
  onDelete,
  pending,
}: Props) {
  const [confirming, setConfirming] = useState<"end" | "leave" | "delete" | null>(null);
  return (
    <BottomSheet open onClose={onClose} title="Game menu">
      <SheetBody>
        {/* Ending is the host's — it reaches everyone else's screen.
            Everyone else leaves, which reaches only their own. The
            server enforces both; this just stops offering an action
            that would come back as an error. */}
        {confirming === null && (
          <div className={styles.actions}>
            <Button
              type="button"
              variant="danger"
              onClick={() => setConfirming(isHost ? "end" : "leave")}
              fullWidth
            >
              {isHost ? (
                <>
                  <FaFlag aria-hidden /> End game
                </>
              ) : (
                <>
                  <FaRightFromBracket aria-hidden /> Leave game
                </>
              )}
            </Button>
            {/* Deleting reaches further than ending: the game goes for
                everyone, routes and sends included. Quieter than End
                game, and confirmed with the names of who loses it. */}
            {canDelete && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirming("delete")}
                fullWidth
              >
                <FaTrashCan aria-hidden /> Delete game
              </Button>
            )}
          </div>
        )}

        {confirming === "end" && (
          <ConfirmInline
            prompt={
              <p>
                End the game for everyone? Final scores will be calculated
                and the game will be closed. This cannot be undone.
              </p>
            }
            confirmLabel="Yes, end game"
            pendingLabel="Ending…"
            onConfirm={onEnd}
            onCancel={() => setConfirming(null)}
            pending={pending}
          />
        )}

        {confirming === "leave" && (
          <ConfirmInline
            prompt={
              <p>
                Leave this game? You keep the points you&rsquo;ve already
                scored and stay on the board — you just can&rsquo;t log
                anything more.
              </p>
            }
            confirmLabel="Yes, leave"
            pendingLabel="Leaving…"
            onConfirm={onLeave}
            onCancel={() => setConfirming(null)}
            pending={pending}
          />
        )}

        {confirming === "delete" && (
          <ConfirmInline
            prompt={<p>{deleteWarning}</p>}
            confirmLabel="Yes, delete game"
            pendingLabel="Deleting…"
            onConfirm={onDelete}
            onCancel={() => setConfirming(null)}
            pending={pending}
          />
        )}
      </SheetBody>
    </BottomSheet>
  );
}
```

Create `src/components/Match/matchMenuSheet.module.scss`:

```scss
@use "mixins/layout" as layout;

// End (or Leave) and Delete, stacked with room between the tap targets.
.actions {
  @include layout.stack(var(--space-3));
}
```

- [ ] **Step 2: Wire it on the game screen**

In `src/components/Match/MatchScreen.tsx`, add the import:

```ts
import { canDeleteGame, deleteGameWarning } from "@/lib/data/match-deletion";
```

Add `handleDelete,` directly after `handleLeave,` in the destructured `useMatchScreenState(...)` result. Replace:

```tsx
      {panel.kind === "menu" && (
        <MatchMenuSheet
          isHost={isHost}
          onClose={closePanel}
          onEnd={handleEnd}
          onLeave={handleLeave}
          pending={isPending}
        />
      )}
```

with:

```tsx
      {panel.kind === "menu" && (
        <MatchMenuSheet
          isHost={isHost}
          canDelete={canDeleteGame(
            {
              hostId: initialState.match.host_id,
              leagueId: initialState.match.league_id,
              status: initialState.match.status,
              routeCount: state.routes.length,
            },
            userId,
          )}
          deleteWarning={deleteGameWarning(state.players, userId)}
          onClose={closePanel}
          onEnd={handleEnd}
          onLeave={handleLeave}
          onDelete={handleDelete}
          pending={isPending}
        />
      )}
```

- [ ] **Step 3: Check**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run --project unit src/styles/design-system.test.ts`
Expected: exit 0, PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/Match/MatchMenuSheet.tsx src/components/Match/matchMenuSheet.module.scss src/components/Match/MatchScreen.tsx
git commit -m "feat(games): the host can delete a game from its menu"
```

---

### Task 7: The finished game's options menu

**Files:**
- Create: `src/components/Match/GameOptionsSheet.tsx`, `src/components/Match/gameOptionsSheet.module.scss`
- Modify: `src/app/match/summary/[id]/page.tsx`, `src/app/match/summary/[id]/summary.module.scss`

**Interfaces:**
- Consumes `deleteMatchAction`, `setMatchHiddenAction` (Task 3), `canDeleteGame`, `deleteGameWarning` (Task 2), `MatchState.viewer_hidden` (Task 1).
- Produces `GameOptionsSheet({ matchId: string; hidden: boolean; canDelete: boolean; leagueWeek: { id: string; name: string } | null; deleteWarning: string })`.

- [ ] **Step 1: Create the options sheet**

Create `src/components/Match/GameOptionsSheet.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FaEllipsisVertical, FaEye, FaEyeSlash, FaTrashCan } from "react-icons/fa6";
import {
  BottomSheet,
  Button,
  ConfirmInline,
  IconButton,
  SheetBody,
  showToast,
} from "@/components/ui";
import { deleteMatchAction, setMatchHiddenAction } from "@/app/match/actions";
import styles from "./gameOptionsSheet.module.scss";

interface Props {
  matchId: string;
  /** The viewer has taken this game off their own games. */
  hidden: boolean;
  /** Offer Delete game (`canDeleteGame`). */
  canDelete: boolean;
  /** The host's league week, which has to leave its league before it can go. */
  leagueWeek: { id: string; name: string } | null;
  /** The delete confirmation, naming who else loses the game. */
  deleteWarning: string;
}

/**
 * A finished game's ⋮ menu (migration 141). Everyone can take the game
 * off their own games and put it back; the host can delete it for
 * everyone, unless it's a league week, which leaves its league first.
 */
export function GameOptionsSheet({ matchId, hidden, canDelete, leagueWeek, deleteWarning }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<"remove" | "delete" | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setConfirming(null);
  }

  function setHidden(next: boolean) {
    startTransition(async () => {
      const result = await setMatchHiddenAction(matchId, next);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      showToast(next ? "Removed from your games" : "Back in your games");
      close();
      router.refresh();
    });
  }

  function deleteGame() {
    startTransition(async () => {
      const result = await deleteMatchAction(matchId);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      showToast("Game deleted");
      router.replace("/match");
    });
  }

  return (
    <>
      <IconButton label="Game options" onClick={() => setOpen(true)}>
        <FaEllipsisVertical />
      </IconButton>
      {open && (
        <BottomSheet open onClose={close} title="Game options">
          <SheetBody>
            {confirming === null && (
              <div className={styles.actions}>
                {hidden ? (
                  <Button
                    type="button"
                    variant="secondary"
                    fullWidth
                    loading={pending}
                    onClick={() => setHidden(false)}
                  >
                    <FaEye aria-hidden /> Put back in my games
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    fullWidth
                    onClick={() => setConfirming("remove")}
                  >
                    <FaEyeSlash aria-hidden /> Remove from my games
                  </Button>
                )}
                {canDelete && (
                  <Button
                    type="button"
                    variant="danger"
                    fullWidth
                    onClick={() => setConfirming("delete")}
                  >
                    <FaTrashCan aria-hidden /> Delete game
                  </Button>
                )}
                {leagueWeek && (
                  <p className={styles.note}>
                    This is a week of{" "}
                    <Link href={`/match/league/${leagueWeek.id}`}>{leagueWeek.name}</Link>.
                    Remove it from the league first.
                  </p>
                )}
              </div>
            )}

            {confirming === "remove" && (
              <ConfirmInline
                prompt={
                  <p>
                    Remove this game from your games? It stays for everyone
                    else, and you can put it back from this page.
                  </p>
                }
                confirmLabel="Yes, remove it"
                pendingLabel="Removing…"
                onConfirm={() => setHidden(true)}
                onCancel={() => setConfirming(null)}
                pending={pending}
              />
            )}

            {confirming === "delete" && (
              <ConfirmInline
                prompt={<p>{deleteWarning}</p>}
                confirmLabel="Yes, delete game"
                pendingLabel="Deleting…"
                onConfirm={deleteGame}
                onCancel={() => setConfirming(null)}
                pending={pending}
              />
            )}
          </SheetBody>
        </BottomSheet>
      )}
    </>
  );
}
```

Create `src/components/Match/gameOptionsSheet.module.scss`:

```scss
@use "mixins/layout" as layout;
@use "mixins/typography" as type;

.actions {
  @include layout.stack(var(--space-3));
}

// On the sheet's glass rather than a card plane, so step-12 text.
.note {
  @include type.typography(meta);
  color: var(--mono-text);
  margin: 0;
}
```

- [ ] **Step 2: Put it in the summary page's top row**

In `src/app/match/summary/[id]/page.tsx`, add the imports:

```ts
import { GameOptionsSheet } from "@/components/Match/GameOptionsSheet";
import { canDeleteGame, deleteGameWarning } from "@/lib/data/match-deletion";
```

Replace:

```tsx
      <div className={styles.topRow}>
        <IconLink href="/match" label="Back to Games">
          <FaArrowLeft />
        </IconLink>
        {fresh && (
          <span className={styles.freshBadge}>Game complete</span>
        )}
      </div>
```

with:

```tsx
      <div className={styles.topRow}>
        <IconLink href="/match" label="Back to Games">
          <FaArrowLeft />
        </IconLink>
        <div className={styles.topRowEnd}>
          {fresh && (
            <span className={styles.freshBadge}>Game complete</span>
          )}
          <GameOptionsSheet
            matchId={id}
            hidden={state.viewer_hidden === true}
            canDelete={canDeleteGame(
              {
                hostId: summary.host_id,
                leagueId: summary.league_id,
                status: summary.status,
                routeCount: state.routes.length,
              },
              auth.userId,
            )}
            leagueWeek={
              isHost && inLeague
                ? { id: inLeague.league.id, name: inLeague.league.name }
                : null
            }
            deleteWarning={deleteGameWarning(state.players, auth.userId)}
          />
        </div>
      </div>
```

In `src/app/match/summary/[id]/summary.module.scss`, directly after the `.topRow { … }` block, add:

```scss
// The completion badge and the options menu sit together on the right.
.topRowEnd {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
```

- [ ] **Step 3: Check**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: exit 0; every unit file passes, including `design-system.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/components/Match/GameOptionsSheet.tsx src/components/Match/gameOptionsSheet.module.scss "src/app/match/summary/[id]/page.tsx" "src/app/match/summary/[id]/summary.module.scss"
git commit -m "feat(games): a finished game's menu removes it from your games or deletes it"
```

---

### Task 8: Docs

**Files:**
- Modify: `CLAUDE.md`, `CONTEXT.md`, `docs/roadmap.md`

- [ ] **Step 1: Write the rules down**

```bash
python3 - <<'EOF'
def sub(p, old, new):
    s = open(p).read()
    assert s.count(old) == 1, f"{p}: anchor"
    open(p, "w").write(s.replace(old, new, 1))

sub("CLAUDE.md", "- **Archived / draft sets are read-only** for climbers.", """- **The host deletes a game; any player hides one.** `delete_match`
  (migration 141) is a hard delete for everyone: seats, routes, logs
  and pending invites go, badges already earned stay. A league week
  leaves its league first unless it is live with no routes.
  `set_match_hidden` takes a finished game off one player's own lists.
  Hides live in `hidden_matches`, which has no Data API access, because
  every player can read a game's seat rows; history and badge context
  skip a game for the player who hid it and nobody else. A live screen
  learns of a deletion from its own seat's DELETE event, which carries
  only the row's id
- **Archived / draft sets are read-only** for climbers.""")

sub("CONTEXT.md", """- **Poster** — the accent-solid card a game is chosen from: the sent
  tile at card scale.""", """- **Poster** — the accent-solid card a game is chosen from: the sent
  tile at card scale.
- **Delete game** — the host removes a game for everyone, routes and
  sends included (`delete_match`). Badges already earned stay.
- **Remove from my games** — a player takes a finished game off their
  own lists and numbers (`set_match_hidden`). Private, and undone from
  the game's summary page. Not the same as **left**, which everyone
  else's board shows.""")

sub("docs/roadmap.md", "## Shipped\n\n", """## Shipped

- [x] 2026-09-15 — Deleting and hiding games: the host deletes a game
      for everyone from its menu or its summary page, and any player
      removes a finished game from their own games and can put it back
      (migration 141). A live screen sends everyone to Games when its
      game is deleted
""")
print("docs updated")
EOF
```

- [ ] **Step 2: Run the whole check**

Run: `pnpm check && pnpm test:integration`
Expected: typechecks, lint and unit tests pass; every integration file passes.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md CONTEXT.md docs/roadmap.md
git commit -m "docs(games): deleting and hiding games"
```

---

### Task 9: Live check, then ship

**Files:**
- Create outside the repo: `delete-and-hide.mjs` in a scratch directory that has `playwright`, `@supabase/supabase-js` and `dotenv` installed (the session scratchpad's `live/` directory has them).

- [ ] **Step 1: Write the headless check**

```js
// Live check: deleting and hiding games. Two throwaway users, deleted after.
// Headless; nothing on anyone's screen.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { randomBytes } from "node:crypto";

config({ path: "/Users/tom/dev/chork/.env.local", quiet: true });
const SITE = process.env.SITE ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const note = (k, v) => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
const suffix = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const users = [];

async function makeUser(tag, name) {
  const email = `integration-live-${tag}-${suffix}@chork.test`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser ${tag}: ${error.message}`);
  users.push(data.user.id);
  const username = `live_${tag}_${suffix}`.slice(0, 24);
  await service.from("profiles").update({ username, name, onboarded: true }).eq("id", data.user.id);
  const client = createClient(url, anon, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email, password });
  return { id: data.user.id, email, password, username, client };
}

async function signIn(page, u) {
  await page.goto(`${SITE}/login`);
  await page.getByLabel(/email/i).fill(u.email);
  await page.getByLabel(/password/i).fill(u.password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((x) => !x.pathname.startsWith("/login"), { timeout: 60_000 });
}

async function gameWithSend(host, player, name, { end = false } = {}) {
  const { data: live } = await service.from("sets").select("id").eq("host_id", host.id).eq("status", "live");
  for (const { id } of live ?? []) await host.client.rpc("end_match", { p_set_id: id });
  const { data } = await host.client.rpc("create_match", { p_name: name, p_grading_scale: "v", p_min_grade: 0, p_max_grade: 8 });
  const setId = data[0].id;
  await player.client.rpc("join_match", { p_set_id: setId });
  const { data: route } = await host.client.rpc("add_match_route", { p_set_id: setId, p_description: "live", p_grade: 3, p_has_zone: false });
  await player.client.rpc("upsert_match_log", { p_route_id: route.id, p_attempts: 1, p_completed: true, p_zone: false });
  if (end) await host.client.rpc("end_match", { p_set_id: setId });
  return setId;
}

const history = async (uid) =>
  ((await service.rpc("get_match_history", { p_user_id: uid, p_limit: 50 })).data ?? []).map((r) => r.set_id);

let browser;
try {
  const host = await makeUser("dh", "Delete Host");
  const player = await makeUser("dp", "Delete Player");
  browser = await chromium.launch();
  const hostPage = await (await browser.newContext({ viewport: { width: 420, height: 860 } })).newPage();
  const playerPage = await (await browser.newContext({ viewport: { width: 420, height: 860 } })).newPage();
  await signIn(hostPage, host);
  await signIn(playerPage, player);

  // 1. The host deletes a live game from its menu; the player's live screen goes to Games.
  const live = await gameWithSend(host, player, "Live delete check");
  await playerPage.goto(`${SITE}/match/${live}`);
  await playerPage.getByRole("button", { name: "Game menu" }).waitFor({ timeout: 60_000 });
  await hostPage.goto(`${SITE}/match/${live}`);
  await hostPage.getByRole("button", { name: "Game menu" }).click();
  await hostPage.getByRole("button", { name: "Delete game" }).click();
  note("confirmation names the player", await hostPage.getByText(`@${player.username}`).count());
  await hostPage.getByRole("button", { name: "Yes, delete game" }).click();
  await hostPage.waitForURL((x) => x.pathname === "/match", { timeout: 30_000 });
  await playerPage.waitForURL((x) => x.pathname === "/match", { timeout: 30_000 });
  note("player moved to Games", new URL(playerPage.url()).pathname);
  note("player saw the toast", await playerPage.getByText("This game was deleted").count());
  note("live game rows left", (await service.from("sets").select("id").eq("id", live)).data.length);

  // 2. The player takes a finished game off their games, then puts it back.
  const done = await gameWithSend(host, player, "Hide check", { end: true });
  await playerPage.goto(`${SITE}/match/summary/${done}`);
  await playerPage.getByRole("button", { name: "Game options" }).click();
  await playerPage.getByRole("button", { name: "Remove from my games" }).click();
  await playerPage.getByRole("button", { name: "Yes, remove it" }).click();
  await playerPage.getByText("Removed from your games").waitFor();
  note("gone from the player's history", !(await history(player.id)).includes(done));
  note("still in the host's history", (await history(host.id)).includes(done));
  await playerPage.getByRole("button", { name: "Game options" }).click();
  await playerPage.getByRole("button", { name: "Put back in my games" }).click();
  await playerPage.getByText("Back in your games").waitFor();
  note("back in the player's history", (await history(player.id)).includes(done));

  // 3. The host deletes the finished game from its summary page.
  await hostPage.goto(`${SITE}/match/summary/${done}`);
  await hostPage.getByRole("button", { name: "Game options" }).click();
  await hostPage.getByRole("button", { name: "Delete game" }).click();
  await hostPage.getByRole("button", { name: "Yes, delete game" }).click();
  await hostPage.waitForURL((x) => x.pathname === "/match", { timeout: 30_000 });
  note("finished game rows left", (await service.from("sets").select("id").eq("id", done)).data.length);
} catch (e) {
  note("FAILED", String(e).slice(0, 400));
} finally {
  await browser?.close().catch(() => {});
  const { data: sets } = users.length ? await service.from("sets").select("id").in("host_id", users) : { data: [] };
  for (const s of sets ?? []) await service.from("sets").delete().eq("id", s.id);
  for (const id of users) await service.auth.admin.deleteUser(id).catch(() => {});
  const { data: left } = users.length ? await service.from("profiles").select("id").in("id", users) : { data: [] };
  note("cleanup", { setsDeleted: (sets ?? []).length, leftoverProfiles: (left ?? []).length });
}
```

- [ ] **Step 2: Run it against the dev server**

Run: `SITE=http://localhost:3000 node delete-and-hide.mjs`
Expected:

```
confirmation names the player: 1
player moved to Games: /match
player saw the toast: 1
live game rows left: 0
gone from the player's history: true
still in the host's history: true
back in the player's history: true
finished game rows left: 0
cleanup: {"setsDeleted":0,"leftoverProfiles":0}
```

- [ ] **Step 3: Tom ships it**

Ask Tom to run:

```
! git push origin feat/match-flow && git push origin feat/match-flow:main
```

Wait for the production deployment, then run `SITE=https://chork.app node delete-and-hide.mjs` and expect the same output.
