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
//   S3. THE DETERMINISTIC EVALUATOR — clara.evaluate_payroll_run_state_v1(jsonb, jsonb). Two
//       channel envelopes in, one fact state out. It sums each column across the quoted rows,
//       checks every row's own gross-minus-deductions identity, cross-checks a printed totals
//       row where one exists, and compares the two readings. The model never sums: every figure
//       in the state is either a rendering the page printed or an arithmetic result THIS
//       function produced.
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

// ---------------------------------------------------------------------------
// S3 — the deterministic evaluator
// ---------------------------------------------------------------------------

/** THE WORKED EXAMPLE, arithmetic done BY HAND here and never by re-running what the evaluator
 *  runs (WORK-ORDER rule 4: an expected value comes from an independent source of truth).
 *
 *    row 1   gross 3,000.00   epf 330.00   socso 14.75   eis 5.90   pcb 120.00
 *            deductions = 330.00 + 14.75 + 5.90 + 120.00 = 470.65
 *            net        = 3,000.00 - 470.65             = 2,529.35
 *    row 2   gross 2,000.00   epf 220.00   socso  9.75   eis 3.90   pcb  40.00
 *            deductions = 220.00 + 9.75 + 3.90 + 40.00  =   273.65
 *            net        = 2,000.00 - 273.65             = 1,726.35
 *
 *    column sums   gross 5,000.00   epf 550.00   socso 24.50   eis 9.80   pcb 160.00
 *                  net   4,255.70   (and 5,000.00 - 744.30 = 4,255.70, which is the same
 *                                    identity holding at the run level)
 */
const R1 = { gross: "3,000.00", epf: "330.00", socso: "14.75", eis: "5.90", pcb: "120.00", net: "2,529.35" };
const R2 = { gross: "2,000.00", epf: "220.00", socso: "9.75", eis: "3.90", pcb: "40.00", net: "1,726.35" };
const SUM_CENTS = { gross: 500000, epf: 55000, socso: 2450, eis: 980, pcb: 16000, net: 425570 };

/** The printed totals row of the same document, plus the three employer columns and the levy —
 *  figures with no per-employee counterpart, so nothing sums them. */
const PRINTED = {
  "payroll.run.period": value("2026-08"),
  "payroll.run.gross_pay": value("5,000.00"),
  "payroll.run.epf_employee": value("550.00"),
  "payroll.run.epf_employer": value("650.00"),
  "payroll.run.socso_employee": value("24.50"),
  "payroll.run.socso_employer": value("51.65"),
  "payroll.run.eis_employee": value("9.80"),
  "payroll.run.eis_employer": value("9.80"),
  "payroll.run.pcb": value("160.00"),
  "payroll.run.hrdf_levy": value("50.00"),
  "payroll.run.net_pay": value("4,255.70"),
};

const ALL_NOT_PRINTED = Object.fromEntries(RUN_FIELDS.map((f) => [f, notPrinted()]));

function payslipRow(rowNo, r) {
  return row(rowNo, {
    "payroll.row.gross_pay": value(r.gross),
    "payroll.row.epf_employee": value(r.epf),
    "payroll.row.socso_employee": value(r.socso),
    "payroll.row.eis_employee": value(r.eis),
    "payroll.row.pcb": value(r.pcb),
    "payroll.row.net_pay": value(r.net),
  });
}

async function evaluate(textEnv, visionEnv) {
  const r = await rootQuery(
    "select clara.evaluate_payroll_run_state_v1($1::jsonb, $2::jsonb) as state",
    [JSON.stringify(textEnv), JSON.stringify(visionEnv)],
  );
  return r.rows[0].state;
}

/** The same document read twice, agreeing. */
function bothChannels({ answers, rows }) {
  return [
    envelope({ channel: "text", answers, rows }),
    envelope({ channel: "vision", answers, rows }),
  ];
}

