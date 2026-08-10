-- 065: Deletion-path integrity (audit 2026-08-10, Direction A)
--
--   1. sync_user_set_stats(): make the DELETE branch update-only so it
--      can't re-insert a stats row against an already-deleted user
--      during an account-delete cascade (removes a latent FK-violation
--      and the O(n) re-insert on bulk deletes). Byte-identical to the
--      migration-063 body except the DELETE branch is split out.
--   2. Temporal CHECKs: forbid ends_at < starts_at on sets / competitions
--      (null-safe — open-ended competitions keep ends_at NULL).
--
-- The crew-owner hand-off half of Direction A lives in app code
-- (deleteAccount, which runs service-role) — no schema change needed.

-- ── 1. Cascade-safe user_set_stats sync ───────────────────────────
create or replace function public.sync_user_set_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_set_id  uuid;
  v_gym_id  uuid;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
    select r.set_id, s.gym_id into v_set_id, v_gym_id
      from public.routes r
      join public.sets s on s.id = r.set_id
      where r.id = old.route_id;
  else
    v_user_id := new.user_id;
    select r.set_id, s.gym_id into v_set_id, v_gym_id
      from public.routes r
      join public.sets s on s.id = r.set_id
      where r.id = new.route_id;
  end if;

  -- Route already gone (cascade race) — nothing to maintain.
  if v_set_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    -- A log was removed. Only ever UPDATE an existing stats row — never
    -- INSERT. During an account-delete cascade the parent profile is
    -- already gone, so an INSERT would violate user_set_stats.user_id's
    -- FK; and the stats row is itself cascade-deleted, so re-creating it
    -- is pure waste. A 0-row match (already gone) is a harmless no-op.
    update public.user_set_stats uss
       set sends      = sub.sends,
           flashes    = sub.flashes,
           zones      = sub.zones,
           points     = sub.points,
           updated_at = now()
      from (
        select
          coalesce(sum(case when rl.completed then 1 else 0 end), 0)::int as sends,
          coalesce(sum(case when rl.completed and rl.attempts = 1 then 1 else 0 end), 0)::int as flashes,
          coalesce(sum(case when rl.zone then 1 else 0 end), 0)::int as zones,
          coalesce(sum(public.compute_points(rl.attempts, rl.completed, rl.zone)), 0)::int as points
        from public.route_logs rl
        join public.routes r on r.id = rl.route_id
        where rl.user_id = v_user_id and r.set_id = v_set_id
      ) sub
     where uss.user_id = v_user_id and uss.set_id = v_set_id;
  else
    -- A log was added or changed — upsert the recomputed aggregate.
    insert into public.user_set_stats (user_id, set_id, gym_id, sends, flashes, zones, points, updated_at)
    select
      v_user_id, v_set_id, v_gym_id,
      coalesce(sum(case when rl.completed then 1 else 0 end), 0)::int,
      coalesce(sum(case when rl.completed and rl.attempts = 1 then 1 else 0 end), 0)::int,
      coalesce(sum(case when rl.zone then 1 else 0 end), 0)::int,
      coalesce(sum(public.compute_points(rl.attempts, rl.completed, rl.zone)), 0)::int,
      now()
    from public.route_logs rl
    join public.routes r on r.id = rl.route_id
    where rl.user_id = v_user_id and r.set_id = v_set_id
    on conflict (user_id, set_id) do update
      set sends      = excluded.sends,
          flashes    = excluded.flashes,
          zones      = excluded.zones,
          points     = excluded.points,
          updated_at = now();
  end if;

  -- Prune an emptied row (user tapped then undid) so the table doesn't
  -- accumulate all-zero rows. Safe on DELETE — deleting mid-cascade is
  -- fine, and a 0-row match is a no-op.
  delete from public.user_set_stats uss
   where uss.user_id = v_user_id
     and uss.set_id  = v_set_id
     and uss.sends = 0 and uss.flashes = 0 and uss.zones = 0 and uss.points = 0
     and not exists (
       select 1 from public.route_logs rl2
       join public.routes r2 on r2.id = rl2.route_id
       where rl2.user_id = v_user_id and r2.set_id = v_set_id
     );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- ── 2. Temporal integrity ─────────────────────────────────────────
alter table public.sets
  add constraint sets_ends_after_starts
  check (ends_at is null or starts_at is null or ends_at >= starts_at);
alter table public.competitions
  add constraint competitions_ends_after_starts
  check (ends_at is null or starts_at is null or ends_at >= starts_at);
