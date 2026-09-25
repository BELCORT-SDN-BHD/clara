// @frozen
//
// FROZEN — part of the chatTurn_v22 closure. A NEW frozen closure beside byte-untouched
// chatTurn_v1..v21 (docs/ARCHITECTURE.md §10, #workflow-versioning-and-rollback: a behavioural
// change ships as a new _vN export, never an in-place edit — registry.ts repoints `chatTurn:`
// here).
//
// `buildToolsV22` calls v21's `buildToolsV21(ctx, modelId, segment)` BY IMPORT and adds EXACTLY
// ONE tool: `read_opening_source` (#985, the chat half #656 wrote and v21 deliberately left out).
// Nothing v21 could do stops being possible and nothing it did changes.
//
// ---------------------------------------------------------------------------------------------
// `read_opening_source` — THE CHAT ENTRANCE #656 LEFT OPEN, AND THE FIGURE IS NEVER THE MODEL'S.
//
// A person attaches a filed document to an opening basis (the "tie document") and asks the
// runtime to READ it: the route re-derives every printed trial-balance line from the document's
// own stored regions and the database re-validates each triple before it becomes an opening
// target. The input here is TWO IDENTIFIERS and nothing else — no amount, no account code, no
// document id — because the tie is already bound to the basis and letting a model name any of
// them would put a figure, or a choice of source, in the model's hands.

import { tool } from "ai";
import { z } from "zod";
import { buildToolsV21 } from "./chatTurn.v21.tools.js";
import type { ToolRefusalV21 } from "./chatTurn.v21.tools.js";
import { authoringRefusal, stableOpKey } from "./chatTurn.v11.tools.js";
import type { WorkAcceptedPartV19 } from "./chatTurn.v19.parts.js";
import { pools, readScoped, type PgExec, type ToolCtx } from "./chatTurn.v15.infra.js";
import { parseOpeningTargets, readOpeningSeed, refreshOpeningTargets } from "../lib/opening-parse.mjs";
// EVERY TOOL NAME COMES FROM THE MODULE THAT DECLARES ITS STRING LITERAL, never through one that
// merely re-exports it. `check-parts-parity.mjs` resolves a computed key by dereferencing the
// identifier through its import chain and refuses a chain whose next hop is a RE-EXPORT rather
// than a binding, so importing `START_TRADE_INVOICE_WORK_TOOL` from the v2 carrier — which
// re-exports the frozen module's — would refuse this whole tool map. claraWork.v3's, v4's and v6's
// headers state the same rule; it has been paid for three times and is not paid for a fourth here.
import { START_TRADE_INVOICE_WORK_TOOL } from "../lib/trade-invoice-basis.js";
import { START_STAFF_EXPENSE_CLAIM_WORK_TOOL } from "../lib/staff-expense-claim-basis.js";
import { START_ACCRUAL_WORK_TOOL } from "../lib/accrual-basis.js";
import {
  TRADE_INVOICE_REFUSALS_V2,
  duplicateQuestion,
  isTradeInvoiceRefusalV2,
  journalBasisFromInput,
  localTradeInvoiceRefusal,
  shownInvoiceIds,
  startTradeInvoiceWorkInputSchemaV2,
  tradeInvoiceFromInput,
  type StartTradeInvoiceWorkInputV2,
} from "../lib/trade-invoice-basis.v2.js";
import {
  claimFromInputV2,
  localClaimRefusalV2,
  startStaffExpenseClaimWorkInputSchemaV2,
  type StartStaffExpenseClaimWorkInputV2,
} from "../lib/staff-expense-claim-basis.v2.js";
import {
  ACCRUAL_TIMEZONE,
  accrualFromInputV2,
  accrualRefusalMessageV2,
  localAccrualRefusalV2,
  startAccrualWorkInputSchemaV2,
  type StartAccrualWorkInputV2,
} from "../lib/accrual-basis.v2.js";
import {
  START_PREPAYMENT_SCHEDULE_WORK_TOOL,
  localPrepaymentRefusal,
  prepaymentDoorPayload,
  prepaymentRefusalMessage,
  prepaymentSchedulePart,
  startPrepaymentScheduleWorkInputSchema,
  type PrepaymentSchedulePart,
  type StartPrepaymentScheduleWorkInput,
} from "../lib/prepayment-schedule-basis.js";
import {
  START_REVENUE_RECOGNITION_WORK_TOOL,
  localRecognitionRefusal,
  recognitionDoorPayload,
  recognitionRefusalMessage,
  revenueRecognitionPart,
  startRevenueRecognitionWorkInputSchema,
  type RevenueRecognitionPart,
  type StartRevenueRecognitionWorkInput,
} from "../lib/revenue-recognition-basis.js";
import {
  PAYROLL_EXTRACT_MAX_CHARS,
  payrollFactStateFromExtract,
  payrollNotReadMessage,
  payrollReadRefusal,
  type PayrollFactState,
  type PayrollRegion,
} from "../lib/payroll-fact-state.js";

export { START_TRADE_INVOICE_WORK_TOOL, startTradeInvoiceWorkInputSchemaV2, TRADE_INVOICE_REFUSALS_V2 };
export { START_STAFF_EXPENSE_CLAIM_WORK_TOOL, startStaffExpenseClaimWorkInputSchemaV2 };
export { START_ACCRUAL_WORK_TOOL, startAccrualWorkInputSchemaV2 };
export { START_PREPAYMENT_SCHEDULE_WORK_TOOL, startPrepaymentScheduleWorkInputSchema };
export { START_REVENUE_RECOGNITION_WORK_TOOL, startRevenueRecognitionWorkInputSchema };

/** The tool name, as the model sees it and as every census counts it. */
export const READ_OPENING_SOURCE_TOOL = "read_opening_source";

/**
 * The tool's input. `.strict()` deliberately, and #985's AC1 is precisely that: an amount, an
 * account code or a document id in the call is REFUSED by validation rather than silently
 * dropped. A dropped `amount_cents` is how "I read the trial balance" becomes a figure nobody
 * printed.
 *
 * `client_id` is here because #656's contract fixes it there, and it is CHECKED against the
 * conversation's pin rather than used — see `runReadOpeningSource`. `seed_id` names the opening
 * basis; the document it ties is the database's answer, never the model's.
 */
export const readOpeningSourceInputSchema = z
  .object({
    client_id: z
      .string()
      .uuid()
      .describe("The client this conversation is about. It must be that client and no other."),
    seed_id: z
      .string()
      .uuid()
      .describe(
        "The opening basis to read into. Its tie document is already bound to it and is looked up "
        + "server-side; you never name a document, an account or an amount here.",
      ),
  })
  .strict();

export type ReadOpeningSourceInput = z.infer<typeof readOpeningSourceInputSchema>;

/** The one refusal token this module mints rather than carries: the core's 404 has no `reason` of
 *  its own, because masking is the point of it. */
export const OPENING_BASIS_NOT_FOUND = "opening_basis_not_found";

/**
 * THE SENTENCES THE ESTATE ALREADY HAS FOR THIS LANE, one reason naming one thing.
 *
 * Every OTHER reason the core can answer is rendered VERBATIM (#985 AC3): the named unparseable
 * reason carries its own counts and region ids, the chart gap names the account, and the
 * producer's refusal is the reader's own words about the document in front of it. A sentence is
 * written here only where the token is a fixed one the estate can speak about honestly.
 */
export const OPENING_SOURCE_REFUSALS: Readonly<Record<string, string>> = Object.freeze({
  [OPENING_BASIS_NOT_FOUND]:
    "I cannot see an opening basis with that id for this client.",
  registry_not_open:
    "This opening basis is not open for editing, so nothing can be read into it.",
  // #986's measurement, in the model's words. A SECOND READ IS REFUSED BY DESIGN — the parse's op
  // key is stable per (seed, document) so a retried read can never double a basis — and the way
  // on is the refresh act, not another read. The browser says the same thing in its own words
  // (`OpeningCarryDown.source.outcome.rereadBody`).
  source_reread_since_parse:
    "This document has been read again since the basis was parsed, so reading it again is refused: "
    + "a second reading is not a retry, and the lines on the basis cite the earlier one.",
  // THE KEYED-FALLBACK SIGNAL, AND IT IS NOT A FAULT. The browser renders this one as information
  // with the keying path beside it (`opening-parse-action.tsx:20`); a model handed the bare token
  // would report a failure where the estate reports a choice.
  no_opening_tb_lines:
    "This document does not carry a trial balance this reader can read, so nothing was recorded.",
  no_tie_document:
    "No document is bound to this opening basis, so there is nothing to read.",
});

/** The fix beside each fixed token — what a PERSON does next, never a retry this tool could make.
 *  `source_reread_since_parse` is the one refusal on this lane that carries an act. */
export const OPENING_SOURCE_FIXES: Readonly<Record<string, string>> = Object.freeze({
  [OPENING_BASIS_NOT_FOUND]:
    "Open the client's Registers page and check the opening basis you mean is the one this conversation is about.",
  registry_not_open:
    "A person reopens the basis on the client's Registers page before anything can be read into it.",
  no_opening_tb_lines:
    "A person can key the balances on the basis instead, or bind a different document to it.",
  no_tie_document:
    "A person binds a filed opening-balance document or management account to the basis first.",
  // #986's chat half (roster entry A3) IS in this body now, so the act beside this refusal names
  // the tool rather than a screen. A second READ stays refused by design — the parse's op key is
  // stable per (seed, document) — and the way on is the refresh act.
  source_reread_since_parse:
    "Use refresh_opening_source instead: it brings the basis onto the newest reading of the "
    + "document and retires the lines the earlier reading left. A person can also do it on the "
    + "client's Registers page.",
});

/** The all-or-nothing law, as the act a person takes: the estate's own words on the browser
 *  surface (`OpeningCarryDown.source.outcome.allOrNothing` and `…unmappedAccounts`). */
export const ALL_OR_NOTHING_FIX =
  "A person looks at the named rows on the document itself, or adds the named accounts on the "
  + "client's Accounts tab, and reads it again afterwards.";

/** What a FAULT answers: this lane's own sentence, no code from the driver, no details. v21's
 *  `internalFaultV21` is unexported in a deployed body, so exporting it retroactively would edit
 *  a frozen file — the estate's own reason for restating a small helper at each version. */
function internalFaultV22(message: string): ToolRefusalV22 {
  return { ok: false, code: "internal", reason: null, fix: null, message, details: {} };
}

/** The refusal envelope this lane answers with — v18's `StartJournalWorkResult` shape, carried by
 *  v19, v20 and v21 and carried again here BY IMPORT, so a model that has learned to read one has
 *  learned to read all forty. */
export type ToolRefusalV22 = ToolRefusalV21;

export type ReadOpeningSourceResult =
  | {
      ok: true;
      status: "parsed";
      client_id: string;
      seed_id: string;
      /** The count `clara.record_opening_targets_parsed` RECORDED, carried through the route core
       *  verbatim. Never a count of what was sent, and never a figure this module derived. */
      lines: number;
    }
  | ToolRefusalV22;

