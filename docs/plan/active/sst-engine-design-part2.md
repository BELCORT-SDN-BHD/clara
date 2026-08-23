# F-T1 — the SST engine: design v1, part 2

> **Part 2 of `sst-engine-design.md`** — one design in two files, split only for the repo's 500-line
> per-file ceiling, the shape `wave-e-design-reporting.md` / `-part2.md` and `wave-e-design-skeleton.md`
> already use in this directory. **Part 1 carries §1-§5** (the ruled shape, registration and the taxable
> period, the evaluator family, dual-registrant separation, the SST-02 producer) and every statutory row
> id (`S-*` / `V-*` / `F-*` / `U-*` / `M1`) resolves in `sst-engine-survey.md` §3. Read part 1 first;
> nothing here restates its premises.

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
   nothing in `open_questions`** — it uses `compliance_watches` (§7.1), which `list_review_queue` unions.

**The context pack** gains ONE additive key, `sst_return_status`, beside the existing
`sst_registration_watch` block — which **five migrations pin by name** (survey §1.9), so the CoR must leave
that substring intact and bump the pack's schema version. `codex-design-debate-sst.md` §C.3's framing rules
apply verbatim: she may quote it with its basis and verification status; she may **not** call it a legal
determination, multiply it by a rate, compute tax due, or imply an exemption was verified.

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

### 7.2 The walls

Each is **behavioural** — the proof is a cell that makes it REFUSE, never a substring match:

| wall | refuses |
|---|---|
| `no_rate_row` | a period whose **service date** has no live `sst_rate_schedule` row — by name, stopping in the open (TA-P2) |
| `no_registration` · `dual_registration_gl_ambiguous` | a service-tax evaluation with no live registration; §4's named limitation |
| `no_service_period` | §3.3's s.11(2) sweep on an invoice with no service-performed date — **never a fallback to the invoice date** |
| `period_not_evaluable` · `nil_requires_all_pass` | materialising while any evaluator is `not_evaluable`; §5.4 |
| `over_allocated` | §3.2's over-allocation arm |
| `unallocated_credit_forbidden` | **V-18** — a service-tax CN naming no invoice; the `'apply'` path (`0037:790`) is closed for tax-bearing items |
| `relief_not_approved` · `no_payment_record` | a 13(d) line from a claim not `approved`; a claim with no `sst_return_payments` row to date the six years from |
| `b2b_not_same_item` | a B2B exemption where provider and recipient are not in the **same First-Schedule item** (V-11) |
| `form_rate_line_missing` | §3.8's SST-02A 6%-only defect |
| `submission_is_human` | **e-filing stays human by nature** — law 71's reservation; ADR-0075 excludes it from the delegate grant. The producer produces; it never submits |

### 7.3 The should-have-charged detector — TA-P11's residual

