# linkedin-scraper

Bun workspaces for listing LinkedIn jobs and enriching selected jobs. Bun 1.4.2
is the pinned package manager and CLI/backend runtime; the Next.js web app requires
Node.js >=20.9.0. Install dependencies once at the repository root.

## Workspaces

| Workspace | Package | Responsibility |
| --- | --- | --- |
| `packages/core` | `@linkedin-scraper/core` | LinkedIn service, RSC/SDUI parsing, session parsing and core tests |
| `apps/cli` | `@linkedin-scraper/cli` | CLI arguments, local session files and JSONL input/output |
| `apps/api` | `@linkedin-scraper/api` | Elysia API for saved jobs on port 3001 |
| `apps/web` | `@linkedin-scraper/web` | Next.js 16.3.4 App Router, React 19, Tailwind v4 and shadcn/ui on port 3000 |

CLI, API and web share the core job schema through `workspace:*`. The API reads
saved JSONL records; browsing jobs never triggers scraping or enrichment.

## Development

```bash
bun install
bun run dev:api
bun run dev:web
```

Run the two development servers in separate terminals. Both accept `PORT` to override
their default port (API: 3001, web: 3000). The web scripts run
`next dev --hostname 127.0.0.1` and `next start --hostname 127.0.0.1`; both apps bind
to loopback only. Tailwind v4 runs through `@tailwindcss/postcss`.

Set `API_ORIGIN` on the web server if the API address changes (default
`http://127.0.0.1:3001`). It is server-only configuration, not a `NEXT_PUBLIC_*`
variable. Server-rendered pages fetch the API directly. The same-origin
`GET /api/*` proxy remains available in dev and production without CORS configuration,
but job pages do not fetch jobs from it in the browser.

## Saved Jobs

The API reads `jobs.jsonl` at the repository root by default. Override it with
`JOBS_FILE`, either an absolute path or a path relative to the repository root.
The file is read and validated on each request, so no server restart is needed
when its contents change. No session file or LinkedIn credentials are required.

| Endpoint | Response |
| --- | --- |
| `GET /health` | `{ "status": "ok" }` |
| `GET /jobs` | An array of saved `Job` records, in file order |
| `GET /jobs/:identifier` | A single job, matched by its string `id` |

An empty file returns `[]`. Missing jobs return 404; non-numeric identifiers return
422. Missing/unreadable files, malformed records and duplicate IDs return 503
rather than silently presenting an empty or ambiguous collection.

The web lists every saved job at `/` and job details at `/jobs/:identifier`.
Both routes use request-time server rendering: all cards, detail content and rendered
Markdown are present in the HTML without executing browser JavaScript. API reads use
`cache: "no-store"`, so later requests see saved changes without a rebuild or restart.
Direct detail URLs and reloads are supported; job links disable prefetching.
Markdown descriptions are rendered on the server without raw HTML or images;
jobs collected with `--list-only` show a description-unavailable state.
Company logos appear beside the company name on cards and detail pages, with an
initial as fallback when the logo is missing or cannot load. Older JSONL records
remain readable; collect or enrich them again to obtain `companyLogoUrl`.

## Web UI

Routes live in `apps/web/src/app`: `layout.tsx` owns the shared layout, `page.tsx`
loads the collection and `jobs/[identifier]/page.tsx` loads a job. The server-only
`src/lib/jobs.ts` validates API responses against the shared job schema and shares
the detail lookup between metadata and page rendering within a request, not across
requests. `api/[...path]/route.ts` implements the GET proxy.

The TanStack Query provider remains mounted in `providers.tsx`, but job loading does
not use it. There is no Query cache dehydration/hydration or browser-side jobs API
fetching; its 60-second stale time does not control server-rendered data freshness.
Client components still use normal React hydration.

Missing jobs, invalid job identifiers and unknown page routes return HTTP 404 with
`noindex` metadata. API failures and malformed data return HTTP 500 rather than
appearing as an empty collection or missing job. Next.js recovers metadata-triggered
404s and render errors through client-side boundaries: their `not-found.tsx` and
`error.tsx` UI appears after hydration. Successful job pages do not require hydration
to display their content. The error state's retry button reloads the server-rendered page.
Metadata streaming is disabled for all user agents via `htmlLimitedBots: /.*/` in
`next.config.ts`, so metadata and missing-job lookups resolve before streaming commits
the HTTP status.

shadcn was initialized with its CLI (`init --base radix --preset nova --no-monorepo
--yes` and `add button --yes`).
Run future shadcn commands from `apps/web`, where `components.json` lives.

Build and start the production apps with:

```bash
bun run build
bun run --filter @linkedin-scraper/api start
bun run --filter @linkedin-scraper/web start
```

Run the production servers in separate terminals. The web build uses `next build`
and writes `apps/web/.next`; this is a Next.js runtime build, not a static export or
a directory to serve with an SPA fallback. Production requires Node.js running
`next start` alongside the separate Bun API process.

The real jobs API and saved data are not required during the web build. The API must
be running and reachable through `API_ORIGIN` at runtime for collection pages, job
details, `/sitemap.xml` and proxied API requests. Building the web does not bundle a
snapshot of jobs or start the API.

Keep `jobs.jsonl`, session files, credentials, `.env` files and captures out of
`apps/web/public` and any other public asset directory. Repository data and session
files are not served as static web assets. The API reads the saved data separately;
the web does not need LinkedIn credentials or a session. Job records themselves are
exposed through the rendered pages and API to anyone who can reach those endpoints.

### SEO And Indexing

For public indexing, set `SITE_ORIGIN` on the web server to the site's public origin,
for example `https://jobs.example.com`. It must be a valid absolute HTTP(S) origin
with no userinfo (username/password), path beyond `/`, query or fragment. Invalid
values are rejected. This is separate from the internal `API_ORIGIN` and does not
change the listener hostname or port.

