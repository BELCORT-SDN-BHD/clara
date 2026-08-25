// @frozen
//
// FROZEN — part of the chatTurn_v14 closure (F-A3 PR-3, OQ-6: BANK CHAT PARITY, owner ruling
// 2026-08-25 — chat may drive the bank lane's 13 verbs on the hard condition that the receipt
// records the truth). A NEW frozen closure beside byte-untouched chatTurn_v1..v13.
//
// PARITY MEANS THE SAME LADDER. Every tool here calls the EXACT SAME `clara.wake_*` bank wrapper
// the autonomous bank_agent lane calls (0121, F-A3/PR-1b) — same rungs, same receipt shape.
//
// THE PROVENANCE HALF THIS FILE DOES NOT OWN. Every `_agent_<verb>_core` (0121) hardcodes
// `is_agent=true, on_behalf_of=null, wake_kind='bank_agent'` when building the ctx it passes to
// the human-shape core — so until the DB half (lane-fa3-pr1a's `_agent_bank_receipt` threading)
// lands, a chat-driven act reaches the ledger and succeeds mechanically, but its receipt still
// names the agent, not the human. This file's job is the reach: mint the right credential
// (client-pinned `interactive_client` OBO the human — chatTurn.v14.infra.ts's `bankScoped`),
// the Postgres grant that makes the mint able to execute anything
// (`0130_chatturn_v14_bank_interactive_grants.sql`), and a faithful translation of the DB's
// own answer. The receipt naming the real human is the DB half's contract to keep.
//
// NO PER-RUNG FRIENDLY-SENTENCE TABLE (unlike chatTurn.v13.post.ts's TIER_B_MESSAGES). The bank
// ladder spans ~40 distinct rung tokens across twelve act verbs (Annex B.1/B.2) — the fallback
// below states the DB's OWN rung name and verdict verbatim rather than inventing meaning for
// each; a follow-up item can build the friendly table once the battery measures which rungs fire.
//
// EVERY ACT VERB NEEDS `inputs_digest` EXCEPT `get_bank_pack`, WHICH PRODUCES ONE (0121 §K.2b's
// H2 gate: an act's digest must match a REAL, PRIOR pack_read receipt for this client).
//
// OP-KEY SEGMENT-QUALIFICATION. Unlike v13's single-shot, loop-stopping `post_journal_entry`, a
// bank act does NOT stop the loop — a clarify round-trip can leave the SAME subject legitimately
// re-attempted in a LATER segment after state moved. Keying on (taskId, subject) alone would
// collide two genuinely different attempts in `bank_agent_receipts`' unique(firm_id, op_key) and
// surface `_agent_bank_receipt`'s identity-mismatch as a raw error. Folding the segment number in
// (threaded from the workflow entry, same value `checkpointStep` already receives) fixes this:
// deterministic under a same-segment WDK replay, distinct across segments.

import { z } from "zod";
import type { RefusalPart } from "./chatTurn.v10.prompt.js";
import { bankScoped, type PgExec, type ToolCtx } from "./chatTurn.v14.infra.js";

export const CHATTURN_BANK_CLOSURE_VERSION = "chatTurn_v14";
export function chatBankModelSnapshot(modelId: string): { provider: string; model: string; version: string } {
  return { provider: "openai", model: modelId, version: CHATTURN_BANK_CLOSURE_VERSION };
}

/** Sorted-key JSON — deterministic regardless of the model's own key ordering. */
function stableJson(v: unknown): string {
  const sort = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(sort);
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      return Object.keys(o)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = sort(o[k]);
          return acc;
        }, {});
    }
    return x;
  };
  return JSON.stringify(sort(v));
}

/** Segment-qualified deterministic op key — see header. */
export function bankOpKey(taskId: string, segment: number, verb: string, keyPayload: unknown): string {
  return `bank-${verb}:${taskId}:${segment}:${stableJson(keyPayload)}`;
}

function asStringRecord(x: unknown): Record<string, string> {
  if (!x || typeof x !== "object" || Array.isArray(x)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) out[k] = typeof v === "string" ? v : String(v);
  return out;
}

/** ONE shape for all twelve act verbs, deliberately — one bank-act surface, one card. The DB's
 *  own jsonb result rides through verbatim in `result`. */
export type BankActPart = { type: "bank_act"; verb: string; subject_id: string | null; op_key: string; result: Record<string, unknown> };
export type BankActToolResult = { ok: true; admitted: BankActPart } | { ok: false; refusal: RefusalPart };
export type BankPackPart = { type: "bank_pack"; bank_account_id: string; digest: string; pack: Record<string, unknown> };
export type BankPackToolResult = { ok: true; pack: BankPackPart } | { ok: false; refusal: RefusalPart };

/** Classify a `wake_*` bank verb's jsonb return — three shapes, measured off 0121's live bodies:
 *  `{status:'refused', rung_vector}` (Tier B), `{status:'refused', reason}` (Tier C), or anything
 *  else (the delegate's own admitted result, passed through). */
