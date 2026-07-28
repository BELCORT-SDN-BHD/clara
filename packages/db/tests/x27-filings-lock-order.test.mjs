// Migration 0027 — documents-before-document_filings lock order (task #29 ledger). See
// 0027_filings_lock_order.sql's own header for the full defect analysis: file_document
// locks `documents` FOR UPDATE then inserts `document_filings`; confirm_attribution_candidate
// (with p_file_document=true) used to do the opposite — insert `document_filings` first,
// reach `documents` only later via _recompute_document_retention. Two concurrent
// transactions racing the SAME (document, client) pair through these two verbs is the
// textbook lock-order-inversion deadlock this migration closes: the Q9-round 0025 reproducer
// hit it 1/16 runs (a real 40P01). This battery makes it a SOAK, not a hope.
//
// Scope note (honest, not silent): the fix is mechanically IDENTICAL across all three edited
// writers (confirm_attribution_candidate, approve_wrong_client_correction,
// retire_document_filing) — a single `documents FOR UPDATE` lock moved ahead of the writer's
// own pre-existing first document_filings touch. This battery exercises the pair with the
// tightest, most reliably reproducible pre-fix failure (file_document vs
// confirm_attribution_candidate, the ORIGINAL named reproducer) at soak depth. The migration's
// own in-transaction tail AND the postverify file assert the identical structural claim
// (documents-lock strictly precedes the pre-existing filings-touch, by source position) for
// ALL THREE edited writers with equal rigor — that static proof is what actually stands behind
// approve_wrong_client_correction and retire_document_filing; this battery's soak is the
// dynamic corroboration for the pair budget allowed to build a full concurrent fixture for.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rootQuery, ROLES, opk, endPool } from "./rig-helpers.mjs";
import { noteLane, printLaneNotes } from "./rig-runtime-helpers.mjs";
import { buildWorld, holdThenContend, concurrentTwoSession, sawDeadlock } from "./x1-helpers.mjs";
import { seedAttempt, seedCandidate } from "./rig-docs-fixtures.mjs";

let has0027 = false;
let w = null;

async function has29() {
  try {
    const r = await rootQuery("select 1 from clara.schema_migrations where version ~ '^0027_'");
    return r.rows.length > 0;
  } catch { return false; }
}

before(async () => {
  has0027 = await has29();
  if (!has0027) { noteLane("0027 absent — x27-filings-lock-order battery FAILS loudly rather than skipping"); return; }
  w = await buildWorld();
});
after(async () => { printLaneNotes("x27-filings-lock-order"); await endPool(); });

function requireReady() {
  if (!has0027) {
    throw new Error(
      "0027 NOT applied (clara.schema_migrations has no '0027_%' row) — the documents-before-"
      + "document_filings lock order is not present. This battery is REQUIRED to fail against "
      + "the 26-migration prestate (it is exactly what reproduces the pre-fix deadlock).");
  }
}

// ---------------------------------------------------------------------------
// Minimal, self-contained fixtures (the x-lane-widen-0026 precedent: when the exact target
// shape is already known from the CoR read, a direct insert beats fighting the adaptive
// contract-blind layer's defaults — confirmCandidate()'s wrapper in rig-docs-fixtures.mjs
// never sets p_file_document, so it can't exercise the write path this migration touches).
// ---------------------------------------------------------------------------

async function seedPdfDoc(firm, tag) {
  const sha = randomUUID().replace(/-/g, "").padEnd(64, "0").slice(0, 64);
  const storagePath = `firms/${firm}/docs/${sha}.pdf`;
  const r = await rootQuery(
    `insert into clara.documents(firm_id,sha256,original_filename,mime_type,byte_size,storage_path,
        bytes_verified_at,extraction_status,uploaded_by)
     values ($1,$2,$3,'application/pdf',2048,$4,now(),'pending',null)
     returning id`,
    [firm, sha, `${tag}.pdf`, storagePath],
  );
  return r.rows[0].id;
}

/** A fresh open attribution candidate for (document, client) — one-shot: disposition='open'
 *  only ever confirms once, so every soak iteration needs its own document+candidate pair. */
async function seedOpenCandidate(firm, document, client) {
  const attempt = await seedAttempt({ firm, document });
  return seedCandidate({ firm, attempt, client });
}

// The race legs call clara.confirm_attribution_candidate($1,$2,true) and
// clara.file_document($1,$2,null,$3) directly inline (bypassing the adaptive wrapper, whose
// confirmCandidate() never sets p_file_document — see the header note) so p_file_document=true
// is guaranteed on every call; this is the exact write shape §A of 0027 fixes.

// ---------------------------------------------------------------------------

test("§0027 readiness", () => { requireReady(); assert.ok(w, "world built"); });

