// @frozen
//
// FROZEN — part of the closePrep_v1 closure (see closePrep.v1.infra.ts for what this class is).
//
// THIS FILE (reads) — the shared call helper plus the SIX read wrappers of the twelve 0138
// minted. Split from the write half only for the repo's 500-line module budget; the two halves
// are one tool set, assembled in closePrep.v1.tools.ts.
//
// WHY THE READS ARE WRAPPERS AND NOT A PLAIN GRANT, restated because it shapes every call here:
// 0138's own note (:1291-1294) is that a firm-scoped grant on get_close_plan would let a
// client-pinned lane read EVERY client's plan in the firm. So each read goes through
// _close_wake_ctx, which re-derives the subject's client and refuses anything the credential is
// not pinned to. That is why a read here costs an op key and a rationale: it is a receipted act,
// not a free look.

import { tool } from "ai";
import { z } from "zod";
import { CLOSE_PROSE_MAX, READ_TOOLS, closeModelIdentity } from "./closePrep.v1.prompt.js";
import { closeScoped, closeOpKey, type CloseTaskContext, type PgExec } from "./closePrep.v1.infra.js";

/**
 * DID THE DATABASE JUDGE THIS REQUEST, or did the call never reach it?
 *
 * Only the estate's own typed refusal codes count as a verdict. That is a POSITIVE test on the
 * one signal that actually means "the DB considered this and said no" — and everything else falls
 * to the other branch, which is the fail-safe direction here: a permission misconfiguration, a
 * pools injection failure, assertTailBinding's throw, a driver-level ECONNREFUSED. None of those
 * is the model's fault, and treating an unrecognised error as "the DB spoke" would blame it.
 */
function isDbVerdict(e: unknown): boolean {
  const code = (e as { code?: unknown })?.code;
  return typeof code === "string" && /^CLR\d{2}$/.test(code);
}

/** One oracle-safe refusal for every authority/tenant fault, identical regardless of whether the
 *  subject exists — a refusal that varies with existence is an existence oracle.
 *
 *  IT ALSO RECORDS WHO IS AT FAULT, which is why it takes the record (S9, independent review).
 *  See CloseRunRecord.infraFaults. */
export function closeRefusal(rec: CloseRunRecord, e: unknown): { error: string } {
  const code = (e as { code?: string })?.code;
  if (!isDbVerdict(e)) {
    // 裁-44 / FIND-9 — THE NON-VERDICT BRANCH IS REDACTED TOO. It used to hand the raw driver
    // message back to the model, which made this function's own oracle-safety claim false for
    // exactly the errors nobody audits. The model can act on none of it — the fault is ours — so
    // it gets a fixed sentence and the real message goes to the runtime log.
    rec.infraFaults += 1;
    console.warn(`[closePrep_v1] tool call did not reach the database: ${e instanceof Error ? e.message : String(e)}`);
    return { error: "the act did not go through: something on our side failed before the database saw it. Do not retry it." };
  }
  if (code === "CLR03" || code === "CLR04" || code === "CLR10" || code === "CLR11") {
    return { error: `refused (${code}): this act is not available to this run on this client.` };
  }
  return { error: `refused (${code}): the database declined this act.` };
}

/** The per-run record.
 *
 *  `acts` counts only replies the DATABASE marked admitted — never the model's account of what it
 *  did (constraint 2 in its narrowest form).
 *
 *  `infraFaults` counts tool calls that NEVER REACHED the database, and it exists to stop this
 *  lane blaming the model for its own bugs (S9, independent review). Every zero-read run used to
 *  settle `error_code = 'model_error'`, but the causes that land there are not all the model:
 *  pools not injected, a credential mint failure, a CLR-less driver fault, and now
 *  assertTailBinding's throw — a code defect in a frozen body, recorded on a durable audit field
 *  as the model's fault. Since that guard fires on a STATIC property, one drifted call site would
 *  have settled EVERY close task 'model_error' until somebody noticed. `internal` exists in the
 *  agent_tasks roster (0006:153-154) for precisely this, and bankAgent.v1.ts's own comment already
 *  calls it "the honest answer to 'we do not know'". A run where the model simply never called a
 *  tool still settles 'model_error', which stays correct. */
