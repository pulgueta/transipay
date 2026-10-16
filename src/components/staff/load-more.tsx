import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { InlineError } from "./inline-error";

interface LoadMoreProps {
  hasNextPage: boolean;
  isFetching: boolean;
  error: Error | null;
  onLoadMore: () => void;
}

/** The keyset "Load more" control under a table. It hides when there is no next page. */
export const LoadMore = ({
  hasNextPage,
  isFetching,
  error,
  onLoadMore,
}: LoadMoreProps) => (
  <div className="flex flex-col items-start gap-2">
    {hasNextPage ? (
      <Button
        disabled={isFetching}
        onClick={onLoadMore}
        size="sm"
        variant="outline"
      >
        {isFetching ? <Spinner data-icon="inline-start" /> : null}
        Cargar más
      </Button>
    ) : null}
    <InlineError error={error} />
  </div>
);
