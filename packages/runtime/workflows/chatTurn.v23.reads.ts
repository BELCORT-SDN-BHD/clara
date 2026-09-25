// @frozen
//
// FROZEN — part of the chatTurn_v23 closure. THE THREE AGENT-LANE READS OF #1136.
//
// A NEW frozen closure beside byte-untouched chatTurn_v1..v22 (docs/ARCHITECTURE.md §10,
// #workflow-versioning-and-rollback: a behavioural change ships as a new _vN export, never an
// in-place edit — registry.ts repoints `chatTurn:` at v23).
//
// WHY THESE THREE EXIST NOW AND NOT AT THE LAST CUT. `chatTurn.v22`'s own roster cell asserts
// `read_payroll_posting_state`, `read_payroll_settlement_state` and `read_agreement_terms` are
// absent BY NAME, "and that is a ruling": at that cut every door behind them was granted to
// `clara_authenticated` alone, and neither pooled chat credential carries JWT claims, so a tool
// over one could only ever answer a grant refusal — which is not a capability. The riders sweep
// wave built the machine-lane halves in `0352_agent_read_twins_payroll_agreement.sql` (hosted
// 2026-09-25), so the doors are reachable and the ruling is unwound here.
//
// ALL THREE ARE READS. Each runs inside `readScoped`, which mints a plain `interactive`
// credential on behalf of the initiating human and runs it on the `clara_agent_ro` read pool —
// exactly the one wake kind 0352 allowlisted for both new doors. None of them mints a
// `work_accepted`, asks a `work_question` or writes anything at all.
//
// THE PART KIND IS `freeform_result`, which is already declared and already emittable
// (`chatTurn.v16.prompt.ts`), so this cut adds NO wire kind and owes NO parts-parity entry — a
// measurement `check-parts-parity.mjs` re-takes on every run rather than a claim this file makes.

import { z } from "zod";
import { readScoped, type PgExec, type ToolCtx } from "./chatTurn.v15.infra.js";
import {
  governedRefusalV23,
  internalFaultV23,
  notPermittedV23,
  requireClientPinV23,
  type ToolRefusalV23,
} from "./chatTurn.v23.refusals.js";

/** The PAGE SIZE of the review-queue scan. #1136's contract writes 200, and the door clamps any
 *  request to `least(greatest(coalesce(p_limit,50),1),500)`. It is a page, NOT a ceiling: the
 *  door pages, and `findBlockedRow` follows the cursor. */
export const AGENT_QUEUE_LIMIT = 200;

/** What `findBlockedRow` returns when it reached its ceiling: neither a row nor an absence. */
export const QUEUE_SCAN_INCOMPLETE = "queue_scan_incomplete" as const;

/** The sentence for it. A person can still answer the question themselves, so it says how. */
export const QUEUE_SCAN_INCOMPLETE_MESSAGE =
  "This client's review queue is longer than I can read inside one answer, so I cannot say whether "
  + "that document is waiting on anything. Open Needs you and filter to this client.";

/** HOW MANY PAGES THE SCAN WILL WALK before it declines to conclude anything. Paging cannot be
 *  unbounded inside one turn; reaching this is "I could not see the whole queue", which is a
 *  different statement from "there is no block", and this module says the first rather than
 *  implying the second. */
export const AGENT_QUEUE_MAX_PAGES = 25;

/**
 * THE CODE THIS LANE'S OWN REFUSALS CARRY.
 *
 * Three conditions in this cut are not a door's refusal at all — `payroll_not_read`,
 * `not_read_yet` and `not_a_tenancy` — and each is a refusal a SURFACE MAY RENDER, which is
 * exactly what `CLR10` has meant since migration `0335` moved the never-shown refusals to `CLR44`
 * (`waveS-lane02-ticket1114.md` § Successor contract). `CLR11` is NOT available for them: in this
 * very cut it is the code both tenancy reads and the settlement read map to their own
 * `not_found` / `client_not_found` sentences, so a surface branching on the code would read "the
 * reading has not finished" as "not in your firm".
 */
export const LANE_REFUSAL_CODE = "CLR10";

