# #639 — 完成资产购入与登记，独立等待缺失折旧资料 · final report

**Branch** `impl/639-asset-acquisition` · **worktree** `C:\Users\zhant\Desktop\clara-wt\639` · base `4464e471`.
The interrupted attempt left **nothing**: `git status` clean, `git log origin/main..HEAD` empty. Nothing salvaged, nothing discarded.

```
aecfb34e test(web): #639 review 0201's ONE dynamic-SQL barrier in the firm-scope pins corpus
62b38a91 fix(runtime): #639 the World e2e reads the acquisition date as TEXT
6b08b7f4 test(web): #639 the browser walk's selectors, measured against the built app
ffb35826 docs: #639 the acquisition boundary, the new route, the particulars module, the frontier-gate rule and four CONTEXT terms
2d15d1b7 test(web): #639 the C7 acquisition browser walk, its mock lane and the detail-route unit cells
10bfe067 feat(web): #639 C7's asset detail route, the register link and the Work identity row
e7f28e4e feat(runtime): #639 the dependent particulars module, its unit battery and the fixed-asset acquisition World e2e
2edaf5ca feat(db): #639 migration 0201 — lane-agnostic fixed-asset acquisition birth, provenance and the runtime particulars door
```

**The red that defined the ticket, seen first.** `p639.birth.work_lane` against clara_639 at frontier 0200:
`CLR40` — *"this entry moves an account enrolled for the fixed-asset register (200-D41 as cost) without a register act"*, raised at COMMIT by the deferred belt after the receipt and the Work result had been written.

## Per acceptance criterion

