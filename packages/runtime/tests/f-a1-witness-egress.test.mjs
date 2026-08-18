// F-A1 witnessFacts_v1 — THE EGRESS BATTERY: what must happen before a client's bytes leave,
// and what must happen to the task when they do not.
//
// Split out of f-a1-witness-db.test.mjs at the PR-2 review fold (the file crossed the 500-line
// gate). The seam is real: every cell here is about the DISPATCH BOUNDARY — the typed consent
// pair, the pre-egress refusals that must not spend an authorization, the mid-run park, and the
// terminal settle that keeps a refused task from wedging the lane.
//
// Real Postgres migrated 0001→0095. The model is the only mocked thing, and every "no model call
// was made" claim COUNTS mock invocations rather than reading a log line.
//
// ONE STAND-IN, DECLARED: `clara.fail_witness_facts` ships in PR-3's migration and does not exist
// in the merged estate. `installFailWitnessFactsStandIn` creates a minimal rig substitute whose
// ONLY contract is the call shape (name, two args, the code the runtime passed) — its limits are
// written out at the fixture. The `e2` cell deliberately runs with the verb ABSENT, which is the
// state the estate is really in today.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import * as fx from "./relay-fixtures.mjs";
import {
  buildWitnessSituation, dropFailWitnessFactsStandIn, failWitnessFactsExists,
  installFailWitnessFactsStandIn, logLines, readDispatchAuthorizations, readTask, readUsageRows,
  resetWitnessLog, witnessMock, witnessServices, witnessWire,
} from "./f-a1-witness-fixtures.mjs";
import {
  runWitnessTextRead, runWitnessVisionRead, WITNESS_EVENT_TYPE, WITNESS_PURPOSE,
} from "../workflows/witnessFacts.v1.behavior.mjs";
import { witnessPromptHash } from "../workflows/witnessFacts.v1.prompts.mjs";

const READY = await witnessReady();
const skip = READY ? false : "F-A1 witness estate absent";
const withRuntime = (fn) => fx.asRuntime(fn);
let tmpRoot;
const services = () => witnessServices(tmpRoot);
const wire = witnessWire;

async function witnessReady() {
  const r = await fx.rootQuery(
    `select to_regprocedure('clara.persist_witness_facts(uuid,jsonb,jsonb,int)') is not null
        and to_regprocedure('clara.witness_citation_regions(uuid)') is not null as ok`);
  return r.rows[0].ok === true;
}

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  tmpRoot = await mkdtemp(join(base, "clara-witness-eg-"));
  if (READY) await installFailWitnessFactsStandIn();
});
after(async () => {
  delete globalThis.__claraModelForTest;
  if (READY) await dropFailWitnessFactsStandIn();
  await fx.endPool();
  await rm(tmpRoot, { recursive: true, force: true });
});

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
// THE CONSENT REFUSAL, AND THE TERMINAL SETTLE THAT KEEPS THE LANE FREE (review B1).
// =======================================================================================

test("f-a1.pr2.e NO live consent -> refuses before any model call, meters it, and SETTLES the task", { skip }, async () => {
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
  // B1: the task ends DEAD. A task left claimed holds one of the lane's two concurrency slots
  // until a sweep re-drives it, and two of them wedge the whole firm's witness lane.
  const task = await readTask(s.taskId);
  assert.equal(task.status, "failed", "the terminal branch calls clara.fail_witness_facts");
  assert.equal(task.error_code, "witness_consent_inactive", "settled with its OWN named reason, not a generic one");
  assert.ok(task.finished_at != null);
  assert.equal((await readDispatchAuthorizations(s.firm)).length, 0, "no authorization was minted");
});

test("f-a1.pr2.e2 B1 fallback — with clara.fail_witness_facts ABSENT the lane degrades LOUDLY, never silently", { skip }, async () => {
  // The state the merged estate is actually in until PR-3's migration applies. The ordering
  // argument says this window is empty (nothing mints an llm_witness task yet); this cell proves
  // that if the argument is ever wrong, the operator is TOLD rather than left with a wedged lane.
  await dropFailWitnessFactsStandIn();
  try {
    assert.equal(await failWitnessFactsExists(), false, "precondition: the verb really is absent");
    const s = await buildWitnessSituation("noverb", { regions: REGIONS, consent: false });
    const calls = witnessMock({ text: { ...wire(), citations: citationsFor(s) }, vision: wire() });
    resetWitnessLog();
    await assert.rejects(
      () => runWitnessTextRead(services(), withRuntime, s.taskId, s.claimDoc),
      (err) => err.code === "witness_consent_inactive" && err.witnessRefusal === true,
      "the refusal still reaches the caller unchanged — a settle failure must never mask it",
    );
    assert.equal(calls.length, 0, "still no model call");
    assert.deepEqual((await readUsageRows(s.taskId)).map((u) => u.outcome), ["refused"],
      "the usage row is the fallback receipt");
    assert.equal((await readTask(s.taskId)).status, "running", "unsettled — this is the degraded state");
    const shouted = logLines.join("\n");
    assert.match(shouted, /clara\.fail_witness_facts is absent/, "it says WHICH verb is missing");
    assert.match(shouted, /PR-3/, "…and which migration supplies it");
    assert.match(shouted, /wedge/, "…and what the consequence is if llm_witness tasks do exist");
  } finally {
    await installFailWitnessFactsStandIn();
  }
});

