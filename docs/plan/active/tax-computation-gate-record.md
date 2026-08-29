# F-T3 PR-0 — the gate record

> **The gate ran 2026-08-23** against design **v1.2** — `tax-computation-design.md` +
> `tax-computation-annexes.md` + `tax-computation-survey.md` — as part of the Track-B PR-0 gate over
> six landed design sets. **Five lenses, all fresh-context, all read-only on code:** **live-truth**
> (every DB cite resolved mechanically against the live migration lineage, with a
> `create [or replace] function` sweep for later recuts), **accounting** (the ladder against the Act
> and the estate's own inputs), **security** (tenancy, the agent principal, the wake belt), **law**
> (the harness's own standing rules and the sibling designs' rulings) and **build** (PR order,
> freeze, batteries). **Every finding was then re-attacked by an independent verifier that did not
> raise it**, which re-graded severity and refuted nine.
>
> **Verdict: the severance idea holds and the estate reading is largely excellent, but the ladder's
> two central data paths were both wrong — the P&L source and the loss rungs — and F-T3 had no
> entrance for any of its three agent writes. Eleven blockers and eleven materials bind the build.
> All twenty-two are folded; none was reserved for the owner.**
>
> Counts: **11 blockers · 11 materials · 1 nit CONFIRMED · 9 REFUTED.** F-T3 was the heaviest of the
> six sets.
>
> **The fold is v2**, spread across `tax-computation-design.md` (§1-§7),
> `tax-computation-design-part2.md` (§8-§13), `tax-computation-annexes.md` (D-18..D-26, the re-cut
> predictions, the re-worked ladder) and the new `tax-computation-annexes-2-mechanics.md`. **This file
> is the fold's specification.**
>
> **v1.3 note, 2026-08-29 (the PR-0 replay).** Two claims in this record were re-measured on a
> throwaway rig and are corrected in `tax-computation-annexes-2-mechanics.md` §M0 rather than
> restated here: **GB-1's snapshot-builder citations point at a `finalize_close` body superseded
> TWICE** (`0056` create → `0120` CoR → `0128` CoR), so re-cite to `0128:307` and
> `0128:463`/`:473` — the substance holds at the live body (M0 **D-1**); and **GB-1's "two
> independent catalog confirmations" is really one plus a file comment** —
> `obj_description('clara.close_receipts')` is NULL and the table carries zero column comments, so
> `0056:1503` is a SQL `--` comment, not a catalog `COMMENT ON` (M0 **D-1b**). The finding itself is
> unaffected; the framing was over-claimed. *`0056:1544` (`uq_cr_one_active_close`) and `0056:1554`
> (`_tf_close_receipts_belt`'s live refusal text) DO still resolve and are kept.*

---

## 0 · The ten findings that changed a mechanism

*Moved here from `tax-computation-design.md`'s header at the v1.3 fold. This file is the fold's
specification; that one has a 500-line budget its own header states; and a table restated in two
places drifts in one of them.*

| What was wrong in v1.2 | Where it is fixed |
|---|---|
| The ladder read `closing_position`, which is **balance-sheet-only**; the per-account P&L movement is `snapshot->'pl_rows'`, and the sign rule was never stated | design §3, A.2 (**D-18**) |
| The **two loss deductions were in each other's rung** and the s.44(6) cap sat on the wrong base | design §3 R7/R8 (**D-19**) |
| The **carry-forward inputs did not exist** anywhere in the estate; the ladder deducted zero silently | design §4.2 (**D-19**) |
| `record_client_fact` **cannot carry F-T3's facts** — no valid time, a fail-closed dispatch, CLR04 in a migration — and `tin`/`ssm` already have a governed home | design §4.1 (**D-21, D-22**) |
| A basis period diverging from the sealed fiscal year computed anyway | design §3 R1 (**D-23**) |
| The **human-keyed guarantee was a NOT-NULL check the agent satisfies** | design §2 (**D-24**) |
| **No wake door** for any of the three agent writes | design §3.1 (**D-25**) |
| The disposal value is **not** the accounting proceeds; the FA immutability allowlist excludes the new column; the disposal verb does not write the register row | design §5, mechanics §M3 (**D-7 re-cut, D-26**) |
| The frozen evaluator read tables created in a **later** PR | part 2 §11 |
| Ten new relations with **no tenancy or RLS shape**, and every refusal string missing its `metric_na_reason_versions` row | mechanics §M4, part 2 §9 |

---

## 1 · What was attacked and HELD

- **The severance itself.** Clara writing only a `code`, the DB owning `fraction_bp`, the proposal row
  having no numeric column — attacked from three lenses and unbroken. What failed was one *proof* of
  it (GB-8), not the idea.
- **D-16's one-member collapse.** The measured claim underneath it — `verify_evaluator_freeze()`
  iterates `evaluator_versions` with **no** `deployed` filter and hashes the full
  `pg_get_functiondef` — was re-read at `0059:248` and confirmed. The three-member alternative's
  rejection (the SME predicate becomes a shared fourth frozen body or is inlined three times) also
  held.
- **D-15 / R-L25's developer-seeded law tables** and the deliberate absence of the ICT 40/20 row. The
  posture was attacked as over-strict and held: a rate is a number in a client's books, and a missing
  row refusing by name is the design working.
- **OQ-4 → REFUSE, D-9's transparent-entity refusal, D-13's bind-the-citation-once rule.** Each was
  attacked for being needlessly strict, and each held on the same ground: a plausible default on an
  unproven premise is a fabricated number in a durable artifact.
- **`metric_cells.cell_status`' domain.** P-1's prediction is TRUE at the bytes — `0058:245` reads
  `check(cell_status in('ok','undefined','absent','refused'))`. The gate discharged it early. (It
  also found the obligation P-1 sat next to and missed — see GM-11.)
- **The `_reserve_op` / `_audit` / `_finish_op` receipt discipline and the report-run wiring.** The
  three artifacts ride `report_runs` (`0065:369-401`), which already carries `firm_id`, the composite
  client FK and forced RLS, so the artifacts were never the tenancy problem GM-7 partly framed them
  as.

---

## 2 · Blockers — the build may not start until each is folded

**GB-1 · The ladder sources P&L data from a key that holds no P&L accounts.** *(live-truth +
accounting, indices 0 and 2, both CONFIRMED blocker.)* R1-R3 and §9's untreated-account wall read
`close_receipts.snapshot->'closing_position'`. That key is built at `0056:2285-2292` under an explicit
`where a.account_type in ('asset','liability','equity')` filter, and read **after** the P&L→retained-
earnings closing entry has zeroed every income and expense account, so the `<> 0` filter would exclude
them even without the type filter. Two independent confirmations sit in the DB's own prose: the table
comment at `0056:1503` and the write belt's refusal text at `:1554`, both saying "per balance-sheet
account". Every line the worked ladder needs — depreciation, entertainment, donation, fines, the
disposal gain, the dividend — is by construction absent. Built as written, R2/R3 return nil totals
(understated adjusted income → understated charge on a signed document) or refuse for every client, and
`account_untreated` never fires on an expense account at all. The data was always in the same sealed
receipt under **`snapshot->'pl_rows'`** (`0056:2138-2158`, `:2327`) — a key the v1.2 set never once
cites. **Fold: D-18**, design §3 R1-R3, part 2 §9's census and `treatment_on_non_pl_account`, A.2's
sign rule, cells C4b/C4d, and **P-3 re-cut** (below).

**GB-2 · The two loss deductions are in each other's rung, and the donation cap sits on the wrong
base.** *(accounting, index 3, CONFIRMED blocker.)* v1.2 deducted the current-year adjusted loss at R7
and the brought-forward loss at R8, and struck the s.44(6) cap on an R7 already reduced by the
current-year loss. Under the Act, s.43(2) deducts the brought-forward business loss **from the
aggregate of statutory income from business sources**, floored at that aggregate — the excess carries
forward and does not reach rental or interest income — while s.44(2) deducts the current-year loss from
aggregate income. The two diverge whenever a brought-forward loss exceeds business statutory income and
non-business income exists (understated charge), and the cap diverges whenever a company has both a
loss and a donation (overstated charge). v1.2 also printed **s.44(5F)** as the b/f deduction's
authority; s.44(5F) is the ten-YA **time limit**, and the authority is s.43(2) — a wrong citation and
two wrong numbers on the same signed document, which is the exact error class survey §6.4(a) says the
design exists to make impossible. **Fold: D-19**, design §3's R7/R8 rows and the paragraph under them,
A.3's re-worked R7/R8, cells C10b/C10c.

**GB-3 · The loss-carry inputs have no DB-owned source anywhere.** *(accounting, index 4, CONFIRMED
blocker.)* A repo-wide sweep for `unabsorbed|loss_carr|brought.forward|carry.forward` over every
migration returns two unrelated comments; the live `client_fact_keys` catalog is four rows; and v1.2's
own seven new tables and seven fact keys add none. `tax_thresholds` seeded the ten-year **limit** with
nothing to apply it to. A conforming implementer had to deduct zero, silently, and no refusal string,
no §10 cell and no §13 out-scope caught it. The design's own precedent sits one paragraph away:
`cp204_filings` is human-keyed "because Clara cannot e-file and therefore cannot know. Its absence is a
named `not_evaluable`, never a zero." **Fold: D-19**, design §4.2's `tax_carryforwards` (human-keyed
opening + evaluator carry-out, a **nil assertion distinct from an absent row**),
`losses_brought_forward_unknown`, `loss_relief_rules_unread`, the U5 gate in part 2 §12-§13, cell C10.

**GB-4 · The as-at entity facts are unrepresentable in the specified store.** *(accounting, index 5,
CONFIRMED blocker; index 1 is its material twin from the live-truth lens.)* C2 and C5 need paid-up
capital and foreign holding **at the beginning of the basis period**. `clara.client_facts` carries
`recorded_at` and the supersession pair only (`0055:386-421`), `uq_client_fact_live` (`:422`) admits
exactly one live row per `(client, fact_key)`, and `record_client_fact`'s sole signature (`:499-501`)
has no as-at parameter. A YA2024 computation re-run in 2026 reads 2026's figures and can flip
`eligible ↔ not_eligible` with no change in the books — A.3 prices that flip at RM31,409.50 — and
`resolved_inputs_sha256` then certifies a figure that is not re-derivable. `0057:2129` records that
`client_facts` deliberately carries no staleness trigger because it feeds close **gates**, "not the
presented P&L or balance-sheet figures", and that "if a later pack ever PRESENTS a fact from one of
them … this decision is the thing to revisit". F-T3 is that pack. **Fold: D-21**, design §4.1's
`client_tax_attributes`, cell C7b.

**GB-5 · `record_client_fact`'s validation dispatch refuses all seven new key shapes.** *(accounting,
index 6, CONFIRMED blocker.)* `0055:588-607` implements `enum:%` membership and a hard-coded `msic`
regex and raises `fact_value_invalid` on everything else — the comment at `:580` states the rule:
"the rule dispatch is fail-closed: a key this door cannot validate is refused, never accepted
unvalidated". `:582` additionally requires `jsonb_typeof(p_fact_value) = 'string'`. None of F-T3's
seven is an enum or `msic`, so seeding the keys succeeds and every attempt to record a **value** raises;
the SME predicate is then permanently `sme_facts_missing` and, under OQ-4's REFUSE ruling, the charge
never computes for anyone. `0062:122-133` is a prior lane's prestate tripwire documenting the same
mechanism in so many words, enforced from the live `prosrc`. Every fact key minted since 0055 was
forced into the `enum:` branch, and the two sibling designs writing through this door both note "no
door change". **Fold: D-3 re-cut** — F-T3 mints no `client_fact_keys` and never calls this door.