test("§0027.1 holdThenContend — file_document HOLDS, confirm_attribution_candidate(file=true) CONTENDS on the same (document,client): b blocks, then resolves against a's committed state", async () => {
  requireReady();
  const doc = await seedPdfDoc(w.firms.A, "h1a");
  const candidate = await seedOpenCandidate(w.firms.A, doc, w.clients.A1);
  const out = await holdThenContend({
    a: { role: ROLES.authenticated, jwtSub: w.users.alice, run: (c) => c.query("select clara.file_document($1,$2,null,$3) as r", [doc, w.clients.A1, opk("hc-a")]) },
    b: { role: ROLES.authenticated, jwtSub: w.users.alice, run: (c) => c.query("select clara.confirm_attribution_candidate($1,$2,true) as r", [candidate, opk("hc-b")]) },
  });
  assert.equal(out.provedBlocked, true, "confirm_attribution_candidate must actually BLOCK behind file_document's held documents lock, not race free");
  assert.equal(out.a.ok, true, "file_document (the holder) succeeds");
  // b resolves against a's COMMITTED state: the document is already actively filed to
  // clientA1, so confirm_attribution_candidate's OWN filing branch finds v_filing already
  // present and no-ops the insert (v_filed stays false) — b still succeeds (the candidate
  // itself still gets confirmed), just without a second filing row. Never a 40P01/23505 here.
  assert.equal(out.b.ok, true, `confirm_attribution_candidate resolves cleanly after the block, got: ${JSON.stringify(out.b)}`);
});

test("§0027.2 holdThenContend — REVERSED holder: confirm_attribution_candidate(file=true) HOLDS, file_document CONTENDS on the same (document,client)", async () => {
  requireReady();
  const doc = await seedPdfDoc(w.firms.A, "h2a");
  const candidate = await seedOpenCandidate(w.firms.A, doc, w.clients.A1);
  const out = await holdThenContend({
    a: { role: ROLES.authenticated, jwtSub: w.users.alice, run: (c) => c.query("select clara.confirm_attribution_candidate($1,$2,true) as r", [candidate, opk("hc2-a")]) },
    b: { role: ROLES.authenticated, jwtSub: w.users.alice, run: (c) => c.query("select clara.file_document($1,$2,null,$3) as r", [doc, w.clients.A1, opk("hc2-b")]) },
  });
  assert.equal(out.provedBlocked, true, "file_document must actually BLOCK behind confirm_attribution_candidate's held documents lock (post-0027 order), not race free");
  assert.equal(out.a.ok, true, "confirm_attribution_candidate (the holder) succeeds");
  // b resolves against a's COMMITTED state: the filing already exists (basis='human',
  // created by confirm_attribution_candidate) — file_document's own dup check
  // ("document is already actively filed to this client", CLR10) fires. An honest,
  // typed refusal — never a 40P01.
  assert.equal(out.b.ok, false, "file_document must see the already-committed filing and refuse, not double-file");
  assert.equal(out.b.code, "CLR10", `expected CLR10 (already filed), got: ${JSON.stringify(out.b)}`);
});

test("§0027.3 SOAK — concurrentTwoSession, file_document vs confirm_attribution_candidate(file=true), 32 fresh (document,candidate) pairs: ZERO 40P01, every pair serializes to exactly one filing", async () => {
  requireReady();
  const N = 32;
  let deadlocks = 0;
  const shapes = { bothOk: 0, oneRefused: 0, other: 0 };
  for (let i = 0; i < N; i++) {
    const doc = await seedPdfDoc(w.firms.A, `soak${i}`);
    const candidate = await seedOpenCandidate(w.firms.A, doc, w.clients.A1);
    const out = await concurrentTwoSession({
      a: { role: ROLES.authenticated, jwtSub: w.users.alice, run: (c) => c.query("select clara.file_document($1,$2,null,$3) as r", [doc, w.clients.A1, opk(`soak-a-${i}`)]) },
      b: { role: ROLES.authenticated, jwtSub: w.users.alice, run: (c) => c.query("select clara.confirm_attribution_candidate($1,$2,true) as r", [candidate, opk(`soak-b-${i}`)]) },
    });
    if (sawDeadlock(out)) { deadlocks++; noteLane(`0027 soak iter ${i}: 40P01/40001 observed — ${JSON.stringify(out)}`); continue; }
    if (out.a.ok && out.b.ok) shapes.bothOk++;
    else if (out.a.ok !== out.b.ok) shapes.oneRefused++;
    else shapes.other++;
    // Exactly one active filing must exist for (doc, clientA1) regardless of which shape —
    // confirm_attribution_candidate's own filing insert is itself guarded by a v_filing IS
    // NULL check, so even a bothOk outcome must not produce two active rows.
    const cnt = await rootQuery(
      "select count(*)::int as n from clara.document_filings where document_id=$1 and client_id=$2 and retired_at is null",
      [doc, w.clients.A1],
    );
    assert.equal(cnt.rows[0].n, 1, `iter ${i}: expected exactly one active filing, found ${cnt.rows[0].n} (shape a.ok=${out.a.ok} b.ok=${out.b.ok})`);
  }
  noteLane(`0027 soak: ${N} runs, 0 skipped, outcome shapes = ${JSON.stringify(shapes)}`);
  assert.equal(deadlocks, 0, `${deadlocks}/${N} soak runs hit a real 40P01/40001 — the lock-order fix did not hold`);
});
