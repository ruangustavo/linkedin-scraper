import { fileURLToPath } from "node:url";

const index = Bun.file(new URL("../dist/index.html", import.meta.url));

if (!(await index.exists())) {
  throw new Error("Missing web build. Run bun run build before starting the web server.");
}

const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:3001";

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/api/*": async (request) => {
      const requestUrl = new URL(request.url);
      const url = new URL(apiOrigin);
      url.pathname = requestUrl.pathname.slice(4);
      url.search = requestUrl.search;

      try {
        return await fetch(url, {
          method: request.method,
          signal: request.signal,
          redirect: "error",
        });
      } catch {
        return Response.json({ message: "The jobs API is unavailable." }, { status: 502 });
      }
    },
    "/assets/*": { dir: fileURLToPath(new URL("../dist/assets", import.meta.url)) },
    "/*": new Response(index),
  },
  development: false,
});

console.log(`Web listening on ${server.url}`);
