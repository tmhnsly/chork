"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FaPlus, FaXmark } from "react-icons/fa6";
import { Button, showToast } from "@/components/ui";
import {
  linkCompetitionGym,
  unlinkCompetitionGym,
} from "@/app/admin/actions";
import type { CompetitionGymLink } from "@/lib/data/competition-queries";
import type { AdminGymSummary } from "@/lib/data/admin-queries";
import styles from "./competitionGymsPanel.module.scss";

interface Props {
  competitionId: string;
  linkedGyms: CompetitionGymLink[];
  /**
   * Gyms the caller admins — they can link any of these. Organiser-
   * only gyms (not admined by the caller) are handled by the RLS OR
   * branch on competition_gyms, but the UI shortcut is "pick from my
   * gyms".
   */
  myGyms: AdminGymSummary[];
}

export function CompetitionGymsPanel({ competitionId, linkedGyms, myGyms }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string>("");

  const linkedIds = useMemo(() => new Set(linkedGyms.map((g) => g.gym_id)), [linkedGyms]);
  const linkable = myGyms.filter((g) => !linkedIds.has(g.id));

  function handleLink() {
    if (!selected) return;
    startTransition(async () => {
      const res = await linkCompetitionGym({ competitionId, gymId: selected });
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      showToast("Gym linked", "success");
      setSelected("");
      router.refresh();
    });
  }

  function handleUnlink(gymId: string) {
    startTransition(async () => {
      const res = await unlinkCompetitionGym({ competitionId, gymId });
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      showToast("Gym unlinked", "success");
      router.refresh();
    });
  }

  return (
    <section className={styles.panel} aria-labelledby="comp-gyms-heading">
      <h2 id="comp-gyms-heading" className={styles.heading}>Participating gyms</h2>

      {linkedGyms.length === 0 ? (
        <p className={styles.empty}>No gyms linked yet.</p>
      ) : (
        <ul className={styles.list}>
          {linkedGyms.map((g) => (
            <li key={g.gym_id} className={styles.row}>
              <span className={styles.rowName}>{g.gym_name}</span>
              <button
                type="button"
                className={styles.unlinkBtn}
                onClick={() => handleUnlink(g.gym_id)}
                disabled={pending}
                aria-label={`Unlink ${g.gym_name}`}
              >
                <FaXmark aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {linkable.length > 0 && (
        <div className={styles.linkRow}>
          <select
            className={styles.select}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            aria-label="Pick a gym to link"
          >
            <option value="">Pick a gym to link…</option>
            {linkable.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <Button type="button" disabled={!selected || pending} onClick={handleLink}>
            <FaPlus aria-hidden /> Link
          </Button>
        </div>
      )}
    </section>
  );
}
