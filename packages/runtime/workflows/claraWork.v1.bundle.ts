// @frozen
//
// FROZEN — part of the claraWork_v1 closure (#623). THE IMMUTABLE SUCCESSOR BUNDLE: the
// serializable invocation envelope, the instruction/skill/tool registry versions, the finite
// segment/model/tool/replan budgets, and the sha256 that names all of it at once.
//
// WHAT THE DIGEST IS FOR, AND WHAT IT IS NOT. It is the claim "this run was executed by exactly
// this bundle" — written onto clara.accounting_work.bundle by claim_work_run, carried into every
// clara.operation_receipts row as `bundle_digest`, logged once at world start (C88.8) and served
// by /api/build-info. It is NOT a security boundary: freeze-lint's manifest is what makes the
// bytes immutable, and the pinned hex literal in tests/work-bundle.test.mjs is what makes a
// silent edit visible. Three independent legs, deliberately — the digest alone would only prove
// the bundle is self-consistent, never that it is the one that was reviewed.
//
// THE HASH IS OVER CANONICAL JSON, and the canonicaliser is chatTurn.v11.tools' own
// `canonicalJson` reached BY IMPORT rather than copied: it key-sorts recursively and drops
// undefined, so two structurally identical bundles cannot hash differently and a re-ordered
// literal cannot hash the same by accident. That module is already frozen and registered, so
// importing it adds nothing to this closure's own manifest surface that was not already locked.
//
// THE SHA-256 IS WRITTEN OUT HERE RATHER THAN IMPORTED FROM `node:crypto`, AND IT IS THE WDK'S
// RULE, NOT A PREFERENCE. This module is reachable from `claraWork.v1.ts`'s `"use workflow"`
// body, so the Workflow DevKit compiles it for the workflow environment and REFUSES any Node
// built-in there ("Node.js modules are not available in workflow functions" — measured, not
// assumed: `nitro build` fails the build on the import). Moving the digest into a step instead
// was the other candidate and was rejected: the route, `/api/build-info` and the world-start
// banner all need the same constant OUTSIDE any step, and a digest computed in two places is a
// digest that can disagree with itself.
//
// AN OPEN-CODED HASH IS ONLY SAFE IF SOMETHING PROVES IT, so something does:
// tests/work-bundle.test.mjs computes `createHash("sha256")` over the SAME canonical text with
// Node's own implementation and asserts byte equality, and separately pins the hex literal. The
// pure implementation is therefore checked against the reference on every test run rather than
// trusted for being short.
//
// BUDGETS ARE FINITE AND THEY ARE RECORDED (ARCHITECTURE §5: "每段模型/工具/重算/重试预算有限且
// 被记录, 耗尽后保留可恢复状态"). Exhaustion is not a crash and not a silent stop: the workflow
// settles the Work `failed` with agent_tasks.error_code='limit' and error.code='budget_exhausted',
// recoverable:true, so the human's Retry makes a NEW run for the SAME logical identity.
//
//   segments          4  — how many model↔human round trips one Work may take. A documentless
//                          journal needs one; four leaves room for two clarifications and a
//                          resumed segment after a crash without ever being unbounded.
//   modelCalls        8  — the ToolLoopAgent's own step ceiling INSIDE one segment
//                          (isStepCount). Read the chart, post, narrate = 3.
//   toolCalls        12  — the per-segment ceiling this closure counts itself, because
//                          isStepCount bounds STEPS and a single step can carry more than one
//                          tool call. The two bounds are not the same bound.
//   replans           2  — how many times a classified `invalid_input` / `state_changed` tool
//                          failure may go back to the model within one segment. A third is a
//                          loop, not a repair.
//   transientRetries  3  — bounded backoff for an infrastructure fault (a dropped connection, a
//                          deadlock). Never used for a refusal, a conflict or an authority error.

import { canonicalJson } from "./chatTurn.v11.tools.js";
import {
  CLARA_WORK_INSTRUCTIONS_V1,
  CLARA_WORK_TOOL_NAMES,
  JOURNAL_ENTRY_SKILL_V1,
} from "./claraWork.v1.prompt.js";

/** The finite budgets one claraWork_v1 run may spend. Every field is a positive integer; the
 *  bundle cell asserts finiteness rather than trusting this sentence. */
export type ClaraWorkBudgets = {
  segments: number;
  modelCalls: number;
  toolCalls: number;
  replans: number;
  transientRetries: number;
};

export type ClaraWorkBundle = {
  id: string;
  instructions: { id: string; text: string };
  skills: ReadonlyArray<{ id: string; text: string }>;
  tools: { id: string; names: ReadonlyArray<string> };
  budgets: ClaraWorkBudgets;
};

