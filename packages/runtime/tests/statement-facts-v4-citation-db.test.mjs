// #1037 — statementFacts_v4's per-line SOURCE CITATION, on a REAL rig.
//
// Every cell here drives a real Postgres: the real `clara.document_regions` rows, the real
// `clara.witness_citation_regions` numbering, the real typed-consent `prepare`/`consume` pair, the
// real `clara.record_llm_usage_event`, and the real `clara.persist_statement_facts_v2` →
// `clara._persist_statement_core_v2` writer that migration 0291 (#990) taught to bank a citation.
// The ONLY thing mocked is the MODEL, injected through the same services bundle the engine injects
// at boot — so no key is needed and nothing reaches the network.
//
// WHY THIS FILE EXISTS. #990 shipped the receiving half and closed PARTIAL on a measured
// statement: "No live producer can state a citation", so every real machine-lane line rendered
// "No source citation was recorded for this line." The unit battery beside this file
// (`statement-facts-v4-citation.test.mjs`) proves what v4 ASKS for and what it does with the
// answer; only this one can prove the two things that matter to a person looking at the Matching
// tab: that the page and region a persisted line carries are the ones a row of
// `clara.document_regions` actually holds, and that a line the reader could not cite still
// persists — uncited, both columns null, the statement still `done`.
//
// EVIDENCE LAW 2: "the citation landed" is asserted as a POSITIVE READ of
// `clara.bank_statement_lines` compared against the `clara.document_regions` row it came from,
// never as the absence of an exception. The v3 CONTRAST cell is the discriminating half — the
// SAME fixture through the PREVIOUS body must land three null citations, which is what makes the
// cells above it evidence about v4 rather than about the harness.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import * as fx from "./relay-fixtures.mjs";
import {
  WORKED_STATEMENT, buildStatementSituation, readRegionLocator, readStatementLines, readTask,
  statementServices, workedHeader,
} from "./statement-facts-v4-fixtures.mjs";
import {
  persistStatementWitnessPair,
  runStatementWitnessTextRead,
  runStatementWitnessVisionRead,
} from "../workflows/statementFacts.v4.behavior.mjs";
import {
  runStatementWitnessTextRead as runTextReadV3,
  runStatementWitnessVisionRead as runVisionReadV3,
  persistStatementWitnessPair as persistV3,
} from "../workflows/statementFacts.v3.behavior.mjs";
import { readStatementWitnessRegionCitations } from "../workflows/statementFacts.v4.citations.mjs";
import { STATEMENT_WITNESS_ENGINE_SNAPSHOT } from "../workflows/statementFacts.v2.services.mjs";

const ENGINE_ID = STATEMENT_WITNESS_ENGINE_SNAPSHOT.engineId;
const withRuntime = (fn) => fx.asRuntime(fn);

/**
 * THE DURABLE ENGINE'S OWN MEMOIZATION CODEC, reached exactly the way the engine reaches it.
 * `@workflow/world-postgres` stores a step's return value in `steps.output_cbor` through
 * `Cbor()` (dist/drizzle/schema.js:74, dist/drizzle/cbor.js), which is `cbor-x`'s encode/decode —
 * so this IS the boundary a replayed step's value crosses, not a stand-in for it. Resolved
 * through the engine's own package rather than declared as a dependency of this one: it is that
 * package's transitive dependency and pinning it here would let the two drift.
 */
const { encode: cborEncode, decode: cborDecode } = createRequire(import.meta.resolve("@workflow/world-postgres"))("cbor-x");
const asReplayed = (value) => cborDecode(cborEncode(value));

const READY = await rigReady();
const skip = READY ? false : "statement-witness estate absent (clara.persist_statement_facts_v2 / the #990 citation columns)";

async function rigReady() {
  try {
    const r = await fx.rootQuery(
      `select to_regprocedure('clara.persist_statement_facts_v2(uuid,jsonb)') is not null
          and to_regprocedure('clara.witness_citation_regions(uuid)') is not null
          and to_regprocedure('clara.get_bank_line_matching_context(uuid)') is not null
          and exists (select 1 from information_schema.columns
                       where table_schema='clara' and table_name='bank_statement_lines'
                         and column_name='citation_region') as ok`);
    return r.rows[0].ok === true;
  } catch {
    return false;
  }
}

before(() => {
  if (!READY) console.warn("SKIP statement-facts-v4-citation-db: the #990 citation columns are absent on this rig.");
});
after(async () => { await fx.endPool(); });

