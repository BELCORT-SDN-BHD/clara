*Part 3 of 3 of the beta launch-sitting record (2026-09-03 → 09-04) — parts 1 and 2 are the sitting's PREP template, written before the walk; this part is the SITTING AS IT HAPPENED, written at the final clock-out truing from the lead's own as-run notes. Previous: `launch-sitting-record-2026-09-04-part2.md` · Next: none (this is the last part).*
*Every figure, id and stamp below is transcribed from those notes. Where the notes are silent the line says "not recorded"; nothing is derived and nothing is rounded. ONE exception, recorded here: the clock-out addendum of 2026-09-04 — the 23:55:11Z abandon of close run 2, its typed reason, and the second H-11 field check — POST-DATES the notes file and is transcribed from the lead's messages to the truing lane instead.*

# The beta launch sitting — 2026-09-04 ≈05:44 → 06:19 MYT

The sitting did not run as the prep's twelve-section script. The 裁-184 walk ran until 05:44, the
lead put the go/no-go as ONE `AskUserQuestion` with three options, and the owner ruled **裁-185** at
≈06:15. What follows is the record of that: the walk's verdict roll-up, the honest milestone tally,
the ruling, and what the sitting did NOT cover.

---

## 1 · The 裁-184 walk — closing verdict, 05:44

