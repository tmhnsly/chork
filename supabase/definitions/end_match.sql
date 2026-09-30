-- public.end_match, as it stands.
-- Generated from supabase/migrations/103_write_rpcs_use_the_write_gate.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.end_match(p_set_id uuid)
returns public.sets
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  result public.sets;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.sets
     set status = 'archived',
         ends_at = now()
   where id = p_set_id
     and owner_kind = 'climber'
     -- Ending is the one action that reaches other people's screens.
     and host_id = caller_id
     -- Idempotent, and the guard against a double-tap: the second
     -- update matches nothing rather than re-stamping `ends_at`.
     and status = 'live'
  returning * into result;

  if result.id is null then
    select * into result from public.sets
     where id = p_set_id and owner_kind = 'climber';

    if result.id is null then
      raise exception 'Match not found' using errcode = 'P0002';
    end if;

    -- Still live means the update was refused, not a no-op — i.e.
    -- someone who isn't the host. Already archived is a success, so a
    -- host whose first tap was slow to answer lands on the summary
    -- rather than an error.
    if result.status = 'live' then
      raise exception 'Only the host can end this match'
        using errcode = '42501';
    end if;
  end if;

  return result;
end;
$$;
