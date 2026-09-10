import index from "../index.html";

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
    "/*": index,
  },
  development: process.env.NODE_ENV !== "production",
});

console.log(`Web listening on ${server.url}`);
