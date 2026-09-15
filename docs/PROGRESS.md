# Clara — Project Progress

Minimal session state. Everything durable lives on GitHub (issues, PRs, the #597 wayfinder map) and in git (`docs/plan/active/refresh-wave-2026-09-15/` for the current wave, `docs/plan/active/refresh-wave-2026-09-14/` for the released one). Clock in: read this, confirm the repo is clean (`git status`, `git log -1`, local `main` vs `origin/main`), then ask the owner which ticket.

## Current State

- `origin/main` = `4464e471` (docs-only commits ahead of the deployed runtime `git_sha 3486b6c2`). Local `main` carries two further docs-only commits for the 2026-09-15 wave (`eabcdb7b`, `8235cf5e`) not yet pushed — they land through the wave PR.
- Hosted: unchanged since the 2026-09-14 releases — DB frontier **193 / 0198**; `clara-runtime` **v84** (`refresh-3486b6c2`, machine `48ee715b763048`); `clara-web` `0290977b-…`. Rollback points and hosted configuration facts: the two runbooks under `refresh-wave-2026-09-14/` and #612's "Hosted configuration facts" comment.
- Triage state (2026-09-15) as before: 30 tickets `ready-for-agent`, 3 `ready-for-human` (#800 #813 #820), 2 `idea` (#782 #788); beta phase, hosted data is test data.

## In Progress

- **Wave 2026-09-15 — twelve `ready-for-agent` tickets implemented in parallel**: #625 #633 #638 #639 #646 #647 #648 #649 #650 #652 #653 #654 (all blockers closed). State of truth: `docs/plan/active/refresh-wave-2026-09-15/` — `DECISIONS.md` (binding rulings incl. §0 owner-overridable table; #638 amended to a `journal_entry`-purpose Work + claim relation so no branch recuts the posting core), `SYNTHESIS.md`, `gap-<n>.md` (verified census per ticket), `brief-<n>.md`, `WORK-ORDER.md`, `RIG.md` (worktrees `C:\Users\zhant\Desktop\clara-wt\<n>` on `impl/<n>-<slug>`, PG17 clusters `rig<n>` on 55501–55512 in WSL, port triples), `reports/` (worker finals, fix rounds, integration, successors).
- Migration numbers: 0199 #650 · 0200 #647 · 0201 #639 · 0202 #646 · 0203 #648 · 0204 #649 · 0205 #654 · 0206 #638 · 0207 #652 · 0208 #653 · 0209 #625 · #633 none.
- Pipeline: implement (Opus, TDD, own rig) → three-axis review (standards / spec / adversarial migration-safety with a from-scratch chain on `rig<n>r` port 556xx) → fix → re-check (≤2 rounds) → integration branch `integration/wave-2026-09-15` on a fresh cluster (whole db/runtime/web estate) → one shared successor cut (`chatTurn_v20`, `claraWork_v4`, `clientOnboarding_v5` + `interview.v4.questions.ts`) from the branches' "successor contract" stanzas → PR → `ci` → fast-forward `main` → tickets commented with local evidence (hosted evidence pending) → hosted release is the owner's ceremony.
- If this session is cut mid-wave: the Workflow transcripts are under the session's `subagents/workflows/`; each worktree's `git log origin/main..HEAD` and `reports/<n>-final.md` say how far a ticket got; relaunch from the scratchpad scripts `wave-0915-implement.js` (per ticket) and `wave-0915-integrate.js`.

## Known Issues

- Owner-overridable rulings made by the orchestrator to keep the wave moving (plain-language table in `DECISIONS.md` §0): joined interstitial + `preview_invite` (#625); no resend door and no seat capacity (#625, PRD:126); chat entrances for #638/#652/#653 via one `chatTurn_v20` cut; claimant = staff-advance enrolment handle (#638); lane-agnostic birth triggers instead of a posting-core recut (#638/#639); correction Work is not an `accounting_work` row (#646, posted-effect integration → #676); fy-end day asked, never derived (#649); firm-eligibility relation + private-evidence wall as triggers (#654); firm identity facts stay plan items (#648); provenance-only counterparty identity (#647); #652 rides `reversing_journal`, #653 widens `accounting_plans.kind`; activity kind ladder untouched this wave (follow-up issue to file).
- Ideas parked for the next wayfinder round: #782, #788. #810 (`chatTurn_v1` retirement) and #820 (hosted orphan-wake cleanup, `ready-for-human`) as before; #813 (provider-eval real run) folds into #682's hosted session; #836 (maxSteps harness defect) voids #631's provider-eval scores.
- Deferred product promises marked inline in `docs/PRD.md` (#636 batch progress, #654 firm-scope entrance — delivered by this wave once merged, #658/#663 reassessment consumer, #764).
- Machine: the local rig recipe is now in git (`refresh-wave-2026-09-15/RIG.md`, `mkrig.sh`, `mkrig-migrate-wt.ps1`); WSL clone `/home/runner/clara-deploy` still needed only for the Cloudflare web bundle upload.

## Next Steps

1. Finish the wave: land the integration PR, comment each of the twelve tickets with its evidence, file the follow-ups the reports name (activity kind ladder D13; C88.16; hosted legs owed for C88.13; the `?tab=staffAdvances` walk; memo-only prepayments), refresh `codebase-memory-mcp`.
2. The owner returns to the #597 map: **#682** (hosted verification incl. #820's cleanup, #810's census, #813's provider-eval) → **#683** (final acceptance + blueprint sync, closes #612 and #597). The 2026-09-15 wave's hosted release (0199–0209 + runtime with `chatTurn_v20`/`claraWork_v4`/`clientOnboarding_v5` + web) is a ceremony on the `refresh-wave-2026-09-14/RELEASE-RUNBOOK.md` shape; 0195 must be live before any image running `claraWork_v3+` (already true).
3. When the lawyer-reviewed Terms/DPA wording arrives: publish v2 through `clara.publish_legal_document` (BELCORT owner) or a seed migration.
4. When the admission beta should stop taking firms: `set_admission_capacity` (BELCORT owner).
