# wave 1 · lane 01 · code-review fix round 2

Branch `riders/w1-lane01`, worktree `C:\Users\zhant\Desktop\clara-wt\635`, db `clara_l01` (55741,
unused this round — no `packages/db` work in this lane). Playwright triple
`https://127.0.0.1:3500` / `3501` / `3502`.

**RESUME note.** This fix worker was launched to resume after an earlier fix worker on this lane
was killed mid-work by a usage limit. `git status`/`git log --oneline origin/main..HEAD` (rule 1)
were read first: the worktree held eight files of uncommitted changes on top of the seven landed
commits plus `f4c8f554` (fix round 1). Every uncommitted hunk was read and judged against the two
review reports below before anything else happened. All of it turned out to be genuine,
complete, tested work answering real findings — nothing was reverted. No `codereview-fix.md`
existed yet beside the reports (only `wave1-lane01-fixround-1.md` / `-recheck-1.json` from the
*prior* review round), so this file is new; it documents this round only, and fix round 1's own
file is left untouched as its own record.

```
abc29ff5 fix(web): wave1-lane01 code-review fix round 2 — #902 pack hydration, #863
          array-dispatch census, #862 body-reader census widening, #853 p_work
          paging, #848 doc/test-title accuracy                              <- NEW HEAD
f4c8f554 fix(web): wave1-lane01 fix round — #848 onReactivated re-read evidence,
          #863 collision cell, #865 README warning
726bcfdd feat(web): #848 walk arm proving Reactivate reaches migration 0211's door
162b9a98 fix(web): #865 make the build-then-test path impossible to miss
9855331b fix(web): #853 the second Work fixture must not collide on label or object id
e8cdc6d4 fix(web): #853 activity-mock.mjs honours p_work, mirroring migration 0202
3ae738e0 feat(web): #902 scope the client-work-pack e2e mock by p_client
c9a3f284 fix(web): #863 widen the RPC verb-opener census past three dispatch spellings
c35d8199 fix(web): #862 repoint every lane mock's private body reader onto the shared cache
```

`git status` clean at hand-off. Findings answered come from
`docs/plan/active/riders-2026-09-20/reports/wave1-lane01-codereview-spec.json` (SPEC axis) and
`wave1-lane01-codereview-standards.json` (STANDARDS axis) — the second, independent review pass
on this lane, run after fix round 1 was already folded into `f4c8f554`. No push, no PR, no GitHub
write, no other worktree touched, no subagent spawned, no process killed. One commit
(`abc29ff5`), eight files: `apps/web/e2e/README.md`, `activity-mock.mjs`, `chat-parity-mock.mjs`,
`documents-intake-mock.mjs`, `e2e-fixture-ownership.test.ts`, `home-board-mock.mjs`,
`journal-work-walk.spec.ts`, `serve-built.mjs` — all test/mock/doc, no migration, no frozen file.

---

## L01-SPEC-01 · major · #902 — the populated work pack was shaped so the app's own hydrator throws it away

**FIXED.**

**Reproduced.** `home-board-mock.mjs`'s `POPULATED_WORK_PACK` gave each row
`{id, label, state, updated_at}`. The real door (`packages/db/migrations/0214_client_work_pack.sql`)
projects `work_id`/`purpose`/`status`/`memo`/`attempts`/`current_run_status`/`retrying`/
`created_at` (active) and adds `receipt_id`/`entry_id`/`committed_at` (recent_success) — never
`id`/`label`/`state`. `hydrateRow` (`apps/web/lib/work/client-work-pack.ts`) drops any row missing
`work_id`, so the old fixture hydrated to `{activeCount:1, activeRows:0, recentCount:1,
recentRows:0}` — a shape the real door cannot produce, and the pre-existing cell couldn't catch
this because it asserted `deepEqual` against the very constant the mock returns.

**The fix.** Re-shaped both rows onto 0214's real field names, with statuses drawn from
`accounting_work`'s actual roster (0178: `running`/`completed`, not the invented `in_progress`).
Added `#902 · the POPULATED pack HYDRATES to real preview rows, not a count with an empty preview
(L01-SPEC-01)`, which calls `hydrateClientWorkPack` (imported from `../lib/work/client-work-pack`)
on the wire fixture and asserts on the hydrated rows' `work_id`/`status`/`receipt_id`/
`committed_at`, not only the raw constant.

**Evidence:** `node --import ./test/bootstrap.mjs --import tsx --test
e2e/e2e-fixture-ownership.test.ts` (from `apps/web`) → 44/44 pass, including this cell. Commit
`abc29ff5`.