**GB-6 · A basis period that diverges from the sealed fiscal year computes anyway.** *(accounting,
index 7, CONFIRMED blocker.)* `close_receipts` is one active row per `fiscal_year_id`
(`uq_cr_one_active_close`, `0056:1544`) sealing that whole year's movement, and `clara.fiscal_years`
can hold exactly the >12-month first period and ≠12-month change-of-date period A.1's own table says
are apportioned or split across YAs. `basis_period_undetermined` fires only on **absence**, so a human
asserting an 18-month period passes every wall and R1 pulls a whole fiscal year's profit into one YA
while the co-YA either double-counts the same receipt or returns `close_not_sealed` — v1.2 did not say
which, which is itself the hole. D-1 built the object because "they diverge … precisely where a wrong
period is a wrong return", and then no rung asked. **Fold: D-23**, design §3's R1 wall,
`basis_period_not_coextensive_with_close`, A.1, part 2 §13's scope-out, cell C8.

**GB-7 · The fixed-asset immutability allowlist excludes the new columns, and PR-3 names the wrong
writer.** *(accounting, index 8, CONFIRMED blocker.)* `clara._tf_fixed_assets_immutable_0017()`
(spliced `0041:799-906`) fires `before update or delete … for each row` with no WHEN clause and, for an
approved row, allows exactly `{status, disposed_at, disposal_entry_id, superseded_by_asset_id,
superseded_at, updated_at}` before raising CLR13 `fa_baseline_immutable`. `disposal_value_cents` is in
neither set, so the **first** full disposal in the estate raises and every balancing allowance and
charge in R5 dies with it — a mistake `0041:864-866` records the repo having already made once. Worse
than the finding claimed: `dispose_fixed_asset` (`0041:3643-4009`) contains **no**
`update clara.fixed_assets` at all — it is proposal-shaped, and the register writer is the approve-time
hook `clara._fa_on_approve` (`0041:2227`), whose full path updates at `:2455` and whose partial path
inserts two successors at `:2461-2510`. So the `prosrc` prestate pin and the D1 quiesce window were
both scoped to a body that never touches the table. And `disposed_on` duplicates the existing
`disposed_at` (`0003:169`, read by the depreciation walk at `0041:1384`) — two disposal dates that can
disagree about which YA a balancing adjustment falls in. **Fold: D-7 re-cut + D-26**, mechanics §M3,
part 2 §11's PR-3 row (three bodies), cells C13b/C13c, predictions P-11/P-12.

