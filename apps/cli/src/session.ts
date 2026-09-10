import { Effect, Schema } from "effect";
import { parseSession } from "@linkedin-scraper/core";

export class InputError extends Schema.TaggedError<InputError>()("InputError", {
  message: Schema.String,
}) {}

export const readSession = Effect.fn("readSession")(function*(path: string) {
  const text = yield* Effect.tryPromise({
    try: () => Bun.file(path).text(),
    catch: () => new InputError({ message: "Could not read the session file." }),
  });

  return yield* parseSession(text);
});
