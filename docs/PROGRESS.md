# Clara — Project Progress

Minimal session state. Everything durable lives on GitHub (issues, PRs, the #597 wayfinder map) and in git (`docs/plan/active/refresh-wave-2026-09-14/RELEASE-RUNBOOK*.md`, `reports/`, `ceremony/`). Clock in: read this, confirm the repo is clean (`git status`, `git log -1`, local `main` = `origin/main`), then ask the owner which ticket.

## Current State

- `main`: **a0843c2f** = PR #838 (riders batch 2026-09-15: 34 `ready-for-agent` tickets, **15 new migrations 0199–0213**, runtime — `chatTurn_v1` retired from the tree, #764's chat-clarify `hook_missing` lane, #836 provider-eval `stopWhen` — and web: Work restate, applicant names, Work Activity `p_work`, plan attempt history, egress re-activation, the `ui:add` guard). Hosted is now BEHIND main: DB frontier **0198 → main 0213**, runtime image and web build both predate the batch. Tip = `git rev-parse --short origin/main`.
- Hosted (unchanged since the two ceremonies on 2026-09-14): DB frontier **193 / 0198**; `clara-runtime` **v84** = `refresh-3486b6c2` (digest `sha256:b6dd2fa5…`, single Fly machine `48ee715b763048`); `clara-web` **`0290977b-74a4-4c4a-849f-ee60efd631bb`** (built at `70c731ef`). Rollback points, the runtime/database asymmetry and the hosted configuration facts: the two runbooks and #612's 2026-09-14 "Hosted configuration facts" comment.
- Verification of PR #838: `ci` green (8 checks, 3 path-filtered skips); on the merged tree locally (macOS arm64, Node 22.23.2, PG 17.6, fresh cluster): db estate **4705 / 4610 pass / 0 fail / 95 skip**, runtime **2537 / 2507 / 0 / 30**, web unit **3755 / 3753 / 0 / 2**, browser **343 passed / 1 flake (rerun green) / 7 live-stack skips**, two-build cutover drill both legs (claraWork + the new chatTurn leg) ALL PASS. **No hosted evidence for any ticket in the batch.** Per-ticket evidence and the owner-facing assumptions are on each issue (comment dated 2026-09-17).
- Ticket state after the batch: **17 `awaiting-release`** (#750 #721 #778 #770 #809 #787 #775 #776 #779 #780 #784 #811 #812 #797 #821 — one migration each — plus #764 and #810, runtime deploys); **2 `ready-for-human`** (#836 needs the owner's real-provider run, #792 needs the owner to file the drafted upstream request); **15 closed** (#777 #774 #773 #771 #772 #789 #799 #806 #795 #791 #815 #794 #798 #816 #804); #693 still open for the owner's Windows-with-Defender run. **20 follow-ups filed** `needs-triage`: #839–#858.
- Decisions taken in-session under the owner's 2026-09-16 "do everything and merge" instruction, flagged on the issues for confirmation: #812 shipped a thin owner-floored `clara.reactivate_client_egress_purpose` (no lawful read hands the consent id to the browser); #809 also widened `clara.get_accounting_work_row`; #778's unique key is PARTIAL (excludes the 0017-pinned `opening_tb.line` and the reader-pinned `prior_gl.line`); #721's Clara-rail affordance and feed successor link are follow-ups (#839, #840).

## In Progress

- Nothing. The batch is merged; its release is the next session.

## Known Issues

- **Release runbook for 0199–0213 not yet written.** Source: PR #838's "Deploy order" section and the release checklist in each `awaiting-release` comment. Shape: database chain first with the runtime STOPPED for the live-writer recuts (0199 `cancel_accounting_work`, 0200 `answer_work_question` + immutability trigger, 0201 `persist_document_extraction`/`persist_invoice_facts` + the unique index, 0202 `list_activity` drop/create, 0204 `_record_journal_entry_core`, 0205, 0209, 0210, 0212, 0213 `journal_entries` triggers); then the runtime image (no `chatTurn_v1` — re-confirm zero non-terminal `chatTurn_v1` runs first; #764's control lane; watch the first sweeps); then the web (`intent_key`, `applicant_name`, `p_work`, `settledCents`, restate and re-activate actions all assume the new doors). 0201's prestate REFUSES on pre-existing duplicate `(extraction_id, field_path)` rows — the header carries the one-off fold for the release session.
- Ideas parked for the next wayfinder round (`idea` + `needs-triage`): #782 (model reading of every accounting document kind) and #788 (retire the 0045 adjustment-template lane; `overlap_warning` stays until then).
- Test-side flakes recorded: `documents-viewer-walk` two timing cells (#858); `activity-feed` af.20/af.23 are wall-clock budget cells that red under co-tenancy, not regression.
- Deferred product promises are marked inline in `docs/PRD.md` with their tickets (#636 batch progress, #654 firm-scope promotion — its caller lands in #648's setup route, #658/#663 reassessment consumer).
- Machine: the Mac rig recipe (template PG17 cluster cloned per worker, worktrees per group) lives in the agent's memory, not in git; the 16 `impl/*` worktrees under `~/code/clara-wt/` plus `integration` are retained for a later cleanup run (all merged; `riders/2026-09-15-batch` is on origin).

## Next Steps

1. **Release session for PR #838**: write `RELEASE-RUNBOOK-0199-0213.md` from the deploy order above, run the DB ceremony (writer quiescence), release the runtime image and the web build, record hosted evidence on each `awaiting-release` issue and close them.
2. **Owner actions**: #836 real-provider eval run (needs a key); #792 file the upstream Workflow DevKit request (draft on the issue); #693 Windows-with-Defender run; say on #812 / #809 / #778 if any in-session decision should be reverted.
3. Then the owner returns to the #597 map: **#682** (verify the real accounting journey and runtime recovery on the released combination) → **#683** (final acceptance + blueprint sync, then close #612 and #597).
4. When the lawyer-reviewed Terms/DPA wording arrives: publish it as v2 through `clara.publish_legal_document` (as the BELCORT owner) or a seed migration; the beta v1 rows become superseded.
5. When the admission beta should stop taking firms: `set_admission_capacity` (BELCORT owner).
