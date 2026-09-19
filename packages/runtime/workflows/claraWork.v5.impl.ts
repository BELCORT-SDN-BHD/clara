// @frozen
//
// FROZEN — part of the claraWork_v5 closure. THE STEP BODIES.
//
// MOST OF THE STEPS ARE REACHED BY IMPORT AND NOT RESTATED — `mintHookTokenStep`,
// `markRunningStep`, `closeStreamStep`, `loadWorkStep`, `confirmEntryStep` (v1's, and it already
// reads through the CLIENT-PINNED `clara.get_journal_entry_for`), `openWorkQuestionStep` (v2's),
// `emitWorkStatusStepV3` / `emitWorkQuestionStepV3` / `recheckAuthorityStepV3` (v3's), and v4's
// whole #639 particulars pair (`loadPendingFixedAssetStepV4`, `applyParticularsStepV4`,
// `particularsQuestionV4`) together with its question finder `findQuestionCallV4`. A second copy of
// a park/resume body is how two lanes come to disagree about what a parked Work is, and
// claraWork.v1.impl.ts's own header states the discipline.
//
// `findQuestionCallV4` IS IMPORTED RATHER THAN RESTATED BECAUSE v5 ADDS NO QUESTION. The roster
// gains two READS; the three tools that can park a run are v4's three, and v4's finder already
// knows exactly those three. A v5 copy would be a second finder that has to be kept equal to the
// first forever, for no capability at all.
//
// WHAT IS NEW HERE IS THE KNOWLEDGE READ, ITS RECORDED READ-SET, THE DRIFT READ, AND THE THREE
// THAT HAD TO MOVE BECAUSE THEY CARRY v5's BUNDLE IDENTITY:
//   loadWorkKnowledgeStepV5      reads `clara.retrieve_knowledge` — BOUNDED, CORE-FIRST,
//                                period-aware — through the non-frozen
//                                `lib/knowledge-retrieval.mjs`, and then RECORDS what it read
//                                through `clara.record_work_knowledge_read`. Unlike v4's read it
//                                CAN end the run: an `unavailable` answer is D16's
//                                `knowledge_read_failed` terminal, decided by the body.
//   readKnowledgeDriftStepV5     after a resume, asks `clara.work_knowledge_drift_for` whether the
//                                firm's record of this client moved while a human was answering.
//   claimWorkRunStepV5           v1's claim, stamping V5's manifest, plus the `dispatch` trace row.
//   runWorkSegmentStepV5         v4's segment on v5's tools and v5's bundle text.
//   settleWorkStepV5             v1's settle plus the `settle` trace row, inside one transaction.
//
// THE TRACE SCHEME IS v5's OWN, AND IT IS THE FIRST TIME THIS CLASS HAS MOVED IT. v1…v4 used
// "seq 1 = dispatch, a segment owns three rows from 2 + index*3, settle past the last segment",
// and their knowledge read and particulars pair wrote NO rows at all — v4's header says why:
// inventing a seq outside the scheme would collide with a re-executed segment's own row. v5 has
// two new acts that genuinely deserve rows (a read of the client's governed knowledge; a read of
// whether that knowledge moved), and the honest way to give them one is to widen the scheme rather
// than to wedge them in:
//
//   seq 1                     the claim's dispatch row
//   seq 2                     the KNOWLEDGE PRELOAD          (accounting_work.retrieve_knowledge)
//   seq 3 + index*4 + 0       the DRIFT read taken before this segment, when one was taken
//   seq 3 + index*4 + 1       the segment's egress dispatch
//   seq 3 + index*4 + 2       the segment's model call
//   seq 3 + index*4 + 3       the segment's tool call
//   seq 3 + segments*4        the settle
//
// Every number is derived from v5's own constants, so nothing can collide with a re-executed
// step's row: the database's `(work_id, run_id, seq)` unique is what makes a WDK re-execution
// replay onto the same row, and that property is preserved exactly. The particulars pair still
// writes no rows (v4's reason, unchanged).
//
// THE REGISTRY VERSION ON EVERY ROW IS `clara-capability-registry/v2`, INCLUDING THE ROWS WHOSE
// CAPABILITY IDS ARE v1's. That is the truthful record: v2 carries v1's five entries BY REFERENCE
// and adds two, so a v5 run is served by v2 in its entirety, and a row that claimed v1 while the
// run could exercise `accounting_work.inspect_knowledge_source` would be describing a different
// contract than the one that ran. `purpose` is read from `purposeForV2` for the same reason —
// `lib/work-trace.mjs` defaults it from v1's `capability()`, which answers null for the two new
// ids, and a null purpose on an egress row is the one field an auditor most needs.
//
// RIDER #847 — THE WRITER-SIDE TRACE BOUNDS ARE APPLIED HERE, BEFORE `traceSafely`, AND NO
// TIGHTER THAN THE DOOR'S. `lib/work-trace-bounds.mjs` mirrors 0210's two door-side clauses:
// `boundedRevisionNumber` over each NUMERIC observed revision, and `boundedRunId` over the run id.
// A refused number DROPS ITS KEY, which is `observedRevisions`' own existing contract for an
// out-of-vocabulary key; a refused run id SKIPS THE WHOLE ROW, because the door would refuse it
// anyway and a skipped write cannot poison a caller's open transaction. `lib/work-trace.mjs` IS
// NOT OPENED by this delivery — ARCHITECTURE:373-386's owed half ships as a SIBLING module the v5
// body imports, which is what #815's standing ruling asked for.
//
// DEADLOCK DISCIPLINE (ARCHITECTURE §6, 0184), carried from v3 and v4: every trace row except the
// settle row is written on the runtime pool OUTSIDE any posting transaction, and the insert takes
// NO lock on `clara.accounting_work`. The lock order accounting_work → agent_tasks →
// agent_interruptions is untouched by this closure.
//
// A SEGMENT CAN RE-EXECUTE, SO NOTHING HERE DEDUPLICATES IN MEMORY (ARCHITECTURE §5). What
// survives a WDK re-execution is the database's own idempotency: `record_work_execution_trace`
// replays on `(work, run, seq)`, `record_work_knowledge_read` replays on `(work, run, seq)` too,
// `open_work_question` replays on the hook token, `claim_work_run` and `settle_work_run` are
// idempotent by task, the logical operation identity resolves a replayed
// `wake_record_journal_entry` onto the SAME receipt, and
// `complete_fixed_asset_particulars_for` is op-keyed on the Work and the asset.

