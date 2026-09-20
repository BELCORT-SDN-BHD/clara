# Wave 1 · Lane 03 — final report

**Branch** `riders/w1-lane03` in `C:\Users\zhant\Desktop\clara-wt\642`, cut from `origin/main`
`dd3f8f1d`. Database `clara_l03` @ 127.0.0.1:55743. Three commits, all `packages/db/tests`-only, no
migration, no frozen file, no push, no PR, no GitHub write.

```
fd141984 test(db): #845 route every reset()-gated upgrade drill through guardedReset
fc81a0fa test(db): #844 pin the operator queue's arm-1 i.id desc tie-break
6219a61c test(db): #884 prove the K-family opening-balance exclusion arm behaviourally
```

`git status` (before building each ticket and again now): clean. All three tickets were verified
live and open (`gh issue view <n>`, state `OPEN`, label `ready-for-agent`) before building; none
was already satisfied on `main`. `node scripts/check-frozen-workflows.mjs`: 312 frozen files
verified, no manifest diff, none of this lane's subjects (`packages/db/tests/**`) touches a frozen
closure.

---

## #845 — Extend T19's disposable-name check to the other reset-gated drills — **DONE, ONE CRITERION PARTIAL** (amended: code review round 2, L03-CRS3 — see `wave1-lane03-codereview-fix.md`)

**Amendment:** the "every affected drill still passes its ordinary run" row below is corrected from
DONE-with-a-caveat to **PARTIAL**. What this lane actually measured was "no import-time crash from
the added import" on a SKIPPED run — a skip is not the drill's ordinary run — and 3 of the 14
files (`checkout-convergence-upgrade.test.mjs`, `rig-runtime-upgrade.test.mjs`,
`wave-a-upgrade.test.mjs`) have no CI leg anywhere to ever run the real thing. The other two
criteria below are unaffected and remain DONE.

Still live on `main` before building: `guardedReset` (`rig-reset-guard.mjs`) was imported by
exactly one caller, T19 in `rig-isolation.test.mjs`. Fourteen files import the destructive `reset`
from `scripts/reset.mjs`; the other thirteen called it unwrapped.

| Acceptance criterion | Evidence |
|---|---|
| A grep for `reset(` under the db package's tests finds no unwrapped call behind the rig-reset gate | New `reset-gate-routing.test.mjs` cell 2 (`acceptance 1`): walks `packages/db/tests` for every module importing `scripts/reset.mjs`, asserts none has a bare `await reset(` line. Green against all 14. |
| A cell proves a non-disposable database name refuses before any drill's `reset()` runs | Cell 4 (`acceptance 2`): imports the REAL `reset` export from `scripts/reset.mjs` — the identical module object every one of the 14 files resolves — wraps it in a non-delegating counting spy, points `guardedReset` at `clara_631` with both destructive flags set, and asserts the refusal (`/does not look disposable/`) fires with the spy never entered. Cell 3 first shows every discovered file imports `guardedReset` at least as often as it imports the raw `reset`, so this one proof generalises to all 14 call sites, not just T19's. |
| Every affected drill still passes its ordinary run on a rig at or above its migration frontier | Ran all 14 files' consumer test files WITHOUT `CLARA_RIG_ALLOW_RESET`: the 11 direct drill test files (27 tests, 0 fail, all skip on the existing gate) plus the 2 "kit" files' own consumer suites (`hrd-b-upgrade-drill.test.mjs`, the four `x42-004x-*-upgrade.test.mjs` files — 15 tests, 0 fail, all skip) plus `rig-isolation.test.mjs` itself (20 pass, T19 skip). **Unverified: the real reset+re-migrate drill body on each of the 14 files — that requires `CLARA_RIG_ALLOW_RESET=1` on an isolated database and is explicitly out of scope on this shared rig; it is CI's job, one file at a time (`.github/actions/db-live-gates`, `closed-wave-upgrade-drills/action.yml`).** |

