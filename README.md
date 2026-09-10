# linkedin-scraper

Bun workspaces for listing LinkedIn jobs and enriching selected jobs. Bun 1.4.2
is the pinned package manager/runtime; install dependencies once at the repository root.

## Workspaces

| Workspace | Package | Responsibility |
| --- | --- | --- |
| `packages/core` | `@linkedin-scraper/core` | LinkedIn service, RSC/SDUI parsing, session parsing and core tests |
| `apps/cli` | `@linkedin-scraper/cli` | CLI arguments, local session files and JSONL input/output |
| `apps/api` | `@linkedin-scraper/api` | Elysia API for saved jobs on port 3001 |
| `apps/web` | `@linkedin-scraper/web` | Vite, React 19, TanStack Query/Router, Tailwind v4 and shadcn/ui on port 3000 |

CLI, API and web share the core job schema through `workspace:*`. The API reads
saved JSONL records; browsing jobs never triggers scraping or enrichment.

## Development

```bash
bun install
bun run dev:api
bun run dev:web
```

Run the two development servers in separate terminals. Both accept `PORT` to override
their default port. The web uses Vite with React Fast Refresh and `@tailwindcss/vite`.
Vite requires Node.js 20.19+ or 22.12+; Bun remains the package manager and backend runtime.
Both servers bind to loopback only. If the API port changes, set `API_ORIGIN` on the
web server (default `http://127.0.0.1:3001`). The web proxies `/api/*` to the API so
the browser uses same-origin requests without CORS configuration.

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

The web lists cards at `/` and job details at `/jobs/:identifier`. Route loaders
populate TanStack Query's cache; `Link` uses intent preloading on hover, focus and
touch. Query owns freshness with a 60-second stale time. Direct detail URLs and
reloads are supported. Markdown descriptions are rendered without raw HTML or
images; jobs collected with `--list-only` show a description-unavailable state.
Company logos appear beside the company name on cards and detail pages, with an
initial as fallback when the logo is missing or cannot load. Older JSONL records
remain readable; collect or enrich them again to obtain `companyLogoUrl`.

## Web UI

Routes live in `apps/web/src/routes`: `__root.tsx` owns the layout, `index.tsx`
loads the collection and `jobs.$identifier.tsx` loads a job. The TanStack Router
Vite plugin generates `src/routeTree.gen.ts` during dev/build and automatically
code-splits route components. Keep the generated tree in Git for standalone
typechecking; do not edit it manually. Adding a route file no longer requires
registering it in `router.tsx`.

shadcn was initialized with its CLI (`init --base radix --preset nova --no-monorepo
--yes` and `add button --yes`).
Run future shadcn commands from `apps/web`, where `components.json` lives.

Build and start the production apps with:

```bash
bun run build
bun run --filter @linkedin-scraper/api start
bun run --filter @linkedin-scraper/web start
```

The web build produces static files in `apps/web/dist`. The production web server
uses Bun only to serve those files, provide SPA fallback and proxy `/api/*`; it
does not bundle source files or run Vite's development/preview server. Both dev
and production keep the API on the same origin. Vite's filesystem access is
restricted to frontend/core dependencies and denies local sessions and captures.

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
cookies, network access or real pacing delays. Web tests build with Vite and check
production assets, direct detail URLs, API proxying and upstream failure handling
using a synthetic loopback API. Runtime-generated files and captures
remain ignored by Git; `bun.lock` at the root is the only workspace lockfile.
