// #654 — FIRM-WIDE KNOWLEDGE DEFAULTS WITH PRESERVED CLIENT EXCEPTIONS.
// Migration: 0205_firm_knowledge_defaults.sql. Every cell gates on the LIVE CATALOG, never on the
// migration number (knowledge-firm-fixtures.mjs `knowledgeFirmCohortApplied`).
//
// WHAT THESE CELLS ARE FOR. #654's acceptance criteria are three claims about what the database
// REFUSES and one about what it keeps:
//   AC1 — only an eligible key, promoted by somebody who holds the authority, becomes a firm
//         default; an established client exception survives it; one client's private evidence
//         never travels with the rule. Cells 1-5 provoke each wall.
//   AC2 — the promotion act records scope, actor, applicability, effective window and reason, and
//         the new applicability read says which row is in force FOR THIS CLIENT and why. Cells
//         6, 7, 10 and 13.
//   AC4 — current permission, revoked membership, cross-client evidence and independent client
//         overrides, plus the negative census "a firm preference is not a posting grant nor plan
//         authority". Cells 3, 6, 7, 8, 9 and 11.
//
// EVERY ASSERTION UNDER TEST RUNS THROUGH `humanQuery` AT THE LEAST PRIVILEGE THAT SHOULD SUCCEED
// (DECISIONS §1.10). `rootQuery` appears only to MINT a world or to READ BACK a table for a
// "no row landed" count — never as the caller of the act a cell is about.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import {
  assertRaises, endPool, freshResolution, getPool, humanQuery, roleQuery, rootQuery, opk, ROLES,
} from "./rig-fixtures.mjs";
import { knowledgeWorld, committedPlan } from "./knowledge-fixtures.mjs";
import {
  deactivateMembership, evidenceViolators, fileDocument, fileDocumentPre0205, firmDocument,
  knowledgeFirmCohortApplied, liveWork, retireFiling,
} from "./knowledge-firm-fixtures.mjs";

const EXPECTED_CELLS = 21;
let live = false;
let executed = 0;

