import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Layout,
  notFoundComponent: NotFound,
});

function Layout() {
  return (
    <div className="min-h-svh">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5 sm:px-10">
          <Link to="/" preload="intent" className="text-sm font-semibold tracking-tight">
            LinkedIn Scraper
          </Link>
          <span className="font-mono text-xs text-muted-foreground">JOB COLLECTION</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-12 sm:px-10 sm:py-16">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-6xl px-6 pb-8 text-xs text-muted-foreground sm:px-10">
        Saved from LinkedIn. Availability may have changed since collection.
      </footer>
    </div>
  );
}

function NotFound() {
  return (
    <section className="py-16">
      <p className="font-mono text-xs text-muted-foreground">404 / NOT FOUND</p>
      <h1 className="mt-4 text-3xl font-medium tracking-tight">Nothing saved here.</h1>
      <p className="mt-3 text-muted-foreground">This page or job is not in your collection.</p>
      <Button asChild variant="outline" className="mt-8">
        <Link to="/" preload="intent">Back to jobs</Link>
      </Button>
    </section>
  );
}
