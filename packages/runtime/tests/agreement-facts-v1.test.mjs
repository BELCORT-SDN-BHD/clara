// #948 — agreementFacts_v1, the agreement contract's own questionnaire family.
//
// THE SEAMS (WORK-ORDER rule 4 — the public interfaces the brief names):
//   P1. THE PROMPT. Its vocabulary is the database's, it carries the never-infer-never-compute
//       rule VERBATIM from the estate's ratified wording, it forbids summing AND classifying in
//       so many words, and its two channels hash differently (the persist door refuses a pair
//       that used one prompt).
//   P2. THE WIRE SCHEMA. Every question and every schedule cell takes a {state, raw} answer, and
//       `not_printed` is one of exactly two states.
//   P3. THE ENVELOPE HANDED TO THE WRITER. Exactly the three members
//       clara._agreement_answers_ok admits, with the printed repayment schedule carried (the
//       evaluator cannot sum quotes it was never given, and unlike the payslip lane the writer
//       KEEPS them) and the citation list narrowed to answers that were actually given.
//   P4. THE LANE GUARD AND THE FAILURE CLASSIFICATION. An agreement workflow never drives another
//       family's task, and a refusal is never retried into a second egress.
//   P5. ITS OWN CLOSURE. The family's frozen files import no other family's frozen file, and its
//       engine identity is the literal migration 0299 stamps.
//
// No database, no model, no workflow engine: every cell here drives a pure function.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  AGREEMENT_RUN_FIELDS,
  AGREEMENT_ROW_FIELDS,
  AGREEMENT_NON_MONETARY_FIELDS,
  AGREEMENT_TEXT_SYSTEM_PROMPT,
  AGREEMENT_VISION_SYSTEM_PROMPT,
  AGREEMENT_INERT_DATA_LINE,
  AGREEMENT_MAX_ROWS,
  buildAgreementTextPrompt,
  buildAgreementVisionPrompt,
  agreementPromptHash,
  agreementTextSchema,
  agreementVisionSchema,
} from "../workflows/agreementFacts.v1.prompts.mjs";
import {
  WITNESS_INERT_DATA_LINE,
  WITNESS_TEXT_SYSTEM_PROMPT,
} from "../workflows/witnessFacts.v3.prompts.mjs";
import {
  classifyAgreementFailure,
  interpretClaimReceipt,
  ownsAgreementLane,
  toWriterCitations,
  toWriterEnvelope,
} from "../workflows/agreementFacts.v1.behavior.mjs";
import { AGREEMENT_ENGINE_SNAPSHOT } from "../workflows/agreementFacts.v1.services.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const workflow = (name) => readFileSync(join(HERE, "..", "workflows", name), "utf8");

// ---------------------------------------------------------------------------
// P1 — the prompt
// ---------------------------------------------------------------------------

test("P1 · the questionnaire asks the ELEVEN questions and the FOUR schedule cells the database admits", () => {
  // Transcribed from #948's brief ("what was acquired, the cash price, the deposit or trade-in,
  // the amount financed, the term, the instalment ... each scheduled instalment with its
  // principal and interest split") plus the three a lane needs before it may act on any of them,
  // never read back out of the module under test.
  assert.deepEqual([...AGREEMENT_RUN_FIELDS], [
    "contract.agreement.kind",
    "contract.agreement.financier",
    "contract.agreement.agreement_date",
    "contract.agreement.asset_description",
    "contract.agreement.cash_price",
    "contract.agreement.deposit",
    "contract.agreement.amount_financed",
    "contract.agreement.total_charges",
    "contract.agreement.total_payable",
    "contract.agreement.term_months",
    "contract.agreement.instalment_amount",
  ]);
  assert.deepEqual([...AGREEMENT_ROW_FIELDS], [
    "contract.schedule.due_date",
    "contract.schedule.instalment",
    "contract.schedule.principal",
    "contract.schedule.interest",
  ]);
  // The five that are not money. The evaluator compares these as RENDERINGS, so a model that
  // reformatted one would manufacture a channel disagreement out of typography.
  assert.deepEqual([...AGREEMENT_NON_MONETARY_FIELDS], [
    "contract.agreement.kind",
    "contract.agreement.financier",
    "contract.agreement.agreement_date",
    "contract.agreement.asset_description",
    "contract.agreement.term_months",
  ]);
  // Every name is spelled out in BOTH system prompts, so a model is never asked for a field the
  // prompt did not name.
  for (const f of [...AGREEMENT_RUN_FIELDS, ...AGREEMENT_ROW_FIELDS]) {
    assert.ok(AGREEMENT_TEXT_SYSTEM_PROMPT.includes(f), `the text prompt names ${f}`);
    assert.ok(AGREEMENT_VISION_SYSTEM_PROMPT.includes(f), `the vision prompt names ${f}`);
  }
});

