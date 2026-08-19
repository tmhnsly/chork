import { CardSkeleton } from "@/components/ui";
import { PROFILE_SECTION_HEIGHTS } from "./sectionHeights";

/**
 * Stands in for `ProfileStats`, which renders exactly one card now —
 * the current set. It used to draw TWO: an all-time block on top,
 * for a card ProfileStats no longer produces. That block appeared on
 * every load and then vanished when the real component streamed in,
 * which is the pop Tom saw. A fallback that is taller than what it
 * stands in for is a guaranteed shift, not a guess.
 */
export function ProfileStatsSkeleton() {
  return (
    <CardSkeleton
      height={PROFILE_SECTION_HEIGHTS.currentSet}
      ariaLabel="Loading current set"
    />
  );
}
