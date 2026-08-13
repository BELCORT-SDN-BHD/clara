import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, buildWorld, freshDeltaClient, plainEntry, BANK1, REVN, draftEntryV3, approveEntry,
  freshResolution, openFY, reportingPeriodRows, createAccountSet, proposeMetricDefinition,
  approveMetricDefinition, mintMetricInput, evaluateMetricHuman, assessMetricIndependentHuman, cellRow,
  verifiedDocument, reverseEntryGoverned, retireFilingGoverned, measure, metricAst,
} from "./delta-fixtures.mjs";

let world;

async function approvedDefinition(owner, options) {
  const version = await proposeMetricDefinition(owner, options);
  await approveMetricDefinition(owner, version);
  return version;
}

async function evaluate(owner, { client, version, period, snapshotId }) {
  return cellRow(await evaluateMetricHuman(owner, {
    client, definitionVersion: version, periodIds: [period.id], snapshotId,
  }));
}

async function assertE6(owner, cell) {
  await assessMetricIndependentHuman(owner, { cell: cell.id });
  const assessment = (await rootQuery(
    `select matches,observed_status,observed_reason_key,observed_numerator,observed_denominator,details
       from clara.metric_cell_assessments where cell_id=$1 order by assessed_at desc limit 1`,
    [cell.id],
  )).rows[0];
  assert.equal(assessment.matches, true);
  assert.equal(assessment.observed_status, cell.cell_status);
  return assessment;
}