/**
 * `clara.get_document_extract`'s third argument, and it is NULL DELIBERATELY.
 *
 * THE ARGUMENT IS A CHARACTER BUDGET, NOT A ROW LIMIT. The door's own body is
 * `v_budget := least(greatest(coalesce(p_max_chars,20000),0),100000)`, spent in extraction-uuid
 * order over the CONCATENATED envelopes and regions — so a small number does not "return fewer
 * things", it STARVES whichever envelope happens to sort last. #1136's contract writes 200 and
 * calls the argument `p_limit`, which is the queue read's row limit two lines above it; the
 * signature on `clara_c04` is `p_max_chars integer DEFAULT 20000`.
 *
 * MEASURED on `clara_c04` for a real filed agreement: at 200 the envelope lengths are
 * `agreement_text_facts 0, agreement_vision_facts 198, ocr 2`; at the door's own default they are
 * `4814, 898, 2`. At 200 this read therefore answered `ok: true` with the terms envelope empty,
 * while `SYSTEM_PROMPT_V23` tells the model to quote the eleven recorded terms as the page printed
 * them — so the model either reported nothing was recorded or composed.
 *
 * NULL rather than a literal 20000: the budget is the DOOR'S to choose, and a literal here would
 * silently stop tracking it.
 */
export const AGREEMENT_EXTRACT_MAX_CHARS: number | null = null;

/** One row of `clara.wake_list_review_queue`'s answer, as much of it as these three reads use. */
export type AgentQueueRow = {
  row_kind?: unknown;
  document_id?: unknown;
  question_text?: unknown;
  entry_id?: unknown;
};

/** The one blocked row of a PAGE, or null. The row kind is the caller's: the two blocks are
 *  different lanes and a tool must not report one as the other. */
function blockedRow(rows: readonly AgentQueueRow[], rowKind: string, documentId: string): AgentQueueRow | null {
  for (const row of rows) {
    if (String(row.row_kind ?? "") !== rowKind) continue;
    if (String(row.document_id ?? "") !== documentId) continue;
    return row;
  }
  return null;
}

/**
 * THE ONE BLOCKED ROW THIS DOCUMENT HAS, ACROSS THE WHOLE QUEUE, or null.
 *
 * THE DOOR PAGES, AND THE FIRST CUT DID NOT. `clara.wake_list_review_queue` takes a cursor and
 * returns a `next_cursor`; its core clamps the limit rather than refusing it. Reading one page of
 * 200 and concluding an absence meant a busy Needs-you queue could hide a blocked payroll summary
 * or a blocked agreement, and BOTH callers read that absence as good news — `posted` for the
 * payroll summary, `read` with the gate's sentence dropped for the agreement.
 *
 * THE TERMINATION IS THE SHORT PAGE, not the null cursor: the core builds `next_cursor` from the
 * last row of the page it just returned, so it is non-null whenever the page had any rows,
 * including on the last one. Driven on `clara_c04` before this was written: a client with three
 * queue rows answers one row per page at limit 1, and the fourth page is empty.
 *
 * THE DOOR IS SPELLED HERE, LITERALLY, rather than interpolated from a constant: a source pin that
 * reads an identifier proves nothing about the statement that ships, and this file is the one a
 * reviewer greps for the verb it calls.
 */
async function findBlockedRow(
  c: PgExec,
  clientId: string,
  rowKind: string,
  documentId: string,
): Promise<AgentQueueRow | null | typeof QUEUE_SCAN_INCOMPLETE> {
  let cursor: string | null = null;
  for (let page = 0; page < AGENT_QUEUE_MAX_PAGES; page += 1) {
    const r = await c.query(
      "select clara.wake_list_review_queue($1::jsonb, $2::jsonb, $3::int) as q",
      [JSON.stringify({ client_id: clientId }), cursor, AGENT_QUEUE_LIMIT],
    );
    const answer = (r.rows[0]?.q ?? null) as { rows?: unknown; next_cursor?: unknown } | null;
    const rows = Array.isArray(answer?.rows) ? (answer?.rows as AgentQueueRow[]) : [];
    const hit = blockedRow(rows, rowKind, documentId);
    if (hit !== null) return hit;
    if (rows.length < AGENT_QUEUE_LIMIT) return null;
    const next = answer?.next_cursor ?? null;
    if (next === null) return null;
    cursor = JSON.stringify(next);
  }
  // NOT an absence, and NOT a governed refusal: the database refused nothing, this read simply
  // could not see the whole queue. Saying "posted" here would be a statement nobody measured.
  return QUEUE_SCAN_INCOMPLETE;
}