/**
 * Drive ONE statement through a body's own two reads and its persist, with the model scripted.
 *
 * `cite` decides, per printed row index, which region idx the TEXT reader claims to have read it
 * from — `null` means the reader honestly could not name one. The vision reader answers the same
 * figures and never a citation, which is the real shape: it is shown no regions.
 */
async function driveStatement(situation, { cite, text = runStatementWitnessTextRead, vision = runStatementWitnessVisionRead, persist = persistStatementWitnessPair }) {
  const calls = [];
  const header = workedHeader(situation.account.digits);
  const answer = (call) => ({
    header: { ...header },
    lines: WORKED_STATEMENT.lines.map((line, i) => (call.channel === "text"
      ? { ...line, region_idx: cite(i) }
      : { ...line })),
  });
  const services = statementServices({ engineId: ENGINE_ID, answer, calls });
  const textRead = await text(services, withRuntime, situation.taskId, situation.claimDoc);
  const visionRead = await vision(services, withRuntime, situation.taskId, situation.claimDoc);
  const out = await persist(services, withRuntime, situation.taskId, textRead, visionRead);
  return { calls, textRead, visionRead, out };
}

test("1037.db1 every line the v4 text reader cited persists with the PAGE and the LOCATOR of the clara.document_regions row it named — and with the extraction id the persist core stamps itself", { skip }, async () => {
  const s = await buildStatementSituation("v4cite-a", { engineId: ENGINE_ID });
  // Each printed row cites the region seeded for it. The idx is READ BACK from the published
  // numbering, which is ordered by uuid and therefore unrelated to insertion order — a cell that
  // assumed 1,2,3 would be testing its own arithmetic.
  const { calls, out } = await driveStatement(s, { cite: (i) => s.idxForLine(i) });

  assert.equal(calls.length, 2, "one text call and one vision call, both paid once");
  assert.equal(out.status, "done", `the statement persisted cleanly (${JSON.stringify(out.receipt)})`);
  const statementId = out.receipt?.statement_id;
  assert.ok(statementId, "the door names the statement it banked");

  const rows = await readStatementLines(statementId);
  assert.equal(rows.length, 3, "three printed rows, three persisted lines");
  for (const [i, row] of rows.entries()) {
    const locator = await readRegionLocator(s.regionIds[i]);
    assert.ok(locator, `the seeded region ${i} is readable`);
    assert.equal(
      row.citation_page, Number(locator.page),
      `line ${i + 1} carries the PAGE the region's own locator prints, not the reader's index`,
    );
    assert.deepEqual(
      row.citation_region, locator,
      `line ${i + 1} carries the region's locator VERBATIM — the same object the document viewer's polygon layer renders`,
    );
    assert.equal(
      row.citation_extraction_id, out.receipt.reader1_extraction_id,
      "…and the extraction id is the one THIS transaction banked reader1's read into, never a caller-supplied value",
    );
  }
  // The pages are distinct per line, so a harness that had blurred one citation across three rows
  // would be visible rather than plausible.
  assert.deepEqual(rows.map((r) => r.citation_page), [1, 2, 3]);

  // The MATCHING TAB'S OWN DOOR — the read #990's three-state sentence is rendered from.
  const ids = (await fx.rootQuery(
    "select id from clara.bank_statement_lines where statement_id=$1 order by line_no", [statementId])).rows;
  // Driven as the OWNER, not as the runtime role: 0016's read is granted to
  // `clara_authenticated` alone, which is the measured reason a machine lane cannot call it
  // (CUT-PLAN section 1.1). The person looking at the Matching tab is the real caller.
  const ctx = await fx.humanQuery(s.owner,
    "select clara.get_bank_line_matching_context($1) as r", [ids[0].id]);
  assert.equal(
    ctx.rows[0].r?.line?.citation_page, 1,
    "the detail-pane door surfaces the citation, so the face renders the PRESENT sentence rather than the absence one",
  );

  const task = await readTask(s.taskId);
  assert.equal(task.status, "done", "the task is settled done by the same transaction");
});

