# #641 — Standards review (impl/641-work-list-detail vs `main`, merge-base)

Scope: `git diff main...HEAD` (6 commits, 37 files, +5341/-223). Confirmed non-empty before review.
Verified locally: `pnpm --filter @clara/web lint` green (eslint, token-contrast, test-manifest ×2,
message-keys ×2 — "2511 static `t("…")` key(s)... all resolve"); `work-list.test.ts` 16/16,
`work-list-url-state.test.ts` 7/7, `accounting-work-list.test.tsx` 9/9, `work-detail.test.tsx` 38/38
(node --test, this worktree).

## Hard-rule checks (WORK-ORDER.md, RIG.md)

- **Manifest (rule 8/"bites" rule 3).** All 3 new web test files are listed in
  `apps/web/test/manifest.txt`: `components/work/accounting-work-list.test.tsx`,
  `lib/work/work-list-url-state.test.ts`, `lib/work/work-list.test.ts`. Confirmed by diff and by
  `check-test-manifest.mjs` passing. **No finding.**
- **Message keys (same rule).** `check-message-keys.mjs` resolves all 2511 static keys; manual
  audit of every `t()`/`tm()` call in the touched work files confirms none are orphaned. The six
  removed `WorkDetail` keys (`statusColumn`, `listHeading`, `listLoading`, `listEmpty`,
  `listReadFailed`, `listTruncated`) and five removed `Work` keys (`viewsLabel`, `viewAll`,
  `viewNeedsYou`, `notBuilt`, `clientNotBuilt`) have zero remaining references anywhere in
  `apps/web` (grepped; the one `listHeading` hit left is `BankAccounts`'s own key, unrelated
  namespace). **No finding.**
- **Frozen bodies / migrations append-only.** 0189 is new, additive-plus-one-recut; the recut
  (`save_my_preferences`) is pinned by a prestate `sha256(prosrc)` check (line 191) and a tail
  assertion that every 0179 arm (`sidebarDefault`, `motion`, `stale_version`,
  `unsupported_top_level_key`) plus the new `workViews` arm are present in the live body (lines
  780-786). Matches the 0181/0179 house shape (header → prestate → body → tail). **No finding.**
- **Shared files edited minimally (rule 8).** `apps/web/e2e/serve-built.mjs`,
  `apps/web/lib/firm/activity.ts`, `packages/db/tests/rig-meta.mjs`,
  `apps/web/components/common/nav-pills.tsx` / `section-tabs.tsx`,
  `apps/web/components/settings/settings-nav.tsx`, `apps/web/e2e/e2e-fixture-ownership.test.ts` are
  all touched by narrow, well-isolated hooks (a `WORK_LIST_CLIENTS` splice, one `if` dispatch
  block with its own comment, two `export` keywords, one cohort array, doc-comment corrections).
  `apps/web/e2e/journal-work-mock.mjs` (not in the rule's named list, but a sibling ticket's mock
  module) gained one new **pure, additive** export (`journalWorkListPage`) with no edits to
  existing logic — judgement call, not a violation, see SHOULD below. **No hard violation.**

## shadcn provenance (check 1)

`git diff main...HEAD -- apps/web/components/ui/button.tsx apps/web/lib/utils.ts` is empty — both
byte-identical to `main`. Only `components/ui/pagination.tsx` and `components/ui/empty.tsx` were
added under `components/ui/`. Provenance is recorded in commit `01d70cbe`'s body ("installed via
the shadcn CLI (see the PR body for the command and what was reverted)"). **No finding.**

## PaginationLink `role="button"` on `<a>` (check 2)

Confirmed in `node_modules/@base-ui/react/.../useButton.mjs`: with `nativeButton={false}` (as
`components/ui/pagination.tsx:52` sets), Base UI's own `useButton` stamps `role: 'button'` onto the
rendered element and layers matching keyboard handling (Enter/Space) — this is upstream Base UI
behaviour, not something authored in this branch. Appendix D's dispositions (row 42 Pagination,
row 11 Button Group) say nothing about this pattern one way or the other — **not a cited standard
breach**. The branch discloses the tension in-code
(`accounting-work-list.tsx:423-431`, "MEASURED LIMIT OF THE VENDORED PRIMITIVE... reported as a
follow-up rather than patched into a primitive other tickets also install") and
`e2e/work-list-walk.spec.ts:125-129` asserts the role as it actually is rather than asserting it
away. **SHOULD (judgement call, already disclosed):** file the follow-up issue this comment
promises rather than leaving the promise undischarged in prose only — I found no open issue
referencing it.

## Empty state / a11y baseline

`Empty`/`Skeleton`/`Alert`/`denied` states in `accounting-work-list.tsx` and
`work-activity-view.tsx` match appendix D's taxonomy line-for-line (first-use vs no-results vs
denied vs read-failure are never collapsed). **No finding.**

