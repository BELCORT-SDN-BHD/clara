# Repair session 2026-09-04 — the queued work orders

The eight QUEUED work orders of the 2026-09-04→06 repair session, filed here byte-verbatim from
the session scratchpad, in the order they were issued; their queue positions are `PROGRESS.md`'s
Backlog (Q-01 = DB-D, Q-02 = CONSENT-186, Q-03 = DB-C, Q-04 = L10, Q-05 = L17, Q-06 =
REPORTING-H15, Q-07 = CI-E2E-192; L18 is unnumbered; Q-08/Q-09 have no order filed here), which
governs. Each order inherits
[`repair-session-2026-09-04-house-rules.md`](repair-session-2026-09-04-house-rules.md)
(the common house rules plus the lead-run migration renumber tool). Scratchpad paths named inside
an order below (`scratchpad/order-*.md`, worktree names) are historical labels from when the
order was drafted — the order text itself, not that path, is the durable copy. `PROGRESS.md`
governs on any divergence between an order's stated scope and the work as actually queued or
dispatched. Filed under `completed/` as a closed record of what was issued; the live queue and
its order are `PROGRESS.md`'s Backlog, which governs.

Order below: DB-D (H-21) · CI-E2E (裁-192) · L18 (chat actions) · L10 (chatTurn v18) ·
CONSENT (裁-186) · DB-C (walls, 裁-187/188) · REPORTING (H-15) · L17 (copy sweep, runs last).

<!-- begin verbatim: order-DB-D-h21-projection.md · md5 0af8f587db3b78e1a54f2f9c637e92fb -->
# Order DB-D — H-21: project the onboarding interview's captures into the client record (opus-5 xhigh, native)

Worktree `dbd-h21-projection`, branch `db/onboarding-capture-projection-h21`. Read the house rules, `.claude/rules/db-migrations.md`,
`.claude/rules/db-tests.md`, `packages/db/README.md`, then package `B-onboarding-interview` item 10 (H-21) and item 11's read half,
package `F-client-workspace-home` item 1 (the Knowledge/identity sections), and `C-52`/`C-85 R3` in the handover part 2, all in
`map-results.json` / `docs/plan/active/beta-handover-2026-09-04-part2.md`. Cut from the CURRENT origin/main AFTER #551 and #552 merge
(the orchestrator tells you). This is the handover's "highest-leverage single row": four symptoms, one cause.

WHAT WAS MEASURED: `commit_client_onboarding` (`0017_wave_b.sql`, chase live) activates the client, snapshots the plan, audits, and
projects NOTHING — `client_facts` 0, `clients.fy_end_month/day` NULL despite `fye=12`, `bank_accounts` 0 despite the banks answer,
`client_identifiers` 0 despite the SSM. Consequences seen: the FY-end dialog re-asks; `closing_stock_present` reads UNKNOWN on
`trade_nature_fact_absent`; no bank account; the client's own sales invoice sat `direction_unresolved` (`_direction_from_extraction`
`0049:872-951` found no identifier → CLR30). The coder's context pack (`get_context_pack(client,'coding')`, consumed by
`autoDraft.v9.postcall.ts:178`) is therefore near-empty for every interview-onboarded client.

SCOPE — one PR of `UNNUMBERED_*` files + cells (+ the web half if small):
1. **A projection door `clara.project_onboarding_captures(p_client, p_plan, p_op_key)`**, SECURITY DEFINER, called by a NEW
   `commit_client_onboarding_v2` (or spliced into the live commit body if it is not sha-pinned/D1-heavy — measure and say) in the
   SAME transaction as the commit, idempotent (a replay projects nothing twice — each write keyed by (plan revision, item key)):
   - `ssm` / `tin` captures → `add_client_identifier` (the existing audited door; respect #551/`0155`'s unique + the 0062 name-only
     guard; `format_verified=false` projects with `verified=false`, never silently promoted);
   - `fye` → `clients.fy_end_month` + `fy_end_day` (the interview captures a MONTH; the day defaults to the month's last day with
     the basis recorded — a stated derivation, never a guess; the FY-end dialog must then stop re-asking — cite the reader);
   - `entity_type`, `msic`, `sst_regime`, `mpers_eligibility`, `basis`, `framework` → `record_client_fact` rows with
     `basis_kind='interview_carryover'` + the plan revision as provenance (add the catalog rows + validator arms the fact door
     needs — read the fact catalog first; a fact kind the catalog does not know is REFUSED, never free-texted);
   - the `banks` answer → a PROPOSAL (`wake_propose_bank_identifier_promotion` or the seeding-proposal shape), never a silent
     `bank_accounts` row (an account is a registry entry a human confirms);
   - `trade_nature` is NOT part of this row (the interview never asks it — C-29 owns the producer).
2. **Read side**: `get_context_pack` must pick the new facts up (measure with a cell: an interview-onboarded client's pack carries its
   SSM, entity type, MSIC, FYE); the Knowledge tab's read (`knowledge-panel.tsx`'s source) shows them with `basis_kind`, verified
   status and provenance — the web half is ≤ S if the panel already renders `client_facts`; otherwise name the web lane.
3. **Cells**: projection of every capture kind; idempotent replay; the unverified-SSM arm; the CLR30 direction case now resolves
   (plant a sales invoice for the projected SSM and assert `_direction_from_extraction` finds the identifier); the FY-end dialog's
   read sees the month; the pack carries the facts. Fresh-rig estate suite; deploy-onto-existing; D1 list (the commit body if
   spliced). Every new `clara_authenticated` door names its frontend home.