/**
 * The refusal's `details`: the core's OWN body, key by key, plus the basis this answer is about.
 *
 * BUILT WITH A LOOP RATHER THAN A SPREAD, and that is v21's own shape one lane over
 * (`chatTurn.v21.tools.ts`'s `localTradeInvoiceRefusal` mapping does the identical thing with the
 * door's `detail` bag). `packages/runtime/scripts/check-parts-parity.mjs` refuses an
 * unclassifiable object spread anywhere under `packages/runtime` — it cannot tell a refusal bag
 * from a part construction — and the estate's answer to that is either a reviewed row in the
 * exemption ledger or no spread at all. A merge nobody has to review is the cheaper of the two.
 */
function detailsWithBody(body: Record<string, unknown>, seedId: string): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) details[key] = value;
  details.seed_id = seedId;
  return details;
}

/** The estate's sentence for a FIXED token, or the caller's own when the reason is a statement
 *  about this document rather than a token (the named region list, the chart gap, the producer's
 *  refusal). One lookup, so "known token" is decided in exactly one place. */
function sentenceFor(reason: string | null, fallback: string): string {
  const sentence = reason === null ? undefined : OPENING_SOURCE_REFUSALS[reason];
  return sentence ?? fallback;
}

/** The act a person takes next, by the same rule. */
function fixFor(reason: string | null, fallback: string | null): string | null {
  const fix = reason === null ? undefined : OPENING_SOURCE_FIXES[reason];
  return fix ?? fallback;
}

/**
 * THE CORE'S OWN ANSWER, TURNED INTO THE TOOL ENVELOPE — and #985's AC3 is that nothing is
 * replaced by a generic message on the way.
 *
 * `parseOpeningTargets` answers a typed `{http, body}` for every state it contracts (202/404/409/
 * 422) and that body is the SAME one the browser renders: the named unparseable reason with its
 * counts and failing region ids, the chart gap with its `unmapped_accounts`, the producer's own
 * refusal text, the door's CLR code. So the mapping below carries `reason` verbatim, keeps the
 * whole body under `details`, and adds a sentence only where the estate already has one for that
 * token.
 *
 * EXPORTED because it is the contract a reviewer has to be able to drive: the door call around it
 * needs a database, this decision does not.
 */
export function openingSourceOutcome(
  out: { http: number; body: Record<string, unknown> },
  ids: { seedId: string; clientId: string },
): ReadOpeningSourceResult {
  const body = out.body ?? {};
  if (out.http === 202) {
    // A RECEIPT WITHOUT A COUNT IS NOT A SUCCESSFUL READ — `refreshOpeningTargets`'s ADV-08, one
    // door over (opening-parse.mjs:490-499). `Number(undefined)` is NaN and `Number(null)` is 0,
    // so a lenient read would report an act that recorded nothing as "0 lines recorded".
    const lines = typeof body.lines === "number" && Number.isFinite(body.lines) ? body.lines : null;
    if (lines === null) {
      return internalFaultV22("The opening source read returned no count. Nothing can be reported from it.");
    }
    return {
      ok: true,
      status: "parsed",
      client_id: ids.clientId,
      seed_id: ids.seedId,
      lines,
    };
  }
  if (out.http === 404) {
    // MASKED, AND IT STAYS MASKED. The core answers one shape for a basis that does not exist, a
    // basis of another firm and a malformed id; telling them apart here would make a chat turn an
    // oracle for another firm's records.
    return {
      ok: false,
      code: "not_found",
      reason: OPENING_BASIS_NOT_FOUND,
      fix: "Open the client's Registers page and check the opening basis you mean is the one this conversation is about.",
      message: sentenceFor(OPENING_BASIS_NOT_FOUND, "I cannot see that opening basis."),
      details: { seed_id: ids.seedId },
    };
  }
  if (out.http === 409) {
    const reason = typeof body.reason === "string" ? body.reason : null;
    // THE DOOR'S OWN CODE WHEN IT STATED ONE. The core's `refused` arm carries the CLR the
    // database raised (tie mismatch, unfiled tie, missing consent) and drops its message; the
    // `conflict` arm carries no code at all, because the lifecycle refusal is the route's own.
    // Neither case gets a CLR this module chose: an invented code is a refusal nobody can trace.
    const code = typeof body.code === "string" ? body.code : "conflict";
    return {
      ok: false,
      code,
      reason,
      fix: fixFor(reason, null),
      // NAMED, NOT REWORDED. When the estate has no sentence for the token there is none to
      // carry either — `mapOpeningDbError` keeps the code and the reason and drops the door's own
      // text — so the refusal says which refusal it was rather than inventing a description.
      message: sentenceFor(
        reason,
        `The opening source could not be read: the database refused it (${code}${reason ? `, ${reason}` : ""}). Nothing was recorded.`,
      ),
      details: detailsWithBody(body, ids.seedId),
    };
  }
  if (out.http === 422) {
    // THE REASON IS THE ANSWER. `namedUnparseableReason` names the failing region ids, the chart
    // gap names the account, and a producer refusal is the reader's own words about the document
    // — all three are the only actionable thing in the answer, so the sentence CARRIES them
    // rather than summarising them (#985 AC3). Only the two FIXED tokens get a sentence of their
    // own, because they are machine words rather than statements about this document.
    const reason = typeof body.reason === "string" ? body.reason : null;
    return {
      ok: false,
      code: "unparseable",
      reason,
      fix: fixFor(reason, ALL_OR_NOTHING_FIX),
      message: sentenceFor(
        reason,
        `The opening source could not be read: ${reason ?? "the document could not be read"}. `
          + "Nothing was recorded — one unreadable line forfeits the whole document, because a "
          + "partial opening basis is worse than none.",
      ),
      details: detailsWithBody(body, ids.seedId),
    };
  }
  return internalFaultV22("The opening source could not be read. Nothing was recorded.");
}

// ---------------------------------------------------------------------------------------------
// THE FLOOR. The browser route's, not a new one — and it is the ONLY one on this path.
//
// `clara.record_opening_targets_parsed(uuid, jsonb, uuid, text)` takes NO author and checks NO
// role: it is `clara_runtime`-EXECUTE and the runtime credential IS the authority (0017's grant
// block, and `lib/registers/opening-source.ts:7-14` states the same fact from the browser's side
// — the human door refuses a parsed target outright). So the bookkeeper+ floor lives in
// `src/openingRoutes.ts:31-34` for the browser, and it has to live HERE for the chat lane, or a
// viewer could ask Clara for what the route refuses them. The standing owner ruling is that
// access control is never loosened; this is that ruling, in code.
//
// THE MEMBERSHIP READ IS `clara.resolve_chat_principal`, THE RUNTIME'S ONLY MEMBERSHIP SURFACE
// (0006:802-813, EXECUTE to `clara_runtime`) — the same door `lib/authz.mjs`'s `resolvePrincipal`
// reads. It is RESTATED here rather than imported, for the reason `workRoutes.ts:135-141` writes
// out: a frozen file hash-locks its whole transitive relative-import closure, and importing
// `lib/authz.mjs` into this closure would freeze the runtime's auth boundary for every route that
// uses it. One query and one comparison is the smaller cost, and what keeps the restatement
// honest is a cell that DRIVES it: `tests/chat-turn-v22-opening-db.test.mjs` refuses a real
// viewer of a real firm this read and then lets the firm's owner take it, on the same basis.

/** Firm role ranks, mirroring `clara.role_rank` — `src/openingRoutes.ts:30`'s own table. */
const ROLE_RANK: Readonly<Record<string, number>> = Object.freeze({ viewer: 0, bookkeeper: 1, admin: 2, owner: 3 });
/** The floor both opening verbs stand on. */
export const OPENING_SOURCE_ROLE_FLOOR = "bookkeeper";

/** The LIVE principal of the human a turn acts for, as `clara.resolve_chat_principal` answers it.
 *  Null means no ACTIVE membership at all. */
export type LivePrincipalV22 = { firmId: string; role: string } | null;

/**
 * The floor decision, as a pure function so it can be driven without a database.
 *
 * TWO DIFFERENT FACTS, NAMED DIFFERENTLY. A person of this firm below the bookkeeper floor is
 * `insufficient_role` — they exist, they are simply not allowed to author an opening basis. A
 * person with no live membership, or a membership of another firm, is `authority_lost`: the
 * authority this turn borrows is not there at all, which is also what a mid-turn revocation looks
 * like from here.
 */
