# Wave 3, lane 07, ticket #899 — the client birth wall (the two remaining entrances)

Branch `riders/w3-lane07`, worktree `C:\Users\zhant\Desktop\clara-wt\657`, base
`ffe63a0dd084e99b84c1368119845be273c421ce`. Commits on this branch (only #899's, this lane's first
ticket — nothing landed ahead of it):

- `df415469f` `feat(db): #899 the client birth wall -- 0287 folds the collision read into the door`
- `1494cdd98` `feat(web): #899 the register control and the command palette both route through the new birth verb`
- `89baede04` `test(web-e2e): #899 every fixture answering the birth door follows its rename to open_client_onboarding`

## Resume note (this session inherited an interrupted pass)

An earlier implementer of this ticket was cut off by a usage limit before any commit, leaving the
migration written and applied to `clara_l07`, and 17 files of web/db test wiring uncommitted (20
files total: 17 modified + 3 new). I read every hunk on its merits before doing anything else:

- `git log ffe63a0dd0..HEAD` was empty (no landed commits on this branch) — consistent with #899
  being this lane's first ticket, not a redo of someone else's landed slice.
- `packages/db/tests/client-birth-wall.test.mjs` ran 11/11 green on first try, against the
  already-applied migration.
- The migration's own header, the census cell, and every web-side rename were internally
  consistent and well-evidenced (each design choice — leaving `create_client` untouched, not
  walling arity 1 on `begin_client_onboarding` — cites a measured fixture shape, not a guess).

I judged the inherited work sound and kept it, then found and closed two real gaps before
reporting (below): one pre-existing test file the rename had silently broken, and one behavioural
claim in a README that the code did not yet have a cell driving.

