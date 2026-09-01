// lib/identity/doors.ts — the two P4-3 wrappers: `claim_identity` (live body
// `0141:250`) and `request_firm_registration` (live body `0145:370`).
//
// A SEPARATE FILE FROM `doors.test.ts`, deliberately. That file is P4-1's and
// pins `accept_invite` plus the caller_context read; folding two more doors into
// it would push it past the 500-line gate and would mix two trains' evidence in
// one place. Same module, same harness idiom, different subject.
//
// WHAT THESE CELLS PIN: the wire shape (a door is called by SIGNATURE — exact
// argument NAMES and arity), the CLOSED WORLD of those arguments (an email among
// them would be the client sourcing an identity claim it must never source), the
// caller's op_key travelling verbatim, and every refusal reaching the caller as a
// `DoorRefusal` with the DB's own code and message, untouched.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { claimIdentity, requestFirmRegistration } from "./doors";
import { DoorRefusal } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

function fakeSession(token: string | null): SessionTokenAccessor {
  return { getAccessToken: async () => token };
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function withMockedFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

const SESSION = { session: fakeSession("tok") };

// ---------------------------------------------------------------------------
// claim_identity
// ---------------------------------------------------------------------------

test("claimIdentity: posts exactly p_display_name/p_op_key — and NO email, ever", async () => {
  let seenUrl = "";
  let body: Record<string, unknown> = {};
  await withMockedFetch(
    async (u, init) => {
      seenUrl = String(u);
      body = JSON.parse(String(init?.body));
      return jsonResponse({ user_id: "u1", display_name: "Aisyah Rahman" });
    },
    async () => {
      const receipt = await claimIdentity({ displayName: "Aisyah Rahman", opKey: "op-1" }, SESSION);
      assert.ok(seenUrl.includes("/rpc/claim_identity"), "must post to the claim_identity RPC");
      assert.equal(body.p_display_name, "Aisyah Rahman");
      assert.equal(body.p_op_key, "op-1");
      // THE CLOSED WORLD — the wall this cell exists for. The live signature is
      // `claim_identity(p_display_name text, p_op_key text)`: two arguments. The
      // email is read from the verified JWT INSIDE the door (`_jwt_email()`,
      // 0141:152/261), and a caller that could pass one could claim another
      // person's address. Asserting the exact key SET (not merely "no key called
      // p_email") is what makes this closed: any third argument reds it.
      assert.deepEqual(Object.keys(body).sort(), ["p_display_name", "p_op_key"]);
      assert.equal(receipt.user_id, "u1", "the receipt is reported back as the DB gave it");
    },
  );
});

test("claimIdentity: the caller's op_key travels VERBATIM — never re-minted in the wrapper", async () => {
  const keys: unknown[] = [];
  await withMockedFetch(
    async (_u, init) => {
      keys.push((JSON.parse(String(init?.body)) as Record<string, unknown>).p_op_key);
      return jsonResponse({ user_id: "u1" });
    },
    async () => {
      await claimIdentity({ displayName: "A", opKey: "stable-key" }, SESSION);
      await claimIdentity({ displayName: "A", opKey: "stable-key" }, SESSION);
      assert.deepEqual(keys, ["stable-key", "stable-key"], "the wrapper minted its own key");
    },
  );
});

test("claimIdentity: every refusal reaches the caller VERBATIM, code and message", async () => {
  // The four `claim_identity` refusals plus the three its `_claim_identity_core`
  // tail-call raises — the full census from doors.ts's header, each asserted to
  // arrive un-re-worded. A wrapper that mapped these onto its own vocabulary
  // would be the UI inventing a verdict.
  const refusals = [
    { code: "CLR04", message: "no authenticated actor" },
    { code: "CLR10", message: "op_key is required" },
    { code: "CLR04", message: "a verified email claim is required" },
    { code: "CLR04", message: "the agent identity cannot claim a session" },
    { code: "CLR10", message: "display name is required" },
    { code: "CLR10", message: "identity already claimed with a different email" },
    { code: "CLR10", message: "that email is already claimed by a different identity" },
  ];
  for (const refusal of refusals) {
    await withMockedFetch(
      async () => jsonResponse(refusal, 400),
      async () => {
        await assert.rejects(
          () => claimIdentity({ displayName: "A", opKey: "k" }, SESSION),
          (e: unknown) => {
            assert.ok(e instanceof DoorRefusal, `${refusal.message} did not arrive as a DoorRefusal`);
            assert.equal(e.code, refusal.code);
            assert.equal(e.message, refusal.message, "the DB's sentence was re-worded");
            return true;
          },
        );
      },
    );
  }
});

// ---------------------------------------------------------------------------
// request_firm_registration
// ---------------------------------------------------------------------------

test("requestFirmRegistration: posts exactly p_firm_name/p_note/p_op_key — and no email", async () => {
  let seenUrl = "";
  let body: Record<string, unknown> = {};
  await withMockedFetch(
    async (u, init) => {
      seenUrl = String(u);
      body = JSON.parse(String(init?.body));
      return jsonResponse({ request_id: "r1", status: "open" });
    },
    async () => {
      const receipt = await requestFirmRegistration(
        { firmName: "ROME PROPERTIES", note: "sole practitioner", opKey: "op-2" },
        SESSION,
      );
      assert.ok(seenUrl.includes("/rpc/request_firm_registration"));
      assert.equal(body.p_firm_name, "ROME PROPERTIES");
      assert.equal(body.p_note, "sole practitioner");
      assert.equal(body.p_op_key, "op-2");
      assert.deepEqual(Object.keys(body).sort(), ["p_firm_name", "p_note", "p_op_key"]);
      assert.deepEqual(receipt, { request_id: "r1", status: "open" });
    },
  );
});

test("requestFirmRegistration: a null note is sent as null, not as an invented string", async () => {
  // The door nullif/btrims it (0145:389), so null and "" are the same thing to
  // the DB — but the wrapper must not substitute a placeholder sentence for an
  // absent note, which would put model-authored text in a typed column.
  let body: Record<string, unknown> = {};
  await withMockedFetch(
    async (_u, init) => {
      body = JSON.parse(String(init?.body));
      return jsonResponse({ request_id: "r1", status: "open" });
    },
    async () => {
      await requestFirmRegistration({ firmName: "F", note: null, opKey: "k" }, SESSION);
      assert.equal(body.p_note, null);
      assert.ok("p_note" in body, "p_note must be SENT as null, not omitted — the signature has three args");
    },
  );
});

test("requestFirmRegistration: every refusal reaches the caller VERBATIM", async () => {
  // All eight from the census, including the three CLR04s the order's own list
  // does not name. THE TWO CLR09s ARE THE JOURNEY'S POINT: "I am already staff
  // elsewhere" and "you already have one open" must refuse at REQUEST time with
  // a legible message rather than be discovered at approval time (design §4 A).
  const refusals = [
    { code: "CLR04", message: "no authenticated actor" },
    { code: "CLR04", message: "unknown actor" },
    { code: "CLR04", message: "the agent identity cannot request a firm registration" },
    { code: "CLR10", message: "op_key is required" },
    { code: "CLR10", message: "firm name is required" },
    { code: "CLR09", message: "actor already belongs to a firm" },
    { code: "CLR10", message: "op_key reused with different args" },
    { code: "CLR09", message: "an open registration request already exists" },
  ];
  for (const refusal of refusals) {
    await withMockedFetch(
      async () => jsonResponse(refusal, 400),
      async () => {
        await assert.rejects(
          () => requestFirmRegistration({ firmName: "F", note: null, opKey: "k" }, SESSION),
          (e: unknown) => {
            assert.ok(e instanceof DoorRefusal, `${refusal.message} did not arrive as a DoorRefusal`);
            assert.equal(e.code, refusal.code);
            assert.equal(e.message, refusal.message);
            return true;
          },
        );
      },
    );
  }
});

test("requestFirmRegistration: a REPLAY's non-open status is reported as the DB gave it", async () => {
  // 0145:396-403 — an identical (applicant, op_key, args) replays the ORIGINAL
  // request's receipt whatever its CURRENT status. So this wrapper must be able
  // to return `approved`/`rejected` from a call that looks like a fresh request,
  // and must not normalise it to "open". A caller reading `status === "open"` off
  // this receipt as proof of a new request would be wrong; the holding page
  // re-reads the view instead.
  await withMockedFetch(
    async () => jsonResponse({ request_id: "r-old", status: "rejected" }),
    async () => {
      const receipt = await requestFirmRegistration({ firmName: "F", note: null, opKey: "k" }, SESSION);
      assert.deepEqual(receipt, { request_id: "r-old", status: "rejected" });
    },
  );
});

// ---------------------------------------------------------------------------
// REVIEW LAW 3 — the citations are checked against the migrations, not trusted
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(HERE, "../../../../packages/db/migrations");
const migration = (name: string): string => readFileSync(resolve(MIGRATIONS_DIR, name), "utf8");
const everyMigration = (): { name: string; sql: string }[] =>
  readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: migration(name) }));

