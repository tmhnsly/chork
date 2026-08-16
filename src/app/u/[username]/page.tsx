import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createServerSupabase, getServerUser } from "@/lib/supabase/server";
import { getProfileByUsername } from "@/lib/data/profile-queries";
import { getUnreadNotificationCount } from "@/lib/data/notifications";
import { ProfileHeader } from "@/components/ProfileHeader/ProfileHeader";
import { ProfileStats } from "./_components/ProfileStats";
import { ProfileStatsSkeleton } from "./_components/ProfileStats.skeleton";
import { ProfileAchievementsSection } from "./_components/ProfileAchievementsSection";
import { PreviousSetsSection } from "./_components/PreviousSetsSection";
import { ProfileMatchesSection } from "./_components/ProfileMatchesSection";
import { ProfileGradesSection } from "./_components/ProfileGradesSection";
import { PROFILE_SECTION_HEIGHTS } from "./_components/sectionHeights";
import { CardSkeleton } from "@/components/ui";
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

  // Header chrome data — small queries, fetched sync so the header
  // renders fully on shell paint (bell badge + meta line don't pop in
  // late). Own-profile-only data resolves to empty/zero for visitors.
  // Notification list itself lazy-loads inside the sheet on open;
  // the shell only needs the unread count for the badge.
  // Admin entry moved into NavBar — no admin lookup needed here.
  const unreadCount = isOwnProfile
    ? await getUnreadNotificationCount(supabase, profileUser.id)
    : 0;

  // `contextLine` used to read "N crews" for a visitor. Nothing fills
  // it now that crews are gone — a friend count would, but it would
  // also publish who is popular to anyone who looks, which is a
  // decision worth making on purpose rather than by inheritance.
  const contextLine: string | null = null;

  // Show another climber's profile in *their* chosen theme — viewer's
  // theme restores when they leave the route. Scoped to <main> so the
  // global nav stays in the viewer's palette.
  const otherThemeAttr =
    !isOwnProfile && profileUser.theme && profileUser.theme !== "default"
      ? { "data-theme": profileUser.theme }
      : {};

  return (
    <main className={styles.page} {...otherThemeAttr}>
      <ProfileHeader
        user={profileUser}
        isOwnProfile={isOwnProfile}
        contextLine={contextLine}
        unreadCount={unreadCount}
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
            createdAt={profileUser.created_at}
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

      <Suspense
        fallback={
          <CardSkeleton
            height={PROFILE_SECTION_HEIGHTS.achievements}
            ariaLabel="Loading achievements"
          />
        }
      >
        <ProfileAchievementsSection
          userId={profileUser.id}
          gymId={gymId}
          createdAt={profileUser.created_at}
        />
      </Suspense>

      {gymId && (
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
          gym-scoped. Self-hides when there's nothing graded yet. */}
      <Suspense fallback={null}>
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
