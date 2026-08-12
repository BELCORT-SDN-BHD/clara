# Wave C-c — tie-out, aging, learn loop (design v2.1, post-ladder + delta)

> **Status: v2.1 (2026-07-31) — owner rulings WCC-R1..R8 ratified; design-ladder round 1
> (three-lens opus adversarial + Codex `gpt-5.6-sol` cross-model) FULLY ADJUDICATED, plus
> round 2 (the delta coherence check — 15 defects incl. two identity-breaking readings and
> the opening-anchor gap) applied.** The finding-by-finding record (33 Claude + 16 Codex findings, two recorded
> rebuttals) lives in `wave-c-c-tieout-design-part2.md` — both files together are the C-c
> mechanism of record. Authority: `wave-c-contract.md` §4 C-c governs. Evidence grades:
> **[V]** verified this session · **[G]** grounding-lane brief · **[R]** owner-ruled
> 2026-07-31 · **[L1]** ladder-round-1 finding, adjudicated. Never re-grill WC-R1..R12 ·
> WCA-R1..R9 · WCB-R1..R6 · WCC-R1..R8.

## 1. The debt and the grounded ground

**What C-b left, verified live (census 2026-07-31) [V]:**
- 41 unmatched RPR lines, −RM653,894.70 (+1 labelled synthetic fixture; DB-wide 42). Classes:
  payroll `MAS PAYMENT` ×4 −RM291,312.15 · EPF ×4 −RM96,750 · LHDN ×4 −RM68,263.20 ·
  ROME PUBLIC ×5 −RM68,500 · PERKESO ×3 · SIP/EIS ×4 · bank charges ×7 · IWIFI ×4 net exactly
  RM0 · other ×7 (INF ASSET rental ×3 @ −RM41,040 · KOK LIONG · director · one bare M2UBIZ).
  **None has a books counterpart** — WCC-R5 follows from this fact.
- Aging working set: **16 open AP items, RM143,650.00, all vendor-side; AR nets to zero.**
- 16 live matches, all `origin='human'`, all 1:1 — the learn loop's seed set.
- Descriptions carry embedded newlines — **every description pattern is multi-line by law**.
- 2025-04/05 statements are genuine zero-activity (`line_count=0`).

**The seam C-b named [V]:** the tie banner (`list_bank_statements`, `0038:7919-7952`) is a
single-statement read with no persisted object, no chaining, and blindness to an
approved-but-never-matched duplicate (`StatementDetail.tsx:109`). No cross-statement unmatched
report and no aging surface exist anywhere **[V]**.

**The prior build's grave (GAP1-3 rebuild directive) [G]:** recons floated free of statements;
outstanding was between-dates (brought-forward dropped); completion never required a line
matched. Directive: *chain, one live recon per account-period, all-time uncleared scope,
completion = every line matched or explicitly ignored + difference 0.* Salvage:
`_aging_core`/`_statement_core` arithmetic PORT (as-of-dated, item-dated, never GL sums) **[G]**.

**PRD tension, already ruled:** PRD §4:78 "tie-out gates year-end close" is deferred by WC-R3 —
the receipt is SHAPED for a future close wave, never wired as a gate.

## 2. Owner rulings (2026-07-31) — WCC-R1..R8

