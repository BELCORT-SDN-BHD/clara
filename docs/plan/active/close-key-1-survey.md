# F-A4 · Close key ① — the estate survey (as-found)

> **Survey of record for Wave-F Track A item F-A4** (`docs/plan/active/wave-f-contract.md`
> §F-A4), read against the **2026-08-22 Track-A sitting rulings** TA-P1 · TA-P2 · TA-P4 ·
> TA-P5 · TA-P6 · TA-P14. Companion: `close-key-1-design.md` (+ `-annexes-1-mechanics.md`,
> `-annexes-2-record.md`). **This file states what IS, at the bytes. It designs nothing.**
>
> **Method, copied from the F-A2 gate's three method lessons** (`f-a2-annexes-3-record.md` §G):
> (1) a body's **live tip is found by CoR lineage**, never by the migration that created it —
> every function below was swept for a later `create or replace` across all 102 migrations;
> (2) **line numbers come from the instrument that prints them** — every `file:line` here is a
> `grep -n` / `sed -n` read of the working tree at `cfa0710`, never a memory of one;
> (3) **an unsettleable claim is carried as a PREDICTION** the build's rig replay must confirm —
> §7 holds them, and no design decision rests on an unmeasured population as if it were measured.
>
> **v1.1 (same day).** A second pass re-read **every** `file:line` in this survey with a
> mechanical checker (each cite resolved and its line printed back). Nine cites had drifted by
> one to three lines and are corrected here; the drift itself is the reason method lesson (2)
> exists. The re-read also surfaced **two new findings, F13 and F14** — both at the bytes, both
> load-bearing — and settled one of the design's open predictions (Annex A.1's task-id question).
>
> **v1.2 (2026-08-22) — the PR-0 gate's byte lens folded** (record:
> `close-key-1-gate-record.md`). The gate re-resolved every cite independently and found the
> v1.1 pass had **not** covered the annexes or two cells of §1.1: the `propose_fiscal_year` and
> `snapshot_state` rows are corrected below (gate GN-2/GB-2), the `clara_dev_jwt` seam cite in §4
> is corrected (GN-1), **F2 gains the `0085` duplicate site it wrongly assigned to F-A5** (GM-5),
> §8's snapshot sentence is trued against the amended contract (GM-6), censuses **C15/C16** are
> added, and **§2.1 records the gate's own four byte findings G1-G4**. Nothing already in this
> file was deleted.
>
> **What this survey could NOT do:** the lane is read-only on code and forbidden a rig or any
> database. Every population claim (how many uncoded documents carry a NULL `financial_date`,
> how many fiscal years exist, whether any live `close_runs` row exists) is therefore a
> **prediction**, not a measurement. §7 is that list, in full, with the instrument that settles
> each one.

---

## 1 · The surface F-A4 touches — the inventory

### 1.1 The verbs (live tips confirmed; `0056_wave_e_close_model.sql` unless stated)