| AC | verdict | evidence |
|---|---|---|
| AC1 identity, source, date, exact cost, accounts | **done** | `fixed_assets.acquisition_document_id` (0201 §A), written at birth; the read resolves the acquisition entry's own `document_id` as the authority. `p639.provenance.document` (Work lane, NULL document) + `p639.provenance.document_lane` (a real filed document, resolved through the READ). Identity stays 0041's placeholder until answered — `p639.particulars.for_overload` proves the answer replaces it. **MYR-only is a stated boundary** (`_fa_acquisition_json`'s `'currency','MYR'`; `packages/db/README.md`), not filled. |
| AC2 journal + register row + lineage + receipt atomically, under current authority | **done** | `p639.birth.work_lane`: one entry, one committed receipt, one register row, one transaction, through `clara.wake_record_journal_entry` under a real `clara_runtime` credential OBO the initiator. World e2e PASS 1+2. `p639.refusal.locked_period` (**fix round 1**: the cell now SEEDS a closed fiscal year — as shipped it only SELECTed one, found none on a fresh client and returned without asserting) and `p639.refusal.credit_leg` prove a refusal leaves no half-born row. |
| AC3 acquisition complete + ONE dependent versioned question; answering writes no journal | **done (human lane); run half = successor contract** | `p639.question.dependent`: the question opens AFTER the post, the Work parks `awaiting_input` while `result.entry_id` stands, one pending per Work, a stale version refuses `stale_question` without discarding the draft, and applying the answer leaves the entry count **unmoved**. `complete_fixed_asset_particulars_for` is granted and proven; the claraWork_v4 stanza is below. |
| AC4 duplicate / restart / correction; no partial mismatch | **done** | `p639.birth.idempotent` (hook + trigger = ONE row, ONE `asset.acquired` event), World e2e PASS 3 (replayed intentKey, no twin) and PASS 4 (crash/replay returns the SAME asset id). `p639.correction.chain`: reverse + rebook births a second row, History names predecessor and successor **and how each was derived**, and in-place cost adjustment still refuses `fa_cost_adjustment_deferred`. **Fix round 1** adds `p639.correction.co_acquired`: two cost lines on ONE invoice birth two rows and each names the other `co_acquired` / `co_acquired_on_same_document` — never `successor`, which is what both rows claimed before (0201's `source_document` arm now excludes the row's own entry and orders strictly). |
| AC5 C7 + Work/Journal/Document surfaces show acquisition apart from pending configuration | **done** | `clara.get_fixed_asset` returns `acquisition` / `particulars` / `history` as three blocks (`p639.read.acquisition_block`). Route `app/(firm)/clients/[clientId]/registers/assets/[assetId]`, four `SectionTabs`. `components/registers/work-asset-row.tsx` = one identity-block row on Work detail. Journal, Work, document and receipt links on the Acquisition tab. |
| AC6 atomic link; missing life/start/method blocks only dependent setup | **done (first half) + re-measured (second)** | First half = AC2. Second half **re-measured, not copied**: `p639.depreciation.independent` — the waiting asset is skipped by id with `reason:'incomplete'` while the complete neighbour charged (`charged_cents > 0`) in the same run. |
| AC7 refusals identify the dependent field/action without erasing the asset | **done** | `p639.particulars.axes` (axis `start_date`, `drivers`, `non_depreciable`), `p639.refusal.viewer` (CLR04 `insufficient_role`, asset untouched), `.locked_period` (CLR19 `write_into_closed_period`), `.credit_leg` (CLR10 `generic_control_leg`). Axis → CONTROL **on the human door** (fix round 1; as shipped this existed only as a runtime helper for the future claraWork_v4 tool and nothing under `apps/web` read an axis): `apps/web/lib/registers/fa-refusal-field.ts` maps `details.axis`/`details.field` to a control id, `fa-row-actions.tsx` carries the standing refusal INTO the dialog, and `FaDoorDialog` focuses that control and marks it `aria-invalid` — pinned by `lib/registers/fa-refusal-field.test.ts` (4 cells), the jsdom cell `p639 a CLR37 that names an AXIS …` and the browser walk's own residual-above-cost cell. **AC7's missing expectation is now SPECIFIED**: `clr40.belt` measures the DEPLOYED classifier — a commit-time CLR40 settles the Work **`failed`**, `error.code='CLR40'`, the belt's typed reason, `agent_tasks.error_code='internal'`, `recoverable:false`. |
| AC8 C7 list/detail, policy/schedule separate, keyboard + narrow recovery | **done** | The detail route's four tabs; `fixed-asset-detail.test.tsx` (8 cells); walk cells for 320px (no page-wide horizontal scroll), 200% zoom, real tablist arrow-key roving focus, focus return from the Dialog. |
| AC9 the whole state journey in a browser | **done (fix round 1 re-cut two cells)** | `apps/web/e2e/fixed-asset-acquisition-walk.spec.ts` — **8 cells**. Round-1 review measured that the cell titled *"an invalid answer names the dependent CONTROL"* filled a wholly VALID form and that no cell signed in as anyone but the owner. It now submits a residual ABOVE COST (the one invalid answer `particularsReadyToSubmit` cannot gate) and asserts the door's CLR37 `axis:"residual"` renders inside the dialog, the RESIDUAL control takes focus with `aria-invalid="true"`, and the rest of the draft survives; a new cell signs in as a **viewer** (`serve-built.mjs` gained a `viewer@` rank-0 persona) and asserts the door's own CLR04 `insufficient role` renders where the reader is, names no field, and leaves the asset intact. The file covers, on the assigned triple (3260/3261/3262): loading with no zero painted, empty-vs-waiting, invalid/saving with the draft kept, denied under a real viewer session, 320px, 200% zoom, keyboard + focus return, SR names, reduced motion, stable URL/Back, and a preserved draft that never crosses assets. **8 passed (2.4m)** after fix round 1; see the Playwright line under "Commands and counts" for all four runs of this round. |
| AC10 production-facing command under real roles; Workflow durability | **done** | Every db cell drives the production command through a persona; `packages/runtime/tests/fixed-asset-acquisition-e2e.mjs` **PASS** on a real Postgres World (admission barrier, commit, SIGKILL between commit and checkpoint, replay → same asset id, live-authority recheck). **Hosted evidence pending — none exists.** |

**Historical rows: none.** `gh issue view 639 --comments` returns a zero-length comments array and no "Historical obligations" section. **C55.16 / C83.13** (capital-allowance asset *population*) belong to a sibling list and are **not adopted** — they are a tax-output obligation about population, not acquisition.

**Journeys.** **C7** is the build. **C1** is satisfied by the provenance projection only (the coding lane that files the document is #633's; this branch renders the link). **C3** is satisfied by the boundary refusal naming the other door (`p639.refusal.credit_leg` + the sentence on the Acquisition tab). No second intake, no second composer.

## Tests added

| file | what it proves |
|---|---|
| `packages/db/tests/fixed-asset-acquisition.test.mjs` (**21 cells** after fix round 1) + `-fixtures.mjs` + `-preintegration-gate.mjs` | The whole DB half, every assertion through a `humanQuery`/`roleQuery` persona or a real wake credential. Round 1 added `p639.particulars.race` (two `clara_runtime` sessions across a COMMIT barrier), `p639.particulars.replay` (op-key replay + payload conflict) and `p639.correction.co_acquired` (two cost lines, one invoice), and made `p639.refusal.locked_period` seed the closed year it only used to look for. |
| `packages/runtime/tests/fixed-asset-acquisition-unit.test.mjs` (8) | The particulars module; and AC7's CLR40 settlement measured against the deployed classifier. |
| `packages/runtime/tests/fixed-asset-acquisition-e2e.mjs` | The World leg: 5 passes incl. crash-between-commit-and-checkpoint. |
| `apps/web/components/registers/fixed-asset-detail.test.tsx` (**10**), `work-asset-row.test.tsx` (3), `lib/registers/fa-refusal-field.test.ts` (**4**, new), `fixed-assets-keyboard.test.tsx` (+1 axis→focus cell) | Detail render states incl. a pre-0201 database; the Work row's three silent cases; and (fix round 1) the source-document deep link, the co-acquired relation word, the axis→control map and the focus it lands. |
| `apps/web/e2e/fixed-asset-acquisition-walk.spec.ts` + `fixed-asset-mock.mjs` | A new browser lane (spec, mock, `serve-built` hook, ownership declaration). |

### Commands and counts

* `pnpm typecheck` (root) — **exit 0**, `packages/runtime: Done`, `apps/web: Done`.
* `pnpm lint` (root) — **exit 0**, all five workspaces `Done`.
* db battery, verbatim 29-gate `$GATES` from `packages/db/package.json`, over `fixed-asset-acquisition` + `x41-wave-d-a-fa` + `x41-depreciation` + `x42-r7-fa-stamp` + `x41b0-surface` + `x41b2-surface` + `work-journal-post`: **91 tests, 91 pass** at `aecfb34e`; **94 tests, 94 pass, 0 fail, 0 skipped (147s)** after fix round 1's three new cells, on a cluster rebuilt from scratch.
* `operation-census.test.mjs` + `rig-isolation.test.mjs` (no reset flags): **31 tests, 30 pass, 0 fail, 1 skipped** (T19's destructive cell, as designed) — re-run after fix round 1, same counts.
* `packages/runtime` unit: **8/8** (re-run after fix round 1: 8/8). `check-parts-parity.mjs`: **OK**. `check-frozen-workflows.mjs`: **OK — 281 frozen files verified, 51 "use workflow" modules frozen+registered**.
* **Fix round 1 rebuilt the rig cluster from scratch twice** (`mkrig-migrate-wt.ps1`, 904s then 474s): each run drops `rig639`, recreates it and applies `0001 → 0201` with the shipped migration file, then both seeds. The second rebuild's recorded checksum for 0201 equals `sha256` of the file on disk (`7b477abd…`), which is also the pin in `apps/web/tests/firm-scope-db-pins.corpus.ts` — no drift.
* World e2e on `clara_rt_test` (cloned from clara_639, world bootstrapped, nitro built once): **FIXED ASSET ACQUISITION E2E: PASS** — re-run after fix round 1 on the rebuilt rig, **PASS again** (PASS 1+2, 3, 5, 4 all printed, including the live-authority recheck now taken under the firm key-share + membership share locks).
* Playwright `fixed-asset-acquisition-walk` on 3260/3261/3262: **8 passed (2.4m)** after fix round 1 (run 4). Every run of this round is recorded, because round-1 review could not reproduce the original figure: **run 1** (host also carrying a db battery and a rig rebuild) `3 failed, 5 passed (10.1m)`, all three `page.goto: net::ERR_ABORTED` at sign-in with no assertion failing; **run 2** (solo) `1 failed, 7 passed (5.4m)`; **run 3** (that one cell, isolated, idle host) failed again — `page.evaluate: Test timeout of 30000ms exceeded` inside `AxeBuilder.analyze`, so it was the cell's BUDGET, not contention: four full axe scans plus a sign-in do not fit Playwright's 30s default here, and the cell is now `test.slow()` with that measurement beside it; **run 4** (whole file) **8 passed**. The earlier `7 passed (26.3s)` figure is not reproducible on this host and should be read as that day's measurement only.
* Whole `apps/web` suite (`node scripts/run-tests.mjs` from `apps/web`): **3737 tests, 135 suites, 3735 pass, 0 fail, 2 skipped** after fix round 1 (700s on a loaded host); **3730 / 3728 pass** at `aecfb34e` (both skips are the live-Supabase-auth cells, `CLARA_LIVE_SUPABASE_AUTH_URL` not configured). Two earlier runs are recorded under **Unverified**: one contaminated by worktree 654, and one that caught a REAL failure on this branch — `tests/firm-scope-db-pins.test.ts`'s successor census refusing to call 0201 unrelated because its grant loop is dynamic SQL. Reviewed at the corpus's sorted position with the file's own sha256 (`aecfb34e`); that file now runs 22/22.
* `thread-live-clarify.test.tsx` in isolation: **2 tests, 2 pass** (green in the whole-suite runs too — the known load flake did not reproduce).
* Known Windows reds #707 / #693: **not touched, not "fixed"**.

## Docs updated

`packages/db/README.md` (new "fixed-asset acquisition boundary" section under the operation-contract census: objects, grants, the two boundaries, the re-derived caller census) · `packages/db/tests/README.md` (new "Frontier-gated batteries and the focused-run rule") · `packages/runtime/README.md` (new #639 section) · `apps/web/README.md` (application-map Client row) · `CONTEXT.md` (+4 terms: **Fixed asset acquisition**, **Pending particulars**, **Depreciation particulars**, **Dependent particulars question**). `docs/PRD.md` and `docs/ARCHITECTURE.md` untouched.

**Blueprint drift.** `docs/ARCHITECTURE.md` §3.5 / PRD F3's claim that fixed-asset materialisation is intrinsic *because the hook runs at every approve path* is **false as written** and was false from migration 0178 onward — it is true again only because 0201 adds a second, lane-agnostic instrument. Two in-tree sentences say the old thing and **were corrected by test rather than by edit** (a merged migration is immutable): `0041:4528-4529` ("All four approve paths funnel through this function") and `x41-wave-d-a-fa.test.mjs:186` (which counts *functions* containing a literal, not approve paths). `p639.census.approve_paths` now enumerates the paths themselves. The orchestrator decides the blueprint wording.

## Successor contract — `claraWork_v4`

```
tool name:  apply_fixed_asset_particulars          (packages/runtime/lib/fixed-asset-acquisition.ts
                                                    exports APPLY_FIXED_ASSET_PARTICULARS_TOOL)
input:      faParticularsAnswerSchema  — z.object({ …9 keys… }).strict()
              method: z.enum(["straight_line","reducing_balance","none"])            REQUIRED
              start_date: /^\d{4}-\d{2}-\d{2}$/                                      REQUIRED (every method)
              useful_life_months: int>0 | null,  rate_bps: int 1..10000 | null,
              residual_cents: int>=0 | null,     description: 1..200 | null,
              ca_class: 1..64 | null, is_commercial_vehicle: bool|null, is_new: bool|null
part kind:  work_question (open) / work_result (apply) — NO new part kind, NO new
            needs-you row kind, NO WORK_ACCEPTED_PURPOSES widening (no new purpose).
```

1. **Open, after posting.** `clara.open_work_question(p_task => <the run's own task>, p_hook_token => <hook>, p_question => {type:'form', text}, p_fields => FA_PARTICULARS_FIELDS, p_reason => <why>, p_source_ref => {kind:'fixed_asset', asset_id})` → `{question_id, work_id, question_version, expires_at, replayed}`; park on the WDK hook. Runtime-only grant, already in place (0180:686).
2. **Apply, on resume.** Parse with `faParticularsAnswerSchema`; check `localParticularsRefusal(answer, {nonDepreciable, costCents})`; then
   `clara.complete_fixed_asset_particulars_for(p_client, p_asset, p_particulars => particularsFromAnswer(answer), p_op_key, p_obo => <the Work's initiator>)` → `{asset_id, client_id, particulars_complete:true}`. **`clara_runtime` only; no migration needed at the cut.**
3. **Refusal → message.** CLR13 `stale_question` / `expired` / `state_changed` / `basis_changed` (0180's four, from `answer_work_question`); CLR37 `fa_particulars_invalid` + axis → control via `refusalFieldForAxis(details)`; CLR37 `fa_particulars_already_complete`; CLR04 `obo_not_active` / `insufficient_role`; CLR10 `client_inactive` / `client_not_found`; CLR11 `asset_not_found`.
4. **INVARIANT: no second journal.** The acquisition already posted. 0201 tail (T.9) asserts that neither particulars door's body contains the string `journal_entries`, and `p639.question.dependent` asserts the entry count is unmoved across the answer.

## Assumptions made

1. **The `acquisition_document_id` column is write-once at birth, and the READ is the authority.** `clara._tf_fixed_assets_immutable_0017` (0017) refuses any UPDATE outside its post-approval allowlist, and that trigger is **not** in #639's allowed recuts — so a row birthed by `_fa_on_approve` arm 4 (which is every document-lane row) can never be back-filled. The column ships as the brief directs; `_fa_asset_json` / `_fa_acquisition_json` project `coalesce(f.acquisition_document_id, e.document_id)`, and 0201's tail T.7 asserts estate-wide that the copy never disagrees with its authority. `p639.provenance.document_lane` re-measures it on a real filed document.
2. **The correction chain is derived and labelled, never stored.** "No re-link" was taken literally: `history.related` carries `link: 'supersede' | 'source_document' | 'reversed_acquisition_on_same_enrolment'` on every row, the surface renders that word, and a sentence under the table says the relationships are derived from the books rather than stored. The third link is a candidate set (same client, same enrolled cost account, across a reversal boundary), which is why it says so.
3. **0037:3840-3845's pinned FOUR is stale by two in the live catalog.** Measured: the subledger-hook caller set is **six** — 0056's close model added `finalize_close` and `reopen_fiscal_year`. 0201's tail re-derives and re-pins the measured six (DECISIONS §1.4's instruction when a pinned census has moved). The gap map's own list of the four (`_approve_entry_core`, `approve_entry`, `_reverse_entry_core`, `_settle_opening_seed`) was wrong on two names as well.
4. **The `_fa_asset_json` pre-image is 0042's spliced body, not 0041's text.** A first cut of 0201 rebuilt it from `0041:4074-4103` and **silently dropped** 0042 S5.4's split-month advisory and WDB-G10 disposal freeze. Caught by re-measuring, and the recut is now the live `prosrc` at the pinned sha with #639's additions marked; tail T.8 pins all four 0042 markers so it cannot recur unnoticed. `get_fixed_asset`'s pre-image **is** byte-identical to 0041's text — measured, not assumed.
5. **The birth trigger is DEFERRED, per the brief's primary ruling.** The fallback's trigger condition did not fire: the firing order was **measured** on clara_639 (PG 17.11), with the two real names on a scratch relation created in the OPPOSITE order and flushed through `set constraints all immediate` — observed `t_je_fa_acquisition_birth → t_je_fa_movement_belt`. `p639.birth.fire_order` re-measures it on every run.
6. **`WorkAssetRow` reads the register.** It has no new door: 0201 projects `acquisition_entry_id` on every row shape, so the asset a Work created is the row whose acquisition entry is the Work's posted entry. Because that mounts on the shared Work detail page, `serve-built.mjs` gained a generic EMPTY `list_fixed_assets` default after every lane hook — the shape #626's `get_my_preferences` and #634's `list_entry_links` already use, so no foreign lane mock was edited.

## Follow-ups worth filing

* **`fa_cost_adjustment_deferred` should classify as a refusal, not an invariant.** Measured: `claraWork.v3.errors.ts` has no CLR40 row and CLR40 is outside its CLR default list, so every CLR40 — including this one, which the belt itself gives a human remedy for ("reverse the acquisition entry and re-book it at the corrected cost") — settles the Work `failed`/`internal`/not-recoverable. The table lives inside the deploy-locked claraWork v1 closure; the fix is **one row** in the wave's shared `claraWork_v4` errors file. `clr40.cost_adjustment` pins today's behaviour so the next cut changes it deliberately.
* **The belt and the birth disagree about a retired enrolment.** The belt evaluates the enrolment interval at `approved_at` (0041's round-3 fold F5a); arm 4 — and therefore this trigger, which carries arm 4's predicate verbatim — joins only `fp.active`. An entry approved in the same transaction that retires a profile is therefore in the belt's scope and out of the birth's, and is refused CLR40. Pre-existing, unchanged by 0201, and worth a ticket that decides which side moves.
* **The activity-kind ladder still misfiles the acquisition event** (D13: `asset.acquired` reaches `list_activity` through the documents rung). Untouched by ruling; named here as the residual.
* **A firm- or class-level default depreciation policy** would make the "particulars absent" branch rarer. None exists (`fa_account_profiles` carries none); #654 owns firm defaults.

## Merge order (fix round 1, adversarial 639-A3's second half)

0201 lands behind two wave migrations. What it PINS, and whether either predecessor can move it:

| pinned by 0201 | what it is | 0199 (#650) | 0200 (#647) |
|---|---|---|---|
| prestate sha256 of `clara._fa_asset_json(uuid,date)` | the live pre-image (a 0041+0042 splice), measured on the rig | not recut (#650 recuts nothing — DECISIONS §1.3) | not recut |
| prestate sha256 of `clara.get_fixed_asset(uuid)` | the live pre-image | not recut | not recut |
| tail T.5's SIX-name `clara._subledger_on_approve` caller array | `_approve_entry_core`, `_approve_opening_entry`, `approve_wrong_client_correction`, `finalize_close`, `reopen_fiscal_year`, `reverse_entry` | adds no caller | adds no caller (its three recuts are `add_counterparty_alias`, `rename_counterparty`, `set_counterparty_identifiers`) |
| the 20-name `::regprocedure` prerequisite roster | existence only | unaffected | unaffected |

**The authority for the two right-hand columns is DECISIONS §1.3's closed list of wave recuts**, not a reading of
0199/0200 themselves: those files live on branches this worktree may not touch, and neither ticket's final report
was in `reports/` at fix-round time. The pins are the real guard either way — if a predecessor did move one of those
bodies, 0201 REFUSES TO APPLY rather than merging quietly, which is the property they exist for. Re-measured from
scratch in fix round 1: the whole 0001→0201 chain applied on a fresh cluster (194 migrations, exit 0).

### Fix round 1 — named residuals and one shared-file edit for the orchestrator

* **The K-family opening arm of `p639.birth.exclusions` is still belt-only.** The `scheduled_run` arm became
  behavioural (`p639.depreciation.independent` now asserts the register count is unmoved after a real run), but no
  opening-seed fixture exists anywhere under `packages/db/tests` — building one is a lane of its own. 0041 arm 1's
  CLR38 guard plus the `prosrc` belt stay the standing evidence, and the cell now says so.
* **`clara.complete_fixed_asset_particulars_for` still tells an unknown client (CLR11 `client_not_found`) apart from
  another firm's client (CLR04 `obo_not_active`).** The review was right that the comment claiming otherwise was
  false; the comment is corrected and the behaviour kept deliberately — the door is `clara_runtime`-only, takes an
  explicit `p_obo`, and 0195's ladder gives the three failures their own diagnoses so a surface can tell them apart.
  The browser-reachable door (0041:3035) answers CLR11 for both. **If the orchestrator wants the stricter reading,
  it is a successor's job** (folding `obo_not_active` into `client_not_found` changes the runtime refusal map).
* **One shared-file edit beyond a one-line registration:** `apps/web/e2e/serve-built.mjs`'s `caller_context` handler
  gained a `viewer@` rank-0 branch (10 lines, one handler). Its session model knew only `owner@` and `bookkeeper@`,
  and every other email is membership-less — so AC9's *denied* leg could not be driven by a ROLE at all. Flagged
  because twelve lanes are editing that file this wave.
* **The walk's axe cell is `test.slow()`**, with the measurement written beside it (four axe scans + a sign-in do not
  fit the 30s default on this host; it failed that way even on an idle machine, with nothing asserted failing).

## Unverified

* **Hosted evidence: none exists** for any part of this journey, and #631's provider eval is recorded void until #836. Every claim above is **local**.
* **The claraWork_v4 half of AC3 is a contract, not a run.** The human lane is proven end to end (register → detail → Needs-you all converge on `answer_work_question`), and the runtime door is proven under `clara_runtime`; no *run* has yet opened the dependent question, because opening one is a frozen-body act this branch may not cut.
* **The whole-web-suite run at 12:0x on this host was contaminated by worktree 654.** Four failures, all about the settings hub's link count and rank shape — #654's declared subject (it adds a `/settings/knowledge` section) — and the first one's own `location`/`stack` named `C:\Users\zhant\Desktop\clara-wt\654\apps\web\components\firm-admin\firm-admin-pages-a11y.test.tsx`. My worktree's copy of that file passes 5/5 in isolation, the file is byte-identical in both worktrees, and this branch touches no settings file (`git diff --name-only origin/main..HEAD | grep -i settings` → nothing). Recorded as a shared-host artifact of twelve concurrent rigs, not attributable to this branch; the orchestrator may want to know that a whole-suite run is not isolated between worktrees.
* **The `SectionTabs` act() warnings** printed by the existing Work-detail tests are pre-existing and unrelated; the new detail tests produce none.
* ~~No claim is made about `db:migrate` on a from-scratch 0001→0201 chain.~~ **Measured in fix round 1**: the rig cluster `rig639` was dropped and rebuilt and the WHOLE chain re-applied with the edited 0201 — `migrate: 194 new migration(s) applied · 194 total`, `seed: 2 seed file(s) applied`, 904s, exit 0 — so 0201's prestate sha pins (measured against the live pre-image on a fresh chain), its 20-name regprocedure roster and its whole tail (T.1–T.11 plus the new T.9b lock pin) all hold from scratch. The review's own from-scratch chain on `rig639r`/55604 agrees.
