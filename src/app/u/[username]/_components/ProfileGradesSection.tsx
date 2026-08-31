import { createServiceClient } from "@/lib/supabase/server";
import { getGradeDistribution, getGradeProgression } from "@/lib/data/profile-queries";
import { buildGradeDistribution } from "@/lib/data/grade-distribution";
import { buildGradeProgression } from "@/lib/data/grade-progression";
import { SectionCard } from "@/components/ui/SectionCard";
import { FaChartSimple } from "react-icons/fa6";
import { ProfileGradesCard } from "./ProfileGradesCard";

interface Props {
  userId: string;
}

/**
 * Grades on a climber's profile — the pyramid (how many sends at each
 * grade, flashes tinted inside the bar), and behind a toggle the
 * progression (best grade per month, migration 135).
 *
 * One pyramid / one series per (discipline, scale), never merged: a
 * 6a+ is not a V-grade and rendering it as one would misstate what
 * the climber did. See CONTEXT.md "Discipline".
 *
 * Gym and Match sends roll up together — since the Set convergence a
 * Match send is an ordinary `route_logs` row, so both reads are live
 * with no snapshot table to keep in sync.
 *
 * Hidden entirely when there's nothing to draw, so a new climber's
 * profile stays quiet rather than showing an empty axis.
 */
export async function ProfileGradesSection({ userId }: Props) {
  const service = createServiceClient();
  const [rows, progressionRows] = await Promise.all([
    getGradeDistribution(service, userId),
    getGradeProgression(service, userId),
  ]);
  const { pyramids, ungradedSends } = buildGradeDistribution(rows);
  const charts = buildGradeProgression(progressionRows);

  if (pyramids.length === 0) return null;

  return (
    // Same SectionCard shell as every other section — icon + title on
    // the left, one meta item on the right, nothing else in the header.
    // The scope note rides in meta: the gym stats above are gym-only,
    // so without saying so the two disagree — "2 sends" up there and
    // three bars down here.
    <SectionCard title="Grades" icon={<FaChartSimple />} meta="Gym and matches">
      <ProfileGradesCard
        pyramids={pyramids}
        charts={charts}
        ungradedSends={ungradedSends}
      />
    </SectionCard>
  );
}
