import { QueryClient, useQueryErrorResetBoundary } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  notFound,
  Outlet,
  useRouter,
} from "@tanstack/react-router";
import { App } from "./App";
import { JobDetail } from "./JobDetail";
import { Button } from "@/components/ui/button";
import { jobQueryOptions, jobsQueryOptions } from "@/lib/jobs";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: false,
    },
  },
});

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Layout,
  notFoundComponent: NotFound,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(jobsQueryOptions);
  },
  component: App,
});

const jobRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/jobs/$identifier",
  loader: async ({ context, params }) => {
    const job = await context.queryClient.ensureQueryData(jobQueryOptions(params.identifier));

    if (!job) throw notFound();
  },
  component: JobDetail,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, jobRoute]),
  context: { queryClient },
  defaultPreloadStaleTime: 0,
  defaultPendingComponent: Loading,
  defaultErrorComponent: LoadError,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

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

function Loading() {
  return <p role="status" className="py-20 text-muted-foreground">Loading jobs...</p>;
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

function LoadError() {
  const router = useRouter();
  const { reset } = useQueryErrorResetBoundary();

  return (
    <section role="alert" className="py-16">
      <h1 className="text-3xl font-medium tracking-tight">Jobs could not be loaded.</h1>
      <p className="mt-3 text-muted-foreground">Check that the API is running and the saved jobs file is available.</p>
      <Button className="mt-8" onClick={() => {
        reset();
        void router.invalidate();
      }}>
        Try again
      </Button>
    </section>
  );
}
