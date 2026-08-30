# F-T1 — the SST engine: annexes 2 of 2 — Annex F, the gate-folded mechanisms

> **Design-normative, not commentary.** Companion to `sst-engine-design.md` (**§1-§4**),
> `sst-engine-design-part2.md` (**§5-§12**), `sst-engine-annexes.md` (**Annex A · B · D · E**) and
> `sst-engine-survey.md`. This file carries **Annex C** (the rig-replay predictions, moved here at the v2
> fold when part 1 crossed the 500-line ceiling — every `C-n` citation still resolves) and **Annex F**, the
> mechanisms the **PR-0 gate** fold specified. The gate itself is `sst-engine-gate-record.md`; statutory row
> ids (`S-*` / `V-*` / `F-*` / `U-*` / `M1`) resolve in survey §3.
>
> **Annex F exists because the gate's findings were not corrections to prose.** Six of them demanded a
> mechanism the design did not have, and hard constraint 2 does not admit a "TBD" on a statutory figure:
> every number below originates in a versioned deterministic evaluator over DB-owned inputs, and every
> unknown falls to a NAMED `not_evaluable`, never a default.

---

## Annex C · Predictions the rig replay must confirm

**None of these was replayed for this design** — the survey read migration TEXT, and this estate splices
bodies across generations. **The first build PR replays each with `pg_get_functiondef` /
`pg_get_constraintdef` at the frontier and records the `prosrc` sha256 it pins.** The `special_acc_type`
case already proves the class: this design's own first draft cited `0016:123`'s three values when the live
tip is `0017:673-678`'s five.

| # | prediction | how it fails |
|---|---|---|
| **C-1** | `_assert_sales_invoice_shape_at`'s live body is `0022:714-930`, ties at `:867-872`, `:897-900`, `:913-925`, `:927-930`, and its closed leg world is `{receivable, income, sst_output, rounding}`. | A later CoR moved a tie or widened the world; §4/A.4 would then be derived against a superseded body — GM-1's exact defect. |
| **C-2** | `coa_accounts_special_acc_type_check`'s live tip has **five** values (`0017:673-677`). | A later migration widened it again; arm (b)'s ALTER would collide. |
| **C-3** | `compliance_watches.watch_kind` still admits exactly `'sst_registration'` and `service_group` is still `not null`. | A sibling lane widened it first; the merge order in the conductor's ledger decides. |
| **C-4** | `sst_threshold_schedule` still has **no `id`**, a composite PK, `threshold_cents > 0`, and exactly two seed rows both with `effective_to IS NULL`. | ⚠ **This prediction named the OQ-14 collision before the gate did**: F-A8's PR-3 lands the ALTER after all — then F-T1's ALTER is a no-op or a conflict. It is now an owner card, not a prediction to check after the fact. |
| **C-5** | `0016:5216-5228`'s assertion is still **granted-only** (it scans `prosrc` of granted functions). | Already trued by F-A8; then F-T1 only extends it to the new table. |
| **C-6** | ~~`get_context_pack`'s live body still emits the literal `sst_registration_watch`, and five migrations still assert it.~~ **SUPERSEDED BY C-16** — the substring was never the surface; the full marker set is. | v1's "if a sixth has been added, PR-7's CoR list is short by one" measured the wrong thing: the list was short by **nine markers and a version**, not by one migration. |
| **C-7** | `open_items` and `open_item_allocations` are still append-only by trigger, and `uq_oia_reverses_once` still forbids a double undo. | PR-4's ADD COLUMN and the allocation arithmetic both assume it. |
| **C-8** | An `apply` allocation can produce a position exceeding the item's `amount_cents`. | If the estate already forbids over-allocation, §3.2's arm is dead code and should be replaced by a cite. |
| **C-9** | No AR-side field anywhere carries a **service-performed date or range**. | If one exists, R10 shrinks from a schema change to a mapping. |
| **C-10** | `client_identifiers.kind` is still `('tin','ssm','bank_account')`. | D-13's rationale would need re-stating if an SST kind has landed. |
| **C-11** | `allocate_receipt`'s live tip is the **wrapper** at `0044:1642` (born `0037:2584`), and `_allocate_receipt_core`'s is `0044:1034`. **PR-4b CoRs the CORE.** | If the generations have moved, the prestate pin is against the wrong bytes. |
| **C-12** | **After F-A3/PR-1b merges**, `_allocate_receipt_core` carries F-A3's agent arm — **the same body PR-4b re-cuts**. | **The core's POST-F-A3 sha is the one PR-4b pins** — replay against merged `main`, never the `0044` text, which is already one to two generations stale for these two bodies. |
| **C-13** | `ck_coa_obe_equity` (`0017:679-681`) and `uq_coa_special` (`0003:58`) are unchanged and need no edit for a sixth `special_acc_type` value. | If either has moved, the extend-only ALTER is no longer additive. |
| **C-14** | **`_assert_supplier_bill_shape_at`'s live tip is `0036:601`** (born `0015`, re-cut `0016:3817`), its `sst_output`-on-a-purchase refusal at `0036:686-693`, protected by `0036`'s own tail self-proof at `:1696`. | v1 cited `0015:842`, three generations stale. §3.8's reverse-charge entry must be proven not to trip this body — and the cell must read the LIVE one. |
| **C-15** | **`list_review_queue`'s row CTE still hard-filters `watch_kind='sst_registration'`** (`0016:4662`) and its label string is still hard-coded (`:4658`); the body is patched in place by 0017/0036/0041/0043 and has had **no `create or replace` since 0016**. | If a sibling lane widened the predicate first, PR-3's splice anchor moves; if a fifth splice landed, the marker census is short. |
| **C-16** | **`get_context_pack`'s live `pack_schema_version` is 5** (`0061:136`), and its live body carries all ten of 0061's postcheck markers (`0061:152-160`), `period_snapshot_registry` included. | If a seventh splice has landed, PR-7's census and its 5→6 bump are both short, and the eight standing test pins move with it. |

