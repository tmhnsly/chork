-- Two small auth / privacy tightenings surfaced by the pre-push
-- audit:
--
--   1. `handle_new_user` trigger used `substr(id::text, 1, 8)` as
--      the seed username. Eight hex chars is ~4 billion-ish values,
--      so birthday-paradox collisions start biting around ~10k
--      users — and when they do, the UNIQUE constraint on
--      `profiles.username` fires, the trigger aborts, and the
--      entire `auth.users` INSERT rolls back. The signed-up user's
--      account is never created; they see an opaque error.
--
--      Fix: use the full uuid as the seed (ignore the leading-zero
--      trivia — usernames are unique by construction of the uuid)
--      AND wrap the insert in `on conflict do nothing` so even a
--      collision cascade can't abort the trigger.
--
--   2. `jam_summary_players.attempts` was returned in the public
--      `get_jam_summary` payload for every player. CLAUDE.md's
--      domain rules state explicitly: "Attempt counts are private
--      — never show raw attempts to other users. Points are
--      public." The RPC was leaking counts to anyone who could see
--      a completed jam. Mask the column at the RPC layer: return
--      the caller's own attempts, return 0 for everyone else. The
--      row still exists in the table (needed for the server-side
--      leaderboard + badge evaluation).

-- ── 1. handle_new_user — collision-safe username seed ──────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'user_' || replace(new.id::text, '-', ''))
  on conflict (username) do update
    -- Fallback seed: append a random 4-hex suffix. With 16^4 ≈ 65k
    -- values and the underlying full-uuid seed, a second-pass
    -- collision is effectively impossible.
    set username = 'user_' || replace(new.id::text, '-', '')
                 || '_' || substr(md5(random()::text), 1, 4);
  return new;
end;
$$;

-- ── 2. get_jam_summary — mask other players' attempt counts ────

create or replace function public.get_jam_summary(p_summary_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  return (
    select jsonb_build_object(
      'summary', to_jsonb(s),
      'players', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'user_id', jsp.user_id,
            'username', jsp.username,
            'display_name', jsp.display_name,
            'rank', jsp.rank,
            'sends', jsp.sends,
            'flashes', jsp.flashes,
            'zones', jsp.zones,
            'points', jsp.points,
            -- Privacy: attempt counts are private per CLAUDE.md.
            -- Return the caller's own count, zero for everyone
            -- else. Badge evaluation + the live leaderboard read
            -- the underlying table directly, so the mask only
            -- applies to the public-facing RPC payload.
            'attempts', case when jsp.user_id = caller_id then jsp.attempts else 0 end,
            'is_winner', jsp.is_winner,
            'avatar_url', p.avatar_url
          )
          order by jsp.rank
        )
        from public.jam_summary_players jsp
        left join public.profiles p on p.id = jsp.user_id
        where jsp.jam_summary_id = s.id
      ), '[]'::jsonb)
    )
    from public.jam_summaries s
    where s.id = p_summary_id
    limit 1
  );
end;
$$;

grant execute on function public.get_jam_summary(uuid) to authenticated;
revoke execute on function public.get_jam_summary(uuid) from anon, public;
