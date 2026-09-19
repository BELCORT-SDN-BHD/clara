// @frozen
//
// FROZEN — part of the chatTurn_v21 closure. A NEW frozen closure beside byte-untouched
// chatTurn_v1..v20 (docs/ARCHITECTURE.md §10, #workflow-versioning-and-rollback).
//
// `buildToolsV21` calls v20's `buildToolsV20(ctx, modelId, segment)` BY IMPORT and adds EXACTLY
// TWO tools: `start_trade_invoice_work` (#655) and `run_depreciation_period_for_client` (#651).
// Nothing v20 could do stops being possible and nothing it did changes. ONE successor rather than
// two, for the reason v20's header gives: a frozen version costs a manifest entry, a bundle, a
// rollback target and a parked-run obligation for every body it supersedes, and wave 2026-09-18's
// DECISIONS §1.1 names ONE integration cut for both tickets.
//
// THE ROSTER IS v20's THIRTY-SEVEN PLUS TWO — THIRTY-NINE — AND IT IS ENUMERATED RATHER THAN
// ASSUMED, which #655's own stanza named as this cut's job ("enumerating the full v21 roster and
// reconciling the other lanes' stanzas is the integration worker's job"). Measured by building
// the map: `add_bank_account`, `assess_report_claim`, `clarify`, `complete_bank_reconciliation`,
// `compose_metric_preview`, `draft_journal_entry`, `draft_report_spec`, `get_bank_pack`,
// `get_context_pack`, `get_journal_entry`, `list_journal_entries`, `list_metric_catalog`,
// `list_unassigned_documents`, `match_bank_line`, `open_client_question`, `open_report_run`,
// `post_journal_entry`, `propose_bank_identifier_promotion`, `propose_bank_line_exception`,
// `read_books_freeform`, `read_document`, `remember_client_information`, `request_report_preview`,
// `resolve_and_book_bank_line`, `resolve_bank_line_exception`, `save_metric_definition_draft`,
// `seal_report_dataset`, `settle_from_bank_line`, `start_accrual_work`, `start_journal_work`,
// `start_periodic_adjustment_work`, `start_staff_expense_claim_work`, `trial_balance`,
// `unmatch_bank_match`, `upsert_bank_coa_account`, `void_bank_reconciliation`,
// `void_bank_statement` — plus this file's two. `p655.roster.v21` asserts the count and the delta.
//
// REGISTRATION COMES FROM THIS MODULE ALONE — v19's own defence, carried: `Object.assign` over
// v20's map plus two literal keys. A client's recorded Knowledge reaches the prompt as DATA in a
// string; there is no path from it to this object.
//
// ---------------------------------------------------------------------------------------------
// 1 · `start_trade_invoice_work` — THE CHAT ENTRANCE #655 LEFT OPEN.
//
// A trade invoice is a `journal_entry`-purpose Work whose typed particulars live in
// `clara.trade_invoices`. `WORK_ACCEPTED_PURPOSES` needs NO widening for the same reason #638's
// claim needed none: a fourth `accounting_work.purpose` cannot post without recutting the posting
// core's Work lookup, so the invoice rides the existing purpose (migration 0225's header states
// it, and `chatTurn.v19.parts.ts`'s frozen `WORK_ACCEPTED_PURPOSES_V19` already names it).
//
// IT ADMITS AND IT POSTS NOTHING. `clara.admit_trade_invoice_work` writes the invoice row, its
// append-only status ledger and the `clara.accounting_work` row inside ONE transaction, and the
// ENTRY is written a moment later by a `claraWork` run under a wake credential minted OBO this
// same human, with the database rechecking role, period, chart and cents AT COMMIT. So the honest
// thing to say after this tool succeeds is "I have queued it", and the prompt says exactly that.
//
// THE DOOR TAKES NINE ARGUMENTS AND THE ORDER IS THE CARRIER'S, NOT THIS FILE'S.
// `packages/runtime/lib/trade-invoice-basis.ts`'s footer fixes it, and `p655.tool.door_order`
// pins it with a spy rather than with a comment.
//
// THE LOCAL REFUSAL IS THE DOOR'S SHAPE, NOT THE TOOL'S, AND THAT IS WHY IT IS MAPPED HERE.
// #638's `localClaimRefusal` answers the tool envelope directly; #655's `localTradeInvoiceRefusal`
// answers `{error:'invalid_basis', field, reason, detail}` — the shape the DOOR raises and the
// web form already renders — because the same function serves the browser route. So this body
// maps it once, through `TRADE_INVOICE_REFUSALS`, which is the SAME sentence map the door's own
// refusals are rendered with. One reason names one thing, on both paths.
//
// THE REFUSAL MAP IS EIGHTEEN TOKENS and the ladder binds while the number describes: the
// fourteen DECISIONS.md:50 fixes plus `invalid_kind`, `invalid_particulars`, `invalid_currency`
// and `invalid_tax_facts` (review finding F2 — the door used to raise `invalid_kind` for all four
// and the map renders one sentence per token, so three of the four were told a sentence about
// document types that was false). An UNMAPPED reason keeps the door's own message VERBATIM.
//
// A REPLAY ANSWERS FEWER TYPED FACTS THAN A FRESH ADMISSION, AND THIS FILE SAYS SO RATHER THAN
// INVENTING THEM. Measured on 0225: the fresh branch returns `invoice_id`, `kind`,
// `counterparty_id`, `due_date` and `due_date_source`; the REPLAY branch returns the core receipt
// plus `invoice_id` ALONE. `kind` is still safe to echo from the input — a differing kind raises
// `intent_payload_conflict` on the `field:'kind'` arm before that branch is reached — but the
// party and the derived due date are the database's own answers and are genuinely absent, so they
// come back null rather than as a value this module made up. `p655.replay.typed_facts` pins it.
//
// ---------------------------------------------------------------------------------------------
// 2 · `run_depreciation_period_for_client` — THE CLARA ENTRANCE #651 LEFT OPEN.
//
// IT COMPUTES NOTHING AND IT NAMES NO PERIOD. `clara.run_depreciation_period_for` asks
// `clara._depreciation_run_due_core` for the oldest unmet period, runs exactly that, and asks
// again; `clara._fa_run_period_core` refuses any caller-named window that is not the cadence's
// (0041:3457-3470). The schema therefore carries a client and an optional `through` bound.
//
// IT MAY NEVER CALL `clara.run_depreciation_manual`. `packages/db/tests/rig-meta.mjs:691-693` is
// an executable census whose own words are that the manual verb "must NEVER reach a machine role,
// or the maker-checker ladder would have a bypass". 0227 minted a NEW name rather than widening a
// grant, and this body names that new one.
//
// THE CLIENT IS THE CONVERSATION'S, NEVER THE MODEL'S, AND THAT IS A PROVENANCE WALL RATHER THAN
// A BUSINESS RULE. #651's schema carries `client_id` because the carrier is also the contract for
// a lane that has no conversation pin; this lane HAS one. Measured: no other tool in the
// thirty-nine takes a client from the model — every one of them reads `ctx.clientId` — and
// chatTurn.v20.tools.ts states the identical law one field over for the session id ("a
// model-supplied session id would be a provenance claim nobody checked"). So a `client_id` that
// disagrees with the pin is refused BY NAME here, before any round trip, and the door then
// receives the carrier's own `depreciationRunDoorArgs(input, …)` over an input that provably
// equals the pin. Refusing is the point: silently substituting the pin would run a period on a
// client the model did not name.
//
// NO PART KIND, AND NO CODING-INTENT MEMBERSHIP — BOTH MEASURED, AND THE SECOND IS THE ONE A
// LATER READER WILL QUESTION. #651's stanza forbids a new part kind, and no EXISTING kind can
// address a depreciation receipt truthfully:
//   · `entry_posted` needs `post_receipt_id`, `rung_vector` and `verdict` off
//     `clara.entry_post_receipts`; the FA poster writes no such row (the register posts through
//     0041/0042, never through 0106's F-A2 posting core), and ONE run clears up to twelve
//     periods, so one card could not address them anyway;
//   · `agent_receipt` hydrates `clara.agent_receipts_visible`, a union of the SEVEN shims
//     registered at 0103:294-301 over `entry_post_receipts` / `bank_agent_receipts` /
//     `agent_act_receipts` / `report_agent_receipts` / `freeform_read_log` /
//     `agent_filing_receipts` / `web_fetch_receipts`. This door finishes through
//     `clara._finish_op` into `clara.op_receipts`, which is not a registered surface — the card
//     would link to a row that read surface cannot return;
//   · `work_accepted` would name an `accounting_work` row, and depreciation never reaches the
//     Work lane at all (the purpose IN-list at 0195:1711 / live 0204:180 stays closed).
// So the run mints no part and is narrated from `runSummary(receipt)` — and BECAUSE it mints no
// part it must stay OUT of `hasCodingIntent_v21`: C-19 appends `codingIncompleteRefusal()` ("the
// coding could not be completed into a review card this turn") to a coding-intent turn that ends
// with no terminal card, and on a SUCCESSFUL depreciation run that sentence would be false and
// would sit on screen beside a posting that actually happened. The floor under this lane is the
// tool's own refusal envelope and the prompt's "say exactly what the receipt says".
//
// A CONCURRENT RUN IS NOT A REFUSAL AND IS NOT A SUCCESS. `clara._reserve_op` answers
// `{pending:true}` when the same key is held by a call still in flight (0004's own contract).
// This body reports that as `ok:true, in_flight:true, periods_run:0` with a summary saying so — it
// mints no CLR code of its own, because a refusal nobody reviewed is how a wall becomes a rumour.

