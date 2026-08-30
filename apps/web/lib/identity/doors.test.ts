// lib/identity/doors.ts — the `accept_invite` wrapper and the
// `caller_context` membership read (P4-1).
//
// Pins the wire shape (exact argument names — a door is called by SIGNATURE,
// and `accept_invite(p_token, p_display_name, p_op_key)` has three), every
// refusal the LIVE body (`0145:694`) can raise, rendered VERBATIM, and the
// read's own contract: one row, zero rows as `null`, a FAILED read as a throw.
//
// The last cell is the layer-local version of this train's whole point: the
// membership read reflects what the DOOR did, not what the caller hoped.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acceptInvite,
  loadCallerContext,
  readCallerContextForSubject,
  CALLER_CONTEXT_SELECT,
} from "./doors";
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

const ARGS = { token: "c".repeat(64), displayName: "Aisyah Rahman", opKey: "op-1" };
const SESSION = { session: fakeSession("tok") };

test("acceptInvite: posts exactly p_token/p_display_name/p_op_key to /rpc/accept_invite — and no email, ever", async () => {
  let seenUrl = "";
  let body: Record<string, unknown> = {};
  await withMockedFetch(
    async (u, init) => {
      seenUrl = String(u);
      body = JSON.parse(String(init?.body));
      return jsonResponse({ user_id: "u1", firm_id: "f1", membership_id: "m1" });
    },
    async () => {
      const receipt = await acceptInvite(ARGS, SESSION);
      assert.ok(seenUrl.includes("/rpc/accept_invite"), "must post to the accept_invite RPC");
      assert.equal(body.p_token, ARGS.token);
      assert.equal(body.p_display_name, "Aisyah Rahman");
      assert.equal(body.p_op_key, "op-1");
      // CLOSED WORLD. The door's signature is three arguments; an email among
      // them would mean the client was sourcing an identity claim it must
      // never source (`_jwt_email()` is the only lawful source, `0141:152`).
      assert.deepEqual(Object.keys(body).sort(), ["p_display_name", "p_op_key", "p_token"]);
      assert.equal(receipt.membership_id, "m1", "the receipt is reported back as the DB gave it");
    },
  );
});

test("acceptInvite: the caller's op_key is sent VERBATIM — never re-minted inside the wrapper", async () => {
  // The stable-op_key retry contract depends on this: if the wrapper minted
  // its own key, a re-submit could never replay the dedupe branch.
  const keys: unknown[] = [];
  await withMockedFetch(
    async (_u, init) => {
      keys.push(JSON.parse(String(init?.body)).p_op_key);
      return jsonResponse({});
    },
    async () => {
      await acceptInvite({ ...ARGS, opKey: "stable-key" }, SESSION);
      await acceptInvite({ ...ARGS, opKey: "stable-key" }, SESSION);
      assert.deepEqual(keys, ["stable-key", "stable-key"]);
    },
  );
});

// ---------------------------------------------------------------------------
// Every refusal the LIVE body raises, VERBATIM. Messages are copied from
// `0145:694-759`; the codes are the SQLSTATEs the door raises with.
// ---------------------------------------------------------------------------
const REFUSALS: ReadonlyArray<{ line: string; code: string; message: string }> = [
  { line: "0145:699", code: "CLR04", message: "no authenticated actor" },
  { line: "0145:700", code: "CLR10", message: "op_key is required" },
  { line: "0145:701", code: "CLR10", message: "a token is required" },
  { line: "0145:704", code: "CLR10", message: "invalid invite token" },
  { line: "0145:708", code: "CLR04", message: "the signed-in email does not match this invite" },
  { line: "0145:719", code: "CLR04", message: "invite exceeds the issuer's rank -- re-issue by an owner" },
  { line: "0145:741", code: "CLR09", message: "this invite is no longer open (status: revoked)" },
  { line: "0145:749", code: "CLR09", message: "this invite has expired" },
  { line: "0004:57", code: "CLR10", message: "op_key reused with different args" },
];

for (const refusal of REFUSALS) {
  test(`acceptInvite: ${refusal.code} "${refusal.message}" (${refusal.line}) surfaces as a DoorRefusal, code and message untouched`, async () => {
    await withMockedFetch(
      async () => jsonResponse({ code: refusal.code, message: refusal.message }, 400),
      async () => {
        await assert.rejects(
          () => acceptInvite(ARGS, SESSION),
          (e: unknown) =>
            e instanceof DoorRefusal &&
            e.code === refusal.code &&
            // VERBATIM — not merely "contains", not re-worded, not prefixed.
            e.message === refusal.message &&
            e.codeSource === "sqlstate",
        );
      },
    );
  });
}