**GB-8 · Severance property (3) is a NOT-NULL check the machine principal satisfies.** *(security,
index 15, CONFIRMED blocker.)* `CHECK (apportionment_bp IS NULL OR (approved_by IS NOT NULL AND
apportionment_entered_by IS NOT NULL))` is the only mechanism v1.2 named for "an apportionment is
human-keyed or it does not exist". The agent is a real `clara.users` row with a stable uuid
(`0002:195` `is_agent`; `0002:334-335` `agent_user_id()` seeded at `:549-550`), so a row carrying that
uuid in both columns satisfies the CHECK exactly as a human-keyed row does — law 68's "a CASE whose
arms are all NULL-poisoned is an open door drawn as a wall". Cell C2 never attempted the machine
principal; both its arms remove the value. The estate's own idiom for a genuine human-only door is
explicit and unused here: `create_firm` raises `'the agent identity cannot own a firm'` on `is_agent`
(`0004:328`), and `approve_metric_definition` — a near-exact analogue — filters `and not u.is_agent`
out of its eligible-approver count (`0059:85`). **Fold: D-24**, design §2's three mechanisms
(CHECK + `_tf_tax_treatment_human_only` + the `is_agent`-excluding door), cell **C2b**.

**GB-9 · No wake door for any of Clara's three writes.** *(security, index 17, CONFIRMED blocker.)*
The proposal verb, the run wrapper and the `law_review_due` belt are named with no wrapper, no
credential check, no allowlist row, no `wake_kind` and no receipt. `grep -n wake` over the whole design
returns three lines: two prose mentions of F-A4's clock and one cell asserting an **absence** from the
allowlist. Both available outcomes are failures: an EXECUTE grant straight to the agent role is a
second ungoverned entrance (laws 78/81), and a human-shaped verb the agent can never call is the CLR04
defect `0078:124-127` records this repo shipping days earlier. This is a genre outlier, not a shared
omission — `bank-agency-design.md:107`, `close-key-1-design.md:97`,
`f-a2-agentic-posting-design.md:63` and `reporting-agency-design.md:79-114` each carry a §3.1-shaped
section, and `payroll-calendar-design.md:192-206` states the analysis even where nothing new is needed.
§11 commits PR-4 to a cross-model adversarial pass *because* it is "the model's only entrance into a
statutory document" — a commitment undischargeable against an unnamed entrance. **Fold: D-25**, design
§3.1, mechanics §M1 (three wrappers, three cores, the kind analysis, five human doors), cell C16.