export function openingFloorRefusal(principal: LivePrincipalV22, firmId: string): ToolRefusalV22 | null {
  if (!principal || principal.firmId !== firmId) {
    return {
      ok: false,
      code: "CLR04",
      reason: "authority_lost",
      fix: "An active member of this firm has to be the one asking.",
      message:
        "The person this conversation acts for is not an active member of this firm, so I cannot read an opening source for it.",
      details: {},
    };
  }
  if ((ROLE_RANK[principal.role] ?? -1) < (ROLE_RANK[OPENING_SOURCE_ROLE_FLOOR] as number)) {
    return {
      ok: false,
      code: "CLR04",
      reason: "insufficient_role",
      fix: "A bookkeeper, admin or owner of this firm reads an opening source, on the client's Registers page or here.",
      message:
        "Reading an opening source is a bookkeeper's act, and this conversation acts for somebody below that floor. Nothing was recorded.",
      details: { role: principal.role, floor: OPENING_SOURCE_ROLE_FLOOR },
    };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// THE CARRIER IS JAVASCRIPT, SO THIS CLOSURE CALLS IT THROUGH TYPED VIEWS — v21's own pattern for
// a `.mjs` dependency (`chatTurn.v21.impl.ts:70-84`), and for the same measured reason: TypeScript
// infers a `.mjs` function's parameter type from its DESTRUCTURING DEFAULTS, so an optional
// `reassert` reads as `undefined` rather than as the guard the module's JSDoc documents. These
// views state the contract the module actually has; they narrow nothing at run time.

type OpeningCoreAnswer = { http: number; body: Record<string, unknown> };

const parseOpeningTargetsTyped = parseOpeningTargets as unknown as (
  client: PgExec,
  args: { seedId: string; firmId: string; reassert?: () => Promise<void> },
) => Promise<OpeningCoreAnswer>;

const readOpeningSeedTyped = readOpeningSeed as unknown as (
  client: PgExec,
  seedId: string,
) => Promise<{ id: string; firm_id: string; client_id: string; state: string } | null>;

/** v19's own `noClientRefusal`, restated for the reason v20 and v21 restated it: exporting it
 *  retroactively would edit a deployed body. Same code, same shape, same sentence structure. */
function noClientRefusalV22(reason: string, message: string): ToolRefusalV22 {
  return {
    ok: false,
    code: "CLR03",
    reason,
    fix: "Open this conversation from the client workspace whose books this belongs to.",
    message,
    details: {},
  };
}

/** The marker a lost authority travels out of the core on. `parseOpeningTargets` re-checks the
 *  caller immediately before the audited write (F-H7) by CALLING the guard the caller supplies,
 *  and a guard can only refuse by throwing — so this is the throw, and it carries no message a
 *  model should read. */
const AUTHORITY_LOST_MARKER = "clara:opening_source_authority_lost";

/** The LIVE firm and role of the human this turn acts for. `clara.resolve_chat_principal` is the
 *  runtime's ONLY membership surface (0006:802-813). A sub with no active membership answers zero
 *  rows, which is `null` here and `authority_lost` above. */
async function liveChatPrincipal(c: PgExec, sub: string): Promise<LivePrincipalV22> {
  const r = await c.query("select firm_id, role from clara.resolve_chat_principal($1)", [sub]);
  const row = (r.rows[0] ?? null) as { firm_id?: unknown; role?: unknown } | null;
  if (!row || typeof row.firm_id !== "string" || typeof row.role !== "string") return null;
  return { firmId: row.firm_id, role: row.role };
}

/**
 * Read an opening basis's tie document into its opening targets, through the SAME core the
 * browser route calls.
 *
 * FOUR WALLS, IN THIS ORDER, AND EACH ONE IS A DIFFERENT QUESTION:
 *   1. the conversation is about a client at all;
 *   2. the client the model named IS that client (v21's provenance wall — silently substituting
 *      the pin would read a document into a basis the model did not name);
 *   3. the person this turn acts for still clears the browser route's bookkeeper+ floor;
 *   4. the basis belongs to that client — answered with the core's OWN masked not-found, so a
 *      basis of another client of the same firm is indistinguishable from one that never existed.
 *
 * Then the core does the rest: it resolves the tie, re-derives every line from the document's own
 * stored regions, re-checks the authority immediately before the audited write, and hands back a
 * typed `{http, body}` this module carries to the model verbatim.
 */
export async function runReadOpeningSource(
  ctx: ToolCtx,
  input: ReadOpeningSourceInput,
): Promise<ReadOpeningSourceResult> {
  if (!ctx.clientId) {
    return noClientRefusalV22(
      "opening_source_needs_client_pin",
      "This conversation is not bound to a client, so there is no opening basis of theirs to read into.",
    );
  }
  if (input.client_id !== ctx.clientId) {
    return {
      ok: false,
      code: "CLR03",
      reason: "client_not_in_conversation",
      fix: "Open this conversation from the client whose opening basis you mean, then ask again.",
      message: "That is not the client this conversation is about, so I will not read an opening source for them here.",
      details: { client_id: input.client_id },
    };
  }
  const clientId = ctx.clientId;
  const ids = { seedId: input.seed_id, clientId };
  const masked = (): ReadOpeningSourceResult =>
    openingSourceOutcome({ http: 404, body: { error: "not_found", message: "not found" } }, ids);
  try {
    return await pools().withRuntime(async (c: PgExec) => {
      const floor = openingFloorRefusal(await liveChatPrincipal(c, ctx.createdBy), ctx.firmId);
      if (floor) return floor;
      // THE BASIS IS THIS CLIENT'S, AND THE REFUSAL IS THE CORE'S OWN 404. The core masks a
      // foreign-FIRM basis; a basis of another CLIENT of the same firm is a conversation-scope
      // question the core never had to ask, and the answer has to be the same shape or the tool
      // becomes an oracle for which of a firm's clients hold an opening basis.
      const seed = await readOpeningSeedTyped(c, input.seed_id);
      if (!seed || seed.firm_id !== ctx.firmId || seed.client_id !== clientId) return masked();
      // F-H7, the route's own guard, restated for this lane: the window between reading the
      // evidence and the audited write must not outlive the authority the read borrows.
      const reassert = async (): Promise<void> => {
        if (openingFloorRefusal(await liveChatPrincipal(c, ctx.createdBy), ctx.firmId)) {
          throw new Error(AUTHORITY_LOST_MARKER);
        }
      };
      const out = await parseOpeningTargetsTyped(c, { seedId: input.seed_id, firmId: ctx.firmId, reassert });
      return openingSourceOutcome(out, ids);
    });
  } catch (error) {
    if (error instanceof Error && error.message === AUTHORITY_LOST_MARKER) {
      return {
        ok: false,
        code: "CLR04",
        reason: "authority_lost",
        fix: "An active bookkeeper of this firm has to be the one asking.",
        message:
          "The authority this read borrows was withdrawn while the document was being read, so nothing was recorded.",
        details: {},
      };
    }
    // ANYTHING ELSE IS A FAULT, NOT A CONSIDERED NO. Every governed refusal the door raises is
    // already classified by the core (`mapOpeningDbError` answers for every CLR SQLSTATE and
    // `mapOpeningFkError` for the chart gap), so what reaches here is a connection, a missing
    // migration or a genuine bug — and none of those is something to tell a professional in the
    // estate's refusal words.
    return internalFaultV22("The opening source could not be read. Nothing was recorded.");
  }
}

// =============================================================================================
// `read_client_financial_pack` — THE CLIENT HOME'S MONEY BAND, AND NOT ONE FIGURE OF IT IS OURS.
//
// #1000. `clara.get_client_financial_pack` (0232, #660) is the ONE read behind the client home's
// money band: BOOK CASH over a governed, versioned cash account set and PERIOD PROFIT over the
// approved ledger, each with the same ten-field envelope, six points of history, its own
// comparison and its own per-account composition. It answers the whole of that in ONE call, and
// this tool's entire job is to carry the answer across unchanged — so Clara and the person
// looking at the client home can never be reading two different numbers.
//
// THE DOOR IS NOT THE HUMAN'S. The read is granted to `clara_authenticated` alone, and this lane
// carries no JWT claims at all, so migration 0320 split the computation into ONE ungranted core
// with two audited entrances and gave this lane its own: `clara.wake_get_client_financial_pack`,
// EXECUTE to `clara_agent_ro` and one `interactive` allowlist row. The credential that reaches it
// is minted ON BEHALF OF the human this turn acts for, and `clara.wake_context` re-validates that
// person as an ACTIVE BOOKKEEPER+ of the firm on every use — a floor STRICTLY ABOVE the viewer
// floor the read itself carries, so nothing was widened to open this lane.
// =============================================================================================

/** The tool name, as the model sees it and as every census counts it. */
export const READ_CLIENT_FINANCIAL_PACK_TOOL = "read_client_financial_pack";

/** A calendar day in the wire shape `p_as_of` and `p_month` take. It pins the SHAPE and nothing
 *  else: whether a month is a first day, whether an as-of is in the future, and whether an as-of
 *  falls inside the named month are the READ'S OWN questions, answered against the client's book
 *  day (`clara.book_today()`) rather than against this process's calendar. */
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The tool's input: a client, and at most two dates. `.strict()`, so a figure, an account code or
 * a set id in the call is REFUSED rather than dropped — a dropped key is how "I read the money
 * band" becomes a number nobody computed.
 */
export const readClientFinancialPackInputSchema = z
  .object({
    client_id: z
      .string()
      .uuid()
      .describe("The client this conversation is about. It must be that client and no other."),
    as_of: z
      .string()
      .regex(CALENDAR_DAY)
      .optional()
      .describe(
        "The day to read to, as YYYY-MM-DD. Leave it out for the client's own current book day. "
        + "A day in the future is refused: there are no actuals for it.",
      ),
    month: z
      .string()
      .regex(CALENDAR_DAY)
      .optional()
      .describe(
        "One named month, given as its FIRST day (YYYY-MM-01). Leave it out for month-to-date. "
        + "Any other day of the month is refused rather than rounded.",
      ),
  })
  .strict();

export type ReadClientFinancialPackInput = z.infer<typeof readClientFinancialPackInputSchema>;

export type ReadClientFinancialPackResult =
  | {
      ok: true;
      status: "read";
      /** The door's OWN envelope, key for key. Never re-shaped, never re-derived, never defaulted:
       *  a NULL `value_cents` means "we do not know", and 0 means "we do". */
      pack: Record<string, unknown>;
    }
  | ToolRefusalV22;

/**
 * THE SENTENCES THE ESTATE HAS FOR THIS LANE, one reason naming one thing.
 *
 * The four CLR10s are the READ'S OWN, and #1000's AC2 is that they reach the model as such: the
 * code and the reason travel verbatim and the whole detail bag rides under `details`, because the
 * dates the door names are the only thing that tells a person what to ask for instead. A sentence
 * is written here only where the token is a fixed machine word the estate can speak about; any
 * other reason is NAMED in the message rather than described, because an invented description is
 * a refusal nobody can trace.
 */
export const CLIENT_FINANCIAL_PACK_REFUSALS: Readonly<Record<string, string>> = Object.freeze({
  invalid_client:
    "I was not given a client to read the money band for.",
  month_not_first_day:
    "A month is named by its first day, and that is not one — so I did not guess which month you meant.",
  as_of_in_future:
    "That day has not happened yet in this client's books, so there are no actuals to report for it.",
  as_of_outside_month:
    "That day falls outside the month you named, and I will not silently read a different period.",
  // The wake ceremony's own three. They are about the CONVERSATION'S authority rather than about
  // the client's figures, and the read is never reached when one of them answers.
  wake_credential_unavailable:
    "I could not open a governed read of this client's figures for this conversation.",
  wake_authority_absent:
    "This read is made on a named person's authority, and this conversation carries none.",
  authority_lost:
    "Reading a client's money band is a bookkeeper's act, and the person this conversation acts "
    + "for is not an active bookkeeper, admin or owner of this firm. Nothing was read.",
  credential_client_pin:
    "This conversation's authority is pinned to a different client, so I will not read this one's figures.",
});

/** The act a PERSON takes next, by reason. Silence is honest where there is nothing to do. */
export const CLIENT_FINANCIAL_PACK_FIXES: Readonly<Record<string, string>> = Object.freeze({
  month_not_first_day: "Name the month by its first day, for example 2026-03-01.",
  as_of_in_future: "Ask again for a day that has already happened in this client's books.",
  as_of_outside_month: "Ask for a day inside the month you named, or drop the month.",
  authority_lost:
    "A bookkeeper, admin or owner of this firm opens the conversation, or the client home shows "
    + "the same figures to anyone who may see them.",
});

/** The typed `detail` a governed refusal carries, or null. A malformed bag is not a crash and not
 *  a swallowed code: the reason becomes null and the code still travels. */
function detailReasonV22(error: { detail?: unknown }): { reason: string | null; bag: Record<string, unknown> } {
  const raw = typeof error.detail === "string" ? error.detail : null;
  if (raw === null) return { reason: null, bag: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { reason: null, bag: {} };
  }
  if (!parsed || typeof parsed !== "object") return { reason: null, bag: {} };
  const bag: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) bag[key] = value;
  const reason = typeof bag.reason === "string" ? bag.reason : null;
  return { reason, bag };
}

/**
 * THE DOOR'S ANSWER, TURNED INTO THE TOOL ENVELOPE — and #1000's AC2 is that nothing is replaced
 * by a generic message on the way.
 *
 * EXPORTED because it is the contract a reviewer has to be able to drive: the door call around it
 * needs a database, this decision does not.
 *
 * THE ONE PLACE A CODE IS TRANSLATED, and it is named rather than hidden. A person who is not an
 * active bookkeeper+ of the firm is refused by `clara.mint_wake_credential` with CLR10 and #630's
 * typed `authority_lost` — BEFORE the read is reached at all, so there is no read refusal to
 * carry. The chat lane's word for a lost or insufficient authority is CLR04 (`chatTurn.v22`'s
 * opening lane answers exactly this shape), and the reason word is the door's own. Everything
 * else keeps the code the database stated.
 */
export function clientFinancialPackRefusal(error: unknown): ToolRefusalV22 {
  const e = (error ?? {}) as { code?: unknown; detail?: unknown };
  const code = typeof e.code === "string" ? e.code : null;
  if (code === null || !/^CLR\d\d$/.test(code)) {
    return internalFaultV22("The money band could not be read. Nothing was reported from it.");
  }
  const { reason, bag } = detailReasonV22(e);
  if (code === "CLR10" && reason === "authority_lost") {
    return {
      ok: false,
      code: "CLR04",
      reason,
      fix: CLIENT_FINANCIAL_PACK_FIXES.authority_lost ?? null,
      message: CLIENT_FINANCIAL_PACK_REFUSALS.authority_lost as string,
      details: bag,
    };
  }
  // A CLR03 with no typed detail is the credential itself — absent, expired, revoked, or of a kind
  // this door is not allowlisted for. It is one state to a model: this conversation cannot make
  // this read right now.
  const named = code === "CLR03" && reason === null ? "wake_credential_unavailable" : reason;
  const sentence = named === null ? null : CLIENT_FINANCIAL_PACK_REFUSALS[named] ?? null;
  return {
    ok: false,
    code,
    reason: named,
    fix: named === null ? null : CLIENT_FINANCIAL_PACK_FIXES[named] ?? null,
    message:
      sentence
      ?? `The money band could not be read: the database refused it (${code}${named ? `, ${named}` : ""}). Nothing was reported.`,
    details: bag,
  };
}

/**
 * Read a client's governed cash/profit pack through the model lane's own door.
 *
 * THREE WALLS, AND THEN THE DATABASE ANSWERS EVERYTHING ELSE:
 *   1. the conversation is about a client at all;
 *   2. the client the model named IS that client (v21's provenance wall — silently substituting
 *      the pin would answer about somebody the model did not name);
 *   3. the wake credential is minted ON BEHALF OF the human this turn acts for, which is what
 *      carries their live firm and their live standing into the read.
 * The firm scope, the role floor, the date rules, the coverage words and every refusal are the
 * door's, and this module adds none of its own.
 */
export async function runReadClientFinancialPack(
  ctx: ToolCtx,
  input: ReadClientFinancialPackInput,
): Promise<ReadClientFinancialPackResult> {
  if (!ctx.clientId) {
    return noClientRefusalV22(
      "client_financial_pack_needs_client_pin",
      "This conversation is not bound to a client, so there is no money band of theirs to read.",
    );
  }
  if (input.client_id !== ctx.clientId) {
    return {
      ok: false,
      code: "CLR03",
      reason: "client_not_in_conversation",
      fix: "Open this conversation from the client whose figures you mean, then ask again.",
      message: "That is not the client this conversation is about, so I will not read their money band here.",
      details: { client_id: input.client_id },
    };
  }
  let row: { pack?: unknown } | null;
  try {
    row = await readScoped(ctx, async (c: PgExec) => {
      const r = await c.query(
        "select clara.wake_get_client_financial_pack("
        + "p_client => $1::uuid, p_as_of => $2::date, p_month => $3::date) as pack",
        [input.client_id, input.as_of ?? null, input.month ?? null],
      );
      return (r.rows[0] ?? null) as { pack?: unknown } | null;
    });
  } catch (error) {
    return clientFinancialPackRefusal(error);
  }
  const pack = row?.pack;
  if (!pack || typeof pack !== "object") {
    return internalFaultV22("The money band could not be read. Nothing can be reported from it.");
  }
  return { ok: true, status: "read", pack: pack as Record<string, unknown> };
}


// =============================================================================================
// `start_trade_invoice_work` — ROSTER ENTRIES A1 (#982) AND A2 (#1007), APPLIED TOGETHER.
//
// v21 already serves this tool. v22 REPLACES it (the name is unchanged: a widened argument is not
// a new act) because two contracts landed on it after v21 was cut, and §1.10 fixes their order:
//
//   A1 · #982 — the TIN resolves a party at the registration number's own tier. The zod change is
//        one `.describe()`; the behaviour change is 0274's, already live in the door.
//   A2 · #1007 — the tool PROBES for a look-alike before it admits, and a match ASKS rather than
//        refuses. The owner's ruling, and the shape `claraWork_v4` has and `chatTurn_v21` does
//        not: an admission-time problem used to be refused outright and the person retried.
//
// THREE DOORS, IN THIS ORDER, AND THE ORDER IS THE CONTRACT:
//   1. `clara.probe_trade_invoice_duplicates_for` — writes nothing, refuses no duplicate, and
//      raises the admission door's OWN party refusals (including `party_identifier_conflict`), so
//      the map needs no token for the probe itself;
//   2. `clara.record_trade_invoice_duplicate_ack` — written BEFORE the admission, under the SAME
//      intent key the admission will use, carrying the ids the PROBE showed;
//   3. `clara.admit_trade_invoice_work` — unchanged, argument order included.
//
// WHY THE SECOND CALL PROBES AGAIN. The acknowledgement records what a person was shown, so the
// list it carries must be what this call measured, not what a previous call measured: between the
// question and the answer another preparer may have recorded one more. Probing twice costs one
// indexed read and keeps the durable row honest.
// =============================================================================================

export type StartTradeInvoiceWorkResultV22 =
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
      /** The acknowledgement this recording rode, when it rode one. NEVER invented: null means
       *  nothing looked like this document, which is a different fact from "nobody was asked". */
      duplicate_ack_id: string | null;
    }
  | ReturnType<typeof duplicateQuestion>
  | ToolRefusalV22;

