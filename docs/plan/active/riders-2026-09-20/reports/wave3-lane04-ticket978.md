# Wave 3 · Lane 04 · Ticket #978 — done

Fixed assets (4/4, last ticket in the lane): `completeFixedAssetParticulars` and `disposeFixedAsset`
(`apps/web/lib/registers/fixed-assets.ts`) minted `crypto.randomUUID()` inline on every call, so a
retry after a lost response was a NEW operation to the door's own `_reserve_op` dedupe instead of a
replay of the receipt already earned — the one defect class #651 left out on purpose (named D15 in
its final report, follow-up #7). Both doors now take a caller-supplied operation key, the same
"one decision, one key" shape #651 wired onto `propose`/`sign`/`retire`/`revise`/the manual run. No
migration: the SQL doors already accept `p_op_key` as a caller argument and already dedupe on it
(`clara._reserve_op`) — the defect was entirely in the JS wrapper and its three call sites.

Branch `riders/w3-lane04` (worktree `C:\Users\zhant\Desktop\clara-wt\651`), base
`ffe63a0dd084e99b84c1368119845be273c421ce`. Database `clara_l04` at `127.0.0.1:55744`, unchanged by
this ticket (270 files, frontier still `0279_fa_closed_year_arrears` — #932/#882/#975, the three
tickets before mine in this lane, had already landed). First action: `git status` (clean) and
`git log --oneline ffe63a0dd084e99b84c1368119845be273c421ce..HEAD` (fifteen commits: six `#932`,
two `#882`, seven `#975`, nothing uncommitted). The "implementer cut off by a usage limit" note in
my brief describes an earlier attempt at #932, already resolved and committed before I started —
there was nothing uncommitted for me to judge.

Commits, in order:

- `cc2665d5b` `fix(web): #978 completeFixedAssetParticulars takes a caller-supplied operation key`
- `7e850426b` `fix(web): #978 disposeFixedAsset takes a caller-supplied operation key`
- `ade99ff68` `feat(web): #978 wire the complete and dispose dialogs onto ONE DECISION, ONE KEY`
- `97f97e862` `feat(web): #978 the needs-you completion affordance holds its own decision key too`
- `51d55b47d` `docs(web): #978 the depreciation surfaces section, updated for the two follow-up doors`
- `c49ebd030` `fix(web): #978 reword two assertion messages the raw-colour lint rule (owner ruling Q4) trips on`

## The ticket is the contract

`gh issue view 978 --comments` — zero comments, so the issue body (labelled `bug`,
`ready-for-agent`) is the whole contract; no newer Agent Brief or owner ruling exists to supersede
it. **Verified still live on this branch before building**: `apps/web/lib/registers/fixed-assets.ts`
still called `crypto.randomUUID()` inline in both `completeFixedAssetParticulars` (line 308) and
`disposeFixedAsset` (line 419) — grepped before touching anything — and `apps/web/README.md`'s own
"one decision, one key" passage (§"The depreciation surfaces (#651)") still named both as the
untouched follow-up. Neither #932, #882 nor #975 (the three tickets before mine) touched
`lib/registers/fixed-assets.ts`'s two door wrappers.

## The seams the brief names (written down before the first test)

1. `completeFixedAssetParticulars(session, args)` (`lib/registers/fixed-assets.ts`) — the transport
   wrapper's public interface: must require a caller-supplied key and post it verbatim.
2. `disposeFixedAsset(session, args)` — same public interface, same requirement.
3. `completeIntent(args)` / `disposeIntent(args)` — the intent-serialising pure functions the brief
   asks for ("following the existing `reviseIntent`/`authorityIntent` pattern").
4. `CompleteParticularsDialog` / `DisposeDialog` (`components/registers/fa-row-actions.tsx`) — the
   dialogs the brief names as adopting `useDepreciationDecisionKey`.
5. `FixedAssetIncompleteAffordance` (`components/firm/fixed-asset-incomplete-affordance.tsx`) — a
   THIRD call site the codebase has that the brief's prose does not name individually (it says "the
   dialogs calling these two doors"); found by grepping every caller of both functions before
   building (AC4's "no existing caller… left passing no key" makes it in scope regardless of the
   prose).