**GB-10 · The frozen evaluator reads a table whose DDL lands in a later PR.** *(build, index 20,
CONFIRMED blocker.)* v1.2's ladder put `evaluate_tax_computation_v1` in PR-5 and `cp204_filings` in
PR-6, and R11's 85% floor must read `cp204_filings` from inside the single whole-ladder body — the
member's `(p_client, p_ya)` signature carries no CP204 data in. Postgres does not validate a plpgsql
body's referenced relations at `create function` time, so PR-5's migration applies cleanly and the
**first call** raises `relation "clara.cp204_filings" does not exist`, aborting the whole `setof`
return against §9's own "a rung never raises out of the ladder". `verify_evaluator_freeze()` performs
no execution check and nothing in the repo validates a frozen body's referenced relations
(`0059:248`, read directly). D-16's freeze-on-registration forecloses patching it in PR-6 without a
`_v2` member, which defeats the collapse. **Fold: part 2 §11** — the member becomes the last
DDL-dependent PR (PR-6) with a **closed eighteen-relation census**, `cp204_filings` and
`tax_carryforwards` move to PR-5, and the per-entry override moves forward to PR-4; **D-26**; cell
C15b.

**GB-11 · The seed route for the new keys is a door that cannot execute and does not write that
table.** *(security, index 16 — raised material, folded here because it is the same act GB-5 kills.)*
`record_client_fact` opens on `clara._human_ctx(clara.role_rank('admin'))`, which raises CLR04 without
a JWT (`0004:302-305`), and its only writes are `insert into clara.client_facts` (`0055:624`, `:713`);
it merely SELECTs `client_fact_keys` to validate membership (`:574`). The catalog is populated by a
bare `insert into clara.client_fact_keys` under `set role clara_fn_owner` (`0055:342-370`), and that
pattern repeats verbatim at `0056:1233` and `0062:172` — never through the door. `0062:271-380` shows
what calling the door from inside a migration actually costs: an impersonation dance with an explicit
abort path. So "a migration seed block through `record_client_fact` is the right door" describes two
different acts and neither is the one performed, and the "audited-door property" v1.2 cited as the
safeguard for these keys does not exist for it. **Fold: D-3 re-cut** — the route is gone, and the
collision hazard with F-A3/F-A7/F-A8's seed blocks goes with it (part 2 §12).

