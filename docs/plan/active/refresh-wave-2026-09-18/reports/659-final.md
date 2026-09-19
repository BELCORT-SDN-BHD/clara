# #659 — 在事务所首页掌握各客户工作与注意事项 — final report

Branch `impl/659-firm-home`, worktree `C:\Users\zhant\Desktop\clara-wt\659`, base `abcc5030`, HEAD
**`cc19cf18`**. `git log --oneline origin/main..HEAD`:
`cc19cf18 fix(web,db)` · `5ddabcee fix(web)` · `da830ddf fix(web,db)` · `e895464f fix(web)` ·
`e14a8b9c test(web)` · `261aab7b feat(web)` · `dd65b70c feat(db)`. All evidence below is **local**;
**hosted evidence pending**.

**Revised after fix round 1** (`reports/659-fixround-1.md`): 15 review findings applied, 2
deliberately left, 1 ratification requested. Every row below describes the branch at `cc19cf18`.

## Per acceptance criterion

| Row | Disposition | Evidence |
|---|---|---|
| **AC1** counts/coverage/freshness; no cross-client money | **done** | `p659.portfolio.distinct/.no_sum/.attention_failed/.partial_receipt/.onboarding_disclosed`; money as a proven negative in THREE places — 0231's tail `prosrc` probe, `p659.portfolio.no_money` (body + envelope), and `firm-portfolio.test.tsx` "THE BOARD RENDERS NO AMOUNT ANYWHERE". Freshness: `sources` + `computed_at`, rendered as "Read at …" |
| **AC2** links + preserved return state | **done**, with ONE destination withdrawn | **Revised (A1).** The `compliance_watch` → `/tax` repoint stands. The `work_question` → Work-detail repoint is **WITHDRAWN**: the queue row publishes `wqi.task_id` (an `agent_tasks` id) and the Work reaches it only through `join accounting_work wqw on wqw.id = wqi.work_id`, a column the row does not publish — the link addressed a route that resolves nothing. Measured on a real parked Work by `p659.links.work_question_row_cannot_address_its_work`, which also guards the residual. The failed/refused column with its split; `lib/firm/portfolio-url-state.ts` + `p659.home.drilldown` — Back lands on `/?attention=active` AND focus returns to the control that left, now genuinely built (A3). **`recent_success`'s drilldown carries no week** (A2) |
| **AC3** six faces | **done** | `firm-home-states.test.tsx` — 10 cells, last one proves the **seven are seven different strings**; `p659.home.states` in the browser |
| **AC4** zero-client creation | **done** | `p659.home.zero_client_create` (admin lands on the DB-returned id) and its bookkeeper twin (no control, no greyed promise) |
| **AC5** mixed fixtures, access change, missed-event refresh, exact-count drilldown, responsive | **done** | `use-firm-portfolio.test.ts` (10 cells: four triggers each exactly one re-read; hidden tab costs nothing; denial clears, failure keeps dated); `p659.home.portfolio` / `.drilldown` / `.responsive` |
| **AC6** compliance acts preserved + attributable receipt | **done** (acts verify-only) | Acts untouched — `compliance-watch-affordance.test.tsx` 3/3 still green. Receipt built: `compliance-watch-disposition.test.mjs` (6 cells) + `compliance-watch-receipt.test.tsx` (7 cells). **Revised (A7): ATTRIBUTABLE now means a person.** The receipt printed the raw user uuid the DB stamps; it resolves through the same `clara.firm_members_visible` roster and the same shared `MemberName` cell the activity band uses, falling back to the shortened id when the roster does not answer. **"Version" has no referent** — `state_before → state_after` is returned and the absence is asserted from `prosrc` and from the envelope |
| **AC7** states/zoom/focus/SR names/URL/drafts | **partial** | Built; **two clauses have NO REFERENT on a link-only surface** (invalid/saving, cancelled/recovery) — reported, not invented (D18.d). Explicit accessible-name cell added (axe cannot make that assertion). **Revised (A3): the focus clause was green on an assertion that could not fail** — a hard-coded `.toContain("3")` inside a three-leg loop. Rewritten against each leg's own `aria-label` it went red (`Received: ""`, i.e. `<body>`), so focus return was BUILT: `lib/firm/portfolio-focus-return.ts`, a take-once `sessionStorage` marker in `signup-email-storage.ts`'s shape; 4 unit cells + the browser leg |
| **AC8** real least-privileged roles | **done** | Both batteries through `humanQuery` personas; `p659.portfolio.machine_lanes` / `.floor_viewer` / `.catalog`. **This journey invokes no Workflow** — no route, no enqueue, no World leg |
| **UI-04** shadcn | **done** | `Table` in `DataTableCard` *with a label*, `Pagination`, `Empty`, `Skeleton`. `p659.measure.ui_inventory`: all present — **no primitive added**, no `ui:add` run. **Corrected (S2): the status chip is `Badge` from `@/components/parts/PartBadge`, not `components/ui/badge.tsx`** — the tone chip four sibling Firm-altitude components already standardise on (`client-work-attention.tsx`, `needs-you-scoreboard.tsx`, `oldest-waiting-list.tsx`, `SstWatchSection.tsx`), so it is consistent reuse rather than a second chip implementation |
| **UI-05 / UI-12 / F-06** | **verify-only** | `@container`/`@3xl:` kept (board cell still green); semantic tokens only; `token-contrast` 19/19, `focus-ring-contract` 7/7, `reduced-motion-contract` 4/4; **no new token minted** |
| **UI-35 / C88.10** | **done** | The portfolio layer; the disposition door + receipt |

