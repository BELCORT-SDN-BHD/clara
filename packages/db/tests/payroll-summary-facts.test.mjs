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
//   S4. THE FACTS ROUTER — clara.enqueue_invoice_facts(uuid), the door every caller reaches
//       (file_document, finalize_document_intake, the facts-gate consumer). A payroll_summary
//       pdf stops terminating as `skipped_kind` and enters its own `payroll_facts` lane, under
//       the same enqueue-time typed-consent gate the witness lanes hold.
//   S5. THE PERSIST DOOR — clara.persist_payroll_facts(uuid, jsonb, jsonb, integer) and
//       clara.fail_payroll_facts(uuid, text), the pair a worker settles the lane through. The
//       run's typed facts land as clara.document_regions rows with their source regions, a
//       not-printed answer lands as a region that says so rather than as a zero, and NO
//       employee-level figure is persisted anywhere.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, ensureReady, endPool, buildWorld } from "./rig-fixtures.mjs";
import { firmOf, filedDocument, seedExtraction, seedRegion, enqueueInvoiceFacts, docTasks, claimTask } from "./a21-helpers.mjs";
import { consentEvidenceDoc, grantPurpose, activatePurpose } from "./wave-b/wb-0020-helpers.mjs";

let ready = false;
let world = null;

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
    return;
  }
  world = await buildWorld();
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

// ---------------------------------------------------------------------------
// S4 — the facts router
// ---------------------------------------------------------------------------

/** The typed witness_extraction consent is granted ONCE per client: the grant door refuses a
 *  second live consent for the same purpose, so this asks before it grants rather than
 *  swallowing the refusal (which would hide a genuinely absent consent from the cell below). */
async function hasWitnessConsent(client) {
  const r = await rootQuery(
    `select exists(select 1 from clara.client_egress_purpose_activations a
        join clara.client_egress_purpose_consents c
          on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id and c.purpose=a.purpose
       where a.client_id=$1 and a.purpose='witness_extraction'
         and a.deactivated_at is null and c.revoked_at is null) as live`,
    [client],
  );
  return r.rows[0].live === true;
}

/** A FILED payroll-summary pdf with a done OCR extraction and one cited region, born through the
 *  real doors (a21-classifier-gate.test.mjs's own `pdfDoc` shape), never by surgery. */
async function payrollDoc(client, { consent = true } = {}) {
  const sub = world.users.alice;
  const firm = await firmOf(client);
  // The consent is granted BEFORE the document is filed, deliberately: `file_document` runs the
  // facts enqueue itself, so granting afterwards would leave a pre-consent gate receipt on the
  // trail beside the live task and make "exactly one task" a lie about the lane rather than
  // about this helper.
  if (consent && !(await hasWitnessConsent(client))) {
    const evidence = await consentEvidenceDoc(sub, { firm });
    const grant = await grantPurpose(sub, { client, purpose: "witness_extraction", evidenceDocument: evidence.documentId });
    await activatePurpose(sub, { client, purpose: "witness_extraction", consent: grant.consent_id });
  }
  const doc = await filedDocument(sub, { firm, client, kind: "payroll_summary" });
  const extractionId = await seedExtraction({ firm, document: doc.documentId, engineKind: "ocr", status: "done" });
  const regionId = await seedRegion({
    firm, extraction: extractionId, fieldPath: "payroll.run.gross_pay", textContent: "5,000.00",
  });
  return { ...doc, extractionId, regionId };
}

test("S4 · a payroll_summary pdf stops terminating as skipped_kind and enters its own lane", async (t) => {
  if (unready(t)) return;

  const doc = await payrollDoc(world.clients.A1);
  const receipt = await enqueueInvoiceFacts(doc.documentId);
  assert.equal(receipt.status, "queued", `the router admits the document: ${JSON.stringify(receipt)}`);

  const tasks = await docTasks(doc.documentId);
  assert.equal(
    tasks.filter((x) => x.error_code === "skipped_kind").length, 0,
    "no skipped_kind receipt is left anywhere on the trail — the dead end is gone, not merely bypassed",
  );
  const lane = tasks.filter((x) => x.lane === "payroll_facts");
  assert.equal(lane.length, 1, `exactly one payroll_facts task: ${JSON.stringify(tasks.map((x) => `${x.lane}/${x.status}/${x.error_code}`))}`);
  assert.equal(lane[0].status, "queued", "the task is LIVE, not a consent refusal in disguise");
  assert.match(lane[0].engine_id, /^llm-/, "the payroll lane is an LLM witness-pair lane, and its engine identity says so");
  assert.equal(
    tasks.filter((x) => x.lane === "invoice_facts").length, 0,
    "a payroll summary never enters the invoice lane — this widens the estate, it does not reroute the invoice family",
  );

  // Idempotent: the facts-gate consumer re-fires this enqueue on every classified/extraction
  // event, and a second call must find the queued task rather than mint a second one.
  const again = await enqueueInvoiceFacts(doc.documentId);
  assert.equal(again.status, "queued");
  assert.equal((await docTasks(doc.documentId)).filter((x) => x.lane === "payroll_facts").length, 1,
    "a re-fire finds the in-flight task; it never mints a second one");
});

