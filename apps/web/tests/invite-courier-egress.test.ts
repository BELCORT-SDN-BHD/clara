// THE INVITE COURIER — WHAT MAY LEAVE THE PROCESS. P4-4, folding the independent
// review of #455.
//
// Its sibling `tests/invite-courier.test.ts` is about ORDERING (which gate runs
// before which door). This file is about EGRESS, and it has four subjects:
//
//   MEDIUM-2  THE LINK IS BUILT FROM THE ORIGIN THE WALL PROVED, never from
//             `request.url`'s authority — which behind a proxy is a different,
//             possibly internal and plain-HTTP value, in an email nobody can
//             un-send.
//   MEDIUM-3  NO UPSTREAM TEXT reaches a browser OR a log line. Resend was handed
//             the full secret URL, so a provider's error string is a string that
//             has been in the same process as both bearer factors.
//   FIND-5(b) THE DOOR IS CALLED AS THE CALLER — asserted on the `opts.session`
//             the courier actually passed, not on the mere fact of a call.
//   FIND-5(a) THE ROUTE IS A WRAPPER AND NOTHING ELSE — pinned mechanically off
//             comment-stripped source, so a body-replaced/comments-kept mutant
//             cannot pass.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { handleInviteRequest, type InviteCourierLogEntry } from "../lib/members/courier";
import { InviteMailFailure } from "../lib/members/invite-mail";
import { exportedHttpMethods, readCode, reachableFrom, stripComments } from "../test/sourceOracle";
import {
  CALLER_BYTES,
  deadSession,
  deps,
  FULL_ENV,
  HASHED,
  json,
  observer,
  OK_RECEIPT,
  PLAINTEXT,
  post,
} from "./invite-courier-fixtures";
import type { ServerSession } from "../lib/supabase/server-session";

const WEB_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

// ---------------------------------------------------------------------------
// MEDIUM-2 — THE PROVEN ORIGIN, AND ONLY IT
// ---------------------------------------------------------------------------

