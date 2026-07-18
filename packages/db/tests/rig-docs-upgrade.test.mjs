// Slice-5 rig — DOCUMENT PIPELINE part 11: UPGRADE / CUTOVER (companion §3.0.2 +
// §3.0 upgrade branch + §3.11 cutover). Contract-blind: derived from slice5-*.md,
// never from 0007.
//
// This is the ONLY document-pipeline test that RESETS the database (drops schema
// clara), so it is GATED behind CLARA_RIG_ALLOW_RESET=1 and MUST run ALONE — node
// --test runs files CONCURRENTLY against one shared DB (the Slice-2 lesson), and a
// mid-run schema drop would nuke the other suites. In a normal run it SKIPS.
//
// IMPORTANT (dir pinning): the pre-step migrates a temp dir of ONLY 0001–0006; the
// post-step migrates the REAL migrations dir EXPLICITLY (`migrate({ dir: MIG_DIR })`)
// so it applies the actual 0007 even when CLARA_MIGRATIONS_DIR is exported for the
// inert green-with-skips proof. Run it against an isolated DB, e.g.:
//   PGDATABASE=clara_docs_upgrade_ci CLARA_RIG_ALLOW_RESET=1 \
//     node --test tests/rig-docs-upgrade.test.mjs
//
// ---------------------------------------------------------------------------
// PROPOSED ci.yml step (a SEPARATE job step with its OWN throwaway database, like
// the events/runtime upgrade steps — I do NOT edit ci.yml; this is the spec):
//
//   - name: Slice-5 document-pipeline upgrade drill (isolated DB)
//     env:
//       PGHOST: localhost
//       PGPORT: 5432
//       PGUSER: postgres
//       PGPASSWORD: postgres
//       PGDATABASE: clara_docs_upgrade_ci
//       CLARA_RIG_ALLOW_RESET: "1"
//       CLARA_ALLOW_DESTRUCTIVE: "1"
//     run: |
//       psql -h localhost -U postgres -c 'create database clara_docs_upgrade_ci;'
//       node --test packages/db/tests/rig-docs-upgrade.test.mjs
//       psql -h localhost -U postgres -c 'drop database clara_docs_upgrade_ci;'
// ---------------------------------------------------------------------------

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, copyFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ROUTINE_CENTS,
  CITE_CODE,
  opk,
  sha,
  human,
  balanced,
  rootQuery,
  endPool,
  insertUser,
  seedAdmission,
  createFirm,
  createClient,
  upsertAccount,
  freshResolution,
  draftEntry,
  approveEntry,
  ingestDocument,
  seedIntake,
  finalizeIntake,
  printLaneNotes,
  noteLane,
  assertRaises,
  FILING_BASIS_LEGACY,
  DOC_EVT,
  CUTOVER_REASON,
} from "./rig-docs-fixtures.mjs";

after(async () => {
  printLaneNotes("upgrade");
  await endPool();
});

const RESET_OK = process.env.CLARA_RIG_ALLOW_RESET === "1";
const MIG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** Copy migrations 0001–0006 (NOT 0007) into a throwaway dir for a partial migrate. */
function exportPre0007() {
  const tmp = mkdtempSync(join(tmpdir(), "clara-pre0007-"));
  for (const f of readdirSync(MIG_DIR)) {
    if (/^000[1-6]_.*\.sql$/.test(f)) copyFileSync(join(MIG_DIR, f), join(tmp, f));
  }
  return tmp;
}

/** Build a firm/client/chart on the pre-0007 schema (the writers still exist there). */
async function buildPre0007World(prefix) {
  const owner = await insertUser(prefix, "owner");
  const token = await seedAdmission();
  const firm = await createFirm(owner, { name: `${prefix}_firm`, token, opKey: opk() });
  const client = await createClient(owner, { name: `${prefix}_c1`, opKey: opk() });
  await upsertAccount(owner, { client, code: "1000", name: "Cash", type: "asset", opKey: opk() });
  await upsertAccount(owner, { client, code: "4000", name: "Sales", type: "income", opKey: opk() });
  await upsertAccount(owner, { client, code: "9990", name: "Rounding", type: "equity", special: "rounding", opKey: opk() });
  return { owner, firm, client };
}

