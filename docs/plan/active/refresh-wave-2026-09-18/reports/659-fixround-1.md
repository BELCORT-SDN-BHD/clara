# #659 — fix round 1

Branch `impl/659-firm-home`, worktree `C:\Users\zhant\Desktop\clara-wt\659`. Round start
`e14a8b9c`, HEAD **`cc19cf18`**. Four commits, all red-first:

| SHA | What |
|---|---|
| `e895464f` | A5 unknown-is-not-zero · A4 page-local Empty · A6 undated completion · A10 superseded read |
| `da830ddf` | **A1 (blocker)** — the `work_question` deep link withdrawn |
| `5ddabcee` | A3 focus return (measured unmet, then built) · A8 false claim in source · A12 census |
| `cc19cf18` | A2 recent-success drilldown · A7 attributable actor · A9 call count · A13 cursor grammar |

Verdicts in: spec `accept` (3), standards `accept` (2), adversarial `fix_then_accept` (13).
**Applied: 15. Deliberately left: 2. Ratification requested: 1.** All evidence local;
**hosted evidence pending**.

---

## A1 · blocker · the `work_question` deep link — APPLIED (withdrawn)

**Finding.** `needsYouRowHref` returned `workDetailHref(row.client_id, row.task_id)`, but
`task_id` is an `agent_tasks` id, not the accounting Work.

**Verified independently before acting**, off live `pg_proc` on `clara_659`:
`clara.list_review_queue`'s `work_question_rows` CTE selects `wqi.task_id` (line 206 of `prosrc`)
while the Work reaches the row only through `join clara.accounting_work wqw on wqw.id = wqi.work_id`
(line 214). The row publishes no `work_id`. `loadWorkDetail` → `getAccountingWork(clientId, workId)`
returns null for an id that is not an `accounting_work.id`, so every parked question on the
most-demoed surface in the product offered a not-found.

**What I did.** Withdrew the repoint; `work_question` keeps the workspace root it had before this
ticket. `hasOwningTab` loses its special case, the orphaned `NeedsYou.openTab.work_question` label
is deleted, and the module header now records the residual against 0180's queue row in full.

**Why withdrawn rather than deepened** — and this is the ratification item below. Building the link
correctly needs `work_id` on the queue row, which is a **recut of `clara.list_review_queue`**.
DECISIONS §2 row 0231 says "Recuts: none", and 0231's own tail asserts that body byte-identical by
`sha256(prosrc)`. Doing it would change what the brief specifies.

**Evidence.** A REAL row, as the review demanded, not a fixture uuid:
`packages/db/tests/firm-portfolio-pack.test.mjs` →
`p659.links.work_question_row_cannot_address_its_work` opens a question through the real doors
(`parkedWork`), reads the queue as the owner persona, and asserts `row.task_id === parked.taskId`,
`row.task_id !== parked.workId`, `row.id === questionId`, and — the live guard — that **no field of
the row equals the Work id**, so the cell reds the day `work_id` appears and the deep link becomes
buildable. `apps/web/lib/firm/needs-you-links.test.ts` reds first (6/8), then 8/8.

## A2 · major · the count and its drilldown were different populations — APPLIED

Measured: the count keys on a **committed `operation_receipts` row** inside the seven MYT dates;
`clara.list_accounting_work`'s `since`/`until` filter `w.created_at` — when the Work **started**
(`0203_list_accounting_work_intent_key.sql:340-341`). A Work started thirty days ago and posted two
days ago was counted and was not in the list, so clicking "1" could land on an empty page. The
module comment asserted the opposite ("so a drilldown cannot mean a different week").

**What I did.** Dropped `since`/`until` from the `recent_success` href. The link is now a
**superset** of the count rather than a possibly-disjoint neighbour — every Work the number counted
is in it. `FirmHome.portfolio.recentDatedBy` states both halves before the click: what the count is
dated by, and that the list it opens is not narrowed to those seven days. `portfolioCountHref` loses
its `pack` argument with the window. Narrowing a Work list by receipt date stays **#905's**.

**Evidence.** `firm-portfolio.test.tsx` — the drilldown cell reds on `/^\/work\?client=c1&status=completed$/`,
then green; a new cell asserts the surface says what the link opens; the undated-window cell now
also proves both arms build the same href. e2e leg `p659.home.drilldown` repointed at the undated URL.

## A3 · major · the focus assertion could not fail — APPLIED, and the obligation was genuinely unmet

The poll read `document.activeElement?.textContent` and asserted `.toContain("3")` — a hard-coded
literal inside a three-leg loop, which the board's own "Needs you: 3" satisfied from an ancestor on
every leg. Rewritten to compare the focused node's `aria-label` against **this leg's own name**, it
went **red**: `Expected: "3 Work running for Rome Properties" / Received: ""` — i.e. `<body>`. Back
out of a soft navigation restores scroll, not focus. AC7's keyboard clause was green on nothing.