## Tests and commands

* **db** (41 gate flags, migration order, `firm-portfolio-pack-preintegration-gate.mjs` last):
  `firm-portfolio-pack.test.mjs` **17/17**, `compliance-watch-disposition.test.mjs` **6/6** (**23
  pass / 0 fail** in one run at `cc19cf18`; fix round 1 added
  `p659.links.work_question_row_cannot_address_its_work` and
  `p659.portfolio.preview_zero_calls_helper_zero_times`).
  **Focused without the gate, below the migration: FAILS loudly** (recorded before 0231
  applied); with the gate preloaded the file skips.
* `operation-census.test.mjs` + `rig-isolation.test.mjs` (no reset flags): **30 pass, 0 fail, 1 skip**
  (the destructive cell).
* **whole `apps/web` unit suite** — `node scripts/run-tests.mjs` at `cc19cf18`: **4204 tests, 4202
  pass, 0 fail, 2 skipped** (the two live-Supabase-auth cells, env-gated, pre-existing). The count
  rose from 4191 by the 13 cells fix round 1 added.
  **Corrected (S1): "0 fail" is this run, not a property of the suite.** The standards review
  measured **4188 pass / 1 fail** on the same tree, at
  `lib/clara/use-clara-thread-stop.test.ts:1021`, and found it non-deterministic in isolation
  (2 of 5 isolated runs red). That file has **zero diff against `origin/main`** on this branch and
  imports nothing #659 touches, so it is a pre-existing flake in #630's thread-stop machinery, not
  a regression here — and it is worth a ticket for the #630 lane owner, since it reproduces under
  the real bootstrap rather than only under a bad standalone invocation. It did not fire in my run.
* **Playwright** `pnpm --filter @clara/web e2e home-board` on the 3380/3381/3382 triple: **15/15
  passed (50.5s)** at `cc19cf18`. During fix round 1 this suite was the instrument for A3: the
  rewritten focus assertion reded (`Expected: "3 Work running for Rome Properties" / Received: ""`)
  before focus return existed, and is green after. An earlier run reded 2 cells on a strict-mode
  ambiguity (three nodes say "No clients yet"); fixed with exact locators.
* `pnpm typecheck` **green**, `pnpm lint` **green (exit 0)**.
* `check-frozen-workflows.mjs` OK (296 frozen) and `check-parts-parity.mjs` OK — run although this
  branch touches no frozen closure.

## Measurements that corrected the brief

