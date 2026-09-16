# #625 — fix round 1

**Branch** `impl/625-membership-lifecycle` · reviewed head `c6f18f8c` → **new head `241acf74`** · rig PG `127.0.0.1:55501` / `clara_625` (194 migrations). All evidence **LOCAL**; **hosted evidence pending**.

```
241acf74 test(web): #625 round-1 F4/F6 — the preview step now runs in a real browser, and the lane's verb set does real work
31e3ab77 fix(db,web): #625 round-1 F1/F2/F3 — the preview reproduces TWO of accept_invite's three walls, named and pinned
```
`git diff --stat c6f18f8c..HEAD` → 9 files, +379 / −19. Worktree clean; nothing pushed; no other worktree touched.

**Verdict counts:** 0 blockers · **1 should** (applied, in its reviewer-stated minimum form) · 12 notes across three lenses — 4 applied, 1 ratification requested, 2 confirmations recorded, 1 environment cleanup done (three of the twelve are the same two findings seen by a second and third lens).

## Finding → what I did → evidence

| Finding (lens · severity) | What I did | Evidence |
|---|---|---|
| **F1 preview/accept wall divergence** (ADVERSARIAL · **should**) | Applied the reviewer's **(b)**, not (a) — see "what I deliberately left" for why (a) contradicts DECISIONS. Deleted the false "cannot show anything to a caller who could not also ACCEPT" from `0209:37-39` and the "nothing is previewable that could not also be accepted" clause at `invite-preview.ts:16`; both headers now name the third wall. Recorded as a **named residual** in `packages/db/README.md`'s 0209 note and `apps/web/README.md`'s Membership section, and **pinned** by a new DB cell. | **RED FIRST**: the cell was first written to assert the deleted claim (what previews as `pending` is acceptable by the same caller) → `not ok p625.preview.issuer_rank … error: "invite exceeds the issuer's rank -- re-issue by an owner", code: 'CLR04'` — the reviewer's exact reason. **GREEN** after the fix: it pins preview=`pending`/role=`admin` against accept=CLR04 with that sentence, that the refusal mints no membership and moves no row, and that `clara.firm_invites_visible` reports `pending` too (the roster is blind in the same place). File: 12/12. |
| **F2 "ELEVEN typed courier codes"** (ADVERSARIAL · note) | `apps/web/README.md:48` → **TEN**. | `lib/members/doors.ts:309-319` / `:324-335` declare exactly ten `InviteCourierCode`s; the README already listed ten. |
| **F3 dead tail guard T.2** (ADVERSARIAL · note) | `0209 §C` now tests `position(…)` **first**, then cuts; the comment records why. | Measured on the rig: `position('zzz' in 'abc')` → `0` and `substr('abc', 0)` → `'abc'`, so `if v_ret = ''` was unreachable. Positive control on the same input: **OLD shape → no exception (dead guard)**, **NEW shape → raised**. |
| **F4 preview step never runs in a browser** (ADVERSARIAL · note) | Built the leg the brief anticipated. `members-lifecycle-mock.mjs` answers `verifyOtp`'s `type:"invite"` and `/rest/v1/rpc/preview_invite`, both **scoped by token**, and the hook moved ahead of the auth branches (the checkout lane still runs first). Two cells in `members-invite-walk.spec.ts`. | Both cells **passed in every run they ran in** (3/3; 6.7 s and 3.1 s in the last). They assert: the confirm stage has **no** `input[type=password]` and no door call; after the click the preview region carries the firm, `Bookkeeper` and `n***@larkin.test` and **not** the unmasked address; the region **precedes** the password field by `compareDocumentPosition`; **exactly one** POST to the door, whose `Authorization` Bearer decodes to the invitee's own `sub`/`email`; and a revoked preview renders its own face naming the firm with **zero** password inputs, no preview region and no Continue control. |
| **F5 / STANDARDS note-1 / SPEC F2 — `SHARED_RPC_VERBS` substitution** (note ×3) | **Ratification requested.** No change made. All three lenses independently confirmed the brief's literal instruction is mechanically impossible and the substitute is equivalent in force; ratifying it (or amending `brief-625.md:66`) is the orchestrator's call. Recorded as assumption 0 in `625-final.md`. | `e2e-fixture-ownership.test.ts:1034` requires `actual.length > 1` for every declared verb; the three member reads are `/rest/v1/<relation>` PostgREST reads, which `RPC_VERB_OPENER` never matches. |
| **F6 / STANDARDS note-2 — dead verb-set export** (note ×2) | Wired it, in `plans-mock.mjs:286`'s shape: `MEMBERS_LIFECYCLE_RPC_VERBS` is now the lane's **exact-verb allow-list**, checked before any branch, so a verb answered but not declared cannot be reached at all; the comment now says what the code does; `preview_invite` is declared with it. | The handler called directly with `POST /auth/v1/token` → `handled=false, responded=false` in 4 ms (falls through without opening the body). `e2e-fixture-ownership.test.ts` **16/16**. |
| **F7 stale client-register count** (ADVERSARIAL · note) | Left as-is — out of scope, already a follow-up in the final report. | The reviewer confirmed this branch never touches `firm-navigation-walk.spec.ts`. |
| **F8 fresh cluster left running** (ADVERSARIAL · note) | **Used, then dropped.** The amended 0209 was re-applied on it from a true prestate and the battery re-run there, then `wsl -u root -- pg_dropcluster --stop 17 rig625r`. | `pg_lsclusters` before/after: `rig625r 55601` present → absent; `rig625 55501` still online and untouched. |
| **SPEC F1 — responsive-shell-walk flakes** (note) | Nothing to fix; reproduced the class and measured it against a control (below). | `responsive-shell-walk` **25/25 passed** in my combined run; the reds landed on `members-invite-walk`'s three PRE-EXISTING cells instead — the flake moves between runs, exactly as that finding says. |