import { ToolLoopAgent, hasToolCall, isStepCount } from "ai";
import type { ModelMessage } from "ai";
import { getWritable, getWorkflowMetadata } from "workflow";
import { pools, type PgExec } from "./chatTurn.v15.infra.js";
import { resolveModel } from "./chatTurn.v15.infra.js";
import {
  classifyWorkError,
  egressRefusalPayload,
  knowledgeReadFailedPayload,
  workErrorPayload,
  type WorkErrorClass,
} from "./claraWork.v5.errors.js";
import {
  newBudgetLedger,
  type JournalBasis,
  type PostedEffect,
  type WorkToolCtx,
} from "./claraWork.v1.tools.js";
import {
  closeStreamStep,
  confirmEntryStep,
  loadWorkStep,
  markRunningStep,
  mintHookTokenStep,
  stoppedOnTerminalWorkTool,
  workEnvelopeMessage,
  type LoadedWork,
  type SettleArgs,
} from "./claraWork.v1.impl.js";
import { openWorkQuestionStep, type OpenedQuestion } from "./claraWork.v2.impl.js";
import {
  emitWorkQuestionStepV3,
  emitWorkStatusStepV3,
  recheckAuthorityStepV3,
  type AuthorityVerdict,
} from "./claraWork.v3.impl.js";
import {
  applyParticularsStepV4,
  findQuestionCallV4,
  loadPendingFixedAssetStepV4,
  particularsQuestionV4,
  type AskedQuestionV4,
  type PendingFixedAssetV4,
} from "./claraWork.v4.impl.js";
import {
  ANSWER_ACCRUAL_TERM_TOOL,
  ASK_KNOWLEDGE_CONFLICT_TOOL,
  ASK_QUESTION_TOOL,
  buildClaraWorkToolsV5,
} from "./claraWork.v5.tools.js";
import {
  CLARA_WORK_BUDGETS_V5,
  CLARA_WORK_BUNDLE_V5,
  CLARA_WORK_BUNDLE_V5_DIGEST,
  claraWorkBundleIdentityV5,
  claraWorkRunManifestV5,
} from "./claraWork.v5.bundle.js";
import type { ClaraWorkPartAdditionsV3 } from "./claraWork.v3.parts.js";
import { CAPABILITY_REGISTRY_VERSION_V2, purposeForV2 } from "../lib/capability-registry-v2.mjs";
import { boundedRevisionNumber, boundedRunId } from "../lib/work-trace-bounds.mjs";
import {
  faceStatusOf,
  readKnowledgeDrift,
  recordWorkKnowledgeRead,
  renderRetrievedKnowledge,
  renderedView,
  RETRIEVED_MAX_RECORDS,
  RETRIEVED_MAX_VALUE_CHARS,
  retrieveKnowledge,
  WORK_KNOWLEDGE_DEFAULT_LIMIT,
  WORK_KNOWLEDGE_READ_PURPOSE,
} from "../lib/knowledge-retrieval.mjs";

// THE CARRIER IS JAVASCRIPT, SO THIS CLOSURE CALLS IT THROUGH TYPED VIEWS — v4's own pattern
// (`claraWork.v4.impl.ts:270` casts `readWorkKnowledge` the same way), and it exists for a
// measured reason rather than for tidiness: TypeScript infers a `.mjs` function's parameter type
// from its DESTRUCTURING DEFAULTS, so `retrieveKnowledge({clientId, firmId, purpose, asOf = null,
// …})` is inferred as accepting `asOf?: null` — the type of the default, not of the argument the
// carrier's own JSDoc documents. The views below state the contract the module actually has; they
// narrow nothing at run time and the carrier stays the one implementation.

type RetrieveKnowledgeArgs = {
  clientId: string;
  firmId: string;
  purpose: string;
  asOf?: string | null;
  keys?: readonly string[] | null;
  limit?: number;
};
const retrieveKnowledgeTyped = retrieveKnowledge as unknown as (
  sql: PgExec,
  args: RetrieveKnowledgeArgs,
) => Promise<Record<string, unknown>>;

type RecordReadArgs = {
  taskId: string;
  runId: string;
  seq: number;
  answer: unknown;
  purpose?: string;
  reason?: string | null;
  /** What the BLOCK showed — the carrier keeps the door's own counts when neither is passed. */
  recordsShown?: number;
  truncated?: boolean;
};
const recordWorkKnowledgeReadTyped = recordWorkKnowledgeRead as unknown as (
  sql: PgExec,
  args: RecordReadArgs,
) => Promise<{ ok: boolean; receipt?: unknown; replayed?: boolean; payload_match?: boolean }>;

/** The carrier's "what did the block actually show" pair, through the same typed view. */
const renderedViewTyped = renderedView as unknown as (
  answer: unknown,
  maxRecords?: number,
) => { records_shown: number; truncated: boolean };

const readKnowledgeDriftTyped = readKnowledgeDrift as unknown as (
  sql: PgExec,
  firmId: string,
  workId: string,
) => Promise<Record<string, unknown>>;

// v1's/v2's/v3's/v4's park, resume, lifecycle and particulars bodies, re-exported BY IMPORT
// (never copied).
export {
  closeStreamStep, confirmEntryStep, loadWorkStep, markRunningStep, mintHookTokenStep,
  openWorkQuestionStep, workEnvelopeMessage, workErrorPayload, egressRefusalPayload,
  emitWorkQuestionStepV3, emitWorkStatusStepV3, recheckAuthorityStepV3,
  applyParticularsStepV4, findQuestionCallV4, loadPendingFixedAssetStepV4, particularsQuestionV4,
};
export type { LoadedWork, OpenedQuestion, SettleArgs, AuthorityVerdict, PendingFixedAssetV4 };

/** Everything a claraWork_v5 run streams. THE SAME THREE KINDS v3 declares, plus the two carried
 *  ones — v5 adds no wire kind at all, so `claraWork.v3.parts.ts` stays the declarer and
 *  `check-parts-parity.mjs` needs no new file in its set. The two inspection reads mint nothing:
 *  #658's stanza forbids a part kind for them, and a read whose answer the model narrates needs
 *  none. */
export type ClaraWorkPartV5 =
  | ClaraWorkPartAdditionsV3
  | { type: "text"; text: string }
  | { type: "refusal"; code: string; reason?: string; message: string };

/** The question a v5 segment asked. v4's shape, by import — v5 adds no question tool, so there is
 *  nothing here that could differ. */
export type AskedQuestionV5 = AskedQuestionV4;
export type { AskedQuestionV4 };

