# wave-3 registry pin cells — finish report

Worktree: `clara-wt/integration3`, branch `integration/wave-3`, commit `4478a608`
(parent `b963edb8`). Not pushed.

On arrival the previous worker had already finished four files and left two
(`wave-7a-rt-blind-registry.test.mjs`, `wave-e-f9-chatturn-v10.test.mjs`)
apparently mid-edit per the brief. Re-reading every partial edit against the
reference shape (`tests/chatturn-v18.test.mjs`) found all six files already
internally consistent and complete — pin name `chatTurn_v19`, superseded list
gains `chatTurn_v18`, no cell weakened to "some version". No further edits
were needed; only verification.

## File → cell → change

- `f-a1-pr3a-consumers.test.mjs` (1 cell): pin cell title/body moved
  `chatTurn_v18` → `chatTurn_v19`; added `assert.equal(typeof
  registryMod.chatTurn_v18, "function")` to the superseded roster.
- `f-a2-pr2-post.test.mjs` (1 cell): pin assertion moved to `chatTurn_v19`;
  added a `chatTurn_v18` still-exported assertion; the former
  `chatTurn_v18 === workflows.chatTurn` identity check became
  `chatTurn_v19 === workflows.chatTurn`.
- `f-a3-pr3-chatturn-v14-registry.test.mjs` (1 cell): title and pin assertion
  moved to `chatTurn_v19`; v14's own "stays exported, IS its own function"
  claim untouched.
- `f-a6-pr2-freeform-unit.test.mjs` (1 cell): title and pin assertion moved to
  `chatTurn_v19`; v15's own claim untouched.
- `wave-7a-rt-blind-registry.test.mjs` (2 cells): pin cell retargeted to
  `entryChatTurnV19.chatTurn_v19` (new `chatTurn.v19.ts` import added); a new
  cell added asserting `chatTurn_v18` stays exported, ahead of the existing
  v17/v16/.../v8 roster.
- `wave-e-f9-chatturn-v10.test.mjs` (1 cell): title and pin assertion moved to
  `chatTurn_v19`; added `assert.equal(typeof registryMod.chatTurn_v18,
  "function")` ahead of the existing v17..v8 roster.

Counts: 6 files, 7 cells touched (6 pin cells retargeted + 1 new
still-exported cell in wave-7a), 0 cells re-cut or weakened.

## Other stale pins (step 2)

`grep -rn "chatTurn_v18\|claraWork_v2" packages/runtime/tests packages/db/tests
| grep -i "pin\|repoint\|registry"` surfaced no other stale registry-pin
assertion. The only extra hits were synthetic literal fixtures unrelated to
the live registry (`l9-build-info.test.mjs`'s pass-through unit tests,
`rollback-preflight.test.mjs`'s parametrized body-string tests) and one
already-correct file (`p6-1-chatturn-v16.test.mjs`, already pinning v19). A
prose comment in `scratch-image.mjs` ("today that is claraWork_v2 ->
claraWork_v1") is stale but is not an assertion — `deriveVersionPair` reads
the pin live off `registry.ts`, so nothing there is functionally wrong; left
untouched as out of scope.

## Verification

- `node --test` on all six touched files plus `registry-view.test.mjs` and
  `chatturn-v18.test.mjs` (PGHOST=127.0.0.1 PGPORT=55459 PGUSER=postgres
  PGDATABASE=clara_w3 CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1): 149 tests,
  149 pass, 0 fail, 0 skipped.
- `node scripts/check-frozen-workflows.mjs` (repo root): OK — 281 frozen
  files verified, 51 "use workflow" modules frozen+registered.
- `pnpm typecheck` (packages/runtime): clean.
- `pnpm lint` (packages/runtime): clean.

`git status` after commit: clean. `packages/runtime/workflows/*` and
`frozen-workflows.json` were not touched.
