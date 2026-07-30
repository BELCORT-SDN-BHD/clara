# Wave C-b — bank identity, statement ingest, matching: design (v2, review-hardened)

> **Status: v2.2, 2026-07-31 — REVIEW-HARDENED + AS-BUILT + FIX-WAVE (owner GO recorded; §7 note accepted; as-built amendments v2.1/v2.2 in part2 §7 — v2.2 adds deferred ancillaries, the one-way pending cancel, re-kind splices, statement lifecycle triggers, and the lane-aware terminal-event law).**
> Forks WCB-R1..R6 owner-ruled in the C-b grilling (2026-07-30). This document executes
> `docs/plan/wave-c-contract.md` §4 C-b (WC-R1..R12 not re-opened) on the C-a substrate
> (`0037`, WCA-R1..R9). On conflict the contract governs for Wave C; `docs/prd/PRD.md` §6
> (LAW) governs always.
>
> **v2 incorporates the full design-stage review ladder: a 3-lens opus adversarial pass
> (accounting · DB-mechanism · agentic-product/consent) + an independent Codex
> `gpt-5.6-sol` pass — 7+9 BLOCKERs and ~30 MAJORs raised, every one resolved below or
> named as a residual.** The verdict of both lanes: the group model, signed-line
> convention and three-identity framing are sound; v1's enforcement mechanisms were not.
> v1's headline defects, for the record: chain endpoints outside the corroboration set (a
> tautological chain), an unimplementable cross-table partial unique carrying the whole
> duplicate control, a consent recut that silently wedged the wiki lane and broke a
> ratified byte-identity battery, an exhaustion bound vacuous for negative sums, and a
> high-stakes path that reopened the very interval this slice exists to close.
>
> Owner guardrails, stated at the go: the 2026 AI-agentic / AI-OS product vision is not to
> be sacrificed; end-to-end accounting correctness and rigour hold. Clara reads, proposes
> and converses; a human rules; the DB owns every number.
>
> Evidence grading: **[V]** orchestrator-verified at the cited file:line · **[G]**
> grounding-lane verified (9-lane fan-out) · **[C]** corpus-verified (real Rome Properties
> files) · **[RV]** converged finding, verified independently by BOTH review lanes ·
> **[R1]** single-review-lane finding, evidence checked by the orchestrator.

---

## 1. What C-b builds, and the debt it pays

C-a left a **named interval** (`wave-c-a-subledger-design.md` §7): between C-a and C-b,
nothing but op-key dedupe and the two-sided bound stops the same real-world receipt being
recorded twice. C-b closes the line-side of it: a statement line is a fact the bank printed
once, it can belong to at most one non-unmatched group (enforced by a real index, §4.5),
and settlement can be born *from* the line with the line owned in the same transaction
(WCB-R3, §4.6) — including at high stakes, via a pending-match reservation (§4.6, [R1]).

**Stated honestly (v2 correction [RV]):** C-b delivers **matching with line-side
exclusivity and per-group exact ties — not reconciliation.** An approved-but-never-matched
duplicate settlement entry survives C-b's belts (it sits in no group); the periodic
statement↔GL tie-out that catches it is C-c's. C-b ships the cheap read half now — a
`bank_statement_tie` banner (§4.7) comparing statement closing vs the bank COA balance at
`period_end` vs unmatched sums — so the number a practitioner looks at first exists from
day one, without building WC-R3's close model.

C-b lands: bank identity (`bank_accounts` + institutions reference +
`coa_accounts.is_bank_account`), provenance-bound statements with a fully-corroborated
balance chain, the `statementFacts_v1` lane (opening the `bank_statement` →
`skipped_kind` dead end, `0026:392-410` **[G]**) plus a human-keyed ingest verb, the
match-group model (WC-R2), `match_bank_line` / `unmatch_bank_match` /
`settle_from_bank_line` / `complete_pending_match`, the first per-client consent gate on
the document pipeline (WCB-R1), and the `/bank` workbench.

Out (→ C-c): `bank_reconciliations` period receipts, aging, customer statements, the
learn loop (columns land now: `matched_via_rule_id` + `origin`).

## 2. Grounded facts the design stands on

