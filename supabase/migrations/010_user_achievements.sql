-- 010: User achievements — persistent earned_at for badges
--
-- Badge/achievement definitions live in code (src/lib/badges.ts) and are
-- evaluated from existing stats. This table only records WHEN a user first
-- earned each badge, so progress/locked state stays derived live.

create table public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id text not null,
  earned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, badge_id)
);

create index user_achievements_user_id_idx on public.user_achievements (user_id);

alter table public.user_achievements enable row level security;

-- Profiles are public in this app; achievements follow the same visibility.
create policy "user_achievements readable by authenticated"
  on public.user_achievements for select
  to authenticated
  using (true);

-- No insert/update/delete policies — writes are performed via the service role
-- inside the post-send evaluation path (src/lib/achievements/evaluate.ts).