test("f-a1.pr2.f the vision channel refuses the same way, and neither channel bypasses the gate", { skip }, async () => {
  const s = await buildWitnessSituation("noconsent2", { regions: REGIONS, consent: false });
  const calls = witnessMock({ text: { ...wire(), citations: citationsFor(s) }, vision: wire() });
  await assert.rejects(
    () => runWitnessVisionRead(services(), withRuntime, s.taskId, s.claimDoc),
    (err) => err.code === "witness_consent_inactive",
  );
  assert.equal(calls.length, 0, "the vision channel is gated too — one purpose, BOTH channels");
  assert.deepEqual((await readUsageRows(s.taskId)).map((u) => [u.channel, u.outcome]), [["vision", "refused"]]);
  assert.equal((await readTask(s.taskId)).error_code, "witness_consent_inactive");
});

// =======================================================================================
// THE PRE-EGRESS REFUSALS — facts about the document, decided before an authorization exists.
// =======================================================================================

test("f-a1.pr2.f2 M4 an unreadable media type is refused BEFORE any authorization is minted", { skip }, async () => {
  const s = await buildWitnessSituation("badmime", { regions: REGIONS, mime: "image/tiff" });
  const calls = witnessMock({ text: { ...wire(), citations: citationsFor(s) }, vision: wire() });
  await assert.rejects(
    () => runWitnessVisionRead(services(), withRuntime, s.taskId, s.claimDoc),
    (err) => err.code === "bad_type",
  );
  assert.equal(calls.length, 0);
  assert.equal((await readDispatchAuthorizations(s.firm)).length, 0,
    "a single-use authorization must never be spent finding out the bytes can never leave");
  const task = await readTask(s.taskId);
  assert.equal(task.status, "failed", "a fact about the document is terminal (B1)");
  assert.equal(task.error_code, "bad_type");
  assert.deepEqual(await readUsageRows(s.taskId), [],
    "no call was authorized or attempted, so nothing may look like spend");
});

test("f-a1.pr2.f3 N5 an oversized payload is refused pre-egress, on the same terms", { skip }, async () => {
  const s = await buildWitnessSituation("toobig", { regions: REGIONS });
  const calls = witnessMock({ text: { ...wire(), citations: citationsFor(s) }, vision: wire() });
  await assert.rejects(
    () => runWitnessVisionRead(services(), withRuntime, s.taskId, { ...s.claimDoc, byte_size: 30_000_001 }),
    (err) => err.code === "limit" && /pre-egress cap/.test(err.message),
  );
  assert.equal(calls.length, 0);
  assert.equal((await readDispatchAuthorizations(s.firm)).length, 0);
  assert.equal((await readTask(s.taskId)).error_code, "limit");

  // The boundary itself, not just the far side of it.
  const s2 = await buildWitnessSituation("justunder", { regions: REGIONS });
  witnessMock({ text: { ...wire(), citations: citationsFor(s2) }, vision: wire() });
  const ok = await runWitnessVisionRead(services(), withRuntime, s2.taskId, { ...s2.claimDoc, byte_size: 30_000_000 });
  assert.equal(ok.input_pin, s2.sha256, "exactly at the cap still reads");
});

test("f-a1.pr2.f4 M5 a task PARKED between the two channels does not egress on the second", { skip }, async () => {
  const s = await buildWitnessSituation("parked", { regions: REGIONS });
  const calls = witnessMock({ text: { ...wire(), citations: citationsFor(s) }, vision: wire() });
  await runWitnessTextRead(services(), withRuntime, s.taskId, s.claimDoc);
  assert.equal(calls.length, 1);
  // The kill switch flipping mid-run is exactly what claim_document_processing_task's hold branch
  // does to a claimed task. The second channel must SEE that, not carry a status it read minutes
  // ago — a derived state standing in for a fact.
  await fx.rootQuery(
    "update clara.document_processing_tasks set status='held_egress', workflow_run_id=null, started_at=null where id=$1",
    [s.taskId]);
  await assert.rejects(
    () => runWitnessVisionRead(services(), withRuntime, s.taskId, s.claimDoc),
    (err) => err.claraRetry === true && /is 'held_egress', not running/.test(err.message),
  );
  assert.equal(calls.length, 1, "no second model call on a parked task");
  assert.deepEqual((await readDispatchAuthorizations(s.firm)).map((a) => a.consumed_at != null), [true],
    "only the FIRST channel's authorization exists — the second was never minted");
  assert.equal((await readTask(s.taskId)).status, "held_egress",
    "a WAIT never settles: the switch coming back on must let this same task run");
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
  assert.equal((await readTask(s.taskId)).error_code, "witness_multi_client", "its OWN named reason");
});

// =======================================================================================
// THE AUTHORIZED PATH — two dispatches, one per channel.
// =======================================================================================

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
