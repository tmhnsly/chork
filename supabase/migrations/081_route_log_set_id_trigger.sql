-- ────────────────────────────────────────────────────────────────
-- route_logs.set_id is derived, not supplied
-- ────────────────────────────────────────────────────────────────
--
-- Migration 080 denormalised `set_id` onto `route_logs` so the Match
-- access branch in RLS is a single indexed check rather than a join
-- back through `routes` — the same trick migration 002 used for
-- `gym_id`.
--
-- A denormalised column is a second copy of a fact, and second copies
-- drift. Migration 073 already tells the story for `gym_id`: the
-- insert policy checked membership and liveness but never that the
-- route actually belonged to the gym named, so a hand-crafted request
-- could land a log from gym B's wall on gym A's board.
--
-- Rather than re-run that lesson, `set_id` is never trusted from the
-- client at all: this trigger derives it from the route on every
-- insert and on any update that moves the log to a different route.
-- A caller may omit it, and a caller that supplies the WRONG one has
-- it corrected rather than honoured.

create or replace function public.route_logs_derive_set_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select r.set_id into new.set_id
    from public.routes r
   where r.id = new.route_id;

  if new.set_id is null then
    -- The FK on route_id makes this unreachable; failing loudly beats
    -- a NOT NULL violation whose message doesn't say why.
    raise exception 'route % has no set', new.route_id;
  end if;

  return new;
end;
$$;

drop trigger if exists route_logs_set_id_trg on public.route_logs;
create trigger route_logs_set_id_trg
  before insert or update of route_id on public.route_logs
  for each row execute function public.route_logs_derive_set_id();

revoke execute on function public.route_logs_derive_set_id() from anon, authenticated, public;
