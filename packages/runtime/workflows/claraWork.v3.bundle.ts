// @frozen
//
// FROZEN — part of the claraWork_v3 closure (#631). THE IMMUTABLE SUCCESSOR BUNDLE for v3: the
// same serializable invocation envelope shape v1 and v2 carry, with v3's instruction/skill/tool
// ids and the SAME finite budgets, hashed the same way.
//
// THE HASH IMPLEMENTATION IS v1's, REACHED BY IMPORT, for the reason v2's own header gives: it is
// already frozen and already proven byte-equal to `node:crypto` by tests/work-bundle.test.mjs, and
// a second open-coded SHA-256 would be a second thing that can be wrong about the same digest.
//
// THE BUDGETS ARE RE-DECLARED RATHER THAN IMPORTED, again for v2's stated reason: the budget block
// is part of the HASHED bundle, and importing a predecessor's frozen object would make v3's digest
// silently follow any future v1/v2 budget change — exactly the coupling a version cutover exists
// to break. They are the same numbers because #631 changes what a run must be AUTHORISED to do and
// what it must RECORD, not how much compute it may spend.
//
// WHY `tools.id` MOVES TO clara-work-tools/v3 WHILE THE ROSTER DOES NOT. The roster is three names
// and they are unchanged — AC1's "server-owned tool set" is about who may REGISTER a tool, and
// #631 registers none. What moved is the contract those three run under: the model segment is now
// gated on a consumed `accounting_work` egress authorisation, and every call leaves a redacted
// `clara.work_execution_traces` row. A run that recorded `clara-work-tools/v2` on its receipt was
// served a different contract than one that records v3, and the receipt has to say which.

import { canonicalJson } from "./chatTurn.v11.tools.js";
import { sha256Hex, type ClaraWorkBudgets, type ClaraWorkBundle } from "./claraWork.v1.bundle.js";
import {
  CLARA_WORK_INSTRUCTIONS_V3,
  CLARA_WORK_TOOL_NAMES,
  JOURNAL_ENTRY_SKILL_V3,
} from "./claraWork.v3.prompt.js";

export type { ClaraWorkBudgets, ClaraWorkBundle };

export const CLARA_WORK_BUDGETS_V3: ClaraWorkBudgets = Object.freeze({
  segments: 4,
  modelCalls: 8,
  toolCalls: 12,
  replans: 2,
  transientRetries: 3,
});

/** The bundle itself — deep-frozen so a runtime mutation throws (ES modules are strict) rather
 *  than silently producing a run whose recorded envelope differs from the hashed one. */
export const CLARA_WORK_BUNDLE_V3: ClaraWorkBundle = Object.freeze({
  id: "clara-work/v3",
  instructions: Object.freeze({ id: "clara-work-instructions/v3", text: CLARA_WORK_INSTRUCTIONS_V3 }),
  skills: Object.freeze([Object.freeze({ id: "journal-entry/v3", text: JOURNAL_ENTRY_SKILL_V3 })]),
  tools: Object.freeze({ id: "clara-work-tools/v3", names: CLARA_WORK_TOOL_NAMES }),
  budgets: CLARA_WORK_BUDGETS_V3,
});

/** The exact text the digest is taken over. Exported so the pin cell hashes THIS string with
 *  Node's own sha256 rather than re-deriving a canonicalisation of its own. */
export const CLARA_WORK_BUNDLE_V3_CANONICAL: string = canonicalJson(CLARA_WORK_BUNDLE_V3);

/** sha256 hex of the bundle's canonical JSON, computed ONCE at module load. */
export const CLARA_WORK_BUNDLE_V3_DIGEST: string = sha256Hex(CLARA_WORK_BUNDLE_V3_CANONICAL);

/** The one line C88.8 asks the process to emit at world start, and the one string
 *  /api/build-info serves. Spelled in ONE place so the log and the route can never disagree. */
export const CLARA_WORK_BUNDLE_V3_BANNER = `[clara-runtime] bundle ${CLARA_WORK_BUNDLE_V3.id} digest=${CLARA_WORK_BUNDLE_V3_DIGEST}`;

/** The bundle identity every workflow-facing surface serves: the ids, the digest and the budgets,
 *  WITHOUT the prose (an instructions blob has no place in a build-info payload or a task row). */
export function claraWorkBundleIdentityV3(): {
  id: string;
  digest: string;
  instructions: string;
  skills: string[];
  tools: string;
  budgets: ClaraWorkBudgets;
} {
  return {
    id: CLARA_WORK_BUNDLE_V3.id,
    digest: CLARA_WORK_BUNDLE_V3_DIGEST,
    instructions: CLARA_WORK_BUNDLE_V3.instructions.id,
    skills: CLARA_WORK_BUNDLE_V3.skills.map((s) => s.id),
    tools: CLARA_WORK_BUNDLE_V3.tools.id,
    budgets: CLARA_WORK_BUDGETS_V3,
  };
}

/** The manifest `clara.claim_work_run` stores on the Work row: the identity above plus the MODEL
 *  this particular run was claimed with (a per-run fact, so it can never live inside the hashed
 *  bundle). */
export function claraWorkRunManifestV3(modelSnapshot: string): Record<string, unknown> {
  const identity = claraWorkBundleIdentityV3();
  return {
    id: identity.id,
    digest: identity.digest,
    instructions: identity.instructions,
    skills: identity.skills,
    tools: identity.tools,
    budgets: identity.budgets,
    model: modelSnapshot,
  };
}
