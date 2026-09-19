// #651 — THE DEPRECIATION RUN TOOL'S SCHEMA, DOOR ARGUMENTS AND REFUSAL MAP.
//
// NON-FROZEN ONLY UNTIL THE SUCCESSOR IMPORTS IT. `packages/runtime/lib/fixed-asset-acquisition.ts`
// is the precedent and also the warning: nothing frozen imported it on the day it was written, and
// the moment `claraWork_v4` did, it was hash-locked by closure and may never be edited again except
// through a successor (`scripts/check-frozen-workflows.mjs`'s IMPORT-ESCAPE). The wave's single
// shared `chatTurn_v21` cut — made ONCE by the integration worker after the ten merges (WORK-ORDER
// rule 8) — wires this module in the lines at the foot of this file. It is therefore written to be
// FINISHED, and every DURABLE rule lives in migration 0227, never here.
//
// THE DATABASE IS THE AUTHORITY, ALWAYS, AND HERE THAT IS UNUSUALLY LITERAL. This tool computes
// NOTHING. The PERIOD is the database's: `clara._fa_run_period_core` refuses any caller-named
// window that is not the live authority's own cadence (0041:3457-3470, CLR38
// `period_request_invalid` axis `not_cadence_aligned`), and `clara.run_depreciation_period_for`
// does not even take one — it asks `clara._depreciation_run_due_core` for the oldest unmet period,
// runs exactly that, and asks again. So this schema carries no period_start, no period_end, no
// amount and no account: a `client_id` and an optional `through` bound, and nothing else a model
// could get wrong.
//
// THE FLOOR IS THE SENTENCE THIS MODULE EXISTS TO SAY OUT LOUD. 0227's D8 stamps
// `clara.fa_depreciation_authorities.authority_from` at the first day of the signing month and
// freezes it; the due oracle never proposes a period starting before it. The OBO door's four
// arguments carry NO floor bypass, so Clara cannot reach a pre-floor period AT ALL this wave — and
// a model that cannot say why is a model that will try again. `floorSentence()` below is what it
// says instead, and it names the human door.
//
// IT MAY NEVER CALL `clara.run_depreciation_manual`. `packages/db/tests/rig-meta.mjs:691-693` is an
// executable census whose own words are that the manual verb "must NEVER reach a machine role, or
// the maker-checker ladder would have a bypass". That is why 0227 minted a NEW name rather than
// widening a grant, and why the door call below names `run_depreciation_period_for`.

import { z } from "zod";

/** The tool name the wave's shared `chatTurn_v21` cut will register. Kept as a constant so the
 *  registry row, the schema and the refusal map can never drift apart by a typo. */
export const RUN_DEPRECIATION_PERIOD_TOOL = "run_depreciation_period_for_client";

/** The door 0227 grants to `clara_runtime` and to nobody else. */
export const DEPRECIATION_RUN_DOOR = "clara.run_depreciation_period_for";

/** The HUMAN catch-up door — bookkeeper+, `clara_authenticated` only, caller-named period. It is
 *  the ONE way a pre-floor period is ever charged, and every floor sentence names it. */
export const DEPRECIATION_HUMAN_DOOR = "clara.run_depreciation_manual";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("A calendar date, YYYY-MM-DD, in the book's Asia/Kuala_Lumpur calendar.");

/**
 * The tool's input. `.strict()` deliberately: an unknown key is a model inventing a field, and a
 * silently-dropped `period_start` is how "I ran September" becomes a receipt for some other month.
 *
 * THERE IS NO PERIOD HERE AND THERE MUST NOT BE. See this file's header: the period is the
 * database's, always. `through` bounds a CATCH-UP — the door clears every due period from the
 * authority floor forward up to it — and defaults to the current book day when absent.
 */
export const runDepreciationInputSchema = z
  .object({
    client_id: z.string().uuid(),
    through: isoDate.optional(),
  })
  .strict();

export type RunDepreciationInput = z.infer<typeof runDepreciationInputSchema>;