/** A GOVERNED REFUSAL IS A CLR SQLSTATE, AND NOTHING ELSE IS — v21's `isGovernedRefusalV21`,
 *  restated because a deployed body does not export it. A missing migration, a lost connection and
 *  a privilege error are FAULTS, answered with this lane's own sentence. */
function isGovernedRefusalV22(code: unknown): boolean {
  return typeof code === "string" && /^CLR\d{2}$/.test(code);
}

type DbErrorV22 = { code?: string; message?: string; detail?: string };

/**
 * The database's typed refusal, handed back with THIS cut's sentence when the estate knows the
 * reason and with the door's own message verbatim when it does not.
 *
 * THE MAP IS THE TWENTY-ONE-TOKEN ONE. v21's mapper reads the frozen eighteen, so a
 * `party_identifier_conflict` routed through it would reach the model as the door's raw text
 * rather than as the sentence `apps/web/messages/en.json` already renders on the other surface.
 */
export function tradeInvoiceRefusalFromErrorV22(error: unknown, internalMessage: string): ToolRefusalV22 {
  const refused = authoringRefusal(error as DbErrorV22);
  if (refused.ok !== false) return internalFaultV22(internalMessage);
  if (!isGovernedRefusalV22(refused.code)) return internalFaultV22(internalMessage);
  const reason = refused.reason;
  const known = typeof reason === "string" && isTradeInvoiceRefusalV2(reason);
  return {
    ok: false,
    code: refused.code,
    reason: refused.reason,
    fix: refused.fix,
    message: known ? (TRADE_INVOICE_REFUSALS_V2[reason as string] ?? refused.message) : refused.message,
    details: refused.details,
  };
}

/** Read the chat session this turn belongs to FROM THE TASK, never from a model argument — v18's
 *  rule, carried by every successor since and restated here for the same reason. */
async function sessionOfTaskV22(c: PgExec, taskId: string): Promise<string | null> {
  const t = await c.query("select session_id from clara.agent_tasks where id = $1", [taskId]);
  const row = (t.rows[0] ?? null) as { session_id?: unknown } | null;
  return typeof row?.session_id === "string" ? row.session_id : null;
}

/**
 * THE INTENT KEY OF A TRADE-INVOICE RECORDING, and the one thing it deliberately does NOT hash.
 *
 * `record_anyway` is the PERSON'S ANSWER to the look-alike question, not part of the invoice being
 * recorded: the call that asks and the call that goes ahead are ONE recording, so they must carry
 * ONE key and the admission door's own idempotency can answer the second as a REPLAY.
 *
 * MEASURED, cut-phase adversarial round ADV-C1-01: with the flag hashed in, a retry of an
 * identical call produced a DIFFERENT key, and because the probe also self-matched the invoice the
 * first call had admitted, the retry admitted a SECOND invoice carrying the same reference,
 * document date and total. A duplicate supplier bill is a durable artifact on a client's books;
 * the estate paid for an idempotent admission door precisely so a retry cannot mint one.
 */
export function tradeInvoiceIntentKeyV22(taskId: string, input: StartTradeInvoiceWorkInputV2): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { record_anyway: _answeredTheQuestion, ...recording } = input;
  return stableOpKey(taskId, START_TRADE_INVOICE_WORK_TOOL, recording);
}

