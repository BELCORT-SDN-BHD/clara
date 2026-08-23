# F-T1 — the SST engine: design v2 (gate-folded 2026-08-23), part 2

> **Part 2 of `sst-engine-design.md`** — one design in two files, split only for the repo's 500-line
> per-file ceiling, the shape `wave-e-design-reporting.md` / `-part2.md` and `wave-e-design-skeleton.md`
> already use in this directory. **Part 1 carries §1-§4** (the ruled shape, registration and the taxable
> period, the evaluator family, dual-registrant separation); **this file carries §5-§12**, opening with the
> SST-02 producer. ⚠ **The boundary moved at the v2 fold** — v1 split §1-§5 / §6-§12, and part 1 crossed the
> ceiling — but **the section NUMBERS did not**: every existing `§5.x` citation still resolves, only the file
> it resolves in changed. Every statutory row id (`S-*` / `V-*` / `F-*` / `U-*` / `M1`) resolves in
> `sst-engine-survey.md` §3. Read part 1 first; nothing here restates its premises.
>
> **v2 is the PR-0 gate fold.** Its specification is `sst-engine-gate-record.md`: two blockers, sixteen
> materials and five nits confirmed, eight refuted; fourteen folded here, **four reserved to the owner as
> open cards (OQ-11 … OQ-14)**. The folded mechanisms live in `sst-engine-annexes-2.md` (**Annex F**).

## 5 · The SST-02 producer

### 5.1 What it means, and what it must not become

TA-P11(3) blesses a producer outside the seal/claim chain **on the condition that it shares the
deterministic evaluators and the bigint arithmetic beneath**. The failure it must avoid is TA-P11's own
test: *two mutually-unaware computations of the same fact*.

- **The producer computes NOTHING.** It reads `clara.sst_return_lines`, which §3's evaluators wrote from
  DB-owned period aggregates. If a figure is not already a row, it is not on the form.
- **One entrance per surface**: one function materialises, one renders. **Not claim-eligible, no definition
  version** — F-A5's preview-cell pattern.
- **E-invoice tax lines are a CROSS-CHECK, never a feed** (F-9). No MyInvois → SST-02 feed exists; the
  systems have different owners (LHDN vs RMCD), different grains (document vs period aggregate) and
  different bases, and SST-02's adjustments (13(a)'s note-period rule, 13(b)/(d)'s approval gates) have no
  e-invoice counterpart. Worse, the OCR/witness path emits no `type_code` and no `tax_breakdown` at all
  (survey §1.6), so a feed would silently mis-split every non-structured document. Where a UBL breakdown
  exists it is **compared**; a disagreement is a named condition, never a substitution.

### 5.2 The return objects

**`clara.sst_returns`** — one per (registration, period): `status`
(`draft`/`materialised`/`superseded`/`submitted_externally`), `amendment_seq` (the form's own *Pindaan*
number), `evaluator_version_set jsonb` (the reproducibility key), `materialised_at`, `materialised_by`,
`nil_return boolean`. Immutable + supersede: a re-run mints a NEW return and supersedes the old.
**`clara.sst_return_02a`** is the sibling for the non-registrant monthly reverse-charge declaration (§3.8),
keyed on the client, not a registration.

**`clara.sst_return_lines`** — one row per **form field**: `field_key`, `tax_type`, `rate_kind`,
`rate_bp`/`rate_amount_sen`, `taxable_value_sen`, **`unit_count`** (item 11(e) is declared in *cards*, not
ringgit — a value-only schema cannot hold it), `tax_sen`, `evaluator`, `evaluator_version`, and `basis
jsonb` naming the DB inputs it summed, so a reader walks from a form field to the entries behind it. **Field
keys are DATA, not code constants** — `my-tax-verified-2026-07-29.md` §1.1's lesson (*"Never key a policy
record on 'Table 3.6 item 7' — key it on the rule text"*); and **V-19 shows the same trap in the law
itself**: First-Schedule item 10 is *"complimentary"* in the gazette and *"complementary"* in the
Regulations, so **nothing is ever keyed on a description string**.

### 5.3 The per-field mapping