| verb | live tip | ctx resolver | extra floor | grants today |
|---|---|---|---|---|
| `propose_fiscal_year(uuid,date)` | `0056:1629` | **`_human_ctx(bookkeeper)` (`0056:1634`)** *(v1.1 said "called in-body" — wrong at the bytes)* | — | **`clara_authenticated` (`0056:1655`)** *(v1.1 said "ungranted helper" — wrong; owner `:1653`, revoked from public `:1654`)* |
| `open_fiscal_year(uuid,text,date,date,text,text)` | `0056:1657` | `_human_ctx(admin)` (`0056:1665`) — **and it calls `propose_fiscal_year` in-body at `0056:1697`** | admin | `clara_authenticated` (`0056:1719-1721`) |
| `begin_close(uuid,text)` | `0056:1723` | `_human_ctx(bookkeeper)` | **`close_and_attest`** (`0056:1729-1734`) | `clara_authenticated` (`0056:1785`) |
| `attest_close_exception(uuid,text,text,text,text)` | `0056:1816` | `_human_ctx` | capability | `clara_authenticated` (`0056:1940`) |
| `abandon_close(uuid,text,text)` | `0056:1943` | `_human_ctx(bookkeeper)` | **`close_and_attest`** (`0056:1950-1954`) | `clara_authenticated` (`0056:1995`) |
| `finalize_close(uuid,text,text)` | `0056:2003` | `_human_ctx(bookkeeper)` | **`close_and_attest`** (`0056:2014-2019`) | `clara_authenticated` (`0056:2357`) |
| `reopen_fiscal_year(uuid,text,jsonb,text,text)` | **`0085:172`** (CoR; the 4-arg form was DROPPED) | `_human_ctx` | `reopen` capability | `clara_authenticated` (`0085:497`) |
| `verify_close(uuid)` | `0056:2529` | `_human_ctx(viewer)` (`0056:2535`) | viewer | `clara_authenticated` (`0056:2616`) |
| `get_close_readiness(uuid,uuid)` | `0056:2618` | `_human_ctx(viewer)` (`0056:2623`) | viewer | `clara_authenticated` (`0056:2663`) |
| `list_fiscal_years(uuid)` | `0056:2665` | `_human_ctx(viewer)` (`0056:2670`) | viewer | `clara_authenticated` (`0056:2688`) |
| `get_close_plan(uuid)` | `0064:154` | **`clara.actor_firm_id()`** (dual-lane) | — | `clara_authenticated` **only** (`0064:285`) |
| `grant_firm_capability(uuid,text,text,text)` | `0056:1130` | `_human_ctx` + literal `owner` | owner | `clara_authenticated` |
| `revoke_firm_capability(uuid,text,text,text)` | `0056:1178` | same | owner | `clara_authenticated` |
| `mint_month_snapshot(uuid,date,text)` | `0057:772` | `_human_ctx(bookkeeper)` (`0057:780`) | bookkeeper | `clara_authenticated` |
| `snapshot_state(uuid)` | `0057:574` | **`_human_ctx(viewer)` (`0057:578`)** *(v1.1 recorded "—" — wrong at the bytes; this is why the design's "unchanged" routing was dark)* | viewer | `clara_authenticated` (`0057:1389`) |
| `_snapshot_state_core(uuid)` | `0057:564` | **none — a pure `sql stable` core** | — | **ungranted** (`0057:572` revokes from public; no grant follows). *Added at v1.2: it already exists, so the agent read needs no extraction* |

### 1.2 The tables and the walls they carry

| object | site | shape that binds F-A4 |
|---|---|---|
| `clara.fiscal_years` | `0056:232-261` | `status in ('open','closing','closed','reopened')` (`:242`) · **`fy_end_source in ('asserted','default_1231')` NOT NULL** (`:245`) · contiguity trigger (`0056:271`) · `uq_fy_client_ordinal` |
| `clara.close_gate_checks` | `0056:369` | code-populated append-only catalog; **13 rows** seeded `0056:390-407` (6 drawer-1 · 5 drawer-2 · 2 drawer-3) |
| `clara.close_runs` | `0056:410-430` | `state in ('in_progress','finalized','abandoned')` · `uq_close_runs_one_live` partial unique on `fiscal_year_id` (`:429`) · settled rows immutable (`_tf_close_runs_lifecycle`, `0056:433`) · RLS select policy is **`firm_id = clara.jwt_firm()`** (`0056:463`) — no agent policy exists |
| `clara.close_gate_results` | `0056:469` | append-only; `measured_digest` is what an attestation binds to |
| `clara.close_attestations` | `0056:503-523` | supersede-never-mutate; `uq_ca_live` per (run, check_key, item_key); **`attested_by` + `reason` only — no authorship column** |
| `clara.close_write_permits` | `0056:569` | caller-unreachable (no grant, forced RLS); consumed by `_tf_period_wall` |
| `clara.close_receipts` | `0056:1508-1544` | **`segregation_mode in ('two_person','solo_self_attested')`** (`:1520`) · `last_preparer_actor` (`:1521`) · `self_attestation` (`:1522`) · the belt refuses a receipt with no `closing_position` (`0056:1547`) |
| `clara.firm_capability_grants` | `0056:1060-1073` | **`capability in ('close_and_attest','reopen')`** (`:1064`) — the two-value live CHECK |
| `clara.open_questions` | `0011:796-834` | **`scope_kind in ('document','vendor','client')`** (`:800`) + `ck_open_questions_scope` (`:822-829`) forcing `scope_id` to equal one of three id columns; `origin` widened once at `0016:202-204` |
| `clara.wake_credentials` | `0011:617-628` | `ck_wake_credentials_kind_0011` (`:623-624`) and `ck_wake_credentials_client_0011` (`:625-628`) — **two closed worlds over the same three kinds** |
| `clara.audit_log` | `0002:276-288` | `via_wake_kind text` exists (`:281`) — and no close verb ever populates it (F6) |

### 1.3 The triggers that decide what may move during a close

- **`_tf_period_wall()`** — `0056:643`; trigger `t_period_wall` on `journal_entries`
  (`0056:711`). Serializes on advisory `203005007`, then **refuses every approved-class touch
  dated inside a `closing`/`closed` FY with CLR19** unless an unforgeable
  `close_write_permits` row created by *this* transaction matches (`0056:684-700`).
- **`_tf_period_wall_lines()`** — `0056:717`; trigger `0056:755`.
- **`_tf_close_serialize()`** — `0056:765`; installed on **eight** tables (`0056:775-802`):
  `open_item_allocations`, `bank_statements`, `bank_reconciliations`, `bank_line_exceptions`,
  `fixed_assets`, `bank_accounts`, `client_facts`, `document_filings`. It **serializes only,
  never refuses** — `0056:759-764` says so in words.
- **The named residual, in the estate's own words** (`0056:794-796`): *"clara.documents carries
  NO client_id (dropped at 0007), so it cannot ride this trigger — the one unserialized
  gate-input path is 0038's `financial_date` correction on an already-filed document."*
  **That is the same column finding F3 turns on.**

### 1.4 The gate evaluators

`_close_gate_depreciation` `0056:1241` · `_close_gate_closing_stock` `0056:1277` ·
`_close_gate_drafts` `0056:1316` · `_close_gate_bank_items` `0056:1335` ·
**`_close_gate_uncoded` `0056:1381`** · `_evaluate_one_gate` `0056:1425` ·
`_evaluate_close_gates` `0056:1476` · `_gate_outstanding_items` `0056:1790`.

---

## 2 · The findings that bind the design

### F1 — the three close READERS cannot be "re-granted"; the contract's recipe fits exactly one function

The contract says *"`get_close_plan` / `get_close_readiness` / snapshot-family reads
**re-granted per 0064/0057's own reversal recipes** (one-line grant + T17 roster pin naming the
shipped consumer)"*. At the bytes that recipe holds for **`get_close_plan` alone**.

