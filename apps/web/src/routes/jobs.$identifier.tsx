import { createFileRoute, notFound } from "@tanstack/react-router";
import { JobDetail } from "@/JobDetail";
import { jobQueryOptions } from "@/lib/jobs";

export const Route = createFileRoute("/jobs/$identifier")({
  loader: async ({ context, params }) => {
    const job = await context.queryClient.ensureQueryData(jobQueryOptions(params.identifier));

    if (!job) throw notFound();
  },
  component: JobDetail,
});
