// 裁-17's ninth clara.list_review_queue row_kind, 'seeding_proposal', FROM ITS BIRTH TO ITS
// RETIREMENT. 0146_ninth_rowkind_seeding_proposal.sql added it; 0288_seeding_lane_retired.sql
// (#1012, owner ruling 2026-09-20 on #983) SPLICED IT OUT, because the prior-GL seeding lane it
// chased accepts no new work: `clara.create_seeding_batch`, `clara.tick_seeding_proposal` and
// `clara.decline_seeding_proposal` all answer a typed retirement now, so every such row pointed
// at a decision that can no longer be made, and the beta rule is that nothing un-actionable is
// shown.
//
// WHAT THIS FILE OWNS AFTER 0288. Exactly the two claims the retirement has to keep true:
//   (1) NO client produces a `seeding_proposal` row — not one with open proposals in an OPEN
//       batch (the state that used to chase), and not one with none at all.
//   (2) EVERY OTHER row kind is untouched: the eight survivors this file's own fixtures can
//       produce are each OBSERVED by name, at the FULL 33-key row shape, and the three columns
//       the retired CTE alone ever populated
//       (client_name / batch_ids / open_proposal_count) are now null on EVERY row — the named
//       residual 0288 §C records rather than recutting ten CTEs to drop three dead columns.
//
// WHAT THIS FILE NO LONGER OWNS, AND WHY, rather than silently dropped:
//   · The 0/1/2-client aggregation differential (batch_ids across two open batches,
//     open_proposal_count, aged_since, the active-OR-onboarding admitted set). Every one of
//     those described the SHAPE of a row that is no longer emitted. What survives of that cell
//     is its negative half, kept below as cell (1).
//   · MED-2's "stranded rows" cell (a proposal left 'proposed' by a cancelled or completed
//     batch must not chase). Its whole subject was a row appearing for one batch state and not
//     another; with no row for any state, the distinction has nothing to sit on. That a batch
//     left open at the retirement can still be CANCELLED or COMPLETED — the part of MED-2 that
//     is still a live promise — is proven by seeding-lane-retired.test.mjs's own closer cell,
//     through the real doors.
//   · The cross-firm isolation cell (firm B never sees firm A's seeding row). There is no such
//     row in any firm's envelope any more, so the cell could only ever pass vacuously.
//
// HISTORY IS PLANTED, NOT MINTED: after 0288 no door can create a seeding batch, so the
// pre-retirement state cell (1) reads is planted by root INSERT. Every ASSERTION still runs
// through the real read under a real per-role session.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, noteLane, rootQuery, humanQuery,
  buildWaveBWorld, onboardingClient,
  filedDocument, setDocumentKind, proposalRows, batchRow,
} from "./wave-b/wb-fixtures.mjs";
import { listReviewQueue, humanPersona } from "./wave-a-reads.mjs";
import { seedCitedDocument, freshResolution, draftEntryV3, billLines, ev, FIELD, openQuestion } from "./wave-a-fixtures.mjs";
import { advWorld, freshAdvClient, disburse, mon, dayIn, x42EnsureReady } from "./x42-adv-world.mjs";

const EXPECTED_CELLS = 2;
let live = false;
let executed = 0;
let w = null;

// The full, exact 33-key shape every clara.list_review_queue row carries. Sourced from the LIVE
// json builder, never re-typed by hand from a migration's first text. 0288 does NOT move it:
// the three seeding-only keys stay in the envelope and are null everywhere (0288 §C's named
// residual). work-question-reads.test.mjs keeps its own independent copy of this roster on
// purpose — two restatements that a wrong edit cannot move together in silence.
const FULL_ROW_KEYS = [
  "row_kind", "section", "sort", "client_id", "counterparty_id", "filing_id",
  "entry_id", "question_id", "task_id", "document_id", "lane", "auto",
  "rule_backed", "high_stakes", "aged_since", "amount_cents", "period",
  "question_text", "created_at", "id", "coding_kind", "watch_id", "tier",
  "finding_id", "asset_id", "advance_id", "autodraft",
  "client_name", "batch_ids", "open_proposal_count",
  // #974 (0260): authority_id, gated exactly like asset_id/advance_id (derived from the
  // shared `id` at json-build time) — present, usually null, on EVERY row.
  "authority_id",
  // #942 (0304): accrual_side and accrual_plan_status, gated exactly like authority_id above —
  // both are derived from the shared `id` at json-build time, so they are PRESENT, and null, on
  // EVERY row; only an accrual_bill_conflict row carries a value. The envelope therefore went
  // 31 -> 33 keys estate-wide.
  "accrual_side", "accrual_plan_status",
].sort();

/** clara.list_review_queue still emits TEN row kinds after 0288 spliced the eleventh out. These
 *  are the EIGHT this file's own fixtures can produce — exactly the eight the cell below
 *  observed before the retirement, minus the seeding row itself. The other two survivors have
 *  their own dedicated batteries and their own producers: `work_question`
 *  (work-question-reads.test.mjs, #629/0180) and `depreciation_authority_pending`
 *  (depreciation-authority-pending-rowkind.test.mjs, #974/0260). */