- `get_close_plan` resolves its caller through **`clara.actor_firm_id()`** =
  `coalesce(clara.wake_firm(), clara.jwt_firm())` (`0002:440-443`), and `0064:44-52` states the
  reversal in its own words: *"re-adding clara_agent_ro's EXECUTE grant WHEN a real agent-lane
  consumer ships is a one-line grant statement plus a T17 roster pin naming that consumer — no
  change to this function's body."*
- **`get_close_readiness` (`0056:2623`), `verify_close` (`0056:2535`) and `list_fiscal_years`
  (`0056:2670`) all open with `clara._human_ctx(...)`** — JWT claims. `0064:29-38` names the
  consequence: *"an agent-role grant on a JWT-trusting body is either dark or a cross-tenant
  read for a session that forges request.jwt.claims; retrofitting one of those bodies for an
  agent grant later would mean **rewriting the body**, not just the grant."*
- `packages/db/tests/rig-meta.mjs:95-97` re-states it as a measured fact: *"verify_close,
  get_close_readiness and list_fiscal_years are all agent_ro=false."*

**Consequence:** three of the four reads the contract promised are **new sibling bodies**, not
grants — which is TA-P1's rider ("new authority = wake sibling verbs, never rewrite live human
bodies") arriving from the opposite direction and agreeing.

### F2 — the two-person close wall SILENTLY PASSES on an agent-prepared year

TA-P6's named failure, at the bytes. `finalize_close`'s segregation block, `0056:2115-2137`:

```
select je.* into v_prep from clara.journal_entries je
  where je.client_id = v_fy.client_id
    and je.posting_date between v_fy.starts_on and v_fy.ends_on
  order by coalesce(je.approved_at, je.updated_at) desc, je.id desc limit 1;
v_preparer := coalesce(v_prep.last_human_editor, v_prep.maker_actor);
if clara.eligible_checker_count(c.firm) >= 2 then
  if v_preparer is not null and v_preparer = c.actor then raise ... close_segregation_violation
  v_mode := 'two_person';
```

On the F-A2 agentic lane the last entry of the year carries `maker_actor =
clara.agent_user_id()` (`0002:334-335`, the pinned uuid `…c1a7a0`) with `last_human_editor
is null`, so `v_preparer` **is the agent**; `v_preparer = c.actor` is false for every human
closer; the branch is taken; the receipt is stamped **`two_person`**. Nothing raises. The wall
does not fail loudly — it **stops asking**, and the receipt then asserts a two-human review
that never happened.

The domain that must carry the honest third value is the CHECK at `0056:1520`. The same
two-value vocabulary is duplicated on the report-issue side at `0065:384` and `0072:101,107`
— **named here as F-A5's surface, not claimed here**.

**And on a THIRD site that IS F-A4's** *(v1.2, gate GM-5 — v1.1 missed it)*:
`reopen_fiscal_year` computes the same two-value label in its own body at **`0085:344-345`** —
`v_self := v_checked is null or v_checked = c.actor;` then
`v_mode := case when v_self then 'solo_self_attested' else 'two_person' end;` — from inputs at
`0085:320-322`, and INSERTs it into the **same `close_receipts.segregation_mode` column under the
same CHECK** (`0056:1520`) at `0085:447`/`:454`. `packages/db/tests/x85-b3-reopen-ends-on.test.mjs:430`
asserts "the RECEIPT records the determination". So a reopen of a year Clara prepared records
`two_person` today, for exactly F2's reason — and this body is already opened by PR-1b for Fix
A's mirror, so it is F-A4's surface, not F-A5's.

### F3 — the uncoded-voucher gate is VACUOUS on a NULL `financial_date`, and the miss is permanent

`_close_gate_uncoded` (`0056:1381-1411`) scopes its population with
`and d.financial_date between v_fy.starts_on and v_fy.ends_on` (**`0056:1397`**).

- **`documents.financial_date` is a nullable column added by ALTER** (`0007:38`:
  `add column financial_date date`) and is only ever **backfilled opportunistically** from an
  extraction's own invoice date — the identical
  `financial_date = coalesce(v_date, financial_date)` statement at `0009:2104`, `0011:234`,
  `0013:148`, `0015:3191`, `0016:3669`, `0022:636`, `0023:1168`, `0026:916` and the live
  witness writer `0096:247`. **No writer requires it.** A filed document whose extraction
  produced no date — a bank letter, a payslip, a contract, a failed extraction — carries NULL.
- `NULL between x and y` is NULL, not TRUE, so such a filing is **invisible to the gate**, and
  the gate returns `state='pass'` on a client whose books are demonstrably incomplete.
- The migration's own comment (`0056:1387-1390`, and again at `0056:1403-1405`) makes the miss
  **permanent**: the gate is date-scoped so *"a NEXT-FY document must never block THIS year's
  close"*, and *"the date scope makes the miss permanent"* — no later close asks again.
- The one write that moves a document into or out of the population is the `financial_date`
  correction, which is **the single unserialized gate-input path the close model already
  names** (`0056:794-796`).

