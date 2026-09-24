# Wave 4 · lane 06 · ticket #1031 — Knowledge refuses a financial-year-end pair that cannot exist in the recorded month

**Status: DONE.** Branch `riders/w4-lane06`, worktree `C:\Users\zhant\Desktop\clara-wt\656`,
database `127.0.0.1:55746/clara_l06`. Base `cd2925391`.

No commit preceded mine on this lane branch (`git log cd2925391..HEAD` was empty at start,
confirmed by `git status`/`git log` before any change — matching the prompt's own "none yet"
statement about applied migrations). The ticket carries no comments (`gh issue view 1031
--comments` returns an empty `comments` array); its body IS the newest (and only) Agent Brief.
There is no owner ruling comment dated 2026-09-20 on this ticket (the WAVE-4 LANE RULES only name
one for #1032).

**The ticket was still live**, measured on this branch/database before any change: `financial_year_end_day`'s own catalogue label (`range:day_1_31`) has no cross-field awareness
(0240's own header says so explicitly), `clara._knowledge_assert_value(text,jsonb)` sees one key
and one value with no client to read a sibling from, and the pinned gap cell `fd.06`
(`knowledge-fye-day.test.mjs`) still asserted the DISAGREEMENT — Knowledge holding day 31 while
`clara.clients` held day 28 for the same client's February year end — as the measured, owed state.

## The seams I tested at (written before the first test)

The brief names the seams directly:

1. **The Knowledge capture door**, at both keys, in both possible capture orders (month-then-day,
   day-then-month) — the public seam `capture_knowledge`/`capture_knowledge_for` present to every
   caller.
2. **The catalogue rule's refusal vocabulary** — the SAME typed reason (`CLR37`,
   `fa_particulars_invalid`/`fy_end`) `clara.set_client_fy_end` (the client-row door) already uses,
   with both values named on the detail.
3. **The correction door**, `clara.correct_knowledge` — a second write path onto the same two keys
   that a rule living only in the capture core would silently miss.
4. **The onboarding-promotion path**, `clara.promote_plan_answers_to_knowledge` — unchanged in
   behaviour (AC3's own words), covered by the pre-existing `fd.05` cell, which nests the capture
   core and therefore inherits the rule for free.

Everything is exercised through the real public doors, never an internal collaborator — every cell
calls `clara.capture_knowledge`/`capture_knowledge_for`/`correct_knowledge`/`set_client_fy_end`
exactly as `knowledge-fye-day.test.mjs`'s existing cells already do, and expected values come from
`clara.set_client_fy_end`'s own live body (measured on this rig, not re-derived).

## Vertical slices, in order

Ticket order per the lane rules: `#1031` (this one) is first of three (`#1032`, `#1038` follow,
built by later implementers on this same branch).

| slice | the red I saw, for the right reason | the code that turned it green |
|---|---|---|
| investigation | Measured the live catalog: `select … from pg_proc where prosrc ilike '%_knowledge_assert_value(%'` returns exactly two callers, `clara._knowledge_capture_core` and `clara.correct_knowledge` — the whole write surface for either year-end key | (no code yet — this fixed the migration's scope: BOTH doors, not one) |
| migration | Prestate pinned both callers' LIVE pre-image `sha256(prosrc)`, measured on `clara_l06` via a direct `pg` connection (`2c8526b8…`, `968a205f…`), plus the neighbour bodies this file relies on but does not touch (`_knowledge_assert_value` `84fca940…`, `clara.set_client_fy_end` `d8aaadbb…`) | `migrations/0310_knowledge_fye_pair_wall.sql` — the new ungranted rule `clara._knowledge_assert_fye_pair`, spliced into both callers, applied once with `pnpm db:migrate` (a genuine first apply — no redo) |
| battery | `fd.06` rewritten to assert the OLD (disagreeing) outcome no longer holds; run against the finished migration it passed immediately, so the RED side of the loop was proved by a deliberate vacuity control instead (below), not by writing the assertion before the code existed | `knowledge-fye-day.test.mjs`: `fd.06` rewritten, `fd.07`–`fd.10` added, gated on a NEW, layered `pairCell`/`pairGate` (0310 on top of 0240) so `fd.01`–`fd.05` are untouched |
| census | `p654.census.not_a_posting_grant` (in `knowledge-firm-defaults.test.mjs`) failed immediately after the migration applied: `clara._knowledge_assert_fye_pair` is a genuine reader of `clara.knowledge_records` the closed-cohort census did not recognise (`actual: ['clara._knowledge_assert_fye_pair(uuid,text,jsonb)'], expected: []`) | declared it as a new, bimodal, positively-verified exception (`FYE_PAIR_WALL_0310_CONSUMERS`), the same shape #658's five 0230 reads already use |

**Vacuity control** (the work order's own substitute for a literal red-before-green cycle here,
since the migration and its cells were authored and applied as one unit): with the migration
already applied and green, I deliberately replaced the LIVE `clara._knowledge_assert_fye_pair` body
with a no-op (`CREATE OR REPLACE FUNCTION … BEGIN RETURN; END;`, revoke/security-definer/search_path
preserved) and reran `knowledge-fye-day.test.mjs`. Result: **6 pass / 4 fail** — `fd.06`, `fd.07`,
`fd.08` and `fd.10` (every cell asserting a REFUSAL) failed with `expected SQLSTATE CLR37 but the
call SUCCEEDED (no error)`, at exactly the lines the finished rule addresses; `fd.09` (which only
asserts ACCEPTANCE of a possible pair) stayed green, as it should against a no-op wall. I then
restored the function from `migrations/0310_knowledge_fye_pair_wall.sql`'s own `§A` block verbatim
and re-measured its `sha256(prosrc)`: **`1435d7ce166f22f2f4a5a73e7b1f4ae314b6acd9e33e29c5397fbe70939af38d`**,
identical before the break and after the restore. Reran the file: **10/10 pass** again.

## Acceptance criteria

| AC | verdict | evidence |
|---|---|---|
| A cell captures month 2 then day 31 and is refused with the client-row door's own typed reason; the same for day 31 with a 30-day month | **done** | `fd.06` (month 2 → day 31, `CLR37`, `detail.reason === "fa_particulars_invalid"`, `detail.axis === "fy_end"`, `detail.month === 2`, `detail.day === 31`) and `fd.07` (month 4, April, 30 days → day 31, same reason/axis, `detail.month === 4`, `detail.day === 31`). Both PASS. |
| A cell captures day 31 then month 2 and sees the disclosed outcome the catalogue rule prescribes (refusal or a cleared day with a reason), never a silent pair | **done — refusal, named as the chosen outcome** | `fd.08`: day 31 captured alone first (succeeds — 0240's own unconstrained-alone posture, unchanged, nothing to compare against yet), then month 2 is REFUSED the same way (`CLR37`/`fa_particulars_invalid`/`fy_end`, `month:2, day:31`), and the cell asserts the day is untouched (still 31, one live row) and the month never landed (zero live rows) — no silent clear of the sibling. **Why refusal and not a clear**: the catalogue has no existing mechanism anywhere for one key's capture to reach in and clear or rewrite a SIBLING key's own live record; every capture door today either writes the one record it was asked to write or refuses. Inventing a "clear the day, disclose why" pathway would be new machinery for this one pair; refusal reuses the exact posture `_knowledge_assert_value` already keeps for a syntactically-valid-but-wrong value. Recorded in the migration's own header ("THE CHOICE THIS FILE MAKES, NAMED") and the README section, per the brief's own "say which." |
| A possible pair (for example month 6 and day 30) is accepted, and the committed onboarding pair still promotes to equal the client row | **done** | `fd.09`: month 6 → day 30 in one client, day 30 → month 6 in a second (both capture orders, both `status: "captured"`). Promotion: pre-existing `fd.05` (month 6, day 20 — unedited, still PASSES unchanged, since a possible pair is untouched by the new wall) proves the promotion path — which nests `_knowledge_capture_core` and therefore the new rule for free — still equals the client row exactly (`byKey.financial_year_end_day === client.rows[0].fy_end_day`). |
| The pinned gap cell from the fix round (`fd.06`) is rewritten to assert the correct outcome and passes; it failed before the fix for the right reason | **done** | `fd.06` rewritten in place (same cell name prefix, new title and body): captures month 2, then asserts the day-31 capture is REFUSED (not merely that a later `setFyEnd` disagrees), asserts nothing landed, then proves the CONTROL — day 28 (the real last day of February) is accepted by BOTH doors and Knowledge/the client row now hold the identical value. "Failed before the fix, for the right reason": proved by the vacuity control above (6/10 pass with the rule broken, the 4 failures every one a `fd.06`/`fd.07`/`fd.08`/`fd.10` refusal assertion, all at the predicted `assertRaises` line) rather than a literal pre-implementation run, since the migration and its battery were authored as one slice — disclosed rather than glossed over. |
| Ships as a new migration at the next free number; no applied migration is edited; every recut body is pinned by a sha measured on the rig | **done** | `migrations/0310_knowledge_fye_pair_wall.sql` — 0310 was reserved for this ticket and free (`ls migrations \| grep -E "^03"` returned nothing before this file). No applied migration touched: `0041`, `0192`, `0220`, `0240` and every other file under `migrations/` are unedited (`git status` shows the migration as the only NEW file there). Every recut body pinned: `_knowledge_capture_core` (`2c8526b82d54ac0aa49c77c3be277be5ecd9cad73df0fec63908d67a0681b01b`) and `correct_knowledge` (`968a205f2f7ccc5ac286ea0edd73dc693dcede97c2475c7cb35b9241ea1ee33d`), both MEASURED on `clara_l06` via a direct `pg` query immediately before writing the prestate — never copied from another migration's header. Two neighbour bodies pinned `unmoved`: `_knowledge_assert_value` (`84fca940b4d520dc6d4291cd629e526507d31595103badc10c4382872d1b90d5`) and `clara.set_client_fy_end` (`d8aaadbb0fe715c1f90bee8e52273a231c49c25cbee1fd56e8d6d1b80fe5f72a`) — the tail re-measures both and refuses if either moved. |

### Out of scope, honored

- `clara.set_client_fy_end` and `clara.clients`' own `ck_clients_fy_end` CHECK (0041): untouched —
  the tail's `unmoved` pin on `set_client_fy_end` proves it byte-for-byte.
- Reading `financial_year_end_day` out of Knowledge anywhere new: the new rule reads the sibling row
  directly, inside the SECURITY DEFINER write path of the two existing write doors — no new SELECT
  surface reachable from any application role (the tail proves `_knowledge_assert_fye_pair` itself
  is granted to nobody, including every named application role).

## Migration

**`migrations/0310_knowledge_fye_pair_wall.sql`.** Adds ONE new ungranted rule,
`clara._knowledge_assert_fye_pair(p_client uuid, p_knowledge_key text, p_value jsonb)` — a no-op for
every key but `financial_year_end_month`/`financial_year_end_day` and a no-op at firm scope (D8's
own wall already refuses a firm-scope capture of either key before a live client-scoped sibling
could exist). Given a client scope and a live sibling, it judges the pair with
`clara.set_client_fy_end`'s own calendar rule (0041:3255-3258), copied verbatim. Recuts (full
`CREATE OR REPLACE`, not a runtime splice) `clara._knowledge_capture_core` and
`clara.correct_knowledge`, each gaining one `perform clara._knowledge_assert_fye_pair(...)` line
immediately after its existing `_knowledge_assert_value` call — the two bodies the migration
header's own grep measured as the WHOLE write surface for either key.

**Prestate pins, measured on `clara_l06` (this rig) immediately before authoring, via a direct `pg`
connection — never transcribed from another migration's header:**

| signature | kind | sha256(prosrc) |
|---|---|---|
| `clara._knowledge_capture_core(uuid,text,uuid,text,jsonb,jsonb,date,date,text,text,jsonb,uuid,text,text,text,text)` | recut | `2c8526b82d54ac0aa49c77c3be277be5ecd9cad73df0fec63908d67a0681b01b` |
| `clara.correct_knowledge(uuid,jsonb,text,text,text,text,jsonb)` | recut | `968a205f2f7ccc5ac286ea0edd73dc693dcede97c2475c7cb35b9241ea1ee33d` |
| `clara._knowledge_assert_value(text,jsonb)` | unmoved (neighbour) | `84fca940b4d520dc6d4291cd629e526507d31595103badc10c4382872d1b90d5` |
| `clara.set_client_fy_end(uuid,integer,integer,text)` | unmoved (non-regression) | `d8aaadbb0fe715c1f90bee8e52273a231c49c25cbee1fd56e8d6d1b80fe5f72a` |

Applied with `pnpm db:migrate` from `packages/db` — a genuine first apply (`applied
0310_knowledge_fye_pair_wall`, `290 total`), no `CLARA_MIGRATION_REDO` needed at any point, so no
redo to record.

**Successor contract:** none. This ticket touches no frozen chat or Work-tool body; the new rule is
an internal write-path guard with no door, no zod input and no prompt stanza of its own.

## Gates, with counts

- **Test files touched, run with the full gate chain** (`node --test --test-concurrency=1 $GATES
  <files>`, `$GATES` = every `--import ./tests/*-preintegration-gate.mjs` flag in
  `packages/db/package.json`'s `test` script, including the new `fye-pair-wall-preintegration-gate.mjs`):
  - `tests/knowledge-fye-day.test.mjs` — **10/10 pass** (`fd.01`–`fd.05` unchanged; `fd.06`
    rewritten; `fd.07`–`fd.10` new).
  - `tests/knowledge-firm-defaults.test.mjs` — **21/21 pass** (after declaring the new census
    exception).
  - `tests/knowledge-onboarding-promotion.test.mjs` — **34/34 pass** (unedited; run to confirm no
    regression on the shared `_knowledge_capture_core` recut — the promotion door nests it).
- **`tests/operation-census.test.mjs`** — **10/10 pass** (`opcen.1`–`opcen.10`, including every
  positive control), run AFTER the `rig-meta.mjs` cohort edit.
- **`tests/rig-isolation.test.mjs`** — **22 pass / 1 skip** (T19's own destructive reset skip,
  unconditional and expected — never run with `CLARA_RIG_ALLOW_RESET`), including T17 (the exact
  per-role grant matrix) and T18 (SECURITY DEFINER/owner/search_path + FORCE RLS census).
- **`pnpm typecheck`** (repo root) — **apps/web: Done, packages/runtime: Done.** (One genuine,
  ticket-unrelated environment gap fixed along the way: this worktree's `node_modules` was missing
  `@shadcn/react` and nine other packages already pinned in `pnpm-lock.yaml` since #970 —
  `next build`/`tsc` failed on `Module not found: Can't resolve '@shadcn/react/message-scroller'`
  before any change of mine. Fixed with `pnpm install --frozen-lockfile` in this worktree only
  — confirmed `node_modules` is this worktree's own directory via `readlink -f node_modules` and
  `git worktree list`, no lockfile or package.json edit. The SAME gap, same fix, is already recorded
  in `reports/wave4-lane02-ticket930.md`.)
- **`pnpm lint`** (repo root) — exit 0, whole repo, no findings.
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** (the runner's own env, wave-3 addendum rule) — exit 0.
- `packages/runtime` was not touched — `check-frozen-workflows.mjs` /
  `check-parts-parity.mjs` do not apply, not run.
- `apps/web` was not touched (this ticket's whole diff is under `packages/db`) — the whole web unit
  suite and browser walks do not apply, not run. (Only `node_modules` was refreshed there, an
  environment fix, not a source change.)

## Docs

- `packages/db/README.md`: new section `## 0310 — Knowledge refuses a financial-year-end pair that
  cannot be a real calendar day (#1031, riders wave 4, lane 06)` — the gap, the one new rule and why
  both write doors consult it, the "say which" choice (refusal, not a silent clear), what the file
  deliberately does not do, the negative-census exception it needed, the migration triad, and the
  redo-safety note.
- `CONTEXT.md`: **no entry added, by design** — checked first (`grep -n "financial year\|fy_end" CONTEXT.md`
  returns nothing naming this concept). 0240 itself minted no CONTEXT.md term for the same reason
  its own header states: the financial year end is existing vocabulary (D7, `clara.clients.fy_end_*`
  since 0041); this ticket only closes a validation gap on it and coins no new noun.
- `docs/PROGRESS.md`: not touched — outside a single ticket's report (addendum rule 10).

## Follow-ups worth filing

- None new. The follow-up #898's own fix round left ("the disagreement is owed") is what this
  ticket closes; nothing further is owed on this specific gap.

## Anything unverified

- A full-repository `pnpm test` sweep of `packages/db` (every test file, not only the ones this
  ticket touched or the two gates the work order names) was started as extra diligence, to catch any
  regression the shared-file edits (`package.json`'s gate-chain position, `rig-meta.mjs`'s new
  cohort) might cause elsewhere. It had not finished by the time this report was written (the
  package's full suite is large — `operation-census.test.mjs` alone runs ~50s and `rig-isolation`'s
  T17 grant-matrix cell ~42s; dozens of other files precede/follow them). The two gates the work
  order explicitly requires (`operation-census.test.mjs`, `rig-isolation.test.mjs`) DID complete and
  are green, reported above with counts.
- `clara._knowledge_assert_fye_pair`'s read of `clara.knowledge_records` was NOT separately load- or
  concurrency-tested (e.g., two writers racing month and day for the same client at once). The
  existing supersession lock (`select … for update` inside `_knowledge_capture_core`, unmoved by
  this file) still serialises the EVENTUAL write each writer attempts, but the pair rule's own read
  of the sibling runs before that lock is taken, so a genuine race between "capture month" and
  "capture day" for the same client could, in principle, read a slightly stale sibling. Given both
  keys individually still pass their own `range:*` check and the client row's own door (unmoved)
  remains the final, always-consulted authority when a Work later depends on `fy_end_month`/`fy_end_day`,
  this is a narrower window than the gap #1031 closes, not a new one it opens — but it was not driven
  under an actual concurrent test and is stated rather than claimed.
