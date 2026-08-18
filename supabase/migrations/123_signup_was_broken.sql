-- ────────────────────────────────────────────────────────────────
-- Nobody could sign up
-- ────────────────────────────────────────────────────────────────
--
-- Migration 122 broke account creation for everyone, and the symptom
-- was a generic "something went wrong" on the signup form.
--
-- `profiles.name` and `profiles.avatar_url` are NOT NULL with `''`
-- defaults. Before 122 the trigger inserted only `(id, username)`, so
-- both columns took their defaults and the row was fine. 122 started
-- listing them explicitly and passing `nullif(trim(...), '')`, which
-- is NULL for any signup with no provider metadata — i.e. every email
-- signup. NULL into NOT NULL raises, the trigger is inside the
-- `auth.users` INSERT, so the whole signup transaction rolls back.
--
-- The fix is to land on the column's own empty string rather than
-- NULL. Nothing downstream cares: onboarding reads
-- `profile?.name ?? ""` and the avatar falls back on empty exactly as
-- it did before 122.
--
-- ── Why the tests didn't catch it ───────────────────────────────
--
-- Two ways, both mine, both worth writing down.
--
-- The dry-run tested the extraction EXPRESSIONS in isolation —
-- `pick_name('{...}')` — because `profiles.id` has a foreign key to
-- `auth.users` and I could not fabricate a row to insert. Testing the
-- pieces proved the pieces; it never once ran the INSERT that was
-- actually broken.
--
-- And `new-user.test.ts` pins the function's TEXT: that it reads both
-- provider spellings, that it is idempotent. Every one of those still
-- passed with signup completely broken, because none of them assert
-- the function can run at all.
--
-- The test below inserts a real `auth.users` row and rolls it back,
-- which is the only version of this that would have failed.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, name, avatar_url)
  values (
    new.id,
    'user_' || replace(new.id::text, '-', ''),
    -- Both columns are NOT NULL. The outer coalesce is the whole
    -- point: an email signup has no metadata, every lookup misses,
    -- and without it this inserts NULL and takes the signup with it.
    coalesce(
      nullif(trim(coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        ''
      )), ''),
      ''
    ),
    coalesce(
      nullif(trim(coalesce(
        new.raw_user_meta_data ->> 'avatar_url',
        new.raw_user_meta_data ->> 'picture',
        ''
      )), ''),
      ''
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