test("S3 · a payslip WITH a printed totals row: every column is established, and the state says the sum agrees with what the page printed", async (t) => {
  if (unready(t)) return;

  const rows = [payslipRow(1, R1), payslipRow(2, R2)];
  const [textEnv, visionEnv] = bothChannels({ answers: PRINTED, rows });
  const state = await evaluate(textEnv, visionEnv);

  assert.equal(state.state_version, "v1");
  assert.equal(state.rows.agreed, 2, "both channels quoted the same two rows");
  assert.deepEqual(state.rows.unbalanced, [], "both rows satisfy gross - deductions = net");
  assert.equal(state.rows.balanced, 2);

  for (const [field, cents] of [
    ["payroll.run.gross_pay", SUM_CENTS.gross],
    ["payroll.run.epf_employee", SUM_CENTS.epf],
    ["payroll.run.socso_employee", SUM_CENTS.socso],
    ["payroll.run.eis_employee", SUM_CENTS.eis],
    ["payroll.run.pcb", SUM_CENTS.pcb],
    ["payroll.run.net_pay", SUM_CENTS.net],
  ]) {
    const f = state.facts[field];
    assert.equal(f.state, "established", `${field}: ${JSON.stringify(f)}`);
    assert.equal(f.printed_cents, cents, `${field}: the printed total, read off the page`);
    assert.equal(f.computed_cents, cents, `${field}: the sum this evaluator computed from the quoted rows`);
    assert.equal(f.basis, "printed_total_agrees_row_sum");
  }

  // The three employer columns and the levy have no per-employee counterpart: nothing sums them,
  // and the state says so rather than inventing a computed figure.
  for (const field of ["payroll.run.epf_employer", "payroll.run.socso_employer", "payroll.run.eis_employer", "payroll.run.hrdf_levy"]) {
    const f = state.facts[field];
    assert.equal(f.state, "established", `${field}: ${JSON.stringify(f)}`);
    assert.equal(f.computed_cents, null, `${field}: a payslip row does not print the employer's own contribution, so nothing sums it`);
    assert.equal(f.basis, "printed_total_no_row_counterpart");
  }

  assert.equal(state.facts["payroll.run.period"].state, "established");
  assert.equal(state.facts["payroll.run.period"].printed_raw, "2026-08");
  assert.equal(state.established.length, 11, "all eleven questions are answered by the page and agreed by both channels");
  assert.deepEqual(state.disagreed, []);
  assert.deepEqual(state.missing, []);
});

test("S3 · a payslip WITHOUT a printed totals row is still readable: the evaluator sums the rows and says the figure was never printed", async (t) => {
  if (unready(t)) return;

  const rows = [payslipRow(1, R1), payslipRow(2, R2)];
  const [textEnv, visionEnv] = bothChannels({ answers: ALL_NOT_PRINTED, rows });
  const state = await evaluate(textEnv, visionEnv);

  assert.equal(state.rows.agreed, 2);
  assert.equal(state.rows.balanced, 2);

  const gross = state.facts["payroll.run.gross_pay"];
  assert.equal(gross.state, "not_printed", "the page prints no totals row, and the state says so instead of claiming one");
  assert.equal(gross.printed_cents, null, "nothing was printed, so nothing is quoted");
  assert.equal(gross.computed_cents, SUM_CENTS.gross, "…but the row sum is still offered, computed by this evaluator");
  assert.equal(gross.reason, "no_printed_total");

  const net = state.facts["payroll.run.net_pay"];
  assert.equal(net.computed_cents, SUM_CENTS.net);

  const levy = state.facts["payroll.run.hrdf_levy"];
  assert.equal(levy.state, "not_printed");
  assert.equal(levy.computed_cents, null, "no row prints a levy, so there is nothing to sum and nothing is invented");

  assert.deepEqual(state.established, [], "nothing on this page is established as a printed figure");
  assert.equal(state.missing.length, 11);
});

