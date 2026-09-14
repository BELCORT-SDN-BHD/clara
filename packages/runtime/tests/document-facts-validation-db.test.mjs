// #624 — PERSISTED ARITHMETIC VALIDATION, on the real witness lane.
//
// Before 0191, arithmetic validity was a READ-TIME verdict only: `clara._invoice_fact_state`
// re-derives the six-term identity on every call and returns a boolean. Nothing on any surface
// could say WHICH check failed, and a historical reading could not be told from a current one.
// 0191 records one append-only row per (facts extraction x named check) through a DEFERRABLE
// constraint trigger, so no live persist body was recut to get it.
//
// THIS BATTERY DRIVES THE REAL WRITER. `clara.persist_witness_facts` is called through
// `persistWitnessPair` — the same path production takes — against a real migrated Postgres. The
// ONLY thing mocked is the MODEL, through the same `__claraModelForTest` override every other
// model lane in this runtime uses. That matters here more than usual: the whole claim is that
// the validation row is written BY THE PERSIST'S OWN TRANSACTION, so a test that inserted the
// facts by hand would prove nothing about the trigger's timing.
//
// THE THREE THINGS A FAILED CHECK MUST NOT DO (#624 acceptance 2 — "invalid or partial facts
// remain visible and block only dependent work"):
//   1. it must not hide the facts;
//   2. it must not refuse the persist;
//   3. it must not be silent about WHICH check failed.

process.env.RELAY_TEST_MODE ??= "1";

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import * as fx from "./relay-fixtures.mjs";
import {
  buildWitnessSituation, readExtractions, readFactRegions, readWitnessState,
  witnessMock, witnessServices, witnessWire,
} from "./f-a1-witness-fixtures.mjs";
import {
  persistWitnessPair, runWitnessTextRead, runWitnessVisionRead,
} from "../workflows/witnessFacts.v1.behavior.mjs";

const READY = await ready();
const skip = READY ? false : "the #624 validation surface (clara.document_fact_validations) or the F-A1 witness estate is absent";
const withRuntime = (fn) => fx.asRuntime(fn);
let tmpRoot;
const services = () => witnessServices(tmpRoot);

async function ready() {
  const r = await fx.rootQuery(
    `select to_regclass('clara.document_fact_validations') is not null
        and to_regprocedure('clara.persist_witness_facts(uuid,jsonb,jsonb,int)') is not null
        and to_regprocedure('clara.get_document_state(uuid,uuid)') is not null as ok`);
  return r.rows[0].ok === true;
}

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  tmpRoot = await mkdtemp(join(base, "clara-624-"));
});
after(async () => {
  delete globalThis.__claraModelForTest;
  await fx.endPool();
  await rm(tmpRoot, { recursive: true, force: true });
});

/** A CLOSING invoice: 94.30 net + 3.77 service + 5.66 tax + 0.02 rounding = 103.75 gross. */
const CLOSING_REGIONS = [
  { label: "total", text: "TOTAL DUE RM 103.75 nett" },
  { label: "net", text: "SUBTOTAL RM 94.30" },
  { label: "tax", text: "SST 6% RM 5.66" },
  { label: "svc", text: "SERVICE CHARGE RM 3.77" },
  { label: "round", text: "ROUNDING ADJ RM 0.02" },
  { label: "ccy", text: "Currency stated: MYR only" },
  { label: "type", text: "Doc Type Code: 01" },
];

/** The SAME document with a printed gross that does not follow from its own components — the
 *  real-world shape (a transcription slip, a vendor's own arithmetic error, a model misreading
 *  one digit). 94.30 + 3.77 + 5.66 + 0.02 = 103.75, but the document says 111.11. */
const BROKEN_REGIONS = CLOSING_REGIONS.map((r) =>
  (r.label === "total" ? { ...r, text: "TOTAL DUE RM 111.11 nett" } : r));

