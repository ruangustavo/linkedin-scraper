import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { siteOrigin } from "@/lib/seo";
import { Providers } from "./providers";
import "../index.css";

export function generateMetadata(): Metadata {
  return {
    metadataBase: siteOrigin(),
    title: "LinkedIn Scraper",
    robots: process.env.SITE_ORIGIN ? undefined : { index: false, follow: false },
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="min-h-svh">
            <header className="border-b border-border">
              <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5 sm:px-10">
                <Link href="/" prefetch={false} className="text-sm font-semibold tracking-tight">LinkedIn Scraper</Link>
                <span className="font-mono text-xs text-muted-foreground">JOB COLLECTION</span>
              </div>
            </header>
            <main className="mx-auto max-w-6xl px-6 py-12 sm:px-10 sm:py-16">{children}</main>
            <footer className="mx-auto max-w-6xl px-6 pb-8 text-xs text-muted-foreground sm:px-10">
              Saved from LinkedIn. Availability may have changed since collection.
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
