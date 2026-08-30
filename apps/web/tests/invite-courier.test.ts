// THE INVITE COURIER'S BATTERY — P4-4. THE ORDERING.
//
// The order names the one test worth writing before any other: **the courier
// sends NO mail when the door refused**, "with a positive control proving the
// send-observer would have fired". Both halves are here, over the SAME fixture
// and the SAME observer, differing only in what the door does — so a green
// negative cannot be the observer quietly never working.
//
// Everything is driven through `handleInviteRequest`'s injectable seams
// (`tests/invite-courier-fixtures.ts`), so every branch runs for real: no
// network, no Supabase, no PostgREST, and no mocking of the function under test.
//
// ITS SIBLING FILE. The two egress walls the independent review of #455 added —
// the PROVEN ORIGIN the link is built from (MEDIUM-2) and NO UPSTREAM TEXT in a
// response or a log line (MEDIUM-3), plus the route's own pin and the principal
// cells — live in `tests/invite-courier-egress.test.ts`. Split by SUBJECT: this
// file is about the courier's ORDERING, that one about what may leave the process.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { handleInviteRequest } from "../lib/members/courier";
import { DoorRefusal, errorFromCourierBody, InviteCourierError } from "../lib/members/doors";
import { RefusalError, WireError } from "../lib/wire";
import { INVITE_CLARA_TOKEN_PARAM } from "../lib/identity/doors";
import { InviteMailFailure } from "../lib/members/invite-mail";
import {
  deadSession,
  deps,
  EXPIRES,
  FIRM_A,
  FIRM_B,
  FULL_ENV,
  HASHED,
  INVITE_ID,
  json,
  observer,
  OK_RECEIPT,
  OK_RECEIPT_WITH_FIRM,
  ORIGIN,
  PLAINTEXT,
  post,
} from "./invite-courier-fixtures";

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
// FIND-1 — AN ADDRESS THAT ALREADY HAS AN ACCOUNT NEVER REACHES THE DOOR.
//
// `generateLink({type:"invite"})` rejects an address belonging to a confirmed
// user, and `uq_membership_active_user` (`0002:221`) makes that the NORMAL case
// for anyone moving between firms. Asking AFTER the door has minted is how a
// person's address gets blocked for seven days behind an invite whose plaintext
// no longer exists. So it is asked BEFORE, and every non-ok answer refuses.
// ---------------------------------------------------------------------------