| # | Ruling |
|---|---|
| **WCC-R1** | **The reconciliation is born 1:1 ON a live statement**; it inherits the statement's period and uniqueness. *(Rationale corrected by the ladder [L1]: the statement table enforces continuity between CONTIGUOUS periods only — real gaps are legal and stay visible; §3's chain law closes the gap case by name.)* |
| **WCC-R2** | **Strict completion + a narrow exception door.** Every statement line matched into the books; only book-side timing items stand; one audited exception door for genuine bank errors/disputes — an ordinary unbooked movement can NEVER ride it; difference EXACTLY 0. *(Made structural by the ladder [L1]: the door sits at the OWNER floor with disposition-linked resolution — §4.2.)* |
| **WCC-R3** | **Aging buckets measure days since the document date**; `due_date` is an overdue MARKER, never the bucket driver. |
| **WCC-R4** | **Due-date producer = per-counterparty default terms, stamped at item BIRTH** (`open_items` is append-only; existing items keep an honest null). |
| **WCC-R5** | **The learn loop suggests TWO kinds — match/settle pre-fills AND coding pre-fills.** Advisory only, owner-signed rules, never blocking, NO new posting authority; every act runs through the existing human verbs; settlement kinds stay composite-born. |
| **WCC-R6** | **Acceptance = sandbox labelled-synthetic first, then ALL NINE RPR recons COMPLETE at difference 0**, aging + counterparty statements rendered. Named owner-action dependencies: the ROME PUBLIC ledger pull (Aug/Oct/Dec wait) and WCC-R7. |
| **WCC-R7** | **The IWIFI four are related-company current-account movements** (in RM290k, out RM290k, closes to zero; non-`payable`-class per WC-R10; never in AP aging). |
| **WCC-R8** | **Ride-alongs, all four:** re-kind task retirement + the `{mode:0o600}` sink line · the leader-cancel `settle_chat_turn` fix · the consent-evidence correction door + CSV preamble rows · the `request_reextraction` statement scope. *(The ladder re-labelled re-kind retirement and the re-fire door NOT-small and re-aimed the consent door — §5; the "attempt-cap re-authorization door" stays DROPPED, no register holds it.)* |

**Engineering pins:** a human-confirmed suggestion records `origin='rule'` +
`matched_via_rule_id` with the human as `created_by` (via the §5 overloads — the bare pin was
unbuildable, both writers hardcode `'human', null` [L1 V 0038:4074/4666]) · rule proposals
breed at the **≥3** floor, **DB-derived, never caller-supplied** [L1] · live truth is derived,
the receipt SNAPSHOTS it under a **bitemporal cutoff** (§3) · completion at the bookkeeper
floor; the exception door at the OWNER floor [L1] · no runtime module takes the `reconciler*`
stem (crash-sweep family [V]) — C-c's namespace is `bank-tieout*` · match state stays OFF
`journal_entries` (WC-R3).

## 3. The identities (rewritten in full — ladder round 1)

