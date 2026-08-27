// The /bank matching workbench — READS. Every function below is a read
// RPC — transport via callDoor; not a governed act: no confirmation UI, no
// re-read-after semantics. See reads.ts's header for why callDoor (not
// getRows) is the correct transport for these — same reasoning, same
// migration (0038 §"SECTION R", plus list_unmatched_lines at 0040 §6).
//
// Arg names are EXACT, pinned in migration 0038/0040: list_open_items_by_
// counterparty(p_client, p_domain, p_counterparty), list_bank_match_
// candidates(p_client, p_bank_account), list_unmatched_lines(p_client).

import { callDoor } from "../doors";
import type { BankReadOptions } from "./reads";
import {
  toOpenItem, toMatchCandidateEntry, toUnmatchedLine,
  type OpenItemRow, type OpenItemDomain, type MatchCandidateEntryRow, type UnmatchedLineRow,
} from "./match-types";

/** The settle_from_bank_line allocation picker's source — open items by
 *  counterparty. `domain` is resolved client-side from the counterparty's
 *  kind (settlementDomainFor in match-types.ts). */
export async function listOpenItemsByCounterparty(
  clientId: string, domain: OpenItemDomain, counterpartyId: string, opts: BankReadOptions = {},
): Promise<OpenItemRow[]> {
  const out = await callDoor(
    "list_open_items_by_counterparty",
    { p_client: clientId, p_domain: domain, p_counterparty: counterpartyId },
    opts,
  );
  return (Array.isArray(out) ? out : []).map(toOpenItem);
}

/** The match_bank_line candidate-entry picker's source — approved entries
 *  touching this bank account, with DB-computed remaining capacity per
 *  side. */
export async function listBankMatchCandidates(
  clientId: string, bankAccountId: string, opts: BankReadOptions = {},
): Promise<MatchCandidateEntryRow[]> {
  const out = await callDoor("list_bank_match_candidates", { p_client: clientId, p_bank_account: bankAccountId }, opts);
  return (Array.isArray(out) ? out : []).map(toMatchCandidateEntry);
}

/** The cross-statement unmatched-line report (design §6) — the matching
 *  workbench's main entry surface: any unmatched line, on any statement,
 *  for this client. */
export async function listUnmatchedLines(clientId: string, opts: BankReadOptions = {}): Promise<UnmatchedLineRow[]> {
  const out = await callDoor("list_unmatched_lines", { p_client: clientId }, opts);
  return (Array.isArray(out) ? out : []).map(toUnmatchedLine);
}
