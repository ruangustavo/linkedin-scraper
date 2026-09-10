import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <section className="py-16">
      <p className="font-mono text-xs text-muted-foreground">404 / NOT FOUND</p>
      <h1 className="mt-4 text-3xl font-medium tracking-tight">Nothing saved here.</h1>
      <p className="mt-3 text-muted-foreground">This page or job is not in your collection.</p>
      <Button asChild variant="outline" className="mt-8">
        <Link href="/" prefetch={false}>Back to jobs</Link>
      </Button>
    </section>
  );
}