test("S3 · a row that does not balance is named, and does not quietly join the column sums", async (t) => {
  if (unready(t)) return;

  // Row 2's net is overstated by one ringgit: 2,000.00 - 273.65 is 1,726.35, not 1,727.35.
  const broken = { ...R2, net: "1,727.35" };
  const rows = [payslipRow(1, R1), payslipRow(2, broken)];
  const [textEnv, visionEnv] = bothChannels({ answers: PRINTED, rows });
  const state = await evaluate(textEnv, visionEnv);

  assert.deepEqual(state.rows.unbalanced, [2], "the row that fails its own identity is named by its printed row number");
  assert.equal(state.rows.balanced, 1);

  const net = state.facts["payroll.run.net_pay"];
  assert.equal(net.state, "rows_unbalanced",
    "a column summed over a row that does not balance is not established, whatever the arithmetic came to");
  assert.equal(net.reason, "row_identity_failed");
  assert.ok(state.disagreed.includes("payroll.run.net_pay"));

  // The columns that do NOT participate in the broken row's identity are unaffected: the failure
  // is reported where it happened, not smeared across the whole read.
  assert.equal(state.facts["payroll.run.epf_employer"].state, "established");
});

test("S3 · a printed totals row the row sum contradicts is reported as a mismatch, never silently preferred", async (t) => {
  if (unready(t)) return;

  const rows = [payslipRow(1, R1), payslipRow(2, R2)];
  const answers = { ...PRINTED, "payroll.run.gross_pay": value("5,100.00") };
  const [textEnv, visionEnv] = bothChannels({ answers, rows });
  const state = await evaluate(textEnv, visionEnv);

  const gross = state.facts["payroll.run.gross_pay"];
  assert.equal(gross.state, "totals_mismatch");
  assert.equal(gross.printed_cents, 510000, "what the page printed");
  assert.equal(gross.computed_cents, SUM_CENTS.gross, "what the rows come to");
  assert.equal(gross.reason, "printed_total_disagrees_row_sum");
  assert.ok(state.disagreed.includes("payroll.run.gross_pay"));
  assert.equal(state.facts["payroll.run.net_pay"].state, "established", "the columns that agree are unaffected");
});

test("S3 · the two channels are compared: a figure they read differently is not established", async (t) => {
  if (unready(t)) return;

  const rows = [payslipRow(1, R1), payslipRow(2, R2)];
  const textEnv = envelope({ channel: "text", answers: PRINTED, rows });
  const visionEnv = envelope({
    channel: "vision",
    answers: { ...PRINTED, "payroll.run.pcb": value("180.00") },
    rows,
  });
  const state = await evaluate(textEnv, visionEnv);

  const pcb = state.facts["payroll.run.pcb"];
  assert.equal(pcb.state, "channels_disagree");
  assert.equal(pcb.reason, "text_and_vision_read_different_figures");
  assert.equal(pcb.text_raw, "160.00");
  assert.equal(pcb.vision_raw, "180.00");
  assert.equal(pcb.printed_cents, null, "a contested figure is never published as the read");
  assert.ok(state.disagreed.includes("payroll.run.pcb"));

  // A row the two channels read differently is not an agreed row, so it enters no column sum.
  const visionRows = [payslipRow(1, { ...R1, gross: "3,100.00" }), payslipRow(2, R2)];
  const state2 = await evaluate(textEnv, envelope({ channel: "vision", answers: PRINTED, rows: visionRows }));
  assert.equal(state2.rows.agreed, 1, "only the row both channels read the same way is an agreed row");
  assert.deepEqual(state2.rows.contested, [1]);
  assert.equal(state2.facts["payroll.run.gross_pay"].state, "rows_contested");
  assert.equal(state2.facts["payroll.run.gross_pay"].computed_cents, null,
    "a partial sum over the rows that happened to agree would be a figure no page states");
});

