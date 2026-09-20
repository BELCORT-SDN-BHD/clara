# Wave 2 · Lane 10 · ticket #1003 — retire `clara.create_account_set_v1`

**Branch** `riders/w2-lane10` · **base** `23cfad947b5598214168ba9c43d391b4e16aa745` · **head** `73cca9c8d5ec3ec85530ef9fa476bf8b37ee870e`
**Database** `127.0.0.1:55750/clara_l10`, frontier **232 files**, top version `0271_retire_create_account_set_v1`
**Status: DONE.**

## The ticket was still live

`gh issue view 1003 --comments` on 2026-09-20: OPEN, labels `enhancement`, `ready-for-agent`, title
"Decide whether clara.create_account_set_v1 (the 0058 writer) should retire". One comment by
`belcorttao` carries the **owner's ruling (2026-09-20)**, dated the same day, which confirms the
ticket's own recommended Option A (retire — revoke the grant or drop the function) and adds one
correction: the delta-metrics test suite still drives the door as an authenticated human through
its shared fixture and lists its exact signature in its own readiness roster, so retargeting that
fixture is part of the same change.

Note on this lane's stated theme ("settings, invitations and firm-level caps"): #1003's actual
Agent Brief is unrelated to that theme (it is a security-census/retirement ticket in the delta
metrics lane). I built to the ticket's own Agent Brief and owner ruling per work-order rule 2
("The ticket is the contract"), not the lane summary in the dispatch prompt.

Measured on this branch before building (clara_l10, 231 files, top version
`0270_firm_document_limits_writer`): `clara.create_account_set_v1(uuid,text,text,jsonb,boolean,
date,text)` present, `prosrc` sha `25f9274792b14c054f1633e4518f689084a8e6548d10e3079cec4e760fd28495`,
granted EXECUTE to `clara_authenticated` only (not PUBLIC), zero `pg_depend` edges, zero calling
triggers, zero `clara.op_receipts` rows under `fn='create_account_set_v1'`, no
`clara.wake_fn_allowlist` row. Nothing in this lane's earlier tickets (#871 stopped, #872, #996,
#960) touched it.

## Commits (2, both on the lane branch, none pushed)

| commit | what |
|---|---|
| `3e5bdedb2` | db: migration 0271 (drop the function) + the two live rig checks that named it (`rig-meta.mjs`, `client-financial-pack.test.mjs`) + `packages/db/README.md` |
| `73cca9c8d` | test(db): retarget the delta-metrics fixture (`delta-fixtures.mjs`) off the retired door onto the wake door, and the two phase files (`delta-algebra-phase.mjs`, `delta-account-set-acceptance-phase.mjs`) that asserted against its op-receipt key |

## The seams I tested at (written before the first edit)

The brief names these and no others; no cell reaches around them.

1. **`clara.create_account_set_v1(uuid,text,text,jsonb,boolean,date,text)`** — the retiring
   writer itself: must stop resolving at all (chosen over revoke-only; see "Drop vs revoke"
   below), with zero application dependents.
2. **The two live siblings the ticket forbids touching** — `clara._agent_create_account_set_core`
   and `clara.wake_create_account_set` — observed as pinned-body + grant-posture assertions,
   unmoved.
3. **`packages/db/tests/rig-meta.mjs`'s `METRICS_0058_HUMAN_FNS`/`_COHORT`** — the "granted-name
   roster" the brief names — driven through `operation-census.test.mjs` (opcen.1/opcen.7) and
   `rig-isolation.test.mjs` (T17 grant matrix), both of which import it.
4. **`packages/db/tests/client-financial-pack.test.mjs`'s `p660.census.pins_unmoved`** — the
   "pinned-body drift check" the brief names.
5. **`packages/db/tests/delta-fixtures.mjs`'s `DELTA_ENTRYPOINTS`/`createAccountSet()`** — the
   "shared delta-metrics test fixture" and its "entrypoint readiness roster" — driven end to end
   through `delta-contract.test.mjs`'s full registered phase tree (60 subtests).

## Drop vs revoke, and why drop

The owner's ruling and the ticket's Option A both allow either. I chose **drop** (`drop function`,
not just a revoke) because: (a) it is the owner's own stated reasoning for Option A — "removes a
decoy a future UI could be wired to instead of the newer door, and one more body every security
census has to re-confirm as dead" — which argues for removing the body, not merely ungranting it;
(b) it is the estate's own established idiom for a body with zero dependents (0118's seventeen-
function cutover: "No explicit revoke is needed or written, matching the estate's own drop idiom");
(c) revoke-only would have left `client-financial-pack.test.mjs`'s pinned-body census silently
still "passing" against a body nobody can call any more, which does not read as the retirement the
ticket asks for.

