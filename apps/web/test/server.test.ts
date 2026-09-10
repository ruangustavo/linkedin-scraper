import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { Job } from "@linkedin-scraper/core";
import { fileURLToPath } from "node:url";

const siteOrigin = "https://jobs.example.test";

const engineer: Job = {
  id: "101",
  title: "Platform Engineer",
  company: "Acme Labs",
  companyLogoUrl: null,
  location: "Remote, Europe",
  url: "https://www.linkedin.com/jobs/view/101/",
  applyUrl: "https://example.com/apply/101",
  description: [
    "## What you will build",
    "Build **reliable pipelines** & ship useful tools.",
    "- Operate queues\n- Improve observability",
    "[Engineering handbook](https://example.com/handbook)",
    '<script>globalThis.__fixtureXss = true</script>',
    '<img src="x" onerror="globalThis.__fixtureXss = true">',
    "[Unsafe link](javascript:alert(1))",
  ].join("\n\n"),
};

const designer: Job = {
  ...engineer,
  id: "202",
  title: "Product Designer",
  company: "Orbit Studio",
  location: "London, UK",
  url: "https://www.linkedin.com/jobs/view/202/",
  description: null,
  applyUrl: null,
};

let jobs: Job[] = [engineer, designer];

let status = 200;

let malformed: "json" | "job" | null = null;

const requests: string[] = [];

function serveApi(port = 0) {
  return Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch(request) {
      const url = new URL(request.url);
      requests.push(url.pathname);

      if (url.pathname === "/health") return Response.json({ status: "ok" });

      if (url.pathname.startsWith("/echo/")) {
        return Response.json({ method: request.method, path: url.pathname, search: url.search }, { status });
      }

      if (status !== 200) return Response.json({ message: "Could not read saved jobs." }, { status });

      if (malformed === "json") return new Response("{broken", { headers: { "content-type": "application/json" } });

      if (malformed === "job") {
        const invalid = { ...designer, id: 202, description: 42 };

        return Response.json(url.pathname === "/jobs" ? [engineer, invalid] : invalid);
      }

      if (url.pathname === "/jobs") return Response.json(jobs);

      const identifier = url.pathname.match(/^\/jobs\/([^/]+)$/)?.[1];

      if (identifier && !/^\d+$/.test(identifier)) {
        return Response.json({ message: "Invalid job identifier." }, { status: 422 });
      }

      const job = jobs.find((job) => job.id === identifier);

      return job ? Response.json(job) : Response.json({ message: "Job not found." }, { status: 404 });
    },
  });
}

let api = serveApi();

let web: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined;

let origin = "";

let output = "";

const outputReaders: Promise<void>[] = [];

async function capture(stream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const reader = stream.getReader();

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) return;
      output = (output + decoder.decode(value, { stream: true })).slice(-2000);
    }
  } finally {
    reader.releaseLock();
  }
}

function get(path: string, timeout = 5000) {
  return fetch(new URL(path, origin), { redirect: "manual", signal: AbortSignal.timeout(timeout) });
}

// Parse actual elements, never strings inside hydration/RSC scripts. Assertions only print selected values.
function select(html: string, selector: string, attribute?: string) {
  const values: string[] = [];

  const source = attribute ? html : new HTMLRewriter().on("script, style, template, noscript", {
    element(element) { element.remove(); },
  }).transform(html);

  new HTMLRewriter().on(selector, {
    element(element) { values.push(attribute ? element.getAttribute(attribute) ?? "" : ""); },
    text(chunk) { if (!attribute) values[values.length - 1] += chunk.text; },
  }).transform(source);

  const entities = new Map([["amp", "&"], ["lt", "<"], ["gt", ">"], ["quot", '"'], ["apos", "'"]]);

  return values.map((value) => value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code: string) => {
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(code[1] === "x" ? 2 : 1), code[1] === "x" ? 16 : 10));

    return entities.get(code) ?? entity;
  }).replace(/\s+/g, " ").trim());
}

async function page(path: string) {
  const response = await get(path);
  expect(response.headers.get("content-type")).toContain("text/html");

  return { response, html: await response.text() };
}

async function expectUnavailable(path: string) {
  const { response, html } = await page(path);
  const text = select(html, "h1, h2, p").join(" ");

  // Next renders error boundaries on the client; HTTP must still report failure before hydration.
  expect(response.status).toBe(500);
  expect(text).not.toMatch(/collection is empty|nothing saved here|not found/i);
  expect(select(html, "h1, h2")).not.toContain(engineer.title);
}

