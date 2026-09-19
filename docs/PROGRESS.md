# Clara — Project Progress

Minimal session state. Everything durable lives on GitHub (issues, PRs, the #597 wayfinder map) and in git: `docs/plan/active/riders-2026-09-20/` (the riders programme running now: plan, work order, rig, the grill record, lane reports), `docs/plan/active/rider-1008-legal-enforcement-mode/` (#1008 with its release as-run), `docs/plan/active/refresh-wave-2026-09-18/` (the last mainline wave: DECISIONS, reports, the triage audit and what was applied, the release runbook with § RESULTS). Clock in: read this, confirm the repo is clean (`git status`, `git log -1`, local `main` = `origin/main`), then ask the owner which ticket.

## Current State

- `main` = **`dd3f8f1d`** plus docs commits: wave 2026-09-18 (PR #954 → `ede1df83`: ten tickets, migrations 0225–0233, `chatTurn_v21` / `claraWork_v5`) and **#1008** (PR #1011 → `dd3f8f1d`: migration `0234_legal_enforcement_mode`, no runtime change). `frozen-workflows.json`: 312 entries, all deploy-locked.
- Hosted: DB **229 / `0234_legal_enforcement_mode`**, legal enforcement mode **`prompt`**; `clara-runtime` image **`refresh-ede1df83`** (`sha256:2c6e7b4a…`, machine `48ee715b763048`, `bodies=55`, pins v21 / v5 / `clientOnboarding_v5`); `clara-web` **`42f257ac-193b-4149-a24b-04582597797f`** (tag `refresh-dd3f8f1d`). Releases: 2026-09-19 14:43Z (the wave, `refresh-wave-2026-09-18/RELEASE-RUNBOOK-0225-0233.md` § RESULTS) and 2026-09-19 19:34Z (#1008, `rider-1008-legal-enforcement-mode/RELEASE-AS-RUN.md`, 54 s outage). Newest restore point: `packages/db/backups/…2026-09-19T19-33-14-283Z.sql` (217,318,905 bytes).
- Rollback: web one command to `c550d944-352c-46de-b6f8-cc44b1e52733`; the legal mode returns to `enforce` through `clara.set_legal_enforcement_mode` as the operator firm's owner (one operator firm with one active owner exists on hosted); the runtime image has not moved since 2026-09-19; the database goes below its frontier only through the dump.
- Standing owner rulings: release go for a wave is given per wave; **beta, nothing dark** (2026-09-20: a legal or similar compliance gate prompts and never disables; enforcement returns before launch after the lawyer's review; access control is not loosened); **Client KB, no manual pre-registration**; **shadcn upstream is the standard**; firms self-serve and pricing follows usage; accounting treatments are checked against the standard and Clara asks for professional judgements.

## In Progress

- **The riders programme (owner, 2026-09-20): this long-running session finishes EVERYTHING outside the #597 mainline; the next session resumes the mainline on a clean board.** Plan: `riders-2026-09-20/README.md`. Wave 1 (42 tickets with no migration, ten lanes) is running; wave 2 (migrations, small and medium, plus the nineteen grilled tickets and #1012); wave 3 (the feature chains and the ONE successor cut `chatTurn_v22` / `claraWork_v6`). Each wave: implement test-first → review → fix → recheck → integration → PR → `ci` → merge → hosted release → hosted-evidence comment and close per ticket.
- **Grill 2026-09-20 — DONE and applied** (`riders-2026-09-20/GRILL-2026-09-20.md`): 24 rulings, one question at a time; 19 tickets promoted to `ready-for-agent` with briefs, 5 closed with reopen triggers, #1012 filed (retire the prior-GL seeding lane), notes on #663 and #665. `ready-for-human` 0, `needs-triage` 0.
- **#1008 — DONE**: implemented, three lenses + fix + recheck, PR #1011, released, closed with hosted evidence. On hosted BELCORT and the E2E audit firm got Work's model authority back with no owner action; the two SEEDED demo firms (Alara Advisory, Borneo Books) stay not live until their owners accept once, because the system never creates an acceptance for a person.
- Earlier on 2026-09-20: the triage audit applied (`refresh-wave-2026-09-18/reports/TRIAGE-APPLIED-2026-09-20.md`), the signed-in walk of the ten wave surfaces done, #1005 #1007 #1009 filed, #962 closed on the owner's answer.

## Known Issues

- Windows-host reds that are not code: no `pg_dump` on PATH (four runtime files), the Defender/EICAR skip, host-contention flakes under many concurrent lanes, `next build` panicking `0xc0000142` under heavy contention (a retry clears it, #869). CI (Linux) does not see them.
- Hosted, correct rather than broken: zero published cash account sets (every client home shows the cash arm's empty state until a human publishes one); one `document_processing_tasks` row reads `statement_facts · running` with no live run behind it.
- The flip of the legal mode has no web control yet (follow-up in `rider-1008…/reports/1008-final.md`); consents minted under `prompt` are not re-derived at the launch flip (a later ticket decides).
- `scripts/ops/dsn-pipe.mjs` pins the CA with its Windows spelling, so the backup runs under a WSL wrapper (#917, wave 1 lane 05).
- Blueprint drift recorded for the #683 sync, not edited: the lists in the 2026-09-15 and 2026-09-18 waves, the pins line (serving v21 / v5 / v5), 0195's activation assumption (replaced for beta by #1008), and the pack-shaped-read rule generalised by the #991 ruling.

## Next Steps

1. Finish the riders programme wave by wave; after each wave update this file and the board. The shared successor cut comes once, at the end of wave 3.
2. Then the #597 map, next session: the mainline's remaining children (#645, #661–#683), ending with **#682** (verify the real accounting journey on the released combination) → **#683** (final acceptance + blueprint sync, then close #612 and #597).
3. Owner, whenever convenient: accept Terms of Service v1 for BELCORT on `/settings/firm` (a prompt now, not a block); have the two seeded demo firms' owners accept once if those firms are to be tested with Work.
4. When the lawyer-reviewed Terms/DPA wording arrives: publish v2 (`clara.publish_legal_document`) and flip the legal mode to `enforce` before launch.
5. Housekeeping when the programme ends: the ten `clara-wt/<n>` worktrees and `clara-wt/int`; WSL clusters `rl01…rl10`, `rigint`, `rigrt`, `rigreh`.