describe("the invitation link is built from the origin the wall PROVED", () => {
  test("behind a proxy the mail carries the public origin, never request.url's internal authority", async () => {
    // The exact deployment shape that makes the two diverge: the browser
    // addressed `https://app.clara.example`, the proxy forwarded it under that
    // name, and the worker sees its OWN internal, plain-HTTP URL. The wall passes
    // on `x-forwarded-host`; the old code then built the link from `request.url`.
    // THE ALLOWLIST IS WHAT LICENSES IT NOW (N3), not the forwarded header. The
    // header is still present and still ignored; what makes this request pass is
    // that the operator named `https://app.clara.example` in
    // `CLARA_PUBLIC_ORIGINS`.
    const obs = observer();
    const { deps: d } = deps(
      obs,
      { resolve: OK_RECEIPT },
      { env: { ...FULL_ENV, CLARA_PUBLIC_ORIGINS: "https://app.clara.example" } },
    );
    const request = new Request("http://internal.worker.local/api/invite", {
      method: "POST",
      headers: {
        origin: "https://app.clara.example",
        "x-forwarded-host": "app.clara.example",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: "new@example.test", role: "bookkeeper" }),
    });

    const res = await handleInviteRequest(request, d);
    assert.equal(res.status, 200);
    assert.equal(obs.sends.length, 1);

    const href = /href="([^"]+)"/.exec(obs.sends[0]!.html)?.[1];
    assert.ok(href, "the mail must carry a link");
    const url = new URL(href);
    assert.equal(
      url.origin,
      "https://app.clara.example",
      "THE LINK MUST CARRY THE ORIGIN THE WALL VALIDATED — not the authority the worker happens to see",
    );
    assert.ok(
      !obs.sends[0]!.html.includes("internal.worker.local"),
      "an internal authority must never appear anywhere in an email nobody can un-send",
    );
    assert.ok(!obs.sends[0]!.html.includes("http://"), "…and the link must not be downgraded to plain HTTP");
  });

  test("VACUITY CONTROL: the same request WOULD have yielded the internal authority", async () => {
    // Without this, the cell above is equally green on a fixture where
    // `request.url` and the Origin header happen to agree — which is every other
    // cell in this suite. This measures the divergence itself.
    const derivedFromRequestUrl = new URL("http://internal.worker.local/api/invite").origin;
    assert.notEqual(
      derivedFromRequestUrl,
      "https://app.clara.example",
      "the fixture no longer makes the two derivations differ — this control has stopped controlling",
    );
  });

  test("N3: A SPOOFED FORWARDED HOST cannot make the courier mail both secrets to the attacker", async () => {
    // CODEX ROUND 2, N3, END TO END. The wall used to treat `x-forwarded-host` as
    // an independent peer of `Host`, so an attacker supplied BOTH it and the
    // matching `Origin` and the proof came back carrying `attacker.example` — and
    // this courier then built the invite URL from the proven origin and mailed it.
    // The real Host here is Clara's; only the two attacker-controlled headers
    // agree with each other.
    const spoof = new Request("https://app.clara.example/api/invite", {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        host: "app.clara.example",
        "x-forwarded-host": "attacker.example",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: "victim@example.test", role: "admin" }),
    });

    for (const allowlist of ["", "https://app.clara.example"]) {
      const obs = observer();
      const { deps: d, calls } = deps(
        obs,
        { resolve: OK_RECEIPT },
        { env: { ...FULL_ENV, CLARA_PUBLIC_ORIGINS: allowlist } },
      );
      const res = await handleInviteRequest(spoof.clone(), d);
      assert.equal(res.status, 403, `accepted with CLARA_PUBLIC_ORIGINS=${JSON.stringify(allowlist)}`);
      assert.equal((await json(res)).code, "cross_origin");
      assert.equal(calls.length, 0, "nothing minted");
      assert.equal(obs.sends.length, 0, "AND NOTHING MAILED — the link would have carried both bearer factors");
    }
  });

  test("N3: an EXPLICITLY ALLOWED alias origin works — the allowlist is the licence", async () => {
    // The positive control for the wall above, and the reason the allowlist
    // exists at all: a deployment that genuinely answers on a second origin says
    // so in configuration, and that origin then works even though the request URL
    // reads as the internal hop.
    const obs = observer();
    const { deps: d } = deps(
      obs,
      { resolve: OK_RECEIPT },
      { env: { ...FULL_ENV, CLARA_PUBLIC_ORIGINS: "https://app.clara.example, https://alias.clara.example" } },
    );
    const res = await handleInviteRequest(
      new Request("http://internal.worker.local/api/invite", {
        method: "POST",
        headers: {
          origin: "https://alias.clara.example",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
        },
        body: JSON.stringify({ email: "new@example.test", role: "bookkeeper" }),
      }),
      d,
    );
    assert.equal(res.status, 200);
    const href = /href="([^"]+)"/.exec(obs.sends[0]!.html)?.[1];
    assert.equal(new URL(href as string).origin, "https://alias.clara.example");
  });

  test("a request whose Origin matches nothing addressed is still refused, and mails nothing", async () => {
    const obs = observer();
    const { deps: d, calls } = deps(obs, { resolve: OK_RECEIPT });
    const request = new Request("http://internal.worker.local/api/invite", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "x-forwarded-host": "app.clara.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: "a@b.test", role: "admin" }),
    });
    const res = await handleInviteRequest(request, d);
    assert.equal(res.status, 403);
    assert.equal(calls.length, 0);
    assert.equal(obs.sends.length, 0);
  });
});

// ---------------------------------------------------------------------------
// MEDIUM-3 — NO UPSTREAM TEXT IN A RESPONSE OR A LOG LINE
// ---------------------------------------------------------------------------

/** Every secret and near-secret this process holds during one invite. A thrown
 *  value that carried ANY of them must not put it in a response or a log. */
const SECRETS = [
  PLAINTEXT,
  HASHED,
  FULL_ENV.SUPABASE_SERVICE_ROLE_KEY,
  FULL_ENV.RESEND_API_KEY,
  FULL_ENV.NEXT_PUBLIC_SUPABASE_URL,
];

function assertNoSecret(haystack: string, where: string): void {
  for (const secret of SECRETS) {
    assert.ok(!haystack.includes(secret), `${where} carried a secret-bearing value (${secret.slice(0, 12)}…)`);
  }
  assert.ok(!haystack.includes("api.resend.com"), `${where} carried the provider endpoint`);
  assert.ok(!haystack.includes("PROVIDER-SAID"), `${where} relayed the provider's own words`);
}

