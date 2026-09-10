import { resolve } from "node:path";
import { Job } from "@linkedin-scraper/core";
import { Schema } from "effect";
import { Elysia, t } from "elysia";

const jobsFile = resolve(import.meta.dir, "../../..", process.env.JOBS_FILE ?? "jobs.jsonl");

const decodeJob = Schema.decodeUnknownSync(Schema.fromJsonString(Job));

export const jobs = new Elysia()
  .resolve(async ({ status }) => {
    try {
      const text = await Bun.file(jobsFile).text();
      const jobs: Job[] = [];
      const identifiers = new Set<string>();

      for (const line of text.split("\n")) {
        if (!line.trim()) continue;

        const job = decodeJob(line);

        if (!/^\d+$/.test(job.id) || identifiers.has(job.id)) {
          return status(503, { message: "Saved jobs contain invalid or duplicate identifiers." });
        }

        identifiers.add(job.id);
        jobs.push(job);
      }

      return { jobs };
    } catch {
      return status(503, { message: "Could not read saved jobs. Check JOBS_FILE and its JSONL records." });
    }
  })
  .get("/jobs", ({ jobs }) => jobs)
  .get("/jobs/:identifier", ({ jobs, params, status }) => {
    const job = jobs.find((job) => job.id === params.identifier);

    return job ?? status(404, { message: "Job not found." });
  }, {
    params: t.Object({ identifier: t.String({ pattern: "^[0-9]+$" }) }),
  });