const citationsFor = (s) => [
  { field_path: "invoice.total", region_idx: s.idxOf.total, raw: null },
  { field_path: "invoice.total_excl_tax", region_idx: s.idxOf.net, raw: null },
  { field_path: "invoice.tax_total", region_idx: s.idxOf.tax, raw: null },
  { field_path: "invoice.service_charge", region_idx: s.idxOf.svc, raw: null },
  { field_path: "invoice.rounding", region_idx: s.idxOf.round, raw: null },
  { field_path: "invoice.currency", region_idx: s.idxOf.ccy, raw: null },
  { field_path: "invoice.type_code", region_idx: s.idxOf.type, raw: null },
];

const validationsFor = (documentId) =>
  fx.rootQuery(
    `select check_name, outcome, detail, extraction_id, statement_id, engine_id
       from clara.document_fact_validations where document_id=$1 order by check_name`,
    [documentId]).then((r) => r.rows);

/** Persist one witness pair through the REAL behaviour, with `wire` as both channels' answers. */
async function persistPair(s, wire) {
  witnessMock({ text: { ...wire, citations: citationsFor(s) }, vision: wire });
  const textRead = await runWitnessTextRead(services(), withRuntime, s.taskId, s.claimDoc);
  const visionRead = await runWitnessVisionRead(services(), withRuntime, s.taskId, s.claimDoc);
  await persistWitnessPair(services(), withRuntime, s.taskId, textRead, visionRead);
}

test("#624 a witness persist whose SIX-TERM IDENTITY fails writes a `fail` validation row naming the check", { skip }, async () => {
  const s = await buildWitnessSituation("validfail", { regions: BROKEN_REGIONS });
  await persistPair(s, witnessWire({ "invoice.total": { state: "value", raw: "RM 111.11" } }));

  const rows = await validationsFor(s.documentId);
  const identity = rows.filter((r) => r.check_name === "invoice.six_term_identity");
  assert.equal(identity.length, 1, "exactly one identity row per persist");
  assert.equal(identity[0].outcome, "fail",
    "94.30 + 3.77 + 5.66 + 0.02 is 103.75, not 111.11 — the check must SAY so");
  assert.equal(identity[0].detail.total_cents, 11111);
  assert.equal(identity[0].detail.total_excl_tax_cents, 9430);
  assert.equal(identity[0].detail.tax_total_cents, 566);
  assert.equal(identity[0].detail.residual_cents, -736,
    "the residual is recorded, so the failure is diagnosable without re-deriving it");
  assert.ok(identity[0].engine_id, "the row records which engine produced the reading it judged");
  assert.ok(identity[0].extraction_id, "and which extraction's regions it read");
});

test("#624 a failing check does NOT hide the facts and does NOT refuse the persist", { skip }, async () => {
  const s = await buildWitnessSituation("visible", { regions: BROKEN_REGIONS });
  await persistPair(s, witnessWire({ "invoice.total": { state: "value", raw: "RM 111.11" } }));

  const extractions = (await readExtractions(s.documentId)).filter((e) => e.engine_kind.startsWith("llm_"));
  assert.equal(extractions.length, 2, "the witness PAIR persisted whole — a failing check is not a refusal");
  const text = extractions.find((e) => e.engine_kind === "llm_text_facts");
  const regions = await readFactRegions(text.id);
  const paths = regions.map((r) => r.field_path);
  assert.ok(paths.includes("invoice.total"), "the disputed total is STILL READABLE");
  assert.ok(paths.includes("invoice.total_excl_tax"));
  assert.ok(paths.includes("invoice.tax_total"));
  const total = regions.find((r) => r.field_path === "invoice.total");
  assert.equal(Number(total.monetary_cents), 11111,
    "the recorded value is the one the document states, never a value corrected to make a check pass");
});