PR title: `db(onboarding): project the interview's captures at commit — identifiers, FY end, client facts, a bank proposal — so the coder and the Knowledge tab see them (H-21 · CB-AE2E-009/030) — refs #541`.
<!-- end verbatim: order-DB-D-h21-projection.md -->

<!-- begin verbatim: order-CI-E2E-192.md · md5 ef03896433a4595ff1309414ad9da044 -->
# Order CI-E2E — the required browser smoke gate (裁-192 · CB-AE2E-036) — opus-5 xhigh, native

Worktree `ci-e2e-192`, branch `ci/web-e2e-smoke-required-gate`. Read the house rules, `AGENTS.md` "CI/CD" (the meta-gate law: every
job success-or-lawfully-skipped, both directions asserted; `timeout-minutes` on every job; hosted `ubuntu-latest`), `docs/adr/README.md`
law 77 (ADR-0073 per-PR scope), `.github/workflows/ci.yml` (all nine jobs, the `changes` classifier, the `ci` meta-gate at `:637-652`),
`apps/web/e2e/README.md` ("Why the CI browser leg is not wired up yet" — that paragraph is now superseded by 裁-192 and must be re-cut),
`apps/web/e2e/run.mjs` + `serve-built.mjs` + `playwright.config.ts`, and package `K-shell-responsive-a11y-nav` item 2 in
`map-results.json`. Cut from the CURRENT origin/main AFTER the web PRs #546/#547/#548/#549/#550 have merged (they add specs and mocks;
the orchestrator tells you when).

THE CONTRACT (ruled 裁-192): one job `web-e2e-smoke`, REQUIRED under the `ci` meta-gate, ≈10 minutes wall-clock budget, on the BUILT app
with the mocked stack (`serve-built.mjs`), an explicit SMOKE spec list (not every spec): the entry faces walk, signup→confirm→pending,
the firm navigation walk (rank shaping), the onboarding walk's mocked arm, the journals table walk, the bank/close/registers walk, the
chat-parity walk, the a11y-finish walk — pick by measured duration so the sum stays ≤ 8 min on hosted; the live-stack specs and
fixture-gated specs stay OUT (they skip without env). Unexpected console errors and failed network requests RED the job (the specs'
collectors already exist — assert on them). `retries: 0` (a flake is a finding, never retried away). The per-train acceptance walk
(裁-86) STAYS as the lane's own instrument; this gate is the floor.