/**
 * WHETHER A REFUSAL IS THE QUEUE READ'S TENANT WALL — KEYED ON THE SQLSTATE, and that is a
 * MEASUREMENT rather than a preference.
 *
 * `clara._list_review_queue_core` raises it as `raise exception 'queue scope is malformed' using
 * errcode='CLR10'` with **no `detail`** (read out of `pg_proc` on `clara_c04`, and the same in
 * `0352_agent_read_twins_payroll_agreement.sql` and `0011_daily_loop.sql`). `authoringRefusal`
 * derives its token from `detail.reason` alone, so a map keyed on the token could NEVER fire and
 * the person was handed the door's internal wording instead of this cut's sentence. The token is
 * kept beside the code so a later door that DOES type its detail still lands here.
 *
 * `CLR10` out of these two reads can be nothing else: the only other CLR10 arm of that core is the
 * malformed CURSOR, and both callers pass a cursor this module built.
 */
export function isQueueScopeRefusal(reason: string, code: string): boolean {
  return reason === "queue_scope_malformed" || code === "CLR10";
}

// =============================================================================================
// 1 · `read_payroll_posting_state` (#946) — WHY A PAYROLL RUN DID NOT POST.
//
// The sentence is the DATABASE'S OWN: it arrives on the queue row `clara.wake_list_review_queue`
// returns, and this module reports it rather than composing one. `clara._payroll_posting_verdict`
// is granted to NOBODY on purpose and is never called from a tool — the sentence reaches the chat
// lane through the queue row, which is the same body a person reads.
// =============================================================================================

/** The tool name, as the model sees it and as every census counts it. */
export const READ_PAYROLL_POSTING_STATE_TOOL = "read_payroll_posting_state";

/**
 * #1136's contract input, unchanged. TWO IDENTIFIERS AND NOTHING ELSE: a model that could name
 * the row kind, the entry or the sentence would be choosing which block to report, and the block
 * is the queue's own.
 */
export const readPayrollPostingStateInputSchema = z
  .object({
    client_id: z.string().uuid().describe("the client whose payroll summary this is"),
    document_id: z.string().uuid().describe("the payroll summary to report the posting state of"),
  })
  .strict();

export type ReadPayrollPostingStateInput = z.infer<typeof readPayrollPostingStateInputSchema>;

export type ReadPayrollPostingStateResult =
  | {
      ok: true;
      status: "blocked";
      client_id: string;
      document_id: string;
      /** THE DATABASE'S OWN SENTENCE. Reported verbatim; rewording it would put a reason on
       *  screen that nobody decided. */
      question_text: string;
      /** Non-null only for a DUPLICATE refusal — the entry to point the person at. */
      entry_id: string | null;
    }
  | {
      ok: true;
      status: "posted";
      client_id: string;
      document_id: string;
      /** THE APPROVED ENTRIES ON THE FILING, which is what "the run posted" MEANS. `approved` is
       *  the estate's posted state (`ck_journal_entries_status`: draft | approved | withdrawn);
       *  a draft is a proposal waiting on a person and a withdrawn entry posted nothing. */
      entries: PostedEntry[];
      /** The document's own reading state, as `clara.get_document_state` answers it, carried
       *  whole: the model reports it and this module re-derives nothing from it. */
      document_state: Record<string, unknown> | null;
    }
  | ToolRefusalV23;

/** One entry of `clara.get_document_state`'s `operation.entries`, which carries exactly these two
 *  keys (read out of `pg_proc` on `clara_c04`). */
export type PostedEntry = { entry_id: string; status: string };

/** The APPROVED entries of a document state, or the empty list when the state is null — which is
 *  what the door answers for a document this client does not hold AND for one that does not exist.
 *  It does NOT refuse, so a caller that does not branch on null reports a posting that never
 *  happened (measured on `clara_c04`: both cases return SQL NULL). */
export function approvedEntries(documentState: unknown): PostedEntry[] {
  const bag = (documentState ?? {}) as Record<string, unknown>;
  const operation = (bag.operation ?? {}) as Record<string, unknown>;
  const entries = Array.isArray(operation.entries) ? (operation.entries as Record<string, unknown>[]) : [];
  return entries
    .filter((e) => String(e.status ?? "") === "approved")
    .map((e) => ({ entry_id: String(e.entry_id ?? ""), status: String(e.status ?? "") }));
}

/** The READING TASK'S OWN STATUS, named rather than guessed — #1136 §1's own instruction. Null
 *  when the state door answered nothing at all, which is itself the honest answer. */
