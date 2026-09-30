-- public.get_friends_leaderboard, as it stands.
-- Generated from supabase/migrations/107_friends_leaderboard.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_friends_leaderboard(
  p_set_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  username text,
  name text,
  avatar_url text,
  rank bigint,
  sends integer,
  flashes integer,
  zones integer,
  points integer,
  is_self boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as id
  ),
  roster as (
    -- You, always.
    select id as user_id from me where id is not null
    union
    -- Everyone you're linked to. `union` not `union all` — the
    -- self-row can't duplicate, but saying so costs nothing and a
    -- doubled row would rank you twice.
    select case
             when f.requester_id = (select id from me) then f.addressee_id
             else f.requester_id
           end
      from public.friends f, me
     where f.status = 'active'
       and me.id in (f.requester_id, f.addressee_id)
  ),
  scored as (
    select
      r.user_id,
      coalesce(uss.sends, 0)   as sends,
      coalesce(uss.flashes, 0) as flashes,
      coalesce(uss.zones, 0)   as zones,
      coalesce(uss.points, 0)  as points
    from roster r
    left join public.user_set_stats uss
      on uss.user_id = r.user_id
     and uss.set_id  = p_set_id
  ),
  ranked as (
    select
      s.*,
      -- Nobody who hasn't scored gets a number. They still appear —
      -- a friend who turned up and hasn't sent anything yet is more
      -- interesting than a gap — but ranking them 4th of 4 reads as
      -- a placing rather than a blank.
      case when s.points > 0
        then dense_rank() over (
          partition by (s.points > 0)
          order by s.points desc, s.flashes desc, s.sends desc
        )
        else null
      end as rank
    from scored s
  )
  select
    r.user_id,
    p.username,
    p.name,
    p.avatar_url,
    r.rank,
    r.sends,
    r.flashes,
    r.zones,
    r.points,
    (r.user_id = (select id from me)) as is_self
  from ranked r
  join public.profiles p on p.id = r.user_id
  order by (r.rank is null), r.rank, p.username
  limit least(coalesce(p_limit, 50), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
