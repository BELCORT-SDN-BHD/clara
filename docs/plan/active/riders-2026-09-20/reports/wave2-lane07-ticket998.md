# Wave 2, lane 07, ticket #998 — "Retire the firm timeline wrapper and clara.list_firm_timeline"

Branch `riders/w2-lane07`, base `23cfad947b5598214168ba9c43d391b4e16aa745`. Three commits (this
ticket lands after #974's `c7b434584`/`d50857c08`, #995's `d50857c08`/`a980f8c4f`/`cbbc594c2`, and
#1009's `756cdc484`/`ca4576b3c`/`53edba470`/`37e33380a`, already on the branch before I started):

- `b2eb3f9fb` — `db(activity): #998 migration 0261 retires clara.list_firm_timeline and its wrapper`
- `ea890fd41` — `test(db): #998 web-reads-and-doors sheds list_firm_timeline's cohort flag and cells`
- `8ef4596a3` — `test(db): #998 f-a7-pi's web-reads witness moves off the retired function`

Status: **done**.

## The ticket, verified live

`gh issue view 998 --json title,body,comments,...` — no comments, body only (the Agent Brief the
prompt quotes verbatim; no newer Agent Brief and no owner-ruling comment dated 2026-09-20 exists
beyond the ticket body itself). Checked it was still unbuilt on this branch before my first
commit:

- `apps/web/lib/firm/timeline.ts` and its test still existed, both still listed in
  `apps/web/test/manifest.txt`.
- `clara.list_firm_timeline(bigint,integer)` still resolved on `clara_l07` (this rig), still
  EXECUTE-granted to `clara_fn_owner` and `clara_authenticated`.
- Zero production callers other than the wrapper itself: `apps/web` and `packages/runtime` had no
  other `list_firm_timeline` call site; every OTHER hit was a background comment in an unrelated
  module (`firm-recent-activity.tsx`, `activity.ts`, `firm-home-board.test.tsx`,
  `home-board-mock.mjs`, `home-board-walk.spec.ts`, and the wave-2026-09-18 archived reports) — the
  Agent Brief itself names "two comments in unrelated modules mention it as background" and does
  not list them for removal, so they were left as historical narrative, unchanged.
- `clara.firm_timeline_visible` (0174, CB-AE2E-018) was live and unaffected — confirmed out of
  scope per the brief's own "Scope note, load-bearing".

## The seams

Per the Agent Brief's "Key interfaces", the seams under test are:

1. **`clara.list_firm_timeline` itself** — proven gone (and everything it carried proven gone with
   it) by the migration's own prestate/tail DO-blocks, run for real against `clara_l07` via
   `pnpm migrate`.
2. **`packages/db/tests/operation-census.test.mjs`** — the live boundary census that scans
   `apps/web`/`packages/runtime` source for RPC call sites and checks live grants against
   `rig-meta.mjs`'s declared cohorts. This is the seam that actually proves "no reference to the
   function or the wrapper remains" (AC1) and "no gate left asserting a dropped function" (AC4),
   because it reads real source text and the real grant catalog, not a fixed list I could get
   wrong by hand.
3. **`packages/db/tests/web-reads-and-doors.test.mjs`** — the existence witness (`cohortApplied`'s
   `d3`) and the function's own behaviour cells (wr.10, wr.11).
4. **`packages/db/tests/f-a7-pi.test.mjs`** — `webReadsLanded()`, which used the function only as a
   stand-in witness for "has migration 0174 landed" (see "A seam the brief didn't name" below).
5. **`packages/db/tests/rig-isolation.test.mjs`** — run because it shares `rig-meta.mjs`'s grant
   matrix machinery with operation-census; not itself edited.

No test was written at `clara.firm_timeline_visible` or `clara.list_activity` (both explicitly out
of scope and both unedited) beyond the pre-existing wr.9 cell, which already covers the same
cross-firm/rank-floor properties the retired wr.10/wr.11 duplicated over the RPC.

### A seam the brief didn't name, and why I tested it anyway

`packages/db/tests/f-a7-pi.test.mjs`'s `webReadsLanded()` used
`to_regprocedure('clara.list_firm_timeline(...)')` purely as a stable exact-signature witness for
"has migration 0174/CB-AE2E-018 landed" — used to decide whether pi-A1 should expect the f_a4
receipt shim WIRED to `clara.agent_act_receipts` (a repoint that migration 0174 also performs).
This is not "the function's own behaviour" (which the brief does name), but a coupling on it that
the brief's author could not have been expected to trace by hand. Left unpointed, dropping the
function would have turned this witness into a silent, permanent false negative: 0174 stays
landed, the shim stays really wired, but the witness would read `false` forever and pi-A1 would
start expecting UNWIRED — a real regression, not a vacuous skip. I re-pointed it onto
`clara.archive_chat_session(uuid,text)` (born in the same migration, unaffected by this drop). This
is the kind of thing AC4 ("no gate left asserting a dropped function") implies even though the
brief's own "Key interfaces" list does not spell it out, and I verified it with the same
red-then-green discipline as everything else (below).

## Acceptance criteria

1. **No reference to the function or the wrapper remains outside migration history.** — Evidence:
   `packages/db/tests/operation-census.test.mjs` opcen.1 ("the operation boundary carries no
   unwaived hard finding") — **RED first**, twice, for two different real reasons, each fixed
   before the cell went green:
   - With `rig-meta.mjs` edited but the migration not yet applied cleanly, `ensureReady()`
     auto-applied my (then-buggy) migration file and it failed its own tail assertion
     (`firm_timeline_visible no longer carries security_barrier / row security` — I had used
     `relrowsecurity` instead of the reloption check 0174 itself uses; fixed to
     `c.reloptions @> array['security_barrier=true']`, matching 0174's own 裁-15 assertion).
   - Once the migration applied cleanly, opcen.1 and opcen.3 (CONTROL called_missing) both failed
     with a REAL finding: `clara.list_firm_timeline — no clara function of this name exists in the
     catalog; called from apps/web/lib/firm/timeline.ts:72 (web).` — i.e. the census caught the
     wrapper's own RPC call site against the now-dropped function, exactly the defect AC1 is about.
   GREEN after deleting `apps/web/lib/firm/timeline.ts` + `timeline.test.ts` and removing the
   manifest entry: `node --test ... tests/operation-census.test.mjs` → **10/10 pass**. Final grep
   sweep (`apps/web`, `packages/runtime`, `packages/db`) confirms every remaining
   `list_firm_timeline` mention is either inside `packages/db/migrations/*.sql` (history — 0174,
   0181, 0183, and this ticket's own 0261) or an explanatory comment in the three DB test files I
   edited (documenting the retirement itself) or in the pre-existing background comments/archived
   reports the Agent Brief already named as out of scope.
2. **The function is absent from the schema after the new migration applies on a from-scratch
   chain, and no merged migration is edited.** — Evidence: migration 0261's own tail DO-block
   (`to_regprocedure('clara.list_firm_timeline(bigint,integer)') is not null` → exception),
   executed for real by `pnpm migrate` against `clara_l07`:
   `[notice] #998 tail: OK -- clara.list_firm_timeline is ABSENT with zero routine_privileges rows;
   clara.firm_timeline_visible survives untouched (present, row-security forced,
   clara_authenticated-selectable); clara.list_activity still resolves.` No from-scratch chain was
   run on this cluster (lanes never run it — RIG.md; the integrator runs that proof on a disposable
   cluster). No applied migration was edited: `git diff` on this PR touches only the new
   `0261_retire_list_firm_timeline.sql` under `packages/db/migrations/`.
3. **`clara.list_activity` and every other reader of the view pass their existing tests
   unchanged.** — Evidence: `clara.list_activity` itself is untouched (no file under
   `packages/db/migrations/` naming it was edited by this PR); its own tests were not run as part
   of this ticket because nothing in this PR touches it or its signature (confirmed by the
   migration's own tail: `to_regprocedure('clara.list_activity(text,int,uuid,text[],timestamptz,
   timestamptz,uuid)')` still resolves at its live 7-arg signature). `wr.9` in
   `web-reads-and-doors.test.mjs` (the other reader this ticket's scope note names,
   `clara.firm_timeline_visible` itself) is untouched and still passes.
4. **The database and web test suites pass with no gate left asserting a dropped function.** —
   Evidence, each with its own red-then-green cycle (test-first, per the work order's vertical-slice
   rule):
   - `packages/db/tests/web-reads-and-doors.test.mjs` — **RED first**: with 0261 applied and this
     file unedited, `cohortApplied()` read `d1=true d2=true d3=false d4=true d5=true d6=true
     v1=true t1=true c1=true` — 8-of-9 present — and its own "wholly present or wholly absent"
     guard threw, failing all 24 cells in the file (`hookFailed`, not individual assertion
     failures — the whole file died in `before()`). Fixed: removed `d3` from `cohortApplied()`'s
     probe query, and removed cells wr.10 (role floor / clamp / cursor paging) and wr.11 (cross-firm
     boundary) — both properties are already proven directly over `clara.firm_timeline_visible` by
     the untouched wr.9, so no coverage is lost, only the redundant RPC-shaped restatement of it.
     GREEN after: **22/22 pass** (24 minus the 2 retired cells). Removing wr.11 left the `firmB`
     local unused (`no-unused-vars`, caught by `pnpm lint`); its declaration and `before()`
     assignment were removed too.
   - `packages/db/tests/rig-meta.mjs` — no standalone test, but its
     `WEB_READS_DOORS_HUMAN_FNS`/`WEB_READS_DOORS_COHORT`/`ALLOWED.clara_authenticated` (all
     spread from the one array) feed `grantMatrixFailures()`'s `cohortFailures()` call inside
     `operation-census.test.mjs`, which has the identical "wholly present or wholly absent" rule.
     This is the mechanism behind AC1's opcen.1/opcen.3 red-then-green cycle above; see there for
     the actual evidence.
   - `packages/db/tests/f-a7-pi.test.mjs` — **RED first**: with 0261 applied and this file
     unedited, pi-A1 failed — `f_a4: UNWIRED — no member receipt table has landed yet`, `expected
     false, actual true` (the test started expecting `wired: false` for f_a4 while the real
     `agent_receipt_source_census()` reported it still really wired to `agent_act_receipts`, since
     0261 never touches that shim). Fixed: re-pointed `webReadsLanded()` onto
     `clara.archive_chat_session(uuid,text)` (see "A seam the brief didn't name" above). GREEN
     after: **22/22 pass**.
   - `packages/db/tests/rig-isolation.test.mjs` — **22/23 pass, 1 skip** (T19 poison-role, the
     known destructive cell that needs `CLARA_RIG_ALLOW_RESET=1` on an isolated DB — never set,
     per RIG.md). Unedited by this ticket; run because it shares the same grant-matrix machinery.
   - `apps/web` — see Gates below for the whole-unit-suite count and the one pre-existing,
     unrelated failure cluster.

## Migration

`packages/db/migrations/0261_retire_list_firm_timeline.sql` (the reserved number). House shape:

- **Header**: owner's ruling, scope note (the view stays, only the function+wrapper go), the full
  test-estate inventory this file's drop obligates elsewhere, and an explicit "why no new rig-meta
  cohort and no new preintegration-gate module" section naming its precedent (0118 F-A2 cutover,
  0129 F-A3 PR-3 retirement — both pure retirements that shipped with neither).
- **Prestate pin**: `clara.list_firm_timeline(bigint,integer)` — `sha256(prosrc)` =
  `68ecc60993eebd42af8ec45ed87b337d80179139d9dff5ae35f96680f9378b6b`, MEASURED on `clara_l07`
  (this rig) via a throwaway node script against `pg_proc.prosrc` (never migration file text), just
  before writing the migration. No ticket earlier in this lane touches this function, so this is
  the base wave-2 integration head's own body (born at 0174), unmoved. The prestate also asserts
  zero triggers, zero view/rule dependents (`pg_depend`/`pg_rewrite`), zero other `clara.*`
  function-body mentions (ILIKE scan), zero `clara.wake_fn_allowlist` rows, and
  `clara.firm_timeline_visible` present — all independently measured on this rig with the same
  throwaway script before writing the assertions.
- **The change**: one statement, `drop function clara.list_firm_timeline(bigint,integer);` — both
  EXECUTE grants (`clara_fn_owner`, `clara_authenticated`) leave with the object, no explicit
  revoke (matching the estate's own drop idiom: 0005, 0009, 0011, 0046, 0118 S1).
- **Tail assertions**: function absent; zero `information_schema.routine_privileges` rows for it;
  `clara.firm_timeline_visible` still present, still `security_barrier=true` (裁-15), still
  SELECT-granted to `clara_authenticated`; `clara.list_activity` still resolves at its live 7-arg
  signature.
- **Preintegration-gate module**: none — reasoned explicitly in the header (no new callable object
  is introduced, and the deleted cells need no frontier tolerance because they no longer exist to
  fail on any chain).
- **rig-meta cohort**: not a new cohort — `"list_firm_timeline"` REMOVED from the existing
  `WEB_READS_DOORS_HUMAN_FNS` cohort in `packages/db/tests/rig-meta.mjs` (see AC4 above).
- **Gate-chain entry**: none added to `packages/db/package.json`'s `test` script, for the same
  reason as the preintegration-gate module.

Applied for real: `pnpm migrate` against `clara_l07` (127.0.0.1:55747) —
`applied 0261_retire_list_firm_timeline · backend pid 368957`,
`migrate: 1 new migration(s) applied · 231 total`. One bad apply/rollback happened first (the
`security_barrier` predicate bug caught by opcen.1's red run, above) — clean rollback confirmed
(ledger unaffected, function still present) before I fixed it and re-applied successfully. If this
migration needs to be re-applied after an edit before merge, `packages/db/README.md`'s "Redo
(#957)" mode (`CLARA_MIGRATION_REDO=0261`) applies — not used in this session, since the one bad
apply rolled back cleanly on its own.

## Gates, with counts

- **Test files touched, full gate chain**: `packages/db/tests/web-reads-and-doors.test.mjs` (22/22
  pass, with `web-reads-preintegration-gate.mjs`), `packages/db/tests/f-a7-pi.test.mjs` (22/22
  pass, with the three f-a7 preintegration gates) — run together in one combined final pass, 44/44.
- **`operation-census.test.mjs`**: 10/10 pass (required because I touched `packages/db/tests` and
  `rig-meta.mjs`'s grant cohort).
- **`rig-isolation.test.mjs`**: 22/23 pass, 1 skip (T19, known destructive — never run with
  `CLARA_RIG_ALLOW_RESET`).
- **`pnpm typecheck`**: **fails**, but on a single PRE-EXISTING, UNRELATED defect —
  `components/documents/document-kind-dialog.tsx(95,22): error TS2552: Cannot find name
  'DOCUMENT_KINDS'`. Confirmed unrelated to #998 by `git stash -u` back to the clean lane HEAD
  (before any of my changes) and re-running `pnpm --filter @clara/web typecheck`: the IDENTICAL
  two errors reproduce. `git log -- .../document-kind-dialog.tsx` shows the file's last touch was
  `55fe794a6 fix(web): #878 stop the document-kind detail dialog offering consent_evidence`
  (pre-dating this lane's branch point entirely — `git show
  23cfad947b5598214168ba9c43d391b4e16aa745:apps/web/components/documents/document-kind-dialog.tsx`
  carries the identical broken line). The file imports `CLASSIFIABLE_DOCUMENT_KINDS` from
  `./document-kind-control` but line 95 references the bare, undefined `DOCUMENT_KINDS` — a real
  bug from ticket #878, out of #998's scope (scope discipline, work order rule 5). Stashed and
  restored my own changes afterward (`git stash pop`) — confirmed identical to before the probe.
- **`pnpm lint`**: **0/0 — clean** (exit 0) after fixing the `firmB` no-unused-vars regression my
  own wr.11 deletion introduced (see AC4 above).
- **`apps/web` whole unit suite** (`node scripts/run-tests.mjs`): **4731/4753 pass, 20 fail, 2
  skip**. All 20 failures trace to the SAME pre-existing `document-kind-dialog.tsx` defect above
  (19 are the literal `ReferenceError: DOCUMENT_KINDS is not defined`, thrown from
  `document-kind-dialog.tsx:95` during render; the 20th,
  `document-kind-labels.test.tsx`'s "[878] the DETAIL surface's classify Select also stops offering
  a kind the door always refuses", is the dedicated regression test for this exact bug, and it
  correctly fails because the bug is live). None of the 20 mention Firm Home, activity, or
  timeline. Zero failures are attributable to this ticket's changes.
- **e2e browser walk**: **unverified — blocked**. I did not edit any e2e spec, so no walk was
  strictly owed under work order rule 8, but I attempted `home-board-walk` on this lane's triple
  (3560/3561/3562) as extra diligence for Firm Home. `pnpm --filter @clara/web e2e home-board-walk`
  fails before the browser ever opens: `next build`'s own TypeScript check hits the SAME
  pre-existing `document-kind-dialog.tsx` error and refuses to produce a build. This appears to
  block EVERY e2e walk on this lane (and possibly this wave), not just Firm Home's — worth
  escalating to the orchestrator promptly, since it is a build-level blocker inherited from the
  wave-2 integration head, unrelated to any single lane's ticket.
- **`check-frozen-workflows.mjs` / `check-parts-parity.mjs`**: not run — this ticket touches no
  file under `packages/runtime`.
- **`apps/web/scripts/check-test-manifest.mjs`**: run directly — `495 test file(s) listed in
  test/manifest.txt — every real test file on disk is present, exactly once, in alphabetical
  order.` (confirms the manifest edit is consistent, `timeline.test.ts` correctly absent).

## Docs

- `apps/web/README.md` — the Firm Home "Recent activity" paragraph reworded: dropped the
  now-meaningless "(not `clara.list_firm_timeline`)" aside (the function no longer exists to
  contrast against) and named the retirement (#659 moved it, #998 retired the old function).
- `CONTEXT.md` — checked, no entry to update (`list_firm_timeline`/"firm timeline" was never a
  CONTEXT.md vocabulary term).
- `packages/db/README.md` — checked, no entry to update (it documents the sha-pin coupling rule
  with 0234 as its worked example; this migration recuts nothing another migration pins, so that
  rule does not apply here).

## Successor contract

None. This ticket touches no frozen chat/Work-tool surface, no closure module, and adds no new
door a frozen surface would need to call.

## Follow-ups worth filing

1. **`components/documents/document-kind-dialog.tsx:95` — `DOCUMENT_KINDS` is undefined** (should
   be `CLASSIFIABLE_DOCUMENT_KINDS`, per the sibling `document-kind-control.tsx`'s own pattern and
   ticket #878's stated intent of excluding `consent_evidence`). This single-line regression: (a)
   fails `pnpm typecheck` repo-wide, (b) crashes 19 apps/web unit tests with a `ReferenceError`,
   (c) has its OWN dedicated regression test already failing because of it
   (`document-kind-labels.test.tsx`), and (d) blocks `next build`, which blocks EVERY Playwright
   e2e walk on this lane. It predates this lane's branch point (confirmed at base commit
   `23cfad947b5598214168ba9c43d391b4e16aa745`) and is out of #998's scope, but its blast radius
   (blocking e2e entirely) makes it worth escalating ahead of the next e2e-dependent ticket in any
   lane on this wave.
2. **No from-scratch chain proof for 0261** — per RIG.md, lanes never run the from-scratch proof
   (the integrator does, on a disposable cluster); flagging so the integrator's from-scratch pass
   includes 0261's own tail notice in its evidence.

## Anything unverified

- The e2e browser-walk gate for this lane (see Gates above) — blocked by the pre-existing,
  unrelated `document-kind-dialog.tsx` build failure, not by anything in this ticket.
- `clara.list_activity`'s own dedicated test file(s) were not re-run (nothing in this PR touches
  its signature or body; the migration's own tail confirms it still resolves at its live
  signature, which is the check this ticket's scope note calls for).
