"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage() {
  return (
    <section className="py-16" role="alert">
      <h1 className="text-3xl font-medium tracking-tight">Could not load saved jobs.</h1>
      <p className="mt-3 text-muted-foreground">The jobs service is unavailable. Please try again.</p>
      <Button onClick={() => window.location.reload()} className="mt-8">Try again</Button>
    </section>
  );
}
