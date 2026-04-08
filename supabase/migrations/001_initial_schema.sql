-- Chork: Initial Supabase schema
-- Multi-gym bouldering competition tracker

-- ────────────────────────────────────────────────────────────────
-- Utility: auto-update updated_at on row modification
-- ────────────────────────────────────────────────────────────────

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ────────────────────────────────────────────────────────────────
-- Gyms
-- ────────────────────────────────────────────────────────────────

create table gyms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique not null,
  city       text,
  country    text,
  logo_url   text,
  is_listed  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger gyms_updated_at before update on gyms
  for each row execute function update_updated_at();

create index gyms_is_listed on gyms (is_listed) where is_listed = true;

-- ────────────────────────────────────────────────────────────────
-- Profiles (extends auth.users)
-- ────────────────────────────────────────────────────────────────

create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  username       text unique not null check (length(username) >= 3 and username ~ '^[a-z0-9_]+$'),
  name           text not null default '',
  avatar_url     text not null default '',
  onboarded      boolean not null default false,
  active_gym_id  uuid references gyms(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger profiles_updated_at before update on profiles
  for each row execute function update_updated_at();

-- Auto-create a profile when a user signs up
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'user_' || substr(new.id::text, 1, 8));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ────────────────────────────────────────────────────────────────
-- Gym memberships (user ↔ gym with role)
-- ────────────────────────────────────────────────────────────────

create table gym_memberships (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  gym_id     uuid not null references gyms(id) on delete cascade,
  role       text not null default 'climber'
             check (role in ('climber', 'setter', 'admin', 'owner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, gym_id)
);

create trigger gym_memberships_updated_at before update on gym_memberships
  for each row execute function update_updated_at();

create index gym_memberships_user on gym_memberships (user_id);
create index gym_memberships_gym  on gym_memberships (gym_id);

-- ────────────────────────────────────────────────────────────────
-- Sets (gym-scoped competition periods)
-- ────────────────────────────────────────────────────────────────

create table sets (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  active     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger sets_updated_at before update on sets
  for each row execute function update_updated_at();

create index sets_gym_active on sets (gym_id, active);

-- ────────────────────────────────────────────────────────────────
-- Routes
-- ────────────────────────────────────────────────────────────────

create table routes (
  id         uuid primary key default gen_random_uuid(),
  set_id     uuid not null references sets(id) on delete cascade,
  number     integer not null,
  has_zone   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (set_id, number)
);

create trigger routes_updated_at before update on routes
  for each row execute function update_updated_at();

-- ────────────────────────────────────────────────────────────────
-- Route logs (one per user per route, upserted in place)
-- ────────────────────────────────────────────────────────────────

create table route_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  route_id     uuid not null references routes(id) on delete cascade,
  attempts     integer not null default 0,
  completed    boolean not null default false,
  completed_at timestamptz,
  grade_vote   smallint check (grade_vote is null or (grade_vote >= 0 and grade_vote <= 10)),
  zone         boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, route_id)
);

create trigger route_logs_updated_at before update on route_logs
  for each row execute function update_updated_at();

create index route_logs_route_completed on route_logs (route_id, completed);

-- ────────────────────────────────────────────────────────────────
-- Comments (beta spray, threaded)
-- ────────────────────────────────────────────────────────────────

create table comments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  route_id   uuid not null references routes(id) on delete cascade,
  body       text not null check (length(body) between 1 and 500),
  likes      integer not null default 0,
  parent_id  uuid references comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger comments_updated_at before update on comments
  for each row execute function update_updated_at();

create index comments_route_likes on comments (route_id, likes desc, created_at desc);

-- ────────────────────────────────────────────────────────────────
-- Comment likes
-- ────────────────────────────────────────────────────────────────

create table comment_likes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  comment_id uuid not null references comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, comment_id)
);

-- ────────────────────────────────────────────────────────────────
-- Activity events
-- ────────────────────────────────────────────────────────────────