---

## L01-SPEC-02 · major · #863 — the array-membership dispatch spelling was still invisible to the widened census

**FIXED.**

**Reproduced.** The fix-round-1 census widening (`c9a3f284`) only added `===`/`!==`/`path ===`
spellings. `home-board-mock.mjs`'s `EMPTY_RPCS` array, consumed through
`EMPTY_RPCS.includes(path)`, claims six RPC verbs the opener regex cannot see at all. Five of
those six (`list_fiscal_years`, `list_agent_act_receipts`, `list_bank_accounts`,
`list_bank_statements`, `list_uncoded_filings`) have a real second claimant elsewhere
(`bank-close-registers-mock.mjs`, `bank-match-mock.mjs`, `documents-viewer-mock.mjs`) — genuine
multi-claimant verbs the census reported as single-owner.

**The fix.** Added `ARRAY_MEMBERSHIP_DISPATCH` (matches `NAME.includes(path)`) plus
`arrayMembershipVerbs()`, which resolves the array literal `NAME` was declared with and extracts
every `/rest/v1/rpc/<verb>` string inside it; folded into `verbsInSource()`. Declared the five real
shares in `SHARED_RPC_VERBS` with a comment explaining dispatch order is load-bearing
(`home-board-mock.mjs` runs last of the three, so its unconditional `EMPTY_RPCS` answer is safe).
The sixth verb, `list_bank_account_proposals`, has no second claimant and correctly stays
undeclared. Four new cells: the synthetic array-dispatch shape is recognised; an array NOT
consumed through `.includes(path)` (the negative control, modelled on `home-board-mock.mjs`'s own
`EMPTY_RELATIONS`) contributes no verb; the REAL file's five shares resolve correctly; the sixth
stays single-owner.

**Evidence:** same 44/44 run above (4 of the 44 are this finding's cells). Commit `abc29ff5`.

---

## L01-SPEC-04 · minor · #863 AC1 — the GREEN-after-correction half was never built

**FIXED.**

**Reproduced.** Fix round 1's collision cell (`c9a3f284`) proved the RED half (an undeclared
synthetic collision reaches `verbCollisions`) but nothing proved the GREEN half — a
`verbCollisions` that flagged everything unconditionally would still have passed the RED cell
alone.

**The fix.** New cell `RPC-opener census · the SAME synthetic pair, corrected, produces ZERO
problems (L01-SPEC-04)` checks both real corrections: a single claimant (no collision), and the
same two claimants named on a declared share (no collision).

**Evidence:** same 44/44 run. Commit `abc29ff5`.

---

## L01-SPEC-03 · minor · #862 — the body-reader census only matched two literal names plus `request.on`

**FIXED — and the exact shape a PRIOR round refused to widen for.**

**Reproduced.** `PRIVATE_BODY_READER_FUNCTION` only matched `function readJson(`/`function
readBody(`; `PRIVATE_BODY_READER_STREAM` only matched `request.on("data"|"end")`. All seven real
violators fix round 1 fixed used `for await (const chunk of request)` — never tested for — so a
rename to `drain` would have passed. `documents-intake-mock.mjs`'s own `drain(request)` (using
exactly this shape) sat inside `LANE_MOCKS` passing the *new* fix-round-1 census.

Notably: `wave1-lane01-recheck-1.json`'s L01-S4 had already **refused** a `for await` widening in
the prior round, because four files (`periodic-adjustment-mock.mjs`, `staff-expense-claim-mock.mjs`,
`trade-invoice-mock.mjs`, `work-list-mock.mjs`) describe `readCachedJson`'s own mechanism in
backtick-quoted header-comment prose and would have false-positived. This round's fix does not
repeat that mistake.

**The fix.** Widened `PRIVATE_BODY_READER_FUNCTION` to also match `const readJson = async (` /
`const readBody = async (` (an arrow-bound private reader — does NOT match
`documents-intake-mock.mjs`'s real alias `const readJson = readCachedJson;`, which has no `async`
or `(` right after `=`). Widened `PRIVATE_BODY_READER_STREAM` to also match a bare `for await
(const x of request)`, with a `(?<!` + "`" + `)` lookbehind excluding the shape when the text
immediately before it is a backtick — which is exactly how all four "clean" files quote it in
prose. Verified directly: `grep -n "for await" apps/web/e2e/{periodic-adjustment,staff-expense-claim,trade-invoice,work-list}-mock.mjs` — all four hits are backtick-fenced inline code in a
comment, none is executable. Repointed the two real violators
(`chat-parity-mock.mjs`, `documents-intake-mock.mjs`) onto the shared `readCachedJson`/`readJson`,
removing their private `drain()` functions entirely. Three new cells: arrow-assigned `readJson` is
caught; a bare `for await` drain under any function name is caught; backtick-quoted prose does
NOT trip it.

