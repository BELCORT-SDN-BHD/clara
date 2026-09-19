// @frozen
//
// FROZEN — part of the claraWork_v5 closure. THE IMMUTABLE SUCCESSOR BUNDLE for v5: the same
// serializable invocation envelope shape v1…v4 carry, with v5's instruction/skill/tool ids and the
// SAME finite budgets, hashed the same way — plus the one thing every predecessor's digest was
// blind to.
//
// THIS IS THE CUT THAT CLOSES ARCHITECTURE:435-445, AND IT HAS BEEN OWED SINCE v4.
//
// #791's finding, in the blueprint's own words: v2's and v3's manifest digest is shaped
// `{id, instructions, skills, tools{id,names}, budgets}`, so `tools` carries a version id and
// three BARE NAMES — never each tool's JSON schema, never its declared dependencies.
// `ask_question`'s schema changed between v1 and v2 and the only trace it left was a hand-bumped
// `tools.id`; the digest itself could not see it. The blueprint could not close that on v2 or v3
// (both `@frozen` and `deployed: true` — an edit is refused by freeze-lint as `BODY CHANGED`), so
// it recorded the requirement as binding on "the next `claraWork_vN` to be minted". v4 was minted
// and shipped `tools:{id,names}`; the requirement stayed open. THIS body pays it.
//
// WHAT THAT MEANS CONCRETELY. `tools` now carries, beside the roster:
//   · `schemas` — each tool's INPUT JSON Schema, derived from the very zod object the builder
//     hands to `tool({inputSchema})`, at draft-07 and at the INPUT side of the schema;
//   · `dependencies` — each tool's declared doors, from `CLARA_WORK_TOOL_DEPENDENCIES_V5`.
// A tool that tightens a bound, adds a field, drops `.strict()`, re-words a `.describe()` the
// model reads, or is repointed at a different verb now MOVES THE DIGEST. No hand-bumped id, no
// reviewer's memory, no trust required.
//
// WHY `z.toJSONSchema` AND NOT A HAND-ROLLED WALK. zod 4.4.3 ships the converter (`z.toJSONSchema`,
// zod 4's own API — v3 had none and needed `zod-to-json-schema`), it is what the AI SDK's own
// provider path uses to put these same schemas on the wire, and a second traversal written here
// would be a second thing that can be wrong about the same shape. `target: "draft-07"` and
// `io: "input"` are both PINNED rather than defaulted: the default target is draft-2020-12 and the
// default `io` is `"output"`, and either default moving under a dependency bump would silently
// move a digest that is supposed to change only when a CONTRACT changes.
//
// AND THE DIGEST IS STILL TAKEN OVER `canonicalJson`, which sorts keys at every level, so the
// hash does not depend on the order zod happens to emit properties in.
//
// THE HASH IMPLEMENTATION IS v1's, REACHED BY IMPORT, for the reason v2's, v3's and v4's headers
// give: it is already frozen and already proven byte-equal to `node:crypto` by
// tests/work-bundle.test.mjs, and a second open-coded SHA-256 would be a second thing that can be
// wrong about the same digest.
//
// THE BUDGETS ARE RE-DECLARED RATHER THAN IMPORTED, again for the stated reason: the budget block
// is part of the HASHED bundle, and importing a predecessor's frozen object would make v5's digest
// silently follow any future v1…v4 budget change — exactly the coupling a version cutover exists
// to break.
//
// AND THE NUMBERS THEMSELVES DO NOT MOVE. #658's stanza is explicit that budgets do not move
// (`claraWork.v4.bundle.ts:39-45`; replans stays 2), and the two additions do not press on them:
// the knowledge PRELOAD is a step outside the model loop and spends nothing, the drift replan
// spends ONE EXISTING `budget.replans` rather than a new allowance, and the two inspection reads
// spend `toolCalls` from the same twelve every other tool draws on. Raising a wall for a change
// that does not press on it would be loosening it for free.

import { canonicalJson } from "./chatTurn.v11.tools.js";
import { sha256Hex, type ClaraWorkBudgets, type ClaraWorkBundle } from "./claraWork.v1.bundle.js";
import {
  CLARA_WORK_INSTRUCTIONS_V5,
  CLARA_WORK_TOOL_DEPENDENCIES_V5,
  CLARA_WORK_TOOL_NAMES_V5,
  CLARA_WORK_TOOL_SCHEMAS_V5,
  JOURNAL_ENTRY_SKILL_V5,
} from "./claraWork.v5.prompt.js";
import { z } from "zod";

export type { ClaraWorkBudgets };

/** The tool block v5 hashes. It is a WIDENING of `ClaraWorkBundle['tools']`, so the shared type is
 *  not reused for it: v1's type names `{id, names}` and this carries two more members. Declared
 *  here rather than pushed back into v1's frozen module for the obvious reason — that module is
 *  deployed. */
export type ClaraWorkToolsBlockV5 = {
  id: string;
  names: readonly string[];
  schemas: Readonly<Record<string, unknown>>;
  dependencies: Readonly<Record<string, readonly string[]>>;
};

export type ClaraWorkBundleV5 = Omit<ClaraWorkBundle, "tools"> & { tools: ClaraWorkToolsBlockV5 };

export const CLARA_WORK_BUDGETS_V5: ClaraWorkBudgets = Object.freeze({
  segments: 4,
  modelCalls: 8,
  toolCalls: 12,
  replans: 2,
  transientRetries: 3,
});

