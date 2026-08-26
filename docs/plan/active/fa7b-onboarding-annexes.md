# F-A7b — client onboarding: annexes

> Companion to **`fa7b-onboarding-design.md`** (the design of record — **it GOVERNS on any
> disagreement with this file**), `fa7b-onboarding-survey.md` and `fa7b-gate-questions.md`.
> **Annex A** — the build sequence. **Annex B** — the four residual contract deltas D-9…D-12.
> **Annex C** — registered risks and named non-goals.
> Split out under the house 500-line limit; nothing here was written for this file, it was moved
> from the design, and the design's D-numbers are the addresses it cites.

## Annex A · Build sequence

| # | PR | contents | ceremony | gated on | review leg beyond the ladder |
|---|---|---|---|---|---|
| 0 | **the gate** | `fa7b-onboarding-design.md` + `fa7b-gate-questions.md`, ruled | — | nothing | the gate record |
| 1 | **PR-a — additive** | D-1's CHECK extension + `wake_propose_client_onboarding` · D-3's three columns · D-4's receipt table + its shim view | none | the gate | law 1 on the proposal's basis fields |
| 2 | **PR-b — the birth core** | D-2: extract `_begin_client_onboarding_core`, `begin_client_onboarding` → thin delegate, `wake_begin_client_onboarding`, allowlist row 7, `accept_onboarding_proposal` | **D1-δ** (one live human body) | PR-a | **law 1, reading ONE change**; revert is one file |
| 3 | **PR-c — the interview** | D-5's segment + D-8's relation/verbs + D-9's route contract, shipped as `clientOnboarding_v4` + registry repoint; `update_onboarding_plan` → thin delegate | **D1-δ** (second body) | PR-b | **law 28 cross-model, mandatory** (injection + consent) |
| 4 | **PR-d — the close** | D-7: the re-triage source row, the workflow, the human fallback sibling | none | PR-b, PR-c | law 1 over the re-triage's filing decision |
| 5 | **PR-e — the surfaces** | the design's §3 screens: `/needs-you` proposal card, the escalated thread, the materials checklist, the doors click-through | none | PR-a..PR-d | the three a11y CI gates + an impeccable/Emil polish pass (Q9) |
| 6 | **PR-f — the wire** | Q8's `firm_question` part type, folded into the **single** four-part bump — never its own version | none | PR-e | registry prestate check (constraint 9) |

**PR-f does not mint a `chatTurn` version of its own.** Q8 rules the four new part types ship in
**one** runtime version bump (**mohe-grill-rulings-2026-08-27.md**:63-68); F-A7b contributes
`firm_question` to that bump and waits for it. Two items may not mint the same frozen `_vN`
(constraint 9).

**Ceremonies run from merged `main`** with the standing runbook hazards verbatim — the DSN bridge
with a 110 s quiesce and a **split** `sleep 5400` argv, `fly.exe`'s non-zero exit after a
successful non-tty `ssh -C`, the post-restart zombie-pooler sweep, `PG*` vars for rig runs
(`filing-and-interview-design.md:427-430`). PR-b and PR-c may share one night as two sequential
windows, each independently revertable.

**Per-journey DONE (Q9 (a))**: screens built against LIVE verbs, no affordance without a named
backend verb · hydrate-never-trust throughout, no optimistic UI · the three a11y CI gates green ·
an impeccable/Emil polish pass · an end-to-end walk on live test data (ADR-0075).

**Where F-A7b sits in the 磨合 phase order.** Q9 puts this gate at **P5**, running EARLY and in
parallel with P1/P2, *"its train builds after it closes"*
(**mohe-grill-rulings-2026-08-27.md**:86-87). Annex A's PR-e therefore lands against the **apps/web**
shell (Q1(a)), not `apps/dashboard` — the dashboard surfaces measured in the survey are the CRUDE doors
this train replaces **in place, same verb, no new gate** (Q9 cross-cutting, `:89-90`).

## Annex B · The four residual deltas (design §4, D-9 … D-12)

### D-9 · The submission receipt — **NEEDS-VERB (route + workflow contract)**

`POST /api/interview/answer` returns `{run_id, park_index, submission_id, accepted}` with
`submission_id` **minted server-side**, and `GET /state` exposes the accepted submission id per
park — so a second submitter learns *"yours was not the one that landed"* from a receipt rather
than from an index (Annex K residual 2, `filing-and-interview-annexes-2.md:455-460`, measured true
at `packages/runtime/src/interviewRoutes.ts:365`, which returns `{ok:true}` and nothing else). This
is a workflow contract change and it is **why `clientOnboarding_v4` exists**.

### D-10 · The residuals — one closed, one already discharged

