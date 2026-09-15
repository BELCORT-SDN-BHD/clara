# Clara — Project Progress

Minimal session state. Everything durable lives on GitHub (issues, PRs, the #597 wayfinder map) and in git (`docs/plan/active/refresh-wave-2026-09-14/RELEASE-RUNBOOK*.md`, `reports/`, `ceremony/`). Clock in: read this, confirm the repo is clean (`git status`, `git log -1`, local `main` = `origin/main`), then ask the owner which ticket.

## Current State

- `main`: docs-only commits ahead of the deployed runtime `git_sha 3486b6c2` (v84); no runtime, web or database change since the 2026-09-14 releases. Hosted: DB frontier **193 / 0198**; `clara-runtime` **v84** = `refresh-3486b6c2` (single Fly machine `48ee715b763048`); `clara-web` `0290977b-74a4-4c4a-849f-ee60efd631bb`. Hosted configuration facts and rollback points: the two runbooks and #612's 2026-09-14 "Hosted configuration facts" comment.
- 2026-09-15 triage settled every post-refresh ticket: 16 closed (already implemented, duplicate, or an owner ruling recorded in `docs/PRD.md` §3, `docs/ARCHITECTURE.md` §5 B/E/F and §6, `packages/runtime/README.md`, `.out-of-scope/`), 30 `ready-for-agent` with Agent Briefs, 2 `idea` (#782 #788). Owner rulings of the day: beta phase — hosted users and data are test data; old bodies retire without a drain proof; the 0045 adjustment-template lane is to be retired; one Terms/DPA acceptance at registration is the whole model-egress authority (#800 rejected).
- Hosted cleanup done (#820, 2026-09-15): no orphan `wake` tasks, zero non-terminal runs on any old body, rollback preflight **ALLOWED** against v84; only live run is `clientOnboarding_v4`.

## In Progress

- Nothing.

## Known Issues

- #836 (`ready-for-agent`): the provider-eval harness passes `maxSteps`, which AI SDK 7 ignores; the first real-provider run (`reports/631-provider-eval-2026-09-15.md`) scored 0/3 on three legs by construction — void until #836 lands and the owner re-runs it with a key.
- #810 (`ready-for-agent`): `chatTurn_v1` leaves the tree; needs the freeze-tooling `retired` record; hosted census shows 0 runs on it, so it can deploy any time.
- Ideas for the next wayfinder round: #782 (model reading of every document kind), #788 (retire the 0045 lane); unfiled: the owner expects invited members to also accept the Terms — today only the registering owner does.
- Deferred product promises are marked inline in `docs/PRD.md` with their tickets (#636, #654, #658/#663, #764).
- Machine: no local Postgres rig on this Windows box (Node 20; WSL has no node); `fly` is authenticated as tools@belcort.com and the probe-machine + `dsn-pipe` pattern works from Git Bash (recipe in the agent's memory).

## Next Steps

1. **#682** (verify the real accounting journey and runtime recovery on the released combination; the rollback preflight is already ALLOWED) → **#683** (final acceptance + blueprint sync; the 2026-09-15 triage comments are each known issue's accepted disposition; closes #612 and #597).
2. When the lawyer-reviewed Terms/DPA wording arrives: publish it as v2 through `clara.publish_legal_document` (as the BELCORT owner) or a seed migration; the beta v1 rows become superseded.
3. When the admission beta should stop taking firms: `set_admission_capacity` (BELCORT owner).
