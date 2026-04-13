import { CardSkeleton } from "@/components/ui";

/**
 * In-view skeleton used while a leaderboard tab is being fetched.
 * One card-shaped block stands in for the whole podium — less
 * visible pop than reconstructing three slots that pop-in item-by-
 * item as the real data resolves.
 */
export function PodiumSkeleton() {
  return <CardSkeleton height="14rem" ariaLabel="Loading top climbers" />;
}
