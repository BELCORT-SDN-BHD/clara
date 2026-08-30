// THE INVITE COURIER — WHO MAY ASK, AND WHICH ADDRESS THEY ASKED ABOUT.
// P4-4, folding Codex round 2's N1 and N2(2).
//
// N1 — THE ACCOUNT ORACLE WAS OPEN TO EVERY AUTHENTICATED SESSION. Step 4b asks
// Supabase whether an arbitrary address already has an account and answers 409 or
// carries on; before this round the only thing between a signed-in stranger and
// that difference was the DOOR, which runs afterwards. A viewer, a bookkeeper, a
// removed member or an account with no membership at all could therefore walk the
// estate's user directory one address at a time. The owner's acceptance of this
// enumeration was explicitly "bounded to admin+", so the bound has to exist BEFORE
// the oracle, not after it.
//
// WHAT "INDISTINGUISHABLE" HAS TO MEAN HERE, and why these cells compare whole
// responses rather than status codes: an oracle does not need a different STATUS
// to leak. A different message, a correlation id present in one case and absent in
// the other, or simply a different number of upstream calls would all re-open it.
// So the refusals are compared byte for byte across a known-EXISTING and a
// known-FREE address, and the mailer is asserted untouched.
//
// N2(2) — FOUR SEAMS, ONE ADDRESS. The courier canonicalises once at its boundary
// (`lower(btrim())`, the door's own rule) and every downstream seam must receive
// those exact bytes. The cells below read all four out of one request.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { handleInviteRequest } from "../lib/members/courier";
import { canonicalAddress, isAsciiAddress, InviteMailFailure } from "../lib/members/invite-mail";
import {
  callerRow,
  CALLER_BYTES,
  deps,
  json,
  observer,
  OK_RECEIPT,
  post,
} from "./invite-courier-fixtures";

// ---------------------------------------------------------------------------
// N1 — THE AUTHORITY PREFLIGHT
// ---------------------------------------------------------------------------

/** Every shape that is NOT "positively an admin+ of exactly one firm". Each must
 *  refuse identically, and none may touch the account directory. */
const UNAUTHORISED: { name: string; rows: unknown }[] = [
  { name: "a viewer", rows: [callerRow("viewer")] },
  { name: "a bookkeeper", rows: [callerRow("bookkeeper")] },
  { name: "no membership at all (the holding state)", rows: [] },
  { name: "two active memberships (the index says impossible)", rows: [callerRow("admin"), callerRow("owner")] },
  { name: "a row this app cannot validate", rows: [{ ...callerRow("admin"), firm_id: "not-a-uuid" }] },
  { name: "a role off the DB's own ladder", rows: [{ ...callerRow("admin"), role: "wizard" }] },
  {
    name: "a contradictory role/rank row (bookkeeper claiming owner rank)",
    rows: [callerRow("bookkeeper", { role_rank: 3 })],
  },
  { name: "a NULL rank — the DB's type permits it, so it is no evidence", rows: [callerRow("admin", { role_rank: null })] },
  { name: "a payload that is not an array", rows: { role: "admin" } },
];

