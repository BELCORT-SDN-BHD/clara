# Wave 3 · Lane 04 · Ticket #932

Fixed assets (1/2): a default depreciation policy per enrolled asset account, applied at
acquisition with its version recorded on the register row.

Branch: `riders/w3-lane04` (worktree `C:\Users\zhant\Desktop\clara-wt\651`), base
`ffe63a0dd084e99b84c1368119845be273c421ce`. This is the FIRST ticket in the lane — there were no
prior commits on the branch and no prior migrations applied to `clara_l04`.

Commits (in order):

- `92519a57e` `feat(db): #932 a default depreciation policy per enrolled fixed-asset account`
- `63d88387e` `feat(web): #932 the default depreciation policy read/write module`
- `39f16c2af` `feat(web): #932 the default-policy block on the enrolled-account panel`
- `8075b4915` `test(web): #932 the Fixed assets walk covers setting a policy`
- `d29b8b14a` `fix(web): #932 review 0277's dynamic SQL for the P4 scope-view census`
- `1c75a9e48` `docs: #932 CONTEXT.md — Default depreciation policy`

## Resume note — an earlier implementer's uncommitted work

A prior implementer of this ticket had been killed mid-work by a usage limit, leaving the
worktree with 17 uncommitted files (11 modified + 6 new) and **migration 0277 already applied**
to `clara_l04` (`select * from clara.schema_migrations where version like '0277%'` — one row,
`applied_at 2026-09-20T15:58:51.775Z`, no earlier attempt for this version: a failed first apply
leaves no row at all, transactions being atomic, so this row is genuine evidence the FIRST-APPLY
branch of the prestate — not the `#957` redo branch — ran and passed for real; see "Migration"
below). I judged every uncommitted change on its merits rather than redoing it:

- The migration file, the two new doors, the recut birth sites, the web read/write module, the
  panel UI and the e2e walk were all essentially complete, internally consistent, and — where I
  could check independently (grep counts, the CHECK-constraint congruence, the RLS/grant shape,
  the ACs) — correct. I kept all of it.