This is the drawer-2 gate TA-P14 assigns to F-A4 by measurement origin (agenda `OQ-A4-12`);
the bank half is F-A3's and the drawer-1 P-3 zero-census stays F-T4's.

### F4 — `begin_close` arms CLR19 against the very remediation the drawer-2 gates demand

`begin_close` flips the year to `closing` (**`0056:1770`**) and inserts the run
(`0056:1771-1773`) **before** evaluating any gate (`0056:1774`). From that moment
`_tf_period_wall` refuses every approved-class touch dated inside the FY with **CLR19
`write_into_closed_period`** (`0056:696-700`) unless a close-write permit for
`close_entry`/`reopen_reversal` matches — and no permit exists for ordinary remediation. The
estate's only way back is `abandon_close` (`0056:1943`), which flips the year to `open`
(`0056:1983`); the next `begin_close` mints a *new* run.

**Consequence:** under key ①, the preparation surface must run on an **open** year, and
`begin_close` is the **last** act of preparation, not the first. But the gates can be measured
only **inside a run** — `_evaluate_one_gate(p_run, p_check_key)` resolves the run first
(`0056:1430`) and INSERTS a `close_gate_results` row (`0056:1462-1467`) — so today there is no
way to ask *"is this year ready?"* without arming the wall.

### F5 — `abandon_close` flattens `reopened` → `open`, erasing key ③'s tell

`abandon_close` sets the FY to `'open'` unconditionally (`0056:1982`), and `list_fiscal_years`
carries a separate `has_active_reopen_receipt` key (`0056:2681`) precisely because
*"abandon_close flattens reopened->open by design (no mechanism keys on the distinction;
provenance lives in the receipt chain)"* (`0056:2678-2680`). A run standing on a **reopened**
year is therefore a run whose abandonment removes a human key-③ act's visible state (the
receipt chain survives; the year's status does not). Agenda `A4-M4`.

### F6 — every close act's audit row hard-writes `on_behalf_of` and `via_wake_kind` as NULL

`clara._audit(p_firm, p_actor, p_obo, p_wake_kind, p_fn, p_entry, p_args)` (`0004:35-41`)
writes all four columns. Every close verb calls it with **literal nulls in both slots**:
`begin_close` `0056:1775`, `abandon_close` `0056:1983`, `finalize_close` `0056:2343`. And
there is **no model column, no version column and no rationale column anywhere** in
`audit_log` (`0002:276-288`). TA-P4's A4-M5 — *freeze/abandon carry model+version+rationale,
`via_wake_kind` no longer hard-written NULL* — has **no carrier in the estate to extend**.

### F7 — the durable proposal carrier does not exist, and `open_questions` structurally cannot become one

- `open_questions.scope_kind` is a closed world of three (`0011:800`) and
  `ck_open_questions_scope` (`0011:822-829`) **forces `scope_id` to equal `document_id`,
  `counterparty_id` or `client_id`**. There is no fiscal-year column and no FK to
  `clara.fiscal_years`; a year-scoped proposal has nowhere to put its subject.
- The human answer door `resolve_open_question` (`0011:2007`) records a **text resolution
  only** — it cannot carry a gate digest, a drafted attestation set, or a model snapshot.
- One useful adjacent fact, positively read: `_open_question_blocks` (`0012:88-108`) enumerates
  its three scopes **positively** in the WHERE clause (`0012:101-105`), so a fourth
  `scope_kind` value would **not** block posting. Extending the enum is therefore *safe* for
  F-A2's B9 rung — it is merely **insufficient**, which is a different objection and the one
  that decides the design (D-06).

### F8 — of the seven human close doors, the product ships THREE reads and ONE write

`apps/dashboard/app/close/closeApi.ts` calls exactly `list_fiscal_years` (`:28`),
`get_close_plan` (`:137`) and `attest_close_exception` (`:151-166`), rendered by
`apps/dashboard/app/close/page.tsx` (415 lines; the attest control at `:379-415`). A
repo-wide search for a caller of `begin_close`, `abandon_close`, `finalize_close`,
`reopen_fiscal_year` or `open_fiscal_year` outside `packages/db/tests/**` and `docs/**`
returns **nothing**; `0085:54` states it for its own verb: *"No runtime or dashboard caller
exists today."* The human half of the close is reachable only by hand-rolled RPC.

### F9 — `begin_close` and `abandon_close` demand key ②'s capability, so E-R11's bookkeeper floor is decorative

`begin_close` (`0056:1729-1734`), `abandon_close` (`0056:1950-1954`) and `finalize_close`
(`0056:2014-2019`) all raise CLR04 `capability_missing` unless
`_has_capability(firm, actor, 'close_and_attest')` (`0056:1114-1126`), which resolves to an
explicit grant **or** literal firm-`owner` membership. The `_human_ctx(bookkeeper)` floor above
it therefore decides nothing for keys ①. TA-P6 leaves this **untouched** (agenda `OQ-A4-6`
option A: the human side does not move a word), and F-A4 must not quietly fix it.

### F10 — a clock already exists in the estate; a clock that WAKES CLARA does not

