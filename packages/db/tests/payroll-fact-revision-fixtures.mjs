// #1056's fixtures — a REAL payroll run on a REAL document, born through the real doors.
//
// The worked example is #945's and #946's, unchanged and transcribed rather than recomputed, so
// this battery and `payroll-summary-posting.test.mjs` agree about what the page says before either
// says anything about what a correction does to it:
//
//   row 1   gross 3,000.00   epf 330.00   socso 14.75   eis 5.90   pcb 120.00   net 2,529.35
//   row 2   gross 2,000.00   epf 220.00   socso  9.75   eis 3.90   pcb  40.00   net 1,726.35
//   sums    gross 5,000.00   epf 550.00   socso 24.50   eis 9.80   pcb 160.00   net 4,255.70
//   plus the four employer columns and the levy, which no payslip row prints:
//           epf_employer 650.00   socso_employer 51.65   eis_employer 9.80   hrdf_levy 50.00
//
// NOTHING HERE IS SURGERY on the lane under test: the document is filed through `file_document`,
// routed by the real router, claimed as a real task and settled through
// `clara.persist_payroll_facts`. Only the OCR extraction the text channel pins is seeded, exactly
// as #946's own battery seeds it.

import assert from "node:assert/strict";
import { rootQuery } from "./rig-helpers.mjs";
import { upsertAccount } from "./rig-fixtures.mjs";
import { firmOf, filedDocument, seedExtraction, seedRegion, enqueueInvoiceFacts, claimTask } from "./a21-helpers.mjs";
import { consentEvidenceDoc, grantPurpose, activatePurpose } from "./wave-b/wb-0020-helpers.mjs";

