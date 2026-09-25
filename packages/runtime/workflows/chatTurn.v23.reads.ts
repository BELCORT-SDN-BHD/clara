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
