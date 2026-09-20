# Riders wave 1: hosted release, as run (2026-09-20)

Release of PR #1025 (merge commit `ddb5a125821e323e5f999a228928e74f07fda49b`): web and the runtime
image. **No migration in this wave**, so no database window, no backup and no probe machine: the
hosted ledger stays 229 / `0234_legal_enforcement_mode`. No frozen workflow body changed
(`check-frozen-workflows`: no manifest diff), so the serving pins stay `chatTurn_v21` /
`claraWork_v5` and the previous image remains a lawful rollback target without a preflight run.

Authority: the owner's riders plan of 2026-09-20 (each wave ends with its hosted release and the
tickets closed on hosted evidence) and the release-ownership ruling of 2026-09-17.

## Gates before any production step

- PR #1025: five CI runs. Runs 1 to 3 found two defects of this wave that only show on the Linux
  runner (fixed `f6d828b2c`, `13c64b03b`) and two defects of the CI gates themselves that predate
  the wave (#1026, #1027: fixed in the PR, reviewed on two axes, rechecked). Runs 4 and 5 green.
- The merge commit's tree is identical to the tested PR head `2eb14b58d`.
- CI on the merge commit: run 35512800131, success (lint, build, db-estate, db-live-gates,
  storage-policy-battery, render-drill, db-split-partition-total).

## Steps and readings (UTC)

| step | reading |
|---|---|
| fly auth | `tools@belcort.com`; one machine `48ee715b763048`, started, checks 2/2 |
| runtime image, build only + push | `registry.fly.io/clara-runtime:refresh-ddb5a125` = `sha256:171c9476077655de589444cc4847e02476c7a7ff9227e52b7e74a367b8835a54`, 265 MB, built from a detached checkout at the merge commit with `CLARA_BUILD_SHA` set |
| web build + upload (WSL deploy checkout, detached at the merge commit, porcelain empty) | Worker version `922f9428-215c-4536-9602-5e0dd007efbd`, tag `refresh-ddb5a125`, not promoted |
| `/ready` before | 200 at 13:38:25Z |
| runtime release by digest (`fly deploy --image …@sha256:171c…` onto the running machine) | 13:38:25Z to 13:39:18Z, exit 0, machine reached `started`, checks good |
| `/ready` after | 200 at 13:39:26Z (health checks failed at 13:39:06Z while the new process booted: the outage is under one minute) |
| boot lines | `serving git_sha=ddb5a125… frontier=0234_legal_enforcement_mode(229) bodies=55 pins … chatTurn=chatTurn_v21 claraWork=claraWork_v5`; `stranded bodies n=0` BEFORE `durable world started pid=644`; five `clara-work/v1..v5` bundle banners; `CONTROL listening`; `LEADER acquired` (13:39:11Z to 13:39:13Z) |
| web promote | 13:39:42Z to 13:39:49Z, `922f9428-…` at 100% (previous: `42f257ac-193b-4149-a24b-04582597797f`, tag `refresh-dd3f8f1d`) |
| signed-out smoke, https://app.clarabook.com | `/login`, `/favicon.ico`, `/icon.png` 200; `/pending`, `/api/build-info`, `/checkout/cancel` 307 to `/login?next=…`; `/settings/registrations`, `/admin/registrations` 307 to `/operator`; cross-origin POST `/auth/confirm/resend` 403; runtime `/ready` 200 at 13:40:25Z |

One deviation from the script: the WSL deploy checkout fetches from the Windows checkout, whose local
`main` had not been pulled; the build script now fetches `refs/remotes/origin/main` instead.

## Rollback

Web: one command to `42f257ac-193b-4149-a24b-04582597797f`. Runtime: redeploy
`refresh-ede1df83` (`sha256:2c6e7b4acf3b5126365ebb892b47f5c7af6d2e06d76dc1fa49975a3b5f0898ff`); it
carries the same 55 bodies and the database did not move, so nothing can be stranded by it.

## Tickets

Forty-three tickets received a hosted-evidence comment. Closed: forty wave-1 tickets plus #1026 and
#1027 (#980 had been closed by the merge itself and got its comment afterwards). Closed with a named
remainder tracked elsewhere: #845 (#1023), #874 (#1022), #850 (the action comment still cites the
Windows figures), #967 (the order-of-magnitude claim is not decidable on a fresh-database run).
Open on purpose: #857 (its CHECK half needs a migration, riders wave 3) and #897 (stopped with
evidence, scope widened on the ticket, riders wave 3).

Not done in this release: a signed-in walk of the changed surfaces (no operator browser session in
this window). The web changes of this wave are small corrections (Select labels, settle polls,
error placement, money rendering); the owner's next signed-in session is the natural check.