describe.serial("production HTTP contract", () => {
  beforeAll(async () => {
    const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
    const port = reservation.port;
    await reservation.stop(true);

    if (!port) throw new Error("Could not reserve a web port.");
    origin = `http://127.0.0.1:${port}`;

    web = Bun.spawn([process.execPath, "run", "start"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(port),
        API_ORIGIN: api.url.origin,
        SITE_ORIGIN: siteOrigin,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      detached: true,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    outputReaders.push(capture(web.stdout), capture(web.stderr));
    const deadline = Date.now() + 20000;

    while (Date.now() < deadline && web.exitCode === null) {
      try {
        const response = await get("/api/health", 500);
        const body = await response.text();

        if (response.status === 200 && body === '{"status":"ok"}') return;
      } catch {
        // The production listener may not have bound its reserved port yet.
      }

      await Bun.sleep(50);
    }

    throw new Error(`Production server not ready (exit ${web.exitCode}). ${output.replace(/<[^>]*>/g, "").slice(-1000)}`);
  }, 25000);

  beforeEach(() => {
    jobs = [engineer, designer];
    status = 200;
    malformed = null;
    requests.length = 0;
  });

  afterAll(async () => {
    try {
      // bun run starts a child runtime; kill the entire POSIX process group, not just the script runner.
      if (web) {
        try {
          process.kill(-web.pid, "SIGKILL");
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
        }

        await web.exited;
      }

      await Promise.all(outputReaders);
    } finally {
      await api.stop(true);
    }
  });

  test("renders the collection and follows its job links without executing JavaScript", async () => {
    const { response, html } = await page("/");

    expect(response.status).toBe(200);
    expect(select(html, "h1").join(" ")).toContain("Saved jobs");

    for (const job of jobs) {
      expect(select(html, "h2")).toContain(job.title);
      expect(select(html, "p")).toContain(job.company);
      expect(select(html, "p")).toContain(job.location);
      const href = select(html, "a[href]", "href").find((href) => href === `/jobs/${job.id}`);
      expect(href).toBe(`/jobs/${job.id}`);

      if (!href) throw new Error(`Missing link for job ${job.id}`);
      const detail = await page(href);
      expect(detail.response.status).toBe(200);
      expect(select(detail.html, "h1")).toEqual([job.title]);
    }

    expect(requests).toContain("/jobs");
  });

  test("renders safe Markdown, application links and the listing-only fallback on direct detail requests", async () => {
    const { response, html } = await page(`/jobs/${engineer.id}`);

    expect(response.status).toBe(200);
    expect(select(html, "h1")).toEqual([engineer.title]);
    expect(requests.filter((path) => path === `/jobs/${engineer.id}`)).toHaveLength(1);
    expect(select(html, "p")).toContain(engineer.company);
    expect(select(html, "p")).toContain(engineer.location);
    expect(select(html, "h2")).toContain("What you will build");
    expect(select(html, "p")).toContain("Build reliable pipelines & ship useful tools.");
    expect(select(html, "strong")).toContain("reliable pipelines");
    expect(select(html, "li")).toContain("Operate queues");
    expect(select(html, "a[href]", "href")).toEqual(expect.arrayContaining([
      "/", engineer.url, engineer.applyUrl, "https://example.com/handbook",
    ]));
    expect(select(html, "[onerror], [onclick], a[href^='javascript:'], img[src='x']", "src")).toEqual([]);
    expect(/<script\b[^>]*>\s*globalThis\.__fixtureXss/.test(html)).toBe(false);

    const listing = await page(`/jobs/${designer.id}`);
    expect(listing.response.status).toBe(200);
    expect(select(listing.html, "p")).toContain("No description saved yet.");
  });

  test("serves the CSS and JavaScript referenced by both production pages", async () => {
    for (const path of ["/", `/jobs/${engineer.id}`]) {
      const { html } = await page(path);

      for (const [selector, attribute, contentType] of [
        ['link[rel="stylesheet"]', "href", "text/css"],
        ["script[src]", "src", "javascript"],
      ]) {
        if (!selector || !attribute || !contentType) throw new Error("Missing asset assertion.");
        const assets = select(html, selector, attribute);
        expect(assets.length).toBeGreaterThan(0);

        for (const asset of new Set(assets)) {
          expect(new URL(asset, origin).origin).toBe(origin);
          const response = await get(asset);
          expect(response.status).toBe(200);
          expect(response.headers.get("content-type")).toContain(contentType);
          expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
        }
      }
    }

    expect((await get("/assets/missing.js")).status).toBe(404);
  });

  test("uses SITE_ORIGIN canonicals and escaped job metadata in HTML, Open Graph and Twitter", async () => {
    const job: Job = { ...engineer, title: 'Platform "Engineer" & <Lead>', company: 'Acme " data-seo-injected="yes', location: "Remote <EU> & UK" };
    jobs = [job];

    for (const path of ["/", `/jobs/${job.id}`]) {
      const { response, html } = await page(`${path}?utm_source=test`);
      const title = select(html, "title");
      const descriptions = select(html, 'meta[name="description"]', "content");
      const description = descriptions[0] ?? "";
      const canonical = `${siteOrigin}${path}`;

      expect(response.status).toBe(200);
      expect(title).toHaveLength(1);
      expect(title[0]).toContain("LinkedIn Scraper");
      expect(descriptions).toHaveLength(1);
      expect(description.length).toBeGreaterThan(0);
      expect(select(html, 'meta[name="robots"]', "content").join(",")).not.toMatch(/noindex/i);

      if (path !== "/") {
        expect(title).toEqual([`${job.title} at ${job.company} | LinkedIn Scraper`]);
        const prefix = `${job.title} at ${job.company} in ${job.location}. `;
        expect(description.startsWith(prefix)).toBe(true);
        expect(description.length).toBeGreaterThan(prefix.length);
      }

      expect(select(html, 'link[rel="canonical"]', "href").map((url) => new URL(url).href)).toEqual([canonical]);
      expect(select(html, 'meta[property="og:url"]', "content").map((url) => new URL(url).href)).toEqual([canonical]);
      expect(select(html, 'meta[property="og:title"]', "content")).toEqual(title);
      expect(select(html, 'meta[name="twitter:title"]', "content")).toEqual(title);
      expect(select(html, 'meta[property="og:description"]', "content")).toEqual(descriptions);
      expect(select(html, 'meta[name="twitter:description"]', "content")).toEqual(descriptions);
      expect(select(html, 'meta[name="twitter:card"]', "content")[0]).toMatch(/^summary(_large_image)?$/);
      expect(select(html, "[data-seo-injected]", "data-seo-injected")).toEqual([]);
    }
  });

  test("reads changed collection, detail and metadata on the next request without a restart", async () => {
    expect(select((await page("/")).html, "h2")).toContain(engineer.title);
    expect(select((await page(`/jobs/${engineer.id}`)).html, "h1")).toEqual([engineer.title]);
    const updated = { ...engineer, title: "Staff Infrastructure Engineer", description: "A newly saved description." } satisfies Job;
    jobs = [updated];
    requests.length = 0;

    const index = await page("/");
    const detail = await page(`/jobs/${engineer.id}`);

    expect(index.response.status).toBe(200);
    expect(detail.response.status).toBe(200);
    expect(select(index.html, "h2")).toContain(updated.title);
    expect(select(index.html, "h2")).not.toContain(engineer.title);
    expect(select(index.html, "a[href]", "href")).not.toContain(`/jobs/${designer.id}`);
    expect(select(detail.html, "h1")).toEqual([updated.title]);
    expect(select(detail.html, "p")).toContain(updated.description);
    expect(select(detail.html, "title")).toEqual([`${updated.title} at ${updated.company} | LinkedIn Scraper`]);
    expect(requests).toEqual(expect.arrayContaining(["/jobs", `/jobs/${engineer.id}`]));
  });

  test("renders an empty collection as a successful page, not an API failure", async () => {
    jobs = [];
    const { response, html } = await page("/");

    expect(response.status).toBe(200);
    expect(select(html, "h1").join(" ")).toContain("Saved jobs");
    expect(select(html, "h2")).toContain("Your collection is empty.");
    expect(select(html, "p")).toContain("Collect jobs with the CLI to see them here.");
    expect(select(html, 'a[href^="/jobs/"]', "href")).toEqual([]);
  });

  test("returns real HTTP 404 and robots noindex for missing, invalid and unknown routes", async () => {
    for (const path of ["/jobs/999999", "/jobs/invalid", "/jobs/101abc", "/unknown-page"]) {
      const { response, html } = await page(path);

      expect(response.status, path).toBe(404);
      expect(select(html, 'meta[name="robots"]', "content").join(",")).toMatch(/\bnoindex\b/i);
      expect(select(html, "h1")).not.toContain(engineer.title);

      // A metadata notFound() returns an error shell until hydration; unmatched routes render the 404 directly.
      if (path === "/unknown-page") {
        expect(select(html, "h1, h2, p").join(" ")).toMatch(/not found|nothing saved here|not in your collection/i);
        expect(select(html, "a[href]", "href")).toContain("/");
      }
    }
  });

  test("does not serve repository files or a successful SPA fallback for private paths", async () => {
    for (const path of [
      "/cookies.json", "/jobs.jsonl", "/.env", "/.env.local",
      "/@fs/etc/passwd", `/@fs${fileURLToPath(new URL("../../../cookies.json", import.meta.url))}`,
      "/assets/%2e%2e%2fcookies.json", "/%2eenv",
    ]) {
      const response = await get(path);
      await response.body?.cancel();
      expect(response.status, path).toBe(404);
    }
  });

  test("keeps upstream errors and malformed JSON/Job data distinct from empty and missing pages", async () => {
    const failures: Array<{ status: number; malformed: typeof malformed }> = [
      { status: 503, malformed: null }, { status: 200, malformed: "json" }, { status: 200, malformed: "job" },
    ];

    for (const failure of failures) {
      status = failure.status;
      malformed = failure.malformed;
      await expectUnavailable("/");
      await expectUnavailable(`/jobs/${engineer.id}`);
      const sitemap = await get("/sitemap.xml");
      await sitemap.body?.cancel();
      expect(sitemap.status).toBeGreaterThanOrEqual(500);
      expect(sitemap.status).toBeLessThan(600);
    }
  });

  test("publishes a request-time sitemap and robots policy using SITE_ORIGIN", async () => {
    const added: Job = { ...designer, id: "303", url: "https://www.linkedin.com/jobs/view/303/" };

    for (const collection of [[engineer, designer], [engineer, added], []]) {
      jobs = collection;
      const response = await get("/sitemap.xml");
      const xml = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("xml");
      expect(/<urlset\b[^>]*xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/.test(xml)).toBe(true);
      expect(select(xml, "loc").sort()).toEqual([`${siteOrigin}/`, ...jobs.map((job) => `${siteOrigin}/jobs/${job.id}`)].sort());
    }

    const response = await get("/robots.txt");
    const robots = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(robots.split(/\r?\n/).map((line) => line.trim())).toEqual(expect.arrayContaining([
      "User-Agent: *", "Allow: /", "Disallow: /api/", `Sitemap: ${siteOrigin}/sitemap.xml`,
    ]));
  });

  test("proxies GET paths, encoded searches, JSON bodies and upstream statuses unchanged", async () => {
    for (const upstreamStatus of [200, 422, 503]) {
      status = upstreamStatus;
      const response = await get("/api/echo/nested%20path?tag=a&tag=b&q=R%26D+jobs&next=%2Fjobs%2F101");

      expect(response.status).toBe(upstreamStatus);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(await response.json()).toEqual({
        method: "GET", path: "/echo/nested%20path", search: "?tag=a&tag=b&q=R%26D+jobs&next=%2Fjobs%2F101",
      });
    }

    status = 200;
    expect(await (await get("/api/jobs")).json()).toEqual(jobs);
    expect(await (await get(`/api/jobs/${engineer.id}`)).json()).toEqual(engineer);
    expect((await get("/api/jobs/999999")).status).toBe(404);
    expect((await get("/api/jobs/invalid")).status).toBe(422);
  });

  test("returns JSON 502 on transport failure and does not render unavailable data as empty or missing", async () => {
    const port = api.port;

    if (!port) throw new Error("Missing API port.");
    await api.stop(true);

    try {
      const response = await get("/api/jobs");
      expect(response.status).toBe(502);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(await response.json()).toEqual({ message: "The jobs API is unavailable." });
      await expectUnavailable("/");
      await expectUnavailable(`/jobs/${engineer.id}`);
      const sitemap = await get("/sitemap.xml");
      await sitemap.body?.cancel();
      expect(sitemap.status).toBeGreaterThanOrEqual(500);
      expect(sitemap.status).toBeLessThan(600);
    } finally {
      api = serveApi(port);
    }
  });
});
