import "server-only";
import { Job } from "@linkedin-scraper/core";
import { Schema } from "effect";
import { cache } from "react";

const decodeJobs = Schema.decodeUnknownSync(Schema.Array(Job));

const decodeJob = Schema.decodeUnknownSync(Job);

export async function getJobs() {
  const response = await fetch(new URL("/jobs", process.env.API_ORIGIN ?? "http://127.0.0.1:3001"), {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new Error("Could not load saved jobs. Please try again.");

  return decodeJobs(await response.json());
}

// Metadata and the page share one lookup, never a cache across requests.
export const getJob = cache(async (identifier: string) => {
  if (!/^\d+$/.test(identifier)) return null;

  const response = await fetch(new URL(`/jobs/${identifier}`, process.env.API_ORIGIN ?? "http://127.0.0.1:3001"), {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 404 || response.status === 422) return null;

  if (!response.ok) throw new Error("Could not load this job. Please try again.");

  return decodeJob(await response.json());
});
