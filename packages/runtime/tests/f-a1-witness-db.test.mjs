// F-A1 witnessFacts_v1 — THE REAL-RIG BATTERY (Annex C's runtime cells).
//
// Every cell here drives a REAL Postgres migrated 0001→0095: the real typed-consent verbs, the
// real `prepare`/`consume_egress_dispatch` pair, the real `clara.witness_citation_regions`
// numbering, the real `clara.persist_witness_facts`, the real
// `clara.evaluate_witness_fact_state_v1`. The ONLY thing mocked is the MODEL — injected through
// `globalThis.__claraModelForTest`, the same override every other model lane in this runtime
// uses (classify-llm.mjs:115), so no key is needed and nothing reaches the network. The AI SDK
// call path itself is REAL: the vision cells build a genuine `{type:"file"}` content part from
// real bytes and hand it to the real `generateObject`.
//
// WHAT THE MOCK COUNTS. Every cell that says "no second model call" proves it by COUNTING mock
// invocations, not by reading a log line — an absence measured with the wrong instrument is the
// one class of evidence this repo has been bitten by repeatedly.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import * as fx from "./relay-fixtures.mjs";
import {
  buildWitnessSituation, readDispatchAuthorizations, readExtractions, readFactRegions,
  readTask, readUsageRows, readWitnessState, witnessMock, witnessServices, witnessWire,
} from "./f-a1-witness-fixtures.mjs";
import {
  persistWitnessPair, runWitnessTextRead, runWitnessVisionRead, WITNESS_EVENT_TYPE, WITNESS_PURPOSE,
} from "../workflows/witnessFacts.v1.behavior.mjs";
import { witnessPromptHash } from "../workflows/witnessFacts.v1.prompts.mjs";

const READY = await witnessReady();
const skip = READY ? false : "F-A1 witness estate absent (clara.persist_witness_facts / witness_citation_regions)";
const withRuntime = (fn) => fx.asRuntime(fn);
let tmpRoot;
/** The injected bundle — the REAL model adapter, the REAL engine snapshot, a storage stub.
 *  Shared with the locator battery so the two files cannot drift into testing two harnesses. */
const services = () => witnessServices(tmpRoot);
const wire = witnessWire;

