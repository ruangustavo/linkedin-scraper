import { Job } from "@linkedin-scraper/core";
import { queryOptions } from "@tanstack/react-query";
import { Schema } from "effect";

const decodeJobs = Schema.decodeUnknownSync(Schema.Array(Job));

const decodeJob = Schema.decodeUnknownSync(Job);

export const jobsQueryOptions = queryOptions({
  queryKey: ["jobs"],
  queryFn: async ({ signal }) => {
    const response = await fetch("/api/jobs", { signal });

    if (!response.ok) {
      throw new Error("Could not load saved jobs. Please try again.");
    }

    return decodeJobs(await response.json());
  },
});

export function jobQueryOptions(identifier: string) {
  return queryOptions({
    queryKey: ["jobs", identifier],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/jobs/${encodeURIComponent(identifier)}`, { signal });

      if (response.status === 404 || response.status === 422) return null;

      if (!response.ok) {
        throw new Error("Could not load this job. Please try again.");
      }

      return decodeJob(await response.json());
    },
  });
}