test("RUNG-0: each door is created ONCE, at the line doors.ts cites, and never replaced", () => {
  // Spelling is not identity, and a comment is not evidence. This cell reads the
  // migrations and re-proves the census rather than trusting the header: the
  // exact signature exists at the cited line, and NO migration anywhere
  // CREATE-OR-REPLACEs either door. That last half is the one that matters —
  // `accept_invite` needed 0145's replacement and `invite_member`/`create_firm`
  // needed 0147's, so "the first CREATE is the live body" is a measurement here,
  // not a default.
  const t1 = migration("0141_p4_tranche1_invite_rbac.sql");
  const t2 = migration("0145_p4_tranche2_registration_operator_alias.sql");

  const claimLine = t1.split("\n")[249];
  assert.match(
    claimLine as string,
    /^create function clara\.claim_identity\(p_display_name text, p_op_key text\) returns jsonb$/,
    "0141:250 is not claim_identity's CREATE — doors.ts's citation has drifted",
  );
  const requestLine = t2.split("\n")[369];
  assert.match(
    requestLine as string,
    /^create function clara\.request_firm_registration\(p_firm_name text, p_note text, p_op_key text\) returns jsonb$/,
    "0145:370 is not request_firm_registration's CREATE — doors.ts's citation has drifted",
  );

  // AND THE HALF THAT ACTUALLY MAKES THEM "LIVE": across EVERY migration on
  // disk, each door is created exactly once and replaced never. A second
  // `create [or replace] function` for either name means doors.ts is citing a
  // superseded body, which is precisely the class of defect that made
  // accept_invite's citation 0145 rather than 0141.
  for (const door of ["claim_identity", "request_firm_registration"]) {
    const creators: string[] = [];
    for (const { name, sql } of everyMigration()) {
      // `\b` before the name so `_claim_identity_core` is not counted as
      // `claim_identity` — spelling is not identity, and a prefix match here
      // would report a creation that is a different function entirely.
      const re = new RegExp(String.raw`create\s+(or\s+replace\s+)?function\s+clara\.${door}\s*\(`, "gi");
      // One entry PER MATCH, not per file — two creations inside one migration
      // must not collapse into a single, innocent-looking row.
      creators.push(...[...sql.matchAll(re)].map(() => name));
    }
    assert.deepEqual(
      creators,
      [door === "claim_identity" ? "0141_p4_tranche1_invite_rbac.sql" : "0145_p4_tranche2_registration_operator_alias.sql"],
      `clara.${door} is created in ${creators.length} place(s) — doors.ts cites a body that may be superseded`,
    );
  }
});

test("RUNG-0 VACUITY CONTROL: the same instrument SEES a replacement where one exists", () => {
  // Without this, the "never replaced" claim above could be true merely because
  // the regex never matches anything. `accept_invite` IS replaced — 0145:694
  // supersedes 0141:407 — so the instrument must find that one. If it cannot,
  // its silence about the other two means nothing (review law 2).
  const creators: string[] = [];
  for (const { name, sql } of everyMigration()) {
    const re = /create\s+(or\s+replace\s+)?function\s+clara\.accept_invite\s*\(/gi;
    creators.push(...[...sql.matchAll(re)].map(() => name));
  }
  assert.deepEqual(
    creators,
    [
      "0141_p4_tranche1_invite_rbac.sql",
      "0145_p4_tranche2_registration_operator_alias.sql",
    ],
    "the SAME instrument fails to see accept_invite's known replacement — its silence about the other two proves nothing",
  );
});