---

## Annex F.1 · §3.2's three input conventions

The apportionment `realised_tax = round_half_up(allocation_amount_sen × invoice_tax_sen / invoice_gross_sen)`
is unchanged. What changed is what each name reads. All three are stamped
`input_convention_version` on the output row, beside `evaluator_version`.

### F.1(a) · `invoice_tax_sen` — the BASIS-CORRECT invoice account

```
invoice_tax_sen(item) :=
  Σ legs of the item's originating entry on _sst_invoice_tax_account(registration)
```

`_sst_invoice_tax_account(registration)` resolves from `sst_registrations.accounting_basis`:

| registration | account credited at invoice | why |
|---|---|---|
| service, `accounting_basis='payment'` | **`sst_output_deferred`** | the ruled OQ-4 mechanism (Annex A.4) — the liability is not yet due, so the payable account is untouched until an allocation or the twelve-month day |
| service, `accounting_basis='invoice_issued_approved'` | **`sst_output`** | s.11(1A) crystallises at issuance; the registrant never touches the deferred account (`deferral_scope`) |
| sales (always accrual, s.11(1) Act 806) | **`sst_output`** | §3.6; no deferral exists on this arm |

**Reading `sst_output` unconditionally is empty by construction for the default basis**, and it is empty
*silently*: §3.2's first arm would then read "no output leg on a registered client" and fire §7.3's
should-have-charged detector on **every payment-basis invoice in the book**. So **arm 1 keys on the same
resolver** — the detector's condition in §7.3 carries the identical clause. A registration whose
`accounting_basis` is absent or unrecognised is `not_evaluable` by name, never defaulted to `payment`,
because the default belongs to the *column* (§2.1) and not to the evaluator.

**Tie 5's shape follows from this and is already specified in Annex A.4:** the CoR of
`_assert_sales_invoice_shape_at` (live tip `0022:714-930`, tie 5 at `:926-928`) must accept the stated tax
landing in **either** output account — **not the sum of both**, or a half-transferred invoice ties falsely.

### F.1(b) · `allocation_amount_sen` — negated, cash-backed, date-bounded

**Step 1 — the rows.** The population is the allocation rows whose `item_id` **IS the invoice item**:

```
raw(item, P_end) := Σ oia.amount_cents
                    where oia.item_id = item
                      and oia.effective_date <= P_end
```