**So it is now built.** `apps/web/lib/firm/portfolio-focus-return.ts` — a take-once `sessionStorage`
marker in `lib/registration/signup-email-storage.ts`'s shape and on its argument (per-tab,
per-origin, never in the URL: a focus marker in the address bar would survive a forwarded link and
move a stranger's focus). Best-effort: a throwing or disabled store costs the focus position, never
the navigation. **Take-once matters specifically here** — this board re-reads on four triggers, one
a 30 s tick, so a marker that survived its own use would yank the caret out of whatever the person
had moved on to every thirty seconds. The section holds a ref map keyed by the same id the marker
stores, and the effect waits for the link to exist rather than firing once on mount.

**Evidence.** e2e `p659.home.drilldown` red then green — `pnpm --filter @clara/web e2e home-board`
**15/15** (50.5s on the round that built it, 39.9s on the final run at `cc19cf18`). Unit
`lib/firm/portfolio-focus-return.test.ts` **4/4** (shared id spelling, take-once, throwing store,
empty value), registered in `test/manifest.txt`.

## A4 · major · a firm-wide claim from a page-local filter — APPLIED

`visiblePortfolioRows` narrows the current keyset page; the door takes no filter argument. The Empty
said "The firm has clients — none of them matches". Reworded to "No client on this page of the
register matches…", plus a Next hint when `pack.truncated`. Red-first cell in `firm-portfolio.test.tsx`.

## A5 · major · `?? 0` turned "could not read" into "every client is clear" — APPLIED

`caughtUp` now requires a **known** zero, and `rowMatchesAttention`'s `active`/`failed`/`caught_up`
arms have explicit null arms — an unknown row was dropped from `active`/`failed` **and** offered
under `caught_up`, the exact inverse of the truth. Two red-first cells: one screen can no longer
carry both "could not be read" and "Every client is clear"; the three narrowings all drop an
unknown row.

## A6 · major · an undated completion silenced by the coverage precedence — APPLIED

The door publishes one `coverage_reason` by strict precedence, so an archived client that also
carried a finished Work with no dated receipt published only the status token and its
`recent_success = 0` was shown with no explanation. `uncounted_completions` is a **count**, not a
token, so it is now asked independently and the two sentences stack (never twice — suppressed when
the precedence winner already is that token). Red-first cell.

## A7 · minor · the receipt printed a raw uuid — APPLIED

Resolved through the same `clara.firm_members_visible` roster the activity band uses, via the same
shared `MemberName` cell, so the unresolvable-id fallback is written once. `t.rich` keeps the actor
slot a React node rather than copying MemberName's fallback rules into a second place. The agent
branch is unreachable here by construction (all three compliance doors refuse an agent identity with
CLR03 before any write). Cells: the actor resolves to "Siti Rahman" and the uuid is **absent**;
a 403 roster falls back to the shortened id and never to a blank; the remount cell proves the name
survives a reload.

## A8 · minor · a false claim in source — APPLIED

`add-client-control.tsx` claimed the two cells "are repointed at this module in the same commit".
They are not. Replaced with what is true and why it is right (they are #649's AC1 evidence **at its
own surface**), and the residual named: no cell imports this module by its own path.

## A9 · minor · a call count that was never counted — APPLIED, and the header's claim holds

Now measured rather than reworded. `p659.portfolio.preview_zero_calls_helper_zero_times` counts
`clara._work_run_attempts` through `pg_stat_user_functions` with `track_functions='all'` and
`pg_stat_force_next_flush()`: **0 calls across `p_preview=0`, 1 across `p_preview=3`**. The header's
claim is true; what was missing was the measurement. Worth recording: the first, un-forced form of
this probe read zeros for **both** arms — it would have "confirmed" the claim by measuring nothing.
The `preview_ceiling` cell's title no longer claims a count it does not take. The resolution of the
header-vs-body "contradiction" is in `packages/db/README.md`: the argument is an empty array and
never a null one, and *separately* the helper is not executed because the outer scan yields no rows
— a plan shape, not a guard, which is why it is now counted.

## A10 · minor · a superseded read could turn the board off — APPLIED

The `finally` cleared the busy flags unconditionally while only the data was epoch-gated. A page
turn clears `pack` and re-arms `hasLoadedOnceRef`, so **both** the page read and a trigger landing
during it are first-loads; the superseded one settling last left an empty pack with
`loading === false` — the zero-client "No clients yet" Empty, to a firm that has clients and a read
still in flight. Now epoch-gated. The neighbouring queue refresh stays unconditional, which is the
contract an existing cell already measures. Red-first cell settles two reads out of order.

## A12 · note · the cross-lane `list_activity` dependency — APPLIED (as a census fact, not a handler)

The review's option (a) — add an honest-empty arm to `home-board-mock.mjs` — would be **dead code**:
`serve-built.mjs` dispatches `handleActivitySupabase` at :609, above `handleHomeBoardSupabase` at
:720, and §6.1 forbids moving either. So option (b): two cells in `e2e-fixture-ownership.test.ts`
pin the dispatch order (with the instruction to grow an arm if it is ever inverted) and assert this
lane answers no `list_activity` verb. Negative control: the same pattern matches the real arm in
`activity-mock.mjs`.