create table activity_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  type       text not null check (type in ('completed', 'flashed', 'beta_spray', 'reply')),
  route_id   uuid references routes(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index activity_events_user_created on activity_events (user_id, created_at desc);

-- ────────────────────────────────────────────────────────────────
-- RPC functions (replace PocketBase view collections)
-- ────────────────────────────────────────────────────────────────

create or replace function get_route_grade(p_route_id uuid)
returns table (route_id uuid, community_grade integer, vote_count integer)
language sql stable security definer
as $$
  select
    rl.route_id,
    round(avg(rl.grade_vote))::integer as community_grade,
    count(rl.grade_vote)::integer as vote_count
  from route_logs rl
  where rl.route_id = p_route_id
    and rl.completed = true
    and rl.grade_vote is not null
  group by rl.route_id;
$$;

create or replace function get_user_set_stats(p_user_id uuid, p_gym_id uuid)
returns table (set_id uuid, completions integer, flashes integer, points integer)
language sql stable security definer
as $$
  select
    r.set_id,
    sum(case when rl.completed then 1 else 0 end)::integer as completions,
    sum(case when rl.completed and rl.attempts = 1 then 1 else 0 end)::integer as flashes,
    sum(
      (case
        when rl.completed and rl.attempts = 1 then 4
        when rl.completed and rl.attempts = 2 then 3
        when rl.completed and rl.attempts = 3 then 2
        when rl.completed then 1
        else 0
      end) + (case when rl.zone then 1 else 0 end)
    )::integer as points
  from route_logs rl
  join routes r on r.id = rl.route_id
  join sets s on s.id = r.set_id
  where rl.user_id = p_user_id
    and s.gym_id = p_gym_id
  group by r.set_id;
$$;

-- ────────────────────────────────────────────────────────────────
-- Row Level Security
-- ────────────────────────────────────────────────────────────────

-- Helper: check if the authenticated user is a member of a gym
create or replace function is_gym_member(p_gym_id uuid)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1 from gym_memberships
    where user_id = auth.uid() and gym_id = p_gym_id
  );
$$;

-- Helper: get the gym_id for a route (via set)
create or replace function gym_id_for_route(p_route_id uuid)
returns uuid
language sql stable security definer
as $$
  select s.gym_id
  from routes r
  join sets s on s.id = r.set_id
  where r.id = p_route_id;
$$;

-- ── Profiles ──

alter table profiles enable row level security;

create policy "Anyone authenticated can read profiles"
  on profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ── Gyms ──

alter table gyms enable row level security;

create policy "Listed gyms are readable by anyone authenticated"
  on gyms for select
  to authenticated
  using (is_listed = true or is_gym_member(id));

-- ── Gym memberships ──

alter table gym_memberships enable row level security;

create policy "Users can read their own memberships"
  on gym_memberships for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can join listed gyms"
  on gym_memberships for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from gyms where id = gym_id and is_listed = true)
  );

create policy "Users can leave gyms"
  on gym_memberships for delete
  to authenticated
  using (user_id = auth.uid());

-- ── Sets ──

alter table sets enable row level security;

create policy "Gym members can read sets"
  on sets for select
  to authenticated
  using (is_gym_member(gym_id));

-- ── Routes ──

alter table routes enable row level security;

create policy "Gym members can read routes"
  on routes for select
  to authenticated
  using (
    exists (
      select 1 from sets s
      where s.id = set_id and is_gym_member(s.gym_id)
    )
  );

-- ── Route logs ──

alter table route_logs enable row level security;

create policy "Gym members can read route logs"
  on route_logs for select
  to authenticated
  using (is_gym_member(gym_id_for_route(route_id)));

create policy "Gym members can create route logs"
  on route_logs for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and is_gym_member(gym_id_for_route(route_id))
  );

create policy "Users can update their own route logs"
  on route_logs for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete their own route logs"
  on route_logs for delete
  to authenticated
  using (user_id = auth.uid());

-- ── Comments ──

alter table comments enable row level security;

create policy "Gym members can read comments"
  on comments for select
  to authenticated
  using (is_gym_member(gym_id_for_route(route_id)));

create policy "Gym members can create comments"
  on comments for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and is_gym_member(gym_id_for_route(route_id))
  );

create policy "Users can update their own comments"
  on comments for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete their own comments"
  on comments for delete
  to authenticated
  using (user_id = auth.uid());

-- ── Comment likes ──

alter table comment_likes enable row level security;

create policy "Gym members can read comment likes"
  on comment_likes for select
  to authenticated
  using (
    is_gym_member(gym_id_for_route(
      (select route_id from comments where id = comment_id)
    ))
  );

create policy "Gym members can create comment likes"
  on comment_likes for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and is_gym_member(gym_id_for_route(
      (select route_id from comments where id = comment_id)
    ))
  );

create policy "Users can delete their own likes"
  on comment_likes for delete
  to authenticated
  using (user_id = auth.uid());

-- ── Activity events ──

alter table activity_events enable row level security;

create policy "Gym members can read activity events"
  on activity_events for select
  to authenticated
  using (
    route_id is null
    or is_gym_member(gym_id_for_route(route_id))
  );

create policy "Gym members can create activity events"
  on activity_events for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (route_id is null or is_gym_member(gym_id_for_route(route_id)))
  );

-- Delete handled by service role only (for undo completion)

-- ────────────────────────────────────────────────────────────────
-- Seed data
-- ────────────────────────────────────────────────────────────────

insert into gyms (name, slug, city, country, is_listed)
values ('Yonder', 'yonder', 'London', 'GB', true);
