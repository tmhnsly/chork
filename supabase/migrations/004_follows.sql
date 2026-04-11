-- 004: Follow system
--
-- 1. follows table with unique constraint and self-follow prevention
-- 2. Denormalized follower/following counts on profiles
-- 3. Trigger to maintain counts atomically
-- 4. RLS policies

-- ────────────────────────────────────────────────────────────────
-- Denormalized counts on profiles
-- ────────────────────────────────────────────────────────────────

alter table profiles
  add column follower_count  integer not null default 0,
  add column following_count integer not null default 0;

-- ────────────────────────────────────────────────────────────────
-- Follows table
-- ────────────────────────────────────────────────────────────────

create table follows (
  id           uuid primary key default gen_random_uuid(),
  follower_id  uuid not null references profiles(id) on delete cascade,
  following_id uuid not null references profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (follower_id, following_id),
  check (follower_id != following_id)
);

create index follows_follower_idx on follows (follower_id);
create index follows_following_idx on follows (following_id);

-- ────────────────────────────────────────────────────────────────
-- Trigger: maintain denormalized counts
-- ────────────────────────────────────────────────────────────────

create or replace function update_follow_counts()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update profiles set following_count = following_count + 1 where id = new.follower_id;
    update profiles set follower_count  = follower_count  + 1 where id = new.following_id;
    return new;
  elsif tg_op = 'DELETE' then
    update profiles set following_count = greatest(0, following_count - 1) where id = old.follower_id;
    update profiles set follower_count  = greatest(0, follower_count  - 1) where id = old.following_id;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer;

create trigger follows_count_sync
  after insert or delete on follows
  for each row execute function update_follow_counts();

-- ────────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────────

alter table follows enable row level security;

-- Anyone authenticated can see who follows whom
create policy "Authenticated users can read follows"
  on follows for select
  to authenticated
  using (true);

-- Users can only create follows where they are the follower
create policy "Users can follow others"
  on follows for insert
  to authenticated
  with check (follower_id = auth.uid());

-- Users can only delete their own follows
create policy "Users can unfollow"
  on follows for delete
  to authenticated
  using (follower_id = auth.uid());