---

## 3 · Materials — each folds into v2

| # | Finding | Fold |
|---|---|---|
| **GM-1** *(index 1)* | the as-at gap seen from the live-truth lens — `client_facts` answers "now", the SME test needs "then" | same as GB-4: **D-21**, design §4.1, cell C7b |
| **GM-2** *(index 9)* | **the sign rule was never stated.** `pl_rows.movement_cents` is `debit − credit`, so an income account's movement is **negative** (`0056:2145` has to negate it); a RM3,000 dividend subtracted literally at R3 **increases** adjusted income by RM3,000, and the worked R3 moves by RM17,200. Normalising by `direction` is also wrong — `deduct` sits on expense accounts and `exclude` on income accounts | **A.2**'s `account_type` normalisation, cell **C5b** |
| **GM-3** *(index 10)* | **the disposal value is not the accounting proceeds.** Sch 3 para 62(1) makes it the greater of market value and net proceeds, deemed on a controlled sale (PR 7/2017); `p_proceeds_cents` is a caller-supplied posting input validated only as non-negative. `disposal_proceeds_unavailable` names an absence and cannot catch a substitution. The partial-disposal path splits the row at approve time, so one value/date pair on the pre-split row measures a portion's proceeds against the whole asset's residual | **D-7 re-cut**, mechanics §M3.1/§M3.5, `disposal_value_not_established`, cell C13b |
| **GM-4** *(index 11)* | **SVA over-cap treatment unstated.** The design gives the MV cap to formula precision and leaves this to the build; both readings produce a 20,000 SVA line, so C10 certified either. Its operative source, PR 3/2021, is survey U2 — not fetched | design §5: the excess takes normal IA/AA, **descending `qe_cents`**, whole-asset-only; `sva_annual_cap` **not seeded** until U2 is read; cell C13 gains a discriminating assertion |
| **GM-5** *(index 12)* | **R11's year of assessment was never bound.** §7 said "for the YA" with a `ya-1` floor; A.3 computed YA+1 with the computed year's floor and divisor. An implementer writes `ya = p_ya - 1` and is exactly one year off on a statutory floor | design §7 (`ya_target = p_ya + 1`, floor from `p_ya`, divisor from `ya_target`'s basis period, R12 pinned to `p_ya`), A.3's re-worked R11/R12, cell C14b |
| **GM-6** *(index 13)* | **no input carries a business source**, yet R4-R7 are specified per source, so a two-source client silently collapses and the R6 nil floor is applied once | **D-20**, design §3.2, `business_source_count_unknown` / `multiple_business_sources_unmodelled`, part 2 §13, cell C9 |
| **GM-7** *(index 14, SUSPECT flag — re-scoped)* | tenancy and RLS unstated on the new relations | **§4 below carries the re-derived true scope**; fold is mechanics §M4 |
| **GM-8** *(index 16)* | the seed block's door | folded as **GB-11** |
| **GM-9** *(index 18)* | **`clara.client_identifiers` already stores a client's own TIN and SSM number** (`0007:222-236`, `kind in ('tin','ssm','bank_account')`, audited door `add_client_identifier` at `:1508`, bookkeeper+), is live across a dozen migrations, and `filing-and-interview-design.md:163` treats it as **attribution-authoritative** for exactly those values. The survey's A7 census scoped its search to `clients` + `client_fact_keys` and never looked. Two unlinked stores at two different role floors, on the one number a human transcribes into MyTax | **D-22**, design §4.1 (F-T3 reads it, mints nothing), `entity_identifier_missing`, part 2 §8, cell C18b |
| **GM-10** *(index 19)* | **D-17's "note on framing, checked at the bytes" is stale.** It asserts constraint 12 "has since been trued to read as the generic mechanism" and that citing it "is correct as the harness now words it". `AGENTS.md` was recut 40 minutes after that note was written (`80be514`, "retire hard constraint 12"): the number is **vacant**, the wall moved to `docs/product/PRD.md` §6 invariant 2(b), and the digest records it as law 82 / ADR-0075 §5. Following the note would cite a number the harness itself calls vacant | **D-17's note corrected**; the go-ahead is withdrawn and the cite becomes PRD §6 invariant 2(b) + `0062`/`0063` |
| **GM-11** *(index 21)* | **seven of fourteen refusal strings have no battery cell**, against §9's own "each one a battery cell" — `basis_period_undetermined`, `treatment_unapproved`, `ca_class_unassigned`, `disposal_proceeds_unavailable`, `prior_estimate_unknown`, `mixed_account_needs_split`, `form_version_superseded`. Law 31's shape exactly. **The fold found a second half the gate did not raise:** `0058:261-262` makes `na_reason_version_id` a hard CHECK on every non-`ok` cell, so a string also needs a seeded `metric_na_reason_versions` row or it can be raised but never persisted | part 2 §9's twenty-one-string table with its `cell_status` mapping and the PR-1 seed obligation; mechanics §M6's thirty-five cells; cell **C21**; prediction P-13 |

---

## 4 · GM-7 re-derived — the true tenancy scope

The finding carried a **SUSPECT** flag, and it earned it in two places while being right in a third.

**Where it overstates.** It reads "nine new relations … no `firm_id` … the estate's mandatory shape for
**every** new table". Five of them — `tax_authorities`, `tax_treatment_codes`, `tax_rate_bands`,
`capital_allowance_rates`, `tax_thresholds` — are law and product vocabulary, not tenant data, and the
estate's own precedent for exactly that class is the opposite of the finding's claim:
`metering-design.md:231-234` specifies `clara.llm_price_table` with **no `firm_id` column at all**,
"FORCE RLS with **only** an owner policy — no `clara_authenticated` grant", read through a typed
DEFINER function. The field-pack map is the same class. So is the finding's own §8 citation weak: the
three artifacts ride `report_runs` (`0065:369-397`), which already carries `firm_id uuid not null`, the
composite client FK and forced RLS.

**Where it mis-states the mechanism.** `governedRlsFailures()` (`packages/db/tests/rig-meta.mjs:1080-1115`,
read directly) selects `relname, relrowsecurity, relforcerowsecurity` from `pg_class` and checks those
two booleans for every `clara` base table, exempting only `{schema_migrations, slice1_smoke}` (`:961`).
It inspects **no** column and **no** policy predicate. A missing `firm_id` does not fail it; a missing
`force row level security` does. "There is no `firm_id` column to scope on … fail `governedRlsFailures()`"
conflates the two.

**Where it is right, and it matters most there.** The genuinely client-scoped relations really do carry
`client_id` with zero mention anywhere of `firm_id`, RLS, a policy pair or a composite tenant FK — and
the tenant-congruence half is **invisible to every gate in the estate**, so it was design review's to
catch or nobody's.

**The true list, at v2.** **Seven** client-scoped relations need `firm_id not null` + the composite
client FK + forced RLS + the owner policy + the scoped human read: `tax_account_treatments` ·
`tax_entry_treatments` · `tax_basis_periods` · `ca_asset_years` · `cp204_filings` ·
`client_tax_attributes` · `tax_carryforwards`. (The finding named four; three of the seven —
`tax_entry_treatments`, `client_tax_attributes`, `tax_carryforwards` — did not exist in v1.2's surface
list and are minted by this fold, so four was right for what it read and seven is right for what ships.)
**Six** platform-scoped relations need forced RLS + an owner-only policy and **no** `firm_id`:
`tax_authorities` · `tax_treatment_codes` · `tax_rate_bands` · `capital_allowance_rates` ·
`tax_thresholds` · the field-pack map. Two of the seven need a **second** composite binding:
`tax_account_treatments`/`tax_entry_treatments` to `clara.coa_accounts (account_id, firm_id, client_id)`
— the target `uq_coa_account_id_tenant` exists at `0058:56` ~~and is used by nothing~~ **[v1.3 —
WRONG, and corrected on-rig: read from `pg_constraint.conindid`, THREE live FKs already bind to that
exact index — `account_set_version_members`, `metric_input_snapshot_contributions`,
`metric_input_snapshot_samples`. The unique is therefore NOT droppable and nothing in PR-1..PR-3 may
assume it is; PR-4 adds a FOURTH dependant rather than the first]** — and
`ca_asset_years` to `clara.fixed_assets`, ~~which has **no** such unique (its PK is `id` alone,
`0003:155`), so **PR-3 adds `uq_fa_id_tenant unique (id, firm_id, client_id)`** first~~ **[v1.3 —
also WRONG, HALF-REFUTED at the replay (M0 D-7): `uq_fixed_assets_id_firm_client UNIQUE (id,
firm_id, client_id)` ALREADY exists, the `0003:155` cite is stale by the whole Wave-D/E arc, and
**PR-3 must NOT add `uq_fa_id_tenant`** — it binds to the existing constraint]**. **Fold:
mechanics §M4; prediction P-14. Both halves of this paragraph were source-reads that the rig
refuted; this is the class PR-0's replay exists to catch.**

---

## 5 · The nit — folded without argument

**GN-1 · The two v1.2 files disagree on the same pin.** `tax-computation-design.md` carried the
conductor's correction to `dispose_fixed_asset` at **`0041:3643`** (which is the `create function`
line — confirmed); `tax-computation-annexes.md`'s Annex C row P-6 still read `0041:3644`, which in the
live file is only the parameter continuation. Low practical impact, since PR-0's replay is instructed
to re-derive by `pg_get_functiondef` rather than trust either line, but it is a live checkable
inconsistency inside a set whose own header claims v1.2 trued that exact fact. **Fold: P-6's pin
corrected**, and P-6 now names itself as one of PR-3's **three** prestate pins.