For account **A** (COA code `c`), period **P** = a live statement **S**. All terms are
**account-scoped and all-time** (≤ `P.end`); only the completion *precondition* is
period-scoped. **[L1 — the v1 defect all four lanes converged on: the bank-side term must be
"every line through `P.end` the books do not hold as of `P.end`", and consumption dates at the
LINE grain, never the group's.]**

- `gl(P)` = Σ (debit−credit) over approved `journal_lines` on `c`, `posting_date ≤ P.end`.
- **Per live group g:**
  `uncleared(g,P) = Σ matched_cents of g's ENTRY members whose entry posts ≤ P.end`
  `               − Σ amount_cents of g's LINE members whose statement period_end ≤ P.end`
  A group in one month contributes 0. A cross-month straddle self-splits (the April tranche
  of a two-tranche +1000 receipt leaves `+600` — the later tranche — which the identity
  DEDUCTS as a deposit in transit). A line matched only to later-posted entries (C-b's
  acknowledged `posting_date_exception`, `0038:812-816`) contributes its full bank side =
  an honest timing item — **never a refusal** [L1].
- `unmatched_capacity(P)` = Σ over approved entries on `c` posting ≤ `P.end`, per side,
  **stated exactly [L1, delta-corrected]:**
  `(dr_capacity − Σ positive live consumption) − (cr_capacity − Σ |negative live consumption|)`
  where the subtracted consumption is each entry's **TOTAL live-group consumption regardless
  of line dates** — an entry fully consumed by a live group contributes 0 here even when its
  lines clear later; the entry-vs-line timing lives ONLY inside `uncleared(g,P)`. (The delta
  round proved the line-dated reading double-counts every matched-but-uncleared entry.)
- `excepted(P)` = Σ signed `amount_cents` of **ALL lines of A on statements with
  `period_end ≤ P.end`** whose exception is **open, or resolved with the line still
  unmatched** **[L1 + delta — all-time, like every other term; a carried April dispute keeps
  May..Dec completable, and a non-booking resolution can never leave a term-less hole]**.

**THE COMPLETION IDENTITY (exact-zero, WCC-R2):**

```
S.closing  =  opening_anchor  +  gl'(P)  −  Σg uncleared(g,P)  −  unmatched_capacity'(P)  +  excepted(P)
```

**The opening-anchor rule (delta round — the takeover case):** for an account whose FIRST
live statement opens at 0 (RPR, the sandbox), `opening_anchor = 0` and `gl' = gl`,
`capacity' = capacity` — the identity as plainly read. For a **nonzero first opening**
(a takeover account), the first receipt names the opening-anchor entry set — the K
carry-down `gl_balance` entry on `c` (opening_items lineage) — which is EXCLUDED from `gl'`
and `capacity'` and replaced by `opening_anchor = S_first.opening_cents`; the belt asserts
the takeover tie `anchor_amount − Σ bank_uncleared entry amounts = S_first.opening` and
refuses `recon_opening_mismatch` by name. `bank_uncleared` entries stay IN capacity — they
are pre-cutover instruments that WILL match future lines. Down the chain the anchor rides
the receipts (`opening_cents = prior receipt's closing`, belt-asserted).

**Precondition (period-scoped):** every line of S is a member of a **`live`** group or under
an open exception. A `pending` reservation refuses by its own name `recon_line_reserved`
(remedy: `complete_pending_match`) [L1].

**The bitemporal receipt law [L1/C6]:** every certified term is defined under the receipt's
approval-visibility cutoff — journal rows count only when approved at or before
`completed_at` (column verified at build [RV]). Verification recomputes under the cutoff and
must reproduce the receipt byte-exactly forever; a later back-dated approval changes the LIVE
preview, never the receipt. This preserves WC-R3 (no close gate) while killing the silent
divergence class.

**The settled-period law:** once P is complete, `unmatch_bank_match` AND
`complete_pending_match` refuse any group whose member lines lie in a reconciled period
(`recon_period_settled`); undo = void the recon chain back, newest-first
(`recon_chain_order`). **The ordered-unwind cost is real and stated [L1/A7]:** correcting a
matched entry nine months back means voiding nine receipts; /bank shows "voiding N receipts"
before the act. Matching only ADDS to unreconciled lines (exclusivity blocks re-match [V]).

**The chain law (date-contiguous [L1]):** completing P requires a prior live statement with
`period_end = P.start − 1` whose recon is complete — a missing month refuses
`recon_period_gap` by name (never a number-hunt); no prior statement at all = the
**first-period exemption**, claimed exactly once and PINNED on the receipt
(`prior_statement_id null`). Backfilling a statement earlier than the account's earliest
complete recon refuses `recon_frontier_backfill` at ingest (§5 splice) — the June-first,
April-later demotion is unreachable [L1].

**Snapshot spec [L1 + delta]:** the receipt enumerates every outstanding entry-side (with
`posting_date` and AGE), **every outstanding line-side member** (a line matched only to
later-posted entries), every open-or-resolved-unmatched exception, and every consumed
`bank_uncleared` opening item's lineage (`opening_item_id` + `item_ref` + `item_date` via
`entry_id`). A reversal pair
whose BOTH legs post ≤ `P.end` is excluded from the enumeration (arithmetic-neutral;
enumeration-only — the list must converge, not grow with every correction). Any outstanding
side older than **60 days** before `P.end` refuses `recon_outstanding_stale` unless
acknowledged by id (`p_ack_outstanding uuid[]`, the `p_ack_period_exceptions` idiom) — the
duplicate-payment plug is challenged, not totalled [L1/R10].

## 4. Schema (migration number claimed at merge — expected `0040`)

