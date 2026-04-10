-- Add gym_id directly to route_logs and comments for efficient RLS queries.
-- Without this, RLS policies must join through routes → sets → gyms on every read,
-- which doesn't use indexes well at scale.
-- The gym_id is denormalized but kept in sync — it never changes for a given route.

-- Route logs: add gym_id column
alter table route_logs add column gym_id uuid references gyms(id);

-- Backfill from routes → sets
update route_logs rl
set gym_id = s.gym_id
from routes r
join sets s on s.id = r.set_id
where rl.route_id = r.id;

-- Make it required going forward
alter table route_logs alter column gym_id set not null;

-- Index for RLS: "show me all logs in this gym"
create index route_logs_gym on route_logs (gym_id);

-- Comments: add gym_id column
alter table comments add column gym_id uuid references gyms(id);

update comments c
set gym_id = s.gym_id
from routes r
join sets s on s.id = r.set_id
where c.route_id = r.id;

alter table comments alter column gym_id set not null;

create index comments_gym on comments (gym_id);

-- Activity events: add gym_id column
alter table activity_events add column gym_id uuid references gyms(id);

update activity_events ae
set gym_id = s.gym_id
from routes r
join sets s on s.id = r.set_id
where ae.route_id = r.id and ae.route_id is not null;

-- gym_id can be null for activity events without a route
create index activity_events_gym on activity_events (gym_id) where gym_id is not null;

-- Comment likes: add gym_id for efficient RLS
alter table comment_likes add column gym_id uuid references gyms(id);

update comment_likes cl
set gym_id = c.gym_id
from comments c
where cl.comment_id = c.id;

alter table comment_likes alter column gym_id set not null;

create index comment_likes_gym on comment_likes (gym_id);

-- ────────────────────────────────────────────────────────────────
-- Simplified RLS policies using direct gym_id instead of function joins
-- ────────────────────────────────────────────────────────────────

-- Drop old function-based policies
drop policy if exists "Gym members can read route logs" on route_logs;
drop policy if exists "Gym members can create route logs" on route_logs;
drop policy if exists "Gym members can read comments" on comments;
drop policy if exists "Gym members can create comments" on comments;
drop policy if exists "Gym members can read comment likes" on comment_likes;
drop policy if exists "Gym members can create comment likes" on comment_likes;
drop policy if exists "Gym members can read activity events" on activity_events;
drop policy if exists "Gym members can create activity events" on activity_events;

-- New direct-column policies (use index, no function calls)

create policy "Gym members can read route logs"
  on route_logs for select to authenticated
  using (is_gym_member(gym_id));

create policy "Gym members can create route logs"
  on route_logs for insert to authenticated
  with check (user_id = auth.uid() and is_gym_member(gym_id));

create policy "Gym members can read comments"
  on comments for select to authenticated
  using (is_gym_member(gym_id));

create policy "Gym members can create comments"
  on comments for insert to authenticated
  with check (user_id = auth.uid() and is_gym_member(gym_id));

create policy "Gym members can read comment likes"
  on comment_likes for select to authenticated
  using (is_gym_member(gym_id));

create policy "Gym members can create comment likes"
  on comment_likes for insert to authenticated
  with check (user_id = auth.uid() and is_gym_member(gym_id));

create policy "Gym members can read activity events"
  on activity_events for select to authenticated
  using (gym_id is null or is_gym_member(gym_id));

create policy "Gym members can create activity events"
  on activity_events for insert to authenticated
  with check (user_id = auth.uid() and (gym_id is null or is_gym_member(gym_id)));