Canonical URLs, sitemap entries and Open Graph URLs use `SITE_ORIGIN`, not the
incoming request host or query string. Pages emit titles, descriptions, Open Graph
metadata and Twitter summary-card metadata. `/sitemap.xml` is generated at request
time and includes `/` plus every saved job's detail URL.

When `SITE_ORIGIN` is unset, URL generation falls back to `http://localhost:3000`,
pages emit `noindex, nofollow`, and `/robots.txt` emits `Disallow: /` for all crawlers.
Setting a valid `SITE_ORIGIN` enables indexing of normal pages: the default noindex
directive is removed, and robots allows `/`, disallows `/api/` and advertises the
sitemap. Missing pages remain noindex. These are crawler directives, not access
controls or a guarantee of privacy; use authentication or network restrictions if
the collection must not be publicly accessible.

No `JobPosting` structured data is emitted. Saved records have no publication date
or structured job location; the free-text `location` is not enough to supply those
fields reliably.

## CLI

Run CLI commands from the repository root so local paths, including `cookies.json`,
resolve from there. `bun start` remains an alias for `bun run cli`.
A local session is required for listing and enrichment.

```bash
bun run cli --keywords "backend engineer" --list-only --pages 10 --limit 50 --output jobs.jsonl
```

Choose an `id` from the saved file, then enrich only that job:

```bash
bun run cli enrich --input jobs.jsonl --id 1234567890 --output enriched-job.jsonl
```

Replace `1234567890` with an ID present in your file. Enrichment reads the saved
record, fetches details directly by ID, then fetches its description. It does not
repeat the search or require the original search terms, page or navigation state.

The result is one JSONL record with refreshed title/company, a company logo URL,
a Markdown description and an external application URL when available. The original
ID, location and URL are preserved. The input file is never modified; omitting
`--output` writes to stdout.

## Search Options

| Option | Purpose | Default |
| --- | --- | --- |
| `--keywords TEXT` | Job search terms | Required |
| `--geo-id ID` | LinkedIn geographic filter | Omitted |
| `--pages N` | Maximum pages, 1-100 | 1 |
| `--limit N` | Maximum jobs, 1-2500 | 25 |
| `--list-only` | Collect cards without detail or description | Off |

Omitting `--list-only` still collects full details for every result, using the same
enrichment operation. Search options cannot be passed to `enrich`.

## Enrichment Options

| Option | Purpose | Default |
| --- | --- | --- |
| `--input FILE` | Existing jobs JSONL file | Required |
| `--id ID` | Numeric ID of exactly one saved job | Required |

The command rejects missing IDs, duplicate matching IDs and malformed job records.
Existing JSONL files produced by the CLI, including `--list-only` output, work
without conversion. An already enriched record can also be refreshed.

## Shared Options

| Option | Purpose | Default |
| --- | --- | --- |
| `--session FILE` | Local session file | `cookies.json` |
| `--delay-ms N` | Pause before each request, 500-60000 ms | 2000 |
| `--output FILE` | Create a new JSONL file | stdout |

## Session

The session file accepts a browser cookie-export array or an object with `cookie`
and `csrfToken` strings. Browser exports are filtered to unexpired, root-path
cookies matching `www.linkedin.com`; `JSESSIONID` supplies the CSRF token.

`cookies.json`, `session.json` and `*.session.json` are ignored by Git. Never pass
credentials as CLI arguments or commit session files. Session files are read only;
there is no automatic login or session refresh.

## Output And Limits

Each new JSONL record contains `id`, `title`, `company`, `companyLogoUrl`, `location`,
`url`, `description` and `applyUrl`. The logo URL is null when unavailable.
Descriptions are Markdown. With `--list-only`, logos are still collected, while
`description` and `applyUrl` remain null; onsite applications also have `applyUrl: null`.

Output files are created with mode `0600` and never overwrite an existing file.
Partial output remains if a later request fails. There is no automatic resume.

Requests are sequential, with deduplication by job ID. Transport failures and
selected 5xx responses receive at most one retry. Authentication failures, HTTP 429
and unexpected response formats stop collection. Redirects are not followed.

The parser reads SDUI/RSC responses and follows the returned pagination actions.
It does not invoke application, save-job, messaging or activity-log endpoints.

## Reusable Service

Import `LinkedIn`, `Job`, `Session` and `parseSession` from `@linkedin-scraper/core`.
`LinkedIn.enrich(job, delayMs?)` returns an Effect producing the enriched `Job`;
the delay defaults to 2000 ms. `LinkedIn.scrape(options)` returns a Stream of jobs.
Provide the session with `LinkedIn.layer(session)` and the HTTP client through
Effect's `HttpClient` service.

`parseSession(text)` decodes session JSON without filesystem access. Reading local
files and writing output live in `apps/cli/src`, not in core. The API only reads
saved jobs and does not load a session or make LinkedIn requests.

## Checks

```bash
bun run test
bun run typecheck
bun run lint
bun run build
```

Core tests use synthetic RSC responses, an injected HTTP client and Effect's test
clock. They cover enrichment, list-only pagination/deduplication/limits, auth and
rate-limit failures, session-cookie filtering and RSC parsing. They require no
cookies, network access or real pacing delays. The web test script runs
`next build && bun test`, then exercises the production Next.js server with a
synthetic loopback API. It checks server-rendered collection/detail HTML and safe
Markdown without executing browser JavaScript, production assets, metadata,
sitemap/robots, request-time updates, HTTP 404s, repository-file protection, GET API
proxying and upstream failure handling. Runtime-generated files and captures
remain ignored by Git; `bun.lock` at the root is the only workspace lockfile.
