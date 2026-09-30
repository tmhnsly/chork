-- public.set_match_hidden, as it stands.
-- Generated from supabase/migrations/141_delete_and_hide_games.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

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