before(async () => { live = await knowledgeFirmCohortApplied(); });
after(async () => {
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_KNOWLEDGE_FIRM_0205 === "1") {
    console.warn("SKIP knowledge-firm-defaults: the 0205 cohort is not applied (explicit pre-integration run).");
    t.skip("firm-default cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail("the 0205 firm-default cohort is required for a focused run: apply 0205_firm_knowledge_defaults.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

// ---------------------------------------------------------------------------------------------
// Door wrappers. Named args throughout (the rig's signature strategy), the same shapes
// knowledge-records.test.mjs uses so the two batteries cannot drift into two dialects.
// ---------------------------------------------------------------------------------------------
const CAPTURE = `select clara.capture_knowledge(
  p_knowledge_key => $1, p_value => $2::jsonb, p_basis => $3, p_op_key => $4,
  p_scope_kind => $5, p_client => $6, p_source_kind => $7, p_applies_when => $8::jsonb,
  p_effective_from => $9::date, p_effective_to => $10::date, p_source => $11::jsonb) as r`;

function capture(sub, o) {
  return humanQuery(sub, CAPTURE, [
    o.key, JSON.stringify(o.value), o.basis ?? "rig basis", o.opKey ?? opk("p654"),
    o.scope ?? "client", o.client ?? null, o.sourceKind ?? "user_statement",
    JSON.stringify(o.appliesWhen ?? {}), o.from ?? null, o.to ?? null,
    JSON.stringify(o.source ?? {}),
  ]).then((r) => r.rows[0].r);
}

const captureFor = (o) =>
  roleQuery(ROLES.runtime,
    `select clara.capture_knowledge_for(
       p_asserted_by => $1, p_client => $2, p_knowledge_key => $3, p_value => $4::jsonb,
       p_basis => $5, p_op_key => $6) as r`,
    [o.assertedBy, o.client, o.key, JSON.stringify(o.value), o.basis ?? "rig basis", o.opKey ?? opk("p654")],
  ).then((r) => r.rows[0].r);

const listClientKnowledge = (sub, client) =>
  humanQuery(sub, "select clara.list_client_knowledge(p_client => $1) as r", [client])
    .then((r) => r.rows[0].r);

const listFirmKnowledge = (sub) =>
  humanQuery(sub, "select clara.list_firm_knowledge() as r", [])
    .then((r) => r.rows[0].r);

const applicability = (sub, client, key) =>
  humanQuery(sub,
    "select clara.get_knowledge_applicability(p_client => $1, p_knowledge_key => $2) as r",
    [client, key]).then((r) => r.rows[0].r);

const packAs = (firm, client, purpose = "wiki_coding") =>
  roleQuery(ROLES.runtime,
    "select clara.get_knowledge_pack(p_client => $1, p_purpose => $2, p_firm => $3) as r",
    [client, purpose, firm]).then((r) => r.rows[0].r);

const promoteAsHuman = (sub, plan, firmScope) =>
  humanQuery(sub,
    `select clara.promote_plan_answers_to_knowledge(
       p_plan => $1, p_op_key => $2, p_promote_firm_scope => $3) as r`,
    [plan, opk("p654"), firmScope === true]).then((r) => r.rows[0].r);

const reasonOf = (err) => {
  try { return JSON.parse(err.detail ?? "{}").reason ?? null; } catch { return null; }
};

const firmRowCount = async (firm) =>
  (await rootQuery(
    "select count(*)::int as n from clara.knowledge_records where firm_id = $1 and scope_kind = 'firm'",
    [firm])).rows[0].n;

const withdraw = (sub, record, reason) =>
  humanQuery(sub,
    "select clara.withdraw_knowledge(p_record => $1, p_reason => $2, p_op_key => $3) as r",
    [record, reason, opk("p654")]).then((r) => r.rows[0].r);

const liveFilings = async (document) =>
  (await rootQuery(
    "select count(*)::int as n from clara.document_filings where document_id = $1 and retired_at is null",
    [document])).rows[0].n;

/** The admitted set, DERIVED the way the trigger derives it — seeded rows UNION the by-kind arm.
 *  A cell asserts against this rather than against a re-typed list, so the census and the wall
 *  cannot disagree by a transcription. */
const admittedKeys = async () =>
  (await rootQuery(
    `select k.knowledge_key from clara.knowledge_keys k
      where exists (select 1 from clara.knowledge_key_firm_eligibility e
                     where e.knowledge_key = k.knowledge_key)
         or k.kind in ('preference','policy')
      order by 1`)).rows.map((r) => r.knowledge_key);

// =============================================================================================
// SEAM 1 — ELIGIBILITY. `knowledge_keys.scope_default` is a dead column (0192:167/208/224, three
// writes, zero reads) and 0192 therefore admits ANY key at firm scope. D8 says a client-identity
// fact is never a firm default; the wall is a NEW relation, fail-closed, because
// `knowledge_keys` is append-only on UPDATE (0192:185-186) and cannot be re-defaulted.
// =============================================================================================

cell("p654.eligibility.refuses_client_key — a client-identity key cannot become a firm default, and no row lands", async () => {
  const w = await knowledgeWorld("p654e1");
  // An A5/A6 interview assertion about THIS client's own constitution.
  const fye = await assertRaises("CLR10", () => capture(w.admin, {
    key: "financial_year_end_month", scope: "firm", client: null, value: 12,
    basis: "the partner wants every client closed in December",
  }), "capture_knowledge(firm, financial_year_end_month)");
  assert.equal(reasonOf(fye), "knowledge_scope_not_firm_defaultable");

  // …and one of the five CARRIED LEGACY assertion keys (0192:206-217), at the OWNER rank its own
  // catalog floor demands, so the refusal cannot be mistaken for the authority floor.
  const legacy = await assertRaises("CLR10", () => capture(w.owner, {
    key: "customer_identity_policy", scope: "firm", client: null, value: "name_only",
    basis: "the firm's standing identity posture",
  }), "capture_knowledge(firm, customer_identity_policy)");
  assert.equal(reasonOf(legacy), "knowledge_scope_not_firm_defaultable");

  assert.equal(await firmRowCount(w.firm), 0, "a refused firm-scope capture left a row behind");
});

cell("p654.eligibility.admits_seeded — the three seeded keys are firm-defaultable and land", async () => {
  const w = await knowledgeWorld("p654e2");
  const r = await capture(w.admin, {
    key: "default_currency", scope: "firm", client: null, value: "MYR",
    basis: "the firm presents in ringgit unless a client says otherwise",
  });
  assert.equal(r.status, "captured");
  assert.equal(r.scope_kind, "firm");
  assert.equal(r.client_id, null);

  const seeded = (await rootQuery(
    "select knowledge_key from clara.knowledge_key_firm_eligibility order by 1")).rows.map((x) => x.knowledge_key);
  assert.deepEqual(seeded, ["accounting_basis", "default_currency", "reporting_framework"],
    "the seeded eligible set is not the three keys D8 named");
});

cell("p654.eligibility.admits_by_kind — a preference or a policy key is eligible by KIND, and the admitted census is exactly what the wall admits", async () => {
  const w = await knowledgeWorld("p654e3");
  // `reporting_framework` is a POLICY key and is BOTH seeded and kind-eligible.
  const policy = await capture(w.admin, {
    key: "reporting_framework", scope: "firm", client: null,
    value: { framework_code: "MPERS", framework_label: "Malaysian Private Entities Reporting Standard" },
    basis: "the firm prepares MPERS accounts unless a client's own framework says otherwise",
  });
  assert.equal(policy.status, "captured");
  // …and `coa_seed_decision` is admitted by the BY-KIND arm ALONE (a `preference`, never seeded).
  const pref = await capture(w.admin, {
    key: "coa_seed_decision", scope: "firm", client: null, value: { seed: "lhdn_mpers_standard" },
    basis: "the firm seeds the LHDN/MPERS chart unless a client asks for a manual one",
  });
  assert.equal(pref.status, "captured");

  const admitted = await admittedKeys();
  assert.deepEqual(admitted,
    ["accounting_basis", "coa_seed_decision", "default_currency", "reporting_framework"],
    "the admitted census moved -- re-measure it and re-print it in 0205's tail");

  // EVERY OTHER CATALOG KEY IS REFUSED, one by one, so "fail-closed" is measured rather than
  // asserted. The nine are the five carried legacy keys plus turnover_band,
  // financial_year_end_month, sst_regime and mpers_eligibility.
  //
  // EACH PROBE CARRIES A VALUE THE CATALOG WOULD ACCEPT, derived from `value_shape` /
  // `allowed_values` / `validated_against` rather than a constant: `clara._knowledge_assert_value`
  // runs BEFORE the insert (0192:1188 inside the capture core), so a probe with the wrong shape
  // would be refused `knowledge_value_invalid` and prove nothing at all about the scope wall.
  const catalog = (await rootQuery(
    "select knowledge_key, value_shape, allowed_values, validated_against from clara.knowledge_keys order by 1")).rows;
  const probeValue = (row) => {
    if (Array.isArray(row.allowed_values) && row.allowed_values.length > 0) return row.allowed_values[0];
    if (row.validated_against === "range:month_1_12") return 6;
    if (row.validated_against === "format_only") return "46900"; // msic: five digits (0192:696-706)
    if (row.value_shape === "object") return { determination: "eligible", test: "rig" };
    if (row.value_shape === "number") return 1;
    if (row.value_shape === "boolean") return true;
    return "rig";
  };
  const refused = catalog.filter((row) => !admitted.includes(row.knowledge_key));
  assert.equal(refused.length, 9,
    `expected 9 refused keys, got ${refused.length}: ${refused.map((x) => x.knowledge_key).join(", ")}`);
  for (const row of refused) {
    const err = await assertRaises("CLR10", () => capture(w.owner, {
      key: row.knowledge_key, scope: "firm", client: null, value: probeValue(row),
      basis: `the firm's standing position on ${row.knowledge_key}`,
    }), `capture_knowledge(firm, ${row.knowledge_key})`);
    assert.equal(reasonOf(err), "knowledge_scope_not_firm_defaultable",
      `${row.knowledge_key} was refused for the wrong reason (${reasonOf(err)}): ${err.message}`);
  }
  assert.equal(await firmRowCount(w.firm), 2, "only the two admitted captures above may have landed");
});

// =============================================================================================
// SEAM 2 — THE CROSS-CLIENT EVIDENCE WALL. `clara._knowledge_source_pins` checks firm congruence
// ONLY (0192:782-784), so before 0205 a firm-wide rule could pin client A's FILED document and
// carry that pin into every other client's register and model pack. `uq_document_filing_active`
// is over `(document_id, client_id) where retired_at is null` (0007:92-94), so the refusal and
// its grandfather census are written against N live filings, never one.
// =============================================================================================

cell("p654.evidence.refuses_filed_document — a firm default may not pin a document with ANY live client filing, at N=1 and at N>1", async () => {
  const w = await knowledgeWorld("p654v1");
  const doc = await firmDocument(w.firm, w.admin, "p654v1");
  await fileDocument(w.firm, doc, w.clientA, w.admin);

  const one = await assertRaises("CLR10", () => capture(w.admin, {
    key: "default_currency", scope: "firm", client: null, value: "SGD",
    basis: "read off a client's own engagement letter", source: { document_id: doc },
  }), "firm capture pinning a document with ONE live filing");
  assert.equal(reasonOf(one), "firm_scope_client_evidence");
  assert.equal(await firmRowCount(w.firm), 0, "a refused firm capture left a row behind");

  // …and the SAME document filed to a SECOND client. One document, two live filings.
  await fileDocument(w.firm, doc, w.clientB, w.admin);
  const n = (await rootQuery(
    "select count(*)::int as n from clara.document_filings where document_id = $1 and retired_at is null",
    [doc])).rows[0].n;
  assert.equal(n, 2, "the fixture must hold TWO live filings for the N>1 arm to mean anything");

  const many = await assertRaises("CLR10", () => capture(w.admin, {
    key: "default_currency", scope: "firm", client: null, value: "SGD",
    basis: "read off a document two clients are filed against", source: { document_id: doc },
  }), "firm capture pinning a document with TWO live filings");
  assert.equal(reasonOf(many), "firm_scope_client_evidence");
  assert.equal(await firmRowCount(w.firm), 0, "a refused firm capture left a row behind");

  // THE CLIENT LANE IS UNTOUCHED: the same pin is exactly what a client-scope record is FOR.
  const clientOk = await capture(w.bookkeeper, {
    key: "default_currency", client: w.clientA, value: "SGD",
    basis: "the client's own engagement letter", source: { document_id: doc },
  });
  assert.equal(clientOk.status, "captured", "the evidence wall must not touch the client lane");
});

cell("p654.evidence.admits_unfiled_firm_document — the source 0192 reserves for a firm rule stays admissible", async () => {
  const w = await knowledgeWorld("p654v2");
  const doc = await firmDocument(w.firm, w.admin, "p654v2");
  // 0192:871-874 states it in its own voice: "a knowledge source may legitimately be an unfiled
  // firm document". This cell is that sentence, executed.
  const r = await capture(w.admin, {
    key: "accounting_basis", scope: "firm", client: null,
    value: { accounting_basis: "accrual", accounting_basis_label: "Accrual" },
    basis: "the firm's own accounting manual, held as a firm document",
    source: { document_id: doc },
  });
  assert.equal(r.status, "captured");
  const row = await rootQuery(
    "select source_document_id from clara.knowledge_records where id = $1", [r.revision_id]);
  assert.equal(row.rows[0].source_document_id, doc, "the unfiled firm document was not pinned");

  // …AND THE OTHER DIRECTION, which this battery used to pin as intended behaviour and which
  // fix round 1 (adversarial finding 654-ADV-1) corrected: while a LIVE firm rule cites this
  // document, it may no longer be FILED to a client at all. Filing it afterwards was the
  // contamination route the INSERT wall could not see — one client's document and basis text
  // travelling into every other client's runtime pack, with the same wall then refusing the
  // retraction that would have removed it.
  const blocked = await assertRaises("CLR10", () => fileDocument(w.firm, doc, w.clientA, w.admin),
    "filing a document that a live firm-scope rule cites");
  assert.equal(reasonOf(blocked), "document_cited_by_firm_default");
  assert.equal(await liveFilings(doc), 0, "a refused filing left a row behind");

  // …and the refusal names its own remedy rather than trapping the human: withdraw the firm rule
  // first, and the filing lands.
  await withdraw(w.admin, r.record_id, "the manual turned out to belong to one client");
  const filing = await fileDocument(w.firm, doc, w.clientA, w.admin);
  assert.equal(await liveFilings(doc), 1);

  // …and NOW the INSERT wall is what refuses the next firm-scope record naming it, which is what
  // makes the pair symmetrical rather than one-way.
  const err = await assertRaises("CLR10", () => capture(w.admin, {
    key: "default_currency", scope: "firm", client: null, value: "MYR",
    basis: "the same manual, now filed against a client", source: { document_id: doc },
  }), "firm capture after the document was filed");
  assert.equal(reasonOf(err), "firm_scope_client_evidence");

  // …and RETIRING the filing makes it admissible again: the predicate is `retired_at is null`.
  await retireFiling(filing, w.admin);
  const again = await capture(w.admin, {
    key: "default_currency", scope: "firm", client: null, value: "MYR",
    basis: "the manual, after the filing was retired", source: { document_id: doc },
  });
  assert.equal(again.status, "captured");
  assert.deepEqual(await evidenceViolators(w.firm), { documents: 0, works: 0 },
    "the runtime form of 0205 §0(8)/§E T.4: no LIVE firm-scope row may cite a filed document or a client's Work");
});

// ---------------------------------------------------------------------------------------------
// FIX ROUND 1 — 654-ADV-1 (blocker) and 654-ADV-2 (should). The wall as first shipped inspected
// `source_document_id` on INSERT into clara.knowledge_records and nothing else, so it was ONE-WAY
// (file the document after the rule cited it and the contamination lands anyway, with the
// retraction refused by the same trigger) and covered ONE of the two client-bearing pins
// (`source_work_id` rode straight through).
// ---------------------------------------------------------------------------------------------

cell("p654.evidence.retraction_survives_contamination — a firm rule whose document became filed can still be corrected and withdrawn", async () => {
  const w = await knowledgeWorld("p654v3");
  const doc = await firmDocument(w.firm, w.admin, "p654v3");
  const rule = await capture(w.admin, {
    key: "accounting_basis", scope: "firm", client: null,
    value: { accounting_basis: "accrual", accounting_basis_label: "Accrual" },
    basis: "the firm's own accounting manual, held as a firm document",
    source: { document_id: doc },
  });
  assert.equal(rule.status, "captured");

  // THE ONLY WAY TO REACH THIS STATE IS TO BYPASS THE FILING WALL, which is exactly what a
  // database PREDATING 0205 is: rows captured before either trigger existed. The escape hatch
  // below is for them, and a cell that could not manufacture one would be asserting nothing.
  const filing = await fileDocumentPre0205(w.firm, doc, w.clientA, w.admin);
  assert.equal(await liveFilings(doc), 1, "the legacy filing did not land");

  // A CORRECTION that introduces no new pin is admissible…
  const corrected = await humanQuery(w.admin,
    `select clara.correct_knowledge(p_record => $1, p_value => $2::jsonb, p_reason => $3,
        p_op_key => $4) as r`,
    [rule.record_id, JSON.stringify({ accounting_basis: "cash", accounting_basis_label: "Cash" }),
      "the manual says cash", opk("p654")]).then((x) => x.rows[0].r);
  assert.equal(corrected.status, "corrected");

  // …and so is the WITHDRAWAL, which is the only remedy that actually removes the contamination.
  const gone = await withdraw(w.admin, rule.record_id, "this belongs to one client, not the firm");
  assert.equal(gone.status, "withdrawn");
  const revisions = (await rootQuery(
    "select revision_n, state, revision_kind from clara.knowledge_records where record_id = $1 order by revision_n",
    [rule.record_id])).rows;
  assert.deepEqual(revisions.map((x) => [x.revision_n, x.revision_kind, x.state]),
    [[1, "capture", "superseded"], [2, "correction", "superseded"], [3, "withdrawal", "withdrawn"]],
    "a contaminated firm rule must never be stuck live");

  // THE SKIP IS NARROW: it admits a retraction that carries the SAME pins, never one that
  // introduces a new contaminated pin. A correction naming a DIFFERENT filed document is refused.
  const rule2 = await capture(w.admin, {
    key: "default_currency", scope: "firm", client: null, value: "MYR",
    basis: "the firm presents in ringgit",
  });
  const otherDoc = await firmDocument(w.firm, w.admin, "p654v3b");
  await fileDocumentPre0205(w.firm, otherDoc, w.clientB, w.admin);
  const refused = await assertRaises("CLR10", () => humanQuery(w.admin,
    `select clara.correct_knowledge(p_record => $1, p_value => $2::jsonb, p_reason => $3,
        p_op_key => $4, p_source_kind => 'user_statement', p_source => $5::jsonb) as r`,
    [rule2.record_id, JSON.stringify("SGD"), "re-sourced onto a client's document", opk("p654"),
      JSON.stringify({ document_id: otherDoc })]),
  "correction re-pinning a firm rule onto a filed document");
  assert.equal(reasonOf(refused), "firm_scope_client_evidence");

  // Leave the rig the way 0205's own prestate expects to find it.
  await retireFiling(filing, w.admin);
  await rootQuery(
    `update clara.document_filings set retired_at = now(), retired_by = $2,
        retirement_reason = 'p654 rig retirement' where document_id = $1 and retired_at is null`,
    [otherDoc, w.admin]);
  assert.deepEqual(await evidenceViolators(w.firm), { documents: 0, works: 0 });
});

cell("p654.evidence.refuses_client_work — a firm-wide default may not pin a client's accounting_work either", async () => {
  const w = await knowledgeWorld("p654v4");
  const work = await liveWork(w.firm, w.clientA, w.bookkeeper);
  // `clara.accounting_work.client_id` is NOT NULL (measured off information_schema), so EVERY
  // Work belongs to exactly one client and no firm-scope record may cite one at all. Before the
  // fix round, `clara._knowledge_source_pins` checked only firm congruence (0192:799-802) and
  // `clara._knowledge_row_json` emitted the pin (0192:1022-1024) into every other client's pack.
  const err = await assertRaises("CLR10", () => capture(w.admin, {
    key: "default_currency", scope: "firm", client: null, value: "SGD",
    basis: "a conclusion reached inside one client's Work", source: { work_id: work },
  }), "firm capture pinning a client's accounting_work");
  assert.equal(reasonOf(err), "firm_scope_client_work");
  assert.equal(await firmRowCount(w.firm), 0, "a refused firm capture left a row behind");

  // THE CLIENT LANE IS UNTOUCHED: a Work pin is exactly what a client-scope record is for, and
  // it is the only link the firm register's live-Work affordance has to derive from.
  const ok = await capture(w.bookkeeper, {
    key: "default_currency", client: w.clientA, value: "SGD",
    basis: "decided inside this client's own Work", source: { work_id: work },
  });
  assert.equal(ok.status, "captured");
  assert.deepEqual(await evidenceViolators(w.firm), { documents: 0, works: 0 });
});

// ---------------------------------------------------------------------------------------------
// FIX ROUND 2 — 654-RC1. The two halves of the evidence wall are BEFORE-row triggers that each
// read the OTHER table, so a sequential act is refused by whichever half runs second — but two
// CONCURRENT transactions under READ COMMITTED each take a snapshot in which the other's row does
// not exist yet, and both commit. That is exactly the state 0205 §0(8) refuses to apply against
// and §E T.4 asserts is zero, reached with both guards installed. This cell stages the race in
// BOTH arrival orders and through BOTH filing paths.
//
// WHY BOTH FILING PATHS. `clara._file_document_write` takes `select ... from clara.documents
// where id = p_document for update` before it inserts the filing (measured off pg_proc on the
// rig), which INCIDENTALLY serialised one of the two orders before this round — the capture's own
// FK check on `(source_document_id, firm_id)` takes FOR KEY SHARE on the same row and conflicts.
// An invariant that holds only because another lane's body happens to take a row lock is an
// invariant nobody can state, so the raw-INSERT arms remove that row lock and prove the wall
// serialises on its OWN lock. (Both are real: the trigger is on the TABLE, and 0205's header says
// out loud that a guard on the table cannot be bypassed by a writer nobody has written yet.)
// ---------------------------------------------------------------------------------------------

const FILE_DOOR = `select clara.file_document(
  p_document => $1, p_client => $2, p_resolution => $3, p_op_key => $4) as r`;
const FILE_RAW = `insert into clara.document_filings(firm_id, document_id, client_id, filed_by, basis)
  values ($1,$2,$3,$4,'legacy-0007') returning id`;

/** ONE arrival order of the capture-vs-filing race, genuinely overlapping rather than serialised
 *  by luck: the leader's statement runs and is HELD UNCOMMITTED while the follower's statement is
 *  issued, and the follower is watched in `pg_stat_activity` until it is provably queued on a
 *  lock. The pooled helpers commit per call, so they cannot express a race at all
 *  (`p654.promote.race`'s own reason). */
async function evidenceRace(w, { first, filing }) {
  const tag = `${first}_${filing}`;
  const doc = await firmDocument(w.firm, w.admin, `p654r_${tag}`);
  const resolution = filing === "door"
    ? await freshResolution(w.admin, w.clientA, { subjectKind: "document", subjectId: doc })
    : null;
  const capConn = await getPool().connect();
  const fileConn = await getPool().connect();
  const out = { doc, waitedOn: null, followerSettledWhileLeaderOpen: null };
  try {
    const asAdmin = async (c) => {
      await c.query("set role clara_authenticated");
      await c.query("select set_config('request.jwt.claims', $1, false)",
        [JSON.stringify({ sub: w.admin, role: "authenticated" })]);
    };
    await asAdmin(capConn);
    // The RAW arm deliberately keeps the root role: it is the SAME table write with the filing
    // lane's own row lock removed, not a second door.
    if (filing === "door") await asAdmin(fileConn);

    const captureAct = () => capConn.query(CAPTURE, [
      "accounting_basis",
      JSON.stringify({ accounting_basis: "accrual", accounting_basis_label: "Accrual" }),
      `the firm's own manual (${tag})`, opk("p654race"), "firm", null, "user_statement",
      "{}", null, null, JSON.stringify({ document_id: doc }),
    ]);
    const fileAct = () => (filing === "door"
      ? fileConn.query(FILE_DOOR, [doc, w.clientA, resolution, opk("p654racefile")])
      : fileConn.query(FILE_RAW, [w.firm, doc, w.clientA, w.admin]));

    const leaderConn = first === "capture" ? capConn : fileConn;
    const followerConn = first === "capture" ? fileConn : capConn;
    const leadAct = first === "capture" ? captureAct : fileAct;
    const followAct = first === "capture" ? fileAct : captureAct;

    await capConn.query("begin");
    await fileConn.query("begin");
    out.leader = await leadAct().then(() => ({ ok: true }),
      (e) => ({ ok: false, code: e.code, detail: e.detail, message: e.message }));

    const pid = (await followerConn.query("select pg_backend_pid() as p")).rows[0].p;
    let settled = false;
    const pending = followAct().then(() => { settled = true; return { ok: true }; },
      (e) => { settled = true; return { ok: false, code: e.code, detail: e.detail, message: e.message }; });
    for (let i = 0; i < 400 && !settled && out.waitedOn === null; i += 1) {
      const s = await rootQuery(
        "select wait_event_type as wt, wait_event as we from pg_stat_activity where pid = $1", [pid]);
      if (s.rows[0]?.wt === "Lock") out.waitedOn = `${s.rows[0].wt}/${s.rows[0].we}`;
      if (out.waitedOn === null) await new Promise((x) => setTimeout(x, 25));
    }
    out.followerSettledWhileLeaderOpen = settled;
    await leaderConn.query("commit");
    out.follower = await pending;
    await followerConn.query("commit").catch(() => {});
  } finally {
    for (const c of [capConn, fileConn]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }
  out.violators = await evidenceViolators(w.firm);
  return out;
}

cell("p654.evidence.race_capture_vs_filing — the two halves of the wall serialise on the document, in BOTH arrival orders and with or without the filing lane's own row lock", async () => {
  // The refusal the LOSER must carry depends only on which act arrives second — the wall is
  // symmetrical, so each order is answered by its own half, by name.
  const expected = { capture: "document_cited_by_firm_default", file: "firm_scope_client_evidence" };
  const seen = {};

  for (const first of ["capture", "file"]) {
    for (const filing of ["door", "raw"]) {
      const where = `${first}-first / filing via ${filing}`;
      const w = await knowledgeWorld(`p654rc_${first}_${filing}`);
      const r = await evidenceRace(w, { first, filing });
      seen[where] = { waitedOn: r.waitedOn, follower: r.follower.code ?? "committed" };

      assert.equal(r.leader.ok, true,
        `${where}: the LEADER must succeed for the race to mean anything -- ${r.leader.message}`);
      assert.equal(r.followerSettledWhileLeaderOpen, false,
        `${where}: the second act resolved while the first was still OPEN -- nothing serialises the two guards, so both commit and the invariant "no LIVE firm-scope record may cite a document carrying a live client filing" is violable by two concurrent transactions`);
      assert.match(String(r.waitedOn), /^Lock\//,
        `${where}: the second act never queued on a lock (${r.waitedOn}) -- this arm would prove nothing about a race`);

      assert.equal(r.follower.ok, false, `${where}: BOTH acts committed -- the race produced the contamination`);
      assert.notEqual(r.follower.code, "40P01", `${where}: a deadlock is not a refusal -- ${r.follower.message}`);
      assert.equal(r.follower.code, "CLR10",
        `${where}: the loser must carry the wall's own refusal, got ${r.follower.code}: ${r.follower.message}`);
      assert.equal(reasonOf(r.follower), expected[first],
        `${where}: the loser must be refused BY NAME -- ${r.follower.message}`);

      assert.deepEqual(r.violators, { documents: 0, works: 0 },
        `${where}: the runtime form of 0205 §0(8)/§E T.4 is violated after the race`);
    }
  }
  console.log("      race arms:", JSON.stringify(seen));
});

// =============================================================================================
// SEAM 3 — THE CLIENT EXCEPTION SURVIVES. This is 0192's shipped behaviour (`uq_knowledge_live`
// over the applicability digest, 0192:512-514; the per-applicability shadow at :1350-1363 and
// :1510-1518) verified AT THE PROMOTION BOUNDARY, which is what #654 AC1 actually claims and
// what no cell covered: a firm default landing AFTER a client already holds one.
// =============================================================================================

cell("p654.exception.survives_promotion — the client that already held a row keeps it in BOTH reads; the one that did not reads the firm value", async () => {
  const w = await knowledgeWorld("p654x1");
  // Client A states its own position FIRST.
  const a = await capture(w.bookkeeper, {
    key: "default_currency", client: w.clientA, value: "USD",
    basis: "the client invoices in dollars and asked for dollar accounts",
  });
  assert.equal(a.status, "captured");

  // …and only then does the firm adopt a default.
  const firm = await capture(w.admin, {
    key: "default_currency", scope: "firm", client: null, value: "MYR",
    basis: "the firm presents in ringgit unless a client says otherwise",
  });
  assert.equal(firm.status, "captured");

  const regA = (await listClientKnowledge(w.viewer, w.clientA))
    .records.filter((r) => r.knowledge_key === "default_currency");
  assert.equal(regA.length, 1, `client A must see ONE row -- got ${JSON.stringify(regA.map((r) => [r.scope_kind, r.value]))}`);
  assert.equal(regA[0].scope_kind, "client");
  assert.equal(regA[0].value, "USD", "the established client exception did not survive the firm default");

  const packA = (await packAs(w.firm, w.clientA))
    .records.filter((r) => r.knowledge_key === "default_currency");
  assert.deepEqual(packA.map((r) => [r.scope_kind, r.value]), [["client", "USD"]],
    "the register and the pack disagree about which row governs client A");

  const regB = (await listClientKnowledge(w.viewer, w.clientB))
    .records.filter((r) => r.knowledge_key === "default_currency");
  assert.deepEqual(regB.map((r) => [r.scope_kind, r.value]), [["firm", "MYR"]],
    "the client with no row of its own must read the firm default");
});

cell("p654.exception.independent_overrides — a second client's later exception disturbs neither the first's nor the firm row", async () => {
  const w = await knowledgeWorld("p654x2");
  await capture(w.admin, {
    key: "default_currency", scope: "firm", client: null, value: "MYR",
    basis: "the firm's presentation currency",
  });
  await capture(w.bookkeeper, {
    key: "default_currency", client: w.clientA, value: "USD", basis: "A invoices in dollars",
  });
  await capture(w.bookkeeper, {
    key: "default_currency", client: w.clientB, value: "SGD", basis: "B invoices in Singapore dollars",
  });

  const a = (await listClientKnowledge(w.viewer, w.clientA))
    .records.filter((r) => r.knowledge_key === "default_currency");
  const b = (await listClientKnowledge(w.viewer, w.clientB))
    .records.filter((r) => r.knowledge_key === "default_currency");
  assert.deepEqual(a.map((r) => [r.scope_kind, r.value]), [["client", "USD"]]);
  assert.deepEqual(b.map((r) => [r.scope_kind, r.value]), [["client", "SGD"]]);

  const firmRows = await rootQuery(
    "select value, state from clara.knowledge_records where firm_id = $1 and scope_kind = 'firm'",
    [w.firm]);
  assert.deepEqual(firmRows.rows.map((r) => [r.value, r.state]), [["MYR", "live"]],
    "the firm row must be untouched by either client's exception");

  // …and the FIRM REGISTER counts both exceptions against the one rule.
  const register = await listFirmKnowledge(w.viewer);
  const row = register.records.find((r) => r.knowledge_key === "default_currency");
  assert.ok(row, "the firm register did not return the firm rule");
  assert.equal(row.exception_count, 2, "the firm rule must name how many clients hold an exception");
  assert.deepEqual([...row.exceptions].map((e) => e.client_id).sort(), [w.clientA, w.clientB].sort());
});

// =============================================================================================
// SEAM 4 — AUTHORITY. The floor, what the act records, and what a REVOKED membership does to it.
// =============================================================================================

cell("p654.authority.floor — a bookkeeper cannot promote; an admin can, and the act records promoter, reason, applicability and effective window", async () => {
  const w = await knowledgeWorld("p654a1");
  const denied = await assertRaises("CLR04", () => capture(w.bookkeeper, {
    key: "default_currency", scope: "firm", client: null, value: "MYR",
    basis: "a bookkeeper's own view of the firm's currency",
  }), "a bookkeeper promoting a firm default");
  assert.equal(denied.message, "insufficient role");
  assert.equal(await firmRowCount(w.firm), 0);

  const r = await capture(w.admin, {
    key: "default_currency", scope: "firm", client: null, value: "MYR",
    basis: "Partner meeting 2026-09-16: ringgit presentation is the firm's default",
    appliesWhen: { segment: "smp" }, from: "2026-10-01", to: "2027-09-30",
  });
  assert.equal(r.status, "captured");
  // The two dates are read back as TEXT, never as a JS Date: `effective_from` is a calendar day in
  // Asia/Kuala_Lumpur, and a Date parsed at the runner's local midnight then printed as UTC is off
  // by the offset — the timezone date shift appendix C forbids, reproduced in the assertion itself.
  const row = (await rootQuery(
    `select asserted_by, recorded_via, basis, applies_when,
            effective_from::text as effective_from, effective_to::text as effective_to,
            revision_kind, revision_n, scope_kind
       from clara.knowledge_records where id = $1`, [r.revision_id])).rows[0];
  assert.equal(row.asserted_by, w.admin, "the promoter is not recorded");
  assert.equal(row.recorded_via, "human_ui");
  assert.equal(row.basis, "Partner meeting 2026-09-16: ringgit presentation is the firm's default",
    "the AUTHORED reason is not what the record carries");
  assert.deepEqual(row.applies_when, { segment: "smp" });
  assert.equal(row.effective_from, "2026-10-01");
  assert.equal(row.effective_to, "2027-09-30");
  assert.equal(row.revision_kind, "capture");
  assert.equal(row.revision_n, 1);

  // …and the AUTHORITY the act required is legible on the read, beside the promoter.
  const register = await listFirmKnowledge(w.viewer);
  const entry = register.records.find((x) => x.knowledge_key === "default_currency");
  assert.equal(entry.authority.promoter, w.admin);
  assert.equal(entry.authority.required_role, "admin",
    "the read must name the authority clara._knowledge_floor verified for this act");
  assert.equal(entry.authority.promoter_role_now, "admin");
  assert.equal(entry.authority.promoter_active, true);
});

cell("p654.authority.revoked_membership — a revoked promoter cannot promote, a revoked answerer is withheld BY NAME, and capture_knowledge_for refuses a revoked human", async () => {
  const w = await knowledgeWorld("p654a2");
  // (a) THE PROMOTER, deactivated between the client capture and the firm promotion.
  await capture(w.bookkeeper, {
    key: "default_currency", client: w.clientA, value: "USD", basis: "the client's own position",
  });
  await deactivateMembership(w.firm, w.admin);
  const gone = await assertRaises("CLR04", () => capture(w.admin, {
    key: "default_currency", scope: "firm", client: null, value: "MYR",
    basis: "a removed admin's parting instruction",
  }), "a removed admin promoting a firm default");
  assert.equal(gone.message, "actor has no active membership");
  assert.equal(await firmRowCount(w.firm), 0);

  // (b) THE ANSWERER, withheld BY NAME by the promotion door's own arm (0192:1691-1695) — the
  // first cell in the estate for that arm.
  const w2 = await knowledgeWorld("p654a2b");
  const plan = await committedPlan({
    firm: w2.firm, client: w2.clientA, committedBy: w2.admin,
    answers: { currency: { value: "MYR", answeredBy: w2.bookkeeper } },
  });
  await deactivateMembership(w2.firm, w2.bookkeeper);
  const receipt = await promoteAsHuman(w2.admin, plan);
  assert.equal(receipt.promoted.length, 0);
  assert.equal(receipt.withheld.length, 1);
  assert.equal(receipt.withheld[0].reason, "answerer_not_active");
  assert.equal(receipt.withheld[0].knowledge_key, "default_currency");

  // (c) THE RUNTIME LANE's named human, revoked — CLR04 `asserted_by_rank_insufficient`
  // (0192:1192-1196), the first db cell for clara.capture_knowledge_for at all.
  const w3 = await knowledgeWorld("p654a2c");
  await deactivateMembership(w3.firm, w3.bookkeeper);
  const runtime = await assertRaises("CLR04", () => captureFor({
    assertedBy: w3.bookkeeper, client: w3.clientA, key: "default_currency", value: "MYR",
    basis: "the chat turn heard it from somebody who has since been removed",
  }), "capture_knowledge_for naming a removed member");
  assert.equal(reasonOf(runtime), "asserted_by_rank_insufficient");
  assert.equal(
    (await rootQuery("select count(*)::int as n from clara.knowledge_records where client_id = $1",
      [w3.clientA])).rows[0].n, 0, "a refused runtime capture left a row behind");
});

cell("p654.trust.no_laundering — an extracted or inferred client row cannot become an asserted firm POLICY, even as owner", async () => {
  const w = await knowledgeWorld("p654t1");
  const inferred = await assertRaises("CLR10", () => capture(w.owner, {
    key: "reporting_framework", scope: "firm", client: null, sourceKind: "model_inference",
    value: { framework_code: "MPERS", framework_label: "MPERS" },
    basis: "the model read three sets of accounts and generalised",
  }), "an inferred firm policy");
  assert.equal(reasonOf(inferred), "knowledge_trust_insufficient");

  // …and an EXTRACTED one, pinned to an UNFILED firm document so the refusal cannot be the
  // evidence wall wearing the trust wall's clothes.
  const doc = await firmDocument(w.firm, w.owner, "p654t1");
  const ext = (await rootQuery(
    `insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind, version_n, status)
     values ($1,$2,'rig','ocr',1,'done') returning id`, [w.firm, doc])).rows[0].id;
  const extracted = await assertRaises("CLR10", () => capture(w.owner, {
    key: "accounting_basis", scope: "firm", client: null, sourceKind: "document_extraction",
    value: { accounting_basis: "accrual", accounting_basis_label: "Accrual" },
    basis: "lifted out of the firm's own manual by OCR",
    source: { document_id: doc, extraction_id: ext },
  }), "an extracted firm policy");
  assert.equal(reasonOf(extracted), "knowledge_trust_insufficient");
  assert.equal(await firmRowCount(w.firm), 0);
});

// =============================================================================================
// SEAM 5 — THE TWO NEW READS.
// =============================================================================================

cell("p654.applicability.read_agrees — the new read's in-force answer is the one list_client_knowledge actually returns", async () => {
  const w = await knowledgeWorld("p654r1");
  await capture(w.admin, {
    key: "default_currency", scope: "firm", client: null, value: "MYR",
    basis: "the firm's presentation currency",
  });
  await capture(w.bookkeeper, {
    key: "default_currency", client: w.clientA, value: "USD",
    basis: "A invoices in dollars",
  });
  // …and a NARROW client row on a second key, whose firm rule is unconditional: the shadow is
  // per-applicability, so BOTH stand and the read must say so rather than picking one.
  await capture(w.admin, {
    key: "coa_seed_decision", scope: "firm", client: null, value: { seed: "lhdn_mpers_standard" },
    basis: "the firm seeds the standard chart",
  });
  await capture(w.bookkeeper, {
    key: "coa_seed_decision", client: w.clientA, value: { seed: "manual" },
    appliesWhen: { segment: "digital" }, basis: "the digital segment keeps a manual chart",
  });

  const currency = await applicability(w.viewer, w.clientA, "default_currency");
  // THE TWO COUNTS ARE DIFFERENT NUMBERS AND BOTH ARE LOAD-BEARING. `exception_count` is
  // the register's strict one (a client row shadowing a live firm row at the same
  // applicability); `client_record_count` is what the promote dialog decides against
  // (clients holding their own record of the key at all). Here a firm rule exists, so both
  // count client A; `coa_seed_decision` below is where they could differ.
  assert.equal(currency.exception_count, 1);
  assert.equal(currency.client_record_count, 1);
  assert.equal(currency.applicabilities.length, 1);
  assert.equal(currency.applicabilities[0].in_force, "client_exception");
  assert.equal(currency.applicabilities[0].reason, "client_exception_shadows_firm_default");
  assert.equal(currency.applicabilities[0].firm_rule.value, "MYR");
  assert.equal(currency.applicabilities[0].client_exception.value, "USD");

  const coa = await applicability(w.viewer, w.clientA, "coa_seed_decision");
  const byDigest = Object.fromEntries(coa.applicabilities.map((x) => [JSON.stringify(x.applies_when), x]));
  assert.equal(coa.applicabilities.length, 2,
    `the unconditional firm rule and the narrow client row are INDEPENDENT facts -- got ${JSON.stringify(coa.applicabilities.map((x) => [x.applies_when, x.in_force]))}`);
  assert.equal(byDigest["{}"].in_force, "firm_default");
  assert.equal(byDigest["{}"].reason, "firm_default_applies");
  assert.equal(byDigest['{"segment":"digital"}'].in_force, "client_exception");
  assert.equal(byDigest['{"segment":"digital"}'].reason, "client_record_only");

  // A CLIENT ROW WITH NOTHING TO OVERRIDE IS NOT AN EXCEPTION, and the two counts say so
  // apart: client A's narrow coa_seed_decision row shadows no firm row (the firm's is
  // unconditional), so it counts as a RECORD but not as an EXCEPTION.
  assert.equal(coa.exception_count, 0,
    "a client row at a different applicability shadows nothing and is not an exception");
  assert.equal(coa.client_record_count, 1,
    "…but it IS a client holding its own value for the key, which is what a promotion is decided against");

  // AND THE ANSWER AGREES WITH THE REGISTER, row for row: the rows the read calls in force are
  // exactly the rows list_client_knowledge returns for this client.
  const register = (await listClientKnowledge(w.viewer, w.clientA)).records;
  for (const key of ["default_currency", "coa_seed_decision"]) {
    const answer = await applicability(w.viewer, w.clientA, key);
    const inForce = answer.applicabilities
      .filter((x) => x.in_force !== "none")
      .map((x) => (x.in_force === "client_exception" ? x.client_exception : x.firm_rule).revision_id)
      .sort();
    const shown = register.filter((r) => r.knowledge_key === key && r.state === "live")
      .map((r) => r.revision_id).sort();
    assert.deepEqual(inForce, shown,
      `${key}: the applicability read and the register disagree about what governs this client`);
  }
});

cell("p654.register.firm_rows — the firm register is viewer-floored, names its exceptions and the live Work citing the key, and reaches no other firm", async () => {
  const w = await knowledgeWorld("p654r2");
  const other = await knowledgeWorld("p654r2b");
  await capture(other.admin, {
    key: "default_currency", scope: "firm", client: null, value: "SGD",
    basis: "another firm's own default",
  });

  const work = await liveWork(w.firm, w.clientA, w.bookkeeper);
  await capture(w.admin, {
    key: "default_currency", scope: "firm", client: null, value: "MYR",
    basis: "the firm's presentation currency",
  });
  await capture(w.bookkeeper, {
    key: "default_currency", client: w.clientA, value: "USD",
    basis: "A invoices in dollars", source: { work_id: work },
  });

  // A VIEWER may read it — the same floor clara.list_client_knowledge takes (0192:1316).
  const register = await listFirmKnowledge(w.viewer);
  assert.equal(register.firm_id, w.firm);
  assert.equal(register.records.length, 1, "the firm register must return this firm's rules and nobody else's");
  const row = register.records[0];
  assert.equal(row.value, "MYR");
  assert.equal(row.exception_count, 1);
  assert.equal(row.exceptions[0].client_id, w.clientA);
  assert.equal(row.exceptions[0].value, "USD");
  assert.ok(row.exceptions[0].client_name, "an exception names the client a human can click through to");
  assert.deepEqual(row.live_work.map((x) => x.work_id), [work],
    "the human-review affordance must name the live Work citing the key");

  // …and the EMPTY face is a real read that returned nothing, never a caught error.
  const empty = await listFirmKnowledge(other.viewer);
  assert.equal(empty.records.length, 1, "the other firm reads only its own rule");
  assert.equal(empty.records[0].value, "SGD");
});

// =============================================================================================
// SEAM 6 — THE NEGATIVE CENSUS AND THE PACK.
// =============================================================================================

cell("p654.census.not_a_posting_grant — no function outside the knowledge cohort reads clara.knowledge_records, and a knowledge record still cannot authorise a plan", async () => {
  const w = await knowledgeWorld("p654c1");
  const readers = (await rootQuery(
    `select p.oid::regprocedure::text as sig, p.proname
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.prosrc like '%knowledge_records%'
      order by 1`)).rows;
  const COHORT = new Set([
    // 0192's own closure…
    "_knowledge_capture_core", "_knowledge_insert_revision", "_knowledge_live_revision",
    "_tf_knowledge_records_supersede_only", "correct_knowledge", "get_knowledge_history",
    "get_knowledge_pack", "get_knowledge_record", "list_client_knowledge", "withdraw_knowledge",
    // …and 0205's two reads plus its eligibility guard, whose own comment names 0192's authority
    // trigger (the probe is `prosrc like '%knowledge_records%'`, so a comment counts — which is
    // the conservative direction for a census that must not MISS a reader).
    "list_firm_knowledge", "get_knowledge_applicability", "_tf_knowledge_firm_eligibility",
    "_tf_knowledge_firm_evidence",
    // …and 0205's filing-side half of the same wall (fix round 1, 654-ADV-1). It sits on
    // clara.document_filings rather than on clara.knowledge_records, but it is a member of the
    // knowledge cohort by SUBJECT: it reads knowledge_records to decide whether a filing may
    // land, and it grants nothing.
    "_tf_document_filing_firm_knowledge",
  ]);
  // WAVE 2026-09-15 INTEGRATION — TWO SIBLING LANES READ THIS RELATION, EACH NAMED WITH ITS
  // REASON rather than folded into the cohort above. Neither was on #654's rig: 0202 and 0203 are
  // this wave's own migrations and both precede 0205, so on ANY database that carries this
  // battery's frontier they are present — which is why their presence is asserted below rather
  // than tolerated. The roster is NOT widened silently: each entry states what the function does
  // with the relation, and the loop underneath MEASURES that claim on the live body instead of
  // taking it.
  const READ_ONLY_CONSUMERS = new Map([
    ["get_firm_setup",
      "#648 (0203) — the firm setup checklist LEFT JOINs the firm's own confirmed profile facts so "
      + "a settled item renders what was recorded. A read of the firm's own record, on the same "
      + "viewer-visible surface; it authorises nothing and writes nothing."],
    ["list_source_dependents",
      "#646 (0202) — the read-only projection of what stands on a document's reading: the knowledge "
      + "records, open questions and parked Work questions citing it, so a human can decide what a "
      + "source revision affects. Automatic re-assessment is deferred (PRD:123, #658/#663), which is "
      + "exactly why this is a projection and not a writer."],
  ]);
  const strays = readers
    .filter((r) => !COHORT.has(r.proname) && !READ_ONLY_CONSUMERS.has(r.proname))
    .map((r) => r.sig);
  assert.deepEqual(strays, [],
    "a function outside the knowledge cohort reads clara.knowledge_records -- a firm preference is becoming an authority somewhere");

  // …AND EVERY NAMED EXCEPTION IS POSITIVELY VERIFIED, not merely excused. A name on that list
  // buys a READ and nothing else: present in the live catalog, no DML of any kind against
  // clara.knowledge_records anywhere in its body, and not VOLATILE (a stable body cannot be the
  // place a preference quietly becomes a written authority).
  // POSITIVE CONTROL for the loop below: the same predicate, run against the ONE body in this
  // schema that really does write the relation (`clara._knowledge_insert_revision`, 0192's
  // revision writer). A "no writer found" loop that cannot recognise a writer is not evidence.
  const WRITES_KNOWLEDGE =
    /(insert\s+into\s+clara\.knowledge_records|update\s+clara\.knowledge_records|delete\s+from\s+clara\.knowledge_records)/i;
  const writerProbe = (await rootQuery(
    `select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname = '_knowledge_insert_revision'`)).rows;
  assert.equal(writerProbe.length, 1, "0192's revision writer must exist for this control to mean anything");
  assert.equal(WRITES_KNOWLEDGE.test(writerProbe[0].prosrc), true,
    "the DML predicate below cannot see a real writer -- it would excuse anything");

  for (const [name, reason] of READ_ONLY_CONSUMERS) {
    const rows = readers.filter((r) => r.proname === name);
    assert.ok(rows.length > 0,
      `${name} is declared a read-only knowledge consumer (${reason}) but the live catalog has no such reader -- delete the exception rather than carrying a dead one`);
    const bodies = (await rootQuery(
      `select p.oid::regprocedure::text as sig, p.prosrc, p.provolatile
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'clara' and p.proname = $1`, [name])).rows;
    for (const b of bodies) {
      assert.equal(WRITES_KNOWLEDGE.test(b.prosrc), false,
        `${b.sig} writes clara.knowledge_records -- it is not a read-only consumer`);
      assert.notEqual(b.provolatile, "v", `${b.sig} is VOLATILE -- a read-only knowledge consumer is stable or immutable`);
    }
  }

  // …AND THE PLAN LANE STILL REFUSES ONE BY ITS OWN DOOR (0193:1486-1489), measured through the
  // door rather than read off its source.
  await capture(w.admin, {
    key: "accounting_basis", scope: "firm", client: null,
    value: { accounting_basis: "accrual", accounting_basis_label: "Accrual" },
    basis: "the firm prepares on the accrual basis",
  });
  const record = (await rootQuery(
    "select record_id from clara.knowledge_records where firm_id = $1 and scope_kind = 'firm'",
    [w.firm])).rows[0].record_id;
  const PLAN = `select clara.create_accounting_plan(
     p_client => $1, p_kind => 'recurring_journal', p_purpose => 'rig probe',
     p_authority_kind => $2, p_authority_ref => $3::jsonb,
     p_frequency => 'monthly', p_day_rule => 'day_of_month', p_day_of_month => 1,
     p_timezone => 'Asia/Kuala_Lumpur', p_effective_from => null, p_effective_to => null,
     p_basis => '{}'::jsonb, p_reversal_day_rule => null, p_op_key => $4) as r`;
  // (a) A KNOWLEDGE PREFERENCE IS THE "authority rule" SHAPE 0193 REFUSES OUTRIGHT.
  const rule = await assertRaises("CLR10", () => humanQuery(w.bookkeeper, PLAN,
    [w.clientA, "authority_rule", JSON.stringify({ kind: "knowledge_record", id: record }), opk("p654")]),
  "create_accounting_plan authorised by an authority rule");
  assert.equal(reasonOf(rule), "authority_rule_unsupported");
  // (b) …and dressed as an explicit instruction it still is not one: the reference must name an
  // accounting_work or a chat_task, and `knowledge_record` is neither.
  const ref = await assertRaises("CLR10", () => humanQuery(w.bookkeeper, PLAN,
    [w.clientA, "explicit_instruction", JSON.stringify({ kind: "knowledge_record", id: record }), opk("p654")]),
  "create_accounting_plan authorised by a knowledge record");
  assert.equal(reasonOf(ref), "authority_ref_invalid");
});

cell("p654.pack.second_client — the firm default reaches a client with no row of its own through the RUNTIME pack", async () => {
  const w = await knowledgeWorld("p654p1");
  await capture(w.admin, {
    key: "accounting_basis", scope: "firm", client: null,
    value: { accounting_basis: "accrual", accounting_basis_label: "Accrual" },
    basis: "the firm prepares on the accrual basis unless a client's own policy says otherwise",
  });
  await capture(w.admin, {
    key: "accounting_basis", client: w.clientA,
    value: { accounting_basis: "cash", accounting_basis_label: "Cash" },
    basis: "this client's own board resolution",
  });

  const packB = (await packAs(w.firm, w.clientB))
    .records.filter((r) => r.knowledge_key === "accounting_basis");
  assert.equal(packB.length, 1, "the firm default must reach the client that holds no row of its own");
  assert.equal(packB[0].scope_kind, "firm");
  assert.deepEqual(packB[0].value, { accounting_basis: "accrual", accounting_basis_label: "Accrual" });
  assert.equal(packB[0].client_id, null);

  const packA = (await packAs(w.firm, w.clientA))
    .records.filter((r) => r.knowledge_key === "accounting_basis");
  assert.deepEqual(packA.map((r) => [r.scope_kind, r.value.accounting_basis]), [["client", "cash"]],
    "the client that holds its own policy must not see the firm default at the same applicability");

  // THE ENVELOPE IS UNCHANGED BY THIS TICKET, and that is measured rather than assumed: 0205
  // recuts no 0192 body, so the pack's own field list is exactly what #644 shipped.
  assert.equal(Object.prototype.hasOwnProperty.call(packB[0], "authoritative"), false,
    "clara._knowledge_row_json emits `authoritative` on UNIONed legacy rows only (0192:1051-1084); a governed row gaining one would mean a 0192 recut");
});

// =============================================================================================
// SEAM 7 — THE TRIGGER ORDER AND THE GRANT CENSUS, read from the live catalog.
// =============================================================================================

cell("p654.guards.fire_in_name_order_and_are_granted_to_nobody_else", async () => {
  const order = (await rootQuery(
    `select tgname from pg_trigger
      where tgrelid = 'clara.knowledge_records'::regclass and not tgisinternal
        and (tgtype & 4) <> 0 and (tgtype & 2) <> 0
      order by tgname`)).rows.map((r) => r.tgname);
  assert.deepEqual(order, [
    "t_knowledge_records_authority",
    "t_knowledge_records_firm_eligibility",
    "t_knowledge_records_firm_evidence",
  ], "Postgres fires same-event BEFORE triggers in NAME order; 0192's authority stamp must still run first");

  const acl = (await rootQuery(
    `select
       has_function_privilege('clara_authenticated','clara.list_firm_knowledge()','EXECUTE') as human_list,
       has_function_privilege('clara_authenticated','clara.get_knowledge_applicability(uuid,text)','EXECUTE') as human_appl,
       has_function_privilege('clara_runtime','clara.list_firm_knowledge()','EXECUTE') as runtime_list,
       has_function_privilege('clara_agent_ro','clara.list_firm_knowledge()','EXECUTE') as agent_list,
       has_function_privilege('clara_agent_ro','clara.get_knowledge_applicability(uuid,text)','EXECUTE') as agent_appl,
       has_table_privilege('clara_authenticated','clara.knowledge_key_firm_eligibility','SELECT') as human_read,
       has_table_privilege('clara_agent_ro','clara.knowledge_key_firm_eligibility','SELECT') as agent_read,
       has_table_privilege('clara_authenticated','clara.knowledge_key_firm_eligibility','INSERT') as human_write`)).rows[0];
  assert.deepEqual(acl, {
    human_list: true, human_appl: true,
    runtime_list: false, agent_list: false, agent_appl: false,
    human_read: true, agent_read: false, human_write: false,
  }, "the new reads are clara_authenticated ONLY (0057's dark-grant rule, restated 0192:1742-1745)");
});

// =============================================================================================
// SEAM 8 — THE PROMOTION AS AN OPERATION (fix round 1, adversarial finding 654-ADV-4). The brief's
// web section pins op_key behaviour ("a lost response re-reads current state before a distinct
// resubmit and reuses the same op_key"), and no db cell covered it at firm scope. These three
// are about the ACT rather than the wall: a replay is one receipt, a reused key with different
// arguments is a typed refusal, and two humans promoting the same key at once leave ONE rule.
// =============================================================================================

cell("p654.promote.replay_is_one_receipt — the same op_key and the same payload return the same envelope, one receipt and one row", async () => {
  const w = await knowledgeWorld("p654o1");
  const key = opk("p654replay");
  const args = {
    key: "default_currency", scope: "firm", client: null, value: "MYR",
    basis: "the firm presents in ringgit", opKey: key,
  };
  const first = await capture(w.admin, args);
  const second = await capture(w.admin, args);
  assert.equal(first.status, "captured");
  assert.deepEqual(second, first, "a replayed promotion must return the FIRST envelope verbatim");

  assert.equal(await firmRowCount(w.firm), 1, "a replay minted a second knowledge row");
  const receipts = (await rootQuery(
    "select count(*)::int as n from clara.op_receipts where firm_id = $1 and fn = 'capture_knowledge' and op_key = $2",
    [w.firm, key])).rows[0].n;
  assert.equal(receipts, 1, "a replay minted a second reserve-before-effect receipt");
});

cell("p654.promote.op_key_conflict — the same op_key with a different payload is refused and nothing moves", async () => {
  const w = await knowledgeWorld("p654o2");
  const key = opk("p654conflict");
  await capture(w.admin, {
    key: "default_currency", scope: "firm", client: null, value: "MYR",
    basis: "the firm presents in ringgit", opKey: key,
  });
  const err = await assertRaises("CLR10", () => capture(w.admin, {
    key: "default_currency", scope: "firm", client: null, value: "SGD",
    basis: "the firm presents in ringgit", opKey: key,
  }), "the same op_key with a different value");
  assert.match(err.message, /op_key reused with different args/,
    `the reuse must be refused by name, not by a generic error: ${err.message}`);

  assert.equal(await firmRowCount(w.firm), 1, "a refused reuse moved a row");
  const live = (await rootQuery(
    "select value from clara.knowledge_records where firm_id = $1 and scope_kind = 'firm' and state = 'live'",
    [w.firm])).rows;
  assert.deepEqual(live.map((r) => r.value), ["MYR"], "the refused payload reached the record");
});

cell("p654.promote.race — two admins promoting one key behind a barrier leave ONE live rule; the loser is refused by name and neither deadlocks", async () => {
  const w = await knowledgeWorld("p654o3");
  // TWO RAW CONNECTIONS, genuinely in flight. The pooled helpers commit and reset per call, so
  // they cannot express a race at all (accounting-plan-occurrences.test.mjs's own reason).
  const a = await getPool().connect();
  const b = await getPool().connect();
  let outcomes = null;
  try {
    for (const [c, sub] of [[a, w.admin], [b, w.owner]]) {
      await c.query("set role clara_authenticated");
      await c.query("select set_config('request.jwt.claims', $1, false)",
        [JSON.stringify({ sub, role: "authenticated" })]);
    }
    // THE BARRIER IS `uq_knowledge_live` ITSELF. A begins the promotion and holds its
    // uncommitted index entry; B's INSERT of the same (scope, firm, key, applicability) queues
    // on it and cannot resolve until A commits — so the two are provably overlapping rather
    // than serialised by luck.
    await a.query("begin");
    await b.query("begin");
    const pidB = (await b.query("select pg_backend_pid() as p")).rows[0].p;
    await a.query(CAPTURE, ["default_currency", JSON.stringify("MYR"), "A's promotion",
      opk("p654raceA"), "firm", null, "user_statement", "{}", null, null, "{}"]);
    const pb = b.query(CAPTURE, ["default_currency", JSON.stringify("SGD"), "B's promotion",
      opk("p654raceB"), "firm", null, "user_statement", "{}", null, null, "{}"])
      .then(() => ({ ok: true }), (e) => ({ ok: false, code: e.code, detail: e.detail, message: e.message }));

    let queued = false;
    for (let i = 0; i < 200 && !queued; i += 1) {
      const r = await rootQuery("select wait_event_type as wt from pg_stat_activity where pid = $1", [pidB]);
      queued = r.rows[0]?.wt === "Lock";
      if (!queued) await new Promise((x) => setTimeout(x, 25));
    }
    assert.ok(queued, "the second promotion never queued on uq_knowledge_live -- this cell would prove nothing about a race");

    await a.query("commit");
    const loser = await pb;
    await b.query("rollback").catch(() => {});
    outcomes = loser;
  } finally {
    for (const c of [a, b]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }

  assert.equal(outcomes.ok, false, "both promotions succeeded -- uq_knowledge_live did not decide the race");
  assert.equal(outcomes.code, "CLR10", `the loser must be refused CLR10, got ${outcomes.code}: ${outcomes.message}`);
  assert.notEqual(outcomes.code, "40P01", "a deadlock is not a refusal");
  assert.equal(reasonOf(outcomes), "knowledge_already_live",
    `the loser must be refused BY NAME rather than with a bare 23505: ${outcomes.message}`);

  const live = (await rootQuery(
    "select value from clara.knowledge_records where firm_id = $1 and scope_kind = 'firm' and state = 'live'",
    [w.firm])).rows;
  assert.deepEqual(live.map((r) => r.value), ["MYR"], "exactly one live firm rule may survive the race");
});
