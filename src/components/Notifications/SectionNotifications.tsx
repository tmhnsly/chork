import { FaBell } from "react-icons/fa6";
import { createServerSupabase, getServerUser } from "@/lib/supabase/server";
import { getNotifications } from "@/lib/data/notifications";
import {
  kindsForSection,
  type NotificationSection,
} from "@/lib/data/notification-kinds";
import { SectionCard } from "@/components/ui/SectionCard";
import { countOf } from "@/lib/plural";
import { NotificationsList } from "./NotificationsList";

interface Props {
  /** The section whose kinds this card shows and read-flags. */
  section: NotificationSection;
}

/**
 * A section's notification rows — the Notification log surfacing IN
 * the section that owns the kind, not in a global inbox. /friends
 * mounts `section="friends"` (requests received / accepted), the
 * match landing mounts `section="match"` (invites).
 *
 * Server component: rows arrive with the page (RLS scopes them to
 * the caller), the client list underneath owns dismiss and the
 * scoped mark-read. Self-hides when there is nothing to show — a
 * quiet page beats an empty card.
 */
export async function SectionNotifications({ section }: Props) {
  const user = await getServerUser();
  if (!user) return null;

  const kinds = kindsForSection(section);
  const supabase = await createServerSupabase();
  const rows = await getNotifications(supabase, { kinds });
  if (rows.length === 0) return null;

  const unread = rows.filter((r) => r.read_at === null).length;

  return (
    <SectionCard
      title="Activity"
      icon={<FaBell />}
      meta={unread > 0 ? countOf(unread, "new", "new") : undefined}
    >
      <NotificationsList rows={rows} kinds={kinds} />
    </SectionCard>
  );
}