Those rows are **negative** by construction — `_subledger_on_approve` writes "THE BALANCED PAIR. -X against
the settled item, +X against the settlement item" (`0037:1248-1257`, and the same signs survive `0040`'s
re-cut of that block at `:6037-6046`); `apply_open_items` mirrors it, `+amt` on the negative source and
`-amt` on the positive target (`0037:3384-3389`). `_subledger_outstanding` = `amount + Σ allocations`
(`0037:874-880`) confirms the direction. The settlement-side rows (`item_id = v_settle`) are **not an
available reading**: one receipt writes N of them into one `application_group` and none can say which invoice
it belongs to.

**Step 2 — the negation.** `positional(item, P_end) := −raw(item, P_end)`. This is the convention, stated
here and versioned; it is never a build-time `abs()`, and it is never inferred from a value's observed sign.

**Step 3 — the cash-backed reduction.** A settlement entry's allocation set may total **more than the cash
received**: `_allocate_receipt_core` computes `v_gross := p_amount_cents + v_disc` (`0044:1073`) and bounds
the set at `v_gross` (`:1117-1120`), while the per-item bound is only the item's own outstanding
(`:1281-1284`). The entry's legs are Dr bank `p_amount_cents` + optionally Dr `p_discount_account` `v_disc` /
Cr control `v_gross` (`0044:1307-1318`). So per settlement entry `E`:

```
cash_fraction(E)     := bank_leg_sen(E) / (bank_leg_sen(E) + non_cash_leg_sen(E))
allocation_amount_sen := round_half_up( positional(item, P_end) × cash_fraction(E) )
```

with the residual carried onto the final allocation of the group exactly as A.3 carries it for tax, so the
apportioned parts sum to the positional total with no sen lost.

⚠ **`cash_fraction` is only correct once the non-cash leg's NATURE is known, and the bytes cannot tell you.**
The AR bank-line path passes a **bank charge** (`v_charge`, `p_charge_account`) into the same two parameters
(`0044:1927`), and the leg it writes carries the caption `'Settlement discount'` **either way** (`0044:1313`).
Two economically opposite facts, one shape — review law 3 exactly. The discriminator is therefore a
**recorded DB fact about the ACCOUNT**, on §3.5's `client_turnover_accounts` idiom (`0016:252-274`):

| treatment | meaning | `allocation_amount_sen` | §3.7 |
|---|---|---|---|
| `consideration_received_net` | the customer discharged the **full** amount; a third party took a cut (bank charge, card MDR) | the **full** positional amount — `cash_fraction` is not applied | nothing; the consideration was received |
| `consideration_waived` | the customer **never paid** the waived part (settlement discount) | reduced by `cash_fraction` | the waived part is a **reduction of consideration**; §3.7's negative arm owns it |
| **missing / `unknown`** | — | **`not_evaluable`, `settlement_leg_unclassified`** | — |

**The §3.7 interlock, stated so the two sections are not silent about each other.** On a **payment-basis**
registrant the waived tax was never realised (no payment received), so it never became due: the item's
residual deferred balance is **retired, not transferred**, and a reg-11 CN raised for the waiver **deducts
nothing at 13(a)** — which is §3.7 rule (4)'s existing sentence ("a CN against an invoice never paid deducts
nothing"), now reached by a stated path. On the **invoice-basis and sales** arms the tax *was* declared at
issuance, so the waiver's CN **does** deduct at 13(a), in the note's period, per reg 11(2). A 13(a) deduction
of tax that §3.2 never declared would be a straight under-declaration; that is the fork v1 left open, and
this table closes it.

### F.1(c) · the `effective_date` bound

`open_item_allocations.effective_date` carries a **producer law** that v1's netting rule ignored
(`0040:771-787`): an `unallocate` takes **its own `created_at::date`** — *"the house reverse-not-delete
precedent — corrected history is NOT retroactive"* — while an `allocate` takes the anchoring settlement
entry's `posting_date`. Netting through the `reverses_allocation_id` pairing link (`0037:806-817`) is a
**structural** relation with no date in it, so it subtracts a reversal *whenever it happened*.

The bound `effective_date <= P_end` in F.1(b) step 1 is the house as-of pattern, used live at
`0058:394`. Its consequence is §3.7's late-unallocate router: the movement lands in the period it actually
occurred, and where that restates a **furnished** return, `post_furnishing_restatement` refuses and files the
condition for a human — reg 15 or the amendment window, which F-8 may already have closed.

