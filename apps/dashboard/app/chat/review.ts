// je_review — the human-lane draft review + approve/edit/discard surface
// (contract §6, INTERFACE-PINS §1/§4). The je_review part carries ids ONLY; the
// card re-derives authoritative state via get_draft_review on every render and
// after every action (no optimistic UI — the answer_interruption precedent,
// brief 5b). Every writer is a direct PostgREST RPC with a fresh op_key per click,
// on the human lane (never the runtime — §4.2 governance law).
//
// Cross-lane note: the exact jsonb field names of get_draft_review are 0009's
// (L1) internal shape; toDraftReview below is the SINGLE place to reconcile those
// key names at integration. The reads are defensive (they mirror applyChunk's
// field-name tolerance), so a key rename degrades a field, never crashes the card.

import { rpc, type ProvenanceTier, type Uncertainty } from "./api";

export type DraftLine = {
  account_code: string;
  account_name: string | null;
  debit_cents: number;
  credit_cents: number;
  description?: string | null;
  is_payable: boolean; // payable-class line — carries the vendor counterparty
  counterparty_name?: string | null;
};

/** The vendor the draft CARRIES (S6-R8): born on approval, or matched existing. */
export type VendorProposal = {
  disposition: "new" | "matched" | "unresolved" | "ambiguous";
  name: string;
  registration_no?: string | null;
  matched_counterparty_id?: string | null;
  note?: string | null; // e.g. "matched on registration", ambiguity candidate note
};

/** A cited fact (contract §4 / C-9): Tier-A verified fields or Tier-B model reads,
 *  each bound to a document region so hydration always knows the source text. */
export type EvidenceRow = {
  field_path: string | null;
  quote: string;
  region_id: string | null;
  provenance_tier: ProvenanceTier;
};

/** The amount exception (W1/F1): a supplier_bill total mismatch is PERSISTED at
 *  draft on `entry.flags.amount_exception` — the draft no longer refuses at draft
 *  time. The card renders the panel from THIS hydrated state (never synthesized from
 *  a caught error); the machine region for the citation/override comes from a
 *  separate getMachineTotal read. */
export type AmountException = {
  machine_total_cents: number | null;
  proposed_cents: number;
  fact_hash: string | null;
  at: string | null;
};

/** Stamped ONLY via revise_entry's p_amount_override (W1): clears the approve block
 *  and sets HIGH-STAKES so a distinct checker binds. */
export type AmountOverride = { reason: string; region_id: string | null; actor: string | null; at: string | null };

/** Advisory near-duplicate bills (W2): a non-blocking "possible duplicate" notice. */
export type NearDuplicate = {
  entry_id: string;
  document_id: string | null;
  invoice_id: string | null;
  total_cents: number | null;
  posting_date: string | null;
};

export type DraftReview = {
  entry_id: string;
  client_id: string | null;
  document_id: string | null;
  filing_id: string | null;
  status: string; // 'draft' | 'approved' | 'withdrawn' | …
  revision_token: string;
  posting_date: string | null;
  memo: string | null;
  lines: DraftLine[];
  vendor: VendorProposal | null;
  evidence: EvidenceRow[];
  provenance_tier: ProvenanceTier;
  amount_label: string; // "machine-corroborated total" (Tier A) | "read by Clara …" (Tier B)
  uncertainty: Uncertainty | null;
  high_stakes: boolean;
  high_stakes_reasons: string[];
  eligible_checker_count: number;
  amount_exception: AmountException | null; // entry.flags.amount_exception (persisted)
  amount_override: AmountOverride | null; // entry.flags.amount_override (stamped)
  near_duplicates: NearDuplicate[];
};

function num(v: unknown): number {
  return typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : 0;
}
function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Map the vendor decision from counterparty.current_outcome (0009) to the card
 *  badge. current_outcome === null ⇒ NO match ⇒ birth-on-approve ("new vendor"). */
function mapDisposition(decision: string | null): { disposition: VendorProposal["disposition"]; note: string | null } {
  switch (decision) {
    case "registration_match":
      return { disposition: "matched", note: "matched on registration" };
    case "name_match_unregistered":
      return { disposition: "matched", note: "matched on name (unregistered vendor)" };
    case "registered_name_ambiguous":
      return { disposition: "ambiguous", note: "a registered vendor matches this name — confirm the identity" };
    case "registration_conflict":
      return { disposition: "ambiguous", note: "registration conflict — a name-equal vendor carries a different registration" };
    default:
      return { disposition: "unresolved", note: decision };
  }
}

/** Map the raw get_draft_review jsonb into the card's DraftReview. This is the ONE
 *  place to reconcile 0009's key names. Actual shape (per integration):
 *  { entry:<journal_entries row>, lines:[...], counterparty:{proposal, fingerprint,
 *  current_outcome:{decision,counterparty_id?,name_normalized,...}|null}, evidence:[...],
 *  eligible_checker_count, high_stakes }. Defensive reads: a rename degrades a field. */
