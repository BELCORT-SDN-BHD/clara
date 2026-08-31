# The frontend-sprint work orders — 2026-08-31 (companion to the handoff)

*Each order is self-contained per `.claude/rules/handoffs.md` and inherits, verbatim, §0 of
[`fe-train-plan-2026-08-30-orders-p4.md`](fe-train-plan-2026-08-30-orders-p4.md) (read order,
rung-0 at the live body, worktree + junction mechanics, the four verify commands, the instrument
laws, the design-resources rule) plus §A below (the review ladder under 裁-84). Sizes are P3-lane
units. Where an order says "rung 0", census the doors at the LIVE body on a throwaway rig before
writing a line.*

## §A · The review ladder under 裁-84 — how every PR in this sprint is reviewed

1. Build in your own worktree; the four verify commands green; a RED-before proof per wall
   recorded in the PR body (mutant → which cell went red).
2. Push; open the PR with a body that carries: the rung-0 census table (door → live body → args →
   refusals → grant) · test counts control vs branch by name · every new door call and its surface
   · the skills/MCP line · what you could NOT verify and why.
3. **The independent leg:** from a DIFFERENT terminal/session, `codex exec -C <a fresh worktree of
   the PR branch> -m gpt-5.6-sol -c model_reasoning_effort="xhigh" -s read-only "<review prompt>"`.
   The prompt names the PR, the design of record, the acceptance list, and asks for: findings as
   BLOCKER / MATERIAL / NIT each with `file:line`, a refute-first stance (default "not a defect"
   unless the bytes show it), an explicit attempt to bypass every wall the PR claims, and a verdict
   `CLEAR` / `FIX REQUIRED`. Money/auth/webhook/tenant-creation PRs get a second reviewer prompt
   with the security lens (walls, replay, idempotency, cross-tenant, secret handling).
4. Fold on the same branch; the SAME reviewer session re-verifies to `CLEAR`; the owner reads the
   PR; `gh pr merge --squash` on green CI. Never `--admin`; a stale branch takes
   `gh pr update-branch`.
5. Docs-only PRs (`AGENTS.md` / `PROGRESS.md` / `docs/**` only) take the single-lane review
   (ADR-0069); the CI path classifier decides, never the author.

## FS-0 · The live-catalog verb census (裁-75) — size 0.3, no product code

**Why:** 裁-72 rests on `verb-coverage-census-2026-08-28.md`, pinned at frontier `0138` before the
port wave; the plan's own exit gate (`fe-train-plan-2026-08-30.md` §5.2 proof 1) is the instrument.
**Do:** a throwaway `postgres:17` rig → `node scripts/migrate.mjs` through `0155` → seed → read the
LIVE catalog (`pg_proc` + `has_function_privilege('clara_authenticated', …, 'EXECUTE')` + the
`_visible` views), never migration text. Direction 1: for every granted function/view, is there an
`apps/web` call site (`callDoor("<name>"`, `getRows("<relation>"`, or a wrapper in `apps/web/lib/**`
that names it) — classify UI-wired · deliberately non-UI (cite the ruling/runbook) · honest note ·
NO HOME. Direction 2: every name `apps/web` calls resolves. **Output:** a dated
docs/plan/active/verb-coverage-census-2026-09-XX.md (a new file) with the NO-HOME list and both counts, a
`NotBuiltNote` order per NO-HOME verb (or a ruling pointer), and an amendment note under 裁-72 in
the 08-30 ledger citing the measured residual. **Acceptance:** the denominator comes from the live
`pg_proc` read; every NO-HOME name re-checked by hand at its `apps/web` grep.

## FS-1 · #451 P4-2 — the scope spine, round 9 (resume, do not reset)

