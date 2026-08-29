# Billing — the estate survey

> **The estate as-found, for the billing design set 裁-42 ordered** (survey → design → annexes →
> gate; the set PRECEDES P4's checkout tranche). Design input:
> [`billing-model-brief-2026-08-30.md`](billing-model-brief-2026-08-30.md), which carries 裁-42
> verbatim. Rulings that bind: **裁-42** (the model of record, superseding R8c's shape),
> **裁-28** (the amounts are the owner's and are still open), **裁-36** (the tier-3 security gate —
> DPA e-sign + a rate wall, **no trial quota**), **裁-26** (the email-bound admission token),
> **裁-43** (tier-3 is *pay and start*; registration APPROVAL is a tier-2 thing only),
> **R8**(b)/(c) (`harness-audit-rulings-2026-08-26.md` — tier-3 self-serve LIVE AT BETA, the
> shape now superseded by 裁-42). Standing laws: **1** (the DB owns every authoritative number),
> **6** (reverse-not-delete), **16** (effective-dated policy tables), **18** (multi-currency is
> OUT), **22** (a visible record must not lie), **76/81** (meter, never cap; one ledger).
>
> **Written to the estate's survey discipline.** Every claim below is either a **MEASUREMENT**
> (a catalog read on a throwaway rig at main's chain, or a Read of a cited `file:line`) or is
> named a **PREDICTION** — a migration-source read is a prediction about the live catalog, never
> a measurement of it. Absences are only evidence when a read was actually run and returned
> nothing; each one names its search.
>
> **Companions:** [`billing-design.md`](billing-design.md) ·
> [`billing-annexes.md`](billing-annexes.md) · [`billing-gate-record.md`](billing-gate-record.md).
> Cost/market evidence for the amounts sitting:
> [`research/pricing-market-survey-2026-08-29.md`](../research/pricing-market-survey-2026-08-29.md).

**Standing caveat.** The measurements below were taken on a **throwaway `postgres:17` rig** that
ran main's own chain end to end (142 migrations → frontier `0147` → seed), and every `pg_*` read
is against that applied catalog; the container was destroyed afterwards. It is **NOT the
production database**: a body production carries from a hand-applied act would not appear here.
Every claim about a *live production* body is therefore still a **prediction**, confirmed by the
build's own prestate pins — the estate's usual posture (`metering-survey.md`'s standing caveat;
`f-a2-annexes-1-estate.md`'s original). Seed state, for reading the counts below: **2 firms
(neither operator), 3 clients (all `active`), 8 evaluator versions (all platform-scoped), 5
`llm_price_table` rows.**

---

## A · The estate as-found

### A.1 · Firms, memberships, and the role ladder — 裁-42②'s "payments-only" DOES NOT EXIST

`clara.firm_memberships` (`0002_foundation.sql:211-219`) carries a **closed four-value CHECK**:

```
role text not null check (role in ('viewer','bookkeeper','admin','owner'))
```

and `clara.role_rank(p_role text)` (`0002:326-331`) is a pure `IMMUTABLE` SQL ladder —
`viewer`→0, `bookkeeper`→1, `admin`→2, `owner`→3, **NULL for anything else**. Membership
`status` is `active|removed` (`0002:216`) with a partial unique index
`uq_membership_active_user on (user_id) where status='active'` (`0002:222-223`) — **one active
membership per user across the whole estate**, which is the shape the seat count must be
derived from.

**MEASURED ABSENT: there is no `payments_only` role, and no billing-contact attribute of any
kind.** The four labels above are the complete set; a catalog-wide scan for a role relation or a
role→capability mapping returned nothing beyond `role_rank` and the `_human_ctx` floors that
call it. **This is the sharpest finding for 裁-42②**: "viewer and payments-only are free" is
satisfiable today only by reading it as *"every non-paid role is free, and today that is
`viewer`"*. Minting the role is a real RBAC change, not a billing one — see §B finding 1 and
the gate record's OQ-2.

`clara.firms` (`0002:199-206`) carries `id`, `name`, `high_stakes_amount_cents`, `created_at`,
plus **`is_operator boolean not null default false`** added at `0133:273`, with
`create unique index uq_firms_one_operator on clara.firms((true)) where is_operator`
(`0133:274`) — **at most ONE operator firm estate-wide**, and `0133`'s own tail raises if any
firm already carries it. Marking BELCORT is an unperformed owner-timed ops act, filed to the
Wave-G setup checklist by **裁-43**. `0133:288-291` is the operator floor predicate the doors
read (`exists(select 1 from clara.firms where id = c.firm and is_operator)`).

### A.2 · Client status today — and why the owner's "draft" is already built, under another name

`clara.clients` (`0003_books_core.sql:34-40`) is `id · firm_id · name · status · created_at`
(plus later `fy_end_month`/`fy_end_day` from `0041`). Its status CHECK was **replaced at
`0017_wave_b.sql:658`**:

```
alter table clara.clients add constraint clients_status_check_0017
  check (status in ('active','archived','onboarding'));
```

`0017`'s §A O1 (`:23-38`) drops `0003`'s inline system-named CHECK by *finding* it in
`pg_constraint` rather than by name — so the live constraint name is
`clients_status_check_0017`.

**Three states live; 裁-42 names five.** The mapping, measured:

| 裁-42's state | live today | evidence |
|---|---|---|
| `draft` | **YES — spelled `onboarding`** | every granted client-minting surface births `onboarding`: `begin_client_onboarding` (`0017:2505-2506`) and the same-arity compatibility CoR of `create_client` (`0017:2542-2543`), whose own header states the invariant in words: *"There is no granted client-minting surface whose post-image is active or lacks a plan"* (`0017:2528-2530`) |
| `active` | YES | `commit_client_onboarding` sets it (`0017:2823`) after the plan's required items and an opening position are proven |
| `archived` | YES, but reachable from ONE place only | `cancel_client_onboarding` sets it (`0017:2865`), and that door **refuses unless the client is `onboarding`** (`0017:2862`) |
| `scheduled_for_deletion` | **NO — new** | not in the CHECK |
| `purged` | **NO — new** | not in the CHECK |

**MEASURED: exactly two statements in the whole migration tree write `clara.clients.status`** —
`0017:2823` (`='active'`) and `0017:2865` (`='archived'`). The search was
`grep -rn "update clara.clients set status" packages/db/migrations/*.sql packages/db/deploy/*.sql`,
two hits, both above; no `execute format(...)` splice writes the column either.

**The consequence, and it is the survey's second-sharpest finding: THE TRANSITION GRAPH HAS
EXACTLY TWO EDGES.** `onboarding → active` (`commit_client_onboarding`, floor `admin`,
`0017:2751`/`:2760`/`:2823`) and `onboarding → archived` (`cancel_client_onboarding`, floor
`admin`, `0017:2843`/`:2848`/`:2865`, guarded at `:2862` to refuse **CLR10** *"client onboarding
is not open"* unless the client is still `onboarding`). **`active` and `archived` are both DEAD
ENDS** — no code path in the estate moves a client out of either. There is no archive door for
an active client, no reactivation door, no deletion-scheduling door, no purge door. 裁-42⑤ and
⑥ are written entirely on transitions that **have no implementation at all** (§B finding 2).

*(The only other writers of the column anywhere are nine `packages/db/tests` fixture files that
`update clara.clients set status=…` as the root/deploy role against a throwaway rig, bypassing
every app door — not app-facing, but they ARE a closed-world census the status widening will
touch; §C.)*

### A.3 · 裁-42⑩'s three draft caps — MEASURED ALREADY STANDING, all three

裁-42⑩ says a draft client "cannot take bulk documents, cannot use AI and cannot post". **All
three walls already exist**, keyed on a positive `status='active'` requirement — which is the
correct fail-closed shape, and which any new status the design adds fails by construction. Each
row below is a Read of the cited body, with its enclosing verb and its refusal named:

| cap | the wall, at the bytes | refusal |
|---|---|---|
| **documents** | `clara.file_document(p_document, p_client, p_resolution, p_op_key)` — body `0007_document_pipeline.sql:1367` (floor `bookkeeper`, `:1374`), guard `:1386`; **CoR'd at `0009_coding_floor.sql:2299`/`:2311` with the guard byte-identical**, so `0009` is the live tip and the wall is carried forward, not new | **CLR11** *"client not in your firm"* |
| **AI** — two independent walls | (a) `clara.mint_wake_credential(...)`, `0011_daily_loop.sql:1180`, in the `wake_kind='autodraft'` branch — refuses to mint the credential; (b) `clara._tf_agent_task_insert()`, the BEFORE-INSERT trigger on `clara.agent_tasks`, `0011:1237` — refuses the task ROW even if a credential existed. **CoR'd at `0120_f_a4_pr_1b_close_lifecycle.sql:1478`**, which adds a byte-parallel `close_prep` branch carrying the same requirement | **CLR10**, both |
| **posting** | `clara._assert_client_operational(p_client, p_firm)` — `0017_wave_b.sql:1664`, guard `:1673`, whose own message names the rule: *"client is not active — operational consumers exclude onboarding/archived clients (WB-R1)"*. Its caller is `0017:62`'s `do $cor$` splice into **`clara._draft_entry_core(...)`**, the shared core every entry-drafting/posting path routes through; the splice's own comment (`0017:54`) is *"O8.1: generic draft/wake drafting becomes active-only"*, and it **widened** the previous wall from "reject archived only" to "reject anything non-active" | **CLR10** |

Two further shapes, recorded because they are *different animals* and a census that lumps them
would be lying: `clara.run_client_lint(p_client, p_op_key)` (`0017:4672`) **silently SKIPS** a
non-active client — no exception, no errcode, a `status:'skipped'` result — and the sweep
discovery paths exclude non-active clients by a JOIN predicate rather than a refusal
(`join clara.clients oc on oc.id=df.client_id and oc.status='active'`: `0017:179`, `:211`;
`0024:530`; `0025:161`; `0026:377`, `:1399`; `0038:6215`; `0090:1141`), as does the compliance
watch loop (`0016:866`).

**So 裁-42⑩ costs the design ZERO new walls — and that is the finding, not a convenience.**
What it costs instead is a **decision**: the walls are keyed on `status='active'`, so whether
they fire for `scheduled_for_deletion` and `purged` is decided by *how the design spells those
values*, not by any new code. A status the walls exclude is capped; a status they admit is not.
§B finding 3, design §3.3.

**A wall the design must not build.** The fix for any gap is a **status floor**, never a
*billing* floor: no runtime path may read `billing_plans`, an allowance, or a capacity. That is
laws 76/78/81 and P4's own words — §A.7 and §B finding 4.

### A.4 · Tiers — `firms.tier_code` and `clara.firm_tiers` DO NOT EXIST

**MEASURED ABSENT.** The search was
`grep -rn "tier_code\|firm_tiers\|set_firm_tier" packages/db/ apps/ --include=*.sql --include=*.ts --include=*.tsx --include=*.mjs`
— **zero hits in the entire tree**, confirmed against the applied catalog
(`select to_regclass('clara.firm_tiers')` → NULL; `clara.firms` has no `tier_code` column).

P4's design of record (`p4-design-2026-08-27.md` §5) carries them as **BACKEND-ASKS 9, 10 and
11** — the tier catalog (`clara.firm_tiers`, `firms.tier_code` nullable FK), `set_firm_tier`
(operator floor), and a rank floor on `get_llm_usage_summary`. All three are the **flag-hidden
T3 tranche and are UNBUILT**: `0141_p4_tranche1_invite_rbac.sql` shipped identity + invites +
RBAC, `0145_p4_tranche2_registration_operator_alias.sql` shipped registration + the operator
doors, and neither touches tiers.

**Two seams P4 closed in words, which this design inherits as walls** (`p4-design:310-316`):

1. **`firm_tiers.ordinal` is display order and nothing else** — never an entitlement rank,
   never a comparison a guard reads.
2. **"An included allowance is a BILLING figure, not an enforcement input"** — it belongs on
   the invoice, computed against the metering ledger at billing time, and is *deliberately NOT
   a column any runtime path reads*. P4 names the history: **migration `0105` exists because a
   cap was built once and had to be deleted.**

Both bind this design directly, and the second is the acceptance criterion for 裁-42⑦'s "the
service never auto-stops" (§B finding 4).

### A.5 · The usage ledger — what "AI usage" can be denominated in, and the currency trap

F-A9's reshape (`0110_f_a9_llm_usage_reshape.sql`) is live and is the substrate 裁-42 names.
Three objects matter:

**(a) `clara.llm_usage_events`** — the one ledger (law 81). **MEASURED: 18 columns** — `id`,
`firm_id` (**nullable**, R-L10: *a NULL firm is a platform call, never an unmetered one*),
`document_id`, `task_id`, `channel`, `engine_id` (not null), `prompt_hash`, `input_tokens`,
`output_tokens`, `duration_ms`, `outcome` (not null), `created_at` (**default
`clock_timestamp()`**), `call_kind` (not null, default `'document_extraction'`), `client_id`,
`triggering_actor`, `agent_task_id`, `via_wake_kind`, `scope` (not null, default `'firm'`).
**Tokens per engine per firm per month are directly derivable.**

The agent-lane writer is **`clara.record_agent_usage_event(...)`** — EXECUTE-granted to
`clara_runtime` only — reached from `packages/runtime/workflows/chatTurn.v15.usage.ts`
(`recordChatUsage` / `recordFreeformUsage`), which **probes the live signature via
`pg_get_function_identity_arguments` before every call** (`:64`) and refuses rather than write
into a drifted signature. *Naming note, because the two are easy to confuse and one of this
lane's own census passes did: the **verb** is `record_agent_usage_event`; the **table** it
inserts into is `clara.llm_usage_events` (`0110:451`). There is no `agent_usage_events`
relation — spelling is not identity.*

**(b) `clara.llm_price_table`** (`0110:488-508`) — **MEASURED**: nine columns, PK
`(engine_id, effective_from)`, `ck_llm_price_range`, non-blank `engine_id`/`source_note` CHECKs,
non-negative price CHECKs, plus **two indexes** (the PK and
`CREATE UNIQUE INDEX uq_llm_price_open ON clara.llm_price_table USING btree (engine_id) WHERE
(effective_to IS NULL)` — at most one OPEN row per engine) and **two triggers**:
`t_llm_price_table_no_overlap` (`AFTER INSERT OR DELETE OR UPDATE … FOR EACH STATEMENT`, calling
`clara._tf_llm_price_no_overlap()`, so one usage row can never match two price rows) and
`t_llm_price_table_no_truncate` (`BEFORE TRUNCATE`, `clara._tf_no_truncate()`). **Posture,
MEASURED: exactly ONE policy — `clara_fn_owner` ALL, `qual=true` — and grants to
`clara_fn_owner` ONLY; `clara_authenticated` has no table reach at all.** `0110:480-487` states
the reason in its own words: *this is PLATFORM data, it carries no `firm_id`, so a firm-scoped
read policy is not even expressible.*

**MEASURED, and it matters for the billing rate table's key**: the five seeded price rows are
keyed on a **namespaced** `engine_id`, not a bare model name — `gpt-5.6-sol`,
`gpt-5.6-terra`, plus three engine-snapshot aliases of the form
`llm-openai:gpt-5.6-terra:<snapshot>`. A billing rate table keyed on `engine_id` must use the
**same namespacing as the ledger writes**, or a rate row silently fails to match and the call
rolls up unpriced.

**(c) The priced view + the rollup read.** `clara.llm_usage_events_priced`
(`0110:656-679`, `security_invoker = true`, reached only through the DEFINER function) computes
`spend_cents` as `round((in_tok × in_price + out_tok × out_price) / 1e6)`, joined on the UTC
date of `created_at` against the price row's range. `clara.get_llm_usage_summary(p_firm uuid,
p_period date, p_client uuid default null)` (`0110:706+`) is SECURITY DEFINER owned by
`clara_fn_owner`, EXECUTE to `clara_authenticated`, walled by
`p_firm is distinct from clara.jwt_firm()` → **CLR11**, returning
`(scope, call_kind, calls, input_tokens, output_tokens, priced_calls, unpriced_calls,
spend_cents)` for one calendar month, **grouped by scope and call_kind** and publishing
`unpriced_calls` as the tripwire R-L19 keeps.

**THE CURRENCY TRAP, and it is the finding that changes 裁-42's denomination question.**
`llm_price_table.currency` is `text not null default 'USD' check (currency = 'USD')`
(`0110:497`) — a deliberate, named, single-value floor — and its two price columns are
`input_price_cents_per_million_tokens` / `output_price_cents_per_million_tokens`, **in USD
cents**. MYR conversion is a **named non-goal** under law 18 (multi-currency is OUT; the FX
wave is post-G).

So the table is **the VENDOR's COST in USD**, not Clara's price to the firm. Denominating the
owner's allowance in "RM at list price via `llm_price_table`" as-is would do two wrong things
at once: it would bill the firm **at cost** (no margin, and every margin decision would then
live outside the database), and it would need a USD→MYR FX rate that law 18 forecloses. The
recommendation survives — **RM is the right denomination** — but its *source* must be a
separate, Clara-owned, MYR-denominated **billing rate**, effective-dated on the same idiom.
`llm_price_table` stays exactly what it is: the **cost floor** input to 裁-28's amounts
sitting. §B finding 5; design §3.2; gate OQ-1.

**MEASURED ABSENT: no MYR-denominated rate or price relation exists anywhere** that a billing
evaluator could read. The searches: the catalog-wide name scan in §A.10, plus a tree grep for
`price|rate` relations — the only hits are `llm_price_table` (USD, above) and the tax rate
schedules (`sst_rate_schedule`, `sst_threshold_schedule` — percentages and thresholds, not
prices).

**One shape consequence for the evaluator.** `get_llm_usage_summary` groups by
`(scope, call_kind)` and **not by `engine_id`** — so a per-engine billing rate cannot be applied
to its output. The billing evaluator reads `llm_usage_events` itself, grouped by engine. It is
a sibling read, not a reuse (design §3.5).

### A.6 · Stripe — measured absent, in code and in configuration

**MEASURED ABSENT.** No `stripe` or `@stripe/*` dependency in any `package.json`; no `STRIPE_*`
environment variable in any workflow, `.env`-shaped file or deploy manifest; no webhook route,
no checkout code, no client library. The only occurrence of the word in the repo's design tree
is P4's own **NON-GOALS** section (`p4-design-2026-08-27.md:399-400`):

> *"**Payment wiring** likewise: Stripe is the named provider (Q-B), the checkout shell stays
> provider-agnostic, and none of it lands here."*

So the tier-3 checkout is a **P4 UI tranche** that has not been designed against a billing model
because there was none. That is exactly the sequencing 裁-42 fixed, and it means this design set
is writing on a blank page rather than reconciling with a half-built integration.

### A.7 · The operator firm, and how platform-level config is owned today

Two mechanisms exist, and they are different animals:

1. **`clara.firms.is_operator`** (`0133:273-275`) — a single-row flag with a `((true))`-keyed
   partial unique index, i.e. **one operator firm for the estate**. It is a *tenant* row wearing
   a platform hat. It is set by a raw audited ops act (no verb mints it), and it is read as a
   floor by `set_wake_source_enabled` (`0133:288-291`) and by `0145`'s registration approval
   doors. **This is what a billing exemption for BELCORT can key on** (gate OQ-4).
2. **Platform *reference* data** — a relation with **no `firm_id` at all**, FORCE RLS with an
   owner policy only, **no grant to any app role**, read exclusively through a SECURITY DEFINER
   function owned by `clara_fn_owner`. The estate's live examples are
   `clara.sst_threshold_schedule` (`0016_a21_compliance_watch.sql:237-244`, RLS applied by
   `0016:398-411`'s loop) and `clara.llm_price_table` (`0110:480-509`, which cites the former as
   its own precedent). **`billing_plans` is this second shape, not the first** — a price list is
   not one firm's row.

**The invoker trap, recorded because the estate paid for it once.** A `security_invoker` view or
function over an ungranted platform table is a **dead read path**: the base-table GRANT check
runs *before* RLS, and `clara_authenticated` — the only role a human session ever holds
(`apps/dashboard/app/chat/api.ts:5`; non-inheriting, `0002:112`) — raises
`42501 permission denied`. F-A9's gate 1 caught exactly this (`metering-gate-record.md`, fold
GB-3). The design copies the DEFINER shape, not the invoker one.

### A.8 · The effective-dated configuration idiom, and the naming collision to avoid

**A correction to the design input, made here because a survey exists to catch exactly this.**
The brief (`billing-model-brief-2026-08-30.md` §2 item 1) names *"the `fx_rates`/
`sst_rate_schedule` idiom the estate already uses"*. **Both relations are MEASURED ABSENT**:
`select to_regclass('clara.fx_rates')` → NULL and `select to_regclass('clara.sst_rate_schedule')`
→ NULL. The brief's *instruction* is right and unchanged — copy the estate's effective-dated
idiom — but the two relations it points at do not exist, and a builder following the cite would
have gone looking for a template that is not there. **The live precedents are
`clara.sst_threshold_schedule` (`0016_a21_compliance_watch.sql:237-244`) and
`clara.llm_price_table` (`0110:488-509`).**

**And they are not equally defended — copy the stronger one.** MEASURED: `sst_threshold_schedule`
carries **only its composite PK** — no partial-unique "one open row" index, no no-overlap
trigger. `llm_price_table` carries both. For a relation whose rows produce a **money number**,
an overlap is not a hygiene problem: two overlapping rows make one usage row match two rates and
the evaluator silently doubles. The full idiom `billing_plans` and the billing rate table copy:

- **columns** `effective_from date not null`, `effective_to date` (NULL = open);
- **PK** `(key, effective_from)`;
- **a CHECK** `effective_to is null or effective_to >= effective_from`;
- **a partial unique index** on `(key) where effective_to is null` — at most one open row;
- **a statement-level no-overlap trigger** — because `btree_gist` is installed **nowhere** in
  this estate and the estate says so itself (`0056:266-269`, `0057:305-313`), so an
  `EXCLUDE USING gist (… with &&)` would add an extension to a ceremony. Contiguity by
  construction is the house idiom (`metering-annexes.md` D19);
- **a `BEFORE TRUNCATE` no-truncate trigger**, which `llm_price_table` also carries.

**A NAMING COLLISION, named now so no reviewer has to find it.** `clara.onboarding_plans` /
`onboarding_plan_items` / `onboarding_plan_revisions` already exist (`0017`), and
`create_firm`'s live body returns a `plan_id` that is an **onboarding** plan. The billing
configuration relation must therefore never be called `plans`; **`billing_plans` is the
minimum-collision spelling** and every column, comment and receipt should say *billing plan* in
full.

### A.9 · The evaluator freeze idiom — and that it already admits a PLATFORM-scoped evaluator

A billing figure is an authoritative number (law 1 / PRD §6 invariant 1), so the monthly rollup
is a **versioned deterministic evaluator** and joins the freeze family:

- **Naming/shape:** `clara.evaluate_<thing>_v1` (the lint discovers evaluators by that literal
  `clara.evaluate_` prefix), SECURITY DEFINER owned by `clara_fn_owner`; the template is
  `clara.evaluate_metric_v1` (`0059_wave_e_delta_metrics_behavior.sql`, manifest entry
  `frozen-evaluators.json:16-21`).
- **Registration:** a `clara.evaluator_versions` row **in the same migration file** as the
  body. `scripts/check-frozen-evaluators.mjs` scans every migration new-vs-base for a
  create-or-replace of an evaluator and **rejects any that is not accompanied by a new version
  row in that same file** (`check-frozen-evaluators.mjs:17-22`). The manifest
  (`frozen-evaluators.json`, repo root, keyed by qualified function name → `{sha256, migration,
  deployed?, note}`) is append-only vs `origin/main`; removing an entry or rehashing a
  `deployed:true` entry is a hard REJECT; the base-unavailable branch **fails closed** under CI.
  **A `create or replace` of an evaluator that existed at base is REFUSED outright — a
  behavioural change ships as a new `_vN`**, exactly as workflow bodies do (hard constraint 9's
  sibling for evaluators).
- **The DB half** is independent and runs at APPLY time: `clara.verify_evaluator_freeze()` plus
  the `packages/db/scripts/migrate.mjs` hook that runs the verifier between every migration's
  body and its commit (`check-frozen-evaluators.mjs:11-15`).
- **Ceremony:** `--update` re-baselines locally; `--lock-deployed` is the ceremony that locks
  every entry.

**`clara.evaluator_versions.firm_id` is NULLABLE**, with
`unique nulls not distinct (firm_id, evaluator_name, version)` (`0058_wave_e_delta_metrics.sql:213-218`).
A **platform-scoped (firm_id NULL) evaluator version is therefore expressible today**, which is
exactly what a billing rollup is: one mechanism for the whole estate, not one per firm. No
schema change is needed to register it.

### A.10 · No billing prior art anywhere — the closed-world name scan

**MEASURED ABSENT, by catalog scan rather than by grep.** A `pg_class`-join-`pg_namespace` sweep
across **every** schema for `relkind in ('r','v','m','p')` and name matching
`%invoice%`, `%billing%`, `%subscription%`, `%seat%`, `%stripe%`, `%payment%`, `%price%`,
`%plan%` returns **nine rows in total**, and every one is a name false-positive:

| relation | why it matched | what it actually is |
|---|---|---|
| `clara.llm_price_table` | `%price%` | the LLM vendor cost table (§A.5) |
| `clara.llm_usage_events_priced` | `%price%` | its priced view (§A.5) |
| `clara.onboarding_plans` · `onboarding_plan_items` · `onboarding_plan_revisions` | `%plan%` | client-onboarding artefacts; no money or seat column (§A.8) |
| `pg_catalog.pg_subscription` · `pg_subscription_rel` · `pg_stat_subscription` · `pg_stat_subscription_stats` | `%subscription%` | Postgres logical-replication internals |

**Zero rows for `%invoice%`, `%billing%`, `%seat%`, `%stripe%`, `%payment%`, and zero
non-`pg_catalog` rows for `%subscription%`, in any schema.** The migration-source cross-check
agrees: a tree-wide
`grep -rhoE "create table clara\.[a-z_]*(plan|invoice|billing|subscription|seat|stripe|price|payment)[a-z_]*"`
yields exactly `llm_price_table` and the three `onboarding_plan*` relations.

**Every relation this design set names is therefore NEW.** Nothing is adapted, nothing is
retired, and no live money body is recut except the ones §B finding 6 names.

---

## B · The findings that bind the design

1. **`payments_only` does not exist, and minting it is an RBAC change with a live hazard.**
   The role CHECK is closed at four values (`0002:215`) and `role_rank` returns NULL outside
   them (`0002:326-331`). A new label that returns NULL fails every `_human_ctx` floor — the
   member could not even pay; a new label that returns `0` is *silently identical to `viewer`*,
   which grants full read of the books to a billing contact. **`role_rank` is a PERMISSION
   ladder, not a price list** — coupling the paid/free boundary to it (`role_rank(role) >=
   role_rank('bookkeeper')` happens to select exactly {bookkeeper, admin, owner} today) means
   the day a role is inserted into the ladder its **price changes silently**. Spelling is not
   identity, applied to a rank. Design §3.4; gate OQ-2.
2. **裁-42⑤/⑥'s transitions have no implementation at all.** The live graph is exactly two
   edges out of `onboarding`; `active` and `archived` are both dead ends (§A.2). The design
   mints the state machine; it does not adapt one. **This is the item's real width** — four new
   audited doors, not a status column widening.
3. **裁-42⑩'s three draft caps ALREADY STAND, all three, measured** (§A.3) — `file_document`
   (CLR11), the `mint_wake_credential`/`_tf_agent_task_insert` pair (CLR10, two independent
   walls), and `_assert_client_operational` inside `_draft_entry_core` (CLR10, WB-R1). The
   design therefore builds **no new draft wall**. What it must decide instead is whether the two
   NEW statuses are inside or outside the walls' `status='active'` predicate — a spelling
   decision with a refusal consequence, which is exactly the class the estate makes explicit
   rather than leaving to inference.
4. **An allowance is an invoice figure and may never be an enforcement input.** P4 closed this
   seam in words and named the scar (`0105` exists because a cap was built and deleted);
   laws 76/81 rule it. The design's acceptance battery needs a **negative** cell — a catalog
   census that no gate, bound or floor function reads any billing relation.
5. **`llm_price_table` is the vendor's USD COST, not Clara's MYR price.** USD-only by CHECK
   (`0110:497`, measured — no other value is insertable); MYR conversion a named non-goal under
   law 18, and **no MYR-denominated rate relation exists anywhere in the estate** (measured:
   `fx_rates` and `sst_rate_schedule` are both absent, §A.8). An RM allowance therefore needs a
   **separate, Clara-owned, MYR-denominated, effective-dated billing rate**; the USD table stays
   the **cost-floor input to 裁-28's amounts sitting** and nothing else. Its `engine_id` space is
   namespaced (`llm-openai:<model>:<snapshot>`), so the billing rate must key the same way.
   And because `get_llm_usage_summary` groups by `(scope, call_kind)` and **not by engine**, the
   billing evaluator reads `llm_usage_events` directly, grouped by `engine_id`.
6. **The capacity walls recut live bodies, so PR-1 carries a D1 write-quiesce window.** The
   seat wall lands on the membership-minting path (`_add_member_core` / `invite_member` /
   `accept_invite`, `0141:294`, `:348`, `:407`) and the active-client wall on
   `commit_client_onboarding` (`0017:2777-2841`). Both are **judgement logic** (they decide
   whether an act is allowed) and take an independent review pass before merge — review law 1.
7. **Nothing to adapt, nothing to retire.** The catalog scan is closed-world and empty (§A.10):
   every billing relation is new, and no existing money body changes meaning.
8. **The tier tranche is unbuilt, so the design must not depend on `tier_code`.** P4 asks 9-11
   are flag-hidden T3 and absent from the catalog (§A.4). A billing plan reference must be the
   subscription's own column, not a tier code that does not exist — and the two are different
   things regardless: a tier is a *display*, a billing plan is a *price list*.
9. **The operator firm is a tenant row with a flag, not a platform scope.** `is_operator` is a
   `clara.firms` column with a one-row partial unique index (`0133:273-274`), **measured unset
   on every firm**, and its marking is an owner-timed ceremony filed to Wave-G by 裁-43. A
   billing exemption keyed on it is therefore **inert until that ceremony runs** — which is the
   correct fail-closed order only if the exemption's default is "exempt", never "charge".
10. **"Zero" and "not yet ruled" must not be the same value.** P4's own rendering law
    (`p4-design-2026-08-27.md` §4 F, §9) is that every price renders through *"one named
    placeholder component stating the amount is pending; **never a number, and never RM0 or an
    em-dash, both of which read as 'free'**"*. 裁-42's configurability law separately requires
    that **`0` be a legal configured price**. Both hold only if the "amounts are still open"
    state is carried by a **flag distinct from the amount** — a plan whose numbers are zero
    because the owner set them to zero, and a plan whose numbers are zero because 裁-28 has not
    sat, must be distinguishable to the read surface and to the issuance door. Design §3.2's
    `amounts_ruled` flag exists for exactly this, and it is the mechanism that makes 裁-42's
    *"until the amounts land, nothing charges"* structural rather than a discipline.
11. **Role gating is DB-only; there is no TypeScript mirror to keep in step.** Measured: no
    `z.enum`, type alias or role union anywhere in `apps/` mirrors the four labels — the
    frontend shapes affordances and renders the DB refusal verbatim (P4 §4 D: *"affordance
    shaping … is not a security boundary — `_human_ctx` is"*). A seat wall therefore lands in
    ONE place, and a UI that forgets it degrades to a refusal, never to a bypass.

---

## C · Closed-world censuses that will break or need extension

- **`clients.status`'s CHECK is read by name.** `0017`'s own tail asserts
  `conname='clients_status_check_0017'` (`0017:5249`). Extending the status vocabulary is a
  drop-and-add of that constraint, and any later assertion that pins the *name* keeps working
  only if the successor keeps a name a reader can find. The design's migration names the
  successor explicitly rather than letting Postgres system-name it.
- **The membership role CHECK** (`0002:215`) is closed-world by construction and is asserted in
  the db test battery's shape cells. It changes only if OQ-2 rules a new role in — and then the
  `role_rank` recut is the *load-bearing* half, not the CHECK.
- **Nine `packages/db/tests` files write `clara.clients.status` directly** as the root/deploy
  role, bypassing every app door: `rig-events-structure.test.mjs:321` ·
  `wave-b/wb-0018-commit-reasons.test.mjs:94` · `x41-0041-upgrade.test.mjs:265` ·
  `wave-b/wb-0020-authorize.test.mjs:206` · `wave-b/wb-0020-resolver.test.mjs:261` ·
  `wave-b/wb-fixtures.mjs:50` · `wave-b/wb-r2.test.mjs:306` ·
  `wave-b/wb-r1-followon.test.mjs:111` · `packages/runtime/tests/wave-b-lint-belt.test.mjs:62`.
  None is app-facing, but every one writes a value the CHECK must keep admitting — a status
  widening is safe for all nine (it only adds values), while any future *narrowing* is not.
  Budgeted as a read, not an edit.
- **`clara.evaluator_versions` + the freeze manifest** — a new billing evaluator appends one
  version row in its own migration file and one manifest entry; the append-only rule means the
  entry can never later be removed or rehashed once `deployed:true`
  (`check-frozen-evaluators.mjs:17-22`). Measured: all 8 existing `evaluator_versions` rows are
  platform-scoped (`firm_id is null`), so the billing evaluator joins an established shape
  rather than minting one.
- **`rig-meta.mjs`'s function- and table-name rosters** — the estate's habit is that a new
  family of relations and verbs needs its own roster entries, and a roster edit that lands in a
  different PR from the objects it names reddens the estate suite. The design budgets the
  roster edits **in the same PR as the objects**.
- **`S5_25_BARE_TOKEN_ROSTER`** (`packages/db/tests/x42-s5-helpers.mjs:146-177`) is an **exact
  set equality in both directions** between a live regex scan for bodies reading a bare clock
  token and an expected array. The billing evaluator takes `p_cycle_start` as a **parameter**
  and must not read a bare `now()`/`current_date` — both because of this census and because a
  deterministic evaluator whose money number moves with the caller's clock is not deterministic.
  If a built body does read one, the roster is edited **in the same PR, frontier-gated** by the
  `appliedStem('00NN_%')` pattern the helper's own comments require (`:149-160`, `:401-434`) —
  an ungated append reddens the weekly `db-slice-frontiers` leg, i.e. *later*, not on the PR.
- **`get_llm_usage_summary` has no rank floor today** and no frontend consumer. P4's ask 11
  (admin+) is unbuilt. The billing read surface must therefore carry **its own** floor rather
  than assume an inherited one (design §3.8).
