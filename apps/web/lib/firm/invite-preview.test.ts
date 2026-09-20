// lib/firm/invite-preview.ts — the fail-closed reading of `clara.preview_invite` (#625, 0224).
//
// THE JUDGEMENT THIS FILE PINS is the one the invite surface hangs its password form on:
// which observations are DEFINITE (a real answer, or the door's own refusal) and which are
// INDEFINITE (we never heard back, or what came back is not what the door returns). A definite
// negative BLOCKS the journey; an indefinite one DEGRADES it, because the door — not this
// reader — is the authority on whether an invitation can be accepted.
//
// The census cells mirror `lib/identity/doors.ts`'s own: a missing key, an array, `{}`, a role
// outside the CHECK ladder and a status outside the invite lifecycle each land on `unreadable`,
// never on a confident `pending`. A half-validated object handed onward wearing a fully-typed
// name is the exact defect that census exists for.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  INVITE_PREVIEW_STATUSES,
  INVITE_PREVIEW_NON_BLOCKING_STATUSES,
  isInvitePreviewRow,
  readInvitePreview,
  PREVIEW_INVITE_DOOR,
} from "./invite-preview";
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

const GOOD = {
  firm_name: "ROME PROPERTIES",
  role: "bookkeeper",
  status: "pending",
  masked_email: "n***@example.test",
};
const SESSION = { session: fakeSession("tok") };
const TOKEN = "c".repeat(64);

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

test("p625.lib.wire: the door is called by SIGNATURE — one argument, named p_token, posted to /rpc/preview_invite", async () => {
  let seenUrl = "";
  let body: Record<string, unknown> = {};
  await withMockedFetch(
    async (u, init) => {
      seenUrl = String(u);
      body = JSON.parse(String(init?.body));
      return jsonResponse(GOOD);
    },
    async () => {
      const out = await readInvitePreview(TOKEN, SESSION);
      assert.ok(seenUrl.includes(`/rpc/${PREVIEW_INVITE_DOOR}`), `must post to the door, saw ${seenUrl}`);
      assert.deepEqual(Object.keys(body), ["p_token"], "ONE argument — the door takes no email and no op_key");
      assert.equal(body.p_token, TOKEN);
      assert.equal(out.ok, true);
      if (out.ok) {
        assert.equal(out.preview.firm_name, "ROME PROPERTIES");
        assert.equal(out.preview.role, "bookkeeper");
        assert.equal(out.preview.status, "pending");
        assert.equal(out.preview.masked_email, "n***@example.test");
      }
    },
  );
});

test("p625.lib.wire: the invite statuses the DB can report are the ones this module admits", () => {
  assert.deepEqual(
    [...INVITE_PREVIEW_STATUSES].sort(),
    ["accepted", "expired", "issuer_lapsed", "pending", "revoked"],
  );
});

test("p872.lib.wire: `issuer_lapsed` is a valid, non-blocking preview row -- read-time colour, not a sixth unknown value", () => {
  assert.equal(isInvitePreviewRow({ ...GOOD, status: "issuer_lapsed" }), true);
});

test("p872.lib.non_blocking: exactly `pending` and `issuer_lapsed` do not block the password form -- the other three are DEFINITE negatives", () => {
  assert.deepEqual([...INVITE_PREVIEW_NON_BLOCKING_STATUSES].sort(), ["issuer_lapsed", "pending"]);
  for (const s of INVITE_PREVIEW_NON_BLOCKING_STATUSES) {
    assert.ok((INVITE_PREVIEW_STATUSES as readonly string[]).includes(s), `${s} must still be an admitted status`);
  }
});

// ---------------------------------------------------------------------------
// p625.lib.fail_closed — the census
// ---------------------------------------------------------------------------

test("p625.lib.fail_closed: a MISSING key, an ARRAY, `{}`, a non-ladder role and an unknown status each read UNREADABLE — never `pending`", async () => {
  const bodies: [string, unknown][] = [
    ["a missing key", { firm_name: "ROME", role: "bookkeeper", status: "pending" }],
    ["an empty object", {}],
    ["an array of one row", [GOOD]],
    ["an array of two rows", [GOOD, GOOD]],
    ["a null", null],
    ["a non-ladder role", { ...GOOD, role: "superadmin" }],
    ["an unknown status", { ...GOOD, status: "cancelled" }],
    ["an empty firm name", { ...GOOD, firm_name: "   " }],
    ["an empty mask", { ...GOOD, masked_email: "" }],
    ["a numeric role", { ...GOOD, role: 2 }],
  ];
  for (const [label, body] of bodies) {
    await withMockedFetch(
      async () => jsonResponse(body),
      async () => {
        const out = await readInvitePreview(TOKEN, SESSION);
        assert.equal(out.ok, false, `${label}: must not read as a confident answer`);
        if (!out.ok) {
          assert.equal(out.kind, "indefinite", `${label}: an unreadable body is INDEFINITE — the door is still the authority`);
          assert.equal(out.reason, "unreadable", `${label}: and it says which kind of indefinite it is`);
        }
      },
    );
  }
});