**Evidence:** same 44/44 run (3 cells here); the real `LANE_MOCKS` census cells stay green with no
new false positive on the four backtick-comment files. Commit `abc29ff5`.

---

## L01-SPEC-06 · minor · #853 — the p_work filter was applied after paging and blanket-disabled it

**FIXED.**

**Reproduced.** `activity-mock.mjs` filtered the already-assembled `PAGE_1` and then forced
`next_cursor: null, truncated: false` whenever `p_work` was present at all — a blanket rule, not a
reflection of whether a matching row actually exists on `PAGE_2`. Migration 0202 applies its
`p_work` predicate INSIDE each union arm BEFORE the limit, so a Work-Activity walk seeding a
page-2 row would see behaviour this mock cannot reproduce.

**The fix.** Added `pageHasWork(work, page2 = PAGE_2)` (exported), which decides truncation from
`PAGE_2`'s real membership. `paginated` is now `work !== null ? pageHasWork(work) : !kinds`.
Neither of today's two real fixture Works has a `PAGE_2` row, so both resolve to `false` — same
value as before, but now because nothing further matches, not because `p_work` was merely
present. Two new cells: `pageHasWork` is driven directly on a synthetic page-2 population
(positive + negative); a p_work-filtered read against the REAL fixture confirms
`next_cursor`/`truncated` both stay `null`/`false`, matching what 0202's own predicate would give.

**Evidence:** same 44/44 run; `activity-feed-walk.spec.ts` 17/17 (part of the 81/81 walk run
below). Commit `abc29ff5`.

---

## STD-1 · major · #848 — README still claimed the mock "enforces" the owner floor

**FIXED.**

**Reproduced.** `apps/web/e2e/README.md`'s `journal-work-walk.spec.ts` coverage row said "...and
the mock's own owner-floor enforcement answering the database's CLR04" — a claim fix round 1's own
L01-S2 had already established false (the mock answers CLR04 purely on an armed flag, never
inspecting a caller) and corrected in the test's own title/comment. The README was touched again
in the very commit that made that correction (`f4c8f554`, for an unrelated sentence) without this
clause being fixed.

