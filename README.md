# linkedin-scraper

CLI for collecting LinkedIn jobs with Bun and Effect 4. Only a local session and
search terms are required.

```bash
bun install
bun start --keywords "backend engineer" --limit 5 --output jobs.jsonl
```

## Options

| Option | Purpose | Default |
| --- | --- | --- |
| `--keywords TEXT` | Job search terms | Required |
| `--geo-id ID` | LinkedIn geographic filter | Omitted |
| `--session FILE` | Local session file | `cookies.json` |
| `--pages N` | Maximum pages, 1-100 | 1 |
| `--limit N` | Maximum jobs, 1-2500 | 25 |
| `--list-only` | Collect cards without detail or description | Off |
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

## Checks

```bash
bun run typecheck
bun run lint
```