describe("a provider's words never reach the browser or the log", () => {
  /** A thrown value as hostile as a real one: it carries BOTH bearer factors, the
   *  whole mail body, both keys and the provider's own sentence. Built from the
   *  message the transport was actually handed, so nothing here is a lookalike. */
  const hostileFromMessage = (m: { to: string; subject: string; html: string }): Error =>
    new Error(
      `PROVIDER-SAID 422 rejecting POST ${"https://api.resend.com/emails"} ` +
        `auth=Bearer ${FULL_ENV.RESEND_API_KEY} service=${FULL_ENV.SUPABASE_SERVICE_ROLE_KEY} ` +
        `project=${FULL_ENV.NEXT_PUBLIC_SUPABASE_URL} to=${m.to} body=${m.html}`,
    );

  test("A SEND THAT THROWS EVERYTHING: the response carries a code, a sentence and an id — nothing else", async () => {
    const logs: InviteCourierLogEntry[] = [];
    const obs = observer({ sendThrowsFrom: hostileFromMessage });
    const { deps: d } = deps(obs, { resolve: OK_RECEIPT }, { logFailure: (e) => logs.push(e) });
    const res = await handleInviteRequest(post({ email: "new@example.test", role: "admin" }), d);

    assert.equal(res.status, 502);
    const text = await res.clone().text();
    const body = await json(res);
    assert.equal(body.code, "mail_failed");
    assert.equal(body.correlation_id, "corr-pinned");
    assert.equal(body.detail, null, "the detail channel carries CLARA'S OWN text or nothing — never an upstream string");
    assertNoSecret(text, "the response body");

    // …AND THE LOG IS THE SAME PROMISE, kept by SHAPE. The entry has no free-text
    // field at all, so there is nowhere for a provider's sentence to sit.
    assert.equal(logs.length, 1, "exactly one line is logged — the seam fired");
    assertNoSecret(JSON.stringify(logs[0]), "the log line");
    assert.deepEqual(Object.keys(logs[0]!).sort(), ["code", "correlationId", "event", "failure", "providerStatus"]);
    assert.equal(logs[0]!.correlationId, "corr-pinned", "the browser's id and the log's id are the SAME id");
    assert.equal(logs[0]!.failure, "unclassified", "a thrown value this file does not recognise is classified, not quoted");
  });

  test("a CLASSIFIED transport failure logs its code and the provider's STATUS NUMBER", async () => {
    // The positive control for the line above: when the transport threw its own
    // typed failure, the log gets something genuinely useful — and still no text.
    const logs: InviteCourierLogEntry[] = [];
    const obs = observer({ sendThrows: new InviteMailFailure("provider_unauthorized", 401) });
    const { deps: d } = deps(obs, { resolve: OK_RECEIPT }, { logFailure: (e) => logs.push(e) });
    await handleInviteRequest(post({ email: "new@example.test", role: "admin" }), d);

    assert.equal(logs.length, 1);
    assert.equal(logs[0]!.failure, "provider_unauthorized");
    assert.equal(logs[0]!.providerStatus, 401);
    assert.equal(logs[0]!.code, "mail_failed", "…alongside what the browser was told, so the two can be joined");
  });

  test("A MINT THAT THROWS EVERYTHING leaks nothing either", async () => {
    const logs: InviteCourierLogEntry[] = [];
    const obs = observer({
      mintThrows: new Error(
        `PROVIDER-SAID 500 at ${FULL_ENV.NEXT_PUBLIC_SUPABASE_URL} key=${FULL_ENV.SUPABASE_SERVICE_ROLE_KEY}`,
      ),
    });
    const { deps: d } = deps(obs, { resolve: OK_RECEIPT }, { logFailure: (e) => logs.push(e) });
    const res = await handleInviteRequest(post({ email: "new@example.test", role: "admin" }), d);

    assert.equal(res.status, 502);
    assertNoSecret(await res.clone().text(), "the mint-failure response");
    assert.equal(logs.length, 1);
    assertNoSecret(JSON.stringify(logs[0]), "the mint-failure log line");
  });

  test("A WIRE FAILURE FROM THE DOOR is not relayed either — its text carries the PostgREST URL", async () => {
    const logs: InviteCourierLogEntry[] = [];
    const obs = observer();
    const { deps: d } = deps(
      obs,
      { reject: new Error(`PROVIDER-SAID fetch failed for ${FULL_ENV.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/invite_member`) },
      { logFailure: (e) => logs.push(e) },
    );
    const res = await handleInviteRequest(post({ email: "a@b.test", role: "admin" }), d);

    assert.equal(res.status, 502);
    const text = await res.clone().text();
    const body = await json(res);
    assert.equal(body.code, "transport");
    assert.equal(
      body.message,
      "the invite door could not be reached — nothing was created",
      "CLARA'S OWN sentence, fixed — a governed REFUSAL is the only thing relayed verbatim",
    );
    assertNoSecret(text, "the door-transport response");
    assert.equal(logs.length, 1);
    assert.equal(logs[0]!.code, "transport");
  });

  test("a capability check that throws logs and refuses without a word of it", async () => {
    const logs: InviteCourierLogEntry[] = [];
    const obs = observer({
      canMintThrows: new Error(`PROVIDER-SAID 503 key=${FULL_ENV.SUPABASE_SERVICE_ROLE_KEY}`),
    });
    const { deps: d, calls } = deps(obs, { resolve: OK_RECEIPT }, { logFailure: (e) => logs.push(e) });
    const res = await handleInviteRequest(post({ email: "a@b.test", role: "admin" }), d);

    assert.equal(res.status, 503);
    const text = await res.clone().text();
    assert.equal((await json(res)).code, "mail_unavailable");
    assertNoSecret(text, "the capability-check response");
    assert.equal(calls.length, 0);
    assert.equal(logs.length, 1);
    assertNoSecret(JSON.stringify(logs[0]), "the capability-check log line");
  });

  test("VACUITY CONTROL: the hostile fixture really does carry every secret", async () => {
    // If the thrown value stopped containing them, every assertion above would be
    // trivially true — the classic absence-from-the-wrong-instrument green.
    const obs = observer({ sendThrowsFrom: hostileFromMessage });
    const { deps: d } = deps(obs, { resolve: OK_RECEIPT });
    await handleInviteRequest(post({ email: "new@example.test", role: "admin" }), d);
    assert.equal(obs.sends.length, 1, "the send half must have fired for a message to have been built");
    const thrown = hostileFromMessage(obs.sends[0]!).message;
    for (const secret of SECRETS) {
      assert.ok(thrown.includes(secret), `the hostile fixture no longer carries ${secret.slice(0, 12)}…`);
    }
    assert.ok(thrown.includes("PROVIDER-SAID"), "the fixture no longer carries the provider's own words");
  });

  test("the GOVERNED refusal is still relayed VERBATIM — the wall is on upstream text, not on the DB's voice", async () => {
    const { DoorRefusal } = await import("../lib/members/doors");
    const obs = observer();
    const { deps: d } = deps(obs, {
      reject: new DoorRefusal("CLR10", "an invite is already pending for this email", {
        reason: null,
        status: 400,
        pgCode: "CLR10",
        codeSource: "sqlstate",
      }),
    });
    const res = await handleInviteRequest(post({ email: "a@b.test", role: "admin" }), d);
    const body = await json(res);
    assert.equal(res.status, 400);
    assert.equal(
      (body.refusal as Record<string, unknown>).message,
      "an invite is already pending for this email",
      "the DB writes its refusals to be read — that text is Clara's, and it is relayed unchanged",
    );
  });
});

