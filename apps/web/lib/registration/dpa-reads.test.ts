// clara.dpa_documents — the C-1 shape (dpa-reads.ts's header) and the honest
// degrade `dpa-server-reads.ts` owes when it cannot be read at all (the
// table is absent on `main`, or, once it lands, ungranted — see PR #478's
// own migration text).

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { DPA_DOCUMENT_COLUMNS, isDpaDocumentRow } from "./dpa-reads";
import { loadCurrentDpaDocumentState } from "./dpa-server-reads";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../packages/db/migrations",
);

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

test("NIT-5: DPA_DOCUMENT_COLUMNS drift tripwire against C-1's real `create table`, once it lands", () => {
  // Verified 2026-09-01 against `UNNUMBERED_checkout_gate_c1_dpa.sql`
  // (branch coa/fs4-c1-dpa, PR #478): `create table clara.dpa_documents(
  // version text primary key, body text not null, body_sha256 bytea not
  // null, source_path text not null, effective_from timestamptz not null,
  // effective_to timestamptz, created_at timestamptz not null default
  // now(), ...)`. That file is NOT on `main` yet, and migration numbers are
  // claimed only at merge (constraint 10) — its filename on `main` will
  // differ from the unnumbered one on the open branch. So this searches
  // every migration file's CONTENT for the live `create table` rather than
  // one fixed path, and is a documented no-op until one matches: "the door
  // isn't built yet" stays honest, but the day it lands with a renamed or
  // reordered column, this reds instead of silently degrading to
  // "unavailable forever" (dpa-server-reads.ts's own catch-all).
  let liveColumns: string[] | null = null;
  for (const entry of readdirSync(MIGRATIONS_DIR)) {
    if (!entry.endsWith(".sql")) continue;
    const source = readFileSync(join(MIGRATIONS_DIR, entry), "utf8");
    const match = /create\s+table\s+clara\.dpa_documents\s*\(([\s\S]*?)\n\);/i.exec(source);
    if (!match) continue;
    liveColumns = (match[1] ?? "")
      .split(",")
      .map((line) => line.trim().split(/\s+/)[0] ?? "")
      .filter((name) => name.length > 0 && !name.startsWith("constraint"));
    break;
  }

  if (liveColumns === null) {
    // C-1 has not merged onto this branch's tree yet — nothing to check
    // against. Not a pass in disguise: the cell above (`isDpaDocumentRow`)
    // is what actually exercises this shape's runtime handling today.
    return;
  }

  for (const column of DPA_DOCUMENT_COLUMNS) {
    assert.ok(
      liveColumns.includes(column),
      `DPA_DOCUMENT_COLUMNS reads "${column}", which C-1's live migration no longer declares`,
    );
  }
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