test("#624 a failing check blocks DEPENDENT work: the fact-state predicate refuses corroboration", { skip }, async () => {
  const s = await buildWitnessSituation("blocks", { regions: BROKEN_REGIONS });
  await persistPair(s, witnessWire({ "invoice.total": { state: "value", raw: "RM 111.11" } }));

  const extractions = (await readExtractions(s.documentId)).filter((e) => e.engine_kind.startsWith("llm_"));
  const textId = extractions.find((e) => e.engine_kind === "llm_text_facts").id;
  const visionId = extractions.find((e) => e.engine_kind === "llm_vision_facts").id;
  const verdict = await readWitnessState(s.documentId, textId, visionId);
  assert.equal(verdict.corroborated, false,
    "clara._invoice_fact_state remains the authority over dependent work — the validation row makes the reason visible, it does not replace the gate");

  // …and nothing downstream was minted off a document whose own arithmetic does not tie.
  const coding = await fx.rootQuery(
    "select count(*)::int as n from clara.coding_tasks where document_id=$1", [s.documentId]);
  assert.equal(coding.rows[0].n, 0, "no coding task is admitted for a document that fails its own identity");
});

test("#624 a CLOSING invoice records `pass` on the same check — the differential that proves the fail was earned", { skip }, async () => {
  const s = await buildWitnessSituation("validpass", { regions: CLOSING_REGIONS });
  await persistPair(s, witnessWire());

  const rows = await validationsFor(s.documentId);
  const identity = rows.find((r) => r.check_name === "invoice.six_term_identity");
  assert.ok(identity, "the same check runs on a closing document");
  assert.equal(identity.outcome, "pass");
  assert.equal(identity.detail.residual_cents, 0);
});

test("#624 the validation row is APPEND-ONLY and is written exactly once per extraction", { skip }, async () => {
  const s = await buildWitnessSituation("appendonly", { regions: CLOSING_REGIONS });
  await persistPair(s, witnessWire());
  const first = await validationsFor(s.documentId);
  assert.equal(first.length, 1);

  // Application roles hold SELECT and nothing else; the row cannot be edited into a pass.
  const grants = await fx.rootQuery(`select
      has_table_privilege('clara_authenticated','clara.document_fact_validations','UPDATE') as u,
      has_table_privilege('clara_authenticated','clara.document_fact_validations','DELETE') as d,
      has_table_privilege('clara_runtime','clara.document_fact_validations','UPDATE') as ru`);
  assert.equal(grants.rows[0].u, false);
  assert.equal(grants.rows[0].d, false);
  assert.equal(grants.rows[0].ru, false, "not even the lane that produced the facts can revise the verdict on them");
});

test("#624 clara.get_document_state publishes the failing check to the surface that must render it", { skip }, async () => {
  const s = await buildWitnessSituation("readback", { regions: BROKEN_REGIONS });
  await persistPair(s, witnessWire({ "invoice.total": { state: "value", raw: "RM 111.11" } }));

  // THROUGH THE HUMAN DOOR, not as root. `clara.get_document_state` resolves its own scope from
  // `clara._human_ctx(role_rank('viewer'))` — a root session carries no actor and is refused
  // CLR04, which is the read behaving correctly. Reading it as the firm's owner is what the
  // workbench does.
  const state = (await fx.humanQuery(s.owner,
    "select clara.get_document_state($1,$2) as s", [s.documentId, s.client])).rows[0].s;
  assert.ok(state, "the document is filed to this client, so the state read admits it");
  assert.equal(state.facts.capability, "supported", "pdf x invoice is a facts-supported pair");
  const failing = state.facts.validations.filter((v) => v.outcome === "fail");
  assert.deepEqual(failing.map((v) => v.check_name), ["invoice.six_term_identity"]);
  assert.ok(state.facts.extractions.some((e) => e.engine_kind === "llm_text_facts" && e.region_count > 0),
    "the facts and their source version travel with the verdict, so the panel can show both");
  assert.equal(state.capability.limits.invoice_line_items, "planned",
    "the invoice line-item deferral rides the same read, so 'facts recorded' can never overstate what was read");
});