Discovery is not a hand-maintained list: `reset-gate-routing.test.mjs` cell 1 walks the tree and
asserts the discovered set equals exactly the audited 14 (`checkout-convergence-upgrade.test.mjs`,
`hrd-a-recut-guard.test.mjs`, `hrd-b-upgrade-kit.mjs`, `rig-docs-upgrade.test.mjs`,
`rig-events-upgrade.test.mjs`, `rig-isolation.test.mjs`, `rig-runtime-upgrade.test.mjs`,
`s6-upgrade.test.mjs`, `wave-a-upgrade.test.mjs`, `wave-b/wb-0020-upgrade.test.mjs`,
`x37-0037-upgrade.test.mjs`, `x40-0040-upgrade.test.mjs`, `x41-0041-upgrade.test.mjs`,
`x42-split-upgrade-kit.mjs`) — a file added later that imports the destructive `reset` unwrapped
is caught without anyone updating a constant.

**Vacuity control:** reverting `x42-split-upgrade-kit.mjs`'s two `guardedReset(reset, …)` calls to
bare `reset(…)` turned cell 2 red for the exact reason (`"bare await reset( survives in:
x42-split-upgrade-kit.mjs"`); restoring the file turned it green and its sha256
(`67f63124ed69…`) matched the pre-mutation hash exactly.

**Deliberately left:** `lib/guard.mjs`'s shared gate is untouched (out of scope by the brief);
`rig-cluster-reset.mjs`, `restore.mjs`, `restore-full.mjs`, `dr-selftest.mjs`, `seed.mjs`,
`migrate-harness.mjs` are unmodified — they share the SAME gate the brief says stays as-is.

## #844 — Pin the operator queue's arm-1 `i.id desc` tie-break — **DONE**

Still live on `main` before building: os.14 (`operator-support.test.mjs`) proves the arm-1
lateral's SECOND key (money-carrying status beats `opened_at desc`), but every world in the file
gives a registration at most one intent pair with distinct `opened_at` — the THIRD key
(`i.id desc`, migration 0188's arm-1 lateral) was provable only by reading the migration's text.

| Acceptance criterion | Evidence |
|---|---|
| A new named cell builds a three-intent world with a genuine `opened_at` tie, asserted by reading both values as root | `os.15` builds `first`/`second`/`third` via `openIntent` + `forceStatus(…, "cancelled")` between opens (a stamped predecessor would trip 0186 §G's own `checkout_in_progress` refusal, so each is force-transitioned `open → cancelled` — lawful without a session stamp — instead of stamped). A new `forceOpenedAt()` helper (disables/re-arms `t_checkout_intents_session_stamp`, the trigger's own FIRST check otherwise freezes `opened_at` unconditionally) forces `first` and `second` to the identical instant `2026-01-01T00:00:00Z` and `third` to an hour earlier. Root read: `openedOf(first) === openedOf(second)`, both `> openedOf(third)`. |
| The cell asserts the registration is still an arm-1 case (undecided, no payment row) | `paymentsFor(registration).length === 0`; `registrationRow(registration).status === "open"`. |
| The cell fails if the id key is removed from the lateral; state how that was checked | The winner is computed from Postgres's own `$1::uuid > $2::uuid`, then read from `get_operator_support_case`'s merged `extra.intent_id` (`list_operator_support_queue` deliberately drops `extra` — the queue row alone cannot name the winning intent, only its state, so the queue is asserted for arm membership/state and the CASE door for identity). A companion `SELECT` — 0188's exact arm-1 predicate with `i.id desc` reversed to `i.id asc`, run over the same base relation, never the deployed function or the migration body — deterministically names the LOSER instead; a second companion run with the shipped direction agrees with the door. Omitting the key outright was rejected as a check: without any id clause Postgres promises nothing about which tied row a bare `LIMIT 1` returns, so that comparison would not be reproducible. |
| The operator support battery stays green | `operator-support.test.mjs`: 20/20 (was 18 declared cells + the vacuity-control test; `EXPECTED_CELLS` bumped 18→19). `checkout-convergence.test.mjs` (shares the same fixtures, untouched): 36/36. |

**Vacuity control:** removing the `forceOpenedAt(second, tieInstant)` call turned the tie
precondition assertion red for the right reason (`"first and second must carry the IDENTICAL
opened_at instant"` — actual delta ~22.6M ms); restoring it byte-for-byte (sha256
`95e1c24fc793…`) turned the file green again. `EXPECTED_CELLS` itself is a second, structural
vacuity control the file already carried (18→19 catches a cell silently not running).

**Deliberately left:** migration 0188 and the queue's ordering are untouched (out of scope by the
brief).

