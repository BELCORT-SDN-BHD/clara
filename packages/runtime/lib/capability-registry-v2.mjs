// THE SERVER-OWNED CAPABILITY REGISTRY, VERSION 2 — #658's two new Work-lane reads.
//
// A SIBLING, NEVER AN EDIT TO v1. `lib/capability-registry.mjs` is `deployed: true` and hash-locked
// inside `claraWork_v3`/`v4`'s frozen closure; its own header states the rule this file obeys:
// "a new capability ships as a NEW frozen version or in non-frozen infrastructure, never as an
// edit" (`capability-registry.mjs:29-34`). `packages/reporting-render/lib/layout-sandbox.mjs` is
// the estate's precedent for a hash-locked module gaining a sibling rather than a widening.
//
// WHY IT EXISTS AT ALL. `clara.record_work_execution_trace` records `capability_id` beside
// `registry_version` on every step row, and `capability(id)` is what turns that id back into an
// answer to "which capability moved this client's data, under which purpose". Without a v2, the
// two reads `claraWork_v5` adds write trace rows carrying an id v1 does not know, `capability()`
// returns null, and the trace says "someone read something and this machine does not know what".
//
// WHAT IT IS NOT — v1's rule, restated because it matters more now, not less. This table is
// DOCUMENTATION AND A LOOKUP. It is NEVER an authorization: nothing in the runtime may treat a
// capability's presence here as permission. Migration 0230 grants `clara.retrieve_knowledge`,
// `clara.read_knowledge_record_for` and `clara.read_knowledge_history_for` to `clara_runtime` and
// to nobody else, and its tail asserts the absence positively (#783). This object cannot change
// that answer in either direction.
//
// THE VERSION IS PART OF THE ANSWER. Bump it in the SAME commit as any change to the table below.
//
// IMPORT-ESCAPE WARNING. The moment `claraWork_v5` imports this file, `check-frozen-workflows.mjs`
// hash-locks it and a change here becomes a `claraWork_v6` (or a v3 registry sibling). v1 stays
// exported and untouched; nothing that imports v1 today is repointed by this file.
//
// NO MODULE-LEVEL `node:` IMPORT LIVES HERE — `lib/knowledge.mjs:44-64`'s measured constraint.

import { CAPABILITY_REGISTRY as V1_REGISTRY, DATA_CLASSES } from "./capability-registry.mjs";

export { DATA_CLASSES };

/** The registry's own version. Recorded on every `clara.work_execution_traces` row.
 *
 *  IT STAYS v2 THROUGH FIX ROUND 1, and that is worth one sentence because the header above says
 *  to bump it in the same commit as any change to the table. The rule exists so a DEPLOYED
 *  registry cannot change meaning under rows already written with its name. `claraWork_v5` has
 *  never shipped and no row anywhere carries `clara-capability-registry/v2` yet, so the third
 *  entry below is part of v2's first cut rather than a change to it. The moment this image serves
 *  a run, the rule applies as written. */
export const CAPABILITY_REGISTRY_VERSION_V2 = "clara-capability-registry/v2";

/**
 * THE TABLE: v1's five entries, carried by REFERENCE so the two can never describe the same
 * capability differently, plus the two reads #658 adds.
 *
 * Both new entries are `modelBound: true`. That is the consequential field and it is deliberate:
 * retrieved knowledge and an inspected record go INTO the model's context, which is exactly what
 * `modelBound` means ("exercising it sends client data to an external model/vendor"), so a
 * dispatch authorization is owed before either runs. Calling them local reads because the SQL runs
 * inside the estate would be the same mistake as calling a prompt local because the string was
 * built here.
 *
 * `Object.assign` rather than an object SPREAD, deliberately:
 * `packages/runtime/scripts/check-parts-parity.mjs` refuses an unclassifiable spread in an object
 * literal (it cannot prove what a spread contributes to a part-kind census), and a registry that
 * trips the parity gate would be a lint exemption where a two-word change does.
 */
export const CAPABILITY_REGISTRY_V2 = Object.freeze(Object.assign({}, V1_REGISTRY, {
  "accounting_work.retrieve_knowledge": Object.freeze({
    id: "accounting_work.retrieve_knowledge",
    purpose: "accounting_work",
    modelBound: true,
    dataClass: "client_confidential",
    scope: "clara_runtime → clara.retrieve_knowledge (+ clara.record_work_knowledge_read)",
    description:
      "Retrieve this client's governed knowledge CORE-FIRST and BOUNDED before acting, and record "
      + "what was read on the attempt. The records reach the model as part of the segment, which "
      + "is separately authorised; the read-set row is a local write.",
  }),
  "accounting_work.inspect_knowledge_source": Object.freeze({
    id: "accounting_work.inspect_knowledge_source",
    purpose: "accounting_work",
    modelBound: true,
    dataClass: "client_confidential",
    scope: "clara_runtime → clara.read_knowledge_record_for + clara.read_knowledge_history_for",
    description:
      "Inspect ONE knowledge record the run has already seen a key for: its current revision, its "
      + "revision history, its source pins and the source document's METADATA. Never the "
      + "document's bytes — the byte door is 0190's and is not reachable from here. The record "
      + "reaches the model INSIDE a segment whose egress dispatch is already authorised, which is "
      + "the same arrangement `accounting_work.retrieve_knowledge` names above; what this lane "
      + "does NOT yet have is a durable row of its own per inspection read, so the record of one "
      + "is the run's journal rather than a relation in `clara` (claraWork.v5.tools.ts says so at "
      + "the call site, and the fix round asked for the row to be ratified rather than invented).",
  }),
  "accounting_work.read_knowledge_drift": Object.freeze({
    id: "accounting_work.read_knowledge_drift",
    purpose: "accounting_work",
    modelBound: true,
    dataClass: "client_confidential",
    scope: "clara_runtime → clara.work_knowledge_drift_for",
    description:
      "After a resume, ask whether the client's recorded knowledge moved while this Work waited — "
      + "and whether anything THIS run recorded reading is among what moved. The moved key NAMES "
      + "reach the model in the resume note, which is why it is modelBound. A DIFFERENT capability "
      + "from the preload on purpose: both are knowledge reads, they call different doors, and a "
      + "run with one resume otherwise writes two trace rows under one id that no reader — and no "
      + "World leg looking a row up BY capability — can tell apart.",
  }),
}));

/** Look one capability up. Returns null rather than throwing, for v1's reason: a caller that names
 *  a capability this registry does not carry has a bug, and the trace row should RECORD the
 *  unknown id rather than crash a run over a diagnostic. */
export function capabilityV2(id) {
  return Object.prototype.hasOwnProperty.call(CAPABILITY_REGISTRY_V2, id)
    ? CAPABILITY_REGISTRY_V2[id] : null;
}

/** The purpose token a capability needs, or null. NEVER an authorization — see this file's head. */
export function purposeForV2(id) {
  return capabilityV2(id)?.purpose ?? null;
}

/** True iff exercising this capability is an egress event, i.e. a dispatch authorization is owed. */
export function isModelBoundV2(id) {
  return capabilityV2(id)?.modelBound === true;
}

/** Every capability id, sorted — the shape a census asserts against. */
export function capabilityIdsV2() {
  return Object.keys(CAPABILITY_REGISTRY_V2).sort();
}