- **`readClearsError` never checks `runId`** — one line in
  `apps/dashboard/app/onboarding/useInterviewRun.ts:88-101` (its parameter is
  `Pick<InterviewState, "pendingPark" | "terminal">`; the run id is not in scope). Unreachable
  today because the hook re-subscribes on `runId` change (`:169,180`); closed anyway.
- **The interview e2e de-pin: NOTHING IS OWED.** Annex K asks for a re-cut pin
  (`filing-and-interview-annexes-2.md:461-463`); the test carries none and its header forbids
  adding one — *"Do not re-pin a version into this header — a version named in prose goes stale at
  the next repoint and misleads the next reader about what actually ran"*
  (`packages/runtime/tests/interview-e2e.mjs:7-12`, repeated at `:250-251`). **Satisfying this
  residual as written would be a regression.** Recorded so a build lane does not "fix" it.

### D-11 · The admissible-kind spellings — **NEEDS-DECISION (Q-D11)**

F-A7a's admissible onboarding-intake list names six kinds
(`filing-and-interview-design.md:314-317`). The live `documents.document_kind` world is twenty
values (`0123_f_a7_gamma_egress.sql:2054-2061`) and **`ssm_rob_certificate`, `sst_certificate`,
`bank_letter`, `lhdn_letter` and `engagement_letter` are not among them** — the live neighbours are
`ssm_company_doc`, `agreement_contract`, `tax_correspondence`; only `bank_statement` matches
exactly. Either the door's list maps onto live kinds, or the CHECK is widened. **Fail-closed
default: the map (no CHECK change)**, because a widened kind world touches four surfaces at once
(`filing-and-interview-design.md:320-323`) and this item should not pay that.

### D-12 · The pre-activation origin — **NEEDS-DECISION (Q-D12)**

Survey S10 / absence A9: `document_intakes.origin` was never extended to `onboarding_interview`
despite `filing-and-interview-design.md:330-333` and `:426` promising it; the live CHECK is
two-valued (`0007_document_pipeline.sql:104`) and its **paired** constraint
`ck_document_intakes_origin` (`0007:131-133`) ties `'chat'` to a non-null `chat_session_id` and
`'documents_tab'` to a null one — so a third value re-cuts **two** constraints, not one.
**Fail-closed default: do not extend it.** The pre-activation class is already reachable by its
other half — a filing-less `documents` row, which `list_unassigned_documents` returns
(`0011_daily_loop.sql:3943-3965`) — and its disposition is unchanged either way (never deleted,
retention extend-only, `filing-and-interview-design.md:330-338`).

## Annex C · Registered risks and named non-goals

**Risks.**

- **(R1)** The client row is **permanent** — law 6 gives the estate no delete verb (survey absence
  A6), so a wrong proposal accepted is a permanent row plus an archive. Mitigated by the
  family-collision wall (D-2), the honest label (D-3), and the propose-then-accept default (D-1).
- **(R2)** The materials fork is new judgement logic on the one question the whole opening position
  hangs from; it ships with its per-branch treatment RULED at the gate, never inferred at build.
- **(R3)** `clientOnboarding_v4` is a frozen-workflow bump; a body edit instead of a new export
  strands parked runs (`.claude/rules/runtime-workflows.md`), and the WDK can silently swallow a
  directive — **grep the built bundle after the workflow edit**.
- **(R4)** D-1's `kind` CHECK extension and D-2's `filing` allowlist row both touch closed worlds
  F-A7a owns (`0103:563-565`, `0126:2073-2079`); both need a **census, in both directions**, never
  a list — F-A2's GB-3 lesson, restated because this item is the seventh to learn it.
- **(R5)** The re-triage (D-7) files unattended by default; if Q-D7 rules the other way, §3.6's
  close becomes a queue item and **A13's word "auto" is retired from the acceptance sentence**
  rather than quietly redefined.
- **(R6)** Gate O's human wall rests on a SEEDING choice, not a predicate (D-2). That is the
  cheaper correct answer today and it is the more fragile one tomorrow: a future writer who seeds
  `contributors` with the agent removes the wall without touching the gate. The widening is
  registered against a later item **with that sentence attached**, and the D-2 cell pair is what
  fails loudly if it happens.

**Non-goals, named so nobody re-opens them mid-build.**

Firm creation and the three firm tiers (R8(b) — its own design gate and security review,
`harness-audit-rulings-2026-08-26.md:122-130`) · pricing amounts (R8(c) — its own sitting) ·
dual attribution (F-A7a's OW-2, `filing-and-interview-design.md:479-482`) · widening
`documents.document_kind` (D-11's fail-closed default) · extending `document_intakes.origin`
(D-12's fail-closed default) · a per-firm capability dial (TA-P1 C: capabilities are default-on) ·
re-pinning the interview e2e (D-10 — it would be a regression against
`packages/runtime/tests/interview-e2e.mjs:7-12`) · any model-supplied confidence anywhere in a wall
(law 72) · a delete verb for anything this item creates (law 6).
