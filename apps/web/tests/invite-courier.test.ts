// THE INVITE COURIER'S BATTERY — P4-4.
//
// The order names the one test worth writing before any other: **the courier
// sends NO mail when the door refused**, "with a positive control proving the
// send-observer would have fired". Both halves are here, over the SAME fixture
// and the SAME observer, differing only in what the door does — so a green
// negative cannot be the observer quietly never working.
//
// Everything is driven through `handleInviteRequest`'s injectable seams, so every
// branch runs for real: no network, no Supabase, no PostgREST, and no mocking of
// the function under test.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { handleInviteRequest, type CourierDeps } from "../lib/members/courier";
import { DoorRefusal, errorFromCourierBody, InviteCourierError } from "../lib/members/doors";
import { RefusalError, WireError } from "../lib/wire";
import { INVITE_CLARA_TOKEN_PARAM } from "../lib/identity/doors";
import type { InviteMailer } from "../lib/members/invite-mail";
import type { ServerSession } from "../lib/supabase/server-session";

const ORIGIN = "http://localhost";
const PLAINTEXT = "a".repeat(32) + "b".repeat(32);
const HASHED = "supabase-hashed-token";
const INVITE_ID = "11111111-1111-4111-8111-111111111111";
const EXPIRES = "2026-09-06T00:00:00Z";

// The two secret-shaped values are the literal token `PLACEHOLDER`, which is
// what `scripts/check-leaks.mjs` accepts as an EXPLICIT placeholder
// (`SECRET_PLACEHOLDER`, `check-leaks.mjs:40`). A plausible-looking fake like
// "resend-key-for-this-test-only" trips `generic-key-assignment` — correctly, and
// this lane tripped it: a scanner that has to judge whether a key is real is a
// scanner that will one day let a real one through.
const FULL_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://rig.supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "PLACEHOLDER",
  RESEND_API_KEY: "PLACEHOLDER",
  INVITE_MAIL_FROM: "Clara <invites@example.test>",
};

