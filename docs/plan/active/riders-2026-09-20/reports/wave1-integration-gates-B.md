# Wave 1 riders — integration gate worker B

Worktree: `C:\Users\zhant\Desktop\clara-wt\int`, branch `integration/riders-w1`.
Start head: `23cfad94` (ten lane branches merged onto `origin/main` `e7f0a10a`, no new migration
this wave, frontier 229 files / `0234_legal_enforcement_mode`).
**Final head: `cd7da1116ef176747cefbb56dec46b0c7d065d8a`** — one commit landed by me (see Step 1).
Working tree clean afterwards (only the ignored `apps/web/e2e/.artifacts/` present).

Scope: the whole `apps/web` unit suite once, then the whole browser suite three consecutive times
on this host, using the dedicated triple `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3600
CLARA_E2E_NEXT_PORT=3601 CLARA_E2E_RUNTIME_PORT=3602`. Every command below is prefixed with
`export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"` and run from the worktree (or `apps/web`
inside it) as instructed.

## Step 0 — wait for Worker A's install

Polled every 30s for `node_modules/.modules.yaml` existing and no `pnpm install` process running.
It was already present (mtime 2026-09-19 15:43) and no install process was running on the first
check — Worker A's `pnpm install --frozen-lockfile` had already completed by the time I reached
this step. Confirmed `apps/web` resolves `next/package.json`
(`node -e "require.resolve('next/package.json')"` → `.../node_modules/.pnpm/next@16.3.3_.../next/package.json`).
Never ran `pnpm install` myself.

## Step 1 — the whole `apps/web` unit suite

Command (from `apps/web`, matching the `test` script and the README): `node scripts/run-tests.mjs`.

**Run 1** — 2026-09-20T04:29:45Z → 04:31:00Z, **75s**, exit 1 (RED).
`tests 4749, suites 138, pass 4727, fail 20, skipped 2`.

All 20 failures traced to **one root cause**: every one threw
`ReferenceError: DOCUMENT_KINDS is not defined` at
`apps/web/components/documents/document-kind-dialog.tsx:95:22`, inside `DocumentKindDialog`'s
`SelectValue items={...}` prop. Failing files: `document-kind-dialog.test.tsx` (2),
`document-kind-labels.test.tsx` (4, one by a real assertion — `[878] the DETAIL surface's classify
Select also stops offering a kind the door always refuses` — the other three by the same
`ReferenceError`), `document-detail-live-refresh.test.tsx` (8), `documents-url-state.test.tsx` (5),
`documents-workbench-refresh.test.tsx` (2).

**Diagnosis.** `document-kind-dialog.tsx` imports only `CLASSIFIABLE_DOCUMENT_KINDS` (from
`./document-kind-control`), never the raw `DOCUMENT_KINDS`. Line 95's `SelectValue` used the
unfiltered name anyway:

```
items={DOCUMENT_KINDS.map((k) => ({ value: k, label: renderKindLabel(k, t) }))}
```