(§2 of v1 stands verified; restated compactly, with v2 corrections marked.)

1. **Dates are a genuine gap** **[G]** — no period/per-line date carrier exists;
   `financial_date` is scalar, invoice-fact-only, ISO-regex-gated (`0022:523-524`).
   Maybank line dates print DD/MM, no year **[C]**; year derives from the period and the
   DB re-checks bounds.
2. **The corpus is 100% PDF Maybank** **[C]** — 202504–202512; running balance per row;
   BEGINNING/ENDING/LEDGER BALANCE + TOTAL DEBIT/CREDIT printed; one zero-activity month;
   one mojibake text layer (OCR is the substrate, text-layer parsing untrustworthy);
   April in two source channels; 2504/2505 scans byte-identical (integrity check due).
3. **The pipeline bootstrap is DB-side** **[V]** — `_enqueue_invoice_facts_core` fires at
   filing time (0009:2343/2397/2532; 0026:1089) and re-fires on `document.classified`
   (facts-gate). One router recut covers admission. **v2 correction [RV]: “~zero
   Supavisor impact” was overstated — statement workflow runs draw pool sessions; they
   are bounded because the lane now joins the OCR concurrency cap (§4.3).**
4. **Egress consent today is a global env switch** **[V]** (`CLARA_DOC_EGRESS_APPROVED`,
   claim-time `p_egress_approved`); the 0020 typed machinery gates only `wiki_synthesis`;
   its `document_sha256` slot was reserved for a document-tied purpose (`0020:238-241`
   **[G]**). **Intake's generic OCR egresses before kind is known — so a statement's
   bytes reach the vendor under the global switch before any typed gate can see it.
   WCB-R1 scopes the typed gate to the statement-specific second read and leaves intake
   on the global switch: this is a stated limitation of WCB-R1, not a property the
   consent ceremony may claim to cover [RV].** The system of record must never assert
   that the typed authorization covered the first egress; §4.4 words the audit trail
   accordingly.
5. **The interview `banks` item is free text** **[G]** — advisory display only (WCB-R2).
   `client_identifiers (kind='bank_account')` is append-only with a deliberately
   non-unique match index, normalized `lower(regexp_replace(v,'\s+','','g'))`
   (`0007:679-680`, `0007:1524-1525` **[R1]**) — hyphens survive; “upsert” is illegal.
   §4.1 states the one normalization law.
6. **Salvage** **[G]** — PORT the append-only audit trail + client-bank→COA mapping;
   REBUILD the match model (GAP1-1/1-2) and recon chain (GAP1-3, pulled forward into
   ingest per WCB-R6). WC-R2 groups supersede `UNIQUE(entry_id)`.
7. **The 0037 surface** **[G]** — composites human-only; `allocate_*` take
   `{item_id, amount_cents}[]` + a GL `p_bank_account` code and create their own entries.
   Lock law 0037:2547-2548: a verb locking a PRE-EXISTING entry takes `journal_entries`
   before `open_items`. Advisory partial order 002→003→004; 203005005 = duplicate-bill.
8. **Shape asserts are asymmetric** **[RV]** — `_assert_supplier_payment_shape_at`
   forbids expense legs; `_assert_customer_receipt_shape_at` forbids income legs but
   ADMITS expense legs, and C-a ships the slot (`p_discount_cents`/`p_discount_account`,
   an expense account, control credit = amount + discount, `0037:2605-2614,2740-2748`).
   §4.6 exploits this asymmetry deliberately.
9. **Two dashboard catalogs** **[G]** — WCB-R4 scopes C-b to `/bank`; the contract's
   "new ClaraPart member" line is superseded by that ruling for C-b.
10. **`reverse_entry`** — unwind keys on `reversal_of`; mirrors carry no kind **[G]**. A
    reversed original **stays `status='approved'`** (`0003:371-383` **[RV]**) — approval
    status alone cannot floor match membership; §4.5 adds the reversal floors.
11. **`lib/reconciler.mjs` is crash recovery** **[G]** — the matcher namespace is
    `bank-match`; “reconciler” is never used for C-b code.
