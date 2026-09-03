// THE CHAT LANE'S WIRE ADDRESSES, PINNED AS EXACT STRINGS.
//
// Why this file exists, in one measurement (FS-10 cutover prep, §5 R1). Until this PR
// every call in `api.ts` and the SSE attach in `stream.ts` was prefixed with a
// `runtimeBase()` read off the browser-exposed `NEXT_PUBLIC_CLARA_RUNTIME_URL`, and both
// of that variable's states were dead on a deployed origin: UNSET the browser asked
// apps/web's own origin for `/api/chat/…` and `/api/tasks/…`, which this app has no Route
// Handler for (404); SET it made a cross-origin call to a runtime whose CORS middleware
// is mounted on `/api/intake` only, so the browser blocked it. No test caught it because
// every suite deleted the variable and every e2e mock answered the bare `/api/chat/*`
// paths itself, on the app origin, so they never reached `next start`.
//
// The two arms below are the two halves of that measurement, and they are BEHAVIOURAL,
// not spelling-based (a grep for the variable's name would pass on a module that read it
// under a different spelling, and would fail on a comment that merely mentions it):
//
//   ARM 1 — the variable UNSET. Every URL is the same-origin proxy path, and NOT the
//           bare runtime path the old code produced here (the 404 shape).
//   ARM 2 — the variable SET to a poison origin. Every URL is BYTE-IDENTICAL to arm 1.
//           This is the arm the old code cannot pass: it would prefix the poison origin
//           onto all six. The arm prints the poison value it actually installed, so a
//           green cannot come from an arm that never armed.
//
// And the third property, which is neither of those: the proxy re-adds the runtime's own
// `/api/` itself (`app/api/runtime/[...path]/route.ts:53` builds
// `${CLARA_RUNTIME_URL}/api/${path.join("/")}`), so a path that keeps its `/api` prefix
// arrives as `/api/api/chat/sessions` and 404s at the runtime — a failure that looks
// exactly like a missing route. `NO_DOUBLED_API` below is the cell for it.

import assert from "node:assert/strict";
import { test } from "node:test";

import { createSession, getMessages, listSessions, listSessionsForCaller, postTurn } from "./api";
import { openTaskStream } from "./stream";
import type { SessionTokenAccessor } from "@/lib/session";

const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "22222222-2222-4222-8222-222222222222";
// `listSessionsForCaller` picks the caller's own rows out of an already-authorised
// result, so its token has to carry a real `sub` — a JWT-shaped string, unsigned, and
// never anything but a fixture.
const SUBJECT = "33333333-3333-4333-8333-333333333333";
const TOKEN = [
  Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ sub: SUBJECT })).toString("base64url"),
  "",
].join(".");

const session: SessionTokenAccessor = { getAccessToken: async () => TOKEN };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function sse(): Response {
  return new Response("event: done\ndata: {}\n\n", {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

/** Drives every call site once and returns the URL each one asked for, in order. The
 *  fetch stub is the boundary: this lane's entire job is choosing that string. */
async function urlsAskedFor(): Promise<string[]> {
  const seen: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    seen.push(url);
    if (url.endsWith("/stream")) return sse();
    if (url.endsWith("/turns")) return json({ task_id: TASK_ID }, 202);
    if (url.endsWith("/messages")) return json({ messages: [] });
    return json({ sessions: [], session_id: "s-1" });
  }) as typeof fetch;
  try {
    await listSessions(session);
    await listSessionsForCaller(session);
    await createSession(session, { title: "t" });
    await getMessages(session, THREAD_ID);
    const turn = await postTurn(session, THREAD_ID, "hello", "turn-key-1");
    assert.equal(turn.kind, "accepted", `postTurn must reach its 202 arm, not ${JSON.stringify(turn)}`);
    await openTaskStream({ token: TOKEN, taskId: TASK_ID, signal: new AbortController().signal });
  } finally {
    globalThis.fetch = original;
  }
  return seen;
}

/** The six call sites, in the order `urlsAskedFor` drives them. Every one of these is a
 *  runtime path with its `/api` prefix REPLACED by `/api/runtime`, never prefixed. */
const EXPECTED = [
  "/api/runtime/chat/sessions",
  "/api/runtime/chat/sessions",
  "/api/runtime/chat/sessions",
  `/api/runtime/chat/sessions/${THREAD_ID}/messages`,
  `/api/runtime/chat/${THREAD_ID}/turns`,
  `/api/runtime/tasks/${TASK_ID}/stream`,
];

/** The bare runtime paths the OLD code produced with the variable unset — the exact
 *  strings the prep measured 404ing on apps/web's own origin. Named, not derived, so a
 *  reader can check them against the measurement rather than against this file. */
const THE_404_SHAPE = [
  "/api/chat/sessions",
  `/api/chat/sessions/${THREAD_ID}/messages`,
  `/api/chat/${THREAD_ID}/turns`,
  `/api/tasks/${TASK_ID}/stream`,
];

function withRuntimeEnv<T>(value: string | undefined, run: () => Promise<T>): Promise<T> {
  const original = process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL;
  if (value === undefined) delete process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL;
  else process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL = value;
  return run().finally(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL;
    else process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL = original;
  });
}