const OBSERVED_SURVIVING_ROW_KINDS = [
  "draft", "uncoded_filing", "open_question", "coding_task", "compliance_watch",
  "lint_finding", "fixed_asset_incomplete", "staff_advance_incomplete",
];

async function priorGlDoc(sub, { firm, client }) {
  const doc = await filedDocument(sub, { firm, client, kind: null });
  await setDocumentKind(sub, { document: doc.documentId, kind: "prior_gl", reason: "0288 retirement rig fixture" });
  return doc;
}

function rowsOfKind(envelope, kind) {
  return allRows(envelope).filter((r) => r.row_kind === kind);
}
function allRows(envelope) {
  const out = [];
  (function walk(n) {
    if (n == null || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.row_kind) out.push(n);
    Object.values(n).forEach(walk);
  })(envelope);
  return out;
}

/** True iff 0288 §C is applied: the live body no longer projects the row kind. */
async function queueSpliceApplied() {
  const r = await rootQuery(
    `select position('''seeding_proposal''::text row_kind' in prosrc) = 0 as spliced
       from pg_proc where oid = 'clara.list_review_queue(jsonb,jsonb,integer)'::regprocedure`);
  return r.rows[0].spliced === true;
}

before(async () => {
  live = await queueSpliceApplied();
  if (live) w = await buildWaveBWorld();
});
after(async () => {
  printLaneNotes("ninth-rowkind-seeding-proposal");
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_SEEDING_LANE_RETIRED === "1") {
    console.warn("SKIP ninth-rowkind-seeding-proposal: 0288's queue splice is not applied (explicit pre-integration run).");
    t.skip("0288 queue splice absent -- explicit pre-integration run");
    return true;
  }
  assert.fail("0288_seeding_lane_retired.sql's queue splice is required for a focused run: apply it");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    await fn(t);
    executed += 1;
  });
}

cell("0288: NO client produces a seeding_proposal row — not one carrying open proposals in an OPEN batch, not one with none", async () => {
  const { users, firms } = w;

  // Client ZERO: no seeding batch at all (the control that was always rowless).
  const zero = await onboardingClient(users.alice);

  // Client ONE: the state that USED to chase — an OPEN batch carrying two OPEN proposals,
  // planted because no door can mint one any more.
  const one = await onboardingClient(users.alice);
  const doc = await priorGlDoc(users.alice, { firm: firms.A, client: one.client });
  const b = await rootQuery(
    `insert into clara.seeding_batches(firm_id, client_id, source_document_id, source_sha256, state, stats)
       values ($1, $2, $3::uuid, $4, 'open',
               jsonb_build_object('proposal_count', 2, 'refused_count', 0, 'source_document_id', $3::uuid))
     returning id`,
    [firms.A, one.client, doc.documentId, doc.sha256]);
  const batch = b.rows[0].id;
  for (const key of ["wf:one-a", "wf:one-b"]) {
    await rootQuery(
      `insert into clara.seeding_proposals(batch_id, firm_id, client_id, proposal_kind, proposal_key,
           payload, evidence, state)
         values ($1, $2, $3, 'wiki_fact', $4,
                 '{"slug":"profile","fact":"Client trades as a hardware wholesaler."}'::jsonb,
                 '{"prior_gl_lines":[1]}'::jsonb, 'proposed')`,
      [batch, firms.A, one.client, key]);
  }
  assert.equal((await batchRow(batch)).state, "open", "mandatory setup: the owning batch is OPEN");
  assert.equal(
    (await proposalRows(batch)).filter((p) => p.state === "proposed").length, 2,
    "mandatory setup: client ONE carries TWO open proposals — the exact state 0146's CTE chased");

  // A POSITIVE CONTROL so an empty result cannot be an envelope that returned nothing.
  await openQuestion(users.alice, { client: w.clients.A1, scopeKind: "client", scopeId: w.clients.A1 })
    .catch((e) => noteLane(`0288 control openQuestion setup: ${e.code ?? e.message}`));

  const firmWide = await listReviewQueue(humanPersona(users.alice), { scope: {}, limit: 500 });
  assert.ok(allRows(firmWide).length > 0, "positive control: the firm-wide envelope carries rows");
  assert.equal(rowsOfKind(firmWide, "seeding_proposal").length, 0,
    "the firm-wide queue emits NO seeding_proposal row for ANY client");

  for (const [label, client] of [["ZERO", zero.client], ["ONE", one.client]]) {
    const scoped = await listReviewQueue(humanPersona(users.alice), { scope: { client_id: client }, limit: 500 });
    assert.equal(rowsOfKind(scoped, "seeding_proposal").length, 0,
      `client ${label}'s own scoped queue emits NO seeding_proposal row`);
  }

  // The lane's history is still there — the retirement stops the chase, it deletes nothing.
  assert.equal((await proposalRows(batch)).length, 2, "both proposals are still readable after the splice");

  noteLane("0288: the seeding_proposal row kind is gone for every client, firm-wide and client-scoped, while its proposals stay readable");
});

