# Brief: #659 — 在事务所首页掌握各客户工作与注意事项

*"An authorised portfolio view of clients, Work attention, exceptions and attributable recent activity with
drill-down and preserved return state." Journey **B1 Firm Home** — portfolio + Work attention → client/Work
drilldown → return to the preserved portfolio view. Spec coverage: user stories 12, 18, 30, 102–106.
Blocked-by #641 and #649 are both CLOSED and in main (`0203`, `0219`). Ticket carries **eight** acceptance
checkboxes and **six** historical rows, and has **zero comments** (`gh issue view 659 --json comments` → `[]`,
measured this pass) — the body is the whole spec.*

---

## Orchestrator decisions (binding)

### Migration

- **Migration `0231` only**, ONE file `packages/db/migrations/0231_firm_portfolio_pack.sql` (DECISIONS §2, row
  0231). **File order is fixed**: house header → prestate (**five measured non-regression pins** + the
  single-`pg_proc`-row census wall) → `set role clara_fn_owner` → `get_firm_portfolio_pack` →
  `get_compliance_watch_disposition` → the ONE conditional index → grants → `reset role` → tail postcheck.
  Copy `0214_client_work_pack.sql` header-to-tail; it is the same shape one altitude down and its tail
  (`0214:483-598`) is the exemplar for every assertion below.
- **This branch recuts NOTHING** (DECISIONS §2 row 0231: "Recuts: none"). Five live bodies are **read-only
  dependencies**, pinned by `sha256(prosrc)` **measured on `clara_659`** and re-asserted byte-identical in the
  tail, so *"0231 recut nothing"* is a checked fact rather than a claim:
  `clara.list_review_queue(jsonb,jsonb,int)` · `clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)` ·
  `clara.get_client_work_pack(uuid,int)` · `clara._work_run_attempts(uuid[])` ·
  `clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)`.
  **A pin transcribed from file text will not match and 0231 will refuse to apply**: `list_review_queue` is the
  most-spliced body in the estate (created `0011:3748`, **replaced whole** `0016:4558`, then spliced
  `0017:516-653`, `0036:1000-1073`, `0041:5346`, `0043:3553`, `0146:116`, `0180:1061` — **seven splices over one
  replacement**), and `list_activity` was created `0181:218`, replaced `0183:554` and `0184:1915`, then **dropped
  and re-created** at `0202:204`. No file's text is either body.
- **Two doors are frozen for this wave by name and #659 must not widen either.** `clara.list_review_queue` —
  every new fact goes in a new door; lifting its `clients.status='active'` joins or adding an `acknowledged_at`
  key to its `compliance` envelope drags four other lanes' markers into this prestate, and each splice
  re-derives every prior marker and raises CLR10 on drift (`0017:642-651`, `0036:1050-1056`, `0041:5380`,
  `0180:1090-1091`). `clara.list_accounting_work` — the receipt-dated window is **#905's**, open and separately
  owned (SYNTHESIS §0.1 and §3.2: the Work-list projection is **FROZEN for this wave**; three maps refuse it
  independently).
- **Signature-overload wall.** `0103:1055-1070` raises CLR10 if any name it installs carries more than one
  `pg_proc` row, and **it does not reach these two names** — so **0231 writes its own single-`pg_proc`-row census
  for each name it installs** (DECISIONS §2.2). Every new door is a NEW verb at ONE arity; never a defaulted
  extra parameter on an existing one (`0202`'s DROP+re-issue of five definition-carried properties is the
  precedent for the other branch and its cost, `0203:36`).
- **Gate + cohort (DECISIONS §2.2).** Stable stem `firm_portfolio_pack$`; gate module
  `packages/db/tests/firm-portfolio-pack-preintegration-gate.mjs` (copy
  `tests/client-work-pack-preintegration-gate.mjs` verbatim in shape, including its "a FOCUSED invocation does
  not preload this module and therefore FAILS loudly" paragraph), appended to `packages/db/package.json`'s
  **40**-flag chain **after** `preview-invite-preintegration-gate.mjs` — **migration order, never alphabetical**
  (measured this pass: the chain holds exactly 40 `--import ./tests/*-preintegration-gate.mjs` flags, last is
  `preview-invite-`). `rig-meta.mjs` cohort constant **`FIRM_PORTFOLIO_PACK_0231_COHORT`**, registered at the
  **three** sites the 0214 cohort uses: the declaration block (`rig-meta.mjs:2155-2167`), the human-fn roster
  (`:2515-2518`), the `cohortFailures` call (`:2962`). Two names, one cohort ("wholly present or wholly absent").
- **`.github/actions/db-live-gates/action.yml` gets NO row** — orchestrator ruling, same as #660's brief: that
  file wires runtime **World** legs (`node tests/*-e2e.mjs`, `:48`, `:119`, `:141`, `:168`, `:265`) and this
  slice has none; a db battery reaches CI through `packages/db/package.json`'s gate chain, which
  `.github/actions/db-estate-suite/action.yml:74` runs for every package.

### D18 — the owner-facing ruling, restated as seven binding lines (DECISIONS §0, row D18)

- **D18.a — 不改数据库墙，改口径说明.** The pack counts Work for **every client the caller's RLS admits**
  (`clara.accounting_work` carries no active-client guard; `0178`'s relations are firm-scoped only), while
  `list_review_queue`'s attention numbers structurally exclude `onboarding` and `archived` clients (`0017` joins
  `clients … and status='active'` into **every** source CTE, `0017:523-591`, re-asserted `:642-647`, copied by
  `0180:1077`). The pack therefore publishes `sources.review_queue.excludes = ['onboarding','archived']` and the
  row carries `coverage_reason='onboarding_client_excluded_from_queue'` where it applies. **Do not lift the 0017
  guard.**
- **D18.b — 新建窄读门 `get_compliance_watch_disposition`, delivering C88.10** (DECISIONS §5 folds it in as an
  owner-overridable rider). SECURITY DEFINER, bookkeeper floor, **no new table grant on either relation**;
  `state_before → state_after` stands in for the "version" the ticket's AC6 asks for, because
  `clara.compliance_watches` **has no version column** and `audit_log.args` records only
  `{watch, rationale, op_key}` (`0016:1092-1093`). **Do not invent a version number.**
- **D18.c — `AddClientControl` 抽成共享模块** and mounted on Firm Home, closing half of **#899** (DECISIONS §5).
  Exactly ONE creation control in the product; never a second. This **supersedes gap-659 Q5 and SYNTHESIS §3.1's
  "#659 decides"** — DECISIONS rules (`DECISIONS.md:5-6`), and gap-659's own design-lens ledger records the
  conflict as "listed, NOT applied" for exactly this reason.
- **D18.d — 合规行 link-only.** 裁-190 decision 3 stands (`components/firm/firm-home/oldest-waiting-list.tsx:5-11`).
  "Preserve … from firm attention rows" (AC6) means *these three governed doors remain reachable and
  undegraded at firm altitude*, not *a fourth call site*. **No inline ack / snooze / resolve on `/`.**
- **D18.e — 「最近成功」列保留, with the divergence disclosed before the click.** Copy #650's honest practice:
  the column ships, and the surface states "dated by when each Work started, not when it posted" before any
  click (`apps/web/e2e/home-board-walk.spec.ts:424` pins that sentence today). **#905 is not eaten.**
- **D18.f — 最近活动换到 `clara.list_activity` 并渲染执行人.** Both doors floor at bookkeeper, so the swap moves
  no permission (`0174:453` vs `0202:246-249`). **#861 (the kind ladder misfiling membership / invite /
  asset-acquisition / counterparty-identity / client-home-facet events under `documents`) is named as a residual
  on the surface and in the report; the ladder is NOT touched** — DECISIONS §6 keeps 2026-09-15 D13, and #861 is
  `ready-for-human`.
- **D18.g — 首页不加内联操作, 首页不出现任何金额.** Refused by ruling; the cost of the alternative is a
  reversed design decision and one governed door with two call sites.

### Money, boundaries and ownership

- **#659 renders NO money and installs NO chart primitive** (DECISIONS §3.2; Wayfinder 「Firm home … **不汇总客户
  金额**」, `comment-5585923205.md:13`). SYNTHESIS §4 and §7.5 #6 make this a **`prosrc` tail assertion plus a
  cell, never a comment**: #659's portfolio table is the easiest place in the product to `reduce` rows into a
  false cross-client total (`ReviewQueueRow.amount_cents` is right there, `lib/firm/needs-you.ts:205`).
- **Boundaries.** #660 owns every cents value and both charts, at **client** altitude, and owns
  `components/firm/client-workspace-overview.tsx` + `components/firm/client-home/*` — **#659 opens none of them**
  (DECISIONS §3). #635 owns `/settings/*` including the `/settings/compliance` register — **#659 links to it and
  does not edit `components/firm-admin/compliance-register-panel.tsx`**; a one-paragraph follow-up asks #635 to
  mount the same disposition read there. #642 owns the Clara rail and `app/(firm)/layout.tsx` — **#659 does not
  edit that layout**; a needed height contract is a question in the report. #636 counts children per parent
  batch; #659 counts Work per client — **no shared "progress" read**. #658/#655/#636 own
  `components/work/work-detail.tsx` — **#659 does not open it**.
- **`clara._work_run_attempts` is a SHARED CONSUMER, not a shared edit** (SYNTHESIS §0.1, §3.2). #636 and #659
  both become new callers; both are bound by the door's own ">101 ids ⇒ CLR10 `invalid_work_ids`" refusal
  (`0189:262-274`) and **both must label a PREVIEW, never a population** — say so on the surface, as
  `0214:62-76` already does.
- **NO new needs-you row kind** (DECISIONS §3, carried from 2026-09-15 §1.6). `REVIEW_QUEUE_ROW_KINDS`
  (`apps/web/lib/firm/needs-you.ts:97-118`) stays at its current eleven members.
- **#659 never enumerates a `purpose` vocabulary** — copy `0203:438-440`'s posture: concurrent lanes are
  widening the CHECK. #659 touches the purpose IN-list **nowhere** (SYNTHESIS §0.4, measured).
- **Shared files — one-line registrations at the sorted position only** (DECISIONS §3): `apps/web/messages/en.json`,
  `apps/web/test/manifest.txt`, `apps/web/e2e/serve-built.mjs`, `apps/web/e2e/e2e-fixture-ownership.test.ts`,
  `packages/db/tests/rig-meta.mjs`, `packages/db/package.json` (gate chain), `CONTEXT.md`.
  **`apps/web/lib/navigation/tree.ts` gets NO new leaf** — this slice adds no route.
  `apps/web/e2e/home-board-walk.spec.ts` + `home-board-mock.mjs` are **shared: #659 and #660 both APPEND**,
  neither restructures the dispatch, and **#902's `debt` declaration at `e2e-fixture-ownership.test.ts:361`
  stays byte-identical** (a second string may be appended after it; its comment block is not rewritten).
- **Do NOT edit `apps/web/lib/firm/use-review-queue.ts`** — orchestrator ruling, refining gap-659 Web §4 and
  Risk 7. Four surfaces share that hook (measured this pass: `components/firm/firm-home/firm-home-board.tsx:78`,
  `components/firm/needs-you-inbox.tsx:74`, `components/firm/client-workspace-overview.tsx:118` — **#660's file
  this wave** — and `components/work/client-work-queue.tsx:30`), and open **#903** has queued polish on it. A
  focus/visibility listener added there changes three other surfaces' request profile with a cell for none of
  them. **Write a composing hook instead** (§3 Web 3) and state in the report which of #903's items you did not
  close.
