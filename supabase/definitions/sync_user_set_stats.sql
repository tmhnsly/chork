-- public.sync_user_set_stats, as it stands.
-- Generated from supabase/migrations/095_guest_players.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

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
  else
    v_user_id := new.user_id;
  end if;

  -- Guest log: no account, so nothing to aggregate. Bail before
  -- touching a table keyed on user_id.
  if v_user_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    select r.set_id, s.gym_id into v_set_id, v_gym_id
      from public.routes r
      join public.sets s on s.id = r.set_id
      where r.id = old.route_id;
  else
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

  delete from public.user_set_stats
   where user_id = v_user_id and set_id = v_set_id
     and sends = 0 and flashes = 0 and zones = 0 and points = 0;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
