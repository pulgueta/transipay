import { createFileRoute } from "@tanstack/react-router";

import { serverEnv } from "@/env/server";
import { handleJobsRequest } from "@/server/jobs/request";
import { runScheduledJobsWithWompi } from "@/server/jobs/run-jobs";

const handle = async ({ request }: { request: Request }) =>
  await handleJobsRequest(request, {
    secret: serverEnv.JOBS_SECRET,
    run: runScheduledJobsWithWompi,
  });

// Endpoint for a scheduler. It runs the payout queue and the payment sweep. `JOBS_SECRET` is the authentication.
export const Route = createFileRoute("/api/jobs/run")({
  server: {
    handlers: {
      POST: handle,
      // Another method gets 405, or 404 when the route is disabled.
      ANY: handle,
    },
  },
});