export function documentReadingStatus(documentState: unknown): string | null {
  const bag = (documentState ?? {}) as Record<string, unknown>;
  const byteExtraction = (bag.byte_extraction ?? {}) as Record<string, unknown>;
  const status = byteExtraction.status;
  return typeof status === "string" ? status : null;
}

/** #1136's refusal sentences for this read, spelled once. */
export const PAYROLL_POSTING_STATE_REFUSALS: Readonly<Record<string, string>> = Object.freeze({
  /** CLR03 — no credential, a wake kind that is not allowlisted, or no `on_behalf_of`. The client
   *  is NEVER named here: the caller could not read the inbox at all. */
  not_permitted: "I cannot read your firm's inbox in this conversation.",
  /** CLR10 — the queue scope is malformed, which is also what another firm's real client looks
   *  like from here. A tool must not distinguish them. */
  client_not_found: "I cannot find that client under your firm.",
  /** No blocked row AND no approved entry. NOT a governed refusal — this lane's own, and it is
   *  ALSO the answer for a document this client does not hold, deliberately: the state door
   *  answers null for a stranger's document and for one that does not exist, and a tool that
   *  distinguished them would be an existence oracle over the firm's filings. */
  payroll_not_read: "That payroll summary has not been read yet.",
});

/**
 * Why a payroll run did not post.
 *
 * TWO WALLS AND THEN THE DOORS: the conversation is about a client at all, and the client the
 * model named IS that client (v21's provenance wall, v22's shape). The firm scope and the
 * not-found masking are the wake doors' own, and this module adds none of its own.
 */
export async function runReadPayrollPostingState(
  ctx: ToolCtx,
  input: ReadPayrollPostingStateInput,
): Promise<ReadPayrollPostingStateResult> {
  const pin = requireClientPinV23(ctx, input.client_id, {
    noPinReason: "payroll_posting_state_needs_client_pin",
    noPinMessage:
      "This conversation is not bound to a client, so there is no payroll summary of theirs to report on.",
    mismatchReason: "client_not_in_conversation",
    mismatchMessage:
      "That is not the client this conversation is about, so I will not read their payroll state here.",
  });
  if (pin.ok !== true) return pin;
  const clientId = pin.clientId;
  try {
    return await readScoped(ctx, async (c: PgExec) => {
      const blocked = await findBlockedRow(c, clientId, "payroll_posting_blocked", input.document_id);
      if (blocked === QUEUE_SCAN_INCOMPLETE) return internalFaultV23(QUEUE_SCAN_INCOMPLETE_MESSAGE);
      if (blocked !== null) {
        return {
          ok: true as const,
          status: "blocked" as const,
          client_id: clientId,
          document_id: input.document_id,
          question_text: String(blocked.question_text ?? ""),
          entry_id: blocked.entry_id == null ? null : String(blocked.entry_id),
        };
      }
      // NO BLOCKED ROW: the run either POSTED or was NEVER READ, and #1136 §1's table carries
      // those as two separate rows. The document's OWN state says which — an APPROVED entry on
      // the filing is what "posted" means — and it is named rather than guessed.
      const state = await c.query(
        "select clara.get_document_state($1::uuid, $2::uuid) as s",
        [input.document_id, clientId],
      );
      const documentState = (state.rows[0]?.s ?? null) as Record<string, unknown> | null;
      const entries = approvedEntries(documentState);
      if (entries.length === 0) {
        return {
          ok: false as const,
          code: LANE_REFUSAL_CODE,
          reason: "payroll_not_read",
          fix: "The reading runs on its own; ask again once it has finished, or ask a person to look at the document page.",
          message: PAYROLL_POSTING_STATE_REFUSALS.payroll_not_read!,
          // THE TASK'S OWN STATUS, from the state door, never a guess.
          details: { reading_status: documentReadingStatus(documentState) },
        };
      }
      return {
        ok: true as const,
        status: "posted" as const,
        client_id: clientId,
        document_id: input.document_id,
        entries,
        document_state: documentState,
      };
    });
  } catch (error) {
    return governedRefusalV23(
      error,
      (reason, _detail, code) => {
        if (code === "CLR03") return notPermittedV23(PAYROLL_POSTING_STATE_REFUSALS.not_permitted!);
        if (isQueueScopeRefusal(reason, code)) {
          return { reason: "client_not_found", message: PAYROLL_POSTING_STATE_REFUSALS.client_not_found! };
        }
        return null;
      },
      "That payroll summary's posting state could not be read.",
    );
  }
}