test("acceptInvite: a 401 is NEVER classified as a governed refusal (status before CLR)", async () => {
  await withMockedFetch(
    async () => jsonResponse({ code: "CLR04", message: "jwt expired" }, 401),
    async () => {
      await assert.rejects(
        () => acceptInvite(ARGS, SESSION),
        (e: unknown) => !(e instanceof DoorRefusal),
      );
    },
  );
});

// ===========================================================================
// THE MEMBERSHIP READ — a READ, not a door (apps/web/AGENTS.md).
//
// Codex MEDIUM-1: the first version resolved `rows[0] ?? null`, so an HTTP 200
// carrying `[{}]`, two rows, or a well-shaped row belonging to somebody ELSE
// all read as a confirmed membership and the journey redirected. `limit: 1`
// additionally made a broken >1-row invariant unobservable. Every one of those
// shapes is pinned below, and every one must DENY.
// ===========================================================================

const SUBJECT = "11111111-1111-1111-1111-111111111111";
const OTHER_SUBJECT = "22222222-2222-2222-2222-222222222222";
const FIRM = "33333333-3333-3333-3333-333333333333";

const GOOD_ROW = {
  user_id: SUBJECT, firm_id: FIRM, firm_name: "ROME PROPERTIES",
  role: "bookkeeper", role_rank: 1, is_operator: false,
};

function rowsRespond(rows: unknown, status = 200): typeof fetch {
  return (async () => jsonResponse(rows, status)) as typeof fetch;
}

test("loadCallerContext: reads clara.caller_context with limit=2, projecting exactly the view's six columns", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (u) => { seenUrl = String(u); return jsonResponse([GOOD_ROW]); },
    async () => {
      await loadCallerContext(SESSION);
      assert.ok(seenUrl.includes("/rest/v1/caller_context"), "must read the view, never firm_memberships directly");
      const params = new URL(seenUrl).searchParams;
      assert.deepEqual(
        (params.get("select") ?? "").split(",").sort(),
        ["firm_id", "firm_name", "is_operator", "role", "role_rank", "user_id"],
        "the projection must match the view's own six columns (0141:544-554)",
      );
      assert.equal(params.get("select"), CALLER_CONTEXT_SELECT, "and it is the module's own exported pin, not a retyped list");
      assert.equal(
        params.get("limit"), "2",
        "limit=2 — a cap of ONE silently truncates a broken >1-row invariant into an ordinary-looking single row",
      );
    },
  );
});

test("POSITIVE: exactly one well-formed row for the VERIFIED subject confirms the membership", async () => {
  await withMockedFetch(rowsRespond([GOOD_ROW]), async () => {
    const outcome = await readCallerContextForSubject(SUBJECT, SESSION);
    assert.equal(outcome.ok, true);
    assert.equal(outcome.ok && outcome.context.firm_id, FIRM);
    assert.equal(outcome.ok && outcome.context.role, "bookkeeper");
  });
});

test("POSITIVE: a NULL role_rank still confirms — the DB declares that column nullable", async () => {
  // `clara.role_rank` is a `case … else null end` (0002:326-331). Denying here
  // would refuse a real member over a rank the view is entitled to return.
  await withMockedFetch(rowsRespond([{ ...GOOD_ROW, role_rank: null }]), async () => {
    const outcome = await readCallerContextForSubject(SUBJECT, SESSION);
    assert.equal(outcome.ok, true);
    assert.equal(outcome.ok && outcome.context.role_rank, null);
  });
});

test("DENY no_membership: zero rows", async () => {
  await withMockedFetch(rowsRespond([]), async () => {
    assert.deepEqual(
      await readCallerContextForSubject(SUBJECT, SESSION),
      { ok: false, reason: "no_membership" },
    );
  });
});

test("DENY ambiguous: TWO rows — uq_membership_active_user says impossible, so nothing here picks one", async () => {
  await withMockedFetch(rowsRespond([GOOD_ROW, { ...GOOD_ROW, firm_id: OTHER_SUBJECT }]), async () => {
    assert.deepEqual(
      await readCallerContextForSubject(SUBJECT, SESSION),
      { ok: false, reason: "ambiguous" },
    );
  });
});

test("DENY wrong_subject: one well-formed row belonging to SOMEBODY ELSE", async () => {
  await withMockedFetch(rowsRespond([{ ...GOOD_ROW, user_id: OTHER_SUBJECT }]), async () => {
    assert.deepEqual(
      await readCallerContextForSubject(SUBJECT, SESSION),
      { ok: false, reason: "wrong_subject" },
    );
  });
});