**Cell:** allocate in period 1, unallocate in period 3, evaluate period 1 **as-of period 1's end** and again
**after** period 3 exists — the figure must be identical both times. A cell that only evaluates once cannot
see this.

---

## Annex F.2 · The deferral interlock, and the writer census

**The rule was always "whichever comes first" (Annex A.4). This is the mechanism that enforces it.**

**`clara.sst_deferred_realisation` is the per-item ledger of what has already become due** — not a passive
record of belt firings. One row per realisation event: `open_item_id`, `registration_id`, `event_kind`
(`receipt` / `deemed_s11_2`), `realised_sen`, `became_due_on` (the receipt's `effective_date`, or the day
following the twelve months), `taxable_period_id`, `evaluator_version`, and the posting entry's id. Append-only.

```
remaining_deferred(item) := invoice_tax_sen(item) − Σ realised_sen over sst_deferred_realisation(item)
transfer_sen             := least( candidate_sen, remaining_deferred(item) )
```

**Both writers read it before posting, and both write a row after.** The receipt writer's `candidate_sen` is
§3.2's `realised_tax` for the allocation; the belt's is `remaining_deferred(item)` itself. A transfer that
would exceed the remainder is refused by name (`deferred_double_transfer`) rather than clamped silently — a
clamp would hide a real defect in one of the two writers.

**Why the design cannot rely on the two writers simply not overlapping:** an invoice 20% paid at month 6,
swept for the unreceived 80% at month 12, then paid in full at month 18 has a *genuinely outstanding* 80% at
month 18, so no over-allocation guard fires; `open_item_allocations` is append-only (`0037:828`) so the later
receipt always writes a fresh row; and **§3.3's cross-check cannot catch it** — side A is the transfer the
receipt writer just posted and side B is the `realised_tax` that sized it, so both carry the same doubled
figure and the control agrees. Statutorily the doubling is unambiguous: s.11(2) makes the unreceived part due
"on the day following that period of twelve months" (V-4) and does **not** make it due again on later receipt.

**⚠ THE WRITER CENSUS — the transfer lives in the CORE, not the wrapper.** `_settle_from_bank_line_core`
calls `_allocate_receipt_core` **directly** (`0044:1927`), bypassing `allocate_receipt` (`0044:1642`); the
estate pins the census as exactly `{_settle_from_bank_line_core, allocate_payment, allocate_receipt}`
(`0055:243-244`). PR-4b therefore CoRs **`_allocate_receipt_core` (`0044:1034`)** — which is the same body
F-A3/PR-1b re-cuts, so the two compose in one generation, re-derived by **rig replay against merged `main`
after F-A3**, pinning its POST-F-A3 sha (C-11, C-12). A wrapper-only CoR would post no transfer on any
bank-line settlement and no cell in A.3 could see it.

**Cell (two directions, and A.3 cannot substitute for it):** (a) swept at month 12, paid at month 18 ⇒
**exactly one** transfer totalling `invoice_tax_sen`, the belt's row dated at the deemed day and the receipt
posting **zero**; (b) paid in full at month 6 ⇒ one transfer at the receipt, and the month-12 belt pass finds
`remaining_deferred = 0` and posts nothing. Both assert `sst_output_deferred` returns to zero for the item
and never goes negative.

---

## Annex F.3 · The brown-field opening position

**The ruled GL mechanism had no day one.** `opening_items` carries the SST trio
(`sst_portion_cents` / `sst_rate_bp` / `sst_basis`, `0017:1137-1139`, all-or-nothing by
`ck_opening_items_sst` `:1163-1168`), but the opening seed's AR branch builds **exactly two legs** — control
Dr gross and the OBE marker Cr gross (`0017:3294-3316`), inserted at `:3376-3398` — and copies the trio to
`opening_items` as a **memo** (`:3463-3470`). Nothing posts a leg from it. So `sst_output_deferred` opens at
**zero** while the client's AR genuinely carries not-yet-due service tax, and those items *are* settled
through the very body PR-4b re-cuts: `_subledger_classify_entry` turns each opening entry into an ordinary
`open_items` row with `item_kind='opening'` (`0037:965-987`, materialised `:1101-1106`), admitted at either
sign by `ck_open_items_kind_matrix` (`0037:765-769`).

