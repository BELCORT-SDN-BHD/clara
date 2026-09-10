// @frozen
//
// FROZEN — part of the claraWork_v2 closure (#629). THE IMMUTABLE SUCCESSOR BUNDLE for v2: the
// same serializable invocation envelope shape v1 carries, with v2's instruction/skill/tool ids and
// the SAME finite budgets, hashed the same way.
//
// THE HASH IMPLEMENTATION IS v1's, REACHED BY IMPORT. `sha256Hex` and the canonicaliser are
// already frozen and already proven byte-equal to `node:crypto` by tests/work-bundle.test.mjs; a
// second open-coded SHA-256 in this file would be a second thing that can be wrong about the same
// digest. Importing a frozen module is legal — editing one is not — and it adds nothing to this
// closure's manifest surface that was not already locked.
//
// THE BUDGETS ARE v1's VALUES, RE-DECLARED RATHER THAN IMPORTED, and that is deliberate. The
// budget block is part of the HASHED bundle: importing v1's frozen object would make v2's digest
// silently follow any future v1 budget change, which is exactly the coupling a version cutover
// exists to break. They are the same numbers today because #629 changes what a question CARRIES,
// not how much compute a Work may spend.
//
// WHY `tools.id` MOVES TO clara-work-tools/v2 WHILE THE ROSTER DOES NOT. The roster is three
// names and they are unchanged. `ask_question`'s SCHEMA changed — it now takes a reason and one to
// six typed fields — and the bundle is the registry of CAPABILITY, not of spelling. A run that
// recorded `clara-work-tools/v1` on its receipt was served a different contract than one that
// records v2, and the receipt has to be able to say which.

import { canonicalJson } from "./chatTurn.v11.tools.js";
import { sha256Hex, type ClaraWorkBudgets, type ClaraWorkBundle } from "./claraWork.v1.bundle.js";
import {
  CLARA_WORK_INSTRUCTIONS_V2,
  CLARA_WORK_TOOL_NAMES,
  JOURNAL_ENTRY_SKILL_V2,
} from "./claraWork.v2.prompt.js";

export type { ClaraWorkBudgets, ClaraWorkBundle };

export const CLARA_WORK_BUDGETS_V2: ClaraWorkBudgets = Object.freeze({
  segments: 4,
  modelCalls: 8,
  toolCalls: 12,
  replans: 2,
  transientRetries: 3,
});

/** The bundle itself — deep-frozen so a runtime mutation throws (ES modules are strict) rather
 *  than silently producing a run whose recorded envelope differs from the hashed one. */
export const CLARA_WORK_BUNDLE_V2: ClaraWorkBundle = Object.freeze({
  id: "clara-work/v2",
  instructions: Object.freeze({ id: "clara-work-instructions/v2", text: CLARA_WORK_INSTRUCTIONS_V2 }),
  skills: Object.freeze([Object.freeze({ id: "journal-entry/v2", text: JOURNAL_ENTRY_SKILL_V2 })]),
  tools: Object.freeze({ id: "clara-work-tools/v2", names: CLARA_WORK_TOOL_NAMES }),
  budgets: CLARA_WORK_BUDGETS_V2,
});

/** The exact text the digest is taken over. Exported so the pin cell hashes THIS string with
 *  Node's own sha256 rather than re-deriving a canonicalisation of its own. */
export const CLARA_WORK_BUNDLE_V2_CANONICAL: string = canonicalJson(CLARA_WORK_BUNDLE_V2);

/** sha256 hex of the bundle's canonical JSON, computed ONCE at module load. */
export const CLARA_WORK_BUNDLE_V2_DIGEST: string = sha256Hex(CLARA_WORK_BUNDLE_V2_CANONICAL);

/** The one line C88.8 asks the process to emit at world start, and the one string
 *  /api/build-info serves. Spelled in ONE place so the log and the route can never disagree. */
export const CLARA_WORK_BUNDLE_V2_BANNER = `[clara-runtime] bundle ${CLARA_WORK_BUNDLE_V2.id} digest=${CLARA_WORK_BUNDLE_V2_DIGEST}`;

/** The bundle identity every workflow-facing surface serves: the ids, the digest and the budgets,
 *  WITHOUT the prose (an instructions blob has no place in a build-info payload or a task row). */
export function claraWorkBundleIdentityV2(): {
  id: string;
  digest: string;
  instructions: string;
  skills: string[];
  tools: string;
  budgets: ClaraWorkBudgets;
} {
  return {
    id: CLARA_WORK_BUNDLE_V2.id,
    digest: CLARA_WORK_BUNDLE_V2_DIGEST,
    instructions: CLARA_WORK_BUNDLE_V2.instructions.id,
    skills: CLARA_WORK_BUNDLE_V2.skills.map((s) => s.id),
    tools: CLARA_WORK_BUNDLE_V2.tools.id,
    budgets: CLARA_WORK_BUDGETS_V2,
  };
}

/** The manifest `clara.claim_work_run` stores on the Work row: the identity above plus the MODEL
 *  this particular run was claimed with (a per-run fact, so it can never live inside the hashed
 *  bundle). */
export function claraWorkRunManifestV2(modelSnapshot: string): Record<string, unknown> {
  const identity = claraWorkBundleIdentityV2();
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
