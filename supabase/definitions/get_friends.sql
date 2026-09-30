-- public.get_friends, as it stands.
-- Generated from supabase/migrations/106_mates_to_friends.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_friends()
returns table (
  friend_id uuid,
  user_id uuid,
  username text,
  name text,
  avatar_url text,
  status text,
  direction text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id,
    other.id,
    other.username,
    other.name,
    other.avatar_url,
    m.status,
    case
      when m.status = 'active' then 'active'
      when m.addressee_id = (select auth.uid()) then 'incoming'
      else 'outgoing'
    end,
    m.created_at
  from public.friends m
  join public.profiles other
    on other.id = case
      when m.requester_id = (select auth.uid()) then m.addressee_id
      else m.requester_id
    end
  where (select auth.uid()) is not null
    and (m.requester_id = (select auth.uid()) or m.addressee_id = (select auth.uid()))
    and m.status <> 'declined'
  -- Decisions first, then the people you already climb with.
  order by (m.status = 'active'), other.username;
$$;
