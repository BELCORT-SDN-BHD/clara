// @frozen
//
// FROZEN — part of the chatTurn_v15 closure (F-A6 PR-2: THE AUDITED FREEFORM READ, runtime half).
// A NEW frozen closure beside byte-untouched chatTurn_v1..v14.
//
// WHAT THIS FILE IS, AND WHAT IT IS NOT. It is the tool definition and the translation of the
// DB's own answer. It is NOT a second ladder. Every wall — the single-statement cursor, the
// relation and function censuses, the plan-cost ceiling, the row/byte caps, the in-loop
// deadline, the client scope and the receipt — lives in `clara.wake_freeform_read` (migration
// 0131) and is proven by packages/db's F-A6 battery. The runtime never decides whether a read is
// lawful; it assembles what the model may not supply (the credential, the turn binding, the op
// key), carries the verdict without re-deriving it, and refuses in a way that says nothing the
// verdict did not already say.
//
// THE CONSUMER CONTRACT (design §3.5, adopted from F-A2's D26). No consumer may test for
// `'fail'`. `admitted` below tests POSITIVELY for `ok === true` AND `outcome === 'ok'`, so an
// unknown future value, a missing key, a null result and a malformed envelope are all
// non-admitting. This is the one place a runtime bug could turn a refusal into an admission.
//
// THE ORACLE DISCIPLINE (Annex D.2, and design §7 item 4's own instruction). The
// denied / unknown / not-enumerated family collapses to ONE string AND ONE reason token for the
// model — the string taken BY IDENTITY from the frozen `readToolRefusalMessage`, never retyped
// (review law 3) — so a probing prompt cannot use refusal text to learn whether a relation or a
// row exists. `chatTurn.v10.errors.ts` is frozen and is NOT edited: the mapping rides here, in
// this closure's own code, exactly as the design specifies. The RECEIPT still records the exact
// `(sqlstate, reason)` pair; the model just does not get to read it.
//
// TA-P10 C′ — A FREE-QUERY AGGREGATE IS NARRATIVE. The DB stamps `authority: 'narrative'` and
// `claim_eligible: false` on every result and this file passes them through verbatim. The label
// is TOLD to the model; what ENFORCES it is that `clara_freeform_ro` holds no grant that could
// write anything (design §3.7 / D-27). Nothing here re-states the rule as a check, because a
// runtime check would be the weaker of the two and would read as if it were the wall.
//
// NO NEW PART KIND. `PART_CATALOG` is a named non-goal of this design ("the SQL is already
// visible in the `tool_call` chip; charts are F-A5"), and the `freeform_result` card is P6's own
// later batched wire bump (apps/web/lib/parts/types.ts:8 names it). A refusal surfaces through
// the EXISTING `refusal` part; a successful read surfaces as the tool result the model narrates.

import { z } from "zod";
import type { RefusalPart } from "./chatTurn.v10.prompt.js";
import { readToolRefusalMessage } from "./chatTurn.v10.errors.js";
import { freeformScoped, type FreeformReadResult, type ToolCtx } from "./chatTurn.v15.infra.js";
import { freeformEngineId, recordFreeformUsage } from "./chatTurn.v15.usage.js";

export const FREEFORM_READ_TOOL = "read_books_freeform";

/**
 * THE ENUMERATED SURFACE, model-facing — law 34's audit line as the model sees it.
 *
 * THE GRANT IS THE AUTHORITY, NOT THIS ARRAY. `clara.wake_freeform_read`'s own relation census
 * derives the enumeration from the catalog (`has_table_privilege('clara_freeform_ro', …)`,
 * 0131 §6.1) precisely so no second hand-kept list can decide anything. This array exists only
 * so the model knows what it may ask for before it composes SQL — a list that has drifted costs
 * a wasted refusal, never a widened read. The F-A6 battery's own drift cell compares this array
 * against the live grant and goes RED on either direction, which is what keeps R-1 ("the
 * enumerated list is a moving wall") a maintenance cost rather than a silent lie.
 */
export const FREEFORM_ENUMERATED_RELATIONS: readonly string[] = [
  "bank_accounts", "bank_line_exceptions", "bank_match_entry_members", "bank_match_line_members",
  "bank_matches", "bank_reconciliations", "bank_statement_lines", "bank_statements",
  "clients", "coa_accounts", "coding_tasks", "compliance_watches",
  "counterparties", "counterparty_aliases", "close_runs",
  "document_filings", "documents", "entry_evidence",
  "fa_depreciation", "firms", "fiscal_years", "fixed_assets",
  "journal_entries", "journal_entry_revisions", "journal_lines",
  "notifications", "open_items", "open_item_allocations", "open_questions",
  "period_snapshots", "reporting_periods",
  "sst_threshold_schedule", "staff_advance_applications", "staff_advances", "users",
];