test("1037.db2 the SAME fixture through statementFacts_v3 persists three lines with NO citation at all — the before/after control", { skip }, async () => {
  const s = await buildStatementSituation("v4cite-b", { engineId: ENGINE_ID });
  // v3's text schema has no region_idx and its `toWriterLines` rebuilds every line from six named
  // keys, so the SAME scripted answer — region indices included — cannot reach the payload.
  const { out } = await driveStatement(s, {
    cite: (i) => s.idxForLine(i), text: runTextReadV3, vision: runVisionReadV3, persist: persistV3,
  });
  assert.equal(out.status, "done");
  const rows = await readStatementLines(out.receipt.statement_id);
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(row.citation_page, null, "a v3-produced line records no page");
    assert.equal(row.citation_region, null, "…and no region");
    assert.equal(row.citation_extraction_id, null, "…and no extraction, which is what the ck_shape constraint requires");
  }
  const ids = (await fx.rootQuery(
    "select id from clara.bank_statement_lines where statement_id=$1 order by line_no", [out.receipt.statement_id])).rows;
  const ctx = await fx.humanQuery(s.owner,
    "select clara.get_bank_line_matching_context($1) as r", [ids[0].id]);
  assert.equal(
    ctx.rows[0].r?.line?.citation_page, null,
    "the same door reports the absence, which is the state #990's stated-absence sentence renders from",
  );
});

test("1037.db3 a row the reader could not honestly cite persists UNCITED beside rows that could — both columns or neither, and the statement still lands done", { skip }, async () => {
  const s = await buildStatementSituation("v4cite-c", { engineId: ENGINE_ID });
  // Row 1 cited; row 2 answered null (split across regions, or simply unsure); row 3 names an idx
  // that belongs to no region the reader was shown — a wrong number is worse than no number, so
  // it must land as no citation rather than as the nearest region.
  const { out } = await driveStatement(s, { cite: (i) => (i === 0 ? s.idxForLine(0) : (i === 1 ? null : 9999)) });
  assert.equal(out.status, "done", "an optional field never costs a paid two-channel read");
  const rows = await readStatementLines(out.receipt.statement_id);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].citation_page, 1);
  assert.ok(rows[0].citation_region, "the cited row carries its region");
  for (const row of rows.slice(1)) {
    assert.equal(row.citation_page, null);
    assert.equal(row.citation_region, null);
    assert.equal(row.citation_extraction_id, null);
  }
});

test("1037.db4 the region lookup that PERSISTS is firm-scoped — a foreign firm's page geometry can never be resolved into this firm's rows", { skip }, async () => {
  const s = await buildStatementSituation("v4cite-d", { engineId: ENGINE_ID });
  const other = await fx.buildFirm("v4cite-d-other");
  const shown = new Set(s.numbered.map((n) => Number(n.idx)));

  // ADV-1037-03. `clara.witness_citation_regions` is SECURITY DEFINER with no firm check and
  // `p_document_regions_runtime_read`'s qual is `true`, so `clara_runtime` really can read every
  // firm's regions — the isolation this cell measures is the READ's own predicate, not the
  // estate's. Driven as the RUNTIME role, which is the role the frozen behaviour runs under.
  const mine = await withRuntime((client) => readStatementWitnessRegionCitations(client, {
    extractionId: s.ocrId, firmId: s.firm, shownIdxs: shown,
  }));
  assert.equal(mine.size, s.regionIds.length, "the owning firm resolves every one of its own seeded regions");

  const theirs = await withRuntime((client) => readStatementWitnessRegionCitations(client, {
    extractionId: s.ocrId, firmId: other.firm, shownIdxs: shown,
  }));
  assert.equal(theirs.size, 0, "…and a different firm resolves none of them, however valid the extraction id it holds");

  // The discriminating half: the SAME rows are readable to the same role without the predicate,
  // so the zero above is the predicate biting rather than an empty extraction.
  const unscoped = await withRuntime((client) => client.query(
    "select w.idx from clara.witness_citation_regions($1) w"
    + " join clara.document_regions r on r.id = w.region_id", [s.ocrId]));
  assert.equal(unscoped.rows.length, s.regionIds.length,
    "the runtime role CAN see these rows unscoped — which is exactly why the read that persists carries a firm");
});