export async function runStartTradeInvoiceWorkV22(
  ctx: ToolCtx,
  input: StartTradeInvoiceWorkInputV2,
  modelId: string,
): Promise<StartTradeInvoiceWorkResultV22> {
  if (!ctx.clientId) {
    return noClientRefusalV22(
      "trade_invoice_needs_client_pin",
      "This conversation is not bound to a client, so it cannot record a trade invoice.",
    );
  }
  // The carrier's shape refusals, mapped once. Every reason `localTradeInvoiceRefusal` can answer
  // is a PAYLOAD-shape refusal the door also raises as CLR10, and the sentence is the estate's.
  const local = localTradeInvoiceRefusal(input);
  if (local) {
    const details: Record<string, unknown> = { field: local.field };
    if (local.detail !== undefined) {
      for (const [key, value] of Object.entries(local.detail)) details[key] = value;
    }
    return {
      ok: false,
      code: "CLR10",
      reason: local.reason,
      fix: null,
      // `localTradeInvoiceRefusal` only ever answers a token this map carries; the fallback
      // is the type system asking for one, not a case a reader should expect to see.
      message: TRADE_INVOICE_REFUSALS_V2[local.reason as string] ?? "That trade invoice could not be recorded.",
      details,
    };
  }

  const clientId = ctx.clientId;
  // ONE RECORDING, ONE KEY — `record_anyway` is NOT hashed (see `tradeInvoiceIntentKeyV22`). The
  // acknowledgement this call may write and the admission below ride that same key.
  const intentKey = tradeInvoiceIntentKeyV22(ctx.taskId, input);
  const particulars = tradeInvoiceFromInput(input);
  const basis = journalBasisFromInput(input);
  try {
    return await pools().withRuntime(async (c: PgExec) => {
      // 1 · THE PROBE. It writes nothing and refuses no duplicate; what it CAN raise is the
      //     admission door's own client and party refusals, which reach the model through the
      //     same map by the catch below.
      const probed = await c.query(
        "select clara.probe_trade_invoice_duplicates_for($1::uuid, $2::uuid, $3::text, $4::jsonb) as r",
        [clientId, ctx.createdBy, input.kind, JSON.stringify(particulars)],
      );
      const probe = (probed.rows[0]?.r ?? null) as Record<string, unknown> | null;
      const matchCount = Number((probe ?? {}).match_count ?? 0);
      const shown = shownInvoiceIds(probe);

      // 2 · THE QUESTION, not a refusal. Nothing has been written at this point and nothing needs
      //     undoing: the turn simply hands the person what this client already holds.
      if (matchCount > 0 && input.record_anyway !== true) return duplicateQuestion(probe);

      // 3 · THE ACKNOWLEDGEMENT, under the SAME intent key, BEFORE the admission. It is what lets
      //     a reviewer see months later that the preparer was warned and went ahead.
      let ackId: string | null = null;
      if (matchCount > 0) {
        const acked = await c.query(
          "select clara.record_trade_invoice_duplicate_ack($1::uuid, $2::uuid, $3::text, $4::text,"
          + " $5::jsonb, $6::jsonb) as ack",
          [clientId, ctx.createdBy, intentKey, input.kind, JSON.stringify(particulars), JSON.stringify(shown)],
        );
        const ack = (acked.rows[0]?.ack ?? null) as Record<string, unknown> | null;
        ackId = ack?.ack_id == null ? null : String(ack.ack_id);
      }

      // 4 · THE ADMISSION, unchanged from v21 — argument order included.
      const sessionId = await sessionOfTaskV22(c, ctx.taskId);
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
      const receipt = (r.rows[0]?.r ?? null) as Record<string, unknown> | null;
      if (!receipt || receipt.work_id == null) {
        return internalFaultV22("The trade invoice could not be recorded. Nothing was recorded.");
      }
      return {
        ok: true as const,
        work_accepted: {
          type: "work_accepted" as const,
          work_id: String(receipt.work_id),
          client_id: clientId,
          // THE PURPOSE IS `journal_entry` AND IT IS NOT A PLACEHOLDER — 0225 calls the unchanged
          // `clara._admit_accounting_work_core(..., 'journal_entry', ...)`.
          purpose: "journal_entry" as const,
          logical_op_id: String(receipt.logical_op_id ?? ""),
        },
        task_id: String(receipt.task_id ?? ""),
        status: String(receipt.status ?? "queued"),
        invoice_id: String(receipt.invoice_id ?? ""),
        kind: receipt.kind == null ? input.kind : String(receipt.kind),
        counterparty_id: receipt.counterparty_id == null ? null : String(receipt.counterparty_id),
        due_date: receipt.due_date == null ? null : String(receipt.due_date),
        due_date_source: receipt.due_date_source == null ? null : String(receipt.due_date_source),
        replayed: receipt.replayed === true,
        duplicate_ack_id: ackId,
      };
    });
  } catch (error) {
    return tradeInvoiceRefusalFromErrorV22(error, "The trade invoice could not be recorded.");
  }
}


// =============================================================================================
// `refresh_opening_source` — ROSTER ENTRY A3 (#986), AND THE MATCHED PAIR §1.10 REQUIRES.
//
// A SECOND TOOL BESIDE THE READ, NOT A FLAG ON IT. #986's contract states the reason in one
// sentence: "a model that could pass `{force: true}` to the read would be able to retire a basis's
// targets by accident". Reading a document into a basis and bringing a basis onto a NEWER reading
// of that document are two different acts with two different op keys and two different receipts,
// and only one of them retires lines a person may already have looked at.
//
// THE READ'S OWN MAPPING IS UNCHANGED, AND THAT IS #985'S RE-MEASUREMENT, SATISFIED. A second read
// still answers `409 {status:'conflict', reason:'source_reread_since_parse'}`, because the parse's
// op key is stable per (seed, document) and a retried read can never double a basis. What moved is
// the ACT beside the refusal: `OPENING_SOURCE_FIXES.source_reread_since_parse` now names this tool
// instead of describing a screen.
// =============================================================================================

/** The tool name, as the model sees it and as every census counts it. */
export const REFRESH_OPENING_SOURCE_TOOL = "refresh_opening_source";

/** #986's zod, verbatim: two identifiers and nothing else. The tied document AND the authoritative
 *  reading are both resolved server-side, so an extraction id here could only ever name a reading
 *  the model chose. */
export const refreshOpeningSourceInputSchema = z
  .object({
    client_id: z
      .string()
      .uuid()
      .describe("The client this conversation is about. It must be that client and no other."),
    seed_id: z
      .string()
      .uuid()
      .describe(
        "The opening basis to bring onto the newest reading of its tied document. You never name "
        + "a document, a reading, an account or an amount here.",
      ),
  })
  .strict();

export type RefreshOpeningSourceInput = z.infer<typeof refreshOpeningSourceInputSchema>;

export type RefreshOpeningSourceResult =
  | {
      ok: true;
      status: "refreshed";
      client_id: string;
      seed_id: string;
      /** How many lines the NEWEST reading recorded. The core's own `targets_recorded`. */
      lines: number;
      /** How many lines the EARLIER reading left behind and this act retired. The news, and the
       *  reason #986's contract says "report BOTH numbers". */
      retired: number;
    }
  | ToolRefusalV22;

/** The sentences the estate has for THIS act's own fixed tokens. Every other reason is carried
 *  verbatim, for the reason the read's own map gives: a reason that names this document is the
 *  only actionable thing in the answer. */
export const OPENING_REFRESH_REFUSALS: Readonly<Record<string, string>> = Object.freeze({
  no_reread_to_refresh:
    "There is nothing to refresh on this basis: its lines already cite the newest reading of the "
    + "document. Somebody has already brought it forward.",
  stale_extraction_version:
    "The document was read again while this refresh was being prepared, so nothing was changed. "
    + "The basis still cites the reading it cited before.",
  refresh_extraction_mixed:
    "This refresh cited two different readings of the document, so nothing was changed.",
  registry_not_open:
    "This opening basis is not open for editing, so nothing can be brought onto a newer reading.",
  [OPENING_BASIS_NOT_FOUND]:
    "I cannot see an opening basis with that id for this client.",
});

/** The act a PERSON takes next, never a retry this tool could make. */
export const OPENING_REFRESH_FIXES: Readonly<Record<string, string>> = Object.freeze({
  no_reread_to_refresh:
    "Open the basis on the client's Registers page to see the lines it now holds.",
  stale_extraction_version:
    "Ask again once the document has settled: the refresh always moves the basis onto the newest "
    + "reading, and there is no way to name an older one.",
  registry_not_open:
    "A person reopens the basis on the client's Registers page first.",
  [OPENING_BASIS_NOT_FOUND]:
    "Open the client's Registers page and check the opening basis you mean is the one this conversation is about.",
});

function refreshSentenceFor(reason: string | null, fallback: string): string {
  const sentence = reason === null ? undefined : OPENING_REFRESH_REFUSALS[reason];
  return sentence ?? fallback;
}

function refreshFixFor(reason: string | null, fallback: string | null): string | null {
  const fix = reason === null ? undefined : OPENING_REFRESH_FIXES[reason];
  return fix ?? fallback;
}

/**
 * THE CORE'S OWN ANSWER, TURNED INTO THE TOOL ENVELOPE — #986's eight-row table, verbatim, never
 * replaced by a generic message.
 *
 * EXPORTED because it is the contract a reviewer has to be able to drive: the door call around it
 * needs a database, this decision does not.
 */
export function openingRefreshOutcome(
  out: { http: number; body: Record<string, unknown> },
  ids: { seedId: string; clientId: string },
): RefreshOpeningSourceResult {
  const body = out.body ?? {};
  if (out.http === 202) {
    // BOTH COUNTS OR NEITHER. The core's own ADV-08 rule, restated at this seam: a 202 whose
    // counts are absent is an act that reported nothing, and reporting it as "0 recorded, 0
    // retired" would be a figure nobody measured.
    const lines = typeof body.lines === "number" && Number.isFinite(body.lines) ? body.lines : null;
    const retired = typeof body.retired === "number" && Number.isFinite(body.retired) ? body.retired : null;
    if (lines === null || retired === null) {
      return internalFaultV22(
        "The opening basis refresh returned no counts. Nothing can be reported from it.",
      );
    }
    return { ok: true, status: "refreshed", client_id: ids.clientId, seed_id: ids.seedId, lines, retired };
  }
  if (out.http === 404) {
    return {
      ok: false,
      code: "CLR11",
      reason: OPENING_BASIS_NOT_FOUND,
      fix: OPENING_REFRESH_FIXES[OPENING_BASIS_NOT_FOUND] as string,
      message: OPENING_REFRESH_REFUSALS[OPENING_BASIS_NOT_FOUND] as string,
      details: detailsWithBody(body, ids.seedId),
    };
  }
  if (out.http === 409) {
    const reason = typeof body.reason === "string" ? body.reason : null;
    const code = typeof body.code === "string" ? body.code : "CLR13";
    return {
      ok: false,
      code,
      reason,
      fix: refreshFixFor(reason, null),
      message: refreshSentenceFor(
        reason,
        `The opening basis could not be refreshed: the database refused it (${code}${reason ? `, ${reason}` : ""}). Nothing was changed.`,
      ),
      details: detailsWithBody(body, ids.seedId),
    };
  }
  if (out.http === 422) {
    const reason = typeof body.reason === "string" ? body.reason : null;
    return {
      ok: false,
      code: "unparseable",
      reason,
      fix: refreshFixFor(reason, ALL_OR_NOTHING_FIX),
      message: refreshSentenceFor(
        reason,
        `The newest reading could not be read: ${reason ?? "the document could not be read"}. `
          + "Nothing was changed — one unreadable line forfeits the whole document, because a "
          + "partial opening basis is worse than none.",
      ),
      details: detailsWithBody(body, ids.seedId),
    };
  }
  return internalFaultV22("The opening basis could not be refreshed. Nothing was changed.");
}

const refreshOpeningTargetsTyped = refreshOpeningTargets as unknown as (
  client: PgExec,
  args: { seedId: string; firmId: string; reassert?: () => Promise<void> },
) => Promise<OpeningCoreAnswer>;

/**
 * Bring an opening basis onto the NEWEST reading of its tied document, through the same core the
 * browser route calls.
 *
 * THE SAME FOUR WALLS THE READ STANDS BEHIND, and on the SAME floor: retiring lines a person may
 * already have looked at is strictly more than recording lines, so the bookkeeper+ floor is the
 * one that applies and nothing here is looser.
 */