**Two mechanisms, both additive, neither touching the opening seed's live body.**

**(1) The registration-time opening credit.** When an `sst_registrations` episode is recorded for a
payment-basis service registration, a **one-shot deterministic posting** mints the day-one position:

```
opening_deferred_sen(client, registration) :=
  Σ oi.sst_portion_cents
    over clara.opening_items oi
    where oi.item_kind='ar_open_item' and oi.state='active'
      and oi.sst_portion_cents is not null
```

posted **Dr `opening_balance_equity` / Cr `sst_output_deferred`** — the OBE side because that is where the
seed already swallowed the tax, so this reclassifies within the opening position rather than inventing
income. Idempotent per `registration_id` (a unique key on the posting), receipted, and **`0`-valued cases
post nothing** rather than an empty entry. It is a new entry, not an edit to any seeded one, so the
append-only opening machinery is untouched.

**(2) `invoice_tax_sen` for an opening item.** An `item_kind='opening'` AR item has **no entry legs to sum**,
so F.1(a)'s resolver cannot serve it. Its tax is read from the memo the seed already wrote:

```
invoice_tax_sen(opening item)   := opening_items.sst_portion_cents  (via open_items.opening_item_id)
invoice_gross_sen(opening item) := open_items.amount_cents
```

**This is not a second source for an ongoing invoice's tax** (law 81): it is the *only* source for this one
population, and it is unreachable for any item with an originating sales entry.

**Fail-closed:** an opening AR item with **NULL `sst_portion_cents`** under a registration effective on or
before its `item_date` is **`not_evaluable` by name** (`opening_sst_unknown`) — never zero, because the trio
is all-or-nothing and its absence means *unrecorded*, not *no tax*. Where the registration begins **after**
the opening date the item carries no SST obligation and is excluded, not refused.

⚠ **`opening_items` has no service-date column either** (`0017:1135-1176`), so this population is squarely
inside OQ-13: it is precisely the set with a deferred balance needing the twelve-month clock and no date to
run it from.

---

## Annex F.4 · The differential control's two operands

§3.3 states the control; this is what each side sums.

**Side A — `transfer_movement_sen(period)`.** Only the `sst_output_deferred → sst_output` transfer legs,
identified by a **DB-owned marker the two writers stamp** — `journal_entries.flags → 'sst_deferral_transfer'`,
carrying the `open_item_id` and the `event_kind`, on the `settlement_allocation` idiom already live at
`0044:1300-1303`. **Never inferred from an account pair**: an account-pair heuristic would sweep in any other
entry that happened to touch both accounts, and review law 3 says a shape is not an identity.

**Side B — `realised_plus_deemed_sen(period)`.** §3.2's allocation-derived sum for the period **plus** the
`sst_deferred_realisation` rows whose `became_due_on` falls in it. The design already states the liability
model as *"per-receipt plus a deemed-due sweeper"*; side B is that model, and side A is what it posts.

**What is OUT of both sides, and where each reaches the form instead:**

| movement | why it is out | its home |
|---|---|---|
| credit-note debits to `sst_output` | a CN **debits** the payable account (`0022:876-884`), and the return deducts it *downstream of item 12* | item **13(a)**, in the note's period (reg 11(2)) |
| approved bad-debt relief | on an out-of-return rail (reg 20); the refund is an application, not a return movement | item **13(d)**, only after approval |
| the imported-services reverse charge | credits `sst_output` with **no allocation behind it** (Annex F.5) | Part **B1** / SST-02A |
| own use and disposals | the **sales**-tax arm under s.11(1) Act 806; a payment-basis service registrant has none | items **(9)** / **11** |

**The refusal is scoped to the identity, not the return.** `deferral_transfer_mismatch` names *this* conjunct,
so a return with an unrelated defect still reports the right failing conjunct — and a period containing an
ordinary credit note or an ordinary twelve-month sweep **passes**, which under a bare equality it would not,
while s.26(5) Act 807 makes furnishing mandatory regardless.

**Cell:** a period carrying (i) a receipt transfer, (ii) a belt transfer for a different invoice, (iii) a
credit note and (iv) an imported-services charge must **pass** the control and still show (iii) at 13(a) and
(iv) in Part B1. A control that refuses this period is the v1 defect reproduced.