test("S4 · the payroll lane holds the SAME enqueue-time typed-consent gate the witness lanes hold", async (t) => {
  if (unready(t)) return;

  // A client with no live witness_extraction activation: the read is refused BEFORE a task is
  // ever runnable, and the refusal is a terminal never-claimed receipt, never a raise (the
  // router runs inside file_document, and a raise would abort an unrelated filing transaction).
  const doc = await payrollDoc(world.clients.A2, { consent: false });
  const receipt = await enqueueInvoiceFacts(doc.documentId);
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.reason, "payroll_consent_inactive");

  const lane = (await docTasks(doc.documentId)).filter((x) => x.lane === "payroll_facts");
  assert.equal(lane.length, 1);
  assert.equal(lane[0].status, "failed");
  assert.equal(lane[0].error_code, "payroll_consent_inactive");
  assert.equal(lane[0].attempt_count, 0, "a gate verdict consumes no attempts");
  assert.equal(lane[0].started_at, null, "…and was never claimed");
});

test("S4 · every other kind's route through the recut router is unchanged", async (t) => {
  if (unready(t)) return;

  const sub = world.users.alice;
  const client = world.clients.A1;
  const firm = await firmOf(client);

  // An invoice still routes to llm_witness (the F-A1 PR-3 cutover), not to the payroll lane.
  const inv = await filedDocument(sub, { firm, client, kind: "invoice" });
  await seedExtraction({ firm, document: inv.documentId, engineKind: "ocr", status: "done" });
  await enqueueInvoiceFacts(inv.documentId);
  const invTasks = await docTasks(inv.documentId);
  assert.equal(invTasks.filter((x) => x.lane === "llm_witness").length, 1, "an invoice still rides llm_witness");
  assert.equal(invTasks.filter((x) => x.lane === "payroll_facts").length, 0);

  // A kind with no reader still terminates cleanly as skipped_kind: this file widened the router
  // by ONE arm and removed nobody else's dead end.
  const other = await filedDocument(sub, { firm, client, kind: "tax_correspondence" });
  await seedExtraction({ firm, document: other.documentId, engineKind: "ocr", status: "done" });
  const otherReceipt = await enqueueInvoiceFacts(other.documentId);
  assert.equal(otherReceipt.status, "skipped_kind", "the skipped_kind arm still serves every kind with no reader");
});

// ---------------------------------------------------------------------------
// S5 — the persist door
// ---------------------------------------------------------------------------

/** Drive a payroll document all the way to a CLAIMED, running task through the real doors, and
 *  hand back everything the persist call needs. */
async function runningPayrollTask(client) {
  const doc = await payrollDoc(client);
  await enqueueInvoiceFacts(doc.documentId);
  const task = (
    await rootQuery(
      "select id from clara.document_processing_tasks where document_id=$1 and lane='payroll_facts' and status='queued' order by version_n desc limit 1",
      [doc.documentId],
    )
  ).rows[0];
  assert.ok(task, "mandatory setup: the router queued a payroll_facts task");
  const claimed = await claimTask(task.id, { egressApproved: true });
  assert.equal(claimed.status, "running", `mandatory setup: the task is claimable (got ${JSON.stringify(claimed)})`);
  const sha = (await rootQuery("select sha256 from clara.documents where id=$1", [doc.documentId])).rows[0].sha256;
  return { ...doc, taskId: task.id, sha };
}

function call(env, { pin, promptHash }) {
  return { input_pin: pin, prompt_hash: promptHash, envelope: env };
}

