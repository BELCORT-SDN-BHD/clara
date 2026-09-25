// #1150 — ONE NESTED PLAN RESERVATION NAMESPACE PER LANE, AND ONE ON-BEHALF-OF PLAN BODY.
// Migration: 0364_plan_reservation_namespace_obo_fold.sql.
//
// `clara._reserve_op` (0004_governed_fns.sql:47) keys an operation receipt on
// (firm_id, fn, op_key). A door that nests another door hands it a DERIVED key. 0336 (#1077) moved
// the deferred-revenue lane off `:plan` / `:end` onto `:rrplan` / `:rrend` and deliberately stopped
// there, leaving the ACCRUAL lane and the TENANCY lane still deriving `<key>:plan` under
// `create_accounting_plan` alongside the prepayment lane. One operation key spent across two of
// them collides on a reservation neither caller can name, and the answer is `_reserve_op`'s own
// untyped CLR10 `op_key reused with different args`.
//
// NOT a test file: a scene builder and a census instrument, on the
// `revenue-recognition-plan-op-key-fixtures` idiom. A STABLE STEM, never a number — numbers are
// claimed at merge (packages/db/README.md).

import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, roleQuery, namedCall, upsertAccount, createClient, ROLES,
} from "./rig-fixtures.mjs";
import { opk } from "./rig-helpers.mjs";
import { prepaymentScene, createPrepaymentSchedule } from "./prepayment-schedule-fixtures.mjs";
import { freshAccrualClient, accrual, createAccrualAdjustment } from "./accrual-adjustments-fixtures.mjs";
import { correctAccrualAdjustment } from "./accrual-correction-fixtures.mjs";
import { instructionRef, createAccountingPlan, reviseAccountingPlan } from "./accounting-plans-fixtures.mjs";
import { basis } from "./work-journal-fixtures.mjs";
import { firmOf, filedDocument, seedExtraction, seedRegion, enqueueInvoiceFacts, claimTask } from "./a21-helpers.mjs";
import { consentEvidenceDoc, grantPurpose, activatePurpose } from "./wave-b/wb-0020-helpers.mjs";

/** The migration's own stable stem, probed at the live ledger rather than assumed. */
export const PLAN_NS_STEM = "plan_reservation_namespace_obo_fold$";

/** The preintegration gate module's variable, so a message can name it. */
export const PLAN_NS_GATE = "CLARA_ALLOW_MISSING_PLAN_RESERVATION_NAMESPACE";

let applied = null;
/** Is 0364 on this chain? Probed ONCE at the live ledger. */
export async function planNamespaceApplied() {
  if (applied !== null) return applied;
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [PLAN_NS_STEM]);
  applied = Number(r.rows[0].n) > 0;
  return applied;
}

/** Whether 0353's tenancy lane is on this chain at all — the tenancy half of every cell needs it. */
export async function tenancyLanePresent() {
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1",
    ["tenancy_agent_twins_obo_confirmations$"]);
  return Number(r.rows[0].n) > 0;
}

// ===========================================================================================
// 1 · THE NAMESPACES, as the doors actually derive them — the ONE place the literals live.
// ===========================================================================================

/**
 * Every nested PLAN reservation suffix in the estate, BY LANE. The census below reads the bodies
 * off the live catalog; this map is the only hand-written thing in it, and it names SUFFIXES
 * rather than bodies on purpose: a new body reaching for another lane's suffix must be a red, and
 * a roster of bodies would have to be edited every time one of them is recut.
 *
 * `:revise` is the tenancy lane's revision half. It is the one token here that is not lane
 * qualified — 0353 wrote it before this partition existed, nothing else derives it, and #1150
 * moves only the `:plan` derivers the ticket names. The census is what makes that safe: the day a
 * second lane reaches for `:revise`, this cell reds.
 */
export const LANE_SUFFIXES = {
  prepayment: [":plan", ":end"],
  deferred_revenue: [":rrplan", ":rrend"],
  accrual: [":acplan", ":acrev"],
  tenancy: [":tnplan", ":revise"],
};

/** The flat list of declared suffixes. */
export const DECLARED_SUFFIXES = Object.values(LANE_SUFFIXES).flat();

/** The lane each declared suffix belongs to. */
export const LANE_OF_SUFFIX = new Map(
  Object.entries(LANE_SUFFIXES).flatMap(([lane, xs]) => xs.map((x) => [x, lane])));