describe("the pre-door capability check (FIND-1)", () => {
  test("already_registered → 409, and NOTHING is minted: no door call, no token", async () => {
    const obs = observer({ canMint: { ok: false, reason: "already_registered" } });
    const { deps: d, calls } = deps(obs, { resolve: OK_RECEIPT });
    const res = await handleInviteRequest(post({ email: "moving@example.test", role: "admin" }), d);

    assert.equal(res.status, 409);
    const body = await json(res);
    assert.equal(body.code, "recipient_has_account");
    assert.equal(
      body.message,
      "This address already has a Clara account — ask them to sign in with it.",
      "A FIXED SENTENCE CLARA OWNS — never the auth provider's own wording",
    );
    assert.equal(calls.length, 0, "the door must NOT have been called — nothing may be minted");
    assert.equal(obs.mints.length, 0, "and no Supabase token may be minted either");
    assert.equal(obs.sends.length, 0);
    assert.deepEqual(obs.mintChecks, ["moving@example.test"], "the check is asked with the address the door would have had");
  });

  test("POSITIVE CONTROL: the same fixture answering ok makes ONE door call and ONE mint", async () => {
    // Without this, the two zeros above are equally true of a courier that
    // refuses everything, or of a `canMintFor` seam nothing ever consults.
    const obs = observer({ canMint: { ok: true } });
    const { deps: d, calls } = deps(obs, { resolve: OK_RECEIPT });
    const res = await handleInviteRequest(post({ email: "moving@example.test", role: "admin" }), d);

    assert.equal(res.status, 200);
    assert.equal(calls.length, 1, "the door IS reachable on this fixture");
    assert.equal(obs.mints.length, 1, "…and the mint half of the observer DOES fire");
    assert.equal(obs.sends.length, 1);
  });

  test("a check that THROWS refuses before the door too — a doubt is never a yes", async () => {
    // Review law 2: "I could not read the directory" is not "the address is
    // free". The fail-closed branch answers 503 and mints nothing.
    const obs = observer({ canMintThrows: new InviteMailFailure("directory_unreadable", 503) });
    const { deps: d, calls } = deps(obs, { resolve: OK_RECEIPT });
    const res = await handleInviteRequest(post({ email: "unknown@example.test", role: "viewer" }), d);

    assert.equal(res.status, 503);
    assert.equal((await json(res)).code, "mail_unavailable");
    assert.equal(calls.length, 0, "A CHECK THAT COULD NOT ANSWER MUST NOT MINT");
    assert.equal(obs.mints.length, 0);
    assert.equal(obs.sends.length, 0);
  });

  test("the ceiling exception refuses too — the directory-too-large branch is not optimistic", async () => {
    const obs = observer({ canMintThrows: new InviteMailFailure("directory_too_large") });
    const { deps: d, calls } = deps(obs, { resolve: OK_RECEIPT });
    const res = await handleInviteRequest(post({ email: "unknown@example.test", role: "viewer" }), d);
    assert.equal(res.status, 503);
    assert.equal(calls.length, 0);
  });

  test("the check runs AFTER the session gate, so a prober learns nothing", async () => {
    const obs = observer({ canMint: { ok: false, reason: "already_registered" } });
    const { deps: d } = deps(obs, { resolve: OK_RECEIPT }, { resolveSession: deadSession });
    const res = await handleInviteRequest(post({ email: "moving@example.test", role: "admin" }), d);
    assert.equal(res.status, 401, "no session answers 401 — never a 409 that reveals a third party's account");
    assert.equal(obs.mintChecks.length, 0, "and the directory is not even consulted");
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

  test("the mail names the role and carries no client data", async () => {
    const obs = observer();
    const { deps: d } = deps(obs, { resolve: OK_RECEIPT });
    await handleInviteRequest(post({ email: "new@example.test", role: "bookkeeper" }), d);
    const sent = obs.sends[0]!;
    assert.match(sent.html, /bookkeeper/);
    assert.match(sent.html, /expires on 2026-09-06T00:00:00Z/);
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

// ---------------------------------------------------------------------------
// LOW-8 — THE COURTESY FIRM NAME IS BOUND TO THE FIRM THE DOOR ACTED IN.
//
// `caller_context` is a SECOND read, taken after the write, on a session that may
// hold more than one membership. A name from it is not by construction the name
// of the firm `invite_member` minted the invite in — and an invitation naming the
// WRONG firm is a disclosure about a firm the invitee has nothing to do with.
// ---------------------------------------------------------------------------

describe("the firm name in the subject line", () => {
  test("TODAY'S REAL RECEIPT names no firm, so the subject names none either", async () => {
    // `_finish_op` returns `{invite_id, token_hash, expires_at}` verbatim. There
    // is nothing to bind the name to, so the honest answer is no name at all.
    const obs = observer();
    const { deps: d, firmReads } = deps(obs, { resolve: OK_RECEIPT });
    const res = await handleInviteRequest(post({ email: "new@example.test", role: "viewer" }), d);

    assert.equal(res.status, 200);
    assert.equal(obs.sends[0]!.subject, "You have been invited to Clara");
    assert.ok(!obs.sends[0]!.html.includes("ROME PROPERTIES"), "an unbindable name must not reach the body either");
    assert.equal(firmReads.length, 1, "…and the read still HAPPENED — this is a binding wall, not a deleted read");
  });

  test("A MATCHING receipt firm DOES name it — the positive control for the wall above", async () => {
    const obs = observer();
    const { deps: d } = deps(obs, { resolve: OK_RECEIPT_WITH_FIRM });
    await handleInviteRequest(post({ email: "new@example.test", role: "bookkeeper" }), d);
    assert.match(obs.sends[0]!.subject, /ROME PROPERTIES/, "when the two agree, the courtesy is paid");
  });

  test("FIRM-A RECEIPT + FIRM-B CONTEXT → no name is rendered", async () => {
    const obs = observer();
    const { deps: d } = deps(
      obs,
      { resolve: { ...OK_RECEIPT, firm_id: FIRM_A } },
      { readFirmContext: async () => ({ firm_id: FIRM_B, firm_name: "SOMEONE ELSE SDN BHD" }) },
    );
    const res = await handleInviteRequest(post({ email: "new@example.test", role: "viewer" }), d);

    assert.equal(res.status, 200, "a mismatch degrades the courtesy, it does not fail the invite");
    const sent = obs.sends[0]!;
    assert.equal(sent.subject, "You have been invited to Clara");
    assert.ok(
      !sent.html.includes("SOMEONE ELSE SDN BHD"),
      "A NAME FROM A DIFFERENT FIRM MUST NEVER BE MAILED — that is a disclosure about a firm the invitee has nothing to do with",
    );
  });

  test("an unreadable firm context degrades to a nameless subject, never a guessed one", async () => {
    const obs = observer();
    const { deps: d } = deps(
      obs,
      { resolve: OK_RECEIPT_WITH_FIRM },
      { readFirmContext: async () => { throw new Error("read failed"); } },
    );
    const res = await handleInviteRequest(post({ email: "new@example.test", role: "viewer" }), d);
    assert.equal(res.status, 200, "a courtesy read must not turn a successful invite into an error");
    assert.equal(obs.sends.length, 1);
    assert.equal(obs.sends[0]!.subject, "You have been invited to Clara");
  });
});

describe("a send that fails after the door succeeded", () => {
  test("names the invite so it can be revoked, and leaks no plaintext", async () => {
    const obs = observer({ sendThrows: new InviteMailFailure("provider_rejected", 450) });
    const { deps: d } = deps(obs, { resolve: OK_RECEIPT });
    const res = await handleInviteRequest(post({ email: "a@b.test", role: "admin" }), d);
    assert.equal(res.status, 502);
    const text = await res.clone().text();
    const body = await json(res);
    assert.equal(body.code, "mail_failed");
    assert.deepEqual(body.invite, { invite_id: INVITE_ID, expires_at: EXPIRES });
    assert.equal(body.correlation_id, "corr-pinned", "the admin is given the id the server logged it under");
    assert.ok(!text.includes(PLAINTEXT), "not even a failure may carry the plaintext");
  });

  test("a failed MINT is the same class of answer — the door already succeeded", async () => {
    const obs = observer({ mintThrows: new InviteMailFailure("provider_rejected", 422) });
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
      correlation_id: "corr-pinned",
    });
    assert.ok(e instanceof InviteCourierError);
    assert.equal((e as InviteCourierError).code, "mail_failed");
    assert.deepEqual((e as InviteCourierError).invite, { invite_id: INVITE_ID, expires_at: EXPIRES });
    assert.equal((e as InviteCourierError).correlationId, "corr-pinned", "the id travels to the client that must quote it");
  });

  test("the 409 refusal round-trips as its own code, not as a generic transport", () => {
    const e = errorFromCourierBody(409, {
      ok: false,
      kind: "courier",
      code: "recipient_has_account",
      message: "This address already has a Clara account — ask them to sign in with it.",
    });
    assert.ok(e instanceof InviteCourierError);
    assert.equal((e as InviteCourierError).code, "recipient_has_account");
  });

  test("EVERY courier code has a rendered sentence — a code with no copy is a raw key on screen", async () => {
    // The gap this closes was real and shipped: `recipient_has_account` and
    // `mail_unavailable` were added to `INVITE_COURIER_CODES` without a
    // `Members.courier` entry, so `tCourier(courier.code)` had nothing to render.
    // A list and its copy kept by hand in two files is a drift waiting to happen;
    // this walks the ONE list against the catalogue.
    const { INVITE_COURIER_CODES } = await import("../lib/members/doors");
    const messages = (await import("../messages/en.json", { with: { type: "json" } })).default as {
      Members: { courier: Record<string, string> };
    };
    for (const code of INVITE_COURIER_CODES) {
      const sentence = messages.Members.courier[code];
      assert.equal(
        typeof sentence,
        "string",
        `messages/en.json has no Members.courier.${code} — the banner would render the key itself`,
      );
      // NONBLANK, not merely present (Codex round 2). `typeof "" === "string"`,
      // so an empty or whitespace-only value satisfied the check above while
      // rendering an error banner with a title, a code chip and NO SENTENCE — a
      // refusal the reader cannot act on, which is worse than a raw key because
      // it looks finished.
      assert.ok(
        (sentence as string).trim().length > 0,
        `Members.courier.${code} is blank — the banner would render a code chip and nothing to read`,
      );
    }
    assert.ok(INVITE_COURIER_CODES.length >= 10, "VACUITY GUARD: the code list was actually read");
  });

  test("FAIL-CLOSED: an unrecognised body, and an unknown code, both become transport", () => {
    for (const body of [null, {}, { kind: "refusal" }, { kind: "courier", code: "made_up" }, "text"]) {
      const e = errorFromCourierBody(500, body);
      assert.ok(e instanceof InviteCourierError, `expected a courier error for ${JSON.stringify(body)}`);
      assert.equal((e as InviteCourierError).code, "transport");
    }
  });
});