import { tool } from "ai";
import { buildToolsV20 } from "./chatTurn.v20.tools.js";
import { authoringRefusal, stableOpKey } from "./chatTurn.v11.tools.js";
import { pools, type PgExec, type ToolCtx } from "./chatTurn.v15.infra.js";
import type { WorkAcceptedPartV19 } from "./chatTurn.v19.parts.js";
import type { ToolRefusalV20 } from "./chatTurn.v20.tools.js";
import {
  START_TRADE_INVOICE_WORK_TOOL,
  TRADE_INVOICE_REFUSALS,
  isTradeInvoiceRefusal,
  journalBasisFromInput,
  localTradeInvoiceRefusal,
  startTradeInvoiceWorkInputSchema,
  tradeInvoiceFromInput,
  type StartTradeInvoiceWorkInput,
  type TradeInvoiceRefusalReason,
} from "../lib/trade-invoice-basis.js";
import {
  DEPRECIATION_RUN_DOOR,
  RUN_DEPRECIATION_PERIOD_TOOL,
  depreciationRunDoorArgs,
  localRunRefusal,
  refusalSentence,
  runDepreciationInputSchema,
  runSummary,
  type DepreciationRunReceipt,
  type RunDepreciationInput,
} from "../lib/depreciation-run.js";

export { START_TRADE_INVOICE_WORK_TOOL, startTradeInvoiceWorkInputSchema, TRADE_INVOICE_REFUSALS };
export { RUN_DEPRECIATION_PERIOD_TOOL, runDepreciationInputSchema, DEPRECIATION_RUN_DOOR };
export type { StartTradeInvoiceWorkInput, RunDepreciationInput };

