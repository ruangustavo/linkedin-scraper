import { open } from "node:fs/promises";
import { parseArgs } from "node:util";
import { Effect, Layer, Stream } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { InputError, readSession } from "./session.ts";
import { LinkedIn } from "./linkedin.ts";

const HELP = `LinkedIn jobs scraper (Effect 4 / Bun)

  bun run src/index.ts --keywords "backend engineer" [options]

Options:
  --keywords TEXT  Job search terms (required)
  --geo-id ID      LinkedIn geographic filter (optional)
  --session FILE   Local cookie export or JSON with cookie and csrfToken (default: cookies.json)
  --pages N        Maximum search pages, 1-100 (default: 1)
  --limit N        Maximum jobs, 1-2500 (default: 25)
  --delay-ms N     Minimum pause before every request, at least 1000 (default: 2000)
  --list-only      Fetch cards without opening job details
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
  const { values } = yield* Effect.try({
    try: () => parseArgs({
      args: Bun.argv.slice(2),
      allowPositionals: false,
      strict: true,
      options: {
        keywords: { type: "string" },
        "geo-id": { type: "string" },
        session: { type: "string", default: "cookies.json" },
        output: { type: "string" },
        pages: { type: "string", default: "1" },
        limit: { type: "string", default: "25" },
        "delay-ms": { type: "string", default: "2000" },
        "list-only": { type: "boolean", default: false },
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

  if (!keywords) {
    return yield* new InputError({ message: "Provide nonempty --keywords for the job search." });
  }

  const options = yield* Effect.try({
    try: () => ({
      keywords,
      geoId: values["geo-id"],
      pages: integer("--pages", values.pages, 1, 100),
      limit: integer("--limit", values.limit, 1, 2500),
      delayMs: integer("--delay-ms", values["delay-ms"], 1000, 60000),
      listOnly: values["list-only"],
    }),
    catch: (cause) => cause instanceof InputError ? cause : new InputError({ message: "Invalid collection limits." }),
  });

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
