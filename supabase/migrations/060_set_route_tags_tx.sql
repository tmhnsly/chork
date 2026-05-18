-- set_route_tags_tx — atomic replace of a route's tag set
--
-- The previous app-side flow (src/lib/data/admin-mutations.ts:setRouteTags)
-- ran three sequential round-trips with no transaction:
--   1. SELECT current tag_ids from route_tags_map WHERE route_id = ?
--   2. DELETE the ones being removed
--   3. INSERT the ones being added
--
-- If step 2 succeeded and step 3 failed (e.g. FK violation on a
-- malformed tag_id, or a concurrent admin tag-rename that hit the
-- FK), the route was left with a SUBSET of its previous tags and
-- NONE of the new ones — silent partial write the admin couldn't
-- see without re-opening the edit sheet.
--
-- This RPC moves the whole operation into one PL/pgSQL transaction.
-- Either every change commits or nothing does. We also lock the
-- route row FOR UPDATE so two admins editing the same route's tags
-- concurrently serialise rather than interleave deletes/inserts.
--
-- Auth: defence-in-depth via is_admin_of_route. The app caller
-- already gates via requireAdminOfRoute before invoking the RPC;
-- this double-check makes the RPC safe to expose to authenticated
-- (RLS-equivalent enforcement at the DB layer even if the app gate
-- ever regresses).

create or replace function public.set_route_tags_tx(
  p_route_id uuid,
  p_tag_ids  uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_admin_of_route(p_route_id) then
    raise exception 'Not authorised for this route' using errcode = '42501';
  end if;

  -- Lock the route row so a concurrent set_route_tags_tx on the same
  -- route serialises. routes is the natural lock target — route_tags_map
  -- has no single row that gates the operation.
  perform 1 from public.routes where id = p_route_id for update;

  -- Replace-in-place: drop rows that aren't in the new set, then
  -- insert rows that aren't in the old set. ON CONFLICT DO NOTHING
  -- handles the no-op case where a tag is in both old and new without
  -- the caller needing to compute the diff.
  delete from public.route_tags_map
   where route_id = p_route_id
     and (p_tag_ids is null or not (tag_id = any(p_tag_ids)));

  if p_tag_ids is not null and array_length(p_tag_ids, 1) > 0 then
    insert into public.route_tags_map (route_id, tag_id)
    select p_route_id, t
      from unnest(p_tag_ids) as t
    on conflict (route_id, tag_id) do nothing;
  end if;
end;
$$;

grant execute on function public.set_route_tags_tx(uuid, uuid[]) to authenticated;
revoke execute on function public.set_route_tags_tx(uuid, uuid[]) from anon, public;