---

## 6 · Owner items — none, and the standing cards are untouched

**F-T3 carried no owner-reserved finding, and the fold created none.** Every one of the twenty-two is a
lane decision made against the Act, the live catalog or the harness's own laws, and each is recorded as
a D-item with its rejected alternative.

**The design's standing open questions stand exactly as v1.2 left them**, unmoved and unanswered by
this fold:

- **OQ-1 — the acceptance oracle** (card D.1). No Form C, no tax computation, no CP204 and no
  fixed-asset register in the corpus; ADR-0075 says none exists or is owed. Recommendation on the
  card is unchanged: **(a)** one hand-worked YA for one company as the golden bar, **(b)** the battery
  plus a review of A.3 for the rest. **The gate sharpened why it matters:** every cell in the battery
  can pass while the bottom line is wrong, and GB-1 and GB-2 are both exactly that — a whole-ladder
  data-source error and a rung-order error, neither of which any wall test would have caught. Two of
  the eleven blockers are the argument for option (a).
- **OQ-7 — whose signature signs a treatment code** (card D.2). Unchanged; recommendation stays a
  named licensed tax agent with the licence reference recorded.
- **OQ-8's governance half — who owns the annual duty to true the law** (card D.3). Unchanged; the
  product half stays granted and designed. The fold **adds to what the belt watches** (Annex E) rather
  than to what the card asks: three deliberately-absent rows — the ICT gazette, `sva_annual_cap` and
  PR 1/2022 — now sit in the same population, so a deliberate absence stays visible instead of
  forgotten.