export type SegmentOutcomeV5 = {
  parts: ClaraWorkPartV5[];
  messages: ModelMessage[];
  question: AskedQuestionV5 | null;
  posted: PostedEffect | null;
  terminal: WorkErrorClass | null;
  requiredReadFailed: boolean;
  exhausted: string | null;
  /** TRUE when the dispatch itself was refused: no model was called and none will be. */
  egressRefused: boolean;
  budget: { toolCalls: number; replans: number; transientRetries: number };
  usageTokens: number;
  finishReason: string;
  text: string;
};

// ---------------------------------------------------------------------------
// 0. THE TRACE SCHEME — v5's own numbers, and the #847 writer-side bounds.
// ---------------------------------------------------------------------------

/** The claim's dispatch row. */
export const CLAIM_TRACE_SEQ = 1;
/** The knowledge preload's row. */
export const KNOWLEDGE_TRACE_SEQ = 2;
/** How many rows ONE segment owns: drift, dispatch, model_call, tool_call. */
export const SEGMENT_TRACE_ROWS = 4;
/** The first seq a segment may use. */
export const FIRST_SEGMENT_TRACE_SEQ = 3;

/** The seq segment `index` starts at. Exported so the body and the cells derive it once. */
export function segmentTraceBase(index: number): number {
  return FIRST_SEGMENT_TRACE_SEQ + index * SEGMENT_TRACE_ROWS;
}

/** THE SETTLE'S TRACE SEQ — the first number past the last possible segment. A fixed number, not a
 *  counter: the settle can be reached from any segment and from the catch. */
export const SETTLE_TRACE_SEQ = FIRST_SEGMENT_TRACE_SEQ + CLARA_WORK_BUDGETS_V5.segments * SEGMENT_TRACE_ROWS;

/**
 * RIDER #847, HALF ONE — every NUMERIC observed revision passes 0210's own numeric clause before
 * it is sent.
 *
 * A refused number DROPS ITS KEY rather than failing the row, which is exactly the contract
 * `observedRevisions` already has for a key outside its closed vocabulary ("drop rather than
 * send"). A NON-number is passed through UNTOUCHED: a string revision is the `rev` grammar's
 * business, `traceRevisionOf` already routes it there, and bounding it here would make the writer
 * tighter than the door — the one thing this rider must not do.
 */