export async function runRefreshOpeningSource(
  ctx: ToolCtx,
  input: RefreshOpeningSourceInput,
): Promise<RefreshOpeningSourceResult> {
  if (!ctx.clientId) {
    return noClientRefusalV22(
      "opening_source_needs_client_pin",
      "This conversation is not bound to a client, so there is no opening basis of theirs to refresh.",
    );
  }
  if (input.client_id !== ctx.clientId) {
    return {
      ok: false,
      code: "CLR03",
      reason: "client_not_in_conversation",
      fix: "Open this conversation from the client whose opening basis you mean, then ask again.",
      message: "That is not the client this conversation is about, so I will not refresh an opening basis for them here.",
      details: { client_id: input.client_id },
    };
  }
  const clientId = ctx.clientId;
  const ids = { seedId: input.seed_id, clientId };
  const masked = (): RefreshOpeningSourceResult =>
    openingRefreshOutcome({ http: 404, body: { error: "not_found", message: "not found" } }, ids);
  try {
    return await pools().withRuntime(async (c: PgExec) => {
      const floor = openingFloorRefusal(await liveChatPrincipal(c, ctx.createdBy), ctx.firmId);
      if (floor) return floor;
      const seed = await readOpeningSeedTyped(c, input.seed_id);
      if (!seed || seed.firm_id !== ctx.firmId || seed.client_id !== clientId) return masked();
      const reassert = async (): Promise<void> => {
        if (openingFloorRefusal(await liveChatPrincipal(c, ctx.createdBy), ctx.firmId)) {
          throw new Error(AUTHORITY_LOST_MARKER);
        }
      };
      const out = await refreshOpeningTargetsTyped(c, { seedId: input.seed_id, firmId: ctx.firmId, reassert });
      return openingRefreshOutcome(out, ids);
    });
  } catch (error) {
    if (error instanceof Error && error.message === AUTHORITY_LOST_MARKER) {
      return {
        ok: false,
        code: "CLR04",
        reason: "authority_lost",
        fix: "An active bookkeeper of this firm has to be the one asking.",
        message:
          "The authority this refresh borrows was withdrawn while the document was being read, so nothing was changed.",
        details: {},
      };
    }
    return internalFaultV22("The opening basis could not be refreshed. Nothing was changed.");
  }
}


// =============================================================================================
// `start_staff_expense_claim_work` — ROSTER ENTRY A5 (#931): one claim, several advances.
//
// v20 serves this tool and v22 REPLACES it under the same name. The door is UNCHANGED, argument
// order included; what widened is `p_claim`, which now carries the allocation list migration 0301
// reads. `stableOpKey` hashes the list too, which is correct rather than unfortunate: a different
// split is a different claim, and the door answers `intent_payload_conflict` for the same key with
// a changed one.
//
// THE THING THE TOOL WILL NOT DO IS DECIDE. A split of two or more lines is refused locally,
// before any round trip, until `allocations_confirmed` says a person agreed to it — and the
// refusal hands the model the exact list to read back. Proposing one is
// `proposeAllocationsByDate`'s job and only ever a proposal.
// =============================================================================================

export type StartStaffExpenseClaimWorkResultV22 =
  | {
      ok: true;
      work_accepted: WorkAcceptedPartV19;
      task_id: string;
      status: string;
      claim_id: string;
      replayed: boolean;
    }
  | ToolRefusalV22;

/**
 * THE INTENT KEY OF A STAFF-CLAIM RECORDING. Same law as `tradeInvoiceIntentKeyV22`, same reason:
 * `allocations_confirmed` is the conversation, not the claim. `claimFromInputV2` already strips it
 * from `p_claim`, so two calls differing only in the flag send a BYTE-IDENTICAL payload — and
 * `clara.admit_staff_expense_claim_work` carries no `_reserve_op` and no unique index on the
 * claim's own shape (measured, cut-phase adversarial round ADV-C1-07), so the intent key is the
 * only thing between one claim and two Works.
 */
export function claimIntentKeyV22(taskId: string, input: StartStaffExpenseClaimWorkInputV2): string {
  const recording: Record<string, unknown> = { ...input };
  delete recording.allocations_confirmed;
  return stableOpKey(taskId, START_STAFF_EXPENSE_CLAIM_WORK_TOOL, recording);
}

export async function runStartStaffExpenseClaimWorkV22(
  ctx: ToolCtx,
  input: StartStaffExpenseClaimWorkInputV2,
  modelId: string,
): Promise<StartStaffExpenseClaimWorkResultV22> {
  if (!ctx.clientId) {
    return noClientRefusalV22(
      "staff_claim_needs_client_pin",
      "This conversation is not bound to a client, so it cannot start a staff expense claim.",
    );
  }
  const local = localClaimRefusalV2(input);
  if (local) return local;

  const clientId = ctx.clientId;
  const intentKey = claimIntentKeyV22(ctx.taskId, input);
  const claim = claimFromInputV2(input);
  try {
    const receipt = await pools().withRuntime(async (c: PgExec) => {
      const sessionId = await sessionOfTaskV22(c, ctx.taskId);
      const sourceRefs = [{ kind: "chat_task", task_id: ctx.taskId, session_id: sessionId }];
      const r = await c.query(
        "select clara.admit_staff_expense_claim_work($1::uuid, $2::uuid, $3::text, $4::jsonb,"
        + " $5::text, $6::jsonb, $7::text) as r",
        [
          clientId,
          ctx.createdBy,
          intentKey,
          JSON.stringify(claim),
          "clara_interpreted",
          JSON.stringify(sourceRefs),
          modelId,
        ],
      );
      return (r.rows[0]?.r ?? null) as Record<string, unknown> | null;
    });
    if (!receipt || receipt.work_id == null) {
      return internalFaultV22("The staff expense claim could not be started. Nothing was recorded.");
    }
    return {
      ok: true,
      work_accepted: {
        type: "work_accepted",
        work_id: String(receipt.work_id),
        client_id: clientId,
        // THE PURPOSE IS `journal_entry`, AND IT IS NOT A PLACEHOLDER — 0221's amendment rules
        // that a claim rides the existing purpose; `clara.get_work_claim_origin` is what labels it
        // as a claim on the Work surfaces, never a purpose value. #931 adds no wire kind.
        purpose: "journal_entry",
        logical_op_id: String(receipt.logical_op_id ?? ""),
      },
      task_id: String(receipt.task_id ?? ""),
      status: String(receipt.status ?? "queued"),
      claim_id: String(receipt.claim_id ?? ""),
      replayed: receipt.replayed === true,
    };
  } catch (error) {
    // The door's typed refusal, carried with its OWN message: 0301 attaches `shortfall_cents`,
    // `outstanding_cents`, `boundary_date` and the `advance_id` to `advance_allocation_mismatch`,
    // so the model can say exactly how many sen to move off which advance without a second read.
    const refused = authoringRefusal(error as DbErrorV22);
    if (refused.ok !== false || !isGovernedRefusalV22(refused.code)) {
      return internalFaultV22("The staff expense claim could not be started.");
    }
    return {
      ok: false,
      code: refused.code,
      reason: refused.reason,
      fix: refused.fix,
      message: refused.message,
      details: refused.details,
    };
  }
}


// =============================================================================================
// `start_accrual_work` — ROSTER ENTRIES A6 (#937) AND A7 (#942), CONSUMED TOGETHER.
//
// `reports/wave4-lane03-fix.md`: "The cut must consume BOTH together: #937's `period_amounts` key
// and #942's `side` key land on the same `p_accrual` jsonb." The door's ARITY IS UNCHANGED — the
// same twelve arguments in the same order — and only `p_accrual`'s shape widens.
// =============================================================================================

export type StartAccrualWorkResultV22 =
  | {
      ok: true;
      work_accepted: WorkAcceptedPartV19 | null;
      accrual_id: string;
      plan_id: string;
      occurrence_due_on: string | null;
      replayed: boolean;
    }
  | ToolRefusalV22;

/** The occurrence an accrual configuration admitted, or null. A future-dated authority has no
 *  occurrence yet and the tool must not invent a Work id for one. v20's own helper, restated
 *  because a deployed body does not export it. */