export function classifyBankResult(verb: string, raw: unknown, subjectId: string | null, opKey: string): BankActToolResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      refusal: { type: "refusal", code: "internal", reason: "bank_result_unreadable", message: `The ledger returned a response I do not recognise for ${verb}, so I have recorded nothing as done.` },
    };
  }
  const r = raw as { status?: unknown; reason?: unknown; rung_vector?: unknown };
  if (r.status === "refused") {
    if (typeof r.reason === "string" && r.reason) {
      return {
        ok: false,
        refusal: { type: "refusal", code: "CLR-BANK-C", reason: r.reason, message: `The ledger refused ${verb} (reason: ${r.reason}). Nothing was recorded; the state this depended on is unchanged.` },
      };
    }
    const vec = asStringRecord(r.rung_vector);
    const failing = Object.entries(vec).filter(([, v]) => v !== "pass");
    const summary = failing.length > 0 ? failing.map(([k, v]) => `${k}=${v}`).join(", ") : "an unnamed check";
    return {
      ok: false,
      refusal: { type: "refusal", code: "CLR-BANK-B", reason: failing[0]?.[0], message: `${verb} did not pass the bank ledger's own checks (${summary}). I have left this as-is for you to review.` },
    };
  }
  return { ok: true, admitted: { type: "bank_act", verb, subject_id: subjectId, op_key: opKey, result: r as Record<string, unknown> } };
}

/** Never throws. Mirrors chatTurn.v13.post.ts's catch shape. */
export function refusalFromThrown(verb: string, e: unknown): RefusalPart {
  const err = e as { code?: string; message?: string };
  return { type: "refusal", code: String(err.code ?? "internal"), reason: "bank_act_failed", message: `${verb} failed at the ledger and nothing was recorded (${err.message ?? "no further detail"}).` };
}

export async function callBank(ctx: ToolCtx, sql: string, params: unknown[]): Promise<unknown> {
  return bankScoped(ctx, async (c: PgExec) => {
    const r = await c.query(sql, params);
    return r.rows[0]?.receipt ?? null;
  });
}

export function noClientRefusal(): BankActToolResult {
  return { ok: false, refusal: { type: "refusal", code: "CLR03", reason: "bank_act_needs_client_pin", message: "This conversation is not bound to a client, so there is nothing bank-side I can act on." } };
}

// =================================================================================================
// get_bank_pack — the ONE read verb. No inputs_digest (it produces one).
// =================================================================================================
export const getBankPackInputSchema = z.object({
  bank_account_id: z.string().uuid().describe("The bank account to read — its unmatched lines, match candidates, open items and open proposals."),
  rationale: z.string().min(1).max(4000).describe("Why you are reading this pack now, in your own words."),
});
export type GetBankPackInput = z.infer<typeof getBankPackInputSchema>;

export async function runGetBankPack(ctx: ToolCtx, input: GetBankPackInput, modelId: string, taskId: string, segment: number, readSeq: number): Promise<BankPackToolResult> {
  const clientId = ctx.clientId;
  if (!clientId) {
    return { ok: false, refusal: { type: "refusal", code: "CLR03", reason: "bank_act_needs_client_pin", message: "This conversation is not bound to a client, so there is no bank pack to read." } };
  }
  // MUST fix (Codex adversarial round 2026-08-25): a bare (taskId, segment, account) key made a
  // SECOND read of the SAME account within ONE segment collide with the first -- a legitimate
  // re-ground after state changed (act, then re-read) would find its own prior op_key already
  // claimed by a DIFFERENT digest and refuse op_key_identity_mismatch, a raw DB error the model
  // cannot recover from. `readSeq` closes it: a per-segment, per-account counter (buildToolsV14's
  // own closure, rebuilt fresh every segment -- the SAME "a WDK replay rebuilds it empty" law
  // v13's draftedHere/postedHere already rely on) that increments on every call, so each genuine
  // re-read gets its own fresh op_key and its own fresh receipt row. Deterministic under a
  // same-segment WDK replay (the counter replays identically); distinct across successive reads.
  const opKey = bankOpKey(taskId, segment, "get_bank_pack", { bank_account_id: input.bank_account_id, readSeq });
  try {
    const receipt = await bankScoped(ctx, async (c: PgExec) => {
      const r = await c.query("select clara.wake_get_bank_pack($1::uuid, $2::uuid, $3::text, $4::jsonb, $5::text) as receipt", [
        clientId,
        input.bank_account_id,
        input.rationale,
        JSON.stringify(chatBankModelSnapshot(modelId)),
        opKey,
      ]);
      return r.rows[0]?.receipt ?? null;
    });
    if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
      return { ok: false, refusal: { type: "refusal", code: "internal", reason: "bank_pack_unreadable", message: "The ledger returned a bank pack I do not recognise." } };
    }
    const pack = receipt as Record<string, unknown>;
    const digest = typeof pack.digest === "string" ? pack.digest : "";
    if (!digest) {
      return { ok: false, refusal: { type: "refusal", code: "internal", reason: "bank_pack_digest_missing", message: "The bank pack came back with no digest, so nothing that follows can cite it." } };
    }
    return { ok: true, pack: { type: "bank_pack", bank_account_id: input.bank_account_id, digest, pack } };
  } catch (e) {
    return { ok: false, refusal: refusalFromThrown("get_bank_pack", e) };
  }
}