## The migration changed, so it was rolled back and re-applied

`drop function clara.preview_invite(text); delete from clara.schema_migrations where version='0209_preview_invite';` on **both** rigs → measured prestate `193 migrations · preview_invite absent · zero application-role grants on clara.firm_invites`. Then `pnpm db:migrate`:

- `127.0.0.1:55501/clara_625` → `1 new migration(s) applied · 194 total`, printing its own `#625 prestate: clean …` and `#625 tail: OK …`; a second run → `0 new migration(s) applied · 194 total`.
- `127.0.0.1:55601/clara_625r` (the review's **from-scratch** 0001→0209 chain) → the same, battery 12/12, then dropped.

## Commands re-run after the fixes

| Command | Result |
|---|---|
| `pnpm typecheck` (worktree root) | **exit 0** (`apps/web`, `packages/runtime` both Done) |
| `pnpm lint` (worktree root) | **exit 0** (all four projects; `check-test-manifest`, `check-message-keys`, `check-token-contrast`, `check-dead-citations` included) |
| DB, 29-gate chain: `preview-invite` + `p4t1-invite/-reads/-identity/-add-member-regression` + `mdrw-rank-walls` + `p4-4-role-rank-pin` | **102 tests · 102 pass · 0 fail · 0 skipped** (was 101) |
| `preview-invite.test.mjs` focused, `CLARA_ALLOW_MISSING_PREVIEW_INVITE` **unset** | **12/12, 0 skips**, on `clara_625` and on the from-scratch `clara_625r` |
| `operation-census` + `rig-isolation` (no reset flags) | **31 tests · 30 pass · 0 fail · 1 skip** (destructive T19, as RIG.md requires) |
| `packages/runtime/tests/c5-stream-reauth-db.test.mjs` on `clara_625` | **2 pass · 0 fail** |
| `check-frozen-workflows.mjs` · `check-parts-parity.mjs` | **OK** (281 frozen files verified; reader ⊇ emittable) — runtime untouched, run anyway |
| `e2e/e2e-fixture-ownership.test.ts` focused | **16/16** |
| Whole `apps/web` suite (`node scripts/run-tests.mjs`) | **3747 tests · 3744 pass · 1 fail · 2 skipped** — the fail is the known whole-suite load flake `thread-live-clarify.test.tsx` (work order §9), **2/2 in isolation** immediately after; the 2 skips are the pre-existing live-provider-gated auth cells |

## Playwright: seven runs, and why the two reds are not this branch

| # | Tree | Spec(s) | Result |
|---|---|---|---|
| 1 | fixed | `members-invite-walk` (5 cells) | 3 passed / 2 failed — cells 1 and 2, both at `signInToMembers` (`toHaveURL`, 5 s budget); 14.2 m wall clock with ~55 Chrome and 71 node processes on the host |
| 2 | fixed | `members-invite-walk` | 3 passed / 2 failed — cells 1 and **3** (a different pair): cell 3's `beforeEach` reset POST exceeded the 30 s test budget; Chromium logged repeated TLS handshake failures against the harness origin |
| 3 | fixed | cell 1 alone | failed (same 5 s sign-in), host still loaded |
| 4 | **pre-fix control** (`git checkout -- apps/web/e2e`) | cell 1 alone | **passed** (19.4 s) — but the host had quietened by then, so this run alone proves nothing |
| 5 | fixed | cell 1 alone, quiet host (18 Chrome) | **passed** (1.1 m) |
| 6 | fixed | `members-invite-walk` + `responsive-shell-walk` | **28 passed / 2 failed** — `responsive-shell-walk` **25/25**, the two new preview cells **2/2**, reds on cells 1 and 3 again |
| 7 | **pre-fix control** | `members-invite-walk` (3 cells) | **2 passed / 1 failed** — cell 3, the **same** `beforeEach` 30 s reset timeout |

Run 7 is the decisive one: the identical red reproduces on the tree exactly as the reviewer saw it, with none of my changes present. Cell 1 passes solo on the fixed tree (run 5) and cell 2 passes inside loaded runs, so no cell fails deterministically. Both reviewers reported this class before I touched anything (SPEC F1; STANDARDS' own `firm-navigation-walk` note: "timeouts on unrelated assertions/sign-in … did not reproduce a second time"). **Nothing was "fixed" in response to them.**

## What I deliberately left

1. **F1 option (a) — folding the issuer-rank lookup into 0209 so an unacceptable invitation reports a non-`pending` status and reaches a blocked face — is NOT applied, because it contradicts two binding rulings.** DECISIONS §2 #625 and `brief-625.md` §Faces fix the invite-outcome set at **four** ("Invent no collapsing scheme"), and `brief-625.md` §3 binds this door's effective status to `clara.firm_invites_visible`'s own expression — which 0209's tail asserts fragment-for-fragment. A fifth status would therefore add a fifth face the wave ruled out **and** put the preview and the admin roster into disagreement about the same row, because the view cannot express it either. The honest fix widens **both** surfaces plus the face set: a product decision and its own ticket (filed as follow-up 3 in `625-final.md`). Round 1 ships the reviewer's own stated minimum instead — delete the false claim, name the residual in three places, pin the divergence so it cannot widen silently.
2. **F5's second half** — widening `CORE_RELATION_HANDOVERS` to the three pre-existing takeovers (`/clients` ×11, `/chat_sessions` ×2, `/onboarding_plans`) — left for the repo-wide sweep ticket the census header already proposes; doing it here would put a shared-file conflict in front of eleven sibling branches in this wave.
3. **F7** (`firm-navigation-walk.spec.ts:370`, 4 rows asserted against a shared register of 7) stays a follow-up: the file is outside this diff and the fix belongs with whoever owns the shared fixture.
4. **No AC7 claim for the browser preview leg.** The door is mocked; `clara.preview_invite`'s walls, mask, single refusal and effective status remain the DB battery's claim under real least-privileged roles. The lane header and the spec both say so.

## One thing worth flagging back

F4's work produced a red I did not predict, and it is worth knowing: `e2e-fixture-ownership.test.ts`'s N5 scope census reads **comments** as source, so quoting its own opener syntax inside a new comment registered as an undeclared unscoped handler (`members-lifecycle-mock.mjs: an unscoped handler answers for subjects this lane does not own — /rest/v1/rpc/…`). The comment was reworded, and the lane's declaration row now names the two handlers `HANDLER_OPENER` structurally cannot see (`/auth/v1/…` is outside its `/rest|/api` reach).