export type CloseRunRecord = {
  reads: number;
  acts: number;
  infraFaults: number;
  closeRunId: string | null;
  /** 裁-44 / FOLD-3 — writes the model ATTEMPTED, admitted or not (a gate refusal counts). */
  writeAttempts: number;
  /** 裁-44 / FOLD-3 — writes REFUSED, locally or by the database. */
  refusals: number;
  /** 裁-44 / FOLD-2 — the non-'running' status a write gate actually SAW, or null. */
  cancelledAs: string | null;
  /** 裁-44 R4 / FOLD-21 — every tool call this attempt made. ONE named counter, not a sum. */
  toolCalls: number;
  /** 裁-44 R4 / FOLD-21 — a stream failure that landed after tool activity. */
  streamFault: boolean;
};

export function newCloseRunRecord(): CloseRunRecord {
  return { reads: 0, acts: 0, infraFaults: 0, closeRunId: null, writeAttempts: 0, refusals: 0, cancelledAs: null, toolCalls: 0, streamFault: false };
}

/**
 * Call one 0138 wrapper. `verb` is the WRAPPER'S OWN NAME and `subjectId` its declared subject —
 * both feed closeOpKey, which must reproduce the database's own derivation exactly or
 * _close_wake_ctx refuses with CLR10 'op_key_not_derived'. Passing the wrong subject here is
 * therefore a LOUD failure, not a silent mis-scope: the DB checks our arithmetic on every call.
 *
 * WHAT NAMED NOTATION BOUGHT, AND WHAT IT DID NOT — stated here because an overstated safety
 * claim in a frozen file is what makes the next author careless (independent review).
 *   CLOSED: "which DB parameter is this?" A wrong or misplaced NAME is a loud parse error, every
 *     call site is self-documenting, and G1B-I3 machine-checks the names against the catalog in
 *     order. The four silent prose-transposition cases can no longer be written by NAME.
 *   OPEN:  "which VALUE is bound to this placeholder?" `p_narrative => $3` is right only while $3
 *     holds the narrative. Write `p_narrative => $4, p_rationale => $3` and case A is back, with
 *     the names looking perfect.
 *
 * AND ON THIS LANE THAT MAPPING IS SPLIT ACROSS TWO FILES, which is the part worth guarding: each
 * call site supplies $1..$n through `argsBefore`, and THIS function appends the tail three. Every
 * site's tail placeholder numbers therefore encode an assumption about that append order which is
 * stated nowhere. Add one argument to an argsBefore array without bumping the tail numbers and the
 * rationale lands in the new parameter's slot — same-typed, non-blank, silent.
 *
 * THE GUARD BELOW BOUNDS EXACTLY THAT. It re-derives the expected placeholder count from the
 * values actually being sent and checks the SQL agrees, and it checks the tail three are bound to
 * the last three placeholders BY NAME. It cannot catch a swap WITHIN argsBefore (the call site
 * owns that, and G1B-E2a is what exercises it) — but it does catch the drift class, which is the
 * one that arrives later, from an edit that looks local and safe.
 *
 * A THROW IS THE RIGHT REFUSAL: it happens before any credential is minted (closeScoped is where
 * the mint lives, and it runs after this), and the caller turns it into a named refusal.
 *
 * WHAT THIS GUARD IS, PRECISELY (N10): it validates a STATIC property — `sql` is a string literal
 * and `values.length` is fixed by a fixed-length array at each site, so nothing here varies
 * between calls. It can therefore only ever fire on the FIRST call of a broken site, and on every
 * call after, identically. That makes it defence-in-depth, not a wall. THE INSTRUMENT THAT
 * ACTUALLY CATCHES THE DRIFT CLASS AT THE MOMENT IT IS INTRODUCED IS CELL G1B-I6 — if this header
 * is ever trimmed, keep that sentence and drop the rest.
 */