**The fix.** Reworded to "...and a forced denial rendering the database's own CLR04 owner-floor
refusal (simulated at the wire — every cell in this spec signs in as the owner persona, so the
mock is armed rather than driven by an actual rank check; see the test's own header comment)" —
matching the test's own corrected title/comment exactly, per AGENTS.md rule 6 ("claims need
evidence").

**Evidence:** `git diff` reviewed directly; wording now matches `journal-work-walk.spec.ts`'s own
comment verbatim in substance. Commit `abc29ff5`.

---

## STD-3 · minor · #902 — a census cell's title claimed a cross-lane guarantee its body never checked

**FIXED.**

**Reproduced.** `#902 · HOME_WORK_PACK_CLIENT is not HOME_ONBOARDING_CLIENT and mints no id any
other lane owns` only compared against ONE other id inside the SAME file. Nothing scanned any
other lane's mock, so a future lane minting the same id elsewhere would not red this cell despite
the title's claim.

**The fix.** Extended the cell's body: after the existing same-file check, it now loops every
other file in `LANE_MOCKS`, reads its source, and asserts `HOME_WORK_PACK_CLIENT.id` does not
appear in it — the same "read every lane mock's own source" idiom `bodyReaderCensus`/
`rpcVerbCensus` already use, so the title's own claim is now actually checked.

**Evidence:** same 44/44 run. Commit `abc29ff5`.

---

## STD-2 · minor · #848 — `control()`/`controlRead()` duplicated an identical fetch body

**FIXED.**

**Reproduced.** Both functions in `journal-work-walk.spec.ts` built the identical
`page.evaluate(async (call) => { const res = await fetch(...); ... })` construction, differing
only in `res.status` vs `res.json()`. The newer function's own comment ("the same shape as
`control` above") acknowledged rather than removed the duplication.

**The fix.** Extracted one shared `controlFetch(page, body)` returning `{status, text}` (raw text,
not a parsed body — deliberately, so `control` never risks a JSON-parse error masking its own
clear `toBe(200)` failure message on a non-200 response). `control` reads `.status`;
`controlRead` parses `.text` with `JSON.parse` exactly once, in Node.

**Evidence:** same journal-work-walk 23/23 (part of the 81/81 run below); typecheck clean.
Commit `abc29ff5`.

---

## `serve-built.mjs` — comment-only update (context for L01-SPEC-02)

The dispatch-order comment above `handleP657Supabase`/`handleHomeBoardSupabase` used to say the
ownership census "cannot see an array-dispatched arm" and forbade declaring those verbs in
`SHARED_RPC_VERBS` for that reason. Now that L01-SPEC-02's fix makes the census see exactly that
shape, the comment is updated to say so and point at the new declarations, so a future reader
does not "fix" a now-stale warning by un-declaring a real share. Dispatch order itself
(`home-board-mock.mjs` last of the three) is unchanged — still load-bearing, still documented.

---

## L01-SPEC-05 · minor · #848 AC3 — the owner floor is simulated at the wire, not enforced or forced

**NOT code-fixed — recorded, the review's own second sanctioned option. Second time this exact
substitution has been reviewed and accepted** (first: `wave1-lane01-review-spec.json` L01-S2,
recorded in fix round 1, independently re-verified in `wave1-lane01-recheck-1.json`).

**Reproduced.** `journal-work-mock.mjs`'s `reactivate_client_egress_purpose` handler answers CLR04
purely because `state.egressReactivateAnswer === "denied"` was armed by the walk's own control
endpoint (`journal-work-mock.mjs:1488-1490`) — it never inspects a caller. Branch (b) of AC3
(forcing a lower rank through the browser) is genuinely unreachable in this spec: every cell signs
in as the owner persona, and `work-detail.tsx`'s `canReactivateEgress={ownerHere}` hides the
button from anyone else in the UI itself. Branch (a) (the mock deriving its CLR04 answer from the
signed-in persona, the way `serve-built.mjs`'s own `/rest/v1/caller_context` derives `role_rank`
from the sign-in email prefix) is reachable in principle but was judged out of scope both times:
it would mean plumbing the caller's rank from `serve-built.mjs`'s module state into
`journal-work-mock.mjs`, a shared file nine other lanes edit concurrently this wave
(WORK-ORDER.md rule 7), for one minor walk-arm finding.

**Disposition.** Left as-is: the test's own header comment (`journal-work-walk.spec.ts`, "#848: a
forced denial renders the database's own CLR04 owner-floor refusal") already documents the
substitution in full, and README's STD-1 fix (above) now matches it. What is still missing is the
review's own explicit ask — "record it **on the ticket** rather than only in a code comment" —
which is a GitHub write outside a lane worker's authority (rule 2: "never comment on or close a
GitHub issue"). Recording it here for the orchestrator instead.

**Text for the orchestrator to post as a comment on issue #848:**

> AC3 ("the mock enforces owner-only dispatch, or the door refusal renders when a lower rank is
> forced") is met by simulating the wire answer, not by either literal branch. The mock's
> `reactivate_client_egress_purpose` handler answers CLR04 purely because
> `state.egressReactivateAnswer === "denied"` was armed by the walk's own control endpoint — it
> never inspects a caller's rank. Branch (b), forcing a lower rank through the browser, is
> unreachable in this spec: every cell signs in as the owner persona, and the button itself is
> owner-gated in the UI (`work-detail.tsx`'s `canReactivateEgress={ownerHere}`), so a bookkeeper
> persona never sees it to press. Branch (a), deriving the CLR04 answer from the signed-in persona
> (mirroring `serve-built.mjs`'s own `/rest/v1/caller_context` role-rank-from-email-prefix
> derivation), is reachable in principle but was judged out of this ticket's scope both times it
> was reviewed: it would mean plumbing the caller's rank from `serve-built.mjs` into
> `journal-work-mock.mjs`, a file nine other lanes edit concurrently this wave, for one minor
> walk-arm finding.
>
> This is the second independent review to flag the same substitution (first:
> `wave1-lane01-review-spec.json` L01-S2, recorded in the lane's fix round 1 and independently
> re-verified in `wave1-lane01-recheck-1.json`; second: `wave1-lane01-codereview-spec.json`
> L01-SPEC-05, this round). AC3 is accepted as met by the simulated-wire-answer test
> (`journal-work-walk.spec.ts`, "#848: a forced denial renders the database's own CLR04
> owner-floor refusal"), not by literal owner-only dispatch enforcement in the mock. If a future
> ticket wants the mock to derive rank from the signed-in persona, it should land as its own
> `serve-built.mjs` change, reviewed on its own — not folded into a lane fix round.

---

## L01-SPEC-07 · note · #862 — "no behavioural change" was stronger than what was proven

## L01-SPEC-08 · note · #862 — gate count in the final report was stale (33 vs 34, now 44)

## STD-4 · note · commit trailer on `f4c8f554` didn't match WORK-ORDER.md rule 2's literal convention

**No action taken — note severity, out of this round's "above note" scope**, and all three are
report-wording / process observations rather than code defects:

- L01-SPEC-07 and L01-SPEC-08 are corrections to prose in `wave1-lane01-final.md` (a file this
  round did not touch — it lives in the main checkout, is not committed, and rule 10 names it as
  the *original implementation* report, not this fix round's own). Both are one-line rewording
  fixes the orchestrator can make when folding this lane's report into the wave record, per their
  own `required_fix` text.
- STD-4's own `required_fix` says explicitly "None required of this lane's own work" — it flags
  that a *different* session authored `f4c8f554` with the session-attribution trailer rather than
  the work-order trailer, which is accurate and not something this round's commit repeats (this
  round's own commit `abc29ff5` uses `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`,
  matching WORK-ORDER.md rule 2 and every one of this lane's other seven commits).

---

## Vacuity / structural-sensitivity check (horizontal-slicing question)

No horizontal-slicing finding was raised against this round specifically (the STD axis's own
`checked_and_clean` list already confirmed no horizontal slicing across the whole branch). As a
direct sensitivity check on this round's own new cells regardless: with the `POPULATED_WORK_PACK`
row's `work_id` field renamed back to the old `id` key (a one-line, reverted-after break),
`node --import ./test/bootstrap.mjs --import tsx --test e2e/e2e-fixture-ownership.test.ts` failed
exactly the new L01-SPEC-01 cell (`hydrated.active.rows[0]?.work_id` read `undefined`) while every
other cell stayed green — confirmed, then restored byte-for-byte (`git diff --stat
apps/web/e2e/home-board-mock.mjs` empty before this round's own commit). Re-run after restore:
44/44.

---

## Gates (re-run fresh on `abc29ff5`, all from `C:\Users\zhant\Desktop\clara-wt\635`)

- `node --import ./test/bootstrap.mjs --import tsx --test e2e/e2e-fixture-ownership.test.ts`
  (from `apps/web`) → **44/44 pass, 0 fail** (34 → 44, the +10 new cells this round adds).
- `pnpm typecheck` → **exit 0** (both `apps/web` and `packages/runtime` report Done).
- `pnpm lint` → **exit 0** (token-contrast, test-manifest, message-keys, ui-add-guard selftests
  all pass; `apps/web` and every workspace package clean).
- `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3500 CLARA_E2E_NEXT_PORT=3501
  CLARA_E2E_RUNTIME_PORT=3502 pnpm --filter @clara/web e2e journal-work-walk activity-feed-walk
  home-board-walk accrual-walk` → **81/81 pass, 0 fail** (journal-work-walk 23, activity-feed-walk
  17, home-board-walk 27, accrual-walk 14 — the four specs this round's touched mocks/walk feed).
- `node scripts/run-tests.mjs` (from `apps/web`, the whole unit suite) → **4657 tests, 4655 pass,
  0 fail, 2 skip** (4645/4647 prior-round baseline + this round's 10 new cells, no regression).

Known Windows-only reds (RIG.md) were not encountered in any of the above; none applies to this
diff's file set.

## Docs

`apps/web/e2e/README.md` updated in the same commit (STD-1). No new domain vocabulary introduced;
`CONTEXT.md` correctly left untouched (confirmed by the STANDARDS axis's own `checked_and_clean`
list — "egress" is already documented, no new term here).

## Follow-ups worth filing

- The `serve-built.mjs` comment update and the five new `SHARED_RPC_VERBS` declarations
  (L01-SPEC-02) are a genuine widening of what the ownership census can see across ALL ten lanes'
  mocks, not just this one — worth a wave-level note that other lanes' array-dispatched RPC arms
  (if any) are now checked too, where they previously were not.
- L01-SPEC-05's ticket-comment text (above) is ready to post; this is the only outstanding
  GitHub-write item from this round.

## Anything unverified

Nothing from this round. `firm-navigation-walk.spec.ts` remains unrun (noted as such in the
original SPEC report, predates this round, and imports only `ACTIVITY_CLIENTS`, which this
round's `activity-mock.mjs` change does not touch — residual risk unchanged, not reverified here).

## Return

New head: **`abc29ff5`** (branch `riders/w1-lane01`). Tree clean.
