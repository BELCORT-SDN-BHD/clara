// clara.dpa_documents — the C-1 shape (dpa-reads.ts's header) and the honest
// degrade `dpa-server-reads.ts` owes when it cannot be read at all (the
// table is absent on `main`, or, once it lands, ungranted — see PR #478's
// own migration text).

import assert from "node:assert/strict";
import { test } from "node:test";

import { isDpaDocumentRow } from "./dpa-reads";
import { loadCurrentDpaDocumentState } from "./dpa-server-reads";

test("isDpaDocumentRow validates every declared field's shape", () => {
  const valid = {
    version: "clara-beta-2026-08-a",
    body: "This is Clara's beta data-processing agreement.",
    body_sha256: "\\x1234",
    effective_from: "2026-08-31T00:00:00Z",
    effective_to: null,
  };
  assert.equal(isDpaDocumentRow(valid), true);

  const invalidCases: Array<Record<string, unknown>> = [
    { ...valid, version: "" },
    { ...valid, body: "" },
    { ...valid, body_sha256: 1234 },
    { ...valid, effective_from: null },
    { ...valid, effective_to: 42 },
    { version: "v1" }, // missing every other field
  ];
  for (const bad of invalidCases) {
    assert.equal(isDpaDocumentRow(bad), false, `should have refused ${JSON.stringify(bad)}`);
  }
  assert.equal(isDpaDocumentRow(null), false);
  assert.equal(isDpaDocumentRow("clara-beta-2026-08-a"), false);
});

test("loadCurrentDpaDocumentState: no session → unavailable, without issuing any read", async () => {
  let reads = 0;
  const state = await loadCurrentDpaDocumentState({
    resolveSession: async () => {
      reads += 1;
      return null;
    },
  });
  assert.deepEqual(state, { kind: "unavailable" });
  assert.equal(reads, 1, "the session resolver itself must still be called exactly once");
});

test("loadCurrentDpaDocumentState: ANY throw from the read degrades to unavailable, never propagates", async () => {
  const state = await loadCurrentDpaDocumentState({
    resolveSession: async () => {
      throw new Error("relation \"clara.dpa_documents\" does not exist");
    },
  });
  assert.deepEqual(state, { kind: "unavailable" });
});

test("VACUITY CONTROL: a resolved session with no dpa read override still degrades (no live table on this tip)", async () => {
  // This exercises the REAL `loadCurrentDpaDocument` against the REAL
  // `getRows`, with no NEXT_PUBLIC_SUPABASE_URL configured — the same
  // "everything folds to unavailable" property a genuine missing-grant
  // response would also produce, proving the catch-all is not vacuous.
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete (process.env as Record<string, string | undefined>).NEXT_PUBLIC_SUPABASE_URL;
  try {
    const state = await loadCurrentDpaDocumentState({
      resolveSession: async () => ({ accessToken: "tok", subject: "11111111-1111-1111-1111-111111111111" }),
    });
    assert.deepEqual(state, { kind: "unavailable" });
  } finally {
    if (originalUrl === undefined) delete (process.env as Record<string, string | undefined>).NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
});