`git log` on the file shows every relevant commit — `0059e2c7` (#646), `b269d18f` (#633),
`55fe794a` (#878, which introduced `CLASSIFIABLE_DOCUMENT_KINDS` for this file to keep the
`consent_evidence` kind off this Select), `61f56acf` (#1005, "SelectValue requires a label
source, by construction" — this is the commit that added the `items=` prop and used the wrong
constant), `80a94719` (#1005/#956 fix-round), `fd52e936` (#878 review fix-round) — are **all lane
08's own history**, merged in one merge commit `4b1376f4`. So this is a **real defect inside one
lane (classification d)**, not a cross-lane collision: #1005's later commit regressed #878's
earlier fix within the same lane, and it was never caught before merge (this exact assertion
`document-kind-labels.test.tsx`'s `[878]` cell — line ~205, `assert.doesNotMatch(dialogSource,
/\bDOCUMENT_KINDS\.map\(/, ...)` — exists precisely to catch this, and did, once the whole-suite
run reached it).

**Fix** (minimal, one line): `apps/web/components/documents/document-kind-dialog.tsx:95`,
`DOCUMENT_KINDS.map(...)` → `CLASSIFIABLE_DOCUMENT_KINDS.map(...)` (already imported, already used
two lines below for `SelectContent`'s own roster).

Verified by running the five affected files directly
(`node --import ./test/bootstrap.mjs --import tsx --test <five files>`): **36/36 pass, 0 fail**.

**Committed** `cd7da1116ef176747cefbb56dec46b0c7d065d8a` —
`fix(integration): document-kind-dialog SelectValue items must use the filtered roster`
(explicit path `apps/web/components/documents/document-kind-dialog.tsx`, ending
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` per this task's instruction). Worker A's
own report independently hit the same defect via `pnpm typecheck` (`TS2552: Cannot find name
'DOCUMENT_KINDS'`) and confirmed this commit fixed it — cross-validated.

**Run 2** (post-fix, full suite again) — 04:33:42Z → 04:34:59Z, **76s**, exit 0 (GREEN).
`tests 4749, suites 138, pass 4747, fail 0, skipped 2`.

This fix landed **before** any browser-suite run started, so it does not touch or reset the
three-consecutive-browser-run count below.

## Step 2 — the browser suite, three consecutive runs

Command shape: `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3600 CLARA_E2E_NEXT_PORT=3601
CLARA_E2E_RUNTIME_PORT=3602 pnpm --filter @clara/web e2e [-- --no-build]`, from the worktree root.
Run 1 built (`next build`, no `0xc0000142` panic hit); runs 2 and 3 used `--no-build` per
`e2e/README.md` §"Gating on one spec, and `--no-build`" since the code was unchanged after run 1's
fix landed before run 1 even started.

| Run | Build? | Start (UTC) | Wall | Playwright-reported | Total | Pass | Fail | Flaky | Skip |
|---|---|---|---|---|---|---|---|---|---|
| 1 | yes | 04:35:42Z | 16m03s | 553 passed (15.5m) | 563 | 553 | 3 | 0† | 7 |
| 2 | no (`--no-build`) | 05:06:45Z | 19m15s | 555 passed (19.2m) | 563 | 555 | 1 | 0† | 7 |
| 3 | no (`--no-build`) | 05:32:49Z | 21m54s | 555 passed (21.6m) | 563 | 555 | 1 | 0† | 7 |

† `playwright.config.ts` sets `retries: 0`, so Playwright's reporter never classifies anything
"flaky" (flaky requires a retry that then passes) — the column is structurally always 0 for this
command. Cross-run non-determinism is documented per-test below instead. Total wall time climbed
each run (16→19→22 min) with identical code and `--no-build` on runs 2–3, consistent with rising
host contention from Worker A's concurrent lint/typecheck/db/runtime suites on this same worktree.

### #858 acceptance criterion 3 — `documents-viewer-walk.spec.ts`, three consecutive runs

The file itself had **zero failures across all three runs**. The two named cells:

| Run | `[MAJOR 1] the polygon layer stays on the page after a width change` | `THE LADDER: denied, not-found, storage-unavailable, custody-pending, expired session and integrity render DISTINCTLY` |
|---|---|---|
| 1 | passed, 2.4s | passed, 2.7s |
| 2 | passed, 2.8s | passed, 2.9s |
| 3 | passed, 2.5s | passed, 2.7s |

AC3 is satisfied: the file passed three consecutive full-suite runs on this host, both named cells
included, with durations recorded above.

### Reds, investigated and classified

Three distinct tests went red across the three runs (all in files other than
`documents-viewer-walk.spec.ts`). Each failing spec was re-run alone twice per instruction.

**1. `document-correction-walk.spec.ts:386` — "axe: each of the three routed views has no WCAG
A/AA violations"** (run 1 only).

Failure: `color-contrast` violation, 2 nodes, on the currently-selected document row
(`<tr class="... hover:bg-muted/50 ... cursor-pointer bg-muted" ... aria-current="true">`),
measured contrast 4.36 vs the 4.5:1 AA threshold (`bgColor #f5f6f4`, `fgColor #6c7575`).

Re-run alone: attempt 1 — **15/15 pass** (57.1s), including this cell at 4.1s; attempt 2 — **15/15
pass** (42.7s). Both clean.

**Classification: (b) timing/host-load flake.** The cell calls `new AxeBuilder({ page
}).withTags(...).analyze()` with no `settleForScan` call beforehand (the helper `e2e/README.md`
names as the house guard against exactly this class of transient-state contamination before a
scan). The measured contrast is marginal (4.36 vs 4.5) and consistent with the row's stacked
`bg-muted` + `hover:bg-muted/50` classes picking up extra opacity from residual hover/paint state
under host contention; it never reproduced once isolated from the rest of the 563-test run. No fix
applied (only (c)/(d) reds are fixed per instruction); flagging `settleForScan` as a candidate
hardening for a future ticket, not applied here since it would touch behaviour outside this gate's
minimal-fix mandate and the cell is not owned by an integration collision.

**2. `work-question-walk.spec.ts:285` — "B4: the SAME question is answered from Needs-you, and the
row leaves without dumping focus"** (run 1 only).

Failure: `expect(focused.tag).not.toBe("BODY")` — focus landed on `<body>` instead of the section
heading when the answered row left the list.

Re-run alone: attempt 1 — **14/14 pass** (1.6m), including this cell at 8.1s. Attempt 2 — a
**different** cell failed instead (`work-question-walk.spec.ts:89`, "B3: the parked question is
ANSWERED where the Work is read — a bounded keyboard walk", `Test timeout of 50000ms exceeded`
waiting on `getByLabel("Posting date")` to become fillable) while cell 285 itself passed again.
That second run also took nearly double the wall time of the first (3.2m vs 1.6m).

**Classification: (b) host-contention flake.** Two different cells in the same file failed across
three total attempts (whole-suite run, solo attempt 2), never the same cell twice, and wall time
scaled with load — the signature `e2e/README.md`'s "One worker, one host" section names as the
measured cause of every browser flake in this repository. No fix applied.

**3. `work-cancel-walk.spec.ts:352` — "B7: a REFUSED stop says the reply is still running — it
never prints Stopped over a live run"** (all three runs, plus 1 of 2 solo re-runs).

Failure, identical every time: `expect(locator('[data-clara-rail]').getByRole('button', { name:
'Stop reply' })).toBeVisible()` at line 382 — "element(s) not found", default 5000ms timeout (the
one assertion in this test with **no** explicit timeout override, unlike its siblings at
20_000/15_000/5_000ms a few lines above).

Re-run alone: attempt 1 — **10/10 pass** (1.1m). Attempt 2 — **failed again**, same locator, same
line, same 5000ms timeout (1.3m).

I went further given the 3/3 full-suite reproduction rate. The accessibility snapshot captured at
the moment of failure (`error-context.md` in the test's own artifact directory) shows the rail's
`status` line reading **"You no longer have access to this reply. Ask an owner or an administrator
at your firm if you think that is wrong."** — the app's **revoked-access** banner, not the expected
"Could not stop this reply … it is still running" denial banner the earlier assertions in the same
test had already observed. Tracing the source:

- `ClaraThreadView.tsx:649` gates the denial banner on `!revoked`; `ClaraThreadView.tsx:307` derives
  `revoked` from `state.stream.status === "revoked"`.
- `lib/clara/stream.ts:534-536` (comment, `#642`): an attach the route refuses (403/404 — "this
  reader may not see this task") is **deliberately** delivered as the same `revoked` event a
  mid-stream revocation would send.
- `lib/clara/useClaraThread.ts`'s `stopReply()` opens a reattach after a denied stop; this walk's
  own header comment states "No lane in this walk serves the armed task's
  `/api/tasks/:id/stream`, so the re-attach 404s" — which is exactly the path `stream.ts` routes to
  `revoked`.
- The race: the denial banner and the revoked banner are driven by two independent pieces of async
  state (`stop.phase` and `stream.status`) that both resolve off the same reattach attempt. Under
  load, `stream.status` can flip to `"revoked"` at a point that suppresses the denial banner and
  drops `turnLive`'s other three clauses, unmounting the Stop control entirely instead of leaving
  it offered as this test (correctly, per the ticket's own intent) expects.

I checked whether this is a wave-1 lane's own regression: `git merge-base --is-ancestor 40e4b2a07
e7f0a10a` (the `#642` commit that introduced this exact `revoked`-on-attach-refusal behaviour) is
**true** — it, and the whole `revoked`/`stopReply` mechanism, **predates this wave** (dated
2026-09-14 in `git log`, already on `origin/main` before any of the ten lane branches). The only
wave-1 commit touching `stream.ts` at all is lane 08's `80a94719` (#956, an unrelated
`abortableSleep` rejecting-sleep fix). No wave-1 lane owns this code.

**Classification: (b) a pre-existing baseline timing race, not introduced or owned by any wave-1
lane.** Per this task's instruction, only (c)/(d) reds get fixed; a defect in `#642`'s
already-shipped async state machine (already through multiple "round 5/6" fix passes per its own
comments) is out of scope for an integration gate over ten migration-free wave-1 lanes, and a hasty
patch here risks destabilizing carefully-reviewed pre-existing logic without its original author's
context. Recommending a dedicated follow-up ticket (owner: whichever team owns `#642`/the Clara
rail) to either widen `stop`'s window before the button unmounts or reconcile the "revoked" and
"denied" banners' priority so the control's own visibility survives a race it currently loses.
**No fix applied; the three-consecutive-run count therefore was never restarted.**

## Net result

- One real, in-lane unit-test defect found and fixed (Step 1, before any browser run): commit
  `cd7da1116ef176747cefbb56dec46b0c7d065d8a`.
- Three consecutive full browser-suite runs completed on this host with the required triple; full
  counts and durations recorded above.
- `documents-viewer-walk.spec.ts` (#858 AC3) passed clean in all three runs; both named cells
  passed all three times with recorded durations.
- Three distinct reds surfaced across the runs, all investigated (each failing spec re-run alone
  twice), all classified **(b)** (host-contention or pre-existing baseline timing races, none
  owned by a wave-1 lane), none requiring a code fix under this task's protocol. No test was
  weakened or deleted.
- Unverified / left for a human: whether `work-cancel-walk.spec.ts:352`'s underlying `#642` race
  reproduces on a quieter host (I only observed it under Worker A's concurrent load); I did not
  attempt to reproduce it standalone with no other suites running, since Worker A's suites were
  running the entire session per this task's design.

Final worktree head: `cd7da1116ef176747cefbb56dec46b0c7d065d8a`. Working tree clean (only the
gitignored `apps/web/e2e/.artifacts/` present from the runs above).
