# 磨合 session 交接书 (The 磨合-session handoff) — 2026-08-26

**From**: the Wave-F all-backend conductor session (closed 2026-08-26 — a historical label,
nothing below depends on it). **To**: the 磨合 (frontend integration) session — a FRESH
dedicated session, per the owner's standing roadmap: Wave F 收官 → **磨合** → Wave G
(factory reset + estate e2e) → beta live. **Owner**: Tao (BELCORT). 大白话 briefings;
one-question-at-a-time grill protocol; honest ETAs; report-then-proceed at phase boundaries.

Clock-in read order: `PROGRESS.md` → `docs/adr/README.md` digest → THIS file →
`docs/plan/active/frontend-handoff-2026-08-23.md` + `frontend-handoff-addendum-2026-08-24.md`
(§7 carries the 08-26 rulings) → `docs/plan/active/harness-audit-rulings-2026-08-26.md`
(the nine owner rulings R1-R9 in full — the charter-widening authority this file cites).

## 1 · The world as measured on 2026-08-26 (with the re-prove commands)

- **Live DB: 131 migrations, frontier `0136_fix_freeform_basis_types`.** The Wave-F backend
  is ceremonied end to end (as-runs in `docs/plan/completed/`: `wave-f-w1-` ·
  `f-a2-window-ab-` · `wave-f-w2w3-` · `wave-f-w4-ceremony-asrun.md`). Re-prove: the W4
  as-run §7 probe set, via `scripts/ops/dsn-pipe.mjs` (DSN env-to-env only —
  `docs/ops/dsn-bridge.md`).
- **Card-1's substitution seam is LIT, both stages**: `('evaluate_metric', 2)` deployed
  (freeze 7/7), `wake_compose_metric_preview_v2` allowlisted `interactive`-only.
  Re-prove: `select deployed from clara.evaluator_versions where evaluator_name =
  'evaluate_metric' and version = 2;` and `select clara.verify_evaluator_freeze();`.