async function witnessReady() {
  const r = await fx.rootQuery(
    `select to_regprocedure('clara.persist_witness_facts(uuid,jsonb,jsonb,int)') is not null
        and to_regprocedure('clara.witness_citation_regions(uuid)') is not null
        and to_regprocedure('clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid)') is not null
        and to_regclass('clara.llm_usage_events') is not null as ok`);
  return r.rows[0].ok === true;
}

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  tmpRoot = await mkdtemp(join(base, "clara-witness-"));
});
after(async () => {
  delete globalThis.__claraModelForTest;
  await fx.endPool();
  await rm(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------
// The document under test: LAI LOU MEI's own arithmetic, the same base the DB batteries anchor
// to — 94.30 + 3.77 + 5.66 + 0.02 = 103.75.
// ---------------------------------------------------------------------------------------
const REGIONS = [
  { label: "total", text: "TOTAL DUE RM 103.75 nett" },
  { label: "net", text: "SUBTOTAL RM 94.30" },
  { label: "tax", text: "SST 6% RM 5.66" },
  { label: "svc", text: "SERVICE CHARGE RM 3.77" },
  { label: "round", text: "ROUNDING ADJ RM 0.02" },
  { label: "ccy", text: "Currency stated: MYR only" },
  { label: "type", text: "Doc Type Code: 01" },
];

const citationsFor = (s) => [
  { field_path: "invoice.total", region_idx: s.idxOf.total, raw: null },
  { field_path: "invoice.total_excl_tax", region_idx: s.idxOf.net, raw: null },
  { field_path: "invoice.tax_total", region_idx: s.idxOf.tax, raw: null },
  { field_path: "invoice.service_charge", region_idx: s.idxOf.svc, raw: null },
  { field_path: "invoice.rounding", region_idx: s.idxOf.round, raw: null },
  { field_path: "invoice.currency", region_idx: s.idxOf.ccy, raw: null },
  { field_path: "invoice.type_code", region_idx: s.idxOf.type, raw: null },
];

// =======================================================================================
// THE HAPPY PAIR, END TO END.
// =======================================================================================

test("f-a1.pr2.a happy pair — two authorized calls, one atomic persist, task settles done, the predicate CORROBORATES", { skip }, async () => {
  const s = await buildWitnessSituation("happy", { regions: REGIONS });
  const calls = witnessMock({ text: { ...wire(), citations: citationsFor(s) }, vision: wire() });

  const textRead = await runWitnessTextRead(services(), withRuntime, s.taskId, s.claimDoc);
  const visionRead = await runWitnessVisionRead(services(), withRuntime, s.taskId, s.claimDoc);
  assert.deepEqual(calls.map((c) => c.channel), ["text", "vision"], "exactly one call per channel");
  assert.ok(calls[1].parts.includes("file"), "the vision call carries a FILE content part — the original bytes, not a transcription");
  assert.ok(!calls[0].parts.includes("file"), "the text call carries no bytes");

  // The independence receipt, checkable: distinct pins + distinct prompt hashes.
  assert.equal(textRead.input_pin, s.ocrId, "the text read pins the OCR extraction it read");
  assert.equal(visionRead.input_pin, s.sha256, "the vision read pins documents.sha256");
  assert.notEqual(textRead.prompt_hash, visionRead.prompt_hash);
  assert.equal(textRead.prompt_hash, witnessPromptHash("text"));
  assert.equal(visionRead.prompt_hash, witnessPromptHash("vision"));

  const out = await persistWitnessPair(services(), withRuntime, s.taskId, textRead, visionRead);
  assert.equal(out.status, "done");
  assert.equal(out.receipt.replayed, false);
  assert.equal((await readTask(s.taskId)).status, "done", "the WRITER settles the task — this lane never settles it itself");

  const rows = await readExtractions(s.documentId);
  const witnessRows = rows.filter((r) => r.engine_kind.startsWith("llm_"));
  assert.equal(witnessRows.length, 2);
  assert.deepEqual(witnessRows.map((r) => r.engine_kind), ["llm_vision_facts", "llm_text_facts"],
    "vision FIRST, text LAST — the writer's clock ordering, so the document pointer lands on the TEXT row (§3.9 note 4)");
  assert.equal(new Set(witnessRows.map((r) => r.engine_id)).size, 1,
    "M15: ONE shared engine_id across both kinds — the INVERSE of the statement pair's discriminator");
  for (const r of witnessRows) assert.equal(r.superseded_by, null, "neither half of a one-transaction pair may supersede the other (§3.9)");
  assert.equal(witnessRows[0].page_count, 1, "pages_used rides from the pinned OCR extraction's own page_count");

  const verdict = await readWitnessState(s.documentId, out.receipt.text_extraction_id, out.receipt.vision_extraction_id);
  assert.equal(verdict.corroborated, true, `the pair must corroborate (got ${JSON.stringify(verdict)})`);
  assert.equal(verdict.total_cents, 10375);
  assert.equal(verdict.tax_total_cents, 566);
  assert.equal(verdict.total_excl_tax_cents, 9430);
  assert.equal(verdict.extraction_id, out.receipt.text_extraction_id, "the canonical extraction is the TEXT row — the region-bearing one");
});

test("f-a1.pr2.b the cited fact regions land on the TEXT row with the OCR polygon, the source uuid, and NULL confidence", { skip }, async () => {
  const s = await buildWitnessSituation("regions", { regions: REGIONS });
  witnessMock({ text: { ...wire(), citations: citationsFor(s) }, vision: wire() });
  const textRead = await runWitnessTextRead(services(), withRuntime, s.taskId, s.claimDoc);
  const visionRead = await runWitnessVisionRead(services(), withRuntime, s.taskId, s.claimDoc);
  const out = await persistWitnessPair(services(), withRuntime, s.taskId, textRead, visionRead);

  const textFacts = await readFactRegions(out.receipt.text_extraction_id);
  const visionFacts = await readFactRegions(out.receipt.vision_extraction_id);
  assert.equal(visionFacts.length, 0, "the vision row carries NO regions (design §3.1) — one region-bearing row, so no consumer can bind the wrong one");
  const total = textFacts.find((r) => r.field_path === "invoice.total");
  assert.equal(total.text_content, "RM 103.75", "text_content is the answer's raw — the single locked source");
  assert.equal(total.monetary_raw, "RM 103.75");
  assert.equal(Number(total.monetary_cents), 10375, "cents are re-derived server-side from the rendering, never model-asserted");
  assert.equal(total.engine_confidence, null, "the >=0.95 mirror must never return");
  assert.equal(total.locator.source_region_id, s.regionIds.total, "the fact points back at the OCR region it was cited from");
  assert.deepEqual(total.locator.polygon, [0, 0, 5, 0, 5, 5, 0, 5], "the cited OCR region's own polygon");
});

// =======================================================================================
// CITATION NUMBERING PARITY (review M5) — the whole contract in one cell.
// =======================================================================================

test("f-a1.pr2.c the numbering the PROMPT shows equals clara.witness_citation_regions, and equals what the writer resolves", { skip }, async () => {
  const s = await buildWitnessSituation("parity", { regions: REGIONS });
  const calls = witnessMock({ text: { ...wire(), citations: citationsFor(s) }, vision: wire() });
  const textRead = await runWitnessTextRead(services(), withRuntime, s.taskId, s.claimDoc);

  // (1) THE PROMPT THE MODEL ACTUALLY SAW == the published numbering, region for region. Read
  //     off the mock's own received content parts, not off a re-derivation.
  const published = await fx.rootQuery(
    "select idx, page, region_id, text_content from clara.witness_citation_regions($1) order by idx", [s.ocrId]);
  assert.equal(published.rows.length, REGIONS.length);
  assert.deepEqual(published.rows.map((r) => r.idx), [1, 2, 3, 4, 5, 6, 7], "a DENSE 1..N ordinal over this extraction's OWN regions");
  const shownLines = calls[0].text.split("\n").filter((l) => /^\[\d+/.test(l));
  assert.equal(shownLines.length, published.rows.length, "every published region is shown, and nothing else is");
  for (const row of published.rows) {
    const marker = row.page == null ? `[${row.idx}]` : `[${row.idx} p${row.page}]`;
    assert.ok(shownLines.includes(`${marker} ${row.text_content}`),
      `the prompt must show region ${row.idx} with its OWN published idx, page and text (got ${JSON.stringify(shownLines)})`);
  }
  assert.match(calls[0].system, /NEVER cite a region number that is not in the list/,
    "the frozen system prompt reached the provider intact");

  // (2) the writer resolved each cited idx to the SAME region uuid the published numbering names.
  const visionRead = await runWitnessVisionRead(services(), withRuntime, s.taskId, s.claimDoc);
  const out = await persistWitnessPair(services(), withRuntime, s.taskId, textRead, visionRead);
  const facts = await readFactRegions(out.receipt.text_extraction_id);
  for (const [label, field] of [["total", "invoice.total"], ["net", "invoice.total_excl_tax"], ["tax", "invoice.tax_total"], ["ccy", "invoice.currency"], ["type", "invoice.type_code"]]) {
    const fact = facts.find((f) => f.field_path === field);
    const publishedRow = published.rows.find((r) => r.idx === s.idxOf[label]);
    assert.equal(fact.locator.source_region_id, publishedRow.region_id,
      `${field}: idx ${s.idxOf[label]} must resolve to the SAME region the published numbering names`);
  }

  // (3) the numbering is STABLE across a witness persist — the witness rows' own fact regions
  //     belong to a DIFFERENT extraction, so they cannot renumber the OCR ordinal.
  const after = await fx.rootQuery(
    "select idx, region_id from clara.witness_citation_regions($1) order by idx", [s.ocrId]);
  assert.deepEqual(after.rows, published.rows.map(({ idx, region_id }) => ({ idx, region_id })));
});

// =======================================================================================
// MEMOIZED REPLAY — no second model call.
// =======================================================================================

test("f-a1.pr2.d a persist REPLAY re-uses the stored envelopes and buys NO further model call", { skip }, async () => {
  const s = await buildWitnessSituation("replay", { regions: REGIONS });
  const calls = witnessMock({ text: { ...wire(), citations: citationsFor(s) }, vision: wire() });
  const textRead = await runWitnessTextRead(services(), withRuntime, s.taskId, s.claimDoc);
  const visionRead = await runWitnessVisionRead(services(), withRuntime, s.taskId, s.claimDoc);
  assert.equal(calls.length, 2);

  // The MEMOIZATION PRECONDITION, checked rather than assumed: a durable step's return value is
  // stored as JSON, so an envelope that does not survive a round trip could never be replayed.
  const rehydratedText = JSON.parse(JSON.stringify(textRead));
  const rehydratedVision = JSON.parse(JSON.stringify(visionRead));
  assert.deepEqual(rehydratedText, textRead, "the text step's receipt is JSON-round-trippable");
  assert.deepEqual(rehydratedVision, visionRead, "the vision step's receipt is JSON-round-trippable");

  const first = await persistWitnessPair(services(), withRuntime, s.taskId, rehydratedText, rehydratedVision);
  assert.equal(first.receipt.replayed, false);
  // The retry: the SAME memoized envelopes, no model involved.
  const second = await persistWitnessPair(services(), withRuntime, s.taskId, rehydratedText, rehydratedVision);
  assert.equal(second.receipt.replayed, true, "the writer's idempotent replay returns the STORED receipt");
  assert.equal(second.receipt.text_extraction_id, first.receipt.text_extraction_id);
  assert.equal(second.receipt.vision_extraction_id, first.receipt.vision_extraction_id);
  assert.equal(calls.length, 2, "STILL two model calls after a persist retry — the whole reason each read is its own memoized step");
  const rows = (await readExtractions(s.documentId)).filter((r) => r.engine_kind.startsWith("llm_"));
  assert.equal(rows.length, 2, "a replay mints no second pair");
});

// =======================================================================================
// EGRESS — the refusal path, and the two dispatch authorizations.
// =======================================================================================

test("f-a1.pr2.e NO live consent -> the read REFUSES before any model call, and records a 'refused' usage row", { skip }, async () => {
  const s = await buildWitnessSituation("noconsent", { regions: REGIONS, consent: false });
  const calls = witnessMock({ text: { ...wire(), citations: citationsFor(s) }, vision: wire() });

  await assert.rejects(
    () => runWitnessTextRead(services(), withRuntime, s.taskId, s.claimDoc),
    (err) => err.code === "witness_consent_inactive" && err.witnessRefusal === true,
  );
  assert.equal(calls.length, 0, "NO model call — the bytes never left");

  const usage = await readUsageRows(s.taskId);
  assert.equal(usage.length, 1, "a refusal is still a metering event worth recording");
  assert.equal(usage[0].channel, "text");
  assert.equal(usage[0].outcome, "refused");
  assert.equal(usage[0].engine_id, s.engineId, "the TASK's own engine stamp, never a literal from the runtime");
  assert.equal(usage[0].prompt_hash, witnessPromptHash("text"));
  assert.equal((await readTask(s.taskId)).status, "running",
    "NAMED GAP: there is no clara.fail_witness_facts, so a dispatch-time refusal cannot settle the task — the DB's attempt cap does");
  assert.equal((await readDispatchAuthorizations(s.firm)).length, 0, "no authorization was minted");
});

test("f-a1.pr2.f the vision channel refuses the same way, and neither channel bypasses the gate", { skip }, async () => {
  const s = await buildWitnessSituation("noconsent2", { regions: REGIONS, consent: false });
  const calls = witnessMock({ text: { ...wire(), citations: citationsFor(s) }, vision: wire() });
  await assert.rejects(
    () => runWitnessVisionRead(services(), withRuntime, s.taskId, s.claimDoc),
    (err) => err.code === "witness_consent_inactive",
  );
  assert.equal(calls.length, 0, "the vision channel is gated too — one purpose, BOTH channels");
  const usage = await readUsageRows(s.taskId);
  assert.deepEqual(usage.map((u) => [u.channel, u.outcome]), [["vision", "refused"]]);
});

test("f-a1.pr2.g more than one live filing client -> witness_multi_client, no model call", { skip }, async () => {
  const s = await buildWitnessSituation("multi", { regions: REGIONS });
  const second = await fx.createClient(s.owner, { name: `${s.owner}-second`, opKey: fx.opk("cli2") });
  await fx.rootQuery(
    "insert into clara.document_filings (firm_id, document_id, client_id, basis) values ($1,$2,$3,'legacy-0007')",
    [s.firm, s.documentId, second]);
  const calls = witnessMock({ text: { ...wire(), citations: citationsFor(s) }, vision: wire() });
  await assert.rejects(
    () => runWitnessTextRead(services(), withRuntime, s.taskId, s.claimDoc),
    (err) => err.code === "witness_multi_client" && err.witnessRefusal === true,
  );
  assert.equal(calls.length, 0);
});

test("f-a1.pr2.h TWO sha-bound authorizations per document — one per channel, both CONSUMED", { skip }, async () => {
  const s = await buildWitnessSituation("dispatch", { regions: REGIONS });
  witnessMock({ text: { ...wire(), citations: citationsFor(s) }, vision: wire() });
  await runWitnessTextRead(services(), withRuntime, s.taskId, s.claimDoc);
  await runWitnessVisionRead(services(), withRuntime, s.taskId, s.claimDoc);

  const auths = await readDispatchAuthorizations(s.firm);
  assert.equal(auths.length, 2, "each model call wraps its OWN dispatch — never one authorization shared across two egresses");
  for (const a of auths) {
    assert.equal(a.purpose, WITNESS_PURPOSE);
    assert.equal(a.event_type, WITNESS_EVENT_TYPE);
    assert.equal(Number(a.event_seq), s.versionN, "task-driven: the 'event' is the task's own version_n");
    assert.equal(a.document_sha256, s.sha256, "sha-bound (0090 §7b) — an authorization for document A can never be spent on document B");
    assert.ok(a.consumed_at != null, "consume is the linearization point and it COMMITTED");
  }
});

// =======================================================================================
// PROVENANCE — the engine stamp must name the model that is about to be called.
// =======================================================================================

test("f-a1.pr2.o a task stamped with a DIFFERENT engine_id never egresses — provenance may not name a model this image did not call", { skip }, async () => {
  // The router-vs-image disagreement, made real: a task whose stamp is lane-legal (`llm-%`, so
  // the prefix CHECK admits it) but names a model this image does not call.
  const s = await buildWitnessSituation("stampdrift", { regions: REGIONS, engineId: "llm-openai:some-other-model:v1" });
  const calls = witnessMock({ text: { ...wire(), citations: citationsFor(s) }, vision: wire() });
  await assert.rejects(
    () => runWitnessTextRead(services(), withRuntime, s.taskId, s.claimDoc),
    (err) => err.claraRetry === true && /did not call/.test(err.message),
  );
  assert.equal(calls.length, 0, "no egress under a false provenance receipt");
  assert.deepEqual(await readUsageRows(s.taskId), [], "a deployment mismatch is not client spend");
  assert.equal((await readTask(s.taskId)).status, "running", "it WAITS — the right image makes the same task succeed unchanged");
});

test("f-a1.pr2.p an absent engine snapshot is a wiring fault, never a skipped check (fail-open by omission)", { skip }, async () => {
  const s = await buildWitnessSituation("nosnapshot", { regions: REGIONS });
  const calls = witnessMock({ text: { ...wire(), citations: citationsFor(s) }, vision: wire() });
  const crippled = services();
  delete crippled.engineSnapshot;
  await assert.rejects(
    () => runWitnessTextRead(crippled, withRuntime, s.taskId, s.claimDoc),
    (err) => err.claraRetry === true && /no engine snapshot/.test(err.message),
  );
  assert.equal(calls.length, 0);
});

// THE LOCATOR-KEY CELLS (the page-spelling fix at the source, and its negative twin) live in
// their own battery: packages/runtime/tests/f-a1-witness-locator.test.mjs. They need a different
// fixture shape — regions seeded THROUGH the real normalizeAzureLayout — and their subject is the
// producer plus the identity leaf's geometry path rather than this lane's orchestration.

// =======================================================================================
// USAGE METERING — one row per call, including a failed one.
// =======================================================================================

test("f-a1.pr2.i one usage row per model call, with token counts, duration and outcome", { skip }, async () => {
  const s = await buildWitnessSituation("usage", { regions: REGIONS });
  witnessMock({ text: { ...wire(), citations: citationsFor(s) }, vision: wire() });
  await runWitnessTextRead(services(), withRuntime, s.taskId, s.claimDoc);
  await runWitnessVisionRead(services(), withRuntime, s.taskId, s.claimDoc);

  const usage = await readUsageRows(s.taskId);
  assert.equal(usage.length, 2);
  assert.deepEqual(usage.map((u) => u.channel).sort(), ["text", "vision"]);
  for (const u of usage) {
    assert.equal(u.outcome, "success");
    assert.equal(u.engine_id, s.engineId);
    assert.equal(u.input_tokens, 1200, "the provider's own token count, not a guess");
    assert.equal(u.output_tokens, 340);
    assert.ok(u.duration_ms >= 0);
    assert.equal(u.firm_id, s.firm);
    assert.equal(u.document_id, s.documentId);
  }
  const hashes = new Set(usage.map((u) => u.prompt_hash));
  assert.equal(hashes.size, 2, "the two channels are distinguishable in the spend trail by prompt hash");
});

test("f-a1.pr2.j a FAILED model call still meters — a call that cost money is recorded whether or not it produced a read", { skip }, async () => {
  const s = await buildWitnessSituation("failedcall", { regions: REGIONS });
  const calls = witnessMock({ text: { ...wire(), citations: citationsFor(s) }, vision: wire(), throwOn: "text" });
  await assert.rejects(() => runWitnessTextRead(services(), withRuntime, s.taskId, s.claimDoc));
  assert.equal(calls.length, 1, "the call WAS made — it just failed");
  const usage = await readUsageRows(s.taskId);
  assert.equal(usage.length, 1);
  assert.equal(usage[0].channel, "text");
  assert.equal(usage[0].outcome, "error");
  assert.equal(usage[0].input_tokens, null, "no token counts to record — null, never a coerced zero");
});

test("f-a1.pr2.k a WAIT (absent OCR substrate) is NOT metered — nothing was dispatched, so nothing may look like spend", { skip }, async () => {
  const s = await buildWitnessSituation("nosubstrate", { regions: [], ocr: false });
  const calls = witnessMock({ text: wire(), vision: wire() });
  await assert.rejects(
    () => runWitnessTextRead(services(), withRuntime, s.taskId, s.claimDoc),
    (err) => err.claraRetry === true && /no done OCR extraction/.test(err.message),
  );
  assert.equal(calls.length, 0);
  assert.deepEqual(await readUsageRows(s.taskId), [], "a phantom model call must never enter the firm's spend trail");
});

// =======================================================================================
// THE WRITER'S OWN STRUCTURAL REFUSALS, surfaced through this lane.
// =======================================================================================

test("f-a1.pr2.l EQUAL prompt hashes are refused by the writer — the independence receipt, surfaced as CLR10", { skip }, async () => {
  const s = await buildWitnessSituation("equalhash", { regions: REGIONS });
  witnessMock({ text: { ...wire(), citations: citationsFor(s) }, vision: wire() });
  const textRead = await runWitnessTextRead(services(), withRuntime, s.taskId, s.claimDoc);
  const visionRead = await runWitnessVisionRead(services(), withRuntime, s.taskId, s.claimDoc);
  const forged = { ...visionRead, prompt_hash: textRead.prompt_hash };
  await assert.rejects(
    () => persistWitnessPair(services(), withRuntime, s.taskId, textRead, forged),
    (err) => err.code === "CLR10" && /same prompt hash/.test(err.message),
  );
  assert.equal((await readExtractions(s.documentId)).filter((r) => r.engine_kind.startsWith("llm_")).length, 0,
    "the refusal is atomic — no half-pair is left behind");
});

test("f-a1.pr2.m a model that answers NOTHING still persists whole, and the predicate refuses it", { skip }, async () => {
  const s = await buildWitnessSituation("silent", { regions: REGIONS });
  const silent = {
    answers: Object.fromEntries([
      ...["invoice.total", "invoice.total_excl_tax", "invoice.tax_total", "invoice.rounding",
        "invoice.service_charge", "invoice.discount", "invoice.delivery", "invoice.amount_due",
        "invoice.deposit", "invoice.currency", "invoice.type_code"].map((f) => [f, { state: "not_printed", raw: null }]),
      ["invoice.invoice_id", { state: "not_printed", raw: null, value: null }],
      ["invoice.invoice_date", { state: "not_printed", raw: null, value: null }],
    ]),
    contest: false,
  };
  witnessMock({ text: { ...silent, citations: [] }, vision: silent });
  const textRead = await runWitnessTextRead(services(), withRuntime, s.taskId, s.claimDoc);
  const visionRead = await runWitnessVisionRead(services(), withRuntime, s.taskId, s.claimDoc);
  const out = await persistWitnessPair(services(), withRuntime, s.taskId, textRead, visionRead);
  assert.equal(out.receipt.replayed, false, "C4: the read persists WHOLE even when it says nothing");
  const verdict = await readWitnessState(s.documentId, out.receipt.text_extraction_id, out.receipt.vision_extraction_id);
  assert.equal(verdict.corroborated, false, "silence is a refusal, never a pass (law 27(2))");
});

test("f-a1.pr2.n a MALFORMED value answer degrades to silence rather than aborting the persist (C4)", { skip }, async () => {
  const s = await buildWitnessSituation("malformed", { regions: REGIONS });
  const bad = wire({ "invoice.total": { state: "value", raw: "9".repeat(300) } });
  witnessMock({ text: { ...bad, citations: citationsFor(s) }, vision: wire() });
  const textRead = await runWitnessTextRead(services(), withRuntime, s.taskId, s.claimDoc);
  assert.deepEqual(textRead.envelope.witness.answers["invoice.total"], { state: "not_printed" },
    "an over-long rendering would make the writer raise CLR10 and roll back the whole pair");
  const visionRead = await runWitnessVisionRead(services(), withRuntime, s.taskId, s.claimDoc);
  const out = await persistWitnessPair(services(), withRuntime, s.taskId, textRead, visionRead);
  assert.equal(out.status, "done", "the pair persists; the predicate is what refuses");
  const verdict = await readWitnessState(s.documentId, out.receipt.text_extraction_id, out.receipt.vision_extraction_id);
  assert.equal(verdict.corroborated, false);
});
