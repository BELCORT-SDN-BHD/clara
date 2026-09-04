// clara.dpa_documents — the C-1 shape (dpa-reads.ts's header) and the honest
// degrade `dpa-server-reads.ts` owes when it cannot be read at all (the
// table is absent on `main`, or, once it lands, ungranted — see PR #478's
// own migration text).

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { CURRENT_DPA_DOCUMENT_DOOR, isDpaDocumentRow } from "./dpa-reads";
import { loadCurrentDpaDocumentState } from "./dpa-server-reads";
import { readCode } from "../../test/sourceOracle";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../packages/db/migrations",
);

test("isDpaDocumentRow validates every declared field's shape", () => {
  const valid = {
    version: "clara-beta-2026-08-a",
    body: "This is Clara's beta data-processing agreement.",
    body_sha256: "\\x1234",
    published_at: "2026-08-31T00:00:00Z",
  };
  assert.equal(isDpaDocumentRow(valid), true);

  const invalidCases: Array<Record<string, unknown>> = [
    { ...valid, version: "" },
    { ...valid, body: "" },
    { ...valid, body_sha256: 1234 },
    { ...valid, published_at: null },
    { ...valid, body_sha256: "" },
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

test("NIT-5: the DOOR's own return columns are the drift tripwire, once C-3 lands", () => {
  // REPOINTED by Lane B. This used to watch `create table clara.dpa_documents`
  // — the wrong subject: `apps/web` never reads that relation and structurally
  // cannot (C-1 grants `clara_authenticated` nothing on it, permanently). What
  // this module actually consumes is `clara.get_current_dpa_document()`'s
  // `returns table(...)` list, so that is what must not drift under it.
  //
  // A DOCUMENTED NO-OP UNTIL C-3 (#493, `0163`) IS ON THIS TREE — and it ARMS
  // ITSELF the moment it is (裁-108: a migration's arrival is what arms the
  // cells that read it). The scan is content-based rather than path-based
  // because migration numbers are claimed at merge (constraint 10), so the
  // filename on `main` differs from the one on the open branch.
  const requiredFields = ["version", "body", "body_sha256", "published_at"] as const;
  let returned: string[] | null = null;
  for (const entry of readdirSync(MIGRATIONS_DIR)) {
    if (!entry.endsWith(".sql")) continue;
    const source = readFileSync(join(MIGRATIONS_DIR, entry), "utf8");
    const match = new RegExp(
      `create\\s+function\\s+clara\\.${CURRENT_DPA_DOCUMENT_DOOR}\\s*\\(\\s*\\)\\s*\\r?\\n?\\s*returns\\s+table\\s*\\(([^)]*)\\)`,
      "i",
    ).exec(source);
    if (!match) continue;
    returned = (match[1] ?? "")
      .split(",")
      .map((part) => part.trim().split(/\s+/)[0] ?? "")
      .filter((name) => name.length > 0);
    break;
  }
  if (returned === null) return; // C-3 has not merged onto this tree yet.
  for (const field of requiredFields) {
    assert.ok(
      returned.includes(field),
      `${CURRENT_DPA_DOCUMENT_DOOR}() no longer returns "${field}", which isDpaDocumentRow requires`,
    );
  }
});

test("NIT-5b: the retired dpa_documents relation read is gone from this app", () => {
  // The positive form of the repoint. `apps/web` must not read the relation at
  // all any more — a leftover relation read would degrade to "unavailable"
  // forever and look like an infrastructure gap rather than a defect.
  //
  // DRIVEN THROUGH THE SHARED COMMENT-STRIPPING ORACLE, and the first cut of
  // this cell is why: a bare regex over the raw file matched the module's own
  // header, which EXPLAINS the retired call by naming it. The cell reddened on
  // a comment — "spelling is not identity" (review law 3) applied to the
  // instrument itself. `stripComments` is the same machinery W-R's roster and
  // W-H2b's tripwire use, so this reads CODE.
  const path = join(dirname(fileURLToPath(import.meta.url)), "dpa-reads.ts");
  const raw = readFileSync(path, "utf8");
  const code = readCode(path).code;

  assert.match(raw, /getRows/, "VACUITY CONTROL: the header no longer explains what was retired");
  assert.equal(
    /\bgetRows\s*[<(]/.test(code),
    false,
    "dpa-reads.ts still issues a relation read in CODE; the door is the only read path",
  );
  assert.match(code, new RegExp(`\\bcallDoor\\b`), "the module does not call a door at all");
  assert.ok(code.includes(CURRENT_DPA_DOCUMENT_DOOR), "the door name is not in the module's code");
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
      resolveSession: async () => ({ accessToken: "tok", subject: "11111111-1111-1111-1111-111111111111", email: null }),
    });
    assert.deepEqual(state, { kind: "unavailable" });
  } finally {
    if (originalUrl === undefined) delete (process.env as Record<string, string | undefined>).NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
});
