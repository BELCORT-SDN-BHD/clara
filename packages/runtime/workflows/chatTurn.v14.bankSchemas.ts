// @frozen
//
// FROZEN — part of the chatTurn_v14 closure (F-A3 PR-3, OQ-6). Zod schemas for the twelve bank
// ACT verbs (get_bank_pack's schema lives in chatTurn.v14.bank.ts beside its own run function —
// it is the read verb the other twelve depend on). Split into its own file to keep
// chatTurn.v14.bank.ts within this repo's file-size discipline; see that file's header for the
// closure-wide rationale (parity, provenance ownership, op-key segment-qualification).
//
// Positional args are byte-exact against 0121's live `wake_*` signatures (grant lines, F-A3/
// PR-1b). `p_client` is injected server-side from ctx wherever the wrapper takes it explicitly —
// never model-supplied. jsonb array/object fields (lines, entries, adjustments, allocations,
// draft, advance_applications) are typed loosely (record/unknown) rather than mirroring the DB's
// own internal validation: the model learns their real shape from get_bank_pack's own returned
// objects, and the DB is the final arbiter either way (constraint 2 — the DB owns every number).

import { z } from "zod";

export const addBankAccountInputSchema = z.object({
  coa_account_code: z.string().min(1).describe("The COA account code this bank account is bound to."),
  proposal_id: z.string().uuid().describe("The bank_account_proposals row this registration confirms — from the pack's proposals."),
  bank_code: z.string().min(1),
  account_number: z.string().min(1),
  bank_name_display: z.string().min(1),
  rationale: z.string().min(1).max(4000),
  inputs_digest: z.string().min(1).describe("The digest returned by get_bank_pack for this client."),
});
export type AddBankAccountInput = z.infer<typeof addBankAccountInputSchema>;

export const upsertBankCoaAccountInputSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  special_acc_type: z.string().nullable().optional(),
  account_class: z.string().nullable().optional(),
  rationale: z.string().min(1).max(4000),
  inputs_digest: z.string().min(1),
});
export type UpsertBankCoaAccountInput = z.infer<typeof upsertBankCoaAccountInputSchema>;

export const matchBankLineInputSchema = z.object({
  lines: z.array(z.unknown()).min(1).describe("The statement line id(s) being matched — from get_bank_pack's `lines`."),
  entries: z.array(z.record(z.string(), z.unknown())).default([]).describe("Candidate journal entries being tied, each {entry_id, matched_cents} — from get_bank_pack's `candidates`."),
  adjustments: z.array(z.record(z.string(), z.unknown())).default([]).describe("Any adjustment legs {account_code, amount_cents} closing the difference. Supplying even one POSTS a new, already-approved journal entry — omit this entirely for a plain match that mints nothing."),
  ack_period_exceptions: z.boolean().default(false).describe("Set true only when knowingly acknowledging a posting-date-after-period-end exception."),
  rationale: z.string().min(1).max(4000),
  inputs_digest: z.string().min(1),
});
export type MatchBankLineInput = z.infer<typeof matchBankLineInputSchema>;

export const settleFromBankLineInputSchema = z.object({
  line_id: z.string().uuid(),
  counterparty_id: z.string().uuid(),
  allocations: z.array(z.record(z.string(), z.unknown())).default([]).describe("Open items this settlement allocates against."),
  memo: z.string().nullable().optional(),
  posting_date: z.string().describe("ISO date (YYYY-MM-DD) for the minted entry."),
  charge_cents: z.number().int().nullable().optional().describe("A bank charge/fee leg amount, if any."),
  charge_account: z.string().nullable().optional(),
  adjustments: z.array(z.record(z.string(), z.unknown())).default([]),
  control_account: z.string().nullable().optional(),
  rationale: z.string().min(1).max(4000),
  inputs_digest: z.string().min(1),
});
export type SettleFromBankLineInput = z.infer<typeof settleFromBankLineInputSchema>;

export const unmatchBankMatchInputSchema = z.object({
  match_id: z.string().uuid(),
  reason: z.string().min(1),
  rationale: z.string().min(1).max(4000),
  inputs_digest: z.string().min(1),
});
export type UnmatchBankMatchInput = z.infer<typeof unmatchBankMatchInputSchema>;

export const completeBankReconciliationInputSchema = z.object({
  statement_id: z.string().uuid(),
  ack_outstanding: z.array(z.string().uuid()).default([]).describe("Line ids the human acknowledged will stay outstanding across this reconciliation."),
  rationale: z.string().min(1).max(4000),
  inputs_digest: z.string().min(1),
});
export type CompleteBankReconciliationInput = z.infer<typeof completeBankReconciliationInputSchema>;

export const voidBankReconciliationInputSchema = z.object({
  reconciliation_id: z.string().uuid(),
  reason: z.string().min(1),
  rationale: z.string().min(1).max(4000),
  inputs_digest: z.string().min(1),
});
export type VoidBankReconciliationInput = z.infer<typeof voidBankReconciliationInputSchema>;

export const resolveBankLineExceptionInputSchema = z.object({
  exception_id: z.string().uuid(),
  disposition: z.string().min(1).describe("How the exception is resolved — from the exception's own allowed dispositions."),
  note: z.string().nullable().optional(),
  counterpart_line_id: z.string().uuid().nullable().optional(),
  rationale: z.string().min(1).max(4000),
  inputs_digest: z.string().min(1),
});
export type ResolveBankLineExceptionInput = z.infer<typeof resolveBankLineExceptionInputSchema>;

export const proposeBankLineExceptionInputSchema = z.object({
  line_id: z.string().uuid(),
  kind: z.string().min(1),
  reason: z.string().min(1),
  evidence_document_id: z.string().uuid().nullable().optional(),
  rationale: z.string().min(1).max(4000),
  inputs_digest: z.string().min(1),
});
export type ProposeBankLineExceptionInput = z.infer<typeof proposeBankLineExceptionInputSchema>;

export const voidBankStatementInputSchema = z.object({
  statement_id: z.string().uuid(),
  reason: z.string().min(1),
  rationale: z.string().min(1).max(4000),
  inputs_digest: z.string().min(1),
});
export type VoidBankStatementInput = z.infer<typeof voidBankStatementInputSchema>;

export const proposeBankIdentifierPromotionInputSchema = z.object({
  counterparty_id: z.string().uuid(),
  identifier_kind: z.string().min(1),
  identifier_value: z.string().min(1),
  times_seen: z.number().int().min(1),
  rationale: z.string().min(1).max(4000),
  inputs_digest: z.string().min(1),
});
export type ProposeBankIdentifierPromotionInput = z.infer<typeof proposeBankIdentifierPromotionInputSchema>;

export const resolveAndBookBankLineInputSchema = z.object({
  exception_id: z.string().uuid(),
  disposition: z.string().min(1),
  note: z.string().nullable().optional(),
  draft: z.record(z.string(), z.unknown()).describe("The entry draft to book alongside the resolution."),
  allocations: z.array(z.record(z.string(), z.unknown())).default([]),
  adjustments: z.array(z.record(z.string(), z.unknown())).default([]),
  advance_applications: z.array(z.record(z.string(), z.unknown())).default([]),
  charge_cents: z.number().int().nullable().optional(),
  charge_account: z.string().nullable().optional(),
  ack_period_exceptions: z.boolean().default(false),
  rationale: z.string().min(1).max(4000),
  inputs_digest: z.string().min(1),
});
export type ResolveAndBookBankLineInput = z.infer<typeof resolveAndBookBankLineInputSchema>;
