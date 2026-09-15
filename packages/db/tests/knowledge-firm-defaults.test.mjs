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
  assertRaises, endPool, humanQuery, roleQuery, rootQuery, opk, ROLES,
} from "./rig-fixtures.mjs";
import { knowledgeWorld, committedPlan } from "./knowledge-fixtures.mjs";
import {
  deactivateMembership, fileDocument, firmDocument, knowledgeFirmCohortApplied, liveWork,
  retireFiling,
} from "./knowledge-firm-fixtures.mjs";

const EXPECTED_CELLS = 15;
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
  const all = (await rootQuery("select knowledge_key from clara.knowledge_keys order by 1"))
    .rows.map((x) => x.knowledge_key);
  const refused = all.filter((k) => !admitted.includes(k));
  assert.equal(refused.length, 9, `expected 9 refused keys, got ${refused.length}: ${refused.join(", ")}`);
  for (const key of refused) {
    const err = await assertRaises("CLR10", () => capture(w.owner, {
      key, scope: "firm", client: null, value: "x",
      basis: `the firm's standing position on ${key}`,
    }), `capture_knowledge(firm, ${key})`);
    assert.equal(reasonOf(err), "knowledge_scope_not_firm_defaultable",
      `${key} was refused for the wrong reason (${reasonOf(err)})`);
  }
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
  const filingA = await fileDocument(w.firm, doc, w.clientA, w.admin);

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

  // …and the wall is about the FILING, not about the document: file it to a client and the NEXT
  // firm-scope record naming it is refused, while the one already captured stands.
  const filing = await fileDocument(w.firm, doc, w.clientA, w.admin);
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
  const row = (await rootQuery(
    `select asserted_by, recorded_via, basis, applies_when, effective_from, effective_to,
            revision_kind, revision_n, scope_kind
       from clara.knowledge_records where id = $1`, [r.revision_id])).rows[0];
  assert.equal(row.asserted_by, w.admin, "the promoter is not recorded");
  assert.equal(row.recorded_via, "human_ui");
  assert.equal(row.basis, "Partner meeting 2026-09-16: ringgit presentation is the firm's default",
    "the AUTHORED reason is not what the record carries");
  assert.deepEqual(row.applies_when, { segment: "smp" });
  assert.equal(row.effective_from.toISOString().slice(0, 10), "2026-10-01");
  assert.equal(row.effective_to.toISOString().slice(0, 10), "2027-09-30");
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
    // …and 0205's two reads. Nothing else in this schema may read the table.
    "list_firm_knowledge", "get_knowledge_applicability",
  ]);
  const strays = readers.filter((r) => !COHORT.has(r.proname)).map((r) => r.sig);
  assert.deepEqual(strays, [],
    "a function outside the knowledge cohort reads clara.knowledge_records -- a firm preference is becoming an authority somewhere");

  // …AND THE PLAN LANE STILL REFUSES ONE BY ITS OWN DOOR (0193:1486-1489), measured through the
  // door rather than read off its source.
  await capture(w.admin, {
    key: "accounting_basis", scope: "firm", client: null,
    value: { accounting_basis: "accrual", accounting_basis_label: "Accrual" },
    basis: "the firm prepares on the accrual basis",
  });
  const record = (await rootQuery(
    "select id from clara.knowledge_records where firm_id = $1 and scope_kind = 'firm'", [w.firm])).rows[0].id;
  const err = await assertRaises("CLR10", () => humanQuery(w.admin,
    `select clara.create_accounting_plan(
       p_client => $1, p_kind => 'recurring_journal', p_title => 'rig plan',
       p_authority_kind => 'authority_rule',
       p_authority_ref => $2::jsonb, p_schedule => '{}'::jsonb, p_op_key => $3) as r`,
    [w.clientA, JSON.stringify({ kind: "knowledge_record", id: record }), opk("p654")]),
  "create_accounting_plan authorised by a knowledge record");
  assert.equal(reasonOf(err), "authority_rule_unsupported");
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
