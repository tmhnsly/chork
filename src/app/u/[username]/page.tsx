import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createServerSupabase, getServerUser } from "@/lib/supabase/server";
import { getProfileByUsername } from "@/lib/data/profile-queries";
import { getProfileSummary } from "@/lib/data/profile-queries";
import { getFriendStatus, getFriends } from "@/lib/data/friend-queries";
import { getGym } from "@/lib/data/gym-queries";
import { getAllSets } from "@/lib/data/set-queries";
import { computeSetStreak } from "@/lib/data/profile-stats";
import { flashRate, pointsPerSend, completionRate } from "@/lib/data/profile-stats";
import { ProfileHero } from "@/components/ProfileHero/ProfileHero";
import { ProfileStats } from "./_components/ProfileStats";
import { ProfileStatsSkeleton } from "./_components/ProfileStats.skeleton";
import { ProfileAchievementsSection } from "./_components/ProfileAchievementsSection";
import { PreviousSetsSection } from "./_components/PreviousSetsSection";
import { ProfileMatchesSection } from "./_components/ProfileMatchesSection";
import { ProfileGradesSection } from "./_components/ProfileGradesSection";
import { PROFILE_SECTION_HEIGHTS } from "./_components/sectionHeights";
import { CardSkeleton } from "@/components/ui";
import { BadgeShelfSkeleton } from "@/components/ui/BadgeShelf/BadgeShelfSkeleton";
import styles from "./user.module.scss";

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { username } = await params;
  return { title: `@${username}` };
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params;

  const supabase = await createServerSupabase();
  const authUser = await getServerUser();

  const profileUser = await getProfileByUsername(username);
  if (!profileUser) notFound();

  const isOwnProfile = authUser?.id === profileUser.id;
  const gymId = profileUser.active_gym_id;

  // The hero card wants three totals and how the viewer stands with
  // this climber. `getProfileSummary` is React-cached per render, so
  // ProfileStats calling it again below costs nothing — one query,
  // two readers.
  //
  // The notification bell that used to sit here is gone: friend
  // requests surface on /friends, and match invites will surface in
  // Match. A bell that duplicated both was a second place to keep in
  // step, and it was only ever visible on your own profile anyway.
  const [summary, standing, gym, orderedSets, friends] = await Promise.all([
    gymId ? getProfileSummary(supabase, profileUser.id, gymId) : null,
    authUser ? getFriendStatus(supabase, profileUser.id) : null,
    gymId ? getGym(gymId) : null,
    gymId ? getAllSets(gymId, profileUser.created_at) : [],
    // Own profile only. `get_friends` is caller-scoped on purpose: a
    // friend count is never published to whoever happens to look.
    isOwnProfile ? getFriends(supabase) : Promise.resolve(undefined),
  ]);
  const totals = (summary?.per_set ?? []).reduce(
    (acc, s) => {
      acc.sends += s.sends;
      acc.flashes += s.flashes;
      acc.points += s.points;
      return acc;
    },
    { sends: 0, flashes: 0, points: 0 },
  );
  const sentSetIds = new Set((summary?.per_set ?? []).map((s) => s.set_id));
  const streak = computeSetStreak(
    orderedSets.map((s) => ({ hasSend: sentSetIds.has(s.id) })),
  );
  const ratios = summary
    ? {
        flashRate: flashRate(totals.sends, totals.flashes) ?? 0,
        pointsPerSend: pointsPerSend(totals.points, totals.sends) ?? 0,
        completionRate:
          completionRate(totals.sends, summary.unique_routes_attempted) ?? 0,
        streakCurrent: streak.current,
      }
    : null;

  // Show another climber's profile in *their* chosen theme — viewer's
  // theme restores when they leave the route. Scoped to <main> so the
  // global nav stays in the viewer's palette.
  const otherThemeAttr =
    !isOwnProfile && profileUser.theme && profileUser.theme !== "default"
      ? { "data-theme": profileUser.theme }
      : {};

  return (
    <main className={styles.page} {...otherThemeAttr}>
      <ProfileHero
        user={profileUser}
        gymName={gym?.name ?? null}
        totals={totals}
        ratios={ratios}
        // A signed-out viewer can't be friends with anyone; "none"
        // renders Add, which the action gate will bounce to /login.
        standing={standing ?? { status: "none", friendId: null }}
        friends={friends}
      />

      {/* Gym-scoped widgets (current set + previous sets) are only
          meaningful when the profile's owner has an active gym.
          Gymless profiles skip them. ProfileAchievementsSection is
          rendered in both cases — achievements span gym + match
          activity once badges are gym-agnostic. */}
      {gymId ? (
        <Suspense fallback={<ProfileStatsSkeleton />}>
          <ProfileStats
            userId={profileUser.id}
            gymId={gymId}
            isOwnProfile={isOwnProfile}
          />
        </Suspense>
      ) : (
        /* Gymless: matches take the slot gym stats would occupy, so every
           profile leads with a stats row sourced from whatever that
           climber actually does. Without this a gymless profile opened
           on achievements and buried the match record at the bottom —
           the wrong way round when running your own comps anywhere is
           the point of the app, not the fallback. */
        <Suspense fallback={null}>
          <ProfileMatchesSection userId={profileUser.id} isOwnProfile={isOwnProfile} />
        </Suspense>
      )}

      <Suspense fallback={<BadgeShelfSkeleton />}>
        <ProfileAchievementsSection
          userId={profileUser.id}
          gymId={gymId}
          createdAt={profileUser.created_at}
        />
      </Suspense>

      {/* History only, and mounted only when there IS history: the
          section self-hides with no previous sets, so a fallback that
          reserved its block on every profile was a skeleton that
          vanished on hand-off. `orderedSets` is already in hand (and
          cached), so the page can know before the section streams. */}
      {gymId && orderedSets.some((s) => !s.active) && (
        <Suspense
          fallback={
            <CardSkeleton
              height={PROFILE_SECTION_HEIGHTS.previousSets}
              ariaLabel="Loading previous sets"
            />
          }
        >
          <PreviousSetsSection
            userId={profileUser.id}
            gymId={gymId}
            createdAt={profileUser.created_at}
            isOwnProfile={isOwnProfile}
          />
        </Suspense>
      )}

      {/* Grade pyramids — gym and Match sends together, one per
          (discipline, scale). Renders on every profile, gym or not,
          because it's sourced from route_logs rather than anything
          gym-scoped. Self-hides when there's nothing graded yet, so
          the block is reserved only when the page already knows there
          are sends to grade — the route skeleton reserved it, and a
          fallback of null here would drop it and bring it back. */}
      <Suspense
        fallback={
          totals.sends > 0 ? (
            <CardSkeleton height={PROFILE_SECTION_HEIGHTS.grades} ariaLabel="Loading grades" />
          ) : null
        }
      >
        <ProfileGradesSection userId={profileUser.id} />
      </Suspense>

      {/* Match history — public within the app. Self-hides when the
          climber has no matches on record so first-time visitors see
          a quiet profile. Gymless profiles render this higher up
          instead, in the gym-stats slot. */}
      {gymId && (
        <Suspense fallback={null}>
          <ProfileMatchesSection userId={profileUser.id} isOwnProfile={isOwnProfile} />
        </Suspense>
      )}
    </main>
  );
}