test("P1 · the never-infer-never-compute rule is carried VERBATIM from the estate's ratified wording", () => {
  // The two fragments that are NOT agreement-specific, read out of the INVOICE family's own live
  // prompt and required byte-for-byte here. A paraphrase would let the two drift; this cell is
  // what makes "verbatim" a checked fact.
  const ratified = [
    "NEVER INFER, NEVER COMPUTE. Report only what the document PRINTS.",
    "Do not add, subtract, or reconcile anything; a\n   deterministic evaluator does all arithmetic from your quotes.",
  ];
  for (const fragment of ratified) {
    assert.ok(WITNESS_TEXT_SYSTEM_PROMPT.includes(fragment),
      `mandatory setup: the invoice family's live prompt must carry ${JSON.stringify(fragment.slice(0, 40))} — if this fails, the ratified wording moved and this family must be re-pinned to it, not left behind`);
    assert.ok(AGREEMENT_TEXT_SYSTEM_PROMPT.includes(fragment), "the text prompt carries it verbatim");
    assert.ok(AGREEMENT_VISION_SYSTEM_PROMPT.includes(fragment), "the vision prompt carries it verbatim");
  }
  // The inert-data posture (PRD §6 law 5) is the same one sentence, byte-for-byte.
  assert.equal(AGREEMENT_INERT_DATA_LINE, WITNESS_INERT_DATA_LINE);
  assert.ok(AGREEMENT_TEXT_SYSTEM_PROMPT.includes(AGREEMENT_INERT_DATA_LINE));
  assert.ok(AGREEMENT_VISION_SYSTEM_PROMPT.includes(AGREEMENT_INERT_DATA_LINE));
});

test("P1 · the prompt forbids summing AND classifying in so many words, on both channels", () => {
  for (const [name, prompt] of [["text", AGREEMENT_TEXT_SYSTEM_PROMPT], ["vision", AGREEMENT_VISION_SYSTEM_PROMPT]]) {
    assert.ok(prompt.includes("YOU NEVER SUM AND YOU NEVER SUBTRACT."), `${name}: the rule is stated, not implied`);
    assert.ok(prompt.includes("do NOT tell you the amount financed"),
      `${name}: …with the worked example a model would otherwise close by subtraction`);
    assert.ok(prompt.includes("YOU NEVER CLASSIFY."),
      `${name}: …and the second rule, which is the other half of the same owner decision`);
    assert.ok(prompt.includes("quote the words the page"),
      `${name}: …saying what to do INSTEAD of classifying`);
    assert.ok(prompt.includes("not as a zero"), `${name}: an unanswered question is never filled with zero`);
    assert.ok(prompt.includes("never zero"), `${name}: …nor is an unstated deposit`);
  }
});

test("P1 · the two channels hash differently — one prompt read twice is not two readings", () => {
  const text = agreementPromptHash("text");
  const vision = agreementPromptHash("vision");
  assert.match(text, /^[0-9a-f]{64}$/);
  assert.match(vision, /^[0-9a-f]{64}$/);
  assert.notEqual(text, vision,
    "clara.persist_agreement_facts refuses a pair whose two channels used one prompt hash");
  // Stable across calls: the hash identifies the prompt, not the moment.
  assert.equal(agreementPromptHash("text"), text);
});