---

## Annex F.5 · The imported-services posting home

**Ruled to the books, the way OQ-4 was ruled** (§3.8). The reverse charge posts its **own** journal entry:

```
Dr  <the expense account the imported service was coded to>   tax_sen
Cr  sst_output                                                tax_sen
flags: { "sst_reverse_charge": { "source_entry_id": …, "trigger": "payment"|"invoice_received" } }
```

**Straight to the payable account, never `sst_output_deferred`** — s.11(1)(b) makes it due at *payment made
or invoice received, whichever is earlier*, with no receipt condition to defer against.

**The supplier-bill wall is not routed around; it is not in scope.** `_assert_supplier_bill_shape_at` refuses
an `sst_output` leg **on a supplier bill** — live tip `0036:686-693`, protected by `0036`'s own tail
self-proof at `:1696` (⚠ v1 cited `0015:842`, three generations stale — C-14 now pins the live body). This is
a separate entry with no supplier-bill classification, so the assertion never runs on it. **The cell proves
both halves**: the reverse-charge entry approves, **and** an attempt to put the same leg on the bill itself
still raises.

**The debit is the tax expensed into cost**, which is the purchase-SST wall's own stated rationale; **no
input credit** (law 17), with V-10's honest grading that the guide never says so affirmatively. The
`sst_purchase_cost` marker is a *cost* leg tied to `invoice.tax_total` and is **not** this.

**Registrant vs non-registrant.** A registrant declares in **Part B1 with a special code**; a non-registrant
files **SST-02A**, monthly (s.26A(1), V-10), on `clara.sst_return_02a` keyed on the client. The posting is
identical for both — a client with no registration still books the liability — which is why §5 cannot key a
return's existence on `sst_registrations`. SST-02A's 6%-only printed line still raises
`form_rate_line_missing` rather than declaring 6% on 8% (F-7).

---

## Annex F.6 · The `list_review_queue` re-cut (PR-3)

⚠ **`list_review_queue` has had no `create or replace` since `0016:4558`.** Its live body is patched in place
by `0017:511-655` (the lint lane, seven active-client joins, the ADR-031 rank), `0036` §C (`:1034-1073`, the
autodraft budget key), `0041` S4.9 (`:5360-5452`, `fa_rows`/`asset_id`) and `0043` S3.8
(`staff_advance_incomplete`) — each a `pg_get_functiondef` → `replace` → `execute` splice. `0036`'s own header
says it outright: *"a 'create (or replace )?function' grep CANNOT SEE a dynamic patch; only reading the patch
does."*

**Three changes, all additive, all in PR-3:**

1. **The row CTE's predicate.** `0016:4662` reads
   `where cw.firm_id=c.firm and cw.watch_kind='sst_registration' and cw.state<>'resolved'` — the only CTE
   producing `row_kind='compliance_watch'` (`:4664-4665`). It widens to the closed SST set
   (`sst_registration` + the five §7.1 kinds).
2. **The row label.** `0016:4658` hard-codes
   `('SST registration threshold watch ('||cw.service_group||')')::text` — wrong for four of the five new
   kinds and unrenderable for a return-due watch, whose `service_group` is meaningless. It becomes
   **kind-keyed** (D-11: codes, never description strings), with `service_group` appended only for the kinds
   that carry one.
3. **The `compliance.clients` detail array** (`0016:4703-4714`) reads the table with **no `watch_kind`
   predicate**, so it already surfaces new kinds — with `confirmed_included_cents`,
   `earliest_crossing_month`, `application_due` and friends populated meaninglessly. It gains `watch_kind` in
   its object and leaves the registration-specific members NULL off-registration. **The predicate stays
   open**: the fix is to tell the reader what it is looking at, not to hide rows.

*(One v1-era claim the gate narrowed rather than confirmed: `counts.compliance_watches` (`0016:4681`) counts
`row_kind='compliance_watch'` over `all_rows`, i.e. over the **same filtered CTE** that feeds `rows` — so the
count and the row list cannot disagree by kind. The only divergence is between those two and (3).)*

