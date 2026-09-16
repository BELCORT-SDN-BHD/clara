# #648 — 从真实缺失资料继续事务所设置 · final report

**Branch** `impl/648-firm-setup` · **worktree** `C:\Users\zhant\Desktop\clara-wt\648` · base `4464e471` · rig PG 55507 / `clara_648` (194 migrations after 0203). All evidence below is **local**; **hosted evidence pending** (no hosted probe was run).

`git log --oneline origin/main..HEAD` — 9 commits, 31 files, +6369/−8:
`35b538bc` feat(db) 0203 · `31834d62` feat(web) `/settings/setup` · `ccac8c3c` test(web) unit + lane mock + walk · `95343260` docs · `bda43ac8` test(web) re-pinned censuses · `a4e0afde` test(web) walk fixes · `6a3893e1` feat(web) #654's two wall faces · **`446cf815` fix(web,db) round-1 blockers (correction path; one op key = one attempt) · `dcc7c94a` test(web) round-1 should (convergence budget; the lane models `_reserve_op`)**. Round-1 fixes are detailed in `reports/648-fixround-1.md`; **`0203_firm_setup.sql` is byte-unchanged by that round**.

**The interrupted attempt left nothing.** `git status` clean, `git log origin/main..HEAD` empty at start — nothing to keep or discard.

## Per acceptance criterion

