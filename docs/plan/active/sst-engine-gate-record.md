# F-T1 PR-0 — the gate record

> **The gate ran 2026-08-23** against design **v1** (`sst-engine-design.md` + `-part2.md`, the annexes and
> the survey), as `-part2.md` §8's PR-0 row requires. **Five lenses, all fresh-context, all read-only on
> code** — **accounting** (does the number the design specifies match what the Acts and the ledger actually
> produce?), **live-truth** (does every cited byte resolve at the LIVE lineage tip, splices included?),
> **security** (does anything here cross an invariant or a wall?), **law** (does the design bind under the
> rulings and digest laws it claims, and is its own ground actually ruled?), **build** (is the PR sequence
> buildable, and are its ceremonies real?). **Every finding was then re-attacked by an independent verifier
> that did not raise it**, which re-graded four and **REFUTED eight**.
>
> **Verdict: the item's SHAPE holds — the anchor, the arms, the rounding rule, the walls-as-refusals
> discipline and the statutory work are unusually good — but §3.2's three inputs were each wrong at the
> bytes, and the same-day OQ-4 ruling was folded into four sections and left stranded in three others.**
> Fourteen findings fold into **v2**; **four are reserved to the owner** and each BLOCKS a PR. Every finding
> below names its fold target. **The fold is v2's change-log entry and this file is its specification.**
> Counts: **2 blockers · 16 materials · 5 nits CONFIRMED · 8 REFUTED**, severity moved on four.

---

## 1 · What was attacked and HELD

- **The anchor is right, and it survived the hardest attack.** `open_item_allocations` really is the one AR
  settlement grain (D-3), `_subledger_outstanding` really is derived-never-stored, and the arms table's
  *shape* — refuse by name, never default — held under every lens. What the gate found were wrong **inputs
  to a correct formula**, not a wrong formula.
- **The statutory work is the strongest part of the item.** Every §3 row the lenses spot-checked resolved to
  its cited instrument: s.11(2)'s service-performed date (V-4), reg 11 as the note regulation (V-9, *not*
  regs 22-23), the retroactive P.U.(A) 125/2026 (V-3), the five designated areas with Pulau 1's inversion
  (V-12), item 14's form-vs-guide divergence (F-4), and the invoice-basis-not-accrual correction (S-4).
  **The one uncited statutory claim in the whole set was found and struck** (GM-8).
- **The NIL rule is exactly right and the gate tried to break it.** `nil_return=true` only when every
  evaluator returned `pass` with a zero result, any `not_evaluable` making the return non-NIL *and*
  non-materialisable, is review law 2 in one field — and it is what keeps several findings below fail-closed
  rather than wrong-numbered.
