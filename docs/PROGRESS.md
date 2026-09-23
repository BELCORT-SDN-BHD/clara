# Clara — Project Progress

Minimal session state. Everything durable lives on GitHub (issues, PRs, the #597 wayfinder map) and in git: `docs/plan/active/riders-2026-09-20/` (the riders programme running now: plan, work order, rig, the grill record, lane reports), `docs/plan/active/rider-1008-legal-enforcement-mode/` (#1008 with its release as-run), `docs/plan/active/refresh-wave-2026-09-18/` (the last mainline wave: DECISIONS, reports, the triage audit and what was applied, the release runbook with § RESULTS). Clock in: read this, confirm the repo is clean (`git status`, `git log -1`, local `main` = `origin/main`), then ask the owner which ticket.

## Current State

- `main` = **`46cf7c852`** (PR #1039, riders wave 3: 40 tickets outside the mainline, migrations `0273` to `0293`) on top of wave 2 (PR #1029, `68b979bf9`), wave 1 (PR #1025) and #1008. No frozen workflow body changed since `chatTurn_v21` / `claraWork_v5`.
- Hosted (2026-09-23 17:08Z): DB **288 / `0293_fa_arrears_judgement_scope`**, legal enforcement mode **`prompt`**; `clara-runtime` image **`refresh-46cf7c85`** (`sha256:a6beb66f...2a1b`, machine `48ee715b763048`, `bodies=55`, pins v21 / v5 / `clientOnboarding_v5`); web **`b659a3d4-a253-4f49-8a7e-c89306f6ab82`**. As-run: `riders-2026-09-20/RELEASE-W3-RUNBOOK.md` § RESULTS (3 min 26 s window, 21 files in 1 min 28 s). Restore point before the window: full dump 2026-09-23T16:38:51Z.
- Rollback: web one command to `686ab53f-4079-4305-8d0b-54efac86adc0`; the runtime must NOT return to `refresh-68b979bf` while the ledger is at 0279 or above (the depreciation run's fourth outcome; `rollback-preflight` does not know this rule: #1035); no below-frontier database rollback is drafted; the legal mode returns to `enforce` through `clara.set_legal_enforcement_mode` as the operator firm's owner.
- Standing owner rulings: release go for a wave is given per wave; **beta, nothing dark** (2026-09-20: a legal or similar compliance gate prompts and never disables; enforcement returns before launch after the lawyer's review; access control is not loosened); **Client KB, no manual pre-registration**; **shadcn upstream is the standard**; firms self-serve and pricing follows usage; accounting treatments are checked against the standard and Clara asks for professional judgements.

## In Progress

- **The riders programme (owner, 2026-09-20; sharpened 2026-09-23: every non-mainline ticket CLOSED, none left open): this long-running session finishes EVERYTHING outside the #597 mainline.** Plan and method: `riders-2026-09-20/README.md`. **Wave 1 DONE, HOSTED, 42 closed** (PR #1025). **Wave 2 DONE, HOSTED, 41 closed** (PR #1029; #885 PARTIAL, remainder #1030). **Wave 3 DONE, HOSTED, 40 closed** (PR #1039; #990 PARTIAL, producer half #1037; residuals #1036 and #1038 filed). **Wave 4 is next:** the chart pre-step (migration 0295: `2030 Deferred Revenue`, `1180 Accrued Income`, `Salaries Payable`, `Rent Payable`, built alone as #941 part 1), then seven lanes (payroll and agreements, staff claims, accruals, prepayments, depreciation proposal and the signed-out invite preview #871, Knowledge and firm setup with #1032 and #1038, runtime and CI infrastructure), then the cut phase (`chatTurn_v22` / `claraWork_v6` for #985 #1000 #1030 and the statement-facts successor for #1037), then a sweep. Owner rulings of 2026-09-23 applied (#871 server-only door, #1032 TIN always offered, #912 ratified). #1023 AC2: `workflow_dispatch` of `ci.yml` on `main`, run 35893727271 (result recorded in the next docs commit). Follow-ups filed by the programme so far: #1014 to #1038.
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

1. Finish the riders programme wave by wave; after each wave update this file and the board. The shared successor cut comes once, at the end of wave 4.
2. Then the #597 map, next session: the mainline's remaining children (#645, #661–#683), ending with **#682** (verify the real accounting journey on the released combination) → **#683** (final acceptance + blueprint sync, then close #612 and #597).
3. Owner, whenever convenient: accept Terms of Service v1 for BELCORT on `/settings/firm` (a prompt now, not a block); have the two seeded demo firms' owners accept once if those firms are to be tested with Work.
4. When the lawyer-reviewed Terms/DPA wording arrives: publish v2 (`clara.publish_legal_document`) and flip the legal mode to `enforce` before launch.
5. Housekeeping when the programme ends: the ten `clara-wt/<n>` worktrees and `clara-wt/int`; WSL clusters `rl01…rl10`, `rigint`, `rigrt`, `rigreh`.
