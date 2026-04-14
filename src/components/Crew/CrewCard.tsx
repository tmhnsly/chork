import Link from "next/link";
import { FaChevronRight, FaUsers } from "react-icons/fa6";
import { UserAvatar } from "@/components/ui";
import type { Crew, CrewMember } from "@/lib/data/crew-queries";
import styles from "./crewCard.module.scss";

interface Props {
  crew: Crew;
  /** Up to 4 member previews; avatar stack reads "crew vibe" at a glance. */
  memberPreview: Pick<CrewMember, "user_id" | "username" | "name" | "avatar_url">[];
}

/**
 * Picker-view card for a single crew. Whole card is a Link to
 * /crew/[id]; avatars stack on the left, name + count on the right.
 * The chevron signals navigation — the peek sheet pattern doesn't
 * apply here, tapping a crew opens its full detail view.
 */
export function CrewCard({ crew, memberPreview }: Props) {
  const visible = memberPreview.slice(0, 4);
  const hiddenCount = Math.max(0, crew.member_count - visible.length);

  return (
    <Link href={`/crew/${crew.id}`} className={styles.card}>
      <div className={styles.avatarStack} aria-hidden>
        {visible.map((m, i) => (
          <span
            key={m.user_id}
            className={styles.avatarSlot}
            style={{ zIndex: visible.length - i }}
          >
            <UserAvatar
              user={{
                id: m.user_id,
                username: m.username,
                name: m.name,
                avatar_url: m.avatar_url,
              }}
              size={36}
            />
          </span>
        ))}
        {hiddenCount > 0 && (
          <span className={`${styles.avatarSlot} ${styles.avatarMore}`}>
            +{hiddenCount}
          </span>
        )}
      </div>

      <div className={styles.meta}>
        <span className={styles.name}>{crew.name}</span>
        <span className={styles.count}>
          <FaUsers aria-hidden /> {crew.member_count}{" "}
          member{crew.member_count === 1 ? "" : "s"}
        </span>
      </div>

      <FaChevronRight className={styles.chevron} aria-hidden />
    </Link>
  );
}