test("ARM 1 · with no browser runtime URL set, every chat and stream call is the same-origin proxy path", async () => {
  const seen = await withRuntimeEnv(undefined, urlsAskedFor);
  for (const url of seen) console.log(`  ${url}`);
  assert.deepEqual(seen, EXPECTED);

  // The 404 shape is not merely absent from the list — no URL may even END with one of
  // those paths, which is what a re-prefixing regression would produce.
  for (const url of seen) {
    for (const bare of THE_404_SHAPE) {
      assert.equal(
        url === bare,
        false,
        `${url} is the bare runtime path — apps/web has no Route Handler for it (FS-10 prep §5 R1)`,
      );
    }
  }
});

test("ARM 2 · NEXT_PUBLIC_CLARA_RUNTIME_URL cannot move a single one of them", async () => {
  const POISON = "https://poison.invalid";
  const seen = await withRuntimeEnv(POISON, async () => {
    // PRINT-THE-THING: the arm is only armed if the value is really in the environment
    // the module reads from. A green from an unarmed arm proves nothing.
    console.log(`  NEXT_PUBLIC_CLARA_RUNTIME_URL = ${process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL}`);
    assert.equal(process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL, POISON, "the poison value must be installed");
    return urlsAskedFor();
  });
  for (const url of seen) console.log(`  ${url}`);
  assert.deepEqual(seen, EXPECTED, "a browser-exposed base URL must have no path left to influence");
  for (const url of seen) {
    assert.equal(url.includes("poison.invalid"), false, `${url} carried the poison origin`);
  }
});

test("NO_DOUBLED_API · no call site keeps the runtime's own /api prefix behind the proxy's", async () => {
  const seen = await withRuntimeEnv(undefined, urlsAskedFor);
  for (const url of seen) {
    assert.equal(url.startsWith("/api/runtime/"), true, `${url} does not address the same-origin proxy`);
    assert.equal(
      url.includes("/api/api/"),
      false,
      `${url} would reach the runtime as /api/api/… — the proxy re-adds /api/ itself (route.ts:53)`,
    );
    // Same property, stated the way it is actually violated: the segment after the
    // proxy prefix must not itself be `api`.
    assert.notEqual(url.slice("/api/runtime/".length).split("/")[0], "api", `${url} double-prefixes /api`);
  }
});

test("an unauthenticated 307 to /login surfaces as a classified failure, never as parsed HTML", async () => {
  const original = globalThis.fetch;
  let seenRedirect: RequestRedirect | undefined;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seenRedirect = init?.redirect;
    // `proxy.ts` is this app's only auth gate and its matcher covers `/api/…`; a missing
    // cookie session answers a 307. With `redirect: "manual"` the browser hands back an
    // opaque-redirect response — `status: 0`, `ok: false` — which no status branch in
    // `api.ts` describes. Neither field is settable through the constructor (`status: 0`
    // is out of undici's legal range and `type` has no setter), so both are defined onto
    // the instance: this fixture is the browser's shape, not a Response you can build.
    const res = new Response(null, { status: 204 });
    Object.defineProperty(res, "type", { value: "opaqueredirect" });
    Object.defineProperty(res, "status", { value: 0 });
    Object.defineProperty(res, "ok", { value: false });
    return res;
  }) as typeof fetch;
  try {
    await assert.rejects(listSessions(session), /redirected/);
    assert.equal(seenRedirect, "manual", "a 307 to /login must never be followed into a 200 text/html page");
    const turn = await postTurn(session, THREAD_ID, "hello", "turn-key-1");
    assert.equal(turn.kind, "error");
    assert.match((turn as { message: string }).message, /redirected/);
  } finally {
    globalThis.fetch = original;
  }
});