test("P1 · the text prompt presents the DATABASE's own region numbering, and truncates without renumbering", () => {
  const regions = [
    { idx: 1, page: 1, text: "HIRE PURCHASE AGREEMENT" },
    { idx: 2, page: 1, text: "CASH PRICE   120,000.00" },
    { idx: 3, page: 2, text: "TOTAL PAYABLE  108,400.00" },
  ];
  const built = buildAgreementTextPrompt({ regions });
  assert.equal(built.shown, 3);
  assert.equal(built.truncated, false);
  assert.ok(built.prompt.includes("[1] p1 HIRE PURCHASE AGREEMENT"));
  assert.ok(built.prompt.includes("[3] p2 TOTAL PAYABLE 108,400.00"));

  // A block that overruns the bound drops regions from the END and says so; the numbers of the
  // regions that ARE shown never move, because the idx is the database's and not a position.
  const many = Array.from({ length: 5000 }, (_, i) => ({ idx: i + 1, page: 1, text: "X".repeat(40) }));
  const big = buildAgreementTextPrompt({ regions: many });
  assert.equal(big.truncated, true);
  assert.ok(big.shown < many.length);
  assert.ok(big.prompt.includes("[1] p1 " + "X".repeat(40)));
  assert.ok(big.prompt.includes("truncated for length"));

  assert.ok(buildAgreementVisionPrompt().includes("Read this agreement."));
});

// ---------------------------------------------------------------------------
// P2 — the wire schema
// ---------------------------------------------------------------------------

function modelObject({ rows = [], citations = [], runOverrides = {} } = {}) {
  const answers = {};
  for (const f of AGREEMENT_RUN_FIELDS) answers[f] = { state: "value", raw: "1.00" };
  Object.assign(answers, runOverrides);
  return { answers, rows, citations };
}

function modelRow(rowNo, overrides = {}) {
  const cells = {};
  for (const f of AGREEMENT_ROW_FIELDS) cells[f] = { state: "value", raw: "1.00" };
  Object.assign(cells, overrides);
  return { row_no: rowNo, cells };
}

test("P2 · the wire schema takes an answer for every question, admits `not_printed`, and refuses a third state", () => {
  const ok = agreementTextSchema.safeParse(modelObject({
    rows: [modelRow(1), modelRow(2)],
    citations: [{ field_path: "contract.agreement.cash_price", region_idx: 1 }],
    runOverrides: { "contract.agreement.total_charges": { state: "not_printed", raw: null } },
  }));
  assert.equal(ok.success, true, JSON.stringify(ok.error?.issues));

  const missing = modelObject({ rows: [] });
  delete missing.answers["contract.agreement.total_payable"];
  assert.equal(agreementTextSchema.safeParse(missing).success, false, "an unanswered question is refused at the wire");

  const thirdState = modelObject({ rows: [], runOverrides: { "contract.agreement.deposit": { state: "estimated", raw: "1.00" } } });
  assert.equal(agreementTextSchema.safeParse(thirdState).success, false, "there is no third state");

  const shortRow = modelObject({ rows: [modelRow(1)] });
  delete shortRow.rows[0].cells["contract.schedule.interest"];
  assert.equal(agreementTextSchema.safeParse(shortRow).success, false, "a row quoting three of four cells is refused");

  // A citation may only name a question this family asks — the schema is the first belt, and
  // clara._agreement_answers_ok is the second.
  const badCitation = modelObject({ rows: [], citations: [{ field_path: "contract.schedule.instalment", region_idx: 1 }] });
  assert.equal(agreementTextSchema.safeParse(badCitation).success, false, "a schedule cell is not a citable question");

  // The vision channel takes the same answers and rows and NO citations.
  const visionOk = agreementVisionSchema.safeParse({ answers: modelObject().answers, rows: [modelRow(1)] });
  assert.equal(visionOk.success, true, JSON.stringify(visionOk.error?.issues));
});

