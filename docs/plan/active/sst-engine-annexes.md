# F-T1 — the SST engine: annexes

> Companion to `sst-engine-design.md` (+ `-part2.md`) and `sst-engine-survey.md`. **Annex A** mechanics ·
> **Annex B** decision register · **Annex C** predictions the rig replay must confirm · **Annex D** the
> owner's questions · **Annex E** change log. Statutory row ids (`S-*` / `V-*` / `F-*` / `U-*` / `M1`)
> resolve in survey §3.

## Annex A · Mechanics

### A.1 · Table DDL posture

Every new table: `firm_id`/`client_id` with the **composite-FK tenant congruence** idiom (`0007:59`), RLS
enabled **and FORCED**, an owner policy so the DEFINER writers reach it, **zero direct app-role grants**
(tail-asserted, the `0011`/`0015` idiom `0016:401` uses), and `_tf_append_only` where the table is history.
Reference tables (`sst_rate_schedule`) carry **no `firm_id`** — Tier-1 facts are firm-independent, the
F-A8 `policy_drafts` finding.

**`sst_threshold_schedule`'s ALTER is ordered, and the order is not cosmetic.** (1) `id uuid not null
default gen_random_uuid()` **plus `unique (id)`** — the self-referencing `superseded_by` FK cannot exist
before a unique target, and the composite PK `(service_group, effective_from)` stays untouched so every
existing reader keeps working. (2) `superseded_by uuid references clara.sst_threshold_schedule(id)
deferrable initially deferred`, `superseded_at`, the paired CHECK `(superseded_by is null) = (superseded_at
is null)`. (3) `recorded_by uuid references clara.users(id)`, `basis`, `basis_kind`, and the governed-origin
conjunct `check (recorded_by is null or (btrim(coalesce(basis,'')) <> '' and basis_kind is not null))`.
**Every new column nullable**, so `0016:247-248`'s two seed rows need no backfill.

**Two defects the same ALTER must repair** (V-6): `threshold_cents bigint not null check
(threshold_cents>0)` **cannot express a NIL threshold**, which Group H item 1 and all three Group M items
have — relax to `>= 0` and let the evaluator treat zero as *"registrable from the first ringgit"*, never as
*"no threshold row"* (the two must stay distinguishable, so a genuinely absent row still refuses by name).
And the PK grain `(service_group, effective_from)` **cannot hold per-ITEM thresholds** — Group H (item 1
Nil vs items 2-4 RM1m) and Group I (items 14-16 RM1.5m vs the group's RM500k) both need them; add
`item_no text not null default '*'` to the PK, `'*'` meaning group-wide, so the existing two rows remain
valid and a per-item row overrides by specificity.

**The standing census `packages/db/tests/a21-watch.test.mjs:98-132` pins those two seed rows'
`effective_to IS NULL`** — it is an estate-suite cell, not a one-time DO block, and any supersession that
closes them fails it. The re-cut ships in the same PR.

### A.2 · The SST-02 / SST-02A field inventory, and the scope-treatment closed set

**Form:** *BORANG SST-02 (AMENDMENT 2025)*, dated 27.8.2025. **Guide:** *Panduan Mengisi Penyata SST-02
(Secara Manual/Pindaan)*, **31 Mei 2026**, BM only, which expressly withdrew the 10 Sept 2025 edition.
**Where the two disagree the guide wins** (F-4).

| part | items | notes for the producer |
|---|---|---|
| **A** | 1 return type · 2 SST registration no. + name · 3 taxable period · 4 due date | one registration number only on the manual form (F-1) |
| **B1** | (5) line no. · (6) description · (7) tariff / service-type code · (8) value of goods sold **incl. debit notes** · (9) own use / disposed / free services · (10) value of taxable services **incl. debit notes** | (8) sales-only, (10) service-only; imported taxable services are declared here **with a special code** (V-10) |
| **B2** | 11(a) goods @5% · 11(b) goods @10% · 11(c) services @6% · 11(d) services @8% · **11(e) `__ UNIT × RM25`** | 11(e) is a **count of cards**, Group H item 1 |
| | **12** total tax payable | *sales* `[11(a)+11(b)] + 17` · *service* `[11(c)+11(d)+11(e)]` — exclusive OR |
| | 13(a) credit-note deduction · 13(b) s.41A sales-tax deduction · 13(c) s.39 STA deduction · **13(d) bad-debt relief** · 13A carried s.41A excess | 13(a) in **the note's period** (reg 11(2)); 13(d) **only after approval**; 13(b)/13A/13(c) **unbuilt in v1** |
| | **14** tax payable before penalty | *sales* `(12) − 13(a) − 13(b) − 13(d) − 13A` · *service* `(12) − 13(a) − 13(c) − 13(d)` |
| | 15 penalty · 16 total | 15 is **CPPS-generated**, emitted `externally_determined`; 16 `not_evaluable` until 15 arrives |
| **C** | 17 Second-Schedule specific rates (per litre · per kg · ad valorem) | sales-only; **feeds item 12**; the printed heading still cites the superseded 2018 order |
| **D** | 18(a) exported / DA-SA · 18(b)(1)-(3) Schedule A person / B manufacturer / C registered manufacturer · **18(c)(1) B2B · 18(c)(2) group relief · 18(c)(3) other** · 18(d) non-taxable services · 18(e) s.35(3)/s.61A | **18(c)'s three sub-lines are why the treatment code is three-way, not boolean** (V-11) |
| **E** | 19-21 Schedule C purchases | sales-only; **unbuilt in v1** |
| **F** | 22-26 declaration under s.89/90 Act 806 or s.74/75 Act 807, incl. consent to electronic service | **human**; the producer fills name/IC/designation/phone only |
| **G** | 27 office use | never populated |

**`sst_scope_treatments.treatment`'s closed set is that Part-D taxonomy**: `taxable` · `export_da_sa` ·
`schedule_a_person` · `schedule_b_manufacturer` · `schedule_c_registered_mfr` · `b2b_exempt` ·
`intra_group_relieved` · `other_s34_exemption` · `non_taxable_service` · `s35_3_or_s61a` · `unknown`.

**SST-02A** (*Service Tax Declaration By Person Other Than Registered Person*): Part A items 1-8, Part B
9-13, Part C 14-18, Part D 19. ⚠ **item 10(a) prints only a 6% line** (F-7). Same `0`-fill NIL rule.
**Monthly**, not two-monthly (V-10).

### A.3 · The apportionment rounding rule, worked

Invoice: net RM1,000.00, service tax 8% = RM80.00, gross RM1,080.00 → `invoice_tax_sen = 8000`,
`invoice_gross_sen = 108000`. Three receipts of RM360.00, RM360.00, RM360.00 (36000 sen each).

`round_half_up(36000 × 8000 / 108000)` = `round_half_up(2666.67)` = **2667** for the first two.
Naive third = 2667, total 8001 — **one sen more tax than was ever charged**. So the rule: the allocation
that **fully settles** the item takes `invoice_tax_sen − Σ(prior realised)` = `8000 − 5334` = **2666**.

**The rig cell proves it in both directions:** (a) full settlement in N tranches ⇒ `Σ realised_tax` equals
`invoice_tax_sen` **exactly**, for N = 1, 2, 3, 7 and for a gross that divides unevenly; (b) partial
settlement ⇒ `Σ realised_tax < invoice_tax_sen` and **never exceeds it**. A cell that only tests (a) is
self-referential — (b) is the differential half.

### A.4 · s.11(2)'s two arms, both designed

**Arm (a), return-only (ships in v1).** `sst_deferred_realisation` rows enter the SST-02 evaluator's sum for
the period containing `service_period_end + 12 months + 1 day`. Nothing moves in the GL. **Named cost:** the
`sst_output` balance stops equalling the tax position, so the balance sheet overstates nothing but explains
nothing either; a reconciliation note is required at close.

**Arm (b), ledger (deferred pending OQ-4).** Adds `special_acc_type='sst_output_deferred'` (live CHECK tip
`0017:673-677`, five values) with an `account_type='liability'` conjunct mirroring
`ck_coa_sst_purchase_cost_expense` (`0016:124-125`); the sales-invoice wall's closed leg world
(`0022:714-930`) admits it; **B4-sales' component tie moves with it** because "tax" then means two legs,
not one (`f-a2-annexes-1-estate.md` Annex I). A clocked belt posts the reclassification —
**first firing DRAFTS** (law 21). **D1**, sharing F-A2's window.

### A.5 · Migration mechanics (the ones that have bitten builders here)

- Files are **`packages/db/migrations/UNNUMBERED_<stem>.sql`**, **underscore-only stems**; the conductor
  claims the number at MERGE. Never name a number in a design or a test.
- **`pnpm db:migrate` SILENTLY SKIPS `UNNUMBERED_*`.** A green migrate is therefore **not** evidence the
  file applied. The rig applies a locally-numbered copy that is never committed.
- Battery gating keys on the **file STEM**, never a number.
- A migration that replaces a live body: **prosrc-SHA prestate pin at the frontier → DROP+CREATE in place →
  a tail self-proof that RAISES on failure**, with every such body listed in the file's §0 quiesce
  inventory. F-T1 predicts exactly one (PR-7's `get_context_pack`).
- Frontier at design time: **97 files, highest `0102_f_a2_statement_activation.sql`.**

### A.6 · Bad-debt relief — reg 19's evidence list

The claim is **Form JKDM No. 2** plus: (a) a copy of the **s.21 invoice**; (b) **the SST-02 and documents
showing the person accounted for and PAID that tax**; (c) records showing the payment was not received;
(d) records showing **all reasonable efforts to recover**; (e) records showing the amount was **written off
in the accounts as bad debt**. Reg 19(2): **retain seven years from the date of the claim.** Reg 19(4): the
DG may disallow on untrue records *or* "any other reasons for the purpose of the protection of revenue" —
so approval is never predictable from the evidence alone, which is why §3.4 gates on the recorded approval
and not on a completeness score. Limb (b) is why the **invoice → return linkage must stay queryable for
years**; limb (d) is why the dunning trail is a first-class artifact.

### A.7 · B2B, group relief, and the areas

**B2B** (P.U.(A) 380/2018, in force 1 Jan 2019; extended to Group J by P.U.(A) 66/2024): the recipient must
be **a registered person**, the provider **a registered taxable person**, and the service must fall in **the
same First-Schedule item**. Group G excluding items 10-11, plus Group I item 8 (advertising), plus Group J.
It is an **exemption from PAYMENT**, so the turnover **still counts toward the registration threshold**.

**Group relief** is a **scope exclusion** in the First Schedule — *"shall not be a taxable service"* — so the
turnover is **excluded** from the threshold. Ownership test: **>50%**, or **20-50% with board-appointment
power**. **The 5% de-minimis** (effective 1 Jan 2020, verified still live): if the value of *that same
service* provided **outside** the group stays within **5% of its total value**, the intra-group supplies
remain non-taxable; breach it and the **intra-group** supplies become taxable — retrospectively.

**⚠ U-1 is unresolved and it sits directly under this annex:** P.U.(A) 174/2025, the *Persons Exempted
(Amendment) Order 2025*, is confirmed to exist by RMCD's own announcement but no lane could reach its text.
It is the likely home of B2B relief for the five 2025 groups. **OQ-7 puts that to the owner.**

**Areas** — the five designated areas are **Labuan, Langkawi, Tioman, Pangkor and Pulau 1**, each defined by
a statutory enumeration of named adjacent islands (Langkawi's is a *relative geographic* test: islands
"lying nearer to Langkawi Island than to the mainland"). Special areas: free zones, licensed warehouses and
LMWs, the JDA, and a s.77B petroleum supply base. Direction rules ss.47-56. **Pulau 1's inversion is
P.U.(A) 370/2024 + 371/2024** and needs its own branch.

### A.8 · Reg 11's ten prescribed particulars

(a) the words *"credit note"* / *"debit note"* prominently · (b) **the note's serial number** — a dedicated
sequence, not a shared document counter · (c) date of issuance · (d) name, address and identification
number of the registered person · (e) **the reason for issuance**, a printed field · (f) a description
sufficient to identify the taxable services · (g) quantity and amount per service · (h) total excluding
service tax · (i) rate and amount of service tax · (j) **the number and date of the invoice issued for the
taxable service**. Reg 11(4): contravention is an offence. **(j) is the wall in §7.2** — a credit against an
aggregate balance cannot satisfy it.

### A.9 · The `statutory_deadlines` seed rows F-T1 contributes

Seven rules, all owned by **F-A4's oracle** (R-L22), columns TBD against F-A4's DDL: **(1)** SST-02 return
**and** payment — last day of the month following the period end (s.26(1)/(4) Act 807; s.26(1)/(5) Act 806).
**(2)** **Varied period → within 30 days** of its end (s.26(2)) — a different rule, not a rounding.
**(3)** **Cessation → within 30 days** (s.26(3) Act 807; s.26(3) Act 806). **(4)** **SST-02A → MONTHLY**, the
last day of the month following the month in which payment was made or the invoice received, whichever is
earlier (s.26A(1)). **(5)** Registration application → last day of the month following the liability month
(s.13(1)). **(6)** **Invoice issuance → within ONE YEAR of the date the service was provided** (s.21(1)),
unless a s.21(1A) approval waives issuance entirely. **(7)** **Holiday roll-forward** — a due date falling on
a Federal weekly or public holiday moves to the next day (Guide V3 ¶18).

---

## Annex B · Decision register

| id | decision | why, and what it cost |
|---|---|---|
| **D-1** | **Registration is a recorded fact, never inferred from turnover.** | `codex-design-debate-sst.md` §C.2; s.18-20 make cessation a DG act. Cost: an unrecorded registration makes the engine silent, so §7.3's detector is the compensating control. |
| **D-2** | **"DG variations" is built on all three readings** (period length · invoice-basis election · Designated Areas). | The contract's phrase is ambiguous and the lanes' evidence points at Designated Areas (V-13). Building all three costs three small models; picking wrong costs a rebuild. **OQ-1.** |
| **D-3** | **The payment-basis anchor is `open_item_allocations`, not a new table.** | Law 9 makes the subledger intrinsic; the allocation grain already carries partial receipts and their reversals (`0037:783-817`). |
| **D-4** | **`sst_taxable_periods` is a NEW object, not a widening of `reporting_periods.grain`.** | An SST period is a statutory *content anchor* carrying a return, not a reporting window; `grain` admits only `month`/`fiscal_year` (`0057:282`). Not a second architecture under TA-P11's test: the two never compute the same fact. |
| **D-5** | **The due date is READ from F-A4's oracle, never computed locally.** | R-L22. Cost: F-T1's PR-2 is blocked on F-A4's DDL, which no PR carried as at 2026-08-23. Accepted over a second oracle. |
| **D-6** | **Dual registration separates at the RETURN layer (shape C); the GL split (shape A) is deferred.** | RMCD requires two returns (F-1), so the model is already right; shape A costs a CoR of F-A2's live wall for a case no client in the estate has. **OQ-3.** |
| **D-7** | **s.11(2) ships return-only in v1; the ledger arm is designed but deferred.** | Hard constraint 1 prefers the ledger; F-A2's body is still moving. **OQ-4 — with the owner.** |
| **D-8** | **The scope-treatment set is derived from SST-02 Part D, not invented.** | A treatment that cannot be declared cannot be recorded — it keeps the classification and return layers on one vocabulary. |
| **D-9** | **Bad-debt relief is approval-gated, with its own claim lifecycle.** | F-6 + reg 19. Cost: a claim cannot be self-served; that is the law, not a limitation. |
| **D-10** | **The rate table carries three rate FORMS and is keyed on the SERVICE DATE.** | V-3's retroactive P.U.(A) 125/2026 makes a "current rate" column produce wrong numbers; per-unit and per-measure rates cannot live in `rate_bp`. |
| **D-11** | **Nothing is keyed on a description string.** | V-19: the gazette says *"complimentary"* and the Regulations *"complementary"* for the same item. Field keys and scope keys are codes; strings are display. |
| **D-12** | **F-T1 files nothing in `open_questions`.** | `_open_question_blocks` (`0012:88`) makes a client-scoped question a hard posting gate; an SST advisory must never stop a client's posting lane. |
| **D-13** | **The SST number lives on `sst_registrations`, not `client_identifiers`.** | It belongs to an episode, not the client; and `client_identifiers.kind` is a conductor-held closed set (`0007:227`). |
| **D-14** | **The ownership reversal is adopted over `internet-lane-design.md`'s text.** | The conductor ruled F-T1 owns both SST reference tables (2026-08-23); F-A8's design §3.1/§7 is stale on the point until it re-cuts. |
| **D-15** | **The design is split across two files.** | The repo enforces a 500-line ceiling per file; `wave-e-design-reporting.md`/`-part2.md` set the precedent in this same directory. |

---

## Annex C · Predictions the rig replay must confirm

**None of these was replayed for this design** — the survey read migration TEXT, and this estate splices
bodies across generations. **The first build PR replays each with `pg_get_functiondef` /
`pg_get_constraintdef` at the frontier and records the `prosrc` sha256 it pins.** The `special_acc_type`
case already proves the class: this design's own first draft cited `0016:123`'s three values when the live
tip is `0017:673-677`'s five.

| # | prediction | how it fails |
|---|---|---|
| **C-1** | `_assert_sales_invoice_shape_at`'s live body is `0022:714-930`, ties at `:867-872`, `:897-900`, `:913-925`, `:927-930`, and its closed leg world is `{receivable, income, sst_output, rounding}`. | A later CoR moved a tie or widened the world; §4/A.4 would then be derived against a superseded body — GM-1's exact defect. |
| **C-2** | `coa_accounts_special_acc_type_check`'s live tip has **five** values (`0017:673-677`). | A later migration widened it again; arm (b)'s ALTER would collide. |
| **C-3** | `compliance_watches.watch_kind` still admits exactly `'sst_registration'` and `service_group` is still `not null`. | A sibling lane widened it first; the merge order in the conductor's ledger decides. |
| **C-4** | `sst_threshold_schedule` still has **no `id`**, a composite PK, `threshold_cents > 0`, and exactly two seed rows both with `effective_to IS NULL`. | F-A8's PR-3 landed the ALTER after all, despite the reversal — then F-T1's ALTER is a no-op or a conflict. |
| **C-5** | `0016:5216-5228`'s assertion is still **granted-only** (it scans `prosrc` of granted functions). | Already trued by F-A8; then F-T1 only extends it to the new table. |
| **C-6** | `get_context_pack`'s live body still emits the literal `sst_registration_watch`, and five migrations still assert it. | If a sixth has been added, PR-7's CoR list is short by one. |
| **C-7** | `open_items` and `open_item_allocations` are still append-only by trigger, and `uq_oia_reverses_once` still forbids a double undo. | PR-4's ADD COLUMN and the allocation arithmetic both assume it. |
| **C-8** | An `apply` allocation can produce a position exceeding the item's `amount_cents`. | If the estate already forbids over-allocation, §3.2's arm is dead code and should be replaced by a cite. |
| **C-9** | No AR-side field anywhere carries a **service-performed date or range**. | If one exists, R10 shrinks from a schema change to a mapping. |
| **C-10** | `client_identifiers.kind` is still `('tin','ssm','bank_account')`. | D-13's rationale would need re-stating if an SST kind has landed. |

---

## Annex D · The owner's questions

**Ten questions, one each, plain-language first.** Every one has options, a recommendation and the cost of
being wrong. None is rhetorical; each is a real fork the build cannot take alone.

**OQ-1 — "DG variations": which one did you mean?**
大白话: 合同里写的 "DG variations" 有三种可能的意思，我们不确定是哪一种。
Options: **(a)** the **taxable-period length** the Director General approves · **(b)** the **invoice-basis
election** the DG approves (s.11(1A)) · **(c)** **Designated Areas** (Labuan, Langkawi, Tioman, Pangkor and
now Pulau 1) · **(d)** all three. **Recommendation: (d)** — build all three; they are separate small models
and each is genuinely required by the law. **Cost of guessing:** the areas model is the largest of the
three (a directional rule plus an island enumeration plus Pulau 1's inversion); if you did not mean it, we
have built something real but unscheduled. If you *did* mean it and we skipped it, Forest City clients are
systematically under-taxed.

**OQ-2 — Is a synthetic-only positive path acceptable for v1?**
大白话: 我们三个真实客户没有一个注册了 SST，所以 SST-02 的"正常填报"这条路只能用假数据测。
Options: **(a)** ship v1 with the positive path proven on **labelled synthetic** data (ADR-048 sanction),
real acceptance limited to the refusals, the NIL path and the should-have-charged detector · **(b)** hold
F-T1 until Wave-G's `CLIENT-SST-1` exists · **(c)** onboard a real SST-registered client now.
**Recommendation: (a)** — the negative and refusal paths are where the money risk is, and they are all
provable on real books today. **Cost:** the first real SST-02 a client files will be the first one the
engine has ever produced against real data; the acceptance record must say so in those words.

**OQ-3 — When do we split the SST control account for a dual registrant?**
大白话: 一个客户同时注册销售税和服务税时，账上只有一个 SST 科目，两种税会混在一起。
Options: **(a)** split now (two COA markers) · **(b)** **refuse** dual registrants by name until a client
needs it · **(c)** never split; separate only on the return. **Recommendation: (b)** — no client in the
estate is registered for either tax, and splitting now means changing a live posting wall that F-A2 is
still moving, for a case nobody has. **Cost:** the day a dual registrant arrives, they wait for a PR with a
write-quiesce window. The refusal is loud, so nobody is mis-declared in the meantime.

**OQ-4 — The twelve-month deferral: books, or return only? *(already with you)***
大白话: 服务税是收到钱才要交；但发票满 12 个月没收到钱，也要交。这笔"提前到期"的税，要不要真的做一笔分录？
Options: **(a)** return-only — it appears on the SST-02, nothing moves in the ledger · **(b)** ledger — a
journal moves it from a deferred account into SST payable. **Recommendation: (b), but deferred** — ship (a)
now so the return is right, and take (b) as its own reviewed migration once F-A2's posting body settles.
**Cost of (a) alone:** the SST liability on the balance sheet stops matching the SST-02, and a reader has to
be told why. **Cost of (b) now:** it changes a live posting wall mid-flight, which is how wrong numbers get
into books.

**OQ-5 — We do not record when a service was performed. May we use the invoice date as a stand-in?**
大白话: 法律说 12 个月从"提供服务那天"算起，不是开发票那天。我们系统里没有"提供服务日期"。
Options: **(a)** refuse to evaluate an invoice with no service date (`not_evaluable`), and capture the date
going forward · **(b)** fall back to the invoice date silently · **(c)** refuse, **and** show an advisory
early warning computed from the invoice date, clearly labelled as an estimate. **Recommendation: (c).**
**Cost:** (b) is the cheapest and the most dangerous — where billing lags performance (construction,
professional retainers) it recognises the deemed-due event *late*, which is a real underpayment with a real
penalty. (a) alone is safe but silent. (c) costs one extra labelled figure.

**OQ-6 — Should unallocated credit notes be closed off everywhere, or only for taxable clients?**
大白话: 服务税的贷记单必须写明冲抵哪一张发票，不能只挂在客户账上。
Options: **(a)** close the "apply against the balance" path **only for service-tax-bearing items** ·
**(b)** close it estate-wide for consistency. **Recommendation: (a)** — the statute only binds tax-bearing
supplies, and (b) removes a legitimate bookkeeping convenience from every client to solve a problem two of
them will ever have. **Cost of (a):** two behaviours in one AR module, which has to be explained in the UI.

**OQ-7 — One exemption order we could not read. Ship on inference, or refuse?**
大白话: 2025 年新增五类服务的 B2B 免税，很可能写在一份我们抓不到的法令 (P.U.(A) 174/2025) 里。
Options: **(a)** ship B2B for the five new groups by analogy to the 2018 order · **(b)** **refuse** B2B for
the five new groups by name until the text is read · **(c)** hold the whole B2B feature.
**Recommendation: (b)** — a refusal is visible and recoverable; a wrong exemption is an under-declaration
the client pays for. **Cost:** a client in construction, rental, healthcare, education or finance who is
genuinely entitled to B2B relief has to claim it manually until we read the order. Getting the text is a
phone call to RMCD, not a project.

**OQ-8 — Imported services also owe a self-billed e-invoice. That work is unscheduled.**
大白话: 从国外买服务，除了要报 SST-02A，LHDN 还要求我们自己开一张"自开发票"，上面要写明服务税。
Options: **(a)** pull self-billed e-invoice generation into F-T1 · **(b)** ship the SST-02A half and record
the e-invoice half as a named open obligation · **(c)** schedule it as its own item.
**Recommendation: (b) now, (c) next** — the two deadlines already align, so building them together later is
cheap; building the whole e-invoice issuance path inside a tax-engine item is scope creep.
**Cost:** between now and then, a client importing services is compliant with RMCD and not with LHDN, and
that gap must be written down where the client's file will show it.

**OQ-9 — The threshold table cannot hold two of the real thresholds. Fix it in this item?**
大白话: 现在的门槛表只有两组数据，而且写死了"门槛必须大于零" —— 但有两类服务是"第一块钱就要注册"。
Options: **(a)** F-T1 widens the table now (per-item grain, allow zero, seed all thirteen groups) ·
**(b)** leave it; the registration watch keeps working on Groups G and I only.
**Recommendation: (a)** — it is a small ALTER on a two-row table, and without it the watch silently ignores
eleven groups, including the five added in 2025. **Cost:** one standing test re-cut, and the watch starts
firing on clients it previously ignored — which is the point, but it will look like a regression on day one.

**OQ-10 — Who signs off that our reading of the law is current?**
大白话: RMCD 的政策几乎每个月都在改，而且他们自己网站的表格是漏的 —— 我们抓到两份在生效、但官网列表里根本没有的法令。
Options: **(a)** a scheduled re-fetch with the agent flagging changes for your one-click approval ·
**(b)** a periodic professional review you do yourself · **(c)** both.
**Recommendation: (c)** — the machine catches the *existence* of a change, you judge its *effect*.
**Cost:** without either, the engine is correct on the day it ships and quietly wrong within months. Two
policy amendments landed in the five weeks before this design; one of them was dated five days before it.

---

## Annex E · Change log

| v | date | change |
|---|---|---|
| v1 | 2026-08-23 | First annexes. Statutory content from the three verification lanes (survey §3); adopts R-L22 and the conductor's `sst_threshold_schedule` ownership reversal. |
