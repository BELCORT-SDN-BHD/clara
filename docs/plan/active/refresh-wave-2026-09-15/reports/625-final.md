# #625 — membership lifecycle · final report

**Branch** `impl/625-membership-lifecycle` · **worktree** `C:\Users\zhant\Desktop\clara-wt\625` · rig PG 55501 / `clara_625` (194 migrations after 0209). All evidence **LOCAL**; **hosted evidence pending**.

```
c6f18f8c fix(web): two measured e2e-cell corrections
afa77fde docs: CONTEXT.md vocabulary + web README membership section
46335456 test(web): members-lifecycle e2e lane, the walk, two narrow faces
b07ebbe7 feat(web): in-dialog refusals, firm-named confirmations, second caller_context read at all four act sites
3450c881 feat(web): preview step, both face sets, joined stage
a83eebca feat(web): lib/firm/invite-preview.ts
ebe0b1c7 feat(db): 0209 clara.preview_invite
```
An earlier interrupted attempt left **nothing**: `git status` clean, `git log origin/main..HEAD` empty, no stash, no untracked files. Nothing kept, nothing discarded.

## Acceptance criteria
| AC | State | Evidence |
|---|---|---|
| AC1 faces | **done**; resend + capacity **out of scope, recorded** | 4 invite-outcome faces + 5→4 verification faces: `invite-accept-form.test.tsx` `p625.web.preview_blocks` (×4), `p625.web.faces` (5 reasons, 4 distinct next actions, 5 reason tokens). No-resend / no-seat-limit written in `Members.invites.noResendNote`, `apps/web/README.md`, `CONTEXT.md` (`docs/PRD.md:126`) |
| AC2 | **done** | `0209_preview_invite.sql`; `p625.web.preview_called` holds the read in flight and proves **no password field exists** while it is out, then that the block renders above (not inside) the form; `p625.web.joined` proves firm+role render with `router.replace` **uncalled**. Pre-auth preview = named residual |
| AC3 | **done** (walls verify-only) | `p625.web.dialog_refusal` ×3 query the **open dialog's own subtree**; `p625.web.firm_named`; `p625.web.invite_invalid` (field-level `aria-invalid` from typed courier codes only). Walls: `mdrw-rank-walls.test.mjs` green |
| AC4 | **done** (server verify-only) | `settleAndRefreshContext()` at all four act sites; `p625.web.downgrade` ×2 (role-change site, **refused** invite site); `p625.web.email_mask` separately. `c5-stream-reauth-db.test.mjs` 2/2 on `clara_625` |
| AC5 | **done** | `members-invite-walk.spec.ts` **3 passed** (invite→banner→revoke→role→remove, focus return, refusal inside dialog, URL stable across four acts + Back/Forward); `responsive-shell-walk.spec.ts` **25 passed** incl. `/settings/members` reflow and both faces in the narrow target-size loop |
| AC6 | **done** | New a11y cells (preview block, blocked face, joined stage) + reduced-motion and 320/640 legs. "No partial/stale state on this journey" and "no roster filter, so no no-results state" written into the walk/panel headers |
| AC7 | **partial, ceiling stated** | `preview-invite.test.mjs` runs through `asHumanEmail` personas under `set role clara_authenticated`. **No browser→real-Postgres leg exists** (`live-stack/playwright.live.config.ts:16` single-string `testMatch`; `:5-8` forbids the siblings). Mock-backed walks are **not** AC7 evidence |
| CB-AE2E-014/-025/-033 | **re-measured** | 014: `p625.web.downgrade` (new measurement, not the old guard). 025: whole-suite `members-dates` green + firm-named titles re-asserted. 033: `firm-navigation-walk` `/settings/members` cells green |
| C-80 | **verify-only; sentence replaced** | 0209 takes **no** row lock (tail T.4 asserts it from `prosrc`); invariant recorded in `packages/db/README.md` |
| C79.1/C79.2 | **partial — residual named** | Receipts exist; the activity ladder still files `member.*`/`invite.*` under `documents` (`0184:2078`/`:2320`). Not claimed satisfied; written into `CONTEXT.md` "Access history" |