/** The argument list `clara.run_depreciation_period_for` takes, IN ITS OWN ORDER. The order is
 *  fixed by the migration and may not be re-arranged: `(p_client, p_through, p_op_key, p_obo)`. */
export type DepreciationRunDoorArgs = {
  p_client: string;
  p_through: string | null;
  p_op_key: string;
  p_obo: string;
};

/**
 * Build the door's arguments. `p_obo` is the human whose authority the run borrows, and the door
 * RE-READS it live (active membership of the client's firm, the bookkeeper floor, an active
 * client) rather than trusting anything this module says — a turn may be resumed hours later and
 * the person who asked may by then have been demoted.
 */
export function depreciationRunDoorArgs(
  input: RunDepreciationInput,
  ctx: { opKey: string; onBehalfOf: string },
): DepreciationRunDoorArgs {
  return {
    p_client: input.client_id,
    p_through: input.through ?? null,
    p_op_key: ctx.opKey,
    p_obo: ctx.onBehalfOf,
  };
}

export type LocalRefusal = { refusal: true; reason: string; message: string };

/**
 * The shape refusals a model can act on without a database round trip. There is exactly ONE, and
 * that is a fact about the door rather than an omission: every other rule this lane has — the live
 * authority, the cadence, the sequencing, the locked period, the OBO ladder — needs state only the
 * database holds. A mirror of one of those would be a rule of its own, which is the thing this
 * estate does not do.
 */
export function localRunRefusal(input: RunDepreciationInput): LocalRefusal | null {
  if (input.through !== undefined && Number.isNaN(Date.parse(`${input.through}T00:00:00Z`))) {
    return {
      refusal: true,
      reason: "through_not_a_date",
      message: "That is not a calendar date. Give the catch-up bound as YYYY-MM-DD, or leave it out.",
    };
  }
  return null;
}

/**
 * The database's own typed `(code, detail.reason)` pairs for this lane, mapped to the sentence a
 * model may say. EVERY entry is a refusal migration 0041, 0042, 0056, 0216 or 0227 actually raises;
 * nothing here invents a failure mode, and an unmapped pair MUST fall through to the door's own
 * message VERBATIM rather than being re-worded (the estate's verbatim-refusal law).
 *
 * The two `period_request_invalid` entries key on the AXIS, not on the reason alone, because 0227
 * added `period_closed` to a reason that already carried `not_cadence_aligned` and `not_ended` —
 * three different facts a person must be able to tell apart.
 */
export const DEPRECIATION_REFUSAL_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  "CLR38:authority_not_live":
    "This client has no signed depreciation authority. An admin signs one before Clara can run depreciation.",
  "CLR38:authority_already_live":
    "This client already has a live depreciation authority; it is retired and re-signed, never edited.",
  "CLR38:period_draft_outstanding":
    "A depreciation draft is already waiting for approval; approve or withdraw it first.",
  "CLR38:period_earlier_unmet":
    "An earlier period is still unmet. Run the oldest unmet period first — the refusal names both of its dates.",
  "CLR38:period_request_invalid:not_ended":
    "That period has not ended yet, so there is nothing to charge for it.",
  "CLR38:period_request_invalid:not_cadence_aligned":
    "That is not this client's depreciation period. The cadence decides the window, and the refusal names the exact dates it wanted.",
  "CLR38:period_request_invalid:period_closed":
    "That period sits in a closed financial year, so nothing may be charged into it. The refusal names the year; reopening it is the one way back in, and that is a human decision.",
  "CLR38:period_correction_unsound":
    "A charge in this range was reversed on a different date, so the period never cleared. Charging it again would leave the figure standing twice; a human finishes this one by hand.",
  "CLR38:authority_ref_invalid":
    "The instruction this authority cites is not a Work or a chat task this client owns.",
  "CLR38:authority_ref_unresolved":
    "The instruction this authority cites does not exist for this client.",
  "CLR19:write_into_closed_period":
    "That posting date falls inside a closed financial year. The refusal names the year; reopening it is the one way back in, and that is a human decision.",
  "CLR04:obo_not_active":
    "You no longer hold the authority to run this — the membership this run acts for is not active in the client's firm.",
  "CLR04:insufficient_role":
    "You no longer hold the authority to run this — running depreciation needs the bookkeeper floor.",
  "CLR10:client_inactive":
    "This client is archived, so no depreciation may be run for it.",
  "CLR11:client_not_found":
    "I cannot find that client.",
});