**Bank.** Statement through the human DOOR **PASS** · the web "Enter a statement" form **FAIL** ·
the agent's READ and PROPOSE **PASS** · the agent's WRITE **REFUSED** (`CLR-BANK-B ·
payer_identifier_contradiction = not_evaluable`, receipted, correct) · the human settle **PASS**
(after one correct `CLR19 write_into_closed_period` refusal caused by the walk's own order) · the
match **PASS** · the reconciliation certify **BLOCKED** by `recon_opening_mismatch` — a genuine data
gap on a fixture with no opening position, the door fail-closed.

**Close.** FY-end set · fiscal year opened · close begun · fifteen gates evaluated live · close
abandoned — all **PASS** through the product's own human doors. **Finalize NOT attempted**: run 2
came back with 2 FAIL and 2 UNKNOWN, and no attestation was made on the owner's behalf. The
close-prep CHAT lane **REFUSED** (`CLR-FREEFORM-B · read_unavailable`).

**Reports.** **FAIL** — `report_templates` = 0, so no statutory render is possible, and
`chatTurn_v17` carries no export tool although the Reports tab's own copy tells the user to ask for
one.

**The sentence that matters most, and it is a measurement, not a reassurance:** *every refusal was
fail-closed with a plain receipt, and no wrong number entered the books at any point.* Both trial
balances were re-derived from the DB by `trial_balance_as_of`, not read off a chat reply — **20:58Z:
`1100` Dr 280000 / `4000` Cr 280000** and **21:40Z: `1020` Dr 280000 · `1100` net 0 · `4000` Cr
280000**.

---

## 2 · The milestone tally — the eleven ENUMERATED milestones (裁-164 part 1)

The denominator is the **eleven** milestones enumerated at
[`frontend-sprint-handoff-2026-08-31.md:287-291`](../active/frontend-sprint-handoff-2026-08-31.md)
plus step 16's product walk. **Not "16 of 16" — the sixteen was never enumerated anywhere in the
repo, and nothing was invented to reach it.**

| # | milestone | verdict | the receipt |
|---|---|---|---|
| 1 | **signup** | **PASS** | `auth.users` created 18:56:25.153Z, code sent 18:56:25.199Z, `email_confirmed_at` 18:58:10.340Z; `clara.confirmation_attempts` ONE row, outcome **accepted**, 167 ms through the folded C-5 door |
| 2 | **checkout (test price, test card)** | **PASS, as MYR 0 in the sandbox (裁-148)** | `checkout_intents` `d827718e-ee95-496a-95a0-094eb78d8963`, session `cs_test_a17om…`, `open_checkout_intent` raised no CLR10 (step 10's `stripe_object_map` binding proven); `stripe_events` `evt_1UBfwbHD90w0k86X72Dqh1XW` `checkout.session.completed`, livemode **f**, amount_total **0 myr**, paid. **No card was collected** — `payment_method_collection: if_required` at MYR 0; the non-zero walk belongs to the real-money switch (裁-148). Stripe's own delivery log: **8 events, all 200 OK** at 19:05:06Z |
| 3 | **firm born** | **PASS** | `clara.firms` **`04daf86c-3aaf-4c59-9442-cce93f3582af` · BELCORT · 19:07:27.385Z**; the registration **approved** with `decided_by` **null** (the self-serve door, 裁-159 route (a)); `firm_memberships` `86c6e996…` owner · active; the payment row consumed in the same instant |
| 4 | **members invited** | **PASS on the row; the DELIVERY was not read back** | `firm_invites` **`771960a8-90a0-4182-9877-9a583794b3fd`**, admin, pending, created 19:15:59.283Z, expires +7 d; `/admin/members` reported *"The invitation to tao@belcort.com was sent."* **Whether that mail arrived was not measured** — recorded as such |
| 5 | **client onboarded through the in-thread interview** | **PASS** | ROME SECRETARY `7a045c7f-b7c3-4cf3-b3d9-c82312e35716`; `clientOnboarding_v4` created 19:25:15.760Z, completed 19:48:38.5Z; plan `c1fbfe71…` **19/19**, committed 03:52:48 at revision 20 with an attestation; client **active**; the standard chart applied as a separate human act — **86 accounts across 23 families**, adoption `934b94be…` |
| 6 | **documents posted unattended** | **FAIL as written; the CHAT path PASSED with a human approve** | `autoDraft_v9` was admitted twice and refused itself both times with a MASKED `CLR23` (`agent_tasks` `failed · error_code internal`, `tokens: 0` — the model was never called; the real cause is a 23505 on the KIND-BLIND `uq_counterparty_aliases_live_name`). It then opened a human question no human answer could satisfy. **A backend defect on the sales-invoice autodraft path on v71.** The same document WAS coded by `chatTurn_v17` — `journal_entries` `63e5b493…`, `1100` Dr 280000 / `4000` Cr 280000, approved 20:58:18.096Z, maker the agent principal / checker the owner |
| 7 | **bank matched in chat** | **PARTIAL** | The agent READ the bank pack, found the open item and PROPOSED `Dr 1020 / Cr 1100 2,800.00` correctly — **PASS**; its WRITE was **REFUSED** on the payer-identifier rung (receipt `a451fbfa…`), which is correct behaviour on a customer with no payer identifier on file; the HUMAN settle then **PASSED** (`journal_entries` `e66e9531…` approved 21:40:09Z; `bank_matches` `a2409de1…` live). **But the statement itself could not be ingested by either AI path** — it entered through the human door as the owner's delegate |
| 8 | **fiscal year opened** | **PASS** | `fiscal_years` **`c6e02492-72d1-40df-9906-05f0b72396a7`** FY2025, 2025-01-01 – 2025-12-31, ordinal 1, `fy_end_source` asserted, opened 21:21:48Z — the dialog's own copy called it "the first-ever trigger for this door in the product" |
| 9 | **year-end closed with human keys** | **NOT REACHED — deliberately, and correctly** | `begin_close` · the fifteen-gate evaluation · `abandon_close` all answered first time. **Finalize was never attempted**: close run 2 (`db941c04…`) came back with `open_bank_recon_items` **FAIL** (11 statement-month gaps) and `uncoded_documents` **FAIL** (the bank-statement filing), plus two UNKNOWN gates. FY2025 is not finalizable on this fixture and the product says so. **No attestation was made on the owner's behalf** |
| 10 | **management-accounts PDF downloaded** | **FAIL** | `report_templates` / `report_specs` / `report_spec_versions` / `report_artifacts` all **0**. The statutory path cannot render without a template version; the analysis path has no human export door and `chatTurn_v17` carries no export tool. Clara's own answer: *"no export tool is available"* |
| 11 | **FY2 opened** | **NOT WALKED** | Out of time; nothing blocks it |

**Honest count: 11 milestones enumerated · 6 PASS · 1 PARTIAL · 2 FAIL · 2 NOT REACHED.**

### The agentic section (裁-164 part 2), scored by its own rules

| | subject | verdict |
|---|---|---|
| **(a)** | statement upload → intake → reconciliation → drafts → human disposes | **FAIL at a1** — the classifier read both statements as `other` (confidence 0.05 and 0), and after the human set the kind the `statementFacts_v2` persist step refused on two DIFFERENT walls (Maybank: no ISO period bounds in a corporate header; Alliance: the printed NAME passed as the institution CODE). No `bank_statements` row from either. a2 therefore unreachable; a3 PASS by the human door, REFUSED (correctly) on the agent's write; a4/a5 BLOCKED by `recon_opening_mismatch` |
| **(b)** | chat as the accounting execution surface | **PASS on onboarding and on the coding/journal proposal · FAIL on close-prep · FAIL on the report render.** The close-prep turn refused `CLR-FREEFORM-B read_unavailable` because the freeform door's enumerated relation list does not reach the close tables — correct fail-closed behaviour wearing a MISLEADING sentence borrowed from CLR03 |
| **(c)** | auto-post / automatic wake | **OFF BY RULING (裁-165)** — layer 2, the G1 cadence wake sources, ships disabled; recorded as ruled, never as a failure. Layer 1's own belt is the (b2) defect above |
| **(d)** | witness activation, FA / adjustment authorities | **DARK IN THE UI** as predicted; not walked through SQL. Two MORE dark doors were found by the walk itself: `grant_client_egress` / `activate_client_egress_purpose` and `set_sales_lane_activation`, plus `add_client_identifier` |

**By 裁-164's own verdict weight — "a backend defect found here is a launch blocker if it breaks (a)
or (b)" — the walk broke (a) outright and half of (b).** That is exactly why the go/no-go was put to
the owner as a real question with a real NO-GO option, rather than reported as a pass.

---

## 3 · 裁-185 — the ruling (owner, 2026-09-04 ≈06:15 MYT)

**The question, put once through `AskUserQuestion` with the three options as follows:**

1. **GO — 封閉 beta（建議）** — beta live for BELCORT and owner-invited testers only; open applicants
   wait for v72, the statement-lane fixes, the "Enter a statement" form fix and DPA v2. *(The option
   was put in those words; "v72" was corrected by the 06:21 `fly releases` read — v72–v74 are the
   night's secrets-import releases on the v71 image, so the next real deploy is **v75**.)*
2. **NO-GO — fix first** — hold the launch until the statement lane, the autodraft mask and the
   report path are repaired.
3. **GO — open beta** — take outside applicants now.

**The lead's recommendation was option 1**, on this ground: everything that gates a REAL outside
applicant is either a wall that held or a defect that only bites on paths a closed tester group can
be told about, while the two genuine blockers for outsiders — the DPA v1 placeholder and the
runtime↔DB skew — are both fixable without touching a mechanism.

**The owner chose option 1, and his words, verbatim:**

> GO, 这个session 算结束了吗?  我要你整理下所有backlog 和 known issue, 包括目前e2e 得到的. 然后给我一个完整的清单
> and report, 我要下个session 维修和完善谢谢. included 所有backend and frontend. 所有的backlog 和knownissue and
> all harness 的需要注意的东西哦.

**So, as ruled:**

1. **Beta is LIVE, CLOSED** — BELCORT plus owner-invited testers. Sign-ups are not disabled at the
   platform (`disable_signup: false`, read by Management API), so the closure is an OPERATING
   posture, not a technical wall — the owner controls who is given the address.
2. **Before the first EXTERNAL applicant:** **a new runtime image, v75 or later** (the
   `reconcile_autopost_rules` skew),
   the statement-lane fixes, the "Enter a statement" institution/account pair, and **DPA v2**.
3. **This session CLOSES after the final truing merges** (裁-150). The repo is the handover; there
   are **no next lanes**; the next session starts on the owner's ask.
4. **The handover the owner asked for is
   [`beta-handover-2026-09-04.md`](../active/beta-handover-2026-09-04.md)** — posture, the milestone
   tally, the complete Backlog + Known-issues list across backend, frontend, harness and ops, the
   harness notes, and an ordered pick-list. `PROGRESS.md` carries the short rows and points at it.

---

## 4 · What the sitting did NOT do — stated, not glossed

- **裁-171's twenty knowingly-open items were NOT read aloud item by item.** The ruling accepted them
  in principle and ordered a reading at the sitting; the walk consumed the sitting's hours and the
  reading did not happen. **The list survives in full** as the Backlog and Known-issues rows of
  `PROGRESS.md` and the handover, so nothing is lost — but the READING is owed, and it is a
  next-session item, not a discharged one.
- **裁-133 (no Codex lane) and 裁-111 (the cross-family review leg) stay SUSPENDED, not repealed.**
  裁-171 puts their disposition at the next session's opening; no ruling changed them tonight. *(The
  owner asked about running a Codex e2e himself at ≈06:03 and a `codex-e2e-rate-wall-sleeper` machine
  appeared on `clara-backup` at 06:14 MYT — his own, named and untouched by this session. The
  suspension binds the AGENT's lanes, not the owner's own tools.)*
- **The Mail certification (裁-146 point 3) was NOT decided.** Two six-digit codes arrived: one at a
  NON-team private Gmail at FS-10 S21 (after the OTP-length fix) and one at `tools@belcort.com`, a
  TEAM address, at FS-11 step 13. Arrival time and the From header were asked and **are not
  recorded**. Whether the S21 Gmail code discharges the gate is the owner's call and remains open.
- **裁-169's number 1 — the Resend plan's cap — was never read.** Number 2 is now written down for
  the first time: `rate_limit_email_sent` = **100/hour** (Management API).
- **Two Supabase auth-config decisions were surfaced and left untaken:** `jwt_exp` = 3600 where the
  checklist expects 900, and `password_hibp_enabled` = false where the checklist says HIBP on.
- **The four sections of the prep's own script that were overtaken** — G3/G9 (裁-163's restore-proof,
  superseded by 裁-177's waiver), G8 (the terms row, superseded by 裁-166: the terms are NOT in force
  at beta), the evaluator-count contradiction (settled by measurement at FS-11 pre-read 3b.2 —
  **seven** deploy acts, not nine), and the `PROGRESS.md` line anchors (stale by construction, since
  the truing lane rewrote that file) — are recorded in part 2 and are closed by those rulings and
  that measurement, not by this sitting.

---

## 5 · The state at the close, read not assumed (06:19)

- **`main` = `ba8e7d35`** (#540, the `apps/dashboard` source delete). The post-merge hand sweep
  **33781966143** came back **SUCCESS, 13 of 13 jobs**, ≈02:14 MYT — the tree without
  `apps/dashboard` is proven green across every leg including the closed-wave drills and the four
  frontier legs (裁-158 points 3 and 4).
- **The web** serves from Cloudflare Worker `clara-web`, version **I =
  `c5b1e051-6c68-4f56-8ba2-28b3265979e1`**, deployed at 100% at 16:23:58Z 2026-09-03, carrying six
  secrets and three vars. The cutover happened at **≈00:31 MYT 2026-09-04**. Both `workers.dev` URLs
  are OFF (404). The Pages project `clara` is **DELETED** (1,039 + 739 + 300 deployments removed
  across five script runs, then the project; read back as absent, and `clara-e3o.pages.dev` no longer
  resolves).
- **The runtime** is Fly machine **`48ee715b763048`**, 2/2 checks, `/ready` **true** at 22:19:30Z,
  **VERSION 74** (a config counter after the 裁-179 secret imports — **not a new image**: it is still
  the **v71** build from `344f7ad8` — `fly releases --json` at 06:21 shows v71/v72/v73/v74 all on
  `deployment-01M1JSJW8SW0EZ1SP8ZR48B1WZ`, so **the next real deploy is v75**). `held_outbox` **6**
  (was 0 at 02:39) — **read and explained at 06:21**: `wakeEngine.heldForDisabledSource` 6 with the
  warning "6 held/queued wake-engine row(s) awaiting a disabled/unregistered source", the designed
  loudness of 裁-165's disabled wake sources. `pending_intents` 0.
- **The database** is at **159 / `0164_checkout_gate_c6_web_reads`**, freshly re-applied from
  `0001`; 19 `clara%` roles; the evaluator freeze reads `{"ok": true, "verified_deployed": 7,
  "verified_registered": 8}`.
- **The estate** holds firms Alara · Borneo · **BELCORT (`04daf86c…`, `is_operator` = true, the only
  operator firm ever)**, and clients Meridian Logistics · Sunrise Retail · Highland Coffee · ROME
  PROPERTIES `acb60b65…` · **ROME SECRETARY `7a045c7f…`** (active, chart applied, one invoice posted,
  one bank receipt settled, **FY2025 OPEN — two close runs, both ABANDONED**: run 1 at 05:39 to book
  the settlement, run 2 `db941c04-f78e-4595-9004-08df90be1631` at **23:55:11Z = 07:55 MYT** at the
  clock-out, so the period wall is not left on; the Close tab then read "2025-01-01 – 2025-12-31 ·
  open · fy_end: asserted", run state abandoned; no attestation, no finalize).
- **The FS-11 bridge sleeper `6834e7da567358` is DESTROYED.** A foreign machine
  `codex-e2e-rate-wall-sleeper` (`d895474fe0e138`) is running on `clara-backup` — the owner's, named
  and left alone.

---

*Written at the final clock-out truing, 2026-09-04, from the lead's as-run notes. No secret, DSN,
password, `whsec_` value or PAT appears in this record.*