// =============================================================================================
// 2 · `read_payroll_settlement_state` (#947) — WHETHER A PAYROLL RUN'S NET PAY HAS LEFT THE BANK.
//
// IT OFFERS EVERY CANDIDATE AND CHOOSES NONE, even when exactly one is offered. That is #947 AC4's
// own law carried into the conversation: the database never chooses, and neither does a tool.
// There is no accept-via-chat door and this cut does not propose one — acceptance happens on the
// bank surface or in Needs you, where a person can see every candidate side by side.
// =============================================================================================

/** The tool name, as the model sees it and as every census counts it. */
export const READ_PAYROLL_SETTLEMENT_STATE_TOOL = "read_payroll_settlement_state";

/**
 * #1136's contract input, unchanged. The document is OPTIONAL: naming it narrows to the one
 * summary's own posted entry, omitting it reports every unsettled run for this client. No
 * candidate identifier is takeable, because picking one is never this tool's act.
 */
export const readPayrollSettlementStateInputSchema = z
  .object({
    client_id: z.string().uuid().describe("the client whose payroll runs these are"),
    document_id: z
      .string()
      .uuid()
      .optional()
      .describe(
        "narrow to the one payroll summary's own posted entry, if named; omitted reports every unsettled run for this client",
      ),
  })
  .strict();

export type ReadPayrollSettlementStateInput = z.infer<typeof readPayrollSettlementStateInputSchema>;

/** One unsettled run, as `clara.wake_get_payroll_settlement_candidates` returns it. The shape is
 *  carried through unchanged: this module narrows the LIST and reshapes no row. */
export type PayrollSettlementRun = Record<string, unknown> & { document_id?: unknown };

export type ReadPayrollSettlementStateResult =
  | {
      ok: true;
      /** `not_offered` is the NARROWED read that matched nothing, which #1136 §2's table keeps
       *  apart from an empty queue: this run's net pay is either already settled or not yet
       *  posted, and this tool never guesses which. */
      status: "read" | "not_offered";
      client_id: string;
      document_id: string | null;
      runs: PayrollSettlementRun[];
      /** The panel's own empty-state sentence when the CLIENT has nothing waiting, else null. It
       *  is computed from the door's UNFILTERED answer: a narrowing that missed says nothing about
       *  whether other runs are waiting. */
      empty_sentence: string | null;
      /** The narrowed-miss sentence, else null. */
      not_offered_sentence: string | null;
    }
  | ToolRefusalV23;

/** The panel's own empty-state sentence, reused verbatim rather than re-spelled. */
export const NO_PAYROLL_RUN_AWAITING_PAYMENT = "No payroll run is waiting on its bank payment.";

/** #1136 §2's own words for a document-narrowed read that matched no candidate: the run is either
 *  already settled or not yet posted, and the posting half is the OTHER tool's. Never guess. */
export const PAYROLL_RUN_NOT_OFFERED =
  "That payroll run is not waiting on a bank payment: its net pay is either already settled or "
  + "was never posted. Which of the two it is, is read_payroll_posting_state's half — this read "
  + "does not guess.";

/** #1136's refusal sentences for this read, spelled once. */
export const PAYROLL_SETTLEMENT_STATE_REFUSALS: Readonly<Record<string, string>> = Object.freeze({
  /** CLR03 — the credential cannot reach this client's payroll at all. */
  not_permitted: "I cannot read this client's payroll in this conversation.",
  /** CLR11 — the client is not in this firm, which is ALSO the answer for another firm's real
   *  client. A tool must not distinguish them. */
  client_not_found: "I cannot find that client under your firm.",
});

/**
 * Which payroll runs still owe their net pay, and every bank line offered for each.
 *
 * TWO WALLS AND THEN THE DOOR, exactly as the posting read: the conversation is about a client at
 * all, and the client the model named IS that client.
 */