Form: **BORANG SST-02 (AMENDMENT 2025), 27.8.2025**; guide: **31 May 2026** (which withdrew and replaced the
10 Sept 2025 guide). **The complete item-by-item mapping — all 27 items, Parts A–G — is Annex A.2, and the
six rules that govern it are Annex A.2's own closing block** (moved there whole at the v2 fold, so the
mapping and the rules that read it sit in one place): item 12's exclusive OR and the guide's `+17`; item
14's form-vs-guide divergence, **the guide winning**; the CPPS-generated penalty at item 15, emitted
`externally_determined`, with item 16 `not_evaluable` until supplied; item 11(e) counted in CARDS and items
(9)/11 carrying own-use and disposals; the three deliberately unbuilt line-groups emitting **zero with a
stated `not_in_scope` basis, never a blank**; and Part F's human declaration plus the amendment window.

⚠ **What no §3 evaluator yet produces is the VALUE side and the rate bucket** — `taxable_value_sen`, and the
6%-vs-8% (5%-vs-10%) split that decides whether a figure lands at 11(c) or 11(d). §3's evaluators are
tax-side throughout, and the ledger is single-bucket by construction (`uq_coa_special` `0003:58` gives one
`sst_output` account per client; `journal_lines` carries no rate or classification column). **That is an
owner fork, not a build detail — gate card OQ-11**; until it is ruled the producer returns `not_evaluable`
for every value field, which under §5.4 makes **no non-NIL return materialisable**, and PR-6 may not open.

### 5.4 NIL validity, and the payment record

**A NIL return is a positive act, not an absence**, and the statute agrees: **s.26(5) Act 807 / s.26(6) Act
806** — the return *"shall be furnished whether or not there is service tax to be paid."* The mechanics are
the form's own note: *"Sekiranya tiada nilai untuk diikrar, sila isi angka '0'"* — **fill `0` in every
mandatory field; there is no NIL tick-box** (F-3). So `nil_return=true` is set only when **every** evaluator
returned `pass` with a zero result; **any** `not_evaluable` makes the return non-NIL *and* non-materialisable
with the failing conjunct named — an unclassified income account, a missing rate row, an over-allocated
invoice or a missing service-period date produces a **stopped period and an open question**, never a quiet
NIL. That is review law 2 in one field.

**`clara.sst_return_payments`** — the payment against a materialised return (date, amount, reference),
existing for one reason: §3.4's six-year window runs from *the date the tax was paid*, and without it that
date is not a DB fact; reg 19(1)(b) also requires reproducing **the specific SST-02 on which the tax was
paid**, years later. Recording it is a human act by nature; the bank line matches through the ordinary
reconciliation, not a new mechanism.

### 5.5 The 2026-08-23 owner sitting — OQ-11, OQ-12, OQ-13 mechanisms

**Dispositions are recorded in full in `sst-engine-gate-record-part2.md`; this subsection is the design-side
mechanism each ruling adds, original §5/§7.2 text above left intact.**

**OQ-11 (value-side producer, §5.3):** `invoice.tax_breakdown` used directly where the document carries it.
**Where absent, Clara MAY agentically derive** — the rate-bucket call is her judgement, the taxable base is
deterministic arithmetic over WITNESSED numerals only, and the admission gate is the MECHANICAL
reconstruction identity `base × rate = tax` to the sen against the document's own printed arithmetic, never a
model self-score (laws 72/79). A passing row lands `agent_derived` with a receipt and region evidence; a
failing row refuses to `not_evaluable` and opens a question. PR-6 unblocks.

**OQ-12 (the AR CN wall, §7.2):** `unallocated_credit_forbidden` stays NOT BUILT; the wall moves to CN
**creation** instead — a service-tax `sales_credit_note` naming no originating invoice refuses at creation, on
a new originating-invoice reference column on the CN. `apply_open_items` stays open. **Clara fills the
reference by judgement, read from the CN document itself**; where the document does not name the invoice it
corrects, she opens a clarify card rather than guessing. Supersedes OQ-6. PR-4's CN limb unblocks.

**OQ-13 (the service-performed date, §3.3/§5.4):** a new `sst_service_periods` sibling record — human-
enterable, audited, append-with-supersede, keyed on the open item — carries the date `open_items` cannot
(append-only trigger, `0037:824`). **Fill order: agent-first from document-witnessed performed dates; human
fallback via an open question** where no document states the period. PR-4's ADD COLUMN unblocks.

## 6 · Clara's judgement: questions drafted for one-click approval

Everything she decides here is a **classification, scope or period** question. Three hard rules:

1. **A question carries a DRAFTED answer with its evidence; approving it is one click.** She proposes
   `included / excluded / unknown_or_mixed` + a service group for an income account, or a `treatment` for a
   scope target, with the wiki/history evidence and a citation (law 75) behind it.
