# Slice 6 — owner-delegated decisions S6-D1/S6-D2 (§0.5 of the design contract)

**This file IS §0.5 of `slice6-thin-e2e-contract.md` (v1.3)** — split out for the
500-line file cap, exactly like the S5 §13 companion. Same status, same normativity.
Resolved per the S5-D precedent: two independent research lanes + a cross-model
debate (evidence: `research/slice6/` — research-d1-invoice-pass, research-ap-treatment,
s6-debate-codex). **Both RATIFIED by the owner 2026-07-19.**

## S6-D1 — the invoice-facts pass (adopted as amended)

Adopt `invoiceFacts_v1` for human-filed supplier-bill PDFs/images; `prebuilt-layout`
stays primary THIS SLICE (a compatibility choice — the frozen `documentIngest_v1` +
matcher layout-region contract), with a recorded **post-beta decision gate** for an
invoice-primary `documentIngest_v2` (parity proof required: text/polygon/table
output, matcher candidates, non-invoice behavior, latency, metering, the Malaysian
golden corpus).

- The output is **machine-CORROBORATED, never "verified"** — the two passes share
  pixels and vendor; agreement is corroboration, not independent measurement.
- **Tier-A corroboration requires ALL of:** field = `InvoiceTotal` (never
  `AmountDue`); versioned confidence ≥0.95 (calibrated on a Malaysian holdout
  later); a physical region; MYR confirmed; deterministic cents normalization; an
  unambiguous single TOP-LEVEL payable document (the INF seven-page bundle rule —
  never the first/largest total of a multi-document result); no
  deposit/credit-note/total-vs-due conflict. The ≤5¢ rounding writer never cures a
  source-total disagreement.
- **A machine/proposed mismatch opens a persisted amount exception:** ordinary
  approval is disabled; both values + confidence + regions render; a bookkeeper
  resolves via a governed, reason-coded, region-cited override that sets the
  HIGH-STAKES flag (the distinct-checker law binds). CLR21 carries a structured
  reason discriminant: `amount_conflict` = resolvable via this flow;
  `currency_unsupported` / malformed-evidence / double-coding = terminal refusals.
  Partial payment is NOT an amount override (the bill still books gross to AP);
  deposits/credit notes/unsupported total-vs-due semantics park or refuse.
- Date/invoice-number/vendor persist as header CANDIDATES only (invoice date is not
  automatically the recognition date; vendor name never overrides
  registration/TIN-dominant resolution); currency/SST/line items stay
  human-confirmed.
- **Duplicate-bill control:** an exact (client, resolved vendor, invoice number)
  duplicate warns/blocks pre-approval, near-duplicates (vendor/date/total) surface,
  override is governed.
- **Model-drift honesty:** the full raw engine response is hashed with the
  normalization-policy version; reprocessing creates a NEW extraction version,
  never overwrites facts.
- **Document text is untrusted input:** invoice text reaching the model is quoted
  data, never instructions — including multi-page attachments.
- **MyInvois is the named NEXT-SLICE gate before broad production rollout:** a
  currently-`Valid`, client-matched MyInvois JSON/XML/API record is the preferred
  factual source and skips DI — payload hash, UUID/longId, schema version,
  issuer/receiver IDs, validation time/status persisted, and status RE-CHECKED at
  approval (signature presence is not the test; documents can be cancelled or
  superseded). DI serves the consolidated/exempt/foreign/legacy PDF tail. MyInvois
  is authoritative for submitted facts + validation status, never for expense
  account, business purpose, recognition period, or approval.

## S6-D2 — accrual-to-AP + the chart augmentations (adopted as amended)

A human-filed supplier bill or supplier debit note that creates a payable posts its
supported debit leg(s) + an equal credit to payable-class `400-000 TRADE CREDITORS`
with the resolved vendor on every payable line.

- **Scope honesty:** the gross-to-AP shape is a supplier-bill rule
  (`coding_kind='supplier_bill'`, set only after human filing/classification) —
  not a universal rule. Genuine paid receipts/cash purchases REFUSE/PARK until the
  bank slice's sanctioned direct-spend path; credit notes, deposits, prepayments,
  capital/inventory items have no S6 shape and park honestly. MPERS mandates
  accrual STATEMENTS, not a daily AP workflow — AP is Clara's control design, not
  a statutory necessity claim.
- **The chart augmentations are owner-approved system roles (RATIFIED):** reuse an
  existing chart row when present, else add via the audited onboarding script;
  persist `origin/system_role` metadata + creation receipt + mapping rationale +
  actor/time; locked against deletion/retagging after first use; ordinary
  control-account postings only through governed writers with a counterparty. The
  rounding account keeps the existing ≤5¢ DB rule with per-use provenance and a
  separately reported cumulative balance.
- **The S6 AP gate:** `400-000` GL balance == sum of vendor-tagged open approved
  bill credits — **NEVER zero** (S6 has no payment/allocation flow; a zero check
  would require synthetic settlements). After the bank slice the invariant becomes
  control == open-item subledger, zero only when settlement evidence proves it.
- **Eval adjudication:** the replay scores each debit leg's account, exact integer
  cents, and evidence-supported recognition date. Boundary-date divergences are
  reported by count and MYR with cited evidence and are labeled
  "Clara-more-correct" only after source-backed OWNER adjudication — never
  automatically; unresolved cases are exceptions, not errors and not wins.
- **Completeness honesty:** counterparty-tagged lines are not yet an open-item
  subledger (no due dates, allocation, partial settlement, aging — deferred); no
  replay result is represented as a statutory close (opening balances and bank
  settlements are absent); the supplier DEBIT-NOTE polarity (lawfully increases
  AP) gets an explicit build fixture.