- **The one-architecture discipline is real, not decorative.** D-3 (no new allocation table), D-4
  (`sst_taxable_periods` is not a `reporting_periods.grain` widening), D-12 (nothing in `open_questions`,
  because `_open_question_blocks` `0012:88` would gate the client's whole posting lane) and §5.1's
  producer-computes-nothing were each attacked and each held. **D-12 was attacked on the wrong grounds and
  survives:** it rests only on `_open_question_blocks`, not on `list_review_queue`, so GB-1 does not touch it.
- **The design's honesty about its own evidence held up**, and three findings were refuted precisely because
  it had already named the limitation (§8). **`sst_rate_schedule`'s three rate FORMS and its service-date
  lookup key** were attacked as over-engineering and both held: P.U.(A) 170/2025's specific rates and 11(e)'s
  RM25-per-card cannot live in `rate_bp`, and V-3's retroactive order makes a "current rate" column produce
  wrong numbers for a whole quarter.

---

## 2 · Blockers — the build may not start until each is folded

**GB-1 · §3.2 reads an account the ruled OQ-4 mechanism leaves empty by construction, so the item's central
number is zero for the DEFAULT accounting basis.** *(accounting lens, CONFIRMED at the bytes; verifier
corrected the failure story and held severity.)* §3.2 scoped itself to `accounting_basis='payment'` service
registrations and defined `invoice_tax_sen` as *"the sum of the entry's `special_acc_type='sst_output'`
legs"*. The same-day OQ-4 ruling credits **`sst_output_deferred`** at invoice **for exactly that population**
(Annex A.4), and A.4's own tie-5 clause makes the exclusivity explicit — the tax lands in **either** account,
*"not the sum of both"*. `0022:893-895` sums `sst_output` alone; the deferred value is net-new to the
migrations tree. **No re-cut existed anywhere**: no file keyed the read on the basis.
**Two failure paths, and the verifier showed the second is worse than the finding claimed.** Under §3.2's
literal arm 1 ("no `sst_output` leg, but the client IS registered ⇒ not a zero ⇒ should-have-charged"), the
empty read fires **§7.3's detector on every payment-basis invoice in the book** — a mass false positive on
the item's only real acceptance specimen. Under the other reading the figure is zero, and **§3.3's
cross-check does not catch it**: A.4 sizes the transfer from §3.2's own `realised_tax`, so a zero §3.2 posts
a zero transfer, the payable movement is also zero, and the two "mutually aware" derivations **agree at
zero** while SST-02 items 11(c)/11(d)/12 print zero on a return with real taxable receipts.
**Fold:** `invoice_tax_sen` and arm 1 both key on **`_sst_invoice_tax_account(registration)`**, resolved from
`accounting_basis` (**Annex F.1(a)**; the §3.2 input table; §7.3's condition re-cut in the same words). An
absent or unrecognised basis is `not_evaluable`, never defaulted. **A.3's worked example is restated against
the deferred leg.** **D-16.**

**GB-2 · Two live design documents each author the identical `sst_threshold_schedule` ALTER, and F-T1
presents its claim as ruled ground.** *(law lens, CONFIRMED; two of the finding's own cites corrected.)*
`sst-engine-design.md` §1 is headed *"The ruled shape (fixed, not designable)"* and its point 4 read *"BOTH
SST reference tables are F-T1's"*, with no hedge — the PR-1 row and D-14 build on it as settled. Against
that, **`internet-lane-design.md` is live** (`docs/plan/index.md:78`), **v3**, dated the same day, itself
gated, and **has not been re-cut**: `:431` still reads *"PR-3 · the `sst_threshold_schedule` limb, alone —
unchanged from v2 (the surrogate-`id` ALTER …)"*, with the same DDL verbatim in `internet-lane-annexes.md`
Annex M/S-16 and the same scope in `internet-lane-gate-record.md:378`. **The reversal's only corroboration is
F-T1's own document set**: `wave-f-contract.md:340` and `PROGRESS.md:135` move only *the rate table*, and no
ADR carries it. Per review law 2 a self-asserted citation is not positive evidence that a cross-document
conflict is retired — and F-T1/PR-1 has **no upstream dependency**, so it can merge first, while F-A8/PR-3 is
gated only on F-A8's own PR-2. Whichever lands second collides on a duplicate column. **The design's own C-4
named this as a prediction; it is not a prediction, it is the current state at HEAD.**
**Fold (partial — the ruling is the owner's, OQ-14):** §1 point 4 is split — the **rate** table's ownership
is corroborated and stands; the **threshold ALTER is marked contested and CUT from PR-1**, with Annex A.1
re-labelled *"the specification of the work, not a claim on the lane that does it"*. **D-14 is re-opened**,
**R14** added, and the fail-closed default is that **F-T1 does not author it until ruled**. *(Two finding
cites corrected: the "*awaiting the conductor's confirmation*" hedge is at `sst-engine-survey.md:355`, not in
the annexes, and it concerns the separate `0016:5216-5228` truing — the ALTER-ownership row above it, `:354`,
carries no hedge at all.)*

---

## 3 · Materials — each folds into v2

**GM-1 · The allocation row §3.2 must join on is NEGATIVE, and the design's own acceptance cell is green on
the wrong sign.** *(accounting lens; severity corrected blocker → material.)* `_subledger_on_approve` writes
**"THE BALANCED PAIR. -X against the settled item, +X against the settlement item"** (`0037:1248-1257`), and
the signs survive `0040`'s re-cut of that block (`:6037-6046`); `_subledger_outstanding` = `amount + Σ
allocations` (`0037:874-880`) confirms the direction, and `apply_open_items` mirrors it (`0037:3384-3389`).
The settlement-side row is not an available reading — one receipt writes N of them into one
`application_group` and none can name its invoice. A.3 works the formula with a **positive** 36000.
**What makes it more than a typo: A.3's own cells cannot detect it.** On the negative sign, cell (a)
"Σ realised = invoice_tax_sen exactly" still PASSES, because the residual rule *defines* the settling tranche
as `8000 − (−5334)` = 13334, and −2667 −2667 +13334 = 8000; cell (b) passes trivially on a negative sum.
**And the refusal arm is dead as written** — with negative rows `Σ allocations > gross` can never be true.
*Material, not blocker:* `0003:144-147`'s non-negative leg CHECKs make PR-4b's transfer of a negative figure
**hard-raise at the first allocation**, so no registrant reaches a filed return that way; the wrong-number
window is PR-4-before-PR-4b evaluator output.
**Fold:** the sign transform is **stated and versioned** in §3.2 and derived in **Annex F.1(b)** step 2; the
over-allocation predicate becomes **`_subledger_outstanding(item) < 0`**; and **A.3 gains a third cell (c)**
asserting each `realised_tax` is positive and `allocation_amount_sen` is the negation of the invoice-side
row. **D-16.**

**GM-2 · `allocation_amount_sen` is not "payment received" — a settlement discount and a bank charge both
inflate it, and they are indistinguishable at the bytes.** *(accounting lens, CONFIRMED; the word "discount"
appeared nowhere in the design set.)* `_allocate_receipt_core` computes `v_gross := p_amount_cents + v_disc`
(`0044:1073`) and bounds the allocation set at `v_gross` (`:1117-1120`), while the per-item bound is only the
item's own outstanding (`:1281-1284`) — so a **full-gross** allocation against a **part-cash** receipt passes
both walls. The verb is bookkeeper-reachable (`0044:1642-1657`) and the behaviour is **tested green**
(`x37-wave-c-a-subledger.test.mjs:2310-2323`). Worked: an RM1,080 invoice settled by RM1,030 cash + RM50
discount declares the full RM80 rather than RM76.30 — **RM3.70 of service tax on money never received**,
contrary to s.11(1)(a) and to §3.2's own stated intent. §3.3's control cannot catch it: both derivations trace
to the same allocation. **The verifier added the vector that decides the design:** the AR bank-line path
passes a **bank charge** into the same slots (`0044:1927`), and that case is economically *opposite* — the
customer **did** discharge the full amount. Both write one debit leg captioned `'Settlement discount'`
(`0044:1313`), so **spelling is not identity** (review law 3).
**Fold:** `allocation_amount_sen` is defined as the **cash-backed portion**, apportioned from the settlement
entry's own bank and non-cash legs, with the discriminator a **closed per-account treatment**
(`consideration_waived` / `consideration_received_net`) on §3.5's missing-row-is-`unknown` idiom; a missing
row is **`not_evaluable` by name** (`settlement_leg_unclassified`, a new §7.2 wall), never a default in
either direction. **Annex F.1(b)** also closes the §3.2↔§3.7 fork the finding identified: on payment basis
the waived tax was never realised, so the deferred residue is **retired** and a reg-11 CN deducts nothing at
13(a) (§3.7 rule (4), now reached by a stated path); on the invoice-basis and sales arms the tax *was*
declared, so the CN **does** deduct at 13(a) in the note's period. **D-16.** PR-3 carries the treatment
carrier.

**GM-3 · §3.2's netting rule is date-blind and silently restates a furnished return.** *(accounting lens,
CONFIRMED; lineage checked through `0060`.)* v1 defined `allocation_amount_sen` as the column *"net of any
`unallocate` reversing it (`0037:806-817`)"* — and those bytes are the `reverses_allocation_id` **pairing
link**, a purely structural relation. But the producer law is explicit: an `unallocate` carries **its own
`created_at::date`** — *"corrected history is NOT retroactive"* (`0040:771-773`) — while an `allocate`
carries the settlement entry's `posting_date` (`:777-787`). So a May unallocate reduces a Jan–Feb figure
**already furnished and paid**, the treatment §3.7 rule (2) itself forbids in the analogous case. The estate
already has the correct pattern and §3.2 departed from it: `0058:394` date-bounds allocation rows on
`effective_date` for exactly this reason. Reachability is not hypothetical — §5.2 permits re-running a
furnished period, and §2.2's retroactive arm makes late computation first-class, while F-8 closes the
amendment window once payment is made, so the superseding figure is **unfilable**.
**Fold:** the sum is bounded on **`effective_date <= P_end`** (**Annex F.1(c)**), and §3.7 gains the
**late-unallocate router**: unfurnished ⇒ the period recomputes; furnished ⇒ **`post_furnishing_restatement`**
(new §7.2 wall) refuses and files the condition for a human, the vehicle being reg 15 or the amendment
window. *(Wording corrected: an unallocate is not a credit note, so reg 11(2) is its analogy, not its
authority — the defect stands under either.)* **D-16.**

**GM-4 · §3.3's differential control compares two quantities that are not the same fact, so it refuses on
ordinary periods.** *(accounting lens, CONFIRMED — proven once by the design's own adjacent paragraphs and
once at the bytes; two of the finding's five contributors were refuted and the finding still stands.)* The
control was a **bare equality**: the payable account's period movement against §3.2's allocation-derived
figure. But §3.3 states two sentences earlier that the transfer is posted *"by `allocate_receipt` **and by
the belt**"*, while §3.2's sum covers *"every AR allocation settling in the period"* — **so any period in
which the belt sweeps a prior invoice mismatches by construction, in the design's own words.** And at the
bytes a credit note **DEBITS** `sst_output` (`0022:876-884`), reaching the return at **13(a)**, downstream of
item 12 — so the payable movement is a *net* quantity and §3.2's is a *gross* one. A grep of the whole set
for scoping language attached to this check returns nothing. The consequence is §5.4: **any**
`not_evaluable` makes the return non-materialisable, while s.26(5) Act 807 makes furnishing mandatory. It is
load-bearing because A.4 uses precisely this control to justify what the **D1 ceremony buys**. *(Two
contributors refuted — own-use/disposals and bad-debt relief — see §8.)*
**Fold:** both operands are **scoped by name** (**Annex F.4**) — side A reads only the
`sst_output_deferred → sst_output` **transfer legs**, identified by a DB-owned entry marker the two writers
stamp (`journal_entries.flags → 'sst_deferral_transfer'`, the `0044:1300-1303` idiom) and **never by
inferring intent from an account pair**; side B reads §3.2's realised sum **plus** the period's
`sst_deferred_realisation` rows. Everything else reaches the form at its own item, and the refusal is scoped
to the identity, not the return. **D-17.**

**GM-5 · Nothing interlocks the two transfer writers, so the same tax moves twice — and the cross-check
confirms the doubled figure instead of catching it.** *(accounting lens, CONFIRMED; framing corrected.)* The
RULE exists — *"whichever comes first"*, stated twice — so "there is no interlock" overstates; what is
missing is any **mechanism or cell** enforcing it, plus a second specification that contradicts it: A.4 sizes
`allocate_receipt`'s transfer as *"§3.2's `realised_tax`"*, a pure function of the allocation with no
deemed-due term, and §3.2's five-arm table — exactly where an "already deemed due" exclusion belongs — does
not carry one. `sst_deferred_realisation` is minted with **no stated reader** (review law 2). The scenario is
unblocked: an invoice 20% paid at month 6, swept at month 12, paid in full at month 18 has a *genuinely
outstanding* 80%, so no over-allocation guard fires, and `open_item_allocations` is append-only
(`0037:828`). s.11(2) makes the unreceived part due *"on the day following that period of twelve months"* —
**not again on later receipt**. A.3's cells bound the allocation sum alone and cannot see a second writer.
**⚠ The verifier surfaced an adjacent defect with the same root cause, and it changes a ceremony:**
`_settle_from_bank_line_core` calls **`_allocate_receipt_core` directly** (`0044:1927`), bypassing the
`allocate_receipt` wrapper; the census is pinned at `0055:243-244`. **PR-4b CoR'd only the wrapper**, so
bank-line settlements would post **no transfer at all**.
**Fold:** `sst_deferred_realisation` becomes the **per-item interlock ledger** both writers read, each
transferring `least(candidate, invoice_tax_sen − Σ already-realised(item))`, an excess refused by name
(`deferred_double_transfer`) rather than clamped (**Annex F.2**); §3.2 gains a **sixth arm** as its read
side; a **two-direction cell** covers swept-at-12 → paid-at-18. **PR-4b is re-aimed at
`_allocate_receipt_core`, the CORE** — making the F-A3/PR-1b edge a **real byte collision**, not the
"different bodies" v1 recorded (A.4, C-11, C-12, R3). **D-18.**

**GM-6 · The ruled deferred mechanism has no opening-balance path.** *(accounting lens, CONFIRMED; the
finding's causal sentence conflated two branches and the fold splits them.)* The AR opening seed builds
**exactly two legs** — control Dr gross, OBE Cr gross (`0017:3294-3316`, inserted `:3376-3398`) — and copies
the SST trio to `opening_items` as a **memo** (`:3463-3470`). So `sst_output_deferred` opens at **zero** while
the client's AR carries not-yet-due service tax, and those items *are* settled through the very body PR-4b
re-cuts (`_subledger_classify_entry` LADDER 2, `0037:965-987`; proven live at
`x37-0037-upgrade.test.mjs:456`). §3.2 promised to read `sst_portion_cents` for "the brown-field opening
position" and the build sequence carried **no opening-seed row**, no OQ, and no non-goal excluding it — an
un-propagated consequence of the same-day OQ-4 ruling.
**The two branches, stated separately because they fail differently:** read literally, an opening item has no
`sst_output` leg and lands in arm 1 ⇒ should-have-charged fires, no transfer, the SST-02 understates (or the
cross-check refuses — fail-closed); read as §3.2's sentence intends, the transfer fires against an account
never credited, driving `sst_output_deferred` **negative** — a contra-liability on the very balance sheet the
ruling was taken to make auditor-readable — while the SST-02 is *correct*.
**Fold (**Annex F.3**), two additive mechanisms, neither touching the seed's live body:** a **registration-time
opening credit** (Dr `opening_balance_equity` / Cr `sst_output_deferred`, summed from active AR
`opening_items.sst_portion_cents`, idempotent per registration, zero posts nothing), and an
**opening-item `invoice_tax_sen` source** reading the memo the seed already wrote — the only source for that
population, unreachable for any item with an originating sales entry, so law 81 holds. **NULL
`sst_portion_cents` under a covering registration is `not_evaluable` by name** (`opening_sst_unknown`), never
zero. Added to PR-4b's scope. *(Cite drift corrected in the same pass: the survey's §1.4 "exactly one hit, and
it is a test" for `sst_portion_cents` is wrong — `openingPayloads.ts:153` and `openingModel.test.ts:85,95`
carry it too. All are payload writers, so "nothing posts an SST leg from it" survives.)*

**GM-7 · §3.8 routes the reverse-charge liability to a fork the same ruling rejected, so it resolves to
nothing.** *(accounting lens, CONFIRMED; both parties' SQL cite corrected.)* §3.8 read *"the liability is a
separate entry or a return-only line (the OQ-4 shape)"* — while A.4 states *"the return-only arm this annex
previously designed is **rejected**"* and D-7 strikes it. The pointer resolves to the opposite of what §3.8
offers. There is genuinely no posting home in the build: A.4's mechanism is scoped to the **sales** path, and
the PR rows give the reverse charge only PR-6's form work. It is not carried as an OQ, a non-goal or a
fail-closed refusal either — §7.2 gives §3.8 only `form_rate_line_missing`, a form defect. **The disjunction
is resolved silently by omission, which the design's own Annex D routing paragraph forbids.**
*(The wall is real but neither party read it at the tip: `_assert_supplier_bill_shape_at` was re-cut at
`0016:3817` and again at `0036:601`, the live tip; the refusal survives verbatim at `0036:686-693`, protected
by a tail self-proof at `:1696`. The design's own `0015:842` is three generations stale — now **C-14**.
Failure narrative trimmed too: §3.3's control would not "refuse" on a return-only reverse charge, it would
never cover it; the sharper horn is that a "separate entry" crediting `sst_output` makes the payable movement
exceed the allocation sum on **every** period with an imported service — which GM-4's scoping fixes as a side
effect.)*
**Fold:** ruled to the books, the way OQ-4 was ruled — **its own journal entry, flagged
`sst_reverse_charge`, Dr the expense account the service was coded to / Cr `sst_output`**, straight to
payable (s.11(1)(b) has no receipt condition to defer against), and **not a supplier bill**, so `0036`'s wall
is not routed around but simply out of scope. **Annex F.5** carries the shape, the SST-02A arm, and a cell
proving the supplier-bill wall still refuses. **D-20.**

**GM-8 · §2.1 fixes the taxable-period cycle on the FYE with no survey row behind it — in a design whose own
header forbids exactly that.** *(accounting lens, CONFIRMED; re-derived from scratch.)* design.md:51 carried
*"the cycle follows the FYE"* uncited, while every other statutory statement in the same table carries a row
id; a sweep of all four files for FYE / financial year / fiscal year returns **that one line**. The only
surveyed period rule, **S-7**, anchors the cycle elsewhere — off the registration effective date — and
`docs/phase2-research/design-saas.md:157` states the opposite outright: SST taxable periods are *"distinct
from the financial year"*. The rule is **operative, not decorative**: `period_anchor_month` appears exactly
once in the whole set, §2.2's generator cannot run without it, PR-2 builds that generator, and no OQ covers
it — so it is neither provisional nor fail-closed. A wrong anchor shifts **every** boundary and **every** due
date by a month, systematically.
**Fold:** the sentence is **struck**. §2.2 now states three arms — the anchor is a **recorded** fact on §2.1's
opaque-transcription pattern; absent, the generator falls back to **S-7's sourced s.25(1) rule** and stamps
`anchor_source='s25_1_derived'` so the return's `basis` says so; a derived anchor stands with an
`sst_period_anchor_unconfirmed` watch and a correction **supersedes** the series. With no effective date
either, no series is generated (`no_period_anchor`). **Annex A.1a** now carries `sst_registrations`' full
column list, which v1 promised and did not deliver. **D-19.**

**GM-9 · A missing service-performed date makes the return permanently unfileable, and there is no operator
door.** *(accounting lens, CONFIRMED — the repo makes this worse than the finding claimed.)* §3.3 leaves the
new column NULL where the document does not state a period, a NULL is `not_evaluable`, and §5.4 makes **any**
`not_evaluable` non-materialisable — naming "a missing service-period date" explicitly. Three walls close
every exit: **`open_items` is UPDATE/DELETE-blocked by trigger** (`0037:824`), and the estate's own precedent
says so in writing (`0040:5991-5994`: *"open_items is append-only, so a due date can only ever be a birth
fact"*); the only birth path derives every column from the journal entry (`0040:6006-6016`), with no
operator-supplied field; and there is **no fact path to populate it** — the closed facts vocabulary carries
no service period and `myinvois-ubl.mjs` has zero `InvoicePeriod` handling. §6's question path cannot carry
it either: **no new authority path** (law 81). **OQ-5's three options do not reach the fix** — none is "give
the operator a way to supply the date". `opening_items` has no service-date column either
(`0017:1135-1176`), and that is exactly the population with a deferred balance needing the clock.
**Reserved to the owner — OQ-13 (§6).** §3.3 records the collision and **PR-4's ADD COLUMN is gated on the
ruling**: after it lands, every row alive at that moment is permanently stranded. *(Softening checked and
insufficient: §3.3's "switchable per taxpayer" is an off-switch that disables a statutory arm wholesale, and
nothing authorises using it that way.)*

**GM-10 · No evaluator produces the return's VALUE fields, and no rule assigns a figure to a rate bucket.**
*(accounting lens, CONFIRMED; two sub-claims corrected.)* `taxable_value_sen` has **exactly one occurrence in
the repo** — the `sst_return_lines` column list — and no §3 evaluator writes it; the whole family is
tax-side. `scope_key` appears twice and is never given a resolution rule from a transaction to a key, so item
12 = `[11(c)+11(d)+11(e)]` has no derivable inputs. The ledger is single-bucket by construction
(`uq_coa_special` `0003:58`; no rate or classification column on `journal_lines`). And the design **closes
both candidate carriers**: survey R2 forbids promoting the screening classification into a filed number, §5.1
demotes e-invoice lines to a cross-check — while `part2`'s own non-goal says the basis *"stays per-account"*.
It simultaneously forbids and assumes the same chain. *(Corrected: `invoice.tax_breakdown` IS a per-rate DB
fact on the structured path (`0015:589-594`), so the split is unavailable **by design choice**, not by data
impossibility; and hard constraint 2 is **not** breached as written — §8.)*
**Reserved to the owner — OQ-11 (§6).** Recorded in §5.3 and Annex A.2; **PR-6 may not open** until ruled,
because as written **no non-NIL return is materialisable** — not merely the mixed-rate case, but the simplest
single-rate registrant.

**GM-11 · The `unallocated_credit_forbidden` wall is aimed at the wrong mechanism, and the owner question
built on it offers two options that both make things worse.** *(accounting lens, CONFIRMED; lineage checked
through `0055`.)* `apply_open_items` is **not** an aggregate-balance path: it refuses any element lacking
**both** a `source_item_id` and a `target_item_id` (`0037:3251-3259`), requires the source's outstanding
negative and the target's positive (`:3368-3378`), and writes one row per **named** item (`:3384-3389`) — its
own header calls it *"applying a credit note to an invoice"*. **It is therefore the one estate path that
SATISFIES reg 11(3)(j)**, and the only one: the `allocate` path refuses a CN target outright
(`0037:3059-3065`). Meanwhile the **actual gap survives untouched** — `clara.open_items` has no
originating-invoice column at all (`0037:727-746`), and a repo-wide grep returns **zero hits**. The
mischaracterisation propagates into survey V-18, §3.7(3), the §7.2 wall row and **OQ-6**, whose stated
refusal ("a service-tax CN naming no invoice") becomes **unsatisfiable** once the only naming instrument is
shut.
**Reserved to the owner — OQ-12 (§6).** The wall is **NOT BUILT** in v2; §3.7 rule (3) and the §7.2 row both
record it as contested, and the fail-closed position is that a service-tax CN is `not_evaluable` by name.

**GM-12 · The B2B wall needs a fact about the customer that a name-only client's file may not carry — and
the DB guard that enforces the invariant is table-scoped, so the design's natural home routes around it.**
*(security lens, CONFIRMED; an attempted refutation failed.)* Evaluating `b2b_exempt` requires the recipient's
registered status and First-Schedule item — a hard identifier about a counterparty, which **PRD §6 invariant
2(b)** forbids inferring for a name-only client. `clara._tf_counterparty_name_only_guard` is a BEFORE-row
trigger on **`clara.counterparties` alone** (`0062:253-254`, unwidened through the `0102` frontier), so a
builder who put the fact on the new `sst_scope_treatments` row would break the invariant **without tripping
anything**. The asymmetry is verified: the stop-and-escalate discipline appears **exactly once** in the whole
set, scoped to the deferred-SST arm in A.4. *(The refutation attempted — that `sst_scope_treatments` is
account-keyed like `client_turnover_accounts` — failed: no DDL exists to settle it, and five of the eleven
treatment codes are properties of a **specific recipient**.)*
**Fold:** §3.5 and Annex A.7 now carry the discipline as a **design-level closed world rather than a lean on
the trigger** — `sst_scope_treatments` carries **no counterparty identifier column**; `b2b_exempt` on a
name-only client's counterparty is **`not_evaluable`** (`b2b_recipient_unidentifiable`, a new §7.2 wall),
never `taxable` and never `exempt`; and the build **STOPS and escalates** if the arm is ever found to need
the identifier. `0063`'s OWNER-only audited door stays the only lift.

**GM-13 · PR-7's `get_context_pack` change is budgeted against one substring when the function's real
compatibility surface is a ten-marker census and a version literal.** *(build lens, CONFIRMED.)*
`get_context_pack` has had **no `create or replace` since `0016:4262`**; six later migrations patch the live
body by `pg_get_functiondef` → `replace` → `execute` (0017 wiki · 0018 resolution-exclusion · 0019 wiki
boundary · 0036 `msic` · 0055 `entity_type` · 0061 `period_snapshot_registry` **and v4→v5**). The established
idiom — demonstrated three times — probes **every** prior marker before and after, ten in 0061's own
postcheck (`:152-160`), and asserts the insertion anchor appears **exactly once** (`:139-145`). **The live
version is 5, not the 3/4 v1's framing implies**, and `period_snapshot_registry` — the newest key — appears
in **no F-T1 file**. A splice satisfying "the substring survives" can still drop it from every agent read
lane, with nothing in the plan positioned to catch it.
**Fold (**Annex F.7** + the PR-7 row):** the full census, the exactly-once anchor count, the 5→6 bump, and
**the eight standing cells across six files the bump breaks** — two of them (`wb-g-tail.test.mjs:125`,
`delta-context-pack-residual.test.mjs:44`) **source-text** pins a value-level fix will not satisfy. All
re-cut in PR-7, the way PR-1's row already names its own. **D-21**, **R13.** *(The additive key itself is
safe: `PACK_V3_KEYS` is a presence-only must-carry check.)*

**GM-14 · PR-4b names a fallback ceremony window that will not exist when it is needed.** *(build lens,
CONFIRMED; every cite verbatim.)* Both `part2` §8 and Annex A.4 offered *"F-T1's own window **or the
designated overflow slot W3**"*. W3 is a **one-time T0+22h window already fully allocated** to F-A5/PR-1,
F-A9/PR-1B, F-A6/PR-1 and F-A7b/delta (`wave-f-sprint-dag.md:318`); its overflow role is scoped to
**F-A7/alpha+beta on a W2 overrun** (`:378`), not a standing reusable slot; and F-T1's whole build sits under
*"Wave 3 — outside the 48 h by construction"* (`:260`), at **+90 to +200 h** (`:392-401`). An identity check
confirms `wave-f-sprint-dag.md` is the sole document defining a window named W3. **The corroboration that
settles it:** the sibling Track-B design, same plan set, same day, states the correct rule twice — *"Track B
sits outside the current W1-W5 ceremony inventory, so this is a future window, not a slot in the existing
set"* (`tax-computation-design.md:269`, `:483`).
**Fold:** the clause is **struck** in both places; PR-4b takes **its own freshly-scheduled D1 window**, with
the DAG's own lines cited so a coordinator cannot re-derive the false affordance.

**GM-15 · The five new watch kinds never reach a human, because the queue's row arm hard-filters the one old
kind.** *(security lens, CONFIRMED; three evidentiary corrections.)* §6's stated reason for filing to
`compliance_watches` instead of `open_questions` was that *"`list_review_queue` unions"* them. The
row-producing CTE reads `where cw.firm_id=c.firm and cw.watch_kind='sst_registration' and
cw.state<>'resolved'` (`0016:4662`) — the only CTE producing `row_kind='compliance_watch'` — and even
hard-codes the label `'SST registration threshold watch ('||cw.service_group||')'` (`:4658`). **No PR row
plans a CoR of it.** So §7.3's detector on RPR — §9's *"strongest real test"* — is written to a table and
**never appears as a queue row**, while an acceptance cell querying `compliance_watches` directly passes
green. *(Three corrections, none defeating the claim: the finding's "no later generation exists" is **wrong in
the way this codebase warns about** — the body is spliced by 0017/0036/0041/0043 and 0036's header says a
`create or replace` grep cannot see a dynamic patch; the outcome is unchanged because `watch_kind` as a string
appears in no migration but `0016`. `counts.compliance_watches` cannot diverge by kind — §8. And D-12 does
**not** rest on this premise.)*
**Fold (**Annex F.6**, PR-3):** the row predicate widens to the closed SST set, the label becomes
**kind-keyed** (D-11), the separate `compliance.clients` detail array (`0016:4703-4714`, which has no
`watch_kind` predicate and today surfaces new kinds with registration-specific columns populated
meaninglessly) gains `watch_kind` with those members NULL off-registration and its **predicate left open**,
and the re-cut follows the **text-splice** idiom with a full marker census. **The proof is behavioural** —
file a watch on RPR, read it back as a queue ROW. **D-21**, **R13.**

**GM-16 · The threshold table's `effective_to` is read INCLUSIVE everywhere it lands, while its sibling is
specified half-open eight lines away.** *(accounting lens; severity corrected material → nit, kept here
because PR-1 is its first writer.)* Every landed reader of `sst_threshold_schedule` treats `effective_to` as
inclusive (`0016:568-571`, `:618-623`, `:883-886`, `:1075-1080`), no later migration re-cuts them, and A.1's
ALTER leaves the semantics untouched — while §3.1 specifies `sst_rate_schedule` as **half-open**. Both live
seed rows are open, so **the closed branch has never been exercised**: F-T1's supersession is what first
activates it, with no writer convention on record. *(The claimed one-day misprice was refuted — §8.)*
**Fold:** Annex A.1 pins the threshold table's end date as **INCLUSIVE** — the last day the row applies —
with the rate table staying half-open and nothing converting silently between them.

---

## 4 · Nits — folded without argument

**GN-1 · Annex A.1 told the builder to copy a table-grant tail assertion that does not exist.** A.1 cited
*"tail-asserted, the `0011`/`0015` idiom `0016:401` uses"*, but `0016:398-412` is the RLS/owner-policy loop
and says nothing about grants; `0016`'s tail asserts FUNCTION privileges heavily (`:5031-5096`) and carries
**no `has_table_privilege` check for any of its six tables** — they simply have no GRANT statement. The
posture is still fail-closed (FORCE RLS + a lone `clara_fn_owner` policy denies every other role regardless),
so this is a citation defect, not a hole. **Re-pointed at `packages/db/tests/epsilon-grants-phase.mjs:63-70`,
the estate's proven hardening census, which reads `information_schema.table_privileges` POSITIVELY** —
absence read off the wrong instrument is not evidence (review law 2).
**GN-2 · The two SST reference tables' opposite date conventions were never named.** Folded with GM-16 into
Annex A.1.

**GN-3 / GN-4 · Annex A.4 anchored the name-only discipline to "Constraint 12", which `AGENTS.md` records as
VACANT as of the same date the design is dated.** *(Raised independently under the security and law lenses;
one fold.)* It retired on the owner's ADR-0075 ruling and the rule moved to **`docs/product/PRD.md` §6
invariant 2(b)** as a PRODUCT INVARIANT; `0062`/`0063` are untouched and the substance is unchanged.
*(`0062`'s own header still says "AGENTS.md hard constraint 12", which is how the design inherited it.)*
**Re-anchored in A.4**, with the wording ADR-0075 mandates and `wave-f-contract.md`'s F-A3 section already
uses. The invariant is also **broader** than the trigger — it forbids enrichment by inference generally
rather than only writes to `clara.counterparties` — which is the point GM-12 turns on.

**GN-5 · PR-7's schema bump is pinned by eight standing cells the plan never names.** Folded into GM-13's
PR-7 row. *(Held at nit: the estate suite is a mandatory fail-closed CI gate that turns red on PR-7's own run
before merge is possible, and 0061 already made the identical 4→5 transition, leaving version-history
comments in these same files. A short estimate, not a shipped defect.)*

---

## 5 · The two structural consequences

**The design set grew to six files.** Part 1 crossed the repo's 500-line ceiling under the fold, so **§5 (the
SST-02 producer) moved into `sst-engine-design-part2.md`** and the split boundary went from §1-§5 / §6-§12 to
**§1-§4 / §5-§12**; Annex C moved to the new `sst-engine-annexes-2.md` for the same reason. **Section and
annex NUMBERS did not change** — every `§5.x` and `C-n` citation still resolves, only the file it resolves in
moved. ⚠ `docs/plan/index.md` rows 95-98 describe the v1 shape and are **stale until a lane with a wider path
scope trues them**: this lane's diff is `docs/plan/active/**` only.

**PR-1 and PR-4b both changed shape, and neither change is cosmetic.** PR-1 loses the threshold limb until
OQ-14 is ruled, leaving a small greenfield PR with no upstream dependency. PR-4b gains the opening position
and the reverse-charge entry, re-aims its CoR from the `allocate_receipt` **wrapper** to the
**`_allocate_receipt_core`** core, and therefore **collides with F-A3/PR-1b on the same body** — a
composition, ordered behind F-A3 and re-derived by rig replay against merged `main`. Its D1 window is F-T1's
own, freshly scheduled, outside the W1-W5 inventory.

---

## 6 · Owner items

Four cards. **None of them blocks PR-0's closure; each blocks the PR named in its last column**, and the
build proceeds meanwhile on the stated fail-closed default — a refusal or a `not_evaluable`, never a silent
assumption, so a ruling that goes the other way costs a PR and never a wrong number in a client's books.

| # | the question, in one line | recommendation | the fail-closed default the design proceeds on | blocks |
|---|---|---|---|---|
| **OQ-11** | The SST-02's VALUE fields and its 6%-vs-8% rate lines have **no producer** — where does a filed taxable value come from: **(a)** promote the per-account screening classification (survey R2 forbids it today), **(b)** promote the structured `invoice.tax_breakdown` to authoritative where it exists and refuse where it does not (§5.1 demotes it to a cross-check today), or **(c)** mint a per-line service-classification carrier (a current named non-goal)? | **(b)**, narrowed — `tax_breakdown` is a **stated-document** fact of the same class the shape floor already treats as authoritative at `0022:927-930`, and the OCR path's absence of it becomes an honest refusal rather than a guess. (a) promotes a screening estimate into a filed number, which R2 exists to forbid; (c) is a real carrier but a wave of work | **`not_evaluable` for every value field**, which under §5.4 makes **no non-NIL return materialisable** — not just the mixed-rate case, but the simplest single-rate registrant | **PR-6** |
| **OQ-12** | The `unallocated_credit_forbidden` wall closes `apply_open_items`, which is the estate's **named-pair** verb and the only path that satisfies reg 11(3)(j), while the real gap — an AR `credit_note` with no originating-invoice reference — is untouched. Do we **(a)** keep `apply_open_items` OPEN for tax-bearing items and put the wall on CN **creation**, refusing to approve a service-tax-bearing `sales_credit_note` that names no invoice, **(b)** close `apply` as v1 proposed, or **(c)** close it estate-wide (OQ-6's option b)? | **(a)** — it is the inverse of v1's wall and the only option that produces the reg 11(3)(j) evidence. It needs a **new originating-invoice reference column** the design does not currently propose, which is why this is a ruling and not a fold. **OQ-6 is superseded**: both of its options close the compliant path | **the wall is NOT BUILT, and a service-tax CN is `not_evaluable` by name** — no CN reaches 13(a) until ruled, so nothing is mis-deducted | the **PR-4** CN limb |
| **OQ-13** | We have no service-performed date, `open_items` is append-only so the new column is a **birth fact only**, and no fact path or operator verb can supply one — so one legacy invoice makes every SST-02 for that registrant unfileable while the duty to file runs. Do we **(a)** mint an operator door (a new audited verb recording a service period against an item, with its own basis/evidence discipline), **(b)** carry the date on a sibling record rather than on `open_items`, or **(c)** accept the refusal and capture the date only for documents ingested after PR-4? | **(b)** — a sibling `sst_service_periods` record keyed on the open item sidesteps the append-only wall **without** widening a live table's write surface, and it can carry `recorded_by` / `basis` / `basis_kind` the way §2.1's DG-approval trio already does. (a) is the same thing with a heavier blast radius; (c) strands every existing book and `opening_items` besides. **OQ-5 is widened, not replaced** — its (c) advisory estimate still stands on top of whichever door is ruled | **`not_evaluable` by name and the period stops in the open** — never the invoice-date fallback, which recognises the deemed-due event LATE wherever billing lags performance | **PR-4's ADD COLUMN** — after it lands, every row alive at that moment is permanently stranded |
| **OQ-14** | `internet-lane-design.md` (live, v3, same date, gated) assigns the `sst_threshold_schedule` ALTER to **F-A8/PR-3**; this design assigns it to **F-T1/PR-1**. The reversal is corroborated nowhere outside F-T1's own files — `wave-f-contract.md:340` and `PROGRESS.md:135` move only the **rate** table. Which lane authors it, and where is that recorded so both lanes see it? | **F-T1 authors it, recorded as a `wave-f-contract.md` amendment plus a re-cut of `internet-lane-design.md`'s PR-3 row** — F-T1 is the table's only consumer and already owns the sibling rate table, so one lane owning both reference tables is the coherent split. **But the recording is the point**: a ruling that lives only in F-T1's own documents is what produced this collision | **F-T1 does NOT author the ALTER.** PR-1 ships the rate table alone; the threshold widening (NIL CHECK, per-item grain, eleven missing groups) waits, which means `0016`'s watch keeps ignoring eleven service groups until ruled | **PR-1's threshold limb** — and F-A8/PR-3 symmetrically |

**Carried from v1:** OQ-1 (which "DG variations") · OQ-2 (synthetic-only positive path) · OQ-3 (when to split
the dual-registrant control account) · OQ-5 (**widened by OQ-13**) · OQ-6 (**superseded by OQ-12**) · OQ-7
(P.U.(A) 174/2025 unread) · OQ-8 (self-billed e-invoice) · OQ-9 (threshold defects — **now downstream of
OQ-14**) · OQ-10 (who signs off that the reading is current). **OQ-4 remains RULED** (the GL carries the
deferral); four findings above are consequences of that ruling not reaching every section the same day.

---

## 7 · Cross-item sequencing obligations

Stated here because they bind more than one item and no single design can settle them alone.

1. **`_allocate_receipt_core` has TWO claimants in Wave F** — F-A3/PR-1b (the agent arm past
   `is_high_stakes`) and now F-T1/PR-4b (the deferred→payable transfer). F-A3 lands first; **PR-4b re-derives
   the body by rig replay against merged `main` and pins its POST-F-A3 sha**, never the `0044` text. If
   replay shows the two changes cannot compose safely, **F-T1 stops and escalates** rather than re-cutting
   F-A3's arm from this lane. (GM-5 / C-11 / C-12 / R3.)
2. **`sst_threshold_schedule` has two claimants across two tracks** — OQ-14. Until ruled, **neither lane
   authors it**: F-T1's PR-1 has it cut, and F-A8/PR-3 must not merge its limb unmodified on *"unchanged from
   v2"*. The ruling belongs in `wave-f-contract.md`, not in either design.
3. **F-T1's D1 window is a FUTURE window, outside the W1-W5 inventory** — the treatment F-T3 already records.
   W3 is not available to it. (GM-14.)
4. **`_assert_sales_invoice_shape_at` is F-A2's live body and F-T1 CoRs it** (A.4, unchanged by this gate) —
   F-A2's B4-sales tie ships as a **new generation inside F-T1's own migration**, never as an edit to F-A2's
   files.
5. **`list_review_queue` and `get_context_pack` are shared read surfaces patched by four-to-six migrations
   each.** A sibling lane splicing either before PR-3/PR-7 moves F-T1's anchors and lengthens its census.
   **C-15 and C-16 are the tripwires**, replayed at the frontier, never read from text. (D-21 / R13.)

## 8 · Refuted register — recorded so nobody re-raises them

| claim | why it was refuted |
|---|---|
| §3.2's rounding rule loses or gains sen across tranches | The residual-carry rule is correct and A.3's worked example arrives at 2666 for the settling tranche exactly as specified. What was wrong was the **sign** of its input (GM-1), not the rule |
| `sst_taxable_periods` duplicates `reporting_periods` and is TA-P11's second architecture | D-4 holds: an SST period is a statutory content anchor carrying a return, `reporting_periods.grain` admits only `month`/`fiscal_year` (`0057:282`), and the two never compute the same fact |
| D-12 (nothing filed in `open_questions`) depends on `list_review_queue`'s union behaviour, so GB-1 undermines it | D-12 rests only on `_open_question_blocks` (`0012:88`) being a hard posting gate. It cites `list_review_queue` nowhere |
| Own-use/disposals and bad-debt relief break §3.3's differential control | Own-use and disposals are the **sales**-tax arm (s.11(1) Act 806); a payment-basis service registrant has none. Bad-debt relief rides an out-of-return rail (reg 20) and the design nowhere debits `sst_output` for it. GM-4 stands on its other two contributors |
| The threshold/rate date-convention split misprices the 31 Dec 2025 → 1 Jan 2026 rental step | That step lives in `sst_rate_schedule`, which is greenfield and **stated** half-open; the inclusive threshold reader never prices it. The inclusive readers also carry `order by effective_from desc limit 1`, which returns the successor row on a boundary day (GM-16 keeps the narrow residual) |
| "The estate must not carry two range conventions" is newly violated by F-T1 | Already false pre-F-T1: `0043:3246` reads `ea1955_policy` **half-open** against `0016`'s inclusive family. F-T1 introduces the divergence only within its own two sibling tables |
| `counts.compliance_watches` diverges from the queue's row list, so the surface reports N and shows fewer | That count is derived from the **same filtered CTE** that feeds `rows` (`0016:4681` over `all_rows`) and is definitionally locked to it. The real divergence is the separate detail array (GM-15) |
| The design breaches hard constraint 2 by emitting a model-originated rate split | §3's blanket three-valued contract plus §5.4's non-materialisable rule means a builder following the design returns `not_evaluable`, not a fabricated allocation. The defect is a missing producer (OQ-11), not a fabricated number |

## 9 · What the rig replay must confirm

**Nothing in this record was replayed against a live rig** — every byte above was read from migration text at
HEAD, the same limitation R1 records for the design itself, and the first build PR replays each with
`pg_get_functiondef` / `pg_get_constraintdef` at the frontier. **The predictions live in Annex C
(`sst-engine-annexes-2.md`), C-1 … C-16**; the gate added **C-14** (the supplier-bill wall's live tip),
**C-15** (the queue's un-widened filter), **C-16** (the pack at version 5 with ten markers) and re-cut
**C-11 / C-12** (the CoR target is the core, and F-A3 gets there first).

**Two predictions the gate turned into fact, and they must not be re-filed as predictions:** C-4's
threshold-table collision is **current at HEAD** (it is OQ-14, not a risk), and C-9's "no AR-side field
carries a service-performed date" is now **byte-confirmed** — which is what makes GM-9 an owner card rather
than a schema note.
