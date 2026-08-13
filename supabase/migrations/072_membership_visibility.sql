-- 072: let a user see the memberships their own screens depend on
--
-- Two policies restricted a row to its owner, and in both cases the
-- app has a legitimate read of someone *else's* row that then always
-- came back empty. Neither failed loudly: the queries succeeded and
-- returned nothing, so the features just looked broken.
--
-- ── 1. crews — a pending invitee can't see what they were invited to
--
-- `crews` SELECT required `is_active_crew_member(id)`, so someone
-- holding a pending invite could not read the crew's name.
-- `getPendingCrewInvites` joins `crews:crew_id (name)` and drops any
-- row whose join comes back null, so the invite vanished from /crew
-- entirely — while the nav badge, which counts `crew_members` rows
-- (readable via "Read own membership"), still showed 1. The invite
-- could not be accepted because it could not be seen.
--
-- Widening to "any membership row, pending or active" exposes exactly
-- the crew someone was explicitly invited to, and only its name. It
-- does NOT open the detail page: `/crew/[id]` resolves the crew from
-- `getMyCrews`, which filters `status = 'active'`, and 404s otherwise.
-- The roster stays shut too — `crew_members`' "Active members read
-- roster" is unchanged — as does the activity feed, gated inside its
-- RPC. A pending invitee learns the crew's name, which is the whole
-- content of the invitation.
drop policy if exists "Active crew members can read their crew" on public.crews;

create policy "Invited or active members can read the crew"
  on public.crews for select to authenticated
  using (public.crew_member_status(id) is not null);

-- ── 2. gym_memberships — can't verify another climber is in your gym
--
-- SELECT was `user_id = auth.uid()`, own rows only. Two server actions
-- verify that a *target* climber belongs to the caller's gym before
-- returning their data, and both ran that check through the caller's
-- RLS-scoped client:
--
--   • `fetchClimberLogs`   (app/leaderboard/actions.ts)
--       → "Climber not in this gym"
--   • `fetchSetPlacement`  (app/u/[username]/actions.ts)
--       → "Not in this gym"
--
-- The check can never pass. Tapping any climber but yourself on the
-- Chorkboard opened the peek sheet onto an error, and every profile
-- page lost its set placement. The guard is right to exist — it stops
-- a gym-A caller enumerating gym-B climbers — it was simply asking
-- RLS a question RLS is forbidden to answer.
--
-- Fixed in the policy rather than by handing the actions a service-
-- role client: the answer ("is this person in my gym?") is not
-- privileged. The Chorkboard already lists those same climbers by
-- username and points to every member of the gym. Reading it through
-- the caller's own client also keeps the guard honest — it stays
-- scoped to gyms the caller actually belongs to, whereas a service-
-- role client would have to re-derive that by hand.
--
-- `is_gym_member` is SECURITY DEFINER, so it does not re-enter this
-- policy when it reads `gym_memberships`.
drop policy if exists "Users can read their own memberships" on public.gym_memberships;

create policy "Members read memberships in gyms they belong to"
  on public.gym_memberships for select to authenticated
  using (
    -- Own rows always, independent of the helper. A switch upserts the
    -- membership and then reads it back, and this arm keeps that
    -- readable no matter how the helper evaluates mid-transaction.
    user_id = (select auth.uid())
    or public.is_gym_member(gym_id)
  );