2. **The click writes through the EXISTING audited verb** — `set_turnover_classification` (`0016:905`), and
   a sibling for scope treatments. **No new authority path** (law 81).
3. **A question is ADVISORY and never blocks posting.** The reason is mechanical: a client-scoped
   `open_questions` row is a hard workflow gate (`_open_question_blocks` `0012:88`; `_approve_entry_core`
   raises CLR26), so an SST question filed there would stop the client's whole posting lane. **F-T1 files
   nothing in `open_questions`** — it uses `compliance_watches` (§7.1). ⚠ **v1 then said "which
   `list_review_queue` unions", and that is false for the new kinds** (GB-1): the queue's row-producing CTE
   hard-filters `cw.watch_kind='sst_registration'` (`0016:4662`) and even hard-codes the row's label as
   `'SST registration threshold watch ('||cw.service_group||')'` (`:4658`). Filing to `compliance_watches`
   without re-cutting the queue puts every SST condition — §7.3's detector included — where **no human ever
   sees it**. §7.1 now carries the CoR, and it is PR-3 work, not a later nicety.

**The context pack** gains ONE additive key, `sst_return_status`, beside the existing
`sst_registration_watch` block. ⚠ **v1 budgeted that CoR against one substring, and the gate corrected the
surface** (GM-13). `get_context_pack` has not been `create or replace`d since its birth at `0016:4262`:
**every later change is a `pg_get_functiondef` → `replace` → `execute` text-splice on the live catalog body**
(0017 the wiki block · 0018 the resolution-exclusion surgery · 0019 the wiki boundary · 0036 `msic` · 0055
`entity_type` · 0061 `period_snapshot_registry` **and the schema bump to 5**). The established idiom, which
0036/0055/0061 each demonstrate, is to **probe EVERY prior marker before and after the splice** — 0061's own
postcheck walks ten (`0061:152-160`) — and to count the insertion anchor's occurrences, refusing unless it
appears **exactly once** (`0061:139-145`). So PR-7's obligations are: **the live version is 5, not the 3/4
v1's framing implies, and PR-7 takes it to 6**; the additive key inserts before the `'client'` member on
0061's own precedent; the postcheck probes the full marker set plus the new key; and **`period_snapshot_registry`
— the newest key, absent from every F-T1 file until this fold — must survive**. The five migrations pinning
`sst_registration_watch` are the smaller, already-satisfied half. **Annex F.7** carries the splice, and §8's
PR-7 row carries the eight test cells the version bump breaks.

`codex-design-debate-sst.md` §C.3's framing rules apply verbatim: she may quote it with its basis and
verification status; she may **not** call it a legal determination, multiply it by a rate, compute tax due,
or imply an exemption was verified.

**A standing duty falls out of V-15:** RMCD's Service Tax Policies churn monthly (STP 2/2025's Amendment
No.5 *revokes and replaces* Nos. 1-4; STP 5/2025's fourth amendment is five days old), and **MySST's own
English tables silently omit instruments in force** (M1). So the source-monitoring lane versions its rule
set **against the policy amendment number, not the policy number**, and treats an absence from that portal
as *unknown*, never as absence in law.

## 7 · Watches, walls and receipts

### 7.1 The watch carrier

`compliance_watches.watch_kind` (`0016:304`) is extended — extend-only, merge-ordered, announced to the
conductor — with `sst_should_have_charged` · `sst_return_due` · `sst_return_overdue` ·
`sst_twelve_month_rule` · `sst_intra_group_deminimis`. **Two structural frictions, named because they will
bite the builder:** `service_group` is `not null` (`0016:302`) and meaningless for a return-due watch;
`ck_compliance_watches_resolved` (`0016:343-347`) pins `resolved_conclusion` to two registration-specific
values. Both widen **additively** — a `'-'` sentinel is rejected, exactly the quiet mis-fit R7 names — with
a prestate probe that aborts loudly if a predecessor value is absent.

**The carrier is only half the work: `list_review_queue` must be re-cut with it** (GB-1). Three changes,
all in PR-3, all additive:

1. **The row CTE's predicate widens** from `watch_kind='sst_registration'` (`0016:4662`) to the closed set of
   SST watch kinds, and the row's `question_text` becomes **kind-keyed**, never a description string
   (D-11) — `service_group` is rendered only for the kinds that carry one, since it is meaningless on a
   return-due watch.
