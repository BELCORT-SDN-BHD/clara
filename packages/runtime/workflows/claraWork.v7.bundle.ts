// @frozen
//
// FROZEN — part of the claraWork_v7 closure. THE IMMUTABLE SUCCESSOR BUNDLE for v7.
//
// v6's shape, v6's discipline, v6's coverage — and that is the whole of it. `tools` still carries
// `{id, names, schemas, dependencies}`, the schemas are still derived from the very zod objects
// the builder hands to `tool({inputSchema})`, and `z.toJSONSchema`'s `target: "draft-07"` and
// `io: "input"` are still PINNED rather than defaulted, for the reason v5's header gives at
// length: the defaults are draft-2020-12 and `"output"`, and either moving under a dependency bump
// would silently move a digest that is supposed to change only when a CONTRACT changes.
//
// WHAT MOVES THE DIGEST AT THIS CUT, and it is exactly one thing: THE IDS. The roster does not
// move — same ten names, same schemas, same dependencies — and neither does the instructions text.
// v7's one change is a STEP BODY, which the model never sees. So the honest reading of this
// digest is "a different contract served the run", where the contract's difference is the
// closure's identity rather than its words; the BEHAVIOUR that changed is in
// `loadFaProposalInputsStepV7`, and `tests/clara-work-v7.test.mjs` is where that is pinned.
//
// AND WHAT THIS DIGEST STILL CANNOT SEE, carried forward from v5's and v6's own measurement
// (review ADV-S-4): `z.toJSONSchema` erases `.refine` / `.superRefine`, so `ask_question`'s
// `fields[]` superRefine contributes nothing to the hashed text. v7 changes no refinement —
// stated here by hand because no gate will state it.
//
// THE BUDGETS ARE RE-DECLARED RATHER THAN IMPORTED, for v5's and v6's stated reason: the budget
// block is part of the HASHED bundle, and importing a predecessor's frozen object would make v7's
// digest silently follow any future v1…v6 budget change — exactly the coupling a version cutover
// exists to break. THE NUMBERS DO NOT MOVE, and nothing in this cut presses on them: the step that
// changed runs once, after a commit, outside the segment loop.

import { canonicalJson } from "./chatTurn.v11.tools.js";
import { sha256Hex, type ClaraWorkBudgets, type ClaraWorkBundle } from "./claraWork.v1.bundle.js";
import type { ClaraWorkToolsBlockV6 } from "./claraWork.v6.bundle.js";
import {
  CLARA_WORK_INSTRUCTIONS_V7,
  CLARA_WORK_TOOL_DEPENDENCIES_V7,
  CLARA_WORK_TOOL_NAMES_V7,
  CLARA_WORK_TOOL_SCHEMAS_V7,
  JOURNAL_ENTRY_SKILL_V7,
} from "./claraWork.v7.prompt.js";
import { z } from "zod";

export type { ClaraWorkBudgets };

/** v6's tool block, reached by import: the SHAPE is unchanged, so a second declaration of the same
 *  four members would be a second thing that can be wrong about one type. */
export type ClaraWorkToolsBlockV7 = ClaraWorkToolsBlockV6;

export type ClaraWorkBundleV7 = Omit<ClaraWorkBundle, "tools"> & { tools: ClaraWorkToolsBlockV7 };

export const CLARA_WORK_BUDGETS_V7: ClaraWorkBudgets = Object.freeze({
  segments: 4,
  modelCalls: 8,
  toolCalls: 12,
  replans: 2,
  transientRetries: 3,
});

/** The JSON Schema target and direction, PINNED. See this file's header. */
const JSON_SCHEMA_TARGET = "draft-07" as const;
const JSON_SCHEMA_IO = "input" as const;

/**
 * Convert the roster's zod schemas to JSON Schema, ONCE at module load, in ROSTER ORDER.
 *
 * A conversion failure is not swallowed, for v5's and v6's reason: this is not a diagnostic, it is
 * the CONTRACT the receipt attests to, and a bundle that quietly hashed `{}` for a tool it could
 * not describe would be a receipt claiming a coverage it does not have.
 */
