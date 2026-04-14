-- 034: tighten gym_admins SELECT policy
--
-- Migration 014 shipped a fully-open SELECT policy on gym_admins:
--
--   create policy "gym_admins readable by authenticated"
--     on public.gym_admins for select
--     to authenticated using (true);
--
-- Any signed-in climber could therefore enumerate every admin/owner
-- UUID across every gym by querying the table from the browser.
-- The policy was likely meant to power `is_gym_admin()` lookups —
-- but that helper is SECURITY DEFINER and reads the table under
-- elevated privilege, so it never relied on the permissive policy
-- in the first place.
--
-- New policy scope: a row is visible to
--   • its own owner (the admin/owner themselves), and
--   • fellow admins of the same gym (so the admin panel can list
--     the roster of the gym the caller manages).
-- Everything else is hidden. Climbers see nothing — if they need
-- to know who runs their gym, that's a separate surface with its
-- own explicit query through a SECURITY DEFINER helper.

drop policy if exists "gym_admins readable by authenticated" on public.gym_admins;

create policy "gym_admins readable by self or fellow admins"
  on public.gym_admins for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_gym_admin(gym_id)
  );