## e2e lane + fixture census (checks 4-5)

`serve-built.mjs`'s new `list_accounting_work` hook reads the body once and offers it to
`answerWorkListPage` then `journalWorkListPage` in turn (documented reason: two lanes now own
durable Work, `readJson` drains the stream exactly once) — a genuinely minimal, well-commented
hook. `work-list-mock.mjs` is registered in `e2e-fixture-ownership.test.ts`'s `LANE_MOCKS` and
`LANE_DECLARATIONS` with `{ unscopeable: [], debt: [] }`. **No finding.**

## Docs (check 6)

`docs/ARCHITECTURE.md` §9 replaces the #641 "not built" sentence with the shipped door/UI
description and states hosted evidence is pending; the §11 table row for "财务界面与输出" is
updated to name #641 as landed with local DB/unit/walk evidence. `CONTEXT.md` gained a "Saved
view" entry with an explicit `_Avoid_` line (no second destination, no remembered page position —
matches the implementation's own `workListStateQuery` which deliberately omits `cursor`). **No
finding.**

## `use-work-list.ts` vs the `use-work-detail.ts` #746 ref pattern

Faithful continuation: `filtersRef`/`cursorRef`/`limitRef`/`loadRef` mirror args every render,
`epochRef` gates which response is committed, `read` has a stable (`[]`) dependency array and
reads only through refs — the exact shape `use-work-detail.ts`'s `reload` uses. **No finding.**
Minor NOTE: `hasLoadedOnceRef` (ref) and `everLoaded` (state) track the same fact in parallel —
defensible (one is read synchronously inside the async closure, the other drives a re-render for
`failedFirstRead`), but worth a one-line comment explaining the split the way the rest of this file
explains everything else it does. Not flagged as Duplicated Code; too small and too well-motivated.

## Baseline smell: Duplicated Code / Data Clump — the seven filter axes (SHOULD)

The tuple `{client, status, purpose, initiator, since, until, q}` is hand-enumerated in at least
five places: `FILTER_KEYS` (`lib/work/work-list-url-state.ts:128`), `hasWorkListFilters` (same
file, :150-160), `workListStateQuery` (same file, :170-179), `countActive`
(`components/work/work-list-filters.tsx:299-309`), and — the clearest duplication — two
byte-similar "clear everything" object literals:

```
// accounting-work-list.tsx:199-203 (WorkListTable.clearFilters)
client: null, status: [], purpose: [], initiator: null,
since: null, until: null, q: null, view: null, cursor: null,

// work-list-filters.tsx:246-250 (WorkListFilterControls' Clear button)
client: null, status: [], purpose: [], initiator: null,
since: null, until: null, q: null, view: null,
```

Neither call site needs to retype this; `applyWorkListUrlState`'s own `touchesFilter` logic already
clears `cursor` whenever any filter key is in the patch, so the first site's explicit `cursor: null`
is redundant besides. A single exported `EMPTY_WORK_LIST_FILTERS` (or a `clearWorkListFilters()`
helper) in `work-list-url-state.ts`, reused by both components, would remove the duplication and
the redundant field. Judgement call, not a hard violation — no documented standard names this file
— but it is the one clear instance of Fowler's Duplicated Code in this diff.

## Everything else checked, no findings

`work-detail.tsx`'s Tabs: question (`WorkOutcome`/`WorkQuestionPanel`) sits above the
`Results | Sources | Activity` strip in DOM order (asserted by `work-detail.test.tsx`'s "641 …
precedes the Tabs" cells, 38/38 green); tab switch is confirmed to fire no write
(`work-detail.test.tsx:37`, "switching a tab fires NO write and no further read"); Results/Sources
are `keepMounted`, Activity is not, matching the documented draft-preservation rationale.
`work-list.ts`'s `workStateLabel` is the one derivation point for the status vocabulary (C77.12,
reviewed no-gap, cited correctly against `use-work-detail.ts:41-42`). `rig-meta.mjs`'s
`WORK_LIST_0189_COHORT` follows the 0183 sibling shape exactly (clara_authenticated-only, PUBLIC
revoked, tail-asserted at 0189's own end).

## Verdict

**3 findings total: 0 BLOCKER, 2 SHOULD, 1 NOTE.** SHOULD #1 — file the PaginationLink
`role="button"`-on-`<a>` follow-up issue the code promises (`accounting-work-list.tsx:423-431`)
but which does not appear to exist yet. SHOULD #2 — extract the duplicated seven-axis
filter/clear-filters shape (`work-list-url-state.ts`, `work-list-filters.tsx`,
`accounting-work-list.tsx`) into one shared constant. NOTE — `use-work-list.ts`'s parallel
`hasLoadedOnceRef`/`everLoaded` bookkeeping is defensible but undocumented. Worst finding:
**SHOULD.** Nothing in this diff blocks merge on standards grounds.
