Landed on `impl/625-membership-lifecycle` via 9 commits (`ebe0b1c7`…`241acf74`, migration 0209 + one round of review fixes): `clara.preview_invite`, the joined interstitial, and the four invite-outcome faces.

Migration 0209 adds `clara.preview_invite(p_token)`, granted to `clara_authenticated` under the same JWT-email wall as `accept_invite`, returning `{firm_name, role, effective_status, masked_email}` with no row lock and zero application-role grants on `clara.firm_invites`. The web side replaces the immediate `router.replace('/')` with a joined interstitial ("joined X, role Y → enter workspace") and renders the four typed `InviteVerificationFailure` faces (expired/revoked/already-accepted/wrong-email) from `lib/invite-verification.ts`, each with its own next action inside the open dialog's own subtree. Downgrade/removal re-reads `caller_context` at all four act sites (role change, invite, revoke, remove) with no polling and no change to `lib/parts/hooks.ts`. Round 1 (`31e3ab77`, `241acf74`) closed a real divergence between `preview_invite`'s walls and `accept_invite`'s issuer-rank check, and added a real-browser leg for the preview step. Local evidence: DB gate chain 102/102 (was 101, +1 for the issuer-rank pin), operation-census/rig-isolation 30/31 (1 skip by design), whole `apps/web` suite 3744/3747 (1 known whole-suite flake, 2/2 solo; recheck's own run: 3745/3747, 0 fail), runtime 2/2, Playwright 28/30 combined (the 2 reds reproduce identically on the pre-fix tree under host contention — not this branch; recheck's quiet-host run: members-invite-walk 5/5), typecheck/lint exit 0. All three review lenses closed, `open: []`, `new_blockers: []` on the re-check. Hosted evidence pending.

| AC / row | State | Evidence |
|---|---|---|
| AC1 invite-outcome faces | Done; resend + capacity out of scope, recorded | `p625.web.preview_blocks` (×4), `p625.web.faces` (5 reasons → 4 next actions); PRD:126 |
| AC2 preview before password | Done | `0209_preview_invite.sql`; `p625.web.preview_called`/`.joined`; round 1 added the real-browser leg (`members-invite-walk.spec.ts:254,310`) proving document order and a single Bearer-scoped POST |
| AC3 dialog refusals, firm-named | Done (verify-only) | `p625.web.dialog_refusal` ×3, `p625.web.firm_named`, `mdrw-rank-walls` green |
| AC4 re-read after downgrade/removal | Done (server verify-only) | `settleAndRefreshContext()` at all 4 sites; `c5-stream-reauth-db.test.mjs` 2/2 |
| AC5 walk (invite→revoke→role→remove) | Done | `members-invite-walk` 5 cells; `responsive-shell-walk` 25/25 |
| AC6 states/a11y/zoom/keyboard | Done | new a11y cells + reduced-motion/320/640 legs |
| AC7 least-privileged DB roles | Partial, ceiling stated | `preview-invite.test.mjs` via `asHumanEmail`; no browser→real-Postgres leg (this journey invokes no Workflow) |
| Issuer-rank wall | Named residual, pinned | `p625.preview.issuer_rank` (round 1); see ratifications |
| C-80 no row lock | Verify-only | tail assertion on `prosrc` |
| C79.1/C79.2 activity ladder | Partial, residual named | files under `documents` rung (D13, shared) |

**Review summary.** Round 1 closed 1 should (F1, issuer-rank divergence — reviewer's stated minimum) and 12 notes across three lenses (readme count, dead tail guard, missing browser leg for preview, `SHARED_RPC_VERBS` substitution ×3, dead verb-set export ×2, pre-existing register-count red, stale cluster). The re-check independently re-raced the issuer-rank probe on a from-scratch chain, confirmed the divergence is real and the fix's scope (delete the false claim, name + pin the residual) matches what was asked; `open: []`, `new_blockers: []`.

**Ratifications applied (DECISIONS §3.1).** (1) The `CORE_RELATION_HANDOVERS` census substitutes for the brief's literal "declare in `SHARED_RPC_VERBS`" instruction — **ratified**, since that census only matches `/rpc/` verbs with ≥2 claimants and the three member reads are plain relation reads; brief-625 §3 is corrected by this ruling. (2) The issuer-rank blind spot (an invite from a since-demoted/removed issuer still previews/lists `pending`) is **ratified as shipped** (§3.0 R1): the four-outcome set stays, `p625.preview.issuer_rank` pins the divergence, and a fifth-status fix is a separate follow-up ticket.

**Residuals / follow-ups.** Signed-out invite preview has no route (`preview_invite` is `clara_authenticated`-only, no `anon` role declared — needs a server route with a service key). Issuer-rank fifth-status follow-up (product decision + view widening on both `preview_invite` and `firm_invites_visible`). Stale client-register fixture count (`firm-navigation-walk.spec.ts:370` asserts 4 rows against a shared array now holding 7 — pre-existing, not this diff). A mail-transport base-URL seam would let a walk prove invite→pending-row without an outbound call. Activity-kind ladder (D13) files membership/invite events under `documents` — shared across 6 tickets, the orchestrator opens its own issue.

**Successor contract.** None. No AC in this ticket requires a chat/Work-lane tool.

**Integration evidence:** <INTEGRATION_PLACEHOLDER>