- **CONTEXT.md terms this ticket writes** (house "term / _Avoid_" shape; DECISIONS §3.1 ratifies the first by
  name): **Firm portfolio pack** (counts, never money) · **Portfolio coverage** · **Attention source freshness**
  · **Watch disposition**. Your status words are the four the code already chose — `ok` / `partial` / `unknown`
  / `denied` (`components/firm/client-home/client-work-attention.tsx:23-29`, `:65-71`) — and **no lane builds a
  shared freshness library this wave** (SYNTHESIS §4, binding).
- **Non-goals, in code comments and in the report**: no inline attention action on `/`; no money and no chart at
  firm altitude; no new needs-you row kind; no recut of `list_review_queue` / `list_accounting_work` /
  `list_activity` / `get_activity_event`; no patch of #861's kind ladder in the browser; no second client-creation
  control; no widening of `accounting_work.purpose`. **And one thing to say out loud so a later worker does not
  reach for it**: the three compliance doors **refuse an agent identity by construction** —
  `ack_compliance_watch` raises CLR03 when `wake_context().credential_id is not null` or the caller is an agent
  user (`0016:1053-1055`). A "Clara acknowledges the watch" tool is **not a deferred successor contract; it is a
  thing the database forbids.** Record it as a non-goal, not a gap.

### Successor contract

- **NONE. This ticket writes no successor-contract section.** DECISIONS §1.1 cuts exactly two bodies this wave
  (`chatTurn_v21`, `claraWork_v5`) and §1.2's four contract rows belong to #655, #651 and #658; SYNTHESIS §1.2
  puts **#659 in the "does not need it" column for both**. This journey calls **no runtime route and enqueues no
  workflow** (gap-659 Runtime: "Nothing"); `registry.ts` is untouched; `frozen-workflows.json`'s 296 entries are
  unreachable from this slice; `WORK_ACCEPTED_PURPOSES` is untouched. **You cut no `_vN`, edit no frozen file,
  import no frozen module.** #658's worker — not you — writes the #847 and #882(a) rider stanzas (DECISIONS §6).
- **AC8's durable-execution half is answered by "no Workflow on this path"** plus the real-role DB battery. Say
  that; do not claim a World leg and do not invent one.

### Effort, rig and the Playwright triple

