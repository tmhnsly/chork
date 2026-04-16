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

  // No gym selected: render the header alone. Same shape as before.
  if (!gymId) {
    return (
      <main className={styles.page}>
        <ProfileHeader user={profileUser} isOwnProfile={isOwnProfile} />
        <p>No gym selected</p>
      </main>
    );
  }

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

      {/* All-time + current set card — relies on get_profile_summary
          (cached cross-render) so siblings dedupe the RPC. */}
      <Suspense fallback={<ProfileStatsSkeleton />}>
        <ProfileStats
          userId={profileUser.id}
          gymId={gymId}
          createdAt={profileUser.created_at}
        />
      </Suspense>

      {/* Heights pulled from sectionHeights.ts — same const used by
          src/app/u/[username]/loading.tsx so the Suspense fallback
          shape mirrors the route-level skeleton. No jump as
          loading.tsx hands off to the streamed page. */}
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
    </main>
  );
}