/** The refusal envelope both tools answer with — v18's `StartJournalWorkResult` shape, carried by
 *  v19 and v20 and carried again here BY IMPORT, so a model that has learned to read one has
 *  learned to read all thirty-nine. */
export type ToolRefusalV21 = ToolRefusalV20;

export type StartTradeInvoiceWorkResult =
  | {
      ok: true;
      work_accepted: WorkAcceptedPartV19;
      task_id: string;
      status: string;
      invoice_id: string;
      kind: string;
      counterparty_id: string | null;
      due_date: string | null;
      due_date_source: string | null;
      replayed: boolean;
    }
  | ToolRefusalV21;

export type RunDepreciationResult =
  | {
      ok: true;
      in_flight: boolean;
      client_id: string;
      through: string | null;
      periods_run: number;
      periods: DepreciationRunReceipt["periods"];
      still_due: DepreciationRunReceipt["still_due"];
      summary: string;
    }
  | ToolRefusalV21;

type DbError = { code?: string; message?: string; detail?: string };

/** v19's own `noClientRefusal`, restated for the reason v20 restated it: exporting it
 *  retroactively would edit a deployed body. Same code, same shape, same sentence structure. */
function noClientRefusal(reason: string, message: string): ToolRefusalV21 {
  return {
    ok: false,
    code: "CLR03",
    reason,
    fix: "Open this conversation from the client workspace whose books this belongs to.",
    message,
    details: {},
  };
}

