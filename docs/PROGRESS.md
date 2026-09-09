# Clara — Project Progress

## Current State

- Updated: 2026-09-10 (MYT), after the second `/implement` session closed #614 (scoped shell, client switching, legacy-route migration).
- `main` at e967b442 (PR #697, two commits, fast-forwarded after green CI) plus this state update. `main` requires the `ci` check, so every push goes branch → PR → green → fast-forward of the same SHA.
- Hosted: `clara-web` version `65d6e906-c47c-47cc-8fd9-c9604a57f3c6` (tag `refresh-e967b442`) promoted at 100% on Cloudflare Workers from commit e967b442 (Linux build in a clean clone, only the two public Supabase values + `CLARA_BUILD_SHA` at build time; all six secret names attached; previous version `90c1a5d0-f808-4b88-bd28-d2395d9bc26a` is the rollback point). `clara-runtime` **v77** (image `refresh-6d4efd3d`, Node 22) and migration **0177** unchanged since the first session; seven lane DSNs `sslmode=verify-full`.
- Tickets: #606, #616, #617, #618 closed in the first session; **#614 closed** on 2026-09-10 with local + hosted evidence on the ticket (unit 2808/2808, browser 139 passed / 7 live-stack skips, hosted redirect matrix and login smoke; the signed-in hosted journey needs the owner's browser).
- Local verification recorded per commit; last fresh-cluster DB/runtime runs are from the first session (db 4101/4006 pass/94 skipped, runtime 2114/2111 pass/1 skipped/1 Windows-only EICAR) — nothing in #614 touched `packages/db` or `packages/runtime`.

## Completed

- [x] Product decisions, research and prototype direction accepted; [formal spec #612](https://github.com/BELCORT-SDN-BHD/clara/issues/612) and 71 tickets published (#606, #614–#683).
- [x] [#606](https://github.com/BELCORT-SDN-BHD/clara/issues/606) classify after extraction; [#616](https://github.com/BELCORT-SDN-BHD/clara/issues/616) Node 22 host; [#617](https://github.com/BELCORT-SDN-BHD/clara/issues/617) readiness observability; [#618](https://github.com/BELCORT-SDN-BHD/clara/issues/618) operation-contract census (first session).
- [x] [#614](https://github.com/BELCORT-SDN-BHD/clara/issues/614) scoped shell: one navigation registry (`apps/web/lib/navigation/tree.ts`) driving the shadcn/Base UI Sidebar, scope switcher, Breadcrumb and ⌘K; `/work` (Needs you as a saved view), `/settings/*`, `/clients/:id/work|accounting`; `/needs-you` and `/admin/*` 307-migrated; drafts survive scope switches; retired entry points mapped (D5/D6); Architecture §9/§11 record the implemented shell.

## In Progress

- Nothing in flight. The next frontier is listed under Next Steps.

## Known Issues

GitHub owns these as plain issues (`needs-triage`, no milestone): #689 (p6-1 cell not idempotent on a reused DB), #690 (bare `db-tests.md` citations), #691 (reporting-render Node 20 digest, owner decision), #692 (0007 limits trigger, no writer yet), #693 (Windows-only EICAR/Defender), #698 (auth wall drops the `?next=` query, found while smoke-testing #614). Findings an existing ticket will fix stay as comments on that ticket: frozen `chatTurn_v1` read-pool call (#623/#637), Documents list not re-polling (#633/#650), autodraft recovery copy and automatic admission (#633), operator registrations parked under `/settings/registrations` (#615), narrow list-to-detail Back (#641). #683's second criterion needs each to carry a decision before close-out. `packages/backup` moved to Node 22 (built, not deployed).

## Next Steps

1. Next implementation frontier: the tickets #614 unblocked — #626 (personal settings), #627 (Tax boundary), #635 (firm settings; also needs #625/#628), #632/#633/#634 (also need #623) — plus the still-unblocked #615, #619–#622; #641 (Work list/detail) needs #629/#630 first. #623 (first persistent Clara successor) is the deepest dependency in the graph.
2. Owner: run `/triage` over #689–#693 when convenient; sign in on app.clarabook.com and walk the new shell once (client switch, `/work?view=needs-you`, an old `/admin/members` bookmark) so #614's hosted journey carries a human observation too.
3. [Final acceptance #683](https://github.com/BELCORT-SDN-BHD/clara/issues/683) owns integrated delivery, blueprint synchronization and explicit closure of #612/#597.
