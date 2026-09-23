# wave 2 · lane 04 · ticket #979 — the depreciation authority read tells "never had one" apart from "had one, and it was retired"

**Status: DONE.** Branch `riders/w2-lane04`, worktree `C:\Users\zhant\Desktop\clara-wt\651`,
database `clara_l04` (127.0.0.1:55744). Base `23cfad947b5598214168ba9c43d391b4e16aa745`.

```
git log --oneline 23cfad94..HEAD | head -6
e81ad46b1 docs(db): #979 module docs for the retired-read fallback, and the NO-COHORT record
f4782bfb5 fix(web): #979 the retired-authority surface: reason, author, window, never "none"
97fd4b058 fix(db): #979 the depreciation authority read tells "retired" apart from "never had one"
852ce993e docs: #977 one definition of a person's instruction, and where it is written down  (#977, already landed)
f3088913c test(db,runtime): #977 what must NOT have moved, and the belt rig's own instruction (#977, already landed)
2e966eb20 fix(db): #977 authorship is half the rule, not a consequence of the kind            (#977, already landed)
```

## Resume note (this ticket was killed mid-work by a usage limit)

An earlier implementer of #979 left the working tree **clean** with two finished commits
(`97fd4b058` db, `f4782bfb5` web) — `git status` at start showed nothing uncommitted, so there was
no unfinished slice to judge on its merits. Both slices were verified sound (migration applied,
tests green — see below) and continued from, never redone. What was genuinely missing, checked
against the work order's own "house shape" checklist, was the **docs commit**: no `packages/db/
README.md` narrative, no `packages/db/tests/README.md` entry, and no `packages/db/tests/rig-meta.mjs`
record for the migration — the third commit (`e81ad46b1`) closes that gap. Nothing else was
outstanding.

**The ticket was verified live on this branch before building.** `gh issue view 979 --comments`
returns the AI-triage body plus the **owner's ruling** dated 2026-09-20: *"Surface a retired
depreciation authority's reason, author and window in the read, and render them in the UI... a
bookkeeper deciding whether to propose a new authority needs to see that a prior one existed and
was deliberately withdrawn, rather than a state indistinguishable from 'never had one'."* This is
the ticket's own recommendation with no change. Measured on `clara_l04` before the two build
commits: `clara.get_depreciation_authority` selected only `status in ('live','proposed')`
(0041:4225-4227) and `FaDepreciationAuthority.status` in `apps/web/lib/registers/depreciation.ts`
carried a dead literal `"retired"` an F6 independent review had explicitly narrowed away
(2026-08-28) because the read could never produce it. Fully live, on this branch, before building.

## Seams tested at (written down before the first test)

The brief's "Key interfaces", one to one:

1. **`clara.get_depreciation_authority(uuid)`** — viewer+, `stable`, `SECURITY DEFINER`. Driven
   through `getAuthority` (`humanQuery` at its own floor) in `packages/db/tests/x41-fa-world.mjs`.
2. **`FaDepreciationAuthority` / `AuthorityCeremony`** — the web-side type and the component that
   renders "this client's current depreciation authority", driven directly as a React component
   prop (`fa-authority-ceremony.test.tsx`; no fetch mock needed, the data is a prop).
3. **The read's documented contract** (none / active / retired) — the function's own `comment on
   function`, re-read live off the catalog in the migration's own tail (T.5) rather than merely
   written in a migration comment.

## Acceptance criteria, each with its evidence

- **AC1 — a client with no authority at all still returns a null authority.**
  `p979.none` (`fa-authority-retired-read.test.mjs`) — `getAuthority` on a fresh client asserts
  `read.authority === null`. PASS.
  ```
  node --test --test-concurrency=1 <55 gate imports> tests/fa-authority-retired-read.test.mjs
  ok 1 - p979.none a client with no depreciation authority at all still returns a null authority
  ```

- **AC2 — a client whose only authority is retired returns that authority, with status, reason,
  retiring author, timestamp and window floor.**
  `p979.retired` — propose → sign → retire one authority, then `getAuthority` asserts
  `status === "retired"`, `retired_reason` equal to what was retired with, `retired_by` equal (and
  non-null — the EXISTING field, previously always empty) to a direct table read, `retired_at` to
  the second against `extract(epoch from retired_at)` on the same row (never re-derived from what
  the code computes), and `authority_from` equal to the frozen window floor. PASS.
  ```
  ok 2 - p979.retired a client whose ONLY authority is retired: the read returns THAT authority, ...
  ```
  Web side: `retired.facts` (`fa-authority-ceremony.test.tsx`) renders the reason, the retiring
  author as the same short-id chip the instruction reference uses, and the window floor in the
  past tense (`retiredWindowFrom`, reusing the `fa-authority-window` testid). PASS.

- **AC3 — a client with a `live` or `proposed` authority is unaffected; `live` still preferred over
  `proposed`.**
  `p979.preferred` — an older retired authority plus a fresh live one: `getAuthority` returns the
  live one, `status === "live"`, and asserts by KEY ABSENCE that `retired_reason`, `retired_at`
  and `authority_from` are not present on the object at all (not merely falsy). PASS. The migration
  tail (T.3) independently re-proves 0041's original `where status in ('live','proposed') order by
  case when status='live' then 0 else 1 end limit 1` survives byte-for-byte in the live body.

- **AC4 — a surface rendering a client's authority status shows the retirement's reason, author
  and window when the read reports a retired authority.**
  `retired.facts` and `retired.badge` (`fa-authority-ceremony.test.tsx`) — the status badge reads
  "Retired" in the `secondary` variant (matching the house style `counterparty-identity-panel.tsx`
  already uses for a retired alias). PASS.

- **AC5 — existing callers that only test for an active authority are unaffected by the added
  fields.**
  `p979.preferred`'s key-absence assertions (DB side) and `retired.actions` (web side, below) both
  cover this: nothing on the live/proposed arm changed shape. `p979.recent` additionally proves the
  fallback picks the MOST RECENT of two retired authorities, never an older one — not itself an AC
  but a fact the ticket's fallback design depends on. PASS.

- **AC6 — the recut ships as a new migration at the next free number; no applied migration is
  edited.**
  `0251_fa_authority_retired_read.sql` is the only new migration since BASE (0250 was the prior
  free number, claimed by #977). `select count(*), max(version) from clara.schema_migrations` on
  `clara_l04` reads `count=234, max=0251_fa_authority_retired_read` — applied, and the only
  migration this branch's own commits add. No applied migration was touched (confirmed by the
  prestate's own pre-image pins, all matching, below).

**A behaviour the ticket did not name as its own AC but the brief's action-row implication makes
necessary, caught and fixed:** `retired.actions` (web) — a retired authority now offers **Propose**
(a fresh one), never a second **Retire**. `clara.retire_depreciation_authority` refuses CLR38
`authority_not_live` on an already-retired row (0041:3388-3391); that refusal was always latent but
unreachable, because `status: "retired"` never reached `AuthorityCeremony` before this ticket. PASS.

## Migration: `0251_fa_authority_retired_read.sql`

**Prestate pins, MEASURED on `clara_l04` moments before the file was written** (sha256(prosrc),
off `pg_proc` — never transcribed from a migration file's own text):

| function | role | pinned sha256 |
|---|---|---|
| `clara.get_depreciation_authority(uuid)` | RECUT | `3d73739f9cf043fa2c9fc5d2db6e082bf68190e2270b096ae1515075a9a6486f` (0041's own text — never spliced before this file; confirmed by measurement, not assumed, since #972/#973/#976/#977 each recut a *different* fixed-asset body) |
| `clara.retire_depreciation_authority(uuid,uuid,text,text)` | unmoved | `ed671b28033db350e3b24869691d5f67d97dd6f6f430b492f7a3f25ae671d931` |
| `clara.sign_depreciation_authority(uuid,uuid,text,jsonb)` | unmoved | `d1294a8559eb8f5813b017bf71a1e747f92d94f4f1f0f375d6e3a4633a0bcf7f` |
| `clara.list_depreciation_runs(uuid)` | unmoved | `b03f79bc661653b7d4b5d333fd3b23a84091a14c4e38732a843969529b8d46ac` |
| `clara.get_depreciation_run(uuid)` | unmoved | `4508b8d0db684a4b530f837fc8fe1df6d9cc4f32943ec43047fe1db4e11d23ed` |

Prestate also re-asserts (not assumes) that `ck_fa_authorities_retired` guarantees
`retired_reason`/`retired_by`/`retired_at` non-null on a retired row, and `ck_fa_authorities_window`
guarantees `authority_from` non-null on a live-or-retired row — the whole safety argument for
merging those columns with no further null-check. It also detects and admits a #957 redo (the
`c_marker` check) rather than refusing one outright.

**The change:** one fallback `select` (live-or-proposed → most-recent-retired, `order by
retired_at desc, created_at desc`) and one conditional `||` merge of
`retired_reason`/`retired_at`/`authority_from` onto the returned object, gated on `au.status =
'retired'` alone.

**Tail assertions**, all re-read off the catalog after the recut: T.1 (fallback select present
exactly once), T.2/T.2b (field merge present exactly once, gated correctly), T.3 (0041's original
selection/preference/base-object text intact, by exact substring count), T.4 (the other three
returned fields — `ramp_earned`, `fy_end`, `high_stakes_threshold_cents` — untouched), T.5/T.5b/T.5c
(owner, `SECURITY DEFINER`, `STABLE`, pinned `search_path`, no `PUBLIC` grant, `clara_authenticated`
still holding EXECUTE), T.6 (the four sibling pins re-measured, byte-for-byte unmoved).

**Preintegration gate:** `fa-authority-retired-read-preintegration-gate.mjs`, stem
`fa_authority_retired_read$`, escape `CLARA_ALLOW_MISSING_FA_AUTHORITY_RETIRED_READ=1`, registered
in `packages/db/package.json`'s `"test"` chain last (after `authority-ref-human-instruction-
preintegration-gate.mjs`, 0250) — confirmed by reading the script string.

**Rig-meta cohort: deliberately NONE, and now recorded as such.** `get_depreciation_authority` is a
pure recut — no new name, no grant change — so it is present on every database from 0041 onward
whether or not 0251 has applied; a cohort of its own would be **wrong**, not merely redundant,
because `cohortFailures()` fails a half-present cohort by design. This is the exact shape of two
existing precedents in `rig-meta.mjs` (#797/0212, #720/0198), and the earlier implementer's commits
had not yet written the comment recording it — added in `e81ad46b1`.

## Gates, with counts

| gate | count | result |
|---|---|---|
| `fa-authority-retired-read.test.mjs`, full 55-import gate chain | 4 tests | **4 pass, 0 fail** |
| `operation-census.test.mjs`, same gate chain (SQL function recut) | 10 tests | **10 pass, 0 fail** |
| `rig-isolation.test.mjs`, same gate chain (SQL function recut, no reset flags) | 23 tests | **22 pass, 1 skip** (T19 poison-role, destructive, correctly skipped without `CLARA_RIG_ALLOW_RESET` per RIG.md) |
| `pnpm typecheck` (worktree root) | — | **`packages/runtime`: 0 errors.** `apps/web`: fails, but on an **inherited, pre-existing** error (see below), not on anything this ticket's diff touches |
| `pnpm lint` (worktree root) | — | **exit 0**, clean |
| `CI=true GITHUB_ACTIONS=true pnpm lint` (runner-as-seen) | — | **1 unrelated pre-existing failure** (see below), not caused by this ticket |
| `apps/web` unit suite, whole, once (`node scripts/run-tests.mjs`) | 4752 tests, 138 suites | **4730 pass, 20 fail, 2 skip** — all 20 failures share ONE root cause, inherited, unrelated (see below). The 3 new tests this ticket added (`retired.facts`, `retired.actions`, `retired.badge`) all PASS |
| `apps/web` browser walk touched (`depreciation-walk.spec.ts`, drives `fa-authority-window`) | — | **could not run** — blocked before the browser opens (see below) |

**The inherited typecheck/build/lint red — the same one #972's, #973's, #976's and #977's own
reports name, now ALSO confirmed to block the e2e gate.**
`apps/web/components/documents/document-kind-dialog.tsx(95,22): error TS2552: Cannot find name
'DOCUMENT_KINDS'` (and a follow-on `TS7006`). Verified inherited rather than mine: that file's last
change is `4b1376f40 merge: riders wave 1 lane 08`, which `git merge-base --is-ancestor` confirms IS
an ancestor of BASE `23cfad94`; `git log 23cfad94..HEAD -- <that file>` for the whole lane (14
commits) is empty. This is the wave's integrated head not typechecking, not #979.

- **Whole `apps/web` unit suite:** every one of the 20 failures' stack trace bottoms out at the
  exact same `ReferenceError: DOCUMENT_KINDS is not defined` inside `DocumentKindDialog`, rendered
  incidentally by document-surface tests unrelated to fixed assets (`document-detail-live-refresh
  .test.tsx`, `[1005]` classify-Select tests, `[878]`, document-detail routing tests, filing
  retirement tests) — none of them mine, none in my ticket's diff. Confirmed by
  `grep -c "DOCUMENT_KINDS is not defined"` on the full run log: 19 of the 20 `not ok` lines carry
  it verbatim (the 20th, `[878]`, is a downstream assertion failure in the SAME rendering path).
- **`CI=true GITHUB_ACTIONS=true pnpm lint`:** one selftest failure in
  `scripts/check-frozen-workflows.selftest.mjs` (`--ruling` followed by another flag) that only
  reproduces under the CI/GITHUB_ACTIONS env combo, on a file lane 04 never touches (`git log
  23cfad94..HEAD -- scripts/check-frozen-workflows.selftest.mjs` is empty; last touched by `#849`,
  well before BASE). Plain `pnpm lint` (no CI vars) exits 0.
