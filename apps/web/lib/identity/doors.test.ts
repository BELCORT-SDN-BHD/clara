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
import { acceptInvite, callerContext } from "./doors";
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

// ---------------------------------------------------------------------------
// callerContext — the READ, not a door.
// ---------------------------------------------------------------------------

const CONTEXT_ROW = {
  user_id: "u1", firm_id: "f1", firm_name: "ROME PROPERTIES",
  role: "bookkeeper", role_rank: 1, is_operator: false,
};

test("callerContext: reads clara.caller_context, projecting exactly the view's six columns", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (u) => {
      seenUrl = String(u);
      return jsonResponse([CONTEXT_ROW]);
    },
    async () => {
      const context = await callerContext(SESSION);
      assert.ok(seenUrl.includes("/rest/v1/caller_context"), "must read the view, never firm_memberships directly");
      const select = new URL(seenUrl).searchParams.get("select");
      assert.deepEqual(
        (select ?? "").split(",").sort(),
        ["firm_id", "firm_name", "is_operator", "role", "role_rank", "user_id"],
        "the projection must match the view's own six columns (0141:544-554)",
      );
      assert.equal(context?.firm_id, "f1");
      assert.equal(context?.role_rank, 1);
    },
  );
});

test("callerContext: ZERO rows resolves null — a legitimate state (no membership), not an error", async () => {
  await withMockedFetch(
    async () => jsonResponse([]),
    async () => {
      assert.equal(await callerContext(SESSION), null);
    },
  );
});

test("callerContext: a FAILED read THROWS — it never degrades into the same null that 'no membership' returns", async () => {
  // Absence is not evidence (review law 2). If a failed read resolved null,
  // every caller's fail-closed branch would be indistinguishable from a
  // genuine no-membership answer, and a transport blip would read as a verdict.
  await withMockedFetch(
    async () => jsonResponse({ message: "upstream unavailable" }, 503),
    async () => {
      await assert.rejects(() => callerContext(SESSION));
    },
  );
});

test("THE LAYER-LOCAL POST-CONDITION: caller_context reports a membership only after accept_invite actually posted", async () => {
  // A tiny fake of the two relations that matter, wired the way the estate
  // wires them: the door MINTS the membership, and the read REPORTS it. The
  // read is never told about the acceptance except through the fake DB.
  let membershipExists = false;
  const impl = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/rpc/accept_invite")) {
      membershipExists = true;
      return jsonResponse({ user_id: "u1", firm_id: "f1", membership_id: "m1" });
    }
    if (url.includes("/rest/v1/caller_context")) {
      return jsonResponse(membershipExists ? [CONTEXT_ROW] : []);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedFetch(impl, async () => {
    assert.equal(await callerContext(SESSION), null, "control: before the door, there is no membership");
    await acceptInvite(ARGS, SESSION);
    const after = await callerContext(SESSION);
    assert.ok(after, "after the door, the membership read MUST return a row");
    assert.equal(after?.firm_id, "f1");
  });
});
