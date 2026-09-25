# Wave S, lane 05, ticket #1092 — the runtime read credential reaches a retired depreciation policy

Branch `riders/wS-lane05`, worktree `C:\Users\zhant\Desktop\clara-wt\642`, database `clara_l03`
(127.0.0.1:55743). Base for this lane: `7bc5a710f`. Ten commits from #1056 and #1090 were already on
the branch at start (confirmed by `git log --oneline 7bc5a710f..HEAD`); this ticket adds three.

**STATUS: DONE.** All three acceptance criteria are met and evidenced below.

**Commits** (oldest first, on top of #1090's three):

| commit | subject |
|---|---|
| `357203355` | `feat(db): #1092 the runtime read credential reaches a client's depreciation policies` |
| `708ff8f20` | `feat(runtime): #1092 the retired-policy ground's read and its row mapping` |
| `0da1b021f` | `test(db): #1092 the ground read and its supersession guard, driven on a live database` |

**Migration: `0346_fa_retired_policy_agent_read.sql`** — the reserved number, the only new migration
this ticket owns. **Applied once, never redone** (no `CLARA_MIGRATION_REDO` run was needed; the file
was never edited after its first successful apply). Ledger: 312 files, checksum
`1e16ed48731670765df08d8bdcfc38450858ca5d2de1ef80fd6be105a54a4441`. A second `pnpm db:migrate`
reports `0 new migration(s) applied · 312 total`.

**No mid-task status request arrived.** Nothing to note under sweep-wave rule (f).

---

## The ticket, as it stands today

`gh api repos/BELCORT-SDN-BHD/clara/issues/1092` — the body is the whole contract: **ZERO comments**
(`…/issues/1092/comments` returns an empty array), so there is no 2026-09-20 owner ruling to
override it. Labels: `enhancement`, `ready-for-agent`. (Note: `gh issue view 1092 --comments`
returned EMPTY output on this host, from both Git Bash and PowerShell, with exit 0 — the `gh api`
form was used instead and is what the evidence above rests on.)

**Verified still live on this branch and this database before building:**

- `has_table_privilege('clara_agent_ro', 'clara.fa_account_depreciation_policies', 'SELECT')` =
  **false**; the same for `clara_runtime` and for `clara_wake_interactive`. The relation carried
  exactly **two** policies, `p_fadp_owner` (`clara_fn_owner`, ALL) and `p_fadp_human`
  (`clara_authenticated`, SELECT, `firm_id = clara.jwt_firm()`) — 0277:299-308, unchanged.
- `packages/runtime/lib/fa-particulars-proposal.ts` already carries `FaProposalRetiredPolicy` and
  ranks `retired_account_policy` between `client_knowledge` and `account_siblings`
  (lines 137-151, 392-395), exactly as #933 left it. No mapper and no read existed for it.
- `packages/runtime/workflows/claraWork.v6.impl.ts` is absent and `registry.ts` still resolves
  `claraWork_v5`, so the "proposal input-loading step" the brief names still does not exist, and
  `claraWork.v4.impl.ts` IS in `frozen-workflows.json` (line 1199).

Nothing was already satisfied; the whole ticket was built.

---

## Seams tested at (written down before the first test — work order rule 4)

This list was written into this report file BEFORE any test was authored, and is reproduced
verbatim in the battery's own header.

1. **The wall on `clara.fa_account_depreciation_policies`** — the runtime read credential
   (`clara_agent_ro`, minted through `clara.mint_wake_credential` and presented as `readScoped`
   presents it) can SELECT the client's policy rows scoped to its own firm; it holds no
   INSERT/UPDATE/DELETE/TRUNCATE; another firm's credential reads nothing. Driven through the real
   credential, not read off the catalog alone.
2. **The retired-policy ground read** — the exact SQL the successor's input-loading step runs,
   exported from `packages/runtime/lib/fa-particulars-proposal.ts` so it has ONE home, driven under
   that credential: the account's newest RETIRED policy, and NOTHING when a live policy supersedes
   it.
3. **`mapRetiredAccountPolicyRow`** (new, pure, same non-frozen module) — one raw row ->
   `FaProposalRetiredPolicy | null`.
4. **`deriveFaParticularsProposal`** (already built and ranked by #933; NOT changed here) — the
   assembly seam AC3 names: real doors -> real read under the real credential -> map -> real
   deriver, against a DISAGREEING siblings input on the same account.

No test was written at a seam the brief does not give.

---

## Acceptance criteria, each with its evidence

### AC1 — "The runtime read role can SELECT a client's retired depreciation policy rows, scoped to its own firm, with no write access."

`packages/db/tests/fa-retired-policy-agent-read.test.mjs` `fp.wall` — **PASS**. Five measurements in
one cell:

- **The ACL**: `has_table_privilege('clara_agent_ro', …)` is `{SELECT: true, INSERT: false,
  UPDATE: false, DELETE: false, TRUNCATE: false}`, asserted as one `deepEqual` so a later migration
  that granted any DML verb fails here.
- **The policy**: `p_fadp_agent` exists, `polcmd = 'r'`, roles exactly `['clara_agent_ro']`,
  predicate exactly `(firm_id = clara.wake_firm())`.
- **Driven, own firm**: a firm-A client, a policy set at `straight_line`/120 months through
  `clara.set_fa_depreciation_policy` as a real bookkeeper and then retired through
  `clara.retire_fa_depreciation_policy`; a wake credential minted for firm A reads the row back with
  `{version: 1, active: false, method: 'straight_line', life: 120}` — an independent expected
  literal, not a re-read of what the door returned.
- **Firm-walled**: a credential minted for firm B reads **0 rows** for the same client.
- **No write, belt unbuckled**: `set default_transaction_read_only = off` first (rig-isolation T3's
  own technique — the wall is the GRANT, not the belt), then UPDATE and DELETE each refused
  `42501`.

The migration's own tail (§Z) asserts the same posture structurally on every from-scratch chain, and
adds what the cell cannot reach: `clara_runtime`, `clara_wake_interactive`, `clara_wake_proactive`,
`clara_wake_bank`, `clara_freeform_ro` and PUBLIC each named and holding no SELECT; `p_fadp_human`
unmoved; and both write doors still `clara_authenticated`-only (`has_function_privilege` for
`clara_agent_ro` and `clara_runtime` both false on each).

### AC2 — "The proposal derivation's input-loading step supplies the `retired_account_policy` ground when a retired policy exists for the asset's account."

The STEP itself cannot be built without creating a frozen-workflow closure (work order rule 5;
`claraWork.v6.impl.ts` does not exist and `claraWork.v4.impl.ts` is frozen). What is delivered, and
what AC2 is evidenced against — the same posture #933 and #1090 both took for the same unbuilt step:

- **The read is production code with ONE home**: `FA_RETIRED_ACCOUNT_POLICY_SQL`
  (`packages/runtime/lib/fa-particulars-proposal.ts`). `fp.read` runs **that exported string**, not
  a copy of it, under a real `clara_agent_ro` wake credential. **PASS**, four arms:
  - the ordinary case (one policy, set then retired) returns it, and mapped it is
    `{assetAccount: '200-D41', version: 1, method: 'straight_line', usefulLifeMonths: 96,
    rateBps: null}` — an independent expected literal;
  - two retired versions (set → retire → set → retire) return **version 2**, the last thing a person
    signed, never the older version 1;
  - a retired version 1 underneath a **LIVE** version 2 returns **zero rows**, and the mapper turns
    that into no ground rather than a half-filled one;
  - an account that never had a policy returns an empty result rather than an error.
- **The supersession guard is not vacuous, and that is measured**: `fp.read`'s own control builds a
  stripped statement out of the real one by deleting exactly the `and not exists (… q.active)`
  clause (`assert.notEqual(stripped, SQL)` first, so the control cannot silently no-op) and shows
  the superseded version 1 **does** come back without it.
- **The mapping is built and tested, pure**: `mapRetiredAccountPolicyRow`, 5 cells in
  `packages/runtime/tests/fa-particulars-proposal-unit.test.mjs` (`p1092.map.*`) — happy path from
  an independent literal; no row (`undefined`/`null`) → `null`; missing drivers → `null`, never
  `undefined`; an unreadable `asset_account_code` DROPS the whole ground (with an in-cell control
  showing a readable one does ground); an unusable method is carried, not repaired, and
  `deriveFaParticularsProposal` then drops it and falls to the siblings.

### AC3 — "A test drives an account with a retired depreciation policy and asserts the proposal is grounded by it, outranking the siblings ground for the same account."

`fp.ground` — **PASS**, end to end on real objects rather than literals:

1. A real acquisition is posted on the enrolled COST account before any policy exists, and completed
   BY HAND at `straight_line`/24 months through `clara.complete_fixed_asset_particulars` — the
   COMPLETED SIBLING.
2. A `reducing_balance`/60 months/2500bp policy is set and then retired through the two real doors.
3. A second real acquisition is posted: the register row is born **PENDING**
   (`depreciation_method` null, `depreciation_policy_id` null) because no policy is live — asserted,
   so the question this proposal is for really does open.
4. `FA_RETIRED_ACCOUNT_POLICY_SQL` runs under the real credential; `mapRetiredAccountPolicyRow` maps
   it to `{assetAccount: '200-D41', version: 1, method: 'reducing_balance', usefulLifeMonths: 60,
   rateBps: 2500}`.
5. The asset and sibling inputs are read off the **real register rows** (`acquired_date::text`,
   `accum_depr_account_code is null`, etc.), never invented; the cell asserts the sibling really
   disagrees (`straight_line`/24).
6. The real `deriveFaParticularsProposal` (imported, not restated) returns
   `basis = ["retired_account_policy", "acquisition_date", "firm_default_residual"]`,
   `method = reducing_balance`, `useful_life_months = 60` (not the sibling's 24), `rate_bps = 2500`,
   `start_date` = the second acquisition's own posting date, and a reason matching
   `/has no live default policy, but the one a person of this firm signed for it \(version 1\) and
   later retired/`.
7. **The control, in the same cell**: the identical asset and sibling with `retiredPolicy` withheld
   ground `account_siblings` at 24 months — so (6) is a real reversal, not two independently-true
   proposals.

**No change was made to `deriveFaParticularsProposal` or its ranking order** (the ticket's own
out-of-scope), true by construction: the only `.ts` diff is the ADDITION of a constant, a type and a
function at the end of the file.

---

## The security judgement this ticket had to make, and the measurement behind it

The scan flagged #1092 as "security, opus": it widens a runtime credential onto client tax data.
Three choices were considered and one was measured wrong.

**Rejected: a column-level SELECT grant.** The tightest possible wall (7 of the relation's 18
columns). Measured: the ONLY column-level grant anywhere in this estate is an UPDATE pair on
`clara.wake_intents` for `clara_runtime`. A column-level SELECT would be a novel mechanism with no
precedent and a silent-by-default failure mode for every column added later.

**Rejected after measurement: `using (firm_id = clara.wake_firm() and not active)`.** This was the
first draft, and it matches the ticket's own title ("retired depreciation policies"). It is wrong
because **the read's honesty guard needs to see the live row**. `clara.set_fa_depreciation_policy`
is version-forward (0277 §D): setting again retires version N and inserts a live version N+1, so an
account can hold a retired version 1 underneath a LIVE version 2. A register row that was already
pending when version 2 landed still opens a question, and grounding it on version 1 would put a
judgement the person has SINCE REPLACED onto a form, under Clara's own sentence claiming they signed
it. The read therefore carries `and not exists (… where q.active)` — and under a retired-only RLS
wall that sub-select would see nothing and **always pass**: the guard would be vacuous under the
very credential that runs it. `fp.read` arms (c) and (d) are that measurement.

**Chosen: plain tenancy, `using (firm_id = clara.wake_firm())`, SELECT only, `clara_agent_ro` only.**
What the widening actually costs, measured rather than asserted: `clara_agent_ro` **already** holds
table-level SELECT on `clara.fixed_assets` under `p_fixed_assets_agent` (`firm_id =
clara.wake_firm()`), and that register carries the SAME five drivers per ASSET
(`depreciation_method`, `useful_life_months`, `depreciation_rate_bps`, `residual_cents`,
`cost_cents`). A per-account DEFAULT of those drivers is the account-level statement of what this
credential can already read row by row, not a new class of data. The shape is the estate's own: all
**52** policies `clara_agent_ro` holds today are plain tenancy predicates (the two non-`firm_id`
ones, `p_firms_agent` and `p_onboarding_plan_revisions_agent`, are still pure tenancy by another
route).

**`clara_runtime` is deliberately granted nothing.** The read runs under the OBO read credential
`readScoped` mints, whose group role is `clara_agent_ro` (`packages/runtime/lib/pools.mjs:101`) —
the same credential `loadPendingFixedAssetStepV4` already reads the register with
(`claraWork.v4.impl.ts:673-698`). `clara_runtime` is the unscoped service identity and carries no
firm.

**An accounting rule was decided here and recorded in `CONTEXT.md`**, not left implicit: a retired
policy grounds a proposal only WHILE IT IS STILL THE ACCOUNT'S LAST WORD. See "Docs" below.

---

## Migration `0346_fa_retired_policy_agent_read.sql` — prestate pins

MEASURED on this lane database (`clara_l03`, chain 0001..0345) immediately before authoring, after
#1056's six commits and #1090's three. **Every pinned signature, for the integrator's cross-lane
check:**

| pinned signature | sha256(prosrc) | why it is pinned |
|---|---|---|
| `clara.wake_firm()` | `76311c51e878a658085bc36fee28d0175eacb2b0dbff3d6dec44f80239cbfabc` | the policy predicate this file installs means whatever THAT body means |
| `clara.set_fa_depreciation_policy(uuid,text,text,integer,integer,bigint,text,text)` | `11f0aa0a82334438bebb3dadd1c990c08ebd0b014eabf7d86d41204c2820b67d` | the read's supersession guard is derived from its version-forward behaviour |
| `clara.retire_fa_depreciation_policy(uuid,text,text,text)` | `f75d3f25b690ad8ceabac201403180f0f67af19ba578cb816a14e11b9ac8c05e` | the door that produces every row this read returns |
| `clara._tf_fa_acquisition_birth()` | `a584e946f9d99b881a6e856fb792823decbdbe9fd5fb2851702b85475395b69c` | the "a LIVE policy is never a proposal ground" reasoning IS this 0292-recut body |
| `clara._fa_on_approve(uuid)` | `412fd7a04886676dfc8c93696fec4f5878b9a6821cb31472f203c3695faf643b` | the other 0292-recut birth body, same reason |

Also pinned, structurally rather than by sha: the relation is RLS **enabled and forced**;
`p_fadp_human` is exactly `(firm_id = clara.jwt_firm())`, SELECT; `p_fadp_owner` is exactly `true`,
ALL; no grantee other than `clara_fn_owner` / `clara_authenticated` / `clara_agent_ro` holds
anything; and `p_fadp_agent` is either absent or already at this file's exact shape (the redo arm).
The tail re-measures all five shas and every posture above.

**No function was recut. No `rig-meta.mjs` cohort entry was added**, because this file mints no
name and grants no EXECUTE — the same claim 0278 and 0292 make for the same reason. `rig-isolation`
T17 (the exact per-role EXECUTE matrix) and T18 (forced RLS on governed tables) both pass unchanged.

**Both branches of the bimodal prestate were exercised on this rig**, not merely reasoned about
(wave-3 addendum):

- **The redo arm** ran on the second `pnpm db:migrate` (0 new applied, no drift).
- **The FIRST-APPLY arm** was proven inside one transaction that was then rolled back: the
  pre-image was restored (`drop policy p_fadp_agent`, `revoke select … from clara_agent_ro`,
  verified back to `{SELECT: false, policies: 2}` — the exact 0345 post-image), the WHOLE file was
  run verbatim, and it reached `{SELECT: true, policies: 3}`; after the rollback the database was
  back at the applied state `{SELECT: true, policies: 3}`.
- **Fail-closed was proven three ways**, each inside its own rolled-back transaction: a
  `p_fadp_agent` with a different predicate → `#1092 prestate: p_fadp_agent already exists with a
  DIFFERENT shape (cmd=r, qual=true, …)`; a moved `p_fadp_human` → `#1092 prestate: p_fadp_human is
  not 0277's own SELECT policy`; an unexpected third grantee (`grant select … to clara_runtime`) →
  `#1092 prestate: 1 unexpected grantee row(s)`. After every rollback the ACL read
  `{agent: true, runtime: false, policies: 3}`.

The probe scripts were throwaway files in `packages/db` (`.rigq.mjs`, `.rigfirst.mjs`, `.rigneg.mjs`)
and were **deleted**; the working tree is clean and none of them is committed.

**`apps/web/tests/firm-scope-db-pins.corpus.ts`** — checked as in scope (sweep-wave rule d, a
migration file changed). No entry was needed: 0346 contains no dynamic SQL (`execute format`,
`pg_get_functiondef`) at all, so the corpus's static lexer admits it with no review-barrier entry.
Verified by RUNNING the corpus's own test, not by reading the file: `apps/web/tests/
firm-scope-db-pins.test.ts`, **22/22 pass**.

---

## Gates, with counts

Every count below is from a run on this lane's own rig (db `clara_l03` @ 127.0.0.1:55743,
Playwright triple 3520/3521/3522 — unused, see below).

**Test files added or touched**, db files run with the FULL gate chain (`$GATES` = every
`--import ./tests/*-preintegration-gate.mjs` flag in `packages/db/package.json`'s `test` script,
read through `node scripts/print-gate-chain.mjs`):

- `packages/db/tests/fa-retired-policy-agent-read.test.mjs` (NEW) — **3/3 pass, 0 skipped**
  (`fp.wall`, `fp.read`, `fp.ground`).
- `packages/runtime/tests/fa-particulars-proposal-unit.test.mjs` (touched: 5 new `p1092.map.*` cells
  beside the 24 `p933.*` and 6 `p1090.map.*` ones) — **35/35 pass, 0 skipped**.

**The reds I saw, and why they were the right reds** (work order rule 4, one slice at a time):

1. `fp.wall` against the frontier gate before 0346 existed: `#1092 migration
   (fa_retired_policy_agent_read$) is NOT applied to this database, and this is a FOCUSED run.`
2. `fp.wall`'s BEHAVIOUR red, with the frontier gate temporarily short-circuited by one character in
   the test file (`&& false`, restored byte for byte immediately after — `git diff` confirms no
   residual): `sel: false` vs `sel: true` on the ACL deepEqual. Then the migration, then GREEN.
3. `p1092.map.happy_path`: `TypeError` — `mapRetiredAccountPolicyRow` is not a function. Then the
   mapper, then GREEN.
4. `p1092.map.an_unreadable_account_code_DROPS_the_whole_ground`: the first mapper mapped a
   non-string account code to `null`, which would let a policy for one account ground an
   account-less register row. Red on `assetAccount: null` vs `null`. Then the guard, then GREEN.
5. `fp.read`: `Client was passed a null or undefined query` — `FA_RETIRED_ACCOUNT_POLICY_SQL` did not
   exist. Then the constant, then GREEN.
6. `fp.ground` passed on its first run and is stated as what it is: an ASSEMBLY cell over code the
   five cycles above had already built. Written before slice 1 it would have been red; it was not,
   and this report does not claim otherwise.

**Vacuity control, driven and restored byte for byte**: `mapRetiredAccountPolicyRow`'s empty-string
arm was deliberately broken (`account === ""` removed) and
`p1092.map.an_unreadable_account_code_DROPS_the_whole_ground` failed for the right reason (34/35),
then the file was restored from a byte copy and re-measured at 35/35; `git diff` against the commit
shows no residual change.

**Two honest TDD notes**: (a) the `row === null || row === undefined` guard was written in the same
edit as the happy path, one cycle before `p1092.map.no_row_is_null` demanded it — one guard clause of
speculative code, recorded rather than hidden; (b) `p1092.map.no_row_is_null`,
`p1092.map.missing_drivers_become_null` and `p1092.map.an_unusable_method_is_carried` are
characterization cells over behaviour the earlier cycles had already produced — they pin the
tolerance contract the successor relies on, and they drove no new code.

**Cross-cutting db gates** (owed because `packages/db/tests` was touched; this ticket adds SQL
objects but no SQL function — run anyway, per the work order's broader condition; **never** with
`CLARA_RIG_ALLOW_RESET` or `CLARA_RIG_ALLOW_ROLE_SWEEP`):

- `operation-census.test.mjs` — **10/10 pass, 0 skipped**.
- `rig-isolation.test.mjs` — **22/23 pass, 1 skipped** (the `CLARA_RIG_ALLOW_RESET`-gated
  destructive cell, never set, per RIG.md). T17's exact per-role EXECUTE matrix and T18's forced-RLS
  sweep both green.
- `ci-frontier-leg-contract.test.mjs` (owed because the `$GATES` list changed) and
  `fa-particulars-proposal.test.mjs` (the #933 db battery, which imports the module this ticket
  edits) — **15/15 pass together, 0 skipped**.

**Regression over the relation this ticket re-ACLs**: `fa-depreciation-policy.test.mjs` (#932's own
battery, including its `p932.law` ACL/door census) plus `fixed-asset-acquisition.test.mjs`, run
together with the full gate chain — **38/38 pass, 0 skipped**.

**Runtime gates** (owed because `packages/runtime` was touched):

- `node scripts/check-frozen-workflows.mjs` — `freeze-lint: OK — 322 frozen file(s) verified …, no
  manifest diff`. `fa-particulars-proposal.ts` is still outside every frozen closure.
- `node packages/runtime/scripts/check-parts-parity.mjs` — `parts-parity: OK`.

**Whole-repo gates:**

- `pnpm typecheck` — `apps/web typecheck: Done`, `packages/runtime typecheck: Done`. Clean.
- `CI=true GITHUB_ACTIONS=true pnpm lint` (the runner's own env, per the wave-2/wave-3 addenda) —
  **exit 0** across every workspace, `apps/web`'s embedded self-test suites and
  `packages/reporting-render`'s eslint included.

**`apps/web` source was NOT touched** (no file under `apps/web` changed in this ticket's three
commits), so the whole unit suite and the browser walks are not owed by work-order rule 8, and the
Playwright triple was not used. The one `apps/web` test run (`firm-scope-db-pins.test.ts`, 22/22)
was the targeted sweep-rule-(d) verification described above, not the whole-suite gate.

**Migration ledger**: 312 files, max `0346_fa_retired_policy_agent_read`; a second `pnpm db:migrate`
reports `0 new migration(s) applied · 312 total` and no drift.

---

## Docs updated (in the same commits as the code they describe)

- **`packages/db/README.md`** — new section `## 0346 — the runtime read credential reaches a retired
  default depreciation policy (#1092, riders sweep wave, lane 05)`, in the same commit as the
  migration. It states the gap, why `clara_agent_ro` and not `clara_runtime`, the measured reason
  the predicate is plain tenancy rather than retired-only, what that widening actually costs
  (measured against `p_fixed_assets_agent`), what stays shut, and all five prestate pins. No existing
  section was edited.
- **`packages/runtime/README.md`** — the `### #933` section gains a bullet for what is now reachable
  (the grant, `FA_RETIRED_ACCOUNT_POLICY_SQL`, `mapRetiredAccountPolicyRow`, the supersession rule
  and why it drives the RLS shape, and the `asset_account_code` refusal), in the same commit as the
  module change. Nothing existing was rewritten.
- **`CONTEXT.md`** — the existing `**Depreciation particulars proposal**` entry is SHARPENED, not
  appended to: the ground now reads "the account's own retired policy WHILE THAT IS STILL ITS LAST
  WORD", with the rule spelled out ("a retired policy that a newer LIVE policy supersedes grounds
  nothing: the live one is what the person now says about the account, and a row born under it is
  born complete with no question at all"), and the `_Avoid_` list gains "a retired policy proposed
  while a newer live one supersedes it". Six lines changed, three added.
  **Shared-file note for the integrator**: SWEEP-PLAN.md's shared-file table lists `CONTEXT.md` as
  "L3, only if #1049 stays in the wave". This is a lane-05 hunk in a different term
  (`Depreciation particulars proposal`, around line 1046) and should not collide with a staff-person
  entry; it is here rather than omitted because an accounting rule this ticket DECIDED would
  otherwise live only in a SQL comment.
- **`packages/db/package.json`** — one `--import ./tests/fa-retired-policy-agent-read-preintegration-
  gate.mjs` flag at the sorted (migration-order) position, straight after 0345's.
- Not edited: `docs/PRD.md`, `docs/ARCHITECTURE.md`, `apps/web/messages/en.json`,
  `apps/web/test/manifest.txt` (no web test file added), `packages/db/tests/rig-meta.mjs` (no new
  name minted), `apps/web/tests/firm-scope-db-pins.corpus.ts` (no dynamic SQL), any applied
  migration, any frozen file.

---

## Successor contract — the retired-policy ground, for whichever workflow step next loads the proposal's inputs

Everything a future `loadFaProposalInputsStepV6`-shaped step needs, in a form it can transcribe.
**Nothing frozen was edited; the step does not exist yet.** This composes with #1090's own successor
contract (the `client_knowledge` half) — both feed the SAME `FaProposalInputs`.

**1 · Imports.** From the non-frozen `../lib/fa-particulars-proposal.js`:

```ts
import {
  FA_RETIRED_ACCOUNT_POLICY_SQL,
  mapRetiredAccountPolicyRow,
  type RetiredAccountPolicyRow,
} from "../lib/fa-particulars-proposal.js";
```

**2 · Zod input — none.** Same posture #933 and #1090 state: the proposal is not a model act. The
workflow BODY reads it after a commit, so no tool gains an input and no new zod object is needed
beyond `faParticularsProposalSchema`, unchanged.

**3 · The door call, with argument order.** There is no door: this is a plain SELECT under an
existing RLS policy. Run `FA_RETIRED_ACCOUNT_POLICY_SQL` under the SAME OBO `clara_agent_ro`
credential v4's own register read mints, with **`$1` = the client id, `$2` = the pending register
row's `asset_account_code`**, in that order:

```ts
const retiredPolicy = await readScoped(ctx, async (c: PgExec) => {
  const r = await c.query(FA_RETIRED_ACCOUNT_POLICY_SQL, [work.clientId, asset.assetAccount]);
  return mapRetiredAccountPolicyRow(r.rows[0] as RetiredAccountPolicyRow | undefined);
});
```

`ctx` is the same `{ firmId, clientId, createdBy: work.initiator, taskId: "" }` v4 builds at
`claraWork.v4.impl.ts:696`. RLS (`p_fadp_agent`, migration 0346) binds `firm_id =
clara.wake_firm()`; the statement adds the client pin, exactly as v4 pins the asset's own client.
It returns AT MOST ONE row, and zero rows whenever a LIVE policy supersedes the retired one.

**The step must pass the row's own `asset_account_code`** as `$2`, which means the register read
that finds the pending asset has to select it — v4's current read
(`loadPendingFixedAssetStepV4`) does NOT. Add `fa.asset_account_code` and
`fa.acquired_date::text as acquired_date` to that read when the successor is cut; #933's own
successor contract already owes the date for the same reason.

**4 · The mapping**, pure, already built and tested: `mapRetiredAccountPolicyRow(row | undefined)`
→ `FaProposalRetiredPolicy | null`. Feed the result into `FaProposalInputs.retiredPolicy` alongside
#1090's `knowledge` and v4's own `siblings`; `deriveFaParticularsProposal` needs no change.

**5 · Refusal mapping — none.** A plain SELECT under an existing policy: no new CLR code, no new
door, and the mapper never throws. A step that cannot reach the pool should treat this read the way
v4's own register read is treated (`catch { return null }`): it never withholds the question, only
the ground.

**6 · Part kind / prompt stanza — none new.** This ticket adds no tool, no part and no prompt text;
it only feeds an existing, already-specified input type.

---

## Follow-ups worth filing

1. **The read is specified, driven and tested but still not wired into any workflow step.** Same
   follow-up #1090 filed, now with a second ground owed to it. `loadFaProposalInputsStepV6` does not
   exist; wiring both reads (plus the two extra register columns named in §3 above) into a real step
   belongs to whichever ticket cuts `claraWork_v6`. Until then no proposal in production carries
   either ground.
2. **A pending register row on an account that acquired a LIVE policy AFTER it was born grounds
   nothing at all, by design, and nobody has ruled on whether that is right.** `FA_PROPOSAL_BASES`
   has no `live_account_policy` ground: the derivation assumes a covered acquisition is born
   complete, which is true at BIRTH but not for a row that was already pending when the policy
   landed. Today such a row falls to `account_siblings`, or to no method at all. Adding a live-policy
   ground would be a change to the derivation's ranking order, which this ticket's brief puts out of
   scope — it is an owner question (should Clara propose from a policy the person set for FUTURE
   acquisitions, on a row that predates it?), not a defect to fix here.
3. **`clara.fa_account_depreciation_policies` now has one more reader and no reader census.** There
   is no estate-wide test that pins which tables `clara_agent_ro` may read (measured: no such
   roster exists in `packages/db/tests`). Each relation asserts its own posture, which means a
   future grant is caught only by whichever file happens to census that relation. A single
   `agent_ro` relation roster, in the shape `rig-meta.mjs` already gives EXECUTE, would make every
   future widening a review act. Not built here — it is a new cross-cutting census, not a follow-up
   fix.
4. **`gh issue view --comments` returns empty output on this host** (exit 0, zero bytes, from both
   Git Bash and PowerShell), while `gh api repos/.../issues/<n>` and
   `.../issues/<n>/comments` both work. Every lane worker's rule-2 instruction names the broken
   form. Worth a one-line note in RIG.md so the next worker does not read "no comments" off a
   silent failure — this ticket cross-checked with `gh api` rather than trusting the empty output.

---

## Anything unverified

- **The full round trip through a running `claraWork_v6`** is unverified BY CONSTRUCTION — the cut
  does not exist. Everything on both sides of that eventual join is driven here: the wall
  (`fp.wall`), the read under the real OBO credential (`fp.read`), the mapper (5 pure cells), and
  the assembly with the already-proven deriver over real register rows (`fp.ground`).
- **Hosted behaviour** is inferred from this lane database, migrated from scratch to the same
  frontier as every other lane; it is not measured against a hosted database. In particular,
  hosted holds real `clara.fa_account_depreciation_policies` rows that this seeded rig does not, and
  0346 has no data-dependent branch (it touches no rows), so there is nothing row-shaped left to
  exercise — but the claim that hosted's ACL matches this rig's pre-image rests on the from-scratch
  chain, not on a hosted measurement.
- **The whole `packages/db` suite and the whole `apps/web` suite were not run.** Only the files this
  ticket touched (with the full gate chain), the named cross-cutting gates
  (`operation-census`, `rig-isolation`, `ci-frontier-leg-contract`), a targeted regression over the
  relation this ticket re-ACLs (`fa-depreciation-policy`, `fixed-asset-acquisition`,
  `fa-particulars-proposal`), and one targeted `apps/web` file — per work-order rule 8's own scope
  for a ticket that did not touch `apps/web`. A wider regression sweep and a true from-scratch chain
  are the integrator's own gates.
- **The integrator's Linux re-run** of the new runtime cells under WSL as user `runner` has not been
  done here (it is the integrator's step, per RIG.md). The new cells touch no path, no spool and no
  spawned CLI, so no Windows-only assumption is expected — that is reasoning, not a measurement.