function boundedObserved(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "number") {
      const bounded = boundedRevisionNumber(value);
      if (bounded === null) continue;
      out[key] = bounded;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Write ONE trace row and never throw. `lib/work-trace.mjs` throws on a database refusal so its own
 * positive-control battery can see the closed-vocabulary wall; every caller in a FROZEN body
 * swallows it, because a diagnostic may not decide an accounting outcome.
 *
 * RIDER #847, HALF TWO. The run id passes 0210's long-digit clause first, and a REFUSED one skips
 * the row entirely. That is not stricter than the door: the door would refuse the same row. It is
 * cheaper (no round trip) and, inside the settle's transaction, it is safer — a refused statement
 * poisons the transaction and the savepoint dance below exists precisely to survive that.
 */
async function traceSafely(exec: PgExec, row: Record<string, unknown>): Promise<void> {
  if (typeof row.runId === "string" && boundedRunId(row.runId) === null) return;
  try {
    const { recordTrace } = await import("../lib/work-trace.mjs");
    const write = recordTrace as unknown as (e: unknown, r: Record<string, unknown>) => Promise<unknown>;
    await write(exec, row);
  } catch {
    /* a diagnostic row is not authority; the Work's record is the database row it posted */
  }
}

/**
 * The same write, INSIDE a caller's open transaction, behind a SAVEPOINT.
 *
 * WHY THE SAVEPOINT IS THE WHOLE POINT. `traceSafely` swallows a refusal, and inside a transaction
 * swallowing is not enough: a failed statement poisons the transaction, so the caller's COMMIT
 * would become a ROLLBACK and the SETTLE would be lost — the diagnostic deciding the accounting, in
 * the one place where it would decide it silently.
 */
async function traceSafelyInTransaction(exec: PgExec, row: Record<string, unknown>): Promise<void> {
  if (typeof row.runId === "string" && boundedRunId(row.runId) === null) return;
  try {
    await exec.query("savepoint clara_work_trace");
  } catch {
    return;
  }
  try {
    const { recordTrace } = await import("../lib/work-trace.mjs");
    const write = recordTrace as unknown as (e: unknown, r: Record<string, unknown>) => Promise<unknown>;
    await write(exec, row);
    await exec.query("release savepoint clara_work_trace");
  } catch {
    await exec.query("rollback to savepoint clara_work_trace").catch(() => {});
  }
}

/**
 * ONE trace row: this closure's bundle identity, the v2 registry and its purpose, then whatever the
 * call site adds.
 *
 * IT MERGES BY LOOP RATHER THAN BY SPREAD, and that is measured rather than fussy: the
 * parts-parity census walks every module under packages/runtime and REFUSES an object spread it
 * cannot classify, because a spread is exactly how an unreviewed type discriminant reaches a
 * transcript part without anyone seeing it.
 */
function traceRow(model: string | null, row: Record<string, unknown>): Record<string, unknown> {
  const identity = claraWorkBundleIdentityV5();
  const capabilityId = typeof row.capabilityId === "string" ? row.capabilityId : null;
  const out: Record<string, unknown> = {
    bundleId: identity.id,
    bundleDigest: identity.digest,
    instructionsId: identity.instructions,
    skills: identity.skills,
    toolsId: identity.tools,
    modelId: model,
    registryVersion: CAPABILITY_REGISTRY_VERSION_V2,
    // NAMED EXPLICITLY, never defaulted. `recordTrace` reads its default from v1's `capability()`,
    // which answers null for this cut's two new ids — and a null purpose on a model-bound row is
    // the field an auditor most needs. `purposeForV2` answers for all seven.
    purpose: capabilityId === null ? null : purposeForV2(capabilityId),
  };
  for (const [key, value] of Object.entries(row)) {
    if (key === "observed") {
      out.observed = boundedObserved((value ?? {}) as Record<string, unknown>);
      continue;
    }
    out[key] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. CLAIM — v1's act, stamping V5's manifest, and the run's FIRST trace row.
// ---------------------------------------------------------------------------

export async function claimWorkRunStepV5(taskId: string): Promise<{ claimed: boolean; model: string; runId: string }> {
  "use step";
  const { workflowRunId } = getWorkflowMetadata();
  return pools().withRuntime(async (c: PgExec) => {
    const snap = await c.query("select model_snapshot from clara.agent_tasks where id = $1 and kind = 'accounting_work'", [taskId]);
    if (snap.rowCount === 0) throw new Error(`claraWork_v5: accounting_work task ${taskId} not found`);
    const model = String(snap.rows[0]!.model_snapshot ?? "");
    const r = await c.query("select clara.claim_work_run($1::uuid, $2::text, $3::jsonb) as r", [
      taskId,
      workflowRunId,
      JSON.stringify(claraWorkRunManifestV5(model)),
    ]);
    const receipt = (r.rows[0]?.r ?? null) as { claimed?: boolean } | null;
    const claimed = receipt?.claimed === true;
    if (claimed) {
      // SEQ 1 IS ALWAYS THE DISPATCH ROW. It is written before a single token is spent, so a run
      // that dies in its first segment still leaves a durable record of what it was dispatched to
      // do and under which bundle.
      await traceSafely(c, traceRow(model, {
        taskId, runId: String(workflowRunId), seq: CLAIM_TRACE_SEQ, phase: "dispatch",
        capabilityId: "accounting_work.model_segment",
        outcome: "ok",
      }));
    }
    return { claimed, model, runId: String(workflowRunId) };
  });
}

// ---------------------------------------------------------------------------
// 2. THE KNOWLEDGE READ — bounded, core-first, RECORDED, and able to end the run.
// ---------------------------------------------------------------------------

/**
 * What the knowledge step hands the run. SMALL, SERIALISABLE AND RENDERED: a WDK step's answer is
 * written into the run's journal and replayed on every later attempt, so putting a client's whole
 * record set in there would persist it twice over for no gain. v4's rule, carried.
 *
 * TWO VOCABULARIES, BOTH KEPT, WHICH IS THE ARRANGEMENT `chatTurn.v21.impl.ts` MAKES ONE LANE OVER.
 * `status` is the RUNTIME's own frozen pair (`ok` / `unavailable`) and is what the body's terminal
 * test reads; `face_status` is the ESTATE's four words (`ok` / `partial` / `unknown` / `denied`),
 * which is what was WRITTEN to `clara.work_knowledge_reads.status` — a column whose CHECK refuses
 * `unavailable` by name. Keeping both means a later reader can tell the raw answer from the
 * recorded one without re-deriving either, and neither lane has to guess which one it is holding.
 */
export type WorkKnowledgeV5 = {
  status: "ok" | "unavailable";
  reason: string | null;
  face_status: "ok" | "partial" | "unknown" | "denied";
  knowledge_version: string | null;
  as_of: string | null;
  keys: string[];
  records_shown: number;
  truncated: boolean;
  text: string;
  /** The `work_knowledge_reads` seq this attempt's facts actually landed on, or NULL when every
   *  seq the bound allows was already held by a row recording something else — see below. */
  read_seq: number | null;
  /** FALSE when the read-set row could not be written. Never fails the run (see below). */
  recorded: boolean;
};

/**
 * D16 / R-D, AS A PURE PREDICATE: does this read end the run?
 *
 * EXPORTED, AND THE BODY CALLS IT RATHER THAN RESTATING `status !== "ok"`. The rule is the
 * consequential one this whole cut turns on, and a rule that lives only as an inline comparison
 * inside a workflow body can be checked only by reading the body — which is how "it fires on any
 * unavailable answer" and "it fires when the core tier is empty" become indistinguishable to
 * everyone downstream. As a function it can be driven over all five frozen reasons AND over the
 * `{status:'ok'}` answer with an empty core, which are exactly the two claims R-D makes.
 *
 * TRUE for every `unavailable` answer, whatever its reason — the door is atomic and there is no
 * per-tier signal to be subtler with. FALSE for every `ok` answer, however small `tiers.core` is:
 * a client that genuinely has nothing recorded is not a failed read.
 */
export function knowledgeReadFailedV5(knowledge: Pick<WorkKnowledgeV5, "status">): boolean {
  return knowledge.status !== "ok";
}

/** How many `work_knowledge_reads` seqs one preload may consume before it stops trying to record a
 *  divergent re-read. Four is generous: reaching it needs four WDK re-executions that each read
 *  something different from every row already stored. */
const KNOWLEDGE_READ_MAX_SEQ = 4;

type RetrievedAnswer = {
  status?: unknown;
  reason?: unknown;
  knowledge_version?: unknown;
  as_of?: unknown;
  keys?: unknown;
  truncated?: unknown;
  records?: unknown;
};

/**
 * Read this client's governed knowledge for the run, CORE-FIRST and BOUNDED, and RECORD what was
 * read.
 *
 * THE ARGUMENT ORDER IS THE STANZA'S FOUR FIRST. #658's successor contract fixes
 * `(clientId, firmId, asOf, purpose)` as the retrieval's own arguments; `taskId` and `runId` follow
 * because the RECORDER needs them and a WDK step's argument list is part of its journal shape — a
 * later version that wants a different retrieval must not have to renumber the first four to get it.
 *
 * `asOf` IS THE PERIOD BEING WORKED, not today. Omitting it lets the door default to the server's
 * Asia/Kuala_Lumpur calendar date; a run working a closed period passes that period's date so the
 * rows it is shown are marked against the right window.
 *
 * IT NAMES THE FIRM. 0230's machine lane REQUIRES it — an unbound read is the door's own refusal
 * rather than another firm's knowledge — and that guard is deliberately NOT duplicated here: this
 * step decides nothing about authority.
 *
 * IT NEVER THROWS AND NEVER RETURNS NULL, and neither half of it can fail the run by ACCIDENT.
 * `retrieveKnowledge` answers `{status:'ok'}` or `{status:'unavailable', reason}` over five frozen
 * reasons; the body reads that word and decides D16's terminal. The RECORDER is different: a
 * read-set row is a durable diagnostic, and `recordWorkKnowledgeRead` never throws, so a failure to
 * write it sets `recorded:false` and nothing else. A run stopped because its own audit row could
 * not be written would be the diagnostic deciding the accounting, which this estate refuses
 * everywhere else and refuses here.
 *
 * AND IT RECORDS ITS OWN NEXT SEQ ON A DIVERGENT REPLAY. `record_work_knowledge_read` is
 * replay-idempotent on `(work_id, run_id, seq)` and the relation is APPEND-ONLY, so a WDK
 * re-execution that read something DIFFERENT (first attempt `ok`, second `denied` because a record
 * was withdrawn mid-flight) lands on the first row and is told `replayed:true, payload_match:false`.
 * The estate then holds a row that is not what this attempt saw. A step that cares — and this one
 * cares, because the read-set is the answer to "what did Clara actually see" — takes the NEXT seq
 * and records the divergence rather than assuming the estate holds what it just sent. The loop is
 * bounded and converges: the second execution writes seq 2, and a third execution reading the same
 * divergent answer matches seq 2 and stops.
 */
export async function loadWorkKnowledgeStepV5(
  clientId: string,
  firmId: string,
  asOf: string | null,
  purpose: string,
  taskId: string,
  runId: string,
): Promise<WorkKnowledgeV5> {
  "use step";
  const readPurpose = purpose || WORK_KNOWLEDGE_READ_PURPOSE;
  return pools().withRuntime(async (c: PgExec) => {
    const answer = (await retrieveKnowledgeTyped(c, {
      clientId,
      firmId,
      purpose: readPurpose,
      asOf,
      limit: WORK_KNOWLEDGE_DEFAULT_LIMIT,
    })) as RetrievedAnswer;

    // WHAT THE BLOCK WILL SHOW, DERIVED BEFORE THE ROW IS WRITTEN. `records_shown` and `truncated`
    // are the estate's durable answer to "what did Clara see", and the door's own counts are the
    // answer to a different question: 0230 caps only the remainder, so a door that returned 55
    // records against this lane's print cap of 40 would otherwise have left a row reading "55
    // shown, not truncated" about a block that printed 40 (review ADV-S-5(c)).
    const view = renderedViewTyped(answer, RETRIEVED_MAX_RECORDS);

    let seq = 1;
    let recorded = false;
    let divergent = false;
    for (; seq <= KNOWLEDGE_READ_MAX_SEQ; seq += 1) {
      const written = await recordWorkKnowledgeReadTyped(c, {
        taskId, runId, seq, answer, purpose: readPurpose,
        recordsShown: view.records_shown, truncated: view.truncated,
      });
      if (written.ok !== true) break;
      recorded = true;
      divergent = written.replayed === true && written.payload_match === false;
      if (!divergent) break;
    }
    // NULL WHEN NOTHING LANDED, and that is fix round 1's correction (review ADV-S-12(a)).
    // `read_seq` is documented as "the seq this attempt's facts actually landed on"; two paths
    // reach the end of this loop with no row holding them — a write that never succeeded, and a
    // fourth seq that STILL diverged (every seq the bound allows is then held by a row recording
    // something else). Answering the last seq TRIED in either case is a claim about the estate
    // that the estate does not carry.
    const landedSeq = recorded && !divergent ? seq : null;

    const face = faceStatusOf(answer, view.truncated) as WorkKnowledgeV5["face_status"];
    await traceSafely(c, traceRow(null, {
      taskId, runId, seq: KNOWLEDGE_TRACE_SEQ, phase: "tool_call",
      capabilityId: "accounting_work.retrieve_knowledge",
      startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      outcome: answer.status === "ok" ? "ok" : face === "denied" ? "refused" : "failed",
      observed: { knowledge_version: answer.knowledge_version ?? null },
      refusal: answer.status === "ok"
        ? null
        : { code: null, reason: typeof answer.reason === "string" ? answer.reason : null, message: "" },
    }));

    return {
      status: answer.status === "ok" ? "ok" : "unavailable",
      reason: typeof answer.reason === "string" ? answer.reason : null,
      face_status: face,
      // VERBATIM, AS TEXT. The watermark is a bigint the driver hands over as text; coercing it
      // through Number() would quietly lose precision past 2^53 and would make a later "is this the
      // version I read?" comparison compare two different things.
      knowledge_version:
        answer.knowledge_version === null || answer.knowledge_version === undefined
          ? null
          : String(answer.knowledge_version),
      as_of: answer.as_of === null || answer.as_of === undefined ? null : String(answer.as_of),
      keys: Array.isArray(answer.keys) ? (answer.keys as string[]) : [],
      records_shown: view.records_shown,
      truncated: view.truncated,
      text: renderRetrievedKnowledge(answer, {
        maxRecords: RETRIEVED_MAX_RECORDS,
        maxValueChars: RETRIEVED_MAX_VALUE_CHARS,
      }),
      read_seq: landedSeq,
      recorded,
    };
  });
}

// ---------------------------------------------------------------------------
// 3. THE DRIFT READ — has the firm's record of this client moved while we waited?
// ---------------------------------------------------------------------------

/**
 * What the drift step hands the run.
 *
 * `relevant` IS THREE-VALUED AND STAYS THREE-VALUED. `true` means the estate can say that a key
 * THIS run recorded reading has moved. `false` means it can say nothing moved. `null` means it
 * cannot say either way — 0230 answers null, never false, when the observed version came from an
 * execution trace rather than a recorded read-set, because no key set was written down and
 * "nothing relevant moved" would be a claim about keys nobody recorded. Coercing that null to
 * `false` here would re-open the null-as-empty defect one layer up, so the body surfaces it as its
 * own third case.
 */
export type WorkDriftV5 = {
  status: "ok" | "unavailable";
  reason: string | null;
  relevant: boolean | null;
  drifted: boolean | null;
  observed_from: string | null;
  observed_version: string | null;
  current_version: string | null;
  moved_keys: string[];
};

export async function readKnowledgeDriftStepV5(
  firmId: string,
  workId: string,
  taskId: string,
  runId: string,
  seq: number,
): Promise<WorkDriftV5> {
  "use step";
  return pools().withRuntime(async (c: PgExec) => {
    const d = await readKnowledgeDriftTyped(c, firmId, workId);
    const ok = d.status === "ok";
    await traceSafely(c, traceRow(null, {
      taskId, runId, seq, phase: "tool_call",
      // ITS OWN CAPABILITY ID, not the preload's (review ADV-S-10). A resumed run writes two
      // knowledge rows; under one id the only way to tell the preload from the drift was the seq,
      // and `work-egress-e2e`'s own "find the row BY CAPABILITY" discipline — introduced to
      // replace "the only tool_call in the run" — could not have worked on a run with a resume.
      capabilityId: "accounting_work.read_knowledge_drift",
      startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      outcome: ok ? "ok" : "failed",
      observed: {
        knowledge_version: d.current_version === null || d.current_version === undefined
          ? null : String(d.current_version),
      },
    }));
    return {
      status: ok ? "ok" : "unavailable",
      reason: typeof d.reason === "string" ? d.reason : null,
      // THREE-VALUED, RELAYED. `undefined` and `null` are both "cannot say"; only a literal boolean
      // is an answer.
      relevant: typeof d.relevant === "boolean" ? d.relevant : null,
      drifted: typeof d.drifted === "boolean" ? d.drifted : null,
      observed_from: typeof d.observed_from === "string" ? d.observed_from : null,
      observed_version: d.observed_version === null || d.observed_version === undefined
        ? null : String(d.observed_version),
      current_version: d.current_version === null || d.current_version === undefined
        ? null : String(d.current_version),
      moved_keys: Array.isArray(d.moved_keys) ? (d.moved_keys as string[]) : [],
    };
  });
}

/**
 * The sentence a resumed run is told about the drift, as a user-role message.
 *
 * THREE DIFFERENT FACTS, THREE DIFFERENT SENTENCES, and that is the whole point of the function.
 * "Keys you read have moved", "the estate cannot tell whether anything you read moved" and "the
 * drift could not be read at all" are not the same news, and a run told one of them when another
 * was true would reason confidently about the wrong thing.
 */
export function driftNoteV5(drift: WorkDriftV5): string | null {
  if (drift.status !== "ok") {
    return "WHILE YOU WERE WAITING: whether this client's recorded knowledge changed could NOT be "
      + `checked (${drift.reason ?? "unknown"}). That is not "nothing changed". If a recorded fact `
      + "bears on what you are about to record, read it again before you record it.";
  }
  if (drift.relevant === true) {
    const keys = drift.moved_keys.length > 0 ? drift.moved_keys.join(", ") : "(unnamed)";
    return "WHILE YOU WERE WAITING, A FACT YOU READ CHANGED. The firm has recorded, revised or "
      + `withdrawn something under: ${keys}. Re-read what you need before you record anything — the `
      + "human's answer is still their answer, but the rules around it are not the ones you "
      + "reasoned with.";
  }
  if (drift.relevant === null) {
    return "WHILE YOU WERE WAITING: this client's recorded knowledge moved, and the estate cannot "
      + "say whether any of it was something YOU read — there is no recorded read-set to compare "
      + "against. Treat it as unknown rather than as 'nothing changed'.";
  }
  return null;
}

/**
 * Does this drift spend one of the run's existing replans? PURE, and exported for the same reason
 * `knowledgeReadFailedV5` is.
 *
 * ONLY `relevant === true`. That is the estate saying a key THIS run recorded reading has moved,
 * which is the one case where the resumed segment is genuinely re-planning against a changed
 * basis. `relevant === null` is "the estate cannot tell" — 0230 answers null, never false, when
 * the observed version came from a trace rather than a recorded read-set — and an unreadable drift
 * is "we could not ask". Both are SURFACED to the model and both spend NOTHING: charging a bounded
 * budget for news the estate could not confirm would let an unreadable diagnostic exhaust a run,
 * which is the diagnostic deciding the accounting by a slower route.
 */
export function driftSpendsReplanV5(drift: Pick<WorkDriftV5, "status" | "relevant">): boolean {
  return drift.status === "ok" && drift.relevant === true;
}

// ---------------------------------------------------------------------------
// 4. THE SEGMENT — the egress dispatch, then a ToolLoopAgent, then the trace rows.
// ---------------------------------------------------------------------------

/**
 * THE EGRESS DISPATCH. Prepare the intent through the TASK-BOUND wrapper, then consume it in its
 * own committed transaction immediately before the model call. Byte-carried from v3/v4, whose
 * headers carry the full argument: the runtime chooses nothing, the DATABASE re-verifies the whole
 * intent, and a dispatch that could not be DECIDED is a refusal rather than an assumption of
 * consent.
 */
async function dispatchEgress(
  c: PgExec,
  taskId: string,
  runId: string,
): Promise<{ granted: boolean; authorizationId: string | null }> {
  const prepared = await c
    .query("select clara.prepare_work_egress_dispatch($1::uuid, $2::text) as v", [taskId, runId])
    .then((r) => (r.rows[0]?.v ?? null) as null | {
      verdict?: string; authorization_id?: string; firm_id?: string; client_id?: string;
      purpose?: string; event_seq?: string; event_type?: string;
    });
  if (prepared?.verdict !== "granted" || !prepared.authorization_id) {
    return { granted: false, authorizationId: null };
  }
  await c.query("begin");
  try {
    const consumed = await c
      .query("select clara.consume_egress_dispatch($1::uuid,$2::uuid,$3::uuid,$4::text,$5::bigint,$6::text,$7::text) as v", [
        prepared.firm_id,
        prepared.authorization_id,
        prepared.client_id,
        prepared.purpose,
        prepared.event_seq,
        prepared.event_type,
        null,
      ])
      .then((r) => (r.rows[0]?.v ?? null) as null | { verdict?: string });
    await c.query("commit");
    return { granted: consumed?.verdict === "granted", authorizationId: prepared.authorization_id };
  } catch (error) {
    await c.query("rollback").catch(() => {});
    throw error;
  }
}

export async function runWorkSegmentStepV5(
  taskId: string,
  work: LoadedWork,
  runId: string,
  segmentIndex: number,
  priorMessages: ModelMessage[],
  knowledgeVersion: string | null,
): Promise<SegmentOutcomeV5> {
  "use step";
  const ledger = newBudgetLedger();
  const budgets = CLARA_WORK_BUDGETS_V5;
  const ctx: WorkToolCtx = {
    firmId: work.firmId,
    clientId: work.clientId,
    createdBy: work.initiator,
    taskId,
    workId: work.workId,
    logicalOpId: work.logicalOpId,
    runId,
    basis: work.basis as JournalBasis,
  };
  const tools = buildClaraWorkToolsV5(ctx, ledger, budgets);
  const messages: ModelMessage[] =
    priorMessages.length > 0
      ? priorMessages
      : ([{ role: "user", content: workEnvelopeMessage(work) }] as unknown as ModelMessage[]);

  // v5's four-row block. `+0` is the drift row the BODY writes before this segment when a resume
  // preceded it; the three below are this step's own.
  const baseSeq = segmentTraceBase(segmentIndex);
  // Object.assign rather than an object spread, for the reason traceRow above states.
  const empty = (over: Partial<SegmentOutcomeV5>): SegmentOutcomeV5 =>
    Object.assign({
      parts: [] as ClaraWorkPartV5[], messages: [] as ModelMessage[], question: null,
      posted: null, terminal: null, requiredReadFailed: false, exhausted: null,
      egressRefused: false,
      budget: { toolCalls: 0, replans: 0, transientRetries: 0 },
      usageTokens: 0, finishReason: "unknown", text: "",
    } as SegmentOutcomeV5, over);

  // ---- THE DISPATCH, BEFORE ANY TOKEN IS SPENT ------------------------------------------
  const dispatchStarted = new Date().toISOString();
  let authorizationId: string | null = null;
  let granted = false;
  try {
    const verdict = await pools().withRuntime((c: PgExec) => dispatchEgress(c, taskId, runId));
    granted = verdict.granted;
    authorizationId = verdict.authorizationId;
  } catch {
    granted = false;
  }
  await pools().withRuntime((c: PgExec) =>
    traceSafely(c, traceRow(work.model, {
      taskId, runId, seq: baseSeq + 1, phase: "dispatch",
      capabilityId: "accounting_work.model_segment",
      authorizationId,
      startedAt: dispatchStarted, endedAt: new Date().toISOString(),
      outcome: granted ? "ok" : "refused",
      refusal: granted ? null : { reason: "egress_not_authorized" },
    })));
  if (!granted) {
    const refusal = egressRefusalPayload();
    const parts: ClaraWorkPartV5[] = [{
      type: "refusal",
      code: String(refusal.code),
      reason: String(refusal.reason),
      message: String(refusal.message),
    }];
    await writePartsV5(parts);
    return empty({
      parts,
      egressRefused: true,
      terminal: {
        kind: "refusal",
        code: String(refusal.code),
        reason: String(refusal.reason),
        message: String(refusal.message),
        terminal: true,
        recoverable: true,
      },
      finishReason: "egress_not_authorized",
    });
  }

  // ---- THE MODEL CALL --------------------------------------------------------------------
  const agent = new ToolLoopAgent({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: resolveModel(work.model) as any,
    instructions: `${CLARA_WORK_BUNDLE_V5.instructions.text}\n\n${CLARA_WORK_BUNDLE_V5.skills[0]!.text}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
    // THE TWO NEW READS ARE NOT STOP CONDITIONS, AND THAT IS THE POINT OF THEM. A run reads a
    // record IN ORDER to keep going — it looks the fact up, then records the entry or asks a
    // question. Stopping the loop on an inspection read would make the tool useless: the segment
    // would end with a read and no act, and the body would settle `no_effect` on a run that was
    // doing exactly what it was told to do.
    stopWhen: [
      isStepCount(budgets.modelCalls),
      hasToolCall(ASK_QUESTION_TOOL),
      hasToolCall(ANSWER_ACCRUAL_TERM_TOOL),
      hasToolCall(ASK_KNOWLEDGE_CONFLICT_TOOL),
      stoppedOnTerminalWorkTool,
    ],
  });

  const modelStarted = new Date().toISOString();
  let result;
  try {
    result = await agent.generate({ messages });
  } catch (error) {
    const classification = classifyWorkError(error);
    const parts: ClaraWorkPartV5[] = [
      { type: "refusal", code: classification.code, reason: classification.reason ?? undefined, message: classification.message },
    ];
    await writePartsV5(parts);
    await pools().withRuntime((c: PgExec) =>
      traceSafely(c, traceRow(work.model, {
        taskId, runId, seq: baseSeq + 2, phase: "model_call",
        capabilityId: "accounting_work.model_segment",
        authorizationId,
        startedAt: modelStarted, endedAt: new Date().toISOString(),
        outcome: "failed",
        refusal: { code: classification.code, reason: classification.reason, message: classification.message },
      })));
    return empty({
      parts,
      posted: ledger.posted,
      terminal: classification,
      requiredReadFailed: ledger.terminal?.kind === "required_read_failed",
      exhausted: ledger.exhausted,
      budget: { toolCalls: ledger.toolCalls, replans: ledger.replans, transientRetries: ledger.transientRetries },
      finishReason: "segment_error",
    });
  }

  const question = findQuestionCallV4(result.steps as never);
  const parts: ClaraWorkPartV5[] = [];
  const text = String(result.text ?? "").trim();
  if (text) parts.push({ type: "text", text });
  if (ledger.posted) {
    parts.push({
      type: "work_result",
      work_id: work.workId,
      client_id: work.clientId,
      entry_id: ledger.posted.entry_id,
      receipt_id: ledger.posted.receipt_id,
    });
  }
  let terminal: WorkErrorClass | null = null;
  if (ledger.terminal && (ledger.terminal.kind === "refusal" || ledger.terminal.kind === "conflict" || ledger.terminal.kind === "required_read_failed")) {
    terminal = ledger.terminal.detail as WorkErrorClass;
    parts.push({ type: "refusal", code: terminal.code, reason: terminal.reason ?? undefined, message: terminal.message });
  }
  await writePartsV5(parts);

  const usage = (result.totalUsage ?? {}) as { totalTokens?: number; inputTokens?: number; outputTokens?: number };
  const usageTokens = usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  const modelEnded = new Date().toISOString();

  // WRAPPED WHOLE, for the reason traceSafely is wrapped: the digest helper and the vocabulary
  // filter live in the same module the writer does, and a module that would not load must not be
  // able to fail a segment that has already posted.
  await pools().withRuntime(async (c: PgExec) => {
    try {
      const { traceDigest, observedRevisions } = await import("../lib/work-trace.mjs");
      const inputDigest = await traceDigest({ basis: work.basis, segment: segmentIndex, messages: messages.length });
      // `knowledge_version` is already in `OBSERVED_REVISION_KEYS`, so the closed vocabulary is
      // unmoved and the DATABASE refuses the same set it always did; what it records is which
      // watermark of the client's governed knowledge this run reasoned on. `basis_digest` stays
      // null — v3 and v4 recorded it as null and this cut is not the lane that computes it
      // (#654's own residual H-21).
      await traceSafely(c, traceRow(work.model, {
        taskId, runId, seq: baseSeq + 2, phase: "model_call",
        capabilityId: "accounting_work.model_segment",
        authorizationId,
        inputDigest,
        observed: observedRevisions({ knowledge_version: knowledgeVersion, basis_digest: null }),
        startedAt: modelStarted, endedAt: modelEnded,
        outcome: "ok",
      }));
      if (ledger.posted || terminal || question) {
        await traceSafely(c, traceRow(work.model, {
          taskId, runId, seq: baseSeq + 3, phase: "tool_call",
          // NAMED FROM THE SERVER-OWNED REGISTRY, never from the model's own tool name. The two
          // new reads do not appear here: this row records the segment's TERMINAL act — what it
          // posted, refused or asked — and an inspection read is never terminal.
          //
          // AND THEY LEAVE NO ROW OF THEIR OWN EITHER, WHICH THIS COMMENT USED TO GET WRONG (fix
          // round 1, review ADV-S-2). It said the durable record was "`clara.work_knowledge_reads`
          // plus the tool's own answer in the transcript". The relation holds the PRELOAD and
          // nothing else — `recordWorkKnowledgeRead` is called from `loadWorkKnowledgeStepV5` and
          // from nowhere else — and the segment's parts are `text` / `refusal` / status, so the
          // answer survives only in this run's own journal. Neither of the two alternatives is
          // free: a `work_knowledge_reads` row per inspection read would be READ BACK as the
          // run's read-set by `clara._work_knowledge_drift_core` (0230:812, `order by read_at
          // desc, seq desc limit 1`), narrowing the drift comparison to that one record's key;
          // and `clara.work_execution_traces` has NO free payload column by design (0195's layer
          // 1), so it can record THAT a read happened but never the reason the model gave. The
          // honest state is therefore written down rather than papered over, and the durable
          // per-read row is the fix round's ratification request.
          capabilityId: question
            ? "accounting_work.ask_question"
            : "accounting_work.record_journal_entry",
          authorizationId,
          startedAt: modelStarted, endedAt: modelEnded,
          outcome: ledger.posted ? "ok" : terminal ? "refused" : "skipped",
          refusal: terminal ? { code: terminal.code, reason: terminal.reason, message: terminal.message } : null,
          receiptId: ledger.posted ? ledger.posted.receipt_id : null,
        }));
      }
    } catch {
      /* a diagnostic row is not authority */
    }
  });

  return {
    parts,
    messages: (result.response?.messages ?? []) as ModelMessage[],
    question,
    posted: ledger.posted,
    terminal,
    requiredReadFailed: ledger.terminal?.kind === "required_read_failed",
    exhausted: ledger.exhausted,
    egressRefused: false,
    budget: { toolCalls: ledger.toolCalls, replans: ledger.replans, transientRetries: ledger.transientRetries },
    usageTokens,
    finishReason: String(result.finishReason ?? "unknown"),
    text,
  };
}