## Tests and commands
- **DB, 29-gate chain, focused**: `preview-invite` + `p4t1-invite/-reads/-identity/-add-member-regression` + `mdrw-rank-walls` + `p4-4-role-rank-pin` → **101 tests, 101 pass, 0 fail, 0 skipped**. Red-first: the same file before 0209 → **11 fail** on the premise gate ("the door does not resolve"). Focused green with `CLARA_ALLOW_MISSING_PREVIEW_INVITE` **unset**: 11/11, **0 skips**.
- `operation-census` + `rig-isolation` (no reset flags): **31 tests, 30 pass, 0 fail, 1 skip** (the destructive T19 cell, as RIG.md requires).
- **Whole `apps/web` suite** (`node scripts/run-tests.mjs`): **3747 tests, 3745 pass, 0 fail, 2 skipped** — both pre-existing live-provider-gated auth cells. `thread-live-clarify.test.tsx` did **not** flake in the whole run and is 2/2 in isolation.
- **Runtime**: `c5-stream-reauth-db.test.mjs` 2/2 on `clara_625`. No runtime file changed; `check-frozen-workflows.mjs` OK (281 frozen files), `check-parts-parity.mjs` OK. **No World e2e leg and no `action.yml` edit — this journey invokes no Workflow.**
- **Playwright** (3230/3231/3232): `members-invite-walk` **3 passed**; `responsive-shell-walk` **25 passed**.
- `pnpm typecheck` at the worktree root: **exit 0** (`apps/web typecheck: Done`, `packages/runtime typecheck: Done`). `pnpm lint` at the worktree root: **exit 0** across all four workspace projects.

## Docs
`packages/db/README.md` (member lock order + 0209 deployment note) · `packages/db/tests/README.md` (`p4t1-*`, `mdrw-*`, `preview-invite`) · `apps/web/README.md` (new "Membership" section) · `CONTEXT.md` (Invitation, Membership / Roster, Role ladder and rank wall, Access history; Admission-capacity cross-reference). **No blueprint drift found.**

## Successor contract
**None.** No AC requires a chat/Work-lane tool and none was added.

## Assumptions (orchestrator review)
1. **The brief's "declare the three member reads in `SHARED_RPC_VERBS`" is mechanically impossible** — that census matches `/rest/v1/rpc/…` only and requires ≥2 claimants, so the declaration would red. I shipped an equivalent gate instead: `CORE_RELATION_HANDOVERS` in `e2e-fixture-ownership.test.ts`, watching exactly the relations this change moved. The three pre-existing takeovers (`clients` ×11, `chat_sessions` ×2, `onboarding_plans`) are named as known-and-excluded — declaring eleven claimants of `/clients` would put a shared-file conflict in front of every sibling branch.
2. **The invite→pending-row leg cannot be walked honestly.** `/api/invite` refuses before the door unless mail is configured, and `RESEND_ENDPOINT` is a module constant with no base override; setting a key would POST to a third party every run (the harness's own stated reason for omitting `STRIPE_SECRET_KEY`). The walk drives the courier to its honest settled outcome and revokes a seeded row.
3. Two courier codes (`unsupported_address`, `recipient_has_account`) now **keep the invite dialog open**, so the address being corrected survives. Every other courier code still closes it — `mail_failed` must.
4. The gate is appended **last** on `packages/db/package.json`'s chain: that list is chronological by migration, not alphabetical.

## Pre-existing red found (not mine, not fixed)
`firm-navigation-walk.spec.ts:370` asserts the client register has **4** rows; at `origin/main` the shared array is `CLIENT_A, CLIENT_B, ...ACTIVITY_CLIENTS(2), ...WORK_LIST_CLIENTS(3)` = **7**. My `serve-built.mjs` diff is one import + one hook line. 9 passed / 1 failed.

## Follow-ups worth filing
1. **Signed-out invite preview.** `preview_invite` is `clara_authenticated`-only and this estate declares no `anon` role, so showing an invitation before sign-in needs a server route holding a service key.
2. **Access history is unreadable.** Fix the kind ladder in `list_activity` **and** `get_activity_event` together (`0184:2078`/`:2320`, af.15 forces both), both sha-pinned. Shared with #633/#647/#650.
3. **Stale client-register count** (above).
4. **A mail-transport base-URL seam** would let a walk prove invite→pending row without an outbound call.

## Unverified
Hosted behaviour (nothing deployed). The provider's exact `error.code` for a **consumed** vs an **expired** Supabase invite token was not re-measured this session — P1's copy therefore states the indistinguishability rather than asserting a code, which is the conservative reading and matches `brief-622.md:29`.