/** The JSON Schema target and direction, PINNED. See this file's header for why neither is left to
 *  the library's default. */
const JSON_SCHEMA_TARGET = "draft-07" as const;
const JSON_SCHEMA_IO = "input" as const;

/**
 * Convert the roster's zod schemas to JSON Schema, ONCE at module load, in ROSTER ORDER.
 *
 * A conversion failure is not swallowed. Everywhere else in this closure a diagnostic that could
 * refuse an accounting act is wrapped — but this is not a diagnostic: it is the CONTRACT the
 * receipt attests to, and a bundle that quietly hashed `{}` for a tool it could not describe would
 * be a receipt claiming a coverage it does not have. Loading this module is what a `claim_work_run`
 * does before any client data moves, so a failure here stops the run at the earliest possible
 * point and names the tool.
 */
function toolSchemasJson(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of CLARA_WORK_TOOL_NAMES_V5) {
    const schema = (CLARA_WORK_TOOL_SCHEMAS_V5 as Record<string, unknown>)[name];
    if (schema === undefined) {
      throw new Error(`claraWork_v5 bundle: no input schema declared for tool "${name}"`);
    }
    out[name] = z.toJSONSchema(schema as Parameters<typeof z.toJSONSchema>[0], {
      target: JSON_SCHEMA_TARGET,
      io: JSON_SCHEMA_IO,
    });
  }
  return out;
}

/** The tool block, built from the roster so a name the roster does not carry cannot appear in the
 *  digest and a name it does carry cannot be missing from it. */
export const CLARA_WORK_TOOLS_BLOCK_V5: ClaraWorkToolsBlockV5 = Object.freeze({
  id: "clara-work-tools/v5",
  names: CLARA_WORK_TOOL_NAMES_V5,
  schemas: Object.freeze(toolSchemasJson()),
  dependencies: CLARA_WORK_TOOL_DEPENDENCIES_V5,
});

/** The bundle itself — deep-frozen so a runtime mutation throws (ES modules are strict) rather
 *  than silently producing a run whose recorded envelope differs from the hashed one. */
export const CLARA_WORK_BUNDLE_V5: ClaraWorkBundleV5 = Object.freeze({
  id: "clara-work/v5",
  instructions: Object.freeze({ id: "clara-work-instructions/v5", text: CLARA_WORK_INSTRUCTIONS_V5 }),
  skills: Object.freeze([Object.freeze({ id: "journal-entry/v5", text: JOURNAL_ENTRY_SKILL_V5 })]),
  tools: CLARA_WORK_TOOLS_BLOCK_V5,
  budgets: CLARA_WORK_BUDGETS_V5,
});

/** The exact text the digest is taken over. Exported so the pin cell hashes THIS string with
 *  Node's own sha256 rather than re-deriving a canonicalisation of its own. */
export const CLARA_WORK_BUNDLE_V5_CANONICAL: string = canonicalJson(CLARA_WORK_BUNDLE_V5);

/** sha256 hex of the bundle's canonical JSON, computed ONCE at module load. */
export const CLARA_WORK_BUNDLE_V5_DIGEST: string = sha256Hex(CLARA_WORK_BUNDLE_V5_CANONICAL);

/** The one line C88.8 asks the process to emit at world start, and the one string
 *  /api/build-info serves. Spelled in ONE place so the log and the route can never disagree. */
export const CLARA_WORK_BUNDLE_V5_BANNER = `[clara-runtime] bundle ${CLARA_WORK_BUNDLE_V5.id} digest=${CLARA_WORK_BUNDLE_V5_DIGEST}`;

/**
 * The bundle identity every workflow-facing surface serves: the ids, the digest and the budgets,
 * WITHOUT the prose (an instructions blob has no place in a build-info payload or a task row).
 *
 * `tools` STAYS THE ID ALONE, exactly as v1…v4 served it, and that is deliberate rather than an
 * oversight of the widening above. This function answers "which contract was this run served",
 * and the digest is what answers it completely; inlining seven JSON Schemas into every
 * `accounting_work.bundle` row and every `/api/build-info` response would put kilobytes of
 * unchanging text in a column a human reads, to say something the digest already says exactly.
 * The schemas are IN THE HASH, which is where the coverage requirement asked for them.
 */
export function claraWorkBundleIdentityV5(): {
  id: string;
  digest: string;
  instructions: string;
  skills: string[];
  tools: string;
  budgets: ClaraWorkBudgets;
} {
  return {
    id: CLARA_WORK_BUNDLE_V5.id,
    digest: CLARA_WORK_BUNDLE_V5_DIGEST,
    instructions: CLARA_WORK_BUNDLE_V5.instructions.id,
    skills: CLARA_WORK_BUNDLE_V5.skills.map((s) => s.id),
    tools: CLARA_WORK_BUNDLE_V5.tools.id,
    budgets: CLARA_WORK_BUDGETS_V5,
  };
}

/** The manifest `clara.claim_work_run` stores on the Work row: the identity above plus the MODEL
 *  this particular run was claimed with (a per-run fact, so it can never live inside the hashed
 *  bundle). */
export function claraWorkRunManifestV5(modelSnapshot: string): Record<string, unknown> {
  const identity = claraWorkBundleIdentityV5();
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