/** Write parts onto the run's durable writable. Never throws: a closed or unlockable stream is a
 *  display concern, and the Work's authority is the database row, not the stream. */
async function writePartsV5(parts: ReadonlyArray<ClaraWorkPartV5>): Promise<void> {
  if (parts.length === 0) return;
  try {
    const writer = getWritable<unknown>().getWriter();
    try {
      for (const part of parts) await writer.write(part);
    } finally {
      writer.releaseLock();
    }
  } catch {
    /* the stream is closed or not lockable — the durable row still carries the truth */
  }
}

// ---------------------------------------------------------------------------
// 5. SETTLE — v1's idempotent terminal write, plus the run's LAST trace row.
// ---------------------------------------------------------------------------

export async function settleWorkStepV5(
  taskId: string,
  runId: string,
  seq: number,
  args: SettleArgs,
): Promise<void> {
  "use step";
  const settledAt = new Date().toISOString();
  await pools().withRuntime(async (c: PgExec) => {
    // ONE TRANSACTION FOR THE SETTLE AND ITS TRACE ROW, with the trace write in a SAVEPOINT so a
    // refused diagnostic can never roll the settle back. v3's and v4's shape and their reason.
    await c.query("begin");
    try {
      await c.query("select clara.settle_work_run($1::uuid, $2::text, $3::text, $4::jsonb, $5::jsonb) as r", [
        taskId,
        args.outcome,
        args.errorCode,
        args.error == null ? null : JSON.stringify(args.error),
        args.result == null ? null : JSON.stringify(args.result),
      ]);
      const outcome =
        args.outcome === "completed" ? "ok"
          : args.outcome === "refused" ? "refused"
            : args.outcome === "cancelled" ? "cancelled"
              : args.outcome === "expired" ? "cancelled"
                : "failed";
      await traceSafelyInTransaction(c, traceRow(null, {
        taskId, runId, seq, phase: "settle",
        capabilityId: "accounting_work.settle",
        outcome,
        refusal: args.error ?? null,
        receiptId: (args.result as { receipt_id?: string } | null)?.receipt_id ?? null,
        // BOTH INSTANTS, FROM ONE CLOCK — v3's measured fix: a row that supplied only an end
        // instant is compared against the DATABASE's now() for its start, and a settle whose JS
        // clock trails the server's by a millisecond then violates
        // ck_work_execution_traces_ended and the row is silently dropped.
        startedAt: settledAt,
        endedAt: settledAt,
      }));
      await c.query("commit");
    } catch (error) {
      await c.query("rollback").catch(() => {});
      throw error;
    }
  });
}