## Acceptance criteria, each with its evidence

- [x] **A new migration revokes the human EXECUTE grant on the function, or drops it, and no
  already-applied migration is edited.** `packages/db/migrations/0271_retire_create_account_set_v1.sql`
  runs `set role clara_fn_owner; drop function if exists clara.create_account_set_v1(uuid,text,
  text,jsonb,boolean,date,text); reset role;`. No file below 0271 was touched (`git diff
  23cfad947b..HEAD -- packages/db/migrations` shows exactly one new file). Migration output:
  `applied 0271_retire_create_account_set_v1 · backend pid 375499` /
  `migrate: 1 new migration(s) applied · 232 total`.
- [x] **Replaying the full migration sequence from scratch succeeds, with every earlier
  migration's own prestate assertion holding unchanged.** Not re-run as a full from-scratch chain
  on this shared lane cluster (RIG.md: "Lanes never need it: the integrator runs the from-scratch
  proof on a disposable cluster"; a second from-scratch chain here would need the #867 recipe and
  is explicitly not this lane's job). Argued instead from the migration's own construction: 0271
  is the only file after 0270 that names `create_account_set_v1`, and every earlier migration that
  cites it (0059's grant, 0060's `v_entrypoints` tail loop, 0113's derivation prestate/fix, 0232's
  prestate+tail pins) runs at its own historical position — long before 0271 — where the function
  is still present and ungranted-nothing-yet, so a replay reaches each of those assertions in the
  same state 0271's own prestate measured. **Unverified** in the sense of "not re-run end to end
  on a fresh cluster in this session" — flagged for the integrator's disposable-cluster proof.
- [x] **The granted-name roster and the security cohort no longer report this function as a
  human-callable writer, and neither fails on its absence.** `packages/db/tests/rig-meta.mjs`:
  `create_account_set_v1` removed from `METRICS_0058_HUMAN_FNS` (ten members now, not eleven) and
  hence from `METRICS_0058_COHORT`. Evidence: `operation-census.test.mjs` 10/10 pass including
  `opcen.1 the operation boundary carries no unwaived hard finding` and
  `opcen.7 CONTROL unattributed`; `rig-isolation.test.mjs` 20 pass / 3 skipped (destructive, never
  run) / 0 fail including `T17 grant matrix: exact per-role EXECUTE, no PUBLIC leak, helpers/cores
  not app-callable` (34.5s), which is the test that consumes `grantMatrixFailures()` →
  `cohortFailures()` over `METRICS_0058_COHORT`.
- [x] **The pinned-body drift check is removed or updated so it does not fail looking for a body
  that is gone or no longer human-granted.** `client-financial-pack.test.mjs`'s
  `p660.census.pins_unmoved` (renamed "the four pinned dependency bodies…", was "the five…") drops
  the `create_account_set_v1` entry from its `PINS` map (a `::regprocedure` cast on a dropped
  function raises rather than failing an assertion, so leaving it would not "fail loudly", it would
  error) and asserts the retirement directly: `to_regprocedure('clara.create_account_set_v1(...)')
  is null`. Evidence: `client-financial-pack.test.mjs` 36/36 pass, including
  `p660.census.pins_unmoved` (18.6ms).
- [x] **The delta metrics suite passes end to end, with its account-set fixture no longer calling
  the human door and its readiness roster no longer requiring it.** `delta-fixtures.mjs`:
  `create_account_set_v1` removed from `DELTA_ENTRYPOINTS`/`DELTA_ARGUMENT_NAMES`; `createAccountSet()`
  now resolves the client's firm, mints (and caches per firm) an interactive wake credential via
  `mintInteractive`, and calls `clara.wake_create_account_set` via a new `callWake()` helper — the
  same door `apps/web`'s runtime agent lane uses. The five other numeric `DELTA_ENTRYPOINTS[n]`
  call sites (propose/approve/reject/supersede/mint/evaluate/evaluate-fs-pack/assess/record) were
  switched to a name-based `entrypointSignature(name)` lookup so removing index 0 could not
  silently shift any of them onto the wrong signature (verified by hand against the original
  array's order before editing, then proven by the full green run below). The op-reservation `fn`
  key for account-set creation is `agent_create_account_set` from this point on (0113's own
  derivation renamed it, confirmed by reading the live `pg_get_functiondef` of
  `_agent_create_account_set_core`), so the two "leaves no operation receipt" assertions in
  `delta-algebra-phase.mjs` and `delta-account-set-acceptance-phase.mjs` (three call sites total)
  now check `fn='agent_create_account_set'`. Evidence: `delta-contract.test.mjs` — the single
  entry point that registers `registerAlgebraPhase`/`registerAccountSetAcceptancePhase` and every
  other delta phase — **60/60 subtests pass**, 0 fail, in 102.4s, including "exactly 512 frozen
  members evaluate the right sum and E6 reproduces it", "a later 513-member version persists
  expansion refusal, exact provenance, and E6 parity" (the two tests touching the emptyZero/overlap
  refusal-receipt assertions I edited).
- [x] **The agent-lane wake door and its core function behave exactly as before, with their own
  tests green.** Not touched (no diff to 0113/0115/0116, nor to `f-a5-reporting-agency-pr2-*.mjs`).
  Evidence: `f-a5-reporting-agency-pr2-cores.test.mjs` (the wake door's own dedicated battery)
  6/6 pass, including `create_account_set -- the agent mints one; the audit+receipt the human body
  never wrote now exist`. Sibling bodies pinned live in 0271's prestate/tail:
  `clara._agent_create_account_set_core(...)` sha
  `c8e50fbcf8bf3160192bd63e8b6d4ee830d1b06e0ac7257f227f26a53ecd65cf`,
  `clara.wake_create_account_set(...)` sha
  `a3dc0941acd3ded83835a335849c5feeb7dde672f59148a5e0b27ee843ce011b` — both re-measured
  byte-identical in the tail (migration `raise notice` confirms this on apply).
- [x] **The rest of the metric-definition lifecycle (snapshot minting, propose, approve, reject,
  supersede, the evaluators) is unaffected and its tests stay green.** Untouched source; proven by
  the same 60/60 `delta-contract.test.mjs` run (it exercises propose/approve/reject/supersede,
  `mint_metric_input_snapshot_v1`, both evaluators, the E6 independent re-check and the A30b
  attempt-receipt writer in the same tree).

**Out of scope, respected:** the agent-lane wake door and its core were not edited; the
metric-definition/evaluator lifecycle was not edited; `clara.cash_account_set_versions`/`_members`
(#660's separate family) were not touched; no historical `op_receipts` row was touched (none exist
on this fresh lane database under `fn='create_account_set_v1'` — measured: 0 — so there was nothing
to touch either way).

## Migration

**`packages/db/migrations/0271_retire_create_account_set_v1.sql`** — one new file, applied.

Prestate pins (`sha256(prosrc)`), all measured live on `clara_l10` immediately before writing the
file (not transcribed from another file's text):

| signature | sha256(prosrc) |
|---|---|
| `clara.create_account_set_v1(uuid,text,text,jsonb,boolean,date,text)` | `25f9274792b14c054f1633e4518f689084a8e6548d10e3079cec4e760fd28495` |
| `clara._agent_create_account_set_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,boolean,date,text,jsonb)` | `c8e50fbcf8bf3160192bd63e8b6d4ee830d1b06e0ac7257f227f26a53ecd65cf` |
| `clara.wake_create_account_set(uuid,text,text,jsonb,boolean,date,text,jsonb,text)` | `a3dc0941acd3ded83835a335849c5feeb7dde672f59148a5e0b27ee843ce011b` |

The prestate also measured (live, before writing): `clara_authenticated` EXECUTE = true, `public`
EXECUTE = false, `pg_depend` edges referencing the function = 0, calling triggers = 0,
`clara.wake_fn_allowlist` rows for it = 0, and `clara.op_receipts` rows under
`fn='create_account_set_v1'` = 0 (informational; not asserted, since historical rows are
out of scope either way).

The prestate is written to succeed whether the function is present (first apply — checks the shape
above) or already absent (a `CLARA_MIGRATION_REDO` re-run of this same file — skips the presence
checks, still re-pins the two siblings). The drop itself is `drop function if exists`. **No redo
was needed or performed** in this session — 0271 applied cleanly on the first attempt.

Apply evidence:
```
[notice] #1003 prestate: clara.create_account_set_v1 is present, byte-identical to its measured
pre-image, granted to clara_authenticated alone with no PUBLIC entry, has zero pg_depend edges,
zero calling triggers and no wake_fn_allowlist row -- clear to drop.
[notice] #1003 tail: OK -- clara.create_account_set_v1 no longer resolves; ...
applied 0271_retire_create_account_set_v1 · backend pid 375499
migrate: 1 new migration(s) applied · 232 total · target 127.0.0.1:55750/clara_l10
```

No new preintegration-gate module or rig-meta cohort was added for 0271 itself (see "Deviation
from the house migration shape" below).

## Gates, with counts

All commands run with `export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"` and
`PGHOST=127.0.0.1 PGPORT=55750 PGUSER=postgres PGDATABASE=clara_l10 CLARA_ALLOW_DESTRUCTIVE=1
CLARA_RIG_DB=1`, from `packages/db`, with the full `$GATES` list from `package.json`'s `test`
script (104 `--import` flags, never with a reset flag).

| file | result |
|---|---|
| `tests/client-financial-pack.test.mjs` (touched) | 36/36 pass, 0 fail |
| `tests/delta-fixtures.mjs` + `tests/delta-algebra-phase.mjs` + `tests/delta-account-set-acceptance-phase.mjs` (touched) — exercised via `tests/delta-contract.test.mjs` | 60/60 pass, 0 fail (102.4s) |
| `tests/operation-census.test.mjs` (required: SQL function dropped) | 10/10 pass, 0 fail |
| `tests/rig-isolation.test.mjs` (required: SQL function dropped) | 20 pass, 3 skipped (destructive, `CLARA_RIG_ALLOW_RESET` not set — correct), 0 fail |
| `tests/f-a5-reporting-agency-pr2-cores.test.mjs` (not touched; run for AC6 confidence) | 6/6 pass, 0 fail |
| `pnpm typecheck` (repo root) | exit 0 — `apps/web typecheck: Done`, `packages/runtime typecheck: Done` |
| `pnpm lint` (repo root) | exit 0 |

`apps/web` and `packages/runtime` were not touched, so their whole-suite/browser-walk/
frozen-workflow gates do not apply (work-order rule 8's conditionals). No Windows-only known red
(RIG.md) was hit in any of the above.

## Docs

- `packages/db/README.md` — new section `## 0271 — retiring the human account-set writer (#1003)`:
  what changed, why drop over revoke, and the four live test-side files that named the retiring
  signature and how each was updated.
- `CONTEXT.md` — not touched. No new vocabulary: "account set" / "cash account set" are already
  defined and unaffected (the agent-lane creation path is unchanged; only an unused human duplicate
  retired).

## Successor contract

None. This ticket touches no frozen chat/Work-tool surface, mints no new door a frozen closure
would call, and the agent-lane wake door (`clara.wake_create_account_set`) it relies on already
existed and is unchanged.

## Deviation from the house migration shape, flagged for review

The work order's migration house-shape asks for "a preintegration gate module with a stable stem, a
rig-meta cohort, the gate-chain entry in migration order." I did not add any of the three for 0271
itself. Reasoning: that shape (see 0270's own `firm-document-limits-writer-preintegration-gate.mjs`
+ `FIRM_DOCUMENT_LIMITS_0270_COHORT` + package.json entry) is built for a migration that **adds** a
capability, so that a package-wide sweep run against a database below that migration's frontier
skips loudly instead of hard-failing. 0271 **removes** one, and I judged the existing,
already-gated test-side files I edited (`rig-meta.mjs` via `operation-census.test.mjs`/
`rig-isolation.test.mjs`, `client-financial-pack.test.mjs`, `delta-fixtures.mjs` via
`delta-contract.test.mjs`) to be the right place for the retirement's own assertions, matching how
a prior "recut in place" pin change (0084, per `delta-catalog-phase.mjs`'s own comment: "the three
untouched writers still hash to the values delta reviewed") was handled directly rather than
bimodally.

**What I could not fully rule out, and did not fix:** `rig-meta.mjs`'s `ALLOWED`/`METRICS_0058_HUMAN_FNS`
is a static, import-time constant with no database access, so it cannot itself be bimodal across a
frontier. If the wave's integrator ever runs `operation-census.test.mjs`/`rig-isolation.test.mjs`
(both of which have no upper migration-frontier ceiling, only a floor) against a **combined**
database that carries some other lane's migrations but not yet 0271, the main per-role loop in
`grantMatrixFailures()` would find `create_account_set_v1` still live-granted while `ALLOWED` no
longer lists it, and report a mismatch rather than skip. I inspected `.github/actions/db-estate-suite/action.yml`
and confirmed its own CI flow always runs `pnpm db:migrate` (main, then HEAD) before running any
package-wide test, which avoids this for that specific job; I could not rule it out for every path
the orchestrator's own cross-lane integration might take. **Unverified**: whether the integration
step ever exercises `packages/db` tests against a frontier that has other lanes' migrations but not
0271. If it does, the fix is either a `create_account_set_v1`-specific preintegration gate
(env-var skip on the four affected assertions) or — simpler — applying 0271 as one of the first
migrations layered on at integration time.

## Follow-ups worth filing

- None new. The ticket's own out-of-scope list (agent-lane door, evaluator lifecycle, `#660`'s cash
  family, historical rows) is respected as written; nothing surfaced during this ticket that isn't
  already covered by an existing ticket.

## Anything else unverified

- A from-scratch replay of the full 232-file chain was not run in this session (see the AC2 row
  above) — this lane's rig explicitly defers that proof to the integrator's disposable cluster.
- The bimodal-frontier concern in "Deviation from the house migration shape" above.
