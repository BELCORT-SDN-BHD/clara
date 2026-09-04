// The /bank workbench — account + statement DOORS (governed writes). Every
// function below is a real human act: it posts through lib/doors.ts's
// `callDoor`, throws its `DoorRefusal` VERBATIM (never retried, never
// re-worded — see components/bank/refusal-notice.tsx), and every caller
// re-reads afterward via lib/parts/hooks.ts's `useHydratedPart().act()` — no
// optimistic UI. This is the OTHER category from reads.ts (see that file's
// header): a door is a governed act with confirmation/refusal semantics, a
// read RPC is not.
//
// Every arg name is EXACT, pinned in migration 0038 (grep-verified this
// build): add_bank_account(p_client, p_coa_account_code, p_bank_code,
// p_account_number, p_bank_name_display, p_proposal_id, p_op_key) —
// PostgREST resolves by NAMED argument, so the caller's own key order below
// does not need to match the SQL declaration order. add_bank_account's own
// COA-binding check is clara._assert_bank_coa_candidate(p_client,
// p_coa_account_code) — this module does not pre-validate it locally; its
// refusal (CLR10) is surfaced verbatim by the caller, never guessed at here.

import { callDoor, type CallDoorOptions } from "../doors";

const opKey = () => crypto.randomUUID();

export async function addBankAccount(
  args: {
    clientId: string; coaAccountCode: string; bankCode: string; accountNumber: string;
    bankNameDisplay: string; proposalId?: string | null;
  },
  opts: CallDoorOptions = {},
): Promise<{ bank_account_id: string }> {
  const body: Record<string, unknown> = {
    p_client: args.clientId, p_coa_account_code: args.coaAccountCode, p_bank_code: args.bankCode,
    p_account_number: args.accountNumber, p_bank_name_display: args.bankNameDisplay, p_op_key: opKey(),
  };
  if (args.proposalId) body.p_proposal_id = args.proposalId;
  const out = (await callDoor("add_bank_account", body, opts)) as { bank_account_id?: string; id?: string } | null;
  const id = out?.bank_account_id ?? out?.id;
  if (!id) throw new Error("add_bank_account returned no bank_account_id");
  return { bank_account_id: id };
}

export async function deactivateBankAccount(
  clientId: string, bankAccountId: string, reason: string, opts: CallDoorOptions = {},
): Promise<void> {
  await callDoor(
    "deactivate_bank_account",
    { p_client: clientId, p_bank_account: bankAccountId, p_reason: reason, p_op_key: opKey() },
    opts,
  );
}

export async function reactivateBankAccount(
  clientId: string, bankAccountId: string, opts: CallDoorOptions = {},
): Promise<void> {
  await callDoor(
    "reactivate_bank_account",
    { p_client: clientId, p_bank_account: bankAccountId, p_op_key: opKey() },
    opts,
  );
}

/** Refuses while any pending/live match group exists on the account. */
export async function remapBankAccountCoa(
  clientId: string, bankAccountId: string, coaAccountCode: string, opts: CallDoorOptions = {},
): Promise<void> {
  await callDoor(
    "remap_bank_account_coa",
    { p_client: clientId, p_bank_account: bankAccountId, p_new_coa_account_code: coaAccountCode, p_op_key: opKey() },
    opts,
  );
}

// ---------------------------------------------------------------------------
// Statement writers. enter_bank_statement's signature is EXACT (design §4.3).
// ---------------------------------------------------------------------------

export type BankStatementHeaderInput = {
  /** H-06 — REQUIRED, and required as a PAIR with `account_number`.
   *  `clara._stmt_header_norm` reads both before anything else and raises CLR10
   *  `header_unreadable` when either is absent (0038:1189-1200), so a header
   *  without them can never reach a single one of the door's other validations.
   *
   *  Both halves must come from the SELECTED bank account row, never free text:
   *  `_persist_statement_core` compares them back to the named account
   *  (0038:1580-1583, `b.bank_code is distinct from v_inst or
   *  b.account_number_normalized is distinct from v_digits` -> `account_unregistered`).
   *  `institution_code` is that row's `bank_code`. */
  institution_code: string;
  /** The account number AS PRINTED on the account row (`BankAccountRow.account_number`),
   *  NOT `account_number_normalized`. The two normalizers deliberately differ and the
   *  migration says so in its own comment (0038:1190-1196): `add_bank_account` keeps the
   *  client-identifier spelling with HYPHENS PRESERVED, while this door digit-strips
   *  whatever it is handed and compares digits only. Sending the printed form is both
   *  correct under that comparison and the more honest receipt payload. */
  account_number: string;
  period_start: string; period_end: string;
  /** REQUIRED — the normalizer rejects a null or non-ISO statement_date with the same
   *  CLR10 `header_unreadable` (0038:1211-1218), so `null` was never a lawful value. */
  statement_date: string;
  opening_cents: number; closing_cents: number;
  total_debit_cents: number | null; total_credit_cents: number | null;
  /** null => MYR (absence reads MYR); a non-null non-MYR code is the
   *  `non_myr_statement` refusal path. */
  currency: string | null;
};

export type BankStatementLineInput = {
  line_no: number; entry_date: string; value_date: string | null;
  description: string | null; amount_cents: number; running_balance_cents: number | null;
};

export async function enterBankStatement(
  args: {
    clientId: string; bankAccountId: string; documentId: string;
    header: BankStatementHeaderInput; lines: BankStatementLineInput[];
  },
  opts: CallDoorOptions = {},
): Promise<{ statement_id: string }> {
  const out = (await callDoor(
    "enter_bank_statement",
    {
      p_client: args.clientId, p_bank_account: args.bankAccountId, p_document: args.documentId,
      p_header: args.header, p_lines: args.lines, p_op_key: opKey(),
    },
    opts,
  )) as { statement_id?: string; id?: string } | null;
  const id = out?.statement_id ?? out?.id;
  if (!id) throw new Error("enter_bank_statement returned no statement_id");
  return { statement_id: id };
}

export async function voidBankStatement(
  clientId: string, statementId: string, reason: string, opts: CallDoorOptions = {},
): Promise<void> {
  await callDoor(
    "void_bank_statement",
    { p_client: clientId, p_statement: statementId, p_reason: reason, p_op_key: opKey() },
    opts,
  );
}
