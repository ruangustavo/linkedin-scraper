# linkedin-scraper

Bun workspaces for listing LinkedIn jobs and enriching selected jobs. Bun 1.3.11
is the pinned package manager/runtime; install dependencies once at the repository root.

## Workspaces

| Workspace | Package | Responsibility |
| --- | --- | --- |
| `packages/core` | `@linkedin-scraper/core` | LinkedIn service, RSC/SDUI parsing, session parsing and core tests |
| `apps/cli` | `@linkedin-scraper/cli` | CLI arguments, local session files and JSONL input/output |
| `apps/api` | `@linkedin-scraper/api` | Elysia boilerplate with `GET /health` on port 3001 |
| `apps/web` | `@linkedin-scraper/web` | Bun-native server/bundler, React 19, Tailwind v4 and shadcn/ui on port 3000 |

CLI and API depend on core through `workspace:*`. API and web have no job routes,
database, scraping integration or job UI yet. The web is only a minimal starter page.

## Development

```bash
bun install
bun run dev:api
bun run dev:web
```

Run the two development servers in separate terminals. Both accept `PORT` to override
their default port. The web uses Bun's HTML bundler and `bun-plugin-tailwind`, not Vite.

shadcn was initialized with its CLI (`init --base radix --preset nova --no-monorepo
--yes` and `add button --yes`). Its supported React/Vite scaffold was adapted to Bun
after initialization, with Vite dependencies, configuration and demo assets removed.
Run future shadcn commands from `apps/web`, where `components.json` lives.

Build and start the production boilerplates with:

```bash
bun run build
bun run --filter @linkedin-scraper/api start
bun run --filter @linkedin-scraper/web start
```

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

The result is one JSONL record with refreshed title/company, a Markdown description
and an external application URL when available. The original ID, location and URL
are preserved. The input file is never modified; omitting `--output` writes to stdout.

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
| `--delay-ms N` | Pause before each request, 1000-60000 ms | 2000 |
| `--output FILE` | Create a new JSONL file | stdout |

## Session

The session file accepts a browser cookie-export array or an object with `cookie`
and `csrfToken` strings. Browser exports are filtered to unexpired, root-path
cookies matching `www.linkedin.com`; `JSESSIONID` supplies the CSRF token.

`cookies.json`, `session.json` and `*.session.json` are ignored by Git. Never pass
credentials as CLI arguments or commit session files. Session files are read only;
there is no automatic login or session refresh.

## Output And Limits

Each JSONL record contains `id`, `title`, `company`, `location`, `url`, `description`
and `applyUrl`. Descriptions are Markdown. With `--list-only`, details remain null;
onsite applications also have `applyUrl: null`.

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
files and writing output live in `apps/cli/src`, not in core. API does not load a
session or make LinkedIn requests until those routes are implemented.

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
cookies, network access or real pacing delays. Runtime-generated files and captures
remain ignored by Git; `bun.lock` at the root is the only workspace lockfile.
