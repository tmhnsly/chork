import { createServiceClient } from "@/lib/supabase/server";
import { getGradeDistribution } from "@/lib/data/profile-queries";
import { buildGradeDistribution } from "@/lib/data/grade-distribution";
import { GradePyramid } from "@/components/ui";
import { SectionCard } from "@/components/ui/SectionCard";
import { FaChartSimple } from "react-icons/fa6";
import styles from "./profileGradesSection.module.scss";

interface Props {
  userId: string;
}

/**
 * Grade pyramids on a climber's profile — how many sends at each
 * grade, with the flashed share tinted inside each bar.
 *
 * One pyramid per (discipline, scale), never merged: a 6a+ is not a
 * V-grade and rendering it as one would misstate what the climber
 * did. See CONTEXT.md "Discipline".
 *
 * Gym and Match sends roll up together — since the Set convergence a
 * Match send is an ordinary `route_logs` row, so this is one query
 * over live rows with no snapshot table to keep in sync.
 *
 * Hidden entirely when there's nothing to draw, so a new climber's
 * profile stays quiet rather than showing an empty axis.
 */
export async function ProfileGradesSection({ userId }: Props) {
  const service = createServiceClient();
  const rows = await getGradeDistribution(service, userId);
  const { pyramids, ungradedSends } = buildGradeDistribution(rows);

  if (pyramids.length === 0) return null;

  return (
    // Same SectionCard shell as every other section — icon + title on
    // the left, one meta item on the right, nothing else in the header.
    // The scope note rides in meta: the gym stats above are gym-only,
    // so without saying so the two disagree — "2 sends" up there and
    // three bars down here.
    <SectionCard title="Grades" icon={<FaChartSimple />} meta="Gym and matches">
      <div className={styles.pyramids}>
        {pyramids.map((pyramid) => (
          <GradePyramid
            key={`${pyramid.discipline}-${pyramid.scale}`}
            pyramid={pyramid}
          />
        ))}
      </div>

      {ungradedSends > 0 && (
        /* Say what was left out. A climber who has sent 30 routes and
           sees 22 on the pyramid will otherwise assume it's broken. */
        <p className={styles.footnote}>
          {ungradedSends} {ungradedSends === 1 ? "send isn't" : "sends aren't"}{" "}
          shown — they were on a points-only or custom scale, which has no
          comparable grade.
        </p>
      )}
    </SectionCard>
  );
}