// ---------------------------------------------------------------------------
// P3 — the envelope handed to the writer
// ---------------------------------------------------------------------------

test("P3 · the writer envelope is exactly the three members the database admits, and carries the schedule", () => {
  const env = toWriterEnvelope("text", modelObject({ rows: [modelRow(1), modelRow(2)] }));
  assert.deepEqual(Object.keys(env), ["contract"]);
  assert.deepEqual(Object.keys(env.contract).sort(), ["answers", "channel", "rows"]);
  assert.equal(env.contract.channel, "text");
  assert.equal(Object.keys(env.contract.answers).length, AGREEMENT_RUN_FIELDS.length);
  assert.equal(env.contract.rows.length, 2,
    "the printed repayment schedule is CARRIED — the evaluator cannot sum quotes it was never given, and the writer keeps them");
  assert.deepEqual(Object.keys(env.contract.rows[0]).sort(), ["cells", "row_no"]);

  // A model that returns no rows at all is a lawful reading of a one-page agreement.
  assert.deepEqual(toWriterEnvelope("vision", modelObject()).contract.rows, []);
  assert.equal(toWriterEnvelope("vision", modelObject()).contract.channel, "vision");

  // The row bound is the database's own: a schedule larger than it is not silently widened here.
  const huge = toWriterEnvelope("text", modelObject({
    rows: Array.from({ length: AGREEMENT_MAX_ROWS + 50 }, (_, i) => modelRow(i + 1)),
  }));
  assert.equal(huge.contract.rows.length, AGREEMENT_MAX_ROWS);
});

test("P3 · a citation naming an answer the model did not give is dropped — a pointer to nothing is not evidence", () => {
  const object = modelObject({
    rows: [],
    runOverrides: { "contract.agreement.total_charges": { state: "not_printed", raw: null } },
    citations: [
      { field_path: "contract.agreement.cash_price", region_idx: 3 },
      { field_path: "contract.agreement.total_charges", region_idx: 9 },  // answered not_printed
      { field_path: "contract.agreement.cash_price", region_idx: 4 },     // a second claim on one figure
      { field_path: "contract.agreement.deposit" },                       // no region index at all
    ],
  });
  assert.deepEqual(toWriterCitations(object), [{ field_path: "contract.agreement.cash_price", region_idx: 3 }]);
});

// ---------------------------------------------------------------------------
// P4 — the lane guard and the failure classification
// ---------------------------------------------------------------------------

test("P4 · an agreement workflow drives contract_facts tasks and nothing else", () => {
  const doc = { lane: "contract_facts", storage_path: "s", sha256: "a" };
  assert.equal(ownsAgreementLane(doc), true);
  assert.equal(ownsAgreementLane({ ...doc, lane: "payroll_facts" }), false, "another family's task is never driven here");
  assert.equal(ownsAgreementLane({ ...doc, lane: "llm_witness" }), false);
  assert.equal(ownsAgreementLane({ ...doc, storage_path: null }), false);
  assert.equal(ownsAgreementLane(null), false);

  assert.deepEqual(interpretClaimReceipt({ status: "running", document_id: "d", firm_id: "f", lane: "contract_facts", storage_path: "s", sha256: "a", mime_type: "application/pdf", byte_size: 10 }), {
    claimed: true,
    status: "running",
    doc: { document_id: "d", firm_id: "f", lane: "contract_facts", storage_path: "s", sha256: "a", mime_type: "application/pdf", byte_size: 10 },
  });
  assert.deepEqual(interpretClaimReceipt({ status: "held_egress" }), { claimed: false, status: "held_egress", doc: null });
});

