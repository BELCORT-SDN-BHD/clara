# Wave C-b — bank design, part 2 (v2, review-hardened)

> **This file continues `wave-c-b-bank-design.md` (v2, 2026-07-31)** — same status, same
> authority, same evidence grading (**[V]/[G]/[C]/[RV]/[R1]**). Part 1 carries §1–§4.6
> (the debt, grounded facts, the three identities, identity/statement/ingest/consent/
> match-model/verbs). This part carries §4.7–§7. Both files together are the C-b
> mechanism of record.

### 4.7 `/bank` (WCB-R4)

The `/queue` two-pane shape: list = statements per account (chain state, the
`bank_statement_tie` banner — closing vs bank-COA GL balance at `period_end` vs unmatched
sums **[RV]**), proposal cards; detail = lines with match state, the matching workspace
(open items by counterparty · candidate entries with per-side remaining capacity ·
charge/adjustment slots · settle / match / complete-pending actions · period-exception
acknowledgements). **Every list RPC is SECURITY DEFINER and therefore bypasses RLS — each
one opens with `_human_ctx` and carries `firm_id = c.firm` in every predicate
(`list_review_queue` idiom), granted to `clara_authenticated` ONLY, with a per-RPC
cross-firm tenancy cell (firm B + firm A's id ⇒ zero rows) [RV].** Writes via PostgREST
with fresh op-keys; `clara_dev_jwt` idiom; a Home nav link. Statement-PDF preview reuses
the `/documents` agent-lane byte stream.

### 4.8 Events — registered, ID-only

`bank.account_created · bank.account_proposal · bank.statement_ingested ·
bank.statement_voided · bank.match_created · bank.match_completed ·
bank.match_unmatched` — **each registered in `event_types` + the trigger taxonomy in the
migration (the 0037:3443-3469 pattern; the spine REJECTS unknown types — v1 would have
rolled back the first account creation at append [R1])**, client-scoped, C-b decisions
`ignore`. **Payloads carry identifiers only — never account numbers, never line
descriptions** (`domain_events` is agent-readable firm-wide **[RV]**); a §5 tail assert
scans every `bank.*` payload key set against an allowlist (the 0020 leak-scan idiom).
Outbox law: an aborted verb leaves zero events.

### 4.9 Locks (§K extension — new rungs at the END, nothing renumbered)

- **New advisory rung: `203005006` = the per-account statement-chain lock**
  (`hashtext(bank_account_id)`), taken by `persist_statement_facts` /
  `enter_bank_statement` / `void_bank_statement` — serializing overlap + both-edge
  continuity (the check-then-insert races **[R1]**).
- `settle_from_bank_line` rides the composite order (op-receipt → all sub-key
  reservations → 003 → 004 → `open_items` → fresh entries → groups) then bank rows LAST —
  it never locks a pre-existing entry.
- `match_bank_line` locks pre-existing entries: `journal_entries` rows
  (`FOR UPDATE ORDER BY id`) → advisory 004 (the `reverse_entry` relative order) → line
  rows `FOR UPDATE` + statement `FOR SHARE` → member writes → adjustment entries via the
  core (fresh rows; counterparty-free ⇒ no 003 — pinned, §4.6).
- `void_bank_statement`: 004 → 203005006 → line rows `FOR UPDATE` → the live-member probe
  (the void-vs-match race **[R1]**).
- **Law:** bank statement/line/match rows lock after `journal_entries` and after
  `open_items` in any transaction touching both; an x38 cell pins acquisition order in
  prosrc for all writers.

## 5. The migration + runtime (number claimed at merge — expected 0038)

**Deploy order is BINDING [R1]: runtime image FIRST** (statementFacts_v1 + registry +
freeze manifest + `enqueueForLane` branch — whose default changes from
fall-through-to-documentIngest to an **explicit allowlist returning undefined + warn**
for unknown lanes, so a migration-before-runtime window can never route a bank statement
into a consentless generic OCR run **[R1]**) → **migration** → **consent
ceremony/activation**.

Migration order: §0 probes → `bank_institutions` seed → consent (3 table CHECKs + doc_sha
CHECK + the FOUR verb recuts with purpose-discriminated holds + the prepare/consume
6-arg overloads) → `coa_accounts.is_bank_account` → tables (`bank_accounts`,
`bank_statements`, `bank_statement_lines`, `bank_matches`, both member tables,
`bank_account_proposals`, `bank_match_audit`) + belts + RLS/ACL → event-type + taxonomy
registration → verbs → router recut (amendment idiom) → `claim_document_processing_task`
recut (lane-list widenings ONLY) → the reserve/settle/refund + release_held + attempt-cap
lane widenings → the FIVE task CHECK widenings (lane · lane-engine · engine-kind ·
**error-code · binding** **[RV]**) → `reverse_entry` + `approve_wrong_client_correction`
splices (`live_bank_match_present`) → **the 0027 filing-correction/retirement writers
spliced to refuse while a live `bank_statements` row rides the document** (provenance
durability **[R1]**) → tail asserts (normalized-prosrc pins · ACL pins incl. per-RPC
grants · CHECK catalogs · event-type catalog · the payload-key allowlist scan ·
whole-schema leak scan).

**CoR dual-grep register (corrected [RV]):** `_enqueue_invoice_facts_core`
(0009→0014→0015→0016→0017(dynamic)→0025→0026 + the 0020 §6 pin amendments) ·
`claim_document_processing_task` (**0007→0009→0011→0015→0024** — 0016 holds only probes;
recut source = `pg_get_functiondef` against a migrated DB, never file text) · the four
purpose-bearing 0020 verbs · `prepare/consume_egress_dispatch` (new overloads) ·
`_reserve/_settle/_refund_processing_call` · `release_held_document_tasks` ·
`reverse_entry` (0009→0017 splice→0037 splice) · `approve_wrong_client_correction`
(0027→0037 splice) · the 0027 filing writers. **Named test-maintenance deliverables:**
`wb-0020-legacy.test.mjs` restore transforms · `wave-b-0020-postverify.sql` ·
`wiki-projection.mjs` surface guard.

**Build-time verification items:** Azure prebuilt bank-statement availability (fallback
named) · `set_document_kind`/`classify_document` re-kind guard while a live statement
binds the document · Supavisor headroom re-read before deploy · the 2504/2505 scan
byte-identity check · the OFX intake fixtures.

## 6. Acceptance (WC-R11 · WCB-R5/R6)

Rig from zero → labelled synthetic in Rome → consent ceremony → one real BELCORT month
(digital set canonical; April's zero-activity statement is a vector **[C]**).
`x38-wave-c-b-bank.test.mjs` + runtime + dashboard suites. Cells (v1's set, plus the
ladder's additions — the review-driven cells marked ●):

- **Identity**: add/dup/two-accounts/one-COA/deactivate · ● reactivate · ● remap refused
  while matched, allowed after · ● post-deactivate ingest → `account_inactive`, offered
  remedy succeeds · ● the two-row `client_identifiers` law + a real-format attribution
  resolve · ● proposal only after header corroboration.
- **Ingest**: chain/steps/zero-line/totals/non-MYR/duplicate/overlap/continuity/
  gap-then-fill/out-of-order/date-bounds/financial_date · ● header endpoints from labels
  (`header_unreadable`) · ● mandatory totals (`totals_unreadable`) · ● zero-line header
  corroboration (wrong-account zero-line refuses) · ● both-edge void-reingest (different
  closing → refused) · ● concurrent overlapping periods + concurrent two-gap-fillers
  (chain lock serializes) · ● persist replay (`replayed:true`, not `duplicate_period`) ·
  ● every named error code lands as a row (CHECK widenings proven) · ● `enter_bank_
  statement` human path (same refusals) · ● multi-client filing → `statement_multi_
  client` · ● budget/attempt-cap/concurrency apply to the lane · ● kill switch off +
  consent active ⇒ held, then released.
- **Consent**: inactive → enqueue refusal; grant alone ≠ active; activate → flows;
  deactivate → refuses · ● wiki holds byte-unchanged in both directions · ● sha-bound
  dispatch (A-for-B ⇒ unknown) · ● structured lane consent-recorded, not kill-switched.
- **Matching**: exact single · N-lines-one-entry group (IBG pair) · `wrong_account` ·
  ● void-statement member → `wrong_period` · ● posting-date exception requires ack +
  recorded · deposits-in-transit pass · line exclusivity (× concurrent settle — the
  index refuses, red-team fn-owner insert refused) · ● per-side exhaustion incl. the
  gross two-sided entry (loan-drawdown shape) and ● the negative-sum attack ·
  group-tie ± adjustment · unmatch → re-match · void refused while matched · ●
  concurrent void vs match serializes · audit + events per action · ● reversed-original
  and mirror membership refused · ● reverse-while-matched refused (both verbs + the
  belt red-team) · ● the bounced-cheque walk (deposit stays matched; reinstatement entry
  matches the return line; debt re-aged).
- **Settle-from-line**: receipt N invoices · payment mirror · ● receipt-side charge
  (gross clear, zero residual) · ● payment-side charge (two entries one group) · ●
  refund quadrants refuse with the workaround, and ● the workaround itself ties
  end-to-end · ● pending-match at threshold: line owned at draft, checker approves,
  `complete_pending_match` ties; maker-cancel path; reject path · attestation · CLR26 ·
  op-key replay · outbox rollback.
- **Tenancy/ACL**: ● per-RPC cross-firm zero-rows cells · ACL pins · ● event payload
  allowlist · ● lock-order prosrc pins incl. 203005006.

## 7. Rulings, boundaries, residuals — and one owner note

The WCB-R1..R6 table stands as ruled (2026-07-30; see git history for v1's wording).
**One mechanism note for the owner's sign-off, not a re-grill: v1 handled a high-stakes
settle-from-line by refusing into a two-step flow; the review proved that reopens the
approved-but-unmatched interval WCB-R3 exists to close, exactly where the money is
largest. v2 replaces it with the pending-match reservation (§4.6): the line is owned the
moment the maker acts; the checker's approval completes it. Maker-checker law (WCA-R7 /
CLR05) is untouched.**

**Boundaries** (unchanged from v1): no recon receipts/aging/learn loop (columns + events
ready) · no multi-currency · no agent matching, no agent grants anywhere in the bank
schema · no chat surface · no `_coding_lane_core` widening, no duplicate-guard extension
· no `sales_invoice` split · `bank-match` namespace, never `reconciler` · deployed
workflow bodies untouched (new `_v1` files only).

**v2.1 AS-BUILT AMENDMENTS (assembly + rig, 2026-07-31 — each caught by a contract-blind
cell or an integration seam; the mechanism of record is the 0038 file itself):**
- **Entry members are PER SIDE** (cell x38.h, the loan-drawdown-net-of-fee shape): the §4.5
  unique becomes `(match_id, entry_id, side_positive)` with a generated `side_positive`
  column — a single net member would lose per-side consumption and let a later line falsely
  re-consume an exhausted side. The verb's duplicate refusal narrows to same-entry-same-side.
- **Owner GO recorded (2026-07-31): the §7 pending-match note is accepted**; v1's
  `high_stakes_two_step` refusal is withdrawn as designed in v2 §4.6.
- **`bank_account_proposals` carries a lifecycle** (task_id · reason incl.
  `account_inactive` · existing_bank_account_id · status open/resolved + resolved_*) — two
  build lanes independently converged on it; the no-lifecycle composition is superseded.
- **`bank_match_audit` is match-scoped** (actions match/settle/settle_pending/complete/
  unmatch); statement voids ride the GENERIC `_audit` trail — §4.5's "void" wording is
  read as the statement action it names, recorded on the trail that owns statements.
- **An EIGHTH event type registers**: `document.statement_facts_failed` (deliberately in
  the document.* namespace so the bank.* ID-only payload scan stays money-scoped).
- **Null-safe endpoint guards**: the §4.3 header/line normalizers use `IS DISTINCT FROM`
  on `jsonb_typeof` — a missing key must diagnose `header_unreadable`, never slip to a
  23502 (cell x38.w's catch).
- **The chain-lock pin points at the ONE shared core** (`_persist_statement_core`), with
  persist/enter pinned on their call edge into it; the settle pin asserts DELEGATION to
  both C-a composites and the ABSENCE of any advisory rung in settle's own body.
- **Consent-verb arities as-built**: prepare 5→6-arg, consume 6→7-arg (the design's
  "6-arg overloads" was off by one for consume); `statement_multi_client` also joins the
  never-claimed binding allowlist (the router runs inside filing transactions).

**Named residuals (v2):** the unmatched-duplicate-entry window (C-c tie-out closes it;
the `/bank` tie banner surfaces it meanwhile) · the refund quadrants ride the documented
workaround until a refund composite wave · intake's kind-blind OCR egress stays on the
global switch (WCB-R1 scope; typing it is a named future wave; the audit record never
claims otherwise) · statement descriptions are uncorroborated prose · per-line region
citations not carried (the extraction envelope retains the full read; `facts_hash` +
reader extraction ids prove who agreed) · reader-2 engine availability (named fallback) ·
the interview `banks` item stays free-text (v3 restructure declined) · `bank_
institutions` is a seeded reference, additively grown by migration.

**v2.2 AS-BUILT AMENDMENTS (the fix wave after the as-built review ladder, 2026-07-31 —
sources: the opus/Codex as-built findings, the contract-blind regression cells, and the
0037-predecessor machine diff; the mechanism of record stays the 0038 file):**
- **Ancillaries DEFER at high stakes** (Codex B1): settle validates the charge/adjustment
  accounts inline but posts NOTHING beside a pending reservation — the payload rides
  `bank_matches.pending_ancillaries` (jsonb, cleared on unmatch and on complete) and
  `complete_pending_match` posts charge + adjustment entries itself before its parity
  derivation. The stored `charge_cents` is DOMAIN-AWARE (AP only): the AR-side charge
  already rides the settlement entry's expense slot, so a flat carry would double-post
  and break the group tie. The pending reservation law is now ZERO entry members + the
  draft anchor; settle's pre-reserved ancillary receipts close as
  `{"deferred":true,"to":"complete_pending_match"}`.
- **The pending draft joins the reversal protection** (Codex B2): `_bank_live_match_present`
  and the entry-reversal belt now see pending anchors; the `pending_draft_already_approved`
  refusal is REMOVED — cancel-after-approve proceeds one-way (group dies, approved entry
  stands, `draft_withdrawn:false`), because the refusal wedged the exact race it described.
- **Re-kind splices (E7e)**: `classify_document` + `set_document_kind` refuse
  `live_bank_statement_present` — a document with a live statement cannot quietly become a
  different kind (void first). Classify refuses on ANY differing proposed kind, low-
  confidence verdicts included (stricter than the ladder asked; the remedy is identical).
- **`running_balance_cents` is nullable as-built**; both consumers were already null-safe —
  the OCR mandatory-per-row rule lives in the core's chain walk (`chain_broken`), not in
  a NOT NULL.
- **Statement lifecycle triggers**: `_tf_bank_statement_transition` (live→void with stamps;
  void gains `superseded_by` exactly once) + `_tf_bank_statement_no_delete`; the immutable
  set is `to_jsonb(old)` minus the five lifecycle columns, so future columns are protected
  by default.
- **BMMB seeds; the OCR engine literal is `azure-di:prebuilt-bankStatement.us:2024-11-30`
  everywhere** — provenance names the model actually invoked.
- **THE LANE-AWARE TERMINAL-EVENT LAW (closed end-to-end by the regression cells):** every
  statement-lane terminal receipt minted by the router core reaches the spine as
  `document.statement_facts_failed` with its reason, AT ITS MINT SITE — the typed-consent
  gate verdicts (`statement_multi_client`/`consent_inactive`), the page-budget catch
  (`budget`), and the enqueue-time attempt cap (`attempt_cap`, the branch a capped
  statement actually reaches; the claim-time belt is unreachable on the ordinary
  claim→fail→re-enqueue cycle). Symmetrically, the invoice twin NEVER fires for a
  statement document: the 0009 wrapper (E2b) and the three 0027-lineage filing verbs
  (E2c: `file_document`, `confirm_attribution_candidate`, `approve_wrong_client_correction`)
  gained a task-lane suppress on their caller-side emit. The invoice lane's enqueue-time
  cap silence (0026) is preserved as a recorded pre-existing residual.
- **The task transition belt widens** (E2b): `queued→failed` now admits the two
  never-claimed gate codes — the gate's in-place flip of a queued task died CLR16 the
  first time a cell drove it.
- **`complete_pending_match` uses the text-cast min idiom** for its line pick
  (`min(uuid)` is not an aggregate); caught by the completion cells on first execution.

**Delta-review round (2026-07-31, opus + Codex adversarial on the fix-wave diff):** verdict
no-blocker; the two MAJORs are FIXED (the deferred-ancillary arc now has an end-to-end cell
— x38.ag: high-stakes AP + charge + adjustment through complete, replay-safe; the OCR
reader-2 engine fallback ships null so the DB's `coalesce(engine_id, task_engine_id)`
records the TRUE engine, never a hardcoded literal). Recorded residuals from that round:
`confirm_attribution_candidate`/`approve_wrong_client_correction`'s E2c suppressions are
text-postchecked only (the identical idiom is behaviourally proven on `file_document` by
x38.z4) · the core's statement-twin emits carry `actor=null` even when a human filing
caused them (the core has no actor context; the task id in the payload is the join key) ·
a task already RUNNING when the multi-client gate fires is not re-gated — consent
revocation is still caught at egress by prepare/consume, `statement_multi_client` is not
(pre-existing shape; the gate flip covers queued rows) · `parseCentsInput` deliberately
rejects scientific notation (documented at the fn; the tie preview + DB re-derivation make
silent-zero a UX bound, not a money hazard) · the runtime no longer ships `facts_hash`
(the core derives its own from the read it re-normalizes; the shipped key was dead).

**Delta-review round 2 (2026-07-31, the Codex adversarial pass on the same diff —
adjudicated finding by finding):**
- **ACCEPTED, structural:** `ck_bank_matches_pending_ancillaries` — `pending_ancillaries
  is null or status='pending'` IS a table CHECK (the earlier "not expressible because
  status moves under it" reasoning was WRONG: a CHECK sees only the new row, and every
  legitimate writer clears the payload in the same UPDATE that moves status). The leak
  class is now refused, not conventioned away; the x38.u red-team proves the refusal.
- **ACCEPTED:** the typed-consent gate emits EXACTLY ONCE per verdict instance — only the
  acting branches (the queued-row flip, a fresh terminal insert) emit; a re-read of an
  existing receipt returns silently, and the acting row is named by version order, never
  uuid order. x38.z4 pins count==1 across repeated dark re-tries.
- **ACCEPTED:** the XML router arm is kind-aware — a bank_statement xml gets the terminal
  `skipped_type` receipt (no xml statement parser exists in C-b), never the myinvois
  invoice lane. Cell x38.am.
- **ACCEPTED:** the belt widening is LANE-SCOPED — the two gate codes are admitted on
  queued→failed only for the statement lanes.
- **ACCEPTED:** `parseCentsInput` rejects >2 decimals outright (no silent truncation;
  the sen is the atom).
- **REBUTTED (ratified residual, not a blocker):** "complete→unmatch→re-settle
  double-posts" — unmatching a live group deliberately leaves approved journals standing
  (reverse-not-delete); a re-settle against the SAME items refuses on outstanding (C-a
  allocation law), so the exposure is the already-named unmatched-duplicate-entry window,
  closed by C-c tie-out and surfaced meanwhile by the /bank tie banner.
- **REBUTTED as pre-merge scope (named residual + open item):** re-kind task hygiene — a
  document re-kinded while a task of the OLD lane is queued/running keeps that stale task
  (pre-existing 0026 shape; E7e already refuses the destructive direction once a live
  statement exists). A stale task's terminal event is noise, not money; the autodraft wake
  for the new kind re-arms on the next filing/re-fire. Candidate C-c mechanism: retire
  queued tasks whose lane no longer matches the kind at re-kind time.
