*Part 6 of 6 of the FS-11 Wave-G factory-reset as-run (2026-09-04) — the lead's as-run record, written at the final clock-out truing. Previous: `fs11-wave-g-asrun-2026-09-03-part5.md` · Next: none (this is the last part).*
*Parts 1–3 are the step TEMPLATE, written before the ceremony opened. Parts 4–6 are the AS-RUN, transcribed from the lead's own as-run notes; every stamp, id and count is transcribed and nothing is derived. Where the notes are silent, the line says "not recorded".*

# FS-11 · Wave-G factory reset — AS RUN, the bank lane, the close, the reports, and steps 17 → 19 (裁-184)

**Window:** 05:02 → 05:44 MYT 2026-09-04 for the walk; step 19's teardown at 06:19. Continues
`fs11-wave-g-asrun-2026-09-03-part5.md`.

---

## 裁-184 (owner, 05:02) — walk the rest tonight

Verbatim: 「全部走完（銀行+結帳+報表，約 60 分）再 sitting」. Bank subject chosen by measurement: **not**
the RPR April statement (RPR has no letter and no consent — a second consent ceremony) but **ROME
SECRETARY's own June 2025 Maybank statement** (`2506_MBB`, 355,792 B), because consent is live, the
customer is registered and the RM2,800 receipt of the already-posted invoice is in it.

---

## 16A.3 / 16B(a) · the bank lane — 05:04 → 05:42

**Setup.** `bank_accounts` for RS = 0 (the interview's free-text "banks" answer creates none — a
fourth capture-projection instance). MBB `5144-8700-3061` added through the web form at 05:04:49
(`add_bank_account`, CoA `1020` Bank Current Account).

**The two AI ingest paths BOTH failed at the READ step, each at a different wall:**

| | document | reads | verdict |
|---|---|---|---|
| MBB 2506 | `38c8fd49-6feb-4392-b361-3ac9c71aa2ce`, 4 pages | classify `clara-classify-llm:v1` → **`{"verdict_kind":"other","confidence":0.05,"low_confidence":true}`**; OCR done | kind set to `bank_statement` by the human 05:06:56 → `statement_facts` task (`llm-openai:gpt-5.6-terra:stmt-witness-v1`) → **`statementFacts.v2`'s `persistStatementWitnessPairStep` FAILED and retried (21:07:33, 21:07:34): "the statement header does not state readable ISO period bounds and a statement date"**; the run `failed` 21:07:34. **ROOT CAUSE off the OCR:** the Maybank corporate current-account header prints `TARIKH PENYATA / STATEMENT DATE : 30/06/25` and `NOMBOR AKAUN 514487003061` but **no period bounds** — Maybank does not print "from–to". The persist door demands BOTH |
| ALB 2510 | `f7e0e8c4-bf3e-4d8e-aa8f-8e93dbcb6ae3`, 5 pages | classify → **`other`, confidence 0, low_confidence**; OCR done | kind set by the human 05:10 → task `63c70afe-34ae-44cc-8254-d4a4ae248ac5` started 21:11:09Z, run `wrun_01M1MHRY0B2336RK98BNRC8ZEH`; the two witness reads COMPLETED (text 2.4 s, vision 5.5 s — the ALB header PASSED the bounds gate), then `persistStatementWitnessPairStep` failed after 3 retries: **"institution code ALLIANCE BANK is not a live entry in the bank institutions reference"**. Run `failed` 21:11:21Z |

**CORRECTED at 05:19 — the roster is NOT the gap.** `clara.bank_institutions` holds **17 live
Malaysian banks including `ALB | Alliance Bank Malaysia Berhad | active`**. The persist door was
handed the printed NAME "ALLIANCE BANK" as the institution CODE. **The defect is the witness→roster
normalisation in `statementFacts_v2`.**

