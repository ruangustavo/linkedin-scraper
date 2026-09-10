import { Context, Effect, Layer, Option, Predicate, Schedule, Schema, Stream } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http";
import type { Session } from "./session.ts";
import { RscError, type JsonObject } from "./rsc.ts";
import { ProtocolError, Sdui, type Job, type JobReference } from "./sdui.ts";

export interface ScrapeOptions {
  keywords: string;
  geoId?: string;
  pages: number;
  limit: number;
  delayMs: number;
  listOnly: boolean;
}

const ABOUT_THE_JOB = "com.linkedin.sdui.generated.jobseeker.dsl.impl.aboutTheJob";

export class LinkedInError extends Schema.TaggedError<LinkedInError>()("LinkedInError", {
  reason: Schema.Literals(["Authentication", "RateLimited", "Transport", "Server", "Response"]),
  message: Schema.String,
}) {}

export class LinkedIn extends Context.Service<LinkedIn, {
  scrape(options: ScrapeOptions): Stream.Stream<Job, LinkedInError | ProtocolError | RscError>;
}>()("linkedin-scraper/LinkedIn") {
  static layer(session: Session) {
    return Layer.effect(LinkedIn, Effect.gen(function*() {
      const client = HttpClient.withScope(yield* HttpClient.HttpClient);

      if (!session.cookie.trim() || !session.csrfToken.trim() || /[\r\n]/.test(session.cookie + session.csrfToken)) {
        return yield* new LinkedInError({ reason: "Authentication", message: "Session credentials are empty or invalid." });
      }

      const headers = {
        accept: "*/*",
        "x-li-rsc-stream": "true",
        cookie: session.cookie,
        "csrf-token": session.csrfToken,
      };

      const request = Effect.fn("LinkedIn.request")(
        function*(url: string, body: JsonObject | null, initialUrl?: string) {
          const target = URL.parse(url, "https://www.linkedin.com");

          if (!target || target.origin !== "https://www.linkedin.com" || target.username || target.password ||
            ![/^\/flagship-web\/jobs\/search-results\/?$/, /^\/flagship-web\/rsc-action\/actions\/component$/]
              .some((path) => path.test(target.pathname))) {
            return yield* new LinkedInError({ reason: "Response", message: "Refusing an unexpected request destination." });
          }

          if (target.pathname.endsWith("/actions/component") && target.searchParams.get("componentId") !== ABOUT_THE_JOB) {
            return yield* new LinkedInError({ reason: "Response", message: "Only the job-description component may be requested." });
          }

          let base = HttpClientRequest.make(body === null ? "GET" : "POST")(target.href).pipe(
            HttpClientRequest.setHeaders(headers),
          );

          // The server uses the previous route when resolving bound pagination arguments.
          if (initialUrl) base = HttpClientRequest.setHeader(base, "x-li-initial-url", initialUrl);

          const outgoing = body === null ? base : yield* HttpClientRequest.bodyJson(
            HttpClientRequest.setHeader(base, "origin", "https://www.linkedin.com"), body,
          ).pipe(
            Effect.mapError(() => new LinkedInError({ reason: "Response", message: "Could not encode navigation arguments." })),
          );

          const response = yield* client.execute(outgoing).pipe(
            Effect.mapError(() => new LinkedInError({ reason: "Transport", message: "LinkedIn request failed at the transport layer." })),
          );

          if ([401, 403, 999].includes(response.status) ||
            (response.status >= 300 && response.status < 400 && /login|checkpoint|authwall|challenge/i.test(response.headers.location ?? ""))) {
            return yield* new LinkedInError({ reason: "Authentication", message: `LinkedIn refused this session (HTTP ${response.status}). No retries were made for this response.` });
          }

          if (response.status === 429) {
            const retryAfter = response.headers["retry-after"];
            const wait = retryAfter && /^\d+$/.test(retryAfter) ? ` Retry-After: ${retryAfter} seconds.` : "";

            return yield* new LinkedInError({ reason: "RateLimited", message: `LinkedIn rate limit reached. Collection stopped.${wait}` });
          }

          if (response.status !== 200) {
            return yield* new LinkedInError({
              reason: [500, 502, 503, 504].includes(response.status) ? "Server" : "Response",
              message: `Unexpected LinkedIn HTTP status: ${response.status} on ${target.pathname}.`,
            });
          }

          const text = yield* response.text.pipe(
            Effect.mapError(() => new LinkedInError({ reason: "Transport", message: "Could not read the LinkedIn response." })),
          );

          if (!text.trim()) {
            return yield* new LinkedInError({ reason: "Response", message: "LinkedIn returned HTTP 200 with an empty body, not an empty search result." });
          }

          const contentType = response.headers["content-type"] ?? "";

          if (/text\/html/i.test(contentType) || !/^[0-9a-f]+:/.test(text)) {
            return yield* new LinkedInError({ reason: "Response", message: "LinkedIn did not return an RSC response. Session or client context may be invalid; collection stopped." });
          }

          return { text, routeUrl: response.headers["x-li-route-url"] };
        },
        Effect.scoped,
        Effect.timeout("30 seconds"),
        Effect.catchTag("TimeoutError", () => Effect.fail(new LinkedInError({ reason: "Transport", message: "LinkedIn request timed out." }))),
        Effect.provideService(FetchHttpClient.RequestInit, { redirect: "manual" }),
      );

      const pacedRequest = Effect.fnUntraced(
        function*(url: string, body: JsonObject | null, delayMs: number, initialUrl?: string) {
          yield* Effect.sleep(delayMs);

          return yield* request(url, body, initialUrl);
        },
        Effect.retry({
          times: 1,
          schedule: Schedule.exponential("2 seconds"),
          while: (error) => error.reason === "Transport" || error.reason === "Server",
        }),
      );

      function navigationUrl(body: JsonObject) {
        if (!Predicate.isString(body.url)) return null;
        const url = URL.parse(body.url, "https://www.linkedin.com");

        if (!url || url.origin !== "https://www.linkedin.com" || !/^\/jobs\/search-results\/?$/.test(url.pathname)) return null;

        url.pathname = `/flagship-web${url.pathname}`;

        return url.href;
      }

      return LinkedIn.of({
        scrape: (options) => Stream.suspend(() => {
          const sdui = new Sdui();
          const seen = new Set<string>();
          let initialUrl: string | undefined;

          const searchUrl = new URL("https://www.linkedin.com/flagship-web/jobs/search-results");
          searchUrl.searchParams.set("keywords", options.keywords);
          searchUrl.searchParams.set("skipRedirect", "true");

          if (options.geoId) searchUrl.searchParams.set("geoId", options.geoId);

          const pages = Stream.paginate<{ body: JsonObject | null; index: number }, JobReference, LinkedInError | ProtocolError | RscError>(
            { body: null, index: 0 },
            ({ body, index }) => Effect.gen(function*() {
              const url = body === null ? searchUrl.href : navigationUrl(body);

              if (!url) return yield* new ProtocolError({ message: "Missing or invalid search navigation URL." });

              const response = yield* pacedRequest(url, body, options.delayMs, initialUrl);
              initialUrl = response.routeUrl;

              const page = yield* sdui.page(response.text);

              if (page.index !== index) {
                return yield* new ProtocolError({ message: "LinkedIn returned an unexpected page index; stopping to avoid a pagination loop." });
              }

              const fresh = page.jobs.filter(({ job }) => {
                if (seen.has(job.id)) return false;
                seen.add(job.id);

                return true;
              });

              if (fresh.length === 0 && page.next !== null) {
                return yield* new ProtocolError({ message: "Page contains no new jobs but advertises more results." });
              }

              const next = page.next !== null && index + 1 < options.pages
                ? Option.some({ body: page.next, index: index + 1 })
                : Option.none();

              return [fresh, next];
            }),
          );

          return pages.pipe(
            Stream.take(options.limit),
            Stream.mapEffect(Effect.fn("LinkedIn.job")(function*(reference: JobReference) {
              if (options.listOnly) return reference.job;

              const body = yield* sdui.navigate(reference.screen);
              const url = navigationUrl(body);

              if (!url) return yield* new ProtocolError({ message: "Missing or invalid job navigation URL." });

              const detail = yield* pacedRequest(url, body, options.delayMs, initialUrl);
              initialUrl = detail.routeUrl;

              const job = yield* sdui.detail(detail.text, reference.job);
              const componentUrl = new URL("https://www.linkedin.com/flagship-web/rsc-action/actions/component");
              componentUrl.searchParams.set("componentId", ABOUT_THE_JOB);
              componentUrl.searchParams.set("sduiid", ABOUT_THE_JOB);

              const componentBody = {
                clientArguments: {
                  payload: { jobId: job.id, renderAsCard: false },
                  states: [],
                  requestMetadata: { $type: "proto.sdui.common.RequestMetadata" },
                  screenId: "com.linkedin.sdui.flagshipnav.jobs.SemanticJobDetails",
                  knownTemplateIds: [],
                },
              };

              const description = yield* pacedRequest(componentUrl.href, componentBody, options.delayMs);

              return yield* sdui.description(description.text, job);
            })),
          );
        }),
      });
    }));
  }
}
