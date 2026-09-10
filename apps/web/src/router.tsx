import { QueryClient, useQueryErrorResetBoundary } from "@tanstack/react-query";
import { createRouter, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { routeTree } from "./routeTree.gen";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: false,
    },
  },
});

export const router = createRouter({
  routeTree,
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

function Loading() {
  return <p role="status" className="py-20 text-muted-foreground">Loading jobs...</p>;
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
