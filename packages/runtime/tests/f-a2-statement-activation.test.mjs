// F-A2 WINDOW B — the ACTIVATION's runtime half: the registry repoint, and the pre-egress
// PROVENANCE GUARD that makes the flip safe for the tasks already in the queue. Unit only:
// a scripted pg client, no DB, no network, no key.
//
// THE CELL THIS FILE EXISTS FOR is the in-flight one the activation spec named HIGHEST VALUE
// (§3's in-flight discipline, §8's battery sketch): a task enqueued BEFORE the migration —
// still stamped with the retiring Azure statement engine — is claimed AFTER the migration and
// the repoint, and must WAIT at `assertStatementEngineStamp` rather than egress under a receipt
// naming a model it did not call, and rather than crash. Everything about the ordering argument
// for the deploy window rests on that behaviour, and PR-4 shipped the guard with no runtime cell
// proving it (0098 asserts the DB side; nothing asked the workflow).
//
// EVIDENCE LAW 2 THROUGHOUT: the WAIT is proven by what the run actually DID — the recorded
// query log and the model-call spy — not by the absence of an exception. "No egress happened"
// is asserted as "the spy recorded zero calls", and "the task was not settled" as "no
// fail_statement_facts query was issued", both POSITIVE reads of a log this cell owns.

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  runStatementWitnessTextRead,
  classifyStatementWitnessFailure,
} from "../workflows/statementFacts.v2.behavior.mjs";
import { STATEMENT_WITNESS_ENGINE_SNAPSHOT } from "../workflows/statementFacts.v2.services.mjs";

// The registry and the workflow modules are TypeScript, so they are reached through the SAME
// tsx ESM hook f-a1-pr3a-consumers.test.mjs uses — the established precedent in this suite.
const { register } = await import("tsx/esm/api");
register();
const registryMod = await import("../workflows/registry.ts");
const statementV1Mod = await import("../workflows/statementFacts.v1.ts");
const statementV2Mod = await import("../workflows/statementFacts.v2.ts");

/** The literal the RETIRING vendor read stamped, and the one the pre-window backlog carries.
 *  Written out rather than imported: the whole point of the guard is that the task's stamp and
 *  the image's snapshot are two INDEPENDENT values that may disagree. */
const AZURE_STATEMENT_ENGINE_ID = "azure-di:prebuilt-bankStatement.us:2024-11-30";

after(() => {
  delete globalThis.__claraModelForTest;
});

// ---------------------------------------------------------------------------
// THE REPOINT — the one line that takes live traffic
// ---------------------------------------------------------------------------

test("repoint: `statementFacts:` IS statementFacts_v2 — object identity, not a name", () => {
  // A registry entry is the routing for a LIVE lane: `statement_facts` tasks are minted today,
  // so this key decides which body claims them the moment the image deploys. Compared by
  // reference against the module's own export, because a name-shaped check would pass against a
  // re-export that pointed anywhere.
  assert.equal(registryMod.workflows.statementFacts, statementV2Mod.statementFacts_v2);
  assert.notEqual(registryMod.workflows.statementFacts, statementV1Mod.statementFacts_v1,
    "v1 must no longer be the pointer");
});

test("repoint: statementFacts_v1 stays EXPORTED and reachable — parked runs are never stranded", () => {
  // Policy (c): a repoint must never make the old body unreachable, and here it is not merely
  // legacy — v2 reaches v1's own claim+process steps for the `statement_parse` (csv/ofx) lane.
  // Read off the REGISTRY module's re-export, which is the surface policy (c) is about.
  assert.equal(typeof registryMod.statementFacts_v1, "function", "the v1 re-export must still resolve");
  assert.equal(typeof registryMod.statementFacts_v2, "function");
  assert.notEqual(statementV1Mod.statementFacts_v1, statementV2Mod.statementFacts_v2,
    "two distinct bodies, both reachable");
});

// ---------------------------------------------------------------------------
// THE PRE-EGRESS PROVENANCE GUARD — the in-flight cell
// ---------------------------------------------------------------------------

/**
 * A scripted pg client. Matches on SQL text the real dispatch module issues, records every
 * query, and refuses anything it was not scripted for — an unscripted query is a behaviour this
 * cell did not intend and must be loud, never silently `{rows:[]}`.
 */
function scriptedClient({ taskEngineId, taskStatus = "running" }) {
  const log = [];
  return {
    log,
    async query(sql, params) {
      log.push({ sql: String(sql), params });
      const text = String(sql);
      if (text.includes("from clara.document_extractions") && text.includes("engine_kind='ocr'")) {
        return { rows: [{ id: randomUUID(), page_count: 3 }] };
      }
      if (text.includes("clara.witness_citation_regions")) {
        return { rows: [{ idx: 1, page: 1, text_content: "OPENING BALANCE", locator: { polygon: [0, 0, 1, 1] } }] };
      }
      if (text.includes("select version_n, engine_id, status from clara.document_processing_tasks")) {
        return { rows: [{ version_n: 1, engine_id: taskEngineId, status: taskStatus }] };
      }
      if (text.includes("clara.resolve_document_client")) {
        return { rows: [{ r: { status: "unique", client_id: randomUUID() } }] };
      }
      // The NEXT gate after the provenance guard. Answered `false` on purpose: a run that
      // reaches this query has provably passed the stamp check, which is the only thing the
      // negative-twin cell needs to establish.
      if (text.includes("to_regprocedure") && text.includes("as surface")) {
        return { rows: [{ surface: false }] };
      }
      throw new Error(`scriptedClient: unscripted query — ${text.slice(0, 120)}`);
    },
  };
}

