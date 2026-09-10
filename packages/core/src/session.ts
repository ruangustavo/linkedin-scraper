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

export class SessionError extends Schema.TaggedError<SessionError>()("SessionError", {
  message: Schema.String,
}) {}

export const parseSession = Effect.fn("parseSession")(function*(text: string) {
  const data = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Union([Session, ExportedCookies])))(text).pipe(
    Effect.mapError(() => new SessionError({ message: "Session must contain cookie/csrfToken strings or a browser cookie-export array." })),
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
    return yield* new SessionError({ message: "Cookie export has no valid LinkedIn JSESSIONID or contains invalid cookie values." });
  }

  return {
    cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; "),
    csrfToken: jsession.replace(/^"|"$/g, ""),
  };
});
