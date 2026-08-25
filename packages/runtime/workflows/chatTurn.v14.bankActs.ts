// @frozen
//
// FROZEN — part of the chatTurn_v14 closure (F-A3 PR-3, OQ-6). The run functions for the twelve
// bank ACT verbs (six here, six in chatTurn.v14.bankActs2.ts — split for file-size discipline).
// Each mints via `bankScoped` (chatTurn.v14.infra.ts), calls its `wake_*` wrapper positionally —
// byte-exact against 0121's live signatures — and classifies the result via
// chatTurn.v14.bank.ts's `classifyBankResult`. See that file's header for the closure-wide
// rationale (parity, provenance ownership, op-key segment-qualification, why no per-rung table).

import {
  callBank,
  chatBankModelSnapshot,
  classifyBankResult,
  bankOpKey,
  noClientRefusal,
  refusalFromThrown,
  type BankActToolResult,
} from "./chatTurn.v14.bank.js";
import type {
  AddBankAccountInput,
  UpsertBankCoaAccountInput,
  MatchBankLineInput,
  SettleFromBankLineInput,
  UnmatchBankMatchInput,
  CompleteBankReconciliationInput,
} from "./chatTurn.v14.bankSchemas.js";
import type { ToolCtx } from "./chatTurn.v14.infra.js";

export async function runAddBankAccount(ctx: ToolCtx, input: AddBankAccountInput, modelId: string, taskId: string, segment: number): Promise<BankActToolResult> {
  if (!ctx.clientId) return noClientRefusal();
  const opKey = bankOpKey(taskId, segment, "add_bank_account", { proposal_id: input.proposal_id });
  try {
    const raw = await callBank(
      ctx,
      "select clara.wake_add_bank_account($1::uuid,$2::text,$3::uuid,$4::text,$5::text,$6::text,$7::text,$8::jsonb,$9::text,$10::text) as receipt",
      [ctx.clientId, input.coa_account_code, input.proposal_id, input.bank_code, input.account_number, input.bank_name_display, input.rationale, JSON.stringify(chatBankModelSnapshot(modelId)), input.inputs_digest, opKey],
    );
    return classifyBankResult("add_bank_account", raw, input.proposal_id, opKey);
  } catch (e) {
    return { ok: false, refusal: refusalFromThrown("add_bank_account", e) };
  }
}

export async function runUpsertBankCoaAccount(ctx: ToolCtx, input: UpsertBankCoaAccountInput, modelId: string, taskId: string, segment: number): Promise<BankActToolResult> {
  if (!ctx.clientId) return noClientRefusal();
  const opKey = bankOpKey(taskId, segment, "upsert_account", { code: input.code });
  try {
    const raw = await callBank(
      ctx,
      "select clara.wake_upsert_account($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::jsonb,$9::text,$10::text) as receipt",
      [ctx.clientId, input.code, input.name, input.type, input.special_acc_type ?? null, input.account_class ?? null, input.rationale, JSON.stringify(chatBankModelSnapshot(modelId)), input.inputs_digest, opKey],
    );
    return classifyBankResult("upsert_account", raw, input.code, opKey);
  } catch (e) {
    return { ok: false, refusal: refusalFromThrown("upsert_account", e) };
  }
}

export async function runMatchBankLine(ctx: ToolCtx, input: MatchBankLineInput, modelId: string, taskId: string, segment: number): Promise<BankActToolResult> {
  if (!ctx.clientId) return noClientRefusal();
  const opKey = bankOpKey(taskId, segment, "match_bank_line", { lines: input.lines, entries: input.entries });
  try {
    const raw = await callBank(
      ctx,
      "select clara.wake_match_bank_line($1::uuid,$2::jsonb,$3::jsonb,$4::jsonb,$5::boolean,$6::text,$7::jsonb,$8::text,$9::text) as receipt",
      [ctx.clientId, JSON.stringify(input.lines), JSON.stringify(input.entries), JSON.stringify(input.adjustments), input.ack_period_exceptions, input.rationale, JSON.stringify(chatBankModelSnapshot(modelId)), input.inputs_digest, opKey],
    );
    return classifyBankResult("match_bank_line", raw, null, opKey);
  } catch (e) {
    return { ok: false, refusal: refusalFromThrown("match_bank_line", e) };
  }
}

export async function runSettleFromBankLine(ctx: ToolCtx, input: SettleFromBankLineInput, modelId: string, taskId: string, segment: number): Promise<BankActToolResult> {
  if (!ctx.clientId) return noClientRefusal();
  const opKey = bankOpKey(taskId, segment, "settle_from_bank_line", { line_id: input.line_id, counterparty_id: input.counterparty_id });
  try {
    const raw = await callBank(
      ctx,
      "select clara.wake_settle_from_bank_line($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5::text,$6::date,$7::bigint,$8::text,$9::jsonb,$10::text,$11::text,$12::jsonb,$13::text,$14::text) as receipt",
      [
        ctx.clientId,
        input.line_id,
        input.counterparty_id,
        JSON.stringify(input.allocations),
        input.memo ?? null,
        input.posting_date,
        input.charge_cents ?? null,
        input.charge_account ?? null,
        JSON.stringify(input.adjustments),
        input.control_account ?? null,
        input.rationale,
        JSON.stringify(chatBankModelSnapshot(modelId)),
        input.inputs_digest,
        opKey,
      ],
    );
    return classifyBankResult("settle_from_bank_line", raw, input.line_id, opKey);
  } catch (e) {
    return { ok: false, refusal: refusalFromThrown("settle_from_bank_line", e) };
  }
}

export async function runUnmatchBankMatch(ctx: ToolCtx, input: UnmatchBankMatchInput, modelId: string, taskId: string, segment: number): Promise<BankActToolResult> {
  if (!ctx.clientId) return noClientRefusal();
  const opKey = bankOpKey(taskId, segment, "unmatch_bank_match", { match_id: input.match_id });
  try {
    const raw = await callBank(ctx, "select clara.wake_unmatch_bank_match($1::uuid,$2::uuid,$3::text,$4::text,$5::jsonb,$6::text,$7::text) as receipt", [
      ctx.clientId,
      input.match_id,
      input.reason,
      input.rationale,
      JSON.stringify(chatBankModelSnapshot(modelId)),
      input.inputs_digest,
      opKey,
    ]);
    return classifyBankResult("unmatch_bank_match", raw, input.match_id, opKey);
  } catch (e) {
    return { ok: false, refusal: refusalFromThrown("unmatch_bank_match", e) };
  }
}

export async function runCompleteBankReconciliation(ctx: ToolCtx, input: CompleteBankReconciliationInput, modelId: string, taskId: string, segment: number): Promise<BankActToolResult> {
  if (!ctx.clientId) return noClientRefusal();
  const opKey = bankOpKey(taskId, segment, "complete_bank_reconciliation", { statement_id: input.statement_id });
  try {
    const raw = await callBank(ctx, "select clara.wake_complete_bank_reconciliation($1::uuid,$2::uuid[],$3::text,$4::jsonb,$5::text,$6::text) as receipt", [
      input.statement_id,
      input.ack_outstanding,
      input.rationale,
      JSON.stringify(chatBankModelSnapshot(modelId)),
      input.inputs_digest,
      opKey,
    ]);
    return classifyBankResult("complete_bank_reconciliation", raw, input.statement_id, opKey);
  } catch (e) {
    return { ok: false, refusal: refusalFromThrown("complete_bank_reconciliation", e) };
  }
}
