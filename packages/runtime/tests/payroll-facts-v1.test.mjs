// #945 — payrollFacts_v1, the payroll summary's own questionnaire family.
//
// THE SEAMS (WORK-ORDER rule 4 — the public interfaces the brief names):
//   P1. THE PROMPT. Its vocabulary is the database's, it carries the never-infer-never-compute
//       rule VERBATIM from the estate's ratified wording, it forbids summing in so many words,
//       and its two channels hash differently (the persist door refuses a pair that used one
//       prompt).
//   P2. THE WIRE SCHEMA. Every run-level question and every row cell takes a {state, raw}
//       answer, and `not_printed` is one of exactly two states.
//   P3. THE ENVELOPE HANDED TO THE WRITER. Exactly the three members
//       clara._payroll_answers_ok admits, with the per-employee rows carried (the evaluator
//       cannot sum quotes it was never given) and the citation list narrowed to figures that
//       were actually answered.
//   P4. THE LANE GUARD AND THE FAILURE CLASSIFICATION. A payroll workflow never drives another
//       family's task, and a refusal is never retried into a second egress.
//   P5. ITS OWN CLOSURE. The family's frozen files import no other family's frozen file.
//
// No database, no model, no workflow engine: every cell here drives a pure function.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  PAYROLL_RUN_FIELDS,
  PAYROLL_ROW_FIELDS,
  PAYROLL_TEXT_SYSTEM_PROMPT,
  PAYROLL_VISION_SYSTEM_PROMPT,
  PAYROLL_INERT_DATA_LINE,
  PAYROLL_MAX_ROWS,
  buildPayrollTextPrompt,
  buildPayrollVisionPrompt,
  payrollPromptHash,
  payrollTextSchema,
  payrollVisionSchema,
} from "../workflows/payrollFacts.v1.prompts.mjs";
import {
  WITNESS_INERT_DATA_LINE,
  WITNESS_TEXT_SYSTEM_PROMPT,
} from "../workflows/witnessFacts.v3.prompts.mjs";
import {
  classifyPayrollFailure,
  interpretClaimReceipt,
  ownsPayrollLane,
  toWriterCitations,
  toWriterEnvelope,
} from "../workflows/payrollFacts.v1.behavior.mjs";
import { PAYROLL_ENGINE_SNAPSHOT } from "../workflows/payrollFacts.v1.services.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const workflow = (name) => readFileSync(join(HERE, "..", "workflows", name), "utf8");

// ---------------------------------------------------------------------------
// P1 — the prompt
// ---------------------------------------------------------------------------

test("P1 · the questionnaire asks the ELEVEN run-level questions and the SIX row cells the database admits", () => {
  // Transcribed from #945's brief ("the month, and the totals for gross pay, employee and
  // employer EPF, employee and employer SOCSO, employee and employer EIS, PCB, any HRDF levy,
  // and net pay"), never read back out of the module under test.
  assert.deepEqual([...PAYROLL_RUN_FIELDS], [
    "payroll.run.period",
    "payroll.run.gross_pay",
    "payroll.run.epf_employee",
    "payroll.run.epf_employer",
    "payroll.run.socso_employee",
    "payroll.run.socso_employer",
    "payroll.run.eis_employee",
    "payroll.run.eis_employer",
    "payroll.run.pcb",
    "payroll.run.hrdf_levy",
    "payroll.run.net_pay",
  ]);
  assert.deepEqual([...PAYROLL_ROW_FIELDS], [
    "payroll.row.gross_pay",
    "payroll.row.epf_employee",
    "payroll.row.socso_employee",
    "payroll.row.eis_employee",
    "payroll.row.pcb",
    "payroll.row.net_pay",
  ]);
  // Every name is spelled out in BOTH system prompts, so a model is never asked for a field the
  // prompt did not name.
  for (const f of [...PAYROLL_RUN_FIELDS, ...PAYROLL_ROW_FIELDS]) {
    assert.ok(PAYROLL_TEXT_SYSTEM_PROMPT.includes(f), `the text prompt names ${f}`);
    assert.ok(PAYROLL_VISION_SYSTEM_PROMPT.includes(f), `the vision prompt names ${f}`);
  }
});

