import { StatsWidgetSkeleton } from "@/components/ui/StatsWidget/StatsWidgetSkeleton";

/**
 * Stands in for `ProfileStats`, which renders exactly one card — the
 * current set, i.e. `StatsWidget`. So its skeleton IS the widget's
 * skeleton: the real shell with zero data under one shimmer, which
 * lands at the hydrated card's height at every width. It used to be a
 * fixed-height block (and before that, TWO blocks, one for an
 * all-time card that no longer exists — the pop Tom saw).
 */
export function ProfileStatsSkeleton() {
  return <StatsWidgetSkeleton />;
}