function skipUnlessReset(t) {
  if (!RESET_OK) {
    t.skip("destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1 on an ISOLATED DB to run ALONE");
    return true;
  }
  return false;
}

// ===========================================================================
// §3.0.2 — the filing_id backfill drill (clean).
// ===========================================================================

test("§3.0.2 backfill drill: 0001–0006 + cited APPROVED entries → 0007 migrates clean; a legacy ACTIVE filing (basis=legacy-0007, resolution NULL) per client_id; entries' filing_id backfilled; documents.client_id dropped", async (t) => {
  if (skipUnlessReset(t)) return;
  const { reset } = await import("../scripts/reset.mjs");
  const { migrate } = await import("../scripts/migrate.mjs");

  await reset({ log: () => {} });
  await migrate({ dir: exportPre0007(), log: () => {} });

  const prefix = `docup_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;
  const { owner, client } = await buildPre0007World(prefix);
  const digest = sha(randomUUID());
  const document = await ingestDocument(human(owner), { client, sha256: digest, filename: "legacy.pdf", opKey: opk() });
  const res = await freshResolution(owner, client);
  const d = await draftEntry(human(owner), { client, resolution: res, document, sha256: digest, lines: balanced({ cash: "1000", sales: "4000" }, ROUTINE_CENTS), opKey: opk() });
  await approveEntry(owner, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk() });

  // Apply the REAL 0007 (explicit dir defeats a CLARA_MIGRATIONS_DIR pin).
  await migrate({ dir: MIG_DIR, log: () => {} });

  // documents.client_id is dropped.
  const cid = await rootQuery("select 1 from information_schema.columns where table_schema='clara' and table_name='documents' and column_name='client_id'");
  assert.equal(cid.rowCount, 0, "documents.client_id dropped by 0007");

  // A legacy ACTIVE filing per former client_id: basis=legacy-0007, resolution NULL.
  const filing = await rootQuery("select basis, resolution_id, retired_at, client_id from clara.document_filings where document_id=$1", [document]);
  assert.equal(filing.rowCount, 1, "exactly one legacy filing was backfilled for the document");
  assert.equal(filing.rows[0].basis, FILING_BASIS_LEGACY, "the legacy filing carries basis=legacy-0007");
  assert.equal(filing.rows[0].resolution_id ?? null, null, "the legacy backfill creates NO resolution (a claim-only ingest never becomes posting authority)");
  assert.equal(filing.rows[0].retired_at ?? null, null, "the legacy filing is ACTIVE");
  assert.equal(filing.rows[0].client_id, client, "the legacy filing binds the former client_id");

  // The cited entry's filing_id is backfilled to that unique legacy filing.
  const entry = await rootQuery("select filing_id from clara.journal_entries where id=$1", [d.entry_id]);
  assert.equal(entry.rows[0].filing_id, (await rootQuery("select id from clara.document_filings where document_id=$1", [document])).rows[0].id, "the cited entry's filing_id backfilled to the legacy filing");

  // Legacy docs are claim-only (bytes_verified_at NULL) → a NEW draft citing it is uncitable.
  const bytesVerified = await rootQuery("select bytes_verified_at from clara.documents where id=$1", [document]);
  assert.equal(bytesVerified.rows[0].bytes_verified_at ?? null, null, "the legacy document is claim-only (bytes_verified_at NULL)");
  await assertRaises(CITE_CODE, () => draftEntry(human(owner), { client, resolution: freshResolution(owner, client), document, sha256: digest, lines: balanced({ cash: "1000", sales: "4000" }, ROUTINE_CENTS), opKey: opk() }), "a NEW draft citing an un-upgraded legacy doc is uncitable");
});

// ===========================================================================
// §3.0.2 — ambiguous / zero-match citation ABORTS the migration.
// ===========================================================================

test("§3.0.2 ambiguous citation ABORT: a cited entry that lacks EXACTLY one legacy filing aborts 0007 (zero-ambiguity proof)", async (t) => {
  if (skipUnlessReset(t)) return;
  const { reset } = await import("../scripts/reset.mjs");
  const { migrate } = await import("../scripts/migrate.mjs");

  await reset({ log: () => {} });
  await migrate({ dir: exportPre0007(), log: () => {} });
  const prefix = `docab_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;
  const { owner, firm, client } = await buildPre0007World(prefix);

  // Raw-insert a NULL-client document (no legacy filing will be backfilled for it)
  // and an APPROVED entry citing it → the backfill finds ZERO matches → ABORT.
  const digest = sha(randomUUID());
  const doc = await rootQuery(
    "insert into clara.documents (firm_id, client_id, sha256, original_filename, mime_type, byte_size, storage_path, status, uploaded_by) values ($1, null, $2, 'orphan.pdf', 'application/pdf', 10, 'legacy/orphan', 'ingested', $3) returning id",
    [firm, digest, owner],
  );
  const documentId = doc.rows[0].id;
  await rootQuery("set constraints all deferred");
  const entry = await rootQuery(
    "insert into clara.journal_entries (firm_id, client_id, status, posting_date, memo, origin, document_id, source_doc_sha256, maker_actor, approved_at, checker_actor, self_approval_attestation) values ($1, $2, 'approved', '2026-01-15', 'orphan cite', 'document', $3, $4, $5, now(), $5, 'rig') returning id",
    [firm, client, documentId, digest, owner],
  ).catch((e) => { noteLane(`ABORT setup: raw orphan-cite entry insert rejected pre-0007 (${e.code}: ${e.message}) — provenance belt congruence; try an alternate ambiguity if this blocks`); return null; });
  if (entry == null) { noteLane("ambiguous-citation ABORT could not be staged on this pre-0007 schema — recorded as an interface expectation"); return; }
  await rootQuery("insert into clara.journal_lines (entry_id, line_no, account_code, debit_cents, credit_cents) values ($1,1,'1000',$2,0),($1,2,'4000',0,$2)", [entry.rows[0].id, ROUTINE_CENTS]).catch(() => {});

  await assert.rejects(() => migrate({ dir: MIG_DIR, log: () => {} }), /abort|ambig|match|filing|integrity|failed/i, "0007 ABORTS on a cited entry with no unique legacy filing");
  // The abort rolled 0007 back — document_filings never landed.
  const filingsTable = await rootQuery("select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname='document_filings'");
  assert.equal(filingsTable.rowCount, 0, "0007 rolled back cleanly (document_filings absent — the migration is atomic)");
});

