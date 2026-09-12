// `clara.get_current_legal_documents()` — the read behind #621's legal stage.
// Mocked-fetch style, ported from `./doors.test.ts`: what is under test is the
// door NAME, the decoder's refusals, and the fact that a row this build cannot
// fully read is dropped rather than half-rendered — not a re-derivation of
// `callDoor`'s own already-tested status/CLR classification.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  CURRENT_LEGAL_DOCUMENTS_DOOR,
  isLegalDocumentRow,
  isLegalKind,
  LEGAL_KINDS,
  loadCurrentLegalDocuments,
} from "./legal-reads";
import type { SessionTokenAccessor } from "@/lib/session";

const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withMockedFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

/** THE SHAPE 0185 ACTUALLY SHIPS — `body_sha256 text not null` under
 *  `check (body_sha256 = encode(sha256(convert_to(body,'UTF8')),'hex'))`, so
 *  PostgREST renders 64 lowercase hex characters and nothing else. This
 *  fixture used to carry `"\\xaa"`, the `bytea` wire form of the RETIRED
 *  `dpa_documents` column, which meant every cell in this file was decoding a
 *  row the shipped door could not produce. Computed from the body rather than
 *  hand-typed, for the same reason the e2e fixture is. */
const TERMS_BODY = "Terms text.";
const TERMS_SHA = createHash("sha256").update(TERMS_BODY, "utf8").digest("hex");

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "terms",
    version: 3,
    status: "published",
    title: "Clara Terms of Service",
    body: TERMS_BODY,
    body_sha256: TERMS_SHA,
    effective_from: "2026-09-01T00:00:00.000Z",
    published_at: "2026-08-30T00:00:00.000Z",
    accepted_at: null,
    accepted_version: null,
    ...over,
  };
}

test("the door is called by its exact name, with no arguments", async () => {
  let seenUrl = "";
  let seenBody: unknown = null;
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse([row()]);
    },
    async () => {
      const rows = await loadCurrentLegalDocuments(session);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.kind, "terms");
    },
  );
  assert.equal(CURRENT_LEGAL_DOCUMENTS_DOOR, "get_current_legal_documents");
  assert.match(seenUrl, /\/rest\/v1\/rpc\/get_current_legal_documents$/);
  assert.deepEqual(seenBody, {}, "a read door was called with arguments it does not take");
});

test("BOTH kinds come back, each with its own version, status and acceptance", async () => {
  await withMockedFetch(
    async () =>
      jsonResponse([
        row({ kind: "terms", version: 3, accepted_at: "2026-09-02T10:00:00.000Z", accepted_version: 3 }),
        row({ kind: "dpa", version: 1, status: "draft", title: "Clara DPA", accepted_at: null }),
      ]),
    async () => {
      const rows = await loadCurrentLegalDocuments(session);
      assert.deepEqual(rows.map((r) => [r.kind, r.version, r.status]), [
        ["terms", 3, "published"],
        ["dpa", 1, "draft"],
      ]);
      assert.equal(rows[0]?.accepted_at, "2026-09-02T10:00:00.000Z");
      assert.equal(rows[1]?.accepted_at, null);
    },
  );
});

test("a kind may be ABSENT, and an empty answer is honest rather than an error", async () => {
  await withMockedFetch(
    async () => jsonResponse([]),
    async () => assert.deepEqual(await loadCurrentLegalDocuments(session), []),
  );
  // PostgREST answers a set-returning function as an array; anything else is a
  // shape this build will not act on.
  await withMockedFetch(
    async () => jsonResponse({ kind: "terms" }),
    async () => assert.deepEqual(await loadCurrentLegalDocuments(session), []),
  );
});

test("a row this build cannot fully read is DROPPED, never half-rendered", async () => {
  const malformed: Array<[string, Record<string, unknown>]> = [
    ["an unknown kind", row({ kind: "privacy" })],
    ["a non-integer version", row({ version: 1.5 })],
    ["an unknown status", row({ status: "retired" })],
    ["an empty title", row({ title: "" })],
    ["an empty body", row({ body: "" })],
    ["an empty hash", row({ body_sha256: "" })],
    // THE HASH SHAPE (#621 review). `\x`-prefixed is `bytea`'s wire form —
    // the RETIRED `dpa_documents` column's shape, and the one the e2e fixture
    // was still minting. 0185 stores plain lowercase hex, so each of these is
    // a value the shipped door cannot have produced, and forwarding one to
    // `accept_legal_document` would spend an op key to be told
    // `CLR10 / hash_mismatch`.
    ["a bytea-prefixed hash", row({ body_sha256: `\\x${TERMS_SHA}` })],
    ["an UPPERCASE hash", row({ body_sha256: TERMS_SHA.toUpperCase() })],
    ["a truncated hash", row({ body_sha256: TERMS_SHA.slice(0, 63) })],
    ["an over-long hash", row({ body_sha256: `${TERMS_SHA}00` })],
    ["a non-hex hash", row({ body_sha256: "z".repeat(64) })],
    ["a non-string hash", row({ body_sha256: 12345 })],
    ["a non-string effective_from", row({ effective_from: 20260901 })],
    ["a non-integer accepted_version", row({ accepted_at: "x", accepted_version: "3" })],
  ];
  for (const [label, bad] of malformed) {
    assert.equal(isLegalDocumentRow(bad), false, `${label} was accepted by the decoder`);
    await withMockedFetch(
      async () => jsonResponse([bad, row({ kind: "dpa" })]),
      async () => {
        const rows = await loadCurrentLegalDocuments(session);
        assert.deepEqual(
          rows.map((r) => r.kind),
          ["dpa"],
          `${label} reached the stage instead of being dropped`,
        );
      },
    );
  }
  // POSITIVE CONTROL: the decoder still says yes to the shape the door ships —
  // 64 lowercase hex characters, no prefix.
  assert.equal(isLegalDocumentRow(row()), true);
  assert.match(TERMS_SHA, /^[0-9a-f]{64}$/, "the fixture itself is not the shape 0185 stores");
});

test("the kind vocabulary is closed, and it is the ONE list every surface reads", () => {
  assert.deepEqual([...LEGAL_KINDS], ["terms", "dpa"]);
  assert.equal(isLegalKind("terms"), true);
  assert.equal(isLegalKind("dpa"), true);
  assert.equal(isLegalKind("privacy"), false);
  assert.equal(isLegalKind(null), false);
  assert.equal(isLegalKind(undefined), false);
});