- **OQ-2** (no fixed-asset population), **OQ-3** (partial official-source access) and **OQ-9** (does the
  confirmed figure post a provision in Wave F) remain lane-open, unchanged.

---

## 7 · Cross-item sequencing obligations

1. **One shared surface is GONE, and the lanes that were coordinating on it should stop.** F-T3 no
   longer mints `client_fact_keys` and never calls `record_client_fact` (GB-5, GB-11), so the
   four-way seed-block collision v1.2 warned F-A3/F-A7/F-A8 about does not exist. **Tell the
   conductor**: this is one fewer merge hazard, not a silent change of plan.
2. **`clara.fixed_assets` is now a three-body, two-alteration surface** (GB-7): `dispose_fixed_asset`,
   `_fa_on_approve` and `_tf_fixed_assets_immutable_0017`, plus `disposal_value_cents` /
   `disposal_value_basis` and `uq_fa_id_tenant`. Any lane touching the FA register in the same window
   must know the allowlist splice is coming, and the splice must re-derive from the live catalog.
3. **The evaluator-freeze roster is unchanged** — F-A5 PR-2 + the C-flip ceremony → F-A8 PR-1 → F-T3,
   with F-A9 **not** a claimant — but F-T3's own claim moved from PR-5 to **PR-6** (GB-10).