test("P1 · the never-infer-never-compute rule is carried VERBATIM from the estate's ratified wording", () => {
  // The two fragments that are NOT payroll-specific, read out of the INVOICE family's own live
  // prompt and required byte-for-byte here. A paraphrase would let the two drift; this cell is
  // what makes "verbatim" a checked fact.
  const ratified = [
    "NEVER INFER, NEVER COMPUTE. Report only what the document PRINTS.",
    "Do not add, subtract, or reconcile anything; a\n   deterministic evaluator does all arithmetic from your quotes.",
  ];
  for (const fragment of ratified) {
    assert.ok(WITNESS_TEXT_SYSTEM_PROMPT.includes(fragment),
      `mandatory setup: the invoice family's live prompt must carry ${JSON.stringify(fragment.slice(0, 40))} — if this fails, the ratified wording moved and this family must be re-pinned to it, not left behind`);
    assert.ok(PAYROLL_TEXT_SYSTEM_PROMPT.includes(fragment), `the text prompt carries it verbatim`);
    assert.ok(PAYROLL_VISION_SYSTEM_PROMPT.includes(fragment), `the vision prompt carries it verbatim`);
  }
  // The inert-data posture (PRD §6 law 5) is the same one sentence, byte-for-byte.
  assert.equal(PAYROLL_INERT_DATA_LINE, WITNESS_INERT_DATA_LINE);
  assert.ok(PAYROLL_TEXT_SYSTEM_PROMPT.includes(PAYROLL_INERT_DATA_LINE));
  assert.ok(PAYROLL_VISION_SYSTEM_PROMPT.includes(PAYROLL_INERT_DATA_LINE));
});

test("P1 · the prompt forbids summing in so many words, on both channels", () => {
  for (const [name, prompt] of [["text", PAYROLL_TEXT_SYSTEM_PROMPT], ["vision", PAYROLL_VISION_SYSTEM_PROMPT]]) {
    assert.ok(prompt.includes("YOU NEVER SUM."), `${name}: the rule is stated, not implied`);
    assert.ok(prompt.includes("Do NOT add a"), `${name}: …and says what not to do with a column`);
    assert.ok(prompt.includes("A STATUTORY RATE IS NEVER YOURS TO APPLY."),
      `${name}: …and forbids applying a rate the model happens to know`);
    assert.ok(prompt.includes("it is NEVER a figure you worked out and"),
      `${name}: …and says an unprinted contribution is never derived`);
    assert.ok(prompt.includes("not as a zero"), `${name}: …and never filled with zero`);
  }
});

test("P1 · the two channels hash differently — one prompt read twice is not two readings", () => {
  const text = payrollPromptHash("text");
  const vision = payrollPromptHash("vision");
  assert.match(text, /^[0-9a-f]{64}$/);
  assert.match(vision, /^[0-9a-f]{64}$/);
  assert.notEqual(text, vision,
    "clara.persist_payroll_facts refuses a pair whose two channels used one prompt hash");
  // Stable across calls: the hash identifies the prompt, not the moment.
  assert.equal(payrollPromptHash("text"), text);
});

test("P1 · the text prompt presents the DATABASE's own region numbering, and truncates without renumbering", () => {
  const regions = [
    { idx: 1, page: 1, text: "GROSS  5,000.00" },
    { idx: 2, page: 1, text: "EPF (EMPLOYEE)   550.00" },
    { idx: 3, page: 2, text: "NET  4,255.70" },
  ];
  const built = buildPayrollTextPrompt({ regions });
  assert.equal(built.shown, 3);
  assert.equal(built.truncated, false);
  assert.ok(built.prompt.includes("[1] p1 GROSS 5,000.00"));
  assert.ok(built.prompt.includes("[3] p2 NET 4,255.70"));

  // A block that overruns the bound drops regions from the END and says so; the numbers of the
  // regions that ARE shown never move, because the idx is the database's and not a position.
  const many = Array.from({ length: 5000 }, (_, i) => ({ idx: i + 1, page: 1, text: "X".repeat(40) }));
  const big = buildPayrollTextPrompt({ regions: many });
  assert.equal(big.truncated, true);
  assert.ok(big.shown < many.length);
  assert.ok(big.prompt.includes("[1] p1 " + "X".repeat(40)));
  assert.ok(big.prompt.includes("truncated for length"));

  assert.ok(buildPayrollVisionPrompt().includes("Read this payroll summary page."));
});

// ---------------------------------------------------------------------------
// P2 — the wire schema
// ---------------------------------------------------------------------------

function modelObject({ rows = [], citations = [], runOverrides = {} } = {}) {
  const answers = {};
  for (const f of PAYROLL_RUN_FIELDS) answers[f] = { state: "value", raw: "1.00" };
  Object.assign(answers, runOverrides);
  return { answers, rows, citations };
}

function modelRow(rowNo, overrides = {}) {
  const cells = {};
  for (const f of PAYROLL_ROW_FIELDS) cells[f] = { state: "value", raw: "1.00" };
  Object.assign(cells, overrides);
  return { row_no: rowNo, cells };
}