### 4.1 `clara.bank_reconciliations` — the receipt IS the row
```
id · firm_id, client_id, bank_account_id uuid not null
statement_id uuid not null        -- composite FK (statement, firm, client, account); UNIQUE
                                  -- where status='complete' (one live recon per live stmt)
coa_account_code text not null    -- the CERTIFIED basis [L1]; asserted vs the live mapping
                                  -- AT INSERT only (the snapshot-coherence belt) [delta]
prior_statement_id uuid null      -- null = the first-period exemption, claimed once [L1]
prior_reconciliation_id uuid null -- legibility; frontier splice is the enforcement [L1]
                                  -- (both prior refs carry (firm_id, client_id) composite
                                  --  FKs, as does bank_account_id — the tenancy law [L1])
period_start, period_end date     -- copied at birth; belt asserts = statement's
status text check (in ('complete','void')) default 'complete'   -- NO superseded_by [L1]
opening_cents · gl_balance_cents · closing_cents · outstanding_cents · excepted_cents
   -- all bigint not null; opening copied from the statement (belt: = the prior receipt's
   -- closing where a prior exists; the §3 opening-anchor basis at first period) [delta]
   -- BINDING [delta]: outstanding_cents := Σg uncleared(g,P) + unmatched_capacity'(P);
   -- polarity: as the §3 terms, signed from the account holder's side
completed_by (bookkeeper floor) · completed_at (= the bitemporal cutoff)
snapshot jsonb not null           -- the §3 snapshot spec
voided_by/voided_at/voided_reason
```
Born only COMPLETE (open state is derived; no draft rows, no dead states). Lifecycle is
**void-only** [L1 — supersession is unreachable by construction: `recon_present` on
`void_bank_statement` forces the recon void FIRST, so a re-ingested statement starts with no
recon until a human completes a fresh one]. Void-stamp is the only lawful update
(`_tf_bank_statement_transition` idiom); no delete. RLS FORCE, human firm-scoped SELECT,
`clara_authenticated` only, zero agent grants — **stated for every table in this design**.

### 4.2 `clara.bank_line_exceptions` — the narrow door, made structural [L1/C5]
```
id · firm_id, client_id, bank_account_id (trigger-stamped) · statement_id
line_id uuid not null             -- composite FK (line, firm, client, account) [L1]
kind text check (in ('bank_error','disputed'))
reason text not null check (btrim <> '')
evidence_document_id uuid null    -- provenance-bound when supplied (firm/client-validated)
status text check (in ('open','resolved')) default 'open'
created_by/created_at · resolved_by/resolved_at
resolution_disposition text null check (in ('matched_booking','bank_corrective_line',
                                            'written_off_adjustment'))
resolution_note text              -- mandatory at resolve
```
**The door sits at the OWNER floor** — the firm's principal certifies a bank error; a
bookkeeper cannot acknowledge away an unbooked payroll run. `unique(line_id) where
status='open'`; an open-excepted line is not matchable (`line_excepted`) and a matched line
is not exceptable (`line_already_matched`) — **closed against write-skew at the lock, not
just the belt [L1/C8]:** except/resolve take the line row `FOR UPDATE` (the same lock every
match writer takes) and the spliced match/settle verbs re-check exceptions after their line
lock. **Resolution is disposition-linked [L1 + delta — no disposition may leave a term-less
hole]:** `matched_booking` is lawful only when the line is (now) a live member or in the
same txn as the booking match; `written_off_adjustment` REQUIRES the in-txn booking match
against the write-off adjustment entry (so the line ends matched); `bank_corrective_line`
REQUIRES naming its counterpart line (excepted in the same txn as its offsetting pair) —
the pair rides `excepted(P)` netting to zero by construction, belt-asserted, enumerated as
a closed pair. Status-flip lifecycle; no delete; belt asserts an open exception's statement is
LIVE [L1/R11].