/**
 * The plan doors a NESTED plan reservation is taken at. A derivation handed to anything else is
 * another family's business — `:approve`, `:match`, `:settle`, `:post`, `:draft`, `:resolve`,
 * `:assess`, `:add_client_identifier` and `:file_document_write` all exist on this catalog and
 * belong to the bank, payroll, fixed-asset and document lanes — and is not this census's subject.
 * Which derivation reaches which door is MEASURED below, never assumed.
 */
export const PLAN_DOORS = [
  "create_accounting_plan", "revise_accounting_plan", "end_accounting_plan",
  "_revise_accounting_plan_core",
];

/**
 * Blanks every `--` comment and the CONTENTS of every single-quoted literal, so that a paren or a
 * door name written in prose cannot be read as a call. Length is preserved, so offsets still line
 * up with the original source. Measured need: `clara._confirm_tenancy_rent_plan_revision_core`'s
 * own comment writes "clara.revise_accounting_plan (0193) is now a thin delegate", which a
 * text-only matcher reads as a call to that door.
 */
function maskSql(src) {
  const out = src.split("");
  let i = 0;
  while (i < out.length) {
    const c = out[i];
    if (c === "'") {
      let j = i + 1;
      while (j < out.length && out[j] !== "'") { if (out[j] !== "\n") out[j] = " "; j += 1; }
      i = j + 1;
    } else if (c === "-" && out[i + 1] === "-") {
      let j = i;
      while (j < out.length && out[j] !== "\n") { out[j] = " "; j += 1; }
      i = j;
    } else { i += 1; }
  }
  return out.join("");
}

/** The name of the call whose argument list encloses the offset `at`, or null. */
function enclosingCall(masked, at) {
  let depth = 0;
  for (let i = at - 1; i >= 0; i -= 1) {
    const c = masked[i];
    if (c === ")") depth += 1;
    else if (c === "(") {
      if (depth === 0) {
        const m = /(?:clara\.)?([a-z_][a-z0-9_]*)\s*$/i.exec(masked.slice(Math.max(0, i - 120), i));
        return m ? m[1] : null;
      }
      depth -= 1;
    }
  }
  return null;
}

/**
 * THE CENSUS INSTRUMENT. Every `clara` body that hands a PLAN door a key derived from its own
 * `p_op_key`: the suffix, the door and the body, all read off `pg_proc.prosrc` rather than listed,
 * so a lane that invents a ninth suffix or a tenth deriving body is visible.
 *
 * Returns `[{ suffix, door, sig }]`, ordered under C (#1047's house rule: CI's postgres:17
 * initdb's at en_US.utf8, where the underscore is ignored at the primary level and a `clara._x`
 * signature sorts after `clara.replace_x`).
 */
export async function nestedPlanCensus(extraBodies = []) {
  const r = await rootQuery(
    `select p.oid::regprocedure::text as sig, p.prosrc as src
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara'
        and p.prosrc ~ 'p_op_key[[:space:]]*\\|\\|[[:space:]]*'':[a-z_]+'''`);
  return derivationsIn([...r.rows, ...extraBodies]);
}

/**
 * The PURE half of the census: `[{sig, src}] -> [{suffix, door, sig}]`. Separated so the cell can
 * feed it a body that does not exist on any database and see the census flag it — the vacuity
 * control, without a `create function` on a shared rig.
 */
export function derivationsIn(bodies) {
  const seen = new Set();
  const rows = [];
  for (const { sig, src } of bodies) {
    const masked = maskSql(src);
    const re = /p_op_key\s*\|\|\s*'(:[a-z_]+)'/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const door = enclosingCall(masked, m.index);
      if (!door || !PLAN_DOORS.includes(door)) continue;
      const k = `${m[1]}|${door}|${sig}`;
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push({ suffix: m[1], door, sig });
    }
  }
  return rows.sort((a, b) => (a.suffix < b.suffix ? -1 : a.suffix > b.suffix ? 1
    : a.sig < b.sig ? -1 : a.sig > b.sig ? 1 : 0));
}

/**
 * THE PARTITION, stated once: what is WRONG with a set of derivations, as a list of sentences.
 * Empty means every nested plan reservation in the estate belongs to exactly one lane, so no two
 * lanes can collide on one — which is the whole claim #1150 makes.
 */