/** The verb's own engineering caps (0131 §6.1's constants), MIRRORED so a malformed call is
 *  refused here with a sentence the model can act on instead of costing a round trip and a
 *  CLR10. The DB's copies are the authority; these can only ever be equal or stricter. */
export const FREEFORM_SQL_MAX_CHARS = 20000;
export const FREEFORM_PURPOSE_MAX_CHARS = 500;
export const FREEFORM_ROW_CAP_MAX = 5000;

export const freeformReadInputSchema = z.object({
  sql: z
    .string()
    .min(1)
    .max(FREEFORM_SQL_MAX_CHARS)
    .describe(
      "ONE read-only SELECT (or VALUES) over the enumerated tables, schema-qualified as clara.<table>. " +
        "It is executed as a cursor on a structurally read-only role: a second statement, any write, " +
        "a data-modifying CTE, SET/RESET, or a table outside the enumerated list is refused by the database, " +
        "not by a text filter. Scoping is automatic — never add a firm_id or client_id filter of your own.",
    ),
  purpose: z
    .string()
    .min(1)
    .max(FREEFORM_PURPOSE_MAX_CHARS)
    .describe("Why you are running this read, in one sentence. It is recorded on the audit receipt beside your query."),
  row_cap: z
    .number()
    .int()
    .min(1)
    .max(FREEFORM_ROW_CAP_MAX)
    .optional()
    .describe(`An optional row ceiling for this read (default and hard maximum ${FREEFORM_ROW_CAP_MAX}).`),
});
export type FreeformReadInput = z.infer<typeof freeformReadInputSchema>;

export type FreeformReadToolResult = { ok: true; read: FreeformReadResult } | { ok: false; refusal: RefusalPart };

/**
 * Deterministic, replay-stable op key. Segment- AND sequence-qualified for the same reason
 * `bankOpKey` is (chatTurn.v14.bank.ts): a chat turn legitimately re-reads after state moves,
 * and two genuinely different reads must never share one receipt row's key. The counter lives in
 * the per-segment tool closure, so a WDK replay of a segment reproduces the same keys.
 */
export function freeformOpKey(taskId: string, segment: number, seq: number): string {
  return `freeform:${taskId}:${segment}:${seq}`;
}

/** The reason tokens whose very NAME would answer "does this relation/row exist?". All of them
 *  collapse to one string and one token for the model (Annex D.2). */
export const FREEFORM_ORACLE_REASONS: readonly string[] = [
  "relation_denied",
  "function_denied",
  "unknown_relation",
  "relation_not_enumerated",
  "function_not_enumerated",
];

/** The single collapsed token the model sees for every member of that family. */
export const FREEFORM_ORACLE_REASON = "read_unavailable";
/** ...and the single collapsed string, taken BY IDENTITY from the frozen shared helper rather
 *  than retyped (review law 3). 42501 is the family's own SQLSTATE. */
export const FREEFORM_ORACLE_MESSAGE = readToolRefusalMessage({ code: "42501" });

/** The rungs that are about the QUERY's own shape or size, never about what exists — so each
 *  keeps its own name and its own sentence. `read_timeout` and `malformed_statement` are the two
 *  the design names explicitly; the caps and the shape wall join them on the same ground. */
const FREEFORM_NAMED_MESSAGES: Record<string, string> = {
  read_timeout:
    "That read took too long and was stopped before it finished, so nothing came back. Ask for a narrower slice — fewer periods, one client, or an aggregate instead of the rows.",
  malformed_statement:
    "That SQL did not parse. Note that SET, RESET and anything that is not a single SELECT or VALUES cannot be written here at all — the statement is wrapped as a subquery.",
  statement_shape: "That was not a single statement. Send exactly one SELECT (or VALUES) — no semicolon-separated second statement.",
  plan_cost_ceiling: "The database's own plan for that query was too expensive to run. Narrow it — add a period bound, or aggregate instead of listing rows.",
  result_row_cap: `That read hit its row ceiling (${FREEFORM_ROW_CAP_MAX}) and returned nothing. Aggregate it, or narrow the range.`,
  result_byte_cap: "That read hit its size ceiling and returned nothing. Select fewer columns, or aggregate.",
  feature_not_permitted: "That query used something this read-only door does not permit (for example a data-modifying CTE). Use a plain SELECT.",
};

/** Map the DB's own refusal token to the model-facing refusal. FAIL CLOSED: an unrecognised
 *  token — including a future one this frozen body has never heard of — takes the oracle-safe
 *  branch, never an invented friendly sentence. */