No test was written at a seam the brief does not give; `useDepreciationDecisionKey` itself is
pre-existing and already unit-tested (`lib/registers/depreciation.test.ts`), so it was reused, not
retested.

## Acceptance criteria, with evidence

**AC1 — neither door generates a random key internally; both require a caller-supplied operation
key.** `git diff` on `lib/registers/fixed-assets.ts`: `crypto.randomUUID()` is gone from both
functions; `opKey: string` is now required on both argument types (a TypeScript compile error on
any caller passing none — confirmed by `pnpm typecheck` running clean across all three call sites
after they were wired). Tests: `completeFixedAssetParticulars: posts the exact door body shape,
with the CALLER's key` and `disposeFixedAsset: posts every door argument by exact p_ name, cost
portion defaults to null, WITH the caller's key` (`lib/registers/fixed-assets.test.ts`) assert the
posted `p_op_key` equals the literal string passed in, not a UUID shape.

**AC2 — a test proves that calling either door twice with the same key and the same decision
content is treated as a replay of one operation, not two.** At the wrapper level:
`completeFixedAssetParticulars: calling it twice with the SAME key posts the SAME p_op_key both
times — no key is minted internally` and the equivalent `disposeFixedAsset` test
(`lib/registers/fixed-assets.test.ts`) — both RED before the fix (posted two different
`crypto.randomUUID()` values), GREEN after. The server-side replay itself is the door's own
`clara._reserve_op` (read, not edited, per "out of scope" — `clara.complete_fixed_asset_particulars`
0249:350-352, `clara.dispose_fixed_asset` 0041:3662-3672), so the wrapper-level test proves exactly
the half this ticket owns: the client never manufactures a second identity for the same call.
At the component level, driven through a REAL `act()` and a mocked fetch, with a REFUSED first
attempt so the dialog/affordance stays open and a second click is a genuine retry of the same open
decision: `complete.posts a caller-held op_key that reaches the door and SURVIVES a refused retry
unchanged`, `dispose.posts a caller-held op_key…` (`components/registers/fa-row-actions.test.tsx`),
and `FixedAssetIncompleteAffordance: the real door call carries a non-empty op_key that SURVIVES a
refused retry unchanged` (`components/firm/fixed-asset-incomplete-affordance.test.tsx`) — all three
assert the two posted `p_op_key` values are identical.

**AC3 — the dialogs backing both actions hold one key for the life of the decision and issue a new
key when the user changes any field the key is derived from.** `completeIntent`/`disposeIntent`
(`lib/registers/fixed-assets.ts`) are, by doc comment and by construction, EXACTLY the tuples the
doors' own `_reserve_op` calls hash into their operation key (`client`/`asset`/`particulars` for
completion; `client`/`asset`/`disposal_date`/`proceeds_cents`/`proceeds_account`/`gain_account`/
`loss_account`/`cost_portion_cents` for disposal — memo deliberately excluded, matching the door's
own comment at 0041:3667-3671 that a relabel is the same disposal). Field-sensitivity proved by
`#978 completeIntent: one decision while the form is unchanged, a new one the moment any particular
is edited` and `#978 disposeIntent: one decision while the money facts are unchanged, a new one the
moment any of them move — memo EXCLUDED` (`lib/registers/fixed-assets.test.ts`), each vacuity-checked
against a deliberately broken subject (constant-string return), seen to fail, then restored byte for
byte and re-run green. `CompleteParticularsDialog`/`DisposeDialog` now call
`useDepreciationDecisionKey()` and pass `onClosed={() => decision.renew()}` to `FaDoorDialog` —
exactly `ReviseParticularsDialog`'s own pattern (`components/registers/fa-row-actions.tsx`).
`FixedAssetIncompleteAffordance` has no `FaDoorDialog` wrapper of its own, so its own open/close IS
the decision boundary: `decision.renew()` is called both on a successful submit and on Cancel.
Proved by `FixedAssetIncompleteAffordance: a successful submit clears the fields and mints a FRESH
key on the next decision` — two independent decisions (open → fill → submit → open again → fill →
submit) mint two DIFFERENT keys.

