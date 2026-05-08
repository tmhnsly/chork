import type { PaginatedComments } from "@/lib/data";

/**
 * Data returned by `fetchRouteData`, cacheable at the SendsGrid level
 * so re-opening the same route inside one session skips the round-trip.
 *
 * Lives in its own module (rather than alongside `RouteLogSheet`) so
 * `SendsGrid` can hold the type without importing the heavy component
 * tree just to satisfy a type reference.
 */
export interface CachedRouteData {
  grade: number | null;
  comments: PaginatedComments;
  likedIds: string[];
}