2. **The `compliance.clients` detail array** (`0016:4703-4714`) already reads the table with **no
   `watch_kind` predicate**, so it surfaces the new kinds today with the registration-specific columns
   (`confirmed_included_cents`, `earliest_crossing_month`, …) populated meaninglessly. It gains
   `watch_kind` in its object and leaves those columns NULL off-registration — **the predicate stays open**,
   so nothing is hidden; only the reader is told what it is looking at.
3. ⚠ **The re-cut is a text-splice, not a `create or replace`.** `list_review_queue` is patched in place by
   0017 (`:516`), 0036 §C (`:1034-1073`), 0041 S4.9 (`:5360-5452`) and 0043 S3.8 — a
   `create-or-replace` grep **cannot see** any of them, which 0036's own header says in as many words. PR-3
   follows the same idiom: prestate marker census → anchored `replace` → `execute` → postcheck over every
   prior marker. **Annex F.6.**

*(One v1 claim the gate narrowed rather than confirmed: `counts.compliance_watches` (`0016:4681`) is derived
from the SAME filtered CTE that feeds `rows`, so the two cannot disagree by kind. The divergence is only
between those two and the detail array at (2).)*

**The proof is behavioural, per §7.2's standard:** a cell that files an `sst_should_have_charged` watch on
RPR and then reads it back as a `row_kind='compliance_watch'` ROW out of `list_review_queue`. A cell that
queries `compliance_watches` directly would pass green while the human surface stayed empty — the exact
wrong-instrument class.

### 7.2 The walls

Each is **behavioural** — the proof is a cell that makes it REFUSE, never a substring match:

| wall | refuses |
|---|---|
| `no_rate_row` | a period whose **service date** has no live `sst_rate_schedule` row — by name, stopping in the open (TA-P2) |
| `no_registration` · `dual_registration_gl_ambiguous` | a service-tax evaluation with no live registration; §4's named limitation |
| `no_service_period` | §3.3's s.11(2) sweep on an invoice with no service-performed date — **never a fallback to the invoice date** |
| `period_not_evaluable` · `nil_requires_all_pass` | materialising while any evaluator is `not_evaluable`; §5.4 |
| `over_allocated` | §3.2's over-allocation arm, and the predicate is **`_subledger_outstanding(item) < 0`** — allocation rows on the invoice item are NEGATIVE (`0037:1248-1257`), so `Σ allocations > gross` can never fire |
| `settlement_leg_unclassified` | §3.2's cash-backed rule — an allocation whose settlement entry carries a non-cash leg on an account with no `consideration_waived` / `consideration_received_net` treatment |
| `post_furnishing_restatement` | §3.7 — a materialisation whose inputs would restate a period whose return has been furnished; the vehicle is reg 15 or the amendment window, and F-8 may have closed it |
| `deferral_transfer_mismatch` | §3.3's differential control, on the **transfer identity** — flagged `sst_output_deferred → sst_output` legs vs realised-plus-deemed. Not the payable account's whole movement |
| `deferred_double_transfer` | §3.3's interlock — a transfer that would exceed `invoice_tax_sen − Σ already-realised(item)` per `sst_deferred_realisation` |
| `opening_sst_unknown` | an `item_kind='opening'` AR item with NULL `sst_portion_cents` under a registration effective on or before its `item_date` (§3.2, Annex F.3) |
| `no_period_anchor` | §2.2 — a registration with neither a recorded `period_anchor_month` nor an effective date to derive S-7's s.25(1) series from |
| `b2b_recipient_unidentifiable` | §3.5 — `b2b_exempt` on a counterparty of a **name-only** client; PRD §6 invariant 2(b). Never `taxable`, never `exempt`, and the build STOPS rather than recording the identifier elsewhere |
| ~~`unallocated_credit_forbidden`~~ | **NOT BUILT — owner card OQ-12.** v1 aimed it at `operation_kind='apply'` (`0037:790`), but that verb is the estate's NAMED-PAIR path (`0037:3251-3259`, `:3384-3389`) and is what *satisfies* reg 11(3)(j); the real gap is a `credit_note` open item with no originating-invoice reference. Until ruled, a service-tax CN is `not_evaluable` by name |
| `relief_not_approved` · `no_payment_record` | a 13(d) line from a claim not `approved`; a claim with no `sst_return_payments` row to date the six years from |
| `b2b_not_same_item` | a B2B exemption where provider and recipient are not in the **same First-Schedule item** (V-11) |
| `form_rate_line_missing` | §3.8's SST-02A 6%-only defect |
| `submission_is_human` | **e-filing stays human by nature** — law 71's reservation; ADR-0075 excludes it from the delegate grant. The producer produces; it never submits |