async function persist(taskId, textCall, visionCall, pages = 1) {
  const r = await rootQuery("select clara.persist_payroll_facts($1,$2::jsonb,$3::jsonb,$4) as receipt", [
    taskId, JSON.stringify(textCall), JSON.stringify(visionCall), pages,
  ]);
  return r.rows[0].receipt;
}

const regionsOf = async (documentId) => (
  await rootQuery(
    `select r.field_path, r.text_content, r.monetary_raw, r.monetary_cents, r.locator, e.engine_kind
       from clara.document_regions r
       join clara.document_extractions e on e.id = r.extraction_id
      where e.document_id = $1
        and e.engine_kind in ('payroll_text_facts','payroll_vision_facts')
      order by r.field_path`,
    [documentId],
  )
).rows;

test("S5 · the run's typed facts land as regions with their source regions, and a not-printed answer lands saying so", async (t) => {
  if (unready(t)) return;

  const doc = await runningPayrollTask(world.clients.A1);
  const rows = [payslipRow(1, R1), payslipRow(2, R2)];
  const answers = { ...PRINTED, "payroll.run.hrdf_levy": notPrinted() };
  const [textEnv, visionEnv] = bothChannels({ answers, rows });

  const receipt = await persist(
    doc.taskId,
    call(textEnv, { pin: doc.extractionId, promptHash: "payroll-text-v1" }),
    call(visionEnv, { pin: doc.sha, promptHash: "payroll-vision-v1" }),
  );
  assert.equal(receipt.status, "done");
  assert.equal(receipt.replayed, false);

  const regions = await regionsOf(doc.documentId);
  assert.equal(regions.length, RUN_FIELDS.length,
    `one region per run-level question, answered or not: ${JSON.stringify(regions.map((r) => r.field_path))}`);
  for (const r of regions) {
    assert.equal(r.engine_kind, "payroll_text_facts", "every fact hangs off the CANONICAL text row of the pair");
  }

  const gross = regions.find((r) => r.field_path === "payroll.run.gross_pay");
  assert.equal(gross.monetary_cents, "500000", "the printed total, as the DB's own integer");
  assert.equal(gross.monetary_raw, "5,000.00", "…beside the verbatim rendering the page carries");
  assert.equal(gross.text_content, "5,000.00");
  assert.ok(gross.locator, "…and a locator, so a person can click the figure and see where it came from");

  const levy = regions.find((r) => r.field_path === "payroll.run.hrdf_levy");
  assert.ok(levy, "an UNPRINTED answer still lands as a fact — silence is a reading, not an absence");
  assert.equal(levy.monetary_cents, null, "…carrying NO figure at all, which is what `not printed` means");
  assert.equal(levy.monetary_raw, null);
  assert.equal(levy.text_content, null, "…never the string '0' and never a zero cents value");

  const period = regions.find((r) => r.field_path === "payroll.run.period");
  assert.equal(period.text_content, "2026-08", "the one non-monetary question lands as text");
  assert.equal(period.monetary_cents, null);

  // The pair is banked under its OWN engine kinds, so clara._invoice_fact_state can never
  // resolve a payroll envelope as an invoice corroboration.
  const kinds = (
    await rootQuery(
      "select engine_kind, status from clara.document_extractions where document_id=$1 order by engine_kind",
      [doc.documentId],
    )
  ).rows;
  assert.deepEqual(
    kinds.map((k) => k.engine_kind).sort(),
    ["ocr", "payroll_text_facts", "payroll_vision_facts"],
    "the OCR row the read was pinned to, plus the payroll pair under its own two kinds",
  );

  // Idempotent replay: a worker that re-settles a done task gets the stored receipt back and
  // banks nothing a second time.
  const replay = await persist(
    doc.taskId,
    call(textEnv, { pin: doc.extractionId, promptHash: "payroll-text-v1" }),
    call(visionEnv, { pin: doc.sha, promptHash: "payroll-vision-v1" }),
  );
  assert.equal(replay.replayed, true);
  assert.equal((await regionsOf(doc.documentId)).length, RUN_FIELDS.length, "a replay writes no second set of facts");
});