export async function runReadPayrollSettlementState(
  ctx: ToolCtx,
  input: ReadPayrollSettlementStateInput,
): Promise<ReadPayrollSettlementStateResult> {
  const pin = requireClientPinV23(ctx, input.client_id, {
    noPinReason: "payroll_settlement_state_needs_client_pin",
    noPinMessage:
      "This conversation is not bound to a client, so there is no payroll run of theirs to report on.",
    mismatchReason: "client_not_in_conversation",
    mismatchMessage:
      "That is not the client this conversation is about, so I will not read their payroll here.",
  });
  if (pin.ok !== true) return pin;
  const clientId = pin.clientId;
  try {
    return await readScoped(ctx, async (c: PgExec) => {
      const r = await c.query(
        "select clara.wake_get_payroll_settlement_candidates($1::uuid) as runs",
        [clientId],
      );
      const answer = (r.rows[0]?.runs ?? null) as unknown;
      const all = Array.isArray(answer) ? (answer as PayrollSettlementRun[]) : [];
      // THE NARROWING IS A FILTER, NOT A SECOND READ. A document the door did not return is a run
      // that is already settled or not yet posted, and this tool never guesses which — the
      // posting half is `read_payroll_posting_state`'s.
      const runs = input.document_id === undefined
        ? all
        : all.filter((run) => String(run.document_id ?? "") === input.document_id);
      // A NARROWING THAT MISSED IS NOT AN EMPTY QUEUE. The panel's sentence is about what this
      // CLIENT has waiting, so it is computed from the door's UNFILTERED answer; the miss gets the
      // contract's own row instead.
      const narrowedMiss = input.document_id !== undefined && runs.length === 0;
      return {
        ok: true as const,
        status: narrowedMiss ? ("not_offered" as const) : ("read" as const),
        client_id: clientId,
        document_id: input.document_id ?? null,
        runs,
        empty_sentence: all.length === 0 ? NO_PAYROLL_RUN_AWAITING_PAYMENT : null,
        not_offered_sentence: narrowedMiss ? PAYROLL_RUN_NOT_OFFERED : null,
      };
    });
  } catch (error) {
    return governedRefusalV23(
      error,
      (reason, _detail, code) => {
        if (code === "CLR03") return notPermittedV23(PAYROLL_SETTLEMENT_STATE_REFUSALS.not_permitted!);
        if (reason === "client_not_found" || reason === "client_not_in_firm" || code === "CLR11") {
          return { reason: "client_not_found", message: PAYROLL_SETTLEMENT_STATE_REFUSALS.client_not_found! };
        }
        return null;
      },
      "That client's payroll settlement state could not be read.",
    );
  }
}

// =============================================================================================
// 3 · `read_agreement_terms` (#948, as AMENDED by `waveS-lane08-fix.md` §7.4) — WHAT AN AGREEMENT
//     SAYS, AS THE LANE BANKED IT.
//
// THE INPUT CARRIES A CLIENT, and #948's original did not. Both doors this tool calls take one,
// and a document-only tool would have to DISCOVER the client first — which is the existence
// oracle the tenant wall exists to prevent. §7.4 asks the cut to confirm the chat surface can
// always supply it: IT CANNOT — a firm-level (unpinned) session has no `ctx.clientId` — so this
// tool refuses such a session by name rather than discovering a client for it. That is the
// narrower of the two routes the report offered, and it needs no new door.
//
// THE POSTING VERDICT IS NEVER READ FROM ITS CORE. `clara._agreement_posting_verdict` is granted
// to nobody on purpose; the sentence reaches the chat lane on the queue row, which is the same
// body a person reads.
// =============================================================================================

/** The tool name, as the model sees it and as every census counts it. */
export const READ_AGREEMENT_TERMS_TOOL = "read_agreement_terms";

/** #1136's contract input, with §7.4's `client_id`. */
export const readAgreementTermsInputSchema = z
  .object({
    client_id: z.string().uuid().describe("the client whose agreement this is"),
    document_id: z.string().uuid().describe("the filed agreement contract to read"),
  })
  .strict();

export type ReadAgreementTermsInput = z.infer<typeof readAgreementTermsInputSchema>;

/**
 * The agreement lane's TWO CHANNELS, named by the estate itself
 * (`agreementFacts.v1.services.mjs`: "BOTH channels share this ONE engine id and are
 * distinguished by engine_kind"). #1136 calls a reading that carries both "a banked pair"; one
 * channel alone is a reading still in flight, not an agreement that has been read.
 */
export const AGREEMENT_FACT_ENGINE_KINDS: readonly string[] = Object.freeze([
  "agreement_text_facts",
  "agreement_vision_facts",
]);

/** Whether the extract carries BOTH agreement channels. Nothing is parsed out of the envelopes
 *  here: what the terms SAY is the extract's own, reported as it arrives. */
