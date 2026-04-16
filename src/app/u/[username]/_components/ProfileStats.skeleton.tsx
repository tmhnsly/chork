import { CardSkeleton } from "@/components/ui";
import { PROFILE_SECTION_HEIGHTS } from "./sectionHeights";

export function ProfileStatsSkeleton() {
  return (
    <>
      <CardSkeleton
        height={PROFILE_SECTION_HEIGHTS.allTime}
        ariaLabel="Loading all-time stats"
      />
      <CardSkeleton
        height={PROFILE_SECTION_HEIGHTS.currentSet}
        ariaLabel="Loading current set"
      />
    </>
  );
}
