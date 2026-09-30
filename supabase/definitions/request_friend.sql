-- public.request_friend, as it stands.
-- Generated from supabase/migrations/108_remove_crew.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.request_friend(p_user_id uuid)
returns public.friends
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  existing public.friends;
  result public.friends;
  target record;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_user_id is null or p_user_id = caller_id then
    raise exception 'Pick someone else' using errcode = '22023';
  end if;

  select id, allow_friend_requests into target
  from public.profiles where id = p_user_id;

  if target.id is null or not coalesce(target.allow_friend_requests, true) then
    raise exception 'Climber not found' using errcode = 'P0002';
  end if;

  select * into existing
  from public.friends f
  where least(f.requester_id, f.addressee_id) = least(caller_id, p_user_id)
    and greatest(f.requester_id, f.addressee_id) = greatest(caller_id, p_user_id);

  if found then
    if existing.status = 'active' then
      return existing;
    end if;

    if existing.status = 'pending' then
      -- They asked first. Treat this as the acceptance it plainly is.
      if existing.addressee_id = caller_id then
        update public.friends
           set status = 'active', responded_at = now()
         where id = existing.id
        returning * into result;
        return result;
      end if;
      return existing;
    end if;

    -- declined
    if existing.requester_id = caller_id then
      -- You are the one who was turned down. Nothing happens, and the
      -- return value says nothing about why.
      return existing;
    end if;

    update public.friends
       set requester_id = caller_id,
           addressee_id = p_user_id,
           status = 'pending',
           created_at = now(),
           responded_at = null
     where id = existing.id
    returning * into result;
    return result;
  end if;

  insert into public.friends (requester_id, addressee_id)
  values (caller_id, p_user_id)
  returning * into result;

  return result;
end;
$$;
