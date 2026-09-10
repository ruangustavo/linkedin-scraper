import { Button } from "@/components/ui/button";

export function App() {
  return (
    <main className="grid min-h-svh place-items-center px-6 py-16">
      <section className="w-full max-w-xl border-t border-border pt-8">
        <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
          apps / web
        </p>
        <h1 className="mt-6 text-4xl font-medium tracking-tight sm:text-5xl">
          LinkedIn Scraper
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          A starting point with Bun, React 19, Tailwind CSS and shadcn/ui.
        </p>
        <Button asChild variant="outline" className="mt-8">
          <a href="https://ui.shadcn.com/docs">shadcn/ui documentation</a>
        </Button>
      </section>
    </main>
  );
}