- **Effort: L** (DECISIONS §7: "portfolio pack, disposition read, page rewrite, shared AddClientControl,
  firm-home walk"). gap-659 §11's "both Q3 and Q4 together is XL" sentence was in front of the orchestrator when
  it sized this ticket, so it is a **budget warning, not a competing size**; and §11's "To hold L, cut it" option
  is **no longer available** — it proposes splitting C88.10 out, which D18.b rules in.
- **Rig row, verbatim from `RIG.md`**: `659 | C:\Users\zhant\Desktop\clara-wt\659 | impl/659-firm-home | 55709 |
  clara_659 | https://127.0.0.1:3380 / 3381 / 3382 | install ok 437s | 219 applied | seed ok (2 files) |
  smoke 219 · 0224 · PG 17.11`.
- **Playwright port triple**: `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3380`, `CLARA_E2E_NEXT_PORT=3381`,
  `CLARA_E2E_RUNTIME_PORT=3382`.

### Citation corrections that bind your file paths

- Firm Home lives at **`apps/web/components/firm/firm-home/`** (`firm-home-board.tsx`, `needs-you-scoreboard.tsx`,
  `oldest-waiting-list.tsx`, `clara-working-tile.tsx`, `firm-setup-tile.tsx`, `firm-timeline-section.tsx`) —
  **not** `components/firm/firm-home-board.tsx` as gap-659 spells it (SYNTHESIS §0, re-measured this pass).
- `AddClientControl` lives in **`apps/web/components/firm/client-register-list.tsx:134`** — **not**
  `apps/web/lib/registers/client-register-list.tsx` as SYNTHESIS §3.1 spells it (measured this pass: that path
  does not exist).

---

## 1. Current state

**DB.** `clara.list_review_queue(jsonb,jsonb,int)` — SECURITY DEFINER, `_human_ctx(role_rank('viewer'))`
(`0016:4558-4563`), granted `clara_authenticated`; envelope = `watermark` (max `domain_events.seq` for the
firm/client, `0016:4691`), `counts` (**nine** integers: seven at `0016:4674-4681`, `lint_findings` spliced
`0017:617-624`, `work_questions` spliced `0180:1104`/`:1118`), `sweep`, `compliance`, `lint`, `rows`,
`next_cursor`. Its `compliance.clients` object carries exactly nine figure/date keys — `client_id`,
`service_group`, `state`, `confirmed_included_cents`, `unknown_or_mixed_cents`, `screening_proxy_cents`,
`earliest_crossing_month`, `application_due`, `future_method_status` (`0016:4699-4714`, read this pass) — and
**no** `acknowledged_by` / `acknowledged_at` / `snoozed_until` / `resolved_*`. It raises CLR10 `queue scope is
malformed` for a `client_id` outside the firm (`0016:4569-4575`, a `not exists(… and firm_id=c.firm)` probe) —
i.e. it **is** a cross-firm existence oracle, unlike 0189/0214.
`clara.list_accounting_work` — SECURITY INVOKER, inline bookkeeper floor, created `0189:301`, body-only replace
at the same signature `0203:214`; returns `{rows, next_cursor, truncated}` and **no aggregate, no counts, no
money** (`0203:349`, `:425`, `:449-450`). Its keyset idiom is the one to copy: cursor decode with a shape check
**and a non-finite fence** (`0203:301-321`), `order by w.created_at desc, w.id desc` in both passes and inside
the aggregate (`0203:326`, `:344`, `:356`), the mint `encode(convert_to(created_at||'|'||id,'UTF8'),'base64')`
(`0203:418-419`), the tail's literal-order probe (`0203:601`), and the refusal roster naming `invalid_cursor`
(`0203:90`). `0189:225-239` then built `ix_accounting_work_firm_created (firm_id, created_at desc, id desc)` so
the ORDER BY tuple **is** the index key, `id` in the KEY not as decoration, with the measured plan ("no Sort node
at all") pasted into the comment.
`clara.get_client_work_pack(uuid,int)` — `0214:234`, SECURITY INVOKER, `stable`, `search_path=clara,pg_temp` +
`plan_cache_mode=force_custom_plan`, bookkeeper floor by three inline predicates restated verbatim from
`0189:344-347` (the block opening `select clara.jwt_sub() as actor, clara.jwt_firm() as firm into c;`),
client-only by construction (null ⇒ CLR10 `invalid_client`), preview clamped
`least(greatest(coalesce(p_preview,5),1),25)`, seven MYT calendar dates as a half-open range publishing
`from_date`/`to_date`, envelope `{computed_at, preview_limit, window, facets:{active,recent_success},
needs_you_ref}` with per-facet `status`/`count`/`coverage`/`coverage_reason`, `uncounted_completions` +
`coverage_reason='completions_without_receipt'`, `retry_label_preview_only` for a preview short of the
population, **one** `grant execute … to clara_authenticated`. **This is the precedent to copy**, including its
"NO watermark — the Work lane emits no domain event, the envelope carries `computed_at`" and "NO total; the
facets overlap" statements.
`clara._work_run_attempts(uuid[])` — `0189:251`, SECURITY DEFINER, bookkeeper-floored and self-scoped to
`jwt_firm()` inside the body, **refuses a null array or >101 ids with CLR10 `invalid_work_ids`**.
`clara.list_firm_timeline(bigint,int)` — `0174:453-461`, SECURITY INVOKER, inline bookkeeper floor, returns
`(seq, event_type, event_description, client_id, actor, on_behalf_of, via_wake_kind, created_at)`.
`clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)` — `0202:204-215`, SECURITY INVOKER,
the same three inline bookkeeper predicates (`0202:240-249`), `p_limit` clamped 1..100, closed `kind` vocabulary
`documents|journal|close|report|agent|work` refused CLR10 `invalid_kind`.
**Compliance.** `clara.compliance_watches` (`0016:298-350`; `acknowledged_by`, `acknowledged_at`, `snoozed_until`,
`resolved_conclusion`, `resolved_evidence`, `resolved_by`, `resolved_at` all present as columns; **no version
column**; one open episode per `(client, service_group, watch_kind)` by partial unique index `:353-354`) and
`clara.compliance_watch_events` (`0016:359-370`: `event_kind` ∈ created/tier_change/acknowledged/snoozed/
re_armed/resolved/evaluation, `state_before`, `state_after`, `figures`, `actor`, `rationale`, `created_at`;
append-only). **Both FORCE RLS with exactly one `clara_fn_owner` policy and no application-role grant**
(`0016:396-414`, the `do $$ … foreach t in array array[…]` block, read this pass). Three human doors, all
bookkeeper+ with an explicit agent refusal: `ack_compliance_watch(uuid,text,text)` (`0016:1047`),
`snooze_compliance_watch(uuid,timestamptz,text,text)` (`0016:1101`, ≤60 days),
`resolve_compliance_watch(uuid,text,text,text)` (`0016:1151`); all three EXECUTE-granted to
`clara_authenticated` (`0016:4744-4751`). `clara.evaluate_sst_watches_all` is `clara_runtime`-only, so
`stale_evaluator` (48 h, `0016:4700-4702`) is the only honest freshness word a human can be given.
`clara.audit_log` is SELECT-granted behind a bookkeeper+ firm policy (`0002:518-520`, `:534-536`);
`clara.op_receipts` carries **no** application grant (`0195:251`).
`clara.clients` — `status` CHECK admitted only `active|archived` at birth (`0003:38`) and was widened to
`onboarding` at `0017:658-659`; `name` is NOT NULL (`0003:37`) and `uq_clients_firm_name (firm_id, lower(name))`
is UNIQUE inside one firm (`0003:41`) — **the index that already orders the scan this pack needs**.

**Runtime.** Nothing. No route, no workflow, no lib. Registry pins at base `chatTurn_v20` / `claraWork_v4` /
`documentIngest_v2` / `firmInterview_v3` / `clientOnboarding_v5` (`packages/runtime/workflows/registry.ts:990-998`).

**Web.** `app/(firm)/page.tsx` is 20 lines and reads **no `searchParams`** (`:18-20`) → `FirmHomeBoard`, a client
component owning its own `PageShell`/`PageHeader`. The board (`components/firm/firm-home/firm-home-board.tsx`,
237 lines) makes **three** reads — `loadCallerContext` (`:77`, fail-closed on 0 or >1 rows, `:88`),
`useReviewQueue({})` (`:78`), `loadClientRegister` (`:79`, unpaginated, `lib/firm/reads.ts:103-109`) — and
renders the firm name as h1 with a checked `FIRM_ROLES` label, an orientation sentence **omitted entirely while
`counts` is null** (`:133-135`), `NeedsYouScoreboard` (eight chips, each an anchor to one
`/work?view=needs-you`, `needs-you-scoreboard.tsx:35`, `:41-51`), `OldestWaitingList` (top 5, **link-only**,
`oldest-waiting-list.tsx:5-11`), `ClaraWorkingTile`, `FirmSetupTile` (admin+, renders null below rank),
`FirmTimelineSection`, `SweepStatusPanel`, a client-status line (`:212` `clientsEmpty` / `:216-228`
`clientsLine`) and a `NotBuiltNote` (`:231`). `caughtUp` at `:122` is a genuinely different sentence
(`orientationClear`), not a zero.
**Derivations** live in `lib/firm/home-facts.ts` with an explicit ceiling — may order, bucket by a DB-supplied
date, or count rows the DB returned in full, and **may never stand in for a `counts` field** (`:8-16`);
`ageInDays` floors and clamps a future instant to 0 (`:33-40`); `oldestWaiting` sorts unknown ages LAST and ties
on the queue's own row key (`:49-61`); `clientStatusTally` counts a fourth status rather than dropping it
(`:63-85`); `groupByBusinessDay` buckets in `Asia/Kuala_Lumpur` and drops an unparseable instant rather than
guessing a header (`:102-121`).
**State machinery.** `useAsyncRead` — mount-once ("the mount effect fires exactly once, on mount, for the
lifetime of the component instance", `lib/firm/use-async-read.ts:26-27`), monotonic reload epoch, raw typed
error kept for `DataState`. `useReviewQueue` — its mount effect is `lib/firm/use-review-queue.ts:117-119`;
page-size-derived `hasMore`; a successful `loadMore` does not clear a standing refusal. **Neither registers
`focus` or `visibilitychange`.** Five other hooks do (measured this pass by grep + open):
`lib/work/use-client-work-pack.ts:208-213`, `components/firm/activity/use-activity-feed.ts:237-240`,
`components/operator/use-operator-queue.ts:103-106`, `components/work/use-work-list.ts:184-187` register the
**pair**; `lib/work/use-work-detail.ts:186-187` registers `visibilitychange` alone and suppresses the re-read
for a terminal Work. Two of them state in their own headers that the listener **is** the live permission
recheck (`use-operator-queue.ts:9`, `use-activity-feed.ts:22`). Firm Home is the outlier, not the inventor.
**`DataState`** (`components/firm/data-state.tsx`) has exactly three branches — error → loading → empty
(`:76-80`) — and typed `no_session` / `forbidden` / `not_found` renderings (`:50-58`). **No partial arm.**
**`AddClientControl`** — `components/firm/client-register-list.tsx:134-370`, mounted **ABOVE** the register's
`DataState` with the reason written in the file ("so it is offered on an EMPTY register too … putting it inside
the table's own state would have hidden it exactly then", the H-51 note at `:395-401`). Its whole draft is
memory-only React state — `name`, `refusal`, `checkedFor`, `checkOutcome`, `candidates`, `arity`, `acknowledged`
(`:139-156`) — deliberately kept across a failed confirm ("THE TYPED NAME STAYS, always … which is what keeps
`OnboardingDoorDialog` open (CB-AE2E-004)", `:127-131`). The register re-reads on the bus at `:381`.
**Links.** `lib/firm/needs-you-links.ts` — `OWNING_TAB` is a null-prototype map at `:47-67`; `work_question` has
**no key** and falls through to `/clients/<id>` via `?? ""` (`:88`); `compliance_watch` likewise, under a
**stale** comment at `:55-56` ("renders on the firm admin compliance surface, which is NOT client-scoped") —
stale because `/clients/:id/tax` mounts `ComplianceWatchAffordance` today (`components/tax/SstWatchSection.tsx:34`,
`:114`). `needsYouRowHref` `:76-90` already carries ONE deep destination (`fixed_asset_incomplete` →
`fixedAssetHref`, `:85-87`), which is the precedent for a second. `hasOwningTab` `:95-97` drives the row's label
`t("openTab.<kind>")` (`oldest-waiting-list.tsx:88-92`), and **`NeedsYou.openTab` today holds seven keys —
`compliance_watch` and `work_question` are NOT among them** (measured this pass over `messages/en.json`).
`workDetailHref(clientId, workId)` exists at `lib/navigation/tree.ts:530`.
**Return-state machinery, one altitude down**: `lib/work/work-list-url-state.ts` — seven axes enumerated once
(`WORK_LIST_FILTER_AXES`, `:66-68`), the cursor deliberately IN the URL (`:12-19`), every malformed value
degrading to its empty default (`:20-27`), comma-joined list params (`:97`, `:193`), a filter change dropping
the cursor. `workAttentionHref` builds the three client drilldowns (`lib/work/client-work-pack.ts:265-287`), and
`WORK_ATTENTION_ACTIVE_STATUSES = ["queued","running"]` (`:71`) is #650's R3 ruling in code.
`WORK_STATUS_FACETS` (`lib/work/work-list.ts:220-223`) carries all nine statuses. Firm-wide `/work` exists and
reads `searchParams` only for markup (`app/(firm)/work/page.tsx:32-41`).
**Primitives**: 32 files under `components/ui/` including `empty`, `pagination`, `skeleton`, `table`,
`toggle-group`, `field`, `progress`; **no `chart.tsx`**; style `base-nova`; single locale. The board imports
**zero** `components/ui/*` primitives (`firm-home-board.tsx:40-57`). **No Sonner and no toast host anywhere in
`apps/web`** (grep; the rule is written into the composers, `components/journals/journal-composer.tsx:28-29`).
`enter-content` carries its own `prefers-reduced-motion: reduce` arm (`app/globals.css:515-527`), as does the
focus treatment and the `motion-reduce` custom variant (`:44-50`).

**Tests.** DB: **no firm-portfolio battery exists**; the shape to copy is
`packages/db/tests/client-work-pack.test.mjs` (thirteen `p650.pack.*` cells, `:195`–`:642`, all through
`humanQuery` personas, frontier-gated on `client_work_pack$` at `:38-62`), with its gate module and its
`rig-meta.mjs:2155-2167` cohort. Compliance lifecycle: `a21-watch-lifecycle.test.mjs`, `a21-watch.test.mjs`,
`a21-read-surfaces.test.mjs`. Web unit: `components/firm/firm-home/firm-home-board.test.tsx` (**ten** cells at
`:101`, `:119`, `:134`, `:155`, `:169`, `:181`, `:195`, `:215`, `:231`, `:249`), plus `lib/firm/home-facts.test.ts`,
`needs-you.test.ts`, `needs-you-links.test.ts`, `use-review-queue.test.ts`, `timeline.test.ts`, `reads.test.ts`,
`use-async-read.test.ts`, `components/firm/needs-you-a11y.test.tsx`, `needs-you-affordances.test.ts`,
`compliance-watch-affordance.test.tsx`, `add-client-control.test.tsx`, `add-client-candidates.test.tsx`.
Playwright: `e2e/home-board-walk.spec.ts` (**nine** tests: `:242` firm board, `:272`/`:295` client board,
`:309` reflow at **1440/1024 only**, `:343` axe over all three boards, `:376` drilldown+Back+focus, `:445`
320px/200%/reduced-motion, `:481` empty/unknown/denied, `:529` the 60-second delayed face) — it overlays every
fixture with `page.route` (`:10-13`, `:192-210`) and **never** touches the shared server.
`e2e/home-board-mock.mjs` (144 lines) deliberately does **not** answer `list_firm_timeline` (`:113-118`) and
overlays only `get_client_work_pack` (`:135`), declared `debt` at `e2e-fixture-ownership.test.ts:361`.
**Census suites that will notice this ticket**: `tests/firm-scope-surfaces.test.ts` (leaf-first over every
App-Router `page`/`route`), `tests/firm-scope-fourth-entrance.test.ts`, `tests/parity-holes.test.ts`,
`tests/sql-oracle.test.ts`, `tests/focus-ring-contract.test.ts`, `tests/reduced-motion-contract.test.ts`,
`tests/token-contrast.test.ts`, `e2e/e2e-fixture-ownership.test.ts`, `lib/navigation/tree.test.ts`,
`packages/db/tests/operation-census.test.mjs`, `rig-isolation.test.mjs`.

---

## 2. Gaps / rows — every AC and every historical obligation, with its evidence pointer

| Row | Disposition | Evidence the implementer must produce |
|---|---|---|
| **AC1** canonical distinct Work counts, client status, coverage, per-source freshness; never a cross-client money total | **to build (counts + coverage + freshness)** / **verify-only (the money half — a proven negative)** | `p659.portfolio.distinct`, `p659.portfolio.no_sum`, `p659.portfolio.partial_receipt`, `p659.portfolio.onboarding_disclosed`; **`p659.portfolio.no_money` off `prosrc` plus a web cell** — SYNTHESIS §4 requires an assertion, not a comment. Freshness: `p659.home.freshness` renders `watermark`, both `stale_evaluator` flags and `computed_at`. |
| **AC2** attention + activity link to the owning client/Work and return to the preserved portfolio filter/position | **to build** (three sub-gaps) | (a) two link repoints + their unit cells (`p659.links.work_question`, `p659.links.compliance_watch`); (b) the **failed/refused** column, which does not exist today (`p659.portfolio.attention_failed`); (c) `lib/firm/portfolio-url-state.ts` + `p659.home.drilldown` (Back lands on the home's own URL with its filter intact and focus returns to the control that left it). |
| **AC3** zero clients · successful zero workload · partial · stale · initial error · valid caught-up | **partial → to build four of six** | Built and re-measured: **caught-up** (`firm-home-board.tsx:122`, `:141-143`) and **typed initial error** (`data-state.tsx:50-58`). To build: **zero clients** (Empty + the creation affordance), **successful zero workload** (a sentence distinct from caught-up), **partial** (`DataState` has no partial arm — the portfolio section owns its own branching; **do not widen the shared component**), **stale**. Cells: `p659.home.states` (browser) + `firm-home-states.test.tsx` (unit, **seven** strings). |
| **AC4** an authorised zero-client user can start client creation; other roles see only supported actions | **to build via extraction (D18.c)** | `AddClientControl` extracted to its own module and mounted on both pages; `p659.home.zero_client_create` (admin reaches creation from `/` and lands on the DB-returned client id; a bookkeeper sees no control **and no greyed promise** — `firm-setup-tile.tsx:13-18`, `:36-39` is the live precedent) + `p659.home.draft_survives_refresh`. |
| **AC5** mixed-client fixtures · access change · missed-event refresh · exact count drill-down · responsive/keyboard/focus · readable loading/partial | **partial → to build the refresh contract and every new cell** | Missed-event refresh is **not implemented**, not merely untested (`use-review-queue.ts:117-119`, `use-async-read.ts:26-27`): build it in the **new composing hook**. Access change rides the same listener (`use-operator-queue.ts:9`). `p659.home.portfolio` carries the mixed fixture (active + onboarding + archived, one parked question, one failed Work, one caught-up); `p659.home.drilldown` is the exact-count proof; `p659.home.responsive` the 320px/200%/reduced-motion one. |
| **AC6** compliance ack/snooze/resolve preserved from firm attention rows; attributable actor/time/version receipt correct after reload; refusal preserves rationale and evidence; permissions retained; distinguished from inactive beta Tax | **partial → verify-only (the three acts) + to build (the receipt)** | The three acts survive **untouched** — re-measure, do not rebuild (`compliance-watch-affordance.tsx:73-93`, `if (ok) reset()` at `:79`, `:86`, `:92`; registered once at `needs-you-affordances.tsx:107`; mounted at `needs-you-inbox.tsx:129` and `SstWatchSection.tsx:114`). The **receipt is a missing door**: build `get_compliance_watch_disposition` + `p659.watch.*`. **"Version" has no referent** — say `state_before → state_after` and name the absence. Beta-Tax boundary: one sentence on the surface citing `components/tax/TaxWorkbenchPage.tsx`'s own header table and ARCHITECTURE §7's SST row. |
| **AC7** states · 320px · 200% · keyboard/focus return · SR names · reduced motion · stable URL/Back · preserved drafts · accepted shadcn composition · persistent outcome | **partial → closed by AC2's URL work + two browser cells + two named no-referent clauses** | *Invalid/saving* and *cancelled/recovery* have **NO REFERENT** on a link-only surface (D18.d) — **report them as such; do not invent a form.** *Exact money values* closes as the proven negative (`p659.portfolio.no_money`). *Exact date values*: the pack publishes `from_date`/`to_date` so a drilldown cannot mean a different week. *Persistent outcome, never a transient toast* is **already true by house law** — re-measure the grep, do not rebuild. *Preserved drafts* is **BUILT here, not inherited** (the extracted control is Firm Home's only unsent input): `p659.home.draft_survives_refresh`. *SR names*: axe is a violation scan, **not** an accessible-name assertion — add an explicit accessible-name cell for the portfolio's count links. *Reduced motion*: re-measure `app/globals.css:44-50`, `:515-527`; do not re-argue. |
| **AC8** production-facing read under real least-privileged roles and current migrations; complete related records and receipts; DB/Storage-only operations at their real boundaries; local/hosted labelled | **to build** | The whole `firm-portfolio-pack.test.mjs` + `compliance-watch-disposition.test.mjs` batteries through `humanQuery` personas, **never `rootQuery`** for the assertion under test. **"This journey invokes no Workflow"** is the honest answer to the durable-execution half. Every report line labelled local; "hosted evidence pending". |
| **UI-04** 有没有真的在用 shadcn — historical PARTIAL; refresh **REDESIGN** | **to build (re-measured)** | The board mounts **no** `components/ui/*` primitive today (`firm-home-board.tsx:40-57`). The redesign lands `Table` (inside `DataTableCard` **with a `label`** — the `client-register-list.tsx:414` precedent), `Pagination`, `Empty`, `Skeleton`, `Badge`. Appendix D's "Empty/Pagination/Skeleton uninstalled" column is **stale on this checkout** — `p659.measure.ui_inventory` re-measures before anything is added. |
| **UI-05** 照着这几套工具在设计 — historical PARTIAL; refresh **REDESIGN** | **verify-only + carry forward** | Keep `firm-home-board.tsx:6-38`'s exemplar reasoning (Rox/Plain/Midday arrangement, Xero/QuickBooks "numbers only where the ledger owns them" + a designed caught-up state, Attio/Lightfield for the agent's mouth staying in the rail) and the **`@container` / `@3xl:`** decision measured from the 832px/1152px content column — **do not revert to a `lg:` viewport breakpoint.** Re-state the arrangement the rewrite lands on. |
| **UI-12** 设计 token 与设计系统 — historical FIXED (honored); refresh **REDESIGN** | **verify-only, re-measured** | Semantic tokens throughout; `enter-content` for entry motion; the deliberate refusal to adopt a local focus ring over the global `--focus` outline; and the WCAG 1.4.1 measurement (1.33:1 `--primary` vs `--muted-foreground`) forcing a permanent underline on an in-prose link (`firm-timeline-section.tsx:87-92`). **Re-measure each on the redesigned surfaces; the AA contrast finding is the one most likely to red again.** `tests/token-contrast.test.ts`, `tests/focus-ring-contract.test.ts`, `tests/reduced-motion-contract.test.ts` are its census. |
| **UI-35** 首页照 Mobbin 做成一个能通往各页的仪表板 — historical FIXED; refresh **REDESIGN** | **partial → to build the portfolio layer** | The dispatcher exists and "EVERY TILE LINKS; NO TILE ACTS" (`firm-home-board.tsx:15-19`). What it is not is a **portfolio** — B1's first noun. The file's "WHAT IS DELIBERATELY ABSENT" list (`:28-38`) is **the drafting constraint**: whatever the portfolio row shows comes from a DB-owned firm-wide aggregate, never an N×2 browser fan-out. **Re-derive the `NotBuiltNote` (`:231`); do not copy it.** |
| **F-06** CSS size / token and stylesheet maintainability — EXPLICIT FOLLOW-UP (aggregate source row) | **verify-only** | The row's own instruction: "do not create a cosmetic split merely from the old label." Mint **no** new token. If the portfolio table needs a density, take it from `components/ui/table.tsx`; the one translucency in this neighbourhood deliberately extends `components/ui/sheet.tsx`'s existing `supports-backdrop-filter:backdrop-blur-xs` and mints no `glass` token (`client-work-attention.tsx:34-38`). |
| **C88.10** `ComplianceWatchCard` acknowledgement echo — compliance UI · preserve; trace the receipt to the card and reload state with actor/time/version | **to build (D18.b) — it is a MISSING DOOR, not missing wiring** | Write side is complete (`0016:1081-1095`); read side does not exist for a browser (`0016:396-414` + `:4699-4714`). **There is no `ComplianceWatchCard` in this tree** — the identifier appears only in archived spec copies; the component the acts actually live on is `ComplianceWatchAffordance`. Deliver the door + `p659.watch.receipt` / `p659.watch.reload` + the receipt on that one shared component. **Version:** named as a concept this table does not carry. |

---

## 3. Slice (one branch: `impl/659-firm-home`)

### Migration `0231_firm_portfolio_pack.sql` — additive; FORCE RLS untouched; no app-role DML; `Asia/Kuala_Lumpur` days

**Header** → **Prestate** → **objects** → **grants** → **tail**, in that order, on 0214's shape.

**Prestate.** (a) The five `sha256(prosrc)` non-regression pins, **measured on `clara_659` after `pnpm db:migrate`,
never transcribed** (`0214:571-580` is the idiom). (b) A single-`pg_proc`-row census wall for the two names this
file installs, raising CLR10 if either already exists (`0103:1055-1070`'s shape, restated because that census
does not reach these names).

**1 · `clara.get_firm_portfolio_pack(p_limit int default 50, p_cursor text default null, p_preview int default 3)
returns jsonb`** — `language plpgsql stable security invoker`, `set search_path = clara, pg_temp`,
`set plan_cache_mode = force_custom_plan`. **Argument order is fixed by DECISIONS §2 row 0231 and is `(int, text,
int)`.**

- **Floor**: 0214's three inline predicates restated **verbatim** (`0214:262-274`) — an INVOKER body cannot call
  `clara._human_ctx`. CLR04 `'no authenticated actor'` / `'actor has no active membership'` / `'insufficient
  role'`, bookkeeper rank.
- **Firm from `clara.jwt_firm()`, never a parameter — and there is NO client parameter either.** The signature
  is `(p_limit int, p_cursor text, p_preview int)` and nothing else, so **do not go looking for a client id to
  forge** the way `get_client_work_pack`'s `p_client` invites (`0214:234-236`). 0214's "an id that names
  nothing and an id that names somebody else's client must be INDISTINGUISHABLE" paragraph (`0214:91-96`) is
  written about that parameter; at this altitude it applies to the **one** channel through which a client
  identity can still enter this door — the `lower(name)|uuid` pair packed inside `p_cursor`.
- **That cursor is a keyset POSITION, never a lookup.** The body compares the decoded pair against
  `(lower(c.name), c.id)` under a `c.firm_id = clara.jwt_firm()` predicate that is always present, and **never
  resolves the cursor's uuid or name against `clara.clients`** — not to "validate" it, not to reject a cursor
  whose client was since archived. A `p_cursor` encoding another firm's REAL client pair and one encoding an
  invented pair must therefore answer identically: a well-formed page of the caller's own firm positioned after
  that sort key, no refusal, no existence signal. **This is exactly where #659 diverges from
  `list_review_queue`**, which takes an explicit `p_scope.client_id` and raises CLR10 `queue scope is malformed`
  off a `not exists(… and firm_id=c.firm)` probe (`0016:4569-4575`) — a cross-firm existence oracle this door
  must not rebuild inside a paging argument, where no reviewer looks for one. Assert the difference in a cell
  (`p659.portfolio.cross_firm`).
- **Clamps, not refusals**: `v_limit := least(greatest(coalesce(p_limit,50),1),100)`;
  `v_preview := least(greatest(coalesce(p_preview,3),0),5)`.
- **One row per client the caller's RLS admits**, carrying `client_id`, `name`, `status`, and **counts of
  DISTINCT `accounting_work.id`**:
  - `active` — `w.status in ('queued','running')`, **verbatim**; `stopping` is excluded, ratifying #650's R3
    ruling in code (`lib/work/client-work-pack.ts:71`).
  - `attention_failed` — **orchestrator ruling, closing gap-659 Unverified #9**: the count is over
    `w.status in ('failed','refused')` and the row **also publishes the split** as `failed` and `refused`
    integers, so the surface never guesses and the drilldown link carries `?status=failed,refused` — the click
    and the count are the same population. Both tokens are members of the live nine (`WORK_STATUS_FACETS`,
    `lib/work/work-list.ts:220-223`; re-measured by `p659.measure.work_status_facets`).
  - `recent_success` — a **committed** `clara.operation_receipts` row inside the **same seven MYT calendar
    dates** 0214 resolves (`0214:288-293`), with `from_date`/`to_date` published at envelope level so a
    drilldown cannot mean a different week.
- **The page's order is a NAMED, UNIQUE key and the cursor encodes exactly it**: `order by lower(c.name), c.id`,
  `p_cursor` a base64 `lower(name)|uuid` pair, decoded with a shape check, refusing **CLR10
  `detail.reason='invalid_cursor'`** for a malformed value **and for an empty/whitespace-only name component
  with the same token** — 0203's non-finite fence, transposed: an empty leading component compares below every
  real row and would answer a clean, well-formed FIRST page indistinguishable from a fresh call, which is the
  bug that fence exists to stop (`0203:301-321` is the shape, `:310-317` the fence in the door's own words,
  `:319-320` the token). **The refusal is a SHAPE refusal only** — decode, split, cast — **never an existence
  check** (bullet above).
- **Split the cursor at the LAST `|`, not the first.** `0203:304` may use `position('|' in v_decoded)` because a
  `timestamptz` can never contain one; `clara.clients.name` carries **no character CHECK** at birth or since
  (measured this pass —
  `grep -rn "clara.clients" packages/db/migrations/*.sql | grep -iE "alter table|add constraint|check"` returns
  only the id+firm unique key `0007:59`, the status CHECK swap `0017:37` + `0017:658-659`, and the fiscal-year
  CHECK `0041:774-779`), so `Acme | KL Sdn Bhd` is a legal client name and a first-pipe split hands the uuid
  cast a fragment. Take the trailing 36 characters as the uuid and everything before the final `|` as the name,
  and prove the round trip on a piped name (`p659.portfolio.paging`).
- `uq_clients_firm_name (firm_id, lower(name))` (`0003:41`) is already UNIQUE inside one firm and already orders
  the scan, so this key costs **no new object and no sort**; `clients.name` is NOT NULL (`0003:37`). **Ordering
  by a non-unique expression is the bug that never reds** — `0189:225-231` is the estate's own statement of why
  the tie-break column belongs in the key.
- **Preview rows and the 101 ceiling.** The per-row preview ids are assembled across the WHOLE page and **cut at
  101 before they reach `clara._work_run_attempts`** (`0189:262-274`); every row whose labels were cut carries
  `coverage='partial'` with **`coverage_reason='retry_label_preview_only'`** — 0214's own token, reused verbatim,
  never a second vocabulary. **Reason to state in the file**: 100 clients × 5 preview ids would make the helper
  refuse the WHOLE pack and darken every row to report a label (`0214:62-76`'s argument, one altitude up).
  `p_preview = 0` calls the helper **not at all** and is the cheap page.
- **Coverage, exactly these tokens.** Row-level `coverage_reason` ∈ `{ onboarding_client_excluded_from_queue,
  completions_without_receipt, retry_label_preview_only, null }`; the row also carries the integer
  `uncounted_completions` (0214's pairing). Envelope-level `coverage_reason` ∈ `{ register_page_truncated, null }`
  when `truncated` is true.
- **Envelope**: `computed_at` (the read instant — **not a watermark**; state 0214's reason: the Work lane calls
  `clara._append_event` zero times), `window {from,to,from_date,to_date,timezone,days}`, `rows`, `next_cursor`,
  `truncated`, `coverage`, `coverage_reason`,
  `sources` = `{work:{computed_at}, review_queue:{signal:'watermark', excludes:['onboarding','archived']},
  compliance:{signal:'stale_evaluator', window_hours:48}, lint:{signal:'stale_evaluator'},
  sweep:{signal:'last_finalized_at'}}` — **the pack DECLARES the contract and does not re-read the queue**; the
  browser reads the last four off the envelope it already fetches.
  `needs_you_ref` = `{source:'list_review_queue.counts', floor:'viewer', excludes:['onboarding','archived']}` —
  the needs-you number stays where it already ships at **viewer** floor and is **never folded into a
  bookkeeper-floored pack** (`0214:20-36`; the asymmetry is the design).
- **NO money key of any kind** and **no period / fiscal-year / as-of parameter.** Both are tail-asserted (below).
- `revoke all … from public`; **one** `grant execute … to clara_authenticated`. **Zero** to `clara_runtime`, the
  agent role and both wake roles — a portfolio board is a human read (`rig-meta.mjs:2155-2167` states the rule
  for 0214).

**2 · `clara.get_compliance_watch_disposition(p_watch uuid) returns jsonb`** — `language plpgsql stable security
definer`, `set search_path = clara, pg_temp`. SECURITY **DEFINER** because both relations are owner-policy-only
and an INVOKER body can see nothing (`0016:396-414`).

- `c := clara._human_ctx(clara.role_rank('bookkeeper'));` as the first statement after `declare` — the three
  write doors' own floor (`0016:1058`).
- `p_watch is null` ⇒ **CLR10 `detail.reason='invalid_watch'`** (0214:277-281's shape, a caller defect).
  A well-formed id that names nothing **or** names another firm's watch ⇒ **CLR11 `'watch not found'`** — the
  doors' own token and message (`0016:1068-1070`), so the two are indistinguishable.
- Returns `{watch_id, client_id, service_group, watch_kind, state, acknowledged_by, acknowledged_at,
  snoozed_until, resolved_conclusion, resolved_by, resolved_at, resolved_evidence, updated_at, events:[…]}`
  with the append-only trail ordered `created_at asc, id asc`, each event carrying `event_kind`, `state_before`,
  `state_after`, `figures`, `actor`, `rationale`, `created_at`.
- **NO `version` key** — assert it off `prosrc` in the tail.
- `revoke all … from public`; one `grant execute … to clara_authenticated`. **It grants nothing on either
  table** — the definer body being the only reader is the whole reason it exists.

**3 · The ONE conditional index.** DECISIONS §2 row 0231 permits **one** partial index on
`clara.accounting_work` **only if** the first-red `explain (analyze, buffers)` on the seeded rig shows a
sequential scan the three existing indexes do not cover (`ix_accounting_work_firm_created` `0189:238-239`,
`ix_accounting_work_client` `0178:367`, `uq_clients_firm_name` `0003:41`). Build it `create index if not exists`
with 0189's discipline — the **measured plan pasted into the index comment**, and "already there is a lawful
state for an index rather than drift" stated (`0189:232-239`). **Name it in the report.** If the plan is clean,
add nothing and say so with the plan attached.

**4 · Tail postcheck** (copy `0214:483-598` assertion for assertion):
1. Both names exist; **exactly one `pg_proc` row each**.
2. `pg_get_function_arguments` for the pack equals `p_limit integer DEFAULT 50, p_cursor text DEFAULT NULL::text,
   p_preview integer DEFAULT 3` — **the signature is the enforcement of "a financial period never narrows Work
   attention"**, and of "the firm is not a parameter".
3. Owner `clara_fn_owner`; pack `prosecdef = false`, disposition `prosecdef = true`; both `provolatile='s'`;
   `search_path=clara,pg_temp` pinned on both and `plan_cache_mode=force_custom_plan` on the pack
   (whitespace-insensitive comparison — PostgreSQL normalises a stored GUC list).
4. PUBLIC revoked on both; the ACL asserted **literally**: `clara_fn_owner=X/clara_fn_owner |
   clara_authenticated=X/clara_fn_owner`.
5. **`prosrc` negatives on the pack** — `amount_cents`, `_cents`, `debit`, `credit`, `total` each absent.
   **Caution: an in-body comment is part of `prosrc`**, so the migration must not use any of those words inside
   the function body, only in the file header and the tail's NOTICE.
6. **`prosrc` positives on the pack** — `order by lower(c.name), c.id` (the `0203:601` literal-order probe
   shape), `invalid_cursor`, `jwt_firm()`, `Asia/Kuala_Lumpur`, `'committed'`, and the exact clamp expressions.
7. **`prosrc` negative on the disposition door** — the literal `'version'` is absent.
8. **No table privilege moved**: `clara.agent_tasks` still ungranted to `clara_authenticated`;
   `clara.accounting_work` / `clara.operation_receipts` / `clara.clients` still carry SELECT and nothing else;
   and **`clara.compliance_watches` and `clara.compliance_watch_events` still carry ZERO privilege for every
   application role** (enumerate the five roles; this is the decisive negative for door 2).
9. **Nothing was recut**: the five `sha256(prosrc)` pins re-asserted byte-identical, plus
   `clara.list_review_queue` still SECURITY DEFINER and `clara.list_accounting_work` / `clara.list_activity`
   still SECURITY INVOKER.
10. A closing `raise notice` in 0214's voice, naming every property proved.

### Runtime

**No change. No new module, no route edit, no registry edit, no successor contract.** State in the migration
header and in the report that the compliance doors refuse an agent identity (`0016:1053-1055`), so no chat or
Work-lane tool is being deferred. Do not leave an empty "Runtime" section in the report that reads as an
omission — write the sentence.

### Web

1. **`/` gains URL state — this is what makes AC2's second half true.** New
   `apps/web/lib/firm/portfolio-url-state.ts` in `lib/work/work-list-url-state.ts`'s idiom: axes enumerated
   **once** in `PORTFOLIO_FILTER_AXES`, every malformed value degrading to its empty default and issuing no
   request, the page **cursor in the URL** (the Work list's argument at `:12-19` applies identically — this is a
   paged list, not an appending feed), a filter change dropping the cursor. **Minimum axes**: `status` (client
   status), `attention` (`needs_you` | `active` | `failed` | `caught_up`), `q` (client name), `cursor`.
   `app/(firm)/page.tsx` reads `searchParams` **only for what is genuinely markup**, exactly as
   `app/(firm)/work/page.tsx:32-41` does.
2. **The portfolio section** — new `apps/web/components/firm/firm-home/firm-portfolio-section.tsx`. One row per
   client: name (link to `/clients/<id>`), status `Badge`, the distinct counts as **links into
   `/work?client=<id>&status=…`** (that address already exists and is URL-stable; statuses are comma-joined,
   `work-list-url-state.ts:97`, `:193`), a coverage word where the row is not whole, and a freshness line.
   Compose with `components/ui/table.tsx` inside `DataTableCard` **with a `label`**, `components/ui/pagination.tsx`,
   `components/ui/empty.tsx`, `components/ui/skeleton.tsx`. **No inline act** (D18.d). **Put new components under
   `components/firm/`, never colocated under `app/**`** — a new module under `app/**` needs a roster entry in
   `tests/firm-scope-surfaces.test.ts`; the `(firm)/documents` precedent is the shape to copy.
3. **The refresh contract, in a NEW composing hook** — `apps/web/lib/firm/use-firm-portfolio.ts`. It owns the
   pack read **and** the listeners, and calls the existing `useReviewQueue`'s `reload` alongside its own; it does
   **not** edit `use-review-queue.ts` (ruling above). Re-read on `focus` + `visibilitychange`, on scope change,
   and on `CLIENT_RECORD_CHANGED` (`lib/command/bus.ts:132`, the subscription shape at
   `client-register-list.tsx:381`); add the while-visible 30 s compensation and the 60 s delayed face by
   **importing `WORK_STALE_AFTER_MS` from `lib/work/use-work-detail.ts:42`** — never a second literal
   (`use-client-work-pack.ts:35-38`, and a cell reads the source to keep it that way,
   `use-client-work-pack.test.ts:360`). **A denial clears the numbers; a transport failure keeps them, dated**
   (`use-client-work-pack.ts:44-47`).
4. **Freshness on the face.** Render the queue's `watermark`, both `stale_evaluator` flags and the pack's
   `computed_at` as a "read at …" line. `ReviewQueueEnvelope.compliance` and `.lint` are typed `unknown` today
   (`lib/firm/needs-you.ts:251`, `:253`) — add a **narrow typed reading of just the two `stale_evaluator`
   booleans** in your own module; do not widen those loose types into a contract this build does not own.
5. **Zero-client creation (AC4 / D18.c).** Extract `AddClientControl` from
   `components/firm/client-register-list.tsx:134-370` into
   **`apps/web/components/firm/add-client-control.tsx`** and mount it on both pages. **Move the #649 header
   comments with the code** — they are #649's AC1 evidence (`client-register-list.tsx:107-133`), and
   `add-client-control.test.tsx` / `add-client-candidates.test.tsx` both import from the old location and must be
   repointed in the same commit. **Mount it BESIDE the state machine, never inside it**: hanging it off the
   zero-client `Empty` branch would let the first re-read that returns a row remount it and silently discard a
   typed name and an arity-1 acknowledgement mid-edit — which appendix C §3's *Draft across local view changes*
   row forbids without a warning (`appendix-C-journeys.md:85`) and which `client-register-list.tsx:127-131`
   records as #649's own acceptance. **The affordance's copy changes with the empty state; its mount point does
   not.**
6. **Two link repoints in `apps/web/lib/firm/needs-you-links.ts`**, one line each plus their cells:
   `work_question` → `workDetailHref(row.client_id, row.task_id)` — the row carries the parked run in `task_id`
   (`0180:1068`; the field is on the typed row at `lib/firm/needs-you.ts:181`) and the route exists
   (`tree.ts:530`). It is a **deep destination like `fixed_asset_incomplete`'s**, so it lands in
   `needsYouRowHref`'s body (`:85-87`'s shape, with the same guard: a missing or malformed `task_id` falls back
   to the workspace root), **not** in `OWNING_TAB`; widen the parameter type to include `task_id`.
   `compliance_watch` → `/tax` in `OWNING_TAB`, because the affordance is mounted there now
   (`components/tax/SstWatchSection.tsx:114`). **Delete the stale comment at `:55-56`** rather than softening it.
   **Both repoints change the row's LABEL** through `hasOwningTab` (`oldest-waiting-list.tsx:88-92`), so
   `messages/en.json` needs **`NeedsYou.openTab.compliance_watch`** and — if you route `work_question` through a
   label at all — **`NeedsYou.openTab.work_question`**; measured this pass, neither key exists and the
   message-key lint will red without them.
7. **Recent activity swaps to `clara.list_activity` (D18.f).** Reuse the existing **one shared actor cell**
   `components/firm/activity/activity-actor-line.tsx` with `useMemberNames` (`lib/members/use-member-names.ts:69`)
   rather than a second actor rendering — it already handles member / "Clara on behalf of ⟨name⟩" /
   "Clara (system)" and carries #728's and #742's findings. Name **#861** as a residual **on the surface** and in
   the report; **do not patch the kind map in the browser.** `clara.list_activity` exists in every database at
   this frontier (`0181:218` → `0202:204`), so the old **not-deployed** arm (`lib/firm/timeline.ts:108-112`,
   proven by `firm-home-board.test.tsx:181`) has no honest referent for the new verb: **replace that cell in the
   same commit** with one proving a 404 now renders as a typed read failure, keeping `:195`'s 403 half. The mock
   consequence is a measurement, not a guess — see `p659.measure.mock_dispatch`.
8. **The disposition receipt (C88.10).** New `apps/web/lib/firm/compliance-disposition.ts` (typed read) and the
   receipt rendered inside **`components/firm/compliance-watch-affordance.tsx`** — the ONE component both
   altitudes already mount (`needs-you-affordances.tsx:107`, `needs-you-inbox.tsx:129`, `SstWatchSection.tsx:114`),
   so one edit reaches both and no second write surface is born. Re-read after each act through the affordance's
   existing `act()` **and after reload** (that is the half C88.10 names). **Do not edit
   `components/firm-admin/compliance-register-panel.tsx`** — `/settings/compliance` is #635's real estate
   (DECISIONS §3); file the one-paragraph follow-up asking #635 to mount the same read. **Firm Home links to
   these surfaces and renders no disposition of its own.**
9. **Seven states, seven sentences, seven `messages/en.json` keys.** `client-work-attention.tsx:23-29` names
   **five** (loading / empty / partial / unknown / denied), so "extended by two" is 5 + 2 = **seven**: *loading*
   (skeleton, never a zero) · *zero clients* (first-use Empty **with the creation affordance**) · *successful
   zero workload* (a caught-up sentence distinct from "nothing is waiting") · *partial* (the row or the page
   names what part of the answer it is not making) · *stale* (read-at + the delayed face) · *denied* (a
   permission, not a failure) · *initial error* (typed, retryable). **Do not widen `DataState`** — the portfolio
   section owns its own branching, as `components/tax/SstWatchSection.tsx` already does for the same reason.
10. **Every touched surface**: 320px, 200% zoom, keyboard + focus return, explicit screen-reader **names** (not
    just an axe pass), `prefers-reduced-motion`, stable URL/Back, preserved drafts. New `FirmHome.*` keys at the
    sorted position in `messages/en.json`.

### Docs

- **`CONTEXT.md`**, house "term / _Avoid_" shape, at the sorted position — **Firm portfolio pack** (_Avoid_: a
  consolidated ledger; a cross-client money total; a sum of facets; calling its read instant a watermark) ·
  **Portfolio coverage** (_Avoid_: a percentage; a smaller number presented as a complete one) · **Attention
  source freshness** (_Avoid_: one page-level "last updated" standing for reads of different ages) · **Watch
  disposition** (_Avoid_: treating an acknowledgement as a resolution; a dismissal).
- **READMEs**: `packages/db/README.md` (both doors, floors, grants, the INVOKER-restates-its-floor idiom, the
  no-money tail assertion, the 101-id cut), `packages/db/tests/README.md` (the two batteries + the cohort),
  `apps/web/README.md` (Firm Home's URL state and its refresh contract).
- **Never `docs/PRD.md`, never `docs/ARCHITECTURE.md`.** Record **blueprint drift** in the report with exact
  lines (DECISIONS §4, for #683's sync): `docs/PRD.md:31` + §4 「工作追踪」 (no per-client Work aggregate exists
  at firm altitude at `abcc5030`, and the PRD does not list it under 已接受、留待以后, `PRD.md:118-128`, so the
  blueprint currently reads as delivered); `docs/ARCHITECTURE.md:134-135` (「可查询获准客户并组织批量工作」 —
  querying is true, **organising batch work at firm altitude does not exist**); `docs/ARCHITECTURE.md` §7's SST
  row (**not drift** — cited because it is the sentence that makes AC6's "distinguish from inactive beta Tax"
  checkable).

---

## 4. TDD seams (red first)

### 4.0 Measure first — the FIRST work you do on the rig, before a line of the migration is written

Every one of these closes an item gap-659 marked **unverified**. Nothing was executed when that map was written;
these are the executions. Record each with the exact command and its output in the report.

- **`p659.measure.pins`** — `sha256(prosrc)` for the five read-only dependencies, off `pg_proc` on `clara_659`
  after `pnpm db:migrate`. **Closes Unverified #2 and #6.** These five values are the prestate; a transcribed one
  will not match.
- **`p659.measure.compliance_acl`** — live `pg_class.relacl` + `pg_policy` + `information_schema.role_table_grants`
  for `clara.compliance_watches` and `clara.compliance_watch_events` across all five application roles. **Closes
  Unverified #4 and #5**, whose negative today rests on one migration plus a grep. **If any application role
  holds a privilege, door 2's SECURITY DEFINER rationale changes and you re-argue it in the report before
  writing it.**
- **`p659.measure.queue_shape`** — read the **installed** `clara.list_review_queue` body via
  `pg_get_functiondef` and confirm the seven `*_client.status='active'` markers and the nine `counts` keys are
  present in it. This is what makes `onboarding_client_excluded_from_queue` a **measured** fact rather than a
  transcription of `0017:642-651`. **Closes Unverified #2's queue half.**
- **`p659.measure.plan`** — **gap-659 Q7, promoted by the design lens from a footnote to a ruling.** Seed a
  **300-client / 20 000-Work** firm on your rig and run `explain (analyze, buffers)` on the pack. Assert **(a)**
  exactly **one** aggregate pass over `clara.accounting_work` (one `group by client_id` joined to the client
  page — **no per-row correlated subquery**) and **(b)** the client page is an ordered scan of
  `uq_clients_firm_name` with **no `Sort` node above the keyset**. Only then fix `p_limit`'s ceiling and decide
  the ONE conditional index. **Closes Unverified #10.**
- **`p659.measure.work_status_facets`** — read the live `accounting_work.status` CHECK and compare it to
  `WORK_STATUS_FACETS` (`lib/work/work-list.ts:220-223`), so the `failed | refused` split is measured, not
  transcribed. **Closes Unverified #9's mechanical half** (the product half is ruled above).
- **`p659.measure.ui_inventory`** — `ls apps/web/components/ui` on the rig, and for anything the redesign needs
  that is absent, `pnpm --filter @clara/web ui:add <name> --dry-run` **first**, one component at a time, never
  `CLARA_UI_ADD_OVERWRITE=1`. **Appendix D's installed-state column is stale on this checkout** (it reports
  Empty/Pagination/Skeleton uninstalled; all three are present). **Closes Unverified #7.** The expected answer is
  that this ticket adds **no** primitive; if that holds, say so with the listing.
- **`p659.measure.no_toast`** — re-run the Sonner/toast grep over `apps/web/package.json`, `components`, `lib`
  **and follow the five children's own imports**, which the map's grep did not. **Closes Unverified #13** and is
  what lets AC7's "persistent outcome, never a transient toast" close as a re-measured negative.
- **`p659.measure.mock_dispatch`** — read `apps/web/e2e/serve-built.mjs`'s dispatch order and determine **who
  answers `list_activity`** for a walk that merely lands on `/` (measured this pass: `e2e/activity-mock.mjs:275`
  answers it **unconditionally** and `e2e-fixture-ownership.test.ts:217` declares it #632's own verb). Then take
  the conservative branch: **if #632's lane answers it**, add **no** handler to `home-board-mock.mjs`, declare
  nothing, overlay your own fixtures with `page.route` in your own cells, and state in the report that other
  lanes' `/` landings now render #632's activity rows instead of the not-deployed note — a coverage change,
  named. **If nobody answers it**, add ONE honest-empty handler (`{rows:[],next_cursor:null,truncated:false}`) to
  `home-board-mock.mjs` and declare `list_activity` in `SHARED_RPC_VERBS` as shared with `activity-mock.mjs`,
  with the scoping reason written. **Closes gap-659 Risk 8.**
- **Hosted, not measurable here**: the hosted frontier (Unverified #3) and whether any real firm has enough
  clients for paging to matter (Unverified #11) are **release-time reads**. Write "hosted evidence pending"; do
  not assume.

### 4.1 DB battery `packages/db/tests/firm-portfolio-pack.test.mjs`

Frontier-gated on `firm_portfolio_pack$` (copy `client-work-pack.test.mjs:38-62`), every assertion through
`humanQuery` least-privileged personas, **never `rootQuery`** except labelled fixture DML.

1. `p659.portfolio.distinct` — one Work with two runs counts **once**; five active Works count 5. *Red: the
   function does not exist.*
2. `p659.portfolio.no_sum` — a Work that is both active and inside the success window appears in both columns,
   so the columns **exceed** that client's Work population (0214's `no_sum` cell, per client).
3. `p659.portfolio.attention_failed` — `failed` and `refused` are both counted, the split integers add to the
   column, and `cancelled` / `expired` / `stopping` are in **none** of the three columns.
4. `p659.portfolio.window` — 00:30 and 23:59 on day-6 are IN, 23:59 on day-7 is OUT; `from_date`/`to_date`
   round-trip into a `/work` drilldown naming the same week.
5. `p659.portfolio.onboarding_disclosed` — a client in `onboarding` with a live open question contributes
   **zero** to `list_review_queue.counts` while its Work counts are non-zero, and the row says so through
   `coverage_reason`. **This is the cell that pins the 0017 wall as a disclosed fact rather than a silent one.**
6. `p659.portfolio.partial_receipt` — a `completed` Work with no committed receipt is uncounted, drives
   `coverage='partial'` with `completions_without_receipt`, and is reported in `uncounted_completions`.
7. `p659.portfolio.preview_ceiling` — a page whose preview ids would exceed **101** still answers: the helper is
   handed at most 101, the rows beyond it carry `retry_label_preview_only`, and **the pack does not refuse**.
   `p_preview = 0` calls the helper zero times.
8. `p659.portfolio.floor_viewer` — a viewer is refused **CLR04 before any read**, and **still receives the
   shipped viewer-floored review-queue counts** from the other door (0214's `floor_viewer`, `:461`).
9. `p659.portfolio.cross_firm` — **the door takes no client argument, so the only forgeable client identity is
   the CURSOR payload.** Seed firm A with clients `alpha` and `zeta` (and no `mid`), firm B with a client named
   `mid`. Firm A's bookkeeper then reads with (a) `p_cursor = encode('mid|<firm B's REAL client uuid>')` and
   (b) `p_cursor = encode('mid|<a uuid that names nothing>')`: **both answers are the same envelope** — the same
   firm-A rows (`zeta`), the same `next_cursor`, the same `truncated`, **no refusal either way** — because the
   body compares the decoded pair as a sort key and never looks it up, so a real referent and an absent one are
   indistinguishable. Assert also that a cursorless call returns firm A's clients and **no firm-B row, id or
   count**. Contrast-assert in the same cell that `list_review_queue` **does** raise CLR10 for a `client_id`
   outside the firm (`0016:4569-4575`), so the divergence is recorded as a choice rather than assumed.
10. `p659.portfolio.no_money` — from `prosrc`: the body names no amount/cents/debit/credit/total key, and the
    returned envelope carries none. **The decisive negative for AC1's second half** (SYNTHESIS §4).
11. `p659.portfolio.catalog` — SECURITY INVOKER, `search_path` and `plan_cache_mode` pinned, STABLE, EXECUTE to
    `clara_authenticated` **only**, ACL asserted literally, **no table privilege moved**, **no period axis in the
    signature**.
12. `p659.portfolio.machine_lanes` — `clara_runtime`, the agent role and **both** wake roles cannot execute
    either new function.
13. `p659.portfolio.paging` — a full page's `next_cursor` round-trips; **a client whose name contains `|`
    (`Acme | KL Sdn Bhd`) round-trips too**, proving the last-`|` split (§3 Migration 1); a malformed cursor
    refuses CLR10 `invalid_cursor` **and an empty/whitespace-only name component refuses with the same token**;
    `truncated` is honest.
14. `p659.portfolio.cursor_stability` — **the ordered-key cell.** Take a full first page; then **add** a client,
    **rename** one across the page boundary and **archive** one; the second page repeats no row the first page
    carried and drops no row the caller is entitled to see. The body's own `order by lower(c.name), c.id` is
    asserted out of `prosrc` the way `0203:601` probes its keyset clause, so a later refactor cannot quietly
    return to an unordered page.
15. `p659.portfolio.no_recut` — the five prestate pins are still byte-identical after 0231 applies.

### 4.2 DB battery `packages/db/tests/compliance-watch-disposition.test.mjs`

1. `p659.watch.receipt` — `ack_compliance_watch` then the new read returns the **same actor and instant**; a
   replay under the same `op_key` returns the cached result and appends **no second event**
   (`_reserve_op`/`_finish_op`, `0004:46`, `:62`).
2. `p659.watch.reload` — the disposition survives a fresh session (it is table state, not a response).
3. `p659.watch.refusal_keeps_nothing` — a resolved watch refuses a second acknowledgement **CLR10**
   (`0016:1071-1073`) and writes **no** event row.
4. `p659.watch.agent_refused` — an agent identity is refused **CLR03 before any write** (`0016:1053-1055`).
5. `p659.watch.floor` — a viewer is refused **CLR04**; a foreign watch and an invented uuid are both **CLR11
   `watch not found`**; and **the two relations remain ungranted to every application role after the
   migration** (re-assert `0016:396-414`'s posture from `pg_class` / `pg_policy` / `role_table_grants`).
6. `p659.watch.no_version` — the returned object carries no `version` key, and `prosrc` names none.

### 4.3 Runtime

**None.** Say so in the report in one sentence rather than leaving an empty section that reads as an omission.
No World leg, no `WORKFLOW_POSTGRES_URL`, no `action.yml` row.

### 4.4 Web unit — each file added to `apps/web/test/manifest.txt` at its sorted position

- `components/firm/firm-home/firm-portfolio.test.tsx` — counts come from the pack's own fields and **never
  `rows.length`**; a row's count link carries `client=` and `status=`; a `partial` row prints its reason; a row
  with an unreadable count prints "could not be read", **never 0**; the board renders **no amount anywhere**.
- `lib/firm/portfolio-url-state.test.ts` — every axis round-trips; a malformed status or client degrades to the
  default **and issues no request**; a filter change drops the cursor.
- `components/firm/firm-home/firm-home-states.test.tsx` — the **seven** states are seven different strings; zero
  clients renders the creation affordance for an admin and **neither a control nor a greyed promise** for a
  bookkeeper.
- `lib/firm/use-firm-portfolio.test.ts` — `focus` / `visibilitychange` / scope change / `CLIENT_RECORD_CHANGED`
  each trigger exactly one re-read; at `WORK_STALE_AFTER_MS` the delayed face appears **and the dated numbers
  stay**; a denial clears them; a transport failure keeps them dated. **Plus the source-reading cell** pinning
  `WORK_STALE_AFTER_MS` as an **import**, not a literal (`use-client-work-pack.test.ts:360` is the shape).
- `lib/firm/needs-you-links.test.ts` — **extended**: `work_question` resolves to the Work detail and falls back
  to the workspace root on a missing `task_id`; `compliance_watch` resolves to `/tax`; the emitted suffix set
  still lies inside `CLIENT_ROUTES`; **both new labels resolve to real message keys.**
- `components/firm/add-client-control.test.tsx` + `add-client-candidates.test.tsx` — **repointed** to the new
  module, unchanged in what they assert (they are #649's AC1 evidence); plus one new cell: a re-read that returns
  a row **does not remount the control** and leaves the typed name and the arity-1 tick standing.
- `components/firm/compliance-watch-receipt.test.tsx` — the receipt renders actor and time on **both** mounts;
  a refusal leaves the typed rationale and evidence standing (extend `compliance-watch-affordance.test.tsx`
  rather than duplicating it).
- **Replaced**: `firm-home-board.test.tsx:181`'s not-deployed cell, by one proving a 404 on `list_activity`
  renders as a typed read failure — with the reason in the test's own name.

### 4.5 Playwright — **extend** `apps/web/e2e/home-board-walk.spec.ts`; do **not** create a second firm-home spec

Overlay every fixture with `page.route` in the file's own idiom (`:10-13`, `:192-210`). Set your triple.

- `p659.home.portfolio` — a mixed fixture (active + onboarding + archived clients, one with a parked question,
  one with a failed Work, one caught-up) renders one row per client with the right counts, and the **onboarding
  disclosure sentence is on screen before any click**.
- `p659.home.drilldown` — each count opens `/work?client=…&status=…` narrowed to exactly that population,
  `goBack()` lands on the home's **own URL with its filter intact**, and focus returns to the control that left
  it (`:376-444` verbatim in shape).
- `p659.home.responsive` — 320px, 200% zoom and reduced motion keep every count reachable with **no horizontal
  page scroll**; the populated board is axe-clean; and the portfolio's count links carry explicit accessible
  names (`:445`'s shape, plus the name assertion axe cannot make).
- `p659.home.states` — zero clients (with the creation affordance), zero workload, partial and denied are **four
  different sentences**, and the board dates its own read.
- `p659.home.zero_client_create` — an admin at a zero-client firm reaches client creation from the home and
  lands on the DB-returned client id; a bookkeeper sees no control and no greyed promise.
- `p659.home.draft_survives_refresh` — **the draft cell.** With the creation dialog open at a zero-client firm,
  a name typed and (at arity 1) the "different business" tick set: a `focus`/`visibilitychange` re-read that now
  returns a row, **and** a `CLIENT_RECORD_CHANGED` re-read, both leave the typed name and the tick standing and
  do not remount the control (`appendix-C-journeys.md:85`).
- `p659.home.watch_receipt` — at `/work?view=needs-you`, an acknowledgement is followed by a **reload** and the
  receipt still names the same actor and instant. **The `/clients/:id/tax` mount is proven by the web unit cell
  instead**, because that route's e2e fixtures belong to #627's `tax-boundary-mock.mjs` and **#659 must not edit
  another lane's mock** — name that as a bounded residual with its reason.
- **Mock verbs to declare** in `apps/web/e2e/e2e-fixture-ownership.test.ts`: `get_firm_portfolio_pack` (new,
  this lane's — the pack takes **no client**, so its subject is the firm and it cannot be id-scoped; add it to
  `home-board-mock.mjs` as an honest-empty envelope handler and **append** it to that lane's `debt` array
  **after** `#902`'s `/rest/v1/rpc/get_client_work_pack` string, whose declaration and comment block stay
  byte-identical), `get_compliance_watch_disposition` (same treatment or `page.route`-only, per your walk),
  `list_review_queue` (**declare shared**), `list_accounting_work` (**declare shared** with #636/#641), and
  `list_activity` per `p659.measure.mock_dispatch`. Read POST bodies **only** through the shared `readCachedJson`.

---

## 5. Risks

1. **`list_review_queue` is the most-spliced body in the estate and four of its splices belong to other lanes'
   tickets** (`0011:3748` → `0016:4558` → 0017 / 0036 / 0041 / 0043 / 0146 / 0180). Every temptation to widen its
   envelope or lift its active-client join is refused by ruling; every new fact goes in a new door. Each splice
   re-derives all prior markers and raises CLR10 on drift.
2. **Two altitudes, two floors, one page.** The review-queue counts ship at **viewer** (`0016:4563`); every Work
   read floors at **bookkeeper** (`0189:344-347`, `0203:258`, `0214:272`). Design for the honest asymmetry #650
   already shipped (`client-work-attention.tsx:17-21`): a viewer sees the needs-you numbers and a "Work records
   need a bookkeeper role" sentence beside them. **Do not hide the page from viewers and do not fold the viewer
   number into the bookkeeper pack.** — *and note this is one of three things the design lens never attacked
   (gap-659 Unverified #12); state that in the report.*
3. **A portfolio table is the easiest place in the product to accidentally consolidate.** `ReviewQueueRow`
   carries `amount_cents` (`lib/firm/needs-you.ts:205`); one `reduce` in a later refactor turns B1's central
   prohibition into a false total. Mitigate with the `prosrc` tail assertion **and** `p659.portfolio.no_money`,
   never a comment (SYNTHESIS §7.5 #6).
4. **Merge collisions, exact files and whose hunk wins.** `apps/web/messages/en.json` (every lane — your
   `FirmHome.*` namespace and two `NeedsYou.openTab.*` keys, sorted); `apps/web/test/manifest.txt` (**six or
   seven** lines); `apps/web/e2e/e2e-fixture-ownership.test.ts` (`SHARED_RPC_VERBS` + the `home-board-mock.mjs`
   row — #902's string untouched); `apps/web/e2e/home-board-walk.spec.ts` + `home-board-mock.mjs` (**#660 also
   appends** — **integration sequences #659's structural edits before #660's**, SYNTHESIS §3.1);
   `packages/db/tests/rig-meta.mjs` (three sites, watch the `];` repairs);
   `packages/db/package.json` (gate chain, **migration order, not alphabetical**); `CONTEXT.md` (four terms).
   **No `tree.ts`, no `require-firm-scope.ts`, no `needs-you.ts` row kind, no `action.yml`.**
5. **Census suites will red on files you never meant to touch**: `tests/firm-scope-surfaces.test.ts` and
   `tests/firm-scope-fourth-entrance.test.ts` (a new module colocated under `app/**` needs a roster entry — put
   components under `components/firm/`), `tests/sql-oracle.test.ts` and
   `packages/db/tests/operation-census.test.mjs` + `rig-isolation.test.mjs` (two new SQL functions),
   `tests/parity-holes.test.ts`, `e2e-fixture-ownership.test.ts` (new mock verbs), `lib/navigation/tree.test.ts`
   (any href change), `tests/token-contrast.test.ts` / `focus-ring-contract.test.ts` /
   `reduced-motion-contract.test.ts` (the redesign).
6. **Extracting `AddClientControl` moves a file three tickets have opinions about.** #899 wants exactly this;
   #649 wrote its identity-check reasoning into that file's header (`client-register-list.tsx:107-133`) and it is
   #649's AC1 evidence; `add-client-control.test.tsx` and `add-client-candidates.test.tsx` both import from it.
   **Move the header comments with the code and repoint both tests in the same commit.**
7. **`useReviewQueue` is shared by four surfaces and one of them is #660's file this wave.** Hence the ruling
   above: compose, never edit. **Close #903's items deliberately or state that you did not.** — *the second of
   the three things the design lens never attacked.*
8. **The e2e mock deliberately does not answer `list_firm_timeline`** so the not-deployed arm is exercised
   (`home-board-mock.mjs:113-118`). The `list_activity` swap silently retires that coverage unless the new cell
   re-creates it — `firm-home-board.test.tsx:181` would go green while proving nothing. `p659.measure.mock_dispatch`
   plus the replacement cell is the mitigation.
9. **The existence-oracle risk moved into the cursor.** `list_review_queue` raises CLR10 for a `client_id`
   outside the firm (`0016:4569-4575`) — it is **not** indistinguishable the way 0189/0214 are. The portfolio
   pack has **no client argument** to make that mistake with, so the whole risk lands on the one place a client
   identity still enters: **resolving the `p_cursor` pair against `clara.clients`** — to "validate" it, or to
   reject a cursor whose client was archived — rebuilds that oracle inside a paging argument, where no reviewer
   looks for it. The cursor is a sort key; refuse on shape only. `p659.portfolio.cross_firm` asserts both sides.
10. **A firm-wide page over a register that changes between two fetches.** A register gains rows (an onboarding
    birth), loses them to `archived`, and can be **renamed** — which under a `lower(name)` key moves a client
    across an open page boundary. The version of this bug that **never reds** is ordering by a non-unique
    expression (status, a count, or `created_at` without `id`) in a fixture with fewer rows than one page.
    `p659.portfolio.cursor_stability` is the only cell that catches it.
11. **The creation control's draft is the only unsent input Firm Home will ever hold.** D18.c moves it onto a
    page this same slice teaches to re-read on four triggers. Mounted inside the zero-client `Empty` branch it is
    remounted — and silently emptied — by the first re-read that returns a row. Mount rule in §3 Web 5, contract
    at `appendix-C-journeys.md:85`, cell `p659.home.draft_survives_refresh`.
12. **Q1's two-populations problem is adversarially untested** (gap-659 Unverified #12, the third item): whether
    a bookkeeper-floored pack counting onboarding clients' Work, beside viewer-floored queue counts that
    structurally exclude them, is a *disclosure* problem or a *two-populations-on-one-page* problem that no
    `coverage_reason` string can honestly fix. **D18.a rules it the disclosure way and that ruling stands** —
    but say in the report that no reviewer has attacked it, so the spec lens can.
13. **Known Windows-only reds you must NOT "fix"**: #707 (x56-rest-c shells out to grep), #693 (EICAR fixture
    quarantined by Defender), no `pg_dump` on PATH, `thread-live-clarify.test.tsx`'s whole-suite load flake
    (re-run it alone and report both), `rig-isolation.test.mjs` T10b after a World bootstrap (#866 — not yours;
    this slice bootstraps no World, so it should not arise). `next build` can panic `0xc0000142` under ten-lane
    contention — retry once (#869).

---

## 6. Effort and rig

**Effort: L** (DECISIONS §7). One additive migration with two new functions, **no recut, no overload, no new
table, no trigger, no event, no frozen ceremony, no `prosrc` pin of anything you change, no Workflow World leg**;
plus a page rewrite carrying URL state, a paged per-client table, seven states, a refresh machine **ported by
reference** from `use-client-work-pack.ts`, two link repoints, a control extraction and a firm-home walk. The two
hardest reads it depends on (`0203`, `0214`) are already built and already tested in the shape its batteries copy.
gap-659 §11's "Q3 + Q4 together is XL" is a **budget warning**, not a competing size.

**Rig**: worktree `C:\Users\zhant\Desktop\clara-wt\659`, branch `impl/659-firm-home`, PG **55709** / db
**clara_659**, base `abcc5030`, 219 migrations, frontier `0224_preview_invite`, PG 17.11.
Bash: `export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"` then
`export PGHOST=127.0.0.1 PGPORT=55709 PGUSER=postgres PGDATABASE=clara_659 CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`.
**Never** set `CLARA_RIG_ALLOW_RESET=1` or `CLARA_RIG_ALLOW_ROLE_SWEEP=1` (they reset the schema and trip 0154's
cluster-wide role-count pin). No `psql` on Windows — use `node` + `pg`. **Playwright triple**:
`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3380 CLARA_E2E_NEXT_PORT=3381 CLARA_E2E_RUNTIME_PORT=3382`, and always go
through `pnpm --filter @clara/web e2e home-board` — `npx playwright test` alone serves a stale build (#865).

**Before your final report, run and report counts for**:

- `pnpm typecheck` and `pnpm lint` from the worktree root — both green.
- The **whole `apps/web` unit suite** once: `node scripts/run-tests.mjs` from `apps/web` (~5 min). Report its
  counts; the census suites red on files you never touched.
- Your two batteries with the gate flags copied **verbatim** from `packages/db/package.json`'s `test` script —
  now **41** `--import ./tests/*-preintegration-gate.mjs` flags including your own, in migration order after
  `preview-invite-preintegration-gate.mjs`:
  `node --test --test-concurrency=1 $GATES tests/firm-portfolio-pack.test.mjs` and the same for
  `tests/compliance-watch-disposition.test.mjs`. **Also run each FOCUSED without its own gate and prove it FAILS
  loudly** below its migration — a skip is not evidence.
- `packages/db/tests/operation-census.test.mjs` and `rig-isolation.test.mjs` **without** the reset flags — this
  slice adds SQL functions.
- `pnpm --filter @clara/web e2e home-board` with your triple.
- **Parts-parity / frozen check: not applicable** — this branch touches no module reachable from a frozen body
  (SYNTHESIS §7.2 lists #659 among the expected no-ops). If that ever changes, run
  `node packages/runtime/scripts/check-parts-parity.mjs` and `node scripts/check-frozen-workflows.mjs` and say so.

**Copy the house shapes from** (`git show --stat <sha>`, then the files):
`packages/db/migrations/0214_client_work_pack.sql` (header, prestate pin, envelope, grants, the whole tail),
`0203_list_accounting_work_intent_key.sql` (keyset, cursor refusals, literal-order probe),
`0189_work_list_reads.sql` (the granted DEFINER helper, its 101 refusal, the measured index comment),
`packages/db/tests/client-work-pack.test.mjs` + `client-work-pack-preintegration-gate.mjs` +
`packages/db/tests/rig-meta.mjs:2155-2167` / `:2515-2518` / `:2962` (battery, gate, cohort, three registration
sites), `apps/web/lib/work/work-list-url-state.ts` (URL state), `apps/web/lib/work/use-client-work-pack.ts`
(refresh contract), `apps/web/components/firm/client-home/client-work-attention.tsx` (the state words and the
two-floor face), `apps/web/e2e/home-board-walk.spec.ts:376-550` (the drilldown / responsive / states / delayed
cells), and `docs/plan/active/refresh-wave-2026-09-15/brief-649.md` + `reports/649-final.md` for what a reviewer
later demanded: **behavioural cells rather than `prosrc` assertions wherever a behaviour can be driven**,
re-measured rather than copied evidence, an explicit merge-order collision table, and every claim carrying the
command that produced it with its pass/fail counts.

---

## Verifier findings not applied

**None. Both findings were opened against their own evidence and APPLIED.** Recorded here so the implementer
knows which sentences were rewritten and why.

- **F1 (minor, inexact — `0003:36` cited for `clara.clients.name` NOT NULL).** **Applied.** Re-measured:
  `grep -n "" packages/db/migrations/0003_books_core.sql` → `36:  firm_id    uuid        not null references
  clara.firms(id),`, `37:  name       text        not null,`. Both citations (§1 Current state, §3 Migration 1)
  now read `0003:37`. The adjacent `0003:38` (status CHECK) and `0003:41` (`uq_clients_firm_name`) were
  re-measured in the same read and are correct as written.
- **F2 (note, inexact — "a foreign or invented id" borrowed a parameter this door does not have).**
  **Applied, and taken past the suggested reword.** Re-measured: DECISIONS §2 row 0231 fixes the signature at
  `(p_limit, p_cursor, p_preview)` — no client argument — while the posture sentence the draft borrowed
  (`0214:91-96`) is written about `get_client_work_pack`'s `p_client` (`0214:234-236`). All three sentences
  (§3 Migration 1, cell 9, Risk 9) now name the `p_cursor` payload as the only forgeable client identity, and
  three consequences the suggested wording would have left implicit are stated as rules: the body **never
  resolves the cursor's uuid or name against `clara.clients`** (doing so rebuilds `list_review_queue`'s CLR10
  oracle — the `not exists(… and firm_id=c.firm)` probe at `0016:4569-4575` — inside a paging argument); the
  `invalid_cursor` refusal is a **shape** refusal only; and `p659.portfolio.cross_firm` is now a two-call
  behavioural cell (a real firm-B pair and an invented pair must answer the same envelope) instead of a
  restatement of 0214's sentence. The three `0016:4566-4575` citations were tightened to `0016:4569-4575`,
  the lines that actually carry the probe.

**Found while applying F2, not raised by the verifier, now written into the brief** (§3 Migration 1, cell 13):
the cursor grammar must split at the **last** `|`. `0203:304`'s `position('|' in v_decoded)` is safe for a
`timestamptz` component; `clara.clients.name` has **no character CHECK** at birth or since (measured:
`grep -rn "clara.clients" packages/db/migrations/*.sql | grep -iE "alter table|add constraint|check"` returns
only `0007:59`, `0017:37` + `0017:658-659`, and `0041:774-779`), so a first-pipe split breaks paging on a legal
client name such as `Acme | KL Sdn Bhd`. **No orchestrator ruling needed** — DECISIONS §2 row 0231 specifies the
cursor's spelling (`lower(name)|uuid`), not its parse, and the last-`|` rule keeps that spelling exactly.

Carried forward for the orchestrator's record (from gap-659's own ledger, **not** findings against this brief):
the design/safety lens's **F3** (tag the `AddClientControl` extraction "Q5-conditional") and **F4** (re-headline
the effort "L (cut) / XL (full)") were **listed and not applied** in the gap map because each contradicts a
binding ruling — D18.c rules the extraction in, and DECISIONS §7 sizes the ticket **L** for exactly this scope.
Both are restated above as rulings so no reader reaches for the map's unruled phrasing.