`packages/runtime/lib/leader.mjs` runs a single-leader loop with **SIX daily cadence belts**,
each a finite-guarded interval with a stated fallback: autopost-rule expiry (`:41`), the SST
repair belt (`:47-48`), the wiki lint belt (`:52-53`), **the depreciation run belt** (`:58-59`),
**the recurring-adjustment belt** (`:65-66`) and the render enqueue (`:72-73`), fired from one
cycle at `leader.mjs:176-195`. Every one of them calls a DB verb **directly under
`clara_runtime`**; none mints a wake credential and none enqueues an agent task. The only
credential mints in the runtime are
`mintWakeCredential` / `mintWakeCredentialObo`
(`packages/runtime/lib/pools.mjs:304-334`), both hard-coded to `"interactive"`, plus the
autodraft mint inside the workflow
(`packages/runtime/workflows/autoDraft.v1.infra.ts:51-60`).
**TA-P5's "one time-triggered wake source" is therefore a new WAKE on an existing CLOCK** —
the honest description, and it materially reduces the cost the sitting priced.

### F11 — the DB, not the runtime, owns "when is something due"

`0041:3613-3615` states the standing rule for the depreciation sweep in its own words:
*"THE SWEEP'S DUE PROBE … **DB-OWNED DUE ARITHMETIC — the runtime must not compute a period,
because a period is a figure.** Reachable by the leader (no JWT) and by the dashboard (JWT,
firm-checked)."* The shipped shape is `clara.depreciation_run_due(uuid)` (`0041:3617`),
twinned by `clara.adjustment_run_due(uuid)` (`0045:5513`, grants `0045:6740-6741`). Any F-A4
clock must follow it: the *date arithmetic* lives in a DB oracle; the leader only asks.

### F12 — both calculable-adjustment machines already exist, both are ALREADY SWEPT DAILY, both already gated on a HUMAN-signed authority

- **Depreciation.** `run_depreciation_period(uuid,date,date,text)` (`0041:3580`) is the
  no-JWT machine path — **already granted to `clara_runtime`** (`0041:4434`) — delegating to
  the shared ungranted `_fa_run_period_core` that the human twin `run_depreciation_manual`
  (`0041:3598`) also calls, *"so a manually-run period and a swept one are the same act with
  the same evidence"* (`0041:3595-3597`). What it executes is a **live**
  `fa_depreciation_authorities` row (`0041:614`; one live row per client by partial unique
  index `0041:642-643`), signed by a human.
- **Recurring/reversing adjustments** — the prepayment-amortisation substrate.
  `run_adjustment_occurrence(uuid,uuid,date,date,text)` (`0045:5301`) is likewise granted to
  `clara_runtime` (`0045:6737`), twinned by `run_adjustment_manual` (`0045:5319`), driven by
  `clara.adjustment_templates` (`0045:1139`) whose `cadence in ('monthly','annual')` (`:1145`),
  `lines jsonb` (`:1148`) and `content_hash` (`:1151`) freeze at signature
  (`sign_adjustment_template`, `0045:4264`).

**And both are already RUNNING, unattended, every day.** `reconciler-fa.mjs` reads every active
client (`:64`), asks `depreciation_run_due` per client (`:111`) and calls
`run_depreciation_period` (`:132`) in a bounded chase that clears **several already-overdue
periods in one sweep** (`:29-35`); `reconciler-adjustments.mjs` is its twin (`:11`, `:21-27`,
`:37-47`). **Consequence:** TA-P2's "calculable adjustments post automatically" is, for these
two families, **already true wherever a signed authority or template exists** — F-A4 must not
re-announce it as new. What is genuinely missing is (a) a **close-time** catch-up she can run
inside the preparation transaction instead of waiting for tomorrow's belt, (b) a chase when
**no** authority exists (the belt is silent by design — `reconciler-fa.mjs:129` breaks the
chase), and (c) a versioned evaluator that can MINT a prepayment schedule's `lines`
deterministically, which **nothing in the estate does today**.

### F13 — the two daily posting belts have ZERO close-awareness, and a freeze strands them silently

`clara.depreciation_run_due` (`0041:3617`) delegates to `_fa_oldest_unmet_period`
(`0041:1904`); **neither 0041 nor 0045 contains the string `fiscal_year`, `closing` or
`close_write_permit` in any evaluator** (repo-wide grep over both files) — they predate the
0056 close model and know nothing about it. So once a year is `closing`/`closed`:

- an overdue period **inside** that year stays `due:true` forever (the oracle has no FY
  predicate), and `run_depreciation_period`'s post is refused by `_tf_period_wall` with CLR19;
- the refusal **throws**, is swallowed by the per-client try-catch at
  `reconciler-fa.mjs:154-157`, counted `faFailed`, printed as one log line, and **retried every
  day forever** — `faOk` stays true, so the cadence gate never notices;
- nothing reaches a human: there is no event, no open question, no dashboard surface.

Today this is nearly unreachable, because **no shipped door freezes a year at all** (F8). F-A4
makes freezing routine and clock-driven, so F-A4 is the item that must say what happens to a
belt-due period trapped behind its own freeze. The adjustment belt is the identical twin.

### F14 — nothing in the estate links a wake credential to its agent task

TA-P4 (2) requires the receipt's who/why/from-where to bind to the **triggering wake task**.
At the bytes there is no such link to read:

- `clara.wake_context()` — live tip `0011:1133`, **no later `create or replace`** — returns
  exactly five columns: `credential_id, wake_kind, firm_id, on_behalf_of, client_id`
  (`0011:1134-1135`).
- `clara.wake_credentials` (`0002:230-240`) has **no task column**; `clara.agent_tasks`
  (`0006:138-158`, altered only at `0009:809` and `0011:637-638`) has **no credential column**.
  A repo-wide grep for a `credential_id` on either table returns nothing.
- `mint_wake_credential(text,uuid,uuid,interval,uuid)` (live tip `0011:1156`) takes kind, firm,
  on-behalf-of, ttl and client — **no task**.

So the binding is not a read, it is a **build**: something must record the task at mint time.
And `wake_context()`'s return shape is the widest-reach body in the wake estate (every wrapper
selects it), which is exactly the body TA-P1's rider says not to rewrite. Design D-13.

### 2.1 · The PR-0 gate's own byte findings (v1.2 — labelled G1-G4, as design §2 cites them)

- **G1 — `adjustment_run_due` cannot be reached from the wake lane.** `clara.adjustment_run_due`
  (`0045:5513`) performs `clara._assert_due_read_ctx(v_firm)` as its first act (`0045:5525`),
  before any branch returns. That body (`0042:437-454`) admits, when `clara.jwt_sub()` is null
  (`:441`), **only** `current_setting('role')='clara_runtime'` or
  `session_user in ('clara_runtime','clara_runtime_login')` (`:443-444`), and otherwise raises
  CLR03 `'no valid read context'` (`:447`). The wake write pool connects as
  `clara_wake_write_login` and `SET ROLE`s `clara_wake_interactive`
  (`packages/runtime/lib/pools.mjs:58`, `:373`) and sets no JWT claim (`setupSql()`, `:136-141`).
  **The FA twin is unaffected:** `depreciation_run_due` (`0041:3617-3630`) only compares a
  non-null `jwt_firm()`, so a null one skips the guard.
- **G2 — two "unchanged" delegates open `_human_ctx`, and one of them already has a core.**
  `snapshot_state` `0057:578`; `propose_fiscal_year` `0056:1634` (granted, `:1655`), called
  in-body by `open_fiscal_year` at `0056:1697` under its own `_human_ctx(admin)` (`:1665`).
  `clara._snapshot_state_core(uuid)` exists ungranted at `0057:564`. See §1.1's corrected rows.
- **G3 — the capability gate is the first statement below the `_human_ctx` line.** `begin_close`
  `0056:1728` then `:1729-1733`; `abandon_close` `:1949` then `:1950-1954`. `_has_capability`
  (`0056:1114-1126`) resolves true only on a live `firm_capability_grants` row or literal
  firm-`owner` membership; the sole writer of that table is `grant_firm_capability` (`0056:1130`),
  the agent uuid is seeded as a bare `clara.users` row (`0002:334-335`, `:549-551`), and
  `create_firm` (`0004:318`) refuses to let it own a firm.
- **G4 — a new `agent_tasks.kind` is unbornable and unexecutable on the CHECK alone.**
  `_tf_agent_task_insert` dispatches on `kind` and ends `else raise 'unknown task kind %'` CLR10
  (`0011:1241`); `_tf_agent_task_update` ends `else false` (`:1277`) → CLR13. The `wake` arm forces
  birth `held` (`:1230`) and permits only `held→cancelled` (`:1271`) — a task nothing executes.
  The `autodraft` arms (`:1231-1238`, `:1274-1277`) are the executable precedent.

---

## 3 · The closed-world censuses that will break

Every row is an **extend-never-weaken** obligation: re-cut the assertion to its new truth with
the old truth still asserted wherever it still holds — never deleted, never loosened.

