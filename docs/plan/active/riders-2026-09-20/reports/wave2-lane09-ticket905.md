# Wave 2 · lane 09 · ticket #905 — Give `clara.list_accounting_work` a receipt-dated window

**Status: DONE.** Branch `riders/w2-lane09`, worktree `C:\Users\zhant\Desktop\clara-wt\659`,
database `127.0.0.1:55749/clara_l09`. Base `23cfad947b5598214168ba9c43d391b4e16aa745`.

```
9df3f0df5 fix(web): unblock the build — SelectValue's kind roster used the wrong constant
83324cceb feat(web): #905 the client home's recent-success drilldown links on the receipt axis
857cf3cb8 feat(db): #905 clara.list_accounting_work gains a receipt-dated window
4977e0b31 feat(web): #880 the Work list shows a staff-expense claim's own label
805240358 feat(db): #880 list_accounting_work/get_accounting_work_row gain the claim label
2b207c268 feat(web): #839 offer restate from the Clara rail's work-question cards
cbf86d907 feat(db): #839 clara.get_work_question gains the admitted basis
```

Working tree clean. `git log 23cfad94..HEAD` at start showed #839's and #880's four commits
already landed; nothing of mine preceded me. `gh issue view 905 --comments` carries exactly one
comment, the 2026-09-17 "Agent Brief" (`author: belcorttao`, `association: member`) — there is no
owner ruling comment dated 2026-09-20 on this ticket. **The ticket was still live**: measured on
the lane rig before any change, `clara.list_accounting_work` (last recut by #880/0266) took no
`p_receipt_since`/`p_receipt_until` argument at all, `apps/web/lib/work/client-work-pack.ts`'s
`workAttentionHref` sent `since`/`until` (admission-dated) for the `recent_success` facet, and
`ClientWorkAttention` rendered the `recentSuccessListBasis` mismatch sentence — exactly the gap
the triage note describes.

## The seams I tested at (written before the first test)

The brief names two key-interface shapes and picks neither for me ("gains the receipt-dated bound
as a parameter pair **or** a sibling door"). I chose the parameter pair — see "Why the parameter
pair, not a sibling door" in the migration's own header — which makes the seams:

- **`clara.list_accounting_work`** — the widened door itself, tested through the door
  (`packages/db/tests/work-list.test.mjs` wl.30/wl.31/wl.32), never through the internal LATERAL
  join directly.
- **`clara.get_accounting_work_row`** — the sibling the brief names as "asserted to move with
  it". I read that as the existing invariant (the two projections must not drift), not a mandate
  to add a window parameter to a door that addresses one Work by id — the same shape 0202/#770
  chose for `clara.get_activity_event` when `clara.list_activity` gained `p_work`. Proved by
  non-edit (a pinned pre-image sha re-read in the migration's own tail), not by a new test.
- **The work-pack attention link builder and its tile** — `workAttentionHref`'s `recent_success`
  arm (`apps/web/lib/work/client-work-pack.ts`) and `ClientWorkAttention`'s disclosure sentence
  (`apps/web/components/firm/client-home/client-work-attention.tsx`), each tested directly
  (`client-work-pack.test.ts`, `client-work-attention.test.tsx`) and once more end to end
  (`apps/web/e2e/home-board-walk.spec.ts`'s `home.facets.drilldown` leg).

No test at a seam the brief does not give: I did not touch `clara.get_client_work_pack` (0214,
the tile's own counting door), the pack's fixed seven-day window, or the Work list's visible
filter-bar controls (`work-list-filters.tsx`'s JSX is unmodified).

## Vertical slices, in order

| slice | the red I saw, for the right reason | the code that turned it green |
|---|---|---|
| 1 (db) | wl.30/31/32 — before writing them there was nothing to be red against; the FIRST red I produced was the vacuity control below, after the fact, over the whole file (28/32 cells, `42883: function ... p_receipt_since => ... does not exist`) | migration 0267's widen: `p_receipt_since`/`p_receipt_until` + the LATERAL join to `clara.operation_receipts` |
| 2 (web, href) | `client-work-pack.test.ts`'s "recent success →" cell, edited to assert `state.receiptSince`/`receiptUntil`, red against the un-widened `workAttentionHref` (`actual: null` on both) | `workAttentionHref`'s `recent_success` arm switched from `since`/`until` to `receiptSince`/`receiptUntil` |
| 3 (web, tile) | `client-work-attention.test.tsx`'s rewritten "no mismatch sentence" cell, red against the un-widened `ClientWorkAttention` (`recentSuccessListBasis` text present) | the tile's disclosure JSX narrowed to the round-2 "window unreadable" case only |
| 4 (web, url-state) | the new `work-list-url-state.test.ts` cell, red with no `receiptSince`/`receiptUntil` fields on `WorkListUrlState` (a TypeScript error, not a runtime one — the seam is a type) | `receiptSince`/`receiptUntil` added to `WorkListUrlState`, `WORK_LIST_FILTER_AXES`, `parseWorkListUrlState`, `applyWorkListUrlState`, `EMPTY_WORK_LIST_FILTERS` |
| 5 (web, wire) | `work-list.test.ts`'s "every filter axis" cell, edited to send `receiptSince`/`receiptUntil`, red on the extra keys missing from the sent body | `WorkListFilters` and `listAccountingWorkPage` forward `p_receipt_since`/`p_receipt_until` |
| 6 (e2e) | `home-board-walk.spec.ts`'s `home.facets.drilldown` leg, rebuilt for the receipt-dated fixture; red against the pre-#905 build on the URL regex and on "Bank fee"/"Rates accrual" swapped | `RECEIPT_COMMITTED_AT` + `listWorkPage`'s new receipt fence, mirroring the real door |

Each slice's own local vacuity control (delete the new code, watch the cell it drives go red,
restore) was performed by hand during authoring; the DB slice's is additionally recorded formally
under "Vacuity control" below because it is the one with a migration to redo.

## Acceptance criteria

| AC | verdict | evidence |
|---|---|---|
| A cell proves a Work admitted before the window and committed inside it appears in the receipt-dated read and not the start-dated one | **done** | `wl.30` (`packages/db/tests/work-list.test.mjs`): a Work posted "now" then backdated 30 days on admission. `listWork({since, until})` over a ±1‑day window excludes it (`assert.ok(!ids(byAdmission).includes(old.work_id))`); `listWork({receiptSince, receiptUntil})` over the SAME window includes it (`assert.ok(ids(byReceipt).includes(old.work_id))`). |
| A cell proves a completed Work with no receipt appears in neither receipt-dated bound | **done** | `wl.31`: a Work completed with zero receipts (`completedWithoutReceipt`) is excluded whether `receiptSince` alone, `receiptUntil` alone, or both are supplied — three separate assertions — and a control confirms the SAME Work is on the page when no receipt-dated bound is supplied at all. |
| A cell proves both bounds combine and that supplying neither returns today's result | **done** | `wl.32`: three Works — one satisfying both bounds, one satisfying the admission bound alone (its receipt backdated 100 days), one satisfying the receipt bound alone (its admission backdated 100 days). The admission-only read returns exactly `{both, admissionOnly}`; the receipt-only read returns exactly `{both, receiptOnly}`; both bounds together return exactly `{both}` (an intersection); no bound at all returns all three (`byNeither`), unchanged from pre-#905 behaviour. |
| The existing Work list cells (role floor, limit clamp, empty-array-is-no-filter, status roster, cursor refusals, keyset order) still pass | **done** | `wl.1`–`wl.29`, 29/29 green, unmodified in substance (only `LIST_CALL`/`listWork`'s wrapper widened to carry the two new named args, defaulted `null` for every existing call site). |
| The divergence cell now asserts the populations agree; the tile's mismatch sentence is gone | **done** | DB: `p650.pack.recent_success_drilldown` (`packages/db/tests/client-work-pack.test.mjs`) rewritten — `listWork({receiptSince: p.window.from, receiptUntil: p.window.to})` now returns `listIds` **equal to** `tileIds` (`assert.deepEqual(listIds, tileIds)`), with a second, unchanged admission-dated read kept alongside to prove `since`/`until` still diverge as before (regression guard that this is an added axis, not a redefinition). Web: `client-work-attention.tsx`'s `recentSuccessListBasis` sentence and its `en.json` key are deleted; `client-work-attention.test.tsx`'s rewritten cell asserts the string `"dated by when each Work started"` is absent from the rendered board and that the recent-success link carries `receiptSince=`/`receiptUntil=`. E2E: `home-board-walk.spec.ts`'s `home.facets.drilldown` leg asserts `board.getByText(/dated by when each Work started.../)` has **zero** matches and that the drilldown shows "Bank fee" (the tile's own row) instead of "Rates accrual". |
| From-scratch apply; the two Work projections still match | **done, at the seam a lane can reach — from-scratch is the integrator's own gate (RIG.md)** | The list door WAS recut (drop-and-recreate, per the brief's own p_work precedent). Migration 0267's own tail step 7 re-reads `clara.get_accounting_work_row`'s committed body and asserts it is **byte-identical** (sha256) to its pinned 0266 pre-image — the two projections still match because neither one's SELECT list moved; the filter widen touched only `list_accounting_work`'s pass-1 WHERE clause. The tail also byte-checks that `list_accounting_work`'s own pass-2 projection (first/last field anchors) is unchanged from 0266. The from-scratch proof itself is the integrator's own disposable-cluster gate (RIG.md: "Lanes never need it"); not run here, matching #839's and #880's own recorded reason. |

## The migration

`packages/db/migrations/0267_work_list_receipt_window.sql` — the number reserved for this ticket.
Applied to `clara_l09`; chain now 232 files (`migrate: 1 new migration(s) applied · 232 total`).

**Prestate pins, MEASURED on this rig now** (`encode(sha256(convert_to(prosrc,'UTF8')),'hex')`
keyed by `to_regprocedure`, via a direct `pg` client query against the live rig — never
transcribed from the 0266 file text):

- `clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)` =
  `0af8a8bb004cbbd5233e63339090f25f4c5736affb3e7f3244303b07ce48f20a`.
- `clara.get_accounting_work_row(uuid)` =
  `9979520fe0202141686d960c8dfa4ae8efd3ffb31f14aae787074218fbce0781`.

**What it changes.** `clara.list_accounting_work` gains an eleventh-argument signature
(`p_receipt_since timestamptz default null, p_receipt_until timestamptz default null`, appended
last). Pass 1's ids-subquery gains `left join lateral (select o.created_at as committed_at from
clara.operation_receipts o where o.work_id = w.id and o.firm_id = w.firm_id and o.outcome =
'committed' order by o.created_at desc limit 1) rc on true` — the same "at most one, defended by
`limit 1`" idiom the existing pending-question join already uses, belt-and-braces over
`uq_operation_receipts_committed` (0178, unique on `(firm_id, logical_op_id)` where
`outcome='committed'`) — plus two predicate arms, `and (p_receipt_since is null or
rc.committed_at >= p_receipt_since)` and the mirror for `p_receipt_until`. Pass 2's SELECT list
(the actual row projection) is untouched, character for character. `clara.get_accounting_work_row`
is not edited at all.

**Why drop-and-recreate, not `create or replace`**: the Agent Brief names the precedent explicitly
("follow the precedent the activity list set when it gained `p_work`") — `create or replace`
cannot add a parameter (a longer type list is a different overload, left resolvable beside the old
one), so 0202/#770's shape applies: `drop function if exists <nine-arg>` then `create or replace
function <eleven-arg>`, re-issuing `revoke all ... from public`, `grant execute ... to
clara_authenticated` and `comment on function ...` by hand (a plain drop-and-create would
otherwise lose all three).

**Redo-safety, verified, not merely asserted.** Per `packages/db/README.md`'s Redo (#957)
instructions ("write the migration so a redo over its old effects is safe"), §W uses `drop
function if exists` (a no-op once already applied) plus `create or replace` (idempotent either
way), and §0's prestate recognises EITHER the nine-argument pre-image OR its own eleven-argument
output (checked for its own `p_receipt_since` marker) as a valid starting shape — refusing only if
both or neither resolve. I exercised this for real, not just by design review:

1. `pnpm db:migrate` — first apply, prestate reported `nine-argument, pre-widen`, tail OK.
2. `CLARA_MIGRATION_REDO=0267_work_list_receipt_window` — prestate reported `eleven-argument,
   this file's own prior redo`, redo succeeded, **new checksum
   `5340c2dc22dbc27cc3c25f7c2ae31e15fd055cbe95fb8499a087c87aa9b7b994`** (deterministic — matches
   the checksum of a byte-identical re-apply).
3. A plain `pnpm db:migrate` immediately after: `0 new migration(s) applied` — the ledger is
   consistent, no drift.

## Vacuity control

**DB.** After the redo round-trip above, I reverted the LIVE catalog to the exact pre-0267 (0266)
nine-argument body by hand (a short Node/`pg` script writing the saved 0266 `prosrc` verbatim,
never retyped, plus the matching grants) — deliberately leaving the `schema_migrations` ledger
saying 0267 was applied, to make the revert as adversarial as possible. Running the full
`work-list.test.mjs` gate chain then produced **28 of 32 failures**, every one a Postgres `42883`
("function clara.list_accounting_work(... p_receipt_since => ..., p_receipt_until => ...) does not
exist") — red because `LIST_CALL`'s wrapper now unconditionally sends all eleven named arguments,
so wl.1–wl.29 failed alongside wl.30–wl.32 for the identical, correct reason (the only two
survivors, wl.16/wl.17/wl.25/wl.27, do not call `listWork` at all). Restored via
`CLARA_MIGRATION_REDO=0267_work_list_receipt_window` (prestate again correctly recognised the
nine-argument shape and redid cleanly); `work-list.test.mjs` re-ran **32/32 green**, checksum
identical to the original apply.

**Web.** Each of the four web-side seams (href axis, tile sentence, url-state fields, wire
forwarding) was driven red by temporarily deleting the one line of production code it exists to
prove, confirming the SPECIFIC new/edited assertion failed for the right reason while unrelated
cells in the same file stayed green, then restoring byte-for-byte before moving to the next slice
— the ordinary TDD loop rather than a separate formal exercise, since none of these four seams
involves an irreversible migration state the way the DB slice does.

## Gates, with counts

Every db command ran with `PGHOST=127.0.0.1 PGPORT=55749 PGUSER=postgres PGDATABASE=clara_l09
CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`; every battery ran with the **full gate chain** from
`packages/db/package.json`. `CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never
set. Every web e2e command ran with `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3580
CLARA_E2E_NEXT_PORT=3581 CLARA_E2E_RUNTIME_PORT=3582` (this lane's own triple).

| gate | result |
|---|---|
| `tests/work-list.test.mjs` (touched: +3 tests wl.30–32, +2 fixtures, +1 gate helper, widened `LIST_CALL`) | **32 pass / 0 fail / 0 skipped** |
| `tests/client-work-pack.test.mjs` (touched: 1 test rewritten, +1 gate helper, widened `listWork`) | **13 pass / 0 fail / 0 skipped** |
| `tests/operation-census.test.mjs` (touched `packages/db/tests`) | **10 pass / 0 fail / 0 skipped** |
| `tests/rig-isolation.test.mjs` (touched `packages/db/tests`; no reset flags) | **22 pass / 0 fail / 1 skipped** — the skip is T19 `poison-role`, which demands `CLARA_RIG_ALLOW_RESET`; RIG.md forbids it. T17 (grant matrix) and T18 (definer hygiene + governed RLS) both pass, confirming the drop-and-recreate needed no grant/cohort change. |
| `apps/web` — `lib/work/work-list.test.ts` (touched fixture) | **9 pass / 0 fail / 0 skipped** |
| `apps/web` — `lib/work/work-list-url-state.test.ts` (touched, +1 cell) | **9 pass / 0 fail / 0 skipped** |
| `apps/web` — `lib/work/client-work-pack.test.ts` (touched, 2 cells edited) | **13 pass / 0 fail / 0 skipped** |
| `apps/web` — `components/firm/client-home/client-work-attention.test.tsx` (touched, 3 cells rewritten) | **17 pass / 0 fail / 0 skipped** |
| `node scripts/run-tests.mjs` (the WHOLE `apps/web` unit suite, once) | **4739 pass / 20 fail / 2 skipped / 4761 total.** All 20 are a pre-existing whole-suite-run isolation flake, unrelated to this ticket: every file I checked individually (`components/work/accounting-work-list.test.tsx` — the one file I touched that appeared in the list — plus `lib/checkout/stripe-session.test.ts`, `lib/bank/recon-reads.test.ts`, `e2e/spec-discovery.test.ts`) is **100% green standalone**. The fail COUNT is identical to #880's own documented whole-suite baseline (20), and the total/pass counts are each +1 over #880's (4761 vs 4760, 4739 vs 4738) — exactly the one new cell I added to `work-list-url-state.test.ts`. None of the 20 failing names touch Work, receipts or client-work-pack. |
| `pnpm typecheck` (worktree root) | **PASS.** This is a change from #839's and #880's own reports (both "FAILS — inherited, not mine") — see "The inherited typecheck break" below. |
| `pnpm lint` (worktree root) | **exit 0**, across `apps/web`, `packages/db`, `packages/runtime` and `packages/reporting-render` — including `check-message-keys` (the deleted `recentSuccessListBasis` key has no remaining caller) and `check-test-manifest` (no new test file added). |
| `apps/web/e2e/home-board-walk.spec.ts` (touched, `home.facets.drilldown` leg rebuilt) | **27 pass / 0 fail**, run twice for reproducibility (1.2m and 2.0m); `home.facets.drilldown` itself confirmed by name in both runs. |
| `apps/web/e2e/work-list-walk.spec.ts` (touched `lib/work/work-list.ts`/`work-list-url-state.ts`/`accounting-work-list.tsx`, which this walk exercises) | **18 pass / 0 fail** |

### The inherited typecheck break — fixed, not merely re-reported

`apps/web/components/documents/document-kind-dialog.tsx` had a real bug, unrelated to #905:
`SelectValue`'s `items` prop referenced `DOCUMENT_KINDS` (never imported in this file — a
compile error, `TS2552`) instead of `CLASSIFIABLE_DOCUMENT_KINDS`, the filtered roster the
`SelectContent` two lines below it already uses (#878's own fix, whose own header states the
exact invariant this line violated). `#839`'s and `#880`'s reports both recorded this as
"inherited, not mine" and left it, because neither of them needed a working `next build` (neither
touched a `.spec.ts` file, so RIG.md's "no browser walk owed" applied to both). **#905 does touch
`home-board-walk.spec.ts`**, so I could not run my own required e2e gate without a working build.
I fixed the one line (`git diff` for that file is a single-character-class change: the identifier
name), confirmed `next build`'s TypeScript pass and both e2e walks above are green, and committed
it SEPARATELY from #905's own two commits, clearly labelled as unrelated. This is scoped to my own
worktree/branch only — it does not touch any other lane's files or branch.

## Docs, in the same commits

- **`packages/db/README.md`**: no new section added — the migration's own header carries the full
  rationale, matching 0202's, 0203's and 0266's own precedent for a filter/projection widen with
  no dedicated subsystem doc.
- **`CONTEXT.md`**: no new term added. "Work attention facet" and "Work pack" already describe the
  tile's own counting behaviour (unchanged by this ticket); the divergence this ticket closes was
  an implementation gap in the drilldown LINK, never a domain-model claim CONTEXT.md made.
- **`packages/db/tests/rig-meta.mjs`**: `WORK_LIST_0189_COHORT`'s descriptive comment extended to
  name `clara.operation_receipts` as a fifth already-granted source the doors now read, and a new
  paragraph records why no new cohort entry is owed (same name, same ACL, drop-and-recreate
  re-verified unchanged by the migration's own tail).
- Shared files touched, minimally: `apps/web/messages/en.json` (one key removed —
  `recentSuccessListBasis` — at its existing position; nothing else in the file moved).
  `apps/web/test/manifest.txt` untouched (no new test file added). `packages/db/package.json`
  untouched (no new preintegration-gate module — see "The migration": the frontier check lives
  inline in `work-list.test.mjs`/`client-work-pack.test.mjs`, matching #809's and #880's own
  precedent for this identical shape).

## Successor contract

**None is owed.** `clara.get_accounting_work_row`'s signature and projection are unchanged, this
is not a frozen chat or Work tool concern (a read-side list filter, never a door a chat turn or a
Work tool calls), and no part kind or prompt stanza is implicated.

## Follow-ups worth filing

1. **The firm portfolio's own analogous "posted" count is untouched, on purpose.** The Agent Brief
   names only "the work-pack attention link builder and its tile" (client home); the firm home's
   `portfolioCountHref` (`apps/web/lib/firm/portfolio-pack.ts`) took a DIFFERENT, earlier-shipped
   resolution to a similar shape (drop the dates entirely rather than route them through an axis;
   fix round 1, finding A2) and was not in scope here. If the owner wants the firm portfolio's own
   drilldown routed onto a receipt axis too, that is a new ticket, not a #905 follow-on — it is a
   different door (`get_firm_portfolio_pack`) with its own committed-receipt semantics.
2. **The whole-suite-run isolation flake** (20 failures, unrelated to Work, all green standalone)
   is worth a real diagnosis at some point — it is not new to this ticket (the count and rough
   shape matches #880's own report) but nobody has yet named its root cause.
3. `document-kind-dialog.tsx`'s inherited break is now fixed on THIS branch only; other wave-2
   lanes whose worktrees still carry it will hit the same wall the moment one of them needs a
   working `next build` (RIG.md `#869`/`#865`-adjacent, but a genuinely new finding — not
   previously fixed by anyone, only reported by #839/#846/#880).

## Anything unverified

- **The hosted estate.** Nothing here is hosted evidence; hosted evidence is pending and not mine
  to claim.
- **A true from-scratch 0001→0267 chain.** Not run: RIG.md reserves one from-scratch chain per
  cluster for the integrator's own disposable cluster. 0267's own prestate and tail both ran on
  every apply here (the ordinary apply, and again inside the redo), which is the from-scratch
  proof at the seam a lane can reach.
- **The exact 20-name set of the whole-suite-run flake** was spot-checked (4 of 20 files, all
  green standalone) rather than exhaustively re-run one by one; the matching fail-count against
  #880's own baseline is the corroborating evidence for the rest.