### 7.3 The should-have-charged detector — TA-P11's residual

**Condition:** a client with income in a period, classified `included` (or `unknown_or_mixed`) for a service
group, whose approved sales entries in that period carry **no leg on the BASIS-CORRECT invoice-time output
account** — `sst_output_deferred` for a payment-basis service registrant, `sst_output` otherwise (§3.2) —
and who is either (a) registered for that group or (b) carrying a `crossed`/`overdue` registration watch.
⚠ **Keyed on `sst_output` alone this detector fires on every payment-basis invoice in the book**, a mass
false positive on the item's single real acceptance specimen.

**Output:** an `sst_should_have_charged` watch with the period, the untaxed value, the group and the rate
that would have applied — **a condition for a human, never a posting**. Under-charged SST is absorbed by the
business plus the 10/15/15 ladder (factsheet §2); the professional act is to surface it, not to gross up the
books. ⚠ **Group G aggregates "combined or singly"** across its items (V-19), so the detector sums the
group, never tests item by item.

**RPR is the live specimen**: RM1.97M turnover, taxable agency commission, no SST anywhere
(`F-rpr-eval-corpus.md:19-24`). §9 runs the detector against RPR's real book.

### 7.4 Receipts

Every evaluator run writes an append-only receipt in the `compliance_eval_runs` (`0016:375`) idiom, and **a
stale evaluator is itself a surfaced condition** — `0016` already makes a receipt older than 48h visible, and
F-T1 inherits that rather than inventing a second staleness signal. Every **materialisation** writes a
receipt naming every contributing `evaluator_version`, so the return is reproducible from its inputs. Under
**TA-P4** the rate-drafting path inherits F-A8's citation-or-refused rule at the tool boundary.

## 8 · Build sequence — PR rows

Uniform ADR-061 ladder on every row. Migrations are `UNNUMBERED_<stem>.sql`, **underscore-only stems**,
numbers claimed by the conductor at merge; `pnpm db:migrate` **silently skips** `UNNUMBERED_*`, so the rig
applies a numbered copy that is never committed (Annex A.5). Frontier at design time: **97 files, highest
`0102_f_a2_statement_activation.sql`.**