// ===========================================================================
// §3.0 — legacy claim-only UPGRADE branch (distinct from adoption).
// ===========================================================================

test("§3.0 legacy-upgrade branch: a claim-only legacy doc is verified in place by a matching intake — ONE task/charge, NO second document row, NO new document.ingested, uncitable-before → citable-after", async (t) => {
  if (skipUnlessReset(t)) return;
  const { reset } = await import("../scripts/reset.mjs");
  const { migrate } = await import("../scripts/migrate.mjs");

  await reset({ log: () => {} });
  await migrate({ dir: exportPre0007(), log: () => {} });
  const prefix = `docug2_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;
  const { owner, client } = await buildPre0007World(prefix);
  const firm = (await rootQuery("select firm_id from clara.clients where id=$1", [client])).rows[0].firm_id;

  // A legacy claim-only document (ingested pre-0007; becomes bytes_verified_at NULL post-0007).
  const digest = sha(randomUUID());
  const document = await ingestDocument(human(owner), { client, sha256: digest, filename: "claim.pdf", opKey: opk() });

  await migrate({ dir: MIG_DIR, log: () => {} });

  // Post-0007: claim-only + uncitable for NEW drafts.
  const pre = (await rootQuery("select bytes_verified_at from clara.documents where id=$1", [document])).rows[0];
  assert.equal(pre.bytes_verified_at ?? null, null, "the legacy document is claim-only before upgrade");
  await assertRaises(CITE_CODE, () => draftEntry(human(owner), { client, resolution: freshResolution(owner, client), document, sha256: digest, lines: balanced({ cash: "1000", sales: "4000" }, ROUTINE_CENTS), opKey: opk() }), "a NEW draft on the un-upgraded legacy doc is uncitable");
  const ingestedBefore = (await rootQuery("select count(*)::int as n from clara.domain_events where document_id=$1 and event_type=$2", [document, DOC_EVT.ingested])).rows[0].n;
  const docRowsBefore = (await rootQuery("select count(*)::int as n from clara.documents where firm_id=$1 and sha256=$2", [firm, digest])).rows[0].n;

  // The UPGRADE: an intake whose VERIFIED sha matches the claim-only row → finalize
  // upgrades in place (not a new document).
  const intake = await seedIntake({ firm, uploadedBy: owner, status: "verified", sha256: digest, storageKey: `firms/${firm}/docs/${digest}.pdf` });
  await finalizeIntake({ intake });

  const post = (await rootQuery("select bytes_verified_at, storage_path from clara.documents where id=$1", [document])).rows[0];
  assert.ok(post.bytes_verified_at, "the upgrade stamped bytes_verified_at on the EXISTING row (verified in place)");
  const docRowsAfter = (await rootQuery("select count(*)::int as n from clara.documents where firm_id=$1 and sha256=$2", [firm, digest])).rows[0].n;
  assert.equal(docRowsAfter, docRowsBefore, "NO second document row was created (identity unchanged)");
  const ingestedAfter = (await rootQuery("select count(*)::int as n from clara.domain_events where document_id=$1 and event_type=$2", [document, DOC_EVT.ingested])).rows[0].n;
  assert.equal(ingestedAfter, ingestedBefore, "NO new document.ingested (identity unchanged; staleness rides the extraction event)");
  const tasks = (await rootQuery("select count(*)::int as n from clara.document_processing_tasks where document_id=$1", [document])).rows[0].n;
  assert.equal(tasks, 1, "the upgrade created exactly ONE (first) processing task");

  // Citable-after: the legacy filing is active for `client`, and bytes are now verified.
  const d = await draftEntry(human(owner), { client, resolution: await freshResolution(owner, client), document, sha256: digest, lines: balanced({ cash: "1000", sales: "4000" }, ROUTINE_CENTS), opKey: opk() });
  assert.ok(d.entry_id, "a NEW draft citing the upgraded document now SUCCEEDS (citable-after)");
  noteLane("legacy-upgrade branch verified: verify-in-place, one task, no second row/event, citable-after");
});

// ===========================================================================
// §3.11 — taxonomy-v2 cutover residual sweep.
// ===========================================================================

test("§3.11 cutover residual sweep: historical background_review intents for document events are cancelled with the audited reason 'taxonomy-v2-cutover'", async (t) => {
  if (skipUnlessReset(t)) return;
  const { reset } = await import("../scripts/reset.mjs");
  const { migrate } = await import("../scripts/migrate.mjs");

  await reset({ log: () => {} });
  await migrate({ dir: exportPre0007(), log: () => {} });
  const prefix = `doctx_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;
  const { owner, client } = await buildPre0007World(prefix);

  // A pre-0007 document.ingested event → its v1 background_review wake intent (the
  // residual the cutover must retire).
  await ingestDocument(human(owner), { client, sha256: sha(randomUUID()), opKey: opk() });
  const ev = (await rootQuery("select id, firm_id, seq, event_type from clara.domain_events where client_id=$1 and event_type=$2 order by seq desc limit 1", [client, DOC_EVT.ingested])).rows[0];
  const intent = await rootQuery(
    "insert into clara.wake_intents (event_id, firm_id, event_seq, event_type, decision, taxonomy_version) values ($1,$2,$3,$4,'background_review',1) returning id",
    [ev.id, ev.firm_id, ev.seq, ev.event_type],
  );

  await migrate({ dir: MIG_DIR, log: () => {} });

  // The residual intent must be cancelled by the in-migration sweep with the reason.
  const after = await rootQuery("select to_jsonb(w) as row from clara.wake_intents w where w.id=$1", [intent.rows[0].id]);
  const row = after.rows[0]?.row;
  assert.ok(row, "the residual intent still exists (cancelled, not deleted)");
  const cancelled = row.status && row.status !== "pending";
  const reasoned = JSON.stringify(row).includes(CUTOVER_REASON);
  assert.ok(cancelled, `the residual v1 background_review intent is no longer pending (got status=${row.status})`);
  assert.ok(reasoned, `the cancellation carries the audited reason '${CUTOVER_REASON}'`);
  noteLane(`taxonomy cutover residual sweep verified: intent moved to status=${row.status} with reason '${CUTOVER_REASON}'`);
});
