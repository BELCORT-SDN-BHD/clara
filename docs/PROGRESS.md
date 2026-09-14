# Clara — Project Progress

Minimal session state. Everything durable lives on GitHub (issues, PRs, the #597 wayfinder map) and in git (`docs/plan/active/refresh-wave-2026-09-14/RELEASE-RUNBOOK*.md`, `reports/`, `ceremony/`). Clock in: read this, confirm the repo is clean (`git status`, `git log -1`, local `main` = `origin/main`), then ask the owner which ticket.

## Current State

- `main`: docs-only commits ahead of the deployed runtime `git_sha 3486b6c2`; no runtime, web or database change since the 2026-09-14 releases. Tip = `git rev-parse --short origin/main`.
- Hosted (two ceremonies on 2026-09-14): DB frontier **193 / 0198**; `clara-runtime` **v84** = `refresh-3486b6c2` (digest `sha256:b6dd2fa5…`, single Fly machine `48ee715b763048`); `clara-web` **`0290977b-74a4-4c4a-849f-ee60efd631bb`** (built at `70c731ef`). Rollback points, the runtime/database asymmetry (rollback below 0195 needs the unnumbered restore draft + a compatibility image carrying `claraWork_v3`) and the hosted configuration facts (legal v1 templates, Stripe test mode, admission capacity unlimited, the kept test firm "Walk Test 0913"): the two runbooks and #612's 2026-09-14 "Hosted configuration facts" comment.
- Verification: `ci` green on every landed PR; the owner's signed-in walk on the released build is recorded on #682; every refresh ticket (#612's 11 children) and rider (#692 #718 #720 #732) is closed with hosted evidence; no issue carries `awaiting-release`.

## In Progress

- Nothing.

## Known Issues

- Open owner decisions (`needs-info`): #825 (#631's activation basis for the `accounting_work` egress authority) and #826 (the pre-v3 grandfather + rollback-preflight frontier rule) — answer before any ticket that touches egress or the Work lane; #790 (bookkeeper floor), #793 (World-guard blast radius), #810 (`chatTurn_v1` export) can wait for #683's sweep.
- #820 (`needs-triage`): ten orphan held `wake` tasks make every rollback preflight refuse (`unbound_task`) — retire or repair before the next rollback drill.
- The refresh follow-ups (#770–#821, `needs-triage`) await `/triage` at the owner's pace; #764 is #720's Half 2 (chat-lane `hook_missing`).
- Deferred product promises are marked inline in `docs/PRD.md` with their tickets (#636 batch progress, #648 firm-scope promotion caller, #658/#663 reassessment consumer, #764).
- Machine: the local rig recipe (WSL Node 22 + corepack pnpm, PG17 clusters per chain, worktrees per ticket, web uploads from WSL) lives in the agent's memory, not in git; all rig clusters and ticket worktrees were dropped on 2026-09-14.

## Next Steps

1. The owner picks the next ticket. The natural next pair on the #597 map: **#682** (verify the real accounting journey and runtime recovery on the released combination) → **#683** (final acceptance + blueprint sync; by its own AC it reads every child ticket's result and every known issue's accepted disposition, then closes #612 and #597).
2. When the lawyer-reviewed Terms/DPA wording arrives: publish it as v2 through `clara.publish_legal_document` (as the BELCORT owner) or a seed migration; the beta v1 rows become superseded.
3. When the admission beta should stop taking firms: `set_admission_capacity` (BELCORT owner).