export function toDraftReview(raw: unknown): DraftReview {
  const r = (raw ?? {}) as Record<string, unknown>;
  const entry = (r.entry ?? {}) as Record<string, unknown>;
  const flags = (entry.flags ?? {}) as Record<string, unknown>;
  const cp = (r.counterparty ?? null) as Record<string, unknown> | null;
  const proposal = (cp?.proposal ?? null) as Record<string, unknown> | null;
  // The proposal is {new:{name, registration_no}} | {existing_id} (NOT a flat name).
  const proposalNew = (proposal?.new ?? null) as Record<string, unknown> | null;
  const proposalExistingId = str(proposal?.existing_id);
  const outcome = (cp?.current_outcome ?? null) as Record<string, unknown> | null;
  const unc = (entry.uncertainty ?? flags.uncertainty ?? null) as Record<string, unknown> | null;
  const amountEx = (flags.amount_exception ?? null) as Record<string, unknown> | null;
  const amountOv = (flags.amount_override ?? null) as Record<string, unknown> | null;

  const vendorName = str(proposalNew?.name) ?? str(outcome?.name_normalized);
  const evidence: EvidenceRow[] = arr(r.evidence).map((e) => {
    const o = (e ?? {}) as Record<string, unknown>;
    return {
      field_path: str(o.field_path),
      quote: str(o.quote) ?? "",
      region_id: str(o.region_id),
      provenance_tier: o.provenance_tier === "verified" ? "verified" : "model_read",
    };
  });
  // Tier-A labeling: any evidence row verified ⇒ the amount is machine-corroborated.
  const tier: ProvenanceTier = evidence.some((e) => e.provenance_tier === "verified") ? "verified" : "model_read";
  // current_outcome.decision CAN be 'birth' (the fn returns it); both null and
  // 'birth' ⇒ the "new vendor" badge (born on approval).
  const decision = str(outcome?.decision);
  const disp = cp
    ? !outcome || decision === "birth"
      ? { disposition: "new" as const, note: "new vendor — born on approval" }
      : mapDisposition(decision)
    : null;

  return {
    entry_id: str(entry.id) ?? str(r.entry_id) ?? "",
    client_id: str(entry.client_id) ?? str(r.client_id),
    document_id: str(entry.document_id),
    filing_id: str(entry.filing_id),
    status: str(entry.status) ?? "unknown",
    revision_token: str(entry.revision_token) ?? "",
    posting_date: str(entry.posting_date),
    memo: str(entry.memo),
    lines: arr(r.lines).map((l) => {
      const o = (l ?? {}) as Record<string, unknown>;
      const isPayable = str(o.account_class) === "payable";
      return {
        account_code: str(o.account_code) ?? "",
        account_name: str(o.account_name),
        debit_cents: num(o.debit_cents),
        credit_cents: num(o.credit_cents),
        description: str(o.description),
        is_payable: isPayable,
        // Lines carry counterparty_id only; the vendor's name lives on the proposal
        // (one supplier bill = one vendor). Surface it on the payable line(s).
        counterparty_name: isPayable && str(o.counterparty_id) ? vendorName : null,
      };
    }),
    vendor: disp
      ? {
          disposition: disp.disposition,
          name: vendorName ?? "(unnamed vendor)",
          registration_no: str(proposalNew?.registration_no) ?? str(outcome?.registration_normalized),
          matched_counterparty_id: str(outcome?.counterparty_id) ?? proposalExistingId,
          note: disp.note,
        }
      : null,
    evidence,
    provenance_tier: tier,
    amount_label: tier === "verified" ? "machine-corroborated total" : "read by Clara from the document — verify against the source",
    uncertainty: unc && typeof unc.note === "string" ? { note: unc.note, alternatives: arr(unc.alternatives).map(String) } : null,
    high_stakes: r.high_stakes === true,
    high_stakes_reasons: arr(r.high_stakes_reasons).map(String),
    eligible_checker_count: num(r.eligible_checker_count),
    amount_exception: amountEx
      ? {
          machine_total_cents: typeof amountEx.machine_total_cents === "number" ? amountEx.machine_total_cents : null,
          proposed_cents: num(amountEx.proposed_cents),
          fact_hash: str(amountEx.fact_hash),
          at: str(amountEx.at),
        }
      : null,
    amount_override:
      amountOv && typeof amountOv.reason === "string"
        ? { reason: amountOv.reason, region_id: str(amountOv.region_id), actor: str(amountOv.actor), at: str(amountOv.at) }
        : null,
    near_duplicates: arr(r.near_duplicates).map((d) => {
      const o = (d ?? {}) as Record<string, unknown>;
      return {
        entry_id: str(o.entry_id) ?? "",
        document_id: str(o.document_id),
        invoice_id: str(o.invoice_id),
        total_cents: typeof o.total_cents === "number" ? o.total_cents : null,
        posting_date: str(o.posting_date),
      };
    }),
  };
}

/** The je_review write-tool line shape (contract §3 verbatim). */
export type ReviseLine = { account_code: string; debit_cents: number; credit_cents: number; description?: string };
/** The vendor arg for a revise (INTERFACE-PINS §1, hashed [N-F5]). */
export type VendorArg = { existing_id: string } | { new: { name: string; registration_no?: string } };
/** The evidence arg (region-cited; REQUIRED for a document-bound draft — CLR21). */
export type EvidenceArg = { region_id: string; quote: string; field_path?: string };

