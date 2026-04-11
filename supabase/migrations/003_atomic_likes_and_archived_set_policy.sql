-- 003: Atomic like counter + archived set protection
--
-- 1. RPC function for atomic comment like increment/decrement
--    (fixes race condition in read-then-write pattern)
-- 2. RLS policy preventing inserts into archived (inactive) sets

-- ────────────────────────────────────────────────────────────────
-- Atomic like counter
-- ────────────────────────────────────────────────────────────────

create or replace function increment_comment_likes(p_comment_id uuid, p_delta integer)
returns integer
language sql volatile security definer
as $$
  update comments
  set likes = greatest(0, likes + p_delta)
  where id = p_comment_id
  returning likes;
$$;

-- ────────────────────────────────────────────────────────────────
-- Prevent logging into archived sets
-- ────────────────────────────────────────────────────────────────

-- Drop the existing insert policy so we can replace it with a stricter one
drop policy if exists "Users can insert own route logs" on route_logs;

create policy "Users can insert own route logs in active sets"
  on route_logs for insert to authenticated
  with check (
    user_id = auth.uid()
    and is_gym_member(gym_id)
    and exists (
      select 1 from routes r
      join sets s on s.id = r.set_id
      where r.id = route_id
        and s.active = true
    )
  );
