// The /bank "certify" lane — READS. get_bank_reconciliation is a read RPC —
// transport via callDoor; not a governed act: no confirmation UI, no
// re-read-after semantics. Same reasoning as reads.ts's header (migration
// 0040 §3/§6, plain VOLATILE plpgsql — PostgREST requires POST).
//
// get_bank_reconciliation(p_statement) returns the COMPLETE receipt when one
// exists, or the DERIVED open preview otherwise (design §6) — never null in
// the open-statement case; null only degrades a truly empty/unreadable
// response.

import { callDoor } from "../doors";
import type { BankReadOptions } from "./reads";
import { toBankReconciliationView, type BankReconciliationView } from "./recon-types";

export async function getBankReconciliation(
  statementId: string, opts: BankReadOptions = {},
): Promise<BankReconciliationView | null> {
  const out = await callDoor("get_bank_reconciliation", { p_statement: statementId }, opts);
  if (!out) return null;
  return toBankReconciliationView(out);
}
