-- public.bump_invite_rate_limit, as it stands.
-- Generated from supabase/migrations/021_crews_foundation.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.bump_invite_rate_limit()
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_today   date := current_date;
  v_count   integer;
  v_on_date date;
begin
  if v_uid is null then return false; end if;

  select invites_sent_today, invites_sent_date
    into v_count, v_on_date
    from public.profiles where id = v_uid;

  -- New day — reset counter before applying.
  if v_on_date is distinct from v_today then
    v_count := 0;
  end if;

  if v_count >= 10 then
    return false;
  end if;

  update public.profiles
     set invites_sent_today = v_count + 1,
         invites_sent_date  = v_today
   where id = v_uid;

  return true;
end;
$$;
