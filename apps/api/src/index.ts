import { Elysia } from "elysia";
import { jobs } from "./jobs.ts";

const app = new Elysia()
  .get("/health", () => ({ status: "ok" }))
  .use(jobs)
  .listen({ hostname: "127.0.0.1", port: Number(process.env.PORT ?? 3001) });

console.log(`API listening on http://localhost:${app.server?.port}`);