test("1037.db5 what a persisted citation is, measured: the region's OWN locator COPIED, beside an extraction id that does not navigate to it", { skip }, async () => {
  const s = await buildStatementSituation("v4cite-e", { engineId: ENGINE_ID });
  const { out } = await driveStatement(s, { cite: (i) => s.idxForLine(i) });
  assert.equal(out.status, "done");
  const rows = await readStatementLines(out.receipt.statement_id);
  const citationExtraction = rows[0].citation_extraction_id;
  assert.ok(citationExtraction, "the premise: this line carries a citation");

  // ADV-1037-02, recorded as a cell so the report cannot over-claim it again. 0291's column
  // comment calls citation_extraction_id "which clara.document_extractions row this line's
  // citation was read FROM"; `clara._persist_statement_core_v2` in fact stamps v_ext1 — the
  // READER-1 extraction this same transaction created — unconditionally, and a producer cannot
  // influence it. The regions a v4 citation is read from belong to the OCR extraction, which is
  // a different row. So the stored trio is not re-walkable: the locator is COPIED, not linked.
  assert.notEqual(citationExtraction, s.ocrId, "the stamped extraction is NOT the OCR extraction the region came from");
  assert.equal(citationExtraction, out.receipt.reader1_extraction_id, "it is the reader-1 row this transaction banked");
  const walked = await fx.rootQuery(
    "select count(*)::int as n from clara.document_regions where extraction_id = $1", [citationExtraction]);
  assert.equal(walked.rows[0].n, 0,
    "…and it carries no regions at all, so no stored column navigates from the line back to clara.document_regions");
  const owning = await fx.rootQuery(
    "select count(*)::int as n from clara.document_regions where extraction_id = $1", [s.ocrId]);
  assert.equal(owning.rows[0].n, s.regionIds.length, "the regions live on the OCR extraction, which the line does not name");

  // What IS true, and is the whole of what the Matching tab needs: the stored region is the
  // document_regions locator itself, byte for byte, so the viewer's polygon layer renders the
  // patch the reader named even though nothing can re-walk the link.
  assert.deepEqual(rows[0].citation_region, await readRegionLocator(s.regionIds[0]));
});

test("1037.db6 the WIDENED text read survives the durable engine's own memoization codec — a replayed step hands the persist the same citations", { skip }, async () => {
  const s = await buildStatementSituation("v4cite-f", { engineId: ENGINE_ID });
  const calls = [];
  const header = workedHeader(s.account.digits);
  const services = statementServices({
    engineId: ENGINE_ID,
    calls,
    answer: (call) => ({
      header: { ...header },
      lines: WORKED_STATEMENT.lines.map((line, i) => (call.channel === "text"
        ? { ...line, region_idx: s.idxForLine(i) }
        : { ...line })),
    }),
  });

  // C2-SPEC-02's named residual, measured at the seam it actually lives at. `statementWitness
  // TextReadStep` is a memoized step, so on a replay the persist is handed the value the engine
  // DECODED out of `steps.output_cbor` rather than the value this read returned — and what v4
  // widened is precisely that value (one integer and one jsonb locator object per cited line).
  // This does not run inside a durable World (no statementFacts World driver exists; that is the
  // follow-up), but the crossing it would exercise is this one.
  const textRead = await runStatementWitnessTextRead(services, withRuntime, s.taskId, s.claimDoc);
  const visionRead = await runStatementWitnessVisionRead(services, withRuntime, s.taskId, s.claimDoc);
  const replayedText = asReplayed(textRead);
  const replayedVision = asReplayed(visionRead);
  assert.ok(cborEncode(textRead).byteLength > 0, "the premise: the value really was encoded to bytes");
  assert.notEqual(replayedText, textRead, "…and decoded back into a DIFFERENT object, so the crossing is real rather than an identity");
  assert.deepEqual(replayedText, textRead, "the widened text-read value round-trips through the engine's codec unchanged");
  assert.deepEqual(replayedVision, visionRead);
  // Named explicitly, because these two keys are the whole of what v4 added to the crossing.
  assert.equal(typeof replayedText.lines[0].page, "number");
  assert.deepEqual(replayedText.lines[0].region, await readRegionLocator(s.regionIds[0]));

  // And the persist is driven from the REPLAYED values, so what is asserted below is the state a
  // resumed run would bank rather than the state the first attempt held in memory.
  const out = await persistStatementWitnessPair(services, withRuntime, s.taskId, replayedText, replayedVision);
  assert.equal(out.status, "done", `the replayed pair persists cleanly (${JSON.stringify(out.receipt)})`);
  const rows = await readStatementLines(out.receipt.statement_id);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.citation_page), [1, 2, 3], "every citation survived the crossing");
  for (const [i, row] of rows.entries()) {
    assert.deepEqual(row.citation_region, await readRegionLocator(s.regionIds[i]));
    assert.equal(row.citation_extraction_id, out.receipt.reader1_extraction_id);
  }
});

test(`META: the statement-witness citation estate is present (${READY ? "live" : "ABSENT"})`, () => {
  assert.equal(READY, true, String(skip));
});