// P4-2's fold replaced the lazy accessor with a ONCE-resolved `ServerSession` —
// the raw token plus the subject verified from that same token — so the courier
// now calls the door with exactly the bytes step 3 checked. These two drive both
// branches of that resolution.
const liveSession = async (): Promise<ServerSession | null> => ({
  accessToken: "caller-token",
  subject: "11111111-1111-4111-8111-111111111111",
});
const deadSession = async (): Promise<ServerSession | null> => null;

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/invite`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** THE OBSERVER. One object records every mint and every send, so "no mail" is a
 *  measured zero rather than an absence nobody looked for. */
type Observer = {
  mints: string[];
  sends: { to: string; subject: string; html: string }[];
  mailer: InviteMailer;
};

function observer(opts: { sendThrows?: Error; mintThrows?: Error } = {}): Observer {
  const mints: string[] = [];
  const sends: { to: string; subject: string; html: string }[] = [];
  return {
    mints,
    sends,
    mailer: {
      async mintSupabaseTokenHash(email: string): Promise<string> {
        mints.push(email);
        if (opts.mintThrows) throw opts.mintThrows;
        return HASHED;
      },
      async send(message): Promise<void> {
        sends.push(message);
        if (opts.sendThrows) throw opts.sendThrows;
      },
    },
  };
}

type DoorCall = { fn: string; args: Record<string, unknown> };

function deps(
  obs: Observer,
  door: { resolve?: unknown; reject?: unknown },
  overrides: Partial<CourierDeps> = {},
): { deps: CourierDeps; calls: DoorCall[] } {
  const calls: DoorCall[] = [];
  return {
    calls,
    deps: {
      env: FULL_ENV,
      resolveSession: liveSession,
      newOpKey: () => "op-key-pinned",
      readFirmName: async () => "ROME PROPERTIES",
      mailerFor: () => obs.mailer,
      callDoor: async <T,>(fn: string, args: Record<string, unknown>): Promise<T> => {
        calls.push({ fn, args });
        if (door.reject) throw door.reject;
        return door.resolve as T;
      },
      ...overrides,
    },
  };
}

const OK_RECEIPT = { invite_id: INVITE_ID, token_hash: "not-read-by-the-courier", expires_at: EXPIRES, token: PLAINTEXT };

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// THE NEGATIVE AND ITS POSITIVE CONTROL — the order's own headline pair.
// ---------------------------------------------------------------------------

describe("a refused door sends no mail", () => {
  const refusal = new DoorRefusal("CLR04", "cannot invite to a role above your own rank", {
    reason: null,
    status: 400,
    pgCode: "CLR04",
    codeSource: "sqlstate",
  });

  test("THE NEGATIVE: the door refuses CLR04 → nothing is minted and nothing is sent", async () => {
    const obs = observer();
    const { deps: d, calls } = deps(obs, { reject: refusal });
    const res = await handleInviteRequest(post({ email: "new@example.test", role: "owner" }), d);

    assert.equal(calls.length, 1, "the door must still have been CALLED — the DB is the wall");
    assert.equal(obs.mints.length, 0, "a refused invite must not mint a Supabase token");
    assert.equal(obs.sends.length, 0, "A REFUSED INVITE MUST NOT SEND MAIL");

    const body = await json(res);
    assert.equal(res.status, 400);
    assert.equal(body.kind, "refusal");
    const r = body.refusal as Record<string, unknown>;
    assert.equal(r.code, "CLR04");
    assert.equal(r.message, "cannot invite to a role above your own rank", "the DB's message is relayed VERBATIM");
  });

  test("POSITIVE CONTROL: the same fixture with a door that SUCCEEDS does send", async () => {
    const obs = observer();
    const { deps: d } = deps(obs, { resolve: OK_RECEIPT });
    const res = await handleInviteRequest(post({ email: "new@example.test", role: "owner" }), d);

    assert.equal(res.status, 200);
    assert.equal(obs.mints.length, 1, "the observer's mint half fires when the door succeeds");
    assert.equal(obs.sends.length, 1, "THE OBSERVER FIRES — so the zero above is a measured zero, not a broken mock");
  });

  test("a transport failure from the door also sends nothing", async () => {
    const obs = observer();
    const { deps: d } = deps(obs, { reject: new WireError("connection reset", { status: null }) });
    const res = await handleInviteRequest(post({ email: "new@example.test", role: "admin" }), d);
    assert.equal(res.status, 502);
    assert.equal((await json(res)).code, "transport");
    assert.equal(obs.sends.length, 0);
  });
});

// ---------------------------------------------------------------------------
// THE ORDERING — every gate ahead of the door leaves the door UNCALLED.
// ---------------------------------------------------------------------------

describe("nothing is minted before the courier can finish the job", () => {
  test("a cross-origin POST is refused 403 and never reaches the door", async () => {
    const obs = observer();
    const { deps: d, calls } = deps(obs, { resolve: OK_RECEIPT });
    const req = new Request(`${ORIGIN}/api/invite`, {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.test", role: "admin" }),
    });
    const res = await handleInviteRequest(req, d);
    assert.equal(res.status, 403);
    assert.equal((await json(res)).code, "cross_origin");
    assert.equal(calls.length, 0);
    assert.equal(obs.sends.length, 0);
  });

  test("a missing Origin header is refused too — absence is not evidence", async () => {
    const obs = observer();
    const { deps: d, calls } = deps(obs, { resolve: OK_RECEIPT });
    const req = new Request(`${ORIGIN}/api/invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.test", role: "admin" }),
    });
    const res = await handleInviteRequest(req, d);
    assert.equal(res.status, 403);
    assert.equal(calls.length, 0);
  });

  test("a body that is not {email, role} is refused 400 and never reaches the door", async () => {
    const obs = observer();
    const { deps: d, calls } = deps(obs, { resolve: OK_RECEIPT });
    for (const body of [{ email: "a@b.test" }, { role: "admin" }, { email: 1, role: "admin" }, "not json at all"]) {
      const res = await handleInviteRequest(post(body), d);
      assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
      assert.equal((await json(res)).code, "invalid_request");
    }
    assert.equal(calls.length, 0);
    assert.equal(obs.sends.length, 0);
  });

  test("an EMPTY email and an unknown role are passed STRAIGHT THROUGH to the door", async () => {
    // The courier must not pre-empt CLR10 'a valid email is required' or CLR10
    // 'bad role'. If this ever goes red because the courier "validated" them, the
    // UI has started guessing the DB's answer (plan §2 rule (b)).
    const obs = observer();
    const { deps: d, calls } = deps(obs, { resolve: OK_RECEIPT });
    await handleInviteRequest(post({ email: "", role: "wizard" }), d);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]?.args, { p_email: "", p_role: "wizard", p_op_key: "op-key-pinned" });
  });

  test("no session → 401, and the door is never called", async () => {
    const obs = observer();
    const { deps: d, calls } = deps(obs, { resolve: OK_RECEIPT }, { resolveSession: deadSession });
    const res = await handleInviteRequest(post({ email: "a@b.test", role: "admin" }), d);
    assert.equal(res.status, 401);
    assert.equal((await json(res)).code, "no_session");
    assert.equal(calls.length, 0);
  });

  test("no mail transport → 503, and NOTHING IS MINTED", async () => {
    // The ordering decision this train had to make: an invite whose mail cannot
    // go out is permanently unusable AND blocks that email for seven days behind
    // CLR10 'an invite is already pending for this email'. So the capability
    // check sits BEFORE the door — and after the session check, so an
    // unauthenticated prober learns nothing about this deployment's config.
    const obs = observer();
    const { deps: d, calls } = deps(obs, { resolve: OK_RECEIPT }, { env: { ...FULL_ENV, RESEND_API_KEY: "  " } });
    const res = await handleInviteRequest(post({ email: "a@b.test", role: "admin" }), d);
    assert.equal(res.status, 503);
    const body = await json(res);
    assert.equal(body.code, "mail_not_configured");
    assert.match(String(body.detail), /RESEND_API_KEY/, "the unset variable is NAMED so it can be fixed");
    assert.equal(calls.length, 0, "NOTHING may be minted when the mail cannot go out");
  });

  test("the config check reports every missing name, and never a value", async () => {
    const obs = observer();
    const { deps: d } = deps(obs, { resolve: OK_RECEIPT }, { env: {} });
    const body = await json(await handleInviteRequest(post({ email: "a@b.test", role: "admin" }), d));
    const detail = String(body.detail);
    for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "INVITE_MAIL_FROM"]) {
      assert.match(detail, new RegExp(name));
    }
    for (const secret of Object.values(FULL_ENV)) {
      assert.ok(!detail.includes(secret), "a value must never appear in a refusal");
    }
  });
});

