# WAVE E — CAMPAIGN FRAME · THE E-a CLOSE MODEL · THE E-R12 TRIO · **DESIGN SKELETON v2**

> **STATUS: DESIGN, NOT LAW.** `docs/plan/active/wave-e-contract.md` (E-R1..E-R14, ADR-065) is the law; on
> any conflict the contract wins. Rulings are **cited** (`E-R2`), never restated at length.
>
> **THE PACKET IS SEVEN FILES — cite by filename, never duplicate.** This document carries
> **§0–§2.4**. Its own continuations, one document in four files with continuous numbering:
> `wave-e-design-skeleton-part2.md` = **§2.5–§2.8** (the closed-period wall + the permit, continuity
> math, the close receipt family, the reopen path) · `wave-e-design-skeleton-part3.md` =
> **§2.9–§2.12** (E-R6 activation, the E-R11 keys, lane γ's month snapshots, staleness and the period
> registry) · `wave-e-design-skeleton-part4.md` = **§3–§6** (the E-R12 trio; lane θ; the E-b/E-c
> pointers; the open-question ledger). The other three files: `wave-e-design-reporting.md` = **§0–§5**
> (lane δ) · `wave-e-design-reporting-part2.md` = **§6–§12** (lanes ε/ζ/η) ·
> `wave-e-acceptance-matrix.md` (the falsifiable cells, minted BEFORE build per E-R9).
>
> **MARKERS.** *(ruled — E-R#)* = contract law; changing it needs a new ADR. *(builder choice)* = a
> mechanism this document picks, adjustable without reopening a ruling. *(DECIDED (orchestrator,
> date))* = an orchestrator call on a question the contract leaves open — never spelled "RULED".
>
> **EVIDENCE DISCIPLINE.** Every EXISTS claim carries `file:line` from a read taken **2026-08-09 at
> the v2 fix pass**; v1's citations were re-taken, not inherited, and the ones v1 got wrong are
> corrected in place with the correction named. Absence is never evidence — where this document says
> a thing is missing it names the search that failed; derivations are labelled. **Migration numbers
> and `CLRnn` codes are NEVER pre-assigned** — lanes claim them at MERGE against the then-current
> frontier and live roster (`packages/db/README.md:96-97`).

---

## 0. Verification ledger — what the grounding got right, and three corrections

### 0.1 Confirmed by direct read

| Fact | Evidence |
|---|---|
| No period / FY / close table exists anywhere | two targeted greps over all 54 migrations returned zero `create table clara.*(period\|fiscal\|close)*` hits |
| `_correction_period_state` is a constant stub | `0007_document_pipeline.sql:2420-2424` |
| `fy_end_month/day`: nullable pair, coalesce `(12,31)` + a `fallback` boolean at every read | `0041_wave_d_a_fa_register.sql:774-779`; read idiom `0041:4244-4245` |
| `fa_control_tie_out` deferred **by name** to Wave E's close-segment primitive; `fa_register_tie` visibility-only, never blocking | `0041:4250-4256` (verbatim header) · `0041:4257-4399` |
| AR/AP subledger sums exist; **no GL-vs-subledger diff object does** | `_aging_core` `0040_wave_c_c_tieout.sql:3937-3987`, `ar_aging` `:3989-3999`, `ap_aging` `:4001-4008`; grep for `*_control_tie*`/`tie_out` found no such function |
| The bank-recon triad — immutable receipt, jsonb snapshot, chain, recompute-and-diff `verify_*` | table `0040:262-335` (`check (jsonb_typeof(snapshot)='object')` `:298`; "enumeration-completeness is the belt's job" `:296-297`); triggers `0040:351`, `:379`; `verify_bank_reconciliation` `0040:4537-4644`, STRICT half `:4562` |
| `trial_balance_as_of` EXISTS, is **SECURITY INVOKER**, and returns no account type | `0017_wave_b.sql:3572-3585` (whole-book `trial_balance` is `0004_governed_fns.sql:730`) |
| The opening machinery is BUILT (Wave B) | `create_opening_seed` `0017:2885` · `approve_opening_seed` `0017:3825` · `supersede_opening_item` `0017:4047` · `approve_opening_correction` `0017:4162` · registry `0017:1076` |
| Role floors raise **CLR04** | `clara._human_ctx` `0004:299-309` |
| Maker/checker mechanics, and the column they test | `is_high_stakes` `0004:72-79` (true for any `is_year_end` entry) · `eligible_checker_count` `0004:81` · the live test `0004:541-546` reads **`e.last_human_editor`**, not `checker_actor` · column `0003_books_core.sql:116` · `self_approval_attestation` `0003:118` |
| The PUBLIC lockdown is **schema-scoped** — it does not reach `pg_catalog` | `0004:752-753` |
| No firm-configurable capability table; the role vocabulary is four literals | `clara.firms` `0002_foundation.sql:199-206` (no settings column) · `firm_memberships.role check (… 'viewer','bookkeeper','admin','owner')` `0002:215` · `wake_fn_allowlist` `0002:247-251` is global |
| `clara_fn_owner` is **not** BYPASSRLS and FORCE RLS applies to it ⇒ every table needs an explicit owner policy | `0002:10-12`; the standing pair `0037_wave_c_a_subledger.sql:843-844` (owner `using(true)`) + `:847-848` (human select) |
| CLR block convention; tests assert reason tokens, never bare SQLSTATE | `0041:48-60`; a grep of all 54 migrations shows CLR01..CLR40 + CLR99 **at design time** |

### 0.2 CORRECTION 1 — the `20300xxxx` close-lock block has **six** constants in use, not five

The digest reported `203005001..203005005` and advised "pick a sixth". **A sixth is taken:**
`203005006` is the per-bank-account statement-chain lock — `0038_wave_c_b_bank.sql:1351` (the ordered
ladder naming it step 6), `:1628-1634` (acquisition), `:8935-8944` (a tail that RAISES if a named
writer stops taking it), plus `0040:1576`, `:1648`, `:2086`, `:3262`, `:3427`. A repo-wide scan for
`20300[0-9]{4}` returns exactly `203005001..203005006` + `203007001` — a **deleted** key surviving
only in a post-mortem comment at `0046_wave_7a_sales_lane.sql:2209`.

⇒ **The close lock takes `203005007`** *(builder choice — the next free integer in that block;
grep-verified unused at design time and re-verified in the migration's own prestate probe, because
"free at design time" is a derived state by merge day).*

**Scope the census to its instrument (v1 over-claimed).** `20300[0-9]{4}` is a PREFIX scan, not a
census of two-key advisory namespaces: `pg_advisory[a-z_]*\(\s*[0-9]+` over `packages/` returns a
**seventh** live namespace, `202991617` — the sales-lane firm lock (`0046:2211`; its header
`:2205-2210` records that advisory xact locks are REENTRANT and that the first deadlock was fixed by
deleting `203007001`). No collision. Wherever this packet says "six" it means **six in the
`20300xxxx` block**, which is the block the close lock is claimed from.

### 0.3 CORRECTION 2 — the dormant guard is a **PERMIT-SENTINEL** test, not a closed-period test

The digest states the predicate "is already the exact 'is this entry inside a closed/locked period'
test". **It is not.** Read verbatim (all three generations byte-identical):

```sql
if exists(select 1 from clara.filing_correction_items i where i.correction_id=x.id
    and clara._correction_period_state(i.entry_id)<>'no_period_model') then
  raise exception 'correction touches a closed period' using errcode='CLR19';
end if;
```

`<> 'no_period_model'` means: **the literal `no_period_model` is the PERMIT token; every other value
REFUSES.** A body honestly returning `'open'` would refuse every wrong-client correction in the
estate. This constrains E-R6's activation and is designed around in §2.9.

**CORRECTION 2b — the live body is NOT the 0027 file text, and there are THREE live readers.** v1 said
"the live body is the 0027 generation … 0007 and 0009 carry historical file text only" and "there is
ONE live call site, not three". Both halves are wrong:

1. **`approve_wrong_client_correction` has been PATCHED three times since 0027** — each time by
   harvesting `pg_get_functiondef`, splicing, and `execute`-ing, so **no file in the tree holds the
   live text**: `0037_wave_c_a_subledger.sql:2304-2392` ("SECTION H.3 … a CHANGE-OF-RECORD PATCH";
   `execute v_next;` at `:2392` — adds the allocated-items reverse refusal and
   `clara._subledger_on_approve(v_mirror)`) · `0038_wave_c_b_bank.sql:7466-7579` ("SECTION E7b … TWO
   refusals, ONE round trip"; `execute v_next;` at `:7579`) ·
   `0042_wave_d_b0_shared_authorities.sql:4675-4758` ("S5.21 … THE FOURTH CLOCK, CLOSED ON THE LIVE
   0027 BODY"; `execute v_def;` at `:4758` — moves the correction reversal off `current_date` onto
   `clara._book_today()`, created `0042:4592`). ⇒ **read the live body only via
   `pg_get_functiondef`**; diffing live `prosrc` against `0027_filings_lock_order.sql:196` raises a
   false drift alarm. This is the "spelling is not identity" / PATCHED-NOT-REBUILT failure class,
   applied to the packet's own claim.
2. **Three distinct live functions read `_correction_period_state`** (grep over all 54 migrations, six
   hits): the guard (`0007:2559` / `0009:2464` / `0027:263` — three generations of one function) ·
   **`clara.retire_document_filing`** (`0007:1450`; live recut `CREATE OR REPLACE` at `0027:393`, call
   at `0027:428`), which folds `period_state` into the `v_blockers` payload it raises with ·
   **`clara.preview_wrong_client_correction`** (created `0007:2438`, call at `0007:2459`; live body =
   that text as spliced by `0017_wave_b.sql:104-112`), which emits `period_state` per entry into the
   preview **a human reads before approving a correction**. §2.9 repoints the two READERS and pins the
   guard predicate to the first.

### 0.4 CORRECTION 3 — `open_items.item_date` is `NOT NULL`

`0037:738` — `item_date date not null` (defaulted from the entry's posting_date at write, `0037:713`,
`:1098-1102`). The unborn-item wall's `i.item_date is not null` conjunct is defensive, not a live
escape hatch — **today**. §3.1 makes re-reading that NOT NULL a positive build-time obligation: a wall
whose predicate short-circuits on NULL opens silently if the column is relaxed.

---

## 1. Campaign frame — lanes, dependency edges, ceremony

E-R7 rules ONE campaign, no deferral valve, lanes in parallel, acceptance in dependency order. Lanes
carry **letters**; migration numbers claim at merge. PR-per-lane; ADR-061's uniform full ladder on
every lane (Law 1: independent review on judgement logic — which is most of E-a).

| Lane | Content | Layer | Depends on | Notes |
|---|---|---|---|---|
| **α** | E-R12 trio: F-1 verify-first **+ one `apply_open_items` guard** · `entity_type` · the MSIC/facts door | DB + a `get_context_pack` splice | — | §3. Early-ride candidate; **carries a small D1 window** (§1.1). |
| **β** | Period spine + the close model (gates, receipts, keys, the wall, E-R6 activation) | DB | — | §2. The campaign root. |
| **γ** | **`clara.reporting_periods` (the period registry)** + month snapshots + staleness | DB | β | §2.11–§2.12. Split from β purely for review size. |
| **δ** | Metric algebra + catalog + evaluator (`_vN`) · **the freeze family's DB half** (`evaluator_versions`, `verify_evaluator_freeze()`, the `migrate.mjs` hook, the per-migration tails) | DB | **γ — BUILD dependency:** the cell↔period junction and `days_in_period` bind to γ's registry (§2.12); acceptance additionally depends on β | sibling doc, reporting §4.2 |
| **ε** | FS template layers · wording STRUCTURE · claim assessment · sealed-artifact registry | DB | δ | sibling doc. Wording **seeds** wait on task #43; the structure does not. |
| **ζ** | Render worker package · **the freeze family's CI/runtime half** (`check-frozen-evaluators.mjs` + manifest; marking the render modules `@frozen` for the existing lint) · DR §10 recipe | runtime + CI + ops | ε, δ | sibling doc, reporting §4.2 |
| **η** | E-c ad-hoc authoring lane | runtime + DB | δ, ε | sibling doc |
| **θ** | Close plan-as-document · readiness panel · `/reports` | dashboard | β, ε/ζ | §4. Plumbing grade only — ALL UX polish is Wave G (E-R10). |

**Acceptance order — ONE canonical statement, used identically in all three documents.** *Section
order (execution):* **F → A → B → C → D → E** — F first because E-R12's verify-first verdict is a
precondition for trusting the aging instruments every later section reads. *Corpus order over E-R9's
machines, orthogonal to it:* sandbox battery — **including the synthetic goods-trader fixture**
(E-R9's WD-R11 row) — → BEE FY2025 first real close → RPR historical FY MPERS pack → RS snapshot
witness. E-R7's one stated dependency ("statements cannot be accepted before a close model exists") is
why β precedes every FS acceptance even though δ/ε build in parallel.

### 1.1 Ceremony proposal

**ONE ceremony for the DB batch (β + γ + δ + ε), 7A-R1 quiesce discipline**, plus a small **early ride
for α**. *(builder choice.)*

1. **α earns the early ride, but not a D1 exemption.** Its edits are `get_context_pack` (a SECURITY
   DEFINER **read**, CoR at `0036_wave_c0_deferred_belts.sql:1554-1566`) and the one small
   `apply_open_items` guard §3.1 rules in. Rule D1 (`packages/db/README.md:103` header, rule text
   `:109-115`) binds migrations replacing **audited writer** bodies — `apply_open_items` is one, so
   **α carries a D1 window**; single-verb, not campaign-sized. *(v1 said α replaced no writer body;
   §3.1's fix pass changed that, and this line changes with it.)*
2. **The β/γ batch is INERT ON ARRIVAL — by data, not by a flag.** Every new guard keys on a
   `clara.fiscal_years` row and zero rows exist at deploy; `_correction_period_state`'s new body
   returns the permit sentinel for an entry in no FY (§2.9). The 7A §3.2 open-interval hazard cannot
   arise: activation is the first human `open_fiscal_year` call, taken after the runtime deploy is
   positively read. The cost is stated with the benefit — **the wall's first live exercise is a real
   client's close**, which is why §2.5's cells are non-negotiable.
3. **D1 binds the β/γ batch**, and the quiesce spans migration-apply → runtime-deploy → positive
   verification, not merely the migration transaction: an in-flight PL/pgSQL writer running its
   pre-migration body still fires a newly created trigger (triggers dispatch from the relation's
   trigger descriptor, not the cached plan).
4. **The DDL takes ACCESS EXCLUSIVE on the hottest table in the schema.** `CREATE TRIGGER` on
   `clara.journal_entries` queues behind every open reader and blocks every new one while waiting, so
   the recipe sets an in-session **`lock_timeout`** for the trigger DDL (fail and retry inside the
   window, never block the estate) alongside the `statement_timeout` the `pg_proc` lex tails need. β
   also ships the index the wall's per-write FY lookup needs — `fiscal_years (client_id, starts_on,
   ends_on)` (§2.1).

**Ceremony law carried, not restated:** `--lock-deployed` before rebaseline, positive deploy reads,
`statement_timeout` **and `lock_timeout`** in-session, rig-validate on a throwaway `postgres:17`,
record every reset per ADR-060.

### 1.2 The refusal-token register (CLR convention)

Convention read from live text: `raise exception '<sentence naming the remedy>' using
errcode='CLRnn', detail=jsonb_build_object('reason','<snake_case_token>', …)::text`
(`0044_wave_d_b3_af2_composite.sql:1266-1272`); tests assert **reason tokens + message text, never
bare SQLSTATE** (`0041:59-60`). **CLR41 is a PROPOSAL, claimed at merge against the live roster** —
the discipline migration numbers ride, and the sentence the matrix's §0.4 uses. A design-time grep
shows CLR01..CLR40 + CLR99 in use, so the next contiguous block per `0041:48-60` is **CLR41**; the
migration re-probes the live roster in its prestate and takes the next free code if the ground moved.

| Code | Wave-E use | Why not a new code |
|---|---|---|
| **CLR41** *(proposed)* | `drawer1_identity_failed` · `drawer1_state_unknown` · `drawer2_unattested` · `close_attestation_stale` · `close_segregation_violation` · `close_self_attestation_required` · `reopen_ordering_violation` · `close_not_in_progress` · `close_lock_contended` | a gate refusal is a distinct product state ("the close is blocked"), not bad input; the UI must tell them apart |
| **CLR19** | `write_into_closed_period` (§2.5) — and the untouched existing `'correction touches a closed period'` | CLR19 already owns the period/correction surface |
| **CLR10** | `fy_range_invalid` · `fy_not_contiguous` · `fy_length_reason_required` · `fact_basis_missing` · `fact_key_unknown` · `fact_value_invalid` · `snapshot_range_invalid` · `reopen_target_missing` · **`apply_before_item_date`** (§3.1, beside its CLR10 siblings in the same loop) | ordinary validation |
| **CLR11** | `fiscal_year_not_in_firm` · `snapshot_not_in_firm` · `client_not_in_firm` | CLR11 is the scoping/attribution code |
| **CLR04** | `capability_missing` (E-R11 keys ②③) | authorization refusals live at CLR04 (`0004:302-308`); a capability is an authorization |

---

## 2. E-a — the close model *(lane β, with γ at §2.11–§2.12)*

### 2.1 The period spine

**`clara.fiscal_years`** — one row per client FY, **DATE RANGES** *(ruled — E-R3)*.

```
id uuid pk · firm_id uuid not null · client_id uuid not null
label text not null                      -- display only, never an identity
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
index ix_fy_client_span on (client_id, starts_on, ends_on)   -- the wall's per-write lookup
```

- **Contiguity by construction** *(builder choice)* — `btree_gist` is installed nowhere (grep for
  `btree_gist`/`exclude using gist`: zero hits), so `EXCLUDE USING gist` would add an extension to a
  ceremony. Instead `prior_fy_id` is UNIQUE and a `before insert` trigger asserts `starts_on =
  prior.ends_on + 1` (and `prior_fy_id is null` iff `ordinal = 1`). Gaps and overlaps become
  impossible in one readable predicate. It is judgement logic and carries its own cells (gap +
  overlap) — §2.9's fail-closed ordering is all that survives if it is ever wrong.
- **First FY up to 18 months is native** *(ruled — E-R3)*; short FYs are equally legal (RPR's
  historical FY is 9 months, E-R9). Any span outside 11-13 months needs a non-empty `length_reason` —
  a data-level attestation, not a refusal.
- **`ck_fy_span` is a deliberate, DOCUMENTED exception to "law lives in policy tables".** v1 called it
  "a structural sanity bound, not a tax fact" while encoding CA 2016's own number. Honest form: the
  CHECK encodes a **statutory STRUCTURAL bound**, and it is in DDL because it is a permanent shape of
  the domain (a first FY cannot exceed 18 months) rather than a rate or threshold that changes by year
  — the class the 0016 `sst_threshold_schedule` effective-dated idiom exists for. If it moves, it
  moves by migration + ADR. *(builder choice, labelled as an exception so a reviewer prices it.)*
- **`fy_end_month/day` propose, never authorize** *(ruled — E-R3; mechanics adjustable per the
  contract's own "derived implementation notes").* `clara.propose_fiscal_year(p_client, p_starts_on)`
  is a READ returning `{starts_on, ends_on, fy_end:{month,day,fallback}}` using the
  `coalesce(cl.fy_end_month,12)/coalesce(cl.fy_end_day,31)` + `fallback` idiom lifted verbatim from
  `0041:4244-4245`. `open_fiscal_year` takes explicit dates and stamps `fy_end_source='default_1231'`
  when the proposal's `fallback` was true and the human accepted it unchanged — a defaulted year-end
  is never silently readable as asserted, and the matrix asserts that honesty positively.
- **RLS: forced, firm-scoped, and the OWNER policy is EXPLICIT** — the standing pair, not just its
  human half: `create policy p_fy_owner on clara.fiscal_years for all to clara_fn_owner using(true)
  with check(true)`, plus the `for select to clara_authenticated using (firm_id = clara.jwt_firm())`
  half (`0037:843-848`'s shape). Load-bearing, not boilerplate: `clara_fn_owner` is NOT BYPASSRLS and
  FORCE RLS applies to it (`0002:10-12`), so **without the owner policy the SECURITY DEFINER read
  inside `_correction_period_state` (§2.9) sees zero FY rows and returns the PERMIT token for every
  entry in the estate** — a silent, total fail-open of E-R6. The migration asserts the policy; a
  matrix cell asserts the definer read actually sees FY rows. No agent write grant.

**Writers.** Each follows the universal audited shape: `c := clara._human_ctx(<floor>)` →
`clara._reserve_op(...)` (`0004:46-60`) → work → `clara._audit(...)` (`0004:35-41`) →
`clara._finish_op(...)` (`0004:62-68`).

| Function | Floor | Notes |
|---|---|---|
| `clara.open_fiscal_year(p_client, p_label, p_starts_on, p_ends_on, p_length_reason, p_op_key)` | `role_rank('admin')` *(builder choice — fixes the statutory period boundary; not a signing act, but above bookkeeper)* | contiguity trigger fires on insert |
| `clara.begin_close(p_fy, p_op_key)` | **key ②** | **`open` OR `reopened`** → `closing` (a reopened FY re-closes through this same path, §2.8); takes the close lock EXCLUSIVE; opens a `close_runs` row; evaluates all gates |
| `clara.attest_close_exception(p_close_run, p_check_key, p_reason, p_op_key)` | **key ②** | one drawer-2 item, bound to the exact gate-result row |
| `clara.finalize_close(p_fy, p_self_attestation, p_op_key)` | **key ②** | `closing` → `closed`; **re-evaluates every gate in-transaction**; mints the close entry + receipt |
| `clara.abandon_close(p_close_run, p_reason, p_op_key)` | **key ②** | `closing` → `open`; the run is stamped abandoned, never deleted |
| `clara.reopen_fiscal_year(p_fy, p_reason, p_correction_target, p_op_key)` | **key ③** | §2.8; acquires `row → 004 → 007-excl` per the lock order below |

**Bodies this campaign PATCHES rather than creates — the D1 surface, named here so no lane discovers
it late.** A new function is reviewed as new code; an existing audited body that gains a branch is a
change-of-record with a D1 window and its own PATCHED-NOT-REBUILT discipline (§3.3's law, applied).
Lane β owns both rows.

| Live body | What β splices in | Why it is a patch, not a rebuild — and the D1/Law-1 posture |
|---|---|---|
| `clara._correction_period_state` (`0007_document_pipeline.sql:2420-2424`) | the E-R6 activation (§2.9) | it is a stub with no callers to preserve, so this one IS a `create or replace` — but the guard that reads it is NOT recut, and §2.9's tail proves that with a prestate/tail `md5(prosrc)` pair. **Judgement logic ⇒ Law-1 independent review.** |
| **`clara.approve_opening_seed`** (`0017_wave_b.sql:3825`) | the drawer-1 `opening(n+1) = closing(n)` assertion against the prior receipt's PIN (§2.6 item 2) | **the live body is NOT the file text.** A repo-wide search for `create or replace function clara.approve_opening_seed` returns **zero** hits, so every change it has ever taken was a splice: 0018 §3b harvests it with `pg_get_functiondef` (`0018_gate_k_domain.sql:282-284`), replaces two counted anchors — the K5 correction-draft guard before `perform clara._assert_opening_tie(p_seed);` (`:290-296`) and the DB-authored `entry_count` (`:304-311`) — and re-installs it with `execute v_cur;` (`0018:314`). β must harvest → count → `replace()` → post-assert in that same idiom, **never retype from `0017`**, or 0018's two guards vanish silently. It is an **audited writer**, so β carries a D1 window for it; the assertion is a refusal branch, so it is **judgement logic ⇒ Law-1 independent review.** |

**Serialization — a SHARED/EXCLUSIVE advisory pair on ONE key** *(the serialized close lock is ruled —
E-R2 drawer 1; the shared/exclusive shape is a builder choice, and it is the fix for the MVCC race a
close-lock-only design leaves open).*

- The four close verbs take `pg_advisory_xact_lock(203005004, hashtext(p_client::text))` — the house
  **client** rung — and **then** `pg_advisory_xact_lock(203005007, hashtext(p_client::text))`, the
  **EXCLUSIVE** form. For `begin_close`, `finalize_close` and `abandon_close` those are the first two
  acts after the op reservation. **`reopen_fiscal_year` takes ONE act before them** — the closing
  entry's ROW LOCK (below) — so that all four walk a prefix of the same order. **Every JE-writing path
  and every gate-evidence path** takes `pg_advisory_xact_lock_shared(203005007, hashtext(<client>))`
  as the FIRST statement of its §2.5 wall trigger, **before** anything reads `fiscal_years`.
- Consequences, each of which is a cell: writers never block each other (shared/shared is compatible);
  a close waits until every in-flight writer commits; and **no writer can evaluate FY status while a
  close holds exclusive** — the trigger blocks on the shared request before reading the predicate, so
  the race a lock-free writer opens (reading `open` from a snapshot older than the uncommitted
  `closing`) cannot occur.
- **The price, stated rather than discovered.** A transaction that writes a single JE row holds SHARED
  for its whole life, so `begin_close` waits on the LONGEST-running open writer: close latency becomes
  a function of the slowest sweep. That is intended — it is what "no writer escapes" costs — and it is
  why `abandon_close` (§2.2) exists as an ordinary path rather than an incident.
- **No self-conflict; ONE lock object, but a REAL per-row call.** A session never conflicts with its
  own advisory locks, so the close's own closing-entry insert re-acquires the shared form under its
  exclusive hold without waiting; and advisory xact locks are REENTRANT (live code,
  `0046_wave_7a_sales_lane.sql:2205-2207`), so a multi-row statement holds ONE lock object rather than
  one per row. *(v2's first cut wrote this as "no per-row blow-up", which over-reads it: `_tf_period_wall`
  is a ROW trigger, so the lock FUNCTION is still invoked once per row. The honest price is one
  lock-manager lookup per row plus one held lock per (transaction, client) — cheap, not free, and a
  reviewer should price it as a per-row call.)*
- **No precedent for the shared form:** `grep -n "pg_advisory_xact_lock_shared"` over
  `packages/db/migrations/*.sql` returns **zero** hits — named as an absence, not read as permission.
  The pair is new here and gets its own two-session cells.

**Lock order — ONE documented order, and the two cycles it is measured against.** The advisory rung is
recorded WHOLE at `0037:2530-2532`: `firm (203005002) → client (203005004) → client:counterparty
(203005003)`, "read as a **PARTIAL order** over who takes what". The same paragraph records the fact
v1 had backwards: **`reverse_entry` and `approve_wrong_client_correction` take `203005004` AFTER their
`journal_entries` row locks, "the same relative order `_approve_entry_core` has always used (JE row
lock … advisory after)"** (`0037:2535-2538`). *(The correction v1 owes is to its own PLACEMENT claim,
not to the house order: v1's sentence named the JE-before-advisory order correctly in its closing
clause and then mis-stated that its placement was compatible with it. The over-claim "'advisory before
any JE row lock' was never the house rung" is withdrawn as a mis-description of v1.)*

**`203005007` is the BOTTOM rung, on every path.** Close verbs run `[pre-existing JE row lock →]
004 → 007-exclusive`; JE writers and gate-evidence writers run `[row lock →] 004 → [006] →
007-shared` (the bank rung `203005006` where a bank
account is in play). "004 first" on the writer side is measured, not assumed — every gate-evidence
writer §2.5's trigger family covers takes `203005004` as its first advisory act: `unallocate_group`
`0037:3166` · `apply_open_items` `0037:3278` · `complete_bank_reconciliation` `0040:1647` ·
`void_bank_reconciliation` `0040:2085` · `except_bank_line` `0040:3261` ·
`resolve_bank_line_exception` `0040:3426` · `void_bank_statement` `0038:2241` ·
`complete_fixed_asset_particulars` `0041:3054` · `revise_fixed_asset_particulars` `0041:3135`; the JE
writers take it immediately after their row lock (`0037:2535-2538`; the `reverse_entry` splice itself
at `0037:2180`, post-asserted `0037:2189-2190`). So `007` is requested LAST, always.

> **Cycle 1 — `004 ↔ 007`. DEAD, killed by ORDER.** v2's first cut put the exclusive acquisition
> *before* the client rung, so a close ran `007-excl → 004` while every writer ran `004 →
> 007-shared`: writer W holds 004 and waits for shared; close R holds exclusive and waits for 004;
> `40P01`. Moving `007` to the bottom of the close family's ladder deletes the inversion outright.
> This is the house remedy applied, not a mitigation: fix a cycle by ORDER, or by deleting the key,
> never by leaving it to the detector (`0046:2199-2210` — the file's two deadlocks and their two
> remedies).
>
> **Cycle 2 — `004` ↔ a PRE-EXISTING `journal_entries` row lock. ALSO DEAD, and by the same means.**
> v2's draft had `reopen_fiscal_year` take 004 and only then row-lock a pre-existing entry — it
> reverses the closing entry through `clara.reverse_entry`, whose `for update` is the lock in
> question — while a concurrent `reverse_entry` / `approve_wrong_client_correction` on that same
> entry holds the row and then wants 004 (`0037:2180`). Opposite orders on one object; `40P01`.
> **The reopen now takes the ROW LOCK FIRST** (below), which is the order every JE writer already
> walks, so the two sessions share one order and the cycle cannot form.

Three build obligations hold that order, all assertable.
**(1)** `begin_close`, `finalize_close` and `abandon_close` row-lock only rows they inserted in their
own transaction — the invariant `0037:2542-2548` already states for the composites ("a composite
locks only its own freshly-inserted entry row … ANY FUTURE VERB THAT LOCKS A PRE-EXISTING ENTRY MUST
TAKE `journal_entries` BEFORE `open_items`"), restated for the close family. Those three take no
pre-existing row lock at all, so `004 → 007` is simply a prefix of the same order.
**(2) `reopen_fiscal_year` acquires in `row → 004 → 007-exclusive` order** *(ruled by the house
partial order, not a builder preference)*: after the op reservation it resolves the FY's `active`
close receipt and its `close_entry_id`, takes `select … from clara.journal_entries where id = <that
entry> for update`, and only then the client rung and the exclusive close rung. This is exactly the
sequence `_approve_entry_core` has used since the 0029/0035 era — "the document filing, then the entry
row, then the advisory pair" (`0037:2549-2553`) — and the one `reverse_entry` and
`approve_wrong_client_correction` were aligned to at `0037:2535-2538`. An FY with no closing entry
(nothing to reverse) locks no row and falls through to `004 → 007`, still a prefix.
**(3) No timer stands in for the order.** An in-function `lock_timeout` remains ordinary ceremony
hygiene — the same hygiene §1.1 sets for the trigger DDL — and is **never** the containment for this
cycle. *(v2 wrote it as the containment and cited `0046:2209-2210` for the proposition that a
row-vs-advisory cycle must be left to a timer. Re-read whole, that passage records the opposite:
0046's SECOND deadlock was exactly a row-vs-advisory cycle (`:2199-2205`) and it was fixed **by
imposing an order** — "hoisting the acquisition to the top of the branch costs the retry path nothing
and **gives every path one order**" (`:2206-2207`). The clause about a row lock not collapsing into
an advisory one (`:2209-2210`) explains only why the FIRST deadlock's key-deletion remedy was
unavailable, not why ordering would be. Cited correctly, 0046 is the precedent FOR obligation (2).)*

**The nested takes are free, and the reopen cannot deadlock against itself.** Inside the reopen,
`clara.reverse_entry` re-takes both: the same row's `for update` (a row lock a transaction already
holds re-acquires trivially) and `pg_advisory_xact_lock(203005004, hashtext(o.client_id::text))`
(`0037:2180`), which advisory reentrancy (`0046:2206`) turns into a refcount bump. Neither waits.

### 2.2 The gate catalog and the run/result/attestation trio

- **`clara.close_gate_checks`** — curated, **code-populated, not firm-configurable** (the
  `wake_fn_allowlist` posture, `0002:247-251`): `check_key pk · drawer int check (drawer in (1,2,3)) ·
  title · evaluator_fn text · applies_when text`. Drawer assignment is **ruled** (E-R2); this table is
  where the ruling becomes data a reviewer can diff.
- **`clara.close_runs`** — the mutable attempt workspace: `id · firm_id · client_id · fiscal_year_id ·
  state ('in_progress','finalized','abandoned') · started_by · started_at · ended_at`. One
  `in_progress` run per FY (partial unique index).
- **`clara.close_gate_results`** — **append-only**: `… check_key · drawer · state
  ('pass','fail','unknown','error','advisory') · measured jsonb not null · measured_digest text not
  null · evaluated_at`. `measured_digest` = a stable hash of `measured`; it is what an attestation
  binds to.
- **`clara.close_attestations`** — **append-only**: `… check_key · gate_result_id (FK) · attested_by ·
  reason text not null · attested_at`; unique on `(close_run_id, check_key)` where not withdrawn.

**The attestation binds to the exact measured state.** `finalize_close` re-evaluates every check and
refuses `CLR41 close_attestation_stale` if any drawer-2 attestation's `gate_result_id.measured_digest`
differs from the fresh digest — PRD invariant 8's "an approval is bound to the exact revision
approved" (GAP0-5) applied to a gate. Its cell: attest, MOVE the measured state, finalize, observe the
refusal. *(builder choice on mechanism; the per-item override is ruled — E-R2.)*

### 2.3 Drawer 1 — the DB-owned identities *(ruled — E-R2: no override, nobody)*

Mapping only (the assignments are the contract's): **AR control = Σ open items · AP control · the FA
register tie including its segment-aware Wave-E rebuild · the bank-reconciliation IDENTITY · continuity
math · the reverse/re-open ordering guard · the serialized close lock.**

1. **`clara.ar_control_tie(p_client, p_as_of) returns jsonb`** + twin **`ap_control_tie`**. Neither
   exists today (§0.1). Shape `{state, gl_cents, subledger_cents, diff_cents, control_accounts[],
   as_of}`, `state ∈ {'tie','mismatch','unknown'}`.
   - The subledger side **calls `clara._aging_core(p_firm, p_client, p_domain, p_as_of)`**
     (`0040:3937-3987`) rather than re-summing `open_items` — measuring an identity with a second
     hand-written instrument is how two "correct" numbers disagree (memory: *measure with the
     instrument production uses*).
   - The GL side resolves the control account **through the resolver the allocation writers use** — the
     one raising `control_account_invalid` (`0044:1176-1177` receipt, `:1466-1467` payment),
     `ar_control_not_unique` (`0044:1185-1186`) and `ap_control_not_unique` (`0044:1475-1476`) inside
     `_allocate_receipt_core`/`_allocate_payment_core` (signatures open at `0044:1034` / `:1353`).
     Resolver refuses ⇒ state **`unknown`**, never `tie`. *(v1 cited `0044:1034-1037` / `:1353-1356`
     for the refusals; those ranges are the SIGNATURES.)*
   - GL balance = Σ(debit−credit) over `journal_lines` ⋈ `journal_entries` where `status='approved' and
     posting_date <= p_as_of` on the resolved account(s) — the predicate `fa_register_tie` uses
     (`0041:4257-4399`).
2. **`clara.fa_control_tie_out(p_client, p_fiscal_year_id) returns jsonb`** — the segment-aware rebuild
   `0041:4250-4256` defers **by name** to "Wave E's close-segment primitive". *(builder choice on
   shape.)* The close segment is `(fy.starts_on, fy.ends_on]` **plus the opening watermark**: movement
   measured WITHIN the segment on both sides, with FY opening taken from the prior FY's close receipt
   rather than re-derived, so an opening restatement counted in FY(n) can never be double-counted in
   FY(n+1) (ARCHITECTURE §3.6's F12-1). **`fa_register_tie` is NOT modified** — it stays
   visibility-only per WD-R1, and the migration asserts its `prosrc` is unchanged.
3. **`clara.bank_recon_close_state(p_client, p_fiscal_year_id) returns jsonb`** — per bank account,
   locates the latest `status='complete'` `clara.bank_reconciliations` row covering `fy.ends_on` and
   calls **`clara.verify_bank_reconciliation`** (`0040:4537-4644`), consuming **only its STRICT half**
   (`0040:4562`) as the drawer-1 signal. The informational half goes to **drawer 3**, exactly as 0040
   classifies it. Mechanics reused, not re-implemented.

**The drawer-1 / drawer-2 line, CORRECTED** *(ruled — E-R2; v1 got this wrong and it was the widest
override in the packet).* The contract puts "**the bank reconciliation IDENTITY**" in drawer 1 and
rules of the whole drawer-1 set that "no attestation path exists, and an **UNKNOWN/ERROR** tie state —
or a non-zero unexplained identity difference — fails closed exactly like a mismatch"
(`wave-e-contract.md:41-48`). Therefore: a reconciliation that EXISTS and whose strict identity
**fails** ⇒ drawer 1, `CLR41 drawer1_identity_failed`; **no completed reconciliation covering
`fy.ends_on`** ⇒ there is no identity to evaluate, which is precisely an **UNKNOWN tie state** ⇒
drawer 1, `CLR41 drawer1_state_unknown`, **no attestation path**; drawer 2 keeps exactly what the
contract names there — **unmatched statement lines**, and a **missing bank STATEMENT for a period**
(§2.4). *(v1 routed a missing reconciliation to drawer 2, reading absence as "a missing evidence
artifact"; the standing law points the other way — absence falls to the fail-closed branch — and the
contract's drawer-2 carve-out at `:61-63` names a missing **STATEMENT**, not a missing
**reconciliation**.)*

**Fail-closed on UNKNOWN and ERROR** *(ruled — E-R2).* Each drawer-1 probe runs inside its own
PL/pgSQL `begin … exception when others then v_state := 'error'` block, so a raising probe records
`error` instead of aborting the close; `error` and `unknown` both refuse with `CLR41
drawer1_state_unknown` exactly as `mismatch` refuses with `drawer1_identity_failed`. **A probe that
could not be evaluated has not passed.** The probe count is small and fixed, so subtransaction cost is
bounded. *(Consequence for §2.5's permit, easy to miss: rows written inside such a block carry the
SUBTRANSACTION's `xmin` — which is why the permit is a declared `xid8` column and not `xmin`.)*

### 2.4 Drawer 2 — five named checks, per-item attested override *(ruled — E-R2)*

| `check_key` | What it measures | Origin |
|---|---|---|
| `depreciation_through_fy_end` | every enrolled asset's depreciation authority has run through `fy.ends_on`; reads the existing authority (`clara.get_depreciation_authority`, `0041:4244`) + the register, never a re-derived cadence | **WD-R6** — E-R2 rules the advisory **upgrades to default-refuse-attestable, NOT absolute** |
| `closing_stock_present` | a goods-trading client has a closing-stock entry dated in the FY | **WD-R11** completeness |
| `unapproved_drafts_in_period` | `journal_entries.status='draft'` with `posting_date` in the FY | E-R2 |
| `open_bank_recon_items` | **only the evidence-dependent states**: unmatched statement lines, and a period inside the FY with no bank STATEMENT at all. The IDENTITY and a missing RECONCILIATION are drawer 1 (§2.3) | E-R2 `:61-63` |
| `uncoded_documents` | filed documents for the client with no approved entry, dated in the FY | E-R2 / PRD journey-7 |

- `depreciation_through_fy_end`'s first real firing is BEE FY2025; it is the gate that pulls the
  11-period catch-up approval through (E-R9).
- `closing_stock_present` applies only to a goods-trading client, and **the applicability test is
  itself a fact question**: `applies_when` reads `client_facts` (§3.2). Fact absent ⇒ **`unknown` →
  drawer-2 refuse-attestable**, never "not applicable" — an unknown trade nature is not evidence of a
  service business.
- Override = `attest_close_exception` writing who/why/when into the receipt permanently (E-R2). A
  drawer-2 attestation **never posts into a closed year** and never substitutes for a drawer-1 identity
  (E-R13's own resolution of the same question). Each of the five carries a **negative** cell as well
  as a positive one; `open_bank_recon_items` and `uncoded_documents` had none in matrix v1.

---

*Part 1 ends at §2.4. **§2.5–§2.8** — drawer 3 and the closed-period wall (with the permit), the
continuity math, the close receipt family and the reopen path — continue in
[`wave-e-design-skeleton-part2.md`](./wave-e-design-skeleton-part2.md); **§2.9–§2.12** — the E-R6
activation, the E-R11 keys, and lane γ's month snapshots, staleness and period registry — in
[`wave-e-design-skeleton-part3.md`](./wave-e-design-skeleton-part3.md); **§3–§6** — the E-R12 trio,
lane θ, the E-b/E-c pointers and the open-question ledger — in
[`wave-e-design-skeleton-part4.md`](./wave-e-design-skeleton-part4.md). *Section numbering is
continuous; the four files are one document.**
