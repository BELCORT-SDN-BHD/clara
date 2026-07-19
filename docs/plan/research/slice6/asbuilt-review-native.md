# Slice-6 as-built review — NATIVE two-axis verdicts (archived by the orchestrator)

Reviewed: branch slice6-coding-floor (f4c43ea) vs main (69d4d45), 63 files, +9977/-301.

## Standards axis — verdict: NO hard documented-standard violations

Verified upheld: CLAUDE.md cardinal/four invariants (all writers SECURITY DEFINER +
search_path pinned; DB computes every number in-txn; tools.ts proposedGross is a
friendly backstop the DB re-checks); ADR-015 lane split (p_is_human set by entry point,
never runtime detection; approve_entry human-only; bare get_journal_entry revoked from
agent); ADR-017 pools (third login single-membership w/ tail assert; parameterized
txn-local secret; P4; fail-closed boot assert extended); Appendix A freeze (v2 new
closure beside byte-untouched v1; registry repoint + v1 export kept; infra excluded
from freeze per AB-16); house idioms (CLRxx, masked view, reverse-not-delete,
append-only triggers, PUBLIC sweep, safeRead refusals); no secrets/DSNs.

Baseline smells (judgement calls):
- S-1 (STRONG, security-critical): the fact-hash formula duplicated 5x
  (_invoice_fact_state, _write_entry_evidence, _draft_entry_core, approve_entry,
  revise_entry) — extract clara._fact_hash(region); drift silently breaks evidence
  binding.
- S-2: the corroboration block (payable/expense vs total + verified-evidence
  not-exists) repeated 3x (L1245/L1509/L1677) — parameterize.
- S-3 (trivial): section header numbering reads out of order.
- S-4 (trivial): _normalize_invoice_cents needlessly SECURITY DEFINER.

## Spec axis — verdict: high fidelity; five findings

Coverage of contract §1-§12 + companion §1-§10 faithful; §11 deferrals NOT built;
sanctioned amendments (PIN-AB-1/2/6, D-L2-1/2) verified in place.

- SP-1 (WRONG, S6-D1 naming ruling): user-facing "machine-verified total"
  (JeReviewCard.tsx:198, review.ts:163, badge:197) — S6-D1: "machine-CORROBORATED,
  never 'verified'". Internal enum provenance_tier='verified' acceptable; the
  bookkeeper-facing label must say corroborated. (Contract §4's own wording carried
  the forbidden word; S6-D1 binds §4 per §0.5 — the ruling wins.)
- SP-2 (MISSING, S6-D1-mandated): the amount-exception OVERRIDE — revise_entry
  re-raises CLR21 on ANY total deviating from the corroborated machine total
  (0009:1677-1681); no governed, reason-coded, region-cited override exists and no
  writer sets the HIGH-STAKES flag; JeReviewCard:278 promises a path the DB refuses.
  Adjudication: S6-D1 (binding, later, owner-ratified) wins over §4's bare "refuse".
- SP-3 (MISSING, S6-D1-mandated): duplicate-bill control — exact (client, resolved
  vendor, invoice number) must warn/block pre-approval; near-duplicates surface;
  override governed. Not built; only filing-keyed double-coding exists (different key).
- SP-4 (minor): CodingSections.tsx:104/106 labels the required result-entry input
  "optional" and sends null (DB-safe CLR24, misleading UI).
- SP-5 (minor): card reads high_stakes_reasons; get_draft_review returns only the
  boolean — banner renders with blank reasons.

Per-axis worst: Standards = S-1; Spec = SP-2.
Fix round opens after the Codex xhigh live-verifying lane reports (third lane).