* **`p659.measure.plan`** (seeded 300-client / 20 100-Work firm): client page = `Index Scan using
  uq_clients_firm_name` (102 rows, 7 buffers, 0.080 ms) with only an *Incremental* Sort; aggregate =
  `GroupAggregate` over `Index Scan using uq_accounting_work_intent` (6 700 rows, 2.3 ms). **No
  sequential scan → NO index added.** Door: 17-18 ms at `p_preview=3`, 7-8 ms at 0. Fixture removed;
  `clara%` roles still 18.
* **An ONBOARDING client cannot hold Work**: `admit_accounting_work` refuses a non-active client.
  The `onboarding_client_excluded_from_queue` disclosure's live subject is the **archived** client.
* **`clara_freeform_ro` holds SELECT on `compliance_watches`** (0131). Door 2's DEFINER rationale
  stands: zero privilege for all five application roles, and the event trail has no non-owner
  grantee at all.
* `list_review_queue` carries **10** `status='active'` markers (brief said seven) and no watch
  disposition key. **No toast on any #659 surface** — no Sonner; a Base UI toast exists with one
  call site (`components/settings/account-settings.tsx`), which the brief's grep missed.
* **`list_activity` is answered by #632's lane** (`serve-built.mjs:609` vs the home hook at `:720`),
  so no handler was added — my walk overlays its own. **Coverage change, named**: other lanes'
  `/` landings now render #632's activity rows instead of the retired not-deployed note. Fix round 1
  (A12) turned this paragraph into two census cells in `e2e-fixture-ownership.test.ts` that pin the
  dispatch order and assert this lane answers no `list_activity` verb — an arm here would be dead
  code under that order, and §6.1 forbids moving it.

### Added by fix round 1

* **`list_review_queue`'s `work_question` row cannot address its Work** (A1). Measured off live
  `prosrc`: the CTE selects `wqi.task_id` (an `agent_tasks` id) and joins the Work on
  `wqw.id = wqi.work_id`, which it does not publish. **The brief's §6 instruction was written on the
  premise that `task_id` is the parked Work; it is not**, and the deep link it asked for addressed a
  route that resolves nothing. Withdrawn, with the residual named — see the ratification list in
  `659-fixround-1.md`.
* **The `recent_success` count and its drilldown were different populations** (A2). The count keys on
  a committed `operation_receipts` row; `list_accounting_work`'s `since`/`until` filter
  `w.created_at`. The brief's own words for this mechanism — "so a drilldown cannot mean a different
  week" — described an intent the mechanism does not deliver. The link now carries no week and is a
  superset of the count.
* **`p_preview = 0` calls `clara._work_run_attempts` zero times — COUNTED** (A9), through
  `pg_stat_user_functions` with `track_functions='all'` and `pg_stat_force_next_flush()`: 0 across
  `p_preview=0`, 1 across `p_preview=3`. The header's claim was right; the measurement was missing.
  Note the trap: the first, un-forced form of the probe read zeros for BOTH arms.
* **Brief deviation, now declared (F1).** `get_firm_portfolio_pack` is filed **`unscopeable`** in
  `e2e-fixture-ownership.test.ts`, not in the `debt` array the brief's §4.5 named. `unscopeable` is
  the factually correct column — the door takes no client argument at all
  (`p_limit, p_cursor, p_preview`), unlike `get_client_work_pack`, whose `p_client` is present and
  simply unused. A considered correction, not an oversight.
* **Brief deviation, now declared (F2).** D18.e quotes the disclosure sentence as "dated by when each
  Work *started*, not when it posted". The shipped firm-altitude sentence has the OPPOSITE polarity,
  and that is correct for this altitude: 0231's count is keyed on a committed receipt (posted),
  whereas #650's client-altitude case is an aggregate count beside an itemised list sorted by start
  date. Different divergence, different sentence.

## Docs · successor contract · assumptions

`CONTEXT.md` +4 terms; `packages/db/README.md`, `packages/db/tests/README.md`, `apps/web/README.md`
(a new "Firm home" section). PRD/ARCHITECTURE untouched.
**Successor contract: NONE** — no runtime module, no route, no `_vN`. The three compliance doors
**refuse an agent identity by construction** (`p659.watch.agent_refused`, CLR03 before any write):
that is a thing the database forbids, not a deferred tool.