**Condition:** a client with income in a period, classified `included` (or `unknown_or_mixed`) for a service
group, whose approved sales entries in that period carry **no `sst_output` legs**, and who is either (a)
registered for that group or (b) carrying a `crossed`/`overdue` registration watch.

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
| **PR-0** | the gate: independent judgement-logic review (law 1, two lenses) + the cross-model adversarial pass; every finding verified against the LIVE lineage tip, never a design's cite | none | — |
| **PR-1** | **`sst_rate_schedule`** + seed · the **`sst_threshold_schedule` widening** (surrogate `id`, supersession, **the NIL-threshold CHECK fix and the per-ITEM grain**, the eleven missing groups) + the `a21-watch.test.mjs:98-132` re-cut · the reachable-closure write assertion · the **`PRD.md:215` prose→table** correction | **none predicted** — ADD COLUMN + a unique index on a two-row table; the CHECK relax is a widening | — |
| **PR-2** | **`sst_registrations`** (incl. the opaque s.11(1A)/s.25(3) approval trio) + **`sst_taxable_periods`** + the period generator + the `statutory_deadlines` **SST seed rows and consumer** | none predicted; the seed rows land in **F-A4's** table | **F-A4 PR-1c merged** — the additive no-ceremony PR that carries the `statutory_deadlines` DDL (ruled 2026-08-23; conductor's ledger). Columns TBD against it; PR-2 assumes no shape |
| **PR-3** | **`sst_scope_treatments`** + the scope evaluator + the DA/SA directional rule and the Pulau 1 branch + the classification question path (§6) + the `compliance_watches` CHECK widenings | CHECK re-cut with a loud prestate probe; no live body replaced | PR-2 |
| **PR-4** | the **payment-basis evaluator** · **`service_period_start`/`_end` on the AR open item** (§3.3) · CN/DN under reg 11 incl. the `unallocated_credit_forbidden` wall · `sst_deferred_realisation` (the deemed-due record) | ADD COLUMN on `open_items`, nullable, no backfill — **none predicted**; the table is append-only by trigger (`0037:823`), so verify the ALTER against it | PR-2, PR-3 |
| **PR-4b** | **the ruled deferred-output-tax mechanism** (OQ-4, owner 2026-08-23; Annex A.4): `special_acc_type += 'sst_output_deferred'` as a **SIXTH** value on the `0017:673-677` tip · the **CoR of `_assert_sales_invoice_shape_at`** (live tip `0022:714-930`) admitting the deferred leg and re-cutting tie 5 · the **CoR of `allocate_receipt`** (live tip `0044:1642`, the wrapper) posting the deferred→payable transfer · **F-A2's B4-sales tie as a NEW generation in this migration** · the twelve-month transfer on **F-A4's clock** (first firing **DRAFTS**) · the s.11(1A) skip flag | **D1 — the only ceremony in this item; F-T1's own window or the overflow slot W3.** `prosrc`-SHA prestate pin → DROP+CREATE in place → a tail self-proof that raises; §0 quiesce inventory lists **both** CoR'd bodies | **F-A2 PR-1 MERGED AND SETTLED** (train position 5), plus PR-4. ⚠ **F-A3/PR-1b lands first** and CoRs `_allocate_receipt_core` (`0044:1034`) — a different body, no byte collision, but **both wrapper and core are re-derived by rig replay against merged `main` after F-A3, pinning the core's POST-F-A3 sha** |
| **PR-5** | the **accrual/issuance evaluator** (both callers) + **bad-debt claims with their approval lifecycle, the dunning trail and the clawback** + `sst_return_payments`. **Ships WITH or BEFORE the invoice-basis flag goes live** (V-16: paired feature) | none | PR-4 |
| **PR-6** | **`sst_returns` / `sst_return_lines` / `sst_return_02a`** + the **producer** + the per-field mapping + NIL + §4's refusal + §3.8's monthly SST-02A calendar | none | PR-4, PR-5 |
| **PR-7** | the **should-have-charged detector** + the context-pack additive key | **CoR of `get_context_pack`** + schema bump; **five migrations pin `sst_registration_watch` by name** — the substring must survive. D1 if a live pack writer is mid-flight | PR-3 |
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
`special_acc_type` values when the live tip is `0017:673-677`'s five) · **R2** the screening classification
must not become the return's basis · **R3 (re-cut by the OQ-4 ruling)** the payment-basis deferral now
**deliberately** re-cuts two live bodies — `_assert_sales_invoice_shape_at` and `allocate_receipt` — in one
D1 window, behind F-A2/PR-1 and F-A3/PR-1b; the risk is no longer the collision but the **ordering**, and
`0038:139`'s stale "THREE values as of 0016" comment shows how a cited tip goes wrong ·
**R4** the OCR path has no `tax_breakdown` · **R5** the ledger cannot see an under-charged *rate* · **R6**
s.11(2) is a clocked posting belt under law 21 · **R7** `compliance_watches` will not stretch cleanly ·
**R8** the producer is the estate's first artifact outside the seal chain · **R9** the SST-02 form and its
guide disagree at item 14 and Part C, the guide being newer · **R10 (largest)** **the estate has no
service-performed date**, which s.11(2) requires (§3.3) · **R11** the imported-services flow owes a
**self-billed e-invoice carrying the service tax** (F-10) while self-billed detection is UNSCHEDULED
(`PROGRESS.md:297`) — a collision the owner should see, not a gap to leave quietly · **R12** RMCD policy
churn plus MySST's silently incomplete tables (M1, V-15) make any cached rule reading stale in weeks.

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

**The design set is four files.** `sst-engine-survey.md` (the estate at the bytes; **§3 is the statutory
citation table every `S-*`/`V-*`/`F-*`/`U-*`/`M1` id resolves against**) · `sst-engine-design.md` (§1-§5) ·
this file (§6-§12) · `sst-engine-annexes.md`: **A** mechanics + the SST-02/02A field inventory + the
`statutory_deadlines` seed rows · **B** decision register (D-1 … D-15) · **C** the ten rig predictions ·
**D** the owner's ten questions · **E** change log.

## 12 · Change log

| v | date | change |
|---|---|---|
| v1 | 2026-08-23 | First design. Adopts R-L22 and the `sst_threshold_schedule` ownership reversal; all statutory content folded from the three verification lanes (survey §3), including the four brief-correcting findings (s.11(2)'s service date, reg 11, the retroactive 2026 rate order, five designated areas) and the invoice-basis-not-accrual correction. |
