// Slice-6 rig — DELTA PROBE (1), the RESET-GATED half: exact 0009 DDL compile on a
// FRESH database AND on a 0001->0008-upgraded database, plus the one-open-draft
// migration pre-flight. Contract-blind: companion §1/§2 + §11 — NEVER from 0009.
//
// This is the ONLY s6 file that RESETS the database (drops schema clara), so it is
// GATED behind CLARA_RIG_ALLOW_RESET=1 and MUST run ALONE (node --test runs files
// concurrently against one shared DB; a mid-run drop would nuke the others). In a
// normal run it SKIPS. Run on an ISOLATED DB, e.g.:
//   PGDATABASE=clara_s6_upgrade_ci CLARA_RIG_ALLOW_RESET=1 \
//     node --test packages/db/tests/s6-upgrade.test.mjs

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, copyFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ROUTINE_CENTS,
  opk,
  human,
  balanced,
  rootQuery,
  endPool,
  printLaneNotes,
  noteLane,
  insertUser,
  seedAdmission,
  createFirm,
  addMember,
  createClient,
  upsertAccount,
  freshResolution,
  draftEntry,
  approveEntry,
  seedVerifiedDocument,
  fileDocument,
  previewCorrection,
  proposeCorrection,
  approveCorrection,
  idOf,
  s6Ready,
} from "./s6-fixtures.mjs";

after(async () => {
  printLaneNotes("s6-upgrade");
  await endPool();
});

const RESET_OK = process.env.CLARA_RIG_ALLOW_RESET === "1";
const MIG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

function exportPre0009() {
  const tmp = mkdtempSync(join(tmpdir(), "clara-pre0009-"));
  for (const f of readdirSync(MIG_DIR)) {
    if (/^000[1-8]_.*\.sql$/.test(f)) copyFileSync(join(MIG_DIR, f), join(tmp, f));
  }
  return tmp;
}

function skipUnlessReset(t) {
  if (!RESET_OK) { t.skip("destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1 on an ISOLATED DB to run ALONE"); return true; }
  return false;
}

/** Assert the 0009 surface compiled + the ACL hygiene tail held. */
async function assertSurfaceClean() {
  assert.ok(await s6Ready(), "the 0009 surface is present after migrate (counterparties + revise_entry)");
  const pub = await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee=0 and a.privilege_type='EXECUTE'))`,
  );
  assert.equal(pub.rowCount, 0, `PUBLIC zero-execute sweep holds post-0009 (offenders: ${pub.rows.map((r) => r.proname).join(", ")})`);
  for (const fn of ["wake_draft_entry", "draft_entry", "upsert_account", "approve_entry"]) {
    const n = (await rootQuery("select count(*)::int n from pg_proc p join pg_namespace nn on nn.oid=p.pronamespace where nn.nspname='clara' and p.proname=$1", [fn])).rows[0].n;
    assert.equal(n, 1, `exactly one overload of clara.${fn} post-0009`);
  }
}

async function buildPreWorld(prefix) {
  const owner = await insertUser(prefix, "owner");
  const token = await seedAdmission();
  const firm = await createFirm(owner, { name: `${prefix}_firm`, token, opKey: opk() });
  const client = await createClient(owner, { name: `${prefix}_c1`, opKey: opk() });
  await upsertAccount(owner, { client, code: "1000", name: "Cash", type: "asset", opKey: opk() });
  await upsertAccount(owner, { client, code: "4000", name: "Sales", type: "income", opKey: opk() });
  await upsertAccount(owner, { client, code: "9990", name: "Rounding", type: "equity", special: "rounding", opKey: opk() });
  return { owner, firm, client };
}

// ===========================================================================
// Fresh compile.
// ===========================================================================

test("probe 1 (fresh): reset → migrate ALL (0001→0009) compiles clean; the ACL/overload tail holds", async (t) => {
  if (skipUnlessReset(t)) return;
  const { reset } = await import("../scripts/reset.mjs");
  const { migrate } = await import("../scripts/migrate.mjs");
  await reset({ log: () => {} });
  await migrate({ dir: MIG_DIR, log: () => {} });
  await assertSurfaceClean();
});

// ===========================================================================
// Upgrade compile (deploy-onto-existing) + the one-open-draft pre-flight.
// ===========================================================================

test("probe 1 (upgrade): 0001→0008 with a filed doc + a single open draft → 0009 applies clean; the one-open-draft index is created", async (t) => {
  if (skipUnlessReset(t)) return;
  const { reset } = await import("../scripts/reset.mjs");
  const { migrate } = await import("../scripts/migrate.mjs");
  await reset({ log: () => {} });
  await migrate({ dir: exportPre0009(), log: () => {} });

  const prefix = `s6up_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;
  const { owner, firm, client } = await buildPreWorld(prefix);
  const seed = await seedVerifiedDocument({ firm });
  await fileDocument(owner, { document: seed.documentId, client, resolution: await freshResolution(owner, client, { subjectKind: "document", subjectId: seed.documentId }) });
  // ONE open draft on the filing (the clean case).
  await draftEntry(human(owner), { client, resolution: await freshResolution(owner, client), document: seed.documentId, sha256: seed.sha256, lines: balanced({ cash: "1000", sales: "4000" }, ROUTINE_CENTS), opKey: opk() });

  await migrate({ dir: MIG_DIR, log: () => {} });
  await assertSurfaceClean();

  // The filing-keyed one-open-draft partial unique exists post-0009.
  const idx = await rootQuery(
    `select indexdef from pg_indexes where schemaname='clara' and tablename='journal_entries' and indexdef ilike '%filing_id%' and indexdef ilike '%draft%'`,
  );
  assert.ok(idx.rowCount >= 1, "a partial unique on journal_entries(filing_id) WHERE status='draft' exists post-0009");
});

