// Battery for migration 0296_payroll_summary_typed_facts.sql — #945: A PAYROLL SUMMARY IS READ
// THE WAY AN INVOICE IS READ, AND A DETERMINISTIC EVALUATOR DOES EVERY SUM.
//
// Spec of record: issue #945's Agent Brief (the body; its one comment, 2026-09-19, is a
// coordination note, not an owner ruling). Parent #926's owner ruling (2026-09-18, option G):
// "a payroll summary and a contract go down the same lane as any other accounting document,
// read and posted, not merely stored."
//
// THE SEAMS, named up front (WORK-ORDER rule 4 — the seams are the public interfaces the brief
// names, and no cell sits anywhere else):
//   S1. THE CANONICAL FIELD-PATH NAMESPACE — clara._field_path_conforms(text), the CHECK
//       constraint's own boolean sibling (0290) over clara._assert_field_path's roster (0191).
//       `payroll.*` conforms; an unregistered namespace is still refused by name.
//   S2. THE ANSWER-VOCABULARY GATE — clara._payroll_answers_ok(jsonb, text), the payroll
//       family's OWN closed vocabulary (never an arm of clara._witness_answers_ok, whose belt is
//       the invoice family's and whose body is a member of a frozen closure). It admits the
//       eleven run-level names and the six per-employee cell names, requires EVERY one of them
//       to be answered, admits `not_printed` as an answer and refuses an unknown key outright.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, ensureReady, endPool } from "./rig-fixtures.mjs";

let ready = false;

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  const applied = (
    await rootQuery("select count(*)::int as n from clara.schema_migrations where version like '0296@_%' escape '@'")
  ).rows[0].n;
  if (applied === 0) {
    if (process.env.CLARA_ALLOW_MISSING_PAYROLL_SUMMARY_FACTS !== "1") {
      throw new Error(
        "payroll-summary-facts premise missing (migration 0296 is not applied) -- this is a FOCUSED " +
          "run and must fail loudly, not skip. Preload " +
          "./tests/payroll-summary-facts-preintegration-gate.mjs for an estate sweep against a chain " +
          "that predates 0296.",
      );
    }
    ready = false;
  }
});

after(async () => {
  await endPool();
});

function unready(t) {
  if (!ready) {
    t.skip("rig not ready: ensureReady() found no draft_entry, or 0296 is not applied");
    return true;
  }
  return false;
}

/** Drive the grammar through the SAME boolean the CHECK constraint evaluates (0290), so a cell
 *  that passes here is a cell a raw insert into clara.document_regions would also pass. */
async function conforms(path) {
  try {
    const r = await rootQuery("select clara._field_path_conforms($1) as ok", [path]);
    return { ok: r.rows[0].ok === true, reason: null };
  } catch (err) {
    let reason = null;
    try {
      reason = JSON.parse(err.detail ?? "{}").reason ?? null;
    } catch {
      reason = null;
    }
    return { ok: false, reason, code: err.code };
  }
}

// ---------------------------------------------------------------------------
// S1 — the canonical field-path namespace
// ---------------------------------------------------------------------------

test("S1 · the payroll namespace is registered, and an unregistered namespace is still refused by name", async (t) => {
  if (unready(t)) return;

  for (const path of [
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
  ]) {
    const v = await conforms(path);
    assert.equal(v.ok, true, `${path} must conform: the payroll namespace is registered by 0296`);
  }

  // The vocabulary is still CLOSED — widening it by one namespace admits exactly one namespace.
  const bad = await conforms("payrol.run.gross_pay");
  assert.equal(bad.ok, false, "a typo'd namespace must still be refused outright");
  assert.equal(bad.reason, "field_path_namespace", "…by name, with the grammar's own typed reason");
  assert.equal(bad.code, "CLR10", "…and the grammar's own errcode, never a generic 23514");
});

// ---------------------------------------------------------------------------
// S2 — the answer-vocabulary gate
// ---------------------------------------------------------------------------

/** The ELEVEN run-level questions #945's brief names, in its own order: "the month, and the
 *  totals for gross pay, employee and employer EPF, employee and employer SOCSO, employee and
 *  employer EIS, PCB, any HRDF levy, and net pay". Written out here as an INDEPENDENT source of
 *  truth — transcribed from the brief, never read back out of the database. */
const RUN_FIELDS = [
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
];

/** The SIX cells a payslip row prints, which are exactly the cells the row identity
 *  `gross - (epf + socso + eis + pcb) = net` is stated over. */
const ROW_FIELDS = [
  "payroll.row.gross_pay",
  "payroll.row.epf_employee",
  "payroll.row.socso_employee",
  "payroll.row.eis_employee",
  "payroll.row.pcb",
  "payroll.row.net_pay",
];

const value = (raw) => ({ state: "value", raw });
const notPrinted = () => ({ state: "not_printed" });

/** A complete, well-formed envelope. `answers` replaces named run answers; `rows` replaces the
 *  whole rows array. Callers mutate the result to build the malformed shapes the cells drive. */