test("p625.lib.fail_closed: the type guard agrees with the reader, on the same bodies", () => {
  assert.equal(isInvitePreviewRow(GOOD), true);
  assert.equal(isInvitePreviewRow({ ...GOOD, role: "owner" }), true);
  assert.equal(isInvitePreviewRow({ ...GOOD, status: "revoked" }), true);
  assert.equal(isInvitePreviewRow({}), false);
  assert.equal(isInvitePreviewRow(null), false);
  assert.equal(isInvitePreviewRow([GOOD]), false);
  assert.equal(isInvitePreviewRow({ ...GOOD, masked_email: null }), false);
  assert.equal(isInvitePreviewRow({ ...GOOD, extra: 1 }), true, "an EXTRA key is not a reason to deny — the four declared ones are the contract");
});

// ---------------------------------------------------------------------------
// Definite vs indefinite
// ---------------------------------------------------------------------------

test("p625.lib.fail_closed: a governed refusal is DEFINITE and carries the DB's own code and reason", async () => {
  await withMockedFetch(
    async () =>
      jsonResponse(
        {
          code: "CLR10",
          message: "this invite link is not valid for the signed-in address",
          details: '{"reason":"invite_not_previewable"}',
        },
        400,
      ),
    async () => {
      const out = await readInvitePreview(TOKEN, SESSION);
      assert.equal(out.ok, false);
      if (!out.ok) {
        assert.equal(out.kind, "refused", "a door that said NO is a DEFINITE negative — it blocks");
        assert.equal(out.code, "CLR10");
        assert.equal(out.reason, "invite_not_previewable");
      }
    },
  );
});

test("p625.lib.fail_closed: a transport failure is INDEFINITE — 'we never heard back' is not 'the door said no'", async () => {
  await withMockedFetch(
    async () => {
      throw new TypeError("fetch failed");
    },
    async () => {
      const out = await readInvitePreview(TOKEN, SESSION);
      assert.equal(out.ok, false);
      if (!out.ok) {
        assert.equal(out.kind, "indefinite");
        assert.equal(out.reason, "transport");
      }
    },
  );
});

test("p625.lib.fail_closed: a 503 is INDEFINITE; an absent session is INDEFINITE — neither is a verdict on the invitation", async () => {
  await withMockedFetch(
    async () => jsonResponse({ message: "upstream unavailable" }, 503),
    async () => {
      const out = await readInvitePreview(TOKEN, SESSION);
      assert.equal(out.ok, false);
      if (!out.ok) assert.equal(out.kind, "indefinite");
    },
  );
  await withMockedFetch(
    async () => {
      throw new Error("the reader must not reach the wire without a token");
    },
    async () => {
      const out = await readInvitePreview(TOKEN, { session: fakeSession(null) });
      assert.equal(out.ok, false);
      if (!out.ok) {
        assert.equal(out.kind, "indefinite");
        assert.equal(out.reason, "transport");
      }
    },
  );
});

test("p625.lib.fail_closed: an EMPTY token never reaches the wire", async () => {
  await withMockedFetch(
    async () => {
      throw new Error("the reader must not call the door with nothing to look up");
    },
    async () => {
      for (const token of ["", "   "]) {
        const out = await readInvitePreview(token, SESSION);
        assert.equal(out.ok, false);
        if (!out.ok) assert.equal(out.kind, "refused", "a token that cannot identify anything is a definite negative");
      }
    },
  );
});

test("p625.lib.fail_closed: the reader NEVER throws — every observation is a typed outcome", async () => {
  await withMockedFetch(
    async () => {
      throw new TypeError("network down");
    },
    async () => {
      // No try/catch here on purpose: an exception escaping the reader is the failure this cell
      // exists to catch. The surface that calls it renders a stage, and a thrown read there would
      // leave an invited person on a blank card.
      const out = await readInvitePreview(TOKEN, SESSION);
      assert.equal(out.ok, false);
    },
  );
});