### 4.3 `clara.bank_rules` + suggestions-as-reads
```
id · firm_id, client_id · kind ('match_settle','coding')
status ('proposed','signed','retired') default 'proposed'
pattern jsonb        -- word-bounded tokens over MULTI-LINE description + direction
                     -- (+ optional amount shape); the C-b containsSynonym idiom
proposal jsonb       -- match_settle: {domain, counterparty_id} · coding: {account_code,
                     -- narration_template, counterparty_id?}
evidence jsonb       -- DERIVED IN-VERB [L1/Au10]: the verb recomputes the sighting set with
                     -- the candidates-RPC predicate; refuses rule_evidence_insufficient < 3;
                     -- callers never supply evidence
content_hash text not null   -- canonicalised (kind, pattern);
                             -- unique(client_id, kind, content_hash) where status in
                             -- ('proposed','signed') [L1/Au12]
created_by/created_at · signed_by/signed_at · retired_by/retired_at/retired_reason
unique (id, firm_id, client_id)   -- the tenancy anchor for every referencing FK [L1/Au15]
```
**Signed content is immutable [L1/C14]:** a transition trigger admits proposed→signed→
retired only; `pattern`/`proposal`/`evidence` are FROZEN at creation (a change is a new
proposed rule); no delete, no truncate. `sign_bank_rule` is **owner-floor**.
`bank_matches.matched_via_rule_id` gains its composite FK `(rule, firm, client)` [L1].
**Suggestions are READS:** `list_bank_line_suggestions(statement)` evaluates signed rules at
call time, **≤1 suggestion per (line, kind)** [L1]; breeding is a read
(`list_bank_rule_candidates`, ≥3 floor). NO rule ever executes anything.
**The sighting carve-out [L1/Au11 — WA2-R9's law applied, not new]:** a suggestion-born
draft is stamped (`bank_rule_suggested` → rule id) and `_approve_entry_core`'s sighting
accrual EXCLUDES stamped drafts — a bank coding suggestion must never breed
`vendor_account` autopost proposals through three assisted clicks.

### 4.4 Terms, due dates, and the aging as-of grain
- `counterparties.payment_terms_days int null` + `set_counterparty_terms` (bookkeeper;
  takes `203005004` + the counterparty row `FOR UPDATE` [L1/C12]). **Requires a recut of
  `_tf_counterparty_update_0011`** — its positive column whitelist would refuse the UPDATE
  outright [L1/Au2 V 0011:940-960]; the non-merge whitelist widens by `payment_terms_days`,
  the merge branch stays frozen. §5 register.
- `_subledger_on_approve` splice: `due_date := item_date + terms`, **scoped
  `item_kind in ('invoice','bill')`** [L1/Au17] — a settlement can never read overdue.
- **`open_item_allocations.effective_date date not null` [L1 — the as-of grain the substrate
  lacks]:** allocate/apply = the anchor settlement/adjustment entry's `posting_date`;
  unallocate = `current_date` at the act (the house reverse-not-delete precedent — corrected
  history is NOT retroactive, matching `reverse_entry`'s current-date mirror). New sibling
  `_subledger_outstanding_asof(item, as_of)`; the existing fn is untouched (5 callers).
  **Backfill (36 live rows) derives via the application-group join inside 0040, within an
  EXPLICIT append-only-trigger disable/re-enable window** — stated in §8, with its own
  upgrade-drill cell.

### 4.5 Events — registered, ID-only
`bank.reconciliation_completed · bank.reconciliation_voided · bank.line_excepted ·
bank.line_exception_resolved · bank.rule_proposed · bank.rule_signed · bank.rule_retired` —
event_types + taxonomy registration; payload-key allowlist extends the 0038 scan;
identifiers only. Outbox law unchanged.

## 5. Verbs, locks, belts, and the splice register

| Verb | Floor | Refusals (named) |
|---|---|---|
| `complete_bank_reconciliation(statement, p_ack_outstanding uuid[], op_key)` | bookkeeper | `recon_prior_missing` · `recon_period_gap` · `recon_line_unsettled` · `recon_line_reserved` · `recon_difference_nonzero` · `recon_opening_mismatch` (the §3 takeover tie [delta]) · `recon_outstanding_stale` · `recon_coa_shared` (>1 account any-state on the COA with a live statement [L1/A6]) · `recon_uncleared_off_account` (a `bank_uncleared` item whose entry carries no leg on a REGISTERED bank-account COA — the preflight also REPORTS unrecoverable shapes by item id [L1/A14/C16]) · `statement_not_live` · `recon_already_complete` (different op_key ⇒ RAISE; same op_key ⇒ `_reserve_op` dedupe returns the stored receipt; a replay after void returns the VOIDED receipt, which names its status [L1/R12]) |
| `void_bank_reconciliation(recon, reason, op_key)` | bookkeeper | `recon_chain_order` (not the tail) · `recon_already_void` · `reason_required` |
| `except_bank_line(line, kind, reason, evidence_doc?, op_key)` | **owner** | `line_already_matched` · `line_already_excepted` · `statement_not_live` |
| `resolve_bank_line_exception(exc, disposition, note, op_key)` | **owner** | `already_resolved` · `resolution_note_required` · `disposition_unbooked` (`matched_booking` while the line is not a live member) |
| `propose_bank_rule(kind, pattern, proposal, op_key)` | bookkeeper | `rule_evidence_insufficient` (derived <3) · `rule_pattern_already_signed` |
| `sign_bank_rule` / `retire_bank_rule` | **owner** | `rule_not_proposed` / `rule_not_signed` |
| `set_counterparty_terms(cp, days, op_key)` | bookkeeper | `terms_out_of_range` (≤0 or >365) |

**Locks.** `complete`/`void` recon: `203005004` → `203005006` → **line rows `FOR SHARE` in id
order, THEN the statement** (the house order every 0038 writer uses [L1/R6] — v1's inversion
is corrected; 004 is the true serializer and the row locks are belt-and-braces) → the
`bank_accounts` row `FOR SHARE` [L1/C7]. `except`/`resolve`: `004` → `006` → the line row
`FOR UPDATE`. No pre-existing `journal_entries` row is ever locked — the C-a partial order is
untouched. One x40 cell pins acquisition order in prosrc for ALL five new verbs.

**Belts — SPLIT in two, because they are two laws [L1/R3/Au6]:**
- `_tf_bank_recon_belt` on `bank_reconciliations` rows written in-txn: **snapshot
  coherence** — `opening + gl' − outstanding + excepted = closing` over the STORED terms
  (with `outstanding_cents`'s §4.1 binding), the snapshot enumerates exactly those terms,
  period copy = statement, chain + stamp coherence; the certified-COA-vs-live-mapping
  assert fires at INSERT only [delta]. Beyond insert it never re-derives from live rows —
  the receipt is bitemporal truth.
- `_tf_bank_settled_authority_belt` on member/exception tables: **authority only** — no
  live-group membership change on a settled line; no exception write that dodged its verb
  (floor + lock); an open exception's statement is live. Never arithmetic.
- The rules transition trigger (§4.3). No belt computes money for rules.

**THE SPLICE REGISTER (CoR — dual-grep each; recut source is `pg_get_functiondef` against a
migrated DB, never file text) [L1 — corrected lineages throughout]:**
1. `void_bank_statement` (0038-born): + `recon_present` + `open_exception_present`.
2. `unmatch_bank_match` (0038): + `recon_period_settled`.
3. `complete_pending_match` (0038): + `recon_period_settled` [L1/A11].
4. `match_bank_line` + `settle_from_bank_line` (0038): **new overloads** with trailing
   `p_via_rule uuid default null` (0038's tail pins are exact-arity `regprocedure` — verify
   they still resolve [RV]); validates a signed same-client rule (composite FK); sets
   `origin='rule'`; **+ the exception re-check after the line lock** [L1/C8].
5. `remap_bank_account_coa` + `deactivate_bank_account` (0038): + `recon_present` refusal +
   take `004 → 006` (today they take NO advisory rung [L1/R5 V 0038:2939-2996]).
6. `_persist_statement_core` (0038-born, **0039-SPLICED** — the null-defers markers must
   survive [V]): + `recon_frontier_backfill`.
7. `_subledger_on_approve` (0037-born; 0038's four hits are CALLER-side `position()` probes,
   not recuts [L1/Au19] — callee safe to replace, callers' call-site strings must survive):
   + due-date birth stamping.
8. `_tf_counterparty_update_0011` (0011-born, never recut [V]): whitelist widening —
   prestate probe asserts the whitelist literal appears EXACTLY ONCE [L1/Au2].
9. `_tf_processing_task_update` (0011-born, **0038-E2b-RECUT** [L1/Au7]): the re-kind
   retirement arm (`queued→failed`/`skipped_kind`, scoped to the re-kind path). **Prestate
   probe = the 0038-only marker** (`new.lane in ('statement_facts','statement_parse')`) —
   NEVER the 0011 anchor, which survives verbatim inside the 0038 body (the silent-revert
   trap, named).
10. `_approve_entry_core` (the most-spliced fn in the system — 0037's recut is the live
    body): the sighting carve-out PATCH (anchors from the live body).
11. `classify_consent_evidence_document` (0020, owner floor): the consent door **moves
    here** [L1/Au8] — kind predicate relaxes to (null | `'other'` | `'consent_evidence'`);
    `classify_document`/`set_document_kind` CLR28 anchors stay UNTOUCHED (protecting the
    0038 E7e splices); `clara_runtime` never gains the stamp.
12. `request_reextraction` (0022-born; **live body = 0026 §I** — 0025+0026 recuts, TOCTOU
    `for update`, three admission doors [L1/Au9]): the statement re-fire **routes through
    the E2 router's enqueue path** so the typed-consent gate + page budget + attempt cap are
    inherited, never re-implemented; prestate probes assert every 0025/0026 marker.

**Runtime ride-alongs (no DB):** the leader-cancel `settle_chat_turn` fix · the intake CSV
single-column-preamble acceptance · `{ mode: 0o600 }` on the refusal sink.

## 6. Read RPCs (SECURITY DEFINER + `_human_ctx(bookkeeper)` each; `clara_authenticated`
only; per-RPC cross-firm zero-rows cells)

| RPC | Returns |
|---|---|
| `ar_aging` / `ap_aging(client, as_of, p_segment uuid default null)` | per-counterparty buckets **current(0-30) / 31-60 / 61-90 / 91+** (disjoint, half-open [L1/A9]) from `item_date`, outstanding via `_subledger_outstanding_asof`; `due_date` marker per item. `p_segment` is reserved-ignored (cell-asserted) [L1/Au18]. Acceptance cell: Σ buckets = Σ outstanding_asof = the control balance at as_of. |
| `customer_statement` / `supplier_statement(client, cp, from, to)` | running-balance rows keyed on item/effective dates (the `_statement_core` PORT shape on the 0037 grain) |
| `list_unmatched_lines(client)` | the cross-statement unmatched report [V: does not exist today] — every unmatched, unexcepted line with class hints |
| `get_bank_reconciliation(statement)` | the receipt + snapshot; or the DERIVED open preview (live terms, labelled preview) |
| `list_bank_line_suggestions(statement)` | signed-rule evaluations, ≤1 per (line, kind) |
| `list_bank_rule_candidates(client)` | the ≥3-sighting breeding census |

## 7. Runtime + dashboard

- **No new workflow class; no machine lane.** Runtime work = the ride-alongs + the
  `bank-tieout` RPC client surface. No file under the `reconciler*` stem.
- **/bank grows the recon pane**: the derived identity preview → complete (with the
  stale-outstanding acknowledgment list) → receipt view with snapshot · the exception door
  (owner-only UI) · suggestion chips (match/settle pre-fill opens the existing panels;
  coding pre-fill opens a pre-filled generic draft — stamped `bank_rule_suggested`) · rule
  candidates + owner sign card · **the ordered-unwind surface: "this will void N receipts"
  before any settled-period undo** [L1/A7].
- **/aging** two-pane: AR/AP toggle, as-of picker, drill-down to counterparty statement.
  New `ClaraPart` members + catalog entries.

## 8. Deploy

Runtime image first, then migration `0040` (D1 quiesce, §0 probes + postverify). **The
`effective_date` backfill runs inside 0040 within an explicit
`alter table … disable trigger t_open_item_allocations_append_only` → backfill (36 rows,
application-group join) → re-enable window** — stated here so the deploy never discovers it;
its own upgrade-drill cell (the x37-0037-upgrade idiom) proves the backfill on a populated
pre-0040 book. Supavisor headroom re-measured before the new RPC consumers land.

## 9. Acceptance (WCC-R6)

**Rig from zero:** `x40-wave-c-c-tieout.test.mjs` — the §3 identity ± each term ·
**red-proof cells for every ladder blocker** [L1]: the unpresented cheque (matched AND
unmatched variants) · the deposit in transit · the carried exception (except April,
complete April AND May) · the resolved-then-booked exception · the corrective-pair
resolution (nets zero, enumerated closed) · the duplicate-payment `recon_outstanding_stale`
challenge · the takeover nonzero-opening anchor (`recon_opening_mismatch` both directions) ·
the cross-month straddle group · the acknowledged posting-date exception · the
matched-but-uncleared entry (consumption is entry-total, never line-dated — the delta
round's double-count trap) · the loan-drawdown per-side shape · the
write-skew pair (concurrent except vs match) · remap-vs-complete · the frontier backfill ·
the bitemporal re-derivation (back-dated approval after completion: receipt reproduces
byte-exact under its cutoff) · `recon_period_gap` · settled-period refusals (unmatch AND
complete_pending_match) · zero-line month (precondition trivial, identity NOT) ·
`bank_uncleared` off-account probe · terms→birth-stamp (invoice/bill only) · rule floors
(derived evidence; sign owner-only; frozen-after-signing; pattern-hash uniqueness) ·
suggestion reads ≤1/(line,kind) · per-RPC tenancy zeros · lock-order prosrc pins ·
Σ buckets = control.

**Sandbox labelled-synthetic:** a 3-month synthetic recurring corpus → breed → owner signs →
suggestions → drafts → matches → three recons complete → void recon → void statement →
re-ingest → fresh recon (the old stays void) → aging/statements render.

**Real book (RPR):** set terms · sign the recurring rules (EPF/PERKESO/SIP/LHDN, payroll,
MAS charges, INF rental) · book via suggested drafts (67 payroll files in the corpus) · the
IWIFI four per WCC-R7 · ROME PUBLIC per the owner's ledger pull (**Aug/Oct/Dec gated — the
named owner action**) · complete Apr→Dec at 0 · `list_unmatched_lines` empty (or exactly the
honestly-gated set) · aging ties to the AP control · statements render.

## 10. Boundaries + recorded residuals

**Boundaries:** no close model, no close gate (WC-R3) · no autopost anywhere; zero agent
grants on every new table · settlement kinds stay composite-born · no `_coding_lane_core`
widening · no duplicate-guard extension · match state off `journal_entries` · multi-currency
out · no `reconciler*` stem · `bank_match_audit`'s action vocabulary unchanged (recon acts
ride the new event types + generic `_audit`).

**Adjudicated rebuttals (part2 carries the full record):** the "port the close-segmentation
seam now" finding is REBUTTED-PARTIAL on the audit's own F12 evidence (item-dated subledger
reads never broke at close; the breakage was GL-side) — the forward shape IS the reserved
`p_segment` + item-dated arithmetic + bitemporal receipts; a segment column against a model
that does not exist is the half-close-model WC-R3 forbids. Re-openable at the close wave.

**Residuals this design KNOWINGLY leaves:** the settled-period ordered-unwind COST — a
coding correction N months behind the reconciled frontier voids N receipts, re-completes N
months; surfaced before the act in /bank, accepted as the price of receipts that mean
something [L1/A7] · rule patterns are description-token heuristics —
precision lives in the human confirm; a noisy rule is retired · the LLM-structured reader-2
seam A stays unbuilt (C-b residual) · §5.3 sighting-pool segregation stays pinned (WCA-R8) —
the §4.3 carve-out NARROWS the debt (bank suggestions cannot breed vendor rules), it does
not pay it · the `account_class` binary debt surfaces in aging as convention-routed rows ·
the 60-day stale-outstanding threshold is an engineering default, owner-adjustable later.
