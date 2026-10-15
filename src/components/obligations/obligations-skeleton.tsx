import { Skeleton } from "@/components/ui/skeleton";

/** Matches the list layout while the page loads. */
export const ObligationsSkeleton = () => (
  <div aria-busy className="flex flex-col gap-3" aria-label="Loading">
    <Skeleton className="h-9 w-full" />
    <Skeleton className="h-14 w-full" />
    <Skeleton className="h-14 w-full" />
    <Skeleton className="h-14 w-full" />
  </div>
);

/** Matches the detail layout while the page loads. */
export const ObligationSkeleton = () => (
  <div aria-busy className="flex flex-col gap-6" aria-label="Loading">
    <Skeleton className="h-8 w-2/3" />
    <Skeleton className="h-24 w-full" />
    <Skeleton className="h-8 w-28" />
    <Skeleton className="h-32 w-full" />
  </div>
);
