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
import { pools, type PgExec, type ToolCtx } from "./chatTurn.v15.infra.js";
import { parseOpeningTargets, readOpeningSeed } from "../lib/opening-parse.mjs";

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
  // WHEN THE REFRESH TOOL LANDS (#986's chat half, roster entry A3 of this cut), THIS SENTENCE
  // NAMES IT. It does not name it today because this body does not carry that tool, and pointing
  // a model at a tool it has not been handed is how a turn ends in an invented call.
  source_reread_since_parse:
    "A person brings the basis onto the newest reading of the document from the client's Registers page.",
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
// uses it. One query and one comparison is the smaller cost, and the census below is what keeps
// the two readings honest.

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

export function buildToolsV22(ctx: ToolCtx, modelId: string, segment: number) {
  return Object.assign({}, buildToolsV21(ctx, modelId, segment), {
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