function occurrenceOfV22(receipt: Record<string, unknown>): Record<string, unknown> | null {
  const raw = receipt.occurrence;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function occurrenceLogicalOpIdV22(occurrence: Record<string, unknown>): string {
  if (occurrence.logical_op_id != null) return String(occurrence.logical_op_id);
  const outcome = occurrence.outcome;
  if (outcome && typeof outcome === "object" && !Array.isArray(outcome)) {
    const inner = (outcome as Record<string, unknown>).logical_op_id;
    if (inner != null) return String(inner);
  }
  return "";
}

export async function runStartAccrualWorkV22(
  ctx: ToolCtx,
  input: StartAccrualWorkInputV2,
): Promise<StartAccrualWorkResultV22> {
  if (!ctx.clientId) {
    return noClientRefusalV22(
      "accrual_work_needs_client_pin",
      "This conversation is not bound to a client, so it cannot configure an accrual.",
    );
  }
  const local = localAccrualRefusalV2(input);
  if (local) return local;

  const clientId = ctx.clientId;
  const opKey = stableOpKey(ctx.taskId, START_ACCRUAL_WORK_TOOL, input);
  const accrual = accrualFromInputV2(input);
  const authorityRef = { kind: "accounting_work", id: input.authority_work_id };
  try {
    const receipt = await pools().withRuntime(async (c: PgExec) => {
      const r = await c.query(
        "select clara.create_accrual_adjustment_for($1::uuid, $2::uuid, $3::text, $4::jsonb,"
        + " $5::jsonb, $6::text, $7::text, $8::int, $9::text, $10::date, $11::date, $12::text) as r",
        [
          clientId,
          ctx.createdBy,
          input.purpose,
          JSON.stringify(authorityRef),
          JSON.stringify(accrual),
          input.frequency,
          input.day_rule,
          input.day_of_month ?? null,
          ACCRUAL_TIMEZONE,
          input.effective_from,
          input.effective_to,
          opKey,
        ],
      );
      return (r.rows[0]?.r ?? null) as Record<string, unknown> | null;
    });
    if (!receipt || receipt.accrual_id == null) {
      return internalFaultV22("The accrual could not be configured. Nothing was recorded.");
    }
    const occurrence = occurrenceOfV22(receipt);
    const workId = occurrence && occurrence.work_id != null ? String(occurrence.work_id) : "";
    return {
      ok: true,
      work_accepted:
        workId === ""
          ? null
          : {
              type: "work_accepted",
              work_id: workId,
              client_id: clientId,
              // 0193's `_plan_admit_occurrence` admits every occurrence through
              // `clara.admit_journal_work` with `adjustment_basis` NULL.
              purpose: "journal_entry",
              logical_op_id: occurrence === null ? "" : occurrenceLogicalOpIdV22(occurrence),
            },
      accrual_id: String(receipt.accrual_id),
      plan_id: String(receipt.plan_id ?? ""),
      occurrence_due_on: occurrence && occurrence.due_date != null ? String(occurrence.due_date) : null,
      replayed: receipt.replayed === true,
    };
  } catch (error) {
    const refused = authoringRefusal(error as DbErrorV22);
    if (refused.ok !== false || !isGovernedRefusalV22(refused.code)) {
      return internalFaultV22("The accrual could not be configured.");
    }
    // #942's four (`accrual_side_immutable`, and the two changed-shape
    // `accrual_account_relationship` constraints) get this cut's sentence; everything else keeps
    // the door's own words, which is what v20 did for all of them.
    const reason = refused.reason;
    const sided = reason === "accrual_side_immutable" || reason === "accrual_account_relationship";
    return {
      ok: false,
      code: refused.code,
      reason: refused.reason,
      fix: refused.fix,
      message: sided ? accrualRefusalMessageV2(String(reason), refused.details) : refused.message,
      details: refused.details,
    };
  }
}


// =============================================================================================
// `start_prepayment_schedule_work` and `start_revenue_recognition_work` — ROSTER ENTRIES A8
// (#915) AND A9 (#941), APPLIED IN THAT ORDER because #941 copies #915's shape.
//
// ONE CHANGE THE TWO CARRIERS' FOOTERS BOTH NEEDED: the door is the OBO TWIN. A `clara_runtime`
// connection carries no JWT claims (`lib/pools.mjs` issues `set role clara_runtime` and two
// timeouts), so `clara._human_ctx` raises CLR04 on every human door, and a tool over one could
// only ever answer a grant refusal. `p_author` is the HUMAN this turn acts for — `ctx.createdBy`,
// the same value every other OBO tool in this closure passes — never the agent user id and never
// the task id.
//
// WHAT NEITHER TOOL DOES, AND BOTH ARE BOUND BY:
//   · D1 (#939) — the model NEVER supplies a service period. Neither input has anywhere to put
//     one, and `clara.record_prepayment_stated_term` holds no agent grant and no wake wrapper by
//     ruling. A migration minting that grant must not be written.
//   · D2 (#940) — the model NEVER enrols an account and never proposes which account to enrol.
//     `clara.enrol_prepayment_account` is `clara_authenticated`-only with no wake wrapper, asserted
//     by `pg_proc` count in 0315's §TAIL, and the not-enrolled refusal names the PANEL instead.
//
// WHAT A PARKED ENROLMENT QUESTION WOULD HAVE NEEDED, AND WHY IT IS NOT HERE. #915 item 3 and
// #941 item 3 both ask for the refusal to open a Work question. `clara.open_work_question` needs a
// RUNNING task (0184:1643) and a hook token minted by a Work run; the schedule doors are reached
// from the CHAT lane, where no Work exists at the moment the refusal arrives. So the chat half
// does what it can honestly do — says which account, names the panel, and stops — and the parked
// question is recorded as a follow-up rather than approximated.
// =============================================================================================

export type StartPrepaymentScheduleWorkResult =
  | { ok: true; status: "configured"; schedule: PrepaymentSchedulePart; replayed: boolean }
  | ToolRefusalV22;

export type StartRevenueRecognitionWorkResult =
  | { ok: true; status: "configured"; schedule: RevenueRecognitionPart; replayed: boolean }
  | ToolRefusalV22;

/** The refusal envelope for both schedule lanes: the door's typed `(code, detail.reason)` with the
 *  carrier's own sentence, and a FAULT for anything that is not a governed refusal. */
function scheduleRefusal(
  error: unknown,
  sentence: (reason: string, detail: Record<string, unknown>) => string,
  internalMessage: string,
): ToolRefusalV22 {
  const refused = authoringRefusal(error as DbErrorV22);
  if (refused.ok !== false) return internalFaultV22(internalMessage);
  if (!isGovernedRefusalV22(refused.code)) return internalFaultV22(internalMessage);
  const reason = typeof refused.reason === "string" ? refused.reason : null;
  return {
    ok: false,
    code: refused.code,
    reason: refused.reason,
    fix: refused.fix,
    message: reason === null ? refused.message : sentence(reason, refused.details),
    details: refused.details,
  };
}

export async function runStartPrepaymentScheduleWork(
  ctx: ToolCtx,
  input: StartPrepaymentScheduleWorkInput,
): Promise<StartPrepaymentScheduleWorkResult> {
  if (!ctx.clientId) {
    return noClientRefusalV22(
      "prepayment_schedule_needs_client_pin",
      "This conversation is not bound to a client, so it cannot configure an amortisation schedule.",
    );
  }
  const local = localPrepaymentRefusal(input);
  if (local) {
    return {
      ok: false,
      code: "CLR10",
      reason: local.refusal,
      fix: null,
      message: local.message,
      details: local.axis === undefined ? {} : { axis: local.axis },
    };
  }
  const clientId = ctx.clientId;
  const opKey = stableOpKey(ctx.taskId, START_PREPAYMENT_SCHEDULE_WORK_TOOL, input);
  const payload = prepaymentDoorPayload(input, { clientId, taskId: ctx.taskId, opKey });
  try {
    const answer = await pools().withRuntime(async (c: PgExec) => {
      const r = await c.query(
        "select clara.create_prepayment_schedule_for("
        + "p_client          => $1::uuid, "
        + "p_author          => $2::uuid, "
        + "p_source_entry    => $3::uuid, "
        + "p_expense_account => $4::text, "
        + "p_expense_basis   => $5::text, "
        + "p_purpose         => $6::text, "
        + "p_authority_ref   => $7::jsonb, "
        + "p_op_key          => $8::text) as r",
        [
          payload.p_client,
          ctx.createdBy,
          payload.p_source_entry,
          payload.p_expense_account,
          payload.p_expense_basis,
          payload.p_purpose,
          JSON.stringify(payload.p_authority_ref),
          payload.p_op_key,
        ],
      );
      return (r.rows[0]?.r ?? null) as Record<string, unknown> | null;
    });
    if (!answer || answer.schedule_id == null) {
      return internalFaultV22("The amortisation schedule could not be configured. Nothing was recorded.");
    }
    return {
      ok: true,
      status: "configured",
      schedule: prepaymentSchedulePart(answer),
      replayed: answer.replayed === true,
    };
  } catch (error) {
    return scheduleRefusal(
      error,
      prepaymentRefusalMessage,
      "The amortisation schedule could not be configured.",
    );
  }
}

export async function runStartRevenueRecognitionWork(
  ctx: ToolCtx,
  input: StartRevenueRecognitionWorkInput,
): Promise<StartRevenueRecognitionWorkResult> {
  if (!ctx.clientId) {
    return noClientRefusalV22(
      "revenue_recognition_needs_client_pin",
      "This conversation is not bound to a client, so it cannot configure a recognition schedule.",
    );
  }
  const local = localRecognitionRefusal(input);
  if (local) {
    return {
      ok: false,
      code: "CLR10",
      reason: local.refusal,
      fix: null,
      message: local.message,
      details: local.axis === undefined ? {} : { axis: local.axis },
    };
  }
  const clientId = ctx.clientId;
  const opKey = stableOpKey(ctx.taskId, START_REVENUE_RECOGNITION_WORK_TOOL, input);
  const payload = recognitionDoorPayload(input, { clientId, taskId: ctx.taskId, opKey });
  try {
    const answer = await pools().withRuntime(async (c: PgExec) => {
      // `p_pattern` IS NOT SENT. It defaults to `straight_line` and 0308 offers no other value, so
      // an argument here could only ever produce a refusal (#941's own contract).
      const r = await c.query(
        "select clara.create_revenue_recognition_schedule_for("
        + "p_client          => $1::uuid, "
        + "p_author          => $2::uuid, "
        + "p_source_entry    => $3::uuid, "
        + "p_revenue_account => $4::text, "
        + "p_revenue_basis   => $5::text, "
        + "p_purpose         => $6::text, "
        + "p_authority_ref   => $7::jsonb, "
        + "p_op_key          => $8::text) as r",
        [
          payload.p_client,
          ctx.createdBy,
          payload.p_source_entry,
          payload.p_revenue_account,
          payload.p_revenue_basis,
          payload.p_purpose,
          JSON.stringify(payload.p_authority_ref),
          payload.p_op_key,
        ],
      );
      return (r.rows[0]?.r ?? null) as Record<string, unknown> | null;
    });
    if (!answer || answer.schedule_id == null) {
      return internalFaultV22("The recognition schedule could not be configured. Nothing was recorded.");
    }
    return {
      ok: true,
      status: "configured",
      schedule: revenueRecognitionPart(answer),
      replayed: answer.replayed === true,
    };
  } catch (error) {
    return scheduleRefusal(
      error,
      recognitionRefusalMessage,
      "The recognition schedule could not be configured.",
    );
  }
}


// =============================================================================================
// `read_payroll_fact_state` — ROSTER ENTRY A11 (#945).
//
// CLASS A RATHER THAN CLASS C, AND THE DIFFERENCE IS A MEASUREMENT. The four payroll and tenancy
// contracts of #946-#949 were deferred because their doors are `clara_authenticated`-only. This
// one reaches `clara.get_document_extract`, which carries `clara_agent_ro` as well, so `readScoped`
// can execute it — measured on the lane database at this cut, not transcribed.
//
// EVERY FIGURE IS BANKED, NOT RECOMPUTED. The reader wrote `payroll_state` into the extraction's
// own envelope; this tool parses it out and hands it over. It adds nothing up and applies no
// statutory rate, and a figure the state left null stays null — `Number(null)` is 0, and that
// coercion is the exact defect the stanza forbids in words.
// =============================================================================================

/** The tool name, as the model sees it and as every census counts it. */
export const READ_PAYROLL_FACT_STATE_TOOL = "read_payroll_fact_state";

export const readPayrollFactStateInputSchema = z
  .object({
    client_id: z
      .string()
      .uuid()
      .describe("The client this conversation is about. It must be that client and no other."),
    document_id: z
      .string()
      .uuid()
      .describe("The payroll summary document to read back. Never a figure and never an employee."),
  })
  .strict();

export type ReadPayrollFactStateInput = z.infer<typeof readPayrollFactStateInputSchema>;

export type ReadPayrollFactStateResult =
  | {
      ok: true;
      status: "read";
      client_id: string;
      document_id: string;
      state: PayrollFactState;
      regions: PayrollRegion[];
    }
  | ToolRefusalV22;

/** The document's own reading status, for the `payroll_not_read` sentence. It NAMES the status
 *  rather than guessing, and a read that cannot answer leaves it null rather than inventing one. */
async function documentReadingStatus(c: PgExec, documentId: string, clientId: string): Promise<string | null> {
  try {
    const r = await c.query("select clara.get_document_state($1::uuid, $2::uuid) as s", [documentId, clientId]);
    const state = (r.rows[0]?.s ?? null) as Record<string, unknown> | null;
    const status = state?.status ?? state?.state;
    return status == null ? null : String(status);
  } catch {
    return null;
  }
}

/**
 * Read a payroll summary's banked fact state back.
 *
 * TWO WALLS AND THEN THE DOOR: the conversation is about a client at all, and the client the model
 * named IS that client (v21's provenance wall). The firm scope, the role floor and the not-found
 * masking are `clara.get_document_extract`'s own, and this module adds none of its own.
 */
export async function runReadPayrollFactState(
  ctx: ToolCtx,
  input: ReadPayrollFactStateInput,
): Promise<ReadPayrollFactStateResult> {
  if (!ctx.clientId) {
    return noClientRefusalV22(
      "payroll_fact_state_needs_client_pin",
      "This conversation is not bound to a client, so there is no payroll summary of theirs to read.",
    );
  }
  if (input.client_id !== ctx.clientId) {
    return {
      ok: false,
      code: "CLR03",
      reason: "client_not_in_conversation",
      fix: "Open this conversation from the client whose payroll summary you mean, then ask again.",
      message: "That is not the client this conversation is about, so I will not read their payroll summary here.",
      details: { client_id: input.client_id },
    };
  }
  const clientId = ctx.clientId;
  try {
    return await readScoped(ctx, async (c: PgExec) => {
      // THE DOOR IS SPELLED HERE, LITERALLY, rather than interpolated from the carrier's constant:
      // a source pin that reads an identifier proves nothing about the statement that ships, and
      // this file is the one a reviewer greps for the verb it calls.
      const r = await c.query(
        "select clara.get_document_extract($1::uuid, $2::uuid, $3::int) as extract",
        [input.document_id, clientId, PAYROLL_EXTRACT_MAX_CHARS],
      );
      const extract = (r.rows[0]?.extract ?? null) as unknown;
      const parsed = payrollFactStateFromExtract(extract);
      if (!parsed.ok) {
        const status = await documentReadingStatus(c, input.document_id, clientId);
        return {
          ok: false as const,
          code: "CLR11",
          reason: "payroll_not_read",
          fix: "The reading runs on its own; ask again once it has finished, or ask a person to look at the document page.",
          message: payrollNotReadMessage(status),
          details: status === null ? {} : { reading_status: status },
        };
      }
      return {
        ok: true as const,
        status: "read" as const,
        client_id: clientId,
        document_id: input.document_id,
        state: parsed.state,
        regions: parsed.regions,
      };
    });
  } catch (error) {
    const refused = authoringRefusal(error as DbErrorV22);
    if (refused.ok !== false || !isGovernedRefusalV22(refused.code)) {
      return internalFaultV22("That payroll summary could not be read.");
    }
    const mapped = payrollReadRefusal(String(refused.code), refused.reason);
    return {
      ok: false,
      code: mapped.code,
      reason: mapped.reason,
      fix: refused.fix,
      message: mapped.message,
      details: refused.details,
    };
  }
}

export function buildToolsV22(ctx: ToolCtx, modelId: string, segment: number) {
  return Object.assign({}, buildToolsV21(ctx, modelId, segment), {
    // A1 + A2 — the SAME NAME v21 serves, REPLACED rather than added. `Object.assign` takes the
    // later value, so this entry supersedes v21's; the name is unchanged because a widened
    // argument and a question before a write are not a new act.
    [START_TRADE_INVOICE_WORK_TOOL]: tool({
      description:
        "Start an accounting Work that records ONE trade invoice for the client pinned to this "
        + "conversation: a SALES INVOICE this client issued to a customer, or a SUPPLIER BILL this "
        + "client received from a vendor. Amounts are integer CENTS. A credit note is NEITHER — say "
        + "so rather than negating an invoice. Give the party exactly as the document states it (or "
        + "the counterparty id when you know it); Clara never creates a party. The registration "
        + "number AND the tax identification number both RESOLVE a party, at the same tier: give "
        + "whichever the document prints, and if they name two different parties the answer says "
        + "so and you ask which one it is. Give the document date, the document's own reference, "
        + "the stated total, and the journal basis with EXACTLY ONE control-account leg of the "
        + "domain the kind names. Give the due date only when the document STATES one. BEFORE IT "
        + "RECORDS, CLARA LOOKS for a document this client already holds that looks like this one; "
        + "if she finds any, she gives them back to you instead of recording, and you show the "
        + "person what she found and ask. Only set `record_anyway` after they have said to go "
        + "ahead. This does NOT post the entry — it queues durable Work that posts it under the "
        + "human's own authority, rechecked at commit. Say you have QUEUED it.",
      inputSchema: startTradeInvoiceWorkInputSchemaV2,
      execute: (input: StartTradeInvoiceWorkInputV2) => runStartTradeInvoiceWorkV22(ctx, input, modelId),
    }),
    [READ_CLIENT_FINANCIAL_PACK_TOOL]: tool({
      description:
        "Read this client's MONEY BAND — the same book cash and period profit the client home "
        + "shows, with their coverage, their six months of history and their comparison against "
        + "the period before. You name the client and, if you want a particular period, an as-of "
        + "day and/or one named month by its first day; month-to-date is what you get by naming "
        + "neither. Every figure comes back computed: report what the answer says and never work "
        + "one out yourself, never add the parts up, and never call a figure that came back empty "
        + "zero — an empty cash figure means nobody has said which accounts are cash yet.",
      inputSchema: readClientFinancialPackInputSchema,
      execute: (input: ReadClientFinancialPackInput) => runReadClientFinancialPack(ctx, input),
    }),
    [READ_PAYROLL_FACT_STATE_TOOL]: tool({
      description:
        "Read back what a PAYROLL SUMMARY document says, as the reader banked it: the run totals "
        + "it established, the ones two readings disagreed about, and the ones the page simply "
        + "does not print. Report ONLY what comes back. Every figure is either a rendering the "
        + "page printed or a sum the database computed from quoted rows — you add nothing up and "
        + "you never apply a statutory rate. A FIGURE THE PAGE DOES NOT PRINT IS NOT ZERO: say the "
        + "page does not print it. The per-employee rows are not stored and you cannot report one.",
      inputSchema: readPayrollFactStateInputSchema,
      execute: (input: ReadPayrollFactStateInput) => runReadPayrollFactState(ctx, input),
    }),
    [START_PREPAYMENT_SCHEDULE_WORK_TOOL]: tool({
      description:
        "Configure the AMORTISATION of a prepayment the client has already recognised: a posted "
        + "entry that put a cost into a prepaid asset, charged out over the period it covers. You "
        + "name the POSTED entry, WHICH expense account each period's charge is booked to and WHY "
        + "that account, and the schedule's purpose — and nothing else. There is no amount, no "
        + "term, no dates and no cadence here, deliberately: the database derives every one of "
        + "them from the entry's own prepaid leg and the service period a PERSON recorded. You "
        + "never state a service period. If it refuses because nothing records the period, say so "
        + "and ask a person for the first and last day it covers; if it refuses because the "
        + "account is not enrolled, say which account and point at the client's Registers page — "
        + "you never enrol one and never propose which to enrol. This CONFIGURES a schedule and "
        + "posts nothing; each period's own Work puts it on the books.",
      inputSchema: startPrepaymentScheduleWorkInputSchema,
      execute: (input: StartPrepaymentScheduleWorkInput) => runStartPrepaymentScheduleWork(ctx, input),
    }),
    [START_REVENUE_RECOGNITION_WORK_TOOL]: tool({
      description:
        "Configure the RECOGNITION of revenue a customer has paid ahead for: a posted entry that "
        + "put the receipt into a deferred-revenue liability, released to income over the period "
        + "it covers. You name the POSTED entry, WHICH income account each period credits and WHY "
        + "that account, and the schedule's purpose — and nothing else. No amount, no dates, no "
        + "cadence and no pattern: the database derives all of them, and a service period is a "
        + "person's to state, never yours. If it refuses because the account is not enrolled as a "
        + "deferred-revenue account, say which account and point at the client's Registers page — "
        + "you never enrol one. This CONFIGURES a schedule and posts nothing; say what WILL be "
        + "recognised, never that anything has been.",
      inputSchema: startRevenueRecognitionWorkInputSchema,
      execute: (input: StartRevenueRecognitionWorkInput) => runStartRevenueRecognitionWork(ctx, input),
    }),
    [START_ACCRUAL_WORK_TOOL]: tool({
      description:
        "Configure an ACCRUAL for the client pinned to this conversation. AN ACCRUAL RUNS ONE OF "
        + "TWO WAYS and you must be sure which: `side: \"expense\"` is a cost the period incurred "
        + "that nobody has billed yet; `side: \"revenue\"` is work the firm has DELIVERED and not "
        + "yet invoiced, which sits in an accrued-income asset. If the accountant has not said "
        + "which, ASK — never infer it from the account they named. Amounts are integer CENTS. The "
        + "service period and the authority window are the HUMAN's, never a period you read out of "
        + "a document. When the amount VARIES BY PERIOD, use `method: \"stated_period_amount\"` "
        + "with one `period_amounts` entry per due date and `amount_cents` as the window's TOTAL; "
        + "if you do not have a figure for a period the schedule reaches, ask for it by date — "
        + "never average, never carry a period forward, never read one off a document. This "
        + "configures a schedule and may admit the current period's Work; it posts nothing itself.",
      inputSchema: startAccrualWorkInputSchemaV2,
      execute: (input: StartAccrualWorkInputV2) => runStartAccrualWorkV22(ctx, input),
    }),
    [START_STAFF_EXPENSE_CLAIM_WORK_TOOL]: tool({
      description:
        "Start an accounting Work that records ONE staff expense claim for the client pinned to "
        + "this conversation. Amounts are integer CENTS. Say how it is settled: reimbursement, "
        + "already settled, or applied against a staff advance. ONE CLAIM MAY COME OFF SEVERAL "
        + "ADVANCES: when the human names more than one, give `advance_allocations` — one line per "
        + "advance with how many sen come off each, adding up to the claim exactly — read the split "
        + "back to them in ringgit and sen, and only then set `allocations_confirmed`. NEVER decide "
        + "a split on your own: this register records the list that was CONFIRMED and refuses a "
        + "silent first-in-first-out. For a single advance, `advance_id` alone is the same claim. "
        + "This does NOT post the entry — it queues durable Work that posts it under the human's "
        + "own authority, rechecked at commit. Say you have QUEUED it.",
      inputSchema: startStaffExpenseClaimWorkInputSchemaV2,
      execute: (input: StartStaffExpenseClaimWorkInputV2) =>
        runStartStaffExpenseClaimWorkV22(ctx, input, modelId),
    }),
    [REFRESH_OPENING_SOURCE_TOOL]: tool({
      description:
        "Bring one of this client's OPENING BASES onto the NEWEST reading of the document already "
        + "bound to it, retiring the lines the earlier reading left. Use this — and never a second "
        + "read — when reading refuses because the document has been read again: a second read is "
        + "refused on purpose and will refuse again. You name only the basis; the document and the "
        + "reading are both the database's. Report BOTH figures it returns, how many lines were "
        + "recorded and how many were retired, and never a figure you did not get back.",
      inputSchema: refreshOpeningSourceInputSchema,
      execute: (input: RefreshOpeningSourceInput) => runRefreshOpeningSource(ctx, input),
    }),
    [READ_OPENING_SOURCE_TOOL]: tool({
      description:
        "Read the document already bound to one of this client's OPENING BASES into its opening "
        + "lines. A person attached that document to the basis; you name only the basis. You never "
        + "give an amount, an account code or a document id here — every figure is re-derived by "
        + "the database from the document's own stored regions, and a line it cannot read forfeits "
        + "the whole document rather than recording part of it. Report ONLY what comes back: how "
        + "many lines were recorded, or the refusal in the words it arrives in. If it refuses, say "
        + "which act a person takes next and stop — asking again returns the same answer.",
      inputSchema: readOpeningSourceInputSchema,
      execute: (input: ReadOpeningSourceInput) => runReadOpeningSource(ctx, input),
    }),
  });
}
