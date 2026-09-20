# Wave 1 · Lane 02 — final report (#851, #858)

**Branch** `riders/w1-lane02` · **worktree** `C:\Users\zhant\Desktop\clara-wt\636` · cut from `origin/main` `dd3f8f1d`.
Nothing pushed, no PR, no GitHub write. Working tree clean.

```
71722f5b fix(web-e2e): #858 the polygon cell asserts on the snapshot its poll resolved on, and THE LADDER gets a budget
c5560a5b fix(web-e2e): #851 fourteen local sign-ins folded onto the shared helper, with a census that holds it
24bc1b50 feat(web-e2e): #851 --no-build on the e2e runner, parsed by a module a cell can reach
```

Both tickets verified live on `main` before building: `#851` and `#858` are OPEN with `ready-for-agent`, and the code matched their briefs at `dd3f8f1d` (`run.mjs` had no `--no-build`; the polygon cell re-read `widths()` after its poll; THE LADDER had no `test.setTimeout`).

---

## #851 — `--no-build` and the sign-in gate — **done**

### AC1 · `e2e -- --no-build <spec>` skips the build; a bare run still builds — **done**

- `apps/web/e2e/run-args.mjs` — the parse as its own pure module, because `run.mjs` spawns a build the moment it is imported and no unit cell could otherwise reach it. `run.mjs` calls it; its two-line hunk is the only change to the file every other lane drives.
- **Byte-compatible default, asserted against the historical expression itself** (re-typed as the test's oracle, never a copied list): `run-args.test.ts` cells 1–2.
- **The flag is consumed, by EXACT equality.** `--no-builds`, `--build` and `no-build` all reach Playwright (cell 5) — a prefix or substring match would silently widen a one-spec gate into the whole suite, the failure #630 recorded for a stray `--`.
- Evidence, test: `node --import ./test/bootstrap.mjs --import tsx --test e2e/run-args.test.ts` → **5 pass / 0 fail**. RED first, for the right reason: against a parser that ignored the flag, **3 pass / 2 fail** — the two `--no-build` cells only.
- Evidence, end to end through pnpm's own argv forwarding: `pnpm --filter @clara/web e2e -- --no-build --list documents-viewer-walk` printed `[e2e] --no-build: reusing the existing .next build, NOT rebuilding @clara/web` and listed that spec's 22 cells; Playwright never saw the flag. Used for real for every repeat run below.

### AC2 · no spec defines a local sign-in outside a named exception list; the cell reds on a synthetic offender — **done**

`apps/web/e2e/sign-in-census.test.ts`, four cells. It reads the login **form** (a Password fill plus the "Sign in" submit, in either the string or the regex spelling) rather than a function name, so a local helper called anything at all is caught and a wrapper that delegates is not.

| List | Entries | Reason recorded in source |
|---|---|---|
| `FORM_EXCEPTIONS` | `entry-faces-walk.spec.ts` | the login face **is** its subject (tab order, focus ring) |
| | `reports-download-walk.spec.ts` | #804's named live-stack file, run by `live-stack/run-reports-download-walk.mjs` with its own real-stack `establishSession` |
| `WRAPPERS` | `chat-parity-walk.spec.ts`, `documents-intake-walk.spec.ts` | idempotency guards — sign in more than once per cell as one persona |
| | `members-invite-walk.spec.ts` | sign-in-and-land; its remaining half is a destination, not a sign-in |

- Cell 3 keeps both lists live: an entry that no longer offends **fails**, so they can shrink but not rot.
- Cell 4 is the permanent vacuity control: the detector is driven over synthetic offenders (string, regex and the variable-then-click shape) and over compliant and sign-up sources.
- **Synthetic offender on a real file** (the AC's own wording): a temporary `zz-synthetic-offender-walk.spec.ts` whose local sign-in is deliberately named `establishSession` — cell 1 red naming it, cells 2–4 green (proving the **form** rule, not the name rule, carries the weight). File removed; `git status` shows no residue.
- Evidence: RED first — the census named **all thirteen** string-spelled offenders and its declaration cell caught a fourteenth. GREEN after the fold: **4 pass / 0 fail**. Registered at the sorted position in `apps/web/test/manifest.txt`; `check-test-manifest` reports 481 files, in order.

### AC3 · every migrated walk stays green — **done, with two known-class flakes recorded**

Fourteen files folded, not the eleven the brief named. `depreciation-walk` and `trade-invoice-walk` are two more of the same shape. **The fourteenth is the one worth reading:** `intake-batch-walk.spec.ts` spelled the same three acts with regex locators (`getByLabel(/password/i)`, `getByRole("button", { name: /sign in/i })`) **and the wrong fixture password** — `"password"`, not `Clara-e2e-password-1!`, which the mock auth server happens not to mind. A gate keyed on the exact string would have called that file clean, which is why the census reads both spellings.

Run on the lane-02 triple (3510/3511/3512), nine other lanes live on this host, all repeats through `--no-build`:

| Run | Result |
|---|---|
| All fourteen, batch 1 | **141 passed, 1 failed (3.8 m)** — `document-correction-walk:386` axe `color-contrast`, 4 nodes, `#6c7575` on `#f5f6f4` at 4.36:1 |
| All fourteen, batch 2 | **141 passed, 1 failed (3.8 m)** — `fixed-asset-acquisition-walk:262` axe `color-contrast`, 4 nodes. `document-correction-walk:386` was **green** (3.5 s) |
| `document-correction-walk` alone | **15 passed (39.5 s)**, the axe cell green in 4.0 s |
| `fixed-asset-acquisition-walk` alone | **8 passed (21.3 s)**, the axe cell green in 4.4 s |

**Not my change, and named rather than waved past.** No cell red twice; a different file each run; both are the flake class `helpers.ts`'s own `settleForScan` header documents and measures (`#727a7a`/`#6b7474`/`#6a7373` on `#f5f6f4` at 4.39–4.49:1 — the resting `--muted-foreground` composited mid `enter-content` fade, never a token). Both files scan through a **local** `settle()` that implements only condition (2) of `settleForScan` (the `getAnimations()` half) and omits condition (1), the `.enter-content`/`.enter-panel` opacity check that is exactly what catches a mount fade. My diff in those two files touches only the sign-in, which completes before the scanned surface is opened. Follow-up filed below.

**One measurement deliberately given up, recorded rather than deleted.** `staff-expense-claim-walk`'s retired copy waited `CELL_BUDGET.base` (30 s) on a measurement dated 2026-09-17 — twelve lanes live, CPU pinned, a sign-in that sat past `CELL_BUDGET.signIn` (20 s). The shared helper waits 20 s and the ticket put the helper's budgets out of scope, so that measurement now sits as a comment at that walk's `beforeEach`. It passed in both batch runs here. If it ever reds on a "Signing in…" deadline, that is the measurement talking. **Corrected after /code-review (spec S4):** `staff-expense-claim-walk` was not the largest surrender. `counterparty-identity-walk`'s retired copy waited **60 s** (`{ timeout: 60_000 }`, verified at `dd3f8f1d`) on its post-login landmark; `staff-expense-claim-walk` and `trade-invoice-walk` waited `CELL_BUDGET.base` (30 s); `knowledge-firm-walk`'s named no timeout at all and fell through to Playwright's 5 s default, so the fold strictly improves that one. The shared helper's 20 s therefore has to absorb a 60 s reduction, not only a 30 s one.

### Out of scope, honoured
The shared helper's own budgets and behaviour are unchanged (`helpers.ts` is untouched in this lane).

---

## #858 — the two timing-flaky cells in `documents-viewer-walk.spec.ts` — **done**

### AC1 · the post-resize assertions read the poll's resolved snapshot — **done**
The poll now captures the snapshot its condition was observed **on** (`resized: OverlayWidths[]`), and the assertions read that. The capture is itself asserted (`toHaveLength(1)`), so a poll that resolved without pushing cannot make the assertions vacuously read an empty array. `OverlayWidths` is named at module scope so the capture has a type.

Two vacuity controls, both restored byte for byte afterwards:

1. **The app.** MAJOR 1 re-introduced in `apps/web/lib/documents/pdf-page-render.ts` (the two inline `canvas.style.width/height` lines) → the cell reds `svg 125.5 vs canvas 240`, `Received: 114.5`. The cell still catches the real defect. `git status` clean on that file afterwards.
2. **The change itself.** The captured snapshot corrupted by +77 px inside the poll → the post-resize assertion reds `after the resize the overlay drifted off the page: svg 669 vs canvas 592`, **`Received: 77`** — i.e. it read the **capture**, not the page. Under the old code that corruption was invisible, because the assertion re-read. This is the control that discriminates the change rather than the cell.

### AC2 · THE LADDER calls `test.setTimeout(cellBudgetMs(...))` sized to its loop — **done**
`cellBudgetMs({ signIns: 1, polls: 6 })` — one sign-in and six sequential document loads, each with a 15 s-shaped wait plus two count assertions and an `innerText` read. The shape the home-board, journal-work, personal-settings and responsive-shell walks already use, and the one `e2e/README.md`'s `CELL_BUDGET` table documents. A budget is a ceiling: the cell still finishes in ~2.7 s.

### AC3 · three consecutive full-suite runs — **partial, recorded as a deviation**
Three consecutive runs of the **file**: **22 passed (59.7 s)**, **22 passed (44.8 s)**, **22 passed (42.8 s)** — polygon cell 2.4/2.3 s, THE LADDER 2.7/2.6 s. Not three whole-suite runs: nine other lanes are working this host, and `e2e/README.md`'s "one worker, one host" rule makes a whole-suite run here evidence about contention rather than about this file. **Not claimed as satisfied.**

### Deliberately left
The cell's **pre-state** `const before = await widths()` is still a direct read after its own polygon-count poll. The ticket names the post-resize read only ("Out of scope: any other cell in the file"), and nothing triggers a reflow between that poll and that read; if it ever were racy it fails loudly (`expect(before).not.toBeNull()`) rather than dereferencing. Observed, not widened.

---

## Gates, with counts (worktree root unless stated)

| Gate | Result |
|---|---|
| `e2e/run-args.test.ts` | 5 pass / 0 fail (RED first: 3/2) |
| `e2e/sign-in-census.test.ts` | 4 pass / 0 fail (RED first: 2/2, naming 13 offenders) |
| Whole `apps/web` unit suite — `node scripts/run-tests.mjs` | **4642 tests, 4640 pass, 0 fail, 2 skipped, 135 suites, 110.6 s**, exit 0 |
| `pnpm typecheck` | clean, exit 0 |
| `pnpm lint` | clean, exit 0 (`check-test-manifest`: 481 files, present exactly once, in order) |
| `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files verified, no manifest diff |
| Browser walks | see the two tables above; all through `pnpm --filter @clara/web e2e` on the lane-02 triple |

`packages/runtime` and `packages/db` untouched, so their gates do not apply. No migration, no frozen body, no successor contract needed.

## Docs updated
- `apps/web/e2e/README.md` — two new sections: "Gating on one spec, and `--no-build` (#630, #851)" and "One sign-in, and the census that holds it (#804, #851)", the latter carrying both exception lists as a table.
- `apps/web/e2e/run-args.mjs`, `sign-in-census.test.ts`, `documents-viewer-walk.spec.ts` — the reasoning lives beside the code in the house shape.
- `apps/web/e2e/firm-setup-walk.spec.ts` — its `CONVERGED` note pointed at "`signInTo` above", which no longer exists; it now points at the shared helper.
- `CONTEXT.md` **not** touched: no new domain vocabulary, only harness mechanics.
- `docs/PRD.md` / `docs/ARCHITECTURE.md` not touched. No blueprint drift.

## Shared files touched, minimally
`apps/web/test/manifest.txt` — two adjacent lines at the sorted position (`e2e/run-args.test.ts`, `e2e/sign-in-census.test.ts`). `apps/web/e2e/e2e-fixture-ownership.test.ts` **not** touched: the new census is its own module rather than a hunk in a file nine lanes are editing.

## Follow-ups worth filing

1. **The `settleForScan` drift, exactly parallel to #851's sign-in drift.** 35 of the 46 spec files that run `AxeBuilder.analyze()` do so without `settleForScan` (48 spec files in the suite -- the "42" in this report's first cut was never the count, corrected after /code-review spec S3); several carry a local `settle()` that implements only its `getAnimations()` half and omits the `.enter-content`/`.enter-panel` opacity check. That missing half is the measured cause of the `color-contrast` mid-fade reds this lane saw twice (`#6c7575` on `#f5f6f4`, 4.36:1) in two different files, and of the three #760 records. The fix is the same shape as this ticket's: fold the local copies onto the shared helper and add a census cell beside `sign-in-census.test.ts` so it cannot come back.
2. **`CELL_BUDGET.signIn` versus the 30 s and 60 s measurements.** Three retired copies waited longer than the shared helper does: `counterparty-identity-walk` **60 s**, `staff-expense-claim-walk` and `trade-invoice-walk` 30 s each, on a measured >20 s sign-in under twelve live lanes. The shared helper waits 20 s and #851 put its budgets out of scope. Either the 20 s figure absorbs that host class — in which case say so with a measurement — or `CELL_BUDGET.signIn` should rise; today the repo holds both claims.
3. **`--no-build` in CI or in the wave recipe.** The flag now makes repeat browser evidence cheap (three runs of one walk cost one build). Worth a line in the wave work order so lanes stop paying five builds for five cold-start runs.

## Unverified
- Hosted evidence: none, and none claimed.
- The 2026-09-15 idle-Mac measurements quoted in #858's ticket are that report's, not re-measured here; what this lane re-measured is the two vacuity controls and the three consecutive runs above.
- `reports-download-walk.spec.ts` and `interview-walk.spec.ts` (the live-stack lane) were not run — they need their own runners and fixtures, and neither was changed.