| # | census | site | why it moves |
|---|---|---|---|
| C1 | `CLOSE_VERBS` + the agent/wake zero-EXECUTE sweep (A9) | `packages/db/tests/x56-independent-cells.test.mjs:141-176` | the ten human verbs keep **zero** agent grants — unchanged, and that is the point; the new WAKE siblings need their own positive twin |
| C2 | `CLOSE_MODEL_0056_HUMAN_FNS` (12 names) | `packages/db/tests/rig-meta.mjs:81-87` | a new roster block for F-A4's wake verbs; the 0056 block stays byte-identical |
| C3 | `CLOSE_PLAN_0064_HUMAN_FNS` + T4's negative grant assertion | `rig-meta.mjs:157`; `packages/db/tests/theta-close-plan.test.mjs:254-278` | only if the design grants `get_close_plan` to `clara_agent_ro` — design D-04 does **not**, so this row stays green and is listed to prove the choice was measured, not missed |
| C4 | `CLOSE_MODEL_0056_CLOCK_NAMES` (5 lawful bare-clock readers) | `packages/db/tests/x42-s5-helpers.mjs:232-236` | every new close-side writer stamping `now()` joins the declared list |
| C5 | the approve-writer census (5 pre-B3, 6 post-B3) | `packages/db/tests/x42b0-r8-tails.test.mjs:201-233` | **must NOT move** — F-A4 adds no approve-class writer. A move is a finding |
| C6 | `PROJECTED_KEYS['get_close_plan']` | `apps/dashboard/app/shared/dbSeamCensus.bindings.ts:245` | any key added to the plan document fails the build until this line is regenerated; a stale entry fails it too |
| C7 | `OPAQUE_READS['get_close_plan']` | `dbSeamCensus.bindings.ts:59` | unchanged unless the plan gains another record projection |
| C8 | `wake_fn_allowlist` count/kind assertions | `0011:4169-4175` (in-migration); role rosters `0042:5394`, `0044:6363` | a new wake kind adds rows; the "exactly 6 autodraft" assertions are per-kind, so extension is additive |
| C9 | the two `wake_credentials` CHECKs + `mint_wake_credential`'s in-body kind list | `0011:623-624`, `0011:625-628`, `0011:1163` | **F-A2's PR-1 already swaps both for `interactive_client`** (`f-a2-annexes-1-estate.md` A.1 finding 7) — F-A4 extends the *post-F-A2* text. Hard ordering dependency |
| C10 | `agent_tasks.kind` CHECK (`chat_turn`,`wake`,`autodraft`) | `0011:638-639` | a clocked close-prep task needs a kind |
| C11 | 0056's S11.5 privilege sweep (8 signatures) | `0056:3134-3164` | **historical** — runs only at that migration's apply, and it pins `reopen_fiscal_year(uuid,text,jsonb,text)`, a signature `0085` has since dropped. Named so nobody re-derives a live truth from it |
| C12 | 0064's S2.2 grant matrix | `0064:320-338` | historical, same posture |
| C13 | `mint_wake_credential`'s live signature `(text,uuid,uuid,interval,uuid)` | `0011:1195-1197`; runtime callers `pools.mjs:304-334` | F14's task binding adds a **sibling** mint (D-13), so this signature must still read exactly as found — a moved signature is a finding |
| C14 | `wake_context()`'s five-column return | `0011:1133-1135` | the census that proves the widest-reach wake body was NOT rewritten; it must read five columns after F-A4 as before |
| **C15** | the `close_gate_checks` seed — **13 rows** (6 drawer-1 · 5 drawer-2 · 2 drawer-3) | `0056:390-407`; every "thirteen gates" assertion in the x56 battery | *(v1.2, gate GM-4)* the repair adds a **fourteenth** row, `undated_documents`, by INSERT — lawful, since `t_close_gate_checks_append_only` traps only UPDATE/DELETE (`0056:378-379`). Extend the count assertions; the thirteen originals stay named |
| **C16** | the `agent_tasks` trigger `kind` dispatches — a closed world of three, each with a terminal refusing `else` | `_tf_agent_task_insert` `0011:1200-1246` (`else raise`, `:1241`); `_tf_agent_task_update` `0011:1248-1285` (`else false`, `:1277`) | *(v1.2, gate G4)* a fourth kind needs an arm in BOTH bodies or it can neither be inserted nor transition. **This is a closed world the CHECK census does not cover** — the CHECK and the trigger are two enumerations of one fact |

---

## 4 · The human-lane facts F-A4's new doors must respect

- **`attest_close_exception` is the only shipped write door** on `/close`
  (`closeApi.ts:151-166`), and the page's attestable-state list is derived from the verb's own
  accepted states (`page.tsx:59-63`).
- The page renders **shape + label, never hue-only** (`page.tsx:39-56`) and **computes no
  cents** (`page.tsx:11-13`). New doors inherit both.
- The dev-auth seam is a pasted JWT in `sessionStorage` under `clara_dev_jwt` (**`page.tsx:39`**
  — v1.1 cited `:37`) — plumbing grade, shared with `/chat`, `/documents`, `/queue`, `/rules`.
- **A client-switch race guard already exists** and every new panel must ride it: an
  AbortController per effect, a monotonic generation ref checked before any `setState`, and the
  render-time `visiblePlan` belt that cross-checks the plan document's own
  `fiscal_year.client_id` (`page.tsx:15-27`).

---

## 5 · Task #17 Fix A — the shared body, at the bytes

- The closing entry is born at **`0056:2242-2246`**; its INSERT column list is
  `(id, client_id, status, posting_date, memo, origin, is_year_end, maker_actor,
  last_human_editor, close_receipt_id)` — **`closing_transfer` is absent, so it defaults
  `false`** (`0016:51`).
- The B3 reopen mirror is born at **`0085:379-386`**, copying `o.is_year_end` from the original
  and likewise never setting `closing_transfer`.
- The SST turnover evaluator excludes on the CONJUNCTION at **`0016:602`**:
  `and not (e.is_year_end and e.closing_transfer)`; the column's intent is stated at
  `0016:45-51`, and `0016:210-219` records that marking a POSTED entry afterwards is
  impossible.
- `PROGRESS.md:150-163` carries the ruling (ADR-0072 ④) and the shape: **both writer bodies in
  ONE migration**, because a single-body fix inverts the defect into compounding inflation.

**So three separate obligations land on `finalize_close`'s body** — Fix A's `closing_transfer`,
TA-P6's segregation re-aim, TA-P4's authorship columns — and a fourth on
`reopen_fiscal_year`'s. One migration, one D1 write-quiesce window, strict ordering.

---

## 6 · The N4 re-scan (TA-P14 clause 6)