cell("0288: the surviving row_kinds are untouched — the EIGHT this file can produce are each OBSERVED by name at the FULL 33-key shape, with the three seeding-only columns now null on EVERY row", async () => {
  const { users, firms, clients } = w;
  const seen = {};
  const need = (kind) => { assert.ok(seen[kind], `row_kind='${kind}' never landed in ANY envelope this cell read — every surviving kind must be OBSERVED, not merely possible`); };
  const med3Client = clients.A1;

  // 1) open_question
  await openQuestion(users.alice, { client: med3Client, scopeKind: "client", scopeId: med3Client })
    .catch((e) => noteLane(`surviving-kinds openQuestion setup: ${e.code ?? e.message}`));

  // 2) draft — a real cited bill using buildWaveBWorld's OWN control accounts.
  const { WB_COA } = await import("./wave-b/wb-fixtures.mjs");
  const cited = await seedCitedDocument(users.alice, { firm: firms.A, client: med3Client, quote: "RM 700.00" });
  await draftEntryV3(users.alice, {
    client: med3Client,
    resolution: await freshResolution(users.alice, med3Client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256,
    lines: billLines(WB_COA.faExp, WB_COA.apCtl, 70000),
    vendor: { new: { name: "MED3 DRAFT VENDOR SDN BHD", registration_no: "202301019999" } },
    evidence: [ev(cited.regionId, cited.quote, FIELD.total)],
    opKey: opk("med3draft"),
  });

  // 3) uncoded_filing + 4) coding_task — one plain filed document, never drafted.
  const ctDoc = await filedDocument(users.alice, { firm: firms.A, client: med3Client, kind: null });
  await humanQuery(
    users.alice,
    "select clara.open_coding_task(p_client => $1, p_document => $2, p_filing => $3, p_reason => $4, p_op_key => $5) as r",
    [med3Client, ctDoc.documentId, ctDoc.filingId, "surviving-kinds rig probe", opk("med3ct")],
  );

  // 5) compliance_watch, 6) lint_finding, 7) fixed_asset_incomplete — direct state seeding into
  // the real tables clara.list_review_queue itself reads; each kind's own behaviour has its own
  // dedicated battery elsewhere, and what THIS cell proves is the SHAPE.
  await rootQuery(
    `insert into clara.compliance_watches(firm_id, client_id, service_group, watch_kind, state)
     values ($1, $2, 'digital_services', 'sst_registration', 'crossed')`,
    [firms.A, med3Client],
  );
  await rootQuery(
    `insert into clara.lint_findings(firm_id, client_id, finding_kind, dedupe_key, severity, state)
     values ($1, $2, 'stale_claim', 'med3-rig-probe', 'critical', 'open')`,
    [firms.A, med3Client],
  );
  await rootQuery(
    `insert into clara.fixed_assets(firm_id, client_id, description, cost_cents, status)
     values ($1, $2, 'surviving-kinds rig probe fixed asset (particulars pending)', 500000, 'active')`,
    [firms.A, med3Client],
  );

  // 8) staff_advance_incomplete — the x42 world's own real door chain.
  await x42EnsureReady();
  const aw = await advWorld();
  const { client: advClient } = await freshAdvClient("med3");
  await disburse({ client: advClient, cents: 42_000, postingDate: dayIn(mon(-1), 10) });

  const rows = [
    ...allRows(await listReviewQueue(humanPersona(users.alice), { scope: {}, limit: 500 })),
    ...allRows(await listReviewQueue(humanPersona(aw.users.alice), { scope: { client_id: advClient }, limit: 500 })),
  ];
  assert.ok(rows.length > 0, "mandatory setup: at least one row was read back");

  for (const row of rows) {
    seen[row.row_kind] = true;
    assert.notEqual(row.row_kind, "seeding_proposal",
      "no envelope may carry a seeding_proposal row after 0288");
    assert.deepEqual(
      [...Object.keys(row)].sort(), FULL_ROW_KEYS,
      `row_kind='${row.row_kind}' (id=${row.id}) carries a DIFFERENT key set than the pinned 33-key shape — a key was added, dropped or renamed (got ${JSON.stringify([...Object.keys(row)].sort())})`,
    );
    // 0288 §C's named residual, asserted rather than assumed: the three columns the retired CTE
    // alone ever populated are now null EVERYWHERE, on every kind, in every envelope.
    assert.equal(row.client_name, null, `row_kind='${row.row_kind}' must carry client_name=null after 0288`);
    assert.equal(row.batch_ids, null, `row_kind='${row.row_kind}' must carry batch_ids=null after 0288`);
    assert.equal(row.open_proposal_count, null, `row_kind='${row.row_kind}' must carry open_proposal_count=null after 0288`);
  }

  for (const kind of OBSERVED_SURVIVING_ROW_KINDS) need(kind);
  noteLane(`0288: surviving row_kinds observed and shape-checked = ${Object.keys(seen).sort().join(",")}`);
});
