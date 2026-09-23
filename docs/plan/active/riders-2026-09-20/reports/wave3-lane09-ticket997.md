# Wave 3, Lane 09, Ticket #997 — final report

**Ticket:** Give the client tax page's compliance-watch receipt a browser-level test
**Branch:** `riders/w3-lane09` · **Worktree:** `C:\Users\zhant\Desktop\clara-wt\659` · **Base:** `ffe63a0dd084e99b84c1368119845be273c421ce`
**Commit (this ticket's one, on top of #970's four, #989's three and #864's five already-landed commits):**

```
f29d1b985 test(web): #997 browser walk for the client tax compliance-watch receipt
```

No migration: `git diff ffe63a0dd084e99b84c1368119845be273c421ce..HEAD --stat -- packages/db/migrations`
is empty, and this diff touches nothing under `packages/db`. The ticket said it should need none,
and did not.

## The contract used

`gh issue view 997 --comments`. **One comment, "Owner's ruling (2026-09-20)"**, carrying the newest
Agent Brief — it supersedes the triage-generated issue body's own draft (which had wrongly treated
the tax lane's browser fixture as belonging to open lane #627; the ruling comment's own text
corrects this: #627 closed 2026-09-10, "whoever implements this owns the fixture edit outright").
Verified live on this branch before building: `tax-boundary-mock.mjs` and `tax-boundary-walk.spec.ts`
both existed and were unmodified by #970/#989/#864 (`git log --oneline -- apps/web/e2e/tax-boundary-mock.mjs apps/web/e2e/tax-boundary-walk.spec.ts` showed only pre-#997 history), and grepping the
existing spec for the three governed doors (`ack_compliance_watch`, `snooze_compliance_watch`,
`resolve_compliance_watch`, `get_compliance_watch_disposition`) found no call site — the ticket was
still fully live, not already satisfied.

**Owner ruling, quoted:** "Build the browser walk. This is the ticket's own recommended option,
Option A... The only constraint left is a checked one, the estate's fixture-ownership census, which
pins this lane's fixture to an exact number of client ids, one per read outcome, and asserts that
count."

## Seams tested at (written before building, per the work order's rule 4)

1. **The client tax page's rendered surface** (`/clients/:id/tax`), through the browser, against a
   served build — `TaxWorkbenchPage` → `SstPanel` → `SstWatchSection` → `ComplianceWatchAffordance`
   → `WatchDispositionReceipt`/`WatchDispositionLine`. No internal collaborator is touched directly.
2. **The three governed doors** (`ack_compliance_watch`, `snooze_compliance_watch`,
   `resolve_compliance_watch`) and the disposition read (`get_compliance_watch_disposition`) —
   exercised only through the rendered buttons/forms, never called directly.
3. **The fixture-ownership census's client-id count** (`e2e-fixture-ownership.test.ts`) — a
   structural cell this repo's own standard requires to stay accurate whenever a lane mock's client
   set changes (work order rule 4's "a catalog census... that standard wins").

## Acceptance criteria, each with its evidence

- **[x] A browser walk on the client tax page performs acknowledge, snooze and resolve on an open
  compliance watch and asserts the disposition the page shows after each action.**
  `apps/web/e2e/tax-compliance-watch-receipt-walk.spec.ts` (new), one test, drives all three acts in
  sequence on `D4.clientReceipt`'s one open watch and asserts, after EACH act, that the disposition
  line changed to name that act's own actor/transition/rationale-or-evidence, and that the PREVIOUS
  act's own line is gone (the receipt shows the last act, not a running log). Evidence: LIVE run,
  `pnpm --filter @clara/web e2e -- --no-build tax-compliance-watch-receipt-walk` on this lane's
  triple — **1/1 pass** (2.5-6.3 s across four runs).

- **[x] The walk runs against a served build rather than a stubbed door, so a wiring break between
  the write and the disposition read fails it.**
  The walk runs through `pnpm --filter @clara/web e2e` (`next build` + `next start` + Chromium),
  the same harness every other spec in this suite uses; only PostgREST is faked, at the network
  boundary (`tax-boundary-mock.mjs`'s own hook in `serve-built.mjs`), never a component-level stub.
  **Vacuity control, run live (work order rule 4's requirement for a test-only deliverable):**
  the ack handler was temporarily edited to answer 200 without recording `receiptAck` — i.e. "the
  write succeeds and then shows nothing new afterwards," the exact failure this ticket's brief
  names — and the walk FAILED for that reason: `Error: expect(locator).toBeVisible() failed... waiting
  for getByRole('region', { name: 'Turnover watch' }).getByText('Disposition')`. The fixture was then
  restored and verified byte-for-byte (`sha256sum` before/after identical:
  `6f1862ca6189a034761fb675f7bbfcd7498405dad66390722c76c68d0a84a54d`, `git diff --stat` empty), and
  the walk re-run green. See "Vacuity control" below for the full narrative, including a first
  attempt (perturbing `compliance-watch-affordance.tsx`'s own `receiptEpoch` bump instead) that did
  NOT go red and what that revealed.

- **[x] The tax lane's fixture client ids remain unique to that lane, and the fixture-ownership
  census's exact-count control, including its exact-count control, passes after the change.**
  `tax-boundary-mock.mjs` gained a sixth `D4` client, `clientReceipt`
  (`d4d4d4d4-1111-4777-8777-d4d4d4d40006`), distinct from the other five and from every other lane
  mock's own space. `e2e-fixture-ownership.test.ts`'s "client-id census · no two lane mocks mint the
  SAME client id" test (unchanged assertion, now exercising the new id) and its own positive control
  (updated from `d4.length === 5` to `d4.length === 6`, with the message text and surrounding comment
  updated to match) both pass. Evidence: `node --import ./test/bootstrap.mjs --import tsx --test
  e2e/e2e-fixture-ownership.test.ts` from `apps/web` — **44/44 pass**, including both cells above.

- **[x] The existing unit-level coverage of the same receipt remains in place and green.**
  No app source file was touched (the vacuity control's edit to
  `apps/web/components/firm/compliance-watch-affordance.tsx` was reverted and hash-verified before
  this ticket's commit — see below), so `compliance-watch-receipt.test.tsx` and
  `compliance-watch-affordance.test.tsx` are unmodified. Evidence: the WHOLE `apps/web` unit suite
  (`node scripts/run-tests.mjs`) — **4851 tests, 4849 pass, 0 fail, 2 skip** (144.0 s) — the same
  figure #864's own report recorded as the last-known-good baseline on this lane, confirming zero
  regression and zero new unit cell (this ticket adds no unit test, by design — its whole
  deliverable is the missing BROWSER leg).

**Out of scope, honored:** no change to the receipt's behaviour or the three governed doors (the
one temporary exception, the vacuity control above, was reverted and hash-verified before the
ticket's commit); no browser coverage added for the firm inbox's own mount of the same component.

## Vacuity control — the full narrative

The work order's rule 4 requires, for a ticket whose deliverable is a test, showing the new cell
FAIL against a deliberately broken subject once, then restoring the subject byte for byte. Two
attempts were made; both are worth recording because the first one taught something real about the
app's own behaviour.

**Attempt 1 (reverted, no lasting effect):** removed `submitAck`'s own `setReceiptEpoch((n) => n +
1)` line in `compliance-watch-affordance.tsx`, expecting the disposition to never re-read after an
acknowledgement. The walk still PASSED. Investigating why: `watch.act()` (the PARENT `useAsyncRead`
hook `SstWatchSection` holds) calls its own `reloadImpl()`, which sets the parent's `loading` state
`true` for the duration of the reload. `SstWatchSection`'s `classifyTaxReadOutcome` branches on that
same `loading` flag, so the WHOLE `outcome === "ok"` block — `ComplianceWatchAffordance` included —
unmounts to a loading state and REMOUNTS once the reload settles. That remount gives
`WatchDispositionReceipt` a fresh mount effect, which re-reads the disposition regardless of whether
`receiptEpoch` itself ever changed. This is a genuine, already-shipped side channel in the app (not
introduced by this ticket), not a bug this ticket's brief asks it to fix (out of scope: "no change to
the receipt's behaviour") — recorded here, and as a follow-up below, rather than acted on. The file
was restored and verified: `sha256sum` before/after identical
(`0d965a9348e97108ca0f6109072ca9410b2d5cb7ff76bacc3cbcd7afa41e03bf`), `git diff --stat` empty.

**Attempt 2 (the one that stands as this ticket's vacuity control):** edited `tax-boundary-mock.mjs`'s
own `ack_compliance_watch` handler to answer 200 without setting `receiptAck` — the write "succeeds"
on the wire but the disposition never reflects it, precisely the "an action that succeeds and then
shows nothing new afterwards" failure the ticket's Agent Brief names as what this walk must catch.
The walk FAILED immediately at the first post-ack assertion, for exactly that reason (see AC2's
evidence above for the exact error). The fixture was restored and verified: `sha256sum` before/after
identical (`6f1862ca6189a034761fb675f7bbfcd7498405dad66390722c76c68d0a84a54d`), `git diff --stat`
empty, `git status --porcelain` empty (matching the already-committed tree exactly). Re-run
confirmed green afterward (11/11 across both tax specs — see Gates).

## Gates, with counts

- **`apps/web/e2e/e2e-fixture-ownership.test.ts`** (existing file this ticket edits): **44/44 pass**
  (part of a 53/53 run alongside `spec-discovery.test.ts` and `cell-budget-census.test.ts`,
  `sign-in-census.test.ts` — all four run together to check for regression on adjacent territory,
  since the new spec file touches sign-in and cell-budget conventions those files police).
- **`pnpm typecheck`** (root): clean — `apps/web` and `packages/runtime` both `Done`, exit 0.
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** (root, the wave-3 addendum's own required form):
  **exit 0**, whole chain clean (`check-token-contrast`, `check-test-manifest` — file count
  unchanged from #864 since `.spec.ts` files are deliberately NOT added to the manifest —
  `check-message-keys` — 4312 keys, unchanged, no new key added — `check-ui-add-guard.selftest`,
  every `check-frozen-workflows`/evaluators/leaks/dead-citations/etc. selftest, `eslint scripts`,
  `pnpm -r lint` across `apps/web`/`packages/db`/`packages/runtime`/`packages/reporting-render`).
- **`apps/web` WHOLE unit suite** (`node scripts/run-tests.mjs`, since `apps/web` was touched):
  **4851 tests, 4849 pass, 0 fail, 2 skip** (144.0 s), exit 0 — identical to #864's own last-known-
  good figure on this lane; zero regression, zero new unit cell (by design — see AC4 above).
- **Each browser walk touched, on this lane's own triple**
  (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3580 CLARA_E2E_NEXT_PORT=3581
  CLARA_E2E_RUNTIME_PORT=3582`):
  - `tax-compliance-watch-receipt-walk` (new): **1/1 pass**.
  - `tax-boundary-walk` (existing, shares the edited `tax-boundary-mock.mjs`): **10/10 pass**
    (31.3 s) — no regression from the sixth client or the four new RPC handlers.
  - Combined final confirmation run of both specs together: **11/11 pass** (29.5 s).
- **No `packages/db/tests` or SQL function was touched**: `operation-census.test.mjs`/
  `rig-isolation.test.mjs` do not apply; no migration exists to gate.
- **No `packages/runtime`/frozen-workflow file was touched**: `check-frozen-workflows.mjs` (part of
  the root lint chain above) reports clean; no manifest diff (`freeze-lint: OK — 312 frozen file(s)
  verified... 55 "use workflow" module(s) all frozen+registered; 3 retired entr(ies) recorded`).

## Docs updated

`apps/web/e2e/README.md` (same commit): a new coverage-table row for
`tax-compliance-watch-receipt-walk.spec.ts`, placed immediately after `tax-boundary-walk.spec.ts`.
`CONTEXT.md` was not touched — "Watch disposition" is already a defined term (line 197) and this
ticket introduces no new domain vocabulary, matching #970/#989/#864's own precedent on this file
(pure browser-harness test infrastructure). Noted but NOT fixed (out of scope — pre-existing drift
this ticket did not create): the README's "coverage map" intro still says "25 specs" against 49
actual `.spec.ts` files on disk; a full recount is a separate cleanup, not named in #997's brief.

## Successor contract

None. Nothing here touches a frozen chat/Work-tool surface, a door, a part kind or a prompt stanza —
this ticket is a new Playwright spec plus fixture-mock additions, both dev-time test infrastructure.

## Follow-ups worth filing

1. **The remount side-channel found during the vacuity control (Attempt 1 above).** On the client
   tax page, `WatchDispositionReceipt` gets re-read after an act via TWO independent mechanisms: its
   own `receiptEpoch` bump, and an incidental unmount/remount caused by the parent `SstWatchSection`'s
   `loading`-driven branching during `watch.act()`'s own reload. The firm-inbox altitude
   (`needs-you-inbox.tsx`) may or may not share this second mechanism — not traced, out of scope here
   (no behaviour was changed). Worth a look if `receiptEpoch` is ever refactored, so its removal
   is not assumed harmless on the strength of this one page's own incidental remount.
2. **README "coverage map" intro is stale** ("25 specs" vs. 49 actual files) — pre-existing drift,
   noted above, not fixed here to avoid scope creep against a docs-count cleanup nobody has chartered.

## Anything unverified

- **Hosted/production behaviour** — everything above is local (this lane's Playwright triple; no DB
  migration or runtime change exists for this ticket to begin with, so no hosted verification
  applies).
- **Whether the firm inbox's own mount of `ComplianceWatchAffordance` shares Attempt 1's remount
  side-channel** — explicitly out of scope (the ticket excludes firm-inbox browser coverage) and not
  traced; recorded as a follow-up above rather than asserted either way.
