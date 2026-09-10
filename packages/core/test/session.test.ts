import { expect, test } from "bun:test";
import { Effect } from "effect";
import { TestClock } from "effect/testing";
import { parseSession, SessionError } from "../src/index.ts";

test("filters browser cookies by host, path and the injected clock's expiry boundary", async () => {
  const cookies = JSON.stringify([
    { name: "JSESSIONID", value: "\"synthetic-csrf\"", domain: ".LINKEDIN.COM", path: "/" },
    { name: "li_at", value: "synthetic-auth", domain: "www.linkedin.com", path: "/", hostOnly: true, expirationDate: 101 },
    { name: "expired", value: "ignored", domain: ".linkedin.com", path: "/", expirationDate: 99 },
    { name: "expires_now", value: "ignored", domain: ".linkedin.com", path: "/", expirationDate: 100 },
    { name: "host_only_apex", value: "ignored", domain: "linkedin.com", path: "/", hostOnly: true },
    { name: "subdomain", value: "ignored", domain: "api.linkedin.com", path: "/" },
    { name: "wrong_path", value: "ignored", domain: ".linkedin.com", path: "/jobs" },
    { name: "JSESSIONID", value: "ignored;not-a-cookie", domain: "linkedin.com.example.test", path: "/" },
  ]);

  const [before, atExpiry] = await Effect.runPromise(Effect.gen(function*() {
    yield* TestClock.setTime(100_000);
    const before = yield* parseSession(cookies);

    yield* TestClock.adjust("1 second");
    const atExpiry = yield* parseSession(cookies);

    return [before, atExpiry];
  }).pipe(Effect.provide(TestClock.layer())));

  expect(before).toEqual({
    cookie: "JSESSIONID=\"synthetic-csrf\"; li_at=synthetic-auth",
    csrfToken: "synthetic-csrf",
  });
  expect(atExpiry).toEqual({ cookie: "JSESSIONID=\"synthetic-csrf\"", csrfToken: "synthetic-csrf" });
});

test("accepts serialized session credentials without changing the cookie header", async () => {
  const session = { cookie: "li_at=synthetic; JSESSIONID=\"synthetic-csrf\"", csrfToken: "synthetic-csrf" };

  expect(await Effect.runPromise(parseSession(JSON.stringify(session)))).toEqual(session);
});

test.each(["not JSON", "{}", "null", "[]"])("rejects invalid session input %s", async (input) => {
  const error = await Effect.runPromise(parseSession(input).pipe(
    Effect.flip,
    Effect.provide(TestClock.layer()),
  ));

  expect(error).toBeInstanceOf(SessionError);
});

test.each([
  { name: "li_at", value: "synthetic\r\ninjected: value" },
  { name: "li_at", value: "synthetic;other=value" },
  { name: "bad=name", value: "synthetic" },
])("rejects unsafe cookie headers: $name / $value", async ({ name, value }) => {
  const cookies = JSON.stringify([
    { name: "JSESSIONID", value: "\"synthetic-csrf\"", domain: ".linkedin.com", path: "/" },
    { name, value, domain: ".linkedin.com", path: "/" },
  ]);

  const error = await Effect.runPromise(parseSession(cookies).pipe(
    Effect.flip,
    Effect.provide(TestClock.layer()),
  ));

  expect(error).toBeInstanceOf(SessionError);
  expect(error.message).not.toContain(value);
});