test("P4 · a refusal is terminal, a vendor fault retries, and the unknown fails closed", () => {
  assert.deepEqual(classifyAgreementFailure(Object.assign(new Error("x"), { code: "engine_error" })), { retry: true, code: "engine_error" });
  assert.deepEqual(classifyAgreementFailure(Object.assign(new Error("x"), { code: "timeout" })), { retry: true, code: "timeout" });
  assert.deepEqual(classifyAgreementFailure(Object.assign(new Error("x"), { code: "internal", claraRetry: true })), { retry: true, code: "internal" },
    "a WAIT is a retry: a deploy window is not a fact about the document");
  assert.deepEqual(classifyAgreementFailure(Object.assign(new Error("x"), { code: "agreement_consent_inactive", agreementRefusal: true })), { retry: false, code: "agreement_consent_inactive" },
    "consent is a decision, not a fault — never retried into a second egress");
  assert.deepEqual(classifyAgreementFailure(Object.assign(new Error("x"), { code: "internal" })), { retry: false, code: "internal" },
    "the unknown fails CLOSED");
});

// ---------------------------------------------------------------------------
// P5 — its own closure
// ---------------------------------------------------------------------------

test("P5 · the family's FROZEN files import no other family's frozen file", () => {
  // #948's own first acceptance criterion: the questionnaire lives "in a frozen closure of its
  // own". Read as bytes, so a future edit that reached for a witness or payroll module goes red
  // here rather than at review.
  const frozen = [
    "agreementFacts.v1.ts",
    "agreementFacts.v1.impl.ts",
    "agreementFacts.v1.behavior.mjs",
    "agreementFacts.v1.dispatch.mjs",
    "agreementFacts.v1.prompts.mjs",
  ];
  // Assembled rather than written out: freeze-lint discovers its entry files by scanning for this
  // exact marker, so a test that spelled it literally would enrol ITSELF (and its whole import
  // closure) into the frozen manifest — #945's own measured lesson, restated here because the
  // trap is invisible.
  const MARKER = `// ${"@"}frozen`;
  for (const name of frozen) {
    const src = workflow(name);
    assert.ok(src.startsWith(MARKER), `${name} declares itself frozen`);
    const imports = [...src.matchAll(/^import[^;]*from\s+"([^"]+)"/gm)].map((m) => m[1]);
    for (const spec of imports) {
      assert.equal(
        /witnessFacts|statementFacts|invoiceFacts|payrollFacts|autoDraft|chatTurn|claraWork/.test(spec), false,
        `${name} imports ${spec} — a frozen agreement file may not couple to another family's closure`,
      );
    }
  }
  // The SERVICES module is not frozen and DOES share the provider adapter — that is
  // infrastructure, not a questionnaire, and the sharing is deliberate.
  const services = workflow("agreementFacts.v1.services.mjs");
  assert.equal(services.startsWith(MARKER), false, "the services bundle is config, not a frozen body");
  assert.ok(services.includes("witnessFacts.v2.services.mjs"), "…and it is where the shared adapter is reached");
});

test("P5 · the engine identity is the family's own, and it is the literal the router stamps", () => {
  assert.equal(AGREEMENT_ENGINE_SNAPSHOT.engineId, "llm-openai:gpt-5.6-terra:agreement-witness-v1");
  assert.match(AGREEMENT_ENGINE_SNAPSHOT.engineId, /^llm-/,
    "migration 0299's lane<->engine CHECK refuses a contract_facts task whose engine_id is not llm-%");
  // Read the DB side independently — the migration's own routing arm — and assert the two agree.
  // A drift here STALLS the lane (the behaviour waits rather than mis-stamping), so it is worth
  // catching at unit time.
  const migration = readFileSync(
    join(HERE, "..", "..", "db", "migrations", "0299_agreement_contract_acquisition.sql"), "utf8");
  assert.ok(
    migration.includes(`v_engine:='${AGREEMENT_ENGINE_SNAPSHOT.engineId}'`),
    "the router's agreement arm must stamp exactly the engine id this image calls",
  );
});
