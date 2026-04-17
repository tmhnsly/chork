import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createServerSupabase, getServerUser } from "@/lib/supabase/server";
import { getProfileByUsername } from "@/lib/data/queries";
import { getCrewCountForUser, getPendingCrewInvites } from "@/lib/data/crew-queries";
import { getUnreadNotificationCount } from "@/lib/data/notifications";
import { ProfileHeader } from "@/components/ProfileHeader/ProfileHeader";
import { ProfileStats } from "./_components/ProfileStats";
import { ProfileStatsSkeleton } from "./_components/ProfileStats.skeleton";
import { ProfileAchievementsSection } from "./_components/ProfileAchievementsSection";
import { PreviousSetsSection } from "./_components/PreviousSetsSection";
import { ProfileJamsSection } from "./_components/ProfileJamsSection";
import { PROFILE_SECTION_HEIGHTS } from "./_components/sectionHeights";
import { CardSkeleton } from "@/components/ui";
import styles from "./user.module.scss";

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { username } = await params;
  return { title: `@${username} - Chork` };
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
  const [crewCount, invites, unreadCount] = await Promise.all([
    !isOwnProfile ? getCrewCountForUser(supabase, profileUser.id) : Promise.resolve(0),
    isOwnProfile ? getPendingCrewInvites(supabase, profileUser.id) : Promise.resolve([]),
    isOwnProfile ? getUnreadNotificationCount(supabase, profileUser.id) : Promise.resolve(0),
  ]);

  let contextLine: string | null = null;
  if (!isOwnProfile && crewCount > 0) {
    contextLine = `${crewCount} crew${crewCount === 1 ? "" : "s"}`;
  }

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
        invites={invites}
        unreadCount={unreadCount}
      />

      {/* Gym-scoped widgets (current set + previous sets) are only
          meaningful when the profile's owner has an active gym.
          Gymless profiles skip them. ProfileAchievementsSection is
          rendered in both cases — achievements span gym + jam
          activity once badges are gym-agnostic. */}
      {gymId && (
        <Suspense fallback={<ProfileStatsSkeleton />}>
          <ProfileStats
            userId={profileUser.id}
            gymId={gymId}
            createdAt={profileUser.created_at}
          />
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
          />
        </Suspense>
      )}

      {/* Jam history — public within the app. Self-hides when the
          climber has no jams on record so first-time visitors see
          a quiet profile. */}
      <Suspense fallback={null}>
        <ProfileJamsSection userId={profileUser.id} />
      </Suspense>
    </main>
  );
}
