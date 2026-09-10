import { expect, test } from "bun:test";
import { Clock, Effect, Fiber, Layer, Match, Schema, Stream } from "effect";
import { TestClock } from "effect/testing";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";
import { LinkedIn, LinkedInError, ProtocolError, RscError, type Job, type ScrapeOptions } from "../src/index.ts";

const session = { cookie: "li_at=synthetic; JSESSIONID=\"test-csrf\"", csrfToken: "test-csrf" };

const listing: Job = {
  id: "101",
  title: "Engineer",
  company: "Example",
  location: "Remote",
  url: "https://www.linkedin.com/jobs/view/101/?trackingId=synthetic",
  description: null,
  applyUrl: null,
};

const searchOptions: ScrapeOptions = {
  keywords: "distributed systems",
  geoId: "123",
  pages: 3,
  limit: 3,
  delayMs: 1000,
  listOnly: true,
};

function model(value: Schema.Json) {
  return `0:${JSON.stringify(value)}\n`;
}

function binding(id: string) {
  return { key: { value: { $case: "id", id } } };
}

function navigate(screen: Schema.JsonObject) {
  return { $type: "proto.sdui.actions.core.Navigate", value: { content: { $case: "screen", screen } } };
}

function searchPage(index: number, ids: readonly string[]) {
  return model({
    modelStates: [
      { key: binding("page"), value: { $case: "intValue", intValue: index } },
      { key: binding("total"), value: { $case: "intValue", intValue: 3 } },
    ],
    children: ids.map((id): Schema.JsonObject => ({
      componentKey: `job-card-component-ref-${id}`,
      selectedStateKey: binding(`JobCardFrameworkImplDismissedState_${id}`),
      states: [["Default", [
        { textProps: {
          stateKey: `JobSearchResultsPage_A11yLabel${id}`,
          children: ["$", "span", null, { "aria-hidden": "true", children: `Engineer ${id}` }],
        } },
        ["$", "p", null, { children: `Example ${id}` }],
        { textProps: { children: "Remote" } },
      ]]],
      host: {
        componentkey: `job-card-component-ref-${id}`,
        triggers: navigate({
          screenId: "com.linkedin.sdui.flagshipnav.jobs.SemanticJobDetails",
          requestedArguments: { payload: { currentJobId: [{ staticValue: id }] } },
        }),
      },
    })),
    pager: {
      currentIndicatorIndexBinding: binding("page"),
      indicatorCountBinding: binding("total"),
      onClickPrevAction: [],
      onClickNextAction: navigate({
        $type: "proto.sdui.actions.core.NavigateToScreen",
        url: `/jobs/search-results?keywords=distributed+systems&start=${(index + 1) * 25}`,
        screenId: "com.linkedin.sdui.flagshipnav.jobs.JobSearchResults",
        requestedArguments: {
          $type: "proto.sdui.actions.requests.RequestedArguments",
          requestedStateKeys: [binding("page")],
          payload: { page: [{ value: { key: "page", namespace: "search" } }] },
          optionalArgument: "$undefined",
        },
      }),
    },
  });
}

function scrape(options: ScrapeOptions = searchOptions) {
  return Effect.flatMap(LinkedIn, (linkedin) => Stream.runCollect(linkedin.scrape(options)));
}

function payload(request: HttpClientRequest.HttpClientRequest) {
  return Match.value(request.body).pipe(
    Match.tag("Empty", () => null),
    Match.tag("Uint8Array", ({ body }) => Schema.decodeUnknownSync(
      Schema.fromJsonString(Schema.Json),
    )(new TextDecoder().decode(body))),
    Match.orElse(() => { throw new Error("Unexpected request body encoding"); }),
  );
}

async function runLinkedIn<A, E>(operation: Effect.Effect<A, E, LinkedIn>, responses: readonly Response[]) {
  const requests: HttpClientRequest.HttpClientRequest[] = [];
  const times: number[] = [];

  const client = HttpClient.make((request) => Effect.gen(function*() {
    const response = responses[requests.length];

    requests.push(request);
    times.push(yield* Clock.currentTimeMillis);

    if (!response) return yield* Effect.die(new Error("Unexpected HTTP request"));

    return HttpClientResponse.fromWeb(request, response);
  }));

  const result = await Effect.runPromise(Effect.gen(function*() {
    const fiber = yield* operation.pipe(
      Effect.provide(LinkedIn.layer(session).pipe(
        Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
      )),
      Effect.forkChild,
    );

    yield* TestClock.adjust("10 seconds");

    return yield* Fiber.join(fiber);
  }).pipe(Effect.provide(TestClock.layer())));

  return { result, requests, times };
}