// ---------------------------------------------------------------------------
// FIND-5(b) — THE DOOR IS CALLED AS THE CALLER
// ---------------------------------------------------------------------------

describe("the door and the firm read run on the CALLER'S OWN session", () => {
  test("the door's opts.session yields exactly the bytes step 3 resolved", async () => {
    const obs = observer();
    const { deps: d, calls, firmReads } = deps(obs, { resolve: OK_RECEIPT });
    await handleInviteRequest(post({ email: "a@b.test", role: "admin" }), d);

    assert.equal(calls.length, 1);
    const passed = await calls[0]!.opts.session.getAccessToken();
    assert.equal(
      passed,
      CALLER_BYTES,
      "THE DOOR MUST RUN AS THE CALLER — `_human_ctx` performs the authority check against whoever these bytes are",
    );
    assert.equal(firmReads[0], CALLER_BYTES, "…and the courtesy read is the same principal, not a service identity");
  });

  test("ALTERNATE PRINCIPAL: a different resolved session reaches the door as THAT one", async () => {
    // The control that makes the pin above non-vacuous: it tracks the session
    // rather than asserting a constant that happens to match. A courier that
    // handed the door a second, differently-resolved accessor — a service key, a
    // re-read cookie — would fail one of the two.
    const other = "a-different-caller-entirely";
    const obs = observer();
    const { deps: d, calls, firmReads } = deps(
      obs,
      { resolve: OK_RECEIPT },
      { resolveSession: async (): Promise<ServerSession | null> => ({ accessToken: other, subject: "s-2" }) },
    );
    await handleInviteRequest(post({ email: "a@b.test", role: "admin" }), d);

    assert.equal(await calls[0]!.opts.session.getAccessToken(), other);
    assert.equal(firmReads[0], other);
    assert.notEqual(other, CALLER_BYTES, "VACUITY GUARD: the two fixtures must actually differ");
  });

  test("COMBINED: no session AND no config → 401, no env names, and zero calls of any kind", async () => {
    // The session gate is FIRST, so an unauthenticated prober cannot learn
    // whether this deployment has mail configured — the whole reason step 4 sits
    // after step 3. Asserted together because the ordering is the claim.
    const obs = observer();
    const { deps: d, calls, firmReads } = deps(
      obs,
      { resolve: OK_RECEIPT },
      { resolveSession: deadSession, env: {} },
    );
    const res = await handleInviteRequest(post({ email: "a@b.test", role: "admin" }), d);

    assert.equal(res.status, 401);
    const text = await res.clone().text();
    assert.equal((await json(res)).code, "no_session");
    for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "INVITE_MAIL_FROM"]) {
      assert.ok(!text.includes(name), `an unauthenticated caller was told about ${name}`);
    }
    assert.equal(calls.length, 0, "no door call");
    assert.equal(obs.mintChecks.length, 0, "no directory read");
    assert.equal(obs.mints.length, 0, "no mint");
    assert.equal(obs.sends.length, 0, "no send");
    assert.equal(firmReads.length, 0, "no courtesy read");
  });
});

