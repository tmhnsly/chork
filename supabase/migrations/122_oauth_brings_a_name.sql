-- ────────────────────────────────────────────────────────────────
-- A Google account arrives with a name and a face
-- ────────────────────────────────────────────────────────────────
--
-- `handle_new_user` fires for every new account and writes exactly a
-- placeholder username. That was right when the only way in was email
-- and password, where the server genuinely knows nothing about the
-- person yet.
--
-- An OAuth account is different: Google hands over a display name and
-- an avatar in `raw_user_meta_data`, and throwing them away means the
-- climber types their own name into onboarding on a phone at a gym —
-- the exact friction OAuth was added to remove.
--
-- Onboarding already prefills its display-name field from
-- `profiles.name`, so filling that in here is the whole change; the
-- screen picks it up with no client work.
--
-- ── Why the keys are tried in pairs ─────────────────────────────
--
-- Providers disagree about what to call these. Google sends
-- `full_name` and `picture`; several others send `name` and
-- `avatar_url`; Supabase normalises some but not all of it. Reading
-- both spellings costs nothing and means Apple Sign In (next on the
-- roadmap) needs no migration of its own.
--
-- Email signups have no metadata at all, so every coalesce falls
-- through to null and the row is identical to what it is today.

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
    -- Trimmed, and blank-to-null: a provider sending an empty string
    -- would otherwise leave onboarding prefilled with nothing, which
    -- looks like a bug rather than an empty field.
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )), ''),
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture',
      ''
    )), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
