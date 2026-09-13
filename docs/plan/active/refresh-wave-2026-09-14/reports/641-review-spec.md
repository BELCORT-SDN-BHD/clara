# #641 spec review — impl/641-work-list-detail vs brief-641.md / ticket / appendices

Diff confirmed non-empty: `git diff main...HEAD` = 37 files, +5341/-223; 6 commits (`01d70cbe`..`68cf6651`).

## (a) Missing/partial requirements

**BLOCKER — the addressed-row door is built but never wired to any UI surface.** Decision #10 (binding): "Addressed-row fetch: a `?work=<id>` (or the detail route) must fetch the addressed row outside the page window (#719 lesson)." `clara.get_accounting_work_row` (0189) and its web wrapper `getAccountingWorkRow` (`apps/web/lib/work/work-list.ts:426-431`) exist and are tested (DB `wl.4`, `wl.13`; unit `work-list.test.ts:213-240`) — but `WorkListUrlState` (`lib/work/work-list-url-state.ts:873-884`) has no `work` field, and no component (`accounting-work-list.tsx`, `use-work-list.ts`, `work-detail.tsx`) ever calls `getAccountingWorkRow`. A `?work=<id>` link to the list does nothing — no highlight, no fetch — and a row outside the current page/filters is simply invisible, the exact #719 failure the door's own comment describes ("A surface that could only see the current page would render a not-found for a row the caller is perfectly entitled to read"). No e2e test exercises this path either. ARCHITECTURE.md's #641 paragraph lists `get_accounting_work_row` among what "已落地" (has landed) without this caveat.

## (b) Scope creep

None found. The diff stays inside the brief's slice: no batch/child UI (`grep` for child/batch turns up only the doc comments explaining why it's absent), no plan awareness, only `pagination`+`empty` installed, Activity view reads `list_activity` client-scoped rather than recutting it a third time (honestly captioned).

## (c) Looks implemented but wrong

**SHOULD — the "Entered by" filter targets the wrong column.** `WorkListFilterControls`'s `filterInitiator` (label "Entered by", `messages/en.json`) writes `?initiator=`, which `listAccountingWorkPage`/`clara.list_accounting_work` filters as `w.initiator = p_initiator` (migration `packages/db/migrations/0189_work_list_reads.sql:5125`) — i.e. **who currently runs it**. But the row's own "Entered by" column renders `row.initiated_by ?? row.initiator` (`accounting-work-list.tsx:1283`) — **who asked**, matching the pre-existing `enteredBy()` helper's own contract (`lib/work/types.ts:161-166`: "`initiated_by` until a takeover moves `initiator` away from it"). After a Take-over, filtering "Entered by: Alice" silently drops the Work whose column still reads "Alice" (now `initiator = Bob`), and "Entered by: Bob" wrongly includes Work Bob never asked for. No fixture in `wl.8` (`packages/db/tests/work-list.test.mjs:5919-5935`) creates a taken-over row, so this is untested as well as wrong.

## Six TDD seams

| # | Seam | File | Present | Asserts the seam |
|---|---|---|---|---|
| 1 | short page/cursor round-trip/cross-firm zero | `packages/db/tests/work-list.test.mjs` | Yes | Yes (`wl.2`, `wl.3` — 3 works/2 statuses, `wl.4`) |
| 2 | status filter / no-match ≠ empty-client | `apps/web/lib/work/work-list.test.ts` (moved from `reads.test.ts`) | Yes | Yes |
| 3 | Empty variants + Clear filters | `components/work/accounting-work-list.test.tsx` | Yes | Yes |
| 4 | URL round-trip, unknown tokens dropped | `lib/work/work-list-url-state.test.ts` | Yes | Yes |
| 5 | question precedes Tabs; tab click no write | `components/work/work-detail.test.tsx` | Yes | Yes (DOM-order + write/read-count assertions) |
| 6 | filtered deep link + Back | `e2e/work-list-walk.spec.ts` | Yes | Yes |

## Specifically-requested checks

- Status label never emits blocked/partial/runnable without a canonical signal: **OK** — `WORK_STATE_LABELS` excludes them entirely (`lib/work/work-list.ts:437-440`).
- "Retrying" only when `attempt > 1`: **OK** — `workStateLabel` (`work-list.ts:449-478`), tested.
- Addressed `?work=<id>` row fetched outside page window: **FAIL** — see (a).
- Back from detail restores identical list query: **OK** — cursor+filters live in URL (`work-list-walk.spec.ts:3489-3507`).
- `NotBuiltNote` on `/work` gone: **OK** — removed from both pages and `en.json`.
- Child-count path reads only canonical rows: **OK** — no batch/child code exists at all.

**Minor NOTE (not scored):** `lib/work/reads.ts`'s `listAccountingWork`/`BoundedWork` are now dead in production (only their own `reads.test.ts` still calls them) — left behind by the rewrite, not flagged in ARCHITECTURE.md.

**Totals: 3 findings — 1 BLOCKER, 1 SHOULD, 1 NOTE. Worst: BLOCKER (addressed-row fetch unwired).**