SCOPE — one PR (`.github/workflows/ci.yml` + `.github/actions/` if a composite fits + `apps/web/e2e/README.md` + `AGENTS.md` CI/CD
paragraph + `docs/adr/README-rulings-2026-09.md` row for 裁-192 (check the 500-line ceiling; the ledger entry itself is the
orchestrator's, in the -pm ledger)):
1. The job on the `build` job's shape (Node 20, pnpm store cache, `pnpm install --frozen-lockfile`, `npx playwright install --with-deps
   chromium`), `timeout-minutes: 15`, gated by the classifier on code paths (`apps/web/**` + the shared packages the web imports —
   read how `build` is gated and mirror it), invoking the harness through the package script with the explicit spec list
   (`pnpm --filter @clara/web e2e -- <specs>` — extend `run.mjs` to accept a spec list if it does not), uploading the Playwright
   report + traces as an artifact on failure only.
2. Wire it into the `ci` meta-gate's `needs` and its code-gated success-or-skipped assertion in BOTH directions (a skipped smoke on a
   docs-only PR is lawful; a skipped smoke on a code PR is RED).
3. Prove it: (a) a green run on this PR; (b) a deliberately broken spec on a throwaway branch (or a `workflow_dispatch` input that
   plants a failure) shows the job RED and the meta-gate RED — screenshot/run ids in the PR body; (c) measure the wall-clock and put
   the per-spec durations in the body.
3b. **Stabilise the two known flakes BEFORE the gate is required** (a required gate with a known flake blocks every PR):
   (i) `apps/web/e2e/checkout-gate-walk.spec.ts` (line numbers of `main` at `a2d098f2` — MEASURE first; two reviewers read
   the helper's waits differently): the fail-closed client-IP arm (test at `:293`, reached through `reachDpaStep`
   `:113-140`) — its signup stayed on `/signup`; and an axe colour-contrast reading against a TRANSITIONING button from
   the `scan()` helper (`:105-108`, called at 174/181/190/220/244/255/284; the failing test was "REFUSAL POLARITY" at
   `:230` and once the DPA-refusal test), each once in ~6 runs with no related diff (lanes L7, L13, L15, 2026-09-04). CAUSES READ by review-549 (confirm, then fix at the cause): `:286` ← `reachDpaStep` at `:117-120` — the "Create account" click is followed only by a heading assertion (`:118`), never `waitForURL`, then an unconditional `page.goto("/auth/confirm")` at `:120` racing the in-flight signup POST; `:223`/`:230` ← the scan helper at `:105-108` calls `AxeBuilder` right after `toBeVisible()` (first painted frame), sampling an interpolated colour mid-transition on a `transition-[…opacity]` button; and this file's `scan()` lacks the instrument positive control `chat-parity-walk.spec.ts:40` has (`results.passes.length > 0`). Diagnose by reading: a race between the
   post-registration navigation and the assertion (use `waitForURL`/a settled-state locator, never a sleep), and an axe
   scan fired mid-transition (await the transition's end or scan under reduced-motion). Fix at the cause; a retry is not
   a fix. (ii) `apps/web/e2e/fs4-checkout-mock.mjs:100-106` records EVERY lane's RPC door call into `state.doorCalls`
   (which `checkout-gate-walk.spec.ts:334` asserts empty) before falling through — safe only under `workers: 1`; scope
   the recorder to the checkout doors so `workers` can be raised later. Both get a cell or a comment naming the hazard.
   (iii) THE BODY-CONSUMPTION HAZARD (found by L13 on #555, judged by review-555): `readJson` in the e2e mocks CONSUMES the
   request stream, so a lane that parses then falls through hands every later lane `{}`; `bank-close-registers-mock.mjs:206`
   calls it unconditionally on every `/rest/v1/rpc/` POST before deciding, and only hook ORDER (`serve-built.mjs:416` before
   `:417`) keeps L13's confirm-and-file alive today — positional, silently re-broken by any reorder or a sixth lane. Fix
   structurally: ONE shared `readJson` that memoises the parsed body on the request (`request._body ??= await parse(request)`)
   and returns the cached object on every later call, so order is irrelevant; plus the house rule parse-after-match ENFORCED
   by a cell in `e2e-fixture-ownership.test.ts` (the census already reads these files): no lane calls `readJson` above its
   first `verb ===` comparison. Mutant: restore the unconditional read → the cell reds. (iv) THE TABLE PRIMITIVE HAS NO
   BROWSER COVERAGE (L7, #549, mutant P): no walk face renders a read-only table that SCROLLS, and axe applies
   `scrollable-region-focusable` only to a region that scrolls — add mock rows enough to overflow a `DataTableCard` on one
   walk face and assert keyboard focus reaches the scroll container (Tab lands on it) and axe stays clean; mutant: remove
   `tabIndex` from `components/ui/table.tsx` → red.
   (v) SELECTOR-LUCK CLASS (found 2026-09-05 on `documents-viewer-walk.spec.ts:198`): a document-order `querySelector`
   on a generic selector (`svg[aria-hidden='true']`) picked a breakpoint-hidden lucide icon (width 0) on one tree and the
   overlay on another with IDENTICAL code — the cell passed by luck. House rule for every smoke spec: a measured element
   is located by a SUBJECT-SCOPED selector (a `:has(...)` on the subject's own child, or a stable hook the component
   already renders), the poll and the measurement read the SAME locator, and the cell asserts the locator resolved to
   the subject (e.g. polygon count ≥ 1) before measuring. Add a lint-like census over `apps/web/e2e/*.spec.ts` for bare
   `querySelector("svg…")`/`querySelector("div…")` inside `page.evaluate` and red it with a positive control.
4. Docs: re-cut `apps/web/e2e/README.md`'s "not wired up" paragraph to the ruled state; `AGENTS.md` CI/CD gains the job in the
   "nine jobs" sentence (now ten) — count the file's lines first; the digest row.
After merge: run `gh workflow run ci.yml` by hand (the pipeline itself changed) and read the sweep's verdict from `gh run view --json jobs`.
PR title: `ci: required web-e2e-smoke gate on the built app (裁-192 · CB-AE2E-036) — refs #541`.
<!-- end verbatim: order-CI-E2E-192.md -->

<!-- begin verbatim: order-L18-chat-actions.md · md5 93deaee1a18cd9136b1892ac6ff74682 -->
# Order L18 — chat-rail ACTIONS: the human disposes inside the conversation (owner steer 2026-09-04 ≈12:55) — opus-5 xhigh, native

Owner's words: 「agent 提议，人在 workbench 做 不会很损 uiux userflow 吗？chatrail 不能 cover 完？应该是 agent 的动作如果需要
clarify 可以回到 agent 的中断 workflow clarify … workflow 是可以聊天式对话处理吗？」 The design thesis (PRD §6 / design synthesis)
says the WORKBENCH must stand alone without the rail — it never says the rail must be action-less. The durable runtime already
parks on a clarify and resumes on the answer (proven in the walk). What is missing is the DISPOSING verb on the chat card.

Worktree `l18-web-chat-actions`, branch `web/chat-rail-actions`. Read the house rules, `apps/web/AGENTS.md` (the rail boundary; the
DoorRefusal-verbatim + re-read-after-act laws; the parity gate — NO new part kinds), PR #547 (the chat lane: bank act/pack cards,
tool-call chips, thread menu) and PR #549 (the shared close predicate `lib/parts/door-dialog-outcome.ts`, `DialogRefusal`,
`useMemberNames`), then package `C-chat-panel-genui` items 3, 6 in `map-results.json`. Cut from the CURRENT origin/main AFTER #547,
#549 and DB-B (#552) merge. Every string through next-intl; tokens only; every card act re-reads; a refusal renders verbatim IN the card.

SCOPE — one PR (web; the one DB read it needs is named):
1. **`je_review` card = the disposing surface.** Hydrate the card from a real read (`get_draft_review` if DB-B/DB-D shipped it —
   otherwise the client-scoped draft read `lib/journals/api.ts` already carries, WITH the `linesTruncated` honesty arm): the entry's
   lines (Dr/Cr per line, the DB's totals never a UI sum), the source document link, the counterparty, the coding reason the agent
   gave. Actions ON the card: **Approve** (the SAME door the journals workbench calls — `approve_entry` or the routine variant by
   `high_stakes`; 裁-187: no attestation field unless the door's refusal names one), **Reject with reason** (the existing
   withdraw/reject door), **Open in workbench** (the deep link that already exists). After the act the card re-reads and flips to
   its `entry_posted` state; the workbench, if open, re-reads through the existing `CLIENT_RECORD_CHANGED`-style bus (emit the
   entry-changed event; the journals panel subscribes).
2. **Clarify card carries the attach control.** When a clarify's `framing`/`question` asks for a document (the runtime's
   clarify shape — read `openInterruptionStep` in the CURRENT chatTurn), the card renders the composer's `ComposerAttachmentControl`
   inline so the human attaches WITHOUT leaving the card; the answer carries the document reference the way the composer's turn does
   (PR #547's chat-parity walk proves the wire shape). The answer resumes the parked run (existing).
3. **Bank proposal card carries Settle.** The `bank_act` proposal (from #547's typed card) gets the one door the human takes
   on the workbench (`settle_from_bank_line` through the same wrapper the bank tab uses), with the payer-identifier refusal
   rendered verbatim and — since H-09's `set_counterparty_identifiers` now exists (DB-B) — a "record the payer identifier" inline
   act that then re-offers Settle.
4. **Open questions in chat.** A `firm_question`/`open_question` part renders the SAME answer/dismiss form Needs-you uses (one
   component, two homes), so the human never has to leave the rail to unblock the coder; the requeue-once after answer is L8's.
5. **What NOT to build:** no new part kinds (parity gate); no chat-only door that the workbench lacks (every verb here is the
   workbench's own door); no optimistic state; no "running" claims for a tool the transcript has not settled.
Cells per card act (ok path re-reads; refusal stays in the card with the verbatim code; the attestation field appears only on a
refusal naming it — until 裁-188 lands); browser leg: on the built app with the mocked stack, a je_review proposal is approved from
the rail and the journals tab shows it posted without a reload; a clarify asking for a document is answered with an attachment
from the card; a bank proposal is settled from the rail. Axe on the rail. PR title: `web(chat): dispose inside the conversation — approve/reject on the je_review card, attach on the clarify card, settle on the bank proposal, answer open questions in the rail (owner steer 09-04 · C6) — refs #541`.
<!-- end verbatim: order-L18-chat-actions.md -->

<!-- begin verbatim: order-L10-chatturn-v18.md · md5 a27cf0587b4a5a064281a089382be6d9 -->
# Order L10 — chatTurn_v18: the close-prep read + the honest oracle sentence (opus-5 xhigh, native, 裁-190)

Worktree `l10-runtime-chatturn`, branch `runtime/chatturn-v18-close-read`. Read the house rules,
`.claude/rules/runtime-workflows.md`, `.claude/rules/db-migrations.md`, `packages/runtime/README.md`. Then in
`map-results.json` (Python, slices): package `I-runtime-workflows` item 3 (H-07 / H-08 / CB-AE2E-015) and package
`C-chat-panel-genui` items 5 and 6 (the export measurement and the generative-UI census). Verify every anchor; chase
live bodies. Cut from the CURRENT origin/main; follow PR #545's pattern for a new frozen version.

SCOPE — one PR, two halves (the DB half is small and rides the same PR because the runtime half is useless without it):
1. **H-07 (DB)** — `UNNUMBERED_freeform_close_relations.sql`: grant SELECT + a per-relation freeform policy (the
   exact shape `0131` used for the 35 enumerated relations — cite it) on the DESCRIPTIVE close relations the
   close-prep chat lane needs: `close_runs` (already granted), `close_gate_results`/the gate-verdict table,
   `close_attestations`, `fiscal_years`, the close plan read's tables — read `get_close_plan`'s body to learn the exact
   set; every one must carry `client_id` (or a join to it) so the RLS stays client-scoped; move `0131`'s own tail
   counts with them. Prestate + tail census; rig-validate; deploy-onto-existing.
2. **H-08 (runtime)** — `chatTurn_v18`, a NEW frozen closure: the freeform read's 42501 collapse gets its OWN
   oracle-safe sentence ("this read is outside what the audited read door may see") — never CLR03's session sentence —
   keeping the single-token collapse (`read_unavailable`) and never naming the refused relation (Annex D.2). Cite
   `chatTurn.v15.freeform.ts:116-155` and `readToolRefusalMessage`. Carry the decoy-vs-receipt provenance cell
   coupled to the CURRENT registry entry + the exact-version pin (the chatTurn convention). Cells: a refused relation
   renders the new sentence, never "bookkeeper session"; the close-prep read succeeds on the granted relations.
3. **Do NOT add an export tool** (L3's measurement: `complete_sandbox_export`/`fail_sandbox_export` have zero runtime
   callers — a tool would enqueue rows nothing completes; the render worker is the real gap, F-A5b). Do NOT add a close
   tool. State both in the PR body with anchors. Do NOT add part kinds (parity gate).
4. Parity exemptions generated by `describeParitySite`; `pnpm freeze:update` + `--compare-base origin/main`
   additions-only; bundle grep for the new sentence.
PR title: `runtime(chatTurn): v18 — close relations readable by the freeform door, an honest oracle sentence for the 42501 collapse (H-07 · H-08 · CB-AE2E-015) — refs #541`.
<!-- end verbatim: order-L10-chatturn-v18.md -->

<!-- begin verbatim: order-CONSENT-186.md · md5 9f1814b991afab5fdf20f9dbf5652278 -->
# Order CONSENT — the firm-level AI-processing declaration (裁-186 · ADR-0078 decision 1) — opus-5 xhigh, native

Worktree `consent-186`, branch `consent/firm-declaration-dpa-stage-186`. Read FIRST: the house rules, `.claude/rules/db-migrations.md`,
`.claude/rules/db-tests.md`, `packages/db/README.md`, then the TEXT OF RECORD `docs/plan/active/mohe-grill-rulings-2026-09-04-pm.md`
裁-186 and `docs/adr/0078-consent-declaration-attestations-abolished-rbac.md` decision 1 + its dissent, then `docs/ops/legal/clara-beta-dpa.md`
(the byte-identity law 裁-90), `packages/db/migrations/0158_checkout_gate_c1_dpa.sql` (dpa_documents/dpa_signatures/sign_dpa),
`0123_f_a7_gamma_egress.sql` (client_egress_consents, grant_client_egress, activate_client_egress_purpose, the evidence rung),
`0017_wave_b.sql` `commit_client_onboarding` (live body), and in `map-results.json` package B item H-18 + package A item CB-AE2E-001
(the `kind` discriminator design — REUSE it if DB-B/another lane has landed a `kind` on `dpa_documents`; otherwise mint the
minimal one for `declaration`). Cut from the CURRENT origin/main after DB-B has merged (it ships `client_egress_state`; the
orchestrator tells you).

THE CONTRACT (ruled; do not re-open — the dissent is on file):
1. **One firm-level declaration, signed once at the DPA stage**: "the firm holds, or will hold before processing, each client's
   written authorization for AI processing" — its own document kind (`declaration`), its own version + sha (裁-90 byte-identity),
   its own signature row, appended like the DPA's. Text: an agent TEMPLATE in `docs/ops/legal/clara-beta-consent-declaration.md`
   (EN + BM + ZH like the DPA; marked for the lawyer pass 裁-166; never darkened).
2. **The database admits that declaration as an EVIDENCE KIND for `grant_client_egress`** beside a verified per-client letter:
   the consent row records `evidence_kind in ('client_letter','firm_declaration')` + the evidence reference (the declaration
   signature id); per-purpose activation and the dispatch-boundary re-check are UNTOUCHED (PRD §6 item 16(a)'s rider).
3. **The onboarding commit's SUCCESSOR door auto-mints the client's consent and activates every purpose** citing the firm's live
   declaration — a NEW door `commit_client_onboarding_v2` (or a sibling `grant_client_egress_from_firm_declaration` called by
   the web after commit — pick the shape that keeps `commit_client_onboarding`'s live body untouched if it is sha-pinned or
   D1-heavy; say why). Idempotent on replay; refuses if the firm has no live declaration (a typed refusal the web shows honestly).
4. **A per-client letter uploaded later is an EVIDENCE UPGRADE** on the same consent row (a door `upgrade_client_egress_evidence`),
   never a second consent.
5. **The compliance register shows every client's consent state and evidence kind** (DB-B's `client_egress_state` read).
6. **Backfill**: existing consents keep `evidence_kind='client_letter'`; existing clients of a firm that signs the declaration are
   NOT auto-consented retroactively — say so; a control on the compliance register lets an owner "apply the firm declaration to
   this client" (one click, receipted) for clients onboarded before the declaration.

SCOPE — one PR (DB + web + docs; split into two stacked PRs if the web half waits on the merge): migrations with prestate/tail
census, forced RLS, EXECUTE-only, cells for every refusal arm + the idempotency + the evidence upgrade + RLS isolation (firm A cannot
see firm B's declaration); the DPA page (`signup-dpa-form.tsx`) gains the declaration as a second signed document (two receipts,
both hashed, the checkout gate reads the DPA only — the declaration gates AI processing, not admission — say this in copy); the
onboarding commit flow calls the successor door and shows its receipt on the settled card; the compliance register panel's per-client
state + evidence kind + the "apply declaration" control; browser leg on the built app (sign DPA + declaration → onboard a client →
the compliance register shows `consented · firm_declaration`; a firm without the declaration sees the honest refusal). Rig-validated,
deploy-onto-existing, D1 list. PR title: `consent(裁-186): firm-level AI-processing declaration at the DPA stage, auto-consent at onboarding commit, evidence upgrade, compliance register state (H-18 · ADR-0078 d1) — refs #541`.
<!-- end verbatim: order-CONSENT-186.md -->

<!-- begin verbatim: order-DB-C-walls.md · md5 70e11636198d807554662140f500c02d -->
# Order DB-C — the wall-removal lane (裁-187 · 裁-188 · ADR-0078) — opus-5 xhigh, native, 裁-190

Worktree `dbc-walls`, branch `db/attestations-maker-checker-abolished-0078`. Read FIRST, in this order: the house rules
(`lane-house-rules.md`), `.claude/rules/db-migrations.md`, `.claude/rules/db-tests.md`, `packages/db/README.md` (rig,
runner contract, **rule D1 write-quiesce**, isolation pins, the evaluator freeze), then the TEXT OF RECORD
`docs/plan/active/mohe-grill-rulings-2026-09-04-pm.md` (裁-187 with its scope census, 裁-188) and
`docs/adr/0078-consent-declaration-attestations-abolished-rbac.md` (decisions 2 and 3, the Mechanism section). Load the
Supabase Postgres best-practices skill if available. Cut from the CURRENT origin/main after DB-A and DB-B have merged
(the orchestrator tells you; if either is still open, STOP and report).

THE CONTRACT (ruled; do not re-open):
- **Every attestation CEREMONY and every maker-checker WALL is removed.** No distinct-approver rule, no high-stakes
  threshold, no reopener≠closer wall (B3), no adoption attestation (ADR-0070 §11), no solo-firm self-approval
  attestation, no drawer-2 per-item attestation gate (E-R2), no B6/B14 attestation-row walls.
- **The human gate is RBAC only**, the existing four ranks (`0002_foundation.sql:215`, `role_rank`): bookkeeper+
  drafts, uploads, matches, answers, APPROVES and POSTS any amount (own drafts included); admin+ additionally begins,
  finalizes and abandons a close, approves the opening seed, holds firm settings; owner-only members, legal
  signatures, operator-tier acts. Floors MOVE; nothing new is minted.
- **Automatic receipts stay, at zero ceremony.** Every governed click writes one row the DOOR mints — actor, time, the
  gate states it covered (a close finalize records each gate's verdict incl. UNKNOWN); maker and checker identities
  stay RECORDED on every entry (`maker_actor`/`checker_actor`/`last_human_editor` columns untouched). Visible on the
  Activity timeline (DB-B's `firm_timeline_visible`).
- **OUT of scope:** `sst_future_attestations` / `record_future_attestation` (a captured SST fact). Anything the owner
  did not name stays.

SCOPE — one PR of `UNNUMBERED_*.sql` files (numbers claimed at merge), each with prestate measurements that ABORT on a
false premise, a tail census, and cells; plus the test re-cuts:
1. **The census, first, as a file** (`docs/plan/active/walls-census-2026-09-04.md`, ≤ 200 lines): every live body
   that carries a `p_attestation` parameter, a `segregation_mode` / `self_approval_*` / `self_approved` /
   `distinct_checker` / `attestation_required` / `attestation_missing` rung, a `high_stakes` branch, the B3/B6/B14
   walls, the adoption attestation, the opening-seed and onboarding-commit attestation checks — by CHASING THE LIVE
   BODY (`to_regprocedure` + `pg_get_functiondef` on a migrated rig, never a grep of first CREATEs), with the migration
   that last replaced each, the refusal tokens it raises, the cells that pin it (grep `packages/db/tests` and
   `packages/runtime/tests` for the token), and the DB-owned evaluator freeze status (`frozen-evaluators.json`,
   `scripts/check-frozen-evaluators.mjs`) — **a frozen evaluator body is NOT edited by CoR; it takes a new evaluator
   version + the deploy ceremony, and you STOP and report which**. Expected population (from the ruling's census, to
   be MEASURED not trusted): `_approve_entry_core` (live behind `0106`'s ninth-body fence — a TENTH body by the same
   dynamic-splice mechanism the estate uses, cite it) and the drafting/allocation/settlement/bank-line cores
   (`0035`, `0037`, `0121`: `_bank_match_adjustment_entry`, `_allocate_receipt_core`, `_allocate_payment_core`,
   `_settle_from_bank_line_core`, `_resolve_and_book_bank_line_core`), `finalize_close` (`0128`), `reopen_fiscal_year`
   (`0120`), `attest_close_exception` + `close_attestations` + `_tf_close_attestations_supersede_only` (`0056`),
   `settle_close_proposal`'s CLR41 attestation count (`0138:1722-1736`), `approve_opening_seed`,
   `commit_client_onboarding`'s attestation arm (`0017`, live), `firms.high_stakes_amount_cents` (`0002:204`) +
   `set_firm_high_stakes_threshold`/`clara_set_firm_high_stakes_threshold` + `deploy/wave-b-highstakes-rm100k-amendment.sql`,
   the adoption path (`0084`/`0085`).
2. **The receipt**: ONE new table `clara.act_receipts` (or extend an existing receipts table if one already fits —
   measure `agent_act_receipts` and the close receipt shapes first and say why) — `firm_id, client_id, actor uuid,
   on_behalf_of, door text, subject_kind text, subject_id uuid, op_key text, gate_states jsonb (nullable), created_at`
   — forced RLS + policy pair, bookkeeper+ read via a `_visible` view or through DB-B's timeline, minted by every
   re-cut door in the same transaction. A close finalize's `gate_states` carries each gate's verdict.
3. **The re-cuts** (each its own migration file or one per family, your call — say why): every `p_attestation`
   parameter becomes optional-and-IGNORED where the signature can stay (never drop a parameter a caller passes —
   the web and runtime still send it until their lanes clean up; a DROP+CREATE at a new signature is a caller-breaking
   change and needs the callers named); the segregation/high-stakes/self-approval rungs are removed and the receipt
   write inserted; `finalize_close` no longer refuses for want of an attestation or an UNKNOWN gate — it RECORDS the
   gate verdicts on the receipt (and keeps every STRUCTURAL drawer-1 invariant: continuity math, control tie-outs,
   ordering, the period wall CLR19 — those are not attestations); `reopen_fiscal_year`'s B3 wall removed;
   `attest_close_exception` becomes a no-op-with-receipt or is retired (say which; a retirement is its own migration
   and its callers named); `settle_close_proposal`'s CLR41 count removed; `approve_opening_seed` floor → admin+, its
   attestation ignored; `commit_client_onboarding`'s attestation arm removed; `set_firm_high_stakes_threshold`
   RETIRED (its own migration; name the web caller in `settings-panel.tsx`/`threshold-dialog.tsx` that lane L5
   removed); the adoption attestation removed (approve by rank, receipt marks `adoption: true`).
4. **Floors**: `approve_entry` and the routine variant stay bookkeeper+ (measure); `begin_close`/`abandon_close`/
   `finalize_close`/`reopen_fiscal_year` → admin+ (measure current; move only what differs); opening-seed approval
   admin+; members/legal/operator owner (unchanged). Every floor move is a prestate-measured `_human_ctx` change.
5. **Tests**: every cell that pinned a wall is RE-CUT to pin the receipt (never deleted silently — list each in the
   PR body: file, old assertion, new assertion); new cells: a bookkeeper approves their own RM 1,000,000 draft and it
   posts with a receipt row naming them as both maker and checker; a solo firm needs no attestation; finalize with an
   UNKNOWN gate succeeds and the receipt records UNKNOWN; the reopener may be the closer; the retired threshold verb
   is ABSENT by exact signature with a surviving-overload positive control (`.claude/rules/db-tests.md`); the drift
   guards for anything sha-pinned. The estate suite green on the rig; deploy-onto-existing proven.
6. **Rule D1**: this PR replaces MANY live audited writers — list every one for the write-quiesce window in the PR
   body, and state the ceremony order (DB first, then the web/runtime callers may stop sending `p_attestation`).
7. **Docs** (same PR, the digest rows already point here): `docs/ARCHITECTURE.md` §3.4's "until 裁-188 lands" line
   and PRD §2's supersession note gain "LANDED <date>, migration <n>"; the census file is linked from
   `docs/plan/index.md` (check the 500-line ceiling first).
Rig: WSL docker, instance-unique `dbc-<random>`, libpq PG* + `CLARA_ALLOW_DESTRUCTIVE=1`; migrate from 0001, apply
under TEMPORARY numbers, run the FULL `pnpm --filter @clara/db test` (this touches the posting core — the whole estate
is the regression surface), then `packages/runtime`'s db-backed batteries that exercise approve/settle, then
deploy-onto-existing; tear down. Quote every tail in full. Size: XL — if it must split, split by FAMILY (posting
core · close · opening/onboarding · threshold) into stacked PRs and say so.
PR title: `db(walls): 裁-187/ADR-0078 — attestation ceremonies and maker-checker walls removed, RBAC floors, automatic act receipts (裁-188) — refs #541`.
<!-- end verbatim: order-DB-C-walls.md -->

<!-- begin verbatim: order-REPORTING-H15.md · md5 0563f3564531f6f142b632e1fbae6855 -->
# Order REPORTING — one published management-accounts template, end to end (H-15 · H-16 · CB-AE2E-017) — opus-5 xhigh, native

Worktree `reporting-h15`, branch `reporting/first-management-template`. Read the house rules, `.claude/rules/db-migrations.md`,
`packages/db/README.md`, `packages/reporting-render/README.md` (the renderer, the house-style manifest shape, the seal chain),
`docs/ops/DR-render.md`, digest law 74 (reporting is two-tier; `canonical` stays migration-only; statutory wording stays owner-signed),
then in `map-results.json` (Python, slices) package `H-bank-close-reports-registers` item CB-AE2E-017/H-15 and package `C-chat-panel-genui`
item 5 (the export measurement). Cut from the CURRENT origin/main.

WHAT WAS MEASURED: `report_templates` · `report_specs` · `report_spec_versions` · `report_artifacts` all read 0 on the fresh estate;
`publish_house_style_version` (`0069_wave_e_epsilon_reporting_security.sql:64`) requires every manifest value to be a flat sha256 string
while the renderer reads fonts as a NESTED array — so no manifest can satisfy both; no seed, script or web surface publishes anything;
`complete_sandbox_export`/`fail_sandbox_export` have ZERO runtime callers (the render worker is the real gap, F-A5b).

SCOPE — one PR (DB + a data act + runtime + web), split into stacked PRs if the render worker half is > 1 unit:
1. **DB** — CoR `publish_house_style_version` to accept the renderer's nested `fonts` array while keeping the flat-string rule for
   every other key, with a DISTINCT refusal token for a malformed fonts entry; prestate/tail census; cells both ways. Then a
   **data act** (a script under `packages/db/scripts/`, run as the OBO/owner principal through the REAL audited doors —
   `publish_house_style_version` → the template publish door → the chart-template + spec publish doors), publishing ONE
   `management_accounts` template version (P&L + balance sheet + a notes page, MPERS 2016 wording marked `[verify]` for the
   owner's signature — statutory wording stays owner-signed, so the MANAGEMENT template is the one that ships; statutory stays
   fail-closed behind the verified-wording gate). The act is idempotent (a second run finds the version and stops) and receipted.
2. **Runtime** — the sandbox export RENDER path: a caller for `complete_sandbox_export`/`fail_sandbox_export` that takes a queued
   `sandbox_exports` row, runs the deterministic evaluator (constraint 2: every figure reproduced by the DB-owned evaluator from
   DB inputs, never model prose), renders through `packages/reporting-render`, seals the artifact and completes the row —
   as a NEW reconciler belt or a NEW frozen workflow version (never an edit to a deployed body); if it is a belt, it is OFF by
   default behind a registered wake source per law 83 and the PR says how it is switched on.
3. **Web** — the Reports tab: select a published template → run (mint the export through the existing interactive wake wrapper
   the web already has, or the honest note if none is granted to the human lane — read `0132:1207-1216`) → the download offer
   `apps/web/lib/reports/download.ts` already carries. Re-cut the sandbox notice L7 already made honest to name the new path.
4. **Re-walk milestone 10** on the built app with a mocked runtime: template listed → run → sealed artifact → download bytes
   hashed against the seal. Browser leg + axe.
PR title: `reporting(H-15): house-style manifest accepts the renderer's fonts, the first management-accounts template published through the audited doors, the sandbox render/complete path, select→run→download (CB-AE2E-017 · H-16) — refs #541`.
<!-- end verbatim: order-REPORTING-H15.md -->

<!-- begin verbatim: order-L17-copy-sweep.md · md5 104030cb4078d9970eb85142a6607c52 -->
# Order L17 — web-copy-and-format sweep (opus-5 xhigh, native, 裁-190) — runs LAST, after every other web lane merges

Worktree `l17-web-copy`, branch `web/user-copy-layer-541`, e2e ports `CLARA_E2E_NEXT_PORT=3201 CLARA_E2E_RUNTIME_PORT=3202`.
Read the house rules, then `sweep-confirmed.md` + `sweep-results.json` (the verified sweep) and package
`E-firm-home-activity-needs-you` item E-6 + `D-documents` CB-AE2E-022 in `map-results.json`. Merge forward from
origin/main FIRST (every other web lane has landed): value-level diff of `messages/en.json` + the duplicate-sibling-key
scan per the MERGE-FORWARD law in `apps/web/AGENTS.md`.

SCOPE — one PR, the user-copy layer:
1. **Internal language OUT of the catalog** (`apps/web/messages/en.json` and JSX literals): every bare migration
   number (`\b0[0-9]{3}\b` — en.json:1124, 1270, 1323, 1353, 149, 640, 645, 650, 2834 and the rest), `PROGRESS.md`,
   "altitude", "ceremony" (en.json:690, 1813, 1820), the seven strings carrying ruling/lane/track/PR ids (E-6 class A —
   裁-80's own note at `mohe-grill-rulings-2026-08-31.md:143-145` LAWFULLY allows DB verb names and F-T lane codes on
   the tax tab's honest notes, so leave those verbs where a NotBuiltNote names a missing verb; strip everything else),
   the ~25 subheadings/dialog descriptions that LEAD with a raw `clara.*` identifier (invert: lead with what the act
   does; demote the identifier to the shared collapsed "Technical detail" component lane L13 created — reuse it, do
   not create a second), `fy_end`/`fy_end_source` raw labels + a three-key value map with an honest unknown arm
   (en.json:1066), the Reports subheadings' `(0127)/(0132)/(0131)`, "Dedupe key" if L13 left it.
2. **The lint that keeps it out:** `apps/web/scripts/check-user-copy.mjs` wired into `pnpm lint`, failing on
   `\b0[0-9]{3}\b`, `PROGRESS\.md`, `裁-`, `ADR-`, `#[0-9]{3}\b`, `\baltitude\b`, `\bceremony\b` in
   `messages/*.json` VALUES — with an explicit allow-list constant for the honest NotBuiltNote verb names (裁-80) and
   a positive control that plants a violation and reds.
3. **Raw timestamps and ids:** the nine sites rendering a raw ISO timestamptz → `businessDateTime` from
   `@/lib/business-date`; the remaining raw-uuid "who" cells (ArtifactRow.tsx:83, CloseReceiptPanel.tsx:58,
   CloseProposalPanel.tsx:85, SweepReceiptCard.tsx:141 …) → `useMemberNames` where firm-scoped, else `shortId` in
   `font-mono`; `PartBadge`-as-link min-h-6 wrappers where L16 did not already; `receipt_kind`/`via_wake_kind` raw
   tokens in `V16Cards.tsx:110/:133` and `SweepReceiptCard.tsx:152` outcome tokens → the label maps that already
   exist for the same tokens elsewhere (cite them), with honest unknown arms.
4. **Brand literal (CB-AE2E-031 optional follow-up):** convert the twelve prose strings hardcoding "ClaraBook" to
   ICU interpolation of `Brand.productName` and replace the enumerated roster in `brand-identity.test.tsx` with the
   rule "no catalog string contains the literal outside `Brand.productName`". Only if the cell count stays honest.
4b. **The in-dialog refusal, threaded everywhere (from #549):** #549 shipped `components/common/dialog-refusal.tsx`
   (the DB's code + message rendered INSIDE the dialog, focused) and threaded it only in close and opening; in the
   documents, journals, admin, firm-admin and the other registers families the dialog now STAYS OPEN on a refusal but
   the message is behind the backdrop. Thread the `refusal` prop at every remaining caller, with the per-dialog gating
   #549's fold settled (`refusal={attempt > 0 ? refusal : undefined}` — never a refusal object shared across
   coexisting dialogs), one cell per family (refuse → the refusal is inside the modal, focus on it, input intact).
   Also adopt `<MemberName>` at `components/parts/V16Cards.tsx`'s two raw-uuid sites (`acting_actor`, `on_behalf_of`)
   and pass the resolver from the thread view (no per-card hook — the N+1 rule in `use-member-names.ts:33-35`).
5. Cells: the lint's positive control; a catalog census cell asserting zero matches for the banned patterns; the
   value-map cells with unknown arms. Browser leg: `a11y-finish-walk.spec.ts` extended with a text census over the
   faces touched asserting none of the banned tokens is visible. Full verify chain unpiped and teed.
PR title: `web(copy): the user-copy layer — internal language out of the catalog, a copy lint, business-time formatting, member names (CB-AE2E-022 · E-6 · the sweep's 8 copy findings) — refs #541`.
<!-- end verbatim: order-L17-copy-sweep.md -->