test("probe 1 (upgrade pre-flight): a filing carrying TWO open drafts at 0008 ABORTS 0009 (deploy-onto-existing safety); it rolls back atomically", async (t) => {
  if (skipUnlessReset(t)) return;
  const { reset } = await import("../scripts/reset.mjs");
  const { migrate } = await import("../scripts/migrate.mjs");
  await reset({ log: () => {} });
  await migrate({ dir: exportPre0009(), log: () => {} });

  const prefix = `s6ab_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;
  const { owner, firm, client } = await buildPreWorld(prefix);
  const seed = await seedVerifiedDocument({ firm });
  await fileDocument(owner, { document: seed.documentId, client, resolution: await freshResolution(owner, client, { subjectKind: "document", subjectId: seed.documentId }) });
  // TWO open drafts on the SAME filing (lawful at 0008 — no unique yet).
  const lines = balanced({ cash: "1000", sales: "4000" }, ROUTINE_CENTS);
  await draftEntry(human(owner), { client, resolution: await freshResolution(owner, client), document: seed.documentId, sha256: seed.sha256, lines, opKey: opk() });
  await draftEntry(human(owner), { client, resolution: await freshResolution(owner, client), document: seed.documentId, sha256: seed.sha256, lines, opKey: opk() });

  await assert.rejects(() => migrate({ dir: MIG_DIR, log: () => {} }), /abort|two open|open draft|duplicate|unique|pre-?flight|already/i, "0009 ABORTS when a filing already carries two open drafts");
  // The abort rolled 0009 back — the coding floor never landed.
  const present = await rootQuery("select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname='counterparties'");
  assert.equal(present.rowCount, 0, "0009 rolled back cleanly (counterparties absent — the migration is atomic)");
  noteLane("one-open-draft pre-flight ABORT verified: a two-open-draft filing blocks the index build");
});

// ===========================================================================
// W9/§6.6 — the LEGACY-STATE correction case (restores the §3.5 combined-case
// coverage the §8 reorder lost). At 0008: an APPROVED cite + ONE OPEN draft on a
// single filing (lawful pre-0009 — only TWO open drafts abort the pre-flight).
// After 0009, a wrong-client correction reverses the live cite AND withdraws the
// open draft in ONE bounded transaction.
// ===========================================================================

test("probe 1 (upgrade legacy-state correction): approved cite + one open draft on one filing at 0008 → 0009 applies (no abort); approve_wrong_client_correction reverses the cite + withdraws the draft in one bounded transaction", async (t) => {
  if (skipUnlessReset(t)) return;
  const { reset } = await import("../scripts/reset.mjs");
  const { migrate } = await import("../scripts/migrate.mjs");
  await reset({ log: () => {} });
  await migrate({ dir: exportPre0009(), log: () => {} });

  const prefix = `s6leg_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;
  const owner = await insertUser(prefix, "owner");
  const bob = await insertUser(prefix, "bob");
  const token = await seedAdmission();
  const firm = await createFirm(owner, { name: `${prefix}_firm`, token, opKey: opk() });
  await addMember(owner, { firm, user: bob, role: "bookkeeper", opKey: opk() });
  const c1 = await createClient(owner, { name: `${prefix}_c1`, opKey: opk() });
  const c2 = await createClient(owner, { name: `${prefix}_c2`, opKey: opk() });
  for (const c of [c1, c2]) {
    await upsertAccount(owner, { client: c, code: "1000", name: "Cash", type: "asset", opKey: opk() });
    await upsertAccount(owner, { client: c, code: "4000", name: "Sales", type: "income", opKey: opk() });
    await upsertAccount(owner, { client: c, code: "9990", name: "Rounding", type: "equity", special: "rounding", opKey: opk() });
  }
  const seed = await seedVerifiedDocument({ firm });
  await fileDocument(owner, { document: seed.documentId, client: c1, resolution: await freshResolution(owner, c1, { subjectKind: "document", subjectId: seed.documentId }) });
  const lines = balanced({ cash: "1000", sales: "4000" }, ROUTINE_CENTS);
  // An APPROVED cite bound to the filing.
  const d1 = await draftEntry(human(owner), { client: c1, resolution: await freshResolution(owner, c1), document: seed.documentId, sha256: seed.sha256, lines, opKey: opk() });
  await approveEntry(owner, { entry: d1.entry_id, expectedRevision: d1.revision_token, opKey: opk() });
  // ONE open draft on the SAME filing (lawful pre-0009).
  const d2 = await draftEntry(human(owner), { client: c1, resolution: await freshResolution(owner, c1), document: seed.documentId, sha256: seed.sha256, lines, opKey: opk() });

  // 0009 applies WITHOUT aborting (only two OPEN drafts abort; here it is one approved + one draft).
  await migrate({ dir: MIG_DIR, log: () => {} });
  await assertSurfaceClean();

  // The wrong-client correction c1 → c2.
  await freshResolution(owner, c2, { subjectKind: "document", subjectId: seed.documentId });
  await previewCorrection(owner, { document: seed.documentId, fromClient: c1, toClient: c2 });
  const proposal = await proposeCorrection(owner, { document: seed.documentId, fromClient: c1, toClient: c2, reason: "wrong client legacy" });
  const correctionId = idOf(proposal, "correction_id", "correction");
  const planHash = proposal.plan_hash ?? (await rootQuery("select plan_hash from clara.filing_corrections where id=$1", [correctionId])).rows[0]?.plan_hash;
  await approveCorrection(bob, { correction: correctionId, planHash });

  // The combined bounded transaction: the approved cite is reversed, the draft withdrawn.
  const e1 = (await rootQuery("select reversed_by from clara.journal_entries where id=$1", [d1.entry_id])).rows[0];
  assert.ok(e1.reversed_by, "the live approved cite was reversed by the correction");
  const e2 = (await rootQuery("select status from clara.journal_entries where id=$1", [d2.entry_id])).rows[0];
  assert.equal(e2.status, "withdrawn", "the open draft on the retired filing was withdrawn in the SAME correction transaction");
  noteLane("legacy-state correction verified: combined reverse(live cite) + withdraw(open draft) in one bounded transaction");
});
