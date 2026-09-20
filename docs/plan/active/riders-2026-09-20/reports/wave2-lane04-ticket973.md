# wave 2 · lane 04 · ticket #973 — fold `preview_depreciation_run`'s duplicated leg-pairing aggregation into `clara._fa_run_period_core`

**Status: DONE.** Branch `riders/w2-lane04`, worktree `C:\Users\zhant\Desktop\clara-wt\651`,
database `clara_l04` (127.0.0.1:55744). Base `23cfad947b5598214168ba9c43d391b4e16aa745`.

```
git log --oneline 23cfad94..HEAD
4a27e15a0 docs(db): #973 module docs for the leg-pairing fold, wiki-lint fix, test cleanup
75b9f0df4 fix(db): #973 restore both splices 0227 and 0042 install into the poster's live body
e71f1541e fix(db): #973 fold the depreciation leg-pairing aggregation into one routine
497d02455 test(db): #972 leave x41.s4's allow-list alone — the b3 residue is an A6 window, not an explained red
44449bcdb fix(db): #972 the fixed-asset birth honours the enrolment watermark on every firing
```

The ticket was verified live on this branch before building: `gh issue view 973` has **no
comments**, so the body's Agent Brief is the newest. `preview_depreciation_run` and
`_fa_run_period_core` still each carried their own copy of the leg-pairing aggregation on this
branch (confirmed by reading both bodies' `prosrc` before writing a line of the migration), and
0227's tail assertion T.13 and `p651.preview.matches_run` were the only two things binding them
together — exactly as the brief says. Nothing on `main` or in wave 2 had folded them.

## Seams I tested at (written down before the first test)

The brief's "Key interfaces", one to one:

1. **`clara._fa_depreciation_leg_pairing(jsonb)`** — the new internal aggregation routine, an
   ungranted core. No persona can call it (nothing is granted EXECUTE), so it is exercised directly
   via a root query, the same way every other ungranted FA core (`_fa_compute_charges`,
   `_fa_assert_period_open`) is exercised in this battery.
2. **`clara.preview_depreciation_run(uuid)`** — called through `humanQuery` at VIEWER floor
   (`previewRun`), its documented persona. Its returned shape is asserted unchanged.
3. **`clara._fa_run_period_core`** — reached only through its granted doors, never directly: the
   human catch-up `clara.run_depreciation_manual` (`runManual`), which is what a real run does.
4. **The catalog** (`pg_proc.prosrc`, `pg_proc.proacl`) — the repo's documented structural standard
   for a recut body (prestate `sha256(prosrc)` pins, tail assertions, `p973.core.shape` and
   `p973.callers.recut`). Work order rule 4 says this standard wins over "no structural cells".

No test touches an internal collaborator or a private function except the one the ticket's own
interface names as new and ungranted (#1), which has no other way to be exercised at all.

## Acceptance criteria

| AC | Verdict | Evidence |
|---|---|---|
| Exactly one routine computes the pairing, and both the preview door and the poster call it | **done** | Migration tail T.2 (both recut bodies' `prosrc` contain `clara._fa_depreciation_leg_pairing(`) and T.4 (the raw aggregation fragment now occurs in exactly one `clara` function, named). `p973.callers.recut` re-proves the same fact independently, off the catalog, at test time. |
| For the same inputs, the preview's returned legs are identical to before the fold | **done** | `p651.preview.matches_run` (single account pair, unchanged code path) still passes. `p973.behaviour.two_pairs` covers the case that test cannot — TWO different account pairs — with a hand-computed expectation (`[{900-D41,10000,0},{210-D41,0,10000},{901-D41,5000,0},{211-D41,0,5000}]`), matching `pv.legs` exactly. |
| For the same inputs, a real depreciation run posts identical legs to before the fold | **done** | Same two tests: `p651.preview.matches_run` compares `entryLinesOf(entryId)` to `pv.legs` (single pair); `p973.behaviour.two_pairs` does the same over two pairs, and both match to the sen, in the same order. |
| `p651.preview.matches_run` still passes | **done** | `depreciation-history.test.mjs` focused run: **19/19 pass**, including this cell. |
| The new migration carries its own assertion that both bodies now call the shared routine, so the agreement T.13 used to enforce by text comparison is still enforced after the fold | **done** | Migration 0248 tail T.2–T.4 (see above); 0227's own T.13 is untouched and still runs, unaffected, at its own point in a from-scratch chain (against the pre-fold bodies the chain has built by then). |
| The poster's signature, caller set, authority and floor checks are unchanged, and the censuses pinning them stay green | **done** | Tail T.5 (`_fa_run_period_core`'s caller set is still exactly the four 0227 named), T.6 (five non-regression bodies byte-for-byte unmoved), T.7 (owner/`SECURITY DEFINER`/`search_path`/no-PUBLIC-EXECUTE on both recut bodies), T.8 and T.9 (see "the mistake I made and caught" below). `p651.census.rerun_gate` and `p651.period.closed_refused` both pass. |
| Ships as a new migration at the next free number; no merged migration, including 0227, is edited | **done** | `packages/db/migrations/0248_fa_depreciation_leg_fold.sql`, the number reserved in the prompt. `git diff BASE..HEAD --stat -- packages/db/migrations/` shows only `0247` (#972's) and `0248` (mine) added — nothing edited. |

## The mistake I made and caught: two runtime splices, invisible to `grep`

`clara._fa_run_period_core` is created ONCE, by 0041 — but its LIVE body on this rig (and on
`main`) is not 0041's file text. Two later migrations recut it at **runtime**, by reading
`pg_get_functiondef` and `execute`-ing a string-replaced version, rather than a `create or replace`
in their own files: 0042 §S5.15d (the re-run admission gate, `clara._wdb_rerun_breach`, asked
immediately before the arithmetic) and 0227 §E (the locked-period wall,
`clara._fa_assert_period_open`, asked between the zero-charge noop arm and the first write).
Neither shows up in a `grep` of the migrations directory for the function's name in a
`create [or replace] function` sense — my first draft hand-recut the poster against 0041's
ORIGINAL file text alone and silently dropped **both**.

I caught this from the regression suite, not from my own migration's tail (which at that point
still measured pins correctly but had nothing to assert about content it did not know existed):
`p651.period.closed_refused` reddened with `CLR19 write_into_closed_period` where it expected the
typed `CLR38 axis period_closed` refusal (the wall was gone), and `p651.census.rerun_gate` reddened
naming `_fa_run_period_core` missing from the re-run gate's consumer set (the gate was gone).

Fixed by reading both splices' own migration source (0042:4288-4324, 0227:906-922) and
reproducing their exact replacement text, in the same positions, in my recut. 0248's own tail now
carries **T.8** and **T.9** — the two markers present exactly once each, phrased identically to the
originals, and correctly ordered relative to the arithmetic and the first write — so a future recut
of this body cannot lose either splice silently again, the way this one nearly did. Re-applied with
the #957 redo mode (below).

## Migration

`packages/db/migrations/0248_fa_depreciation_leg_fold.sql` — mints
`clara._fa_depreciation_leg_pairing(jsonb)` (the exact aggregation fragment, lifted unchanged),
recuts `clara._fa_run_period_core` to loop its return instead of re-deriving the pairing (both
splices preserved, in place), and recuts `clara.preview_depreciation_run` to assign `v_legs`
straight from its return (returned shape unchanged).

**Prestate `sha256(prosrc)` pins, all MEASURED on `clara_l04` before any edit, off `pg_proc.prosrc`
(the poster's pin is 0041's body PLUS both live splices — never transcribed from any file's text):**

| body | sha256(prosrc) | kind |
|---|---|---|
| `clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)` | `8a69c2355559e700f060c94c7a97950366e9743dd6794d810985fcbc74237681` | recut |
| `clara.preview_depreciation_run(uuid)` | `193597c9bc9321fb57dc3c417d9994433a6f868804b5248a889986af9405d304` | recut |
| `clara._fa_compute_charges(uuid,date,date)` | `a6566557a258444c0511c6ed14bad033ce738c841e8ce54c50ce227ca152e048` | unmoved |
| `clara.run_depreciation_period(uuid,date,date,text)` | `8dd19b9c50fb49859646c07df178b2ef69032a35aecf692cacdf208ed298b921` | unmoved |
| `clara.run_depreciation_manual(uuid,date,date,text)` | `5272743305d59913abd3a72f83ce9e5f1e8e37e5a1add8dec7f37900789307c8` | unmoved |
| `clara.run_depreciation_period_for(uuid,date,text,uuid)` | `051112ecd71e2c0c3fe70b91757f03c74054bff0665a41c57045e2e257dba1e5` | unmoved |
| `clara._agent_depreciation_catchup_core(jsonb,uuid,date,text,jsonb,text)` | `c354db4e234e58ac5213a81751522f256562b9b484153b8e7570f33a3bf9d1fc` | unmoved |

Tail T.1–T.9: the new core exists, `stable`, `SECURITY DEFINER`, owned by `clara_fn_owner`,
`search_path` pinned, EXECUTE granted to nobody (T.1); both recut bodies call it and the raw
fragment is gone from both (T.2–T.3); the fragment survives in exactly one function, named (T.4);
the poster's caller set is still the four 0227 named (T.5); the five non-regression bodies are
byte-for-byte unmoved (T.6); both recut bodies keep owner/definer/search_path/no-PUBLIC-grant (T.7);
0227's locked-period wall (T.8) and 0042's re-run admission gate (T.9) each survive, present exactly
once and correctly ordered.

**`rig-meta.mjs` cohort.** `_fa_depreciation_leg_pairing` is a brand-new ungranted core, so it needs
its own bimodal cohort — folding it into `FA_DEPRECIATION_0227_COHORT` would report that cohort
PARTIAL on every database between 0227 and 0248 (`cohortFailures()` fails a partial cohort by
design). Added `FA_DEPRECIATION_LEG_FOLD_0248_COHORT` and its `cohortFailures(...)` call, gated the
same way `FA_DEPRECIATION_0227_COHORT`'s own check is (`.filter((n) => liveNames.has(n))`, only
consulted when at least one name is live).

**Redo (#957) was used three times, and it is recorded here because the work order asks.** First,
after the leg-pairing fragment's own bug (the extracted core reads `p_charges`, not the old callers'
`v_res -> 'charges'`, so my first T.4 fragment-match was keyed on text that could never appear in
the new function — fixed by splitting the census into a `v_frag_full` and a source-independent
`v_frag_core`, before the migration ever applied cleanly the first time — this one was a plain
first-apply fix, not a redo). Then twice as genuine `CLARA_MIGRATION_REDO=0248_fa_depreciation_leg_fold`
redos: once to restore the two lost splices (the fix-round above), once more after two of the tail's
own explanatory comments named `pg_get_functiondef` literally inside a `do $tag$ … $tag$` block,
which `check-wiki-dynamic-sql` does not comment-mask (see "the lint finding" below) and which,
combined with the `'EXECUTE'` privilege-name literal T.7 already needed, made the tail look like an
unattributable change-of-record patch. The file carries an explicit redo branch in its prestate: if
the live poster already calls `clara._fa_depreciation_leg_pairing`, that is a redo of 0248 itself,
announced with a `raise notice` and admitted, skipping only the two RECUT pins (the five
non-regression pins are still checked every time) — the tail still re-proves the whole post-state
from scratch on every apply, redo or not. The new core's own `create function` is `create or
replace` for the same reason. Final `pnpm db:migrate` on this rig reports **1 new migration applied
· 231 total**.

## The lint finding (and why it is not the shared script's to fix)

`node scripts/check-wiki-dynamic-sql.mjs` (part of `pnpm lint`) initially failed:
`0248_fa_depreciation_leg_fold.sql:466 change-of-record patch → <unresolved target> — the INSTALLED
body runs dynamic SQL … EXECUTE`. Traced (via `wiki-lint-checks.mjs`'s own exported `parseFunctions`
/ `parseCoRPatches` / `dynamicSqlFindings`) to a real mechanical fact about the checker, not a false
alarm to route around: `maskComments`'s single top-level pass treats a whole `do $tag$ … $tag$`
block as one opaque dollar-quoted span and does not separately blank `--` comments **inside** it —
only a comment at the top level, before any `do` block, gets masked before the change-of-record scan
runs. My tail's own explanatory comments named `pg_get_functiondef` by its literal identifier
(describing 0042's and 0227's splice mechanism for a future reader), and the SAME block separately
needed the literal string `'EXECUTE'` for T.7's privilege check — together, exactly the two signals
`parseCoRPatches` looks for. Reworded both comments to describe the mechanism without the exact
token (see the migration file's own header and T.8 for the current wording); behaviour is unchanged,
`node scripts/check-wiki-dynamic-sql.mjs` now reports **1411 clara function definition(s) and 212
change-of-record patch(es) scanned, no dynamic wiki SQL outside the whitelist**, and the migration
was redone once more (above) to pick up the comment-only edit. Nothing in `scripts/wiki-lint-checks.mjs`
was touched — the fix is entirely in my own file's prose.

## Gates, with counts

| gate | command | result |
|---|---|---|
| new test file, focused (gate module NOT preloaded — final acceptance shape) | `node --test --test-concurrency=1 tests/fa-depreciation-leg-fold.test.mjs` | **4 pass · 0 fail · 0 skip** |
| new test file, full gate chain (52 `--import`) | `node --test --test-concurrency=1 $GATES tests/fa-depreciation-leg-fold.test.mjs` | **4 pass · 0 fail · 0 skip** |
| the #651 regression this ticket touches | `node --test --test-concurrency=1 tests/depreciation-history.test.mjs` | **19 pass · 0 fail · 0 skip** (was 17/19 mid-fix-round; see "the mistake I made" above) |
| the #972 regression sharing this migration file's neighbourhood | `node --test --test-concurrency=1 tests/fa-birth-watermark.test.mjs` | **3 pass · 0 fail · 0 skip** |
| SQL-function gates (added a new function) | `node --test --test-concurrency=1 tests/operation-census.test.mjs tests/rig-isolation.test.mjs` | **33 tests · 32 pass · 0 fail · 1 skip** (T19 destructive; reset flags never set) |
| gate-chain census + redo battery | `node --test --test-concurrency=1 tests/preintegration-gate-chain.test.mjs tests/migrate-redo.test.mjs` | **13 pass · 0 fail · 0 skip** |
| `pnpm lint` (worktree root) | — | **exit 0** |
| `pnpm typecheck` (worktree root) | — | **FAILS, inherited from BASE, in `apps/web`** (see below); `packages/runtime` alone: **Done**, 0 errors |
| `apps/web` unit suite / browser walks | not run | this branch touches **no** `apps/web` file (`git diff BASE..HEAD --stat -- apps/web` is empty) |
| `packages/runtime` checks | not run as separate commands | this branch touches no `packages/runtime` file; `pnpm lint` runs `check-frozen-workflows`/`check-frozen-evaluators` anyway — both green |

**The inherited typecheck red — the SAME one #972's own report names.**
`apps/web/components/documents/document-kind-dialog.tsx(95,22): error TS2552: Cannot find name
'DOCUMENT_KINDS'` and `(95,42): error TS7006: Parameter 'k' implicitly has an 'any' type`. The file
was last touched by `4b1376f4 merge: riders wave 1 lane 08`, an ancestor of BASE, and
`git diff 23cfad94..HEAD --stat -- apps/web` is completely empty — this branch has not touched
`apps/web` at all. This is the wave's integrated head not typechecking, not #973; #972's own report
(`wave2-lane04-ticket972.md`) already named the same file for the same reason.

**Vacuity control.** `p973.core.shape` is the anchor: it reds against 0227 alone (measured — the
frontier gate `assert.fail`s naming the missing stem before any of my code exists), and would red
against a vacuously-added, still-PUBLIC-executable routine (its own `acl`/`has_function_privilege`
assertions). The fix-round regression (`p651.period.closed_refused` / `p651.census.rerun_gate`
reddening, then greening after the splices were restored) is itself a real, measured red-then-green
cycle on the acceptance criteria's own "censuses pinning them stay green" clause, not a synthetic one
— recorded above rather than hidden.

## Docs

`packages/db/README.md`: the depreciation-history lane's residual (2) — `preview_depreciation_run`
duplicating the poster's aggregation — is rewritten as RESOLVED rather than named-and-hidden, and a
grants-table row documents the new ungranted core. `packages/db/tests/README.md` gains "The
depreciation leg-pairing fold (#973)": the four `p973.*` cells, the two splices the fix round
restored, the gate module's migration-order position, and that 0227's own T.13 is untouched and
still does its job at its own point in a from-scratch chain. No `CONTEXT.md` change: the migration's
own header states it coins no new domain vocabulary, and that holds — "leg pairing" is an
implementation detail of an internal core, not a term the business speaks. No `docs/PRD.md` or
`docs/ARCHITECTURE.md` change, and no blueprint drift found.

## Successor contract

**None.** #973 adds no door, no grant, no refusal token and no read; `preview_depreciation_run`'s
and `_fa_run_period_core`'s signatures and returned/posted shapes are byte-for-byte what they were.
No frozen chat or Work body needs anything: neither function is called from `packages/runtime`
except through the same two doors (`clara.run_depreciation_period_for`,
`clara.run_depreciation_manual`) that already existed, and their contracts are unchanged. Nothing is
owed to the shared `chatTurn_v22` / `claraWork_v6` cut at the end of wave 4.

## Follow-ups worth filing

1. **The two runtime splices on `clara._fa_run_period_core` are themselves a maintenance hazard.**
   Any FUTURE recut of this body (a third ticket, a wave-4 successor) faces the exact trap this one
   fell into: `grep`-ing the migrations directory for `create function clara._fa_run_period_core` or
   `create or replace function clara._fa_run_period_core` finds only 0041, and both later splices
   are invisible to that search. A short note in `packages/db/README.md`'s FA section pointing future
   recuts at 0042:4225-4361 and 0227:880-956 (or, better, a `packages/db/README.md` "how to recut a
   spliced body safely" convention section, since this is not the first ticket in this file's history
   to hit it — see 0227's own header line 197, which already knew about the two splices when it was
   written) would have caught my mistake before I wrote a line of SQL rather than after.
2. **`check-wiki-dynamic-sql`'s comment-masking gap inside `do` blocks is a real, reproducible false-
   positive surface**, not specific to this ticket: any future migration whose tail needs BOTH a
   `has_function_privilege(..., 'EXECUTE')`-style literal AND an explanatory comment mentioning
   `pg_get_functiondef` (a natural thing to write when documenting exactly this splice pattern, as
   this ticket needed to) will hit the same false positive. Worth deciding whether `maskComments`
   should recursively mask comments inside dollar-quoted `do` bodies, or whether the house convention
   should simply be "never spell `pg_get_functiondef` as a bare word in a migration comment" (documented
   somewhere a future author would find it before losing the same hour I did).
3. **The out-of-scope duplication the brief names explicitly** — the two fixed-asset particulars
   completion bodies (`complete_fixed_asset_particulars` / `complete_fixed_asset_particulars_for`) —
   is still open, filed separately per the brief's own "Out of scope" section.

## Anything unverified

- **Hosted: nothing.** Every figure here is local, on `clara_l04` at 127.0.0.1:55744.
- The **from-scratch** proof of 0248 (a chain 0001→0248 on a disposable cluster) is the
  integrator's; RIG.md forbids a second from-scratch chain on a lane cluster, so I did not run one.
  My prestate pins were measured on THIS rig's live catalog (0001..0234 + 0247 + this branch's own
  #972 commits), which is the closest a lane worker can get to that proof; the reasoning that a
  from-scratch chain would reach the identical pre-0248 state is stated in the migration's own
  comments but not independently re-run.
- `p973.core.pairs` calls the new core directly as root (the only way to reach an ungranted
  function at all); it is therefore evidence about the routine's OWN arithmetic, not about any
  persona's ability to reach it — that access question is exactly what `p973.core.shape`'s
  `has_function_privilege` checks answer instead.