| Row | Disposition | Evidence |
|---|---|---|
| **AC1** progress from real required items; resume after reload and concurrent editing | **done** | `p648.seed.reconcile` (a `firmInterview_v3`-filled plan keeps every accepted answer byte-identical; only the 9 missing rows insert), `p648.seed.empty` (12 rows, replay = 1 receipt), `p648.answer.stale` (CLR06 `stale_plan`, never CLR31), `firmSetup.walk.answer` (full reload resumes, no re-ask), `fs.web.01` (counter is the envelope's, not the items'), `fs.web.03` |
| **AC2** Field for one fact, bounded set for a related set; optional skippable, never a gate | **partial-with-named-residual** | `fs.web.07`, `fs.a11y.01`, `firmSetup.walk.answer` (1 Field / 3-step walk + review). Skippability on the interview's own `skippable:true` items: `p648.defer.reason` (`mia`, `currency`), `firmSetup.walk.finish` (`tin`). **Residual: no optional-education content exists** — `firm_setup_keys.item_kind` admits `education` and zero rows are seeded; the seed maps `education`→`todo` because `onboarding_plan_items.item_kind` admits three values. Questionnaire still uninstallable (`components.json:24`) |
| **AC3** scope/source/actor in the canonical record; conflicts, stale, source, refusal | **partial-with-named-residual** | `p648.capture.eligible` (3 keys → firm-scope `knowledge_records`, `asserted_by`=answerer, `recorded_via=human_ui`, `trust=asserted`), `p648.capture.shadow`, `p648.authority.downgrade` (current-rank verdict), `fs.web.09`, `firmSetup.walk.stale`. Refusal faces: `already_live`, CLR04, `already_recorded` (`_reserve_op`'s bare CLR10, `fs.web.12`) and #654's two walls (`6a3893e1`, unexercised — 0205 absent). **Residual: firm identity facts have no knowledge record (D10)** — proven by `p648.capture.ineligible` (9 items, 0 records, 0 catalog rows moved) |
| **AC4** partial completion + an authorised next step; workspace stays usable | **done** | `firm-setup-tile.tsx` + `firmSetup.walk.start`; **`p648.workspace.open`** turns "still usable" into an assertion (a bookkeeper still reads clients, `list_accounting_work`, `list_activity`, `list_review_queue`, `list_client_knowledge` while setup is open) |
| **AC5** saved/resumed, conflict, stale, denied, completion + responsive/focus/zoom/motion/announcement | **done** | the 5 walk cells; `fs.kbd.01-04`; `fs.a11y.01-03` |
| **AC6** ten states, 320px/200%, focus return, SR names, reduced motion, stable URL/Back, drafts | **done** | `firmSetup.walk.responsive` (320px & 200% overflow ≤1px, Enter-to-open + focus return, 0 finite animations under reduce), `fs.web.02/04/05/06/08`, `fs.kbd.02/03`, `firmSetup.walk.finish` (Back → firm home, URL stable) |
| **AC7** production read/command under real least-privileged roles and current migrations | **done** | **17** real-role cells, every assertion through `humanQuery`; the one root write is the `ck_onboarding_plan_items_answer` probe in `p648.defer.reason`, whose subject is the CHECK |
| **C48.5** | **done, closed here** | current route `/settings/setup`, persisted answers on `onboarding_plan_items`, shared question **components** reused (form shape), records on the plan. **Correction path, two branches** (round-1 fix): a settled plan-only fact and a skipped one each keep a write control on the checklist that re-opens the same form prefilled from the record — one door does both (`p648.answer.correct`, `fs.web.10`, `firmSetup.walk.answer`); a fact carrying a LIVE firm-scope knowledge record is corrected on the facts panel instead, because the door refuses the second capture `knowledge_already_live`, and the row says so in words |
| **C83.24** | **duplicate — closed with C48.5** | pointer left for #654 |

**This journey invokes no Workflow.** No lane, no route, no registry repoint, no successor, **no `db-live-gates/action.yml` row**, no World e2e leg. `packages/runtime` diff is empty.

**Brief item 17 (firm intake documents → #633's `(firm)/documents` leaf): N/A in this slice, and that is why no link and no placeholder line was shipped.** All twelve catalogue rows are typed `text`/`long_text`/`choice`/`month`/`labelled_object` (`clara.firm_setup_keys.answer_shape`, 0203 §A) — not one of them takes file evidence, and no AC or TDD seam in brief §3/§4 asks this surface to reference a document. So there is nothing here for #633's leaf to be the destination OF; a named line would be a dead sentence rather than an honest one. `grep -rn -i "intake|supporting doc|unassigned.doc|uploaded"` over `components/firm-setup/`, `lib/firm-setup/`, `app/(firm)/settings/setup/` and 0203 returns nothing, which is the intended state, not an omission. If #654 or a later wave adds a catalogue row whose answer cites a document, the link belongs with that row.

**Successor contract: none owed.** Firm-scope chat capture is #654's stanza (DECISIONS §2 #654); this slice ships only human doors and a human surface.

## Tests added

`packages/db/tests/firm-setup.test.mjs` (**17** cells: `p648.seed.reconcile/empty/excludes`, `answer.floor/stale`, `defer.reason`, **`answer.correct`**, **`opkey.attempt`**, `commit.outstanding`, `capture.eligible/ineligible/shadow`, `authority.downgrade`, `isolation.oracle`, `acl.census`, `plans.one_open`, `workspace.open`) + `firm-setup-preintegration-gate.mjs`. **Ran RED first: 15/15 failed on the absent cohort** before 0203 existed; the two added in fix round 1 are door-contract pins (green on first run — they pin what the web surface is allowed to assume, and the round-1 red cells for those findings are the web ones below).
Web: `firm-setup-checklist.test.tsx` (**12**), `firm-setup-a11y.test.tsx` (3), `firm-setup-keyboard.test.tsx` (4). e2e: `firm-setup-walk.spec.ts` (5) + `firm-setup-mock.mjs` (which now models `clara._reserve_op`'s one-key-one-request rule, so the browser leg can tell a per-attempt op key from a value-derived one).

## Commands and counts

- `pnpm typecheck` — **exit 0**; `pnpm lint` — **exit 0** (worktree root).
- Whole `apps/web` suite, `node scripts/run-tests.mjs` — **3738 tests, 3735 pass, 1 fail, 2 skipped** (re-run after fix round 1; the 3 extra cells are this slice's). The 2 skips are the env-gated live-Supabase-Auth cells. The 1 fail is a whole-suite load flake in a file this branch never touches — `components/work/work-detail.test.tsx` cell "641 switching a tab fires NO write…", last edited by `3cd935bb` on main — and it is **42/42 in isolation** immediately afterwards (work order §9's known class; in the pre-fix run the same class landed on `thread-live-clarify.test.tsx` instead).
- DB battery with the exact 29 `--import` gate flags from `packages/db/package.json`: `firm-setup.test.mjs` **17/17 pass** (and 17/17 again on the review's from-scratch cluster 55607/`clara_648r`); `operation-census.test.mjs` **10/10**; `rig-isolation.test.mjs` **20 pass, 1 skip** (no reset flags); `knowledge-records.test.mjs` **27/27**.
- `node scripts/check-frozen-workflows.mjs` — **OK, 281 frozen files verified**. `check-parts-parity.mjs` — OK (does not apply; runtime unchanged).
- Playwright on **3290/3291/3292**, through `pnpm --filter @clara/web e2e -- firm-setup-walk` (which BUILDS first; `npx playwright test` serves whatever is already in `.next/`) — **5 passed (2.7m)**, exit 0, four axe WCAG 2.1 A/AA scans inside. Cell times: start 15.8s · answer 18.2s · stale 20.5s · responsive 15.8s · finish 32.7s.

## Docs updated

`apps/web/README.md` (Application map, Settings row) · `packages/db/README.md` (Operation-contract census → new "Firm setup (0203, journey A5)" table) · `packages/db/tests/README.md` · `CONTEXT.md` (**Firm setup**, **Firm profile fact**, + the boundary sentence on **Firm knowledge default**) · `packages/runtime/README.md` **unchanged, deliberately**. `docs/PRD.md` / `docs/ARCHITECTURE.md` untouched. **Blueprint drift: none** — neither blueprint says anything about A5, the firm plan or `update_onboarding_plan` (grepped).

## Assumptions (orchestrator to review)

1. **The catalogue carries three columns the brief did not list** — `group_key`, `answer_shape`, `answer_options`/`answer_field`. Without them the web form has no grammar, and putting it in TypeScript would be the second vocabulary the catalogue exists to prevent. Option lists are **derived by SELECT** from `knowledge_keys.allowed_values` (tail §4 asserts it), never re-typed.
2. **`framework` / `accounting_basis` record the practitioner's LABEL only** (`{framework_label}` / `{accounting_basis_label}` — the interview's own top-level keys, minus its code). The option table lives in a frozen runtime module; nothing reads the code today (0192's own note). Named residual.
3. **`mpers_eligibility` is seeded for every firm** as not-required and deferrable. The interview asks it of a Sdn Bhd alone; the catalogue has no applicability predicate. Named residual, stated in the row's `note`.
4. **The commit gate reads the CATALOGUE's required set**, not the plan row's own flag — otherwise `bookkeeper_email` (#625) would block #648's commit forever.
5. **No `SCOPE_ENTRANCES` row** (brief merge-risk 2) — **verified independently in round-1 review** (adversarial N5: the table holds exactly four entries and every one is a layout or an API route, so a per-page row would have made it a fifth entrance). The deviation is deliberate and correct; merge prep must not re-add the row. The page sits under `app/(firm)`, whose layout is the registered entrance; a second call would make it a fourth entrance and red `firm-scope-surfaces.test.ts` both ways (the `/settings/members` page carries the same note). Green in the whole-suite run.
6. **`lib/command/routes.ts` gained one row** — `SETTINGS_PRESENTATION` is `Record<SettingsSectionId, …>`, so a new section id is a type error without it.
7. **Loading is the house prose loader, not a skeleton** (`components/common/state.tsx`'s own header makes prose the one idiom across 57 call sites). The counter is ABSENT while unread, never a placeholder zero (`fs.web.02`).
8. **Draft key is user/firm/item; the revision is stored INSIDE the value.** A revision in the key would wipe a half-typed answer whenever anyone answered any other item — the opposite of the CLR06 contract.
9. **`defer` refuses an already-answered item** (`firm_setup_item_answered`): a deferral must not leave a live firm default whose plan item says "skipped".
10. **`get_firm_setup` is admin-floored**, so a bookkeeper's deep link is refused by the database and rendered as a named denied face.
11. **The e2e lane is armed by a cookie.** `get_firm_setup()` takes no argument and the tile calls it on every firm home; without a marker this lane's fixture would appear in every other walk. `serve-built.mjs` gained the honest "nothing outstanding" default (the `get_my_preferences` shape).

## Follow-ups worth filing

- **Firm setup applicability predicates.** `mpers_eligibility` (Sdn Bhd only) and `tin` (turnover-gated) are asked unconditionally because `clara.firm_setup_keys` has no predicate column. A `applies_when` expression on the catalogue, or a second door that re-derives applicability from earlier answers, would close it.
- **Optional education content for A5.** AC2's "optional education can be skipped" has a mechanism and no content; `item_kind='education'` exists and is unseeded. Owner input, not code.
- **Firm registration identity has no canonical home.** D10 parked legal name / SSM / TIN / address / MIA as plan items. Once #647/#654 settle the identity boundary, decide whether they become knowledge keys or columns on `clara.firms`.
- **`uq_onboarding_plans_one_open_firm` uses the brief's `state='open'` predicate.** A firm holds exactly one firm plan for life (`_create_firm_core` is the sole writer, §0.5c), so a committed plan beside an open one is unreachable — but a predicate on `(firm_id) where scope_kind='firm'` would make `claim_paid_firm`'s bare `select … into` single-row structurally rather than by argument.
- **A no-op reconciliation still rotates the CAS token** (0203:698-702, round-1 review N2). A second "Start firm setup" that adds nothing appends a snapshot and stales every in-flight editor. Unreachable from this surface today — the seed control renders only while `!env.seeded` — and the surface now holds a per-attempt op key so a retry replays instead of reconciling twice. Skipping the bump when `v_added = 0` belongs in the migration that next opens 0203's seed door.
- **`get_firm_setup` paints progress for a plan that does not exist** (0203:1030-1052, round-1 review N3). A firm holding no firm-scope plan still reads `required_total = 8` and eight outstanding keys. Harmless today — both consumers check `plan_id === null` first (`firm-setup-checklist.tsx`, `firm-setup-tile.tsx`) — but a zeroed counter and an empty outstanding list would make it unreachable by construction.
- **A withdrawn firm default stays in `confirmed_facts`** (0203:1057-1061, round-1 review N4): the fact projection filters on `superseded_at is null` alone, so the withdrawal tombstone survives and `facts.empty` can never return once anything has been withdrawn. The dead end it created is closed on the web side (the item's own `knowledge_record_id` goes null, so the checklist offers the answer form again — `fs.web.10`); stating the intent in §F's header is the remaining half.
- **`StateBanner` silently drops `data-testid`.** Its prop list is closed and it spreads nothing; TypeScript allows the attribute because JSX skips excess-property checks on hyphenated names. `work-question-form.tsx` passes four that never render.

## Unverified / not claimed

- **Hosted evidence pending.** Nothing here ran against the hosted estate.
- **#654's two walls are mapped but unexercised** — 0205 is not on this rig, so `knowledge_scope_not_firm_defaultable` / `firm_scope_client_evidence` have faces and no test. This surface cannot trip the second one structurally: every capture passes `p_source_kind => 'user_statement'` with no `p_source`, so a firm fact never cites a client-filed document.
- **The D13 activity-kind residual** (permission changes filed under `documents`) is untouched, as ruled.
- **Foreign plan items are not rendered.** A `firmInterview_v3`-filled plan's `bookkeeper_email` / `first_client_onboarding` are neither shown nor judged by `get_firm_setup`; they belong to #625 and #649.