test("enriches an existing job with only a direct detail GET and description POST", async () => {
  const detail = model({
    jobId: "101",
    jobTitle: "Senior Engineer",
    companyName: "Example Labs",
    isOnsiteApply: false,
    offsiteApplyUrl: "https://careers.example.test/jobs/101",
  });

  const description = model({
    "data-sdui-component": "com.linkedin.sdui.generated.jobseeker.dsl.impl.aboutTheJob",
    children: {
      expansionKey: "jdp_job_description_expansion_101",
      textProps: {
        children: [
          ["$", "p", null, { children: ["Build ", ["$", "strong", null, { children: "reliable" }], " systems."] }],
          ["$", "ul", null, { children: [["$", "li", null, { children: "Own delivery" }]] }],
        ],
      },
    },
  });

  const original = { ...listing };

  const { result, requests, times } = await runLinkedIn(
    Effect.flatMap(LinkedIn, (linkedin) => linkedin.enrich(listing, 1000)),
    [new Response(detail), new Response(description)],
  );

  expect(result).toEqual({
    ...original,
    title: "Senior Engineer",
    company: "Example Labs",
    applyUrl: "https://careers.example.test/jobs/101",
    description: "Build **reliable** systems.\n\n- Own delivery",
  });
  expect(listing).toEqual(original);
  expect(times).toEqual([1000, 2000]);
  expect(requests.map((request) => [request.method, request.url, payload(request)])).toEqual([
    ["GET", "https://www.linkedin.com/flagship-web/jobs/view/101/", null],
    ["POST", "https://www.linkedin.com/flagship-web/rsc-action/actions/component?componentId=com.linkedin.sdui.generated.jobseeker.dsl.impl.aboutTheJob&sduiid=com.linkedin.sdui.generated.jobseeker.dsl.impl.aboutTheJob", {
      clientArguments: {
        payload: { jobId: "101", renderAsCard: false },
        states: [],
        requestMetadata: { $type: "proto.sdui.common.RequestMetadata" },
        screenId: "com.linkedin.sdui.flagshipnav.jobs.SemanticJobDetails",
        knownTemplateIds: [],
      },
    }],
  ]);
  expect(requests.map((request) => [request.headers.cookie, request.headers["csrf-token"]]))
    .toEqual([[session.cookie, session.csrfToken], [session.cookie, session.csrfToken]]);
});

test("list-only follows pagination bindings, deduplicates across pages and stops at the limit", async () => {
  const route = "/jobs/search-results?keywords=distributed+systems&geoId=123";

  const { result, requests, times } = await runLinkedIn(scrape(), [
    new Response(searchPage(0, ["101", "102"]), { headers: { "x-li-route-url": route } }),
    new Response(searchPage(1, ["102", "103", "104"])),
  ]);

  expect(result).toEqual(["101", "102", "103"].map((id) => ({
    id,
    title: `Engineer ${id}`,
    company: `Example ${id}`,
    location: "Remote",
    url: `https://www.linkedin.com/jobs/view/${id}/`,
    description: null,
    applyUrl: null,
  })));
  expect(times).toEqual([1000, 2000]);
  expect(requests.map((request) => [request.method, request.url, request.headers["x-li-initial-url"]]))
    .toEqual([
      ["GET", "https://www.linkedin.com/flagship-web/jobs/search-results?keywords=distributed+systems&skipRedirect=true&geoId=123", undefined],
      ["POST", "https://www.linkedin.com/flagship-web/jobs/search-results?keywords=distributed+systems&start=25", route],
    ]);
  expect(requests.map(payload)).toEqual([null, {
    $type: "proto.sdui.actions.core.NavigateToScreen",
    url: "/jobs/search-results?keywords=distributed+systems&start=25",
    screenId: "com.linkedin.sdui.flagshipnav.jobs.JobSearchResults",
    requestedArguments: {
      payload: { page: [{ value: { key: "page", namespace: "search" } }] },
      states: [{
        key: "page",
        namespace: "search",
        value: 1,
        originalProtoCase: "intValue",
        protoKey: { $type: "proto.sdui.Key", value: { $case: "id", id: "page" } },
      }],
      screenId: "",
      knownTemplateIds: [],
    },
  }]);
});

test.each([
  { name: "page budget", pages: 1, limit: 10, ids: ["101", "102"] },
  { name: "limit within the first page", pages: 3, limit: 1, ids: ["101"] },
])("list-only respects $name without fetching details or another page", async ({ pages, limit, ids }) => {
  const { result, requests } = await runLinkedIn(scrape({ ...searchOptions, pages, limit }), [
    new Response(searchPage(0, ["101", "102"])),
  ]);

  expect(result.map((job) => job.id)).toEqual([...ids]);
  expect(requests).toHaveLength(1);
});

test.each([
  { status: 401, reason: "Authentication" },
  { status: 403, reason: "Authentication" },
  { status: 302, reason: "Authentication" },
  { status: 429, reason: "RateLimited" },
])("HTTP $status stops immediately without retrying", async ({ status, reason }) => {
  const { result, requests, times } = await runLinkedIn(scrape().pipe(Effect.flip), [
    new Response(null, { status, headers: { location: "/checkpoint/challenge", "retry-after": "120" } }),
  ]);

  expect(result).toBeInstanceOf(LinkedInError);
  expect(result).toMatchObject({ reason });
  expect(requests).toHaveLength(1);
  expect(times).toEqual([1000]);
});

test.each([
  { name: "empty body", body: "", contentType: "text/x-component", error: LinkedInError },
  { name: "HTML content type", body: "0:{}\n", contentType: "text/html", error: LinkedInError },
  { name: "missing pager", body: "0:{}\n", contentType: "text/x-component", error: ProtocolError },
  { name: "truncated RSC", body: "0:{", contentType: "text/x-component", error: RscError },
])("rejects $name rather than reporting an empty search", async ({ body, contentType, error }) => {
  const { result, requests } = await runLinkedIn(scrape().pipe(Effect.flip), [
    new Response(body, { headers: { "content-type": contentType } }),
  ]);

  expect(result).toBeInstanceOf(error);
  expect(requests).toHaveLength(1);
});

test.each([
  { name: "repeated page index", index: 0, ids: ["102"], message: "unexpected page index" },
  { name: "page with no new jobs", index: 1, ids: ["101"], message: "no new jobs" },
])("stops a pagination loop on $name", async ({ index, ids, message }) => {
  const { result, requests } = await runLinkedIn(scrape().pipe(Effect.flip), [
    new Response(searchPage(0, ["101"])),
    new Response(searchPage(index, ids)),
  ]);

  expect(result).toBeInstanceOf(ProtocolError);
  expect(result.message).toContain(message);
  expect(requests).toHaveLength(2);
});
