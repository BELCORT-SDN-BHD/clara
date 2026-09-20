# Wave 1, Lane 07 — fix round 1

Branch `riders/w1-lane07`, worktree `C:\Users\zhant\Desktop\clara-wt\657`.
Starting head (before this round): `8d10ba83`. New head: `278f0795`.

Commits this round (newest first):

- `278f0795` test(web): #896 fix round — cover the second data-testid call site the fix newly renders
- `d3aa5151` fix(web): #900 fix round — wire aria-describedby to the answer field's help text
- `a0f03b87` fix(web): #903 fix round — restore watermark as a named, present-but-unread field
- `e4033ba6` fix(web): #987 fix round — door-neutral wording, re-indent the shared message key
- `cceaa0ba` fix(web): #876 fix round — teach the e2e mocks the bounded filings shape, update README
- `117fa4b0` fix(web): #904 fix round — narrow the tick to one read, surface exhausted
- `d4dd2bc2` fix(web): #842 fix round 2 — typecheck correction on the new stock-row cell
- `f827f097` fix(web): #842 fix round 2 — cover all five cents-typed basis keys, anchor the absent cell

All 15 findings the review handed this lane (8 from the spec/standards lens, 7 from the
adversarial lens) are resolved: 1 blocker fixed, 5 majors fixed, 9 minors fixed. None deferred,
none refuted as invalid — the one thing an initial re-run flagged as suspicious (a document-
correction-walk axe failure) was investigated and is reported below as a confirmed pre-existing
flake, not waved away.

## Per finding

### L07-01 (major, #842) — CENTS_PARTICULARS missed four cents-typed basis keys

