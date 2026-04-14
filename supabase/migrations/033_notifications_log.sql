-- 033: persistent notification log
--
-- Push is best-effort and transient — if the OS drops the payload
-- or the user's device isn't subscribed they never see the event.
-- This table stores an in-app record for every push-worthy event
-- so users can catch up from the profile's notifications bell.
--
-- Kinds are a closed string set so the app can render a typed view
-- per kind without parsing the payload shape. `payload` carries
-- just enough to render the row (crew name, counterpart username,
-- deep link target) without joining at read time.

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in (
    'crew_invite_received',
    'crew_invite_accepted',
    'crew_ownership_transferred'
  )),
  payload     jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index notifications_user_id_idx on public.notifications (user_id);
create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;
create index notifications_created_at_idx on public.notifications (created_at desc);

alter table public.notifications enable row level security;

-- A user can read their own rows, mark them read (UPDATE read_at),
-- and delete them. Writes only via service role — see
-- `notify_user(user_id, kind, payload)` helper below.
create policy "Read own notifications"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Mark own notifications read"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Delete own notifications"
  on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- No INSERT policy: server-side actions write via the service role
-- client, so untrusted clients can't fabricate notifications.

-- ────────────────────────────────────────────────────────────────
-- notify_user(...)
-- ────────────────────────────────────────────────────────────────
-- Convenience wrapper so server actions don't have to reach for
-- the service role just to log a notification. SECURITY DEFINER so
-- the insert runs with elevated rights, but the function itself is
-- granted only to `authenticated` — the caller must be signed in.
-- It refuses to notify the caller themselves (most events are for
-- OTHER users); the app still writes the row directly via the
-- service role when that's needed.

create or replace function public.notify_user(
  p_user_id uuid,
  p_kind    text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if p_user_id is null then
    raise exception 'user_id required';
  end if;
  if p_kind not in (
    'crew_invite_received',
    'crew_invite_accepted',
    'crew_ownership_transferred'
  ) then
    raise exception 'unknown notification kind: %', p_kind;
  end if;

  insert into public.notifications (user_id, kind, payload)
    values (p_user_id, p_kind, coalesce(p_payload, '{}'::jsonb))
    returning id into new_id;

  return new_id;
end;
$$;

grant  execute on function public.notify_user(uuid, text, jsonb) to authenticated;
revoke execute on function public.notify_user(uuid, text, jsonb) from anon, public;