## A13 · note · the cursor grammar depends on a non-blank name — APPLIED (in the README)

Recorded in `packages/db/README.md` with the reachability argument (`create_client` refuses a blank
name; no rename door exists) and the instruction for a lane that adds one.

## F1, F2, F3, S1, S2 · report corrections — APPLIED

All five are corrections to `659-final.md` rather than to code, and all five are made there:
the `unscopeable`-vs-`debt` reclassification (F1), the `recentDatedBy` polarity reversal (F2), the
`docs/PRD.md:27` citation (F3), the whole-suite counts (S1), and `PartBadge` named as the actual
Badge module (S2).

---

## Deliberately left (2)

1. **A11 · `lib/firm/timeline.ts` and `clara.list_firm_timeline` are now unreferenced by the
   product.** Verified this pass: `grep -rn "firm/timeline"` over `apps/web` returns only
   `lib/firm/timeline.test.ts:16` (the import under test) and two prose references
   (`lib/firm/activity.ts:31`, `lib/work/evidence.ts:129`). **Not deleted, by scope discipline**
   (WORK-ORDER rule 6): deleting a live granted door and its wrapper is a decision about what the
   product keeps, not a fix to a defect this branch introduced, and D18.f ruled only the swap. It is
   now named as a residual in `659-final.md`'s follow-ups, which is exactly what the review asked
   for — the review's own `fix` field says "Name it as a residual in the report".
2. **0231's own header and body comment are not edited.** Both A9's and A13's prose belong in the
   migration by preference, and the migration is **already applied to `clara_659`**;
   `packages/db/scripts/migrate.mjs:335-336` refuses an applied migration whose file checksum has
   drifted ("Migrations are immutable — add a new migration file instead"), and repairing the ledger
   by hand to land two comments is a worse trade than writing them where they are readable. They are
   in `packages/db/README.md`, under the section this repo already keeps for sharpening an
   append-only migration header (the 0214 and 0231 paragraphs directly above).

## Ratification requested (1)

**Publishing `work_id` on `list_review_queue`'s `work_question_rows`, so the Needs-you inbox can
deep-link a parked question to its Work.** This is the real fix for A1 and it is out of this
branch's power: it is a **recut of `clara.list_review_queue`**, which DECISIONS §2 row 0231 forbids
("Recuts: none") and which 0231's own tail asserts byte-identical by `sha256(prosrc)` measured on
the rig. The brief also instructed the deep link in as many words (§6, "the row carries the parked
run in `task_id`"), on a premise that is false — so *both* shipping the link and fixing it properly
depart from the brief, and the conservative reading (withdraw, name the residual) is what is on the
branch. If the orchestrator wants the destination, the wave needs either a new migration number for
the recut or a follow-up ticket; `p659.links.work_question_row_cannot_address_its_work` is already
the red cell that will announce the day it lands.

---

## Verification after the round

| Command | Result |
|---|---|
| `pnpm typecheck` (worktree root) | **green** — apps/web + packages/runtime, 0 errors |
| `pnpm lint` (worktree root) | **green, exit 0** — eslint all packages, token-contrast, test-manifest, message-keys (all `t()` keys resolve, including the three new `<actor></actor>` rich messages), ui-add guard |
| `node --test --test-concurrency=1 <41 gate flags> tests/firm-portfolio-pack.test.mjs tests/compliance-watch-disposition.test.mjs` | **23 pass / 0 fail** (17 + 6; was 15 + 6 — two cells added) |
| `pnpm --filter @clara/web e2e home-board` (3380/3381/3382) | **15/15 passed (39.9s)** at `cc19cf18` — with the A3 focus assertion now capable of failing and the A2 undated drilldown URL |
| `node scripts/run-tests.mjs` (whole `apps/web` unit suite) | **4204 tests, 4202 pass, 0 fail, 2 skipped** (up from 4191 by the 13 cells this round added). The #630 flake the standards review measured (`use-clara-thread-stop.test.ts`, non-deterministic, zero diff vs `origin/main`) did **not** fire in this run; it is named in `659-final.md` and as follow-up 8 |
| `node --test tests/operation-census.test.mjs tests/rig-isolation.test.mjs` (no reset flags) | **30 pass, 0 fail, 1 skip** (the destructive cell) — unchanged, and no #866 T10b red |
| `node scripts/check-frozen-workflows.mjs` · `check-parts-parity.mjs` | **OK** (296 frozen files; reader ⊇ emittable) |
| `git status --porcelain` in the worktree | clean |

Nothing in this round touches a frozen closure, a merged migration, another lane's mock, another
worktree, cluster or port. `home-board-mock.mjs`'s `EMPTY_RPCS` arm and `serve-built.mjs`'s dispatch
positions are byte-unchanged (§6.1).