| PR | contents | ceremony / D1 | depends on |
|---|---|---|---|
| **PR-0** | the gate: five independent lenses + a refute-style verify pass on every finding, against the LIVE lineage tip, never a design's cite. **RUN 2026-08-23 — record: `sst-engine-gate-record.md`; v2 is the fold** | none | — |
| **PR-1** | **`sst_rate_schedule`** + seed · the reachable-closure write assertion · the **`PRD.md:215` prose→table** correction · **the `sst_threshold_schedule` ALTER, RE-ENTERED — OQ-14 RULED 2026-08-23, F-T1 authors it** (`internet-lane-design.md`'s PR-3 row re-cut to consume-not-author, same date). Annex A.1 keeps the specification | none predicted | none — **OQ-14 discharged** |
| **PR-2** | **`sst_registrations`** (incl. the opaque s.11(1A)/s.25(3) approval trio **and the `period_anchor_month` / `anchor_source` pair**, §2.2) + **`sst_taxable_periods`** + the period generator + the `statutory_deadlines` **SST seed rows and consumer** | none predicted; the seed rows land in **F-A4's** table | **F-A4 PR-1c merged** — the additive no-ceremony PR that carries the `statutory_deadlines` DDL (ruled 2026-08-23; conductor's ledger). Columns TBD against it; PR-2 assumes no shape |
| **PR-3** | **`sst_scope_treatments`** + the scope evaluator + the DA/SA directional rule and the Pulau 1 branch + the classification question path (§6) + the `compliance_watches` CHECK widenings + **the `list_review_queue` re-cut** (§7.1, Annex F.6) + the **settlement-leg treatment** carrier (§3.2) | the CHECK re-cut with a loud prestate probe; **the queue is a TEXT-SPLICE on the live catalog body**, prestate marker census → anchored replace → postcheck (0017/0036/0041/0043 idiom) — no `create or replace`, no D1 | PR-2 |
| **PR-4** | the **payment-basis evaluator** (all three input conventions, Annex F.1) · **`service_period_start`/`_end` on the AR open item** (§3.3) · CN/DN under reg 11 · `sst_deferred_realisation` **as the interlock ledger** (Annex F.2) | ADD COLUMN on `open_items`, nullable, no backfill — **none predicted**; the table is append-only by trigger (`0037:824`), so verify the ALTER against it | PR-2, PR-3 — **OQ-13 RULED 2026-08-23** (§5.5): the `sst_service_periods` sibling record fills the column; the column stays a BIRTH fact under the append-only trigger, so every row alive when it lands is permanently stranded absent that record |
| **PR-4b** | **the ruled deferred-output-tax mechanism** (OQ-4, owner 2026-08-23; Annex A.4): `special_acc_type += 'sst_output_deferred'` as a **SIXTH** value on the `0017:673-678` tip · the **CoR of `_assert_sales_invoice_shape_at`** (live tip `0022:714-930`) admitting the deferred leg and re-cutting tie 5 · ⚠ **the CoR of `_allocate_receipt_core` (`0044:1034`), the CORE — not the wrapper** — posting the deferred→payable transfer · **F-A2's B4-sales tie as a NEW generation in this migration** · the twelve-month transfer on **F-A4's clock** (first firing **DRAFTS**) · the s.11(1A) skip flag · **the brown-field opening position** (Annex F.3) · the `sst_reverse_charge` entry (Annex F.5) | **D1 — the only ceremony in this item, and it needs its OWN freshly-scheduled window.** ⚠ v1 offered "the overflow slot W3": W3 is a one-time T0+22h Track-A window already fully allocated to four named lanes (`wave-f-sprint-dag.md:318`), its overflow role is scoped to F-A7/alpha+beta on a W2 overrun (`:378`), and F-T1's build sits in Wave 3, outside the 48 h (`:260`) — **Track B is outside the W1-W5 inventory**, the treatment F-T3 already applies (`tax-computation-design.md:269`, `:483`). `prosrc`-SHA prestate pin → DROP+CREATE in place → a tail self-proof that raises; §0 quiesce inventory lists **both** CoR'd bodies | **F-A2 PR-1 MERGED AND SETTLED** (train position 5), plus PR-4. ⚠ **F-A3/PR-1b CoRs the SAME body** — `_allocate_receipt_core` — so this is a **real byte collision, not the "different bodies" v1 recorded**: F-A3 lands first, and PR-4b re-derives the core by **rig replay against merged `main` after F-A3**, pinning its POST-F-A3 sha. The wrapper is not the transfer's home: **`_settle_from_bank_line_core` calls the core directly** (`0044:1927`; census pinned `0055:243-244`), so a wrapper-only CoR posts no transfer on any bank-line settlement |
| **PR-5** | the **accrual/issuance evaluator** (both callers) + **bad-debt claims with their approval lifecycle, the dunning trail and the clawback** + `sst_return_payments`. **Ships WITH or BEFORE the invoice-basis flag goes live** (V-16: paired feature) | none | PR-4 |
| **PR-6** | **`sst_returns` / `sst_return_lines` / `sst_return_02a`** + the **producer** + the per-field mapping + NIL + §4's refusal + §3.8's monthly SST-02A calendar | none | PR-4, PR-5 — **OQ-11 RULED 2026-08-23** (§5.5): `tax_breakdown` direct-use plus the agentic-derivation third arm supply the value-side producer and rate-bucket rule |
| **PR-7** | the **should-have-charged detector** + the context-pack additive key | **text-SPLICE of `get_context_pack`** (never a `create or replace` — 0017/0018/0019/0036/0055/0061 each patched the live body) + **schema version 5 → 6**. The prestate/postcheck census walks **every prior marker**, 0061's ten included (`0061:152-160`), not just `sst_registration_watch`. ⚠ **The bump breaks eight standing cells in six files** — `wb-g-tail.test.mjs:125` and `delta-context-pack-residual.test.mjs:44` are **source-text** pins a value-level fix will not satisfy; `:84`, `:98`, `a21-read-surfaces.test.mjs:183`, `rig-events-structure.test.mjs:297`, `wb-o-routing.test.mjs:168`, `wb-w-pack.test.mjs:47` are value-level. All re-cut in this PR. D1 if a live pack writer is mid-flight | PR-3 |
| **PR-8** | acceptance (§9), `PROGRESS.md`, the ADR-048 synthetic labelling | none | all |
| **later** | §4's shape A (the dual-registrant GL split), if the owner rules it in (OQ-3) | **D1** — a second CoR of `_assert_sales_invoice_shape_at`; **fold it into PR-4b's window if OQ-3 is ruled before PR-4b opens**, rather than spending a second quiesce | **F-A2 PR-1 merged and settled** |

