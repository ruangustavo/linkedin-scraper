import { notFound } from "next/navigation";
import { JobDetail } from "@/JobDetail";
import { getJob } from "@/lib/jobs";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/jobs/[identifier]">) {
  const { identifier } = await params;
  const job = await getJob(identifier);

  if (!job) notFound();

  return pageMetadata(
    `${job.title} at ${job.company}`,
    `${job.title} at ${job.company} in ${job.location}. View the saved role and application details.`,
    `/jobs/${job.id}`,
  );
}

export default async function JobPage({ params }: PageProps<"/jobs/[identifier]">) {
  const { identifier } = await params;
  const job = await getJob(identifier);

  if (!job) notFound();

  return <JobDetail job={job} />;
}