// Every field, every way it can be wrong. Table-driven so a NEW column cannot
// join the projection without someone deciding how it validates.
const MALFORMED: ReadonlyArray<{ what: string; row: unknown }> = [
  { what: "the empty object (a 200 carrying [{}])", row: {} },
  { what: "null instead of a row", row: null },
  { what: "an array instead of a row", row: [] },
  { what: "a string instead of a row", row: "nope" },
  { what: "user_id missing", row: { ...GOOD_ROW, user_id: undefined } },
  { what: "user_id not a uuid", row: { ...GOOD_ROW, user_id: "u1" } },
  { what: "user_id null", row: { ...GOOD_ROW, user_id: null } },
  { what: "firm_id missing", row: { ...GOOD_ROW, firm_id: undefined } },
  { what: "firm_id not a uuid", row: { ...GOOD_ROW, firm_id: "f1" } },
  { what: "firm_name missing", row: { ...GOOD_ROW, firm_name: undefined } },
  { what: "firm_name empty", row: { ...GOOD_ROW, firm_name: "" } },
  { what: "firm_name whitespace only", row: { ...GOOD_ROW, firm_name: "   " } },
  { what: "firm_name not a string", row: { ...GOOD_ROW, firm_name: 7 } },
  { what: "role missing", row: { ...GOOD_ROW, role: undefined } },
  { what: "role outside the CHECK constraint", row: { ...GOOD_ROW, role: "superuser" } },
  { what: "role empty", row: { ...GOOD_ROW, role: "" } },
  { what: "role_rank a string", row: { ...GOOD_ROW, role_rank: "1" } },
  { what: "role_rank a float", row: { ...GOOD_ROW, role_rank: 1.5 } },
  { what: "role_rank a negative float", row: { ...GOOD_ROW, role_rank: -0.5 } },
  { what: "role_rank an object", row: { ...GOOD_ROW, role_rank: {} } },
  { what: "role_rank an array", row: { ...GOOD_ROW, role_rank: [1] } },
  { what: "role_rank a boolean", row: { ...GOOD_ROW, role_rank: true } },
  // NaN and Infinity are deliberately ABSENT from this table, and that is a
  // measured fact rather than an oversight: JSON has no such literals, so
  // `JSON.stringify` renders both as `null` — a legitimately VALID nullable
  // rank. A cell asserting "NaN is malformed" therefore asserts something the
  // wire cannot deliver, and it went red on exactly that. The `Number.isInteger`
  // guard still rejects them for any non-wire caller; the wire's own reachable
  // shapes are the strings, floats and non-numbers listed here.
  { what: "role_rank missing", row: { ...GOOD_ROW, role_rank: undefined } },
  { what: "is_operator missing", row: { ...GOOD_ROW, is_operator: undefined } },
  { what: "is_operator the STRING true", row: { ...GOOD_ROW, is_operator: "true" } },
  { what: "is_operator null", row: { ...GOOD_ROW, is_operator: null } },
  { what: "is_operator a number", row: { ...GOOD_ROW, is_operator: 1 } },
];

for (const malformed of MALFORMED) {
  test(`DENY malformed: ${malformed.what}`, async () => {
    await withMockedFetch(rowsRespond([malformed.row]), async () => {
      assert.deepEqual(
        await readCallerContextForSubject(SUBJECT, SESSION),
        { ok: false, reason: "malformed" },
        `${malformed.what} must never be trusted as a membership`,
      );
    });
  });
}

test("VACUITY CONTROL: the malformed table would pass a row that IS well formed", async () => {
  // Without this, a validator that rejected everything would score 24 green
  // cells above and prove nothing at all.
  await withMockedFetch(rowsRespond([GOOD_ROW]), async () => {
    assert.equal((await readCallerContextForSubject(SUBJECT, SESSION)).ok, true);
  });
});

test("a FAILED read THROWS — it never degrades into the same denial that an OBSERVED no means", async () => {
  // Absence is not evidence (review law 2). "The DB said no" and "we never
  // heard back" are different facts; both fail closed, for different reasons.
  await withMockedFetch(rowsRespond({ message: "upstream unavailable" }, 503), async () => {
    await assert.rejects(() => readCallerContextForSubject(SUBJECT, SESSION));
  });
});

test("THE LAYER-LOCAL POST-CONDITION: the membership read confirms only after accept_invite actually posted", async () => {
  let membershipExists = false;
  const impl = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/rpc/accept_invite")) {
      membershipExists = true;
      return jsonResponse({ user_id: SUBJECT, firm_id: FIRM, membership_id: "m1" });
    }
    if (url.includes("/rest/v1/caller_context")) {
      return jsonResponse(membershipExists ? [GOOD_ROW] : []);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedFetch(impl, async () => {
    assert.deepEqual(
      await readCallerContextForSubject(SUBJECT, SESSION),
      { ok: false, reason: "no_membership" },
      "control: before the door, there is no membership",
    );
    await acceptInvite(ARGS, SESSION);
    const after = await readCallerContextForSubject(SUBJECT, SESSION);
    assert.equal(after.ok, true, "after the door, the membership read MUST confirm");
    assert.equal(after.ok && after.context.firm_id, FIRM);
  });
});