**F-A8 dependency, stated so it is not assumed:** PR-1 ships the rate table **migration-seeded**; it becomes
governed-writable only when **F-A8's own PR** widens `p_table_key` and adds the parse rule. Until then the
table is correct and static, which is the honest state.

## 9 · Acceptance against the owner's raw corpora

**The corpora cannot prove the positive path, and the design says so rather than manufacturing a pass**
(digest law 22; survey §5).

| what | corpus | verdict |
|---|---|---|
| The should-have-charged detector (§7.3) | **RPR** — RM1.97M turnover, taxable agency commission, zero SST | **REAL positive acceptance.** It must fire, name the group, and quantify the untaxed value. The item's strongest real test |
| NIL validity (§5.4) | **RS** (twenty-two all-no-tax invoices), **BEE** | **REAL.** A NIL return is producible only after every account is classified; the pre-classification state must produce a *stopped* period, not a NIL |
| `no_registration`, `no_rate_row` | all three | **REAL** — every client refuses, by name |
| Imported taxable services (§3.8) | **BEE's 8 OpenAI invoices** — real 8% Malaysian service tax, foreign-registered supplier | **NOT RUNNABLE in the tie-out**: the same eight USD documents excluded under digest law 18. Recorded, not worked around. **Gate P stays open** |
| Payment basis, s.11(2), bad-debt relief, the reg-11 note period, the SST-02 positive path, dual registration, DA/SA | none | **SYNTHETIC ONLY, and LABELLED synthetic** under the ADR-048 sanction. Wave-G's `CLIENT-SST-1` (`wave-g-e2e-corpus-design.md:110`, `:313`) is the designed home for the real positive path and is **not in this wave** |

**The denominator travels with every number** (the F-A2 lesson): an acceptance record saying "N cells pass"
states how many were synthetic, on what corpus, and what was not runnable.

## 10 · Risks and named non-goals

