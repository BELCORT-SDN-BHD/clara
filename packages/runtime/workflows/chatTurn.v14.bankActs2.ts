// @frozen
//
// FROZEN — part of the chatTurn_v14 closure (F-A3 PR-3, OQ-6). The remaining six bank ACT verbs'
// run functions (chatTurn.v14.bankActs.ts carries the first six). See chatTurn.v14.bank.ts's
// header for the closure-wide rationale.

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
  VoidBankReconciliationInput,
  ResolveBankLineExceptionInput,
  ProposeBankLineExceptionInput,
  VoidBankStatementInput,
  ProposeBankIdentifierPromotionInput,
  ResolveAndBookBankLineInput,
} from "./chatTurn.v14.bankSchemas.js";
import type { ToolCtx } from "./chatTurn.v14.infra.js";

export async function runVoidBankReconciliation(ctx: ToolCtx, input: VoidBankReconciliationInput, modelId: string, taskId: string, segment: number): Promise<BankActToolResult> {
  if (!ctx.clientId) return noClientRefusal();
  const opKey = bankOpKey(taskId, segment, "void_bank_reconciliation", { reconciliation_id: input.reconciliation_id });
  try {
    const raw = await callBank(ctx, "select clara.wake_void_bank_reconciliation($1::uuid,$2::text,$3::text,$4::jsonb,$5::text,$6::text) as receipt", [
      input.reconciliation_id,
      input.reason,
      input.rationale,
      JSON.stringify(chatBankModelSnapshot(modelId)),
      input.inputs_digest,
      opKey,
    ]);
    return classifyBankResult("void_bank_reconciliation", raw, input.reconciliation_id, opKey);
  } catch (e) {
    return { ok: false, refusal: refusalFromThrown("void_bank_reconciliation", e) };
  }
}

export async function runResolveBankLineException(ctx: ToolCtx, input: ResolveBankLineExceptionInput, modelId: string, taskId: string, segment: number): Promise<BankActToolResult> {
  if (!ctx.clientId) return noClientRefusal();
  const opKey = bankOpKey(taskId, segment, "resolve_bank_line_exception", { exception_id: input.exception_id, disposition: input.disposition });
  try {
    const raw = await callBank(
      ctx,
      "select clara.wake_resolve_bank_line_exception($1::uuid,$2::text,$3::text,$4::uuid,$5::text,$6::jsonb,$7::text,$8::text) as receipt",
      [input.exception_id, input.disposition, input.note ?? null, input.counterpart_line_id ?? null, input.rationale, JSON.stringify(chatBankModelSnapshot(modelId)), input.inputs_digest, opKey],
    );
    return classifyBankResult("resolve_bank_line_exception", raw, input.exception_id, opKey);
  } catch (e) {
    return { ok: false, refusal: refusalFromThrown("resolve_bank_line_exception", e) };
  }
}

export async function runProposeBankLineException(ctx: ToolCtx, input: ProposeBankLineExceptionInput, modelId: string, taskId: string, segment: number): Promise<BankActToolResult> {
  if (!ctx.clientId) return noClientRefusal();
  const opKey = bankOpKey(taskId, segment, "propose_bank_line_exception", { line_id: input.line_id, kind: input.kind });
  try {
    const raw = await callBank(
      ctx,
      "select clara.wake_propose_bank_line_exception($1::uuid,$2::text,$3::text,$4::uuid,$5::text,$6::jsonb,$7::text,$8::text) as receipt",
      [input.line_id, input.kind, input.reason, input.evidence_document_id ?? null, input.rationale, JSON.stringify(chatBankModelSnapshot(modelId)), input.inputs_digest, opKey],
    );
    return classifyBankResult("propose_bank_line_exception", raw, input.line_id, opKey);
  } catch (e) {
    return { ok: false, refusal: refusalFromThrown("propose_bank_line_exception", e) };
  }
}

export async function runVoidBankStatement(ctx: ToolCtx, input: VoidBankStatementInput, modelId: string, taskId: string, segment: number): Promise<BankActToolResult> {
  if (!ctx.clientId) return noClientRefusal();
  const opKey = bankOpKey(taskId, segment, "void_bank_statement", { statement_id: input.statement_id });
  try {
    const raw = await callBank(ctx, "select clara.wake_void_bank_statement($1::uuid,$2::uuid,$3::text,$4::text,$5::jsonb,$6::text,$7::text) as receipt", [
      ctx.clientId,
      input.statement_id,
      input.reason,
      input.rationale,
      JSON.stringify(chatBankModelSnapshot(modelId)),
      input.inputs_digest,
      opKey,
    ]);
    return classifyBankResult("void_bank_statement", raw, input.statement_id, opKey);
  } catch (e) {
    return { ok: false, refusal: refusalFromThrown("void_bank_statement", e) };
  }
}

export async function runProposeBankIdentifierPromotion(ctx: ToolCtx, input: ProposeBankIdentifierPromotionInput, modelId: string, taskId: string, segment: number): Promise<BankActToolResult> {
  if (!ctx.clientId) return noClientRefusal();
  const opKey = bankOpKey(taskId, segment, "propose_bank_identifier_promotion", { counterparty_id: input.counterparty_id, identifier_value: input.identifier_value });
  try {
    const raw = await callBank(
      ctx,
      "select clara.wake_propose_bank_identifier_promotion($1::uuid,$2::uuid,$3::text,$4::text,$5::int,$6::text,$7::jsonb,$8::text,$9::text) as receipt",
      [ctx.clientId, input.counterparty_id, input.identifier_kind, input.identifier_value, input.times_seen, input.rationale, JSON.stringify(chatBankModelSnapshot(modelId)), input.inputs_digest, opKey],
    );
    return classifyBankResult("propose_bank_identifier_promotion", raw, input.counterparty_id, opKey);
  } catch (e) {
    return { ok: false, refusal: refusalFromThrown("propose_bank_identifier_promotion", e) };
  }
}

export async function runResolveAndBookBankLine(ctx: ToolCtx, input: ResolveAndBookBankLineInput, modelId: string, taskId: string, segment: number): Promise<BankActToolResult> {
  if (!ctx.clientId) return noClientRefusal();
  const opKey = bankOpKey(taskId, segment, "resolve_and_book_bank_line", { exception_id: input.exception_id, disposition: input.disposition });
  try {
    const raw = await callBank(
      ctx,
      "select clara.wake_resolve_and_book_bank_line($1::uuid,$2::uuid,$3::text,$4::text,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::bigint,$10::text,$11::text,$12::jsonb,$13::text,$14::text,$15::boolean) as receipt",
      [
        ctx.clientId,
        input.exception_id,
        input.disposition,
        input.note ?? null,
        JSON.stringify(input.draft),
        JSON.stringify(input.allocations),
        JSON.stringify(input.adjustments),
        JSON.stringify(input.advance_applications),
        input.charge_cents ?? null,
        input.charge_account ?? null,
        input.rationale,
        JSON.stringify(chatBankModelSnapshot(modelId)),
        input.inputs_digest,
        opKey,
        input.ack_period_exceptions,
      ],
    );
    return classifyBankResult("resolve_and_book_bank_line", raw, input.exception_id, opKey);
  } catch (e) {
    return { ok: false, refusal: refusalFromThrown("resolve_and_book_bank_line", e) };
  }
}