function monthEnds(start, end) {
  const dates = [], cursor = new Date(`${start.slice(0, 7)}-01T00:00:00Z`), limit = new Date(`${end}T00:00:00Z`);
  while (cursor <= limit) {
    const date = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    if (date >= new Date(`${start}T00:00:00Z`) && date <= limit) dates.push(date.toISOString().slice(0, 10));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return dates;
}

export async function registerRetainedSamplingPhase(t) {
  world = world ?? await buildWorld();

  await t.test("avg_month_end_v1 samples only true contained month ends in an off-month fiscal year", async () => {
    const owner = world.users.alice, client = await freshDeltaClient(owner, "partial-fy-average"), startsOn = "2023-02-15", endsOn = "2024-02-14";
    await openFY(owner, { client, label: "Delta off-month FY", startsOn, endsOn, lengthReason: "delta exact off-month sampling window" });
    await createAccountSet(owner, { client, key: "fy_bank", selector: { account_codes: [BANK1] }, effectiveFrom: startsOn });
    await plainEntry(owner, { client, debit: BANK1, credit: REVN, cents: 100, postingDate: "2023-02-20", memo: "delta first partial-FY stock" });
    await plainEntry(owner, { client, debit: BANK1, credit: REVN, cents: 100, postingDate: "2023-03-15", memo: "delta remaining partial-FY stock" });
    const period = (await reportingPeriodRows(client, "fiscal_year"))[0];
    assert.deepEqual([String(period.period_start).slice(0, 10), String(period.period_end).slice(0, 10)], [startsOn, endsOn]);
    const { snapshotId } = await mintMetricInput(owner, { client, periodIds: [period.id] });
    const sampleDates = (await rootQuery(
      `select distinct sample_date::text sample_date from clara.metric_input_snapshot_samples
        where snapshot_id=$1 and period_id=$2 order by 1`, [snapshotId, period.id],
    )).rows.map((row) => row.sample_date);
    const expectedMonthEnds = monthEnds(startsOn, endsOn);
    assert.ok(sampleDates.includes("2023-02-14"), "the immutable source separately captures period_start - 1");
    assert.ok(sampleDates.includes("2024-02-14"), "the immutable source separately captures period_end");
    assert.deepEqual(sampleDates.filter((date) => expectedMonthEnds.includes(date)), expectedMonthEnds);
    assert.equal(expectedMonthEnds.includes("2023-02-14"), false);
    assert.equal(expectedMonthEnds.includes("2024-02-14"), false);
    const version = await approvedDefinition(owner, {
      client, key: `partial_fy_average_${randomUUID()}`, unit: "money", temporality: "period_average", resultScale: 0,
      appliesFrom: startsOn, ast: metricAst({
        root: { node: "average", of: measure({ set: "fy_bank", aspect: "closing_balance" }) },
        unit: "money", temporality: "period_average", resultScale: 0,
      }),
    });
    const cell = await evaluate(owner, { client, version, period, snapshotId });
    assert.deepEqual([cell.cell_status, String(cell.exact_numerator), String(cell.exact_denominator)], ["ok", "575", "3"]);
    const assessment = await assertE6(owner, cell);
    assert.deepEqual([String(assessment.observed_numerator), String(assessment.observed_denominator)], ["575", "3"]);
  });

  await t.test("lawful filing retirement preserves the old immutable snapshot, primary replay, and E6 provenance", async () => {
    const owner = world.users.alice, client = await freshDeltaClient(owner, "retired-filing-exact"), cited = await verifiedDocument(owner, client, "delta exact retained filing");
    const startsOn = "2023-01-01", endsOn = "2023-12-31";
    await openFY(owner, { client, label: "Delta retained filing FY", startsOn, endsOn });
    const draft = await draftEntryV3(owner, {
      client, resolution: freshResolution(owner, client, { subjectKind: "document", subjectId: cited.documentId }),
      opKey: `delta-retained-exact-${randomUUID()}`, document: cited.documentId, sha256: cited.sha256,
      postingDate: "2023-06-10", memo: "delta retained filing exact entry",
      lines: [{ account_code: BANK1, debit_cents: 211, credit_cents: 0, description: "dr" },
        { account_code: REVN, debit_cents: 0, credit_cents: 211, description: "cr" }],
    });
    await approveEntry(owner, { entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: `delta-retained-exact-approve-${randomUUID()}` });
    await createAccountSet(owner, { client, key: "retained_revenue", selector: { account_codes: [REVN] }, effectiveFrom: startsOn });
    const period = (await reportingPeriodRows(client, "fiscal_year"))[0], { snapshotId } = await mintMetricInput(owner, { client, periodIds: [period.id] });
    const captured = (await rootQuery(
      `select journal_line_id,entry_id,document_id,filing_id,source_doc_sha256,debit_cents,credit_cents
         from clara.metric_input_snapshot_contributions where snapshot_id=$1 and entry_id=$2 order by journal_line_id`,
      [snapshotId, draft.entry_id],
    )).rows;
    assert.ok(captured.length > 0 && captured.every((row) => row.document_id === cited.documentId
      && row.filing_id === cited.filingId && row.source_doc_sha256 === cited.sha256));
    const version = await approvedDefinition(owner, {
      client, key: `retained_revenue_${randomUUID()}`, unit: "money", resultScale: 0, appliesFrom: startsOn,
      ast: metricAst({ root: measure({ set: "retained_revenue" }), unit: "money", resultScale: 0 }),
    });
    const before = await evaluate(owner, { client, version, period, snapshotId });
    assert.deepEqual([before.cell_status, String(before.exact_numerator), String(before.exact_denominator)], ["ok", "211", "1"]);
    await reverseEntryGoverned(owner, draft.entry_id);
    await retireFilingGoverned(owner, cited.filingId);
    const retired = (await rootQuery(
      `select e.reversed_by is not null reversed,f.retired_at is not null retired
         from clara.journal_entries e join clara.document_filings f on f.id=$2 where e.id=$1`,
      [draft.entry_id, cited.filingId],
    )).rows[0];
    assert.deepEqual(retired, { reversed: true, retired: true });
    assert.deepEqual((await rootQuery(
      `select journal_line_id,entry_id,document_id,filing_id,source_doc_sha256,debit_cents,credit_cents
         from clara.metric_input_snapshot_contributions where snapshot_id=$1 and entry_id=$2 order by journal_line_id`,
      [snapshotId, draft.entry_id],
    )).rows, captured);
    const replay = await evaluate(owner, { client, version, period, snapshotId });
    assert.deepEqual([replay.cell_status, String(replay.exact_numerator), String(replay.exact_denominator)], ["ok", "211", "1"]);
    assert.deepEqual((await rootQuery("select entry_id from clara.metric_cell_entries where cell_id=$1 order by entry_id", [replay.id])).rows.map((row) => row.entry_id), [draft.entry_id]);
    assert.deepEqual((await rootQuery("select document_id from clara.metric_cell_documents where cell_id=$1 order by document_id", [replay.id])).rows.map((row) => row.document_id), [cited.documentId]);
    const assessment = await assertE6(owner, replay);
    assert.deepEqual(assessment.details.observed_entry_ids, [draft.entry_id]);
    assert.deepEqual(assessment.details.observed_document_ids, [cited.documentId]);
  });
}
