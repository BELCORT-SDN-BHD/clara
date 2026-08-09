# WAVE E — CAMPAIGN FRAME · THE E-a CLOSE MODEL · THE E-R12 TRIO · **DESIGN SKELETON v1**

> **STATUS: DESIGN, NOT LAW.** `docs/plan/wave-e-contract.md` (E-R1..E-R14, ADR-065) is the law;
> on any conflict the contract wins. Nothing here re-opens a ruling. Rulings are **cited**
> (`E-R2`), never restated at length.
>
> **SIBLINGS (cross-reference by filename, never duplicate):** `wave-e-design-skeleton-part2.md`
> (**this document's own §2.7–§6** — one document, two files, continuous numbering) ·
> `wave-e-design-reporting.md` (E-b algebra/FS/render + E-c authoring) ·
> `wave-e-acceptance-matrix.md` (the falsifiable matrices, minted BEFORE build per E-R9).
>
> **HOW TO READ THE MARKERS.** *(ruled — E-R#)* = fixed by the contract; changing it needs a new
> ADR. *(builder choice)* = a mechanism this document picks, with a one-line rationale; a
> reviewer or builder may adjust it without reopening a ruling.
>
> **EVIDENCE DISCIPLINE.** Every EXISTS claim carries `file:line` from a read taken 2026-08-09.
> Absence is never evidence: where this document says a thing is missing, it names the search that
> failed. A derived state is never evidence: derivations are labelled. **Migration numbers are
> NEVER pre-assigned** — lanes carry letters and claim numbers at MERGE against the then-current
> frontier (`packages/db/README.md:14-30`).

---

## 0. Verification ledger — what the grounding got right, and three corrections

### 0.1 Confirmed by direct read

| Fact | Evidence |
|---|---|
| No period / FY / close table exists anywhere | two targeted greps over all 53 migrations returned zero `create table clara.*(period\|fiscal\|close)*` hits |
| `_correction_period_state` is a constant stub | `0007_document_pipeline.sql:2420-2424` — `select 'no_period_model'::text where exists(...)` |
| `fy_end_month/day` exist, nullable pair, coalesce `(12,31)` + a `fallback` boolean surfaced at every read | `0041_wave_d_a_fa_register.sql:774-779`; read idiom `0041:4244-4245` |
| `fa_control_tie_out` is deferred **by name** to Wave E's close-segment primitive | `0041:4250-4256` (header comment, read verbatim) |
| `fa_register_tie` exists and is **visibility-only, never blocking** | `0041:4257-4399` |
| AR/AP subledger sums exist (`ar_aging`/`ap_aging` over `_aging_core`); **no GL-vs-subledger diff object exists** | `0040_wave_c_c_tieout.sql:3937-3999`, `:4001-4013`; grep for `*_control_tie*`/`tie_out` found no such function |
| The bank-recon triad — immutable receipt + jsonb snapshot + `prior_reconciliation_id` chain + a recompute-and-diff `verify_*` | table `0040:262-335`; transition/no-delete triggers `0040:351`, `:379`; `verify_bank_reconciliation` `0040:4537-4644` splitting a STRICT half (`:4562`) from an informational half |
| `trial_balance_as_of(p_client, p_as_of)` EXISTS — the close's continuity instrument | `0017_wave_b.sql:3572` (whole-book `trial_balance(p_client)` is `0004_governed_fns.sql:730`) |
| The opening machinery is BUILT (Wave B), not a Wave-E invention | `create_opening_seed` `0017:2885` · `draft_opening_item` `0017:3500` · `approve_opening_seed` `0017:3825` · `supersede_opening_item` `0017:4047` · `approve_opening_correction` `0017:4162` · registry table `0017:1076` |
| Role floors raise **CLR04**, not CLR10 | `clara._human_ctx` `0004:299-309` |
| Maker/checker mechanics to mirror | `eligible_checker_count` `0004:81`, used `0004:542`; `self_approval_attestation` column `0003_books_core.sql:118`, lifecycle-column allowlist `0003:370` |
| The agent role holds **zero** write grants | full read of the grant matrix `0004:743-799`; `revoke execute on all functions in schema clara from public` `0004:752-753`; `clara_agent_ro` appears only at `0004:762-764` (four resolvers) and `0004:796-797` (three reads) |
| No firm-configurable capability table exists | `clara.firms` `0002_foundation.sql:199-206` has no settings column; `wake_fn_allowlist` `0002:247-251` is global not firm-scoped |
| CLR block convention (claim the next CONTIGUOUS block, document it) | `0041:48-60`; the family runs CLR01..CLR40 + CLR99, grep-verified — **CLR41 is free** |

### 0.2 CORRECTION 1 — the advisory-lock keyspace has **six** constants in use, not five

The grounding digest reported `203005001..203005005` and advised "pick a sixth". **A sixth is
already taken:** `203005006` is the per-bank-account statement-chain lock, introduced by Wave C-b
and load-bearing in Wave C-c — `0038_wave_c_b_bank.sql:1351` (the lock-order table),
`:1628-1634` (the acquisition), `:8935-8944` (a tail that RAISES if a named writer stops taking
it), and `0040:1576`, `:1648`, `:2086`, `:3262`, `:3427`. A repo-wide scan for `20300[0-9]{4}`
returns exactly `203005001..203005006` plus `203007001` (a deleted key, referenced only in a
post-mortem comment at `0046_wave_7a_sales_lane.sql:2209`).

⇒ **The close lock takes `203005007`** *(builder choice — the next free integer in the observed
namespace; grep-verified unused at design time and re-verified in the migration's own prestate
probe, because "free at design time" is a derived state by merge day).*

### 0.3 CORRECTION 2 — the dormant guard is a **PERMIT-SENTINEL** test, not a closed-period test

The digest states the guard predicate "is already the exact 'is this entry inside a closed/locked
period' test". **It is not.** Read verbatim (all three generations byte-identical):

```sql
if exists(select 1 from clara.filing_correction_items i where i.correction_id=x.id
    and clara._correction_period_state(i.entry_id)<>'no_period_model') then
  raise exception 'correction touches a closed period' using errcode='CLR19';
end if;
```

`<> 'no_period_model'` means: **the literal string `no_period_model` is the PERMIT token, and every
other value REFUSES.** A body that honestly returns `'open'` for an open period would refuse every
wrong-client correction in the estate. This constrains E-R6's activation and is designed around in
§2.9.

**CORRECTION 2b — there is ONE live call site, not three.** `0007:2558-2561`, `0009:2463-2466` and
`0027:262-265` are three *change-of-record generations of the same function*,
`clara.approve_wrong_client_correction`. The live body is the 0027 generation — a harvested
`pg_get_functiondef` text pasted literally at `0027_filings_lock_order.sql:196` (`CREATE OR REPLACE
FUNCTION clara.approve_wrong_client_correction(...)`, uppercase = catalog output). 0007 and 0009
carry historical file text only. The "byte-untouched" claim in §2.9 is therefore a claim about **one
live `prosrc`**, which is what makes it mechanically provable.

### 0.4 CORRECTION 3 — `open_items.item_date` is `NOT NULL`

`0037_wave_c_a_subledger.sql:738` — `item_date date not null` (defaulted to the entry's
posting_date at write, `0037:713`, `:1098-1102`). The unborn-item wall's `i.item_date is not null`
conjunct is therefore defensive, not a live escape hatch — **today**. §3.1 makes re-reading that
NOT NULL a positive build-time obligation, because a wall whose predicate short-circuits on NULL
opens silently if the column is ever relaxed.

---

## 1. Campaign frame — lanes, dependency edges, ceremony

E-R7 rules ONE campaign, no deferral valve, lanes in parallel, acceptance in dependency order.
Lanes carry **letters**; migration numbers are claimed at merge. PR-per-lane; ADR-061's uniform
full ladder on every lane (Law 1: independent review on judgement logic — which is most of E-a).

| Lane | Content | Layer | Depends on | Notes |
|---|---|---|---|---|
| **α** | E-R12 trio: F-1 verify-first · `entity_type` · the MSIC/facts capture door | DB + a `get_context_pack` splice | — | §3. No audited-**writer** body is recut; the only body touched is a SECURITY DEFINER **read**. Early-ride candidate. |
| **β** | Period spine + the close model (gates, receipts, keys, E-R6 activation) | DB | — | §2. The campaign root. |
| **γ** | Month snapshots + staleness assessments | DB | β (idiom + FY context) | §2.11. Split from β purely for review size. |
| **δ** | Metric algebra + catalog + evaluator (`_vN`) | DB | — (acceptance depends on β) | sibling doc |
| **ε** | FS template layers · wording STRUCTURE · claim assessment · sealed-artifact registry | DB | δ | sibling doc. Wording **seeds** wait on the owner's MASB verify (task #43); the **structure** does not block. |
| **ζ** | Render worker package · freeze-lint extension · DR §10 recipe | runtime + CI + ops | ε, δ | sibling doc |
| **η** | E-c ad-hoc authoring lane (runtime tools + approval fns) | runtime + DB | δ, ε | sibling doc |
| **θ** | Minimal surfaces: close plan-as-document · readiness panel · `/reports` | dashboard | β, ε/ζ | §4. Plumbing grade only — ALL UX polish is Wave G (E-R10). |

**Acceptance order (E-R7/E-R9), unchanged:** sandbox battery → BEE FY2025 first real close → RPR
MPERS pack → RS snapshot witness. E-R7's one stated dependency — "statements cannot be accepted
before a close model exists" — is why β precedes every FS acceptance even though δ/ε build in
parallel.

### 1.1 Ceremony proposal

**ONE ceremony for the DB batch (β + γ + δ + ε), 7A-R1 quiesce discipline** — plus a small **early
ride for α**. *(builder choice.)* Rationale, in three measured parts:

1. **α earns the early ride.** Its only body edit is `get_context_pack` (a SECURITY DEFINER read,
   CoR at `0036_wave_c0_deferred_belts.sql:1554-1566`). Rule D1 (`packages/db/README.md:99-118`)
   binds migrations that replace **audited writer** bodies; α replaces none. It discharges an
   ADR-062 debt and lands the three parked codes without waiting on the campaign.
2. **The β/γ batch is INERT ON ARRIVAL — by data, not by a feature flag.** Every new guard keys on
   a `clara.fiscal_years` row, and zero rows exist at deploy; `_correction_period_state`'s new body
   returns the permit sentinel for an entry in no FY (§2.9). The 7A §3.2 open-interval hazard — a
   DB path opening while the deployed runtime still speaks the old contract — **cannot arise**,
   because activation is the first human `open_fiscal_year` call, taken after the runtime deploy is
   positively read. This is the expansion/activation split achieved without a second migration.
3. **D1 still binds the β/γ batch** and the quiesce must span migration-apply → runtime-deploy →
   positive verification, not merely the migration transaction. β installs triggers on
   `clara.journal_entries` / `clara.journal_lines` (§2.5, §2.11) whose effect is caller-agnostic:
   an in-flight PL/pgSQL writer running its pre-migration body will still fire the new trigger.

**Ceremony law carried, not restated:** `--lock-deployed` before rebaseline, positive deploy reads,
`statement_timeout` in-session where a whole-schema lex pass exists (β's tails do scan `pg_proc` —
plan for the recipe), rig-validate on a throwaway `postgres:17`, record every reset per ADR-060.

### 1.2 The refusal-token register (CLR convention)

Convention read from live text: `raise exception '<human sentence naming the remedy>' using
errcode='CLRnn', detail=jsonb_build_object('reason','<snake_case_token>', …)::text`
(`0044_wave_d_b3_af2_composite.sql:1266-1272`). Tests assert **reason tokens + message text, never
bare SQLSTATE** (`0041:59-60`).

Wave E claims the next contiguous block per `0041:48-60`: **CLR41 — the close-gate family**
(grep-verified free). Everything else rides an existing family, and deliberately so:

| Code | Wave-E use | Why not a new code |
|---|---|---|
| **CLR41** *(new)* | `drawer1_identity_failed` · `drawer1_state_unknown` · `drawer2_unattested` · `close_attestation_stale` · `close_segregation_violation` · `close_self_attestation_required` · `reopen_ordering_violation` · `close_not_in_progress` | a gate refusal is a distinct product state ("the close is blocked"), not bad input; the UI must tell them apart |
| **CLR19** | `write_into_closed_period` (§2.5) — and the untouched existing text `'correction touches a closed period'` | CLR19 already owns the period/correction surface; splitting it would halve one lane's error contract |
| **CLR10** | `fy_range_invalid` · `fy_not_contiguous` · `fy_length_reason_required` · `fact_basis_missing` · `fact_key_unknown` · `fact_value_invalid` · `snapshot_range_invalid` | ordinary validation, beside dozens of siblings |
| **CLR11** | `fiscal_year_not_in_firm` · `snapshot_not_in_firm` · `client_not_in_firm` | CLR11 is the scoping/attribution code |
| **CLR04** | `capability_missing` (E-R11 keys ②③) | authorization refusals already live at CLR04 (`_human_ctx`, `0004:302-308`); a capability is an authorization |

---

## 2. E-a — the close model *(lane β, with γ at §2.11)*

### 2.1 The period spine

**`clara.fiscal_years`** — one row per client FY, **DATE RANGES** *(ruled — E-R3)*.

```
id uuid pk · firm_id uuid not null · client_id uuid not null
label text not null                      -- 'FY2025'; display only, never an identity
starts_on date not null · ends_on date not null
ordinal int not null                     -- 1-based, dense per client
prior_fy_id uuid references clara.fiscal_years(id)
status text not null default 'open' check (status in ('open','closing','closed','reopened'))
fy_end_source text not null check (fy_end_source in ('asserted','default_1231'))
length_reason text                       -- required when the span is not 11-13 months
opened_by uuid not null references clara.users(id) · opened_at timestamptz not null default now()
constraint uq_fy_id_firm unique (id, firm_id)          -- the 0007:59 composite-FK idiom
constraint uq_fy_client_ordinal unique (client_id, ordinal)
constraint uq_fy_prior unique (prior_fy_id)            -- one successor per FY
constraint ck_fy_range check (ends_on >= starts_on)
constraint ck_fy_span  check (ends_on < starts_on + interval '18 months')
```

- **Contiguity by construction, not by an exclusion constraint** *(builder choice)* —
  `btree_gist` is not installed anywhere in the schema (grep for `btree_gist`/`exclude using gist`
  returned zero hits), so an `EXCLUDE USING gist` overlap constraint would require a new extension
  in a ceremony. Instead: `prior_fy_id` is UNIQUE, and a `before insert` trigger asserts
  `starts_on = (select ends_on from prior) + 1` (and `prior_fy_id is null` iff `ordinal = 1`).
  Gaps and overlaps are then both impossible, and the invariant is one predicate a reviewer can read.
- **First FY up to 18 months is native** *(ruled — E-R3)*, and short FYs are equally legal (RPR's
  historical FY is **9 months**, E-R9). The DDL therefore encodes only the 18-month ceiling; any
  span outside 11-13 months requires a non-empty `length_reason` — a data-level attestation, not a
  refusal. *(builder choice — Malaysian FY law belongs in effective-dated policy tables, never in a
  DDL CHECK; the ceiling is a structural sanity bound, not a tax fact.)*
- **`fy_end_month/day` propose, they never authorize** *(ruled — E-R3, mechanics adjustable per the
  contract's own "derived implementation notes").* `clara.propose_fiscal_year(p_client, p_starts_on)`
  is a READ returning `{starts_on, ends_on, fy_end:{month,day,fallback}}`, computed with the
  `coalesce(cl.fy_end_month,12) / coalesce(cl.fy_end_day,31)` + `fallback` idiom lifted verbatim
  from `0041:4244-4245`. `open_fiscal_year` takes explicit `starts_on`/`ends_on` and stamps
  `fy_end_source='default_1231'` when the proposal's `fallback` was true and the human accepted it
  unchanged — so a defaulted year-end is never silently readable as an asserted one.
- RLS: forced, firm-scoped, mirroring the standing per-firm policy shape. No agent write grant.

**Writers.**

| Function | Floor | Notes |
|---|---|---|
| `clara.open_fiscal_year(p_client, p_label, p_starts_on, p_ends_on, p_length_reason, p_op_key)` | `role_rank('admin')` *(builder choice — it fixes the statutory period boundary; not a signing act, but above bookkeeper)* | `_reserve_op` → contiguity trigger → `_audit` → `_finish_op` |
| `clara.begin_close(p_fy, p_op_key)` | **key ②** | `open` → `closing`; takes the close lock; opens a `close_runs` row; evaluates all gates |
| `clara.attest_close_exception(p_close_run, p_check_key, p_reason, p_op_key)` | **key ②** | one drawer-2 item, bound to the exact gate-result row |
| `clara.finalize_close(p_fy, p_self_attestation, p_op_key)` | **key ②** | `closing` → `closed`; **re-evaluates every gate in-transaction**; mints the close entry + receipt |
| `clara.abandon_close(p_close_run, p_reason, p_op_key)` | **key ②** | `closing` → `open`; the run is stamped abandoned, never deleted |
| `clara.reopen_fiscal_year(p_fy, p_reason, p_correction_target, p_op_key)` | **key ③** | §2.8 |

Every one follows the universal audited-writer shape: `c := clara._human_ctx(<floor>)` →
`clara._reserve_op(...)` (`0004:46-60`) → work → `clara._audit(...)` (`0004:35-41`) →
`clara._finish_op(...)` (`0004:62-68`).

**Serialization** *(ruled — E-R3/E-R2 drawer 1).* Both `begin_close` and `finalize_close` take
`pg_advisory_xact_lock(203005007, hashtext(p_client::text))` as their first act after the op
reservation, matching the observed idiom (`0009:590`, `0016:1343`, `0038:1634`). Lock-order
position: **after** the op receipt, **before** any `journal_entries` row lock — the same rung order
0038/0040 document (`0038:2105`, `0040:1576`), so no cycle is introduced against the existing
JE-before-advisory writers.

### 2.2 The gate catalog and the run/result/attestation trio

- **`clara.close_gate_checks`** — curated, **code-populated, not firm-configurable** (the
  `wake_fn_allowlist` posture, `0002:247-251`): `check_key pk · drawer int check (drawer in (1,2,3))
  · title · evaluator_fn text · applies_when text`. Drawer assignment is **ruled** (E-R2); this
  table is where the ruling becomes data a reviewer can diff.
- **`clara.close_runs`** — the mutable attempt workspace: `id · firm_id · client_id ·
  fiscal_year_id · state ('in_progress','finalized','abandoned') · started_by · started_at ·
  ended_at`. One `in_progress` run per FY (partial unique index).
- **`clara.close_gate_results`** — **append-only**: `id · close_run_id · check_key · drawer ·
  state ('pass','fail','unknown','error','advisory') · measured jsonb not null · measured_digest
  text not null · evaluated_at`. `measured_digest` = a stable hash of the `measured` payload; it is
  what an attestation binds to.
- **`clara.close_attestations`** — **append-only**: `id · close_run_id · check_key ·
  gate_result_id (FK) · attested_by · reason text not null · attested_at`; unique on
  `(close_run_id, check_key)` where not withdrawn.

**The attestation binds to the exact measured state.** `finalize_close` re-evaluates every check and
refuses `CLR41 close_attestation_stale` if any drawer-2 attestation's `gate_result_id.measured_digest`
differs from the fresh evaluation's digest. This is PRD invariant 8's "an approval is bound to the
exact revision approved" (GAP0-5) applied to a gate. *(builder choice on the mechanism; the
per-item-attested-override requirement is ruled — E-R2.)*

### 2.3 Drawer 1 — the DB-owned identities *(ruled — E-R2: no override, nobody)*

Mapping only (the assignments are the contract's): **AR control = Σ open items · AP control = Σ open
items · the FA register tie including its segment-aware Wave-E rebuild · the bank-reconciliation
IDENTITY · continuity math · the reverse/re-open ordering guard · the serialized close lock.**

**New objects.**

1. **`clara.ar_control_tie(p_client uuid, p_as_of date) returns jsonb`** and its twin
   **`clara.ap_control_tie(...)`**. Neither side exists as a diff object today (§0.1). Shape:
   `{state, gl_cents, subledger_cents, diff_cents, control_accounts[], as_of}` with
   `state ∈ {'tie','mismatch','unknown'}`.
   - The subledger side **calls `clara._aging_core(p_firm, p_client, p_domain, p_as_of)`**
     (`0040:3937-3987`) rather than re-summing `open_items`. Measuring an identity with a second,
     hand-written instrument is how two "correct" numbers disagree; the repo has paid for that
     lesson already (memory: *measure with the instrument production uses*).
   - The GL side resolves the control account **through the same resolver the allocation writers
     use** — the one that raises `control_account_invalid` / `ar_control_not_unique` /
     `ap_control_not_unique` inside `_allocate_receipt_core`/`_allocate_payment_core`
     (`0044:1034-1037`, `:1353-1356`). If that resolver refuses, the tie's state is **`unknown`**,
     never `tie`. A control account that cannot be identified is not a passing tie.
   - GL balance = Σ(debit−credit) over `journal_lines` joined to `journal_entries` where
     `status='approved' and posting_date <= p_as_of` on the resolved control account(s) — the same
     predicate `fa_register_tie` uses (`0041:4257-4399`).
2. **`clara.fa_control_tie_out(p_client uuid, p_fiscal_year_id uuid) returns jsonb`** — the
   segment-aware rebuild the `0041:4250-4256` header defers **by name** to "Wave E's close-segment
   primitive". *(builder choice on shape.)* The **close segment** is defined here as
   `(fy.starts_on, fy.ends_on]` **plus the opening watermark**: movement is measured WITHIN the
   segment on both sides (register movement vs GL movement), and the FY's opening position is taken
   from the prior FY's close receipt rather than re-derived, so an opening restatement counted in
   FY(n) can never be double-counted in FY(n+1) (the F12-1 failure ARCHITECTURE §3.6 names).
   **`fa_register_tie` is NOT modified** — it stays visibility-only and non-blocking per WD-R1; the
   new function is a separate object with a separate posture, and the migration asserts
   `fa_register_tie`'s `prosrc` is unchanged.
3. **`clara.bank_recon_close_state(p_client uuid, p_fiscal_year_id uuid) returns jsonb`** — per bank
   account, locates the latest `status='complete'` `clara.bank_reconciliations` row covering
   `fy.ends_on` and calls **`clara.verify_bank_reconciliation(p_recon)`** (`0040:4537-4644`),
   consuming **only its STRICT half** (`0040:4562`) as the drawer-1 signal. The informational half
   (enumeration drift, per-column straggler drift) is reported to **drawer 3**, exactly as 0040
   already classifies it. Mechanics are reused, not re-implemented.
   - **The drawer-1 / drawer-2 line, stated precisely** because it is the one place the contract's
     own text needs reading twice: a reconciliation that EXISTS and whose strict identity fails or
     cannot be verified is **drawer 1** (a DB-owned arithmetic identity). A bank account with **no**
     completed reconciliation at the FY end, or with unmatched statement lines, is
     **drawer 2** — E-R2 names "unmatched statement lines, missing statements" as the
     evidence-dependent states that live there. Absence of a receipt is not a failed identity; it is
     a missing evidence artifact, and the contract makes that attestable.

**Fail-closed on UNKNOWN and ERROR** *(ruled — E-R2).* Each drawer-1 probe is evaluated inside its
own PL/pgSQL `begin … exception when others then v_state := 'error'` block, so a probe that raises
does not abort the close transaction — it records `error`, and `error` and `unknown` both refuse
with `CLR41 drawer1_state_unknown` exactly as `mismatch` refuses with `CLR41
drawer1_identity_failed`. **A probe that could not be evaluated has not passed.** The probe count is
small and fixed, so the subtransaction cost is bounded.

### 2.4 Drawer 2 — five named checks, per-item attested override *(ruled — E-R2)*

| `check_key` | What it measures | Origin |
|---|---|---|
| `depreciation_through_fy_end` | every enrolled asset's depreciation authority has run through `fy.ends_on` | **WD-R6** — E-R2 rules the advisory **upgrades to default-refuse-attestable, NOT absolute** |
| `closing_stock_present` | a goods-trading client has a closing-stock entry dated in the FY | **WD-R11** completeness |
| `unapproved_drafts_in_period` | `journal_entries.status='draft'` with `posting_date` in the FY | E-R2 |
| `open_bank_recon_items` | unmatched statement lines / missing statements (the evidence-dependent states only — §2.3) | E-R2 |
| `uncoded_documents` | filed documents for the client with no approved entry, dated in the FY | E-R2 / PRD journey-7 |

- `depreciation_through_fy_end` reads the existing authority (`clara.get_depreciation_authority`,
  `0041:4244`) and the register; it does **not** re-derive a cadence. Its first real firing is BEE
  FY2025, and it is the gate that pulls the 11-period catch-up approval through (E-R9).
- `closing_stock_present` applies only when the client is goods-trading. **The applicability test is
  itself a fact question**: `applies_when` reads the client's captured `entity_type`/trade facts via
  lane α's `client_facts` (§3.2). Where the fact is absent the check evaluates **`unknown` →
  drawer-2 refuse-attestable**, never "not applicable" — an unknown trade nature is not evidence of
  a service business.
- Override = `attest_close_exception` writing who/why/when into the receipt permanently (E-R2). A
  drawer-2 attestation **never posts into a closed year** and never substitutes for a drawer-1
  identity (E-R13's own resolution of the same question).

### 2.5 Drawer 3, and the closed-period wall

**Drawer 3** is advisory-only (E-R2): the informational half of `verify_bank_reconciliation`,
`fa_register_tie`'s non-blocking view, snapshot staleness counts, aging concentration. It renders in
the readiness panel and never blocks. DIRECTION §3's a11y floor binds the panel: gate status is
**shape + label, never hue-only, never a raw digit**.

**The closed-period wall — a TRIGGER, not N writer recuts** *(builder choice, and the most
consequential one in this document).* "No writer escapes into the FY mid-close" (E-R2 drawer 1) and
E-R13's "entering the closed year takes the formal reopen path" both require that approved postings
cannot land in a `closing`/`closed` FY.

- **Mechanism:** `clara._tf_period_wall` — a `before insert or update` row trigger on
  `clara.journal_entries` that refuses when the row would be/stay `status='approved'` with a
  `posting_date` inside a FY whose status is `closing` or `closed`, with `errcode='CLR19'`,
  `reason='write_into_closed_period'`. A sibling trigger on `clara.journal_lines` refuses mutation
  of a line whose parent entry sits in such a FY.
- **Why a trigger and not a recut of every writer:** a trigger is caller-agnostic and complete by
  construction. Enumerating writers is provably error-prone in this repo's own history — 0027's CoR
  sweep found a **third** `document_filings` writer that the ledger entry had not named
  (`0027:30-36`), and §7-A's v1 declared a function "never recut" off a truncated grep. An
  enumeration is a review instrument (§2.11 uses it as exactly that); it is not a safe mechanism.
- **The close's own writes:** `finalize_close` sets a transaction-local GUC
  (`set_config('clara.close_run', <close_run_id>, true)`) and the trigger permits a write whose
  posting_date is inside the FY named by that GUC **and** whose transaction holds `203005007` for
  that client. Transaction-local by construction (`is_local=true`), so it cannot leak past commit.
  Precedent for a GUC-scoped one-shot: the C-c completing-recon GUC (PROJECTLOG PART 2, C-c finding
  F-3).
- **Inert on arrival:** with zero `fiscal_years` rows, the trigger's lookup finds nothing and every
  write proceeds. This is what makes §1.1's data-gated activation true.

### 2.6 Continuity math *(ruled — E-R2 drawer 1)*

Computed inside `finalize_close`, under the lock, from DB-owned inputs only — **no numeral crosses
an LLM boundary at any point on this path** (E-R4; the operational law at PRD §4 item 14 governs).

1. **The P&L → retained-earnings roll.** Net result for the FY is read from
   `clara.trial_balance_as_of(p_client, fy.ends_on)` (`0017:3572`) minus the same read at
   `fy.starts_on - 1`, restricted to P&L account types. The **closing entry** debits/credits each
   P&L account to zero and posts the net to the client's retained-earnings account.
   - The closing entry is authored **inside** `finalize_close` using the same in-body shape
     `reverse_entry` uses for its mirror (`0009_coding_floor.sql:1697-1748`): insert entry + lines,
     `clara._assert_balanced(...)`, emit events, `_audit`. It is attributed to the calling human
     (key ②) — never to the agent, which cannot reach the verb at all (§2.10).
   - **Linkage: a third shape is required, and here is why.** `reversal_of`/`reversed_by` is the
     reversal mirror; `auto_reversal_of` (`0042_wave_d_b0_shared_authorities.sql:288-290`) is the
     recurring-adjustment pairing, and `0045:7979-7980` asserts the pair leaves the reversal columns
     unused. A closing entry is neither. It gets **`journal_entries.close_receipt_id`** (nullable
     FK), which also makes the receipt's line set enumerable. *(builder choice, justified against
     the two existing shapes rather than invented alongside them.)*
   - The retained-earnings account is resolved from the chart; if it is absent or ambiguous the
     close refuses `CLR41 drawer1_state_unknown` with the resolution named. It is never created
     implicitly.
2. **`opening(n+1) = closing(n)`, asserted.** After the roll, `trial_balance_as_of(p_client,
   fy.ends_on)` must equal `trial_balance_as_of(p_client, fy_next.starts_on)` account-by-account for
   balance-sheet accounts, to the cent. Mismatch ⇒ refuse, no override. **The Wave-B opening
   machinery is reused, not rebuilt** (`create_opening_seed` `0017:2885` … `approve_opening_correction`
   `0017:4162`): where FY(n+1) already carries an approved opening seed, the tie is asserted against
   it; where it does not, the close records the closing position in the receipt and the tie is
   asserted at the next close. *(builder choice — the alternative, minting an opening seed inside
   `finalize_close`, would put a second author on an already-audited one-shot registry.)*
3. **The close-time FA continuity roll** (E-R9's BEE row): FY(n) closing NBV per enrolled asset →
   FY(n+1) opening, computed by `fa_control_tie_out`'s segment reads and **persisted into the close
   receipt's snapshot**, so FY(n+1)'s tie has a stored prior position rather than a re-derivation.
   Explicitly **does NOT** discharge WD-R14's *opening* carry-down deferral (E-R9 says so; BEE held
   zero assets at its 1/1/2025 opening).
4. **The reverse/re-open ordering guard:** §2.8.


---

*Part 1 ends at §2.6. **§2.7 onward — the close receipt family, the reopen path, the E-R6
activation, the E-R11 keys, month snapshots (γ), the E-R12 trio (§3), lane θ (§4), the E-b/E-c
pointers (§5) and the open-question ledger (§6) — continue in
[`wave-e-design-skeleton-part2.md`](./wave-e-design-skeleton-part2.md).* Section numbering is
continuous; the two files are one document.*
