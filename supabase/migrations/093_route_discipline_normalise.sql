-- ────────────────────────────────────────────────────────────────
-- "Same as the Set" is stored as NULL, on every write path
-- ────────────────────────────────────────────────────────────────
--
-- `routes.discipline` is an override: NULL means "inherit the Set's",
-- and that is what lets a gym admin change a Set's discipline and
-- have every route that never disagreed follow it.
--
-- Migration 092 enforced that in `add_match_route` — a route created
-- with the Set's own discipline is normalised back to NULL. But
-- editing a route doesn't go through an RPC: it is a direct UPDATE
-- under `set_routes_update_by_player`, deliberately, because RLS
-- already expresses exactly who may do it. So the same rule had two
-- possible homes and only one of them had it, which would have meant
-- adding a route as "Sport" in a Sport Match inherited correctly,
-- while editing it to "Sport" pinned it forever.
--
-- This is a property of the column, not of a code path, so it belongs
-- here — the same reasoning that put `route_logs.set_id` in a trigger
-- (migration 081) rather than trusting every caller.

create or replace function public.routes_normalise_discipline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set_discipline text;
begin
  if new.discipline is null then
    return new;
  end if;

  select discipline into v_set_discipline
    from public.sets where id = new.set_id;

  -- Agreeing with the Set is not an override.
  if new.discipline = v_set_discipline then
    new.discipline := null;
  end if;

  return new;
end;
$$;

revoke execute on function public.routes_normalise_discipline() from anon, authenticated, public;

drop trigger if exists routes_normalise_discipline_trg on public.routes;
create trigger routes_normalise_discipline_trg
  before insert or update of discipline, set_id on public.routes
  for each row execute function public.routes_normalise_discipline();

-- `add_match_route` keeps its own `case when … then null` for the same
-- reason a belt goes with braces: it is the documented behaviour of
-- that RPC's argument, and a reader of the function shouldn't have to
-- know a trigger exists to understand what it stores. The two agree,
-- and the trigger is what makes it true for the edit path as well.
