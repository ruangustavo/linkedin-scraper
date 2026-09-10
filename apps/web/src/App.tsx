import type { Job } from "@linkedin-scraper/core";
import Link from "next/link";
import { CompanyLogo } from "@/components/CompanyLogo";

export function App({ jobs }: { jobs: ReadonlyArray<Job> }) {
  return (
    <>
      <section className="mb-12 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">Your collection</p>
          <h1 className="mt-4 text-5xl font-medium tracking-tight sm:text-6xl">Saved jobs<span className="text-muted-foreground">.</span></h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
            Browse the roles you collected. Open a card for the full description and application details.
          </p>
        </div>
        <p className="shrink-0 font-mono text-xs text-muted-foreground">
          {jobs.length.toLocaleString("en-US")} {jobs.length === 1 ? "JOB" : "JOBS"}
        </p>
      </section>

      {jobs.length === 0 ? (
        <section className="border-t border-border py-16">
          <h2 className="text-xl font-medium">Your collection is empty.</h2>
          <p className="mt-3 text-muted-foreground">Collect jobs with the CLI to see them here.</p>
        </section>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <li key={job.id} className="min-w-0">
              <Link
                href={`/jobs/${encodeURIComponent(job.id)}`}
                prefetch={false}
                className="group flex h-full flex-col rounded-xl border border-border bg-card p-6 transition-colors hover:border-foreground/40 hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              >
                <div className="flex items-center gap-3">
                  <CompanyLogo company={job.company} src={job.companyLogoUrl} />
                  <p className="min-w-0 text-sm text-muted-foreground wrap-anywhere">{job.company}</p>
                </div>
                <h2 className="mt-3 text-xl leading-snug font-medium tracking-tight wrap-anywhere">{job.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground wrap-anywhere">{job.location}</p>
                <div className="mt-auto pt-8">
                  <div className="flex items-center justify-between gap-3 border-t border-border pt-4 text-xs">
                    <span className="text-muted-foreground">{job.description?.trim() ? "Description available" : "Listing only"}</span>
                    <span className="font-medium underline-offset-4 group-hover:underline">View job</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