describe("N1: the account oracle is bounded to admin+ BEFORE it runs", () => {
  for (const principal of UNAUTHORISED) {
    test(`${principal.name} → 403, and the directory is never read`, async () => {
      const obs = observer({ canMint: { ok: false, reason: "already_registered" } });
      const { deps: d, calls } = deps(
        obs,
        { resolve: OK_RECEIPT },
        { readCallerRows: async () => principal.rows as unknown[] },
      );
      const res = await handleInviteRequest(post({ email: "known@example.test", role: "admin" }), d);

      assert.equal(res.status, 403);
      assert.equal((await json(res)).code, "not_permitted");
      assert.equal(obs.mintChecks.length, 0, "THE ORACLE MUST NOT HAVE RUN — no listUsers, at all");
      assert.equal(calls.length, 0, "…and nothing was minted");
      assert.equal(obs.mints.length, 0);
      assert.equal(obs.sends.length, 0);
    });
  }

  test("A KNOWN-EXISTING AND A KNOWN-FREE ADDRESS ARE INDISTINGUISHABLE to a below-admin caller", async () => {
    // THE ORACLE, MEASURED DIRECTLY. The fixture's `canMintFor` answers
    // differently for the two addresses — that difference is exactly what a
    // stranger was reading — so if any of it survives into the response, these
    // two bodies differ.
    const bodies: string[] = [];
    const observed: number[] = [];
    for (const email of ["known@example.test", "free@example.test"]) {
      const obs = observer({
        canMint: email === "known@example.test" ? { ok: false, reason: "already_registered" } : { ok: true },
      });
      const { deps: d, calls } = deps(
        obs,
        { resolve: OK_RECEIPT },
        { readCallerRows: async () => [callerRow("bookkeeper")] },
      );
      const res = await handleInviteRequest(post({ email, role: "admin" }), d);
      bodies.push(`${res.status} ${await res.text()}`);
      observed.push(obs.mintChecks.length + calls.length + obs.mints.length + obs.sends.length);
    }

    assert.equal(
      bodies[0],
      bodies[1],
      "THE RESPONSES DIFFER — a below-admin caller can still tell an existing account from a free one",
    );
    assert.deepEqual(observed, [0, 0], "and neither request may touch the directory or the door");
  });

  test("POSITIVE CONTROL: the SAME two addresses DO differ for an admin — the oracle still works", async () => {
    // Without this, the cell above is equally green on a courier that refuses
    // everything, or on a `canMintFor` fixture that answers the same both ways.
    const bodies: string[] = [];
    for (const email of ["known@example.test", "free@example.test"]) {
      const obs = observer({
        canMint: email === "known@example.test" ? { ok: false, reason: "already_registered" } : { ok: true },
      });
      const { deps: d } = deps(obs, { resolve: OK_RECEIPT });
      const res = await handleInviteRequest(post({ email, role: "admin" }), d);
      bodies.push(`${res.status} ${await res.text()}`);
      assert.equal(obs.mintChecks.length, 1, "an admin DOES reach the directory check");
    }
    assert.notEqual(bodies[0], bodies[1], "the fixture must actually discriminate, or the negative proves nothing");
  });

  test("an admin of exactly one firm reaches canMintFor and the door", async () => {
    const obs = observer();
    const { deps: d, calls, callerReads } = deps(obs, { resolve: OK_RECEIPT });
    const res = await handleInviteRequest(post({ email: "new@example.test", role: "bookkeeper" }), d);

    assert.equal(res.status, 200);
    assert.deepEqual(callerReads, [CALLER_BYTES], "the preflight ran ONCE, on the caller's own token");
    assert.equal(obs.mintChecks.length, 1);
    assert.equal(calls.length, 1);
  });

  test("an OWNER passes too — the bound is admin OR ABOVE", async () => {
    const obs = observer();
    const { deps: d, calls } = deps(obs, { resolve: OK_RECEIPT }, { readCallerRows: async () => [callerRow("owner")] });
    assert.equal((await handleInviteRequest(post({ email: "new@example.test", role: "admin" }), d)).status, 200);
    assert.equal(calls.length, 1);
  });

  test("a preflight read that THROWS refuses — a failed read is not a pass", async () => {
    // The opposite direction from the panel's affordance shaping, deliberately:
    // there the DB is the only wall and a failed courtesy read must not strand a
    // real admin; here the read IS the bound.
    const obs = observer();
    const { deps: d, calls } = deps(
      obs,
      { resolve: OK_RECEIPT },
      { readCallerRows: async () => { throw new Error("caller_context unreachable"); } },
    );
    const res = await handleInviteRequest(post({ email: "a@b.test", role: "admin" }), d);
    assert.equal(res.status, 403);
    assert.equal(obs.mintChecks.length, 0);
    assert.equal(calls.length, 0);
  });

  test("the preflight runs BEFORE the config check, so a non-admin learns nothing about the deployment", async () => {
    const obs = observer();
    const { deps: d } = deps(
      obs,
      { resolve: OK_RECEIPT },
      { readCallerRows: async () => [callerRow("viewer")], env: { CLARA_ALLOW_INSECURE_LOOPBACK: "1" } },
    );
    const res = await handleInviteRequest(post({ email: "a@b.test", role: "admin" }), d);
    const text = await res.text();
    assert.equal(res.status, 403, "not 503 — the mail-config answer is for admins");
    for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "INVITE_MAIL_FROM"]) {
      assert.ok(!text.includes(name), `a non-admin was told about ${name}`);
    }
  });

  test("the refusal carries no correlation id and no detail — a varying refusal is the same oracle", async () => {
    const obs = observer();
    const { deps: d } = deps(obs, { resolve: OK_RECEIPT }, { readCallerRows: async () => [callerRow("viewer")] });
    const body = await json(await handleInviteRequest(post({ email: "a@b.test", role: "admin" }), d));
    assert.equal(body.detail, null);
    assert.equal(body.correlation_id, null);
    assert.equal(body.invite, null);
  });
});