test("P2 · the wire schema takes an answer for every question, admits `not_printed`, and refuses a third state", () => {
  const ok = payrollTextSchema.safeParse(modelObject({
    rows: [modelRow(1), modelRow(2)],
    citations: [{ field_path: "payroll.run.gross_pay", region_idx: 1 }],
    runOverrides: { "payroll.run.hrdf_levy": { state: "not_printed", raw: null } },
  }));
  assert.equal(ok.success, true, JSON.stringify(ok.error?.issues));

  const missing = modelObject({ rows: [] });
  delete missing.answers["payroll.run.net_pay"];
  assert.equal(payrollTextSchema.safeParse(missing).success, false, "an unanswered question is refused at the wire");

  const thirdState = modelObject({ rows: [], runOverrides: { "payroll.run.pcb": { state: "estimated", raw: "1.00" } } });
  assert.equal(payrollTextSchema.safeParse(thirdState).success, false, "there is no third state");

  const shortRow = modelObject({ rows: [modelRow(1)] });
  delete shortRow.rows[0].cells["payroll.row.pcb"];
  assert.equal(payrollTextSchema.safeParse(shortRow).success, false, "a row quoting five of six cells is refused");

  // The vision channel takes the same answers and rows and NO citations.
  const visionOk = payrollVisionSchema.safeParse({ answers: modelObject().answers, rows: [modelRow(1)] });
  assert.equal(visionOk.success, true, JSON.stringify(visionOk.error?.issues));
});

// ---------------------------------------------------------------------------
// P3 — the envelope handed to the writer
// ---------------------------------------------------------------------------

test("P3 · the writer envelope is exactly the three members the database admits, and carries the rows", () => {
  const env = toWriterEnvelope("text", modelObject({ rows: [modelRow(1), modelRow(2)] }));
  assert.deepEqual(Object.keys(env), ["payroll"]);
  assert.deepEqual(Object.keys(env.payroll).sort(), ["answers", "channel", "rows"]);
  assert.equal(env.payroll.channel, "text");
  assert.equal(Object.keys(env.payroll.answers).length, PAYROLL_RUN_FIELDS.length);
  assert.equal(env.payroll.rows.length, 2, "the per-employee quotes are CARRIED — the evaluator cannot sum quotes it was never given");
  assert.deepEqual(Object.keys(env.payroll.rows[0]).sort(), ["cells", "row_no"]);

  // A model that returns no rows at all is a lawful reading of a summary-only page.
  assert.deepEqual(toWriterEnvelope("vision", modelObject()).payroll.rows, []);
  assert.equal(toWriterEnvelope("vision", modelObject()).payroll.channel, "vision");

  // The row bound is the database's own: a run larger than it is not silently widened here.
  const huge = toWriterEnvelope("text", modelObject({
    rows: Array.from({ length: PAYROLL_MAX_ROWS + 50 }, (_, i) => modelRow(i + 1)),
  }));
  assert.equal(huge.payroll.rows.length, PAYROLL_MAX_ROWS);
});

test("P3 · a citation naming a figure the model did not answer is dropped — a pointer to nothing is not evidence", () => {
  const object = modelObject({
    rows: [],
    runOverrides: { "payroll.run.hrdf_levy": { state: "not_printed", raw: null } },
    citations: [
      { field_path: "payroll.run.gross_pay", region_idx: 3 },
      { field_path: "payroll.run.hrdf_levy", region_idx: 9 },   // answered not_printed
      { field_path: "payroll.run.gross_pay", region_idx: 4 },   // a second claim on one figure
      { field_path: "payroll.run.pcb" },                        // no region index at all
    ],
  });
  assert.deepEqual(toWriterCitations(object), [{ field_path: "payroll.run.gross_pay", region_idx: 3 }]);
});

// ---------------------------------------------------------------------------
// P4 — the lane guard and the failure classification
// ---------------------------------------------------------------------------

test("P4 · a payroll workflow drives payroll tasks and nothing else", () => {
  const doc = { lane: "payroll_facts", storage_path: "s", sha256: "a" };
  assert.equal(ownsPayrollLane(doc), true);
  assert.equal(ownsPayrollLane({ ...doc, lane: "llm_witness" }), false, "another family's task is never driven here");
  assert.equal(ownsPayrollLane({ ...doc, storage_path: null }), false);
  assert.equal(ownsPayrollLane(null), false);

  assert.deepEqual(interpretClaimReceipt({ status: "running", document_id: "d", firm_id: "f", lane: "payroll_facts", storage_path: "s", sha256: "a", mime_type: "application/pdf", byte_size: 10 }), {
    claimed: true,
    status: "running",
    doc: { document_id: "d", firm_id: "f", lane: "payroll_facts", storage_path: "s", sha256: "a", mime_type: "application/pdf", byte_size: 10 },
  });
  assert.deepEqual(interpretClaimReceipt({ status: "held_egress" }), { claimed: false, status: "held_egress", doc: null });
});