12. **The event spine validates types** — unknown event types are REJECTED at append
    (`0005:167-174` **[R1]**); every `bank.*` type must be registered (0037:3443-3469
    idiom). `domain_events` is readable by the agent role firm-wide (`0005:379-408`
    **[RV]**) — event payloads are a broad surface; §4.8 carries IDs only.
13. **`document_processing_tasks` carries no client binding** (`0007:148-179` **[R1]**) —
    consent must be resolved through the document's filings, and a statement filed to two
    clients has no single answerable client (§4.4 refuses that shape).
14. **The 0020 §6 byte-identity battery is live law** **[RV]** —
    `wb-0020-legacy.test.mjs` pins `claim_document_processing_task`'s prosrc and asserts
    it carries **no call edge into the typed-consent surface**; the four purpose-bearing
     0020 verbs unconditionally couple activation/deactivation to the client-keyed WIKI
    HOLD (`0020:870-879,917-935,977-1000`; hold table keyed on client alone,
    `0017:2335-2337`), with the migration's own comment demanding a follow-on ruling
    before widening. §4.4 is designed around both facts.

## 3. The model — three identities, stated with their enforcement objects

**Statement identity (the chain).** Per statement: `opening + Σ(line amounts) = closing`
and per line `running_n = running_{n-1} + amount_n` (`running_0 = opening`,
`running_last = closing`). **Endpoints come from the PRINTED header labels
(BEGINNING/ENDING or LEDGER BALANCE), never derived from the row set — a reader that
cannot produce them independently refuses (`header_unreadable`) [RV].** The printed
TOTAL DEBIT / TOTAL CREDIT cross-checks are MANDATORY on the OCR path
(`totals_unreadable` refusal) — the one control that catches an adjacent omission the
running balance cannot see **[RV]**. Continuity: `opening = adjacent prior closing`,
checked on **both adjacent edges** wherever a neighbour exists (subsumes gap-fillers and
void-and-reingest **[RV]**); all statement writes for an account serialize on the
account's chain lock (§4.9) so concurrent gap-fillers and overlapping periods cannot
both commit **[R1]**. Enforced by: `persist/enter` in-verb checks + the statement belt.

**Match identity (exact-zero, WC-R6).** Per non-`unmatched` group:
`Σ(member lines' amount_cents) = Σ(member entries' matched_cents)` to the sen. A
difference exists only as a coded adjustment entry inside the same transaction and group.
Enforced by: the group-tie belt.

**Exclusivity (WC-R2, both sides, in cents).**
- **Line side:** a line belongs to at most one group with `status in ('pending','live')`,
  always at full amount. Enforced by a REAL same-table partial unique: group status is
  denormalized onto member rows and bound by a composite FK to
  `bank_matches (id, firm_id, client_id, status)` **ON UPDATE CASCADE**, so
  `unique (line_id) where group_status in ('pending','live')` is buildable and
  concurrent-safe — the v1 cross-table predicate was not implementable **[RV]**.