/** Read the chat session this turn belongs to FROM THE TASK, never from a model argument — v18's
 *  rule, carried by v19 and v20 and restated here for the same "a frozen predecessor does not
 *  export it" reason. */
async function sessionOfTask(c: PgExec, taskId: string): Promise<string | null> {
  const t = await c.query("select session_id from clara.agent_tasks where id = $1", [taskId]);
  const row = (t.rows[0] ?? null) as { session_id?: unknown } | null;
  return typeof row?.session_id === "string" ? row.session_id : null;
}

/** The database's typed refusal, handed back with THIS lane's sentence when the estate knows the
 *  reason, and with the door's own message VERBATIM when it does not. `authoringRefusal` answers
 *  `{ok:true}` for an error it does not recognise as a governed refusal — that is a FAULT, not a
 *  "no", and it becomes `internal` rather than a sentence this module invented. */
function tradeInvoiceRefusalFromError(error: unknown, internalMessage: string): ToolRefusalV21 {
  const refused = authoringRefusal(error as DbError);
  if (refused.ok === true) {
    return { ok: false, code: "internal", reason: null, fix: null, message: internalMessage, details: {} };
  }
  const reason = refused.reason;
  const known = typeof reason === "string" && isTradeInvoiceRefusal(reason);
  return {
    ok: false,
    code: refused.code,
    reason: refused.reason,
    fix: refused.fix,
    message: known ? TRADE_INVOICE_REFUSALS[reason as TradeInvoiceRefusalReason] : refused.message,
    details: refused.details,
  };
}

/** The same routing for the depreciation lane, through the carrier's own `refusalSentence`, which
 *  keys on `(code, reason, axis)` — the axis matters because 0227 added `period_closed` to a
 *  reason that already carried `not_cadence_aligned` and `not_ended`, three facts a person must be
 *  able to tell apart — and falls through to the door's message VERBATIM when the triple is
 *  unmapped. */
function depreciationRefusalFromError(error: unknown, internalMessage: string): ToolRefusalV21 {
  const refused = authoringRefusal(error as DbError);
  if (refused.ok === true) {
    return { ok: false, code: "internal", reason: null, fix: null, message: internalMessage, details: {} };
  }
  const axis = refused.details.axis;
  return {
    ok: false,
    code: refused.code,
    reason: refused.reason,
    fix: refused.fix,
    message: refusalSentence({
      code: refused.code,
      reason: refused.reason,
      axis: typeof axis === "string" ? axis : null,
      message: refused.message,
    }),
    details: refused.details,
  };
}

