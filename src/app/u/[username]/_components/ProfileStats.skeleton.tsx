import { CardSkeleton } from "@/components/ui";

export function ProfileStatsSkeleton() {
  return (
    <>
      <CardSkeleton height="21rem" ariaLabel="Loading all-time stats" />
      <CardSkeleton height="18rem" ariaLabel="Loading current set" />
    </>
  );
}