// ---------------------------------------------------------------------------
// FIND-5(a) — THE ROUTE IS A WRAPPER, PINNED MECHANICALLY
//
// The scope-exemption evidence in `tests/firm-scope-surfaces.test.ts` is about
// what the route does NOT call. This pins what it DOES: the shipped POST really
// is `handleInviteRequest`, so every cell above is testing production's own path
// rather than a library the route might have stopped using.
// ---------------------------------------------------------------------------

describe("app/api/invite/route.ts is a wrapper around handleInviteRequest and nothing else", () => {
  const ROUTE = "app/api/invite/route.ts";
  const code = readCode(join(WEB_ROOT, ROUTE));

  test("it VALUE-imports handleInviteRequest — a type-only edge would not be the real function", () => {
    const valueImported = [...code.matchAll(/import\s+([\s\S]*?)from\s*["']([^"']+)["']/g)].some(
      (m) => !/^\s*type\s/.test(m[1] as string) && /handleInviteRequest/.test(m[1] as string),
    );
    assert.ok(valueImported, `${ROUTE} does not value-import handleInviteRequest`);
  });

  test("the EXECUTABLE POST delegates to it — reachability, not a mention in a header", () => {
    const reachable = reachableFrom(code, "POST");
    assert.ok(reachable !== null, `${ROUTE} exports no POST at all`);
    assert.match(
      reachable,
      /handleInviteRequest\s*\(\s*request\s*\)/,
      "POST must hand the REQUEST to the courier — not a rebuilt one, and not nothing",
    );
  });

  test("POST is the ONLY verb exported — a second handler is a second, unguarded path", () => {
    assert.deepEqual(exportedHttpMethods(code), ["POST"]);
  });

  test("RED-BEFORE: a body-replaced, comments-KEPT mutant fails the delegation pin", () => {
    // THE MUTANT THIS PIN EXISTS TO CATCH, and the reason the oracle strips
    // comments before looking: the route file's long header NAMES
    // `handleInviteRequest` in prose, so a POST that no longer calls it still
    // satisfies a raw-text search of the file. Both halves are measured here —
    // the naive instrument passes the mutant, this pin REDs it.
    const raw = readFileSync(join(WEB_ROOT, ROUTE), "utf8");
    const mutant = raw.replace(
      /export async function POST\([\s\S]*$/,
      "export async function POST(request: Request): Promise<Response> {\n  return new Response(null, { status: 204 });\n}\n",
    );
    assert.notEqual(mutant, raw, "the mutation did not apply — this control proves nothing");
    assert.ok(
      mutant.includes("handleInviteRequest"),
      "THE NAIVE INSTRUMENT PASSES THE MUTANT: the header still names the courier, which is exactly why raw text is not evidence",
    );

    const mutantReachable = reachableFrom(stripComments(mutant), "POST");
    assert.ok(mutantReachable !== null, "the mutant still exports POST");
    assert.ok(
      !/handleInviteRequest\s*\(\s*request\s*\)/.test(mutantReachable),
      "THE PIN IS VACUOUS: a POST that returns 204 without calling the courier still satisfies it",
    );
  });

  test("RED-BEFORE: a mutant that adds a SECOND verb fails the exported-methods pin", () => {
    // A GET on a mutation route is link-prefetchable and crawlable — the route's
    // own header names that as the reason it exports POST only.
    const raw = readFileSync(join(WEB_ROOT, ROUTE), "utf8");
    const mutant = `${raw}\nexport async function GET(): Promise<Response> {\n  return new Response(null);\n}\n`;
    assert.deepEqual(
      exportedHttpMethods(stripComments(mutant)).sort(),
      ["GET", "POST"],
      "the methods pin cannot see a second exported verb",
    );
  });
});