- I found and fixed two real gaps the interrupted implementer had not reached: a lint failure
  (unused imports in the two new `packages/db/tests` files) and a shared-file gate failure (the
  new migration's dynamic SQL was an unreviewed barrier in `firm-scope-db-pins.test.ts`). I also
  found and fixed one real defect the e2e walk's own vacuity would have hidden until it was
  actually run: its final cell asserted the register showed a policy-born row with no reload, but
  nothing in this app pushes that update into an open tab. See "Gates" and "Fix round" below.
- Nothing was redone: I built on the applied migration and the existing files throughout, and I
  never used `CLARA_MIGRATION_REDO`.

## Seams this ticket's brief names (written down before touching anything)

- `clara.set_fa_depreciation_policy` / `clara.retire_fa_depreciation_policy` — the two human doors.
- `clara._tf_fa_acquisition_birth` (the deferred trigger) and `clara._fa_on_approve` arm 4 (the
  site that actually fires for an ordinary approve) — the acquisition birth sites.
- `clara.list_fixed_assets` / `clara.get_fixed_asset`, through `clara._fa_asset_json` — the reads.
- The Fixed Assets page: the account-profiles panel (set/retire policy) and the register row
  (provenance).

## Sequencing — the ticket's own triage comment is stale

The one comment on #932 (`belcorttao`, 2026-09-19) was checked against `origin/main` at
`0233`/`dc9acfe1`, before this lane existed, and pins `0227`'s text for the validator and the two
completion doors. Riders wave 2 already recut all of that (`0249`'s fold) **and** already recut
`clara._tf_fa_acquisition_birth` on top of `0216` (`0247`). Live measurement on `clara_l04` (267
files / `0272`, wave 3's own starting frontier) confirmed the comment's premise no longer holds;
`0277`'s prestate pins the bodies it touches or relies on as they stand on THIS database, not a
sha carried over from `0216` or `0227` (RIG.md's wave-3 addendum).

## Acceptance criteria, with evidence

**AC1 — a new versioned policy relation with its own human doors; the enrolment untouched.**
`clara.fa_account_depreciation_policies` (append-only, version-forward, keyed on
`(client_id, asset_account_code)`, `created_by`/`reason`/`effective_from` columns,
`uq_fadp_active` enforcing one live row per account) plus `clara.set_fa_depreciation_policy` /
`clara.retire_fa_depreciation_policy`. `clara.upsert_fa_account_profile` and
`clara.retire_fa_account_profile` (the enrolment belt watermark) are pinned UNMOVED in 0277's
prestate and re-pinned in its tail (§T.6). Evidence: `p932.version` (11-test battery, see Gates)
— setting a policy twice retires the old row and mints version+1, exactly one row stays active.

**AC2 — the acquisition birth reads the live policy; stated particulars always win; no-policy
births pending as today.** BOTH real birth sites are recut, not one — measured, not assumed: a
policy planted only in the deferred trigger (0247's own scope) left an ordinary `buyAsset`-shaped
approve still birthing the pre-0277 pending row, because `clara._fa_on_approve` arm 4 runs first
and absorbs the trigger's insert on the same conflict target. Both recuts share one policy lookup
and one two-branch column choice. Evidence: `p932.birth.covered` (policy-covered acquisition born
`active`, `particulars_complete: true`, no "particulars pending" text, start date = the
acquisition's own posting date per the 2026-09-18 owner ruling) and `p932.birth.uncovered`
(no-policy account still parks the question, `depreciation_method: null`). "Stated particulars
always win" is proven the one way this estate can drive it today — there is no mechanism yet for
an acquisition entry itself to carry particulars at posting time (grepped, none exists) — via
`p932.frozen`: a policy-born row is a COMPLETE row, so `complete_fixed_asset_particulars` refuses
it `fa_particulars_already_complete` exactly like a hand-completed one, and
`revise_fixed_asset_particulars` still reaches it.

**AC3 — the register/page show "particulars from `<account>` policy v`<N>`"; the audit row names
the version.** (SPEC-932-4, fix round: the birth's provenance is carried as an EVENT, not an audit
row — the estate writes no audit row for a trigger-borne birth, and none existed before this
ticket. `clara.set_fa_depreciation_policy`'s own `clara._audit` row does name the version. Read
"event" for "audit row" in the sentence below.) `clara._fa_asset_json` (the one source `list_fixed_assets`/`get_fixed_asset` both
read through) surfaces `depreciation_policy_id`/`depreciation_policy_version`; the web panel
renders `t("policyProvenance", { account, version })` = "Particulars from {account} policy v
{version}" beside the particulars. `clara._append_event('asset.acquired', ...)` at both birth
sites carries `depreciation_policy_id`/`depreciation_policy_version` in its payload, and
`clara.set_fa_depreciation_policy`'s own `clara._audit` call records the version on every set.
Evidence: `p932.birth.covered`'s json assertion (`depreciation_policy_id`/`version` on the read);
the e2e walk's `bornRow.getByText("Particulars from 1510 policy v1")`.

**AC4 — the five behavioural cells, plus from-scratch with prestate pins on the recut trigger.**
(SPEC-932-1, fix round: "born complete with no question" was offered here as measured when only
the register row's completeness had been driven. It is measured now: `p932.birth.work_lane` posts
a policy-covered acquisition through `clara.wake_record_journal_entry` and runs the RUNTIME's own
pending-asset discovery predicate — sliced out of `packages/runtime/workflows/claraWork.v4.impl.ts`
at test time, never retyped — against that entry, seeing it select nothing, with an uncovered
acquisition in the same cell as the vacuity control. ADV-L04-1, fix round: a policy is now declined
at birth when it no longer fits its enrolment; see migration 0280 and `p932.drift`.)
`p932.birth.covered`, `p932.frozen`, `p932.birth.uncovered`, `p932.no_touch` (a v2 policy never
touches an asset v1 already birthed — both assets' own stamps checked), `p932.run` (a policy-born
asset is picked up by the UNTOUCHED depreciation engine, `clara._fa_compute_charges` /
`clara._fa_asset_charges` pinned unmoved, 3 charge rows posted on this run). The migration's own
prestate pins the LIVE pre-image of the recut trigger AND arm 4 AND `_fa_asset_json`, measured on
`clara_l04` moments before the file was written; its tail re-reads all three post-images plus 14
non-regression pins. A true from-scratch chain is the integrator's job (wave-2/3 addendum); what a
lane can prove — that 0277 actually applies from a clean 267-file/0272 frontier — is exactly what
happened here for real: `clara.set_fa_depreciation_policy` did not exist before this file ran, so
the prestate took the FIRST-APPLY branch (not the `#957` redo branch), and it is the only row in
`clara.schema_migrations` for this version.

**AC5 — the Fixed Assets walk covers setting a policy and seeing a policy-born asset; the db
batteries stay green.** `fixed-asset-acquisition-walk.spec.ts`'s new, last cell: signs in, sees
"No policy set", sets a straight-line policy (36 months), sees "v1" and the register carry the
policy-born row with "Particulars from 1510 policy v1" and no "Waiting on depreciation
particulars", then retires the policy and confirms the panel reverts. 9/9 passed on the lane-04
triple (below). The db batteries: see Gates.

## Fix round — three defects found by actually running the gates

1. **Lint (packages/db).** `fa-depreciation-policy-fixtures.mjs` imported `noteLane` and
   `fa-depreciation-policy.test.mjs` imported `opk`/`faRows`/`entryRowOf`/`caught`/
   `runAndSettle`/`COST`/`ACCUM`/`EXPENSE` without using any of them directly (all reached through
   the fixtures file's `export *` or genuinely unused). Removed from both import lists. Verified:
   `npx eslint tests/fa-depreciation-policy-fixtures.mjs tests/fa-depreciation-policy.test.mjs` —
   clean.
2. **Shared gate — `apps/web/tests/firm-scope-db-pins.test.ts`.** This is a shared file the
   work order names; it censuses every migration after `0141`/`0145` for a
   `create [or replace] view clara.caller_context` / `…firm_registration_requests_visible`, and
   ANY migration whose dynamic SQL the oracle cannot statically resolve is treated as an unproven
   barrier — regardless of what it actually touches — unless reviewed by hand in
   `firm-scope-db-pins.corpus.ts`. 0277 has two such sites (a guarded `ALTER TABLE` do-block
   adding the two new columns/FK, and the standard 0038/0041 bulk-ACL grant loop over its own two
   new doors); neither calls `pg_get_functiondef`, reads a live body or can emit a view. Added a
   reviewed-barrier entry (reason + content sha256), same shape as `0216`'s and `0232`'s own
   entries. Before: `apps/web tests` run showed 2 failures, both this cause (`clara.caller_context`
   and `clara.firm_registration_requests_visible`'s own "ONE pinned body" cells). After: 0 failures.
3. **The e2e walk's own final cell.** First run: 8/9 passed, the new cell failed —
   `getByRole('row').filter({ hasText: 'RM 3,600.00' })` never appeared (20s timeout). Setting a
   policy never births an asset by itself; the mock stands a LATER acquisition in by keying
   `list_fixed_assets` off `state.policySet`, but nothing on the page subscribes to that relation
   after the policy dialog closes (the account-profiles panel's `onActed` deliberately does not
   bump the table's own reload — correctly, since a policy change alone never moves a register
   row). Fixed by reloading the page before the assertion — the same "a real re-read, never an
   optimistic paint" law this spec file's own header states for a completion. Second run: 9/9.

## Gates, with counts

- `packages/db`, focused, full gate chain (`node --test --test-concurrency=1 $GATES
  tests/fa-depreciation-policy.test.mjs`, `$GATES` = the 85 `--import` flags in
  `packages/db/package.json`'s `test` script): **11/11 pass, 0 skipped** (`p932.law`,
  `p932.door.not_enrolled`, `p932.door.method`, `p932.door.non_depreciable`,
  `p932.door.not_set`, `p932.version`, `p932.birth.covered`, `p932.birth.uncovered`,
  `p932.frozen`, `p932.no_touch`, `p932.run`).
- `operation-census.test.mjs`, same gate chain: **10/10 pass**.
- `rig-isolation.test.mjs`, same gate chain: **22 pass, 1 skipped** (`T19` poison-role — a known,
  intentional skip; it needs `CLARA_RIG_ALLOW_RESET`, which this rig's rules forbid setting). No
  reset flags were set at any point.
- `apps/web` unit, files touched: `lib/registers/fa-depreciation-policies.test.ts` **4/4**;
  `components/registers/fixed-assets-a11y.test.tsx` **2/2**;
  `components/registers/register-refresh-siblings.test.tsx` **6/6** (8/8 combined with the a11y
  file in one run); `tests/firm-scope-db-pins.test.ts` **22/22** (post-fix; 2 failing pre-fix).
- `apps/web` unit, WHOLE suite once (`node scripts/run-tests.mjs`), post-fix:
  **4850 tests, 4848 pass, 0 fail, 2 skipped**. The 2 skips are the pre-existing, unrelated
  `CLARA_LIVE_SUPABASE_AUTH_URL`/`…ANON_KEY not configured` live-provider skips in
  `components/entry/…` — present with or without this ticket, not a Windows-only red this ticket
  owns.
- `pnpm typecheck` (repo root): clean, twice (before and after the corpus.ts fix).
- `CI=true GITHUB_ACTIONS=true pnpm lint` (repo root, as the runner sees it): clean — `apps/web`,
  `packages/db`, `packages/runtime` and `packages/reporting-render` all `Done`, exit 0. (First run
  caught the two `packages/db` unused-var errors above; second run, post-fix, clean.)
- `apps/web/e2e/fixed-asset-acquisition-walk.spec.ts`, the WHOLE file, on the lane-04 Playwright
  triple (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3530 CLARA_E2E_NEXT_PORT=3531
  CLARA_E2E_RUNTIME_PORT=3532`): **9/9 pass** (first run 8/9, the new cell's own defect above; second
  run, post-fix, 9/9).
- `packages/runtime` was not touched by this ticket; `check-frozen-workflows.mjs` /
  `check-parts-parity.mjs` do not apply.

## Migration

`packages/db/migrations/0277_fa_default_depreciation_policy.sql`. Prestate pins (measured on
`clara_l04`, 267 files/`0272`, moments before the file was written):

- RECUT (pre-images, checked unless this is a `#957` redo of 0277 itself):
  `clara._tf_fa_acquisition_birth()` = `5ff7590994db3b1fd324a53487750fbe437636e055f84910f470ae8832cdb994`;
  `clara._fa_on_approve(uuid)` = `7ffa9a710bf2ba5fc6c49ed184251f7cbb37c834a213f0ddeeb3a3ba91b98fc0`;
  `clara._fa_asset_json(uuid,date)` = `0b657fe539fb55de182af7eb93a6cbfca74f6bca62d003185ee7e9d985db78f0`.
- UNMOVED (14 non-regression pins): `clara.upsert_fa_account_profile`,
  `clara.retire_fa_account_profile`, `clara._fa_particulars_complete`,
  `clara._fa_validate_particulars`, `clara.complete_fixed_asset_particulars`,
  `clara._fa_complete_particulars_core`, `clara._fa_assert_completion_not_a_change`,
  `clara._fa_assert_particulars_completable`, `clara.revise_fixed_asset_particulars`,
  `clara.fa_register_tie`, `clara._fa_compute_charges`, `clara._fa_asset_charges`,
  `clara.list_fixed_assets`, `clara.get_fixed_asset` — see the migration's own prestate block for
  every sha.

Applied to `clara_l04` (`applied_at 2026-09-20T15:58:51.775Z`, the only row for this version —
i.e. the FIRST-APPLY branch, never `#957`'s redo branch; no `CLARA_MIGRATION_REDO` was used at any
point in this session). The house shape is complete: header, prestate, the change (§A relation,
§B/§C doors, §D grant loop, §E/§E2 the two recut birth sites, §F the recut read), §T tail
assertions, a preintegration gate module with a stable stem
(`tests/fa-depreciation-policy-preintegration-gate.mjs`, stem `fa_default_depreciation_policy$`), a
rig-meta cohort (`FA_DEFAULT_DEPRECIATION_POLICY_0277_COHORT`, bimodal like `0270`'s), and its
`--import` entry appended last in `packages/db/package.json`'s gate chain (migration order).

## Docs

- `packages/db/README.md` — new `## 0277` section: what it does, the "both birth sites, measured"
  finding, the stale-triage-comment note, what it does not touch, and the redo-safety shape.
- `CONTEXT.md` — new **Default depreciation policy** term, beside **Depreciation particulars**
  (house "term / _Avoid_" shape), explicit that this is never "the product infers" and that a
  stated particular still always wins.

## Successor contract

None. Neither new door (`clara.set_fa_depreciation_policy` / `clara.retire_fa_depreciation_policy`)
is `clara_runtime`-callable — both are `_human_ctx`-floored at bookkeeper by design (the same floor
`upsert_fa_account_profile` takes), confirmed in the migration's own tail (§T.2: PUBLIC holds no
EXECUTE, `clara_authenticated` holds exactly EXECUTE, `clara_runtime` holds none) and in
`p932.law`. Nothing here is a frozen-chat or Work-tool capability, so no successor contract is
owed.

## Follow-ups worth filing

- The e2e defect this round fixed (a mutation dialog that legitimately should NOT refresh the
  register table, paired with a test that expected an in-session push anyway) is a shape other
  "later acquisition lands on a policy-covered account" scenarios could hit again if a future
  ticket ever adds a live subscription to the register; worth a note on
  `fixed-assets-register.tsx`'s own header if that ever changes, so the walk's reload-based
  pattern is understood as deliberate rather than a workaround.
- `packages/db/tests/fa-depreciation-policy-fixtures.mjs`'s `noteLane` import removal and the
  corpus.ts reviewed-barrier entry are exactly the kind of thing #932's own migration header warns
  wave-3 lanes about (a barrier that is real but unrelated); no further action needed, recorded
  here per the wave-3 addendum's own instruction to name every pin an integrator might need to
  re-check.

## Anything unverified

- I did not independently re-derive `ck_fa_method_drivers`'s own `pg_get_constraintdef` rendering
  by hand outside the migration's own prestate anchor; I relied on that anchor passing (it is part
  of the applied migration's own prestate, which succeeded) rather than re-measuring it myself.
- I did not drive the `#957` redo branch on this rig (no edit to 0277 was needed after the fix
  round touched only sibling files, never the migration itself), so only the FIRST-APPLY branch is
  directly proven here; the REDO branch is proven only by the migration's own internal signal logic
  (`clara.set_fa_depreciation_policy`'s presence), not by an actual redo run on this lane.
- Hosted-only states (a real firm's data) are out of scope for a lane database and were not
  exercised; only the seeded lane-04 rig was used throughout.