export async function runStartTradeInvoiceWork(
  ctx: ToolCtx,
  input: StartTradeInvoiceWorkInput,
  modelId: string,
): Promise<StartTradeInvoiceWorkResult> {
  if (!ctx.clientId) {
    return noClientRefusal(
      "trade_invoice_needs_client_pin",
      "This conversation is not bound to a client, so it cannot record a trade invoice.",
    );
  }
  const local = localTradeInvoiceRefusal(input);
  if (local) {
    // THE CARRIER'S SHAPE, MAPPED ONCE. Every reason `localTradeInvoiceRefusal` can answer is a
    // PAYLOAD-shape refusal the door also raises as CLR10 — `credit_shape_not_admitted`,
    // `invalid_due_date`, `unbalanced_basis`, `invalid_total`, `party_unresolved` — and the
    // sentence is the estate's own, not one invented here.
    const details: Record<string, unknown> = { field: local.field };
    if (local.detail !== undefined) {
      for (const [key, value] of Object.entries(local.detail)) details[key] = value;
    }
    return {
      ok: false,
      code: "CLR10",
      reason: local.reason,
      fix: null,
      message: TRADE_INVOICE_REFUSALS[local.reason as TradeInvoiceRefusalReason],
      details,
    };
  }

  const clientId = ctx.clientId;
  const intentKey = stableOpKey(ctx.taskId, START_TRADE_INVOICE_WORK_TOOL, input);
  const particulars = tradeInvoiceFromInput(input);
  const basis = journalBasisFromInput(input);
  try {
    const receipt = await pools().withRuntime(async (c: PgExec) => {
      const sessionId = await sessionOfTask(c, ctx.taskId);
      const sourceRefs = [{ kind: "chat_task", task_id: ctx.taskId, session_id: sessionId }];
      const r = await c.query(
        "select clara.admit_trade_invoice_work($1::uuid, $2::uuid, $3::text, $4::text,"
        + " $5::jsonb, $6::jsonb, $7::text, $8::jsonb, $9::text) as r",
        [
          clientId,
          ctx.createdBy,
          intentKey,
          input.kind,
          JSON.stringify(particulars),
          JSON.stringify(basis),
          input.basis_origin,
          JSON.stringify(sourceRefs),
          modelId,
        ],
      );
      return (r.rows[0]?.r ?? null) as Record<string, unknown> | null;
    });
    if (!receipt || receipt.work_id == null) {
      return {
        ok: false,
        code: "internal",
        reason: null,
        fix: null,
        message: "The trade invoice could not be recorded. Nothing was recorded.",
        details: {},
      };
    }
    return {
      ok: true,
      work_accepted: {
        type: "work_accepted",
        work_id: String(receipt.work_id),
        client_id: clientId,
        // THE PURPOSE IS `journal_entry` AND IT IS NOT A PLACEHOLDER — 0225 calls the unchanged
        // `clara._admit_accounting_work_core(..., 'journal_entry', ...)`. `clara.trade_invoices`
        // is what labels it a trade invoice on the Work surfaces, never a purpose value.
        purpose: "journal_entry",
        logical_op_id: String(receipt.logical_op_id ?? ""),
      },
      task_id: String(receipt.task_id ?? ""),
      status: String(receipt.status ?? "queued"),
      invoice_id: String(receipt.invoice_id ?? ""),
      // Safe to echo from the input on BOTH branches: a differing kind raises
      // `intent_payload_conflict` with `field:'kind'` before the replay branch returns.
      kind: receipt.kind == null ? input.kind : String(receipt.kind),
      // ABSENT ON A REPLAY, and null rather than invented (see this file's header).
      counterparty_id: receipt.counterparty_id == null ? null : String(receipt.counterparty_id),
      due_date: receipt.due_date == null ? null : String(receipt.due_date),
      due_date_source: receipt.due_date_source == null ? null : String(receipt.due_date_source),
      replayed: receipt.replayed === true,
    };
  } catch (error) {
    return tradeInvoiceRefusalFromError(error, "The trade invoice could not be recorded.");
  }
}