**Splice discipline:** prestate census over every prior marker (0017's, 0036's, 0041's, 0043's) → anchor
count asserted **exactly once** → `replace` → `execute` → postcheck re-probing all prior markers **plus** the
new predicate and label. Owner and ACL re-asserted after (`0041:5452`, `0036:1896` are the precedents).

**Cell, behavioural:** file an `sst_should_have_charged` watch on RPR and read it back as a
`row_kind='compliance_watch'` **row** from `list_review_queue`. ⚠ A cell that queries `compliance_watches`
directly passes green while the only human-facing surface stays empty — the wrong-instrument class, and the
reason §7.2 requires walls to be proven by refusal rather than by substring.

---

## Annex F.7 · The `get_context_pack` splice (PR-7)

Same family, sharper. `get_context_pack` was born at `0016:4262` (`pack_schema_version 3`) and has had **no
`create or replace` since**; six later migrations patch the live body — `0017:5009-5011` (v3→v4 + the wiki
block), `0018:444-461` (the resolution-exclusion surgery), `0019:1016-1062` (the wiki boundary),
`0036:1826-1846` (`msic`), `0055:758-786` (`entity_type`), `0061:118-160`
(`period_snapshot_registry` **and v4→v5**).

**The live version is 5, and PR-7 takes it to 6.** v1's framing implied 3/4.

**The idiom, demonstrated three times (0036, 0055, 0061), is a full marker census — not one substring.**
0061's postcheck walks **ten** markers (`:152-160`): `'pack_schema_version',5` · `'period_snapshot_registry'`
· the helper call · `sst_registration_watch` · `'wiki'` · the `bound_scope` strip · `'stale_at',wc.stale_at`
· `'has_stale_sources'` · `'entity_type'` · `'msic'`. Its anchor is asserted to appear **exactly once**
before the replace (`:139-145`), and the insertion goes **immediately before the `'client'` member**
(`:137-148`) — the precedent PR-7's additive key follows.

⚠ **`period_snapshot_registry` is the newest key and appeared in no F-T1 file before this fold.** A splice
that satisfies "the `sst_registration_watch` substring survives" can still clobber or mis-order it, dropping
a hard-shared-surface key from every agent read lane with nothing in the v1 plan positioned to catch it. The
five migrations pinning `sst_registration_watch` (0016, 0017, 0036, 0055, 0061) are the smaller and
already-satisfied half of the surface.

**The version bump breaks eight standing cells in six files, none named in v1** — and two of them are
**source-text** pins that a value-level change will not satisfy:

| cell | kind |
|---|---|
| `packages/db/tests/wave-b/wb-g-tail.test.mjs:125` | **prosrc substring** — `pack.includes("'pack_schema_version',5")` |
| `packages/db/tests/delta-context-pack-residual.test.mjs:44` | **prosrc substring** |
| `packages/db/tests/delta-context-pack-residual.test.mjs:84`, `:98` | value |
| `packages/db/tests/a21-read-surfaces.test.mjs:183` | value |
| `packages/db/tests/rig-events-structure.test.mjs:297` | value |
| `packages/db/tests/wave-b/wb-o-routing.test.mjs:168` | value |
| `packages/db/tests/wave-b/wb-w-pack.test.mjs:47` | value |

All re-cut in PR-7, the way PR-1's row already names `a21-watch.test.mjs:98-132`. There is **no centralised
constant** — `PACK_V3_KEYS` (`wb-helpers.mjs:285-288`) is a presence-only must-carry check and is
version-agnostic, so the additive key itself is safe. The estate has done this exact transition once already
(0061 took the pack 4→5) and left the version history in comments in these same files, so the precedent is
in-repo; the defect v1 carried was one of **scope**, not of difficulty.

---

## Annex G · Fix-round addenda (conductor review, 2026-08-24) — DOC-ONLY, build later

**Two named F-T1 obligations F6 folded into PR-1's own migration comments, recorded here in full
so a later PR does not have to reconstruct them from scratch.** Neither is discharged by PR-1 —
PR-1 seeds no per-item threshold row and builds no evaluator — but both are now MEASURED facts,
not predictions, and both bind whichever PR does the work.

### G.1 · The five frozen 0016 group-grain readers have no successor-body owner yet

**Measured at the rig (fix-round replay, 2026-08-24): exactly five live `clara.*` functions
reference `sst_threshold_schedule`, and every one of them is keyed on `service_group` ALONE —
none filters on `item_no` or `superseded_by`:**

