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
  clientMismatchRefusalV23,
  governedRefusalV23,
  noClientRefusalV23,
  type ToolRefusalV23,
} from "./chatTurn.v23.refusals.js";

/** The review queue is read with the contract's own limit. It is a SCOPED read — the scope is
 *  `{client_id}` and the core walls it against the credential's own firm — so the cap bounds the
 *  rows this client can have waiting, not a search. #1136's contract writes 200. */
export const AGENT_QUEUE_LIMIT = 200;

/** `clara.get_document_extract`'s third argument. #1136's contract writes 200 for the agreement
 *  read; the payroll fact state read in v22 uses its own constant for its own purpose. */
export const AGREEMENT_EXTRACT_MAX_CHARS = 200;

/** One row of `clara.wake_list_review_queue`'s answer, as much of it as these three reads use. */
export type AgentQueueRow = {
  row_kind?: unknown;
  document_id?: unknown;
  question_text?: unknown;
  entry_id?: unknown;
};

/**
 * The queue rows for one client, through the wake door 0352 allowlisted.
 *
 * THE DOOR IS SPELLED HERE, LITERALLY, rather than interpolated from a constant: a source pin that
 * reads an identifier proves nothing about the statement that ships, and this file is the one a
 * reviewer greps for the verb it calls.
 */
async function reviewQueueRows(c: PgExec, clientId: string): Promise<AgentQueueRow[]> {
  const r = await c.query(
    "select clara.wake_list_review_queue($1::jsonb, $2::jsonb, $3::int) as q",
    [JSON.stringify({ client_id: clientId }), null, AGENT_QUEUE_LIMIT],
  );
  const answer = (r.rows[0]?.q ?? null) as { rows?: unknown } | null;
  const rows = answer?.rows;
  return Array.isArray(rows) ? (rows as AgentQueueRow[]) : [];
}

/** The one blocked row this document has, or null. The row kind is the caller's: the two blocks
 *  are different lanes and a tool must not report one as the other. */
function blockedRow(rows: readonly AgentQueueRow[], rowKind: string, documentId: string): AgentQueueRow | null {
  for (const row of rows) {
    if (String(row.row_kind ?? "") !== rowKind) continue;
    if (String(row.document_id ?? "") !== documentId) continue;
    return row;
  }
  return null;
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
      /** The document's own reading state, as `clara.get_document_state` answers it. */
      document_state: Record<string, unknown> | null;
    }
  | ToolRefusalV23;

/** #1136's refusal sentences for this read, spelled once. */
export const PAYROLL_POSTING_STATE_REFUSALS: Readonly<Record<string, string>> = Object.freeze({
  /** CLR03 — no credential, a wake kind that is not allowlisted, or no `on_behalf_of`. The client
   *  is NEVER named here: the caller could not read the inbox at all. */
  not_permitted: "I cannot read your firm's inbox in this conversation.",
  /** CLR10 — the queue scope is malformed, which is also what another firm's real client looks
   *  like from here. A tool must not distinguish them. */
  client_not_found: "I cannot find that client under your firm.",
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
  if (!ctx.clientId) {
    return noClientRefusalV23(
      "payroll_posting_state_needs_client_pin",
      "This conversation is not bound to a client, so there is no payroll summary of theirs to report on.",
    );
  }
  if (input.client_id !== ctx.clientId) {
    return clientMismatchRefusalV23(
      "client_not_in_conversation",
      "That is not the client this conversation is about, so I will not read their payroll state here.",
      input.client_id,
    );
  }
  const clientId = ctx.clientId;
  try {
    return await readScoped(ctx, async (c: PgExec) => {
      const rows = await reviewQueueRows(c, clientId);
      const blocked = blockedRow(rows, "payroll_posting_blocked", input.document_id);
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
      // NO BLOCKED ROW: the run either posted or was never read. The document's OWN state says
      // which, and it is named rather than guessed.
      const state = await c.query(
        "select clara.get_document_state($1::uuid, $2::uuid) as s",
        [input.document_id, clientId],
      );
      const documentState = (state.rows[0]?.s ?? null) as Record<string, unknown> | null;
      return {
        ok: true as const,
        status: "posted" as const,
        client_id: clientId,
        document_id: input.document_id,
        document_state: documentState,
      };
    });
  } catch (error) {
    return governedRefusalV23(
      error,
      (reason) =>
        reason === "queue_scope_malformed"
          ? PAYROLL_POSTING_STATE_REFUSALS.client_not_found!
          : null,
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
      status: "read";
      client_id: string;
      document_id: string | null;
      runs: PayrollSettlementRun[];
      /** The panel's own empty-state sentence, so the two surfaces cannot drift. */
      empty_sentence: string | null;
    }
  | ToolRefusalV23;

/** The panel's own empty-state sentence, reused verbatim rather than re-spelled. */
export const NO_PAYROLL_RUN_AWAITING_PAYMENT = "No payroll run is waiting on its bank payment.";

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
  if (!ctx.clientId) {
    return noClientRefusalV23(
      "payroll_settlement_state_needs_client_pin",
      "This conversation is not bound to a client, so there is no payroll run of theirs to report on.",
    );
  }
  if (input.client_id !== ctx.clientId) {
    return clientMismatchRefusalV23(
      "client_not_in_conversation",
      "That is not the client this conversation is about, so I will not read their payroll here.",
      input.client_id,
    );
  }
  const clientId = ctx.clientId;
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
      return {
        ok: true as const,
        status: "read" as const,
        client_id: clientId,
        document_id: input.document_id ?? null,
        runs,
        empty_sentence: runs.length === 0 ? NO_PAYROLL_RUN_AWAITING_PAYMENT : null,
      };
    });
  } catch (error) {
    return governedRefusalV23(
      error,
      (reason) =>
        reason === "client_not_found" || reason === "client_not_in_firm"
          ? PAYROLL_SETTLEMENT_STATE_REFUSALS.client_not_found!
          : null,
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
  /** No banked pair: the reading has not finished. NOT a governed refusal — this lane's own. */
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
  if (!ctx.clientId) {
    return noClientRefusalV23(
      "agreement_terms_needs_client_pin",
      "This conversation is not bound to a client, so there is no agreement of theirs to read.",
    );
  }
  if (input.client_id !== ctx.clientId) {
    return clientMismatchRefusalV23(
      "client_not_in_conversation",
      "That is not the client this conversation is about, so I will not read their agreement here.",
      input.client_id,
    );
  }
  const clientId = ctx.clientId;
  try {
    return await readScoped(ctx, async (c: PgExec) => {
      const r = await c.query(
        "select clara.get_document_extract($1::uuid, $2::uuid, $3::int) as extract",
        [input.document_id, clientId, AGREEMENT_EXTRACT_MAX_CHARS],
      );
      const extract = (r.rows[0]?.extract ?? null) as unknown;
      const rows = await reviewQueueRows(c, clientId);
      const blocked = blockedRow(rows, "agreement_posting_blocked", input.document_id);
      if (blocked === null && !agreementBankedPair(extract)) {
        return {
          ok: false as const,
          code: "CLR11",
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
        if (reason === "queue_scope_malformed") return AGREEMENT_TERMS_REFUSALS.client_not_found!;
        if (code === "CLR16") return AGREEMENT_TERMS_REFUSALS.not_found!;
        return null;
      },
      "That agreement could not be read.",
    );
  }
}