test("S3 · an unprinted HRDF line is reported as not printed, beside established figures on the same page", async (t) => {
  if (unready(t)) return;

  const rows = [payslipRow(1, R1), payslipRow(2, R2)];
  const answers = { ...PRINTED, "payroll.run.hrdf_levy": notPrinted() };
  const [textEnv, visionEnv] = bothChannels({ answers, rows });
  const state = await evaluate(textEnv, visionEnv);

  const levy = state.facts["payroll.run.hrdf_levy"];
  assert.equal(levy.state, "not_printed");
  assert.equal(levy.printed_cents, null, "never 0 — the page is silent, and silence is not a zero");
  assert.equal(levy.computed_cents, null);
  assert.equal(levy.reason, "no_printed_total");
  assert.deepEqual(state.missing, ["payroll.run.hrdf_levy"]);
  assert.equal(state.established.length, 10, "the other ten are unaffected by the one the page does not print");
});

test("S3 · a figure the page prints unreadably is named unreadable, never guessed at", async (t) => {
  if (unready(t)) return;

  const rows = [payslipRow(1, R1), payslipRow(2, R2)];
  const answers = { ...PRINTED, "payroll.run.socso_employer": value("RM fifty-one sixty-five") };
  const [textEnv, visionEnv] = bothChannels({ answers, rows });
  const state = await evaluate(textEnv, visionEnv);

  const f = state.facts["payroll.run.socso_employer"];
  assert.equal(f.state, "unreadable");
  assert.equal(f.reason, "rendering_is_not_a_figure");
  assert.equal(f.printed_cents, null);
  assert.equal(f.printed_raw, "RM fifty-one sixty-five", "the rendering is reported verbatim so a person can see what was on the page");
  assert.ok(state.disagreed.includes("payroll.run.socso_employer"));
});

test("S3 · the evaluator is a closed, single-member closure: it calls no other clara function", async (t) => {
  if (unready(t)) return;

  // The STRUCTURAL half of the claim (the one that binds): the freeze registration carries
  // exactly one member row — 0140's own recorded reason for writing an evaluator this way.
  const members = (
    await rootQuery(
      `select m.ordinal, m.member_signature
         from clara.evaluator_version_members m
         join clara.evaluator_versions ev on ev.id = m.evaluator_version_id
        where ev.evaluator_name = 'evaluate_payroll_run_state' and ev.version = 1
        order by m.ordinal`,
    )
  ).rows;
  assert.deepEqual(
    members.map((m) => m.member_signature),
    ["clara.evaluate_payroll_run_state_v1(jsonb,jsonb)"],
    "one member, so the freeze means this body, this version, this receipt",
  );

  // The SPELLING half, as a second, weaker instrument: no `clara.<identifier>(` call shape
  // anywhere in the body. Matched as a CALL SHAPE, never as the bare string 'clara.' — 0140's
  // own note records why (a qualified table name would match and report a call that is not one).
  const src = (
    await rootQuery(
      "select prosrc from pg_proc where oid = 'clara.evaluate_payroll_run_state_v1(jsonb,jsonb)'::regprocedure",
    )
  ).rows[0].prosrc;
  const calls = src.match(/clara\.[A-Za-z_][A-Za-z0-9_]*\s*\(/g) ?? [];
  assert.deepEqual(calls, [], `the evaluator calls a clara function: ${calls.join(", ")}`);

  // And it is registered where a frozen evaluator is registered, at the migration that made it.
  const ev = (
    await rootQuery(
      `select entrypoint_signature, migration_version, deployed
         from clara.evaluator_versions where evaluator_name='evaluate_payroll_run_state' and version=1`,
    )
  ).rows;
  assert.equal(ev.length, 1);
  assert.equal(ev[0].entrypoint_signature, "clara.evaluate_payroll_run_state_v1(jsonb,jsonb)");
  assert.equal(ev[0].migration_version, "0296_payroll_summary_typed_facts");
  assert.equal(ev[0].deployed, false, "the deploy flip is a one-way ceremony act, never a migration's to make");
});