- **Serving runtime bundle (in-VM measured 2026-08-26): registry pins `chatTurn_v13` +
  `autoDraft_v9`; `chatTurn_v14` is NOT serving** (0130's DB grants for v14 ARE live).
  Re-prove: `fly ssh console -a clara-runtime -C "sh -c 'grep -oa \"chatTurn: chatTurn_v1[0-9]\"
  /app/.output/server/index.mjs | head -1'"`.
- **CI**: four self-hosted runners (owner-CONFIRMED standing, ruling R7), ~13-min PR
  pipeline; closed-wave drills run on the weekly sweep + manual dispatch only; required
  check `ci` is fail-closed. After any PR touching a closed drill or the pipeline:
  `gh workflow run ci.yml` BY HAND — that rule caught a real stale drill floor before the
  W4 ceremony (fixed as the retirement-aware succession floors; pattern file
  `packages/db/tests/x42-b3-retirement-succession.mjs`, law in `.claude/rules/db-tests.md`).
- **Harness**: fully audited 2026-08-26 (six lanes, 60+ findings, all trued or carded —
  records: `harness-audit-rulings-2026-08-26.md` + the PROGRESS Backlog rows it names).
  `PROGRESS.md` is the state authority and is current as of that audit's merge.

## 2 · The 磨合 charter (what this session builds)

Base charter: `frontend-handoff-2026-08-23.md` (apps/web on branch frontend/web, two-pane
Agentic OS, Cloudflare Workers via @opennextjs/cloudflare, Supabase cookie auth,
Tailwind+shadcn, the LIVE project as the data, **crude Track-A doors replaced IN PLACE with
the same verb — never a new gate**), plus the 08-24 addendum's Wave-G OS surface. The
2026-08-26 owner rulings (R8, full text in the rulings file) WIDEN it:

1. **Three-tier firm model — ALL screens built in this session, no later re-work**:
   - Tier 1 (LIVE at 磨合): staff invite into a firm + firm-internal RBAC management.
   - Tier 2 (LIVE): operator-APPROVED firm creation (apply → operator approves → firm born).
   - Tier 3 (**LIVE AT BETA — owner ruling; the conductor's dissent is on file in R8**):
     self-serve PAID firm creation. Requires inside 磨合/Wave-G: checkout/billing on the
     F-A9 metering substrate · per-firm PDPA/DPA e-sign inside signup · an anti-abuse gate —
     and the self-serve tenant-creation door takes its OWN design gate + security review
     (the most dangerous door in a multi-tenant system; never fold it into UI work).
2. **F-A7b client onboarding = a JOINT design gate in this session** (UI + backend contract
   at one table), built as its own train immediately after, with the Wave-G e2e acceptance
   scenario: *unknown-counterparty invoice → held in the firm-scoped unattributed carrier →
   Clara proposes onboarding → adaptive interview → doors signed → client born → the held
   document auto-attributes*. The gate's must-answer set includes the owner's
   variable-materials playbooks (full audited FS / values-only records / bank statements
   only). Firm onboarding stays OUT of F-A7b — tiers 2/3 above own firms.
3. **Pricing shape is RULED** (R8c: base monthly tier per firm + metered overage). The
   AMOUNTS take a dedicated pricing sitting — schedule it INSIDE 磨合 so tier-3's checkout
   can finish (PROGRESS Next item 1 carries it).
4. **Storage write-probe on `/ready`** (R9): a small backend PR during 磨合 — the frontend's
   system-status surface reads `/ready`, which today cannot see storage failures
   (`docs/ops/incident-2026-07-26-intake-storage.md` follow-up (a);
   `packages/runtime/lib/health.mjs` is the file).
5. **PRD two-tier wording** (R2): draft the §4+§6 sentences (analysis sandbox watermarked +
   structurally seal-unreachable), take them to the owner for WORD-BY-WORD review, then a
   docs PR. **`docs/ops/ceremony-practices.md`** (R6) also lands this session
   (combined-window practice · sleeper-machine DSN recipe · run-id-pinned DONE watchers).
6. **G1 ADR** (R3): one page minting the 2026-08-25 universal wake-engine ruling (mechanism
   (b) chosen over (a), source record `docs/plan/active/bank-agency-gate-record.md` §around
   line 321) + a digest line — plus the R4/R5/R7 digest addenda batch (one docs PR covers
   all four; the PROGRESS Backlog row names them).

## 3 · Pre-flight checklist (before the first UI commit)

1. **Deploy the runtime image carrying chatTurn_v14** (the D-a recipe lives in the W1/W2W3
   as-runs' deploy sections; verify by in-VM bundle grep — the §1 command — plus `/ready`
   200 and the six leases, never by deploy exit code). Then true PROGRESS's runtime posture
   line to the new measurement.
2. **Read `wake_engine_sources`** (`select * from clara.wake_engine_sources;`): G1 ships it
   EMPTY by design — F-A3 (bankAgent) and F-A4 (closePrep) each owe an INSERT-and-flip
   follow-up (their PROGRESS lane rows carry the obligation).
3. **Confirm the owner saw the two flagged law-truing hunks** (PRD §6 2(a) + ARCHITECTURE
   twin — commits flagged in the #354 PR body; ruling R1 = confirmed option B; the
   0.95-conjunct-drop migration is a Backlog card, NOT yet built).
4. **The owner's align-before-code list** (`frontend-handoff-2026-08-23.md` §8) still binds:
   visual direction · two-pane IA · card-catalog extensions · mobile scope · i18n EN/BM/中文 ·
   the a11y bar · per-journey "done" — grill before product code (hard constraint 6).

## 4 · Disciplines that earned their keep on 2026-08-26 (carry them)

- **Model economy law**: Fable = orchestrator ONLY; workers claude-sonnet-5 xhigh default;
  claude-opus-5 xhigh for judgement/security; every dispatch pins model+effort explicitly.
- **Babysitter protocol**: detached runs via SCRIPT FILES (inline Bash beyond ~400 chars or
  with nested single quotes dies on a harness wrapper parse bug); single
  `===ALL_DONE exit=N===` marker; launch-confirmation within a minute (first-phase bytes OR
  process liveness); a replaced instrument is ANNOUNCED with its new path; DONE-detectors
  pin THIS run's id, never the phrase alone.
- **Review ladder**: uniform (ADR-061); judgement logic gets an independent pass; adversary
  legs re-run their own findings live; mutation proofs over testimony. The dated-tripwire
  class hit three-for-three on 08-26 (witness v2 · the D-b3 drill floor · card-1's B5.4):
  pin monotonic directions, READ the world instead of assuming it. Quotations in ruling
  records must be byte-faithful to their source (review law 3's spelling-is-not-identity).
- **Lane comms**: a lane's final report goes via SendMessage — plain assistant text is
  invisible to the conductor (re-taught twice on 08-26).
- **PROGRESS 500-line cap**: archive-sweep BEFORE long writes (part3 is the current archive).

## 5 · Standing owner cards (execute or hold — do not re-litigate)

- R1 follow-up migration (drop the `>= 0.95` conjunct for `method='judgement'` in
  `assert_client_resolved`) — Backlog, full ladder, no urgency (the conjunct is a harmless
  failsafe; judgement confidence is PINNED 1.0 by the minting core, 0126 D-2).
- Pricing AMOUNTS sitting — during 磨合 (shape already ruled).
- PITR — **HOLD** (owner deferred again 2026-08-26); re-raise on the beta-prep checklist.
- Post-磨合 queue, each per its own lane row/gates: F-A8 internet lane (needs F-T1's SST
  rate table + an owner-named Tier-2 vendor + the law-28 pass) · F-A6 v2 cross-client named
  read · F-A5b PR-3 byte-burn render worker · Track B (F-T1 PR-1 is built+reviewed;
  F-T2 blocked on F-A4 PR-1c's `statutory_deadlines` DDL; F-T3 all-in per the owner;
  F-T4 rest beta-era).
- The gate-record OQ long tail — the PROGRESS Backlog rollup row names every carried OQ.

## 6 · What "done" means for 磨合 (the owner's own words)

"总之我要完整的 frontend when I step in Wave G and beta live launch" — every screen of the
three-tier world built (tier-3's checkout may sit behind invite-only copy ONLY until the
pricing amounts land), every crude door re-skinned in place, F-A7b designed and its train
built, the §3 pre-flight discharged, and a clean handoff into Wave G, where the factory
reset + estate e2e proves the lifecycle end to end against the BEE golden bar (FY2025 sales
RM 68,640.00 · net profit RM 47,245.65 · capital B/F (65,747.97) — two independently
produced documents agree).

*The repo is the system of record; where this file and `PROGRESS.md` disagree, PROGRESS.md
wins or is stale — true it first.*