export const RUN_FIELDS = [
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

export const ROW_FIELDS = [
  "payroll.row.gross_pay",
  "payroll.row.epf_employee",
  "payroll.row.socso_employee",
  "payroll.row.eis_employee",
  "payroll.row.pcb",
  "payroll.row.net_pay",
];

export const value = (raw) => ({ state: "value", raw });
export const notPrinted = () => ({ state: "not_printed" });

const R1 = { gross: "3,000.00", epf: "330.00", socso: "14.75", eis: "5.90", pcb: "120.00", net: "2,529.35" };
const R2 = { gross: "2,000.00", epf: "220.00", socso: "9.75", eis: "3.90", pcb: "40.00", net: "1,726.35" };

export const PRINTED = {
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

/** The eleven accounts the payroll lane reaches, with the names 0150/0295 seed them under. */
export const PAYROLL_CHART = [
  { code: "6000", name: "Salaries and Wages", type: "expense" },
  { code: "6010", name: "EPF Contribution (Employer)", type: "expense" },
  { code: "6020", name: "SOCSO Contribution (Employer)", type: "expense" },
  { code: "6030", name: "EIS Contribution (Employer)", type: "expense" },
  { code: "6040", name: "HRDF (HRD Corp) Levy Expense", type: "expense" },
  { code: "2100", name: "EPF (KWSP) Payable", type: "liability" },
  { code: "2110", name: "SOCSO (PERKESO) Payable", type: "liability" },
  { code: "2120", name: "EIS (SIP) Payable", type: "liability" },
  { code: "2130", name: "PCB (MTD) Payable", type: "liability" },
  { code: "2140", name: "HRDF (HRD Corp) Levy Payable", type: "liability" },
  { code: "2040", name: "Salaries Payable", type: "liability" },
];

let opSeq = 0;
export const opk = (tag) => `p1056-${tag}-${Date.now()}-${++opSeq}`;

/** Put a payroll-capable chart on a client THROUGH the real writer door. */
export async function seedPayrollChart(sub, client, { omit = [] } = {}) {
  for (const a of PAYROLL_CHART) {
    if (omit.includes(a.code)) continue;
    await upsertAccount(sub, { client, code: a.code, name: a.name, type: a.type, opKey: opk("coa") });
  }
}

function payslipRow(rowNo, r) {
  const cells = {
    "payroll.row.gross_pay": value(r.gross),
    "payroll.row.epf_employee": value(r.epf),
    "payroll.row.socso_employee": value(r.socso),
    "payroll.row.eis_employee": value(r.eis),
    "payroll.row.pcb": value(r.pcb),
    "payroll.row.net_pay": value(r.net),
  };
  return { row_no: rowNo, cells: Object.fromEntries(ROW_FIELDS.map((f) => [f, cells[f]])) };
}

/** The wire shape #945's answer-vocabulary gate and evaluator both read. */
export function envelope({ channel = "text", answers = {}, rows = null } = {}) {
  const a = {};
  for (const f of RUN_FIELDS) a[f] = f in answers ? answers[f] : PRINTED[f];
  return { payroll: { channel, answers: a, rows: rows ?? [payslipRow(1, R1), payslipRow(2, R2)] } };
}

/** The typed witness_extraction consent is granted ONCE per client, so this asks before granting. */
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

/** A FILED payroll-summary pdf with a done OCR extraction and one cited region (#945's shape). */
export async function payrollDoc(sub, client) {
  const firm = await firmOf(client);
  if (!(await hasWitnessConsent(client))) {
    const evidence = await consentEvidenceDoc(sub, { firm });
    const grant = await grantPurpose(sub, { client, purpose: "witness_extraction", evidenceDocument: evidence.documentId });
    await activatePurpose(sub, { client, purpose: "witness_extraction", consent: grant.consent_id });
  }
  const doc = await filedDocument(sub, { firm, client, kind: "payroll_summary" });
  const extractionId = await seedExtraction({ firm, document: doc.documentId, engineKind: "ocr", status: "done" });
  await seedRegion({ firm, extraction: extractionId, fieldPath: "payroll.run.gross_pay", textContent: "5,000.00" });
  return { ...doc, firm, client, extractionId };
}

/** Drive a payroll document all the way through the lane: filed, routed, claimed, read. */
export async function readPayrollDoc(sub, client, { answers = {}, rows = null, visionAnswers = null } = {}) {
  const doc = await payrollDoc(sub, client);
  await enqueueInvoiceFacts(doc.documentId);
  const task = (
    await rootQuery(
      `select id from clara.document_processing_tasks
        where document_id=$1 and lane='payroll_facts' and status='queued'
        order by version_n desc limit 1`,
      [doc.documentId],
    )
  ).rows[0];
  assert.ok(task, "mandatory setup: the router queued a payroll_facts task");
  const claimed = await claimTask(task.id, { egressApproved: true });
  assert.equal(claimed.status, "running", `mandatory setup: the task is claimable (got ${JSON.stringify(claimed)})`);
  const sha = (await rootQuery("select sha256 from clara.documents where id=$1", [doc.documentId])).rows[0].sha256;

  const textEnv = envelope({ channel: "text", answers, rows });
  const visionEnv = envelope({ channel: "vision", answers: visionAnswers ?? answers, rows });
  const receipt = (
    await rootQuery("select clara.persist_payroll_facts($1,$2::jsonb,$3::jsonb,$4) as receipt", [
      task.id,
      JSON.stringify({ input_pin: doc.extractionId, prompt_hash: "p1056-text", envelope: textEnv }),
      JSON.stringify({ input_pin: sha, prompt_hash: "p1056-vision", envelope: visionEnv }),
      1,
    ])
  ).rows[0].receipt;
  assert.equal(receipt.status, "done", `mandatory setup: the read settled (got ${JSON.stringify(receipt)})`);
  return { ...doc, taskId: task.id, receipt };
}

/** The payroll fact state banked on a document's kind-current payroll_text_facts extraction. */
export const bankedState = async (document) =>
  (
    await rootQuery(
      `select e.envelope->'payroll_state' as state from clara.document_extractions e
        where e.document_id=$1 and e.engine_kind='payroll_text_facts' and e.status='done'
        order by e.version_n desc, e.extracted_at desc limit 1`,
      [document],
    )
  ).rows[0]?.state ?? null;

export const verdictOf = async (document) =>
  (await rootQuery("select clara._payroll_posting_verdict($1) as v", [document])).rows[0].v;

export const payrollExtractionsOf = async (document) =>
  (
    await rootQuery(
      `select id, engine_id, engine_kind, version_n, status, superseded_by, envelope, extracted_at
         from clara.document_extractions
        where document_id=$1 and engine_kind like 'payroll%'
        order by extracted_at, id`,
      [document],
    )
  ).rows;

export const regionsOf = async (extraction) =>
  (
    await rootQuery(
      `select id, field_path, text_content, monetary_cents, monetary_raw, engine_confidence,
              locator_kind, locator
         from clara.document_regions where extraction_id=$1 order by field_path, id`,
      [extraction],
    )
  ).rows;