**AC4 — no existing caller of either function is left passing no key.** Repo-wide grep for
`completeFixedAssetParticulars|disposeFixedAsset` before finishing: exactly three call sites in
`apps/web` (`CompleteParticularsDialog`, `DisposeDialog`, `FixedAssetIncompleteAffordance|`), all
under `apps/web/components/`, none in `packages/runtime` or anywhere a frozen chat/Work tool could
reach — so neither door has ever been exposed to `chatTurn`/`claraWork`, and no successor contract
is owed for this ticket (see below). All three were updated in this branch; `pnpm typecheck`
(apps/web + packages/runtime) is clean, which a caller still passing no `opKey` would have failed.

**Out of scope, honoured:** the SQL doors' own dedupe mechanism was read (to confirm AC2's server
half and to derive the intent tuples exactly) but not edited — `git diff` shows zero changes under
`packages/db/`. The bank-matching lane's own D15 instance was not touched.

## Migration — none

This ticket needed no migration, as the brief and RIG.md's reserved-numbers note both expect: both
doors already declare `p_op_key text` as a caller argument and already call `clara._reserve_op`
keyed on it (`clara.complete_fixed_asset_particulars`, recut live at `0249_fa_particulars_completion_
fold.sql:337-388`; `clara.dispose_fixed_asset`, still at its original `0041_wave_d_a_fa_register.
sql:3643-3687` — neither wave 2 (0247-0251) nor #932/#882/#975 on this branch touched the dispose
door). The defect was entirely that the JS wrapper discarded whatever the caller might have supplied
and minted its own key every time; nothing on the database side needed to change.

## Gates, with counts

- Test files touched, run individually and in combination:
  - `apps/web/lib/registers/fixed-assets.test.ts` — **12/12 pass** (4 pre-existing untouched, 2
    door-body tests reworded for the caller's key, 2 new same-key-twice replay tests, 2 new intent
    field-sensitivity tests, the pre-existing `reviseIntent`/`reviseFixedAssetParticulars` tests
    unchanged and still green).
  - `apps/web/components/registers/fa-row-actions.test.tsx` — **6/6 pass** (SPEC-978-1, fix round:
    this line read 9/9, which is wrong — 4 pre-existing + 2 new is 6, and the file has exactly six
    top-level `test(` calls; re-measured 6/6 on the fix-round branch) (2 new component-level
    tests for `CompleteParticularsDialog`/`DisposeDialog`; both run RED first against the file's
    PRIOR content via `git stash` — confirmed a missing `p_op_key` — then GREEN after the wiring was
    restored; the 4 pre-existing `ReviseParticularsDialog` tests unchanged and still green).
  - `apps/web/components/firm/fixed-asset-incomplete-affordance.test.tsx` — **new file, 3/3 pass**,
    registered in `apps/web/test/manifest.txt` at its sorted position (between
    `firm-home/firm-portfolio.test.tsx` and `needs-you-a11y.test.tsx`).
