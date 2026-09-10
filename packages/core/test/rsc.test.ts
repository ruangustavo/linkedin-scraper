import { expect, test } from "bun:test";
import { Effect } from "effect";
import { RscError } from "../src/index.ts";
import { parseRsc } from "../src/rsc.ts";

test("resolves forward, outlined and lazy model references while retaining imports and literal dollars", async () => {
  const document = await Effect.runPromise(parseRsc([
    '0:{"title":"$01:props:children","element":"$L1","component":"$L2","salary":"$$100"}',
    '1:["$","span",null,{"children":"Engineer"}]',
    '2:I["job-card",[],"default"]',
    "",
  ].join("\n")));

  expect(document.resolve("$0")).toEqual({
    title: "Engineer",
    element: ["$", "span", null, { children: "Engineer" }],
    component: "$L2",
    salary: "$100",
  });
});

test("counts UTF-8 text-row bytes, preserves dollar-prefixed text and resumes at the next row", async () => {
  const text = "$f: caf\u00e9 \ud83d\ude80\nsecond line";
  const length = new TextEncoder().encode(text).length.toString(16);

  const document = await Effect.runPromise(parseRsc(
    `1:T${length},${text}2:{"children":"$1"}\n0:{"description":"$2:children","copy":"$01"}\n`,
  ));

  expect(document.rows.size).toBe(3);
  expect(document.resolve("$0")).toEqual({ description: text, copy: text });
});

test.each([
  { name: "truncated model", body: '0:{"title":"Engineer"}' },
  { name: "truncated text", body: "0:T5,abc" },
  { name: "split UTF-8 character", body: "0:T1,\u00e9" },
  { name: "malformed JSON", body: '0:{"private":"synthetic-secret",}\n' },
  { name: "duplicate normalized row ID", body: "0:{}\n00:{}\n" },
])("rejects $name with a sanitized RscError", async ({ body }) => {
  const error = await Effect.runPromise(parseRsc(body).pipe(Effect.flip));

  expect(error).toBeInstanceOf(RscError);
  expect(error.offset).toBeGreaterThanOrEqual(0);
  expect(error.message).not.toContain("synthetic-secret");
});

test("rejects missing rows and invalid outlined paths rather than returning partial models", async () => {
  const document = await Effect.runPromise(parseRsc('0:{"title":"Engineer"}\n'));

  expect(() => document.resolve("$f")).toThrow(RscError);
  expect(() => document.resolve("$0:missing")).toThrow(RscError);
});