export function agreementBankedPair(extract: unknown): boolean {
  const bag = (extract ?? {}) as Record<string, unknown>;
  const extractions = Array.isArray(bag.extractions) ? (bag.extractions as Record<string, unknown>[]) : [];
  const kinds = new Set(extractions.map((e) => String(e.engine_kind ?? "")));
  for (const kind of AGREEMENT_FACT_ENGINE_KINDS) if (!kinds.has(kind)) return false;
  return true;
}

export type ReadAgreementTermsResult =
  | {
      ok: true;
      status: "blocked" | "read";
      client_id: string;
      document_id: string;
      /** The lane's banked reading, exactly as `clara.get_document_extract` returns it. */
      extract: unknown;
      /** The gate's own sentence when the acquisition did not post, else null. A TENANCY gets a
       *  row too and it is not an error: it was read, it will never post, and the sentence says
       *  so. */
      question_text: string | null;
    }
  | ToolRefusalV23;

/** #1136's refusal sentences for this read, spelled once. */
export const AGREEMENT_TERMS_REFUSALS: Readonly<Record<string, string>> = Object.freeze({
  /** CLR03 — the credential cannot reach this client's documents at all. */
  not_permitted: "I cannot read this client's documents in this conversation.",
  /** CLR10 (`queue scope is malformed`) — and another firm's real client answers identically. */
  client_not_found: "I cannot find that client under your firm.",
  /** CLR16 — the document is not an agreement contract, or is not filed. */
  not_found: "That document is not a filed agreement contract.",
  /** No banked pair: the reading has not finished. NOT a door's refusal — this lane's own, and
   *  it carries `LANE_REFUSAL_CODE` for the reason written there. */
  not_read_yet: "That agreement has not been read yet.",
});

/**
 * What an agreement says, as the lane banked it, plus the gate's sentence when it did not post.
 *
 * TWO WALLS AND THEN THE DOORS, exactly as the two payroll reads.
 */
export async function runReadAgreementTerms(
  ctx: ToolCtx,
  input: ReadAgreementTermsInput,
): Promise<ReadAgreementTermsResult> {
  const pin = requireClientPinV23(ctx, input.client_id, {
    noPinReason: "agreement_terms_needs_client_pin",
    noPinMessage:
      "This conversation is not bound to a client, so there is no agreement of theirs to read.",
    mismatchReason: "client_not_in_conversation",
    mismatchMessage:
      "That is not the client this conversation is about, so I will not read their agreement here.",
  });
  if (pin.ok !== true) return pin;
  const clientId = pin.clientId;
  try {
    return await readScoped(ctx, async (c: PgExec) => {
      const r = await c.query(
        "select clara.get_document_extract($1::uuid, $2::uuid, $3::int) as extract",
        [input.document_id, clientId, AGREEMENT_EXTRACT_MAX_CHARS],
      );
      const extract = (r.rows[0]?.extract ?? null) as unknown;
      const blocked = await findBlockedRow(c, clientId, "agreement_posting_blocked", input.document_id);
      if (blocked === QUEUE_SCAN_INCOMPLETE) return internalFaultV23(QUEUE_SCAN_INCOMPLETE_MESSAGE);
      if (blocked === null && !agreementBankedPair(extract)) {
        return {
          ok: false as const,
          code: LANE_REFUSAL_CODE,
          reason: "not_read_yet",
          fix: "The reading runs on its own; ask again once it has finished, or ask a person to look at the document page.",
          message: AGREEMENT_TERMS_REFUSALS.not_read_yet!,
          details: {},
        };
      }
      return {
        ok: true as const,
        status: blocked === null ? ("read" as const) : ("blocked" as const),
        client_id: clientId,
        document_id: input.document_id,
        extract,
        question_text: blocked === null ? null : String(blocked.question_text ?? ""),
      };
    });
  } catch (error) {
    return governedRefusalV23(
      error,
      (reason, _detail, code) => {
        if (code === "CLR03") return notPermittedV23(AGREEMENT_TERMS_REFUSALS.not_permitted!);
        if (isQueueScopeRefusal(reason, code)) {
          return { reason: "client_not_found", message: AGREEMENT_TERMS_REFUSALS.client_not_found! };
        }
        if (code === "CLR16") return { reason: "not_found", message: AGREEMENT_TERMS_REFUSALS.not_found! };
        return null;
      },
      "That agreement could not be read.",
    );
  }
}