/** `CLRxx:reason` or `CLRxx:reason:axis` — the key `DEPRECIATION_REFUSAL_MESSAGES` is looked up
 *  by. A refusal with no reason token keys on its code alone. */
export function refusalKey(code: string, reason?: string | null, axis?: string | null): string {
  const base = `${code}:${reason ?? ""}`;
  return axis ? `${base}:${axis}` : base;
}

/**
 * The sentence for a typed refusal: the mapped one when the estate knows the pair, and OTHERWISE
 * the door's own message VERBATIM. An unmapped code is never dropped and never guessed at —
 * re-wording a refusal nobody reviewed is how a wall becomes a rumour.
 */
export function refusalSentence(
  refusal: { code: string; reason?: string | null; axis?: string | null; message?: string | null },
): string {
  const withAxis = DEPRECIATION_REFUSAL_MESSAGES[refusalKey(refusal.code, refusal.reason, refusal.axis)];
  if (withAxis) return withAxis;
  const bare = DEPRECIATION_REFUSAL_MESSAGES[refusalKey(refusal.code, refusal.reason)];
  if (bare) return bare;
  return (refusal.message ?? "").trim() || `The database refused this run (${refusal.code}).`;
}

/**
 * THE FLOOR SENTENCE. `clara.run_depreciation_period_for` carries no floor bypass, so when the due
 * oracle answers "nothing due" on a client that visibly owes older months, the honest thing to say
 * is WHY and WHERE the work can still be done — never "there is nothing to depreciate".
 */
export function floorSentence(authorityFrom?: string | null): string {
  const from = authorityFrom ? ` (${authorityFrom})` : "";
  return (
    `This client's depreciation authority only reaches periods from the month it was signed${from} onward, `
    + `so I cannot charge anything earlier. A bookkeeper can still run an earlier month by hand through `
    + `${DEPRECIATION_HUMAN_DOOR}.`
  );
}

/** What the run receipt says, turned into the sentence the transcript carries. The counts are the
 *  RECEIPT's, never recomputed: "QUEUED/POSTED exactly what the receipt says, including how many
 *  assets were skipped and why". */
export type DepreciationRunReceipt = {
  client_id?: string;
  through?: string | null;
  periods_run?: number;
  periods?: Array<{ period_start: string; period_end: string; result?: { status?: string; charged_cents?: number; entries?: number; skipped?: Array<{ asset_id: string; reason: string }> } }>;
  still_due?: { due?: boolean; reason?: string; skipped_closed?: Array<{ period_start: string; period_end: string; fy_label?: string }> } | null;
};

/** The five skip reasons `clara.fa_depreciation_runs.skipped` can carry, MEASURED off the live
 *  catalog (M7): four from `clara._fa_asset_charges` plus `disposal_draft_outstanding`, which
 *  `clara._fa_compute_charges` writes itself and the per-asset body can never return. An asset that
 *  is simply up to date is NOT a skip and never appears. */
export const SKIP_REASON_SENTENCES: Readonly<Record<string, string>> = Object.freeze({
  incomplete: "waiting on depreciation particulars",
  not_in_service: "not yet in service",
  fully_depreciated: "fully depreciated",
  none_method: "stated as not depreciated",
  disposal_draft_outstanding: "a disposal draft is waiting on this asset",
});

/** A skip reason in words — or, for a reason this map does not know, the code itself beside a
 *  neutral sentence. Never dropped, never guessed. */
export function skipSentence(reason: string): string {
  return SKIP_REASON_SENTENCES[reason] ?? `skipped by the register (${reason})`;
}

