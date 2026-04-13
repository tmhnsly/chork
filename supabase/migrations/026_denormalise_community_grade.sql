-- ─────────────────────────────────────────────────────────────────
-- Migration 026 — denormalise community grade onto `routes`
--
-- Before: `get_route_grade(route_id)` RPC aggregates route_logs on
-- every call (averaging grade_vote, counting votes). Each route-log
-- sheet open fires one. At scale that's hundreds of ops/sec during
-- a busy session and the fetch round-trip is visible to the user.
--
-- After: `routes.community_grade` + `routes.grade_vote_count` are
-- maintained by a trigger on `route_logs` grade_vote changes. The
-- RouteLogSheet already has the route row in hand from its parent,
-- so the value is available with zero extra network work.
-- ─────────────────────────────────────────────────────────────────

-- 1. Columns ----------------------------------------------------
alter table public.routes
  add column if not exists community_grade smallint,
  add column if not exists grade_vote_count integer not null default 0;

-- 2. Helper: recompute a single route's grade ------------------
create or replace function public.recompute_route_grade(p_route_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.routes r
     set community_grade = sub.community_grade,
         grade_vote_count = sub.vote_count
    from (
      select round(avg(rl.grade_vote))::smallint as community_grade,
             count(rl.grade_vote)::integer       as vote_count
        from public.route_logs rl
       where rl.route_id = p_route_id
         and rl.completed = true
         and rl.grade_vote is not null
    ) as sub
   where r.id = p_route_id;
end;
$$;

-- 3. Trigger: fire whenever grade_vote changes ------------------
create or replace function public.sync_route_grade_on_log()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  -- Only recompute when the vote or completion state actually moved
  -- — skips cost on every attempts++ which doesn't touch the grade.
  if (tg_op = 'INSERT') then
    if new.grade_vote is not null and new.completed then
      perform public.recompute_route_grade(new.route_id);
    end if;
    return new;
  elsif (tg_op = 'UPDATE') then
    if new.grade_vote is distinct from old.grade_vote
       or new.completed is distinct from old.completed then
      perform public.recompute_route_grade(new.route_id);
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    if old.grade_vote is not null and old.completed then
      perform public.recompute_route_grade(old.route_id);
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists route_logs_sync_route_grade on public.route_logs;
create trigger route_logs_sync_route_grade
  after insert or update or delete on public.route_logs
  for each row execute function public.sync_route_grade_on_log();

-- 4. Backfill existing data ------------------------------------
update public.routes r
   set community_grade = sub.community_grade,
       grade_vote_count = sub.vote_count
  from (
    select rl.route_id,
           round(avg(rl.grade_vote))::smallint as community_grade,
           count(rl.grade_vote)::integer       as vote_count
      from public.route_logs rl
     where rl.completed = true
       and rl.grade_vote is not null
     group by rl.route_id
  ) as sub
 where r.id = sub.route_id;
