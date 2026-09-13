// #722 — the shared e2e mock-lane dispatch primitives, unit-tested directly rather than only
// through a lane mock that happens to call them. `mock-dispatch.mjs`'s own header states the
// hazard this file exists to close: a Node request stream reads exactly once, so a body that
// gets drained by the FIRST caller must still be available, byte-for-byte-equal, to every LATER
// caller — in any order, any number of times.

import assert from "node:assert/strict";
import { test } from "node:test";

import { matchVerb, readCachedJson } from "./mock-dispatch.mjs";

/** A fake Node request: an async-iterable of one Buffer chunk, with a counter so a cell can
 *  prove the stream was opened at most once. */
function fakeRequest(body: unknown): AsyncIterable<Buffer> & { __e2eParsedBody?: unknown; streamOpens: number } {
  const bytes = Buffer.from(JSON.stringify(body), "utf8");
  const request = {
    streamOpens: 0,
    __e2eParsedBody: undefined as unknown,
    [Symbol.asyncIterator](): AsyncIterator<Buffer> {
      request.streamOpens += 1;
      let delivered = false;
      return {
        async next() {
          if (delivered) return { value: undefined, done: true };
          delivered = true;
          return { value: bytes, done: false };
        },
      };
    },
  };
  return request;
}

test("readCachedJson parses the body on the FIRST call", async () => {
  const request = fakeRequest({ p_client: "c1", p_kinds: ["close"] });
  const parsed = await readCachedJson(request);
  assert.deepEqual(parsed, { p_client: "c1", p_kinds: ["close"] });
  assert.equal(request.streamOpens, 1, "the stream must be opened exactly once to parse it at all");
});

test("readCachedJson's SECOND call returns the IDENTICAL object, without opening the stream again", async () => {
  const request = fakeRequest({ p_client: "c1" });
  const first = await readCachedJson(request);
  const second = await readCachedJson(request);
  // IDENTICAL, not merely deep-equal — a second reader must get back the SAME reference the
  // first reader parsed, which is what makes it safe for a lane's own handler to mutate a field
  // it reads for its own bookkeeping without corrupting a sibling lane's later read... except
  // that no lane mock does that; the assertion is the stronger, more useful one regardless.
  assert.equal(second, first, "a second readCachedJson(request) must return the SAME parsed object");
  assert.equal(request.streamOpens, 1, "a second call must never re-open the request's own stream");
});

test("readCachedJson on a THIRD, fourth… SEQUENTIAL caller still returns the one cached object", async () => {
  // SEQUENTIAL, matching how `serve-built.mjs`'s own dispatch chain actually calls it: one
  // lane hook is `await`ed to completion before the next one runs
  // (`if (await handleX(...)) return; if (await handleY(...)) return; …`), never in parallel
  // against the SAME request. A truly concurrent race against one still-unresolved first read
  // is a different, unguarded hazard — the DETECTOR for that lives in
  // `e2e-fixture-ownership.test.ts`, against the shared mutable `state` object this module does
  // not touch.
  const request = fakeRequest({ p_entries: ["e1", "e2"] });
  const first = await readCachedJson(request);
  const second = await readCachedJson(request);
  const third = await readCachedJson(request);
  assert.equal(second, first);
  assert.equal(third, first);
  assert.equal(request.streamOpens, 1);
});

test("an empty body resolves to {} rather than throwing", async () => {
  const request: AsyncIterable<Buffer> & { streamOpens: number } = {
    streamOpens: 0,
    [Symbol.asyncIterator](): AsyncIterator<Buffer> {
      request.streamOpens += 1;
      return { async next() { return { value: undefined, done: true }; } };
    },
  };
  const parsed = await readCachedJson(request);
  assert.deepEqual(parsed, {});
});

test("an unparsable body resolves to {} rather than throwing — a lane mock answers or falls through, it never 500s on a malformed body", async () => {
  const request = fakeRequest("");
  // Overwrite the fixture with genuinely invalid JSON bytes.
  const bytes = Buffer.from("{not json", "utf8");
  const bad = {
    streamOpens: 0,
    [Symbol.asyncIterator](): AsyncIterator<Buffer> {
      bad.streamOpens += 1;
      let delivered = false;
      return {
        async next() {
          if (delivered) return { value: undefined, done: true };
          delivered = true;
          return { value: bytes, done: false };
        },
      };
    },
  };
  void request;
  const parsed = await readCachedJson(bad);
  assert.deepEqual(parsed, {});
});

test("matchVerb is a plain Set.has — true for a member, false for a non-member", () => {
  const verbs = new Set(["list_fiscal_years", "abandon_close"]);
  assert.equal(matchVerb(verbs, "abandon_close"), true);
  assert.equal(matchVerb(verbs, "list_activity"), false);
});
