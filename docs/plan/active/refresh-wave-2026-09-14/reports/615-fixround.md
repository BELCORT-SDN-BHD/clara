# #615 fix round — final report

Branch `impl/615-operator-support`, worktree `C:\Users\zhant\Desktop\clara-wt\615`.
Commits this round (`git log --oneline main..HEAD`, newest first):

```
34df6ba5 fix(web): #615 — the door-dialog census learns admission-capacity-panel is not a dialog
8687ba39 test(web): #615 — the operator-owner sidebar row, and the operator-admin floor beside it
267f73a5 fix(db,web): #615 review round — the case door takes text, header stops over-claiming, op-key digest stops colliding
```
267f73a5 and everything below it predate this session; this session added 8687ba39 and 34df6ba5.

## Finding → CLOSED/OPEN → evidence

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | `p_id text` → one not-found arm | CLOSED | `packages/db/migrations/0188_operator_support_console.sql` — `get_operator_support_case(p_kind text, p_id text)`, casts via `begin...exception when invalid_text_representation`, single CLR11. `tests/operator-support.test.mjs` os.06 (7 malformed + 2 lenient-valid + signature control); `lib/operator/reads.test.ts` new cell. |
| 2 | header vs `supportedActionFor` for `metadata_missing` | CLOSED | Migration header now says every OPEN problem (incl. `metadata_missing`) is resolvable; matches `apps/web/lib/operator/reads.ts:335-339` (`case_kind === "problem"` → `"resolve"` unconditionally). |
| 3 | stale citations in `lib/registration/doors.ts` | CLOSED | Header/FOLD comments repointed to `components/operator/support-case-sheet.tsx`'s deterministic-key mechanism; grep confirms no remaining "the caller" reference to the deleted `registrations-queue.tsx`. |
| 4 | arm-1 intent ordering | CLOSED (thin coverage) | 0188 arm 1: `order by (i.status in ('paid','consumed')) desc, i.opened_at desc, i.id desc`. No cell builds two intents on one registration to pin this tie-break specifically — os.04 only pins whole-queue order. Flagged as follow-up. |
| 5 | queue door `ORDER BY` | CLOSED | `clara.list_operator_support_queue` now restates `order by c.occurred_at desc, c.case_id desc` rather than relying on the shared function's order surviving a FROM-clause call. os.04 behaviorally pins it; passed. |
| 6 | exact `proacl` assertion | CLOSED | Migration tail (5b): literal `proacl` string compared for all three functions (two per door + shared body), NULL proacl also fails, replacing the `clara\_%` role sweep. |
| 7 | firms snapshot vs live join | CLOSED, pre-existing | All three arms of `clara._operator_support_cases` read `firm_name`/`firm_id` from `clara.firm_registration_requests` (own stored columns, `0145_p4_tranche2...sql:327`), never a live join to `clara.firms`; `clara.firms` appears only in the two authority `exists(...)` checks. Not touched by 267f73a5 — already correct in the base build (ccf61364). os.11 proves no books leak. |
| 8 | `uq_frp_registration` prestate pin | CLOSED | Prestate now requires both `uq_checkout_intents_session_id` and `uq_frp_registration` as unique indexes, raising CLR10 otherwise. |
| 9 | `capacityOpKey` collision | CLOSED | New `apps/web/lib/operator/op-key.ts`: both `supportOpKey`/`capacityOpKey` now go through one SHA-256, replacing 32-bit FNV-1a. `support-case-keyboard.test.tsx` drives two real measured FNV-1a collision pairs and asserts distinct keys. |

## Rig

The brief's assumption ("rig615 has 0188 under the old checksum") did not hold: `clara.schema_migrations`'s stored checksum for `0188_operator_support_console` (`8a78f3a3...`) byte-matches the current file, and `get_operator_support_case(text,text)` already resolves live (`(text,uuid)` does not) — a prior session had already dropped/reapplied 0188 on rig615 (267f73a5's own message says so). **rig615b was not provisioned** — unnecessary; rig615 was only queried, never reset.

## Task B — dirty test file

`node --import ./test/bootstrap.mjs --import tsx --test components/app-shell/app-sidebar.test.tsx`: 9/9 pass. Fixture verified correct against `apps/web/lib/navigation/tree.ts:210-217` (`operator`: `minimumRole: "owner"`, `operatorOnly: true`, positioned between `activity` and `settings`). Committed as 8687ba39.

## Task C — verification

- DB: `packages/db/tests/operator-support.test.mjs` against rig615, exact gate flags from `package.json`: **14/14 pass**, 0 skipped (no frontier skip — evidence, not a gap).
- Web unit, all touched files: `app-sidebar.test.tsx` 9/9; `support-case-keyboard.test.tsx`+`support-queue-a11y.test.tsx`+`reads.test.ts` 29/29; `tree.test.ts`+`legacy-routes.test.ts`+`checkout-doors.test.ts` 39/39; `brand-identity.test.tsx`+`command-go-access.test.tsx`+`firm-admin-pages-a11y.test.tsx` 36/36; `e2e-fixture-ownership.test.ts` 7/7.
- `pnpm typecheck`: green (apps/web, packages/runtime). `pnpm lint`: green (packages/db, apps/web incl. contrast/manifest/message-key gates, packages/runtime, packages/reporting-render).
- Whole apps/web suite (`node scripts/run-tests.mjs`): first run 3374/3377, 3 fail — one was `door-dialog-outcome.test.tsx`'s MAJOR 2 census (real regression from #615's own new files, fixed as 34df6ba5); post-fix run **3375/3377 pass, 2 fail**: `checkout-faces-a11y.test.tsx` and `thread-live-clarify.test.tsx`, both real-timer timing assertions. Neither file is touched by this branch; both pass 100% in isolation (25/25, 2/2). A third file (`use-clara-thread-stop.test.ts`) failed on run 1, passed on run 2 and in isolation (25/25) — cross-run instability confirms real-timer load flake under this ~200s/3377-test run, named per instruction, not fixed. `#707`/`#693` did not appear.

## Assumptions

"The #615 db test files" = `operator-support.test.mjs` (only db test file this branch touches, per `git diff --stat`). Grepped `checkout-gate-c2/c3`, `p4t2-registration`, `g1-wake-engine`, `checkout-convergence` for `operator_support`/`0188` — none found, so not separately run; **unverified** beyond that grep.

## Docs

None updated this round — ARCHITECTURE §9/§10/§11 and CONTEXT.md's operator-support terms were already landed in the base commits; the 9 fixes were code/test only.

## Follow-ups

File as an issue: add a `packages/db/tests/operator-support.test.mjs` cell that builds two checkout intents on one registration (one paid, superseded by a later cancelled) to pin arm-1's tie-break behaviorally (item 4 above) — currently proven only by code inspection.

## Worktree state

`git status`: clean. All fixes committed with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