export function freeformRefusal(reason: string | null | undefined): RefusalPart {
  const token = typeof reason === "string" ? reason : "";
  const named = Object.prototype.hasOwnProperty.call(FREEFORM_NAMED_MESSAGES, token) ? FREEFORM_NAMED_MESSAGES[token] : undefined;
  if (named !== undefined) return { type: "refusal", code: "CLR-FREEFORM-B", reason: token, message: named };
  return { type: "refusal", code: "CLR-FREEFORM-B", reason: FREEFORM_ORACLE_REASON, message: FREEFORM_ORACLE_MESSAGE };
}

/**
 * A THROWN error — the Tier-A raises (`_freeform_core`'s ladder: no credential, wrong wake kind,
 * blank/oversize inputs, a task that is not this firm's live turn, the pin/turn congruence pair),
 * plus a Tier-D death (the pool's `statement_timeout` killing a stalled fetch, a connection
 * loss). Every one of these leaves NO committed receipt, so the runtime's own task record is the
 * honest home and this refusal is what the human sees.
 *
 * `cross_client_unavailable` IS NAMED, and the reason is D-22's honest half: the read is
 * DEFERRED, not forbidden, and a refusal that implied otherwise would be a lie about the
 * product. THIS READS A PROJECTION, NOT THE THING (review law 3, stated rather than hidden): the
 * DB raises it as a plain CLR10 with the token inside the message and no machine-readable
 * DETAIL, so the message text is the only signal there is. That is safe HERE, and only here,
 * because the fail-closed direction is the oracle string: a miss costs the model the naming, and
 * can never turn a refusal into an admission or leak anything about data. It reveals only that
 * this session is client-pinned, which the model already knows from its own context.
 */
export function freeformRefusalFromThrown(e: unknown): RefusalPart {
  const err = e as { code?: string; message?: string };
  const message = String(err?.message ?? "");
  if (message.includes("cross_client_unavailable")) {
    return {
      type: "refusal",
      code: "CLR10",
      reason: "cross_client_unavailable",
      message:
        "This conversation is pinned to one client, so I cannot reach another client's books in the same read. " +
        "Comparing two clients is a separate, named action that is not built yet — it is deferred, not forbidden. " +
        "Ask me about this client, or open a firm-level conversation.",
    };
  }
  return { type: "refusal", code: String(err?.code ?? "internal"), reason: FREEFORM_ORACLE_REASON, message: FREEFORM_ORACLE_MESSAGE };
}

/** POSITIVE admission (see this file's header). Anything that is not exactly both flags is a
 *  refusal, including a null result and an envelope of an unexpected shape. */
export function isAdmittedFreeformRead(raw: unknown): raw is FreeformReadResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const r = raw as { ok?: unknown; outcome?: unknown };
  return r.ok === true && r.outcome === "ok";
}

/**
 * Run ONE audited freeform read and translate the answer. Never throws.
 *
 * METERING (F-A9 / law 76): every call kind is metered, so a row lands on EVERY path —
 * admitted, refused, timed out and thrown — and a metering failure never becomes a refused read.
 * The `via_wake_kind` recorded is the kind `freeformScoped` actually mints for this context, so
 * the ledger records what happened rather than what this file would have guessed.
 */
export async function runFreeformRead(
  ctx: ToolCtx,
  input: FreeformReadInput,
  modelId: string,
  segment: number,
  seq: number,
): Promise<FreeformReadToolResult> {
  const opKey = freeformOpKey(ctx.taskId, segment, seq);
  const engineId = freeformEngineId(modelId);
  const viaWakeKind = ctx.clientId ? "interactive_client" : "interactive";
  const startedAt = Date.now();
  try {
    const raw = await freeformScoped(ctx, { sql: input.sql, purpose: input.purpose, opKey, rowCap: input.row_cap ?? null });
    if (isAdmittedFreeformRead(raw)) {
      await recordFreeformUsage(ctx, engineId, viaWakeKind, "success", Date.now() - startedAt);
      return { ok: true, read: raw };
    }
    const reason = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as { refusal_reason?: unknown }).refusal_reason : null;
    const token = typeof reason === "string" ? reason : null;
    await recordFreeformUsage(ctx, engineId, viaWakeKind, token === "read_timeout" ? "timeout" : "refused", Date.now() - startedAt);
    return { ok: false, refusal: freeformRefusal(token) };
  } catch (e) {
    await recordFreeformUsage(ctx, engineId, viaWakeKind, "error", Date.now() - startedAt);
    return { ok: false, refusal: freeformRefusalFromThrown(e) };
  }
}
