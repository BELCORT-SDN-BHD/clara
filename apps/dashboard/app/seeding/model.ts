// Pure seeding-ceremony logic (no React, no DB) — the S1/S4 tick-list rules made
// testable in isolation: kind grouping (stable order), tickability, batch lifecycle
// predicates, and status copy. Every string here is UI copy ONLY — no figure is
// computed; every count/state rendered by the view comes straight off the DB row.

import type { SeedingBatch, SeedingProposal } from "../shared/seedingApi";

export const PROPOSAL_KIND_LABEL: Record<string, string> = {
  vendor_account_rule: "Vendor → account rules",
  counterparty_birth: "New counterparties",
  wiki_fact: "Knowledge-page facts",
};

export const PROPOSAL_KIND_ORDER = ["vendor_account_rule", "counterparty_birth", "wiki_fact"] as const;

export type ProposalGroup = { kind: string; label: string; rows: SeedingProposal[] };

/** Group by proposal_kind, known kinds first in the pinned order, any unknown kind
 *  trailing (never dropped — the CLR33 negative side: an unknown kind still renders,
 *  just without a pretty label). */
export function groupProposalsByKind(rows: SeedingProposal[]): ProposalGroup[] {
  const byKind = new Map<string, SeedingProposal[]>();
  for (const r of rows) {
    const list = byKind.get(r.proposal_kind);
    if (list) list.push(r);
    else byKind.set(r.proposal_kind, [r]);
  }
  const known = PROPOSAL_KIND_ORDER.filter((k) => byKind.has(k)).map((k) => ({
    kind: k,
    label: PROPOSAL_KIND_LABEL[k] ?? k,
    rows: byKind.get(k) ?? [],
  }));
  const rest = [...byKind.keys()]
    .filter((k) => !(PROPOSAL_KIND_ORDER as readonly string[]).includes(k))
    .map((k) => ({ kind: k, label: PROPOSAL_KIND_LABEL[k] ?? k, rows: byKind.get(k) ?? [] }));
  return [...known, ...rest];
}

export function batchIsOpen(b: SeedingBatch | null): boolean {
  return !!b && b.state === "open";
}

/** Only a `proposed` row in an OPEN batch is tickable/declinable — a refused row is
 *  NEVER tickable (it was refused at parse time, e.g. control_account), and a
 *  ticked/declined row is terminal. This is the UI half of a defense-in-depth pair:
 *  the DB re-refuses `batch_not_open` / `proposal_not_open` regardless (S4). */
export function isDecidable(p: SeedingProposal, batchOpen: boolean): boolean {
  return batchOpen && p.state === "proposed";
}

export function proposalStatusCopy(p: SeedingProposal): string {
  switch (p.state) {
    case "proposed":
      return "proposed — not yet ticked";
    case "ticked":
      return "ticked";
    case "declined":
      return p.decision_reason ? `declined: ${p.decision_reason}` : "declined";
    case "refused":
      return p.refuse_reason ? `refused at parse: ${p.refuse_reason}` : "refused at parse";
    default:
      return p.state;
  }
}

export function batchStatusCopy(b: SeedingBatch): string {
  if (b.state === "cancelled") return b.cancel_reason ? `Batch cancelled: ${b.cancel_reason}` : "Batch cancelled.";
  if (b.state === "completed") return "Batch completed.";
  return "Batch open.";
}

/** A short label for a proposal's proposed target (vendor/account preview) —
 *  DB-authored payload fields only, never invented. Falls back honestly when the
 *  parse lane's payload shape does not carry a recognizable name. */
export function proposalTargetLabel(p: SeedingProposal): string {
  const name =
    (typeof p.payload.name === "string" && p.payload.name) ||
    (typeof p.payload.counterparty_name === "string" && p.payload.counterparty_name) ||
    null;
  const account = typeof p.payload.account_code === "string" ? p.payload.account_code : null;
  if (name && account) return `${name} → ${account}`;
  if (name) return name;
  if (account) return account;
  return p.proposal_key;
}
