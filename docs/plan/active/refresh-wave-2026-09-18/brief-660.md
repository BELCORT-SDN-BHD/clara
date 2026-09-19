# Brief: #660 — 展示准确的账面现金、期间利润与两条财务趋势

*B2 Client Home — financial summary → corresponding books/report: book cash/bank + period profit, six cash points +
six calendar months of income/expense, each number drillable to the population under it. Spec coverage: user stories
14, 15, 17, 18, 102–106 (`612-body.md:32-35`, `:120-124`); journey B2 (`appendix-C-journeys.md:39`). The controlling
contract is the dashboard-definitions resolution (`comment-5585923205.md`), then spec body §9
(`612-body.md:230-246`). Blocked-by #650 is CLOSED and in `main` as `0214`.*

## Orchestrator decisions (binding)

- **Migration `0232` only**, ONE file `packages/db/migrations/0232_client_financial_pack.sql` (DECISIONS §2, row 0232).
  File order is fixed, copied from `0214_client_work_pack.sql`: house header → prestate `do $p660_pre$` (five
  **measured** pins + the overload wall + the relation preconditions) → `set role clara_fn_owner` (`0214:229`) → two
  relations + integrity trigger → three functions → grants → the event pair → `reset role` (`0214:475`) → tail
  postcheck (`0214:479-597`).
- **Gate stem is stable; the cohort carries the number** (DECISIONS §2.2 — measured: the chain runs in MIGRATION order,
  not alphabetical, and its stems are overwhelmingly unnumbered). Gate module
  `packages/db/tests/client-financial-pack-preintegration-gate.mjs`, appended to `packages/db/package.json`'s **40**-flag
  `"test"` chain **after** `--import ./tests/preview-invite-preintegration-gate.mjs`. It sets exactly one env flag, in
  `client-work-pack-preintegration-gate.mjs`'s shape: `process.env.CLARA_ALLOW_MISSING_CLIENT_FINANCIAL_PACK = "1"`.
  Battery frontier stem `client_financial_pack$` (the shape is `client-work-pack.test.mjs:40`,
  `const STEM = "client_work_pack$"`). `rig-meta.mjs` cohort constant `CLIENT_FINANCIAL_PACK_0232_COHORT`, registered at
  the **three** sites the 0214 cohort uses — declaration (`rig-meta.mjs:2155-2167`), human-fn roster (`:2515-2518`),
  `cohortFailures(...)` call (`:2962`).
- **This branch recuts NOTHING** (DECISIONS §2 row 0232: "none"; SYNTHESIS §2.2 agrees). Five bodies are **read-only
  dependencies**, pinned in the prestate by `encode(sha256(convert_to(prosrc,'UTF8')),'hex')` **measured on `clara_660`**
  and re-asserted byte-identical in the tail: `clara.trial_balance_as_of(uuid,date)` (`0017_wave_b.sql:3572`),
  `clara._metric_selector_account_ids(uuid,jsonb)` (`0058_wave_e_delta_metrics.sql:344`),
  `clara.create_account_set_v1(uuid,text,text,jsonb,boolean,date,text)` (`0058:363`, itself pinned by a `prosrc` sha at
  `0113_f_a5_reporting_agency_pr2b_othercores.sql:46`), `clara.finalize_close(uuid,text,text)`,
  `clara.reopen_fiscal_year(uuid,text,jsonb,text,text)`. A pin transcribed from file text **will not match and 0232
  refuses to apply** (WORK-ORDER rule 8; SYNTHESIS §2.4 rule 3; K4). "This migration recut nothing shared" is then a
  checked fact, not a claim.
- **The three doors, with their floors and grants** (full bodies in §3; signatures are contract): `clara
  .publish_client_cash_account_set(p_client uuid, p_members jsonb, p_effective_from date, p_op_key text) returns jsonb`
  — SECURITY DEFINER, `_human_ctx(clara.role_rank('admin'))`, op-key idempotent, EXECUTE to `clara_authenticated` only;
  `clara.propose_client_cash_accounts(p_client uuid) returns jsonb` — STABLE SECURITY INVOKER, inline **viewer** floor,
  EXECUTE to `clara_authenticated` only; `clara.get_client_financial_pack(p_client uuid, p_as_of date default null,
  p_month date default null) returns jsonb` — STABLE SECURITY INVOKER, `plan_cache_mode = force_custom_plan`, inline
  **viewer** floor, EXECUTE to `clara_authenticated` only. Two relations (`cash_account_set_versions`,
  `cash_account_set_members`), one integrity trigger function, one event pair. **A new parameterisation would be a new
  verb, never a defaulted argument** (SYNTHESIS §2.4 rule 4).