**Risks** — survey §6 carries the evidence: **R1** no rig replay under the survey (every line cite is a
prediction, and this design's own first draft proved the class: it cited `0016:123`'s three
`special_acc_type` values when the live tip is `0017:673-678`'s five) · **R2** the screening classification
must not become the return's basis · **R3 (re-cut by the OQ-4 ruling, then again by the gate)** the
payment-basis deferral re-cuts two live bodies — `_assert_sales_invoice_shape_at` and **`_allocate_receipt_core`,
the CORE** — in one D1 window; ⚠ **F-A3/PR-1b re-cuts that same core, so this IS a byte collision**, and the
mitigation is ordering plus rig replay against merged `main`, never the `0044` text ·
**R4** the OCR path has no `tax_breakdown` · **R5** the ledger cannot see an under-charged *rate* · **R6**
s.11(2) is a clocked posting belt under law 21 · **R7** `compliance_watches` will not stretch cleanly ·
**R8** the producer is the estate's first artifact outside the seal chain · **R9** the SST-02 form and its
guide disagree at item 14 and Part C, the guide being newer · **R10 (largest)** **the estate has no
service-performed date**, which s.11(2) requires (§3.3) — and the gate showed the consequence is worse than
"a missing input": with `open_items` append-only there is **no operator door**, so the return is unfileable
(OQ-13) · **R11** the imported-services flow owes a **self-billed e-invoice carrying the service tax** (F-10)
while self-billed detection is UNSCHEDULED (`PROGRESS.md:297`) — a collision the owner should see, not a gap
to leave quietly · **R12** RMCD policy churn plus MySST's silently incomplete tables (M1, V-15) make any
cached rule reading stale in weeks · **R13 (new, gate)** **the estate's live bodies are spliced, not
replaced** — `list_review_queue` and `get_context_pack` are both patched in place by four-to-six later
migrations, invisible to a `create or replace` grep. Every F-T1 CoR of a shared read surface reads the
CATALOG body and censuses its markers · **R14 (new, gate)** **F-T1 shares `sst_threshold_schedule` with a
live F-A8 design that has not retracted its claim** (OQ-14); until ruled, two lanes each believe they author
one ALTER.

**Named non-goals for v1**, each *out* rather than forgotten: **e-filing** (human by nature; excluded from
the ADR-0075 delegate grant) · **withholding tax, self-billed detection, staff allowances**
(`PROGRESS.md:297`) · **multi-currency SST** (law 18) · **tourism tax, high-value goods tax and sales tax on
LVG** — MyInvois codes 03/04/05 exist and LVG has its own 10% rate and RM500,000 threshold, but they are
separate regimes the contract does not name, so `tax_type` stays a closed two-value set and an unknown code
REFUSES · **digital services / foreign registered persons** (s.56B, s.56A(4A) — a different statutory hook) ·
**the s.41A credit system, the s.39 deduction and Schedule C purchases** · **transaction-level service
classification** (it stays per-account, so the return's basis is a *classified* sum whose coverage is
reported, never an unqualified "taxable turnover") · **sales-tax registration threshold monitoring**
(`0016`'s watch is service-tax only).

## 11 · Annex map

**The design set is SIX files at v2.** `sst-engine-survey.md` (the estate at the bytes; **§3 is the
statutory citation table every `S-*`/`V-*`/`F-*`/`U-*`/`M1` id resolves against**) · `sst-engine-design.md`
(**§1-§4**) · this file (**§5-§12** — the boundary moved at the v2 fold; section numbers did not) ·
`sst-engine-annexes.md`: **A** mechanics + the SST-02/02A field inventory and its six producer rules + the
`statutory_deadlines` seed rows · **B** decision register (D-1 … D-21) · **C** the rig predictions (C-1 …
C-16) · **D** the owner's questions · **E** change log · **`sst-engine-annexes-2.md`: Annex F — the
gate-folded mechanisms** (F.1 the three §3.2 input conventions · F.2 the deferral interlock and its writer
census · F.3 the brown-field opening position · F.4 the differential control's operands · F.5 the
imported-services posting home · F.6 the `list_review_queue` splice · F.7 the `get_context_pack` splice) ·
**Annex G — fix-round addenda (conductor review, 2026-08-24), DOC-ONLY: G.1 the five frozen 0016
group-grain readers, no successor-body owner yet; G.2 the no-default-service-tax evaluator law**) ·
**`sst-engine-gate-record.md`** — the PR-0 gate and this fold's specification.

## 12 · Change log

| v | date | change |
|---|---|---|
| v1 | 2026-08-23 | First design. Adopts R-L22 and the `sst_threshold_schedule` ownership reversal; all statutory content folded from the three verification lanes (survey §3), including the four brief-correcting findings (s.11(2)'s service date, reg 11, the retroactive 2026 rate order, five designated areas) and the invoice-basis-not-accrual correction. |
| v2 | 2026-08-23 | **The PR-0 gate fold** (`sst-engine-gate-record.md`; 2 blockers · 16 materials · 5 nits confirmed, 8 refuted). Fourteen folded: §3.2's three input conventions re-cut at the bytes (**the basis-correct invoice account**, the **negative** allocation sign, the **cash-backed** portion, the `effective_date` bound) · §3.3's differential control **scoped on both sides** and given a **double-transfer interlock** · §2.2's uncited FYE anchor **struck** for a recorded-then-sourced anchor · §3.5's B2B arm bound to **PRD §6 invariant 2(b)** with a stop-and-escalate · §3.7 gains the late-unallocate router · §3.8's reverse charge **ruled to the books** · §7.1 gains the `list_review_queue` re-cut · PR-4b re-aimed at **`_allocate_receipt_core`** with its own future D1 window (W3 struck) · PR-7 re-scoped to the full marker set and the eight test cells · the brown-field opening position designed. **Four reserved to the owner: OQ-11 … OQ-14.** Part 1 crossed the 500-line ceiling, so §5 moved to this file. |
| **fix round** | **2026-08-24** | **PR-1's own conductor review — MERGEABLE-WITH-FIXES, executed in the migration**: F1 (blocker) the credit/charge-card row's citation and date corrected to P.U.(A) 213/2018 @ 2018-09-01 · F2 four verified predecessor rows seeded, fail-closed before the earliest verified instrument · F3 `sst_threshold_schedule` gains the same immutability+supersede trigger pair as its sibling (measured: DELETE and an out-of-shape UPDATE were both allowed before this) · F4 a self-supersession CHECK on both reference tables · F5 `basis_kind` closed to the `0055:395` vocabulary + the document-source tie, both tables · F7 `a21-watch.test.mjs`'s P1 test re-cut (inline-gated on F-T1's own stem) and a rolled-back cell measuring the `0016:882-886` schedule-note residual. **F6 doc-only, this fold**: Annex G (`sst-engine-annexes-2.md`) records the five frozen group-grain readers (G.1, MEASURED via a real cross-test contamination this fix round produced and then fixed) and the no-default-service-tax evaluator law (G.2) as named, unowned obligations for a later PR. |