test("S5 · NO employee-level figure is persisted anywhere — the quotes exist only so the evaluator can sum them", async (t) => {
  if (unready(t)) return;

  const doc = await runningPayrollTask(world.clients.A1);
  // Renderings that appear ONLY on the per-employee rows and nowhere in the run-level totals, so
  // finding either anywhere in the database is proof a quote was persisted.
  const rows = [payslipRow(1, R1), payslipRow(2, R2)];
  const [textEnv, visionEnv] = bothChannels({ answers: PRINTED, rows });
  await persist(
    doc.taskId,
    call(textEnv, { pin: doc.extractionId, promptHash: "payroll-text-v1" }),
    call(visionEnv, { pin: doc.sha, promptHash: "payroll-vision-v1" }),
  );

  const stored = (
    await rootQuery(
      `select coalesce(string_agg(e.envelope::text, ' '), '')
            || ' ' || coalesce((select string_agg(coalesce(r.text_content,'') || ' ' || coalesce(r.monetary_raw,''), ' ')
                                  from clara.document_regions r
                                  join clara.document_extractions e2 on e2.id = r.extraction_id
                                 where e2.document_id = $1), '') as blob
         from clara.document_extractions e where e.document_id = $1`,
      [doc.documentId],
    )
  ).rows[0].blob;

  for (const quote of [R1.gross, R1.epf, R1.socso, R1.eis, R1.pcb, R1.net, R2.gross, R2.epf, R2.socso, R2.eis, R2.pcb, R2.net]) {
    assert.equal(stored.includes(quote), false,
      `the per-employee rendering ${quote} reached durable storage — no employee-level figure may be persisted`);
  }
  // The RUN-level figures, by contrast, are exactly what this document is for.
  assert.ok(stored.includes("5,000.00"), "the run's printed gross total IS persisted");
  // And the state the evaluator produced rides with the read, so a reader never has to guess
  // why a figure is or is not established.
  const state = (
    await rootQuery(
      `select e.envelope -> 'payroll_state' as s from clara.document_extractions e
        where e.document_id = $1 and e.engine_kind = 'payroll_text_facts'`,
      [doc.documentId],
    )
  ).rows[0].s;
  assert.equal(state.state_version, "v1");
  assert.equal(state.established.length, 11, "every question on this page was established");
  assert.equal(state.rows.agreed, 2, "…over two agreed rows");
  assert.equal(state.rows.balanced, 2);
  assert.equal(
    JSON.stringify(state).includes(R1.epf), false,
    "the state itself carries no employee-level rendering either — counts, row numbers and column sums only",
  );
});

test("S5 · the door refuses a malformed read at the write boundary, and the lane's own fail verb settles a running task", async (t) => {
  if (unready(t)) return;

  const doc = await runningPayrollTask(world.clients.A1);
  const rows = [payslipRow(1, R1)];
  const [textEnv, visionEnv] = bothChannels({ answers: PRINTED, rows });

  // An envelope missing a question is refused BY THE DOOR, not silently stored.
  const bad = JSON.parse(JSON.stringify(textEnv));
  delete bad.payroll.answers["payroll.run.pcb"];
  await assert.rejects(
    () => persist(doc.taskId, call(bad, { pin: doc.extractionId, promptHash: "t" }), call(visionEnv, { pin: doc.sha, promptHash: "v" })),
    (err) => err.code === "CLR10",
    "a malformed answers vocabulary is a structural refusal",
  );

  // Two channels that used the SAME prompt are not two independent readings.
  await assert.rejects(
    () => persist(doc.taskId, call(textEnv, { pin: doc.extractionId, promptHash: "same" }), call(visionEnv, { pin: doc.sha, promptHash: "same" })),
    (err) => err.code === "CLR10",
    "the independence receipt requires distinct prompts",
  );

  // A vision pin that is not the document's own bytes is refused.
  await assert.rejects(
    () => persist(doc.taskId, call(textEnv, { pin: doc.extractionId, promptHash: "t" }), call(visionEnv, { pin: "deadbeef", promptHash: "v" })),
    (err) => err.code === "CLR10",
    "the vision channel must pin the document's own sha256",
  );

  assert.equal((await regionsOf(doc.documentId)).length, 0, "no refusal banked a partial read");

  // The lane's own terminal settle.
  const failed = (
    await rootQuery("select clara.fail_payroll_facts($1,$2) as receipt", [doc.taskId, "engine_error"])
  ).rows[0].receipt;
  assert.equal(failed.status, "failed");
  assert.equal(failed.reason, "engine_error");
  const again = (
    await rootQuery("select clara.fail_payroll_facts($1,$2) as receipt", [doc.taskId, "engine_error"])
  ).rows[0].receipt;
  assert.equal(again.replayed, true, "a second settle replays rather than re-failing");
});
