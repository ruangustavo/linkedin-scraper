import { App } from "@/App";
import { getJobs } from "@/lib/jobs";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return pageMetadata("Saved jobs", "Browse saved jobs, explore companies and locations, and read full role descriptions and application details.", "/");
}

export default async function JobsPage() {
  const jobs = await getJobs();

  return <App jobs={jobs} />;
}
