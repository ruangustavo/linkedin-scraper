import "server-only";
import type { Metadata } from "next";

export function siteOrigin() {
  const url = new URL(process.env.SITE_ORIGIN ?? "http://localhost:3000");

  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("SITE_ORIGIN must be an HTTP(S) origin without credentials, path, query or fragment.");
  }

  return url;
}

export function pageMetadata(title: string, description: string, path: string): Metadata {
  const fullTitle = `${title} | LinkedIn Scraper`;
  const url = new URL(path, siteOrigin());

  return {
    title: fullTitle,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: "LinkedIn Scraper",
      title: fullTitle,
      description,
      url,
    },
    twitter: { card: "summary", title: fullTitle, description },
  };
}