- **Entry side (per entry × bank account, per SIDE, in absolutes [RV]):**
  `Σ matched_cents over positive members ≤ Σ debit_cents` of the entry's lines on that
  account, and `Σ |matched_cents| over negative members ≤ Σ credit_cents` — gross per
  side, because statements print gross while an entry may touch the bank account on both
  sides (loan drawdown net of fees), and absolute, because a signed-net inequality is
  vacuous for negative sums (v1's formula admitted unbounded negative matches).
  `already_matched` = cents exhaustion of the relevant side. Enforced by: the
  entry-exhaustion belt.

The honest composition: statement ↔ matched entries is DB-tied per group; entries ↔ open
items ↔ control GL is C-a's identity; **the statement ↔ GL period tie is C-c's** — named,
not claimed (§1).

## 4. The mechanism

### 4.1 Bank identity

**`clara.bank_institutions`** (reference, seeded): `code · name · active`. Malaysian
institution codes are a stable public namespace; account numbers are NOT unique across
institutions **[R1]** — identity needs the pair.

**`coa_accounts.is_bank_account boolean not null default false`** (never
`special_acc_type` — `uq_coa_special`, 0003:58-59 **[G]**).

**`clara.bank_accounts`**: `id · firm_id · client_id · bank_code` (FK →
`bank_institutions`) `· bank_name_display · account_number` (as printed)
`· account_number_normalized` (digits-only, for header binding) `· coa_account_code ·
active · created_by/at · deactivated_by/at/reason`.
- Congruence FKs: client → clients; `(client_id, coa_account_code)` → `coa_accounts`
  (asset-typed, active, non-control; the verb sets `is_bank_account=true` in-txn).
- **Partial uniques, `where active`** **[RV]**: `(client_id, bank_code,
  account_number_normalized)` and `(client_id, coa_account_code)` — deactivate-and-remap
  is a real remedy, not a dead end; two live accounts never share a GL account.
- RLS force, firm-scoped human SELECT, fn-owner writes, zero wake/agent grants (0037
  idiom).

**Verbs** (human, bookkeeper floor, op-keyed): `add_bank_account` (validates COA; flags
it; takes optional `p_proposal_id` — see §4.3; **internally re-fires
`_enqueue_invoice_facts_core` for failed statement tasks whose read identity now binds**,
in the same transaction — the DEFINER-internal call needs no grant and keeps the
one-confirmation promise literal **[RV]**) · `deactivate_bank_account` ·
`reactivate_bank_account` **[RV]** · `remap_bank_account_coa` (refuses while any
`pending`/`live` match group exists on the account; statements are COA-independent and
stay) **[R1]**.

**One normalization law [R1]:** `client_identifiers` keeps the house rule (lowercased,
whitespace-stripped, hyphens preserved — changing it would orphan every tin/ssm row).
`add_bank_account` writes **two guarded inserts** (append-only table — never upsert): the
printed form house-normalized, and the digits-only form — so the attribution predicate
matches whichever spelling the OCR region carries. `bank_accounts` binds ingest on
digits-only. An acceptance cell files a real-format Maybank header and proves
`record_rule_resolution` resolves the client.

**Seeding (WCB-R2):** the interview `banks` answer is displayed verbatim (0036 §E
committed-plan read idiom) in `/bank`'s add-account flow; the authoritative trigger is
the statement-header proposal (§4.3). The proposal card previews the target COA account's
name/type before confirm (the wrong-click hazard **[R1]**) and distinguishes
`account_inactive` (offer reactivation) from `account_unregistered` (offer creation).

### 4.2 Statements and lines

**`clara.bank_statements`**: `id · firm_id · client_id · bank_account_id · document_id ·
source_doc_sha256 · filing_id` (congruence FK — provenance must survive filing
correction, §4.9 **[R1]**) `· reader1_extraction_id · reader2_extraction_id · facts_hash`
(the agreed corroborated read, hashed — who agreed is provable later **[R1]**)
`· period_start · period_end · statement_date · opening_cents · closing_cents ·
total_debit_cents · total_credit_cents · line_count · status ck ('live','void') ·
superseded_by · voided_by/at/reason · ingest_mode ck ('structured','ocr','human') ·
created_by/at`.
- Provenance binding validated in-txn (firm/client/filing/hash; kind `bank_statement`).
- Partial unique `(bank_account_id, period_end) where status='live'` + in-verb overlap
  refusal, both under the account chain lock (§4.9) — the check-then-insert race is
  closed by serialization, not by the index alone **[R1]**.
- `period_start ≤ period_end`; `line_count = 0 ⇒ opening = closing` (April is legal
  **[C]**); explicit non-MYR → `non_myr_statement` (WC-R5; absence reads MYR, the 0023
  posture).
- A `bank_statements` row exists only if corroborated (WCB-R6). Statements/lines are
  never updated in place; void (WCB-R5) requires zero `pending`/`live` groups on its
  lines and takes the chain lock + line row locks (the void-vs-match race **[R1]**).
- `documents.financial_date = period_end` set at persist.

**`clara.bank_statement_lines`**: `id · firm_id · client_id · statement_id ·
bank_account_id` (denormalized, congruence-FK'd) `· line_no · entry_date · value_date ·
description · amount_cents <> 0` (signed: **+ = into the account, − = out**)
`· running_balance_cents`. `unique (statement_id, line_no)`;
`entry_date ∈ [period_start, period_end]`; append-only; descriptions are uncorroborated
prose — they inform, never decide.

### 4.3 Ingest — `statementFacts_v1`, two lanes, one workflow (WC-R4 · WC-R7 · WCB-R6)

**Two lanes, preserving the lane↔egress-class invariant every existing gate keys on
[R1]:** `statement_facts` (pdf/image — vendor egress; joins the kill-switch, budget,
concurrency and consent controls) and `statement_parse` (csv/ofx — in-process
deterministic parse; no vendor egress; still consent-recorded at enqueue). One frozen
workflow serves both (the documentIngest ocr/structured_parse precedent), branching on
`task.lane`.

**Router recut (`_enqueue_invoice_facts_core`, amendment idiom), per arm [R1]:**
kind `bank_statement` + pdf/image → `statement_facts`; kind `bank_statement` + csv/ofx
mime → `statement_parse`; the csv/ofx mimes join the router's mime dispatch (today they
dead-end before the kind test); the `already_completed` short-circuit becomes per-lane
engine-kind aware (today hard-coded `engine_kind='invoice_facts'`, so a completed
statement would re-buy a vendor read on every re-fire **[R1]**). **OFX intake routing is
named work**: `intake.mjs`/`scan.mjs` gain OFX mime/signature detection (today an OFX
upload is rejected or misrouted to the XML lane **[R1]**); CSV ships first, OFX rides the
same lane behind its own fixture.

**Consent gate at ENQUEUE (moved off the claim body — §4.4):** the router's
bank-statement branch resolves the document's **active filing clients; more than one →
`statement_multi_client` refusal [R1]**; exactly one → requires a live
(consent, activation) for `(firm, client, 'statement_extraction')`, else it records the
terminal never-claimed failed task `error_code='consent_inactive'` (the `skipped_kind`
idiom) — visible, re-enqueueable after the ceremony.

**Readers (OCR lane):** reader-1 = deterministic table extraction over the intake layout
geometry (no new egress); reader-2 = the typed engine behind the service seam (Azure DI
prebuilt bank-statement; availability is a build-time verify with the LLM-structured read
as named fallback). **Corroboration = agreement on the FULL LOAD-BEARING HEADER —
institution + account number + currency + period bounds + statement date + printed
opening/closing + printed totals — AND the per-line numeric skeleton (entry_date,
amount, running balance, equal counts) AND the chain closes [RV].** A zero-line statement
still corroborates its full header (the degenerate-case cell **[R1]**). Descriptions come
from reader-2 and are never load-bearing. Structured lane: the parse is deterministic and
**the chain is the second reader** (WC-R7); printed totals when present are checked.

**Account binding order [R1]:** binding (and any proposal) happens only AFTER header
corroboration — an uncorroborated header can never emit a proposal. No live
`bank_accounts` row for the corroborated (bank identity, digits-only number) →
`account_unregistered`: the failure writes a **`bank_account_proposals` row** (fn-owner
writes; human-only reads; zero agent grants; carries the read header) and emits
`bank.account_proposal` carrying **IDs only** (§4.8 — `domain_events` is agent-readable
firm-wide; the account number never enters an event payload **[RV]**). `/bank` renders
Clara's card; confirming runs `add_bank_account(p_proposal_id ⇒ …)` which re-enqueues
in-txn — upload → read → one confirmation → books-ready statement, unattended.

**`persist_statement_facts(p_task, p_payload)`** validates in ONE transaction, in order:
**replay guard** (task already `done` → `{replayed:true}`, the `persist_invoice_facts`
shape — a WDK retry of a committed ingest must not report `duplicate_period` **[R1]**) →
claim/lane state → provenance + kind + filing → header corroboration → account binding →
MYR → **chain-lock acquisition** → period sanity + duplicate/overlap (doc-id-aware:
same-document replay ≠ a second document) → the chain + totals cross-checks → both-edge
continuity → line-date bounds → atomic insert → `financial_date` → events → task settle.
Failures land through `fail_statement_facts` with the named code taxonomy
(`header_unreadable · totals_unreadable · readers_disagree · chain_broken ·
continuity_mismatch · duplicate_period · overlapping_period · non_myr_statement ·
account_unregistered · account_inactive · statement_multi_client · period_invalid ·
line_date_out_of_period`) — **all of which require widening
`ck_processing_task_error_code_0016` AND `ck_processing_task_binding_0016`**
(`consent_inactive` joins the never-claimed allowlist beside `skipped_kind`) — v1 omitted
both and every named code was unstorable **[RV]**.

**The lane joins every existing spend/safety control [RV]:** the kill-switch lane list in
`claim_document_processing_task` AND `release_held_document_tasks` (typed consent answers
"did this client authorize"; the kill switch answers "is the vendor safe right now" —
orthogonal, both required); the attempt-cap branch; `_reserve/_settle/_refund_
processing_call` page budgeting (reserve for the OCR lane, skip for the free local
parse); the `v_running`/`v_cap` OCR concurrency accounting.

**Human-keyed ingest [RV]:** `enter_bank_statement(p_client, p_bank_account, p_document,
p_header jsonb, p_lines jsonb, p_op_key)` — bookkeeper floor; `ingest_mode='human'`; the
SAME `_persist_statement_core` validation (chain, continuity, duplicates, MYR, bounds);
provenance still binds the filed PDF; the actor is the recorded corroborator. The chain
is the control — OCR is only one way to feed it, and a firm must always be able to enter
a statement by hand (the corpus's mojibake file is the proof it will be needed).

### 4.4 Consent (WCB-R1) — one machinery, surgically extended

**Design principle (v2, [RV]):** the ratified 0020 battery asserts
`claim_document_processing_task` carries **no call edge into the typed-consent surface** —
so the typed gate must not live there. It lives at **enqueue** (§4.3) + **egress time**
(below). The claim body changes ONLY by lane-list widening (kill-switch + concurrency +
attempt-cap literals), which the battery's restore-transform amendment mechanism covers
(0024 precedent); `packages/db/tests/wave-b/wb-0020-legacy.test.mjs` maintenance is a
**named deliverable**, as are the 0020 postverify updates.

- Purpose literal **`statement_extraction`** added to the three 0020 table CHECKs and the
  **FOUR purpose-bearing verbs** (grant/activate/deactivate/revoke;
  `classify_consent_evidence_document` carries no purpose **[RV]**).
- **The wiki-hold coupling is purpose-discriminated in the same recut [RV]:**
  activation clears, and deactivation/revocation set, the client-keyed wiki hold
  **only when `p_purpose='wiki_synthesis'`** — this is the follow-on ruling
  `0020:870-872` demanded, discharged by WCB-R1. Cells: `statement_extraction`
  activate/deactivate leaves `wiki_synthesis_holds` byte-unchanged in both directions
  (the wedge AND the backstop-erasure are both regressions to pin).
- **Sha binding via new 6-arg OVERLOADS [RV]:** `prepare_egress_dispatch(…,
  p_document_sha256)` stores the sha; `consume_egress_dispatch(…, p_document_sha256)`
  adds `is distinct from` to the re-binding block. The 5-arg wiki arities remain —
  postverify pins and the runtime surface probe survive; the sha-substitution cell
  (authorization for document A presented for B ⇒ `unknown`) lands in §6.
  `ck_egress_dispatch_authorizations_doc_sha` is recut: `wiki_synthesis` stays
  forced-null; `statement_extraction` REQUIRES non-null. Dispatch intent for the
  task-driven lane: `event_type='statement.extraction'`, `event_seq =` the task's
  `version_n` (the wiki pattern is event-driven; this lane is task-driven — stated).
- The workflow wraps ONLY the reader-2 vendor call in prepare/consume (reader-1 re-reads
  stored geometry; the structured lane never egresses).
- **Audit-trail honesty [RV]:** the typed authorization covers the statement-specific
  read from its grant date forward. The kind-blind intake OCR pass — including any
  statement uploaded before its client's ceremony — egressed under the global switch and
  the engagement-letter consent, and the record must say so. Typing the intake pass is a
  named future wave (§7).
- Activation = the rollout throttle (WC-R11): Rome sandbox → ROME PROPERTIES (consent
  evidence PDF already in the corpus **[C]**) → others stay dark.

### 4.5 The match model

**`clara.bank_matches`**: `id · firm_id · client_id · bank_account_id · status ck
('pending','live','unmatched')` (**`pending` = the high-stakes reservation, §4.6 [R1]**)
`· origin ck ('human','rule')` (writers enforce `'human'`; CHECK
`(origin='rule') = (matched_via_rule_id is not null)`) `· matched_via_rule_id ·
created_by/at · completed_at · unmatched_by/at/reason`.
`unique (id, firm_id, client_id, status)` — the cascade anchor.

**`clara.bank_match_line_members`**: `… · match_id · line_id · amount_cents ·
group_status` — composite FK `(match_id, firm_id, client_id, group_status)` →
`bank_matches (id, firm_id, client_id, status)` **ON UPDATE CASCADE**; the exclusivity
index: `unique (line_id) where group_status in ('pending','live')` **[RV]**. Lines enter
at full amount; account congruence FK through statement and group.

**`clara.bank_match_entry_members`**: `… · match_id · entry_id · matched_cents <> 0 ·
group_status` (same cascade FK). **Floors [RV]:** the entry is `status='approved'`,
`reversed_by IS NULL` **and** `reversal_of IS NULL` — a reversed original is still
`approved` (fact 2.10) and both it and its mirror are refused membership by name
(`reversed_entry` / `reversal_mirror`); the belt re-checks at commit. (`pending` groups
reference the maker's draft entry via a separate nullable `draft_entry_id` on the GROUP,
not an entry member — members exist only for approved entries.)

**Belts (deferred, re-query-by-id):** group-tie (Σ lines = Σ matched per non-`unmatched`
group) · entry-exhaustion (per-side absolute bounds, §3) · congruence (tenancy/account;
void statements admit no `pending`/`live` members; entry members' reversal floors;
`bank_statements` status transitions re-checked) · **the reversal belt on
`journal_entries`** (AFTER UPDATE WHEN `reversed_by` becomes non-null: refuse while any
`pending`/`live` entry member references the entry — covers every present and future
reverse path including no-open-item generic entries **[RV]**).

**`clara.bank_match_audit`** (PORT, house types): append-only rows per
match/complete/unmatch/void action with the full member set + amounts in `payload`,
actor, reason. The spine events (§4.8) are the wake/learn signal; this table is the
queryable record. Human-only reads.

### 4.6 The verbs

All human-only (`clara_authenticated`, bookkeeper floor), op-keyed, CLR-refusals, events
in-txn. **Adjustment entries — the executable contract [RV]:** hand-built as fn-owner
(the C-a composite idiom: direct INSERT + `_assert_balanced` + approve via
`_approve_entry_core`; **never `_draft_entry_core`**, which demands a resolution these
verbs cannot have); exactly two legs — the named adjustment account vs the line's bank
account; the adjustment account must be active, `account_class IS NULL`, expense- or
income-typed, and **not** the bank account itself (`adjustment_account_invalid`);
`coding_kind = NULL`, counterparty-free **by construction** — which is also the named
reason the core's 203005003 rung is never requested on this path (pinned by a cell, not
left to luck **[RV]**); posting_date = the settlement's posting date; memo stamps the
match provenance; sub-keys `p_op_key||':adj:'||i` (+ `':approve'` derivations), ALL
pre-reserved before the first advisory lock; unwind after an erroneous unmatch =
ordinary `reverse_entry` (legal once no live member references it) — reverse-not-delete.

**`match_bank_line(p_client, p_lines jsonb, p_entries jsonb [{entry_id, matched_cents}],
p_adjustments jsonb default null, p_ack_period_exceptions bool default false, p_op_key)`**
— N lines × M existing approved entries in ONE group (WC-R2's N:M is real: two IBG
transfers clearing one recorded receipt is one group, one audit object **[R1]**).
Refusals: `wrong_account` (an entry with zero movement on this account's COA; line/account
incongruence) · **`wrong_period` = structural only [RV]: a member line's statement is not
`live`** — the GAP1-1 substance (line↔recon congruence) is structural in the group model;
**a member entry with `posting_date > period_end` is NOT a refusal but a RECORDED,
ACKNOWLEDGED EXCEPTION** (`p_ack_period_exceptions` must be true; the exception rides the
member row + audit payload + `/bank` banner) — the v1 hard RAISE prescribed a remedy
`_tf_entry_immutable` forbids and would strand ordinary Malaysian catch-up bookkeeping
(direct debits posting after weekends; late-received invoices) **[RV]** ·
`amount_beyond_tolerance` (the group does not tie and no adjustment covers it — tolerance
zero per WC-R6) · `already_matched` (line exclusivity index / per-side cents exhaustion)
· `reversed_entry` / `reversal_mirror` (§4.5 floors).

**`unmatch_bank_match(p_client, p_match, p_reason, p_op_key)`** — whole-group; flips
status (cascade updates members, releasing the exclusivity index); audit + event.
Re-match = a new group.

**`settle_from_bank_line(p_client, p_line, p_counterparty, p_allocations jsonb, p_memo,
p_posting_date date default null, p_charge_cents bigint default 0, p_charge_account text
default null, p_adjustments jsonb default null, p_attestation text default null,
p_control_account text default null, p_op_key)`** (WCB-R3):
- **Domain from the counterparty's KIND, never the cash sign [RV]** — sign is validated
  as consistency after: customer+inflow → receipt · vendor+outflow → payment ·
  **customer+outflow / vendor+inflow (the refund quadrants) → named refusal
  `refund_not_supported` with the sanctioned workaround in the message** (generic entry
  with a counterparty-stamped control leg → C-a mints the adjustment item →
  `apply_open_items` against the residue → `match_bank_line`) — first-class refund
  composites are a later wave; the workaround has its own acceptance cell **[RV]**.
- The GL bank account comes from the line's statement — never caller-passed.
- `p_posting_date` defaults to the line's `entry_date`, validated within the statement
  period (v1 named no date at all while the composites require one **[RV]**).
- **Bank-charge asymmetry [RV]:** receipt side — ONE `customer_receipt` entry via C-a's
  expense-slot shape (`p_charge_cents`/`p_charge_account` → Dr Bank (line) + Dr Charges /
  Cr AR (gross)); the invoice clears at gross, zero phantom outstanding — v1's
  separate-entry treatment left every net-credited TT receipt RM-short forever. Payment
  side — the charge is a separate same-txn adjustment entry (the payment shape assert
  forbids expense legs); the group ties across both entries.
- Below threshold: settle + allocations + match, one transaction, line owned at birth.
- **At/above threshold — the pending-match reservation [R1]:** the composite runs the
  C-a maker-checker path (draft + stored allocation proposal, WCA-R7) AND creates the
  match group `status='pending'` with the line member — **the line is owned in the same
  transaction the settlement is born**, so the approved-but-unmatched interval v1
  reopened never opens. The checker approves in `/queue` (CLR05 law untouched);
  **`complete_pending_match(p_client, p_match, p_op_key)`** then validates the
  now-approved entry (all §4.5 floors + parity) and flips pending→live writing the entry
  members. The maker cancels via `unmatch_bank_match` (works on `pending`); a
  checker-REJECTED draft leaves the group cancellable the same way. *(v1's
  `high_stakes_two_step` refusal is withdrawn — it contradicted WCB-R3's one-transaction
  ruling exactly where the stakes were highest.)*
- Attestation passthrough (solo firms); CLR26 inheritance stands.

**Reverse-while-matched [RV]:** named refusals spliced into `reverse_entry` AND
`approve_wrong_client_correction` (anchor discipline beside 0037's
`allocated_items_present` splices; both join the CoR register):
`live_bank_match_present` → "unmatch first". The reversal belt (§4.5) is the structural
backstop for any future path. **The bounced-cheque doctrine [RV]:** a dishonoured cheque
is NOT a reversal — the deposit line's match is a true historical clearing fact and
stays; the return line matches a NEW reinstatement entry (generic, counterparty-stamped
AR control leg → C-a mints the `adjustment` item, re-opening the debt aged from the
return). §6 walks it end-to-end. Reversal is for entries that should not have existed —
and those unmatch first, honestly.

---

**Continued in `wave-c-b-bank-design-part2.md`** — §4.7 `/bank` · §4.8 events · §4.9
locks · §5 migration/runtime + the CoR register · §6 acceptance cells · §7 rulings,
boundaries, residuals + the owner note. Both files together are the C-b mechanism of
record.
