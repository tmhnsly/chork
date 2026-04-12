-- 014: Admin platform foundation
--
-- Schema, RLS and helpers for the upcoming admin dashboard. Applies the
-- hardened RLS patterns from 012:
--   • (select auth.uid()) everywhere
--   • security-definer helpers for role checks (no recursive RLS)
--   • one permissive policy per table per operation per role
--   • every FK and every RLS-filter column indexed
--
-- Structure:
--   1) All new table DDL + indexes + enable RLS (no policies yet).
--      Supabase has check_function_bodies = on so helpers that
--      reference these tables can't be declared until they exist.
--   2) Helper functions (replace the 012 stubs; add new ones).
--   3) All policies — every policy that references a helper is
--      declared after the helper exists.
--   4) Mutations to existing tables (sets, routes, gyms, route_logs).
--   5) Triggers + updated_at attachments.
--   6) Seed data (route_tags catalogue).

-- ────────────────────────────────────────────────────────────────
-- 1) New tables — structure + indexes + RLS enable (no policies)
-- ────────────────────────────────────────────────────────────────

-- gym_admins ─────────────────────────────────────────────────────
-- Distinct from gym_memberships: a user may hold both a climber
-- membership AND an admin role at the same gym.
create table public.gym_admins (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(id)     on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'admin'
             check (role in ('admin', 'owner')),
  created_at timestamptz not null default now(),
  unique (gym_id, user_id)
);
create index gym_admins_gym_id_idx  on public.gym_admins (gym_id);
create index gym_admins_user_id_idx on public.gym_admins (user_id);
alter table public.gym_admins enable row level security;

-- gym_invites ────────────────────────────────────────────────────
create table public.gym_invites (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id)     on delete cascade,
  email       text not null check (length(email) between 3 and 254),
  token       text not null unique,
  role        text not null default 'admin'
              check (role in ('admin', 'owner')),
  invited_by  uuid not null references public.profiles(id) on delete cascade,
  invited_at  timestamptz not null default now(),
  accepted_at timestamptz,
  expires_at  timestamptz not null default (now() + interval '14 days'),
  unique (gym_id, email)
);
create index gym_invites_gym_id_idx     on public.gym_invites (gym_id);
create index gym_invites_invited_by_idx on public.gym_invites (invited_by);
create index gym_invites_email_idx      on public.gym_invites (email);
alter table public.gym_invites enable row level security;

-- competitions ───────────────────────────────────────────────────
create table public.competitions (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(name) between 1 and 120),
  description   text,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  status        text not null default 'draft'
                check (status in ('draft', 'live', 'archived')),
  organiser_id  uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index competitions_organiser_idx on public.competitions (organiser_id);
create index competitions_status_idx    on public.competitions (status);
alter table public.competitions enable row level security;

-- competition_gyms ───────────────────────────────────────────────
create table public.competition_gyms (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  gym_id         uuid not null references public.gyms(id)         on delete cascade,
  added_at       timestamptz not null default now(),
  primary key (competition_id, gym_id)
);
create index competition_gyms_gym_idx         on public.competition_gyms (gym_id);
create index competition_gyms_competition_idx on public.competition_gyms (competition_id);
alter table public.competition_gyms enable row level security;

-- competition_categories ─────────────────────────────────────────
create table public.competition_categories (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  name           text not null check (length(name) between 1 and 60),
  display_order  smallint not null default 0,
  created_at     timestamptz not null default now(),
  unique (competition_id, name)
);
create index competition_categories_competition_idx
  on public.competition_categories (competition_id);
alter table public.competition_categories enable row level security;

-- competition_participants ───────────────────────────────────────
create table public.competition_participants (
  competition_id uuid not null references public.competitions(id)          on delete cascade,
  user_id        uuid not null references public.profiles(id)              on delete cascade,
  category_id    uuid          references public.competition_categories(id) on delete set null,
  joined_at      timestamptz not null default now(),
  primary key (competition_id, user_id)
);
create index competition_participants_user_idx
  on public.competition_participants (user_id);
create index competition_participants_category_idx
  on public.competition_participants (category_id)
  where category_id is not null;
alter table public.competition_participants enable row level security;

-- route_tags (catalogue) ─────────────────────────────────────────
create table public.route_tags (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  created_at timestamptz not null default now()
);
alter table public.route_tags enable row level security;

-- route_tags_map (route ↔ tag) ───────────────────────────────────
create table public.route_tags_map (
  route_id uuid not null references public.routes(id)     on delete cascade,
  tag_id   uuid not null references public.route_tags(id) on delete cascade,
  primary key (route_id, tag_id)
);
create index route_tags_map_tag_idx on public.route_tags_map (tag_id);
alter table public.route_tags_map enable row level security;