**And a second, independent defect on the same path, twice:** the `statement_facts` TASK was left
**`running` (never settled)** when the run died, so the router would refuse to re-mint. Settled both
times by hand through `clara.fail_statement_facts(task, 'engine_error')` as `clara_fn_owner` — the
second at 21:17:48Z, returning `{"reason":"engine_error","status":"failed"}`.

**16A.3 / 16B(a1) = FAIL on both formats. `bank_statements` for RS = 0 after both attempts.** Neither
failure is a crash: both are fail-closed refusals with a plain message. Four sitting items were
minted here — the period-bounds inference for Maybank corporate headers; the witness→roster code
normalisation; the task-stranding on step failure; and **the classifier's blindness to bank
statements (2 of 2 `other`, confidence 0 and 0.05 — the most common document class in the product)**.
A fifth was seen on the page: the two "What kind of document is this?" **open questions stay OPEN**
on the client's Needs-your-attention list after the human sets the kind.

**THE HUMAN DOOR — the web form is thinner than its door.** Bank → Statements → "Enter a statement"
was keyed with the MBB June figures read off the OCR (BEGINNING BALANCE 1,000.00 · one transaction
06/06 "TRANSFER TO A/C KONG CHENG RESTAURA* MBB CT-" 2,800.00+ → 3,800.00 · ENDING BALANCE 3,800.00 ·
TOTAL DEBITS .00 · TOTAL CREDITS 2,800.00) and was **REFUSED at 05:30:28: `CLR10 ·
header_unreadable` — "the statement header does not state a readable institution and account
number".** **Confirmed in code (05:31):** `packages/db/migrations/0038_wave_c_b_bank.sql:1187-1200`
(`_stmt_header_norm`) requires `institution_code` + `account_number` ("identity needs the PAIR");
`apps/web/components/bank/statements-section.tsx:152-156` builds the header with only
period_start / period_end / statement_date / opening_cents / closing_cents (+ null totals/currency) —
**the pair is never sent, although the selected bank account carries both. So the human statement
door has NEVER been reachable from the web at this tip.** A one-line frontend fix (derive the pair
from the selected account).

**The door itself, walked as the owner's delegate under the 裁-183 precedent (mechanism intact, face
defective), 05:32:52:** `enter_bank_statement(RS, MBB account `00b7052a…`, doc `38c8fd49…`,
header{MBB · 514487003061 · MYR · 2025-06-01..2025-06-30 · stmt 2025-06-30 · opening 100000 · closing
380000 · totals 0 / 280000}, lines[1: 2025-06-06 · … · +280000 · running 380000])` →
`{"status":"live","replayed":false,"line_count":1,"statement_id":"6191645b-13c3-4188-bb9d-64cd2a7b2f63"}`
— **the chain identity (1,000 + 2,800 = 3,800) verified by the door.** `bank_statements` RS = 1 live,
`ingest_mode = human`, 1 line (`cc6b5488-248b-4847-85e1-308dc045783b`). The web then rendered it
correctly: Statements listing "2025-06-01 → 2025-06-30 · RM 1,000.00 → RM 3,800.00 · live", Matching
listing the unmatched line with a **Settle** button.

**16B(a2) the agent READ and PROPOSED — PASS (05:36).** Tools `read_books_freeform` + `get_bank_pack`;
Clara found the RM2,800 receipt, matched it to the outstanding `RSINV-2506/01` under the registered
customer, proposed **Dr 1020 / Cr 1100 2,800.00** allocated against the open item — **and explicitly
did not call the settlement action, because the human had asked for a proposal.**

