import { createServerSupabase } from "@/lib/supabase/server";
import { getUserJams } from "@/lib/data/jam-queries";
import { JamHistoryList } from "@/components/Jam/JamHistoryList";
import styles from "./profileJamsSection.module.scss";

interface Props {
  userId: string;
}

/**
 * Jam history section on a climber's profile. Visible for both the
 * profile's owner and any visitor — jam history is public within
 * the app so other climbers can see what sessions someone has
 * played and won. Hidden entirely when the climber has no jams on
 * record (keeps the profile quiet for first-time visitors).
 */
export async function ProfileJamsSection({ userId }: Props) {
  const supabase = await createServerSupabase();
  // Default page size of 20 for the profile view. A "Load more"
  // control can page backwards via `before` — follow-up work.
  const jams = await getUserJams(supabase, userId, { limit: 20 });

  if (jams.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="profile-jams-heading">
      <div className={styles.header}>
        <h2 id="profile-jams-heading" className={styles.heading}>
          Jams
        </h2>
        <span className={styles.count}>
          {jams.length} {jams.length === 1 ? "jam" : "jams"}
        </span>
      </div>
      <JamHistoryList jams={jams} />
    </section>
  );
}