-- push_subscriptions ─────────────────────────────────────────────
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;

-- ────────────────────────────────────────────────────────────────
-- 2) Helper functions — now that every referenced table exists
-- ────────────────────────────────────────────────────────────────

-- is_gym_admin — replaces 012 stub. Reads the new gym_admins table.
create or replace function public.is_gym_admin(p_gym_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gym_admins
    where gym_id = p_gym_id
      and user_id = (select auth.uid())
  );
$$;

-- is_gym_owner — replaces 012 stub.
create or replace function public.is_gym_owner(p_gym_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gym_admins
    where gym_id = p_gym_id
      and user_id = (select auth.uid())
      and role = 'owner'
  );
$$;

-- Caller organises the given competition.
create or replace function public.is_competition_organiser(p_competition_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.competitions
    where id = p_competition_id
      and organiser_id = (select auth.uid())
  );
$$;

-- Caller is an admin of the gym that owns the given route. Single
-- security-definer hop keeps RLS for routes/sets/gym_admins from
-- recursing when route tagging policies evaluate.
create or replace function public.is_admin_of_route(p_route_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.routes r
      join public.sets   s on s.id = r.set_id
      join public.gym_admins ga on ga.gym_id = s.gym_id
     where r.id = p_route_id
       and ga.user_id = (select auth.uid())
  );
$$;

grant execute on function public.is_gym_admin(uuid)              to authenticated;
grant execute on function public.is_gym_owner(uuid)              to authenticated;
grant execute on function public.is_competition_organiser(uuid)  to authenticated;
grant execute on function public.is_admin_of_route(uuid)         to authenticated;
revoke execute on function public.is_gym_admin(uuid)              from anon, public;
revoke execute on function public.is_gym_owner(uuid)              from anon, public;
revoke execute on function public.is_competition_organiser(uuid)  from anon, public;
revoke execute on function public.is_admin_of_route(uuid)         from anon, public;

-- ────────────────────────────────────────────────────────────────
-- 3) Policies (all helpers now exist)
-- ────────────────────────────────────────────────────────────────

-- gym_admins
create policy "gym_admins readable by authenticated"
  on public.gym_admins for select
  to authenticated using (true);
create policy "Owners manage gym admins"
  on public.gym_admins for insert
  to authenticated with check (public.is_gym_owner(gym_id));
create policy "Owners update gym admins"
  on public.gym_admins for update
  to authenticated
  using (public.is_gym_owner(gym_id))
  with check (public.is_gym_owner(gym_id));
create policy "Owners remove gym admins"
  on public.gym_admins for delete
  to authenticated using (public.is_gym_owner(gym_id));

-- gym_invites
create policy "Admins and recipients read gym invites"
  on public.gym_invites for select
  to authenticated
  using (
    public.is_gym_admin(gym_id)
    or email = (select auth.email())
  );
create policy "Admins create gym invites"
  on public.gym_invites for insert
  to authenticated
  with check (
    invited_by = (select auth.uid())
    and public.is_gym_admin(gym_id)
  );
create policy "Recipient accepts or admin cancels invite"
  on public.gym_invites for update
  to authenticated
  using (
    public.is_gym_admin(gym_id)
    or email = (select auth.email())
  )
  with check (
    public.is_gym_admin(gym_id)
    or email = (select auth.email())
  );
create policy "Admins delete gym invites"
  on public.gym_invites for delete
  to authenticated using (public.is_gym_admin(gym_id));

-- competitions
create policy "competitions readable by authenticated"
  on public.competitions for select
  to authenticated using (true);
create policy "Organisers create competitions"
  on public.competitions for insert
  to authenticated with check (organiser_id = (select auth.uid()));
create policy "Organisers update competitions"
  on public.competitions for update
  to authenticated
  using (organiser_id = (select auth.uid()))
  with check (organiser_id = (select auth.uid()));
create policy "Organisers delete competitions"
  on public.competitions for delete
  to authenticated using (organiser_id = (select auth.uid()));

-- competition_gyms
create policy "competition_gyms readable by authenticated"
  on public.competition_gyms for select
  to authenticated using (true);
create policy "Organiser or gym admin links a gym to a comp"
  on public.competition_gyms for insert
  to authenticated
  with check (
    public.is_competition_organiser(competition_id)
    or public.is_gym_admin(gym_id)
  );
create policy "Organiser or gym admin unlinks a gym from a comp"
  on public.competition_gyms for delete
  to authenticated
  using (
    public.is_competition_organiser(competition_id)
    or public.is_gym_admin(gym_id)
  );

