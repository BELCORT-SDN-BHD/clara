// #949 — the tenancy lane's READS (migration 0300). Transport via callDoor, not getRows: every
// one of these is `language plpgsql security definer` with no volatility qualifier (so VOLATILE
// by default), and PostgREST requires POST for a volatile function — the reads.ts/match-reads.ts
// idiom #947 followed for the same reason.
//
// Arg names are EXACT, pinned in migration 0300.

import { callDoor, type CallDoorOptions } from "../doors";
import {
  toContractTermsRead, toTenancyRentPlanDraft,
  type ContractTermsRead, type TenancyRentPlanDraftRead,
} from "./tenancy-types";

/** The live contract terms of one agreement, in the vocabulary's own order, with the superseded
 *  readings beside them. Each term carries the document_regions row(s) it was read or derived
 *  from, which is what lets the page say WHERE on the page a figure came from. */
export async function getContractTerms(
  documentId: string, opts: CallDoorOptions = {},
): Promise<ContractTermsRead> {
  return toContractTermsRead(await callDoor("get_contract_terms", { p_document: documentId }, opts));
}

/** The terms Clara can already read off the banked agreement reading, each with its region, and
 *  the terms she could not read and why. A pure read: it records nothing. */
export async function proposeContractTerms(
  documentId: string, opts: CallDoorOptions = {},
): Promise<unknown> {
  return callDoor("propose_contract_terms", { p_document: documentId }, opts);
}

/** The rent plan this tenancy would run, the lessee-treatment branch that decided whether Clara
 *  may draft it at all, and whether a person has already confirmed one. Inert by construction:
 *  reading it starts nothing. */
export async function getTenancyRentPlanDraft(
  documentId: string, opts: CallDoorOptions = {},
): Promise<TenancyRentPlanDraftRead> {
  return toTenancyRentPlanDraft(
    await callDoor("get_tenancy_rent_plan_draft", { p_document: documentId }, opts),
  );
}

/** The plan revision a recorded escalation is asking for, before its effective date. */
export async function getTenancyEscalationRevision(
  documentId: string, opts: CallDoorOptions = {},
): Promise<unknown> {
  return callDoor("get_tenancy_escalation_revision", { p_document: documentId }, opts);
}