test("P4 · a refusal is terminal, a vendor fault retries, and the unknown fails closed", () => {
  assert.deepEqual(classifyPayrollFailure(Object.assign(new Error("x"), { code: "engine_error" })), { retry: true, code: "engine_error" });
  assert.deepEqual(classifyPayrollFailure(Object.assign(new Error("x"), { code: "timeout" })), { retry: true, code: "timeout" });
  assert.deepEqual(classifyPayrollFailure(Object.assign(new Error("x"), { code: "internal", claraRetry: true })), { retry: true, code: "internal" },
    "a WAIT is a retry: a deploy window is not a fact about the document");
  assert.deepEqual(classifyPayrollFailure(Object.assign(new Error("x"), { code: "payroll_consent_inactive", payrollRefusal: true })), { retry: false, code: "payroll_consent_inactive" },
    "consent is a decision, not a fault — never retried into a second egress");
  assert.deepEqual(classifyPayrollFailure(Object.assign(new Error("x"), { code: "internal" })), { retry: false, code: "internal" },
    "the unknown fails CLOSED");
});

// ---------------------------------------------------------------------------
// P5 — its own closure
// ---------------------------------------------------------------------------

test("P5 · the family's FROZEN files import no other family's frozen file", () => {
  // #945's own first acceptance criterion: "written as its own closure rather than as an arm of
  // the invoice family, because a versioned workflow may not couple its shape to another
  // family's frozen files". Read as bytes, so a future edit that reached for a witness module
  // goes red here rather than at review.
  const frozen = [
    "payrollFacts.v1.ts",
    "payrollFacts.v1.impl.ts",
    "payrollFacts.v1.behavior.mjs",
    "payrollFacts.v1.dispatch.mjs",
    "payrollFacts.v1.prompts.mjs",
  ];
  // Assembled rather than written out: freeze-lint discovers its entry files by scanning for
  // this exact marker, so a test that spelled it literally would enrol ITSELF (and its whole
  // import closure) into the frozen manifest. Proved by doing it once: the first cut of this
  // cell dragged packages/runtime/lib/intake.mjs into the closure.
  const MARKER = `// ${"@"}frozen`;
  for (const name of frozen) {
    const src = workflow(name);
    assert.ok(src.startsWith(MARKER), `${name} declares itself frozen`);
    const imports = [...src.matchAll(/^import[^;]*from\s+"([^"]+)"/gm)].map((m) => m[1]);
    for (const spec of imports) {
      assert.equal(
        /witnessFacts|statementFacts|invoiceFacts|autoDraft|chatTurn|claraWork/.test(spec), false,
        `${name} imports ${spec} — a frozen payroll file may not couple to another family's closure`,
      );
    }
  }
  // The SERVICES module is not frozen and DOES share the provider adapter — that is
  // infrastructure, not a questionnaire, and the sharing is deliberate.
  const services = workflow("payrollFacts.v1.services.mjs");
  assert.equal(services.startsWith(MARKER), false, "the services bundle is config, not a frozen body");
  assert.ok(services.includes("witnessFacts.v2.services.mjs"), "…and it is where the shared adapter is reached");
});

test("P5 · the engine identity is the family's own, and it is the literal the router stamps", () => {
  assert.equal(PAYROLL_ENGINE_SNAPSHOT.engineId, "llm-openai:gpt-5.6-terra:payroll-witness-v1");
  assert.match(PAYROLL_ENGINE_SNAPSHOT.engineId, /^llm-/,
    "migration 0296's lane<->engine CHECK refuses a payroll_facts task whose engine_id is not llm-%");
  // Read the DB side independently — the migration's own routing arm — and assert the two agree.
  // A drift here STALLS the lane (the behaviour waits rather than mis-stamping), so it is worth
  // catching at unit time.
  const migration = readFileSync(
    join(HERE, "..", "..", "db", "migrations", "0296_payroll_summary_typed_facts.sql"), "utf8");
  assert.ok(
    migration.includes(`v_engine:='${PAYROLL_ENGINE_SNAPSHOT.engineId}'`),
    "the router's payroll arm must stamp exactly the engine id this image calls",
  );
});