// ---------------------------------------------------------------------------
// THE PLAINTEXT — into the mail body and NOWHERE ELSE.
// ---------------------------------------------------------------------------

describe("the plaintext invite token", () => {
  test("reaches the mail body inside a two-secret link, and nothing else", async () => {
    const obs = observer();
    const { deps: d } = deps(obs, { resolve: OK_RECEIPT });
    const res = await handleInviteRequest(post({ email: "new@example.test", role: "bookkeeper" }), d);

    assert.equal(obs.sends.length, 1);
    const sent = obs.sends[0]!;
    assert.equal(sent.to, "new@example.test");
    // THE LINK SHAPE, ruled 2026-08-30 option (a):
    // /invite/<supabase_token_hash>?ct=<clara_token>
    const href = /href="([^"]+)"/.exec(sent.html)?.[1];
    assert.ok(href, "the mail must carry a link");
    const url = new URL(href);
    assert.equal(url.pathname, `/invite/${HASHED}`, "the PATH segment is Supabase's token_hash");
    assert.equal(
      url.searchParams.get(INVITE_CLARA_TOKEN_PARAM),
      PLAINTEXT,
      "Clara's own token rides the ?ct= parameter, whose name is imported from lib/identity/doors.ts",
    );
    assert.equal(url.origin, ORIGIN, "the link lands on the origin the request itself proved");

    // …AND NOWHERE ELSE.
    const bodyText = await res.clone().text();
    assert.ok(!bodyText.includes(PLAINTEXT), "THE PLAINTEXT MUST NEVER BE IN THE RESPONSE BODY");
    assert.ok(!bodyText.includes(HASHED), "the Supabase token hash has no business in the response either");
    assert.ok(!bodyText.includes("token_hash"), "the door's token_hash key must not be relayed");
    const parsed = await json(res);
    assert.deepEqual(parsed, { ok: true, invite_id: INVITE_ID, expires_at: EXPIRES });
  });

  test("the mail names the firm and the role, and carries no client data", async () => {
    const obs = observer();
    const { deps: d } = deps(obs, { resolve: OK_RECEIPT });
    await handleInviteRequest(post({ email: "new@example.test", role: "bookkeeper" }), d);
    const sent = obs.sends[0]!;
    assert.match(sent.subject, /ROME PROPERTIES/);
    assert.match(sent.html, /bookkeeper/);
    assert.match(sent.html, /expires on 2026-09-06T00:00:00Z/);
  });

  test("an unreadable firm name degrades to a nameless subject, never a guessed one", async () => {
    const obs = observer();
    const { deps: d } = deps(obs, { resolve: OK_RECEIPT }, { readFirmName: async () => { throw new Error("read failed"); } });
    const res = await handleInviteRequest(post({ email: "new@example.test", role: "viewer" }), d);
    assert.equal(res.status, 200, "a courtesy read must not turn a successful invite into an error");
    assert.equal(obs.sends.length, 1);
    assert.equal(obs.sends[0]!.subject, "You have been invited to Clara");
  });

  test("a receipt with NO plaintext (an op_key replay) sends nothing and names the invite", async () => {
    const obs = observer();
    const { deps: d } = deps(obs, { resolve: { invite_id: INVITE_ID, expires_at: EXPIRES, token_hash: "sha" } });
    const res = await handleInviteRequest(post({ email: "a@b.test", role: "admin" }), d);
    assert.equal(res.status, 502);
    const body = await json(res);
    assert.equal(body.code, "mail_failed");
    assert.deepEqual(body.invite, { invite_id: INVITE_ID, expires_at: EXPIRES });
    assert.equal(obs.sends.length, 0, "a link with no ?ct= is worse than no link");
  });

  test("an unrecognised receipt shape is a failure, never a claimed send", async () => {
    const obs = observer();
    const { deps: d } = deps(obs, { resolve: { surprise: true } });
    const res = await handleInviteRequest(post({ email: "a@b.test", role: "admin" }), d);
    assert.equal(res.status, 502);
    assert.equal((await json(res)).code, "mail_failed");
    assert.equal(obs.sends.length, 0);
  });
});

