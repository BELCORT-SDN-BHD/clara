// #949 — the tenancy lane's DOORS (migration 0300).
//
// A FRESH op_key per call (the settle_from_bank_line / #947 posture, not match_bank_line's
// derived-key one): each of these doors' identity is "confirm THIS, now", a decision a person
// makes once per click rather than one whose retry-safety depends on an intent tuple staying
// stable across re-renders.
//
// `p_judgement` IS SENT EVEN WHEN NULL, deliberately. The database's own wall is "the lessee
// branch asked and nobody wrote down the treatment they are taking"; omitting the argument would
// let a future default change what a null means on the wire. Null is an answer here.

import { callDoor, type CallDoorOptions } from "../doors";

export type ContractTermInput = {
  term_key: string;
  amount_cents?: number | null;
  term_date?: string | null;
  escalation?: { effective_from: string; new_amount_cents: number; printed_raw?: string | null } | null;
  printed_raw?: string | null;
  source_region_ids?: string[];
  basis_kind: "document_region" | "derived_from_regions" | "person_stated";
  basis: string;
  supersede_reason?: string | null;
};

export type ContractTermsReceipt = {
  document_id: string;
  client_id: string;
  recorded: number;
  superseded: number;
  terms: { id: string; term_key: string; supersedes: string | null }[];
};

export async function recordContractTerms(
  args: { clientId: string; documentId: string; terms: ContractTermInput[] },
  opts: CallDoorOptions = {},
): Promise<ContractTermsReceipt> {
  const body = {
    p_client: args.clientId,
    p_document: args.documentId,
    p_terms: args.terms,
    p_op_key: crypto.randomUUID(),
  };
  return (await callDoor("record_contract_terms", body, opts)) as ContractTermsReceipt;
}

export type RentPlanConfirmation = {
  document_id: string;
  client_id: string;
  confirmation_id: string;
  plan_id: string;
  revision_id: string;
  status: string;
  occurrences: number | null;
};

export async function confirmTenancyRentPlan(
  args: {
    clientId: string; documentId: string;
    rentAccount?: string | null; payableAccount?: string | null; judgement?: string | null;
  },
  opts: CallDoorOptions = {},
): Promise<RentPlanConfirmation> {
  const body = {
    p_client: args.clientId,
    p_document: args.documentId,
    p_rent_account: args.rentAccount ?? null,
    p_payable_account: args.payableAccount ?? null,
    p_judgement: args.judgement ?? null,
    p_op_key: crypto.randomUUID(),
  };
  return (await callDoor("confirm_tenancy_rent_plan", body, opts)) as RentPlanConfirmation;
}

export type RentPlanRevision = {
  document_id: string;
  client_id: string;
  confirmation_id: string;
  plan_id: string;
  revision: number;
  from_cents: number;
  to_cents: number;
  effective_from: string;
};

export async function confirmTenancyRentPlanRevision(
  args: { clientId: string; documentId: string; judgement?: string | null },
  opts: CallDoorOptions = {},
): Promise<RentPlanRevision> {
  const body = {
    p_client: args.clientId,
    p_document: args.documentId,
    p_judgement: args.judgement ?? null,
    p_op_key: crypto.randomUUID(),
  };
  return (await callDoor("confirm_tenancy_rent_plan_revision", body, opts)) as RentPlanRevision;
}