function toolSchemasJson(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of CLARA_WORK_TOOL_NAMES_V7) {
    const schema = (CLARA_WORK_TOOL_SCHEMAS_V7 as Record<string, unknown>)[name];
    if (schema === undefined) {
      throw new Error(`claraWork_v7 bundle: no input schema declared for tool "${name}"`);
    }
    out[name] = z.toJSONSchema(schema as Parameters<typeof z.toJSONSchema>[0], {
      target: JSON_SCHEMA_TARGET,
      io: JSON_SCHEMA_IO,
    });
  }
  return out;
}

export const CLARA_WORK_TOOLS_BLOCK_V7: ClaraWorkToolsBlockV7 = Object.freeze({
  id: "clara-work-tools/v7",
  names: CLARA_WORK_TOOL_NAMES_V7,
  schemas: Object.freeze(toolSchemasJson()),
  dependencies: CLARA_WORK_TOOL_DEPENDENCIES_V7,
});

export const CLARA_WORK_BUNDLE_V7: ClaraWorkBundleV7 = Object.freeze({
  id: "clara-work/v7",
  instructions: Object.freeze({ id: "clara-work-instructions/v7", text: CLARA_WORK_INSTRUCTIONS_V7 }),
  skills: Object.freeze([Object.freeze({ id: "journal-entry/v7", text: JOURNAL_ENTRY_SKILL_V7 })]),
  tools: CLARA_WORK_TOOLS_BLOCK_V7,
  budgets: CLARA_WORK_BUDGETS_V7,
});

/** The exact text the digest is taken over. */
export const CLARA_WORK_BUNDLE_V7_CANONICAL: string = canonicalJson(CLARA_WORK_BUNDLE_V7);

/** sha256 hex of the bundle's canonical JSON, computed ONCE at module load. */
export const CLARA_WORK_BUNDLE_V7_DIGEST: string = sha256Hex(CLARA_WORK_BUNDLE_V7_CANONICAL);

/** The one line C88.8 asks the process to emit at world start, and the one string
 *  /api/build-info serves. Spelled in ONE place so the log and the route can never disagree.
 *
 *  IT IS LOAD-BEARING FAR BEYOND A LOG LINE, and the v21/v5 cut paid to learn it:
 *  `tests/pinned-work-bundle.mjs`'s `waitBooted` blocks on exactly this banner, and its throw is
 *  swallowed by the caller's retry loop — so a missing banner boots an engine that looks healthy
 *  on every visible signal (`/health` 200, `/ready` 200, `stranded bodies n=0`) while the whole
 *  work-lane e2e battery fails with the false message "serve child did not become ready". The
 *  SEVENTH `console.log` in `plugins/startWorld.ts` lands in the SAME commit as the registry
 *  repoint. */
export const CLARA_WORK_BUNDLE_V7_BANNER = `[clara-runtime] bundle ${CLARA_WORK_BUNDLE_V7.id} digest=${CLARA_WORK_BUNDLE_V7_DIGEST}`;

/**
 * The bundle identity every workflow-facing surface serves. `tools` stays the ID alone, exactly as
 * v1…v6 served it: this answers "which contract served this run", and the digest answers it
 * completely; the schemas are IN THE HASH, which is where the coverage requirement asked for them.
 */
export function claraWorkBundleIdentityV7(): {
  id: string;
  digest: string;
  instructions: string;
  skills: string[];
  tools: string;
  budgets: ClaraWorkBudgets;
} {
  return {
    id: CLARA_WORK_BUNDLE_V7.id,
    digest: CLARA_WORK_BUNDLE_V7_DIGEST,
    instructions: CLARA_WORK_BUNDLE_V7.instructions.id,
    skills: CLARA_WORK_BUNDLE_V7.skills.map((s) => s.id),
    tools: CLARA_WORK_BUNDLE_V7.tools.id,
    budgets: CLARA_WORK_BUDGETS_V7,
  };
}

/** The manifest `clara.claim_work_run` stores on the Work row: the identity above plus the MODEL
 *  this particular run was claimed with (a per-run fact, so it can never live inside the hashed
 *  bundle). */
export function claraWorkRunManifestV7(modelSnapshot: string): Record<string, unknown> {
  const identity = claraWorkBundleIdentityV7();
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
