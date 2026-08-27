// The /bank workbench — PLAIN TABLE reads, via getRows (lib/read.ts), never
// callDoor: every relation below is grant-select-to-clara_authenticated with
// a firm/client-scoped RLS policy (never an RPC), so it is genuinely
// GET-able. This is the OTHER read category (see reads.ts's header for the
// callDoor-transport category) — kept in its own file so the two are never
// confused: a plain table read has no "SECURITY DEFINER read RPC" caveat at
// all, it is the ordinary RLS-scoped GET every other P3 journey uses.
//
//   - clara.bank_line_exceptions (migration 0040 §4.2, policy p_ble_human)
//   - clara.bank_agent_proposals (F-A3 Annex A.4/M.2, migration 0121)
//   - clara.bank_agency_holds (F-A3 Annex D, migration 0121)
//   - clara.counterparties (migration 0021) — for the settle-from-line
//     counterparty picker.

import { getRows } from "../read";
import type { BankReadOptions } from "./reads";
import { toBankLineException, type BankLineExceptionRow } from "./exception-types";
import { toBankAgentProposal, type BankAgentProposalRow } from "./exception-types";
import { toBankAgencyHold, type BankAgencyHoldRow } from "./exception-types";
import { toCounterparty, type CounterpartyRow, type CounterpartyKind } from "./match-types";

/** Every OPEN bank_line_exceptions row for this client — the OWNER-floor
 *  exceptions awaiting resolve_bank_line_exception / resolve_and_book_bank_
 *  line (lib/bank/doors.ts). Distinct from the AGENT's own PROPOSAL to
 *  except a line (listOpenBankLineExceptionProposals, below) — an exception
 *  only exists once a human has actually minted it via except_bank_line. */
export async function listOpenBankLineExceptions(
  clientId: string, opts: BankReadOptions = {},
): Promise<BankLineExceptionRow[]> {
  const rows = await getRows<Record<string, unknown>>("bank_line_exceptions", {
    filters: { client_id: `eq.${clientId}`, status: "eq.open" },
    select: "id,line_id,statement_id,kind,reason,evidence_document_id,status,created_by,created_at,"
      + "resolved_by,resolved_at,resolution_disposition,resolution_note,counterpart_line_id",
    order: "created_at.desc",
    session: opts.session,
    signal: opts.signal,
  });
  return rows.map(toBankLineException);
}

const PROPOSAL_SELECT = "id,kind,subject_id,payload,rationale,status,created_at";

/** Every OPEN `line_exception` proposal for this client (M.2) — an AGENT
 *  suggestion; a human acts on it via except_bank_line (which auto-accepts
 *  the matching proposal, migration 0121 DDL 6's AFTER INSERT trigger). */
export async function listOpenBankLineExceptionProposals(
  clientId: string, opts: BankReadOptions = {},
): Promise<BankAgentProposalRow[]> {
  const rows = await getRows<Record<string, unknown>>("bank_agent_proposals", {
    filters: { client_id: `eq.${clientId}`, kind: "eq.line_exception", status: "eq.open" },
    select: PROPOSAL_SELECT,
    session: opts.session,
    signal: opts.signal,
  });
  return rows.map(toBankAgentProposal);
}

/** Every OPEN `identifier_promotion` proposal for this client. `payload`
 *  carries counterparty_id/identifier_kind/identifier_value/times_seen. */
export async function listOpenBankIdentifierPromotionProposals(
  clientId: string, opts: BankReadOptions = {},
): Promise<BankAgentProposalRow[]> {
  const rows = await getRows<Record<string, unknown>>("bank_agent_proposals", {
    filters: { client_id: `eq.${clientId}`, kind: "eq.identifier_promotion", status: "eq.open" },
    select: PROPOSAL_SELECT,
    session: opts.session,
    signal: opts.signal,
  });
  return rows.map(toBankAgentProposal);
}

/** No row yet ⇒ the lane has never been held (the DB default) — never
 *  fabricated, this is the honest "no hold has ever been set" state. */
export async function getBankAgencyHold(
  clientId: string, opts: BankReadOptions = {},
): Promise<BankAgencyHoldRow | null> {
  const rows = await getRows<Record<string, unknown>>("bank_agency_holds", {
    filters: { client_id: `eq.${clientId}` },
    select: "client_id,on_hold,reason,set_by,set_at",
    limit: 1,
    session: opts.session,
    signal: opts.signal,
  });
  return rows[0] ? toBankAgencyHold(rows[0]) : null;
}

/** The client's LIVE counterparties of one kind, by name — merged/retired
 *  parties excluded at the query (they are dead options, not selectable). */
export async function listCounterparties(
  clientId: string, kind: CounterpartyKind, opts: BankReadOptions = {},
): Promise<CounterpartyRow[]> {
  const rows = await getRows<Record<string, unknown>>("counterparties", {
    filters: { client_id: `eq.${clientId}`, kind: `eq.${kind}`, merged_into: "is.null", retired_at: "is.null" },
    select: "id,kind,name,registration_no,tin,merged_into,retired_at",
    order: "name.asc",
    session: opts.session,
    signal: opts.signal,
  });
  return rows.map(toCounterparty);
}