**16B(a3) the agent's WRITE — REFUSED, fail-closed, receipted (05:37).** `settle_from_bank_line`
returned **`CLR-BANK-B: payer_identifier_contradiction`, reported as `not_evaluable`**.
`bank_agent_receipts` **`a451fbfa…`** · act `settle` · outcome **refused** · subject the statement
line · via `interactive_client` · rationale recorded · gate rung_vector `line_excepted` pass ·
`unexplained_inflow` pass · … `payer_identifier_contradiction` **not_evaluable**; plus two `pack_read`
receipts (21:34:42Z, 21:36:33Z). Books unchanged. **The customer has no payer identifier on file and
the bank line's "KONG CHENG RESTAURA*" is a name fragment — names are not identity (law 3), at the
bank ledger.** *A product behaviour to explain to users, plus a missing UI to record a payer
identifier.*

**16B(a3) the HUMAN settle — refused once by the period wall, then PASS.** First attempt 05:38:42:
**`CLR19 · write_into_closed_period` — "entry `99e02dbe-…` sits in closing fiscal year FY2025".**
Cause: the lead's own walk ORDER — `begin_close` at 05:22 had moved FY2025 to `closing`, and a
settlement dated 2025-06-06 is a write into a closing year. **Correct, fail-closed**, and the refused
settlement rolled back whole (that entry id does not exist in `journal_entries`). Remedied through
the product: **"Abandon close"** (human door, reason required) at 05:39 → FY2025 open again, run
state `abandoned`. **Second pass 05:40:11 — ACCEPTED.**

