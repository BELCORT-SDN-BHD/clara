# Clara — Project Progress

Minimal session state. Everything durable lives on GitHub (issues, PRs, the #597 wayfinder map) and in git (`docs/plan/active/refresh-wave-2026-09-15/` for the current wave — DECISIONS, reports, drafts, the release runbook; `docs/plan/active/refresh-wave-2026-09-14/` for the released one). Clock in: read this, confirm the repo is clean (`git status`, `git log -1`, local `main` = `origin/main`), then ask the owner which ticket.

## Current State

- `main`: PR #838 (riders batch 2026-09-15, `7e40e3be`: 15 migrations 0199–0213, `chatTurn_v1` retired, 17 tickets `awaiting-release`) **plus this wave's PR #860, LANDED 2026-09-17 22:25 MYT by fast-forward: `main` = `a296765c`** (`integration/wave-2026-09-15` (twelve tickets #625 #633 #638 #639 #646 #647 #648 #649 #650 #652 #653 #654; migrations **0214–0224**; successor cut `chatTurn_v20` / `claraWork_v4` / `clientOnboarding_v5`; 156+ commits, +85k lines). `ci` was green on the landed sha (lint incl. full-history gitleaks, build, db-estate, db-live-gates).
- Hosted: unchanged since the two ceremonies on 2026-09-14 — DB frontier **193 / 0198**; `clara-runtime` **v84** (`refresh-3486b6c2`, machine `48ee715b763048`); `clara-web` `0290977b-…`. Nothing from 0199 onward is deployed.
- Wave evidence is entirely LOCAL (`refresh-wave-2026-09-15/reports/`): from-scratch chain 0001→0224 (219 files) on a virgin cluster; db estate 4934 / 4838 pass / 95 expected skips; runtime unit 2658 / 2638 (four environmental reds); 18 World e2e legs green incl. the three new bodies and the two-build cutover; browser 41 specs green; frozen law `--compare-base origin/main` additions only. Two contracts deliberately not cut at grant walls (#653's chat tool + `read_prepayment_source`, #647's alias writer) — follow-up issues.
- Owner rulings this wave: DECISIONS §0 (D1–D13), §3.1 fourteen post-review ratifications, §3.4 the re-base onto the moved main, **§3.5 the agent runs the hosted release itself, carrying PR #838's batch, and closes both batches' tickets** (`awaiting-release` is not a house label; each assignee ships their own, the next releaser carries what sits ahead on `main`).

## In Progress

- **Release the wave** (this session, `11d28f2d…`): landed; the twelve delivery comments are posted (integration evidence block filled); the 55 follow-ups are filed as **#861–#915** (`reports/followups-filed.md`); rehearsal measured (26 applied · 219 total, T = 6 s). NEXT: hosted release per `RELEASE-RUNBOOK-0199-0224.md` (backup, writer quiescence, 26 migrations to frontier 0224, runtime image with v20/v4/v5, web) → hosted evidence on the twelve wave tickets and the seventeen #838 tickets, then close all 29.
- Resume recipe if cut: the three workflow runs of this wave are `wf_e343e816-a88` (implement/review), `wf_dd380e6f-3ee` (first integration), `wf_eadff95a-4eb` (re-base + verify + cut review); their `journal.jsonl` files carry every agent's result. Worktrees: `clara-wt\int` (integration), `clara-wt\intb` (runtime leg, detached), `clara-wt\mainref` (origin/main reference), `clara-wt\<ticket>` ×12. Clusters (WSL, start with `pg_ctlcluster 17 <name> start`): `rig<ticket>` 55501–55512, `rigint` 55600, `rigint2` 55601, `rigmain` 55620, `rigint3` 55621, `rigfix` 55622, `rigrt` 55623, `rigdb` 55624, `rigestatedb` 55625 — all disposable after the release.

## Known Issues

- Windows-host reds that are not code: no `pg_dump` on PATH (four runtime files), #693 Defender/EICAR (also the intake spool `EPERM` rename), host-contention flakes in the sign-in helpers under many concurrent lanes. CI (Linux) does not see them.
- Blueprint drift recorded for the #683 sync, not edited (DECISIONS §3.2): `ARCHITECTURE.md:171` pins (now v20 / v4 / v5), §3.5 fixed-asset "intrinsic" claim, `PRD.md:69/114/122/123`.
- The wave-3 two-build blocker (ARCHITECTURE §10: a Work parked on `claraWork_v1`/`_v2` cannot post once 0195 is live) is untouched; #810's retirement makes a parked `chatTurn_v1` run a hard STOP in the runbook.
- Ideas parked: #782, #788. #836 needs the owner's real-provider run; #792 the owner's upstream filing.

## Next Steps

1. Finish "In Progress" above (land, comment, file issues, release, close).
2. Rig cleanup after the release: drop every `rig*` cluster, remove the fifteen extra worktrees, refresh `codebase-memory-mcp`.
3. The owner returns to the #597 map: **#682** (verify the real accounting journey and runtime recovery on the released combination, incl. #820's cleanup, #810's census, #813's provider eval) → **#683** (final acceptance + blueprint sync, then close #612 and #597).
4. When the lawyer-reviewed Terms/DPA wording arrives: publish v2 through `clara.publish_legal_document` (BELCORT owner) or a seed migration.
5. When the admission beta should stop taking firms: `set_admission_capacity` (BELCORT owner).
