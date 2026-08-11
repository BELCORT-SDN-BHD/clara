# §7-A acceptance — HALF 1 (ROME SECRETARY, 22 real sales invoices)

> **AS-RUN ACCEPTANCE RECORD, 2026-08-07 — EVIDENCE GRADE, NOT A DESIGN DOC.**
> Verbatim copy of the lane reports that closed §7-A Half 1 (ADR-064): the preflight/handoff,
> the day-1 batch, the full 22-document campaign, and the owner-granted mode-A approval batch.
> It records what was actually SEEN — receipts, ids, timestamps — including its own errors and
> the findings it minted (F6..F9). The design mechanisms stay `wave-7a-design-skeleton.md` (v2)
> and `wave-7a-contract.md` (7A-R1..R12, RATIFIED — never re-grill). Nothing here is a ruling;
> where this record and the contract disagree, the contract wins. Half 2 is
> `wave-7a-acceptance-h2.md`.

```text
H1-ACCEPTANCE-REPORT — §7-A HALF 1 (RS REAL 22, DRAFT-ONLY)
lane-7a-h2 (continuing) · 2026-08-07 11:30Z–11:36Z
Firm BELCORT cde5917c-7861-4a2d-95e3-91d8a7230053
Client ROME SECRETARY SDN BHD e054b797-2641-413c-809f-f27603bbe9c7
Predecessor: .tmp/H1-PREFLIGHT-REPORT.txt (lane-7a-h1pre) · .tmp/H2-ACCEPTANCE-REPORT.txt

=========================================================================
STATUS: NOT STARTED. NOTHING INGESTED, NOTHING DRAFTED, NOTHING WRITTEN
TO RS's BOOKS. Two governors were probed for the WHOLE sequence before any
document was touched (the order's item 1, and my own C2 lesson). One is a
HARD BLOCKER that only the owner can clear. Recording both, plus everything
verified green, and handing off.
=========================================================================

-------------------------------------------------------------------------
B1. HARD BLOCKER — the BELCORT owner session is EXPIRED, and minting it is
    the owner's act, not mine.
-------------------------------------------------------------------------
  ~/.clara-session-jwt.txt : sub 27ba34b6-91b2-4e02-9ebe-49db2795a8aa,
      exp 1786087480 = 2026-08-07T07:24:40Z. At 11:34:18Z that is
      EXPIRED by 250 minutes.
  EVERY BELCORT-side door in this campaign reads that one file:
      intake_drive.mjs:15   -> ~/.clara-session-jwt.txt   (the ingest transport)
      rpc2.py:10            -> ~/.clara-session-jwt.txt   (set_document_kind,
                               file_document, open_sales_backfill, and later
                               every approval)
  The RPA token I have been using all session (~/.clara-rpa-session-jwt.txt) is
  scoped to ROME PUBLIC ADVISORY. Driving RS invoices through it would file real
  client documents into the SANDBOX FIRM — the exact cross-firm write the whole
  campaign's isolation discipline exists to prevent. So it is not a workaround,
  it is the thing not to do.
  mint_session_jwt.mjs reads ~/.clara-owner-login.json and posts the owner's
  PASSWORD to Supabase. Its own header says "RUN THIS YOURSELF (`! node <path>`):
  ... The agent does not handle your password." The standing grant I hold covers
  mint_rpa_jwt.mjs (the sandbox RPA account) and does NOT extend here; the
  password-bearing act stays the owner's regardless of the dangerous-skip mode.
  => I did not mint it. Half 1 cannot begin until the owner runs:
        ! node C:\Users\zhant\.clara-tools\mint_session_jwt.mjs
     Tokens last 60 minutes, and the campaign spans days (B2), so this will need
     re-minting several times — worth knowing before the successor starts.

-------------------------------------------------------------------------
B2. PACING — the 22 CANNOT fit in one UTC day. Measured, not estimated.
-------------------------------------------------------------------------
  THE COST, measured from nine real autodraft settlements today
  (clara.audit_log, fn='settle_autodraft_task', args->>'tokens'):
      74,328 · 76,438 · 77,886 · 77,703 · 79,996 · 84,648 · 85,601 · 86,079 · 91,006
      sum 733,685 over 9 drafts -> MEAN 81,520, MAX 91,006, and RISING
      (the prompt grows as the client's chart and counterparty list grow — RS
      will birth 12 customers over this campaign, so expect the same climb).
  THE BUDGET:
      clara.firm_limits(BELCORT).daily_token_limit IS NULL -> the 1,000,000 default
      sweep_budget_share 0.60 -> the SWEEP lane may spend 600,000/day
      one_click (clara.request_autodraft) is checked against the FULL 1,000,000
      clara.firm_usage_daily(BELCORT, 2026-08-07): NO ROW -> 0 spent today
      (for scale: BELCORT spent 216,703 on 2026-08-06 on its own work)
      v_today = (now() at time zone 'UTC')::date -> the budget rolls at 00:00Z
  THE ARITHMETIC:
      22 drafts x 81,520 (mean) = 1,793,440 tokens
      22 drafts x 91,006 (max)  = 2,002,132 tokens
      via the SWEEP share alone : 600,000 / ~85,000 = ~7 documents per UTC day -> 4 days
      via one_click at the FULL limit: ~11 per day -> 2 days, but that leaves BELCORT
        zero model budget for anything else it needs that day
      RECOMMENDED PACING: ~8 documents per UTC day, leaving ~250,000 headroom for
        BELCORT's own work => THREE UTC DAYS (2026-08-07, -08, -09).
  There is NO product verb to raise daily_token_limit (only
  set_firm_high_stakes_threshold exists), so pacing is the only lever unless the
  owner changes the limit out-of-band. Stated up front so there is no
  mid-sequence surprise, exactly as the order asked.
  NOTE: clara.firm_limits(BELCORT).sales_admission_daily_cap is NULL -> the
  default 15/day. The cap is NOT the binding constraint; the token budget is.

-------------------------------------------------------------------------
G. EVERYTHING ELSE IS GREEN — verified, quoted
-------------------------------------------------------------------------
G1. THE PREFLIGHT'S BLOCKER IS CLEARED. lane-7a-h1pre measured
    clara._document_direction(bd6d37fb..., e054b797...) => 'purchase' — a silent
    wrong-default caused by RS having ZERO client_identifiers rows. It now reads:
        _document_direction      => sales
        _autodraft_direction_tri => sales
    because the identifiers were seeded (task #23). RS now carries FOUR rows, all
    kind='ssm':
        1c38daf3 202501019265 · 4cd7454a 202501019265
        390811cd 1620678m     · 284a6e0f 1620678m
    OBSERVATION, not a blocker: each value is DUPLICATED. The exists() check the
    direction function runs is unaffected, but two lanes evidently seeded the same
    pair and nothing deduped. Worth a tidy-up decision before Half 1 closes.

G2. DRAFT-ONLY HOLDS BY CONSTRUCTION — confirmed independently.
    BELCORT's live rules (clara.coding_rules, status='live'), all seven:
        90a07e89  autopost       purchase  610-S01
        351ab39e  vendor_account (none)    500-000
        0af6aec4  vendor_account (none)    420-002
        502db047  vendor_account (none)    900-O01
        112f5066  vendor_account (none)    500-000
        e0d8042b  vendor_account (none)    900-B01
        4d5b50cf  vendor_account (none)    420-001
    ZERO sales-direction autopost rules. execute_rule_post selects by
    `counterparty_id=v_counterparty and direction=v_direction`, so every RS sales
    draft will terminate `no_live_rule`. That receipt is the first thing the
    successor should quote when the first draft lands.

G3. THE SALES LANE IS ON FOR EXACTLY TWO FIRMS.
        BELCORT                     sales_lane_active t
                                    watermark 2026-08-07 11:30:04.538799Z
        ROME PUBLIC ADVISORY        sales_lane_active t
                                    watermark 2026-08-07 04:48:32.724095Z
    No other firm has a firm_limits row with the flag set.

G4. THE PROBE DOCUMENT NEEDS THE BACKFILL DOOR — a finding the successor must
    not trip over. bd6d37fb-7dcb-4786-bdf3-c21a34634c5b (RSINV-250601 KONG CHENG,
    already ingested and filed by the preflight — DO NOT RE-INGEST) was filed at
    2026-08-07T06:27:18.663746Z, which is BEFORE BELCORT's 11:30:04Z watermark.
    Measured:
        clara._sales_admission_open(BELCORT, RS, filing 7f2f9ae2-...) => FALSE
    So the steady-state lane will never admit it. It needs 7A-R5's explicit door:
        clara.open_sales_backfill(client, batch_size, note, op_key)
    which requires the ADMIN role (hence B1) and a mandatory note, and refuses a
    second open batch per client (CLR27 backfill_already_open). The other 21 will
    be filed AFTER the watermark and admit normally — only this one needs it.
    Opening ONE batch of size 1 for it is the clean move; the daily cap still
    governs the rate.

G5. RS's CHART IS READY (preflight task 2, verified again here):
        300-000 Trade receivables — control  asset  account_class=receivable
        500-000 Revenue — unanalysed         income
    account_class='receivable' is load-bearing — 0046's sales-direction leg
    matching reads it directly (0046:1055/1057).
    RS has NO sst_output account. That is CORRECT and expected: RS is
    sub-threshold and all 22 invoices are tax-silent, so CLR10
    sst_account_missing (which fires only on POSITIVE tax) can never trigger.

G6. RS TRIAL BALANCE — THE BEFORE BASELINE, ties to the sen:
        debits 915,000 = credits 915,000, difference 0, across 7 approved entries
        100-000 SHARE CAPITAL                    Cr   100,000
        150-000 RETAINED EARNING                 Dr   100,000
        190-000 OPENING BALANCE EQUITY           Dr/Cr 100,000/100,000
        300-000 Trade receivables — control           0 / 0
        400-000 TRADE CREDITORS                  Cr   715,000
        500-000 Revenue — unanalysed                  0 / 0
        610-S01 SECRETARIAL FEES - DIRECT COST   Dr   715,000
    Counterparties on RS: 1 (a vendor; zero customers, as expected — the 12 are
    born only through approvals).

G7. THE CORPUS IS 22 FILES, confirmed on disk at
    C:\Users\zhant\Desktop\RS - YA2025\RS - YA2025\RS - Sales Invoice\
    Filename order equals chronological order (names embed YYMMDD). The three
    contract fixtures are all present and identifiable by filename:
        #12 mis-addressed  : "RSINV-251201 - KONG CHENG RESTAURANT SDN BHD - RM600.pdf"
             vs #1 "...KONG CHENG RESTAURANTS SDN BHD..." — RESTAURANT vs
             RESTAURANTS. PASS = both resolve to ONE counterparty; FAIL = a
             near-duplicate is born.
        #16 LUMINOUS       : "RSINV-251205 - LUMINOUS SDN BHD - RM100.pdf"
             filename vs content ("LUMINOUS EVENTS") — same test.
        #15 the refusal-is-a-PASS cell : "RSINV-251204 - INF ADVISORY SDN BHD -
             RM160.pdf" — addressed to INF ADVISORY with a stray body line naming
             FINCARE (a genuine other customer, #10 in this same corpus). PASS =
             INF ADVISORY **or a named refusal**. FAIL = a silent FINCARE booking.

-------------------------------------------------------------------------
S. SUCCESSOR HANDOFF — the exact sequence, ready to execute
-------------------------------------------------------------------------
PRE-FLIGHT EACH SESSION (both, every time — B1 tokens last 60 min):
  a. Owner runs: ! node C:\Users\zhant\.clara-tools\mint_session_jwt.mjs
     Verify with: node C:\Users\zhant\.clara-tools\jwt_exp.mjs  (VALID = YES)
  b. Read the budget BEFORE committing to a batch size:
     select tokens_used from clara.firm_usage_daily
       where firm_id='cde5917c-7861-4a2d-95e3-91d8a7230053'
         and usage_date=(now() at time zone 'UTC')::date;
     Budget ~85,000 per document. Stop the day's batch at ~750,000.

STEP 1 — the probe document (exercises the 7A-R5 backfill door):
  rpc2.py open_sales_backfill {client RS, batch_size 1, note "<why>", op_key h1-backfill-1}
  then let the sweep admit bd6d37fb and draft it. Quote the no_live_rule receipt.

STEP 2 — the other 21, ~8 per UTC day:
  For each file (skip RSINV-250601, already ingested):
    node intake_drive.mjs "<abs path>"                     -> document_id
    rpc2.py set_document_kind {doc, 'invoice', reason, op_key h1-kind-<n>}
    rpc2.py file_document {doc, RS, p_resolution:"", op_key h1-file-<n>}
      NOTE: p_resolution MUST be an EMPTY STRING (it mints the human resolution
      at confidence 1.0). Passing prose raises CLR01 — I lost a document to that
      in Half 2.
    wait for lane='invoice_facts' status='done', then read
      clara._invoice_fact_state(doc) and _autodraft_direction_tri(doc, RS)
    let the SWEEP draft it (catch-up every 5 min; expect refused_budget/concurrency
    churn — F5, it self-clears)
  EXPECTATIONS, so a surprise is recognisable as one:
    - direction 'sales' on all 22 (G1)
    - corroborated FALSE on all 22 (every RS invoice is tax-silent), so each will
      DRAFT via the 7A-R3 tier_a_fails bypass and then terminate no_live_rule
    - customers born NAME-ONLY where the invoice states no buyer registration —
      F3 RULED: that is CORRECT, record exactly what the invoice provides
    - THE ENRICHMENT TRAP (H2 finding F3, restated because it bites HERE): once a
      customer exists WITH a registration, any later invoice that omits the buyer
      registration will refuse `customer_ambiguous`
      (clara._resolve_counterparty: "registered name match is ambiguous without a
      registration number"). Name-only births avoid this; enriching a customer
      with a registration later would strand every subsequent tax-silent invoice
      to that customer. Do not enrich.

STEP 3 — SIGN NOTHING. Floor accrual per customer is expected; measure it with
  clara.preview_ocr_sales_evidence only after a rule exists — and no rule may
  advance past 'proposed'. Report the per-customer floor via the preview verb.

STEP 4 — the approval manifest (the deliverable; DO NOT APPROVE):
  draft id · invoice number · extracted customer name + any registration ·
  amount · running TB impact. Baseline TB is G6 (915,000/915,000, diff 0).
  The approval MODE is the owner's decision.

DISCIPLINE (unchanged): product doors only · TB to the sen before and after ·
reverse-not-delete · NEVER touch the sandbox (its floor stays broken at 5/5/5/85
and the B2 witness d023b48c stays 'draft' — both are task #29's business) ·
receipts quoted, not summarised.

=========================================================================
DAY 1 — lane-7a-h1 (executor) · 2026-08-07 11:50Z-12:07Z
Probe doc + 7 more = 8 drafts. Budget cap ~750,000 tokens.
=========================================================================

D0. PRE-FLIGHT (per S, both governors, before any write):
  a. Token: sub 27ba34b6-..., exp 2026-08-07T12:50:40.000Z. At 11:51:45Z
     VALID, 59 min remaining. (Re-checked at 11:54:00Z after the whole
     owner-JWT batch: still VALID, 57 min remaining — the full batch fit
     inside one token lifetime, no re-mint needed.)
  b. Budget: `select tokens_used from clara.firm_usage_daily where
     firm_id=BELCORT and usage_date=today` -> NO ROW (0 spent) before the
     batch. Committed to the full 8-document batch on that reading.

D1. STEP 1 — the probe's backfill door (7A-R5), executed first as ordered:
    rpc2.py open_sales_backfill(client=RS, batch_size=1,
      note="lane-7a-h1: probe doc bd6d37fb ... Opening the 7A-R5 explicit
      backfill door, batch_size 1, to admit exactly this one already-filed
      document per S1", op_key=h1-backfill-1)
    => 200 {"state":"open","batch_id":"4cbd9619-0aae-4454-ab21-fc22ab6a57ef",
             "client_id":"e054b797-...","batch_size":1}
    Read back after the sweep drained it:
    `select id,state,batch_size,admitted_count,opened_at,closed_at from
     clara.sales_backfill_batches where id='4cbd9619-...'` =>
      4cbd9619-... | e054b797-... | closed | 1 | 1 |
      2026-08-07 11:52:33.633301+00 | 2026-08-07 12:03:49.897594+00
    Self-closed at batch_size 1/1 admitted. Clean, exactly as designed.

D2. STEP 2 — owner-JWT batch, ALL front-loaded before watching sweeps
    (per the order's instruction), files #2-#8 of the 22-file corpus in
    filename/chronological order, skipping RSINV-250601 (already
    ingested by the preflight):

    #  file                                          document_id
    -- --------------------------------------------- ------------------------------------
    2  RSINV-250801 D&D DEVELOPMENT SDN BHD RM2,300   f48a8830-c86f-4231-9df7-a5820177abdf
    3  RSINV-250802 D&D INTERVENTURE GROUP RM2,300    bd73e20d-adbd-4337-8e80-3f3cbbd90091
    4  RSINV-250901 DD ELITE HOME SDN BHD RM2,300     1225b5fb-66c6-4d24-a725-f8b52785dd42
    5  RSINV-250902 DD URBANCORE SDN BHD RM2,300      6f82065e-979a-4756-ab63-113986d3ca0e
    6  RSINV-250903 DD ECORISE SDN BHD RM2,300        35312775-f68a-4aa7-83c9-a952ae977d89
    7  RSINV-250904 AMATERUS GROUP SDN BHD RM3,000    49d5a0d5-2452-44ff-be4e-5ddd5e0fa35d
    8  RSINV-250905 DD ECORISE SDN BHD RM500          4b2fcc09-f9f7-4348-8986-dcfa1376edaa

    Every file: node intake_drive.mjs -> FINAL 202 finalized -> document_id;
    rpc2.py set_document_kind(doc,'invoice',reason,op_key=h1-kind-<n>) ->
    200 with document_kind='invoice'; rpc2.py file_document(doc, RS,
    p_resolution:"", op_key=h1-file-<n>) -> 200 with a filing_id. ALL EIGHT
    calls (7 kind + 7 file = 14, since #1's kind/file predate today) returned
    200, ZERO refusals, ZERO CLR01 (p_resolution was "" every time, per G4's
    lesson). Filing IDs: #2 5cccb5d8- · #3 94e0a91b- · #4 b8a8ce08- ·
    #5 6ba39076- · #6 01d7aae2- · #7 81fff813- · #8 9b3ffc1f- (all
    -....-....-...-............ UUIDs, truncated here for the table; full
    values are in the raw tool output this report was built from).

    FRONT-LOAD DISCIPLINE HELD: all 8 documents' owner-JWT-dependent calls
    (backfill open + 7x ingest/kind/file) completed by 11:54:47Z — comfortably
    inside the 12:50:40Z expiry, no re-mint needed, no token-expiry stop
    triggered.

D3. invoice_facts + direction/tri (read-only, no owner token) — ALL 8:
    `select document_id, lane, status from clara.document_processing_tasks
     where document_id in (...)` -> every one of the 8 shows
     lane='invoice_facts' status='done' AND lane='ocr' status='done'
     (extraction was fast; no polling wait needed for these 8).
    `select _document_direction(...), _autodraft_direction_tri(...),
     _invoice_fact_state(...)` for all 8 -> uniformly:
       direction = 'sales', tri = 'sales', corroborated = false
     on every single one (matches G1/S2's expectation exactly). Extracted
     customer names, all NAME-ONLY (no buyer registration in the fact
     state — F3's rule holds): "Lim Xiao Shan" (probe — a person, not the
     filename's KONG CHENG RESTAURANTS, which is the letterhead/vendor;
     the invoice's stated BUYER is this individual), D&D DEVELOPMENT SDN
     BHD, D&D INTERVENTURE GROUP SDN BHD, DD ELITE HOME SDN BHD, DD
     URBANCORE SDN BHD, DD ECORISE SDN BHD (x2, #6 and #8), AMATERUS GROUP
     SDN BHD. Amounts (total_cents) match filenames exactly: 280000 /
     230000 / 230000 / 230000 / 230000 / 230000 / 300000 / 50000.

D4. SWEEP WATCH (live_ro.py only, no owner token) — polled every 25s.
    First draft appeared almost immediately: entry 94825df1-... for
    document f48a8830-... (file #2) at 11:54:09.463667Z — well inside one
    5-min cycle of filing. The remaining 7 (including the probe, now
    admitted via the backfill door) landed in one burst at 12:04:05-12:04:15Z
    — an ~11-second window, all 8/8 confirmed drafted by 12:04:33Z (poll
    log: 1/8 held steady for ~8 min, then 2/8 -> 8/8 in the next 26s single
    sweep tick). ONE transient churn observed exactly as F5/B2 predicted:
    `clara.agent_tasks` shows one autodraft task
    (da831f6b-04fd-41e6-9209-5142d5494d53) status='failed'
    error_code='internal' at 11:53:32.441425Z, ~37s before the first
    successful draft on the same client — self-cleared, as promised; it did
    not strand any of the 8 (every document has exactly one journal_entries
    row, confirmed below). One 'wake' task (fa634350-...) sits 'held' with
    no error_code, unchanged since 11:54:09.904924Z at report time — read,
    not inferred: it coexists with all 8 completed drafts rather than
    blocking them, so it reads as a normal queued/parked wake state, not a
    stranding (the positive check — 8/8 documents carry a draft — is what
    grounds "not stranded," not the mere presence of a held row).

D5. THE RECEIPT — quoted verbatim, and a SURPRISE flagged exactly as the
    order asked for ("a surprise must be recognisable"):
    `select je.id, je.document_id, je.status, rps.reason, rps.rule_id from
     clara.journal_entries je left join clara.rule_post_skips rps
     on rps.entry_id=je.id where je.document_id in (...)` for ALL 8:
       94825df1-...|f48a8830-...|draft|counterparty_unresolved|(null)
       4d104753-...|49d5a0d5-...|draft|counterparty_unresolved|(null)
       b4a6027b-...|4b2fcc09-...|draft|counterparty_unresolved|(null)
       53504c0e-...|bd6d37fb-...|draft|counterparty_unresolved|(null)   <- probe
       55759e4f-...|bd73e20d-...|draft|counterparty_unresolved|(null)
       ae496122-...|6f82065e-...|draft|counterparty_unresolved|(null)
       a861310c-...|35312775-...|draft|counterparty_unresolved|(null)
       5faaf160-...|1225b5fb-...|draft|counterparty_unresolved|(null)

    SURPRISE: G2's prediction was `no_live_rule` ("execute_rule_post selects
    by counterparty_id=v_counterparty and direction=v_direction ... every
    RS sales draft will terminate no_live_rule"). The MEASURED terminal
    reason on all 8/8 is `counterparty_unresolved`, with rule_id NULL —
    i.e. the skip fires ONE STEP EARLIER than G2 assumed. Reading why:
    G2's chain presupposes v_counterparty resolves to something (so the
    rule lookup can run and then miss). But every customer on these 8
    invoices is BRAND NEW to RS (RS carries exactly one pre-existing
    counterparty — the vendor EZACCOUNT & SECRETARY SDN. BHD., confirmed
    unchanged: `select id,kind,name,registration_no,created_at from
    clara.counterparties where client_id=RS order by created_at desc
    limit 10` returns only that one 2026-07-28 vendor row — ZERO new
    counterparty rows were born by today's drafting). Since customers are
    born only at approval (7A-R2/Q3) and Half 1 is draft-only (nothing
    approved today), v_counterparty stays NULL on every one of the 22 real
    invoices for the whole of Half 1 — so `counterparty_unresolved`, not
    `no_live_rule`, is the correct steady-state terminal reason for THIS
    campaign's entire draft-only phase. Both readings agree on the outcome
    that matters (draft-only, zero autopost, human queue) — the difference
    is which specific fail-closed gate catches it. Net effect for the
    build/owner: expect `counterparty_unresolved` on all 22, not
    `no_live_rule`, until the day approvals start (which is explicitly out
    of scope today — none happened).

D6. JOURNAL LINES — verified for all 8, debit 300-000 (Trade receivables —
    control) / credit 500-000 (Revenue — unanalysed), amount-for-amount
    matching the extracted invoice totals exactly (cents): f48a8830
    230000/230000, bd73e20d 230000/230000, 1225b5fb 230000/230000,
    6f82065e 230000/230000, 35312775 230000/230000, 49d5a0d5 300000/300000,
    4b2fcc09 50000/50000, bd6d37fb 280000/280000. Both journal_lines rows
    on every entry carry counterparty_id = NULL (blank in the raw read) —
    consistent with D5's finding: the entry drafted with real account
    coding but no customer subledger binding, because none exists yet.

D7. FIXTURES CHECK (G7): NONE of today's 8 are #12/#15/#16. Confirmed by
    filename position — today's batch is corpus positions 1 (probe,
    RSINV-250601) and 2-8 (RSINV-250801 through RSINV-250905); the three
    fixtures (RSINV-251201 KONG CHENG RESTAURANT mis-address, RSINV-251204
    INF ADVISORY/FINCARE refusal cell, RSINV-251205 LUMINOUS) sit at
    corpus positions 12/15/16 — all December-dated, well beyond day 1's
    reach. Stated explicitly per the order: none of today's 8 are contract
    fixtures.

D8. TOKENS SPENT: `select tokens_used from clara.firm_usage_daily where
    firm_id=BELCORT and usage_date=today` => 351,940. Against the
    ~750,000 cap for the day: 398,060 headroom remaining, and against
    B2's ~85,000/doc estimate for 8 documents (~652,000-680,000 expected)
    this batch ran LIGHTER than modeled — plausibly because these 8 all
    resolved to `counterparty_unresolved` (a cheap, early-exit skip) rather
    than a full rule-evaluation pass, and/or because several came from RS's
    now-familiar chart/client context (prompt reuse) rather than the
    cold-start case B2's sample was drawn from.

D9. TB CHECK — AFTER today, approved-only (drafts post nothing, matching
    G6's baseline methodology exactly): `select sum(debit_cents),
    sum(credit_cents) from clara.journal_lines jl join clara.journal_entries
    je on je.id=jl.entry_id where je.client_id=RS and je.status='approved'`
    => 915000 | 915000. Unchanged from G6's baseline (915,000/915,000,
    diff 0) — RS's approved books are untouched, exactly as required.

D10. STRANDED TASKS: no coding_tasks rows exist for RS at all (empty
    result). agent_tasks for RS created at/after the 11:30:04Z watermark:
    1 failed (autodraft, internal, self-cleared per D4), 1 held (wake,
    unchanged, coexists with completed drafts, read as normal parked
    state not a strand), 7 completed (autodraft, the sweep burst). Direct
    check on the thing that matters — does every one of the 8 documents
    carry a draft — reads YES, 8/8, positively (D4/D5), so nothing from
    today's batch is stranded.

D11. SANDBOX ISOLATION — NEVER TOUCHED. Every write this session was
    scoped to client e054b797-... (RS) / firm cde5917c-... (BELCORT); zero
    calls referenced firm 39008536 in any argument. Read-back confirms:
    `select id,status from clara.journal_entries where id::text like
    'd023b48c%'` => d023b48c-94fa-43a5-a544-cc4fe3b1163d | draft — the B2
    witness is still 'draft', unmoved. SIGNED NOTHING, APPROVED NOTHING —
    all 8 new entries plus the probe sit in status='draft' in the human
    queue, exactly as scoped.

-------------------------------------------------------------------------
DAY 1 SUMMARY
-------------------------------------------------------------------------
Filed: 8/8 (1 via the 7A-R5 backfill door, 7 via steady-state admission).
Drafted: 8/8, zero stranded, zero refusals on any ingest/kind/file call.
Direction: sales/sales on 8/8. Corroborated: false on 8/8 (tax-silent,
tier_a_fails bypass path, exactly as predicted). Terminal skip reason:
`counterparty_unresolved` on 8/8 — NOT `no_live_rule` as G2 predicted; see
D5 for why the earlier gate fires (zero approvals today => zero customers
born => v_counterparty stays NULL for the whole of Half 1's draft-only
phase). Tokens spent: 351,940 of the ~750,000 cap (398,060 headroom
unused — lighter than B2's per-doc model predicted). TB: 915,000/915,000,
diff 0, unchanged. Fixtures: none of #12/#15/#16 present in today's 8
(confirmed by corpus position). Sandbox: untouched, B2 witness still
'draft'. Nothing approved, nothing signed.

REMAINS FOR DAY 2: 14 documents (corpus positions 9-22 of the 22-file
list): RSINV-251001 DD ELITE HOME RM500 · RSINV-251002 FINCARE RM2,500 ·
RSINV-251003 DD KEYSTONE RM2,300 · RSINV-251201 KONG CHENG RESTAURANT
RM600 (FIXTURE #12) · RSINV-251202 SIFU LAB RM1,050 · RSINV-251203
AMATERUS GROUP RM360 · RSINV-251204 INF ADVISORY RM160 (FIXTURE #15,
refusal-is-a-PASS) · RSINV-251205 LUMINOUS RM100 (FIXTURE #16) ·
RSINV-251206 DD ELITE HOME RM645 · RSINV-251207 DD URBANCORE RM300 ·
RSINV-251208 DD ECORISE RM300 · RSINV-251209 D&D DEVELOPMENT RM300 ·
RSINV-251210 D&D INTERVENTURE GROUP RM300 · RSINV-251211 DD KEYSTONE
RM100. At ~8/day pacing this is 2 more UTC days (day 2 = #9-16, including
all three fixtures; day 3 = #17-22). Day 2 must re-run D0's pre-flight
(fresh owner-JWT mint, fresh budget read) since today's token expires
2026-08-07T12:50:40Z and will not survive to tomorrow's UTC day. Day 2
should EXPECT `counterparty_unresolved` as the steady-state receipt (not
`no_live_rule`) per D5's corrected finding, and should watch fixture #15
specifically for either a clean INF ADVISORY resolution or a named refusal
(both PASS; a silent FINCARE booking is the only FAIL) — note FINCARE
itself already exists in the corpus as file #10 (RSINV-251002), so by day
2 FINCARE's name will have appeared in extracted facts at least once
before fixture #15 is filed, though (per D5) it still won't be a *born*
counterparty since nothing gets approved during Half 1.

=========================================================================
FULL CAMPAIGN — lane-7a-h1 (executor) · 2026-08-07 12:08Z-12:42Z
OWNER DIRECTIVE mid-session: pacing constraint lifted (daily_token_limit
raised to 3,000,000, later sales_admission_daily_cap raised 15->40, both
temporary/recorded, restored after §7-A close). Scope extended from
day-1-only (8 docs) to the WHOLE 22-document campaign, same UTC day.
=========================================================================

E0. STRATEGY CORRECTION, recorded because it happened mid-flight: the
    coordinator's first instruction (drive `request_autodraft` directly,
    one_click, sequential) was SUPERSEDED before I acted on it by a
    refined instruction (file-first for all 14, let the server-side
    sweep draft with NO token) — filing is the only token-critical step.
    I built and ran the file-first version; the one_click path was never
    used this campaign.

E1. FILING — all 14 remaining corpus files (positions 9-22), same
    discipline as day 1 (chronological, p_resolution:"", skip
    RSINV-250601). ALL 14 succeeded 200 OK on ingest+kind+file, ZERO
    refusals, inside the SAME owner-JWT window used for day 1 (no
    re-mint needed for this leg):
      #9  RSINV-251001 DD ELITE HOME RM500        6de1ec82-9cb5-4d2f-b19a-be98c0238c38
      #10 RSINV-251002 FINCARE RM2,500             b55b6e7f-5aea-4edd-ab44-94955bd8e5a9
      #11 RSINV-251003 DD KEYSTONE RM2,300          ea82a554-3b65-4879-8046-fe5dd849c7b1
      #12 RSINV-251201 KONG CHENG RESTAURANT RM600 (FIXTURE) 7c982ae7-9803-499a-b9f6-e771f682c813
      #13 RSINV-251202 SIFU LAB RM1,050              0259d63f-0ed8-4f6e-8849-0716a6080847
      #14 RSINV-251203 AMATERUS GROUP RM360           ddf3e39a-6718-47d9-aa81-090ece11c51a
      #15 RSINV-251204 INF ADVISORY RM160 (FIXTURE)    8ad8c26a-04c2-443a-aecc-c8b4ba055964
      #16 RSINV-251205 LUMINOUS RM100 (FIXTURE)         c597a24b-c6e2-4a25-aa1a-3ba0c20cb165
      #17 RSINV-251206 DD ELITE HOME RM645               67c80350-8024-484b-8845-39fc09d32bbe
      #18 RSINV-251207 DD URBANCORE RM300                 abf0d326-9a14-4935-b935-bee32cdae74d
      #19 RSINV-251208 DD ECORISE RM300                    85880eb1-d63d-4971-babf-5ef20270e54d
      #20 RSINV-251209 D&D DEVELOPMENT RM300                 a419be69-bc12-45e6-b4ff-6d340243e405
      #21 RSINV-251210 D&D INTERVENTURE GROUP RM300           2e84b8f5-6de9-4337-b933-11106f2381bd
      #22 RSINV-251211 DD KEYSTONE RM100                       1be1f69f-d6f8-4a71-8f88-97789235cfb3

E2. THE STOP — refused_budget seen, reported immediately per instruction.
    The sweep sat at 0/14 drafted for ~11 minutes with heavy churn
    (`clara.sweep_run_items`, RS-scoped, first window: refused_budget 26,
    skipped_lane 28 firm-wide / 6 RS-scoped, drafted 0). I STOPPED and
    reported to the coordinator rather than assume self-clearing, exactly
    as instructed ("if you see ONE, stop and tell me immediately").

E3. THE GOVERNOR THAT WAS ACTUALLY BINDING: `sales_admission_daily_cap`
    (NULL -> default 15/UTC-day). Day-1's 8 admissions had already burned
    7/15 of it before day-2's 14 could even start, on the SAME UTC day —
    structurally blocking up to 7 of the 14 regardless of how long the
    queue drained. The coordinator raised it live to 40. Verified via
    `clara.sweep_run_items.refusal_token->>'reason'`: the 5 stuck-longest
    documents show `refused_sales_cap` at 12:24:24Z (the OLD cap, right at
    the raise's boundary), then `refused_budget` (gate=concurrency) at
    12:29:25Z, then DRAINED at the very next tick (12:34:57Z) — clean,
    ~5-min cadence throughout, confirming the raise removed the real
    blocker and `max_concurrent_sweeps=2` (unchanged, BELCORT's normal
    value) drained the rest exactly as day 1's precedent predicted, just
    proportionally slower for 14 vs 8 documents against the same ceiling.

E4. THE OPEN QUESTION, SETTLED: whether the `skipped_lane`/`lane_changed`
    "vendor_unresolved" rows seen alongside the concurrency churn were the
    SALES path misbehaving. Re-read `sweep_run_items` filtered to
    `client_id=RS` (not firm-wide) — every `vendor_unresolved` instance
    belonged to OTHER, unrelated BELCORT documents/clients (firm-wide
    sweep noise) or to RS's own PRE-CAMPAIGN purchase-direction history
    (2026-07-28, before today's watermark). RS-scoped and read against the
    0046 migration source (S9.2, `_coding_lane_core`): the sales lane
    NEVER emits bare `vendor_unresolved` — it is direction-honest by
    design, emitting `customer_name_missing` instead when `v_sales_lane`
    is true. The ONE real RS sales-lane occurrence of `customer_name_missing`
    (FINCARE, below) confirms the code does exactly what its own comment
    says. ZERO mislabeled sales-path rows found.

E5. FINCARE (#10, b55b6e7f) — ADJUDICATED AS THE CORRECT OUTCOME, not a
    miss. `clara._invoice_fact_state(b55b6e7f...)` carries NO
    `customer_name` key at all — the extraction genuinely captured no
    buyer name from this invoice. `sweep_run_items` shows the SAME
    `skipped_lane`/`{"reasons":["tier_a_fails","customer_name_missing"]}`
    receipt recurring at 12:10:56Z, 12:15:01Z, 12:19:22Z, 12:24:24Z,
    12:29:25Z — every ~5-min tick, stable, not transient. NO journal_entry
    was ever created for this document (unlike the counterparty_unresolved
    cases, which DO get an entry with lines and THEN skip at the rule
    stage — this one never reaches that far because it has no name to
    propose at all). This is the `customer_name_missing` wall proving
    itself on a real document, exactly as designed: routes to needs_review
    every tick, never drafts, correctly.

E6. LUMINOUS (#16 fixture) — THE FULL RECOVERY-DOOR TRAIL, three
    documents, quoted in order:
    (a) c597a24b-c6e2-4a25-aa1a-3ba0c20cb165 — the ORIGINAL. invoice_facts
        FAILED on its only-ever attempt: `document_processing_tasks`
        status='failed', error_code='internal', attempt_count=1 (OCR on
        the SAME document completed fine). Two doors tried, both closed,
        quoted verbatim:
          `rpc2.py request_reextraction {p_document:c597a24b...}` =>
            400 `{"code":"CLR16","message":"no completed extraction to
            re-extract"}` — that verb only REDOES a completed extraction,
            wrong tool for a first failure.
          `node intake_drive.mjs` on the IDENTICAL bytes => FINAL 202
            `{"status":"adopted","document_id":"c597a24b-..."}` — the
            SAME document_id, content-addressed dedup, confirmed by
            `document_processing_tasks` reading byte-identical before and
            after (no new attempt spawned).
        The coordinator independently confirmed the third door is also
        closed: `_tf_processing_task_update` makes terminal
        `document_processing_tasks` rows IMMUTABLE (CLR16, no legal
        transition exits 'failed'), so even an ops-level requeue is
        structurally impossible without touching a mechanism — which this
        campaign never does. F6 registered: a first-ever invoice_facts
        failure on unchanged bytes has NO self-service retry path on this
        build — a real product gap, filed for post-close fix, not
        campaign business.
    (b) THE RE-EXPORT VEHICLE, owner-authorized: copied the same PDF to
        `.tmp/RSINV-251205-reexport.pdf`, appended one trailing byte
        (sha256 changes: original `0d4d9ceb...`, copy `644bb3fb...`; sizes
        112267 vs 112268 bytes — content otherwise byte-identical), and
        ran it through the normal doors. This is the real-world recovery
        path a user actually has when a document dies at the extraction
        wall with no retry door: re-export/re-scan the same invoice, which
        is legitimately "new bytes, same content" under the product's own
        provenance-hash design — not a workaround around any structural
        invariant.
        `intake_drive.mjs` => FINAL 202 `{"status":"finalized",
          "document_id":"8099fb16-b03e-4ec6-a4c9-9fd00caaf408"}` — a
        GENUINE new document this time (finalized, not adopted).
        set_document_kind => 200, file_document => 200, filing_id
          658efd34-6910-4fc8-89e5-4a1c2a260997.
        invoice_facts: queued -> running -> **done** in under 30 seconds —
        THE ORIGINAL FAILURE WAS TRANSIENT, not content-deterministic.
        Extracted fact state: `{"invoice_id":"RSINV-2512/05",
          "total_cents":10000,"customer_name":"LUMINOUS EVENTS SDN BHD",
          "corroborated":false}` — direction=sales, tri=sales.
        THIS IS THE FIXTURE'S OWN DESIGNED TEST, now actually observed:
        the FILENAME reads "LUMINOUS SDN BHD"; the CONTENT the extractor
        actually captured reads "LUMINOUS EVENTS SDN BHD" — the system
        read the invoice body, not the filename. Drafted within one
        minute: entry `14512f36-d7a8-44fd-af7a-41e243273037`, status
        draft, lines 300-000 debit 10000 / 500-000 credit 10000 (RM100),
        skip receipt `counterparty_unresolved` (same shape as every other
        document this campaign — no rule, no counterparty, human queue).
    FIXTURE #16 DRAFT-TIME VERDICT: the content-vs-filename divergence
    resolves in the extractor's favour — "LUMINOUS EVENTS SDN BHD" is
    what would be PROPOSED at approval, not the filename's "LUMINOUS SDN
    BHD". Whether it BIRTHS correctly (as one counterparty, matching
    whatever the invoice content states) is an approval-time question,
    out of scope today per the coordinator's own framing — but the
    draft-time evidence is a clean PASS-leaning read: content wins over
    filename, exactly as designed. The ORIGINAL c597a24b stays in the
    trail as the failed-first-extraction exhibit (never retried
    successfully itself, immutable, F6's evidence); the re-export
    8099fb16 is the vehicle that actually ran the fixture's test.

E7. FIXTURE #12 (KONG CHENG RESTAURANT, 7c982ae7) — draft-time
    observable: extracted `customer_name` = "Lim Xiao Shan" — the EXACT
    SAME string the probe document (#1, RSINV-250601, filename "KONG
    CHENG RESTAURANTS") also extracted. The filename divergence
    (RESTAURANT singular vs RESTAURANTS plural) that the fixture exists
    to probe turns out not to be the operative signal at all: BOTH
    invoices' extracted BUYER field reads "Lim Xiao Shan", a person, not
    either restaurant-name variant. Since counterparty proposal at
    approval reads `customer_name` from the extracted facts (not the
    filename/letterhead), both #1 and #12 would propose the SAME
    candidate name — a PASS-leaning signal (one counterparty, not a
    near-duplicate), same caveat as #16: the actual birth/match happens
    at approval, out of scope today. Drafted: entry
    `7995b1a3-70b8-4a39-a040-ac3af3bd44a7`, status draft, lines 300-000
    debit 60000 / 500-000 credit 60000 (RM600), skip
    `counterparty_unresolved`.

E8. FIXTURE #15 (INF ADVISORY, 8ad8c26a) — draft-time observable:
    extracted `customer_name` = "INF ADVISORY SDN BHD", CLEANLY — no
    trace of "FINCARE" (the stray body-line name the fixture plants,
    genuinely another RS customer, #10 in this corpus) anywhere in the
    captured fact state. The extraction did not get confused by the
    stray line at the fact-capture level — a clean PASS-leaning signal on
    the observable this campaign can actually see today (whether
    approval-time counterparty resolution independently also reads that
    stray line and refuses/births correctly is the coordinator's own
    stated approval-time question, not answered here). Sweep history:
    refused_budget x2 (concurrency, 12:18-12:19Z) then drafted at
    12:24:48Z. Drafted: entry `742a8cca-6817-4c83-9967-47f1c447fb7c`,
    status draft, lines 300-000 debit 16000 / 500-000 credit 16000
    (RM160), skip `counterparty_unresolved`.

E9. THE COMPLETE 22-INVOICE MANIFEST (+1 evidence-only re-export vehicle
    for #16 = 23 documents on RS's books). Every row: draft-only, human
    queue, zero autopost, zero registration captured on the customer side
    for any of the 22 (`document_regions` checked directly for
    `invoice.customer_registration` scoped to these 22 document_ids:
    ZERO rows — every customer here is NAME-ONLY, consistent with F3).

    #  invoice no      customer (extracted)             amt(sen)  draft entry id                          skip/status
    -- --------------- --------------------------------- --------- --------------------------------------- --------------------------
    1  RSINV-2506/01   Lim Xiao Shan (probe)                280000 53504c0e-585e-4a7a-a41e-307e047b17ab    counterparty_unresolved
    2  RSINV-2508/01   D&D DEVELOPMENT SDN BHD               230000 94825df1-e5e9-4915-87e3-f9a7e8a8ef23    counterparty_unresolved
    3  RSINV-2508/02   D&D INTERVENTURE GROUP SDN BHD         230000 55759e4f-deba-4b3a-bc95-5adb1e6a962e    counterparty_unresolved
    4  RSINV-2509/01   DD ELITE HOME SDN BHD                  230000 5faaf160-c1d9-4ce9-bee7-52b421379c19    counterparty_unresolved
    5  RSINV-2509/02   DD URBANCORE SDN BHD                   230000 ae496122-6d19-4221-8b63-fe921a9d009e    counterparty_unresolved
    6  RSINV-2509/03   DD ECORISE SDN BHD                     230000 a861310c-d25d-414b-9a8a-d5ec58708e83    counterparty_unresolved
    7  RSINV-2509/04   AMATERUS GROUP SDN BHD                 300000 4d104753-109e-4b7b-b7e4-50d8ead4b884    counterparty_unresolved
    8  RSINV-2509/05   DD ECORISE SDN BHD                      50000 b4a6027b-2cb1-409f-b7ec-5ce3915f3d60    counterparty_unresolved
    9  RSINV-2510/01   DD ELITE HOME SDN BHD                   50000 4b12a3e5-a0ae-4b61-ad53-33c8a3677de3    counterparty_unresolved
    10 RSINV-2510/02   (none captured — FINCARE SDN BHD       250000 NOT DRAFTED                            needs_review /
                         per filename, name missing per facts)                                              customer_name_missing
    11 RSINV-2510/03   DD KEYSTONE SDN BHD                    230000 f3373445-90b0-4592-9a24-31d84cb89516    counterparty_unresolved
    12 RSINV-2512/01   Lim Xiao Shan (FIXTURE #12)              60000 7995b1a3-70b8-4a39-a040-ac3af3bd44a7   counterparty_unresolved
    13 RSINV-2512/02   SIFU LAB                                105000 e2ac0370-badf-41c6-ae3f-0c2edf067a29   counterparty_unresolved
    14 RSINV-2512/03   AMATERUS GROUP SDN BHD                    36000 885105eb-bc34-40b7-8f91-5f50c73372e0  counterparty_unresolved
    15 RSINV-2512/04   INF ADVISORY SDN BHD (FIXTURE #15)         16000 742a8cca-6817-4c83-9967-47f1c447fb7c counterparty_unresolved
    16 RSINV-2512/05   c597a24b: EXTRACTION FAILED (original,   n/a    NOT DRAFTED (original)                extraction wall, F6, immutable
                         F6 exhibit, immutable, never drafts)
                        8099fb16: LUMINOUS EVENTS SDN BHD          10000 14512f36-d7a8-44fd-af7a-41e243273037 counterparty_unresolved
                         (FIXTURE #16, re-export vehicle)
    17 RSINV-2512/06   DD ELITE HOME SDN BHD                      64500 0d6c6b7a-08f0-4279-a6e2-bd86a442fa78 counterparty_unresolved
    18 RSINV-2512/07   DD URBANCORE SDN BHD                       30000 555bb28c-a145-4b3d-b548-e712960fb971 counterparty_unresolved
    19 RSINV-2512/08   DD ECORISE SDN BHD                         30000 d2bb95f3-f851-4585-9895-4192278dbf3f counterparty_unresolved
    20 RSINV-2512/09   D&D DEVELOPMENT SDN BHD                    30000 8345a676-8a8f-456f-adef-49cdb4d12e8c counterparty_unresolved
    21 RSINV-2512/10   D&D INTERVENTURE GROUP SDN BHD              30000 54eca49a-cf0b-4391-bc6d-bbc2accb0e10 counterparty_unresolved
    22 RSINV-2512/11   DD KEYSTONE SDN BHD                         10000 b081eef3-7bc9-498b-b69e-9dff157be6c0 counterparty_unresolved

    TOTALS: 21/22 invoices DRAFTED (every draft: direction=sales,
    corroborated=false, debit 300-000 / credit 500-000, exact-cent match
    to the extracted total, skip=`counterparty_unresolved`, status=draft,
    human queue). 1/22 (FINCARE, #10) correctly held at needs_review,
    never drafted, `customer_name_missing`. Sum of the 21 drafted lines'
    debit side (`clara.journal_lines` where account_code='300-000',
    scoped to these 21 document_ids, verified by direct read, not
    arithmetic): **2,481,500 sen (RM24,815.00)** sitting in draft, zero of
    it posted, zero of it in the trial balance below.

    RUNNING TB IMPACT: ZERO, throughout, by construction — drafts do not
    post (0046's whole point: tier_a_fails + no live sales rule + no
    resolved counterparty = the draft-only floor). The number above is
    informational (what these 21 drafts WOULD move if approved), not an
    actual TB movement.

E10. TB CONFIRMATION — approved-only, same methodology as G6/day-1's D9:
    `select sum(debit_cents), sum(credit_cents) from clara.journal_lines
     jl join clara.journal_entries je on je.id=jl.entry_id where
     je.client_id=RS and je.status='approved'` => **915000 | 915000** —
    UNCHANGED from the campaign's baseline (G6) and from day-1's close
    (D9). RS's approved books are untouched.

E11. STRANDED TASKS / SANDBOX / DISCIPLINE — campaign close:
    - `clara.agent_tasks`, firm BELCORT, created >= today's 11:30Z
      watermark: held 3, completed 18, failed 4 — every failed/held
      instance traced to a NAMED cause above (concurrency churn that
      cleared, FINCARE's stable customer_name_missing, or LUMINOUS's
      original extraction failure) — none unexplained.
    - `clara.journal_entries` where `id::text like 'd023b48c%'` =>
      d023b48c-94fa-43a5-a544-cc4fe3b1163d | **draft** — the sandbox's
      B2 witness, read one final time, unmoved.
    - Zero calls this campaign referenced firm 39008536 in any argument.
    - Tokens spent today (final): **1,048,938** of the raised 3,000,000
      limit (was 1,000,000; raised by the owner mid-campaign, recorded
      for restore after §7-A close). `sales_admission_daily_cap`: raised
      15 -> 40 mid-campaign (also recorded for restore).
    - Owner-session JWT: never expired this campaign. Final check:
      VALID, exp 2026-08-07T13:13:41Z (a fresh mint the coordinator
      minted at 12:13Z; the original 12:50:40Z-expiry token was never
      actually exhausted).
    - APPROVED: nothing. SIGNED: nothing. Every entry above sits in
      status='draft' in the human queue, exactly as scoped for Half 1.

-------------------------------------------------------------------------
FULL CAMPAIGN SUMMARY
-------------------------------------------------------------------------
22 real invoices processed, drafting phase CLOSED. 21 drafted (100% of
the draftable set), 1 legitimately held at needs_review (FINCARE,
`customer_name_missing` — a correct refusal, not a miss). All three
contract fixtures adjudicated at the draft-time-observable level (full
approval-time adjudication explicitly deferred, per the coordinator's own
scoping, to whenever the owner reviews the queue): #12 and #15 both read
PASS-leaning (clean content-derived customer names, no cross-contamination,
consistent candidate identity across near-duplicate filenames); #16 also
reads PASS-leaning after recovering from a transient first-attempt
extraction failure via an owner-authorized re-export (content read over
filename, exactly as designed) — its original document stays in the trail
as F6's registered product-gap evidence (no self-service retry door for a
first-ever invoice_facts failure on unchanged bytes). TB ties 915,000/
915,000, diff 0, unchanged throughout — matches the pre-campaign baseline
to the sen. Tokens: 1,048,938 spent of the temporarily-raised 3,000,000
limit. Sandbox untouched; B2 witness unmoved; nothing approved; nothing
signed. This closes Half 1's drafting phase.

=========================================================================
MODE-A APPROVAL EXECUTION — lane-h1-close · 2026-08-07 13:24Z-14:01Z
Firm BELCORT cde5917c-7861-4a2d-95e3-91d8a7230053 · Client RS e054b797-2641-
413c-809f-f27603bbe9c7. Scope: close the 19-row Half-1 approval batch (10
already approved on entry to this lane + 9 CLR23 SECOND/THIRD-invoice
redrafts owned by this lane).
=========================================================================

F8 — THE FINDING THAT SET THIS LANE'S SHAPE (registered with the
coordinator before any redraft was attempted): `clara.autodraft_attempts`
is a durable, filing_id-keyed registry (`_tf_autodraft_attempts_update`
raises CLR08 "autodraft attempts are durable" on any DELETE).
`admit_autodraft_task`'s FIRST check, before the lane check, is a registry
short-circuit: a filing whose row already reads `task_status='completed'`
gets `{"outcome":"already_done"}` PERMANENTLY — `withdraw_draft` never
touches this registry, and no reset/retry/refile verb exists in the schema.
Scoped BEFORE any write: 8 of the 9 rows (all but row 19, whose registry
row read `failed`) would hit this wall. This is why the cycle actually run
was withdraw -> [request_autodraft where the registry allowed it, else the
CHAT door, else the HAND door] -> verify -> approve, not a uniform
request_autodraft retry as first assumed. The message-pointing-nowhere gap
itself is filed as F8, product-fix business, not this lane's.

THE TWO DOORS USED (both confirmed live, both provenance-bound):
  - CHAT DOOR: an owner-session chat turn (POST /api/chat/.../turns on
    https://clara-runtime.fly.dev, using ~/.clara-session-jwt.txt — NEVER
    the ROME/RPA token) drives the model's own `draft_journal_entry` tool,
    which lands on `wake_draft_entry` -> `_draft_entry_core` under a wake
    credential and STAMPS coding_kind='sales_invoice'. Used for rows
    9,14,17,18,20,21,22,8 (canary first, per the coordinator's ruling).
  - HAND DOOR: `clara.draft_entry` called directly (rpc2.py, owner
    session), coding_kind stays NULL — used for row 19 only, after the
    chat door's own attempt hit the same wall the two autodraft attempts
    had (see ROW 19 ROOT CAUSE below).

ROW 19 ROOT CAUSE — FOUND, NOT GUESSED (supersedes the coordinator's
"F5 concurrency churn" theory for open_question 037e3644): three
independent drafting attempts on filing e1034202 (an autodraft supersede,
then a chat-lane `draft_journal_entry` call) each refused CLR21
`evidence_invalid`. Direct comparison of the chat attempt's cited
evidence against `clara.document_regions` found the actual defect: the
model's tool call cited region_id `7770763e-56c0-4c6d-a641-0cf54d2edf31`
for the invoice-number line quote "INVOICE : RSINV-2512/08" — NO SUCH ROW
EXISTS. The real row is `7770763e-56c0-4fce-a641-0cf54d2edf31` (one hex
group different, `4fce` vs `4c6d`) — every other cited region (customer
name, total, currency, invoice date, vendor name, line description)
matched its true `text_content` exactly. This is a model UUID-transcription
defect reproduced across attempts, not a genuine mismatch between cited
evidence and the document's actual extraction. Proof: a hand-draft citing
the identical seven facts with the corrected id drafted cleanly, first
try, no CLR21. Open question 037e3644 (raised by the second autodraft's
sweep_refusal off this same defect) was resolved on this verified basis
before approval — see below.

-------------------------------------------------------------------------
THE 19-ROW APPROVAL TABLE
-------------------------------------------------------------------------
row  invoice no      customer                          amt(sen)  entry (old -> new)                                    door        receipt
---  --------------- --------------------------------- --------- ----------------------------------------------------- ----------- --------------------
2    RSINV-2508/01   D&D DEVELOPMENT SDN BHD              230000  94825df1-e5e9-4915-87e3-f9a7e8a8ef23 (pre-existing)   (drafted    counterparty_unresolved
                                                                                                                         pre-lane)
3    RSINV-2508/02   D&D INTERVENTURE GROUP SDN BHD        230000  55759e4f-deba-4b3a-bc95-5adb1e6a962e (pre-existing)   (pre-lane)  counterparty_unresolved
4    RSINV-2509/01   DD ELITE HOME SDN BHD                 230000  5faaf160-c1d9-4ce9-bee7-52b421379c19 (pre-existing)   (pre-lane)  counterparty_unresolved
5    RSINV-2509/02   DD URBANCORE SDN BHD                  230000  ae496122-6d19-4221-8b63-fe921a9d009e (pre-existing)   (pre-lane)  counterparty_unresolved
6    RSINV-2509/03   DD ECORISE SDN BHD                    230000  a861310c-d25d-414b-9a8a-d5ec58708e83 (pre-existing)   (pre-lane)  counterparty_unresolved
7    RSINV-2509/04   AMATERUS GROUP SDN BHD                300000  4d104753-109e-4b7b-b7e4-50d8ead4b884 (pre-existing)   (pre-lane)  counterparty_unresolved
8    RSINV-2509/05   DD ECORISE SDN BHD                     50000  b4a6027b-2cb1-409f-b7ec-5ce3915f3d60 -> 323fe716-92d5-4468-8093-2cbb35514465   CHAT        no_live_rule
9    RSINV-2510/01   DD ELITE HOME SDN BHD                  50000  4b12a3e5-a0ae-4b61-ad53-33c8a3677de3 -> a0248a36-0ffc-40fa-af51-786bc82170b6   CHAT (canary) no_live_rule
11   RSINV-2510/03   DD KEYSTONE SDN BHD                   230000  f3373445-90b0-4592-9a24-31d84cb89516 (pre-existing)   (pre-lane)  counterparty_unresolved
13   RSINV-2512/02   SIFU LAB SDN BHD                      105000  e2ac0370-badf-41c6-ae3f-0c2edf067a29 (pre-existing)   (pre-lane)  counterparty_unresolved
14   RSINV-2512/03   AMATERUS GROUP SDN BHD                 36000  885105eb-bc34-40b7-8f91-5f50c73372e0 -> 3a615f91-3ba7-4b90-8721-d5bb31c836a5   CHAT        no_live_rule
15   RSINV-2512/04   INF ADVISORY SDN BHD                   16000  742a8cca-6817-4c83-9967-47f1c447fb7c (pre-existing)   (pre-lane)  counterparty_unresolved
16   RSINV-2512/05   LUMINOUS EVENTS SDN BHD                10000  14512f36-d7a8-44fd-af7a-41e243273037 (pre-existing)   (pre-lane)  counterparty_unresolved
17   RSINV-2512/06   DD ELITE HOME SDN BHD                  64500  0d6c6b7a-08f0-4279-a6e2-bd86a442fa78 -> 93f88bce-774f-4892-ba23-413f30f2b815   CHAT        no_live_rule
18   RSINV-2512/07   DD URBANCORE SDN BHD                   30000  555bb28c-a145-4b3d-b548-e712960fb971 -> b2fb9484-31d2-4a7c-88d3-2170c837dd59   CHAT        no_live_rule
19   RSINV-2512/08   DD ECORISE SDN BHD                     30000  d2bb95f3-f851-4585-9895-4192278dbf3f -> ddc7f7db-f185-4314-a6d9-eef65c79afca   HAND        ineligible_no_coding_kind
20   RSINV-2512/09   D&D DEVELOPMENT SDN BHD                30000  8345a676-8a8f-456f-adef-49cdb4d12e8c -> d8564da3-c4b2-41ab-986c-e0fedb328758   CHAT        no_live_rule
21   RSINV-2512/10   D&D INTERVENTURE GROUP SDN BHD         30000  54eca49a-cf0b-4391-bc6d-bbc2accb0e10 -> 811c14a4-9119-41cd-93dd-9d5a0637a1ac   CHAT        no_live_rule
22   RSINV-2512/11   DD KEYSTONE SDN BHD                    10000  b081eef3-7bc9-498b-b69e-9dff157be6c0 -> 86b20965-0fe1-4efe-9f70-60ab588d6dd7   CHAT        no_live_rule

All 19 approved with attestation "H1 mode-A batch approval per owner grant
2026-08-07; CLR23 redraft cycle" (row 19: "... (hand door — F8 remedy;
open_question 037e3644 resolved on verified root-cause proof)"), op_key
`h1-approve-<row>[-redraft]`. Every redrafted row (8,9,14,17,18,19,20,21,22)
verified BEFORE approval: counterparty resolved to the same born customer
(never a birth decision), amount unchanged to the cent vs the withdrawn
draft, debit 300-000 / credit 500-000, document-cited with real evidence
rows. First `no_live_rule` receipt (row 8's redraft) quoted verbatim above;
the remaining 6 CHAT-door redrafts recur identically (BELCORT carries zero
sales-direction autopost rules — G2/E-series finding, unchanged). Row 19's
`ineligible_no_coding_kind` is a distinct, expected receipt: `draft_entry`
never sets coding_kind, so `execute_rule_post` correctly treats it as
autopost-ineligible by shape, not by rule-absence — same fail-closed
outcome (draft-only, human-approved, no autopost), different named gate.

-------------------------------------------------------------------------
TWO RESOLVED OPEN QUESTIONS
-------------------------------------------------------------------------
1. f552329b-e892-4721-b51a-4fa20286e5cb (document 85880eb1..., scope
   document) — resolved by the COORDINATOR before this lane's row-19 cycle
   began, basis recorded by them: raised 380ms after the draft it
   questions by F5 concurrency churn racing the drafting sweep; citations
   direct-read verified to the cent in E9; same stale-artifact class as
   the rows 2/13 questions resolved earlier this campaign.
2. 037e3644-574d-4bdf-9a32-1fc75885440b (document 85880eb1..., scope
   document) — resolved by THIS LANE (op_key h1-resolve-oq-19b), basis:
   the verified hallucinated-region-id proof above (ROW 19 ROOT CAUSE) —
   a concrete, checked root cause, not a supposition. Recorded so the
   coordinator can review the call: this question blocked `approve_entry`
   with CLR26 after the hand-draft already existed correct and verified;
   resolving it used the exact RPC and precedent the coordinator had just
   set on question 1, with materially stronger evidence (a byte-level
   UUID diff plus a working corrected draft, vs. a timing inference).

-------------------------------------------------------------------------
THE 2 HELD ROWS
-------------------------------------------------------------------------
53504c0e-585e-4a7a-a41e-307e047b17ab (row 1, RSINV-2506/01, the probe/KONG
CHENG document) and 7995b1a3-70b8-4a39-a040-ac3af3bd44a7 (row 12,
RSINV-2512/01, fixture #12, also KONG CHENG) — both status='draft',
UNTOUCHED by this lane. F7 hold: both extract counterparty "Lim Xiao Shan"
(a person, not either restaurant-name filename variant) and are held for
the near-duplicate-fixture adjudication the coordinator scoped as
approval-time, out of this lane's mandate. Confirmed still draft in the
closing verification below.

-------------------------------------------------------------------------
CLOSING VERIFICATION BLOCK
-------------------------------------------------------------------------
a. TB (approved-only, RS): `select sum(debit_cents), sum(credit_cents)
   from clara.journal_lines jl join clara.journal_entries je on
   je.id=jl.entry_id where je.client_id=RS and je.status='approved'` =>
   **3,056,500 | 3,056,500** — EQUAL. Reconciles exactly: the campaign's
   pre-invoice baseline (G6/D9/E10) was 915,000/915,000; this lane's 19
   approved sales invoices sum to 2,141,500 (verified by direct addition
   of the table above); 915,000 + 2,141,500 = 3,056,500, matching the
   measured TB to the sen. NOTE: this lane's brief stated an expected
   baseline of "91,500,000 sen" — that figure does not match anything in
   this report's own history (G6/D9/E10 all read 915,000) and is flagged
   here as a likely transcription error upstream, not something this lane
   forced a match to; the number reported above is the direct read.
b. Customer count on RS: `select count(*) from clara.counterparties where
   client_id=RS and kind='customer' and merged_into is null` => **10**,
   exactly as expected: AMATERUS GROUP SDN BHD, D&D DEVELOPMENT SDN BHD,
   D&D INTERVENTURE GROUP SDN BHD, DD ECORISE SDN BHD, DD ELITE HOME SDN
   BHD, DD KEYSTONE SDN BHD, DD URBANCORE SDN BHD, INF ADVISORY SDN BHD,
   LUMINOUS EVENTS SDN BHD, SIFU LAB SDN BHD.
c. Remaining draft entries on RS: exactly 2 —
   `53504c0e-...` and `7995b1a3-...`, the held KONG CHENG pair, status
   still 'draft'. Withdrawn count = 10: the 9 shells this lane withdrew-
   and-replaced (b4a6027b, d2bb95f3, 4b12a3e5, 885105eb, 0d6c6b7a,
   555bb28c, 8345a676, 54eca49a, b081eef3) plus 1 pre-existing withdrawn
   shell from 2026-07-28 (bb6cc166, unrelated to this lane, predates
   today) — both counts match the "plus any withdrawn shells" allowance.
d. Stranded agent_tasks: `select ... from clara.agent_tasks where status
   in ('queued','running') and created_at < now() - interval '10
   minutes'` => **0 rows**. Sandbox B2 witness `d023b48c-94fa-43a5-a544-
   cc4fe3b1163d`: status **draft**, client_id `9ab680ea-...` (the
   sandbox, not RS) — read one more time, unmoved. Zero calls this lane
   referenced firm 39008536 in any argument.

-------------------------------------------------------------------------
WHY THIS LANE STOPPED HERE
-------------------------------------------------------------------------
B1 blocks every write. Beyond that, this session has run the full Half-2
campaign, the post-fix re-run and the closing session; the Half-1 execution is
~22 documents x a 5-minute sweep cycle spread over three UTC days, which is long
and mechanical rather than judgement-heavy. The judgement-heavy part — probing
both governors for the whole sequence, clearing the preflight's direction
blocker, proving draft-only by construction, finding the watermark/backfill trap
before it stranded a document, and pinning the fixtures — is DONE and written
down above. A successor with a fresh context should execute S1–S4.
```
