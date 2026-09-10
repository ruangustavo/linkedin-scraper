import { createFileRoute } from "@tanstack/react-router";
import { App } from "@/App";
import { jobsQueryOptions } from "@/lib/jobs";

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(jobsQueryOptions);
  },
  component: App,
});