**Fixed.** `CENTS_PARTICULARS` (periodic-adjustments-table.tsx) named only `settled_cents`; migration
0212's `_adjustment_basis_canonical` types five basis keys as minor units —
`amount_cents` (both purposes), `opening_cents`/`closing_cents`/`adjustment_cents` (stock) and
`settled_cents` (#797, payroll). Widened the Set to all five and corrected the stale source
comment. New cells `842.amount` (a payroll row's basis carrying `amount_cents`) and `842.stock`
(a stock row's `opening_cents`/`closing_cents`/`adjustment_cents`) reproduced the defect RED
against the un-widened Set, then GREEN after.

Evidence: `apps/web/components/accounting/periodic-adjustments-table.test.tsx` — 4/4 pass (was
2/2 before this round). Commit `f827f097`.

### L07-02 (major, #904) — the poll tick cost 5-6 reads, against the one-read contract

**Fixed.** `document-detail.tsx`'s `onTick` was the panel's own whole-bundle `reload()` (five
reads, six with a current extraction) — against `use-settle-poll.ts`'s own "One read" contract
and the sibling receipts poll's documented law. Narrowed `onTick` to
`listProcessingTasksForDocument` alone, kept as a local `taskOverride` cleared whenever the
hydrated `data` itself changes. New cell `904.L07-02` asserts a tick grows the tasks-read count
while `documents`/`document_filings`/`document_extractions`/`journal_entries` stay untouched —
red before (all four grew every tick), green after.

Evidence: `apps/web/components/documents/document-detail-live-refresh.test.tsx` — 7/7 pass (was
4/4). Commit `117fa4b0`.

### L07-03 (major, #876) — apps/web/README.md's Documents section was stale

**Fixed.** Rewrote the "Three regions on the client tab" bullet for the actual two-phase mount
sequence (#876: three reads in one `Promise.all`, then a bounded `document_id=in.(...)` filings
read sequenced after it) and its tradeoff (one extra serial round trip for a narrower
projection), then added a paragraph for the document-detail panel's own settle poll (#904),
folding in the L07-02/L07-A02 fix-round changes so the doc matches what actually shipped. The
prior report's "no README needed" claim is superseded.

Evidence: `apps/web/README.md`, "Three regions on the client tab" + the new "document-detail
panel's own settle poll" paragraph. Commit `cceaa0ba`.

### L07-04 / L07-A07 (minor, #987) — the new message key was mis-indented

**Fixed.** `apps/web/messages/en.json`'s `closedPeriodRefusal` sat at 2 spaces where its siblings
sit at 6. Re-indented, no other change to the line.

Evidence: `apps/web/messages/en.json` line ~4181. Commit `e4033ba6`.

### L07-05 / L07-A04 (minor, #987) — the substitution was keyed on the whole-workbench sticky error

**Fixed.** `openingClosedPeriodRefusal` is derived from `opening-seed-workbench.tsx`'s ONE shared
`error`, set by the same `act()` every governed door on the surface shares — including
`supersede_opening_item`, which also inserts journal lines and can hit the same period wall. The
old sentence ("...cannot be drafted here...") named an act that was not always the one refused.
Reworded to "...cannot be changed here..." — correct for every door on the workbench, not only
the draft — rather than threading the failing door's identity through the shared state, which
would have widened this minor fix past scope for no behavioural gain. New cell `987.L07-05`
drives the SAME CLR19/`write_into_closed_period` refusal out of Supersede (a non-draft door, on a
finalized seed's GL row) and asserts the code/reason still surface, the raw entry id and sentence
never render, and the door-neutral wording is what renders.

Evidence: `apps/web/components/registers/opening-refusal-and-staleness.test.tsx` — 6/6 pass (was
5/5). Commit `e4033ba6`.

### L07-06 (minor, #903) — the "two files" enumeration understated the residual by 8 files

**Corrected here, in this report** (the finding is about report accuracy, not code). The
`grep -rn "^\s*watermark: " apps/web` residual is 14 hits across 9 files:
`components/firm/client-workspace-overview.test.tsx`,
`components/firm/firm-home/firm-home-board.test.tsx`,
`components/firm-admin/firm-admin-pages-a11y.test.tsx`, `components/tax/tax-a11y.test.tsx`,
`components/tax/tax-boundary-states.test.tsx` (4 hits), `lib/firm-admin/compliance.test.ts`,
`e2e/firm-navigation-walk.spec.ts` (2 hits), `e2e/home-board-walk.spec.ts`,
`e2e/shell-migration-walk.spec.ts` (2 hits) — `lib/firm/needs-you.test.ts` is NOT one of them
(the prior report was wrong to name it). These are untyped mock bodies standing in for what the
DB sends; now that `ReviewQueueEnvelope.watermark` is restored (L07-A03, below), keeping them is
correct rather than a residual to clean up.

### L07-07 (minor, #904) — the AC3 cell was only weakly non-vacuous

**Fixed.** The original cell proved "the tasks poll never touches `document_intakes_visible`"
only while the receipts poll's own `enabled` predicate was FALSE throughout (an empty intake
queue) — a weaker claim than "unaffected". New cell `904.L07-07` seeds one non-terminal intake
row filed to the same document (so the receipts poll is genuinely live) and asserts BOTH
relations grow on their own poll's schedule, independently. The original cell is kept alongside
it as the "tasks poll touches nothing when receipts is inert" case.

Evidence: same file as L07-02, cell `904.L07-07`. Commit `117fa4b0`.

### L07-08 (minor, #842) — `842.absent` had no positive anchor

**Fixed.** Added `assert.match(text, /obligation_kind/)` before the negative assertion, proving
the particulars loop actually rendered this row's other basis keys before asserting `settled_cents`
did not appear.

Evidence: same file as L07-01, cell `842.absent`. Commit `f827f097`.

### L07-A01 (blocker, #876) — the switched filings read broke five e2e mocks

**Fixed.** `listActiveFilingsForDocuments`'s `document_id=in.(...)` shape had no e2e mock branch —
every mock serving `document_filings` keyed on `eq.` only. Reproduced exactly as reported:
`documents-intake-walk` gave 5 failed / 7 passed before this fix. Taught the three mocks whose
walks actually mount `DocumentsWorkbench` (`documents-intake-mock.mjs`,
`documents-viewer-mock.mjs`, `document-correction-mock.mjs`) an `in.(...)`-shaped branch beside
their `eq.` ones, answered from the same per-lane fixture data. Checked the other five mocks the
finding named as "likewise" (journal-work, accrual, periodic-adjustment, work-knowledge,
opening-ledger-source) against their own `*-walk.spec.ts` files: none navigates to the client
Documents tab, so their `client_id=eq.` handlers answer a DIFFERENT, unchanged caller
(`lib/work/evidence.ts`'s evidence chooser) and needed no branch.

Re-run on the lane triple (`https://127.0.0.1:3560` / `3561` / `3562`), final clean run:
- `documents-intake-walk`: **12 passed**
- `documents-viewer-walk`: **22 passed**
- `document-correction-walk`: **14 passed, 1 failed** — see below.

**The one remaining failure is a confirmed pre-existing flake, not a regression.** It is a
`color-contrast` axe violation (`text-muted-foreground` on `bg-muted`, 4.49 vs the 4.5 AA
threshold, on a *selected* revision-table row in the Facts tab) at
`e2e/document-correction-walk.spec.ts:398`. It has nothing to do with `document_filings`. Proven
pre-existing two ways: (a) it passes standalone (`-g "each of the three routed views"`), so it is
order-dependent within the full-file run, not a deterministic break; (b) re-ran the WHOLE
`document-correction-walk` suite with this round's three mock edits `git stash`-ed out (i.e.
against the pre-fix code) — **identical result**, same single failure, same test, same violation.
It is a design-system-wide contrast debt, out of #876's scope and not one of this round's
findings; left unfixed and named here rather than silently ignored.

Evidence: gate output above; commit `cceaa0ba`.

### L07-A02 (major, #904) — the poll discarded `exhausted`, stopping silently after ~142s

**Fixed.** `useSettlePoll`'s `exhausted` return value was discarded in `document-detail.tsx`, so
a task still running when the tick ceiling hit went stale with no signal at all — against the
hook's own stated reason for `exhausted` existing and the house law the sibling receipts poll
already renders. `DocumentMetadata`'s extraction-tasks section now shows a new
`extractionTasksExhausted` message plus a manual Refresh
(`data-testid="extraction-tasks-refresh"`) wired to the panel's full `reload()`, gated on
`exhausted && a task is still non-terminal`. New cell `904.L07-A02` drives a `maxTicks: 2` poll to
exhaustion, asserts the message renders, then asserts clicking Refresh issues a fresh tasks
read — red before (10s timeout, the text never rendered), green after.

Evidence: same file as L07-02, cell `904.L07-A02`. Commit `117fa4b0`.

### L07-A03 (minor, #903) — the grounds for deleting `watermark` were wrong

**Fixed.** `clara.list_review_queue` DOES emit `watermark` (0011_daily_loop.sql:3861, recut at
0016_a21_compliance_watch.sql:4691); 0036_wave_c0_deferred_belts.sql:1737-1744 pins it as a
must-not-be-lost output of that function; CONTEXT.md names it twice ("Attention source
freshness", "Source watermark") as a real, estate-wide concept. The deleting commit's claim that
CONTEXT.md's mention was "unrelated to the dead front-end field" was false. Restored
`watermark?: unknown` on `ReviewQueueEnvelope` with the SAME posture the file already gives its
`compliance`/`lint` siblings: present on the wire, typed loosely, not rendered by this build — a
named gap, never a silent, undocumented drop — rather than threading it into a renderer (which
would widen a minor fix past scope). The hook still does not read it; the test now asserts
presence-plus-non-read instead of absence.

Evidence: `apps/web/lib/firm/needs-you.ts` (the restored field + its comment),
`apps/web/lib/firm/use-review-queue.test.ts` cell `903` (red before restoring the field with the
new assertion in place, green after). Commit `a0f03b87`.

### L07-A05 (minor, #900) — `FieldDescription` was visible-only

**Fixed.** `FieldDescription` is a bare `<p>` with no id/context wiring, and it sits as a SIBLING
of the Textarea in `InterviewRunCard.tsx` (not nested inside `FieldLabel` the way
`work-question-form.tsx`'s own note field nests it) — so nothing associated it with the control.
Gave the description an id (`answerDescriptionId`, derived from `answerId`) and set
`aria-describedby` on the Textarea. Extended cell `900` in
`interview-run-field-composition.test.tsx` to assert the control carries `aria-describedby`, that
it resolves to a real DOM node, and that the resolved node IS the description.

Evidence: `apps/web/components/clara/interview-run-field-composition.test.tsx` — 2/2 pass (the
extended cell plus the no-drift cell); `interview-run-keyboard.test.tsx` and
`interview-run-a11y.test.tsx` re-run green (the two files the ticket's own header names as keying
off the kept `aria-label`). Commit `d3aa5151`.

### L07-A06 (minor, #896) — a second call site's testid was untested

**Fixed (test coverage).** `client-financial-summary.tsx:190` also passes
`data-testid="client-money-delayed"` directly to `StateBanner` — a second call site #896's report
missed. New cell drives the real staleness path (`useFinancialPack`'s `setInterval` re-check,
captured and fired by hand, mirroring `use-financial-pack.test.ts`'s own `withTimers` idiom, with
a `load` that fails after the first call so a successful re-read never resets `delayed`) and
asserts the banner is absent on a fresh read, present with its testid once delayed. The
underlying #896 fix (StateBanner forwarding rest props) already covered this call site correctly;
only the missing coverage was the defect.

Evidence: `apps/web/components/firm/client-home/client-financial-charts.test.tsx` — 11/11 pass
(was 10/10). Commit `278f0795`.

## Gates (this round)

- `pnpm typecheck` (worktree root): **Done**, 0 errors — re-run clean after every commit in this
  round, final run clean.
- `pnpm lint` (worktree root): **exit 0** — final run clean.
- Full web unit suite (`node scripts/run-tests.mjs` from `apps/web`): **4664 pass, 0 fail, 2
  skipped** (4666 tests, 135 suites) — the 2 skips are the same pre-existing skips the review's
  spec lens already noted; this round net-added 7 new cells (842 ×2, 904 ×3, 987 ×1, 896 ×1) plus
  extended 1 existing cell (900) with no new test count.
- Every test file touched or added this round, individually, before the whole-suite run above:
  `periodic-adjustments-table.test.tsx` (4/4), `document-detail-live-refresh.test.tsx` (7/7),
  `opening-refusal-and-staleness.test.tsx` (6/6), `use-review-queue.test.ts` +
  `needs-you.test.ts` + `needs-you-counts.test.tsx` + `client-workspace-overview.test.tsx`
  (37/37 combined), `interview-run-field-composition.test.tsx` +
  `interview-run-keyboard.test.tsx` + `interview-run-a11y.test.tsx` (5/5 combined),
  `client-financial-charts.test.tsx` (11/11).
- Browser walks touched by #876/#904's changes, on the lane's own Playwright triple
  (`https://127.0.0.1:3560` / `3561` / `3562`):
  - `documents-intake-walk`: 12 passed
  - `documents-viewer-walk`: 22 passed
  - `document-correction-walk`: 14 passed, 1 failed — **confirmed pre-existing** (see L07-A01
    above); not fixed, not claimed fixed.
- `packages/runtime` and `packages/db` were not touched this round; their gate chains were not
  re-run.

## Docs updated

- `apps/web/README.md` — the Documents "Three regions on the client tab" bullet, rewritten for
  #876's actual two-phase mount read; a new paragraph added for #904's document-detail settle
  poll, its one-read tick and its exhausted handling (L07-03).
- `apps/web/lib/firm/needs-you.ts` — a new doc comment on the restored `watermark` field naming
  why it exists and why it is unrendered (L07-A03).
- `apps/web/components/registers/opening-seed-workbench.tsx` — the `#987` header comment extended
  to explain the door-neutral wording choice (L07-05/L07-A04).
- This report corrects #903's prior report's file-count claim (L07-06) and #876's prior report's
  "no README needed" claim (L07-03).

## Successor contracts / follow-ups worth filing

- The `document-correction-walk` `color-contrast` axe flake (`text-muted-foreground` on
  `bg-muted`, 4.49 vs 4.5:1, a selected revision-table row) is design-system-wide contrast debt,
  confirmed pre-existing and order-dependent. Worth a follow-up ticket; out of this lane's scope.
- #904's `exhausted` UI (L07-A02) now matches the receipts poll's pattern exactly; no further
  action needed this wave.
- #987's door-neutral wording (L07-05) covers every door on the opening-seed workbench; no
  per-door plumbing was added, matching the review's own lighter-weight fork.

## Unverified

- Nothing left unverified for the 15 findings above: each was reproduced red (where a code
  change was involved) or corroborated by a source pin, then proven green, or — for the axe
  flake — proven pre-existing by a controlled re-run against the pre-fix code.
