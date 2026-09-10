import { Clock, Effect, Predicate, Schema } from "effect";

export const Session = Schema.Struct({ cookie: Schema.String, csrfToken: Schema.String });

export type Session = typeof Session.Type;

const ExportedCookies = Schema.Array(Schema.Struct({
  name: Schema.String,
  value: Schema.String,
  domain: Schema.String,
  path: Schema.String,
  hostOnly: Schema.optionalKey(Schema.Boolean),
  expirationDate: Schema.optionalKey(Schema.Number),
}));

export class InputError extends Schema.TaggedError<InputError>()("InputError", {
  message: Schema.String,
}) {}

export const readSession = Effect.fn("readSession")(function*(path: string) {
  const text = yield* Effect.tryPromise({
    try: () => Bun.file(path).text(),
    catch: () => new InputError({ message: "Could not read the session file." }),
  });

  const data = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Union([Session, ExportedCookies])))(text).pipe(
    Effect.mapError(() => new InputError({ message: "Session must contain cookie/csrfToken strings or a browser cookie-export array." })),
  );

  if (Schema.is(Session)(data)) return data;

  const now = yield* Clock.currentTimeMillis;

  const cookies = data.filter((cookie) => {
    const domain = cookie.domain.toLowerCase().replace(/^\./, "");

    return (domain === "www.linkedin.com" || (domain === "linkedin.com" && !cookie.hostOnly)) &&
      cookie.path === "/" && (Predicate.isUndefined(cookie.expirationDate) || cookie.expirationDate * 1000 > now);
  });

  const jsession = cookies.find((cookie) => cookie.name === "JSESSIONID")?.value;

  if (!jsession || cookies.some((cookie) => !/^[A-Za-z0-9_-]+$/.test(cookie.name) || /[\r\n;]/.test(cookie.value))) {
    return yield* new InputError({ message: "Cookie export has no valid LinkedIn JSESSIONID or contains invalid cookie values." });
  }

  return {
    cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; "),
    csrfToken: jsession.replace(/^"|"$/g, ""),
  };
});
