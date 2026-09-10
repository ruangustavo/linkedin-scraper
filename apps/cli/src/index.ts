import { open } from "node:fs/promises";
import { parseArgs } from "node:util";
import { Effect, Layer, Stream } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { InputError, readSession } from "./session.ts";
import { LinkedIn } from "@linkedin-scraper/core";
import { readJob } from "./job-file.ts";

const HELP = `LinkedIn jobs scraper (Effect 4 / Bun)

  bun start --keywords "backend engineer" --list-only [options]
  bun start enrich --input jobs.jsonl --id JOB_ID [options]

Search options:
  --keywords TEXT  Job search terms (required)
  --geo-id ID      LinkedIn geographic filter (optional)
  --pages N        Maximum search pages, 1-100 (default: 1)
  --limit N        Maximum jobs, 1-2500 (default: 25)
  --list-only      Fetch cards without opening job details

Enrichment options:
  --input FILE     Existing jobs JSONL file (required; never modified)
  --id JOB_ID      Numeric ID of exactly one job in the input file (required)

Shared options:
  --session FILE   Local cookie export or JSON with cookie and csrfToken (default: cookies.json)
  --delay-ms N     Minimum pause before every request, 500-60000 (default: 2000)
  --output FILE    Create a new JSONL file; never overwrite an existing file
  --help          Show this help

Requests are sequential. Authentication failures, 429 and protocol changes stop the run.
Never pass credentials as CLI arguments.
`;

function integer(name: string, value: string, minimum: number, maximum: number) {
  const number = Number(value);

  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new InputError({ message: `${name} must be an integer between ${minimum} and ${maximum}.` });
  }

  return number;
}

const main = Effect.gen(function*() {
  const isEnrich = Bun.argv[2] === "enrich";

  const { values } = yield* Effect.try({
    try: () => parseArgs({
      args: Bun.argv.slice(isEnrich ? 3 : 2),
      allowPositionals: false,
      strict: true,
      options: {
        keywords: { type: "string" },
        "geo-id": { type: "string" },
        session: { type: "string", default: "cookies.json" },
        output: { type: "string" },
        input: { type: "string" },
        id: { type: "string" },
        pages: { type: "string" },
        limit: { type: "string" },
        "delay-ms": { type: "string", default: "2000" },
        "list-only": { type: "boolean" },
        help: { type: "boolean", default: false },
      },
    }),
    catch: () => new InputError({ message: "Invalid arguments. Use --help." }),
  });

  if (values.help || Bun.argv.length === 2) {
    console.log(HELP);

    return;
  }

  const keywords = values.keywords?.trim();

  if (isEnrich && [values.keywords, values["geo-id"], values.pages, values.limit, values["list-only"]].some((value) => value !== undefined)) {
    return yield* new InputError({ message: "Search options cannot be used with enrich. Use enrich --help." });
  }

  if (!isEnrich && (values.input !== undefined || values.id !== undefined)) {
    return yield* new InputError({ message: "--input and --id require the enrich command." });
  }

  if (!isEnrich && !keywords) {
    return yield* new InputError({ message: "Provide nonempty --keywords for the job search." });
  }

  const options = yield* Effect.try({
    try: () => ({
      keywords: keywords ?? "",
      geoId: values["geo-id"],
      pages: integer("--pages", values.pages ?? "1", 1, 100),
      limit: integer("--limit", values.limit ?? (isEnrich ? "1" : "25"), 1, 2500),
      delayMs: integer("--delay-ms", values["delay-ms"], 500, 60000),
      listOnly: values["list-only"] ?? false,
    }),
    catch: (cause) => cause instanceof InputError ? cause : new InputError({ message: "Invalid collection limits." }),
  });

  const job = isEnrich ? yield* readJob(values.input ?? "", values.id ?? "") : null;
  const session = yield* readSession(values.session);

  const outputPath = values.output;

  const output = outputPath ? yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () => open(outputPath, "wx", 0o600),
      catch: () => new InputError({ message: "Could not create output. Its parent must exist and the file must not already exist." }),
    }),
    (file) => Effect.promise(() => file.close()),
  ) : null;

  let count = 0;

  const write = Effect.fnUntraced(function*(line: string) {
    yield* Effect.tryPromise({
      try: () => output ? output.writeFile(line) : new Promise<void>((resolve, reject) => {
        process.stdout.write(line, (error) => error ? reject(error) : resolve());
      }),
      catch: () => new InputError({ message: "Could not write job output." }),
    });
    count++;
  });

  const collect = Effect.gen(function*() {
    const linkedin = yield* LinkedIn;

    if (job) {
      const enriched = yield* linkedin.enrich(job, options.delayMs);
      yield* write(`${JSON.stringify(enriched)}\n`);

      return;
    }

    yield* linkedin.scrape(options).pipe(Stream.runForEach((job) => write(`${JSON.stringify(job)}\n`)));
  });

  yield* collect.pipe(Effect.provide(LinkedIn.layer(session).pipe(Layer.provide(FetchHttpClient.layer))));

  console.error(`Wrote ${count} job${count === 1 ? "" : "s"}${outputPath ? " to JSONL" : " to stdout"}.`);
}).pipe(
  Effect.scoped,
  Effect.catch((error) => Effect.sync(() => {
    console.error(error.message);
    process.exitCode = 1;
  })),
);

await Effect.runPromise(main).catch(() => {
  console.error("Unexpected internal failure. No request or session data was logged.");
  process.exitCode = 1;
});