const opKey = () => crypto.randomUUID();

/** Re-derive the authoritative draft (hydration law §6). client-pinned per C-11. */
export async function getDraftReview(token: string, entryId: string, clientId?: string | null): Promise<DraftReview> {
  const out = await rpc("get_draft_review", { p_entry: entryId, p_client: clientId ?? null }, token);
  return toDraftReview(out);
}

/** Approve the draft at its exact revision (§6). Solo-attest routine; a distinct
 *  checker (CLR05) is enforced by the DB when high-stakes-flagged + ≥2 eligible. */
export async function approveEntry(
  token: string,
  entryId: string,
  expectedRevision: string,
  attestation?: string | null,
): Promise<void> {
  await rpc(
    "approve_entry",
    { p_entry: entryId, p_expected_revision: expectedRevision, p_attestation: attestation || null, p_op_key: opKey() },
    token,
  );
}

/** A governed amount override (W1): reason (nonempty) + the machine-total region id
 *  (cited in the revised evidence). Stamping it clears the approve block and sets
 *  HIGH-STAKES. Revising to a conforming total instead clears the exception. */
export type AmountOverrideArg = { reason: string; region_id: string | null };
/** A governed duplicate override (W2): reason (nonempty) to approve past a
 *  duplicate_bill refusal. */
export type DuplicateOverrideArg = { reason: string };

/** Edit a draft (draft-only; re-validates §2 line laws; rotates the token). Returns
 *  the NEW revision token — approve must then be called with THIS token (§6). The
 *  two overrides (both null by default) are the ONLY lawful way to clear an
 *  amount_conflict / duplicate_bill without revising to a conforming state. */
export async function reviseEntry(
  token: string,
  entryId: string,
  lines: ReviseLine[],
  vendor: VendorArg | null,
  evidence: EvidenceArg[],
  expectedRevision: string,
  overrides?: { amount?: AmountOverrideArg | null; duplicate?: DuplicateOverrideArg | null },
): Promise<string> {
  const out = (await rpc(
    "revise_entry",
    {
      p_entry: entryId,
      p_lines: lines,
      p_proposed_counterparty: vendor,
      p_evidence: evidence,
      p_expected_revision: expectedRevision,
      p_op_key: opKey(),
      p_amount_override: overrides?.amount ?? null,
      p_duplicate_override: overrides?.duplicate ?? null,
    },
    token,
  )) as { revision_token?: string } | null;
  const next = out?.revision_token;
  if (!next) throw new Error("revise_entry returned no revision_token");
  return next;
}

/** Discard the draft (the generic audited draft→withdrawn; reason required). */
export async function withdrawDraft(token: string, entryId: string, reason: string, expectedRevision: string): Promise<void> {
  await rpc("withdraw_draft", { p_entry: entryId, p_reason: reason, p_expected_revision: expectedRevision, p_op_key: opKey() }, token);
}

export type MachineTotal = { cents: number | null; region: string | null; confidence: number | null; quote: string | null };

/** The machine-corroborated invoice total from get_document_extract — the card composes
 *  the amount-exception panel (S6-D1) from this + the CLR21 error at approve time
 *  (get_draft_review does NOT carry the exception). Exact 0009 read shape:
 *  { document, unassigned, filing, extractions:[{id, status, version_n, …}],
 *  regions:[{id, extraction_id, engine_kind, version_n, field_path, monetary_cents,
 *  engine_confidence, …}], max_chars }. The machine total = the `invoice.total`
 *  region from the invoice_facts engine, joined to a DONE extraction, latest pass. */
export async function getMachineTotal(token: string, documentId: string, clientId?: string | null): Promise<MachineTotal> {
  const raw = (await rpc("get_document_extract", { p_document: documentId, p_client: clientId ?? null }, token)) as Record<string, unknown> | null;
  const ex = (raw ?? {}) as Record<string, unknown>;
  const doneExtractionIds = new Set(
    arr(ex.extractions)
      .map((e) => (e ?? {}) as Record<string, unknown>)
      .filter((e) => str(e.status) === "done")
      .map((e) => str(e.id))
      .filter((id): id is string => id !== null),
  );
  const totals = arr(ex.regions)
    .map((r) => (r ?? {}) as Record<string, unknown>)
    .filter((r) => str(r.engine_kind) === "invoice_facts" && str(r.field_path) === "invoice.total" && doneExtractionIds.has(str(r.extraction_id) ?? ""))
    .sort((a, b) => num(b.version_n) - num(a.version_n)); // latest facts pass first
  const top = totals[0];
  if (!top) return { cents: null, region: null, confidence: null, quote: null };
  return {
    cents: typeof top.monetary_cents === "number" ? top.monetary_cents : null,
    region: str(top.id),
    confidence: typeof top.engine_confidence === "number" ? top.engine_confidence : null,
    // region.text_content is the stored region text — used to prefill the amount
    // override's evidence citation (the DB's position() check passes on a substring).
    quote: str(top.text_content),
  };
}