export function partitionProblems(rows) {
  const problems = [];
  const lanes = new Map();      // body -> Set(lane)
  const derivers = new Map();   // suffix -> Set(body)
  for (const { suffix, sig } of rows) {
    const lane = LANE_OF_SUFFIX.get(suffix);
    if (!lane) {
      problems.push(
        `${sig} derives the nested plan reservation '${suffix}', which no lane declares — add it `
        + "to LANE_SUFFIXES under the lane that owns it, or give the body its lane's own suffix");
      continue;
    }
    if (!lanes.has(sig)) lanes.set(sig, new Set());
    lanes.get(sig).add(lane);
    if (!derivers.has(suffix)) derivers.set(suffix, new Set());
    derivers.get(suffix).add(sig);
  }
  for (const suffix of DECLARED_SUFFIXES) {
    if (!derivers.has(suffix)) {
      problems.push(
        `no body derives '${suffix}' any more — the lane map has outlived its reason and must drop it`);
    }
  }
  for (const [sig, ls] of [...lanes].sort()) {
    if (ls.size > 1) {
      problems.push(
        `${sig} derives nested plan reservations of ${ls.size} lanes (${[...ls].sort().join(", ")}) `
        + "— one body, one lane, or a key spent on both collides on a reservation neither caller names");
    }
  }
  return problems.sort();
}

/** The `sha256(prosrc)` and source of one body, by signature. */
export async function bodyOf(sig) {
  const r = await rootQuery(
    `select p.prosrc as src, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha
       from pg_proc p where p.oid = to_regprocedure($1)`, [sig]);
  return r.rows[0] ?? null;
}

/** The op receipts standing under one EXACT key, across every `fn`. */
export async function receiptsUnder(firm, opKey) {
  const r = await rootQuery(
    `select fn, op_key, result is not null as finished
       from clara.op_receipts where firm_id = $1 and op_key = $2 order by fn`, [firm, opKey]);
  return r.rows;
}

// ===========================================================================================
// 2 · THE SCENE — ONE FIRM carrying all three lanes, because `clara._reserve_op` keys on the
//     FIRM and not on the client. Three clients of one firm is the shape a caller that derives
//     its operation keys from a shared seed actually has.
// ===========================================================================================

let seq = 0;
export const opk1150 = (tag) => `p1150-${tag}-${Date.now()}-${++seq}`;

// #949's own hand-worked tenancy, carried verbatim from tenancy-rent-plan.test.mjs and
// tenancy-agent-twins.test.mjs as an INDEPENDENT source of truth (WORK-ORDER rule 4 — never
// re-derived from what the code computes): a two-year shoplot tenancy, RM 3,600.00 a month,
// signed 2026-01-05, 24 months.
const TERM_START = "2026-01-05";
const value = (raw) => ({ state: "value", raw });
const notPrinted = () => ({ state: "not_printed" });
const RUN_FIELDS = [
  "contract.agreement.kind", "contract.agreement.financier", "contract.agreement.agreement_date",
  "contract.agreement.asset_description", "contract.agreement.cash_price",
  "contract.agreement.deposit", "contract.agreement.amount_financed",
  "contract.agreement.total_charges", "contract.agreement.total_payable",
  "contract.agreement.term_months", "contract.agreement.instalment_amount",
];
const TENANCY = {
  "contract.agreement.kind": value("Tenancy Agreement"),
  "contract.agreement.financier": value("Sri Damansara Properties Sdn Bhd"),
  "contract.agreement.agreement_date": value(TERM_START),
  "contract.agreement.asset_description": value("Ground-floor shoplot, No 12 Jalan PJU 1/45, Petaling Jaya"),
  "contract.agreement.cash_price": notPrinted(),
  "contract.agreement.deposit": value("7,200.00"),
  "contract.agreement.amount_financed": notPrinted(),
  "contract.agreement.total_charges": notPrinted(),
  "contract.agreement.total_payable": notPrinted(),
  "contract.agreement.term_months": value("24"),
  "contract.agreement.instalment_amount": value("3,600.00"),
};
const TENANCY_CHART = [
  { code: "6100", name: "Rental of Premises", type: "expense" },
  { code: "2050", name: "Rent Payable", type: "liability" },
  { code: "1120", name: "Deposits Paid", type: "asset" },
  { code: "1010", name: "Maybank current (p1150)", type: "asset" },
];

function envelope(channel) {
  const a = {};
  for (const f of RUN_FIELDS) a[f] = TENANCY[f];
  return { contract: { channel, answers: a, rows: [] } };
}

/**
 * THE SCENE. `prepaymentScene` builds the world, the firm, a closeable fiscal year and an approved
 * prepaid entry; everything else is added to THAT firm so all three lanes share one `firm_id`.
 */