- `pnpm typecheck` (repo root, `apps/web` + `packages/runtime`): clean.
- `CI=true GITHUB_ACTIONS=true pnpm lint` (repo root, as the runner sees it, per the wave-3
  addendum): **exit 0** across `apps/web`, `packages/runtime`, `packages/db`,
  `packages/reporting-render`. First run caught 3 `no-restricted-syntax` (`NO_RAW_COLOR_VALUES`,
  owner ruling Q4) errors — `"#978"` inside a `components/**/*.test.tsx` string literal reads as a
  3-hex-digit colour token, the exact known #994 trip case for a ticket-reference literal; reworded
  to `"ticket 978"` (the rule's own recommended fix) rather than weakened, in its own commit; the
  rerun is clean.
- `apps/web`, WHOLE unit suite once (`node scripts/run-tests.mjs`, since `apps/web` was touched):
  **4862 tests, 4860 pass, 0 fail, 2 skipped, 138 suites**, exit 0. The 2 skips are the pre-existing,
  unrelated `CLARA_LIVE_SUPABASE_AUTH_URL`/`…ANON_KEY not configured` live-provider skips.
- Browser walk: no e2e spec was edited by this ticket, so none is strictly "touched" under rule 8.
  `apps/web/e2e/fixed-asset-acquisition-walk.spec.ts` — the one existing walk that directly drives
  `CompleteParticularsDialog`'s "Complete particulars" flow — was run anyway for real evidence that
  the wiring did not regress a real browser flow: **9/9 pass**, on the lane-04 Playwright triple
  (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3530 CLARA_E2E_NEXT_PORT=3531
  CLARA_E2E_RUNTIME_PORT=3532`). Grepped first: no e2e spec in this repo exercises `DisposeDialog`
  at all (no `dispose_fixed_asset` verb in `e2e/fixed-asset-mock.mjs`, no "Dispose" button assertion
  anywhere under `e2e/`), so there is no walk to run for it — its coverage is unit + component level
  only (see follow-ups).
- No SQL function was added, so `operation-census.test.mjs`/`rig-isolation.test.mjs` do not apply;
  no `packages/runtime` file was touched, so `check-frozen-workflows.mjs`/`check-parts-parity.mjs`
  do not apply.
- No known Windows-only red was hit, and none was "fixed".

## Docs updated, in the same commits

- `apps/web/README.md` — the "one decision, one key" passage under "The depreciation surfaces
  (#651)" rewritten: names `completeIntent`/`disposeIntent` beside the existing three tuples (with
  the memo-exclusion note), and states that all three call sites — the two dialogs and the needs-you
  inline affordance — now hold a key; #639's original mint-per-call shape is gone.
- `CONTEXT.md` — not touched. No new domain vocabulary is introduced: "operation key" and "one
  decision, one key" are an existing house convention (documented in the module README, not
  `CONTEXT.md`), and this ticket only extends that convention's reach, matching #651's own precedent
  of documenting it in `apps/web/README.md` rather than `CONTEXT.md`.

## Successor contract — none owed

Neither `completeFixedAssetParticulars` nor `disposeFixedAsset` is reachable from a frozen chat or
Work tool: confirmed by a repo-wide grep for both names, which found only the three `apps/web/
components/**` call sites this ticket updated (plus this ticket's own test files and docs/report
prose). `packages/runtime` was not touched. There is therefore nothing a `chatTurn_v22`/
`claraWork_v6` cut would need from this ticket.

## Follow-ups worth filing

1. **`DisposeDialog` has no browser-level (Playwright) walk at all**, in this repo, independent of
   this ticket — `e2e/fixed-asset-mock.mjs` has no `dispose_fixed_asset` verb and no spec asserts a
   "Dispose" trigger. Its coverage after this ticket is unit (`fixed-assets.test.ts`) + component
   (`fa-row-actions.test.tsx`, driven through a real `act()` and a mocked fetch) but never a real
   browser. Worth a line in whichever ticket next extends `fixed-asset-acquisition-walk.spec.ts` or
   adds a disposal-specific walk.
2. **The brief's prose names "the dialogs calling these two doors" (implying two call sites) but the
   codebase has three** (`FixedAssetIncompleteAffordance` is the needs-you inline completion path).
   AC4's own wording ("no existing caller… left passing no key") already covers it, and it is wired
   and tested identically to the two dialogs, but a future brief for this door pair should name it
   explicitly to avoid a reader assuming "two" is exhaustive.

## Anything unverified

- **Hosted states were not exercised.** Only the seeded `clara_l04` rig (component/unit level) and
  the mocked `fixed-asset-acquisition-walk.spec.ts` browser walk (mocked backend, not a real
  Postgres) were used. Nothing in this ticket touches the database, so there is no hosted-data-shape
  risk beyond what #651's own original shipping of these two doors already carried.
- **The exact wording of the two new lint-fix assertion messages** ("ticket 978" instead of "#978")
  is a cosmetic reword with no behavioural weight; recorded here only because it is the one place
  this ticket's own text needed correcting against a repo-wide house rule after the first draft.