Verified still live on this branch before building: `gh issue view 899 --comments` (2 comments,
re-read in full — both AI-triage, dated 2026-09-17 and 2026-09-19; no owner-ruling comment dated
2026-09-20 on #899 itself). The 2026-09-19 comment is newest and binding: it narrows scope to
exactly the two entrances closed here (the palette's direct `begin_client_onboarding` call, and
`create_client`'s live grant) and explicitly rules the arity ladder itself out of scope.

## The seams tested at

Per the Agent Brief's "Key interfaces":

- `clara.open_client_onboarding` (new door) and `clara.begin_client_onboarding` (re-pointed door)
  — both driven through `humanQuery`, a real per-role session under real RLS, never a copy of the
  wall.
- `clara.client_identity_candidates` — driven as the independent source of truth the doors are
  compared against, never re-derived.
- The live catalogue itself (`pg_proc` / `aclexplode`) — the census's own subject.
- `apps/web/lib/onboarding/api.ts`'s `openClientOnboarding` wrapper, `do-dispatch.ts`'s
  `"beginClientOnboarding"` case, `AddClientControl`'s Confirm, and the real `CommandPalette`
  component — driven through the real fetch/RPC boundary (mocked at PostgREST, everything above it
  real), never a private call into a lower layer.

## Acceptance criteria, with evidence

**AC1 — "A cell proves the new verb refuses at two or more with the same token and rows the read
returns, called with no prior read."**
`client-birth-wall.test.mjs`'s `p899.new_verb.arity_two_no_prior_read` — PASS. Reads
`client_identity_candidates` separately as the independent comparison, then calls
`open_client_onboarding` directly (no prior read in that cell), asserts the same CLR10
`name_family_collision`, the same arity, the same candidate ids sorted, and that the client count
is unchanged.

**AC2 — "A cell proves an unacknowledged arity-one call is refused and the acknowledged one
succeeds."**
`p899.new_verb.arity_one_unacknowledged_refused` — PASS (no ack refuses `identity_
acknowledgement_required`; a WRONG id — not the one the read returned — refuses the same way).
`p899.new_verb.arity_one_acknowledged_succeeds` — PASS (naming the read's own candidate id
creates a NEW client, distinct from the acknowledged one).

**AC3 — "A census cell, derived from the live catalogue, proves no granted human role can reach a
client-minting verb that lacks the wall."**
`p899.census.granted_client_minters_have_wall_except_create_client` — PASS. Sweeps `pg_proc` ×
`aclexplode` for every EXECUTE grant to `clara_authenticated`/`clara_runtime`/`clara_agent_ro`/
both wake roles, matches on the literal `insert into clara.clients(` OR a call to
`_client_birth_core(` (the second shape exists because §A of 0287 moved the literal insert out of
both granted doors into the one ungranted core they delegate to), asserts the minter set is exactly
`{begin_client_onboarding, create_client, open_client_onboarding}`, and asserts the unwalled subset
is exactly `{create_client}`. `p899.census.create_client_documented_exception` — PASS, proves
`create_client` still creates two same-family clients silently (the residual, named and evidenced
rather than left silent). A belt cell also asserts `_client_birth_core` itself holds zero
application-role grants.

**AC4 — "A surface cell proves the palette cannot create a two-match client; a walk covers the
arity-one path."**

| Claim | Evidence |
|---|---|
| Palette, arity ≥ 2, no prior read: door's own CLR10 `name_family_collision` propagates verbatim, one call, no navigation | `do-actions.test.ts`: "#899: the palette cannot create a two-match client…" — PASS |
| Palette, arity 1, no acknowledgement face: door's own CLR10 `identity_acknowledgement_required` propagates verbatim (message names the register's control), one call | `do-actions.test.ts`: "#899: the palette cannot create a one-match client silently either…" (added this session) — PASS |
| Same two refusals, through the REAL `CommandPalette` component and real DOM | `command-do.test.tsx`: "a permitted row renders…" and "a DoorRefusal renders VERBATIM…" — PASS (fixed this session; see "What I found and fixed" below) |
| Register control, arity 1: candidate shown, Confirm disabled until acknowledged, acknowledging navigates to the new client — **the arity-one walk** | `client-create-walk.spec.ts`: "client-create.walk.identity: arity 1 SHOWS the candidate…" — PASS, unmodified, exercised against the renamed fixture on lane 07's own Playwright triple |
| Register control, arity ≥ 2, and the register + palette both dispatching through the SAME door | `client-create-walk.spec.ts` (arity ≥ 2 arm) and `agentic-finish-walk.spec.ts`'s 裁-37 / H-51 arms — PASS |

**AC5 — "Applies from scratch with a tail census."**
Applied to `clara_l07` via `pnpm db:migrate` (by the interrupted prior pass, before this session
started): `select version from clara.schema_migrations` names `0287_client_birth_wall`; total
migration count 268 (267 baseline + this one, matching RIG.md's wave-3 baseline of 267 files). The
tail (§E, five checks: both new signatures resolve, posture/ACL of `_client_birth_core` and
`open_client_onboarding`, `begin_client_onboarding`'s preserved ACL and delegation, the two
byte-identical unmoved pins, the empty five-role `name_family_*` census) is embedded in the applied
file and would have aborted the apply had any check failed — the live `client-birth-wall.test.mjs`
census cells independently re-measure the same facts and are green. I did not personally run a
from-scratch 0001→0287 chain; RIG.md reserves that proof for the integrator on a disposable
cluster, and lanes never re-run it.

## Migration

`packages/db/migrations/0287_client_birth_wall.sql` (number reserved for this ticket; used). I made
no edits to this file — inherited already-applied and judged correct on review (see "Resume note").

**Prestate pins**, as measured and pinned in the file (this lane's first ticket — nothing recut
ahead of it):

- `clara.create_client(text,text)` — `7e8ff7f247ee14021f447f5a95da8a413b782aa97a99786fdac6e6d8bd297edf`
- `clara.client_identity_candidates(text,jsonb)` — `70943a15d68f7ef5712704bb7b68c1a8ea17baeb8b7b241cf079283ef1d6f7f2`
- `clara._human_ctx(integer)` — `d1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46`
- `clara._reserve_op(uuid,text,text,bytea)` — `8816acb44d8c14980d21d8cdf19dc249f876f4bb49b39ca99b1f6fb915fe64b4`
- `clara._finish_op(uuid,text,text,jsonb)` — `c2beaa13c9c24ccce516f19552328b7d50272e5caedc8a9913cfd67af743d13e`
- `clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)` — `000c730cd29d6544b014ecb0635fc30d9a238f23cdbd8d224ae8f4331086e2f1`
- `clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)` — `7f7d63ee3082c25747f33073614eda108cedcc8670284d409e306da05f0cd15a`
- `clara._hash(jsonb)` — `421483aadaa5989455a40f9c429dac3885dcd4b99056f0f2b66038ad54152547`
- `clara._onboarding_plan_snapshot(uuid)` — `ec5f03902d01d9268c7d4adbed8e69b50693041a77e593b8c5b818a8043e505f`
- Bimodal pin on `clara.begin_client_onboarding(text,text)`: FIRST apply requires
  `1b0cfc0676f08d20d3d79cbca62a7491b9ff7b928e6fed25449da17c4531cf09`; REDO branch is taken when the
  live body already contains `_client_birth_core`.

**Change:** `clara._client_birth_core` (ungranted, folds `client_identity_candidates` ahead of the
insert, reserves the op before the wall); `clara.open_client_onboarding` (NEW, admin floor, grants
to `clara_authenticated`, `p_require_ack_at_one = true`); `clara.begin_client_onboarding`
(`create or replace`, ACL preserved, `p_require_ack_at_one = false`). `create_client` is untouched
— body and grant both — the one documented, tested exception (see the migration's own header and
`packages/db/README.md`'s new section for the full argument: `buildWorld()`/`buildWaveBWorld()` and
`name-only-guard.test.mjs` all construct same-family siblings through it by fixture convention, and
48+ test files reach it through `rig-fixtures.mjs`'s `createClient()` helper).

**Redo path:** I did not edit this file, so I did not need `CLARA_MIGRATION_REDO`. The file's own
header states the interrupted prior pass exercised its redo path once already (a bare `create
function` and a wrong reservation-order defect were caught and fixed that way, on this same lane
database, before this session started) — I did not independently reproduce that history; I verified
the file's CURRENT, live state directly (schema_migrations, both new signatures resolving, all 11
`client-birth-wall.test.mjs` cells including the posture/ACL assertions).

## Docs

- `packages/db/README.md` — new `## The client birth wall (0287, #899)` section; corrected the
  stale "What the wall is not" paragraph in the 0219 section (it described the now-closed residual
  as current).
- `packages/db/tests/README.md` — corrected the stale `p649.identity.direct_birth_residual` bullet
  (it asserted the residual instead of its closure); added a `## client-birth-wall.test.mjs (0287,
  #899)` section.
- `apps/web/README.md` — "Creating a client, and the two facts the commit does not write" section:
  renamed the door throughout, and rewrote the two paragraphs that named the now-closed residuals
  ("The wall is the READ, not the birth door" and "⌘K is a SECOND entrance… and it does not ask")
  to state what #899 closed and how the palette's arity-1 case actually behaves now (refused, not
  silently created — see "What I found and fixed" below for how that specific claim was caught).
- `CONTEXT.md` — not touched. No new domain vocabulary: this ticket moves where an existing concept
  (**Client identity candidate**, already defined) is enforced; it mints no new noun a person would
  need to look up.
- `packages/db/tests/rig-meta.mjs` — one minimal hunk (per the work order's shared-file rule):
  `CLIENT_BIRTH_WALL_0287_HUMAN_FNS = ["open_client_onboarding"]`, its cohort, and a
  `grantMatrixFailures()` bimodal check, at the sorted position beside the neighbouring `#960`/0270
  block.

## What I found and fixed (beyond the inherited work)

1. **`packages/db/tests/client-birth-wall.test.mjs` imported `PG` from `rig-fixtures.mjs` and never
   used it** — caught by `CI=true GITHUB_ACTIONS=true pnpm lint` (`no-unused-vars`). Removed the
   import; re-ran the file (still 11/11) and the db lint chain (clean).
2. **`apps/web/components/command/command-do.test.tsx`, an EXISTING test file the inherited pass
   did not touch, mocked `/rpc/begin_client_onboarding` directly** (not through a shared fixture
   constant) and went red against the renamed door — the whole-suite run
   (`node scripts/run-tests.mjs`) caught two failures: `timed out waiting for the door call` /
   `timed out waiting for the verbatim refusal`, both citing `unexpected fetch: .../rpc/open_
   client_onboarding`. Fixed by renaming its five `begin_client_onboarding` references to
   `open_client_onboarding`, matching the convention every other touched test file in this ticket
   already used. Re-ran standalone (4/4 pass) and the whole suite again (0 fail).
3. **A factual slip in my own first draft of `apps/web/README.md`.** I initially wrote that the
   palette's arity-1 case "still creates" (reasoning from the LEGACY door's unchanged arity-1
   behaviour). That is wrong for the palette specifically: the palette routes through `open_client_
   onboarding`, which passes `p_require_ack_at_one = true` unconditionally, so an unacknowledged
   arity-1 call from the palette is refused (`identity_acknowledgement_required`), not created.
   Per the wave-3 addendum ("a door's behaviour is asserted only after it was driven"), I did not
   leave that sentence resting on reasoning alone: I added the `do-actions.test.ts` cell listed
   under AC4 above, which drives exactly that call shape (arity 1, `p_acknowledged_candidate: null`,
   through `open_client_onboarding`) and observes the refusal and its message, then corrected the
   README to match what the new cell actually proved.

## Gates, with counts

- **`client-birth-wall.test.mjs`** (new), full gate chain preloaded: 11/11 pass.
- **`client-onboarding-identity.test.mjs`** (touched — `p649.identity.direct_birth_residual`
  recut), full gate chain preloaded: 13/13 pass.
- **`wave-b/wb-g-opkeys.test.mjs`** (touched — new `RESERVE_LAW_EXEMPT` entry), full gate chain
  preloaded: 2/2 pass.
- **`wave-b/wb-o-lifecycle.test.mjs`** (uses `wb-fixtures.mjs`'s recut `onboardingClient()`; ran as
  a sanity check though not independently touched by name), full gate chain preloaded: 19/19 pass.
- **`operation-census.test.mjs`** (added SQL functions): 10/10 pass (opcen.1–opcen.10), full gate
  chain preloaded, never with reset flags.
- **`rig-isolation.test.mjs`** (added SQL functions, including a grant matrix change): 22 pass, 1
  skipped (T19, the destructive poison-role drill — `CLARA_RIG_ALLOW_RESET` correctly never set),
  0 fail, full gate chain preloaded.
- **`pnpm typecheck`** (root): exit 0 — `apps/web` and `packages/runtime` both "Done".
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** (root, wave-3 addendum rule): exit 0 across
  `packages/db`, `packages/runtime`, `packages/reporting-render` on a combined run; `apps/web`'s
  step hit this host's own memory contention twice on the combined run (`Fatal process out of
  memory: Zone`, the same class of Windows host-contention RIG.md documents for `next build`) —
  verified clean by running `eslint .` standalone (with a raised `--max-old-space-size` to rule out
  a real regression, not to mask one — it passed with zero findings) plus each of the five
  remaining `apps/web` lint-chain scripts (`check-token-contrast.mjs`,
  `check-test-manifest[.selftest].mjs`, `check-message-keys[.selftest].mjs`,
  `check-ui-add-guard.selftest.mjs`) individually, all green.
- **Whole `apps/web` unit suite** (`node scripts/run-tests.mjs`, apps/web touched): 4848 tests,
  4846 pass, 0 fail, 2 skip (pre-existing, unrelated — present identically before and after this
  session's changes).
- **Browser walks touched, on lane 07's own Playwright triple**
  (`https://127.0.0.1:3560` / `3561` / `3562`):
  - `client-create-walk.spec.ts` — 4/4 pass (arity 0/1/2 identity walk, the 320px/zoom/reduced-
    motion reach walk, the keyboard walk).
  - `home-board-walk.spec.ts` — 28/28 pass (includes the touched `p659.home.zero_client_create`).
  - `agentic-finish-walk.spec.ts` — 9/9 pass (includes 裁-37's palette arm and H-51/CB-AE2E-024's
    register-control arm).
- `packages/runtime` was not touched — no `check-frozen-workflows.mjs` /
  `check-parts-parity.mjs` owed.

## Successor contract

None. #899 adds no door, room, part or prompt stanza a frozen chat/Work tool would need. The
frozen `clientOnboarding.v1`–`.v5` and `interview.v4.known` workflow bodies still call
`clara.begin_client_onboarding` directly, unmodified and untouched by this ticket; their behaviour
at arity 0 (the only arity any measured runtime caller on this branch constructs — `rig-fixtures.mjs`,
`wave-b/wb-fixtures.mjs` and its test files, `interview-e2e.mjs`, `interview-kill-resume-e2e.mjs`,
`opening-ledger-source-e2e.mjs`, `kdoc-opening-tb-e2e.test.mjs`) is unchanged by 0287.

## Follow-ups worth filing

- **`create_client`'s residual is real and is not this ticket's to close.** Closing it needs
  migrating the 48+ test files that reach it through `rig-fixtures.mjs`'s `createClient()` helper
  onto `open_client_onboarding` (or rewriting that fixture's naming convention so it stops
  manufacturing same-family collisions by construction) before the body or grant can safely move.
  Named and tested here (`p899.census.create_client_documented_exception`), not attempted —
  exactly the migration's own header's stated scope boundary.
- No other follow-up. The ticket's own "out of scope" (the arity ladder itself, a client-side
  duplicate heuristic, widening the family predicate) is respected untouched.

## Anything unverified

- I did not run a from-scratch `0001→0287` migration chain myself (RIG.md: the integrator's job on
  a disposable cluster, not a lane's).
- The claim in `0287_client_birth_wall.sql`'s own header that its first cut used a bare `create
  function` and the wrong reservation order, both caught and fixed via the `#957` redo path — this
  describes the interrupted prior pass's own development history before this session started. I
  did not reproduce it; I verified the file's CURRENT applied state directly instead (see
  "Redo path" above).
- `packages/db/tests/wave-b/wb-fixtures.mjs`'s `onboardingClient()` rename (random hex moved into
  the leading token) was judged correct by reasoning plus the green `wb-o-lifecycle.test.mjs` run;
  I did not additionally run every OTHER wave-b file that calls it (only the two the work order's
  gate rule names as "touched": the file itself has no `.test.mjs` suffix, so it is exercised
  indirectly through its callers — `wb-g-opkeys.test.mjs` and `wb-o-lifecycle.test.mjs`, both run).
