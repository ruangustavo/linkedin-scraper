import { afterAll, beforeAll, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const api = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: (request) => {
    const url = new URL(request.url);

    return Response.json({ path: url.pathname, search: url.search }, { status: 422 });
  },
});

const web = Bun.spawn([process.execPath, "src/server.ts"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: { ...process.env, NODE_ENV: "production", PORT: "0", API_ORIGIN: api.url.href },
  stdout: "pipe",
  stderr: "inherit",
});

let origin: string;

afterAll(async () => {
  web.kill();
  await web.exited;
  await api.stop(true);
});

beforeAll(async () => {
  const reader = web.stdout.getReader();
  const decoder = new TextDecoder();
  let output = "";

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) throw new Error(`Web server exited before listening: ${output}`);

      output += decoder.decode(value, { stream: true });
      const match = output.match(/Web listening on (http:\/\/[^\s]+)/);

      if (match?.[1]) {
        origin = match[1];

        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
});

test("serves the Vite build and supports direct detail URLs", async () => {
  const index = await Bun.file(new URL("../dist/index.html", import.meta.url)).text();

  for (const path of ["/", "/jobs/123"]) {
    const response = await fetch(new URL(path, origin));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toBe(index);
  }

  const assets = [...index.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)];

  expect(assets.length).toBeGreaterThanOrEqual(2);

  for (const [, asset] of assets) {
    if (!asset) throw new Error("Missing asset path");

    const response = await fetch(new URL(asset, origin));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(asset.endsWith(".css") ? "text/css" : "javascript");
  }

  expect((await fetch(new URL("/assets/missing.js", origin))).status).toBe(404);
  expect((await fetch(new URL("/assets/%2e%2e%2fcookies.json", origin))).status).toBe(404);
});

test("proxies API paths, query strings and error statuses", async () => {
  const response = await fetch(new URL("/api/jobs/invalid?limit=1", origin));

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({ path: "/jobs/invalid", search: "?limit=1" });
});

test("returns a JSON gateway error when the API is unavailable", async () => {
  await api.stop(true);
  const response = await fetch(new URL("/api/jobs", origin));

  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ message: "The jobs API is unavailable." });
});