4. **PR-3's D1 window is still F-T3's only one**, still separate from F-A4/F-A5's `finalize_close`
   window, and still a *future* window: Track B sits outside the current W1-W5 ceremony inventory.
   What changed is its scope — three bodies, and prestate pins for all three.
5. **Two research gates now sit on the critical path for acceptance, not for authoring**: survey **U5**
   (PR 1/2022) gates R7/R8's set-off arithmetic, and survey **U2** (PR 3/2021) gates `sva_annual_cap`.
   Both fail closed by name, so the build proceeds; the numbers do not.

---

## 8 · Refuted register

**Nine findings were raised and refuted** by the independent verifier that re-attacked each one. **The
gate result carried the refuted COUNT into this lane but not the refuted findings' text**, so this
register cannot enumerate them — a real gap, recorded here rather than papered over, because the point
of a refuted register is that nobody re-raises a settled objection. **If the nine are wanted by name,
they are recoverable from the gate run's own transcript; this lane could not read them.** Nothing in
the fold depends on them: every change above traces to a CONFIRMED finding whose grounds were
re-derived here against the live repo.

---

## 9 · What the rig replay must confirm (this gate's own predictions)

Everything below was read from migration source and is a **prediction about the live catalog** until a
rig replay says otherwise. Annex C carries them as **P-1..P-15**; the five the fold added, and the two
it re-cut, are the ones a discharger should not skim:

1. **P-3, RE-CUT — and its discharge shape changed.** v1.2 predicted `closing_position` was inclusive
   of P&L accounts and would have discharged it by enumerating the pin against `trial_balance_as_of`.
   **That check ticks PASS on the broken design**: after the closing entry, P&L accounts are zero in
   the trial balance too, so the two tie cleanly. The replacement is **differential** — seed a close
   with a non-zero expense account and assert it is present in `pl_rows` and **absent** from
   `closing_position`.
2. **P-5, WITHDRAWN.** It predicted `record_client_fact` "accepts a newly registered key with an as-at
   date". The live 7-argument signature has no such parameter; the prediction is false as written, not
   undischarged. PR-0 records the withdrawal and re-reads the signature, the `jsonb_typeof` CHECK and
   the dispatch's fail-closed ELSE instead.
3. **P-11 — the immutability guard refuses BEFORE it is widened.** Force the `disposal_value_cents`
   UPDATE on a rig-seeded approved asset and read the SQLSTATE (expect CLR13). A guard that has never
   refused anything is a guard that was never asked, and PR-3's whole splice rests on this.
4. **P-12 — which body writes the register row.** Establish by trace or a temporary audit hook that
   `_fa_on_approve`, not `dispose_fixed_asset`, wrote the row versions on both the full and partial
   paths — never by reading either file's text. This is the pin v1.2 got wrong.
5. **P-13 — `metric_cells` refuses a reasonless non-`ok` cell**, and `t_scope_cell_na_reason` refuses a
   cross-firm binding. **Both arms**; a refusal that cannot say NO has a meaningless YES.
6. **P-14 — the two tenant-unique targets.** `pg_get_constraintdef` on `coa_accounts` (expect
   `uq_coa_account_id_tenant`) and on `fixed_assets` (expect **no** `(id, firm_id, client_id)` unique),
   before PR-3 authors `uq_fa_id_tenant`.
7. **P-15 — the wake-kind CHECK families.** `pg_get_constraintdef` on `wake_credentials`, then mint an
   `autodraft` credential with a null `client_id` and confirm it refuses. This is what makes "F-T3
   needs no new wake kind" a measurement rather than a claim.
8. **P-10, unchanged and still F-T3's own to re-measure.** D-16's two load-bearing properties —
   `verify_evaluator_freeze()` covers undeployed rows, and its hash moves on an ACL/owner/`search_path`
   change alone — were reported measured by the conductor. A design that collapsed twelve members to
   one on the strength of them does not hold them on hearsay.