/** The `result` jsonb a COMPLETED v5 Work carries: the effect, the recorded budget spend, what
 *  became of any fixed-asset particulars, and WHAT THIS RUN READ.
 *
 *  THE KNOWLEDGE BLOCK IS NEW IN v5 AND IT IS ADDITIVE. #658's AC5 asks what basis a Work acted
 *  on; the read-set relation answers it in full, and this is the pointer to it — the version, the
 *  window, how much was shown, whether the view was bounded, and the seq that addresses the row.
 *  It is a summary, never a copy: the records themselves live in one place. */
export function completedResultV5(
  posted: PostedEffect,
  confirmed: boolean,
  budget: SegmentOutcomeV5["budget"],
  segments: number,
  tokens: number,
  particulars: Record<string, unknown> | null,
  knowledge: WorkKnowledgeV5 | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    entry_id: posted.entry_id,
    receipt_id: posted.receipt_id,
    revision_token: posted.revision_token,
    logical_op_id: posted.logical_op_id,
    replayed: posted.replayed,
    confirmed,
    bundle_digest: CLARA_WORK_BUNDLE_V5_DIGEST,
    budget: { segments, toolCalls: budget.toolCalls, replans: budget.replans, transientRetries: budget.transientRetries, tokens },
  };
  // An ABSENT key rather than a null one: a Work that acquired no fixed asset has nothing to say
  // about particulars, and `"fixed_asset_particulars": null` on every ordinary journal Work would
  // read as "they are missing" on the one surface that renders this object.
  if (particulars !== null) out.fixed_asset_particulars = particulars;
  if (knowledge !== null) {
    out.knowledge = {
      status: knowledge.face_status,
      knowledge_version: knowledge.knowledge_version,
      as_of: knowledge.as_of,
      records_shown: knowledge.records_shown,
      truncated: knowledge.truncated,
      read_seq: knowledge.read_seq,
      recorded: knowledge.recorded,
    };
  }
  return out;
}

export { knowledgeReadFailedPayload };