## #884 — No opening-seed fixture for the K-family opening-balance exclusion arm (CLR40) — **DONE**

Still live on `main` before building: `p639.birth.exclusions`'s own comment named the WRONG arm
and the WRONG code (verified at 65fde7f3, per the ticket's own correction) — it said no
opening-seed fixture existed and implied the birth trigger itself raised the refusal. A fixture
already existed: `kSeededFaClient` (`x41-fa-world.mjs`), a thin wrapper over the wave-b
opening-seed doors (`wb.onboardingClient` / `createOpeningSeed` / `seedFixedAsset` /
`draftOpeningItem` / `approveOpeningSeed`) that `x41.b2`'s door-(e) sub-case and K8/K9
(`wave-b/wb-k-supersede-fa.test.mjs`) already reuse. The refusal is raised by the BELT
(`clara._tf_fa_movement_belt`, migration 0041's arm (e)), SQLSTATE **CLR40**, reason
`fa_k_gl_balance_on_enrolled` — not the birth trigger, not CLR38.

| Acceptance criterion | Evidence |
|---|---|
| A named cell drives the gl-balance-on-enrolled leg and asserts SQLSTATE CLR40, reason `fa_k_gl_balance_on_enrolled`, the account code on the detail, zero register rows, full rollback | `p639.birth.opening_excluded`: fresh onboarding client, COST/ACCUM/EXPENSE explicitly enrolled via `upsert_fa_account_profile` (a deliberate act — never automatic); a `gl_balance` item naming COST directly (never itemised as `fixed_asset`) plus an offsetting SHARE item so the set's net OBE ties to zero ahead of the belt (`_assert_opening_tie` runs BEFORE the belt and excludes the OBE account from its own delta check by construction — recording an OBE target caused a false `tie_mismatch` during development, corrected). Approval refuses `err.code === "CLR40"`, `err.detail` contains `COST`'s code, `assetCountOf(client)` unmoved, BOTH entries still `status === "draft"` (the belt is a deferred constraint trigger — its exception unwinds the whole approval, not one entry in it). |
| A named cell drives the itemised opening item and asserts exactly one register row not born by the acquisition trigger | `p639.birth.opening_admitted`: drives `kSeededFaClient`, asserts the opening entry is `status === "approved"` and `is_opening_balance === true` (the exact guard `_tf_fa_acquisition_birth`'s first line tests), then `select id from clara.fixed_assets where acquisition_entry_id=$1` returns `rowCount === 1` and that row's id equals `seed_fixed_asset`'s own receipt id — the behavioural proof the birth trigger's `is_opening_balance` guard actually prevented a second birth. |
| Both cells act through least-privileged personas | Every act runs through `w.users.alice` / `bob` / `hana` via `humanQuery`-backed door wrappers (`upsertFaProfile`, `wb.draftOpeningItem`, `wb.approveOpeningSeed`, `wb.seedFixedAsset`); root appears only as the `fixed_assets`/`journal_entries` readback (DECISIONS §1.10, this file's own stated law). |
| The stale comment is corrected | `p639.birth.exclusions`'s comment now names the belt, CLR40, and points at the two new cells by name instead of claiming no fixture exists. |

**Vacuity control:** skipping the `upsertFaProfile` enrolment call turned `opening_excluded` red for
the right reason (`"expected the NAMED refusal 'fa_k_gl_balance_on_enrolled' … but the call
SUCCEEDED"` — with no enrolment the belt never sees the account); temporarily expecting
`rowCount === 2` instead of `1` turned `opening_admitted` red (`"1 !== 2"`, the real DB state).
Both restored byte-for-byte (sha256 `d280318bcdc4…`).

**Deliberately left:** the `scheduled_run` arm (already proven by `p639.depreciation.independent`,
untouched); no change to the belt, the birth trigger or the opening lane (out of scope by the
brief).

---

## Gates, with counts

* Test files added/touched, run individually and as full files: `reset-gate-routing.test.mjs` (new,
  5/5), `operator-support.test.mjs` (20/20, was 18 + 1 control), `fixed-asset-acquisition.test.mjs`
  (23/23, was 21).
* `packages/db/tests/operation-census.test.mjs`: 10/10 (run twice, after #845 and after #884; never
  with `CLARA_RIG_ALLOW_RESET`/`CLARA_RIG_ALLOW_ROLE_SWEEP`).
* `packages/db/tests/rig-isolation.test.mjs`: 20 pass / 1 skip (T19's own gate) each time, never
  with the reset flags.
* Sibling batteries sharing touched fixtures, unaffected: `checkout-convergence.test.mjs` (36/36),
  `wave-b/wb-k-supersede-fa.test.mjs` (10/10), plus the 14 reset-gated files' own consumer suites
  run without the reset flag (27 + 15 tests, 0 fail, all skip cleanly on their existing gate).
* `pnpm typecheck` (worktree root): PASS — `apps/web` and `packages/runtime` both `Done` (this
  lane touched neither; ~4 min).
* `pnpm lint` (worktree root): PASS, exit 0 (`apps/web`, `packages/reporting-render`, and the db
  package's own eslint all clean).
* `node scripts/check-frozen-workflows.mjs`: PASS — 312 files verified, no manifest diff. This lane
  touched no file in `packages/runtime`, so `check-parts-parity.mjs` was not run (rule 8's
  condition does not apply).
* Known Windows-only reds (RIG.md): none encountered — this lane never touched
  `x56-rest-c`/EICAR/`pg_dump`/`thread-live-clarify`/`use-clara-thread-stop`.

## Docs updated

* `packages/db/tests/README.md`: three new sections in the same commits as their tickets —
  `reset-gate-routing.test.mjs — #845`, `operator-support.test.mjs os.15 — #844`, and
  `fixed-asset-acquisition.test.mjs p639.birth.opening_excluded / opening_admitted — #884`.
* No `CONTEXT.md` change: none of the three tickets introduces new domain vocabulary (all three
  reuse established terms — `guardedReset`, "arm-1", "K-family opening-balance exclusion").
* Blueprint drift: none. `docs/PRD.md` / `docs/ARCHITECTURE.md` untouched.

## Successor contracts

None. All three tickets are test-only against existing production surfaces; no new Work-lane or
chat-lane tool is needed.

## Assumptions made

* #845: "about fourteen files" (the ticket's own wording) resolved to exactly 14 by discovery
  (`reset-gate-routing.test.mjs`'s own walk), matching the triage comment's named list plus T19's
  own file.
* #844: the tie instant and the decoy's offset (`2026-01-01T00:00:00Z` / one hour earlier) are
  arbitrary fixed values, not DB-clock-derived, because `forceOpenedAt` writes them directly as
  root and no due-ness or period logic reads them.
* #884: the second, offsetting `gl_balance` item on `SHARE` in `opening_excluded` is a fixture
  necessity (the tie/OBE-net-zero preconditions `_assert_opening_tie` checks BEFORE the belt), not
  part of what arm (e) is about; it carries a comment saying so.

## Follow-ups worth filing

* **The `reset-gate-routing.test.mjs` discovery walk is exact-match, not superset.** A NEW
  reset-gated file that imports `scripts/reset.mjs` and wraps it correctly on day one will fail
  `EXPECTED_GATED_FILES`'s `deepEqual` until the constant is updated — by design (rule: "no drift
  goes unnoticed"), but worth a one-line note in the next wave's work order so a future lane
  doesn't read the failure as its own regression.

## Anything unverified

* The actual destructive reset+re-migrate body of all 14 gated drills, under
  `CLARA_RIG_ALLOW_RESET=1` on an isolated database — by this lane's own explicit instruction,
  never run on this shared rig. That remains CI's job (`.github/actions/db-live-gates`,
  `closed-wave-upgrade-drills/action.yml`), one file at a time.
* Hosted evidence: none claimed; all evidence above is local to `clara_l03` @ 127.0.0.1:55743.
