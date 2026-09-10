"use client";

import { useState } from "react";
import type { Job } from "@linkedin-scraper/core";

export function CompanyLogo({ company, src }: { company: string; src: Job["companyLogoUrl"] }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  return (
    <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted text-sm font-medium text-muted-foreground">
      {src && /^https?:\/\//i.test(src) && failedUrl !== src ? (
        <img
          key={src}
          src={src}
          alt=""
          width={40}
          height={40}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(src)}
          className="size-full bg-white object-contain"
        />
      ) : company.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}