export const CLARA_WORK_BUDGETS_V1: ClaraWorkBudgets = Object.freeze({
  segments: 4,
  modelCalls: 8,
  toolCalls: 12,
  replans: 2,
  transientRetries: 3,
});

/** The bundle itself — deep-frozen so a runtime mutation throws (ES modules are strict) rather
 *  than silently producing a run whose recorded envelope differs from the hashed one. */
export const CLARA_WORK_BUNDLE_V1: ClaraWorkBundle = Object.freeze({
  id: "clara-work/v1",
  instructions: Object.freeze({ id: "clara-work-instructions/v1", text: CLARA_WORK_INSTRUCTIONS_V1 }),
  skills: Object.freeze([Object.freeze({ id: "journal-entry/v1", text: JOURNAL_ENTRY_SKILL_V1 })]),
  tools: Object.freeze({ id: "clara-work-tools/v1", names: CLARA_WORK_TOOL_NAMES }),
  budgets: CLARA_WORK_BUDGETS_V1,
});

// --- SHA-256, FIPS 180-4, open-coded (see this file's header for why) --------------------

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/** sha256 of a UTF-8 string, as lowercase hex. Proven byte-equal to `node:crypto`'s own
 *  implementation by tests/work-bundle.test.mjs on every run. */
export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const padded = bytes.length + 1;
  const total = padded + (((56 - (padded % 64)) + 64) % 64) + 8;
  const message = new Uint8Array(total);
  message.set(bytes);
  message[bytes.length] = 0x80;
  const view = new DataView(message.buffer);
  view.setUint32(total - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(total - 4, bitLength >>> 0, false);

  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let block = 0; block < total; block += 64) {
    for (let t = 0; t < 16; t += 1) w[t] = view.getUint32(block + t * 4, false);
    for (let t = 16; t < 64; t += 1) {
      const x = w[t - 15]!;
      const y = w[t - 2]!;
      const s0 = (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
      const s1 = (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) >>> 0;
      w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) >>> 0;
    }
    let a = h[0]!;
    let b = h[1]!;
    let c = h[2]!;
    let d = h[3]!;
    let e = h[4]!;
    let f = h[5]!;
    let g = h[6]!;
    let hh = h[7]!;
    for (let t = 0; t < 64; t += 1) {
      const s1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (hh + s1 + ch + SHA256_K[t]! + w[t]!) >>> 0;
      const s0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }
  let hex = "";
  for (let i = 0; i < 8; i += 1) hex += h[i]!.toString(16).padStart(8, "0");
  return hex;
}

/** The exact text the digest is taken over. Exported so the pin cell hashes THIS string with
 *  Node's own sha256 rather than re-deriving a canonicalisation of its own. */
export const CLARA_WORK_BUNDLE_V1_CANONICAL: string = canonicalJson(CLARA_WORK_BUNDLE_V1);

/** sha256 hex of the bundle's canonical JSON, computed ONCE at module load. */
export const CLARA_WORK_BUNDLE_V1_DIGEST: string = sha256Hex(CLARA_WORK_BUNDLE_V1_CANONICAL);

/** The one line C88.8 asks the process to emit at world start, and the one string /api/build-info
 *  serves. Spelled in ONE place so the log and the route can never name different digests. */
export const CLARA_WORK_BUNDLE_V1_BANNER = `[clara-runtime] bundle ${CLARA_WORK_BUNDLE_V1.id} digest=${CLARA_WORK_BUNDLE_V1_DIGEST}`;

/** The bundle identity every workflow-facing surface serves: the ids, the digest and the budgets,
 *  WITHOUT the prose (an instructions blob has no place in a build-info payload or a task row). */
export function claraWorkBundleIdentity(): {
  id: string;
  digest: string;
  instructions: string;
  skills: string[];
  tools: string;
  budgets: ClaraWorkBudgets;
} {
  return {
    id: CLARA_WORK_BUNDLE_V1.id,
    digest: CLARA_WORK_BUNDLE_V1_DIGEST,
    instructions: CLARA_WORK_BUNDLE_V1.instructions.id,
    skills: CLARA_WORK_BUNDLE_V1.skills.map((s) => s.id),
    tools: CLARA_WORK_BUNDLE_V1.tools.id,
    budgets: CLARA_WORK_BUDGETS_V1,
  };
}

/** The manifest `clara.claim_work_run` stores on the Work row: the identity above plus the
 *  MODEL this particular run was claimed with (agent_tasks.model_snapshot — a per-run fact, so
 *  it can never live inside the hashed bundle). */
export function claraWorkRunManifest(modelSnapshot: string): Record<string, unknown> {
  const identity = claraWorkBundleIdentity();
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
