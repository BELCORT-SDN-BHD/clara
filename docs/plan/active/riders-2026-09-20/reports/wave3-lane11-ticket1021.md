# Wave 3 · lane 11 · ticket #1021 — the [633] unsettled-receipt cell's settle budget

**`documents-workbench-refresh.test.tsx`'s `"[633]: an UNSETTLED receipt keeps a bounded watch and
says so; the poll's budget is finite"` cell no longer advances a fixed count of settle hops; it
waits, on a real deadline, until the read count goes and stays flat.** Status: **done**.

| | |
|---|---|
| Worktree / branch | `C:\Users\zhant\Desktop\clara-wt\int` · `riders/w3-lane11` |
| Base | `ffe63a0dd084e99b84c1368119845be273c421ce` |
| HEAD at report | `44bf4a07d` |
| Database | none used — lane 11 is web-only, and this ticket needed none (confirmed: no `packages/db` file read or written) |
| Migration | **none**, as the prompt expected. No schema or function change, no prestate pins, no rig-meta cohort, no gate-chain entry. |
| Playwright triple | `https://127.0.0.1:3600` / `3601` / `3602` — not exercised: no browser walk touches this cell |

## Commits (`git log --oneline ffe63a0d..HEAD`, this ticket's own commit only)

```
44bf4a07d test(web): #1021 the [633] unsettled-receipt cell settles by deadline, not a fixed hop count
```

(Earlier commits on the branch — `dc7118bb9` … `3fbdb294c` — are #897 and #1024, already landed by
earlier implementers in this lane; unchanged by this ticket.)

Working tree clean after the commit. Nothing pushed, no PR, no GitHub write, no other worktree
touched.

## The ticket was live on this branch — verified before building

- `gh issue view 1021 --repo BELCORT-SDN-BHD/clara --json title,body,comments,labels,state` →
  **0 comments**, `state: OPEN`, labels `bug, ready-for-agent`. The newest (and only) Agent Brief is
  the issue body; there is no 2026-09-20 ruling comment to obey or be overruled by.
- The defect the brief names was present at `ffe63a0d` and unchanged through `#1024`/`#897`'s
  commits (neither touches `apps/web/components/documents/`): the cell read
  `for (let i = 0; i < 40; i++) await h.settle();` then asserted on the grown read count — exactly
  the "fixed, fairly high number of settle-cycle iterations" the brief describes. **Not already
  satisfied.**
- The brief's own citation checked out: `docs/plan/active/riders-2026-09-20/reports/wave1-lane08-final.md`
  and `apps/web/README.md`'s own "#875 — poll-bound test-budget audit" section (lines 1350-1358 at
  the time I read it) both record the same finding — a 1-in-5 failure under a whole-suite run,
  named there as a follow-up "out of #875's stated scope" — which is this ticket.

## Seams I tested at (written before the first change, per work-order rule 4)

This is a test-only ticket (the brief says so explicitly: "the poll's own configured delay/tick
behavior under test: unchanged"). There is no new production seam. The one seam in play is the
existing one this cell already tests at, unchanged by this ticket:

1. **The workbench's read surface, counted by relation, through the mocked network boundary** —
   `receiptFetch`'s `document_intakes_visible` counter, observed through `DocumentsWorkbench` (real
   component, real `useSettlePoll`) via `renderComponent`/`h.settle()`. File:
   `apps/web/components/documents/documents-workbench-refresh.test.tsx`. What changed is only the
   MECHANISM the test uses to decide when enough real time has passed to read that counter
   honestly — never the counter, the component, or the poll itself.

No test was written at a seam the brief does not give me, and no seam elsewhere in the file was
touched.

## What changed

`apps/web/components/documents/documents-workbench-refresh.test.tsx` only, +37/-2 lines:

- New local helper `settleUntilQuiet(h, countOf, label)`: repeatedly calls `h.settle()` until
  `countOf()` has held flat for a real 300 ms wall-clock window, bounded by a 10 s deadline (throws
  if the deadline passes first). This is the `document-detail-live-refresh.test.tsx` (#904)
  `settleUntil` idiom — already established in this codebase for exactly this class of flake —
  adapted from "wait for a condition to become true" to "wait for no more reads to arrive", because
  `intake-receipts.tsx` gives this cell no other externally visible signal that
  `use-settle-poll.ts`'s tick ceiling (`DEFAULT_MAX_TICKS = 12`) was reached: the watermark text and
  the manual-Refresh button read identically whether the poll is still ticking or already exhausted
  (an unsettled row keeps `load.unsettled > 0` true throughout, and `exhausted || load.unsettled > 0`
  is the button's whole condition).
- The target cell's `for (let i = 0; i < 40; i++) await h.settle();` is replaced with
  `const settled = await settleUntilQuiet(h, () => counts.document_intakes_visible ?? 0, …)`, and
  `grew` is computed from `settled - mount` instead of a post-loop read.
- Nothing else in the cell changed: the three assertions (`grew > 0`, `grew <= 12`, the
  `receipts-refresh` control) are byte-identical to before.
- `lib/documents/use-settle-poll.ts` (the poll itself) is untouched, as the brief requires.

## Acceptance criteria, each with its evidence

**AC1 — the cell passes reliably (no flake) across repeated runs of the full `apps/web` unit suite
under realistic concurrent load. DONE, evidenced by one full-load run (see "unverified" for what a
single run cannot prove).**

Whole suite, from `apps/web`, `node scripts/run-tests.mjs` (541 files, `node --test`'s own default
concurrency — the same shared-timer-queue condition the brief and the #875 follow-up finding
describe): **4861 tests, 139 suites, 4859 pass, 0 fail, 2 skipped, 135.6 s**. The target cell:
`ok 657 - [633]: an UNSETTLED receipt keeps a bounded watch and says so; the poll's budget is
finite`. The 2 skips are the pre-existing live-Supabase-auth cells (`CLARA_LIVE_SUPABASE_AUTH_URL`
not configured), unrelated to this file.

I could not run "repeated" (N>1) whole-suite passes inside this session's time budget — a single
pass is ~2.3 minutes and the report is due promptly. See "Anything unverified" below; this is
reported as a gap, not papered over.

**AC2 — the cell still fails if the poll's bound is removed or widened (the fix does not turn the
assertion vacuous). DONE.**

Vacuity control (work-order rule 4, "a ticket whose whole deliverable is a test still needs the
vacuity control"): with the target cell's third argument to `withReceipts` temporarily changed to
`{ baseDelayMs: 0, maxDelayMs: 0, maxTicks: 1000 }` (bound widened ~83x) and nothing else touched,
the isolated file run went from 9/9 to **8 pass, 1 fail** — the target cell failed with
`timed out waiting for the unsettled receipts poll to spend its whole tick budget and stop to go
quiet` (10 s deadline hit; 1000 ticks at zero delay do not finish, and reach quiescence, inside that
window). The change was then reverted; `git diff` against the landed commit shows byte-identical
restoration (confirmed below).

I did not additionally test the "bound removed entirely" case (`maxTicks: Infinity`) as a second
run — the widened-bound run already demonstrates the helper's failure path (a thrown timeout, not a
silent pass), and an unbounded case would only exercise the same code path for longer. Noted rather
than silently skipped.

**AC3 — no other cell in the same file regresses. DONE.**

- Isolated file run before any change (baseline): `node --import ./test/bootstrap.mjs --import tsx
  --test components/documents/documents-workbench-refresh.test.tsx` → **9 tests, 9 pass, 0 fail**.
- Isolated file run after the fix: **9 tests, 9 pass, 0 fail** (target cell duration dropped from
  1401 ms to 759 ms).
- Isolated file run during the vacuity check (bound widened): **8 pass, 1 fail** — only the target
  cell, every other cell in the file still green.
- Isolated file run after reverting the vacuity check: **9 tests, 9 pass, 0 fail** again.
- Whole-suite run (above): 4859/4861 pass, 0 fail — no regression anywhere else in `apps/web`.

## Vacuity control — restoration evidence

```
$ git diff apps/web/components/documents/documents-workbench-refresh.test.tsx
```
against the landed commit shows only the intended hunk (the `settleUntilQuiet` helper plus the
three-line change inside the target cell) — no `maxTicks: 1000` third argument remains anywhere in
the file. `git status --porcelain` was clean before the commit.

## Gates, with counts (all at HEAD `44bf4a07d`)

| gate | command | result |
|---|---|---|
| touched test file, isolated | `node --import ./test/bootstrap.mjs --import tsx --test components/documents/documents-workbench-refresh.test.tsx` | **9 tests, 9 pass, 0 fail** |
| whole web unit suite | `node scripts/run-tests.mjs` (from `apps/web`) | **4861 tests, 139 suites, 4859 pass, 0 fail, 2 skipped** (pre-existing), 135.6 s |
| typecheck | `pnpm typecheck` | exit 0 (apps/web + packages/runtime) |
| lint | `pnpm lint` | exit 0 |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | exit 0 |
| frozen closures | `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files, no manifest diff |

Not run, and why: `operation-census.test.mjs` / `rig-isolation.test.mjs` (no `packages/db` file
touched, no SQL function added, and the lane has no database for this ticket); migration gate chain
(no migration); `check-parts-parity.mjs` (no `packages/runtime` file touched); any browser walk (no
`e2e/` file touched — this ticket is a pure `apps/web` unit-test timing fix with no production
behaviour change, so no walk exercises it).

Known Windows-only reds from `RIG.md`: none hit. `thread-live-clarify.test.tsx` (the documented
load-flake cell) passed inside the whole-suite run.

## Docs

- `apps/web/README.md` — new section **"#1021 — the [633] unsettled-receipt cell's settle budget,
  fixed to a deadline"**, placed directly after the existing "#875 — poll-bound test-budget audit"
  section (which is where the finding this ticket resolves was originally recorded, as "a follow-up
  worth filing"). States what changed, why, and the vacuity-check result. In the same commit as the
  test change.
- `CONTEXT.md` — not touched. No new domain vocabulary; `settleUntilQuiet` is a test-harness
  mechanism, not a product or accounting concept.
- `apps/web/messages/en.json` and `apps/web/test/manifest.txt` — not touched: no new copy, and the
  test file is not new (already listed in the manifest).

## Successor contract

**None is owed.** No door, zod input, argument order, refusal mapping, part kind or prompt stanza
changed. Nothing a frozen chat body or a frozen Work tool consumes changed —
`node scripts/check-frozen-workflows.mjs` shows no manifest diff, and the whole change is one test
file plus its README note.

## Follow-ups worth filing

1. **Two neighbouring cells in the same file share the fixed-count shape, at lower risk.** `"[633]
   fix round: a tick re-reads the MASKED VIEW ALONE …"` and `"[633] fix round: the three slow reads
   ARE paid again …"` both still use `for (let i = 0; i < 40; i++) await h.settle();` against
   `WIDE_POLL` (`maxTicks: 60`). Their own assertions only require `ticks > 0` (at least one tick),
   not that the poll's ceiling was reached, so they do not carry this ticket's specific failure mode
   (needing the FULL budget spent inside a fixed hop count) — but they are the same general shape a
   future host-contention run could still flag. Named out of scope here (the brief scopes this
   ticket to the one cell and explicitly separates it from "a different class of poll-budget
   vacuity in this same file"); worth a look if either ever flakes.
2. **`apps/web/README.md`'s "#897" section still reads "Not delivered" / "still open".** #897's four
   commits (`40ae61f67` … `dc7118bb9`) are already on this branch, landed by an earlier implementer
   in this lane before my context started. That section is #897's own report surface, not #1021's —
   left untouched per scope discipline (one implementer per ticket) — but it is stale and worth a
   doc fix-round note so a reader of this file is not misled about #897's status.

## Anything unverified

- **"Repeated" runs under load (AC1's literal wording).** One whole-suite pass (4859/4861, target
  cell green) is what this session's time budget allowed; the brief's own prior evidence (the
  #875 follow-up finding: 1 failure in a 5-run sample with the OLD fixed-count shape) was a
  multi-run sample I did not reproduce at that same N for the NEW shape. The mechanism argument
  (a real deadline, not an iteration count, is what removes the host-contention sensitivity — the
  same reasoning `document-detail-live-refresh.test.tsx`'s own #904 fix round already used and
  documented for the identical class of flake) is the basis for the "done" status, not a
  statistical guarantee from N repeated runs.
- **Context7 / current library docs.** No third-party library API was used that I was not already
  certain about — the change is repo-internal (`node:test`, the existing `h.settle()` harness
  primitive already used by this file and by `document-detail-live-refresh.test.tsx`). No lookup
  was needed; recorded rather than silently skipped.
- I did not measure the OLD (40-iteration) cell's failure rate myself under load in this session —
  I relied on the #875 follow-up finding already recorded in `apps/web/README.md` and the ticket's
  own brief, both citations checked against their source files (above), not re-derived empirically
  from scratch.