export async function callCloseVerb(
  ctx: CloseTaskContext,
  verb: string,
  subjectId: string,
  sql: string,
  argsBefore: unknown[],
  rationale: string,
  modelId: string,
): Promise<unknown> {
  const values = [...argsBefore, rationale, JSON.stringify(closeModelIdentity(modelId)), closeOpKey(ctx.taskId, verb, subjectId)];
  assertTailBinding(verb, sql, values.length);
  return closeScoped(ctx, (c: PgExec) => c.query(sql, values).then((r) => r.rows[0]?.r ?? null));
}

/** The three names this helper always appends, in the order it appends them. Every one of 0138's
 *  twelve wrappers ends with exactly this triple — verified against all twelve signatures. */
const TAIL = ["p_rationale", "p_model", "p_op_key"] as const;

export function assertTailBinding(verb: string, sql: string, valueCount: number): void {
  const placeholders = new Set([...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
  if (placeholders.size !== valueCount || Math.max(...placeholders) !== valueCount) {
    throw new Error(
      `${verb}: SQL binds ${placeholders.size} distinct placeholders (max $${Math.max(...placeholders)}) but ${valueCount} values are being sent — a call site's argsBefore and its tail numbering have drifted apart`,
    );
  }
  TAIL.forEach((name, k) => {
    const n = valueCount - TAIL.length + 1 + k;
    if (!new RegExp(`\\b${name}\\s*=>\\s*\\$${n}\\b`).test(sql)) {
      throw new Error(`${verb}: expected \`${name} => $${n}\` — callCloseVerb appends ${TAIL.join(", ")} as the last three values, and this SQL does not bind them there`);
    }
  });
}

/** A close wrapper's jsonb reply, read POSITIVELY for admission.
 *
 *  THE KEY IS `status` AND THE ADMITTED VALUE IS 'acted' — read off 0138's own agent cores
 *  (e.g. `_agent_begin_close_core`, 0138:2100 / :2107), not guessed. An earlier draft of this
 *  function looked for `outcome === 'admitted'`, which is the BANK lane's receipt vocabulary and
 *  appears nowhere in a close reply: it would have counted zero acts on every successful run, so
 *  every proposing pass would have settled as though it had found nothing to do. Caught by
 *  reading the migration, not by a test — which is exactly why the cell below pins it.
 *
 *  Review law 2 holds: this counts what the reply SAYS, never the absence of an error. A call
 *  that threw never reaches here at all (the caller turns it into a refusal object), and a
 *  refusal reply says 'refused' in the same field. */
const CLOSE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isCloseUuid = (v: unknown): boolean => typeof v === "string" && CLOSE_UUID_RE.test(v.toLowerCase());

/**
 * 裁-44 R4 / FOLD-22(a) — THREE ANSWERS ON THIS LANE TOO, and this one was the looser of the pair.
 *
 * `status === 'acted'` ALONE counted an act. 0138's agent cores return `{status, receipt_id,
 * result}` on the acted path (`_agent_close_read_core` at :1852, `_agent_begin_close_core` at
 * :2107), so a bare `{status:'acted'}` is not that shape — and it was being counted as a read or
 * an act, which could carry a run to `nothing_due` and a GREEN settle with no receipt behind it.
 * Incomplete positive evidence is not positive evidence (review law 2).
 *
 * A purported success that cannot be verified is OURS, not the model's: `malformed` is an
 * infrastructure fault. `wake_begin_close` additionally carries `result.close_run_id` — the run id
 * the whole rest of the pass names — so that one is checked where it is claimed.
 */
export type CloseReplyVerdict = "acted" | "refused" | "malformed";

export type CloseReplyOpts = { needsCloseRunId?: boolean; resultKind?: CloseResultKind };

export function classifyCloseReply(reply: unknown, opts: CloseReplyOpts = {}): CloseReplyVerdict {
  const r = reply as { status?: unknown; receipt_id?: unknown; result?: unknown } | null;
  if (r === null || typeof r !== "object") return "refused";
  if (r.status !== "acted") return "refused";
  if (!isCloseUuid(r.receipt_id)) return "malformed";
  if (r.result === null || typeof r.result !== "object") return "malformed";
  // 裁-44 R5 / FOLD-25 — `typeof [] === "object"` IS TRUE, and that was the hole. A structurally
  // drifted write or singular read carrying `result: []` passed as an act: `acts`/`reads` moved,
  // the run took `nothing_due`, and a receipt vouched for the wrong contract. The kind is the
  // VERB'S, in both directions — see closeResultKind's own note for why "arrays are malformed"
  // would have INFRA-faulted the lane's opening read on every clean book.
  if (Array.isArray(r.result) !== ((opts.resultKind ?? "record") === "array")) return "malformed";
  if (opts.needsCloseRunId && !isCloseUuid((r.result as { close_run_id?: unknown }).close_run_id)) return "malformed";
  return "acted";
}

export function countIfAdmitted(rec: CloseRunRecord, reply: unknown, opts: CloseReplyOpts = {}): CloseReplyVerdict {
  const verdict = classifyCloseReply(reply, opts);
  if (verdict === "acted") rec.acts += 1;
  else if (verdict === "refused") rec.refusals += 1;
  else {
    rec.infraFaults += 1;
    console.warn("[closePrep_v1] a wrapper reply claimed 'acted' but carries no verifiable receipt");
  }
  return verdict;
}

const RATIONALE = z
  .string()
  .min(1)
  .max(CLOSE_PROSE_MAX)
  .describe("Why you are making this call, in one plain sentence.");

/** The shared one-at-a-time queue (裁-44 R4 / FOLD-20b). ONE chain for the reads and the writes
 *  together: a read and a write interleaving is the same hazard as two reads, and two independent
 *  queues would serialise each half against itself while leaving the halves free to race. */
export type CloseSerialiser = <T>(body: () => Promise<T>) => Promise<T>;

/** Each body links onto the previous one's SETTLEMENT, both branches — a rejection must not break
 *  the chain, or one thrown write would un-serialise the rest of the pass. */
export function newCloseSerialiser(): CloseSerialiser {
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(body: () => Promise<T>): Promise<T> => {
    const next = chain.then(body, body);
    chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
}

/**
 * 裁-44 R5 / FOLD-23 — SERIALISATION IS A BOUNDARY, NOT A HABIT, AND THIS LANE IS WHY.
 *
 * FOLD-20(b) applied the mutex AT EVERY CALL SITE. Ten of this lane's twelve tools went through it;
 * `begin_close` and `propose_close` called `write()` directly, so two write executors could overlap
 * each other and the queued reads, mutating one record — the read counter, the act counter,
 * `closeRunId` — concurrently. Both could pass `guardWrite`, mint a live task-bound credential and
 * perform a durable act inside the window the other was still in.
 *
 * THE FIX IS THE SHAPE. The tool map is assembled plainly and wrapped in ONE place, so an
 * unserialised tool is not expressible and a thirteenth verb is serialised by existing. A tool with
 * no `execute` throws rather than passing through unguarded (absence is not evidence).
 *
 * NEVER WRAP TWICE: a serialised body that itself calls `serial` waits on a chain it is already the
 * head of — a deadlock, not a double lock.
 *
 * DUPLICATED FROM bankAgent.v1.pack.ts RATHER THAN SHARED, for the reason every duplicate in these
 * two closures carries: a frozen closure may not import a mutable module, and importing the bank
 * closure's copy would splice two frozen bodies into one hash.
 */
const SERIALISED_EXECUTES = new WeakSet<object>();

/** Is this THE wrapped function? An identity test, not a spelling one (review law 3): a hand-written
 *  execute that merely mentions `serial` satisfies a source grep and cannot satisfy this. */
export function isSerialisedCloseExecute(fn: unknown): boolean {
  return typeof fn === "function" && SERIALISED_EXECUTES.has(fn as object);
}

export function serialiseCloseTools<T extends Record<string, unknown>>(tools: T, serial: CloseSerialiser): T {
  const out: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(tools)) {
    const inner = (spec as { execute?: unknown } | null)?.execute;
    if (typeof inner !== "function") {
      throw new Error(`tool ${name} has no execute to serialise — every tool in this closure runs one at a time, and a tool this boundary cannot wrap must not ship`);
    }
    const call = inner as (...args: unknown[]) => unknown;
    const wrapped = (...args: unknown[]): Promise<unknown> => serial(async () => call(...args));
    SERIALISED_EXECUTES.add(wrapped);
    out[name] = { ...(spec as Record<string, unknown>), execute: wrapped };
  }
  return out as T;
}

/** THE ONE COLLECTION READ AMONG THE TWELVE — 裁-44 R5 / FOLD-25.
 *
 *  `wake_list_fiscal_years` returns `coalesce(jsonb_agg(...), '[]'::jsonb)` (0138:1012-1019), so an
 *  ARRAY is its lawful reply and `[]` is what a client with no fiscal years actually gets — the
 *  lane's very first call on a fresh book, measured on a rig, not reasoned about. Every other
 *  wrapper, read or write, returns a jsonb OBJECT: the five remaining reads all build one
 *  (`_close_readiness_core` :983, `_verify_close_core` :922, `get_close_plan` 0064:242,
 *  `_close_dry_run_core` 0104:519, and `wake_snapshot_state`'s own jsonb_build_object 0138:1953),
 *  and every write core's `result` is read back with `->>` field access.
 *
 *  SO THE TEST IS VERB-AWARE IN BOTH DIRECTIONS, and that is the correction the as-built lane
 *  measured: "arrays are malformed" would INFRA-fault every run's opening read, and "objects only"
 *  applied to the list read would do the same. A collection verb REQUIRES an array; a singular one
 *  REQUIRES a non-null, non-array record. */
export type CloseResultKind = "array" | "record";

const COLLECTION_READS = new Set<string>(["wake_list_fiscal_years"]);

export function closeResultKind(verb: string): CloseResultKind {
  return COLLECTION_READS.has(verb) ? "array" : "record";
}

export function buildCloseReadTools(ctx: CloseTaskContext, modelId: string, rec: CloseRunRecord) {
  /** A read counts ONLY when the database says it acted.
   *
   *  THIS IS THE COUNTER THAT DECIDES WHETHER THE RUN SETTLED HONESTLY, which is why it gets the
   *  same treatment as `acts` rather than a looser one. An earlier draft incremented whenever the
   *  call did not THROW — but a close read's refusals do not throw: 0138:1799-1800 says so in
   *  words ("never raise: the transaction COMMITS so the reason is durable"), and
   *  `_close_read_gate` returns {status:'refused', …} (0138:1839) exactly like every write core.
   *  So a run whose every read was refused would have counted six reads, taken the `nothing_due`
   *  branch, and settled the task COMPLETED — writing twelve durable refused receipts while
   *  reporting a green night. That is the precise inversion of review law 2, in the one place the
   *  lane's own honesty depends on it.
   *
   *  The acted shape is `_agent_close_read_core`'s own: {status:'acted', receipt_id, result}
   *  (0138:1852). Same key, same value, same test as the write half — one vocabulary. */
  const read = async (verb: string, subject: string, sql: string, args: unknown[], rationale: string) => {
    rec.toolCalls += 1;
    try {
      const out = await callCloseVerb(ctx, verb, subject, sql, args, rationale, modelId);
      // 裁-44 R4 / FOLD-22(a) — a READ counts only on the DOCUMENTED acted shape. `status:'acted'`
      // alone used to be enough, so a reply with no receipt could carry a run to `nothing_due` and
      // a green settle. A purported success we cannot verify is an infrastructure fault.
      // 裁-44 R5 / FOLD-25 — and the RESULT'S OWN KIND is this verb's, never "any object".
      const verdict = classifyCloseReply(out, { resultKind: closeResultKind(verb) });
      if (verdict === "acted") rec.reads += 1;
      else if (verdict === "malformed") {
        rec.infraFaults += 1;
        console.warn(`[closePrep_v1] ${verb} reply claimed 'acted' but carries no verifiable receipt`);
        return { error: "the read did not go through: the database's reply could not be verified as this call's own receipt. Stop." };
      }
      return out;
    } catch (e) {
      return closeRefusal(rec, e);
    }
  };

  return {
    [READ_TOOLS.LIST_FY]: tool({
      description: "List this client's fiscal years: which are open, reopened or closed, and when each ends. Start here.",
      inputSchema: z.object({ rationale: RATIONALE }),
      execute: ({ rationale }: { rationale: string }) => read(
          "wake_list_fiscal_years",
          ctx.clientId,
          "select clara.wake_list_fiscal_years(p_client => $1, p_rationale => $2, p_model => $3::jsonb, p_op_key => $4) as r",
          [ctx.clientId],
          rationale,
        ),
    }),

    [READ_TOOLS.CLOSE_PLAN]: tool({
      description: "Read the close plan for one fiscal year — the ordered steps a close of this year involves.",
      inputSchema: z.object({ fiscal_year_id: z.string().uuid(), rationale: RATIONALE }),
      execute: ({ fiscal_year_id, rationale }: { fiscal_year_id: string; rationale: string }) => read(
          "wake_get_close_plan",
          fiscal_year_id,
          "select clara.wake_get_close_plan(p_fiscal_year_id => $1, p_rationale => $2, p_model => $3::jsonb, p_op_key => $4) as r",
          [fiscal_year_id],
          rationale,
        ),
    }),

    [READ_TOOLS.READINESS]: tool({
      description: "Read whether this fiscal year is ready to close, and what is blocking it if not. Blockers are facts; read them before acting.",
      inputSchema: z.object({ fiscal_year_id: z.string().uuid(), rationale: RATIONALE }),
      execute: ({ fiscal_year_id, rationale }: { fiscal_year_id: string; rationale: string }) => read(
          "wake_get_close_readiness",
          fiscal_year_id,
          // TWO ADJACENT UUIDs — transposition case B. Named notation closes ONE HALF of that
          // hazard and it is worth being exact about which: a wrong or misplaced NAME is now a
          // loud parse error rather than a silent mis-scope, and G1B-I3 machine-checks the names
          // against the catalog in order. What it does NOT close is the placeholder-to-VALUE
          // mapping: `p_client => $1` is correct only while $1 holds the client id. See
          // callCloseVerb's own header for the residual, and for the guard that bounds it.
          "select clara.wake_get_close_readiness(p_client => $1, p_fy => $2, p_rationale => $3, p_model => $4::jsonb, p_op_key => $5) as r",
          [ctx.clientId, fiscal_year_id],
          rationale,
        ),
    }),

    [READ_TOOLS.DRY_RUN]: tool({
      description: "Test close readiness WITHOUT committing to anything — use this to check a shape before you act on it.",
      inputSchema: z.object({ fiscal_year_id: z.string().uuid(), rationale: RATIONALE }),
      execute: ({ fiscal_year_id, rationale }: { fiscal_year_id: string; rationale: string }) => read(
          "wake_dry_run_close_readiness",
          fiscal_year_id,
          "select clara.wake_dry_run_close_readiness(p_client => $1, p_fy => $2, p_rationale => $3, p_model => $4::jsonb, p_op_key => $5) as r",
          [ctx.clientId, fiscal_year_id],
          rationale,
        ),
    }),

    [READ_TOOLS.VERIFY]: tool({
      description: "Verify an existing close receipt — what it covers and whether it still holds.",
      inputSchema: z.object({ close_receipt_id: z.string().uuid(), rationale: RATIONALE }),
      execute: ({ close_receipt_id, rationale }: { close_receipt_id: string; rationale: string }) => read(
          "wake_verify_close",
          close_receipt_id,
          "select clara.wake_verify_close(p_receipt => $1, p_rationale => $2, p_model => $3::jsonb, p_op_key => $4) as r",
          [close_receipt_id],
          rationale,
        ),
    }),

    [READ_TOOLS.SNAPSHOT_STATE]: tool({
      description: "Read the state of one period snapshot.",
      inputSchema: z.object({ snapshot_id: z.string().uuid(), rationale: RATIONALE }),
      execute: ({ snapshot_id, rationale }: { snapshot_id: string; rationale: string }) => read(
          "wake_snapshot_state",
          snapshot_id,
          "select clara.wake_snapshot_state(p_snapshot => $1, p_rationale => $2, p_model => $3::jsonb, p_op_key => $4) as r",
          [snapshot_id],
          rationale,
        ),
    }),
  };
}