function envelope({ channel = "text", answers = {}, rows = null } = {}) {
  const a = {};
  for (const f of RUN_FIELDS) a[f] = f in answers ? answers[f] : value("0.00");
  if (!("payroll.run.period" in answers)) a["payroll.run.period"] = value("2026-08");
  return { payroll: { channel, answers: a, rows: rows ?? [] } };
}

function row(rowNo, cells = {}) {
  const c = {};
  for (const f of ROW_FIELDS) c[f] = f in cells ? cells[f] : value("0.00");
  return { row_no: rowNo, cells: c };
}

async function answersOk(env, channel = "text") {
  const r = await rootQuery("select clara._payroll_answers_ok($1::jsonb, $2) as ok", [JSON.stringify(env), channel]);
  return r.rows[0].ok;
}

test("S2 · the gate admits the payroll vocabulary, requires every question to be answered, and refuses an unknown key outright", async (t) => {
  if (unready(t)) return;

  // (a) THE ADMITTED SHAPE: all eleven run answers, and two quoted employee rows.
  assert.equal(
    await answersOk(envelope({ rows: [row(1), row(2)] })),
    true,
    "a complete envelope with every run-level question answered and two quoted rows must be admitted",
  );

  // (b) `not_printed` IS AN ANSWER, not an omission — the brief's own rule: "a figure the page
  //     does not print is reported as not printed", never filled with zero.
  assert.equal(
    await answersOk(envelope({ answers: { "payroll.run.hrdf_levy": notPrinted() }, rows: [row(1)] })),
    true,
    "an unprinted HRDF line answered `not_printed` must be admitted",
  );

  // (c) AN UNANSWERED QUESTION IS A REFUSAL. Dropping the key is exactly the shape that would let
  //     a blank pass for a zero, and it is the shape the gate exists to refuse.
  for (const f of RUN_FIELDS) {
    const env = envelope({ rows: [row(1)] });
    delete env.payroll.answers[f];
    assert.equal(await answersOk(env), false, `an envelope missing ${f} must be refused: every question is answered or the read is malformed`);
  }

  // (d) AN UNKNOWN KEY IS REFUSED OUTRIGHT — a vocabulary that admits anything admits a typo.
  const stray = envelope({ rows: [row(1)] });
  stray.payroll.answers["payroll.run.bonus"] = value("10.00");
  assert.equal(await answersOk(stray), false, "an unknown run-level answer key must be refused");

  const strayRow = envelope({ rows: [row(1)] });
  strayRow.payroll.rows[0].cells["payroll.row.bonus"] = value("10.00");
  assert.equal(await answersOk(strayRow), false, "an unknown per-employee cell key must be refused");

  const strayTop = envelope({ rows: [row(1)] });
  strayTop.payroll.totals = { computed: true };
  assert.equal(await answersOk(strayTop), false, "an unknown member of the payroll envelope itself must be refused");

  // (e) AN INCOMPLETE ROW IS A REFUSAL — the row identity is stated over all six cells, so a row
  //     quoting five of them is a row no evaluator can check.
  const shortRow = envelope({ rows: [row(1)] });
  delete shortRow.payroll.rows[0].cells["payroll.row.pcb"];
  assert.equal(await answersOk(shortRow), false, "a row missing one of its six cells must be refused");

  // (f) THE CHANNEL RECEIPT. The envelope names the channel it was read on, and the gate is asked
  //     which channel it is judging; a mismatch is a refusal (the witness-pair discipline).
  assert.equal(await answersOk(envelope({ channel: "vision", rows: [row(1)] }), "text"), false,
    "a vision envelope judged as the text channel must be refused");
  assert.equal(await answersOk(envelope({ channel: "vision", rows: [row(1)] }), "vision"), true,
    "…and admitted when the channel it names is the channel it is judged as");

  // (g) A STATED ANSWER MUST ACTUALLY CARRY A RENDERING. `state: value` with a blank `raw` is a
  //     figure nobody quoted.
  const blank = envelope({ answers: { "payroll.run.gross_pay": { state: "value", raw: "   " } }, rows: [row(1)] });
  assert.equal(await answersOk(blank), false, "a `value` answer with a blank rendering must be refused");

  const unknownState = envelope({ answers: { "payroll.run.pcb": { state: "estimated", raw: "1.00" } }, rows: [row(1)] });
  assert.equal(await answersOk(unknownState), false, "a state outside {value, not_printed} must be refused");

  // (h) ZERO ROWS IS LAWFUL. A payroll summary that prints only its totals — no per-employee
  //     table at all — is still a readable document; the evaluator, not this gate, decides what
  //     can be established from it.
  assert.equal(await answersOk(envelope({ rows: [] })), true, "a summary with no quoted rows is well-formed");

  // (i) A DUPLICATED ROW NUMBER IS A REFUSAL — two rows claiming to be the same printed row would
  //     be double-counted by every column sum.
  assert.equal(await answersOk(envelope({ rows: [row(1), row(1)] })), false,
    "two rows carrying the same row_no must be refused");
});
