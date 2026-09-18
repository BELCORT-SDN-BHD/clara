// The /bank matching workbench — READS. Every function below is a read
// RPC — transport via callDoor; not a governed act: no confirmation UI, no
// re-read-after semantics. See reads.ts's header for why callDoor (not
// getRows) is the correct transport for these — same reasoning, same
// migration (0038 §"SECTION R", plus list_unmatched_lines at 0040 §6).
//
// Arg names are EXACT, pinned in migration 0038/0040: list_open_items_by_
// counterparty(p_client, p_domain, p_counterparty), list_bank_match_
// candidates(p_client, p_bank_account), list_unmatched_lines(p_client).
//
// BODY OF RECORD — NOT 0038's TEXT — for list_open_items_by_counterparty. That body is
// CoR'd: 0038 created it and 裁-19 PR-1 SPLICED it, so the live definition is
// `pg_get_functiondef` on the catalog. TWO things changed there, and the second is a
// BEHAVIOUR CHANGE this module will see. (1) M9: the body passed the FIRM id where a CLIENT
// id was expected, so the resolver returned NULL and the door returned `[]` FOR EVERY
// COUNTERPARTY, ALWAYS, since 0038 — the picker below has never rendered a non-empty list.
// It will now. (2) The item predicate canonicalises, so asking under a merged party's id and
// under its survivor's returns the same union. The signature, the arg names and the row
// shape are unchanged; nothing in this file needed editing.

import { callDoor } from "../doors";
import type { BankReadOptions } from "./reads";
import {
  toOpenItem, toMatchCandidateEntry, toUnmatchedLine,
  type OpenItemRow, type OpenItemDomain, type MatchCandidateEntryRow, type UnmatchedLineRow,
} from "./match-types";
import { toBankLineMatchingContext, type BankLineMatchingContext } from "./matching-context-types";

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

/**
 * #657 (migration 0226) — everything ONE statement line can say about itself before a match is
 * decided. Arg name is EXACT: `get_bank_line_matching_context(p_line)`.
 *
 * THIS IS THE READ THAT KEEPS AN EXCEPTED LINE ON SCREEN. `list_unmatched_lines` EXCLUDES a
 * line carrying an open (or bank-corrective-resolved) exception BY DESIGN (0040:4117-4122), so
 * the report above cannot show it at all. AC12 needs that line visible and PENDING with a
 * linked recovery, and this read — asked for by id — is how it stays there. The door still
 * refuses `line_excepted`; nothing on this lane is a bypass.
 *
 * NULL is the honest answer for a line outside the caller's firm AND for a line that does not
 * exist: the DB returns the same NULL for both, deliberately, so this read is no existence
 * oracle. A caller must render "not available" for null and never infer which of the two it is.
 */
export async function getBankLineMatchingContext(
  lineId: string, opts: BankReadOptions = {},
): Promise<BankLineMatchingContext | null> {
  const out = await callDoor("get_bank_line_matching_context", { p_line: lineId }, opts);
  return toBankLineMatchingContext(out);
}
