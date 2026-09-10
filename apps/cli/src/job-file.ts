import { Effect, Schema } from "effect";
import { InputError } from "./session.ts";
import { Job } from "@linkedin-scraper/core";

export const readJob = Effect.fn("readJob")(function*(path: string, id: string) {
  if (!path.trim()) {
    return yield* new InputError({ message: "Provide --input with a saved jobs JSONL file." });
  }

  if (!/^\d+$/.test(id)) {
    return yield* new InputError({ message: "Provide --id with a numeric job ID from the input file." });
  }

  const text = yield* Effect.tryPromise({
    try: () => Bun.file(path).text(),
    catch: () => new InputError({ message: "Could not read the jobs input file." }),
  });

  let match: Job | undefined;

  for (const [index, line] of text.split("\n").entries()) {
    if (!line.trim()) continue;

    const job = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Job))(line).pipe(
      Effect.mapError(() => new InputError({ message: `Invalid job record on input line ${index + 1}.` })),
    );

    if (job.id !== id) continue;

    if (match) {
      return yield* new InputError({ message: "The input file contains more than one record with this job ID." });
    }

    match = job;
  }

  if (!match) {
    return yield* new InputError({ message: "Job ID was not found in the input file." });
  }

  return match;
});