- **D19 (DECISIONS §0), restated as five binding lines.**
  - **D19.a — who decides which accounts are cash: a human, never the code.** Build the governed, versioned **cash
    account set** as this ticket's own relations: `clara.cash_account_set_versions` + `clara.cash_account_set_members`,
    shaped on `0058:104-121`, `member_reason in ('bank_registry','declared_cash','declared_petty_cash')`, **NO
    `is_active` filter anywhere**, integrity trigger on `0058:362`'s pattern. Do **not** ride
    `create_account_set_v1` / `_metric_selector_account_ids`: that resolver filters `a.is_active` **twice** (the
    fail-closed explicit-element check and the final aggregate, `0058:344-358`) and refuses an explicitly named inactive
    account with CLR10 `selector_element_unresolved` — exactly the population AC1 requires — and relaxing it would change
    membership semantics for **every** account set in the estate **silently**, because the freeze checks re-derive from
    stored shas (`verify_account_set_version_freeze`, `0058:362`) and `0059_wave_e_delta_metrics_behavior.sql:251`'s
    evaluator-freeze tail never re-runs the resolver. Petty cash has **no** structural marker and
    `0121_f_a3_pr1b_agent_limb.sql:4749` is house law — *"no name or code heuristic, ever — structure and declared facts
    only"*. A human adds it. (Ratifies gap-660 Q1 / SYNTHESIS D1.)
  - **D19.b — years closed before 0120: disclose, do not repair.** The read discloses `coverage='partial'` with reason
    `closing_transfer_unmarked_history` and repairs **no** historical row. File the repair as a follow-up naming
    `0016_a21_compliance_watch.sql:211-219` (the `closing_transfer_review` notification nobody has discharged) and
    `0120_f_a4_pr_1b_close_lifecycle.sql:518-521` (the column "stayed at its default false forever" before the fix); the
    affected count is read **at release, before the hosted migration, never assumed zero** (DECISIONS §6, §7.4 #11).
  - **D19.c — install Recharts**, only through `pnpm --filter @clara/web ui:add chart`, `--dry-run` first
    (`apps/web/scripts/ui-add.mjs`; `CLARA_UI_ADD_OVERWRITE=1` is **forbidden** on this branch). The orchestrator
    measured the dry run (DECISIONS §6, §7.4 #15): it resolves for `base-nova` (`components.json:3`; `"registries": {}`
    at `:24` — re-measured by the reconciler on this checkout; the draft's `:22` was off by two) and wants `components/ui/chart.tsx` (create) **and `components/ui/card.tsx` (overwrite)**, deps `cn` +
    `recharts@3.8.0`. **Orchestrator correction, measured on this checkout and binding**: the guard's allowlist
    `apps/web/scripts/protected-components.json` holds exactly `components/ui/button.tsx` and
    `components/ui/pagination.tsx`, and `ui-add.mjs:239-248` refuses **only** on an allowlisted file — so it will **not**
    stop the `card.tsx` overwrite. The protection is therefore yours, and it is a procedure, not a hope: (1) run
    `--dry-run` and copy the resolved file list into the report; (2) run the real add **without**
    `--overwrite`/`--yes`/`--all`; (3) immediately `git checkout -- apps/web/components/ui/card.tsx` and prove with
    `git status --porcelain` + `git diff --stat` that the only surviving changes are `components/ui/chart.tsx` (new),
    `apps/web/package.json` and the lockfile; (4) if any OTHER existing tracked file is in the payload, install nothing
    and report. Never hand-write a second chart runtime — `packages/reporting-render/lib/chart.mjs` is the frozen PDF one
    (`frozen-workflows.json`, `deployed:true`): never referenced, never imported, sharing no code with this.
    **The readable table fallback is always rendered** (appendix D row 15, `appendix-D-components.md:65`: Chart is
    *conditional use* "only for a defined time series or comparison with exact period, unit/currency, source and
    freshness plus a readable value/table disclosure. It adds Recharts and cannot invent a metric contract"; also
    `:145`), not an optional nicety.
  - **D19.d — the period selector is built here, on the client home**: the last 13 months + month-to-date, written into
    `?period=`, and Back restores it. No global period shell (that is #612's shell work and would collide with
    #659/#642).
  - **D19.e — viewer floor.** `get_client_financial_pack` and `propose_client_cash_accounts` floor at **viewer**, with a
    cell proving the pack returns nothing a viewer could not already `SELECT`: `0003_books_core.sql:522-525` grants
    table-level SELECT on `journal_entries` / `journal_lines` / `coa_accounts` to the whole `clara_authenticated` role,
    and `:514`'s RLS policy filters by firm only — **no role-rank distinction exists at either layer**. (Orchestrator
    correction of gap-660's citation, measured this pass: the grant spans `:522-525`, not `:519-523`; the firm-scoped
    human policy is `:514`, while `:513` is the owner policy.) The Wayfinder sentence about aligning Viewer reads is
    textually scoped to Firm Home (`comment-5585923205.md`, last bullet) and is **not** the footing here; the grant fact
    is.
- **DECISIONS §6 "D2" — no agent twin.** `publish_client_cash_account_set` gets **no `_for` twin, no wake wrapper, no
  allowlist row** this wave. This is a deliberate departure from a live precedent
  (`clara._agent_create_account_set_core` `0113:145-165` → `clara.wake_create_account_set(...)`
  `0115_f_a5_reporting_agency_pr2d_wrappers2.sql:79-97` → EXECUTE to `clara_wake_interactive`
  `0116_f_a5_reporting_agency_pr2e_grants.sql:94-112`, allowlisted `:124`): say so in the migration header **and** in
  the report, with the reason (that precedent belongs to the metric lane `0059:251` walls off from
  `journal_entries`/`journal_lines`/`trial_balance_as_of`; petty cash has no derivable structural basis at all,
  `0121:4749`). **No door in this file reaches `clara_runtime`, `clara_agent_ro` or any `clara_wake_*` role.**
- **DECISIONS §6 "D6" — the drilldown.** The pack returns per-account `composition[]` rows, rendered as the Chart's
  readable table; each row links to the **existing** address `/clients/<clientId>/journals?tab=posted&entry=<entryId>`
  (`app/(firm)/clients/[clientId]/journals/page.tsx:27-45` reads `?tab=` and `?entry=` **server-side**; its header
  `:19-25` states why the address is the source of truth for arrival). **Full GL drilldown is a named residual for
  #670.** Build no trial-balance or general-ledger surface; `apps/web/lib/journals/api.ts` is **link-only** for this
  branch (#655 owns that file this wave — SYNTHESIS §3.1).
- **No successor, no stanza** (DECISIONS §1.1/§1.2/§1.4; SYNTHESIS §1.2 lists #660 under "explicitly does NOT need it"
  for both cuts, §1.4 "#660 ships **everything** without a cut"). You cut no `_vN`, edit no `registry.ts`, import no
  frozen module, and write **no successor-contract section**. **Everything this ticket promises ships now**; nothing
  waits on a cut, and this branch writes **no new runtime module**, so nothing of yours freezes at the wave's
  `claraWork_v5` / `chatTurn_v21` ceremony (SYNTHESIS §1.6 lists the six modules that will freeze — none is yours).
  Durable rules therefore live in 0232, which is where they belong anyway. The deferred chat tool
  `read_client_financial_pack` (SYNTHESIS §1.3's last row: `{client_id, as_of, period:'mtd'|'month', month}` over
  `clara.get_client_financial_pack(p_client, p_as_of, p_month)`, refusals CLR04 / CLR11 / CLR10 `cash_set_unpublished`,
  reusing an existing typed read part) is a **follow-up issue** in your report, not a contract this wave owes.
- **Ownership (DECISIONS §3; SYNTHESIS §3.1).** You **own** `apps/web/components/firm/client-workspace-overview.tsx`
  (inherited from closed #650), `components/firm/client-home/*`, the new `lib/dashboard/*`, and **every cents value on
  any page this wave**. On `client-workspace-overview.tsx` + `client-home/*` the wave grants exactly one foreign hunk:
  **#636 "at most one link (prefer none)"; #656 none; #659 none** (`DECISIONS.md:109`, binding — it supersedes
  `SYNTHESIS.md:357`'s looser "#636 and #656 confine themselves to one link each", and BRIEF-ORDER §1.2 makes DECISIONS
  the winner where the two disagree): expect **no** #656 and **no** #659 hunk on this file at merge time.
  **Files YOU may touch with ONE hunk, no restructuring**: one sentence on `client-home/client-bank-summary.tsx` ("book
  cash ≠ statement balance"); appended legs/handlers on `e2e/home-board-walk.spec.ts` + `e2e/home-board-mock.mjs`
  (#659 appends too — never restructure the dispatch, never touch #902's `debt` declaration at
  `e2e/e2e-fixture-ownership.test.ts:361`); one-line registrations in the shared files. **Do not open**:
  `components/work/work-detail.tsx` (#658 → #655 → #636), `components/bank/*` and `lib/bank/*` except **reading**
  `lib/bank/money.ts` (#657), `components/firm/firm-home/*` (#659), `lib/journals/api.ts` (#655),
  `lib/work/use-client-work-pack.ts` and `lib/work/use-work-detail.ts` (**import** `WORK_STALE_AFTER_MS`; never restate
  60 s — the C77.12 one-owner rule, SYNTHESIS §3.1 "No edit by anyone"), `lib/firm/needs-you.ts` (**no new row kind this
  wave** — DECISIONS §3, carried from 2026-09-15 §1.6), `lib/parts/*` + `PartRenderer.tsx` (**nobody registers a part
  kind this wave** — SYNTHESIS §3.1), any frozen file, any merged migration.
- **Boundaries (DECISIONS §3.2; SYNTHESIS §4).** #660 ships **cash + profit + two charts only** — **no AR/AP key
  anywhere in the door** (those tiles are #669's, later, consuming your envelope); #659's firm Home renders **no money**
  and you add none to it; #635's model-usage USD **never appears beside book money**; #656 owns creating opening
  entries, you count them exactly once and **add no column to the opening lane**; #657/#675 own reconciliation — a
  `bank_statements.closing_cents` (`0038_wave_c_b_bank.sql:384`) never enters, substitutes for, or is summed into book
  cash; #672 owns whether a sealed report and this live pack must agree — they **may legitimately diverge** and you own
  only not hiding it (SYNTHESIS §4 records that verdict as explicitly **unverified**: no source rule requiring agreement
  was found).
- **The status vocabulary is closed** (SYNTHESIS §4, binding): `ok` / `partial` / `unknown` / `denied` — the four words
  the code already chose (`components/firm/client-home/client-work-attention.tsx:65-71`, "The WORD is the state; the
  tone only agrees with it"). **No face and no DB column ever says `unavailable`** — orchestrator ruling, supersedes
  gap-660 §9 item 6's `partial`/`unavailable` wording. The door itself never returns `denied` about itself (it raises
  CLR04; `0214:414-418` states exactly that rule for the sibling pack).
- **CONTEXT.md terms you write** (house "term / _Avoid_" shape; DECISIONS §3.1 ratifies the first two by name):
  **Cash account set / 现金科目集合**, **Book cash / 账面现金** (_Avoid_: statement balance, available balance),
  **Period profit / 期间利润**, **Source watermark / 来源水位**, **Definition version / 定义版本** (_Avoid_: metric
  definition version — that belongs to the 0058 delta lane).
- **Non-goals, in code comments and in the report** (DECISIONS §5): repairs no historical `closing_transfer`; mints no
  `account_set` / `metric_definition` row; adds no AR/AP; builds no TB/GL surface; opens no chat entrance; widens no
  `accounting_work.purpose` (`0194:230`, `0195:1711`, census pin `0194:2180` — SYNTHESIS §0.4 records #660 as stating
  this in its frozen-body verdict); reconciles nothing against a sealed `period_snapshots` artifact.
- **`.github/actions/db-live-gates/action.yml` gets NO row** — orchestrator ruling, **supersedes gap-660 §10's last
  line**. Measured: that file wires runtime **World** e2es and the DR round-trip only (`action.yml:25`, `:37`, `:65`,
  `:82`, `:384`, `:403`), and this slice has no World leg; a db battery reaches CI through `packages/db/package.json`'s
  gate chain, which `.github/actions/db-estate-suite/action.yml:74` ("Migrate + seed + tests — all packages") runs.
- **Playwright port triple** (RIG.md — already assigned; SYNTHESIS §0 notes five maps wrongly call this "assigned by
  SYNTHESIS"): `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3390`, `CLARA_E2E_NEXT_PORT=3391`,
  `CLARA_E2E_RUNTIME_PORT=3392`. **Rig row, verbatim from RIG.md**: `660 | C:\Users\zhant\Desktop\clara-wt\660 |
  impl/660-dashboard-cash-profit | 55710 | clara_660 | https://127.0.0.1:3390 / 3391 / 3392 | ok 438s | 219 applied |
  ok (2 files) | 219 · 0224 · PG 17.11` (RIG.md's prose below the table adds that the newest `version` on every cluster
  is `0224_preview_invite` and `server_version` is `17.11 (Ubuntu 17.11-1.pgdg26.04+2)`, with 18 `clara%` roles).
- **Both refutation lenses ran on gap-660** (citation `sound`; design/safety `needs_changes`; six findings, all
  applied), so it is **not** one of the four maps DECISIONS §6 / §7.5 #1 sends back for a design re-reconcile. Build
  from it directly.

## 1. Current state

**DB — the arithmetic exists and is correct; the *set*, the *series*, the *envelope* and the *floor* do not.**
`clara.trial_balance_as_of(p_client,p_as_of)` (`0017_wave_b.sql:3572-3586`, read this pass) is `language sql stable
security invoker set search_path=clara,pg_temp`; it sums `debit_cents`/`credit_cents` `filter(where
je.status='approved' and je.posting_date<=p_as_of)` over `coa_accounts LEFT JOIN journal_lines ON (client_id,
account_code) LEFT JOIN journal_entries`, grouped by `account_code, name`, ordered by `account_code` — **cumulative from
inception, no FY reset, no `is_opening_balance` special case** (so an approved opening lands exactly once), returning
one row per account of the client, zeros included. Granted `clara_authenticated, clara_runtime` (`0017:5163-5167`).
Two live assertions fail the chain if it ever admits a non-`approved` status: a presence regex and an **exact
token-set** comparison over every `status='…'` literal in its body (`0057_wave_e_registry_snapshots.sql:1878-1906`).
**Zero product callers today** (`grep -rl trial_balance_as_of apps/web packages/runtime packages/reporting-render` →
empty); #660 is the estate's first (SYNTHESIS §0.1).
The chart of accounts has **no cash class**: `clara.coa_accounts` is `(client_id, account_code)` PK,
`account_type in ('asset','liability','equity','income','expense')`, `special_acc_type`, `is_active`
(`0003_books_core.sql:47-57`); `account_class` carries only `payable`/`receivable`. The one structural cash marker is
`is_bank_account` (`0038:252`), minted **only** by `add_bank_account` / `remap_bank_account_coa` — the two-writer census
is stated as a measurement at `0121:4721-4722` — and never cleared on deactivation; `coa_accounts.account_id` is the
0058 surrogate with an immutability trigger (`0058:50-59`) and the composite unique `(account_id, firm_id, client_id)`
(`0058:55`) that set membership must reference.
The exclusion marker already exists and is already correct: `journal_entries.closing_transfer` (`0016:51`), whose own
design note (`0016:45-49`) states the rule as *"is_year_end AND closing_transfer"* and names why a year-end **revenue
correction** must still count; the live SST evaluator spells this ticket's predicate verbatim at `0016:602` —
`and not (e.is_year_end and e.closing_transfer)`. `finalize_close` births the close entry **marked** and
`close_receipt_id`-stamped (`0120:514-521`); "only finalize_close births close_receipt_id" is asserted structurally at
`0056_wave_e_close_model.sql:3010-3024`; the reopen mirror copies `o.closing_transfer` through and carries
`reversal_of` pointing at the close entry, but **not** `close_receipt_id` (`0120:797-814`). Entries finalised **before**
0120 stayed false "forever" (`0120:518-521`), and `0016:211-219`'s `closing_transfer_review` notification was never
discharged by any migration. `is_year_end` alone is **caller-supplied** from `p_flags` (`0004_governed_fns.sql:190`,
`0005_event_spine.sql:1039`) — so the exclusion predicate must be the pair, never `is_year_end` alone.
Watermark idiom: `pg_current_snapshot()::text`, taken in the computing statement and CHECKed
`^[0-9]+:[0-9]+:([0-9]+(,[0-9]+)*)?$` (`0057:390-396`). Coverage-floor candidate: `opening_seed_registry.as_of`
(`0017:1076-1096`) — absent for a client committed via `first_year_zero_opening` / `carry_down_deferred`
(`0017:2812-2821`). Helpers by exact signature: `clara._human_ctx(p_min_rank int, out actor uuid, out firm uuid)`
(`0004:299`), `_reserve_op(p_firm,p_fn,p_op_key,p_req_hash)` (`0004:46`), `_finish_op(p_firm,p_fn,p_op_key,p_result)`
(`0004:62`), `_audit(p_firm,p_actor,p_obo,p_wake_kind,p_fn,p_entry,p_args)` (`0004:35`),
`_append_event(p_firm,p_type,p_client,p_actor,p_obo,p_wake_kind,p_entry,p_document,p_resolution,p_payload)`
(`0005:476-479`). Shape template for the whole file: `0214_client_work_pack.sql` — prestate `:138-227` (its
measured-pin paragraph is `:202-224`), INVOKER + `search_path` + `plan_cache_mode` `:238-240`, three inline floor
predicates `:262-274`, null-client caller defect `:276-281`, MYT calendar day `:288-292`, the envelope note `:414-418`,
the envelope `:419-445`, the "No total key … EXECUTE to clara_authenticated only" comment `:464-465`, revoke/grant
`:472-473`, `reset role` `:475`, tail `:479-597`. Event-pair idiom: `0219_client_onboarding_facts.sql:276-291`
(`event_types` + `trigger_taxonomy`, `decision='ignore'`). Overload-census idiom:
`0103_f_a7_pi_additive.sql:1054-1070` — it covers **only the eleven names 0103 installs**, so 0232 writes its own
(DECISIONS §2.2).

**Runtime.** Nothing reads money (`grep -rl trial_balance_as_of packages/runtime` → empty). Registry pins at base:
`chatTurn_v20` (`packages/runtime/workflows/registry.ts:173`), `claraWork_v4` (`:270`). **This slice changes no runtime
file.**

**Web.** Client Home = `ClientWorkspaceOverview` (`components/firm/client-workspace-overview.tsx`; `"use client"` at
`:1`, export at `:115`, file 203 lines): identity band → conditional `ContinueOnboardingCard` → onboarding progress →
`@container` two-column grid (left `ClientWorkAttention` / `ClientNeedsYou` / `ClientDocsBacklog`; right
`ClientBankSummary` / `ClientCloseSummary` / `ClientLastActivity`), under a stated law — **every section reads for
itself**, because "a board that blanks on a single failure reads as *this client has nothing outstanding*, which is the
most expensive possible way to be wrong here" (`:16-19`). **No money anywhere on the page** (`cents|formatMoney|MYR|
currency` over `client-home/*` + `client-workspace-overview.tsx` → zero non-test hits); `client-bank-summary.tsx:6-9`
states its label is "latest statement per account" and is deliberately never "coverage". The route
`app/(firm)/clients/[clientId]/page.tsx` takes `params` only and wraps the board in `PageShell`; the `searchParams`
precedent is `journals/page.tsx:27-45`.
The refresh machine to copy by shape is `lib/work/use-client-work-pack.ts` — `CLIENT_WORK_PACK_REFRESH_MS = 30_000`
(`:63`), `WORK_STALE_AFTER_MS` **imported** from `lib/work/use-work-detail.ts:42` (`:59`), epoch-guarded
latest-started-wins (`:132-168`), denial clears values **and** `readAt` (`:152-157`), transport failure keeps the dated
values (`:158-161`), clear-before-read on a new client (`:173-185`), a while-visible 30 s poll whose staleness clock
ticks **unconditionally** while the READ skips a hidden tab (`:190-198`), focus + `visibilitychange` re-read as the live
permission check (`:202-215`) — *these spans were measured this pass; gap-660's are a few lines off.* Wire-parser
discipline: `lib/work/client-work-pack.ts:1-26` (unknown ≠ zero; `?? 0` named as the bug; a count is never
`rows.length`; one href builder). Money: `lib/registers/money.ts:19-37` — `CENTS_UNAVAILABLE = "—"`, `isSafeCents`,
`fmtCents` → `RM 1,234.56` via `toLocaleString("en-MY", {minimumFractionDigits: 2, maximumFractionDigits: 2})`, with the
i18n'd unsafe marker (`Common.centsUnsafe`); it re-exports `lib/bank/money.ts`, whose header states "the DB owns every
cents value … this module never computes a financial figure". `components/ui/` holds **32 entries** and **no
`chart.tsx`**; `apps/web/package.json` has **no `recharts`** (dependencies read in full; both re-confirmed this pass);
`field.tsx`, `empty.tsx`, `select.tsx`, `skeleton.tsx`, `table.tsx`, `card.tsx` and `dialog.tsx` **are** installed.
Chart CSS variables already exist (`app/globals.css:109-113` theme mapping, `:349-354` the ordered categorical palette,
"labels remain mandatory"). The read-only table idiom is `components/common/data-table-card.tsx` over
`components/ui/table.tsx`, whose scroll container carries `tabindex="0"` — pinned by
`components/common/table-scroll-region.test.tsx:34-39`. **There is no `table-scroll-region.tsx` module; gap-660 implies
one — it does not exist.** Refusals render through `StateBanner` (`components/common/state.tsx:85`), with
`LoadingState` (`:50`) and `EmptyState` (`:58`) beside it. **No period selector exists anywhere in the repo.** The bus
carries exactly two events (`lib/command/bus.ts:33`, `:111`) — there is **no** commit/posting event to subscribe to.
UI copy is **English**: `apps/web/messages/en.json` is the only locale file, organised in per-surface namespaces
(`Common`, `ClientWorkAttention`, `ClientWorkspace`, …), and `pnpm --filter @clara/web lint` runs
`scripts/check-message-keys.mjs` over it.

**Tests.** DB shape to copy: `packages/db/tests/client-work-pack.test.mjs` — the frontier gate at `:40-77` (a STEM
regex over `clara.schema_migrations`, `markSkip()`, and a `before()` that **throws** when the lane is absent and the
gate module was not preloaded, so a FOCUSED run cannot report a green over nothing), `humanQuery` personas, and the
no-oracle pair `p650.pack.floor_viewer` (`:461`) / `p650.pack.cross_firm` (`:479`); its gate module is
`client-work-pack-preintegration-gate.mjs`. Web: `components/firm/client-home/client-work-attention.test.tsx`
(`p650.pack.no_period_axis` at `:425` mounts the board at `/clients/<id>?fy=2026&period=2026-08` and asserts **nothing**
changes — a direct constraint on your selector) and `components/firm/client-workspace-overview.test.tsx`; registered in
`apps/web/test/manifest.txt:145-149`. Playwright: `e2e/home-board-walk.spec.ts` (550 lines, **9** cells; per-page
`page.route` overlays, `cellBudgetMs({signIns, polls, scans})`, `page.clock.install()` at `:533` and
`fastForward("01:05")` at `:547`, axe over `WCAG_TAGS = ["wcag2a","wcag2aa","wcag21a","wcag21aa"]` at `:22`) +
`e2e/home-board-mock.mjs` (144 lines; `get_client_work_pack` at `:135`, `EMPTY_RPCS` at `:104-111`), wired at
`e2e/serve-built.mjs:58`, declared at `e2e/e2e-fixture-ownership.test.ts:67` and `:361`
(`debt: ["/rest/v1/rpc/get_client_work_pack"]` — #902). That census carries four structures: `LANE_MOCKS` (`:53`),
`LANE_DECLARATIONS` (`:216`), `SHARED_RPC_VERBS` (`:1106`), `CORE_RELATION_HANDOVERS` (`:1311`). POST bodies are read
only through `readCachedJson` (`e2e/mock-dispatch.mjs:34`).

## 2. Gaps / rows

Every acceptance criterion of the ticket and its one historical obligation, each with the evidence the report must
carry. "Named residual" means the report names it in one sentence with its owner; a residual that is not named is a
silently narrowed brief (WORK-ORDER rule 6).

| Row | Disposition | Evidence you must produce |
|---|---|---|
| **AC1** one consistent authorised read returning exact minor units, currency/unit, period/as-of, computed-at, definition version, source watermark, coverage; unknown/restricted/error ≠ zero; a governed versioned cash set including relevant inactive accounts **and petty cash** | **to build** — three sub-gaps: no envelope in the estate carries all six fields (`0214:419-445` carries two of them; `period_snapshots` carries the watermark but only for a minted month pack, `0057:390-401`); the set is **not expressible today** (`0058:344-358`); petty cash has **no** structural marker (`0121:4749`, and `_coa_plant_family` `0156:642-698` plants no family column, so a template-adopted chart cannot be reverse-mapped either) | `p660.pack.envelope_complete`, `p660.pack.cash_set_inactive_member`, `p660.pack.cash_set_unpublished`, `p660.pack.publish_*`, `p660.pack.propose_never_petty_cash` |
| **AC2** cash = cumulative approved debit−credit including opening once, no FY reset; six points; pre-coverage points unavailable; statement balances never substituted or summed | **partial** — the arithmetic exists (`0017:3572-3586`) and is **called, never changed**; the set, the series, the coverage floor and the "never a statement balance" wall are new | `p660.pack.cash_cumulative_no_fy_reset`, `opening_counted_once`, `matches_trial_balance`, `pre_coverage_point`, `floor_fallback_no_seed`, `statement_balance_never_cash`, `cash_set_version_pinned` |
| **AC3** default current MTD in `Asia/Kuala_Lumpur`, historical full month, no future actuals; profit = income (cr−dr) − expense (dr−cr) over the identical interval, including reversals/negative corrections, **excluding closing-transfer lines** | **partial** — the marker and the rule exist (`0016:51`, `:602`) but **no read applies them**, and two real defects must be disclosed rather than papered over: pre-0120 unmarked closes (`0120:518-521`) and `is_year_end` being caller-supplied (`0004:190`, `0005:1039`) | `p660.pack.closing_transfer_excluded`, `reopen_mirror_excluded`, `unmarked_history_partial`, `unmarked_history_no_false_positive`, `reversal_and_negative_not_clamped`, `future_as_of_refused`, `month_not_first_day_refused` |
| **AC4** compare MTD with the elapsed prior-month interval capped at month-end; history with the prior full month; balances with the preceding month-end; delta % uses the absolute comparison and omits a zero denominator; a sign change shows the amount and the profit/loss transition | **to build** — no comparison arithmetic exists anywhere in web or db; it lives in **the door**, once, so #669 inherits it rather than re-deriving it | `p660.pack.mtd_comparison_capped`, `zero_denominator`, `sign_change`, plus the web cell proving the face computes **no** delta (`lib/dashboard/financial-pack.test.ts`) |
| **AC5** six-calendar-month income/expense chart labelling the partial current month with its exact as-of; shadcn Chart with readable values/table fallback, drilldowns, stable amounts, reduced motion, A Home tokens | **to build** — `ui:add chart` under D19.c's four-step procedure; the table fallback is always in the DOM; the drilldown addresses the **existing** `?entry=` page only | `p660.measure.chart_dry_run`, `client-financial-charts.test.tsx`, walk legs `p660.money.chart_fallback` / `p660.money.drilldown` |
| **AC6** refresh on entry / scope / period / commit / visible-return, ≤30 s while visible, 60 s → update delay + last success; preserve dated values on transient failure, clear immediately on access/scope change; golden fixtures prove FY / opening / closing-transfer / correction / negative / partial-month / read consistency | **partial** — the 30 s / 60 s / denial / scope half is a near-copy of `use-client-work-pack.ts:132-215`; **period in the dependency key** and the **golden corpus** are new; **commit-event invalidation has no bus event to subscribe to** (`lib/command/bus.ts:33`, `:111`) → **named residual**, disclosed on the surface ("this figure refreshes at most every 30 seconds") and in the report | `lib/dashboard/use-financial-pack.test.ts` (seven cells, including period-change-clears and the source-read cell that keeps `WORK_STALE_AFTER_MS` a reference), the golden-fixture corpus, walk leg `p660.money.delayed` |
| **AC7** journey states (loading / successful-empty / no-results / partial-stale / invalid-saving / denied / failed / cancelled-recovery), current scope and permission, exact money and date values, 320px, 200 % zoom, keyboard + focus return, screen-reader names, reduced motion, stable URL/Back, preserved drafts, accepted shadcn/Base composition with a persistent outcome | **to build** on your new surfaces. **No drafts exist on a read-only board — say so**: the publish dialog is the only invalid/saving face, and its cancel restores nothing because it committed nothing (appendix C §3's "Draft across local view changes" row applies to that dialog alone) | walk legs `p660.money.*` + `client-home-money-a11y.test.tsx`, `client-home-money-keyboard.test.tsx` |
| **AC8** prove the declared outcome through the production-facing read under real least-privileged Postgres roles and current migrations, against complete records rather than mocked helpers; DB/Storage-only operations use their actual transaction/access boundaries; label local vs hosted | **to build** — this AC is **Database-only (no Workflow)**, so the durable-execution clause reduces to the transaction/access-boundary clause. **State that explicitly** rather than writing a vacuous World leg | the whole `client-financial-pack.test.mjs` battery through `humanQuery` personas + `p660.pack.no_agent_reach` + `p660.census.pins_unmoved`; the report says "hosted evidence pending" |
| **UI-23** (`comment-5589270292`, historical **FIXED** / refresh **REDESIGN**: "Replace against the accepted 34-journey/component/A+B contracts; preserve keyboard, scope, typed data and responsive regressions") | **verify-only for the existing board + to build for the money half.** The row is **shared with #669** (same source line): #660 closes the cash/profit quadrant, #669 the AR/AP quadrant — **neither may claim the row closed alone.** Re-measure, never copy: keyboard, focus return, 320px, 200 %, reduced motion on the **new** sections | re-run `client-work-attention.test.tsx` (especially `p650.pack.no_period_axis:425`) and `client-workspace-overview.test.tsx` **unchanged** — a red there is a regression, not a rewrite — plus the new a11y/keyboard cells and the walk's `p660.money.narrow` |

## 3. Slice (one branch)

**Migration `0232_client_financial_pack.sql`** — additive; FORCE RLS; no app-role DML; integer cents; MYT calendar days
(WORK-ORDER rule 8). Written in this order.

1. **Header.** What it creates, what it recuts (nothing), the five read-only pins and why, D19.a's reason for a new
   relation family rather than riding 0058, and D19/§6-D2's "no agent twin" departure with its precedent named
   (`0113:145-165` / `0115:79-97` / `0116:94-112`, `:124`). `0214`'s header is the length and tone to match.
2. **Prestate** `do $p660_pre$`. Assert the five dependency bodies exist and pin each
   `encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')` off `pg_proc` **measured on your rig** (`0214:202-224` is the
   paragraph to copy, including its "MEASURED, NEVER TRANSCRIBED" sentence). Assert `to_regprocedure` is **NULL** for
   each of the three new names before creating it (the overload wall — `0103:1054-1070` raises CLR10 if any installed
   name carries more than one `pg_proc` row, and `get_client_*` is a crowded prefix). Assert the preconditions:
   `clara.coa_accounts.account_id` and its `(account_id,firm_id,client_id)` unique (0058), `journal_entries
   .closing_transfer` (0016), `journal_entries.close_receipt_id` (0056), `clara.opening_seed_registry` (0017).
3. **`clara.cash_account_set_versions`** — `(id uuid pk default gen_random_uuid(), firm_id uuid not null references
   clara.firms(id), client_id uuid not null, revision int not null check(revision>0), state text not null check(state in
   ('published','superseded')), effective_from date not null, effective_to date, member_count int not null
   check(member_count>=0), members_sha256 bytea not null check(octet_length(members_sha256)=32), definition_version text
   not null, created_by uuid not null references clara.users(id), created_at timestamptz not null default now(),
   created_xid xid8 not null default pg_current_xact_id())`, FK `(client_id,firm_id) → clara.clients(id,firm_id)`,
   `unique(id,firm_id,client_id)`, `unique(client_id,revision)`, CHECK `(state='published' and effective_to is null) or
   (state='superseded' and effective_to>=effective_from)`, and a partial unique index on `(client_id) where
   state='published'` (`0058:108-116` is the shape, `uq_account_set_versions_current` at `:116` the index idiom).
4. **`clara.cash_account_set_members`** — `(cash_account_set_version_id uuid not null, firm_id uuid not null references
   clara.firms(id), client_id uuid not null, account_id uuid not null, ordinal int not null check(ordinal>=0),
   member_reason text not null check(member_reason in ('bank_registry','declared_cash','declared_petty_cash')))`,
   primary key `(cash_account_set_version_id, account_id)`, `unique(cash_account_set_version_id, ordinal)`, FK
   `(cash_account_set_version_id,firm_id,client_id) → clara.cash_account_set_versions(id,firm_id,client_id)`, FK
   `(account_id,firm_id,client_id) → clara.coa_accounts(account_id,firm_id,client_id)` — **no `is_active` predicate
   anywhere; that is the whole point** (D19.a). `member_reason` is what makes "why is this account cash?" answerable
   without a name heuristic (`0121:4749`).
5. **`clara._tf_cash_account_set_integrity()`** — `0058:362`'s pattern, one trigger function serving two triggers:
   (a) BEFORE INSERT on the members table, refuse a member whose version row's `created_xid <> pg_current_xact_id()`
   (members sealed to the creating transaction, CLR08); (b) a DEFERRABLE INITIALLY DEFERRED constraint trigger AFTER
   INSERT OR UPDATE on the versions table that recomputes `members_sha256` over the ordinal-ordered `account_id` array,
   refuses a count/sha mismatch (CLR11 `cash_set_integrity_mismatch`), and enforces **exactly one `published` row per
   client** with **contiguous, non-overlapping** windows and exactly one open right edge (CLR11
   `effective_version_ambiguity`).
6. **`clara.publish_client_cash_account_set(p_client uuid, p_members jsonb, p_effective_from date, p_op_key text)
   returns jsonb`** — `language plpgsql security definer set search_path = clara, pg_temp`;
   `c := clara._human_ctx(clara.role_rank('admin'))` (the floor `create_account_set_v1` uses, `0058:369`);
   `_reserve_op` over a request hash covering all three payload arguments, `_finish_op`, `_audit`, `_append_event`.
   **`p_members` is a jsonb ARRAY of `{"account_id": uuid, "member_reason": text}` and its order IS the ordinal** —
   orchestrator ruling, **supersedes gap-660 §9 item 4's parallel `p_account_ids[]` / `p_reasons[]`**: two arrays make a
   length mismatch a runtime class of bug, one array makes it unrepresentable, and jsonb is 0058's own argument idiom.
   Refusals, exact (`errcode` + `detail.reason`): CLR11 `client_not_in_firm`; CLR10 `members_malformed`,
   `member_reason_invalid`, `account_not_of_client`, `duplicate_account`, `cash_set_empty`, `effective_from_required`
   (a second or later version must name a real date), `effective_from_not_after_current`,
   `first_version_after_books_start`. That last one is the trap this door exists to prevent: a **first** version whose
   `effective_from` is later than the client's earliest approved `posting_date` would make every historic month
   unreadable, so when `p_effective_from is null` on a first version the door stamps the books' own start —
   `least(min(opening_seed_registry.as_of) where state='finalized', min(journal_entries.posting_date) where
   status='approved')`, falling back to today's MYT date when the client has neither. Supersedes the prior published
   version with `effective_to = p_effective_from - 1` (`0058`'s own supersede statement is the model). **EXECUTE to
   `clara_authenticated` only.**
7. **`clara.propose_client_cash_accounts(p_client uuid) returns jsonb`** — `stable security invoker set search_path =
   clara, pg_temp`, 0214's three inline floor predicates (`0214:262-274`) at **viewer** rank, null client → CLR10
   `invalid_client` (`0214:276-281`). Returns only the **structurally derivable** candidates: every `coa_accounts` row
   with `is_bank_account = true`, **active or inactive**, reason `bank_registry`, each annotated with its cumulative
   balance at today's MYT date and with `already_member` against the live published version. **It proposes; it never
   publishes. Petty cash is never proposed** (`0121:4749`) — the face asks a human to add it. **EXECUTE to
   `clara_authenticated` only** — this is the door a two-door ACL assertion would miss, and it is the surface that says
   which accounts *could* be cash.
8. **`clara.get_client_financial_pack(p_client uuid, p_as_of date default null, p_month date default null) returns
   jsonb`** — `stable security invoker`, `set search_path = clara, pg_temp`, `set plan_cache_mode = force_custom_plan`
   (`0214:238-240`), 0214's three inline predicates at **viewer** rank, null client → CLR10 `invalid_client`.
   - **Period.** `p_month is null` → MTD: `period_start = date_trunc('month', today_MYT)`,
     `as_of = coalesce(p_as_of, today_MYT)`. `p_month` must be the **first day of a month** (CLR10
     `month_not_first_day`) → that whole natural month, `as_of = least(month_end, today_MYT)`. An explicit `p_as_of` in
     the future is **CLR10 `as_of_in_future`** — a caller defect, never a silent clamp (orchestrator ruling, refines
     gap-660 §9 item 6: AC3's "no future actuals" is a refusal, not a rounding). `p_as_of` outside a named `p_month` is
     CLR10 `as_of_outside_month`. Today is `(now() at time zone 'Asia/Kuala_Lumpur')::date` (`0214:288-292`).
   - **Cash.** Resolve **ONE** cash-set version — the one whose window contains `as_of` — and apply it to **all six
     points** (`cash.set.applied_to_all_points: true`): a trend whose membership changes between points is not a trend.
     When an earlier point falls outside that version's window, `coverage='partial'`, reason
     `cash_set_version_changed_in_series`. No version at `as_of` → `status='unknown'`, `value_cents` **null**, reason
     `cash_set_unpublished` — **never 0**. The value is `sum(debit_cents − credit_cents)` over the member accounts,
     joined `cash_account_set_members.account_id → coa_accounts.account_id → account_code`, as `bigint` cents.
   - **One definition, and it is checkable.** Default shape: call `clara.trial_balance_as_of(p_client, <as_of>)` once
     per as-of (≤7 per call) and sum over the members. **Measure `p660.measure.tb_plan` first** (DECISIONS §6, §7.4 #9;
     SYNTHESIS K3): if the seven-call shape is materially worse than one pass on a seeded corpus, compute the six
     points in **one** scan of `journal_lines × journal_entries` with six `filter (where posting_date <= point_k)`
     aggregates — and in that case the tail must assert the single-pass expression carries `status='approved'`, a
     `posting_date <=` bound, no FY reset and no `is_opening_balance` special case (the protection pattern is
     `0057:1878-1906`). **Either way** `p660.pack.matches_trial_balance` proves the pack's cash equals the member sum of
     `trial_balance_as_of` at the same as-of. That cell is what makes "one definition" checkable rather than claimed.
   - **Points.** Six: five preceding month-ends + `as_of` (MTD), or six month-ends ending in the selected month. Each
     carries `available: bool`; a point **strictly before the coverage floor** is `available:false,
     reason:'pre_coverage'` — never 0. **Coverage floor (binding, one expression)**: `min(opening_seed_registry.as_of)
     where state='finalized'`; if null, `min(journal_entries.posting_date) where status='approved'`; if that is null too
     there is no floor and the population is empty. When the client's plan carries `carry_down_deferred`
     (`0017:2812-2821`) and no finalized seed exists, the cash group is additionally `coverage='partial'`, reason
     `opening_carry_down_deferred` — the opening is knowingly absent, so say so. (Closes gap-660 unverified #7.)
   - **Profit.** `income = Σ(credit_cents − debit_cents)` over `account_type='income'`; `expense = Σ(debit_cents −
     credit_cents)` over `account_type='expense'`; both restricted to `je.status='approved' and je.posting_date between
     period_start and as_of` **and `not (je.is_year_end and je.closing_transfer)`** — the `0016:602` literal, asserted
     verbatim in the tail by a `position(...)` probe. Reversals and negative corrections are ordinary approved entries:
     **no `greatest(x,0)` anywhere.**
   - **The unmarked-history detector is PRECISE, and separate from the exclusion.** `coverage='partial'`, reason
     `closing_transfer_unmarked_history`, when an approved entry inside the period has `closing_transfer=false` **and**
     (`close_receipt_id is not null` — only `finalize_close` births it, `0056:3010-3024` — **or** its `reversal_of`
     names an entry that has one, which is the reopen mirror, `0120:797-814`). Orchestrator ruling, **supersedes
     gap-660's `is_year_end and not closing_transfer` probe**: that shape fires on every legitimate year-end
     **correction**, which is the exact error `0016:45-49` names. **Do not also exclude the detected rows** — the
     exclusion predicate stays the estate's one definition; a second, wider exclusion inside one read would make two
     reads of one ledger disagree. Disclose, and file the repair (D19.b). **Name the detector's own limit as a
     residual**: a close finalised before `close_receipt_id` existed (pre-0056) carries neither marker and is
     undetectable; say so rather than implying total coverage.
   - **Comparison lives in the door, once** (AC4; #669 consumes the same one): per figure group,
     `{value_cents, delta_cents, delta_pct, sign_change, period:{start,end}}`; MTD → the prior month
     `[1 .. least(day_of(as_of), days_in(prior_month))]`; historic → the prior full month; balances → the preceding
     month-end. `delta_pct = (current − comparison) / abs(comparison)`, **null** when the comparison is 0;
     `sign_change: true` when the two differ in sign, with both amounts present. **The web recomputes none of it.**
   - **Series.** `series[]`: six calendar months ending in the selected month, each `{month, income_cents,
     expense_cents, profit_cents, partial: bool, as_of}`; the current month is `partial:true` with its exact as-of.
   - **Composition.** `cash.composition[]` / `profit.composition[]`: per account `{account_id, account_code, name,
     member_reason|account_type, opening_cents, movement_cents, closing_cents, entries:[{entry_id, posting_date, memo,
     amount_cents}], entries_truncated, entries_total}`. **Entries are the movement in the selected period only**, and
     they are capped (20 per account, 50 rows per group, ordered by `abs(amount)` desc, each level carrying its own
     `truncated` + `rows_total`): a cumulative opening is a number, not an enumerable population, and the
     account-filtered ledger is #670's (named residual). Each entry row is what the web links to `?entry=<id>`;
     `lib/journals/api.ts:53`'s `FETCH_CAP = 1000` never binds, because the link addresses **one** entry (closes
     gap-660 unverified #9).
   - **Envelope on every figure group** (`cash`, `profit`, `income`, `expense`): `{value_cents, status,
     unit:'minor_units', currency:'MYR', period:{start,end,as_of,timezone:'Asia/Kuala_Lumpur'}, computed_at,
     definition_version:'clara.client-financial-pack/v1', source_watermark, coverage, coverage_reason}`. `status` and
     `coverage` take only `ok|partial|unknown`; the door never says `denied` about itself (it raises CLR04 —
     `0214:414-418`) and **never says `unavailable`** (SYNTHESIS §4). A complete read over an empty population is
     `status='ok'`, `value_cents=0`, `coverage_reason='no_posted_entries'` — the one case where a reason accompanies
     `ok`, so the face can say "no posted entries yet for this client" instead of printing RM 0.00. `source_watermark`
     is `pg_current_snapshot()::text` taken in the computing statement, with `0057:390-396`'s regex asserted by a cell.
     **No-oracle**: a client not visible under RLS answers **identically** to an invented uuid — `status='unknown'`,
     reason `client_not_visible`, in both directions.
   - **EXECUTE to `clara_authenticated` only.**
9. **RLS and grants on the two relations**: `enable` + `force row level security`, an owner policy for
   `clara_fn_owner` and a firm-scoped human policy for `clara_authenticated` (`0003:505-518`'s loop is the shape),
   `grant select` to `clara_authenticated` only, and **zero** INSERT/UPDATE/DELETE to any non-owner role. That grant is
   what keeps the pack honestly `SECURITY INVOKER` and makes D19.e's viewer claim structural rather than rhetorical.
10. **Event**: one `client.financial_cash_set_published`, registered as the coupled pair (`clara.event_types` +
    `clara.trigger_taxonomy`, `decision='ignore'`, `0219:276-291`) — a human act with no designed consumer; manufacture
    none.
11. **Tail postcheck** (`0214:479-597` shape): all three functions exist **exactly once** at exactly their signatures
    (`pg_get_function_arguments` compared against the rendering **measured on your rig**, never transcribed from this
    brief); owner `clara_fn_owner`; INVOKER/DEFINER as declared; `search_path` (and `plan_cache_mode` on the pack)
    pinned; an `aclexplode` census over **all three names, each named in its own assertion**, proving EXECUTE reaches
    exactly `clara_fn_owner` + `clara_authenticated` and **no** `clara_runtime` / `clara_agent_ro` / `clara_wake_*`
    role, with PUBLIC holding nothing; FORCE RLS plus exactly two policies on both relations and no non-SELECT
    privilege for `clara_authenticated`; the `not (e.is_year_end and e.closing_transfer)` predicate present
    **verbatim** in the pack's `prosrc`; `'Asia/Kuala_Lumpur'` present; `greatest(` absent from the profit arm; the
    single-`pg_proc`-row census over the three names this file installs (`0103:1054-1070`'s idiom, its own copy —
    0103's census does not reach new names); and the five pinned bodies still byte-identical.
12. **Gate module** — `packages/db/tests/client-financial-pack-preintegration-gate.mjs` (the same ruling as the
    Orchestrator-decisions bullet above; BRIEF-ORDER §2's file order ends here, so it is restated where the migration is
    written). Copy `client-work-pack-preintegration-gate.mjs` in shape **and in its comment's reasoning** — that a
    FOCUSED invocation does not preload the module and must therefore FAIL loudly when the lane is absent, because a
    skip is not evidence — and set **exactly one** flag:
    `process.env.CLARA_ALLOW_MISSING_CLIENT_FINANCIAL_PACK = "1";`. The battery's own frontier gate reads it over the
    stem `client_financial_pack$` (`client-work-pack.test.mjs:40-77` is the shape; `:40` is
    `const STEM = "client_work_pack$"`). Register it in `packages/db/package.json`'s `"test"` chain as ONE
    `--import ./tests/client-financial-pack-preintegration-gate.mjs` flag at its **MIGRATION-order** position, never
    alphabetical (DECISIONS §2.2). Measured on this checkout: that chain carries **40** such flags and ends with
    `--import ./tests/preview-invite-preintegration-gate.mjs` (0224, the frontier), so on your branch yours is appended
    immediately after it; the integration worker re-sorts the nine lanes so 0232's gate lands after 0231's (#659) and
    before 0233's (#635). The proof that the gate is real is in §6: a focused run **without** the flag must FAIL below
    0232.
13. **Cohort** — `packages/db/tests/rig-meta.mjs`, constant `CLIENT_FINANCIAL_PACK_0232_COHORT`, registered at the
    **three** sites the 0214 cohort uses, each a one-line registration at its sorted position (the `];` repair is the
    known hazard — §5):
    (a) **declaration** beside the 0214 block (`rig-meta.mjs:2155-2167`) — `const CLIENT_FINANCIAL_PACK_0232_HUMAN_FNS =
    ["get_client_financial_pack", "propose_client_cash_accounts", "publish_client_cash_account_set"];` then
    `export const CLIENT_FINANCIAL_PACK_0232_COHORT = [...CLIENT_FINANCIAL_PACK_0232_HUMAN_FNS];`, under the same
    "wholly present or wholly absent" comment the 0214 block carries, stating **why all three are human-only**:
    `clara_runtime`, `clara_agent_ro` and every `clara_wake_*` role gain ZERO on all three (§6-D2's no-agent-twin
    departure; the same fact `p660.pack.no_agent_reach` proves behaviourally);
    (b) **human-fn roster** — spread `...CLIENT_FINANCIAL_PACK_0232_HUMAN_FNS` into `ALLOWED[ROLES.authenticated]`
    (`rig-meta.mjs:2314` declares `ALLOWED`; the 0214 spread with its comment is `:2515-2518`), because all three doors
    are `EXECUTE` to `clara_authenticated` only;
    (c) **`cohortFailures(...)` call** — one
    `failures.push(...cohortFailures("#660 0232 client financial-pack read lane", CLIENT_FINANCIAL_PACK_0232_COHORT,
    liveNames));` beside `:2962`.
    Measured: `liveNames` (`:2914`) is built from `pg_proc` rows, so a rig-meta cohort covers **function names only** —
    the two new relations are asserted by the migration tail (item 9) and by the battery, never by the cohort; do not
    invent a relation roster that does not exist.

**Runtime. Nothing** — no new module, no route edit, no registry change, no successor stanza. **State this explicitly
in the report** so a reviewer does not read the absence as an omission, and run the two freeze checks anyway (§6): a
green there is the evidence for the "no successor" verdict (SYNTHESIS §7.2, last bullet).

**Web** (no new route; no `lib/navigation/tree.ts` row — the client home is already a destination).
- `app/(firm)/clients/[clientId]/page.tsx` gains `searchParams` and reads `?period=` (`YYYY-MM`, absent = MTD) on the
  **server**, handing it down as a plain prop (`journals/page.tsx:27-45`'s precedent, including its reason for not
  forcing a Suspense boundary). **The address is the only source of truth for the period**: the selector `router.push`es
  a new `?period=` (push, not replace, so Back returns to the previous period) and the component keeps **no** period
  state of its own. A malformed `?period=` falls back to MTD and says so on the face.
- `lib/dashboard/financial-pack.ts` — the wire contract + parser, on `lib/work/client-work-pack.ts:1-26`'s discipline:
  unknown ≠ zero, `?? 0` named as the bug, no `Number()` on a cents value that may exceed `MAX_SAFE_INTEGER`
  (`isSafeCents` decides and `fmtCents` renders the i18n'd marker), a missing envelope field ⇒ `unknown` (never a number
  rendered without its period). **Exported as the named, documented envelope module #669 consumes** (SYNTHESIS §4).
- `lib/dashboard/use-financial-pack.ts` — the state machine, a near-copy of `use-client-work-pack.ts` with exactly two
  additions: `period` in the dependency key (a period change **clears before re-reading**, exactly as a client change
  does at `:173-185`) and the `CLIENT_RECORD_CHANGED` subscription for scope changes (`lib/command/bus.ts:111`).
  **Imports `WORK_STALE_AFTER_MS` by reference** — no second 60 s literal anywhere in the repo.
- `lib/dashboard/period.ts` — MYT month arithmetic, the elapsed-interval capping rule and the 13-month + month-to-date
  option list, **pure, with no money math** (the deltas belong to the door).
- `components/firm/client-home/client-period-selector.tsx` — `Select` (`components/ui/select.tsx`; appendix D row 49
  names Select for "moderate stable choice lists such as period") over the options, `aria-label`led, keyboard reachable,
  focus staying on the control after the navigation. **It never touches the Work band** (`p650.pack.no_period_axis`
  must stay green).
- `components/firm/client-home/client-financial-summary.tsx` — the **one new section**, mounted full-width between
  `ClientOnboardingProgress` and the `@container` grid, so the period control is visibly scoped to money and the Work
  band is never under it. It owns the single hook instance and renders four presentational children —
  `client-cash-summary.tsx`, `client-profit-summary.tsx`, `client-cash-trend.tsx`, `client-income-expense-chart.tsx`.
  **Its header states why the one-read-per-section law (`client-workspace-overview.tsx:16-19`) is satisfied rather than
  broken: the money band IS one section; four faces of one envelope must agree, and four reads could not.**
- `components/ui/chart.tsx` via D19.c's procedure. Client-only; `prefers-reduced-motion` disables the animation; **the
  readable table is always in the DOM** (visually collapsed at wide widths, expanded ≤640px and at 200 % zoom),
  composed with `DataTableCard` / `components/ui/table.tsx` so it inherits the keyboard-reachable scroll container
  (`table-scroll-region.test.tsx:34-39`).
- **States, each with a real face**: loading (`Skeleton`, no number) · successful-empty (`no_posted_entries`, distinct
  from zero) · no-results (a historic month with no movement — a real 0 labelled with its period) · partial/stale (the
  number **stays**, dated, with its reason: `closing_transfer_unmarked_history` / `pre_coverage` /
  `cash_set_version_changed_in_series` / `opening_carry_down_deferred`) · invalid/saving (**only** on the cash-set
  publish dialog: `Field`/`FieldError`, `aria-invalid`, dirty fields preserved on refusal) · denied (values cleared
  immediately, a sentence naming the permission, **never a 0**) · failed (a first failure shows no number at all; a
  later failure keeps the dated one + Retry) · cancelled/recovery (**N/A for the read — say so**; the dialog's cancel
  restores nothing because it committed nothing). Refusals render through `StateBanner` (`components/common/state.tsx:85`)
  — no Sonner, no toast (GAP-ORDER §2 UI rule). `cash_set_unpublished` renders as a face with an entrance to the
  publish dialog, **never as RM 0.00**.
- **Non-negotiables**: 320px (tiles stack; the chart falls back to the table); 200 % zoom (no horizontal page scroll);
  keyboard + focus return from the selector and from every drilldown; screen-reader names carrying the period **and**
  the currency ("Book cash RM 182,340.55 as at 18 Sep 2026", never a bare number); reduced motion honoured; `?period=`
  survives Back; **no drafts on this surface — say so**. Every new user-facing string is **English**, in
  `apps/web/messages/en.json` under ONE new namespace (`ClientFinancial`), because `scripts/check-message-keys.mjs` runs
  in `lint`.
- **One-line registrations only**, at the sorted position: `apps/web/test/manifest.txt` (eight lines),
  `apps/web/messages/en.json` (one namespace), `apps/web/e2e/e2e-fixture-ownership.test.ts` (your three verbs; leave
  `:361` alone), `packages/db/tests/rig-meta.mjs` (mind the `];` repair hazard), `packages/db/package.json` gate chain,
  `CONTEXT.md`. **No** `serve-built.mjs` edit (the shared mock is already wired at `:58`), **no** `tree.ts`, **no**
  `action.yml`.

**Docs** (same commits as the code): `CONTEXT.md` — the five terms above in the house "term / _Avoid_" shape;
`packages/db/README.md` — the two relations and **all three doors by name** with their floors and grants, plus the
pre-0120 unmarked-`closing_transfer` caveat stated as a known coverage limit and the no-agent-twin departure;
`packages/db/tests/README.md` — the new cohort + gate; `apps/web/README.md` — the envelope module, the
one-read-four-faces rule, the Recharts dependency and its table-fallback obligation. **Never** `docs/PRD.md` or
`docs/ARCHITECTURE.md` (WORK-ORDER rule 5); record **blueprint drift** in the report instead, with these exact lines
(SYNTHESIS §6): `docs/PRD.md:59` (Client Home financial summary = four summaries + three charts; you deliver two and
two — half-true after this ticket) and `docs/ARCHITECTURE.md:287` + §7's metric-pack row ("报表 metric pack 与
chart／表格读同一定义" — the cash/profit half is discharged here, the AR/AP half is #669's).

## 4. TDD seams (red first)

**Stage 0 — the measurements, before any file is written.** DECISIONS §6 (§7.4) and SYNTHESIS K3/K4 make these the
worker's **first red cells, never assumptions**; each closes a gap-660 "unverified" item. Report every one with the
command that produced it and its output.

- `p660.measure.pins` (**u1**) — `sha256(prosrc)` for the five dependency bodies on `clara_660`, read off `pg_proc`.
  These bytes become the prestate. A transcribed pin refuses to apply.
- `p660.measure.close_bodies` (**u3**) — whether `finalize_close`'s live body is 0120's, 0128's or a later splice, and
  the same for `reopen_fiscal_year`: **measure it, do not grep it** (both are in your pin set, so this is the same
  command as `p660.measure.pins` with its answer written down).
- `p660.measure.tb_plan` (**u2**) — `explain (analyze, buffers)` for seven `trial_balance_as_of` calls versus one
  filtered pass, on a seeded client (≥5k journal lines). This decides §3 item 8's compute shape; both shapes owe
  `p660.pack.matches_trial_balance`.
- `p660.measure.tb_batteries` (**u4**) — open the nine existing `trial_balance_as_of` consumers
  (`packages/db/tests/wave-b/wb-k-obwriter.test.mjs`, `wave-b/wb-g-tail.test.mjs`, `f-a4-pr1b-task17-battery.test.mjs`,
  `x85-b3-reopen-ends-on.test.mjs`, `er9-corpus-fixtures.mjs`, `delta-catalog-phase.mjs`,
  `delta-account-set-acceptance-phase.mjs`, `delta-algebra-phase.mjs`, `delta-fixtures.mjs`) and report what each
  asserts: a reusable corpus, or a constraint this slice would break.
- `p660.measure.account_sets_live` (**u5**, local half) — count published `clara.account_set_versions` rows on the rig
  (expect 0). A nonzero count changes nothing technically, but the orchestrator must know before release; the hosted
  half is a release-runbook read.
- `p660.measure.floor_sources` (**u7**) — on seeded clients, which floor sources actually exist (finalized seed /
  approved entries / neither), so the floor expression is tested against real shapes rather than imagined ones.
- `p660.measure.overload_wall` — `to_regprocedure` is NULL for all three new names before the file is written.
- `p660.measure.chart_dry_run` (**u8a**) — `pnpm --filter @clara/web ui:add chart --dry-run`; report the exact resolved
  file list and whether `components/ui/card.tsx` is in it (D19.c's procedure then applies).
- `p660.measure.bundle_delta` (**u8b**) — `pnpm --filter @clara/web build` before and after the install, and, if it
  completes on this host, `pnpm --filter @clara/web cf:build` (`opennextjs-cloudflare build`); report the measured
  delta and the resulting Worker size **without** asserting a ceiling you have not read.

*The remaining gap-660 unverified items are closed here, not by you.* **u6** (hosted count of unmarked close entries)
and the hosted half of **u5** are **release-runbook reads** (DECISIONS §6, §7.4 #11): build the condition synthetically
and write "hosted evidence pending". **u9** is answered in §3 item 8 (the link addresses one entry, so `FETCH_CAP`
never binds). **u10** is answered by the orchestrator: appendix B carries no dashboard obligation for #660 — its only
dashboard-adjacent rows (`C55.21` / `C83.10`) are #635's commercial usage and are explicitly kept apart from accounting
metrics (DECISIONS §3.2, #635 vs #660). **u11** is answered by the two drift lines named under Docs (SYNTHESIS §6 lists
both). **u12** — run `codebase-memory-mcp`'s `check_index_coverage` over the paths you cite and say so in the report
(WORK-ORDER rule 1). **u13** (sealed report vs live pack) is ruled: they may legitimately diverge, you own not hiding
it, #672 owns the reconciliation rule (SYNTHESIS §4, marked unverified there too). **u14** (has
`wake_create_account_set` ever been called) is unmeasurable from here and does not change §6-D2 — put it in the
report's open questions.

**DB battery** `packages/db/tests/client-financial-pack.test.mjs`, frontier-gated on `client_financial_pack$`, every
assertion through `humanQuery` least-privileged personas (never `rootQuery` except for labelled fixture DML —
DECISIONS §4). Cells:

| Cell | Proves |
|---|---|
| `p660.pack.cash_cumulative_no_fy_reset` | Two fiscal years with a finalised close between them: cash at FY2's mid-point is cumulative from inception, **not** FY2-only movement. |
| `p660.pack.opening_counted_once` | A client with an approved opening seed: the opening appears in cash exactly once; a second read does not double it. |
| `p660.pack.matches_trial_balance` | The pack's cash equals the member sum of `trial_balance_as_of` at the same as-of — the cell that makes "one definition" checkable under either compute shape. |
| `p660.pack.closing_transfer_excluded` | A finalised year: the close entry's income/expense legs are out of profit, while an ordinary `is_year_end=true, closing_transfer=false` **correction** in the same period is **in**. |
| `p660.pack.reopen_mirror_excluded` | After `reopen_fiscal_year`, the mirror (which copies `closing_transfer`, `0120:797-814`) is excluded too, so profit does not swing by twice the roll. |
| `p660.pack.unmarked_history_partial` | An approved entry in the period carrying `close_receipt_id` but `closing_transfer=false` drives `coverage='partial'`, reason `closing_transfer_unmarked_history` — never a silently wrong number. |
| `p660.pack.unmarked_history_no_false_positive` | A plain `is_year_end=true, closing_transfer=false` correction with no `close_receipt_id` does **not** trip the detector (the error `0016:45-49` names). |
| `p660.pack.reversal_and_negative_not_clamped` | A reversal and a negative correction each move profit by their signed amount; no `greatest(x,0)` anywhere. |
| `p660.pack.cash_set_inactive_member` | An **inactive** bank account with a live balance is a member of the published set and its balance is in cash — the assertion `create_account_set_v1` provably cannot satisfy (`0058:344-358`). |
| `p660.pack.cash_set_unpublished` | No published set → `status` is not `ok`, `value_cents` is null, reason `cash_set_unpublished`. **Not 0.** |
| `p660.pack.cash_set_version_pinned` | All six points use the **same** version across a fiscal-year boundary; publishing a new version mid-series retro-changes no earlier point. |
| `p660.pack.cash_set_version_changed_in_series` | A point outside the resolved version's window yields `coverage='partial'` + `cash_set_version_changed_in_series`. |
| `p660.pack.statement_balance_never_cash` | A `bank_statements` row with a different `closing_cents` (`0038:384`) changes nothing in the pack. |
| `p660.pack.pre_coverage_point` | A month-end before the coverage floor is `available:false, reason:'pre_coverage'` — not 0. |
| `p660.pack.floor_fallback_no_seed` | No finalized seed ⇒ the floor is the earliest approved `posting_date`; a `carry_down_deferred` client additionally reports `coverage='partial'` + `opening_carry_down_deferred`. |
| `p660.pack.empty_population_not_zero` | A complete read over an empty population is `ok` + 0 + `no_posted_entries` — the one case where a reason accompanies `ok`. |
| `p660.pack.mtd_comparison_capped` | 2026-03-31 MTD compares against 2026-02-01..2026-02-28 (capped), not 2026-02-01..2026-02-31. |
| `p660.pack.zero_denominator` | A comparison amount of 0 → `delta_pct` null, and the amount is still shown. |
| `p660.pack.sign_change` | Profit −1,000 → +500 reports `sign_change:true` with both amounts. |
| `p660.pack.future_as_of_refused` / `p660.pack.month_not_first_day_refused` | CLR10 `as_of_in_future` / `month_not_first_day`, with nothing computed. |
| `p660.pack.envelope_complete` | Every figure group carries all ten envelope fields; `source_watermark` matches `^[0-9]+:[0-9]+:([0-9]+(,[0-9]+)*)?$` (`0057:390-396`); `definition_version` is the literal `clara.client-financial-pack/v1`. |
| `p660.pack.composition_bounded` | The caps, `entries_truncated` and `entries_total` behave; every entry row carries an id that addresses `?entry=`. |
| `p660.pack.floor_viewer` | A viewer reads the pack and reads **nothing** they could not already `SELECT` (`0003:514`, `:522-525`) — no aggregation bypass. |
| `p660.pack.cross_firm` | Another firm's owner and an invented client id answer **identically** — no oracle in either direction (`client-work-pack.test.mjs:479` is the shape). |
| `p660.pack.publish_floor_admin` | `publish_client_cash_account_set` refuses a bookkeeper with CLR04; the read is unaffected. |
| `p660.pack.publish_idempotent` | A byte-identical replay under one `op_key` returns the same version and mints no second revision; a different payload under the same key is the house receipt-hash CLR10. |
| `p660.pack.publish_members_malformed` | Each of `members_malformed`, `member_reason_invalid`, `account_not_of_client`, `duplicate_account`, `cash_set_empty` raises with its `detail.reason`, and nothing is written. |
| `p660.pack.publish_first_version_covers_history` | A first version with a null `effective_from` is stamped at the books' start, and a first version dated after the earliest approved `posting_date` is refused `first_version_after_books_start`. |
| `p660.pack.propose_never_petty_cash` | The proposal read includes **inactive** bank accounts and proposes **no** petty cash, under any account name or code. |
| `p660.pack.no_agent_reach` | `clara_runtime`, `clara_agent_ro` and every `clara_wake_*` role hold no EXECUTE on **any of the three** functions, asserted one by one **by name** — the proposal read is named explicitly, because a two-door assertion would pass while it stood open. |
| `p660.census.pins_unmoved` | The five pinned bodies are byte-identical after the migration (the tail's own assertion, re-run as a cell). |

**Golden fixtures** (AC6): one deterministic exact-cent corpus in `packages/db/tests/` covering FY boundary · opening ·
closing transfer (marked and unmarked) · correction · reversal · negative amount · partial current month · two reads
inside one snapshot returning identical figures.

**Runtime World leg: NONE, and that is a ruling, not an omission.** This slice writes no runtime file and enqueues no
Work, so AC8's Workflow clause does not apply (§2, AC8). In its place run, from the worktree root, and report the
counts: `node scripts/check-frozen-workflows.mjs` and `node packages/runtime/scripts/check-parts-parity.mjs` — expected
no-ops, and a green there is the evidence for the "no successor" verdict (SYNTHESIS §7.2).

**Web unit** (each file added to `apps/web/test/manifest.txt` at its sorted position — an unregistered file silently
never runs, and `lint` checks the manifest):
`lib/dashboard/period.test.ts` (capping, days-in-month, MYT 00:00/23:59 boundaries, the 13-month option list) ·
`lib/dashboard/financial-pack.test.ts` (unknown ≠ zero; a malformed body ⇒ `unknown`; a missing envelope field ⇒
`unknown`; an absent `delta_pct` renders "—" and **never** 0 %; no cents arithmetic in the module) ·
`lib/dashboard/use-financial-pack.test.ts` (30 s while-visible poll; a hidden tab skips the read but still advances the
delay clock; 60 s ⇒ delayed + last-success instant; denial clears values **and** `readAt`; transport failure keeps the
dated value; **a period change clears before re-reading**; a source-read cell proving `WORK_STALE_AFTER_MS` is
imported, not restated) · `components/firm/client-home/client-cash-summary.test.tsx` ·
`client-profit-summary.test.tsx` · `client-financial-charts.test.tsx` (exact money strings, period labels, the
partial-month label with its as-of, the table fallback present in the DOM, empty ≠ zero ≠ denied) ·
`client-home-money-a11y.test.tsx` · `client-home-money-keyboard.test.tsx`. **Re-run unchanged**:
`client-work-attention.test.tsx` (especially `p650.pack.no_period_axis:425`) and `client-workspace-overview.test.tsx`.

**Playwright** — **append** to `e2e/home-board-walk.spec.ts` + `e2e/home-board-mock.mjs` (do not mint a parallel
pair; #659 appends beside you; never restructure the dispatch; split only if the spec passes ~40 cells, and then your
cells move to `client-money-walk.spec.ts` importing the same mock — DECISIONS §3). Legs, in the file's own idiom (per-page
`page.route` overlays, `cellBudgetMs`, `page.clock`, axe over `WCAG_TAGS`):
`p660.money.arrive` (exact cash and profit with their period) · `p660.money.period_switch` (the selector writes
`?period=` into the URL; Back restores the previous period **and** focus) · `p660.money.drilldown` (a composition row
opens `/clients/<id>/journals?tab=posted&entry=<id>`; Back returns with focus) · `p660.money.partial` (the
unmarked-history face keeps the number and names the reason) · `p660.money.unpublished` (the cash-set face and its
entrance, **no 0**) · `p660.money.denied` (a mid-session CLR04 clears the values while the Work band beside it is
untouched) · `p660.money.first_failure` (no number at all) · `p660.money.delayed` (`page.clock.install()` +
`fastForward("01:05")` ⇒ update-delayed with the dated numbers kept) · `p660.money.chart_fallback` ·
`p660.money.narrow` (320px + 200 % zoom + reduced motion; the table fallback expanded; no horizontal scroll) ·
`p660.money.axe` (full WCAG 2.1 AA over the money band).
**The RPC verbs your mock answers**, declared in `e2e/e2e-fixture-ownership.test.ts` as **exclusive to this lane**
(SYNTHESIS §3.3 lists exactly these three under #660): `/rest/v1/rpc/get_client_financial_pack`,
`/rest/v1/rpc/propose_client_cash_accounts`, `/rest/v1/rpc/publish_client_cash_account_set`. `get_client_work_pack`
stays answered by the existing handler with its existing `debt` declaration (`:361`) untouched. POST bodies through
`readCachedJson` only (`e2e/mock-dispatch.mjs:34`).

**Census suites that will red on files you never touched** (run them; they are part of the evidence — SYNTHESIS §7.2):
`apps/web/tests/sql-oracle.test.ts` (it lexes every migration, so three new SQL functions enter its corpus),
`tests/parity-holes.test.ts`, `tests/firm-scope-surfaces.test.ts`, `tests/firm-scope-fourth-entrance.test.ts`,
`e2e/e2e-fixture-ownership.test.ts`; and `packages/db/tests/operation-census.test.mjs` +
`packages/db/tests/rig-isolation.test.mjs` (no reset flags). **How this branch keeps them green**: new components live
under `components/firm/client-home/` and new modules under `lib/dashboard/` (no new file under `app/**` except the
existing client page's `searchParams`, which changes no href); the three RPC verbs are declared in
`e2e-fixture-ownership.test.ts` at their sorted position; every new web test file is registered in
`apps/web/test/manifest.txt`; and the three new SQL functions arrive with the migration the `sql-oracle` corpus lexes.
If one of these reds anyway, that is a finding for the report — not a file to edit around.

## 5. Risks

- **`apps/web/package.json` + the lockfile** — you are one of up to three lanes adding a production dependency (#657's
  `combobox`/`popover`, #642's `@shadcn/react`; SYNTHESIS §7.1 ranks this first). Commit your own manifest + lockfile
  change; **the integration worker regenerates the lockfile once** (`pnpm install --lockfile-only`) and re-runs the
  frozen install. Do not resolve a sibling's dependency.
- **`components/ui/card.tsx`** — the `ui:add chart` payload includes it and the guard does **not** block it (D19.c). A
  silently rewritten `card.tsx` would revert in-file owner rulings across the whole product. Follow the four-step
  procedure and put the `git diff --stat` in the report.
- **`client-workspace-overview.tsx`** — you own it, and the wave admits **exactly ONE foreign hunk on it: #636's, "at
  most one link (prefer none)"** (`DECISIONS.md:109`). **#656 has NO access to this file this wave ("#656 none"), and
  neither has #659** — so do **not** expect, budget for, or accept an incoming #656 or #659 hunk here at merge or review
  time; if one appears, it is an ownership breach for the orchestrator to rule on, not a conflict for you to resolve,
  and your report names it. (Orchestrator ruling — supersedes `SYNTHESIS.md:357`'s "#636 and #656 confine themselves to
  one link each"; read at reconcile time, the sibling briefs already say the same: `brief-656.md` puts this file under
  "Do NOT open", `brief-636.md` under "at most one link — prefer none", `brief-659.md` under "#659 opens none of them".)
  Your own hunk adds the period prop and one section. Anything larger is a merge you will lose.
- **`home-board-walk.spec.ts` + `home-board-mock.mjs`** — shared with #659 this wave and with open #902. Append
  handlers after the existing ones; leave `e2e-fixture-ownership.test.ts:361` exactly as it is. If #659's structural
  edits land first, rebase onto them rather than reordering the dispatch (SYNTHESIS §3.1's sequencing note).
- **`rig-meta.mjs` (nine lanes), `packages/db/package.json` gate chain (nine lanes, migration order — not
  alphabetical), `test/manifest.txt`, `messages/en.json`, `e2e-fixture-ownership.test.ts` (four structures),
  `CONTEXT.md`** — one-line registrations at the sorted position only; the `];` repair in `rig-meta.mjs` is the known
  hazard. Three more shared files are on nine other lanes' paths and you touch **none** of them, which is itself the
  mitigation: `apps/web/lib/navigation/tree.ts` (no new leaf — the client home is already a destination),
  `apps/web/e2e/serve-built.mjs` (the shared mock is already wired at `:58`) and
  `.github/actions/db-live-gates/action.yml` (no World leg). Say so in the report so a reviewer does not read the
  absence as an oversight.
- **Blast radius of the recuts: none — and that is a claim your tail must prove.** The five pins exist precisely so
  "additive" is checked rather than asserted. If any pin mismatches on apply, **stop and report**; do not re-pin to
  whatever is live.
- **This is the heaviest read on the client home** — `SECURITY INVOKER` over `journal_entries × journal_lines ×
  coa_accounts`, up to seven as-of evaluations per call, polled every 30 s. Keep the **while-visible-only** rule
  (`use-client-work-pack.ts:190-198`); never add a hidden-tab read. `p660.measure.tb_plan` decides the compute shape
  **before** you write the body.
- **Two silent-wrongness traps this ticket is uniquely exposed to** (SYNTHESIS §7.5 #6): a statement balance standing
  in for book cash, and a fabricated 0. Both are defended by a `prosrc` tail assertion **plus** a behavioural cell,
  never by a comment.
- **Recharts on a Workers build** — measure the bundle delta; if the install cannot be made safe or the build
  regresses, ship the table-only face, name the residual, and do not hand-roll an SVG chart (that would be the estate's
  third chart implementation).
- **Known Windows-only reds you must not "fix"** (RIG.md; WORK-ORDER rule 9): #707 (x56-rest-c shells out to grep),
  #693 (EICAR fixture quarantined by Defender), no `pg_dump` on PATH, `thread-live-clarify.test.tsx`'s whole-suite load
  flake (re-run it alone and report both), `rig-isolation.test.mjs` T10b after a World bootstrap (#866 — you bootstrap
  none, so it should not appear). `next build` may panic `0xc0000142` under ten-lane contention: retry once (#869).

## 6. Effort and rig

**Effort: XL** (DECISIONS §7; SYNTHESIS §7.3) — six independent unbuilt things, one of them a product decision: a
governed versioned cash-account-set model with its authoring door (the existing writer **provably cannot express the
membership**, `0058:344-358`, and is a recorded zero-caller retirement candidate, `apps/web/lib/reports/types.ts:216-224`);
a new versioned read with a ten-field envelope, two six-point/six-month series and three comparison edge rules; a period
selector that **does not exist anywhere in the repo**; a new npm dependency on a Workers-built app with a mandatory
table fallback; drilldowns with no general destination; golden fixtures across seven accounting boundaries plus a
viewer-floor/no-oracle battery and an extended browser walk. The 30 s / 60 s / denial / scope half is the one cheap
part.

**Rig**: worktree `C:\Users\zhant\Desktop\clara-wt\660`, branch `impl/660-dashboard-cash-profit`, PG **55710**, db
**clara_660**. Node 22 first, in every Bash call: `export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"`. DB env:
`export PGHOST=127.0.0.1 PGPORT=55710 PGUSER=postgres PGDATABASE=clara_660 CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`.
**Never** set `CLARA_RIG_ALLOW_RESET=1` or `CLARA_RIG_ALLOW_ROLE_SWEEP=1`, and never run a second from-scratch chain on
this cluster (0154 pins the cluster-wide `clara%` role count). No `psql` on Windows — use `node` + `pg`. Playwright
triple as above; always go through `pnpm --filter @clara/web e2e <substring>` (`npx playwright test` alone serves a
stale build, #865). Ground yourself with `codebase-memory-mcp` (`search_graph` / `get_code_snippet`, and
`check_index_coverage` over the paths you cite) before opening files, and check Context7 for any Recharts / shadcn /
Next 16 / PostgreSQL 17 API you are not certain of (WORK-ORDER rule 2).

**Before the final report, run and report counts for**: `pnpm typecheck` and `pnpm lint` (worktree root, both green) ·
the **whole** `apps/web` unit suite once (`node scripts/run-tests.mjs` from `apps/web`, ~5 min) · your DB battery with
the **40** `--import ./tests/*-preintegration-gate.mjs` flags copied verbatim from `packages/db/package.json` (plus your
own at its migration-order position), and a **focused** run **without** your gate module to prove it FAILS loudly below
0232 (the precedent for that proof is `.github/actions/db-estate-suite/action.yml:136`, "focused run, gate variable
UNSET") · `packages/db/tests/operation-census.test.mjs` and `rig-isolation.test.mjs` (no reset flags — this slice adds
SQL functions) · `node scripts/check-frozen-workflows.mjs` and `node packages/runtime/scripts/check-parts-parity.mjs`
(expected no-ops; report the counts) · your Playwright legs on your own triple. A skipped frontier-gated battery is not
evidence; local ≠ hosted — every claim in the report is local, and the hosted reads (the unmarked-`closing_transfer`
count; any live `account_set`) are written as **"hosted evidence pending"** with the release-runbook ask.

**Copy the house shapes from**: `packages/db/migrations/0214_client_work_pack.sql` (header, prestate pins, envelope,
grants, tail) and `0219_client_onboarding_facts.sql:276-291` (the event pair); `packages/db/tests/client-work-pack.test.mjs`
+ `client-work-pack-preintegration-gate.mjs` and `rig-meta.mjs:2155-2167` / `:2515-2518` / `:2962` (battery, gate,
cohort); `apps/web/lib/work/client-work-pack.ts` + `use-client-work-pack.ts` (wire parser, state machine);
`apps/web/e2e/home-board-walk.spec.ts` + `home-board-mock.mjs` (walk legs, overlays, clock, axe);
`docs/plan/active/refresh-wave-2026-09-15/brief-649.md` and `reports/649-final.md` for what a reviewer later demanded —
behavioural cells rather than `prosrc` assertions wherever a behaviour is provable, re-measured rather than copied
evidence, an explicit merge-collision table, and every claim carrying the command that produced it with its pass/fail
counts.

## Verifier findings not applied

**None. Both findings were opened against their own evidence, confirmed, and applied** (reconcile pass, this file only;
READ-ONLY on every other tracked file).

| Finding | Verdict | What the reconciler did |
|---|---|---|
| **F1** (major, `contradicts_decisions`) — §5 told the worker "#636 and #656 may add one link each" on `client-workspace-overview.tsx` | **Confirmed and applied.** `DECISIONS.md:109` reads `\| components/firm/client-workspace-overview.tsx, client-home/* \| #660 \| #656 none; #636 at most one link (prefer none); #659 none \|`. The draft's source was `SYNTHESIS.md:357` ("#636 and #656 confine themselves to one link each"), which DECISIONS outranks (BRIEF-ORDER §1.1-1.2). | §5's bullet now states: one foreign hunk only (#636, at most one link, prefer none), **#656 none and #659 none**, with the instruction not to expect / budget for / accept a #656 or #659 hunk and to report one as an ownership breach. The binding **Ownership** bullet carries the same three-way grant, so the two sections now say one thing. Cross-checked against the sibling briefs as they stood at reconcile time (`brief-656.DRAFT.md:19` "Do NOT open"; `brief-636.DRAFT.md:86` "at most one link — prefer none"; `brief-659.DRAFT.md:98` "#659 opens none of them", each becoming `brief-<n>.md` when its own reconciler lands) — no live ownership collision to escalate. |
| **F2** (minor, shape) — §3's migration list stopped at item 11 (tail) and never closed with the gate module / cohort that `BRIEF-ORDER.md:52-56` puts last in the prescribed order | **Confirmed and applied.** The gate stem and cohort were stated only in the "Orchestrator decisions (binding)" bullet, above `## 1. Current state`, so §3 was not self-contained in BRIEF-ORDER's order. | Added **item 12 (Gate module)** and **item 13 (Cohort)** to the §3 list, restating and extending the binding bullet with facts re-measured on this checkout: `packages/db/package.json` carries **40** `--import ./tests/*-preintegration-gate.mjs` flags ending at `preview-invite-preintegration-gate.mjs`; `client-work-pack-preintegration-gate.mjs` is the copy-shape and its reasoning (a focused run must fail loudly); the three rig-meta sites are declaration `:2155-2167`, `ALLOWED[ROLES.authenticated]` roster (`ALLOWED` at `:2314`, the 0214 spread `:2515-2518`) and the `cohortFailures(...)` call `:2962`; and `liveNames` (`:2914`) is built from `pg_proc`, so the cohort covers function names only — the two new relations are the tail's and the battery's job, not the cohort's. |

**One further correction the reconciler made on its own measurement** (not a verifier finding): D19.c cited
`"registries": {}` at `components.json:22`; it is at **`:24`** (`cat -n apps/web/components.json`). The rest of D19.c
re-measured clean this pass — `style: "base-nova"` at `:3`, `apps/web/scripts/protected-components.json` holds exactly
`components/ui/button.tsx` + `components/ui/pagination.tsx` (so the guard at `ui-add.mjs:239-248` will **not** stop a
`card.tsx` overwrite), `apps/web/components/ui/` holds **32** entries with **no `chart.tsx`**, and `apps/web/package.json`
has **no `recharts`**. The four-step procedure stands exactly as written.