export async function namespaceScene(tag) {
  const scene = await prepaymentScene(`p1150_${tag}`, { cents: 120000, termMonthsBack: 4, termMonths: 3 });
  // #948's contract-facts lane mints one witness-pair task per tenancy inside ONE firm, and 0296's
  // per-lane concurrency wall defaults to 2 RUNNING at once (CLR18). Raised for this fixture firm
  // alone, exactly as tenancy-agent-twins.test.mjs does for its own.
  await rootQuery(
    `insert into clara.firm_document_limits(firm_id, llm_witness_concurrency)
       values ($1, 50)
     on conflict (firm_id) do update set llm_witness_concurrency = 50`, [scene.firm]);
  return scene;
}

/** A window that ENDS at last month's month end — safely in the past on every calendar day this
 *  battery runs, the same reasoning `accrual-correction.test.mjs`'s own `pastSpan` states. */
export async function pastSpan(monthsBack = 2) {
  const r = await rootQuery(
    `select (date_trunc('month', current_date) - make_interval(months => $1::int))::date::text as f,
            ((date_trunc('month', current_date))::date - 1)::text as t`, [monthsBack]);
  return { from: r.rows[0].f, to: r.rows[0].t };
}

/** A fresh client of the scene's firm carrying the accrual chart, with an authority reference that
 *  RESOLVES — the accrual lane's own entrance conditions. */
export async function accrualLaneIn(scene, tag) {
  const client = await freshAccrualClient(scene.alice, `p1150-${tag}`);
  const authorityRef = await instructionRef({ client, author: scene.bob });
  return { client, authorityRef };
}

/** A tenancy of the scene's firm, read through #948's OWN lane — the router, the claim and the
 *  persist door — so every term is a term the landed lane banked. Nothing is hand-inserted. */
export async function tenancyLaneIn(scene, tag) {
  const client = await createClient(scene.alice, {
    name: `p1150-ten-${tag}-${Date.now()}`, opKey: opk1150(`ten-client-${tag}`) });
  for (const a of TENANCY_CHART) {
    await upsertAccount(scene.alice, {
      client, code: a.code, name: a.name, type: a.type, opKey: opk1150("coa") });
  }
  await humanQuery(scene.alice,
    `select clara.capture_knowledge(p_knowledge_key => 'reporting_framework',
        p_value => $1::jsonb, p_basis => $2, p_op_key => $3,
        p_scope_kind => 'client', p_client => $4, p_source_kind => 'user_statement')`,
    [JSON.stringify({ framework_code: "MPERS", framework_label: "MPERS (p1150 fixture)" }),
      "the engagement letter records the framework these accounts are prepared on",
      opk1150("framework"), client]);

  const firm = await firmOf(client);
  const evidence = await consentEvidenceDoc(scene.alice, { firm });
  const grant = await grantPurpose(scene.alice, {
    client, purpose: "witness_extraction", evidenceDocument: evidence.documentId });
  await activatePurpose(scene.alice, {
    client, purpose: "witness_extraction", consent: grant.consent_id });

  const doc = await filedDocument(scene.alice, { firm, client, kind: "agreement_contract" });
  const ocr = await seedExtraction({ firm, document: doc.documentId, engineKind: "ocr", status: "done" });
  await seedRegion({ firm, extraction: ocr,
    fieldPath: "contract.agreement.instalment_amount", textContent: "3,600.00" });
  await enqueueInvoiceFacts(doc.documentId);
  const task = (await rootQuery(
    `select id from clara.document_processing_tasks
      where document_id=$1 and lane='contract_facts' and status='queued'
      order by version_n desc limit 1`, [doc.documentId])).rows[0];
  assert.ok(task, "mandatory setup: the router queued a contract_facts task");
  const claimed = await claimTask(task.id, { egressApproved: true });
  assert.equal(claimed.status, "running",
    `mandatory setup: the task is claimable (got ${JSON.stringify(claimed)})`);
  const sha = (await rootQuery("select sha256 from clara.documents where id=$1", [doc.documentId])).rows[0].sha256;
  const receipt = (await rootQuery(
    "select clara.persist_agreement_facts($1,$2::jsonb,$3::jsonb,$4) as receipt",
    [task.id,
      JSON.stringify({ input_pin: ocr, prompt_hash: "p1150-text", envelope: envelope("text"),
        citations: [{ field_path: "contract.agreement.instalment_amount", region_idx: 1 }] }),
      JSON.stringify({ input_pin: sha, prompt_hash: "p1150-vision", envelope: envelope("vision") }),
      1])).rows[0].receipt;
  assert.equal(receipt.status, "done",
    `mandatory setup: the tenancy read settled (got ${JSON.stringify(receipt)})`);

  // THE TERMS A PERSON RECORDED, verbatim off what Clara proposed — the confirmation's own premise.
  const proposal = (await humanQuery(scene.alice,
    namedCall("propose_contract_terms", [{ name: "p_document" }]), [doc.documentId])).rows[0].result;
  await humanQuery(scene.alice,
    namedCall("record_contract_terms", [
      { name: "p_client" }, { name: "p_document" }, { name: "p_terms" }, { name: "p_op_key" }]),
    [client, doc.documentId, JSON.stringify(proposal.proposed.map((p) => ({ ...p }))),
      opk1150("terms")]);
  return { client, document: doc.documentId };
}