-- competition_categories
create policy "competition_categories readable by authenticated"
  on public.competition_categories for select
  to authenticated using (true);
create policy "Organisers create competition categories"
  on public.competition_categories for insert
  to authenticated with check (public.is_competition_organiser(competition_id));
create policy "Organisers update competition categories"
  on public.competition_categories for update
  to authenticated
  using (public.is_competition_organiser(competition_id))
  with check (public.is_competition_organiser(competition_id));
create policy "Organisers delete competition categories"
  on public.competition_categories for delete
  to authenticated using (public.is_competition_organiser(competition_id));

-- competition_participants
create policy "competition_participants readable by authenticated"
  on public.competition_participants for select
  to authenticated using (true);
create policy "User joins a competition"
  on public.competition_participants for insert
  to authenticated with check (user_id = (select auth.uid()));
create policy "User updates own competition category"
  on public.competition_participants for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "User leaves a competition"
  on public.competition_participants for delete
  to authenticated using (user_id = (select auth.uid()));

-- route_tags (catalogue — read-only to authenticated; curated via migrations)
create policy "route_tags readable by authenticated"
  on public.route_tags for select
  to authenticated using (true);

-- route_tags_map
create policy "route_tags_map readable by authenticated"
  on public.route_tags_map for select
  to authenticated using (true);
create policy "Gym admins tag routes"
  on public.route_tags_map for insert
  to authenticated with check (public.is_admin_of_route(route_id));
create policy "Gym admins untag routes"
  on public.route_tags_map for delete
  to authenticated using (public.is_admin_of_route(route_id));

-- push_subscriptions
create policy "Users manage own push subscriptions"
  on public.push_subscriptions for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ────────────────────────────────────────────────────────────────
-- 4) Mutations to existing tables
-- ────────────────────────────────────────────────────────────────

-- sets: status is the source of truth; `active` is now derived by trigger.
alter table public.sets
  add column name            text,
  add column status          text not null default 'draft'
                             check (status in ('draft', 'live', 'archived')),
  add column grading_scale   text not null default 'v'
                             check (grading_scale in ('v', 'font', 'points')),
  add column max_grade       smallint not null default 10
                             check (max_grade between 0 and 30),
  add column competition_id  uuid references public.competitions(id) on delete set null,
  add column closing_event   boolean not null default false,
  add column venue_gym_id    uuid references public.gyms(id);

update public.sets
   set status = case when active then 'live' else 'archived' end;

create index sets_status_idx         on public.sets (gym_id, status);
create index sets_competition_id_idx on public.sets (competition_id) where competition_id is not null;
create index sets_venue_gym_id_idx   on public.sets (venue_gym_id)   where venue_gym_id is not null;

-- routes: internal-only setter name
alter table public.routes
  add column setter_name text check (setter_name is null or length(setter_name) between 1 and 80);

-- gyms: plan tier placeholder
alter table public.gyms
  add column plan_tier text not null default 'starter'
    check (plan_tier in ('starter', 'pro', 'enterprise'));

-- route_logs: relax grade_vote bound so V/Font scales fit.
do $$
declare
  v_name text;
begin
  select conname into v_name
    from pg_constraint c
   where c.conrelid = 'public.route_logs'::regclass
     and c.contype  = 'c'
     and pg_get_constraintdef(c.oid) ilike '%grade_vote%<= 10%';
  if v_name is not null then
    execute 'alter table public.route_logs drop constraint ' || quote_ident(v_name);
  end if;
end $$;

alter table public.route_logs
  add constraint route_logs_grade_vote_range
  check (grade_vote is null or (grade_vote between 0 and 30));

-- ────────────────────────────────────────────────────────────────
-- 5) Triggers
-- ────────────────────────────────────────────────────────────────

-- sets.active derived from sets.status — keeps legacy callers working
-- while the app migrates to reading status directly.
create or replace function public.sync_sets_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.active := (new.status = 'live');
  return new;
end;
$$;

create trigger sets_sync_active
  before insert or update of status on public.sets
  for each row execute function public.sync_sets_active();

-- competitions updated_at
create trigger competitions_updated_at
  before update on public.competitions
  for each row execute function public.update_updated_at();

-- ────────────────────────────────────────────────────────────────
-- 6) Seed data
-- ────────────────────────────────────────────────────────────────

insert into public.route_tags (slug, name) values
  ('overhang',    'Overhang'),
  ('slab',        'Slab'),
  ('vertical',    'Vertical'),
  ('roof',        'Roof'),
  ('compression', 'Compression'),
  ('crack',       'Crack'),
  ('crimp',       'Crimp'),
  ('sloper',      'Sloper');