**BOOKS PIN 2 — 05:40:39.** `journal_entries` RS = `63e5b493…` (approved, 1100 Dr / 4000 Cr 280000)
**+ `e66e9531-3cde-49bd-b728-6b9c9c083d0b`** (approved **21:40:09Z**, 2025-06-06, "Receipt from KONG
CHENG RESTAURANTS SDN BHD settling RSINV-2506/01…", **1020 Dr 280000 / 1100 Cr 280000**);
`bank_matches` **`a2409de1-807f-439d-9a8f-15adc0205e0c`** live. **`trial_balance_as_of(RS,
2025-12-31)`: `1020` Dr 280000 · `1100` Dr 280000 / Cr 280000 (net 0) · `4000` Cr 280000.**

**16B(a4/a5) reconciliation certify — BLOCKED by a genuine data gap.** Bank → Reconciliation
(05:40:45): statement 2025-06-01 → 2025-06-30 · preview · Opening anchor RM 1,000.00 · GL balance
RM 2,800.00 · Uncleared RM 0.00 · Difference RM 0.00 · alert **"The DB refuses completion while:
`recon_opening_mismatch`"** · **Certify DISABLED** · plus an honest "Not built yet" card for
`get_bank_reconciliation`'s full snapshot. `get_bank_reconciliation(statement)` as the owner (05:42):
preview true · blockers `["recon_opening_mismatch"]` · chain_ok true · first_period true ·
statement_opening 100000 vs anchor_amount 0 · gl_balance 280000 · matched_line 280000 · difference 0
· **can_complete FALSE**. **The accounting reading:** the statement opens at RM1,000 but the GL bank
account opened at 0 (the opening position was deferred at onboarding), so GL 2,800 ≠ bank 3,800 by
exactly the missing opening balance — **the door refuses to certify a tie that is not there, which
is correct.** The honest remedy is the opening-seed ceremony (`create_opening_seed` →
`record_opening_target(s)` → `draft_opening_item` → `approve_opening_seed`), which demands a **tie
document** and an **attestation**. **Decision, recorded: the lead did NOT assert an opening position
on the owner's behalf.** An attestation is a professional act, and fabricating a 1 January balance
would be exactly the kind of number the product refuses.

---

## 16A.5 · close-prep — 05:20 → 05:44

**The human doors all answered first time through the UI.** The Close tab opened with "FY end not set
(defaults to 31 Dec)" — the interview's `fye=12` is not projected (the capture gap, third instance).
`clara.set_client_fy_end` → 12/31 (05:21) · `clara.open_fiscal_year` → **FY2025
`c6e02492-72d1-40df-9906-05f0b72396a7`**, 2025-01-01 – 2025-12-31, ordinal 1, open, `fy_end_source`
asserted, opened **21:21:48Z** · **`begin_close` 05:22:48 → `close_runs`
`0f057658-78d6-4536-b68f-a396b61f0e67` in_progress, started 21:22:46Z**, every gate evaluated live.

**`close_gate_results` for run 1 (the authoritative read, 05:24, 15 rows).** Drawer 1: `ap_control_tie`
pass (GL 0 = subledger 0, control 2000) · **`ar_control_tie` pass (GL 280000 = subledger 280000,
control 1100 — the books pin re-proven through a close gate)** · **`bank_recon_identity` UNKNOWN
(`no_statements_loaded`)** · `deferred_opening_resolved` pass (`no_deferred_opening`) ·
`fa_control_tie` pass (vacuous: `no_enrolled_assets`) · `opening_continuity_tie` pass ·
`pl_retained_earnings_roll` pass. Drawer 2: **`closing_stock_present` UNKNOWN
(`trade_nature_fact_absent`)** · `depreciation_through_fy_end` pass · `open_bank_recon_items` pass
(registry clear, no accounts) · `unapproved_drafts_in_period` pass (0) · `uncoded_documents` pass
(uncoded_count 0) · `undated_documents` pass (0). Drawer 3: `bank_recon_informational` advisory ·
`fa_register_tie_view` advisory (tie true).

**Run 2 (through the door as the delegate, 05:42:30, `db941c04-f78e-4595-9004-08df90be1631`) — the
gates TIGHTENED the moment real bank data landed:** ap pass · **`ar_control_tie` pass with GL 0 =
subledger 0** (the receivable is settled) · `bank_recon_identity` unknown
(`no_completed_reconciliation_covering_fy_end`) · deferred_opening pass · fa pass (vacuous) ·
opening_continuity pass · P&L roll pass · closing_stock unknown · depreciation pass ·
**`open_bank_recon_items` FAIL — `statement_gaps` = 11 months** (2025-01…05, 2025-07…12) for the MBB
account, basis `exceptions_gaps_and_registry_v1b` · unapproved_drafts pass · **`uncoded_documents`
FAIL — uncoded = [{filing `18d077b2…`, document `38c8fd49…` (the MBB statement), financial_date
2025-06-30}]** · undated pass · two advisories. **結帳 verdict: FY2025 is NOT finalizable on this
fixture (2 fail, 2 unknown) and the product says so. No attestation was made on the owner's behalf;
the FY stays open. 16A.5's human half = PASS as a mechanism.**

**Four observations for the sitting, from the gates themselves.** (a) `uncoded_documents` will fail
EVERY close once a statement is filed — a bank-statement filing carries a financial date and never
gets a journal entry, so `_close_gate_uncoded` reads it as uncoded: **a false fail**. (b)
`open_bank_recon_items` demands FY-wide statement coverage, so a client who uploads one month gets 11
gaps — **a product behaviour to document, not a defect.** (c) The client home lists "Uncoded filing"
×4 while the gate measures 0 — **two different censuses of "uncoded".** (d) Two gates are UNKNOWN and
the UI renders them without a pass badge, yet the run is still finalizable by attestation. Filings
census for RS at 05:23: 5 live — EZSEC (null kind, 0 entries) · the letter (consent_evidence, 0) ·
ALB (bank_statement, 0) · MBB (bank_statement, 0) · RSINV (invoice, 1 entry).

**The close-prep CHAT turn — REFUSED (05:26).** Prompt: *"prepare the FY2025 close … review every
close gate … propose the close if the books support it."* Clara called `read_books_freeform` once and
answered **`CLR-FREEFORM-B: read_unavailable`**, with the alert card *"This action needs an active
bookkeeper (or higher) session for the firm."* — **but the owner IS the firm's owner and was signed in
on the page**, and the SAME thread's freeform read had succeeded at 04:53. **Traced at 05:27 by code
reading:** `read_unavailable` is not a session check — it is the COLLAPSED oracle token of
`packages/runtime/workflows/chatTurn.v15.freeform.ts` (`FREEFORM_ORACLE_REASONS` = relation_denied ·
function_denied · unknown_relation · relation_not_enumerated · function_not_enumerated → one token,
Annex D.2), and its sentence is `readToolRefusalMessage({code:"42501"})`, which resolves to CLR03's
wording. **So the DB correctly refused the model's SELECT because the close tables are not on the
freeform door's enumerated relation list — and the human-facing sentence MISDESCRIBES the cause.**
Two sitting items: the allow-list does not reach the close tables, so the close-prep chat lane cannot
read a close run at this tip; and the 42501 collapse needs oracle-safe wording of its own. Both are
new-version changes (frozen bodies, `.claude/rules/runtime-workflows.md`). **16A.5's agentic half =
FAIL (refusal, fail-closed, receipted in the thread).**

**Web finding at the same step:** after "Abandon close" the Close tab offers **no "Begin close"
button** — a second run cannot be begun from the web. Run 2 had to go through the door.

---

## 16A.6 · reports — 05:28 and 05:44 — FAIL

The Reports tab renders honestly: *"Statutory close reports — the signed-original archive (0127) —
sealed, never watermarked: No report artifacts yet"*; *"Analysis sandbox — watermarked, never sealed
(0132): There is no human 'request export' door — the mint/request verbs are granted to Clara's agent
lane only. Ask Clara…"*; "Month snapshots — Mint snapshot"; "Render job queue: none"; "Seeding
batches: none"; "Wiki pages: none". **DB: `report_templates` 0 · `report_specs` 0 ·
`report_spec_versions` 0 · `report_artifacts` 0 · `reporting_periods` for RS = 1** (fiscal_year grain,
minted by `open_fiscal_year`). **With zero template versions the statutory path cannot render at
all.**

The agentic path (05:44): Clara ran ONE freeform read (SQL over `coa_accounts` × `journal_lines` ×
approved `journal_entries`, posting_date ≤ 2025-12-31, HAVING net ≠ 0, receipted) and answered a
correct narrative table — **`1020` Bank Current Account RM2,800.00 Dr · `4000` Sales / Fees Income
RM2,800.00 Cr** (1100 nets to zero and is excluded by her HAVING clause) — then: *"It is a narrative
analysis-sandbox read, not an authoritative report or export. I cannot request a downloadable export
from this chat surface: no export tool is available."* **So the Reports tab's own copy points at a
tool `chatTurn_v17` does not carry — a web↔runtime contract gap.** **16A.6 = FAIL (no artifact, no
download).** 15.4's `-raw` manifest read is therefore unreachable; `report_artifacts` stays 0.

---

## Steps 17 / 18 / 19 — what was and was not done

**Step 17 (the mail remainder) — PARTIAL.** The signup-code arm was exercised twice: at FS-10 S21 a
six-digit code arrived at a **non-team private Gmail** (`zhantaolau54@gmail.com`) after the OTP-length
fix, and at FS-11 step 13 a six-digit code arrived at **`tools@belcort.com`, a TEAM address**, sent
18:56:25Z and verified 18:58:10Z. **Arrival time and the From header were asked and are NOT
recorded.** Whether 裁-146 point 3's "non-team address" condition is satisfied by the S21 Gmail code
is the **owner's call**, and it was recorded as owed rather than decided by the lead.

**Step 18 (the Supabase auth config) — READ IN FULL, TWO DECISIONS UNTAKEN.** Dry read 02:29 through
the Management API (`fs11-step18-otp-exp.mjs` without `--apply`), and the S22.2 read at 01:15 through
the same API: `mailer_otp_exp` **3600 already** (no PATCH needed — the receipt is the read) ·
`mailer_otp_length` **6** (fixed from **8** during FS-10 S21 — a live config defect found only by the
real walk; the mock e2e injects a fixed code) · `disable_signup` **false** · `mailer_autoconfirm`
false · `password_min_length` 12 · `uri_allow_list` exactly the two ruled entries after the owner
narrowed it at ≈01:18 (it had held FOUR) · `rate_limit_email_sent` **100/hour** — **裁-169's number 2,
now written down for the first time** · `rate_limit_otp` 30 · `rate_limit_verify` 30 ·
`rate_limit_token_refresh` 150 · `rate_limit_anonymous_users` 30 · `external_email_enabled` true ·
SMTP `smtp.resend.com`, user `resend`, sender `no-reply@mail.clarabook.com`, name Clara · the
confirmation template carries `{{ .Token }}` and **no link** (security line 8 ticked by API read) ·
the recovery template is a **LINK** (`{{ .ConfirmationURL }}`, no token). **Two values disagree with
the checklist and NO decision was taken on either: `jwt_exp` = 3600 where the checklist expects 900,
and `password_hibp_enabled` = false where the checklist says HIBP on.** Both are owner decisions and
both are carried into the handover.

**裁-169's number 1 — the Resend plan's cap — was NOT read.** Recorded as not measured.

**Step 19 (teardown) — 06:19, partial by design.** The FS-11 sleeper **`6834e7da567358` DESTROYED**
(it had already stopped: its 5,400 s clock ran out before the final census, so **that last census did
NOT run** — "dsn-pipe: stdin was empty" — and the readings above are the last ones taken).
`fly status -a clara-runtime`: machine **`48ee715b763048`** started, **2/2 checks passing**,
**VERSION 74** (the machine's config counter after the 裁-179 secret imports — **not** a new image;
image `deployment-01M1JSJW8SW0EZ1SP8ZR48B1WZ`, still the v71 build from `344f7ad8`). `/ready` at
22:19:30Z: **ready true**, db / world / control / taxonomy / relay ok, **`held_outbox` 6** (it was 0 at
02:39 — six held outbox rows accrued during the walk; **a reading for the handover, cause not
investigated**), `pending_intents` 0.

**FOREIGN MACHINE, named and not touched:** `clara-backup` also holds
`codex-e2e-rate-wall-sleeper` (`d895474fe0e138`, started, created 2026-09-03T22:14:02Z = 06:14 MYT,
256 MB) — **not minted by this session**; by its name and timing it is the owner's own Codex e2e
bridge. Left running for the owner to destroy.

*Lesson recorded twice tonight: spawn a bridge sleeper with a sleep that outlasts the ceremony (≥ 6 h),
and read "dsn-pipe: stdin was empty" as "the sleeper died", never as a DSN problem.*

---

## 裁-172 · the DR STRICT `4.9` replacement subject

`4.9`'s subject (the parked S4-V2 canary's clara-side rows) died at step 4 by ruling 裁-160. The
post-reset estate offers real candidates — the `clientOnboarding_v4` run created 19:25:15.760Z and
completed 19:48:38.5Z, the `witnessFacts_v3` run completed 20:33:50Z, and the `autoDraft_v9` and
`chatTurn_v17` runs of the same night — each with both a `workflow.workflow_runs` row and a
clara-side projection. **But `packages/db/scripts/dr-verify-checks.mjs:398-399` and `:414-415`
HARD-CODE the canary's ids, so naming a replacement is a CODE change, not a documentation edit** —
which 裁-172 itself anticipated. **Recorded therefore as: `4.9` is UNPROVEN IN THE FIELD from
2026-09-04, with a Backlog row naming the file and the two line pairs, and the candidate subjects
named above.** Never a silent skip.

---

*Written at the final clock-out truing on 2026-09-04 from the lead's as-run notes. No secret, DSN,
password, `whsec_` value or PAT appears anywhere in this record; the two 裁-152 hashes are digests of
values this record does not carry.*