**Blueprint drift**: `docs/PRD.md:27` (**corrected, F3** — the brief and this report both said
`:31`; `grep -n` puts the sentence at 27 in the checked-out tree, and this branch does not touch
`docs/PRD.md`) + §4「工作追踪」 reads as delivered — the per-client firm-altitude
aggregate did not exist before 0231 (it does now). `docs/ARCHITECTURE.md:134-135`
「可查询获准客户并组织批量工作」— querying is true, **organising batch work at firm altitude still does
not exist**; the board's `NotBuiltNote` now says so.

**Assumptions** (WORK-ORDER rule 6): (1) `app/(firm)/page.tsx` reads **no** `searchParams` — nothing
on this route is markup-dependent on the filter; stated in the file. (2) `add-client-control.test.tsx`
and `add-client-candidates.test.tsx` still mount `ClientRegisterList` (#649's AC1 evidence at its own
surface) rather than the extracted module; a new non-remount cell was added instead. **Fix round 1
(A8): the extracted module's header asserted the opposite — that both cells "are repointed at this
module in the same commit" — which was false in the same commit. The header now says what is true,
and names the residual: no cell imports that module by its own path.** (3)
`SHARED_RPC_VERBS` untouched — home-board-mock answers no shared verb. (4) The brief's F-06 "no new
token" read literally: none minted. (5) Q1's two-populations question (gap-659 Unverified #12) —
**the adversarial lens did attack it (A2), and it was right**: the count and its drilldown were two
populations. Fixed; D18.a's disclosure ruling stands and now covers the link as well as the count.

## Follow-ups worth filing

1. **Firm Home renders the client register twice.** The new portfolio table and the older
   `clientsLine`/`clientsEmpty` status tally are two renderings of one population — the shape 裁-190
   removed once already. One should go; I did not widen scope to decide which.
2. **`/settings/compliance` should mount the same disposition read.** `get_compliance_watch_disposition`
   is live and browser-reachable; `components/firm-admin/compliance-register-panel.tsx` is #635's
   estate and was not touched.
3. **#903's `useReviewQueue` polish is NOT closed.** The composing hook deliberately leaves that file
   byte-identical (a source cell asserts it); every #903 item remains open.
4. **`/clients/:id/tax` receipt has no browser leg.** Proven by the web unit cell only — that route's
   e2e fixtures belong to #627's `tax-boundary-mock.mjs` and this lane must not edit another lane's mock.
5. **#861 (activity kind ladder)** is named on the surface and in `messages/en.json`; unpatched by ruling.
6. **`lib/firm/timeline.ts` and `clara.list_firm_timeline` (0174) now have no production consumer**
   (fix round 1, A11). D18.f's swap to `clara.list_activity` deleted `firm-timeline-section.tsx`,
   which was their only caller. Verified this pass: `grep -rn "firm/timeline"` over `apps/web`
   returns only `lib/firm/timeline.test.ts:16` (the import under test) and two prose references
   (`lib/firm/activity.ts:31`, `lib/work/evidence.ts:129`), and the test file is still in
   `apps/web/test/manifest.txt`. Deleting a live granted door and its wrapper is a decision about
   what the product keeps, not a defect fix, so a later lane should do it deliberately rather than
   discover a dead read.
7. **Publish `work_id` on `clara.list_review_queue`'s `work_question_rows`.** This is the real fix
   for A1 and it needs a recut that DECISIONS §2 row 0231 forbids on this branch — see the
   ratification list in `659-fixround-1.md`. Until it lands, a parked question's inbox row can only
   open the client workspace root.
8. **A non-deterministic red in `lib/clara/use-clara-thread-stop.test.ts`** (#630's lane, S1). Not
   this branch's — zero diff against `origin/main` — but it reproduces under the real bootstrap
   (2 of 5 isolated runs), so it deserves an owner.

**Unverified**: the hosted frontier; whether any real firm has enough clients for paging to matter;
any claim about Postgres behaviour beyond `clara_659` (PG 17.11, frontier 0231, 220 migrations).