- **The browser walk:** `pnpm --filter @clara/web e2e depreciation-walk` on this lane's triple
  (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3530 CLARA_E2E_NEXT_PORT=3531
  CLARA_E2E_RUNTIME_PORT=3532`) builds the app first, and `next build` runs a full `tsc` pass that
  fails on the SAME `document-kind-dialog.tsx` defect — unrelated to anything this walk exercises,
  but it aborts the whole build before a browser ever opens. **This is a real gap in what I could
  verify for `depreciation-walk.spec.ts`'s `fa-authority-window` assertion**, recorded under
  "Unverified" below. `wave2-lane06-ticket935.md` independently hit and named the same wave-wide
  block (its report: "it now also blocks EVERY `next build` … worth escalating beyond a routine
  follow-up given it is wave-wide … and blocks e2e, not merely `typecheck`") — this is not a new
  discovery, and no lane in this wave has fixed it (fixing it is out of #979's scope: a different
  file, a different lane's ticket, `document-kind-dialog.tsx` has nothing to do with fixed assets).
  In its place: the exact surface the walk would have exercised (`fa-authority-window` on a LIVE
  authority) is the untouched arm — 0251's tail T.3 proves the live-or-proposed selection and base
  object are byte-for-byte what 0041 shipped, and `p979.preferred` proves a live authority's
  returned object carries none of this ticket's new fields — so the walk's own assertion
  (`toContainText(DEP.authorityFrom)`) has no path this ticket could have moved.

## Docs

- `packages/db/README.md` — new paragraph under "The depreciation-history lane (#651, migration
  0227)", in the house style #973's/#976's/#977's own paragraphs there use.
- `packages/db/tests/README.md` — new "The depreciation authority retired-read fallback (#979)"
  section, placed after #977's (keeping the fixed-asset cluster in migration order 0248→0249→
  0250→0251), stating "No CONTEXT.md change" and why.
- `packages/db/tests/rig-meta.mjs` — the NO-COHORT record (see Migration section above).
- **No `CONTEXT.md` change.** `retired` is already this estate's vocabulary (filings,
  counterparty aliases); 0251 widens which existing authority *state* one existing *read*
  surfaces, it coins no new domain term — matching #973's and #976's own conclusion for their
  sibling folds (`packages/db/README.md`'s #976 paragraph: "No CONTEXT.md change: the migration
  coins no new domain vocabulary").
- All three doc files are committed in `e81ad46b1`, closing the ticket.

## Successor contracts

**None needed.** `clara.get_depreciation_authority` has no `packages/runtime` consumer at all —
confirmed by `grep -rln "get_depreciation_authority" packages/runtime apps/web`, which returns only
`apps/web` files (component, lib, tests, e2e mocks). No frozen workflow or Work-tool closure calls
this door, so there is nothing a frozen chat or Work tool would need from this change.

## What was deliberately left

- **Out of scope, per the ticket and the owner's ruling, both verbatim:** any change to HOW an
  authority is retired, to the retirement columns, or to the audit trail
  (`clara.retire_depreciation_authority` is pinned byte-for-byte unmoved, prestate and tail); a full
  depreciation-authority history timeline (tracked separately per the ticket's own text).
  `apps/web/lib/registers/depreciation.ts`'s comment on `authority_from` also names, and leaves
  alone, a live authority's window floor not yet being surfaced on that arm — "a different ticket's
  widening," per the earlier implementer's own comment, not #979's.
- **Not fixed, deliberately, as scope discipline:** `document-kind-dialog.tsx`'s missing
  `DOCUMENT_KINDS` import — see Gates above. Fixing an unrelated file in a different lane's
  territory is exactly the widening rule 5 forbids, and no lane in this wave has taken it on.

## Follow-ups worth filing

1. **Escalate the `document-kind-dialog.tsx` `DOCUMENT_KINDS` import gap beyond a routine
   follow-up.** It is wave-wide (every lane shares BASE `23cfad94`, which already carries the
   defect), it fails `apps/web` typecheck outright, and — newly confirmed by this ticket — it also
   fails `next build`, which blocks **every** `apps/web` browser walk on **every** lane touching
   `apps/web` this wave, not merely `pnpm typecheck`. `wave2-lane06-ticket935.md` flagged the same
   thing independently; no GitHub issue for this specific defect was found (`gh issue list --search
   "document-kind-dialog"` returns only #878, a different classify-Select defect on the same file).
   The one-line fix is almost certainly importing `DOCUMENT_KINDS` from `./types` at the top of
   `document-kind-dialog.tsx` (the file already imports the sibling `CLASSIFIABLE_DOCUMENT_KINDS`
   from `./document-kind-control` and uses `DOCUMENT_KINDS` at line 95 with no import at all) — but
   that fix, and confirming it does not regress the two tests it currently breaks a different way
   (`[878]`), belongs to whichever ticket owns that file, not #979.
2. **`CI=true GITHUB_ACTIONS=true pnpm lint`'s one selftest failure** in
   `check-frozen-workflows.selftest.mjs` (the `--ruling` followed by another flag case) is untouched
   by lane 04 and pre-exists at BASE; worth a lane that owns `scripts/check-frozen-workflows*`
   checking whether it is the SAME class of CI-vs-rig gap RIG.md's addendum already names (a
   selftest spawning the CLI must clear `CI`/`GITHUB_ACTIONS` for its child when the refusal it
   pins sits behind the CI refusal) or a distinct defect.

## Unverified

- **`depreciation-walk.spec.ts`'s `fa-authority-window` assertion on a LIVE authority**, on this
  lane's Playwright triple, through an actual browser — blocked by the `next build` failure above.
  Covered instead by: the migration's own tail T.3 (the live-or-proposed selection and base object
  are byte-for-byte 0041's), `p979.preferred` (a live authority's object carries none of this
  ticket's added fields), and the pre-existing, unmodified fixture the spec itself drives
  (`e2e/depreciation-mock.mjs` / `e2e/fixed-asset-mock.mjs`, neither touched by this ticket's diff).
- Whether the owner or the integrator wants a GitHub issue filed for the `DOCUMENT_KINDS` gap
  before or after this wave's release — left to the orchestrator, per the "never write to GitHub"
  rule for a lane worker.
