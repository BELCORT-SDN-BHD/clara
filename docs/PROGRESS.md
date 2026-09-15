# Clara — Project Progress

Minimal session state. Everything durable lives on GitHub (issues, PRs, the #597 wayfinder map) and in git (`docs/plan/active/refresh-wave-2026-09-14/RELEASE-RUNBOOK*.md`, `reports/`, `ceremony/`). Clock in: read this, confirm the repo is clean (`git status`, `git log -1`, local `main` = `origin/main`), then ask the owner which ticket.

## Current State

- `main`: docs-only commits ahead of the deployed runtime `git_sha 3486b6c2`; no runtime, web or database change since the 2026-09-14 releases. Tip = `git rev-parse --short origin/main`.
- Hosted (two ceremonies on 2026-09-14): DB frontier **193 / 0198**; `clara-runtime` **v84** = `refresh-3486b6c2` (digest `sha256:b6dd2fa5…`, single Fly machine `48ee715b763048`); `clara-web` **`0290977b-74a4-4c4a-849f-ee60efd631bb`** (built at `70c731ef`). Rollback points, the runtime/database asymmetry (rollback below 0195 needs the unnumbered restore draft + a compatibility image carrying `claraWork_v3`) and the hosted configuration facts (legal v1 templates, Stripe test mode, admission capacity unlimited, the kept test firm "Walk Test 0913"): the two runbooks and #612's 2026-09-14 "Hosted configuration facts" comment.
- Verification: `ci` green on every landed PR; the owner's signed-in walk on the released build is recorded on #682; every refresh ticket (#612's 11 children) and rider (#692 #718 #720 #732) is closed with hosted evidence; no issue carries `awaiting-release`.
- Triage (2026-09-15): the 48 post-refresh tickets are settled — 13 closed (6 already implemented or duplicate, 7 owner rulings recorded in `docs/PRD.md` §3, `docs/ARCHITECTURE.md` §5 B/E/F and §6, `packages/runtime/README.md`, and three `.out-of-scope/` records), 30 carry an Agent Brief under `ready-for-agent`, 3 are `ready-for-human` (#800 #813 #820), 2 are parked as `idea` for the next wayfinder round (#782 #788). Owner rulings of the day: beta phase, hosted users and data are test data; parked pre-v3 Work may be cancelled and `chatTurn_v1` is retired from the tree without a drain proof; the 0045 adjustment-template lane is to be retired in favour of accounting plans.

## In Progress

- Nothing.

## Known Issues

- Ideas parked for the next wayfinder round (`idea` + `needs-triage`): #782 (model reading of every accounting document kind — payroll, contracts, opening balances, prior GL, xlsx/docx — wider than invoice line items; today only the invoice family and bank statements have typed-fact lanes) and #788 (owner ruling 2026-09-15: retire the 0045 adjustment-template lane and converge on accounting plans; the same-period double-post goes with it, `overlap_warning` stays until then).
- #810 (`ready-for-agent`): owner ruled on 2026-09-15 that `chatTurn_v1` is retired from the tree with no drain proof (beta, test data); the freeze tooling gains a `retired` record so `MISSING` / `REMOVED-VS-BASE` accept it. Sequencing only: deploy the image without `chatTurn_v1` after #820's cleanup has cancelled any run parked on it, or the boot-time stranded-body guard refuses to start.
- #820 (`ready-for-human`): ten orphan held `wake` tasks make every rollback preflight refuse (`unbound_task`); the brief also censuses non-terminal runs by body for #810. Do it at the start of #682's hosted session — its rollback verification needs a usable preflight. #813 (provider-eval real run) folds into the same session.
- Deferred product promises are marked inline in `docs/PRD.md` with their tickets (#636 batch progress, #654 firm-scope promotion — its caller lands in #648's setup route, #658/#663 reassessment consumer, #764).
- Machine: the local rig recipe (WSL Node 22 + corepack pnpm, PG17 clusters per chain, worktrees per ticket, web uploads from WSL) lives in the agent's memory, not in git; all rig clusters and ticket worktrees were dropped on 2026-09-14.

## Next Steps

1. The owner returns to the #597 map: **#682** (verify the real accounting journey and runtime recovery on the released combination; start with #820's hosted cleanup, record #810's run census, run #813's provider-eval) → **#683** (final acceptance + blueprint sync; by its own AC it reads every child ticket's result and every known issue's accepted disposition — today's triage comments are those dispositions — then closes #612 and #597).
2. When the lawyer-reviewed Terms/DPA wording arrives: publish it as v2 through `clara.publish_legal_document` (as the BELCORT owner) or a seed migration; the beta v1 rows become superseded.
3. When the admission beta should stop taking firms: `set_admission_capacity` (BELCORT owner).
