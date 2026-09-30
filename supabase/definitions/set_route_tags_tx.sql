-- public.set_route_tags_tx, as it stands.
-- Generated from supabase/migrations/060_set_route_tags_tx.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

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
