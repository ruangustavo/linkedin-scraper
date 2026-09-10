import { Elysia } from "elysia";

const app = new Elysia()
  .get("/health", () => ({ status: "ok" }))
  .listen(Number(process.env.PORT ?? 3001));

console.log(`API listening on http://localhost:${app.server?.port}`);