export async function runDepreciationPeriodForClient(
  ctx: ToolCtx,
  input: RunDepreciationInput,
): Promise<RunDepreciationResult> {
  if (!ctx.clientId) {
    return noClientRefusal(
      "depreciation_needs_client_pin",
      "This conversation is not bound to a client, so there is no register to depreciate.",
    );
  }
  // THE PROVENANCE WALL (see this file's header). Not a business rule: the client a turn acts on
  // is the conversation's, and a model naming a different one is making a claim nobody checked.
  if (input.client_id !== ctx.clientId) {
    return {
      ok: false,
      code: "CLR03",
      reason: "client_not_in_conversation",
      fix: "Open this conversation from the client whose register you mean, then ask again.",
      message: "That is not the client this conversation is about, so I will not run its depreciation here.",
      details: { client_id: input.client_id },
    };
  }
  const local = localRunRefusal(input);
  if (local) {
    return {
      ok: false,
      code: "CLR10",
      reason: local.reason,
      fix: null,
      message: local.message,
      details: {},
    };
  }

  const opKey = stableOpKey(ctx.taskId, RUN_DEPRECIATION_PERIOD_TOOL, input);
  const args = depreciationRunDoorArgs(input, { opKey, onBehalfOf: ctx.createdBy });
  try {
    const receipt = await pools().withRuntime(async (c: PgExec) => {
      const r = await c.query(
        "select clara.run_depreciation_period_for($1::uuid, $2::date, $3::text, $4::uuid) as r",
        [args.p_client, args.p_through, args.p_op_key, args.p_obo],
      );
      return (r.rows[0]?.r ?? null) as Record<string, unknown> | null;
    });
    if (!receipt) {
      return {
        ok: false,
        code: "internal",
        reason: null,
        fix: null,
        message: "The depreciation run returned no receipt. Nothing was charged.",
        details: {},
      };
    }
    if (receipt.pending === true) {
      return {
        ok: true,
        in_flight: true,
        client_id: args.p_client,
        through: args.p_through,
        periods_run: 0,
        periods: [],
        still_due: null,
        summary:
          "A depreciation run for this client is already in progress under this same request. "
          + "Nothing further was started — say so, and look again in a moment.",
      };
    }
    const typed = receipt as DepreciationRunReceipt;
    return {
      ok: true,
      in_flight: false,
      client_id: String(typed.client_id ?? args.p_client),
      through: typed.through == null ? null : String(typed.through),
      periods_run: Number(typed.periods_run ?? 0),
      periods: typed.periods ?? [],
      still_due: typed.still_due ?? null,
      // THE COUNTS ARE THE RECEIPT'S, never recomputed. `runSummary` is the carrier's own
      // renderer and it names how many assets were skipped and why.
      summary: runSummary(typed),
    };
  } catch (error) {
    return depreciationRefusalFromError(error, "The depreciation run could not be completed.");
  }
}

export function buildToolsV21(ctx: ToolCtx, modelId: string, segment: number) {
  return Object.assign({}, buildToolsV20(ctx, modelId, segment), {
    [START_TRADE_INVOICE_WORK_TOOL]: tool({
      description:
        "Start an accounting Work that records ONE trade invoice for the client pinned to this "
        + "conversation: a SALES INVOICE this client issued to a customer, or a SUPPLIER BILL this "
        + "client received from a vendor. Amounts are integer CENTS. A credit note is NEITHER — say "
        + "so rather than negating an invoice. Give the party exactly as the document states it (or "
        + "the counterparty id when you know it); Clara never creates a party, so a name nobody "
        + "answers to is refused and two parties answering to one name are refused WITH the "
        + "candidate list. Give the document date, the document's own reference, the stated total, "
        + "and the journal basis with EXACTLY ONE control-account leg of the domain the kind names. "
        + "Give the due date only when the document STATES one: the database derives it from the "
        + "party's agreed terms counted from the DOCUMENT date, and you may never claim it did. "
        + "This does NOT post the entry — it queues durable Work that posts it under the human's own "
        + "authority, rechecked at commit. Say you have QUEUED it. If the party, a date, the total "
        + "or an account is missing, ask with clarify: the invoice's basis is fixed at admission.",
      inputSchema: startTradeInvoiceWorkInputSchema,
      execute: (input: StartTradeInvoiceWorkInput) => runStartTradeInvoiceWork(ctx, input, modelId),
    }),
    [RUN_DEPRECIATION_PERIOD_TOOL]: tool({
      description:
        "Run this client's DUE depreciation periods against its signed depreciation authority. You "
        + "execute an authority; you never sign one. THE PERIOD IS THE DATABASE'S — there is no way "
        + "to name one here and that is deliberate: the register decides which period is oldest and "
        + "unmet, and refuses any window that is not the cadence's. `through` only BOUNDS a "
        + "catch-up and defaults to the current book day. The client must be the one this "
        + "conversation is about. Report exactly what the receipt says — the periods, the amounts, "
        + "how many assets were skipped and why — and never a figure it did not return. If the "
        + "client has no signed authority, or a draft is already waiting, or an earlier period is "
        + "unmet, or the year is closed, the refusal names it: pass that on and stop.",
      inputSchema: runDepreciationInputSchema,
      execute: (input: RunDepreciationInput) => runDepreciationPeriodForClient(ctx, input),
    }),
  });
}
