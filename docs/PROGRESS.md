# Clara — Project Progress

Minimal session state. Everything durable lives on GitHub (issues, PRs, the #597 wayfinder map) and in git (`docs/plan/active/refresh-wave-2026-09-15/` for the current wave — DECISIONS, reports, drafts, the release runbook; `docs/plan/active/refresh-wave-2026-09-14/` for the released one). Clock in: read this, confirm the repo is clean (`git status`, `git log -1`, local `main` = `origin/main`), then ask the owner which ticket.

## Current State

- `main`: PR #838 (riders batch 2026-09-15, `7e40e3be`: 15 migrations 0199–0213, `chatTurn_v1` retired, 17 tickets `awaiting-release`) **plus this wave's PR #860, LANDED 2026-09-17 22:25 MYT by fast-forward: `main` = `a296765c`** (`integration/wave-2026-09-15` (twelve tickets #625 #633 #638 #639 #646 #647 #648 #649 #650 #652 #653 #654; migrations **0214–0224**; successor cut `chatTurn_v20` / `claraWork_v4` / `clientOnboarding_v5`; 156+ commits, +85k lines). `ci` was green on the landed sha (lint incl. full-history gitleaks, build, db-estate, db-live-gates).
- Hosted: **RELEASED 2026-09-17 15:02–15:15Z** (`RELEASE-RUNBOOK-0199-0224.md` § RESULTS) — DB frontier **219 / `0224_preview_invite`** (`26 new migration(s) applied · 219 total`, one run, 99 s); `clara-runtime` image **`refresh-a296765c`** (`sha256:b67163f3…`, machine `48ee715b763048`, boot `bodies=53`, `stranded bodies n=0`, pins v20 / v4 / v5); `clara-web` **`095073c9-…`** (tag `refresh-a296765c`) at 100%. Restore point: full dump 2026-09-17T15:00:26Z. Previous image `refresh-3486b6c2` was rollback-preflight ALLOWED at 15:16Z only (snapshot). Frozen manifest deploy-locked (`--lock-deployed`, 18 entries).
- Wave evidence is entirely LOCAL (`refresh-wave-2026-09-15/reports/`): from-scratch chain 0001→0224 (219 files) on a virgin cluster; db estate 4934 / 4838 pass / 95 expected skips; runtime unit 2658 / 2638 (four environmental reds); 18 World e2e legs green incl. the three new bodies and the two-build cutover; browser 41 specs green; frozen law `--compare-base origin/main` additions only. Two contracts deliberately not cut at grant walls (#653's chat tool + `read_prepayment_source`, #647's alias writer) — follow-up issues.
- Owner rulings this wave: DECISIONS §0 (D1–D13), §3.1 fourteen post-review ratifications, §3.4 the re-base onto the moved main, **§3.5 the agent runs the hosted release itself, carrying PR #838's batch, and closes both batches' tickets** (`awaiting-release` is not a house label; each assignee ships their own, the next releaser carries what sits ahead on `main`).

## In Progress

- **Wave 2026-09-15 — DONE** (session `11d28f2d…`): landed (PR #860), delivery comments posted, 55 follow-ups filed (#861–#915), hosted release executed and recorded, hosted-evidence comments posted and the 29 tickets closed (twelve wave + seventeen of PR #838's riders batch incl. #764 and the already-closed #787; `awaiting-release` removed everywhere). One more follow-up filed from the ceremony itself: `dsn-pipe.mjs` pins the CA with a Windows path a WSL child cannot open (backup ran under a scratchpad wrapper). Every `rig*` cluster is dropped; `clara-wt\int` is the one worktree directory still on disk (file-locked by another process — delete by hand).
- **Open smoke item:** the owner's first signed-in walk on the released combination — `/operator`, a Work's Activity tab (`p_work`), `/clients/<id>` work-pack tiles, `/clients/<id>/accruals`, `/clients/<id>/prepayments`, `/settings/knowledge`, `/settings/setup`, `/api/build-info` `git_sha` = `a296765c…`. Also watch the first hosted reconciler sweeps for #764's legacy arm (never met a real backlog row).

## Known Issues

- Windows-host reds that are not code: no `pg_dump` on PATH (four runtime files), #693 Defender/EICAR (also the intake spool `EPERM` rename), host-contention flakes in the sign-in helpers under many concurrent lanes. CI (Linux) does not see them.
- Blueprint drift recorded for the #683 sync, not edited (DECISIONS §3.2): `ARCHITECTURE.md:171` pins (now v20 / v4 / v5), §3.5 fixed-asset "intrinsic" claim, `PRD.md:69/114/122/123`.
- The wave-3 two-build blocker (ARCHITECTURE §10: a Work parked on `claraWork_v1`/`_v2` cannot post once 0195 is live) is untouched; #810's retirement makes a parked `chatTurn_v1` run a hard STOP in the runbook.
- Ideas parked: #782, #788. #836 needs the owner's real-provider run; #792 the owner's upstream filing.

## Next Steps

1. The owner's signed-in smoke walk (above); then triage the 56 `needs-triage` follow-ups (#861–#915 + the dsn-pipe one).
2. The owner returns to the #597 map: **#682** (verify the real accounting journey and runtime recovery on the released combination, incl. #820's cleanup, #810's census, #813's provider eval) → **#683** (final acceptance + blueprint sync, then close #612 and #597).
4. When the lawyer-reviewed Terms/DPA wording arrives: publish v2 through `clara.publish_legal_document` (BELCORT owner) or a seed migration.
5. When the admission beta should stop taking firms: `set_admission_capacity` (BELCORT owner).
