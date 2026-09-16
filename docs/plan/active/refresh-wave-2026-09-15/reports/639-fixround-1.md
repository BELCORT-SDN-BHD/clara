# #639 — fix round 1 (round-1 review verdicts applied)

**Branch** `impl/639-asset-acquisition` · worktree `C:\Users\zhant\Desktop\clara-wt\639` · rig `127.0.0.1:55504`/`clara_639`
· reviewed head `aecfb34e` · fix-round commits `37f451a3` (db), `ba637296` (web), `693f8899` (e2e walk).
**The rig cluster was dropped and rebuilt from scratch TWICE this round** (904s, then 474s), so every DB number below
comes from a chain that applied `0001 → 0201` with the shipped migration file — not from a patched database. The
second rebuild's recorded checksum for 0201 equals sha256 of the file on disk and equals the corpus pin
(`7b477abd…`): **no drift**.

## Finding → what I did → evidence

| finding | sev | what I did | evidence |
|---|---|---|---|
| **STANDARDS F1** / **ADV 639-A1** — `p639.refusal.locked_period` never asserts | blocker | The cell **seeds** its closed fiscal year on its own dedicated client (the `w623.post.closed-period` idiom the brief named), asserts the seeding was mandatory *and* that the row really is `status='closed'`; the `noteLane(…) + return` escape is gone. | **RED as shipped:** `--test-name-pattern="locked_period"` → `ok 1` *plus* the note `refusal.locked_period: this client has no fiscal year row — cell recorded, not asserted` — a pass with zero assertions. **RED after the rewrite, year seeded OPEN as a probe:** `not ok 1 … error: 'locked_period: the acquisition is refused'` (`# pass 0 # fail 1`). **GREEN seeded CLOSED:** `ok 1` — CLR19 `write_into_closed_period`, entry/receipt/asset counts unmoved. |
| **SPEC F1** — axis→control never wired into the human door; the "invalid answer" walk cell submitted a *valid* form; no browser cell signed in as anyone but the owner | blocker | Built it. New `apps/web/lib/registers/fa-refusal-field.ts` (a deliberate MIRROR of the runtime map — `apps/web` does not depend on `@clara/runtime`) resolves `details.axis`/`details.field` to the DOM id `FaParticularsFields` already renders; `fa-row-actions.tsx` carries the caller's standing refusal INTO the dialog (it rendered nowhere before — the page banner sits behind the modal backdrop) and names the control; `FaDoorDialog` focuses it and marks it `aria-invalid`. The walk now submits a **residual above cost** — the one invalid answer `particularsReadyToSubmit` cannot gate — and a new cell signs in as a **viewer**. | **RED:** the review's `grep -rn "refusalFieldForAxis\|details.axis" apps/web` → 0 hits; with the focus effect disabled the new jsdom cell never reaches its assertion. **GREEN:** `lib/registers/fa-refusal-field.test.ts` 4/4; `fixed-assets-keyboard.test.tsx`'s new cell (focus on `#fa-complete-a1-residual`, `aria-invalid="true"`, the `60` draft kept); Playwright **run 4: 8 passed (2.4m)** on 3260/3261/3262, including *"an invalid answer names the dependent CONTROL…"* and *"a VIEWER is refused by the door…"*. |
| **STANDARDS F2** — the source document links to the bare Documents tab | should | The href is built with the workbench's own URL state (`documentUrl` + `applyDocumentParam`). | **RED:** `detail.source_document … got /clients/c1/documents`. **GREEN:** `fixed-asset-detail.test.tsx` **10/10**. |
| **ADV 639-A2** — two rows born from ONE invoice each call the other `successor` | should | 0201's `source_document` arm now excludes the row's own acquisition entry and orders **strictly**; siblings get an orderless `co_acquired_on_same_document` / `co_acquired`, rendered "Co-acquired · Same source document, booked together". Type unions, `relationLabels` and two `en.json` keys follow. | **RED** against the pre-edit function: `p639.correction.co_acquired` → `actual 'source_document'`. **GREEN** after the recut, in both directions; `detail.co_acquired` pins that the surface never prints "Successor" for a sibling. |
| **ADV 639-A3** — no raced cell, no merge-order table | should | `p639.particulars.race` (two `clara_runtime` sessions; session 2 enters while session 1 holds the locks, barrier released by session 1's COMMIT) and `p639.particulars.replay` (same key + same args → identical receipt; same key + different args → CLR10). A **merge-order table** is now in `639-final.md`. | Measured: session 2 → CLR37 `fa_particulars_already_complete`; the register carries the winner's `useful_life_months=60`, not the loser's `36`; journal count unmoved. Replay: identical receipt, still `48` after the refused conflict. |
| **ADV 639-A6** — the live authority read takes no lock | note | `perform 1 from clara.firms … for key share`, then the membership select `for share` — the pair `0195:1792-1797` measured against `set_member_role`'s `for update`. New tail **T.9b** pins both by their *executable* text (a comment alone cannot satisfy it). | The whole chain re-applied from scratch with T.9b in it (`194 total`, exit 0); `p639.particulars.for_overload`, `.race` and World e2e **PASS 5** all still refuse a demoted initiator by name. |
| **ADV 639-A4** — the "NO ORACLE" comment is false | note | Corrected the **comment** (and `packages/db/README.md`); kept the behaviour, with the reason written down. | See "deliberately left" below. |
| **ADV 639-A5** — only two of four exclusions are behavioural | note (partly applied) | The `scheduled_run` arm is now behavioural inside `p639.depreciation.independent`: after a real depreciation period posts through the production run, `assetCountOf(client)` is unmoved. The K-family opening arm stays belt-only, by name. | See "deliberately left". |
| **SPEC F2** — the walk hangs / `7 passed` not reproducible | note | Ran it four times and report all four. | **Run 1** (host also carrying a db battery + a rig rebuild): `3 failed, 5 passed (10.1m)` — all three `page.goto: net::ERR_ABORTED` at sign-in, nothing asserted failed. **Run 2** (solo): `1 failed, 7 passed (5.4m)`. **Run 3** (that one cell, isolated, idle host): failed again — `page.evaluate: Test timeout of 30000ms exceeded` inside `AxeBuilder.analyze`. So it is **not** contention: four full axe scans plus a sign-in do not fit the 30s default here. `test.slow()`, with the measurement beside it. **Run 4** (whole file): **8 passed (2.4m)**. |
| **ADV 639-A7** — the review rig is left running | note | No branch action; `rig639r`/55604 untouched. I rebuilt my own cluster instead, which is the stronger prestate. | `mkrig-migrate-wt.ps1` → `migrate: 194 new migration(s) applied · 194 total`, `seed: 2 seed file(s) applied`, exit 0 (twice). |

## Commands and counts (all re-run this round)

| command | result |
|---|---|
| `pnpm typecheck` (root) | **exit 0** — `packages/runtime: Done`, `apps/web: Done` |
| `pnpm lint` (root) | **exit 0** (the first pass caught two of my own: an unused `w` in the race cell, and a lint rule reading `#639` in a jsdom test *title* as a 3-digit hex colour — both fixed) |
| db battery, verbatim 29-gate `$GATES`, 7 files | **94 tests, 94 pass, 0 fail, 0 skipped** (147s) — was 91/91; +3 new cells |
| `operation-census` + `rig-isolation` (no reset flags) | **31 tests, 30 pass, 0 fail, 1 skipped** (T19 destructive, by design) |
| `packages/runtime` unit | **8 tests, 8 pass** |
| World e2e on `clara_rt_test` (re-cloned + bootstrapped after the rebuild) | **FIXED ASSET ACQUISITION E2E: PASS** (PASS 1+2, 3, 5, 4) |
| `check-frozen-workflows.mjs` | **OK — 281 frozen files, 51 "use workflow" modules frozen+registered** |
| `check-parts-parity.mjs` | **OK — reader ⊇ emittable** |
| Playwright `fixed-asset-acquisition-walk` (3260/3261/3262) | **8 passed (2.4m)** on run 4; runs 1–3 recorded above |
| whole `apps/web` unit suite (`node scripts/run-tests.mjs`) | **3737 tests, 135 suites, 3735 pass, 0 fail, 2 skipped** (the two live-Supabase-auth cells) |
| `pnpm db:migrate` from scratch | **194 new migration(s) applied · 194 total**, `2 seed file(s) applied`, exit 0 — twice |

**One real defect I introduced and caught before it shipped:** the first cut of the co-acquired arm referenced
`ge.id`, a column the history lateral does not project — `column ge.id does not exist` took down four cells
(`p639.provenance.document`, `.document_lane`, `p639.read.acquisition_block`, `p639.question.dependent`) on the first
post-rebuild battery. Fixed to `g.acquisition_entry_id`, verified against the live function, and the cluster was
rebuilt a second time so the shipped file is the applied file.

## What I deliberately left

1. **ADV 639-A4 — the door keeps three distinguishable diagnoses.** The measurement is right (an unknown uuid answers
   CLR11 `client_not_found`, another firm's real client CLR04 `obo_not_active`); the **comment** claiming otherwise is
   corrected. I did not change the behaviour: this door is granted to `clara_runtime` only, it names an explicit
   `p_obo`, and 0195's commit-time ladder deliberately separates "the client is gone" / "the human who asked is gone"
   / "they are no longer allowed". Folding them together rewrites the runtime refusal map for a door no browser can
   reach, while the browser-reachable door (`clara.complete_fixed_asset_particulars`, 0041:3035) already answers
   CLR11 for both. **Orchestrator call if the stricter reading is wanted.**
2. **ADV 639-A5 — the K-family opening arm stays belt-only.** No opening-seed fixture exists anywhere under
   `packages/db/tests`, so that arm is a lane of its own rather than a cell; 0041 arm 1's CLR38 guard plus the
   `prosrc` belt remain the standing evidence, and the cell now says so in writing.
3. **The axe cell's budget, not its assertions.** `test.slow()` was the minimum honest change: nothing asserted was
   relaxed and no timeout inside an assertion was raised.

## Ratification requested

* **One shared-file edit beyond a one-line registration.** `apps/web/e2e/serve-built.mjs`'s `caller_context` handler
  gained a `viewer@` rank-0 branch (10 lines, one handler). Its session model knew only `owner@` and `bookkeeper@`,
  and every other email is membership-less and never reaches a client surface — so AC9's *denied* leg could not be
  driven by a role at all. Twelve lanes are editing that file this wave; the orchestrator may prefer to carry this
  hunk itself at integration.
* **`apps/web/test/domInspect.ts` gained `document.getElementById`** (additively, that file's own stated pattern).
  Production code addressing a control the ordinary way was previously untestable in the stub DOM — it threw. The
  dialog guards the call anyway, so a harness without the capability degrades to "no focus move".

## Files this round touched

`packages/db/migrations/0201_fixed_asset_acquisition.sql` · `packages/db/tests/fixed-asset-acquisition.test.mjs` ·
`packages/db/tests/fixed-asset-acquisition-fixtures.mjs` · `packages/db/README.md` ·
`apps/web/tests/firm-scope-db-pins.corpus.ts` (sha re-pin) · `apps/web/components/registers/FaDoorDialog.tsx` ·
`fa-row-actions.tsx` · `fixed-asset-detail.tsx` (+ `.test.tsx`) · `fixed-assets-register.tsx` ·
`fixed-assets-keyboard.test.tsx` · `apps/web/lib/registers/fa-refusal-field.ts` (+ `.test.ts`, new) ·
`apps/web/lib/registers/fixed-assets.ts` · `apps/web/messages/en.json` (2 keys) · `apps/web/test/manifest.txt` ·
`apps/web/test/domInspect.ts` · `apps/web/e2e/fixed-asset-acquisition-walk.spec.ts` · `fixed-asset-mock.mjs` ·
`serve-built.mjs`. `reports/639-final.md` is updated in place (AC2/AC4/AC7/AC9 rows, counts, merge-order table,
fix-round residuals); this file is not committed.