describe("a send that fails after the door succeeded", () => {
  test("names the invite so it can be revoked, and leaks no plaintext", async () => {
    const obs = observer({ sendThrows: new Error("450: the mail provider rejected the recipient") });
    const { deps: d } = deps(obs, { resolve: OK_RECEIPT });
    const res = await handleInviteRequest(post({ email: "a@b.test", role: "admin" }), d);
    assert.equal(res.status, 502);
    const text = await res.clone().text();
    const body = await json(res);
    assert.equal(body.code, "mail_failed");
    assert.deepEqual(body.invite, { invite_id: INVITE_ID, expires_at: EXPIRES });
    assert.match(String(body.detail), /the mail provider rejected the recipient/);
    assert.ok(!text.includes(PLAINTEXT), "not even a failure may carry the plaintext");
  });

  test("a failed MINT is the same class of answer — the door already succeeded", async () => {
    const obs = observer({ mintThrows: new Error("email_exists") });
    const { deps: d } = deps(obs, { resolve: OK_RECEIPT });
    const res = await handleInviteRequest(post({ email: "a@b.test", role: "admin" }), d);
    assert.equal(res.status, 502);
    assert.equal((await json(res)).code, "mail_failed");
    assert.equal(obs.sends.length, 0);
  });
});

// ---------------------------------------------------------------------------
// THE CLIENT HALF — the same refusal class, rebuilt from the envelope.
// ---------------------------------------------------------------------------

describe("errorFromCourierBody reconstructs the SAME classes", () => {
  test("a refusal envelope becomes a real RefusalError, not a lookalike", () => {
    const e = errorFromCourierBody(400, {
      ok: false,
      kind: "refusal",
      refusal: {
        code: "CLR09",
        message: "cannot demote/remove the last active owner",
        reason: null,
        status: 400,
        pgCode: "CLR09",
        codeSource: "sqlstate",
      },
    });
    // `instanceof` is the whole point: lib/parts/hooks.ts's applyFailure
    // classifies by it, and a structurally-similar class minted elsewhere would
    // silently lose the CLR chip (review law 3 — spelling is not identity).
    assert.ok(e instanceof RefusalError, "must be wire.ts's own RefusalError");
    assert.ok(e instanceof DoorRefusal, "…which is exactly what lib/doors.ts re-exports as DoorRefusal");
    assert.equal((e as RefusalError).code, "CLR09");
    assert.equal(e.message, "cannot demote/remove the last active owner");
  });

  test("a courier envelope becomes an InviteCourierError carrying its invite", () => {
    const e = errorFromCourierBody(502, {
      ok: false,
      kind: "courier",
      code: "mail_failed",
      message: "the invite was created but the email could not be sent",
      invite: { invite_id: INVITE_ID, expires_at: EXPIRES },
      detail: "450",
    });
    assert.ok(e instanceof InviteCourierError);
    assert.equal((e as InviteCourierError).code, "mail_failed");
    assert.deepEqual((e as InviteCourierError).invite, { invite_id: INVITE_ID, expires_at: EXPIRES });
  });

  test("FAIL-CLOSED: an unrecognised body, and an unknown code, both become transport", () => {
    for (const body of [null, {}, { kind: "refusal" }, { kind: "courier", code: "made_up" }, "text"]) {
      const e = errorFromCourierBody(500, body);
      assert.ok(e instanceof InviteCourierError, `expected a courier error for ${JSON.stringify(body)}`);
      assert.equal((e as InviteCourierError).code, "transport");
    }
  });
});
