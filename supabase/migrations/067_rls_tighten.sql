-- 067: RLS tightening (audit 2026-08-10, Direction B)
--
--   1. crew_members: block repointing a membership row into another crew
--      (the WITH CHECK can't express this — it can't see OLD — so use a
--      BEFORE UPDATE guard trigger).
--   2. route_logs / comments INSERT: require the route to belong to the
--      claimed gym_id (keeps the denormalised gym_id trustworthy).
--   3. activity_events: drop the stale duplicate SELECT policy (bare
--      auth.uid(), left over from migration 007).
--   4. jam_players / jam_summaries: fix two tautological RLS predicates
--      (the 20-player cap counted every jam; the summary read was always
--      false for non-hosts).

-- ── 1. crew_members membership-repoint guard ──────────────────────
create or replace function public.guard_crew_member_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The only legitimate crew_members UPDATE is a recipient accepting an
  -- invite: their own row's status flips pending → active. Freeze the
  -- identity/crew columns and constrain the transition so a member can't
  -- repoint their row into a crew they were never invited to.
  if new.crew_id <> old.crew_id
     or new.user_id <> old.user_id
     or new.invited_by <> old.invited_by then
    raise exception 'crew membership identity is immutable';
  end if;
  if not (new.status = old.status
          or (old.status = 'pending' and new.status = 'active')) then
    raise exception 'invalid crew membership status transition';
  end if;
  return new;
end;
$$;

drop trigger if exists crew_members_guard_update on public.crew_members;
create trigger crew_members_guard_update
  before update on public.crew_members
  for each row execute function public.guard_crew_member_update();

-- ── 2. Trustworthy denormalised gym_id on writes ──────────────────
drop policy "Users can insert own route logs in active sets" on public.route_logs;
create policy "Users can insert own route logs in active sets"
  on public.route_logs for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and is_gym_member(gym_id)
    and exists (
      select 1 from routes r
      join sets s on s.id = r.set_id
      where r.id = route_logs.route_id
        and s.active = true
        and s.gym_id = route_logs.gym_id
    )
  );

drop policy "Gym members can create comments" on public.comments;
create policy "Gym members can create comments"
  on public.comments for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and is_gym_member(gym_id)
    and exists (
      select 1 from routes r
      join sets s on s.id = r.set_id
      where r.id = comments.route_id
        and s.gym_id = comments.gym_id
    )
  );

-- ── 3. Drop the stale duplicate activity_events SELECT policy ─────
drop policy "Activity events are readable by gym members" on public.activity_events;

-- ── 4. Fix tautological jam predicates ────────────────────────────
drop policy "jam_players_insert" on public.jam_players;
create policy "jam_players_insert"
  on public.jam_players for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from jams j where j.id = jam_players.jam_id and j.status = 'live'
    )
    and (
      select count(*) < 20
      from jam_players jp
      where jp.jam_id = jam_players.jam_id and jp.left_at is null
    )
  );

drop policy "jam_summaries_select" on public.jam_summaries;
create policy "jam_summaries_select"
  on public.jam_summaries for select to authenticated
  using (
    host_id = (select auth.uid())
    or exists (
      select 1 from jam_summary_players jsp
      where jsp.jam_summary_id = jam_summaries.id
        and jsp.user_id = (select auth.uid())
    )
  );