/** The transcript sentence for a receipt. */
export function runSummary(receipt: DepreciationRunReceipt): string {
  const periods = receipt.periods ?? [];
  if (periods.length === 0) {
    const reason = receipt.still_due?.reason;
    return reason
      ? `Nothing was due for this client (${reason}).`
      : "Nothing was due for this client.";
  }
  const parts = periods.map((p) => {
    const status = p.result?.status ?? "unknown";
    const verb = status === "posted" ? "POSTED" : status === "drafted" ? "QUEUED for approval" : status;
    const cents = p.result?.charged_cents ?? 0;
    const skipped = p.result?.skipped ?? [];
    const tail = skipped.length
      ? ` ${skipped.length} asset(s) skipped: ${skipped.map((s) => skipSentence(s.reason)).join("; ")}.`
      : "";
    return `${p.period_start} to ${p.period_end}: ${verb} ${(cents / 100).toFixed(2)} across ${p.result?.entries ?? 0} charge row(s).${tail}`;
  });
  const closed = receipt.still_due?.skipped_closed ?? [];
  const closedTail = closed.length
    ? ` ${closed.length} period(s) were skipped because their financial year is closed: `
      + `${closed.map((c) => `${c.period_start}..${c.period_end}${c.fy_label ? ` (${c.fy_label})` : ""}`).join(", ")}.`
    : "";
  return parts.join(" ") + closedTail;
}

// ---------------------------------------------------------------------------------------------
// THE SUCCESSOR CONTRACT — what `chatTurn_v21` must wire, and nothing more.
//
//   1. `tool({ inputSchema: runDepreciationInputSchema, execute })` under the name
//      `RUN_DEPRECIATION_PERIOD_TOOL`, registered beside the existing v20 tools.
//   2. In `execute`: the v20 client pin (`if (!ctx.clientId) return noClientRefusal()`), then
//      `const local = localRunRefusal(input); if (local) return local;`.
//   3. `const opKey = stableOpKey(ctx.taskId, RUN_DEPRECIATION_PERIOD_TOOL, input);` — the same
//      identity discipline every other tool uses, so a re-run turn resolves to the receipt it
//      already earned instead of running a second time.
//   4. ONE query, in the door's OWN argument order:
//
//        select clara.run_depreciation_period_for($1::uuid, $2::date, $3::text, $4::uuid) as r
//
//      with `depreciationRunDoorArgs(input, { opKey, onBehalfOf: ctx.createdBy })` supplying
//      `(p_client, p_through, p_op_key, p_obo)`. Granted to `clara_runtime` ONLY.
//   5. PART KIND on success: reuse the existing `work_accepted`-adjacent receipt part shape and
//      fill it from `runSummary(r)`. NO new part kind, and NO `accounting_work.purpose` widening:
//      depreciation posts through `clara.journal_entries` directly and never reaches the Work lane
//      (the IN-list at 0195:1711 / live 0204:180 stays closed).
//   6. On a refusal: hand back the database's typed `(code, detail.reason, detail.axis)` through
//      `refusalSentence(...)`, which falls through to the door's own message VERBATIM when the
//      triple is unmapped.
//   7. When the receipt runs NO period and the client visibly owes older months, say
//      `floorSentence(authority_from)` — the door carries no floor bypass and the human door is
//      where that work is done.
//   8. NO `clara.wake_fn_allowlist` row: the allowlist is keyed by BARE NAME, and there is no bare
//      name here a wake lane should reach.
//
// PROMPT STANZA (verbatim, for the successor's system prompt):
//   "You execute an authority; you never sign one. The period is the database's, never yours. Say
//    you have QUEUED/POSTED exactly what the receipt says, including how many assets were skipped
//    and why."
//
// WHAT v21 MUST NOT DO: call `clara.run_depreciation_manual`. That body is `_human_ctx`-fronted at
// bookkeeper, granted to `clara_authenticated` and to no machine role, and
// `packages/db/tests/rig-meta.mjs:691-693` fails the moment one appears — a runtime call can only
// ever be a 42501.
//
// NOT FOLDED HERE: #933 rides `claraWork_v5`, a DIFFERENT closure — do not fold the two. #882(a)'s
// CLR40 stanza belongs to #658's worker, not to this one.
// ---------------------------------------------------------------------------------------------
