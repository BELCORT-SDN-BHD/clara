// #949 — the wire shapes of the tenancy lane's four reads and two doors (migration 0300).
//
// NORMALISED AT THE BOUNDARY, never trusted: PostgREST hands back whatever the door returned and
// every numeric that crosses a JSON boundary as a `bigint` column can arrive as a STRING. The
// `to*` helpers below are the ONE place that is repaired, so no component ever does
// `Number(row.amount_cents)` inline and no two components disagree about what a missing field
// means. The same posture `lib/bank/payroll-settlement-types.ts` takes for #947.

/** The closed term vocabulary migration 0300 ships. A key outside it is a row the UI renders as
 *  unrecognised rather than guessing a label for. */
export const CONTRACT_TERM_KEYS = [
  "monthly_rent", "deposit", "term_start", "term_end", "escalation",
] as const;
export type ContractTermKey = (typeof CONTRACT_TERM_KEYS)[number];

export function isContractTermKey(key: string): key is ContractTermKey {
  return (CONTRACT_TERM_KEYS as readonly string[]).includes(key);
}

/** How a recorded term came to be what it is — the honesty column, rendered on the page so a
 *  person can tell a READING from a DERIVATION from something somebody typed. */
export type ContractTermBasisKind = "document_region" | "derived_from_regions" | "person_stated";

export type ContractTermEscalation = {
  effective_from: string | null;
  new_amount_cents: number | null;
  printed_raw: string | null;
};

export type ContractTerm = {
  id: string;
  term_key: string;
  amount_cents: number | null;
  term_date: string | null;
  escalation: ContractTermEscalation | null;
  printed_raw: string | null;
  source_extraction_id: string | null;
  /** The clara.document_regions rows this term was read or derived from. Empty for a
   *  person-stated term, by the table's own CHECK. */
  source_region_ids: string[];
  basis_kind: ContractTermBasisKind | string;
  basis: string;
  superseded_at: string | null;
  supersede_reason: string | null;
};

export type ContractTermsRead = {
  document_id: string | null;
  client_id: string | null;
  agreement_class: string | null;
  terms: ContractTerm[];
  history: ContractTerm[];
};

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

const ids = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

export function toContractTerm(raw: unknown): ContractTerm {
  const r = (raw ?? {}) as Record<string, unknown>;
  const esc = (r.escalation ?? null) as Record<string, unknown> | null;
  return {
    id: String(r.id ?? ""),
    term_key: String(r.term_key ?? ""),
    amount_cents: num(r.amount_cents),
    term_date: str(r.term_date),
    escalation: esc
      ? {
          effective_from: str(esc.effective_from),
          new_amount_cents: num(esc.new_amount_cents),
          printed_raw: str(esc.printed_raw),
        }
      : null,
    printed_raw: str(r.printed_raw),
    source_extraction_id: str(r.source_extraction_id),
    source_region_ids: ids(r.source_region_ids),
    basis_kind: String(r.basis_kind ?? ""),
    basis: String(r.basis ?? ""),
    superseded_at: str(r.superseded_at),
    supersede_reason: str(r.supersede_reason),
  };
}

export function toContractTermsRead(raw: unknown): ContractTermsRead {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    document_id: str(r.document_id),
    client_id: str(r.client_id),
    agreement_class: str(r.agreement_class),
    terms: Array.isArray(r.terms) ? r.terms.map(toContractTerm) : [],
    history: Array.isArray(r.history) ? r.history.map(toContractTerm) : [],
  };
}

/** The lessee-treatment branch the owner ruled on 2026-09-20 — MPERS Section 20 / MFRS 16. */
export type TenancyTreatment = {
  drafts: boolean;
  framework_code: string | null;
  framework_in_force: string | null;
  monthly_rent_cents: number | null;
  term_start: string | null;
  term_end: string | null;
  term_months: number | null;
  missing_terms: string[];
  standard: string | null;
  basis: string | null;
  reason: string | null;
  question: string | null;
};

export type TenancyPlanBasisLine = {
  account_code: string;
  debit_cents: number;
  credit_cents: number;
  description: string | null;
};

export type TenancyPlanDraft = {
  kind: string;
  purpose: string;
  frequency: string;
  day_rule: string;
  day_of_month: number | null;
  effective_from: string | null;
  effective_to: string | null;
  occurrences: number | null;
  rent_account_code: string | null;
  rent_account_name: string | null;
  payable_account_code: string | null;
  payable_account_name: string | null;
  monthly_rent_cents: number | null;
  lines: TenancyPlanBasisLine[];
};

export type TenancyDraftRefusal = { reason: string; detail: Record<string, unknown> };

export type TenancyRentPlanDraftRead = {
  document_id: string | null;
  client_id: string | null;
  agreement_class: string | null;
  treatment: TenancyTreatment | null;
  plan: TenancyPlanDraft | null;
  refusals: TenancyDraftRefusal[];
  confirmed: boolean;
  plan_id: string | null;
  plan_status: string | null;
  inert: boolean;
};

function toTreatment(raw: unknown): TenancyTreatment | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    drafts: r.drafts === true,
    framework_code: str(r.framework_code),
    framework_in_force: str(r.framework_in_force),
    monthly_rent_cents: num(r.monthly_rent_cents),
    term_start: str(r.term_start),
    term_end: str(r.term_end),
    term_months: num(r.term_months),
    missing_terms: Array.isArray(r.missing_terms)
      ? r.missing_terms.filter((x): x is string => typeof x === "string")
      : [],
    standard: str(r.standard),
    basis: str(r.basis),
    reason: str(r.reason),
    question: str(r.question),
  };
}

function toPlan(raw: unknown): TenancyPlanDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const basis = (r.basis ?? {}) as Record<string, unknown>;
  const lines = Array.isArray(basis.lines) ? basis.lines : [];
  return {
    kind: String(r.kind ?? ""),
    purpose: String(r.purpose ?? ""),
    frequency: String(r.frequency ?? ""),
    day_rule: String(r.day_rule ?? ""),
    day_of_month: num(r.day_of_month),
    effective_from: str(r.effective_from),
    effective_to: str(r.effective_to),
    occurrences: num(r.occurrences),
    rent_account_code: str(r.rent_account_code),
    rent_account_name: str(r.rent_account_name),
    payable_account_code: str(r.payable_account_code),
    payable_account_name: str(r.payable_account_name),
    monthly_rent_cents: num(r.monthly_rent_cents),
    lines: lines.map((l) => {
      const x = (l ?? {}) as Record<string, unknown>;
      return {
        account_code: String(x.account_code ?? ""),
        debit_cents: num(x.debit_cents) ?? 0,
        credit_cents: num(x.credit_cents) ?? 0,
        description: str(x.description),
      };
    }),
  };
}

export function toTenancyRentPlanDraft(raw: unknown): TenancyRentPlanDraftRead {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    document_id: str(r.document_id),
    client_id: str(r.client_id),
    agreement_class: str(r.agreement_class),
    treatment: toTreatment(r.treatment),
    plan: toPlan(r.plan),
    refusals: Array.isArray(r.refusals)
      ? r.refusals.map((x) => {
          const o = (x ?? {}) as Record<string, unknown>;
          return {
            reason: String(o.reason ?? ""),
            detail: (o.detail ?? {}) as Record<string, unknown>,
          };
        })
      : [],
    confirmed: r.confirmed === true,
    plan_id: str(r.plan_id),
    plan_status: str(r.plan_status),
    inert: r.inert === true,
  };
}