function servicesWith(engineId, calls) {
  return {
    engineSnapshot: { engineId },
    callStatementWitnessModel: async (call) => { calls.push(call); return { object: {}, usage: {} }; },
    statementWitnessMediaType: () => "application/pdf",
    taskTempPath: () => "/tmp/unused",
    removeTempFile: async () => {},
    downloadCanonical: async () => {},
    log: () => {},
  };
}

const DOC = Object.freeze({
  firm_id: "00000000-0000-4000-8000-00000000f1f1",
  document_id: "00000000-0000-4000-8000-00000000d0c0",
  sha256: "0".repeat(64),
  mime_type: "application/pdf",
  byte_size: 1024,
  storage_path: "docs/x.pdf",
  lane: "statement_facts",
});

test("in-flight: a PRE-window Azure-stamped task claimed by the repointed image WAITS — it does not egress", async () => {
  // The exact population §3 names: enqueued before the router re-key, still queued when the
  // window closes, claimed afterwards by statementFacts_v2 (the registry points the whole lane
  // at v2 regardless of any one task's own stamp).
  const calls = [];
  const client = scriptedClient({ taskEngineId: AZURE_STATEMENT_ENGINE_ID });
  const withRuntime = (fn) => fn(client);
  const taskId = randomUUID();

  await assert.rejects(
    runStatementWitnessTextRead(servicesWith(STATEMENT_WITNESS_ENGINE_SNAPSHOT.engineId, calls), withRuntime, taskId, DOC),
    (err) => {
      // A WAIT, not a refusal and not a fault: the deployment can still make this same task
      // succeed unchanged, so it must never settle a verdict that misdescribes it.
      assert.equal(err.claraRetry, true, "the stamp mismatch is a WAIT (retryable), not a terminal verdict");
      assert.equal(err.code, "internal");
      assert.notEqual(err.statementWitnessRefusal, true, "a deployment fact is not a document fact");
      assert.match(err.message, /is stamped engine_id/, "the message names BOTH sides of the disagreement");
      assert.match(err.message, new RegExp(AZURE_STATEMENT_ENGINE_ID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(err.message, /stmt-witness-v1/);
      return true;
    },
  );

  // NO EGRESS. The positive read: the model spy recorded nothing at all.
  assert.deepEqual(calls, [], "not one byte may leave under a receipt naming a model this image did not call");
  // NO SETTLE, and NO METERING. Both asserted off the query log this cell owns, never inferred
  // from the absence of a thrown error.
  const sqls = client.log.map((q) => q.sql);
  assert.equal(sqls.filter((s) => s.includes("fail_statement_facts")).length, 0,
    "a WAIT must not settle the task — the lane STALLS, it does not fail the document");
  assert.equal(sqls.filter((s) => s.includes("record_llm_usage_event")).length, 0,
    "a WAIT never meters: no call was made, so there is no spend to record");
  // …and it never reached the consent dispatch either: the stamp check is FIRST, so no
  // single-use authorization is burned on a call that was never going to happen.
  assert.equal(sqls.filter((s) => s.includes("prepare_egress_dispatch")).length, 0);
});

test("in-flight: the WAIT is classified RETRY by the frozen taxonomy — the task is not ended", () => {
  // Asked of the real judge (evidence law 3): `internal` is NOT in this lane's RETRYABLE set, so
  // only the claraRetry marker keeps the task alive. A regression that dropped the marker would
  // silently convert every window-straddling task into a terminal failure.
  const wait = Object.assign(new Error("stamped"), { code: "internal", claraRetry: true });
  assert.deepEqual(classifyStatementWitnessFailure(wait), { retry: true, code: "internal" });
});

test("in-flight: a task stamped with the POST-window witness literal proceeds past the guard", async () => {
  // The negative twin. Without it, the cell above would pass just as well against a guard that
  // refused EVERYTHING — an assertion that can only say NO proves nothing about the YES.
  const calls = [];
  const client = scriptedClient({ taskEngineId: STATEMENT_WITNESS_ENGINE_SNAPSHOT.engineId });
  const withRuntime = (fn) => fn(client);
  await assert.rejects(
    runStatementWitnessTextRead(servicesWith(STATEMENT_WITNESS_ENGINE_SNAPSHOT.engineId, calls), withRuntime, randomUUID(), DOC),
    (err) => {
      // It still stops — but at the NEXT gate, the surface probe, which this client answers
      // `false`. The point is that it got PAST the provenance guard, not that it completed.
      assert.doesNotMatch(String(err?.message ?? ""), /is stamped engine_id/,
        "a matching stamp must not be reported as a provenance disagreement");
      assert.match(String(err?.message ?? ""), /surface is absent/);
      return true;
    },
  );
  // The POSITIVE read that it passed: the run reached the gate that sits AFTER the stamp check.
  assert.equal(client.log.filter((q) => q.sql.includes("as surface")).length, 1,
    "reaching the surface probe is the evidence the provenance guard admitted this task");
  assert.deepEqual(calls, [], "the surface gate still stops the egress — no call was made");
});

test("in-flight: an image carrying NO engine snapshot refuses to egress at all", async () => {
  // Fail-closed on absence (evidence law 2): a services bundle with no snapshot cannot CHECK
  // provenance, and "cannot check" must never read as "check passed".
  const calls = [];
  const client = scriptedClient({ taskEngineId: STATEMENT_WITNESS_ENGINE_SNAPSHOT.engineId });
  const withRuntime = (fn) => fn(client);
  const services = servicesWith(STATEMENT_WITNESS_ENGINE_SNAPSHOT.engineId, calls);
  services.engineSnapshot = undefined;
  await assert.rejects(
    runStatementWitnessTextRead(services, withRuntime, randomUUID(), DOC),
    (err) => {
      assert.equal(err.claraRetry, true);
      assert.match(err.message, /no engine snapshot/);
      return true;
    },
  );
  assert.deepEqual(calls, []);
});