// ---------------------------------------------------------------------------
// N2(2) — ONE CANONICAL ADDRESS, FOUR SEAMS
// ---------------------------------------------------------------------------

describe("N2: the address is canonicalised once and used identically everywhere", () => {
  /** Read the address out of all four seams of one successful request. */
  async function seams(input: string): Promise<{ scan: string; door: unknown; mint: string; send: string }> {
    const obs = observer();
    const { deps: d, calls } = deps(obs, { resolve: OK_RECEIPT });
    const res = await handleInviteRequest(post({ email: input, role: "bookkeeper" }), d);
    assert.equal(res.status, 200, `expected a successful invite for ${JSON.stringify(input)}`);
    return {
      scan: obs.mintChecks[0] as string,
      door: calls[0]?.args.p_email,
      mint: obs.mints[0] as string,
      send: obs.sends[0]!.to,
    };
  }

  test("a whitespace-bearing, mixed-case address reaches ALL FOUR seams as the same bytes", async () => {
    // THE DEAD-INVITE PATH THIS CLOSES: the scan trimmed and lowercased, the door
    // stored `lower(btrim())`, and `generateLink` was handed the RAW value — so
    // this address could pass the scan, be minted by the door, and only then fail
    // at the provider, after the plaintext token was already spent.
    const s = await seams("  New@Example.TEST  ");
    assert.equal(s.scan, "new@example.test");
    assert.equal(s.door, "new@example.test", "the DOOR gets the canonical form — the same one it would compute itself");
    assert.equal(s.mint, "new@example.test");
    assert.equal(s.send, "new@example.test");
    assert.equal(new Set([s.scan, String(s.door), s.mint, s.send]).size, 1, "four seams, ONE address");
  });

  test("the canonical form is the DB's `lower(btrim())` — SPACES only, not all whitespace", async () => {
    // PostgreSQL's `btrim(x)` with no second argument trims U+0020 and nothing
    // else. `String.prototype.trim()` strips every Unicode whitespace character,
    // so transcribing the rule with `.trim()` would canonicalise `"a@b.test\t"`
    // to `"a@b.test"` while the DB stored the tab — putting the two back out of
    // step in exactly the way this function exists to prevent.
    assert.equal(canonicalAddress("  A@B.test  "), "a@b.test");
    assert.equal(canonicalAddress("a@b.test\t"), "a@b.test\t", "a TAB is not trimmed, because the DB does not trim it");
    assert.equal(canonicalAddress("\na@b.test"), "\na@b.test");
    assert.equal(canonicalAddress(""), "", "an empty address stays empty — CLR10 is the DB's to raise, not ours");
  });

  test("ASCII case folds; a PLUS TAG does not — they are different addresses", async () => {
    assert.equal(canonicalAddress("Person@Example.Test"), "person@example.test");
    assert.notEqual(canonicalAddress("a+tag@example.test"), canonicalAddress("a@example.test"));
    const tagged = await seams("A+Tag@Example.test");
    assert.equal(tagged.door, "a+tag@example.test", "the tag survives canonicalisation — it is part of the address");
  });

  test("a NON-ASCII address fails closed at the boundary, touching nothing", async () => {
    // U+0130 LATIN CAPITAL LETTER I WITH DOT ABOVE lowercases to TWO code points
    // in JavaScript and to something else again in other implementations. A
    // canonical form that differs between this app, PostgreSQL and GoTrue is the
    // dead-invite bug wearing a different hat, so the address is refused rather
    // than guessed at. A recorded product limitation, not a wall.
    assert.equal(isAsciiAddress("İnfo@example.test"), false);
    const obs = observer();
    const { deps: d, calls } = deps(obs, { resolve: OK_RECEIPT });
    const res = await handleInviteRequest(post({ email: "İnfo@example.test", role: "admin" }), d);

    assert.equal(res.status, 400);
    assert.equal((await json(res)).code, "unsupported_address");
    assert.equal(obs.mintChecks.length, 0, "no directory read");
    assert.equal(calls.length, 0, "NOTHING minted");
    assert.equal(obs.mints.length, 0);
    assert.equal(obs.sends.length, 0);
  });

  for (const [where, email] of [
    ["local part", "Kelvin@example.test"],
    ["domain", "person@Kelvin.example"],
  ] as const) {
    test(`a Kelvin sign in the ${where} is refused BEFORE Unicode can collapse it to ASCII`, async () => {
      assert.equal(isAsciiAddress(email), false, "the raw request contains U+212A KELVIN SIGN");
      assert.equal(isAsciiAddress(canonicalAddress(email)), true, "RED-BEFORE: lowercasing first collapses U+212A to ASCII k");
      const obs = observer();
      const { deps: d, calls, callerReads } = deps(obs, { resolve: OK_RECEIPT });
      const res = await handleInviteRequest(post({ email, role: "admin" }), d);

      assert.equal(res.status, 400);
      assert.equal((await json(res)).code, "unsupported_address");
      assert.equal(callerReads.length, 0, "no authority/directory path starts");
      assert.equal(obs.mintChecks.length, 0, "no directory read");
      assert.equal(calls.length, 0, "no door call");
      assert.equal(obs.mints.length, 0, "no provider mint");
      assert.equal(obs.sends.length, 0, "no send");
    });
  }

  test("VACUITY CONTROL: the ASCII gate admits every address the product supports", async () => {
    for (const ok of ["a@b.test", "first.last+tag@sub.example.co.uk", "A_B-c@example.test", ""]) {
      assert.equal(isAsciiAddress(ok), true, `${ok} must not be refused`);
    }
    assert.equal(isAsciiAddress("naïve@example.test"), false);
  });

  test("an EMPTY address still reaches the door — the courier does not pre-empt CLR10", async () => {
    const obs = observer();
    const { deps: d, calls } = deps(obs, { resolve: OK_RECEIPT });
    await handleInviteRequest(post({ email: "   ", role: "wizard" }), d);
    assert.equal(calls.length, 1, "canonicalising is not validating");
    assert.equal(calls[0]?.args.p_email, "", "…and `lower(btrim('   '))` really is the empty string");
  });

  test("THE CHECK/USE RACE is handled as a mail_failed, not as a claimed send (P4-7 boundary)", async () => {
    // `canMintFor` says free, the account is confirmed between the scan and the
    // mint, and `generateLink` then rejects. The door has ALREADY minted, so the
    // invite exists and its plaintext is unrecoverable — the honest answer is to
    // name the invite for revocation. Closing the race itself needs a
    // compensating revoke and is recorded as P4-7's, not this lane's.
    const obs = observer({
      canMint: { ok: true },
      mintThrows: new InviteMailFailure("provider_rejected", 422),
    });
    const { deps: d, calls } = deps(obs, { resolve: OK_RECEIPT });
    const res = await handleInviteRequest(post({ email: "racing@example.test", role: "admin" }), d);

    assert.equal(res.status, 502);
    const body = await json(res);
    assert.equal(body.code, "mail_failed");
    assert.deepEqual(body.invite, { invite_id: OK_RECEIPT.invite_id, expires_at: OK_RECEIPT.expires_at });
    assert.equal(calls.length, 1, "the door DID mint — that is what makes this the race and not the pre-door refusal");
    assert.equal(obs.sends.length, 0, "and no mail may claim to have gone");
  });
});