**N4's content is lost.** `PROGRESS.md:64` records only the disposition (`N4→F-A4`); no
surviving file states what N4 said. Per TA-P14 (6) it is **treated as lost, its id RETIRED,
and this survey's re-scan of the same surface registers what it finds under new ids.** The
re-scan covered `0056`, `0057`, `0064`, `0085`/`0086`, the `/close` dashboard surface and the
x56 / theta / x85 batteries, plus the leader's belts and their reconcilers.
**Rediscoveries: F2, F3, F4, F5, F6, F9, F13.** Whether any of them
*is* N4 is unknowable and is not claimed.

---

## 7 · Predictions the rig replay must settle

Nothing below was measured — this lane had no rig and no database. Each is a **prediction with
the instrument that settles it**; every design decision resting on one says so at its site.

| # | prediction | instrument |
|---|---|---|
| P1 | On a fully-migrated rig, `_close_gate_uncoded` returns `state='pass'` for a client holding a live `document_filings` row whose document has `financial_date IS NULL` and no journal entry | plant the fixture, call `_evaluate_one_gate(run,'uncoded_documents')`, read `state` |
| P2 | On live BELCORT books the count of live filings whose document has NULL `financial_date` is **> 0** — the population the repaired gate flips red | rolled-back read-only live read, per client |
| P3 | With an agent-authored last entry in the FY and two eligible human checkers, `finalize_close` completes and stamps `segregation_mode='two_person'` (F2's silent pass) | x56-class cell: agent-maker fixture → finalize → read `close_receipts.segregation_mode` |
| P4 | After `begin_close`, an ordinary `approve_entry` on a draft dated inside the FY raises **CLR19 `write_into_closed_period`** (F4) | behavioural cell; half-proven already at `x56-rest-b.test.mjs:270-277` |
| P5 | `_evaluate_one_gate` cannot produce a usable verdict without a `close_runs` row | call with a bogus run id; expect a failure or an empty measure, never a verdict |
| P6 | A `scope_kind` value outside the three enumerated in `_open_question_blocks` does not block a post (F7's adjacent fact) | insert with the extended CHECK, then run F-A2's B9 rung |
| P7 | `clara.agent_user_id()`'s uuid resolves to a `clara.users` row with `is_agent = true` | catalog read; `0002:549-551` seeds it |
| P8 | No live `close_runs` row exists on any real firm today, so the D1 window disturbs no in-flight close | rolled-back live read immediately before the ceremony |
| P9 | The rig's existing document fixtures all carry a non-NULL `financial_date`, so F3 needs a NEW fixture to be exhibited | fixture audit of `packages/db/tests/rig-docs-fixtures.mjs` |
| P10 | `clara.fiscal_years` holds zero rows on live BELCORT (the close model is live-inert — `0064:342` says so of the plan read) | rolled-back live read; if false, the acceptance plan changes |
| P11 | `reopen_fiscal_year`'s live signature is the 5-arg `(uuid,text,jsonb,text,text)` and the 4-arg form does not exist | `to_regprocedure` on both forms (the x56 battery already asks the catalog, `x56-independent-cells.test.mjs:162-163`) |
| P12 | `run_depreciation_period` executes with no JWT under `clara_runtime` on a client with a live authority, and refuses on a client with none | role-scoped behavioural pair |
| P13 | **F13 behaviourally:** with an overdue period inside a `closing` year, `depreciation_run_due` still answers `due:true` and `run_depreciation_period` raises CLR19 | plant a late-registered asset with a prior in-service date, `begin_close`, then call both verbs under `clara_runtime` |
| P14 | The same fixture leaves `faOk` true and the belt's only trace is a log line (no event row, no open question) | run `runFaSweep` against the fixture and read `clara.events` + `clara.open_questions` for the client — both unchanged |
| P15 | The adjustment belt behaves identically (`run_adjustment_occurrence` refused CLR19, `adjustment_run_due` still due) | the twin fixture with a signed monthly template |
| P16 | No live `wake_credentials` row can be joined to an `agent_tasks` row by any column pair (F14) | catalog read of both tables' columns on a migrated rig |

---

## 8 · What this survey deliberately does NOT cover

The **bank** drawer-2 gate and its measurement origin (F-A3, per TA-P14's split of the
double-claim) · the **drawer-1 P-3** bank registry-vs-ledger zero-census (F-T4) · the
report-issue segregation wall's solo arm (**F-A5** — it shares TA-P6's vocabulary and is named
at `0065:384` / `0072:101-107`, but its body and battery are F-A5's) · the SST engine's own
turnover semantics (F-T1) · `except_bank_line` (F-A3).

**Two exclusions v1.1 claimed and v1.2 WITHDRAWS** (gate GM-5/GM-6):
- ~~`reopen_fiscal_year`'s segregation vocabulary is F-A5's~~ — it is **F-A4's**: the `0085:344-345`
  site writes the same `close_receipts` column under the same CHECK, inside a body PR-1b already
  opens (§2's F2 addendum).
- ~~`mint_month_snapshot` stays a human act; the contract gives the agent the read half only~~ —
  **false against the amended contract.** `wave-f-contract.md:154-156` and ADR-0074's TA-P1 C list
  (`0074-the-track-a-sitting.md:31-33`) both hand Clara **"minting the month snapshot"**; the
  design builds it as wrapper 13 (design §3.11, D-21). The sentence was true of the pre-amendment
  contract text and is struck rather than deleted, so the change is visible.
