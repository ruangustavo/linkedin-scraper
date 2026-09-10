import type { Job } from "@linkedin-scraper/core";
import Link from "next/link";
import Markdown from "react-markdown";
import { CompanyLogo } from "@/components/CompanyLogo";
import { Button } from "@/components/ui/button";

function externalUrl(url: string | null) {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

export function JobDetail({ job }: { job: Job }) {
  const applyUrl = externalUrl(job.applyUrl);
  const linkedInUrl = externalUrl(job.url);

  return (
    <article>
      <Link href="/" prefetch={false} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        Back to jobs
      </Link>

      <header className="mt-10 border-b border-border pb-10">
        <div className="flex items-center gap-3">
          <CompanyLogo company={job.company} src={job.companyLogoUrl} />
          <p className="min-w-0 text-base text-muted-foreground wrap-anywhere">{job.company}</p>
        </div>
        <h1 className="mt-4 max-w-4xl text-4xl leading-tight font-medium tracking-tight wrap-anywhere sm:text-5xl">{job.title}</h1>
        <p className="mt-5 text-muted-foreground wrap-anywhere">{job.location}</p>
      </header>

      <div className="grid gap-12 pt-10 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-16">
        <section className="min-w-0" aria-labelledby="description-heading">
          <h2 id="description-heading" className="mb-6 text-xl font-medium tracking-tight">About the role</h2>
          {job.description?.trim() ? (
            <div className="job-description text-sm leading-7 wrap-anywhere sm:text-base">
              <Markdown skipHtml disallowedElements={["img"]} urlTransform={externalUrl}>
                {job.description}
              </Markdown>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-6">
              <p className="font-medium">No description saved yet.</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                This job was collected as a listing only. Visit LinkedIn for the full description.
              </p>
            </div>
          )}
        </section>

        <aside className="self-start rounded-xl border border-border p-6 lg:sticky lg:top-8">
          <p className="font-mono text-xs text-muted-foreground">JOB / {job.id}</p>
          <h2 className="mt-5 text-lg font-medium">Take the next step</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Check the original listing for current availability before applying.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            {applyUrl && (
              <Button asChild size="lg">
                <a href={applyUrl} target="_blank" rel="noopener noreferrer">Apply for this role</a>
              </Button>
            )}
            {linkedInUrl && (
              <Button asChild variant="outline" size="lg">
                <a href={linkedInUrl} target="_blank" rel="noopener noreferrer">View on LinkedIn</a>
              </Button>
            )}
          </div>
        </aside>
      </div>
    </article>
  );
}