// ===========================================================================================
// 3 · Verb wrappers. Named arguments only, on each door's own least-privileged connection.
// ===========================================================================================

const CONFIRM_SPECS = [
  { name: "p_client" }, { name: "p_document" }, { name: "p_rent_account" },
  { name: "p_payable_account" }, { name: "p_judgement" }, { name: "p_op_key" },
];
const CONFIRM_FOR_SPECS = [
  { name: "p_client", cast: "uuid" }, { name: "p_author", cast: "uuid" },
  { name: "p_document", cast: "uuid" }, { name: "p_rent_account", cast: "text" },
  { name: "p_payable_account", cast: "text" }, { name: "p_judgement", cast: "text" },
  { name: "p_op_key", cast: "text" },
];

/** The HUMAN tenancy confirmation — `clara_authenticated`, bookkeeper floor inside its own body. */
export const confirmRentPlan = async (sub, {
  client, document, rentAccount = null, payableAccount = null, judgement = null, opKey = null }) =>
  (await humanQuery(sub, namedCall("confirm_tenancy_rent_plan", CONFIRM_SPECS),
    [client, document, rentAccount, payableAccount, judgement, opKey ?? opk1150("confirm")])
  ).rows[0].result;

/** The ON-BEHALF-OF twin — `clara_runtime` ONLY, the named author in an argument. */
export const confirmRentPlanFor = async ({
  client, author, document, rentAccount = null, payableAccount = null, judgement = null, opKey = null }) =>
  (await roleQuery(ROLES.runtime, namedCall("confirm_tenancy_rent_plan_for", CONFIRM_FOR_SPECS),
    [client, author, document, rentAccount, payableAccount, judgement, opKey ?? opk1150("obo-confirm")])
  ).rows[0].result;

/**
 * SPENDS one derived key at `clara.revise_accounting_plan` DIRECTLY, on a plan of its own. That is
 * the one route a person has to the nested door with an arbitrary key (0284's own header), and it
 * is how a genuine collision on the accrual correction's derived key is produced without reaching
 * around any wall.
 */
export async function spendReviseKey(sub, { client, authorityRef, span, opKey }) {
  const plan = await createAccountingPlan(sub, {
    client, authorityRef, purpose: "p1150 key-spending plan",
    effectiveFrom: span.from, effectiveTo: span.to,
    basis: basis({ postingDate: span.from, memo: "p1150 key-spending basis" }) });
  await reviseAccountingPlan(sub, {
    plan: plan.plan_id, effectiveFrom: span.from, effectiveTo: span.to,
    basis: basis({ postingDate: span.from, memo: "p1150 key-spending revision" }), opKey });
  return plan.plan_id;
}

export async function caught(fn) {
  try { await fn(); return null; } catch (e) { return e; }
}
export const detailOf = (e) => { try { return JSON.parse(e?.detail ?? "{}"); } catch { return {}; } };

/** The plan row a confirmation or an accrual wrote, read at the source rather than off the door. */
export async function planRow(planId) {
  const r = await rootQuery(
    `select p.kind, p.status, p.purpose, p.authority_kind, p.authority_ref, p.authorised_by,
            p.created_by, p.firm_id, p.client_id, p.current_revision
       from clara.accounting_plans p where p.id = $1`, [planId]);
  return r.rows[0] ?? null;
}

/** The audit row 0193's verb writes, so a cell can read the `via` an entrance stamped. */
export async function planAuditVia(planId) {
  const r = await rootQuery(
    `select args ->> 'via' as via, args ->> 'kind' as kind
       from clara.audit_log
      where fn = 'create_accounting_plan' and args ->> 'plan' = $1
      order by at desc limit 1`, [planId]);
  return r.rows[0] ?? null;
}

export { createPrepaymentSchedule, createAccrualAdjustment, correctAccrualAdjustment, accrual, randomUUID, assert };