| function | the group-grain read |
|---|---|
| `ack_compliance_watch` | `where s.service_group=w.service_group and s.effective_from<=...` |
| `evaluate_sst_watch` | TWO sites — the current-month lookup and the per-historical-month lookup inside its loop, both `where s.service_group=g and s.effective_from<=...` |
| `evaluate_sst_watches_all` | the `schedule_note` receipt's `string_agg`, keyed on `service_group` with no dedupe (the same query G.2 below names) |
| `record_future_attestation` | `where s.service_group=p_service_group` (existence check only) |
| `set_turnover_classification` | `where s.service_group=p_service_group` (existence check only) |

All five predate the F-T1 ALTER by construction (0016) and were never touched by it — the ALTER
is additive by design (Annex A.1). **The risk is not hypothetical: it was measured directly in
this fix round.** An early draft of PR-1's own battery left a superseded, unbounded, one-cent
threshold row for group G as a test fixture (before F7's rollback-wrapped rewrite), and
`evaluate_sst_watch`'s bare `select ... into` — no `ORDER BY`, no `LIMIT`, no `item_no` or
`superseded_by` filter — silently picked up that row instead of the real RM500,000 row for a
DIFFERENT test in a DIFFERENT file (`a21-watch.test.mjs`'s tier-boundary cell, which went from
`monitored` to `early_warning` on an untouched fixture with no code change of its own). The
symptom disappeared the moment the stray row was removed. **Postgres does not raise an error for
a multi-row `SELECT ... INTO` — it silently keeps the last row the plan visits**, so a second
live row for the same group is a correctness hazard, not merely a lint concern.

**The obligation: before ANY per-item threshold row (`item_no <> '*'`) is ever seeded — the whole
point of the ALTER's V-6 defect-2 repair — these five readers need a successor body that
disambiguates by `item_no`, or they must be proven (not assumed) safe under the per-item shape
first.** No lane currently owns this successor body; it is not scoped into any of F-T1's PR-2
through PR-8 rows as written. Whichever PR first proposes seeding a real per-item row (Group H
item 1's NIL threshold, or Group I items 14-16) must either land the successor body in the SAME
PR or refuse to seed until one exists — the item-grain PK exists; using it safely does not, yet.

### G.2 · The evaluator law: Malaysia has NO default/catch-all service tax on an unprescribed service

Service tax is a **PRESCRIBED-LIST tax**: a supply is taxable only if it falls within a named
First-Schedule group at all (survey S3.2, V-2/V-6's group enumeration). There is no residual
"anything not in the 6% list is taxed at 8%" rule in the statute — `scope_key='general'` in
`clara.sst_rate_schedule` is this estate's own MODELLING CONVENIENCE for "the 8% rate that
applies to a service that IS otherwise prescribed and IS NOT in the reduced-rate First Schedule
bucket," never a statement that every service is taxable by default.

**A live self-correction inside this same migration proves the trap is real, not academic.**
PR-1 v1's own header comment for the `rental_leasing` seed row originally asserted that, before
2026-01-01 (the date item 14 was inserted into the First Schedule), rental/leasing "fell under
scope_key='general' (8%)." That sentence assumes rental/leasing was a prescribed, taxable
service THE WHOLE TIME and merely moved rate buckets — an assumption this seed's own survey
citations do not support and this fix round does not independently verify either way. The row's
source_note was corrected to name the trap rather than repeat the claim (S1.2 of this migration's
own header), but the underlying evaluator-side rule is unbuilt.

**The obligation, stated as a rule a future evaluator must enforce, never as a lookup shortcut:**
before pricing ANY service at `scope_key='general'`, the evaluator confirms — from a real
`sst_scope_treatments` classification (design part-2 S3, `taxable`) or an equivalent scope
determination — that the service is prescribed in SOME First-Schedule group at all. A service
with no scope classification is `not_evaluable` (the estate's standing three-valued discipline,
law 68), never priced at the general rate by default. This binds whichever PR builds the S3.6
sales/service evaluator (F-T1 PR-5 as currently sequenced) and the S3.5 scope evaluator (PR-3) —
neither is scoped to enforce it as written today, and this addendum is the record that it must.