Worktree .claude/worktrees/p4-2-cx, branch web/p4-2-scope-spine, tip `3abb2b0f` + an
uncommitted three-file draft. **The bar (the reviewer's 16-probe table, restated):** H1–H14 — a
handler that mutates through a response ARGUMENT (`res.json(await mutateBooks())`), a name-trusted
`sendError` body, a computed `[op]` mutator, an early-return before the guard, a guard that reads a
projection of the scope instead of the scope, a try/catch that swallows the refusal, a redirect that
carries the prior client's state, a `(full)`-route escape, the runtime route handler bypass, a
missing `caller_context` re-read after `accept_invite`, a membership read from a cached object, a
`requireFirmScope()` that returns on `undefined`, a layout that renders children before the check
resolves, a test whose oracle is the implementation's own regex; N1–N4 — the negative controls
(no-membership · removed member · second-firm session · anonymous); C1–C4 — the positive controls
(owner · admin · bookkeeper · viewer). Each probe: RED-before captured, then green. The open
polarity question — the strict one-hop helper rule vs the real runtime `sendError` (which calls
`mapIntakeError`) — is settled toward **the strict rule** (a helper that can evaluate a denial-path
argument is a mutator). Full suite + lint + push; the same-reviewer re-verify.

## FS-2 · #461 P4-3 — the entry group, round 6 (merge-gating)

Worktree .claude/worktrees/p4-3-entry (if absent, `git worktree add … origin/web/p4-3-entry-group`),
tip `bebfb36e` (1402/1402). **NEW-A (HIGH):** `Referrer-Policy: no-referrer` on /auth/confirm
makes the confirmation form POST send `Origin: null`, so the same-origin wall 403s every real
browser. Fix `strict-origin`; **never accept `Origin: null`**. **Acceptance:** `pnpm --filter
@clara/web build` → `next start` → a real browser click on the confirmation page succeeds, with the
three instrument traps respected (a `fetch` from a test is not a browser; a `curl` with a forged
Origin is not the browser; the check runs against the BUILT app, not `next dev`). NEW-B pins: the
`Origin` allowlist is derived from `CLARA_PUBLIC_ORIGINS` (fail-closed when unset) and a cell pins
`Origin: null` → 403 with a positive control. Then rebase onto #451's tip.

## FS-3 · #455 P4-4 and #453 P4-5 — merge-forward and retarget

#455: CLEAR both legs at `1a131a5a`; round 8 = merge-forward onto #451's tip
(the branch's firm-scope sourceOracle.ts + the test-manifest conflict), the fixture LOW
(`2026-01-01T99:99:99Z` is not a timestamp — use a real future instant), import the shared
confirmed-user predicate instead of a local copy; retarget to `main` after #451 merges. #453: CLEAR
at `b6359309`; retarget after #451. Neither is the tier-3 path (裁-68: no operator queue for
self-serve); #453 is operator tooling and the same-day fallback if the checkout train slips.

## FS-4 · The checkout / signup-gate train (裁-73 · 74 · 68 · 81 · 26 · 36 · 64①) — design gate FIRST

**This is the most dangerous door in a multi-tenant system** (R8, 2026-08-26: the self-serve
tenant-creation door takes its OWN design gate + security review; never fold it into UI work).
**Step 1 — the survey + design + gate record** (three new files, docs/plan/active/checkout-gate-survey.md ·
-design.md · -gate-record.md — the estate's own shape): measure `create_firm` (`0147:497`), `firm_admissions` (hash-only since
`0147`), `request_firm_registration`/`firm_registration_requests` (`0145:370, :911`),
`claim_identity` (`0141:250`), the P4-3 signup flow in #461, `billing-design.md` §3.11 + Annex C,
`billing-annexes.md` Annex C.2 (webhook → door) and D.2 (PR-3's objects). **The ruled shape to
design to:** `/signup` → `claim_identity` → `request_firm_registration` (pending) → a Stripe
Checkout Session in subscription mode at the zero-amount price (metadata: the registration id and
the caller's identity) → on `checkout.session.completed`, a server-only webhook route verifies the
signature with the raw body (`Webhook.constructEvent`; a failure is 400 and calls NO door), then
calls the one idempotent door `record_stripe_event(event_id, type, payload)` (append-only
`clara.stripe_events`); a separate audited applier marks the registration PAID; the user's
success page calls a server-only route that, as the caller, invokes a new governed door
`claim_paid_admission(registration_id, op_key)` — SECURITY DEFINER, refuses unless a paid,
unconsumed payment row exists for THIS caller's registration, mints exactly one
`firm_admissions` row and returns its plaintext once — and then `create_firm(name, token, op_key)`
in the same request → redirect to the firm home. **Also in this train:** the DPA e-sign at signup
(裁-68①, text from `docs/ops/legal/`), 裁-26's email-bound admission token, and 裁-36's rate wall
after its short design sitting (裁-64①: a server-only courier passes the proxy-observed address
into a door argument; the DB stays the wall) — write the sitting's two options into the design and
let the owner rule. The holding page (裁-74): resume-checkout + accept-invite reachable; no
reminder mail; nothing deleted. **Stripe objects (裁-81):** mount the official Stripe MCP in
~/.codex/config.toml with the TEST restricted key in that server's env; create Product/Price
from `billing_plans` rows (PR-1's placeholder rows with `amounts_ruled=false`, or a minimal
`billing_plans` seed if PR-1 is not built yet — say which), the webhook endpoint, Stripe Tax per
裁-54 — every object recorded in `stripe_object_map`; never hand-author a price. **Walls to prove
with RED-before cells:** signature failure → no door; replayed event → one row; a paid registration
of ANOTHER caller → refuse; a consumed admission → refuse; `Origin: null` → 403; the rate wall both
polarities; the DPA unsigned → no checkout. **Beta scope:** checkout + admission + the holding page;
NOT invoicing (nothing invoices at RM0). **Review:** the security lens reviewer prompt (§A step 3)
is mandatory. Size ~0.4 BE + ~0.5 FE.

## FS-5 · The interview-runner port (裁-78) — size 0.7, hard cutover criterion

**Runtime surface (live, `packages/runtime/src/interviewRoutes.ts`):** `POST /api/interview/client/start`
(:260) · `POST /api/interview/answer` (:301) · `POST /api/interview/cancel` (:307) ·
`GET /api/interview/state` (:376); bookkeeper+ floor at the routes; Bearer = the session JWT.
`POST /api/interview/firm/start` is the firm-side interview — NOT this order. **The old client:**
`apps/dashboard/app/shared/interviewApi.ts` (`runtimeFetch` at :313/:322/:348/:486),
`apps/dashboard/app/onboarding/client/page.tsx`, `InterviewPanel.tsx`, `useInterviewRun.ts` (a
`GET /state` poller) — port the contract, not the code. **Transport:** the same-origin proxy
`apps/web/app/api/runtime/[...path]/route.ts` (already generic, allow-lists three headers, reads
`CLARA_RUNTIME_URL` at request time). **Shape (fa7b-onboarding-design.md §3.3, R7):** the interview
is an ESCALATED Clara thread, URL-addressable under the client workspace
(the existing full-screen route family /clients/[clientId]/clara/[threadId] — the interview
run rides it or a sibling `…/onboarding` route, URL-as-truth), collapsible to the rail, progress
line as the thread header, the park/answer protocol unchanged, **no optimistic UI** (an answer is
in the thread only after `GET /state` says so), the 409 on a second submitter rendered honestly.
The materials fork (§3.4) and the five playbooks are PR-c scope — NOT this order; `opening_position`
stays two-valued. **Entry:** the onboarding checklist card (T11, `OnboardingChecklistCard`) gains
the "start / continue the interview" control; `commit_client_onboarding` stays the human door it
is. **Acceptance:** a real run against the live runtime with a throwaway test client (ADR-0075):
start → answer every segment → cancel path → a second submitter's 409 → commit reachable; the
routes suite; a11y rules + keyboard walk on the thread; the cutover proof line "the interview
runner has an `apps/web` home" written into the P6-X order's acceptance.

## FS-6 · #462 / #463 and #454 (裁-79)

**#462** (worktree .claude/worktrees/coa-prb, round 2 uncommitted: the `ARRAY[NULL]` bricking
wall, section-only families human-opt-in, hash-source split, the named race refusal, five-ledger
counters, PR-a I-M8 scoped; focused 37/37): full suite on a rig + root lint + push + the N4-real
merge-prep note; then the fresh read-only review → fold → merge; the migration number is claimed at
merge. **In the same pass**, true the interview copy at `packages/runtime` interview questions
(the `coa_seed_decision` question) so it promises exactly what #462 delivers (a human applies the
template from the onboarding checklist). **#463** stays as built and reviews after #462.
**#454** (`chatTurn_v16`, merge-prep `c5e0fef7`, native r5 CLEAR at `443c386e`, CI green): one
fresh read-only review over the merge-prep tip (the transcription parity of the four wire shapes
against `apps/web/lib/parts/types.ts`, kinds AND fields), merge, then the Fly deploy ceremony
(`fly deploy` from the repo root; positive read of `chatTurn: chatTurn_v16` in the served bundle;
the freeze manifest `--lock-deployed`; `PROGRESS.md` posture line).

## FS-7 · Reports + close-prep chat tools (裁-77) — `chatTurn_v17` + F-A5b PR-3

**Rung 0 first:** which wake wrappers the `interactive`/`interactive_client` credentials may call
today — read `clara.wake_fn_allowlist` on a live-catalog rig. The report wrappers
(`wake_open_report_run(p_client, p_report_spec_version_id, p_books_snapshot_id, p_reporting_period_id, p_rationale, p_model, p_op_key)`,
`wake_assess_report_claim`, `wake_seal_report_dataset`, `_enqueue_render_job_core` via its
wrapper — `0114`…`0116`) are allowlisted to the interactive family (`0116:115`); the twelve `0138`
close wrappers (`wake_begin_close` · `wake_abandon_close` · `wake_open_fiscal_year` ·
`wake_list_fiscal_years` · `wake_get_close_plan` · `wake_get_close_readiness` ·
`wake_dry_run_close_readiness` · `wake_verify_close` · `wake_propose_close` ·
`wake_run_depreciation_catchup` · `wake_mint_month_snapshot` · `wake_snapshot_state`) were minted
for the `close_prep` wake kind — **if their allowlist rows do not admit the interactive kind, that
is a rows-only migration (INSERT rows, never a trigger recut — ADR-0076's law), with a census cell
both polarities.** **Runtime:** a NEW frozen closure `chatTurn_v17` beside byte-untouched v1…v16
(constraint 9; `.claude/rules/runtime-workflows.md`), built like `chatTurn.v15.tools.ts` extends
v14 by import: v17 = v16's set + the report tool set + the close tool set, `interactive` family
only, each tool's op_key deterministic per turn+segment+seq (the `bankPackReadSeq` precedent),
every DB call in named-argument notation, positive per-verb reply parsers, refusals rendered
verbatim. The human ISSUE stays human (`approve_report_for_issue`, the Reports tab). **PR-3 (F-A5b):**
the byte-burn render worker — placeholder → PDF end to end through the substitution seam
(`sandbox-export-design-part2.md` §3.6 / card-1 design), `packages/reporting-render`, the
render-job kind, the byte-hash receipt; the download door on the Reports tab. **Acceptance:** on a
rig, "open → assess → seal → render" driven from chat lands a `report_artifacts` row and the PDF
bytes download from the Reports tab; the close tools begin/verify/propose a close from chat with
receipts; every new tool has a refused-credential cell (an `autodraft`/`proactive` credential is
refused CLR03 at the DB). Sizes 0.4 + 0.2 + 0.6; each leg its own PR; the security-lens reviewer
on the allowlist migration.

## FS-8 · P6-T IA shell + the honest-note sweep (裁-80)

P6-T per [`fe-train-plan-2026-08-30-orders-p6.md`](fe-train-plan-2026-08-30-orders-p6.md) §P6-T,
**IA only**: the client Tax tab route + nav + ⌘K rows, the firm-level deadline feed shell, one
`NotBuiltNote` per panel naming verb + lane (F-T1 PR-2… · F-T2 rows · F-T3 PR-2…9), the tab's
shape stated as a proposal/receipt surface (裁-44) in the report. **The sweep:** derive every
`NotBuiltNote` from the live app tree (the `routes.test.ts` pattern), resolve each against
`PROGRESS.md`'s Backlog/Known-issues rows; any note whose lane merged is trued in the PR; any note
whose lane is paused must name a row. Size 0.3 + 0.3.

## FS-9 · The third conformance pass (裁-9) — P6's entry gate

Re-fetch github.com/BELCORT-SDN-BHD/clarabook-frontend at `main` (PR #1 merged `a7709883`; one
open PR #2 on the brand guideline) and read the DESCRIPTIVE resources — the prototype screens and
components under that repo's g6-high-fidelity/clarabook-prototype/ tree — as the parity reference for every built
surface; record deviations by ruling, never absorb them. Output: a new file docs/plan/active/clarabook-conformance-pass-3-2026-09-XX.md
(consumed / diverged-by-ruling / owed) and the P6-6 identity items confirmed (Ledger Fold ·
mascot · ClaraBook copy pass). Size 0.3.

## FS-10 · P6-X — the cutover (orders-p6 §P6-X, amended)

Everything in [`fe-train-plan-2026-08-30-orders-p6.md`](fe-train-plan-2026-08-30-orders-p6.md)
§P6-X stands, with these amendments: the scope note's "after ALL SEVEN P6-C trains" is **replaced
by 裁-75** (the measured residual + honest notes); **the interview runner has an `apps/web` home
(裁-78)** is a hard acceptance line; the exit-gate census is FS-0's output re-run at the tip.
**Workers deploy:** build on WSL/Linux with Node ≥ 22 (`pnpm --filter @clara/web cf:build`;
`wrangler` needs it — the root pin is Node 20), secrets via `wrangler secret put` (env-to-env),
`CLARA_RUNTIME_URL` + `CLARA_PUBLIC_ORIGINS` + the Supabase publishable key set, the Worker ≤ 10 MiB
compressed, a preview URL walked route by route BEFORE the DNS change, then the custom domain
`app.clarabook.com` moved from the Pages project to the Worker, **the Pages project's Git integration
disconnected FIRST** (measured 2026-08-31: the Pages project `clara` builds on every PR and every
push to `main`, so until it is disconnected every docs merge re-deploys the OLD dashboard), then the
project retired
(repoint first, prove, delete second). Ceremony-grade, from merged `main`, with an as-run in
`docs/plan/completed/`.

## FS-11 · The reduced Wave G (裁-83) → beta

From merged `main` after FS-10: the factory reset of the estate (`packages/db/README.md`'s reset
scoping; ADR-0075 — every firm/client is test data; the spike/workflow schemas untouched,
constraint 15) → apply `0155` (its pre-flight refuses on duplicates; the reset removes them, 裁-67)
→ the Supabase/Resend/Cloudflare items of `docs/ops/wave-g-setup-checklist.md` proven → the
sixteen-step walk on the desktop corpus with Stripe TEST mode (a non-zero test price + test cards
proving charge → webhook → firm) → the as-run (a new file docs/plan/completed/wave-g-reduced-asrun-2026-09-XX.md)
→ switch Stripe to LIVE + the RM0 price at the launch sitting → beta.

## FS-12 · Harness duties this sprint owes

- `PROGRESS.md` trued at every clock-out; the parked PRs' rows kept honest; `ADR-0077` signed by
  the owner and the digest re-trued; the 08-30 ledger's 裁-72 amended after FS-0; the
  `verb-coverage-census-2026-08-28.md` superseded by FS-0's file (index row: superseded).
- Root `README.md`, `apps/dashboard/README.md` (a SUPERSEDED banner), `apps/web/README.md` ("no
  signup route" → the ruled self-serve signup; 26 parts; P4/P6 state), `apps/web/AGENTS.md:3`,
  `packages/runtime/README.md`'s ledger line, `frozen-evaluators.json`'s two stale UNDEPLOYED
  notes, `.claude/skills/orchestrator-fable/SKILL.md`'s lane text and the `/grill-me` name — the
  "PR-2" truings the 2026-08-31 docs-only PR could not touch (they flip the CI classifier); one
  small PR under the full ladder.
