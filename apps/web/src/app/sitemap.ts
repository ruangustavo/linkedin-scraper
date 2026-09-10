import type { MetadataRoute } from "next";
import { getJobs } from "@/lib/jobs";
import { siteOrigin } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const jobs = await getJobs();
  const origin = siteOrigin();

  return [
    { url: origin.href },
    ...jobs.map((job) => ({ url: new URL(`/jobs/${encodeURIComponent(job.id)}`, origin).href })),
  ];
}
