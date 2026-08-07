# §7-A acceptance — HALF 2 (sandbox, labelled-synthetic)

> **AS-RUN ACCEPTANCE RECORD, 2026-08-07 — EVIDENCE GRADE, NOT A DESIGN DOC.**
> Verbatim copy of the lane report that closed §7-A Half 2 (ADR-064). It records what was
> actually SEEN — receipts, ids, timestamps — including its own errors and the findings it
> minted. The design mechanisms stay `wave-7a-design-skeleton.md` (v2) and `wave-7a-contract.md`
> (7A-R1..R12, RATIFIED — never re-grill). Nothing here is a ruling; where this record and the
> contract disagree, the contract wins. Half 1 is `wave-7a-acceptance-h1.md`.

```text
§7-A ACCEPTANCE — HALF 2 (SANDBOX, LABELLED-SYNTHETIC)
lane-7a-h2 · 2026-08-07 · live campaign 05:41Z–07:16Z
Venue: ROME PUBLIC ADVISORY SDN. BHD. 39008536-838f-478c-9eee-ff1e84b77aa9
Client: "Fictional Test Services Sdn. Bhd." 9ab680ea-a570-4713-89b5-28bca458ee2c
Sanction: ADR-048 labelled-synthetic lane + ADR-060 data authority. Runtime v56, 45 migrations.

=========================================================================
VERDICT IN ONE LINE
=========================================================================
The OCR-sales autopost envelope WORKS — three real unattended posts through the
product's own doors, every wall firing correctly — but §7-A CANNOT SHIP AS BUILT:
every successful unattended post strands its own autodraft task and jams the
runtime's leader loop in a 2-second retry cycle until an operator cancels it.
Reproduced 3 times out of 3 posts. Details at FINDING F1.

=========================================================================
1. WHAT §4.2 SAYS IS CLAIMABLE vs WHAT THE RECEIPTS PROVE
=========================================================================
CLAIM (skeleton §4.2)                          | STATUS   | RECEIPT
-----------------------------------------------+----------+-----------------------------
an ocr_sales rule PROPOSED                     | PROVEN   | rule a3f93bfe-1fe8-475c-9e02-6cbe59f778a4,
                                               |          | 2026-08-07T06:22:39Z, status 'proposed'
… SIGNED                                       | PROVEN   | sign_autopost_rule -> live,
                                               |          | signed_at 2026-08-07T06:23:05.351507Z,
                                               |          | signed_by 4f179b75 (the RPA human)
… POSTED UNATTENDED on labelled-synthetic      | PROVEN   | 3 posts: entries 14dfc792 / 6825b0a9 /
tax-stating invoices — the envelope's first    | (x3)     | ac6f9d9a, all checked_via_rule_id
exercise ever                                  |          | = a3f93bfe. See §4.
floor accrual to 6/6/60 + corroborated>=6,     | PROVEN   | _ocr_sales_floor(...) = 7 | 7 | 7 | 85
sales_invoice-only (7A-R4)                     |          | (target 6/6/6/60). See §3.
generator satisfies the FULL 0023:304-346      | PROVEN   | 9 of 9 tax-stating synthetics
predicate                                      |          | corroborated=true, two-reader
                                               |          | agreement (typed_collapsed) on BOTH
                                               |          | net and tax. See §2.
preview verb's numbers == the floor's          | PROVEN   | both read 7/7/7/85 in the same minute.
                                               |          | See §5.
every named post-time skip receipt SEEN firing | PARTIAL  | 6 of 11 seen. 5 are structurally
(never inferred)                               |          | SHADOWED for the rest of Aug 2026 —
                                               |          | proven, not assumed. See §6.
NOT claimable: real-document autopost          | not attempted (correct — Half 1's business)
NOT claimable: anything about MyInvois XML     | not attempted (correct)

=========================================================================
2. THE CORPUS — generator, and the two generator defects it taught
=========================================================================
Eleven labelled-synthetic PDFs, all overtly marked SYNTHETIC in the letterhead
banner and footer, issuer = the sandbox client itself (so direction resolves
'sales' by hard identifier match). Generator + specs:
  .tmp/h2/gen_invoice.py · .tmp/h2/make_corpus.py · .tmp/h2/drive.py
  corpus at .tmp/h2/corpus/SYNTHETIC-TEST-MY-INV-00NN.pdf

The totals block deliberately COPIES the one label pair the live corpus already
proves Azure DI types and the X2 layout reader anchors — the EZSEC family, 8 real
documents, outcome typed_collapsed on both legs:
     "Total Payable Excl. SST:"  -> invoice.total_excl_tax
     "SST Amt @ 6%:"             -> invoice.tax_total
Label and amount sit in two widely separated columns so Azure emits them as two
lines in reading order (X2 needs index-adjacency + vertical overlap).
FIRST PROBE CORROBORATED ON THE FIRST TRY (0007, 06:00Z).

TWO GENERATOR DEFECTS, both found by a wall refusing and both fixed in the
GENERATOR, never in the wall:

(a) NO BUYER REGISTRATION -> customer_ambiguous.
    0007 stated only "Company No." for the buyer; Azure emits
    invoice.customer_registration ONLY from its typed CustomerTaxId
    (invoiceFacts.v1.azure.mjs:401-411). With no registration,
    clara._resolve_counterparty raises CLR23 registration_conflict —
    "registered name match is ambiguous without a registration number" — because
    the existing counterparty HAS a registration. The lane appended
    customer_ambiguous, marked HARD, and admission refused lane_changed.
    RECEIPT: sweep_run_items 2026-08-07T05:59:23.634303Z, document
    fdd0038a-54a4-43ce-97d3-6f7401bc2b80,
    {"clr":"CLR29","lane":"needs_you","reason":"lane_changed",
     "reasons":["customer_ambiguous"]}
    FIX: print "Tax ID: 209901000002" in the bill-to block. 0008 onward captured
    invoice.customer_registration=209901000002 and drafted.
    ADJUDICATED CORRECT — but see FINDING F3, it has a Half-1 consequence.

(b) NO STATED AMOUNT DUE -> anchor_missing. See §6, receipt 4.

=========================================================================
3. THE EARNED FLOOR — 7 / 7 / 7 / 85
=========================================================================
Four new human-approved entries were added to the three pre-existing Gate-S
sightings. Every one came from the UNATTENDED drafter (maker = the agent) and was
approved by the RPA human (checker) — maker/checker separation intact, no
attestation required, checked_via_rule_id null on all seven.

_ocr_sales_floor_pop(9ab680ea…, f5c1116c-df09-4387-b844-4bafc9f45864, '4000'):
  TEST-MY-INV-0012 | 2026-05-04 | corroborated t   <- new
  TEST-MY-INV-0008 | 2026-05-18 | corroborated t   <- new
  TEST-MY-INV-0009 | 2026-06-08 | corroborated t   <- new
  TEST-MY-INV-0010 | 2026-06-22 | corroborated t   <- new
  TEST-MY-INV-0002 | 2026-07-28 | corroborated t   (Gate-S, structured)
  TEST-MY-INV-0001 | 2026-07-28 | corroborated t   (Gate-S, structured)
  TEST-MY-INV-0003 | 2026-07-28 | corroborated t   (Gate-S, structured)
_ocr_sales_floor(...) => qualifying 7 | distinct_invoices 7 | corroborated 7 | span_days 85
Approval receipts: 06:12:58.706138Z (0008) · 06:13:09.551937Z (0010) ·
06:20:10.355341Z (0012) · 06:20:10.961357Z (0009), all op_key h2-approve-*.
Back-dating: NOT hand-set. The unattended drafter carried each document's own
stated invoice_date as posting_date, which is what produced the 85-day span.

=========================================================================
4. THE MAIN EVENT — THREE UNATTENDED POSTS
=========================================================================
POST 1 (the first ever ocr_sales autopost)
  document  a57b03d4-4f3b-4220-9d0e-59a773d90097  SYNTHETIC-TEST-MY-INV-0013.pdf
  entry     14dfc792-1817-4ad6-8341-d5e481770300
  rule_post_run f6f3444c-6e4c-4a9f-8759-474aaead466c, posted_at 06:33:13.475447Z
  snapshot  {"direction":"sales","evidence_class":"ocr_sales","account_code":"4000",
             "amount_cap_cents":200000,"frequency_window":"monthly",
             "window_max_posts":3,"posted_total_cents":74200,
             "content_hash":"4b3054edb292f9c2578331049d8299cd1d9ccddb86144fabe020be6d7d11a591",
             "signed_by":"4f179b75-3d6c-417b-877f-10710306c8eb"}
  THE WHOLE CHAIN, 109 MILLISECONDS, NO HUMAN IN IT (clara.audit_log, entry_id=14dfc792):
    06:33:13.366556Z  draft_entry    actor 00000000-0000-4000-8000-000000c1a7a0 (the agent)
                      op_key code-doc:fea33613-…:a57b03d4-…
    06:33:13.475447Z  approve_entry  actor 4f179b75 (the rule's signer = signed authority)
                      op_key rulepost:14dfc792-1817-4ad6-8341-d5e481770300:412
                      checked_via_rule_id a3f93bfe-…
                      counterparty f5c1116c-…  (bound at approve, not at draft)
  LINES (the DB's numbers, not the agent's):
    1  1200 Trade receivables      Dr 74200   cp f5c1116c
    2  4000 Service revenue                   Cr 70000
    3  2300 SST output tax payable            Cr  4200
POST 2  entry 6825b0a9-2922-483c-8161-ccebebc9409b, TEST-MY-INV-0016,
        run 6839f6be-f62d-4858-a58f-9f3d31b9bc03, 07:08:17.865420Z, 42400 cents
POST 3  entry ac6f9d9a-8c49-478f-ab2c-11bbb723ef6c, TEST-MY-INV-0017,
        run 2c7b80f5-fab2-4c83-8c86-41e7f561e3ff, 07:08:21.543425Z, 31800 cents

THE UNATTENDED DRAFTER (autoDraft_v6) — its own acceptance, seen 9 times:
  direction=sales bound at admission; coding_kind='sales_invoice' proposed and
  accepted; counterparty resolved to the EXISTING customer (never born).
  First sales draft ever: sweep_run_items 06:04:13.849593Z, outcome 'drafted',
  entry da67edc0-be2f-4d93-92d4-7e2fbfa63416, coding_kind sales_invoice,
  posting_date 2026-05-18, origin 'document'.
  WATERMARK: steady-state admitted every post-activation filing as designed
  (firm_limits.sales_admission_watermark = 2026-08-07T04:48:32.724095Z, set at
  the ceremony flip; every filing today is later, so _sales_admission_open
  returned true). No backfill batch was needed or opened.

=========================================================================
5. THE RULE — propose -> preview -> sign
=========================================================================
PROPOSED  06:22:39Z  rule a3f93bfe-1fe8-475c-9e02-6cbe59f778a4
          direction sales · evidence_class ocr_sales · account 4000 ·
          counterparty f5c1116c · cap RM2,000.00 · monthly · max 3 posts ·
          expires 2027-08-07 · supersedes 9344d15c (the Gate-S structured rule)
PREVIEW   preview_ocr_sales_evidence(a3f93bfe) at 06:22:48.014700Z:
          {"applicable":true,"advisory":true,"floor_met":true,
           "qualifying":7,"distinct_invoices":7,"corroborated":7,"span_days":85,
           "tax_silent_documents":0,
           "required":{"qualifying":6,"distinct_invoices":6,"corroborated":6,"span_days":60}}
          THE FLOOR ITSELF, same minute: 7 | 7 | 7 | 85.  IDENTICAL. Control 6's
          signing-time readout and the authority it previews are the same numbers.
          Re-read after signing (06:23:13.787645Z): same, rule_status now "live".
SIGNED    06:23:05.351507Z -> live. sign_autopost_rule re-derived the floor before
          flipping status (control 6 re-checked at sign, as designed).
PRECONDITION: the old Gate-S structured rule had to be retired first —
uq_coding_rules_one_live_vendor allows ONE live rule per counterparty
(retire receipt: 9344d15c -> 'retired', op_key h2-retire-structured-1).

=========================================================================
6. THE NEGATIVE BATTERY — six named receipts SEEN, five shadowed
=========================================================================
SEEN (quoted from clara.rule_post_skips / clara.sweep_run_items):

1. evidence_class_mismatch (control 1 — evidence class RE-DERIVED from the lane,
   never read from the rule label).  SEEN TWICE.
     06:18:05.011473Z  entry 97c738e4-…  rule 9344d15c  evidence_class_mismatch
     06:18:07.612332Z  entry 0214bc69-…  rule 9344d15c  evidence_class_mismatch
   Both were Azure-OCR (invoice_facts) documents under RM1,060 that the live
   Gate-S 'structured' rule matched on every other term. The lane-derived class
   ('ocr_sales') refused them. An OCR document cannot ride an XML authority.

2. over_cap (rule bound).  SEEN TWICE — 06:04:13.326180Z (entry da67edc0, gross
   132500 > cap 106000) and 06:08:32.431204Z (entry ffe5d0be, gross 159000).

3. not_corroborated (control 4's admission gate).  SEEN.
     07:08:19.501561Z  entry d10eb6f5-621a-4c11-943e-5e36f7e366c0  rule a3f93bfe
   TEST-MY-INV-0014, deliberately tax-SILENT (no SST line at all) ->
   _invoice_fact_state corroborated=false, no tax_total_cents.
   THIS ALSO PROVES 7A-R3: the document DRAFTED anyway (sweep_run_items
   07:08:19.796815Z outcome 'drafted', coding_kind sales_invoice) — the narrow
   tier_a_fails bypass let a tax-silent sales invoice reach a human queue — and
   was then refused at the posting path. Draft yes, autopost never. Exactly the
   ruling.

4. anchor_missing (control 4 — the second independent numeric anchor).  SEEN.
     06:23:57.434765Z  entry 977ee82c-dd49-49af-b6fb-25cc399d3c2a  rule a3f93bfe
   TEST-MY-INV-0011 was fully corroborated (corroborated=true, net+tax+identity
   exact) and STILL refused, because execute_rule_post's anchor lane requires
   EXACTLY ONE invoice.amount_due region equal to the gross, which 0023's
   corroboration predicate does NOT (it accepts amount_due absent).
   NOT A CONTRADICTION — the post-time lane is deliberately stricter than the
   read-time predicate. But it is a real, undocumented asymmetry that anyone
   building a corpus will hit: see FINDING F2.
   Generator fixed (an "Amount Due (RM):" line, which matches no X2 totals-
   vocabulary prefix so it adds no totals field); 0013 then carried
   invoice.amount_due = 74200 = gross and posted.

5. counterparty_unresolved (control 5 — NO counterparty birth in this lane, ever).
   SEEN.
     07:08:27.687228Z  entry 318cb587-0d15-4a56-b419-b83b1e103daa  rule (null)
   TEST-MY-INV-0018 was billed to "Fictional Unknown Buyer Sdn. Bhd." — a
   corroborated, sales-direction, fully-anchored invoice whose buyer does not
   exist as a counterparty. _resolve_counterparty returned decision='birth' and
   the executor refused. The draft stayed for a human.

6. window_exhausted (control 7 — bounds per WA21-R10, <=3 posts per monthly
   window).  SEEN, and it fired organically rather than by construction.
     07:08:23.440245Z  entry de74c4a8-2004-4080-9f2b-0863b1c24134  rule a3f93bfe
   The rule had posted 3 times in the August window (14dfc792 06:33:13,
   6825b0a9 07:08:17, ac6f9d9a 07:08:21). TEST-MY-INV-0015 — corroborated, right
   customer, all anchors, RM530 well under the RM2,000 cap — was the fourth and
   was refused. Window arithmetic verified against the source:
   v_window_start = date_trunc('month', now() at time zone 'utc') = 2026-08-01;
   count(rule_post_runs where rule_id=a3f93bfe and posted_at>=start) = 3 >= 3.

ALSO SEEN, admission-side: customer_ambiguous (§2a) · refused_budget/concurrency
· refused_attempts/cancelled.

NOT SEEN — and the reason is STRUCTURAL, not an absence of effort:
  polarity_unverified · direction_unproven · buyer_mismatch ·
  customer_unresolved · floor_lost
  ALL FIVE SIT BELOW window_exhausted IN execute_rule_post's ORDER. The window
  bound is evaluated at the rule-gate stage (before not_corroborated, before the
  evidence-class check, and long before the ocr_sales envelope at the bottom).
  Rule a3f93bfe has consumed its 3 posts for the August-2026 UTC window, so from
  07:08:21Z onward EVERY post attempt on this rule terminates at
  window_exhausted and no control below it can be reached until 2026-09-01.
  THIS IS PROVEN, NOT ASSUMED: receipt 6 is a document that satisfied every one
  of those five controls and still stopped at the window.
  Reaching them needs a fresh rule id (a retire + re-propose + re-sign resets the
  window count) — the floor still holds at 7/7/7/85, so a successor would sign.
  Two of the five need extra state on top of that:
    buyer_mismatch  — needs a SECOND existing customer counterparty and an
                      invoice billed to it (control 5 must pass so control b2 can
                      fail). Draft 318cb587 is sitting ready to birth exactly that
                      counterparty on approval.
    floor_lost      — needs 2 of the 7 floor entries reversed (a recorded ADR-060
                      reset) so the post-time re-check drops below 6.
    direction_unproven / polarity_unverified — the unattended lane CANNOT produce
                      the shapes they guard (admission binds direction, and
                      set_document_kind writes a positive human classify verdict),
                      so they need the chat lane or a deliberately unclassified
                      document. Recorded as not-honestly-reachable from this lane.
  I did not force any of these. §7-A has to change for F1 anyway (below), so the
  battery should be finished on the re-run, against a fresh rule.

=========================================================================
FINDING F1 — BLOCKER. Every unattended post strands its autodraft task and
jams the runtime's LEADER loop. Reproduced 3/3.
=========================================================================
WHAT HAPPENS
  1. autoDraft_v6 drafts entry E (status 'draft') and the spine emits entry.drafted.
  2. The rule-post consumer is event-driven and independent. It posts E about
     100 ms later -> E.status becomes 'approved'.
  3. autoDraft_v6's settleAutoDraftStep then calls settle_autodraft_task(...,
     'drafted', E, ...). Its guard requires the entry to still be a DRAFT:
        if p_outcome='drafted' and (p_entry is null or not exists(
            select 1 from clara.journal_entries e where e.id=p_entry
              and e.firm_id=a.firm_id and e.client_id=a.client_id
              and e.filing_id=a.filing_id and e.status='draft'))
        then raise exception 'draft settlement entry not found' using errcode='CLR11';
     (live 6-arity settle_autodraft_task; same shape as 0036:951 / 0011:2666)
     -> CLR11 on all 4 attempts -> the workflow run FAILS, the agent_task stays
     'running', its token reservation stays charged.
  4. The reconciler's autodraft edge (reconciler.mjs:313, settleAutoDraftTerminal)
     then tries to settle that stranded task the SAME way — outcome 'drafted' with
     the same entry id — on EVERY leader cycle, and raises the SAME CLR11. The
     exception propagates out of runReconcilerSweep, so the whole LEADER cycle
     aborts before its remaining work and retries every ~2 seconds, forever.

MEASURED CONSEQUENCE (not inferred — this is what the campaign hit)
  06:33Z  post 1 lands. Task fea33613-e224-4ab5-b262-969f6d0ebae9 stranded
          'running'; run wrun_01KZDESBCBCSKY7M1AQ7AN3CF5 failed with
          settleAutoDraftStep = failed / attempt 4.
  06:33–06:58Z  "LEADER cycle-error draft settlement entry not found" every ~2s
          (52 occurrences in one log window). Document-task enqueue and the
          autodraft sweep STARVED: five invoice_facts tasks sat 'queued' with
          attempt_count 0 for 19 minutes; /ready warned
          "oldest unbound document task age 1158951ms".
  06:57:58Z  I cancelled the stranded task through the product door
          (cancel_agent_task, op_key h2-cancel-stranded-autodraft-1). It settled
          'failed'/'internal'. ALL FIVE backlogged tasks completed within 60 s —
          which is the causal proof.
  07:08Z  posts 2 and 3 land. TWO tasks stranded identically
          (51e9d7c0-c0d1-492d-b2eb-674d4de349c3 /
           7428b398-4a1c-4d9b-8a7b-d8191e3379f0, runs
           wrun_01KZDGSQEP5BVSSBKBKZ9G1TBE / wrun_01KZDGSQF5KVMSYZVWZGACF646,
           both settleAutoDraftStep = failed / attempt 4). The loop resumed.
          Cleared the same way at 07:10Z (op_keys h2-cancel-stranded-2 / -3).
          Last leader error 07:10:31Z; /ready green, zero stuck tasks, since.

WHY IT NEVER SHOWED UP BEFORE §7-A
  Before this wave the autopost lane only ever saw HAND/CHAT drafts, where no
  autodraft task is awaiting settlement. §7-A is the first time the same entry is
  produced by the unattended drafter and consumed by the unattended poster in the
  same instant. The two lanes were never in the same race until now.

WHY IT IS LAW 2's SHAPE
  The guard asks "is this entry still a draft?" and treats the answer as proof of
  "did this task produce this entry". That is a DERIVED, TIME-VARYING state
  standing in for an identity fact. The entry's identity (id + firm + client +
  filing) already proves authorship; the status term adds nothing but a race.

SEVERITY
  HIGH / ship-blocking. It is not a sandbox artefact: the leader loop is
  firm-agnostic, so on any firm with the sales lane on, each autoposted invoice
  wedges OCR dispatch, matching, sweeps, the adjustments belt, FA runs and SST
  watches until a human cancels a task they have no reason to know exists. The
  runtime never self-heals — the reconciler is the thing that is stuck.

SUGGESTED SHAPE OF THE FIX (for the build lane to grill, not a ruling)
  Drop `and e.status='draft'` from the drafted-settlement existence test and
  accept any entry that belongs to this task's (firm, client, filing) — status is
  not the evidence. If a liveness term is genuinely wanted, it must accept
  'approved' with checked_via_rule_id set, i.e. "still a draft OR posted by a
  rule". Whatever is chosen, reconciler.mjs's terminal edge must stop being able
  to raise out of runReconcilerSweep: one un-settleable task must not be able to
  abort the whole leader cycle.

=========================================================================
FINDING F2 — the amount-due asymmetry is real and undocumented
=========================================================================
0023's corroboration predicate accepts amount_due ABSENT
(`v_due_c = 0 or (v_due is not null and v_due = v_total)`), but
execute_rule_post's OCR-sales anchor lane requires it PRESENT and equal
(`v_due_c<>1 or v_due_amt is null or v_due_amt<>v_gross` -> anchor_missing).
A document can therefore be corroborated, drafted, and never autopostable, with
`anchor_missing` as the only clue. Defensible as design (amount_due IS control 4's
second independent anchor) but it is stated nowhere in the contract or the
skeleton, and it cost this campaign one burnt document to discover. Worth a line
in §4 control 4, and worth knowing for Half 1: a real invoice that prints no
"Amount Due" can draft forever and never earn a post.

=========================================================================
FINDING F3 — customer_ambiguous will be the Half-1 wall
=========================================================================
clara._resolve_counterparty refuses a name-only match against a counterparty that
carries a registration ("registered name match is ambiguous without a
registration number", CLR23 registration_conflict). Most real Malaysian sales
invoices do NOT print the buyer's company number, and Azure only emits
invoice.customer_registration from a typed CustomerTaxId. So: if RS's 12 customers
are born WITH registrations during Half 1, every later invoice to them that omits
the buyer's number will refuse customer_ambiguous and never draft unattended. The
wall is correct; the operational consequence deserves a decision before Half 1
births those counterparties. (Sandbox witness: document
fdd0038a-54a4-43ce-97d3-6f7401bc2b80 has now refused this way 6+ times and remains
in needs_you.)

=========================================================================
FINDING F4 — a correct wall that reads as an outage: the egress hold storm
=========================================================================
The invoice_facts lane holds a task when the document's filing client lacks a
LIVE LEGACY clara.client_egress_consents row, or when the document has NO active
filing at all (v_clients=0 -> 'no_consent'). Both were true for the first probe.
That is CORRECT — no vendor OCR read without the client's consent.
What is not correct is the loop: reconciler-documents.mjs releases held_egress
tasks unconditionally whenever CLARA_DOC_EGRESS_APPROVED=1, the claim immediately
re-holds them for 'no_consent', and the pair cycled ~29 workflow runs per minute
for six minutes (05:42–05:48Z), saturating the pool. Measured collateral: DB
connections 32/60 -> 42/60 (clara_runtime_login 15 idle), repeated
"world heartbeat error: Connection terminated due to connection timeout", and two
health-check flaps (05:44:09Z, 05:47:20Z) where /ready and /health went
unreachable through the proxy.
The release should not release a task whose hold reason is consent-based — only
the kill-switch hold is releasable by the kill switch.
CLEARED through product doors: grant_client_egress(client 9ab680ea, evidence
d82e6332 = SYNTHETIC-FictionalTest-Consent-Evidence-v2.pdf, op_key
h2-egress-grant-1) -> consent b7465708-1a01-4b67-94af-bb62d9837ce1; then
file_document with p_resolution='' (an EMPTY string mints the human resolution —
passing prose raises CLR01 'client attribution not established', which is what my
first attempt did).

=========================================================================
FINDING F5 (minor) — sweep concurrency starves its own queue
=========================================================================
admit_autodraft_task refuses 'refused_budget'/'concurrency' when the count of
sweep_runs in state='open' for the firm >= max_concurrent_sweeps (2). Because
open_sweep_run opens the run BEFORE admitting, the run's own row counts toward
the cap, so two near-simultaneous spine events refuse each other and NOTHING
drafts in that pass. Observed at 06:06:30, 06:08:47, 06:12:48, 06:58:09-06:58:25
and 07:02:59 (all six candidates refused in one pass). It recovers on the 5-minute
catch-up (CLARA_AUTODRAFT_CATCHUP_SECONDS=300), so it is throughput, not a stall —
but a firm ingesting a batch will look frozen for minutes at a time.

=========================================================================
7. TB TIE + ISOLATION
=========================================================================
TB TIES TO THE SEN. clara.trial_balance(9ab680ea…) across all approved,
unreversed entries: debits 32,831,716 = credits 32,831,716, difference 0.
The campaign's own effect is visible and correct:
  1200 Trade receivables   Dr 2,015,300 / Cr 1,374,000
  4000 Service revenue                    Cr 1,955,000
  2300 SST output tax payable             Cr    60,300
(2300 is the sst_output account — the Half-2 positive-tax precondition, exercised
for real: every one of the nine tax-stating invoices booked a 6% SST leg, and
CLR10 sst_account_missing never fired because the account exists.)

ZERO WRITES OUTSIDE THE SANDBOX FIRM.
  journal_entries created since 05:30Z, by firm: ROME PUBLIC ADVISORY = 11
    (4 human-approved + 3 rule-posted + 4 drafts left for humans). BELCORT = 0.
    Alara / Borneo = 0.
  audit_log rows since 05:30Z by my actor (4f179b75, the RPA human), by firm:
    ROME PUBLIC ADVISORY = 62. Every other firm = 0.
  documents since 05:30Z: ROME PUBLIC ADVISORY = 12 (mine). BELCORT = 1 —
    "RSINV-250601 - KONG CHENG RESTAURANTS SDN BHD - RM2,800.pdf", uploaded_by
    27ba34b6 (the owner/main session, the parallel Half-1 lane). NOT MINE, and its
    different uploader is the proof.
  BELCORT's sales lane is still OFF: firm_limits(cde5917c…).sales_lane_active = f,
    sales_admission_watermark NULL.
  The protected witness d023b48c (the sandbox's B2 July adjustment draft) was
    NEVER approved and is still status 'draft', posting_date 2026-07-31.
  Git untouched: no commits, no branch changes. (CLAUDE.md shows modified in the
    worktree — that is the parallel session's edit, not mine.)

=========================================================================
8. RECORDED STATE CHANGES (ADR-060 / ADR-048 ledger)
=========================================================================
  grant_client_egress   -> consent b7465708 for the sandbox client (legacy lane,
                           synthetic evidence document, first time this client
                           could reach the Azure invoice lane at all)
  retire_autopost_rule  -> 9344d15c (Gate-S structured rule), reason recorded,
                           superseded by a3f93bfe
  cancel_agent_task x3  -> fea33613 / 51e9d7c0 / 7428b398, all three stranded by
                           FINDING F1; each settled 'failed'/'internal'. This is
                           the ONLY repair I made to live runtime state and it was
                           through a product verb; no mechanism was weakened or
                           bypassed.
  12 documents ingested, 11 entries created, 3 posted unattended, 4 drafts left
  in the human queue by design (0011 anchor_missing · 0014 not_corroborated ·
  0015 window_exhausted · 0018 counterparty_unresolved).
  NEVER touched: the B2 July draft d023b48c, any other firm, any real client.

=========================================================================
9. WHAT A RE-RUN AFTER THE F1 FIX SHOULD DO
=========================================================================
  - Re-run the three unattended posts and confirm the autodraft tasks settle
    'completed' instead of stranding (the single acceptance criterion for the fix).
  - Retire a3f93bfe, propose+sign a successor (the floor still reads 7/7/7/85), and
    finish the battery against a fresh window: buyer_mismatch (approve draft
    318cb587 first to birth the second customer) and floor_lost (reverse two floor
    entries, observe, restore by re-ingesting two synthetics).
  - Decide F3 before Half 1 births RS's 12 customers.
  - Fix F4's release/re-hold loop before any firm is onboarded without a consent
    row, and F5's open-run-counts-itself cap.

=========================================================================
=========================================================================
RE-RUN AFTER THE F1 FIX (0047 + runtime v57) — 2026-08-07 10:38Z–11:06Z
lane-7a-h2 · same venue, same discipline, product doors only
=========================================================================
PRECONDITIONS VERIFIED FIRST (not assumed):
  clara.schema_migrations: 0047_settle_guard_identity applied 2026-08-07T10:30:51.940107Z
  fly status -a clara-runtime: machine 48ee715b763048, VERSION 57, 2 checks passing
  The live 6-arity settle guard now reads:
      and (e.status='draft'
           or (e.status='approved' and e.checked_via_rule_id is not null))
  with a third arm that settles the human-superseded case TERMINALLY
  (outcome -> skipped_lane, entry -> null, tokens -> 0 full refund, refusal token
  {"clr":"CLR29","reason":"superseded_by_human"}), and the CLR11 raise kept only
  as the genuine unknown-entry fail-closed branch. reconciler.mjs now isolates the
  settle per task ("one task's settle failure must never abort the rest of this
  sweep -- that isolation IS the fix").
  Floor before touching anything: 7 | 7 | 7 | 85. Zero stranded tasks.

-------------------------------------------------------------------------
R1. THE ACCEPTANCE CRITERION — MET
-------------------------------------------------------------------------
Document SYNTHETIC-TEST-MY-INV-0019.pdf cf1c46c5-2afc-4680-906a-938b6e1074d1,
corroborated=true, MYR, amount_due 47700 = gross, customer_registration captured.
Autodraft task 2509492d-c26c-4066-bfba-97463db5690e.

THE RACE STILL HAPPENS — that is the point. clara.audit_log, entry
c72dbc16-d59b-49e9-8bee-0cb9dcc04aec:
  10:52:06.246392Z  draft_entry   actor 00000000-0000-4000-8000-000000c1a7a0 (agent)
                    op_key code-doc:2509492d-...:cf1c46c5-...
  10:52:06.356975Z  approve_entry actor 4f179b75 (the rule's signer)
                    op_key rulepost:c72dbc16-...:536
                    checked_via_rule_id 12c495dd-9d17-4819-8d61-8deca2a0c8fe
                    -> the autoposter took the entry 110 MILLISECONDS after the
                       drafter wrote it, exactly as before the fix
  10:52:07.027642Z  settle_autodraft_task  outcome 'drafted'  OUTCOME: ok
                    {"task":"2509492d-...","tokens":91006,"reserved":40000}

THE THREE THINGS THAT WERE BROKEN, NOW MEASURED GREEN:
  clara.agent_tasks 2509492d... : status 'completed', error_code NULL
      (before the fix: 'running' forever, then 'failed'/'internal' after my cancel)
  workflow_steps for wrun_01KZDXKENV98DJPDVBK904PW8N:
      claimAutoDraftStep=completed/att1 ; runAutoDraftModelStep=completed/att1 ;
      recoverAutoDraftStep=completed/att1 ; settleAutoDraftStep=completed/att1 ;
      closeAutoDraftStreamStep=completed/att1
      (before: settleAutoDraftStep=failed/att4, run failed)
  ZERO STRANDS: select count(*) from clara.agent_tasks where status in
      ('running','cancel_requested') = 0, checked repeatedly through 11:06Z.
  THE ABSENCE-OF-ERROR WINDOW, captured live rather than inferred:
      .tmp/h2/rerun-logwatch.txt — `fly logs` filtered on
      cycle-error|settlement|LEADER|AUTODRAFT, opened 2026-08-07T10:39:17Z and run
      continuously across the post at 10:52:06Z through 11:04Z:
        cycle-error lines: 0
        "draft settlement entry not found" lines: 0
      A fresh `fly logs --no-tail` at 11:06:23Z over the whole retained window:
      0 cycle-errors. (The pre-fix campaign produced 52 in one such window.)
  THE POST ITSELF still landed: rule_post_runs 624b5e7f-b267-40e0-b1e1-ac0e76f43ac7,
      rule 12c495dd, posted_at 10:52:06.356975Z, posted_total_cents 47700.

BONUS — THE FIX ALSO HOLDS ON THE FAILURE PATH. At 11:03Z an autodraft failed
outright (see R5) and still settled cleanly: settleAutoDraftStep=completed/att1,
task 818dd9c4... -> 'failed'/'internal', clara.autodraft_attempts state 'idle' with
the vendor message recorded. No strand, no leader error. The un-settleable task
class is gone in both directions.

-------------------------------------------------------------------------
R2. THE SUCCESSOR RULE — floor verified, previewed, signed
-------------------------------------------------------------------------
  10:38:26.811432Z  preview_ocr_sales_evidence(12c495dd) BEFORE signing:
        floor_met true, qualifying 7, distinct_invoices 7, corroborated 7,
        span_days 85, rule_status "proposed"
  RETIRE  a3f93bfe -> 'retired' (reason: August window exhausted 3/3, superseded)
  SIGN    12c495dd -> 'live' at 10:38Z, supersedes_rule_id a3f93bfe
  Rule ledger now: 9344d15c retired (structured) · a3f93bfe retired (ocr_sales,
  3 posts in window) · 12c495dd LIVE (ocr_sales, 1 post in window, cap RM2,000,
  monthly, max 3).
  Sequencing note: the retire must precede the sign — uq_coding_rules_one_live_vendor
  permits exactly one live rule per counterparty.

-------------------------------------------------------------------------
R3. THE FOUR QUEUED DRAFTS — ALL FOUR STILL STAND AS DESIGNED
-------------------------------------------------------------------------
  977ee82c  0011  draft  sales_invoice  2026-07-06  corroborated t  skip anchor_missing
  d10eb6f5  0014  draft  sales_invoice  2026-07-14  corroborated f  skip not_corroborated
  de74c4a8  0015  draft  sales_invoice  2026-07-15  corroborated t  skip window_exhausted
  318cb587  0018  draft  sales_invoice  2026-07-18  corroborated t  skip counterparty_unresolved
Each still a draft, still coding_kind sales_invoice, each still carrying its named
durable skip. Two of them (0011, 0015) were later approved as the floor RESTORATION
(R4) — their skip receipts are durable rows in clara.rule_post_skips and survive.

-------------------------------------------------------------------------
R4. floor_lost — NOT CAPTURED. The floor was broken, measured, and RESTORED.
-------------------------------------------------------------------------
  reverse_entry da67edc0 (0008) -> reversal 301b6d5c-22a0-441e-ad50-bd43b1f33076
  reverse_entry ffe5d0be (0010) -> reversal 87991d00-0ca8-445c-976a-5a6e52e61a97
      both op_key h2r-rev-*, reason recorded, both returned status 'approved'
  FLOOR AFTER: 5 | 5 | 5 | 85 — below the 6 threshold, as intended.
  THE PREVIEW VERB REPORTED THE LOSS HONESTLY (11:02:19.890264Z):
      floor_met FALSE, qualifying 5, distinct_invoices 5, corroborated 5
      — the dashboard readout tells a signer their authority is gone. NEW RECEIPT.
  The trigger draft then FAILED before any entry existed (R5), so
  execute_rule_post never ran and floor_lost never fired.
  RESTORED at 11:04Z by approving the two standing corroborated drafts
  (977ee82c op_key h2r-restore-0011-1, de74c4a8 op_key h2r-restore-0015-1) —
  a path that needs no model call.
  FLOOR AFTER RESTORE: 7 | 7 | 7 | 85, preview floor_met TRUE (11:04:37.607599Z).
  NEW RECEIPT harvested on the way: the two reversal entries reached the rule-post
  consumer and were refused by name —
      11:02:10.258587Z  entry 301b6d5c...  not_a_draft
      11:02:10.461667Z  entry 87991d00...  not_a_draft
  A reversal is not a draft and can never be autoposted.

-------------------------------------------------------------------------
R5. NEW BLOCKER — THE OPENAI ACCOUNT IS OUT OF CREDITS (external, owner-only)
-------------------------------------------------------------------------
  clara.autodraft_attempts, filing b0b4f42f-e33d-458d-9a74-eb425f4741e0:
    {"code":"internal","message":"FatalError: Step \"...runAutoDraftModelStep\"
     failed after 3 retries: [autodraft_model:model_stream_error] model stream
     reported an error: Failed after 3 attempts. Last error: AI_APICallError:
     You have no credits remaining. Add credits to continue using the API at
     https://platform.openai.com/settings/organization/billing/."}
  Every remaining model-driven step is blocked until the owner tops up: no
  autodraft, no chat turn. This is what stopped floor_lost and buyer_mismatch.

  SECOND, SEPARATE GOVERNOR ALSO REACHED (a correct control, worth recording):
  the sandbox firm's SWEEP token budget for 2026-08-07 (UTC) is spent.
    clara.firm_usage_daily(39008536..., 2026-08-07) tokens_used = 733,685
    admission refuses when v_used + reserve > daily_token_limit * sweep_budget_share
    = coalesce(NULL,1000000) * 0.60 = 600,000.
  The receipt is distinguishable from the concurrency one by SHAPE, which is how I
  identified it: the token branch emits {"clr":"CLR29","reason":"refused_budget"}
  with NO "gate" key, the concurrency branch adds "gate":"concurrency".
    10:39:59.520229Z / 10:43:38.159522Z / 10:48:38.916661Z — all three token-budget.
  THERE IS NO PRODUCT VERB TO RAISE daily_token_limit (only
  set_firm_high_stakes_threshold exists), so I did NOT touch it — raising it would
  have meant a hand-written row.
  INSTEAD I used the product's own alternative door: clara.request_autodraft(filing)
  — the bookkeeper's one-click "draft this" button, granted to clara_authenticated,
  which admits with p_origin='one_click' and is checked against the FULL limit
  rather than the 60% sweep share. It runs the SAME autoDraft_v6 workflow and the
  SAME settle_autodraft_task, so it exercises the F1 fix exactly; only the
  admission origin differs (and no sweep_run_item is written).
  v_today is a UTC date, so the sweep share resets 2026-08-08T00:00Z.

-------------------------------------------------------------------------
R6. buyer_mismatch — NOT CAPTURED, and the plan for it was WRONG. A better
    wall was found instead.
-------------------------------------------------------------------------
  THE ASSIGNED PLAN ("approve 318cb587 to birth the second customer, then a
  mismatched-buyer synthetic") CANNOT PRODUCE buyer_mismatch, and the code says so.
  execute_rule_post selects the rule BY the draft's own resolved counterparty:
      select * into r from clara.coding_rules
        where id=any(v_locked_rule_ids) and client_id=e.client_id
          and counterparty_id=v_counterparty and direction=v_direction
          and rule_type='autopost' and status='live';
      if not found then ... 'no_live_rule'
  An invoice billed to customer B therefore drafts against B, finds no live rule
  for B, and returns no_live_rule — it never reaches control (b2). buyer_mismatch
  is reachable ONLY when the DRAFT names the rule's customer A while the DOCUMENT
  states a different buyer B: a mis-coded draft, which is exactly the attack (b2)
  exists to stop ("an invoice billing Buyer B can never be posted through Customer
  A's authority").
  So I built that shape honestly — document TEST-MY-INV-0020
  (aa8c24f3-0c55-4157-bafe-f10c8c96be88, corroborated, buyer "Fictional Unknown
  Buyer Sdn. Bhd." reg 209901000099) plus a CHAT draft instructed to bind the
  EXISTING customer Fictional Test Customer (reg 209901000002).

  *** FINDING F6 (a WALL, and a good one): THE CHAT LANE REFUSED TO MIS-CODE. ***
  It created no draft. It parked a clarify interruption
  (clara.agent_interruptions d1a4e901-54b1-4aac-b9aa-50757e915a7d, kind 'clarify',
  status 'pending'), quoting both parties and both registrations back at me:
    context : "The document is a filed MYR sales invoice issued by Fictional Test
               Services Sdn. Bhd. ... No draft has been created."
    question: "Please confirm the customer to bind for TEST-MY-INV-0020 before
               drafting. The invoice identifies the bill-to party as 'Fictional
               Unknown Buyer Sdn. Bhd.' with registration '209901000099', whereas
               the requested binding is the existing 'Fictional Test Customer Sdn.
               Bhd.' (registration 209901000002). Should the draft use the
               document-named customer, or is there a documented reason to bind it
               to the existing customer instead?"
  That is defence in depth working: the drafting lane caught the divergence and
  escalated to a human rather than producing the mis-coded draft that (b2) would
  later have had to catch. It also means buyer_mismatch cannot be reached through
  the chat lane without a human overriding an explicit, well-framed challenge.
  I did NOT override it — answering would have required insisting on a booking the
  agent had correctly questioned, and the credits ran out before that could be
  reconsidered. The parked turn was cancelled cleanly (cancel_agent_task, op_key
  h2r-cancel-chat-fixture-1) so nothing is left waiting.
  STATUS: buyer_mismatch remains UNPROVEN by execution. Its guard was read and its
  reachability is now precisely understood, which is more than the campaign had.

-------------------------------------------------------------------------
R7. TB + ISOLATION — RE-VERIFIED
-------------------------------------------------------------------------
  TB TIES TO THE SEN: debits 33,017,216 = credits 33,017,216, difference 0
  (approved, unreversed, client 9ab680ea...).
  journal_entries created since 10:30Z, by firm: ROME PUBLIC ADVISORY = 3
    (the 0019 autopost + the two deliberate reversals). Every other firm = 0.
  audit_log since 10:30Z by my actor 4f179b75, by firm:
    ROME PUBLIC ADVISORY = 23. Every other firm = 0.
  BELCORT sales lane still OFF: firm_limits(cde5917c...).sales_lane_active = f.
  B2 protected witness d023b48c-94fa-43a5-a544-cc4fe3b1163d: still status 'draft',
    posting_date 2026-07-31. NEVER approved.
  Stranded tasks: 0. Leader cycle-errors in the retained window at 11:06:23Z: 0.
  Git: no commits, no branch changes, nothing staged by me.

-------------------------------------------------------------------------
R8. FINAL CLAIM TABLE
-------------------------------------------------------------------------
  F1 fix accepted (task settles 'completed', zero strands,
     zero leader errors, race demonstrably unchanged)            PROVEN
  ocr_sales rule proposed -> previewed -> signed -> posted
     unattended (4 posts total across two rule ids)              PROVEN
  floor 6/6/60 + corroborated>=6, sales_invoice-only             PROVEN 7/7/7/85
  preview verb == the floor, in BOTH directions (met and lost)   PROVEN
  full 0023:304-346 predicate satisfied by the generator         PROVEN 12/12
  named skip receipts SEEN                                       8 of 11
     evidence_class_mismatch · over_cap · not_corroborated ·
     anchor_missing · counterparty_unresolved · window_exhausted ·
     not_a_draft · plus admission-side customer_ambiguous and
     refused_budget on BOTH its gates
  floor_lost                                                     NOT PROVEN (R4/R5)
  buyer_mismatch                                                 NOT PROVEN (R6)
  polarity_unverified · direction_unproven                       NOT REACHABLE from
     this lane (admission binds direction; set_document_kind writes a positive
     human classify verdict) — needs a deliberately unclassified document
  Half 2 CLOSES on the F1 criterion. Three named receipts remain outstanding and
  all three are blocked on ONE external fact: OpenAI credits. Nothing about the
  §7-A build blocks them.

-------------------------------------------------------------------------
R9. WHAT IS NEEDED TO FINISH THE LAST THREE
-------------------------------------------------------------------------
  1. Owner: top up OpenAI credits. Everything below needs one model call each.
  2. floor_lost: reverse two floor entries, then request_autodraft on document
     0b75d683-1147-4c63-ab60-731f3adc65a4 (TEST-MY-INV-0021, already ingested,
     corroborated, amount_due stated, filing b0b4f42f-e33d-458d-9a74-eb425f4741e0).
     Restore afterwards by approving two standing drafts, as R4 did.
  3. buyer_mismatch: document aa8c24f3-0c55-4157-bafe-f10c8c96be88 is ingested and
     ready. It needs a human to answer the clarify challenge (or an equivalent
     mis-coded draft) — an owner decision, not an agent one, and worth deciding
     deliberately given F6.
  4. F4 and F5 remain open as recorded in the campaign section.

=========================================================================
=========================================================================
CLOSING SESSION — post-credit-top-up — 2026-08-07 11:10Z–11:23Z
lane-7a-h2 · sandbox only · product doors only
=========================================================================

C0. THE UNBLOCK — VERIFIED, then a SECOND governor bit
-------------------------------------------------------------------------
The OpenAI credit failure is GONE: the chat lane ran a full model segment at
11:18:03Z and produced a considered, well-formed refusal (C1) rather than the
`AI_APICallError: You have no credits remaining` of 11:03Z. Credits confirmed.
BUT a different governor was already at the line and I did not check it first:
    clara.firm_usage_daily(39008536..., 2026-08-07).tokens_used = 1,058,524
    daily_token_limit is NULL -> the 1,000,000 default. FULL limit exceeded.
So `request_autodraft` (one_click, checked against the FULL limit) now refuses
too: 11:21:12Z -> {"reason":"refused_budget","outcome":"refused_budget"}.
NO drafting of any kind is possible on this firm until the UTC day rolls
(v_today = (now() at time zone 'UTC')::date -> resets 2026-08-08T00:00Z).

C1. buyer_mismatch — NOT REACHABLE THROUGH ANY LANE THE PRODUCT EXPOSES
-------------------------------------------------------------------------
Preparation completed as instructed: draft 318cb587 was APPROVED (op_key
h2c-birth-buyer-1), which BIRTHED the second customer —
  40dd3f9a-0691-4600-8ebe-95669311df6a "Fictional Unknown Buyer Sdn. Bhd."
  name_normalized fictionalunknownbuyersdnbhd, registration 209901000099, kind customer
That makes the fixture STRONGER than the null case: the document's stated buyer
now resolves to a real, live, DIFFERENT customer.

THE FIXTURE STILL CANNOT BE BUILT, and there are now THREE independent reasons,
each measured rather than argued:

  (i) THE UNATTENDED LANE CANNOT DIVERGE. execute_rule_post selects the rule BY
      the draft's own resolved counterparty (`and counterparty_id=v_counterparty`),
      so an invoice billed to customer B drafts against B, finds no rule for B,
      and returns `no_live_rule` — control (b2) is never reached. And the drafter
      reads the counterparty FROM the document, so draft and document can never
      disagree in this lane. (Established in the RE-RUN section, R6.)

  (ii) THE CHAT LANE REFUSES, ON PRINCIPLE, EVEN WITH A DOCUMENTED REASON.
      The first attempt (10:54Z) parked a clarify asking whether there was "a
      documented reason". I gave one — explicitly: an ADR-048 labelled-synthetic
      adversarial acceptance fixture for control (b2), in the sandbox, whose whole
      point is that the draft must be REFUSED and never posted. The lane refused
      again and rejected the justification itself
      (clara.agent_interruptions 806c73fd-8107-4aa3-8259-1e70dfe25a5c, kind
      'clarify', status 'pending', 11:18:03Z):
        context : "TEST-MY-INV-0020 identifies Fictional Test Services Sdn. Bhd.
                   as issuer and Fictional Unknown Buyer Sdn. Bhd. as bill-to
                   customer. The requested existing counterparty is a different
                   legal entity. A labelled synthetic/adversarial test designation
                   does not permit a deliberately inaccurate accounting draft."
        question: "...I cannot bind the receivable to Fictional Test Customer Sdn.
                   Bhd. (registration 209901000002) because that contradicts the
                   invoice's bill-to identity."
      I did NOT push a third time. Two correctly-reasoned refusals of a request to
      create a knowingly false accounting record is a wall behaving exactly as it
      should, and coercing past it would have been the wrong act regardless of the
      receipt it would have bought. The turn was cancelled cleanly (op_key
      h2c-cancel-chat-b2-1).

  (iii) NO THIRD DOOR STAMPS coding_kind. The human `draft_entry` verb has no
      coding_kind parameter (the known blocker, and 7A-R12 keeps hand-drafts
      never-autopost-eligible), so a hand-drafted entry carries coding_kind NULL
      and cannot match a sales rule at all.

  THE ONE THEORETICAL ROUTE, IDENTIFIED AND DELIBERATELY NOT TAKEN: a counterparty
  LANDSCAPE CHANGE between draft and post. Draft normally against customer A, then
  retire A before the rule-post consumer runs; (b2) re-resolves the stated buyer,
  finds the match retired, gets decision='birth', v_buyer_id null -> buyer_mismatch.
  Not taken because retiring f5c1116c would destroy the earned floor and the live
  rule, and there is no un-retire verb — a large, irreversible act on the sandbox's
  core fixture to buy one receipt.

  CONCLUSION, stated as a property rather than a gap: control (b2) is defence in
  depth for a draft shape that NO LANE THE PRODUCT CURRENTLY EXPOSES CAN PRODUCE.
  It is a backstop for a future draft source (a bulk import, an API-created draft,
  a counterparty merge/retire race) rather than dead code. That is a more useful
  answer than a forced green would have been, and it is now evidenced from three
  directions instead of asserted.

C2. floor_lost — NOT CAPTURED, AND I BROKE THE FLOOR TRYING. My error.
-------------------------------------------------------------------------
  WHAT I DID, in order:
    11:20Z  reverse_entry 977ee82c (TEST-MY-INV-0011) -> reversal
            aa0b2a18-a76b-4cc5-9319-19d9e39a2342, op_key h2c-rev-0011-1
    11:20Z  reverse_entry de74c4a8 (TEST-MY-INV-0015) -> reversal
            bb68dd1b-2fe2-41bd-b2d1-ffc2f486020a, op_key h2c-rev-0015-1
            FLOOR: 7|7|7|85  ->  5|5|5|85   (below the threshold, as intended)
    11:21:12Z request_autodraft(b0b4f42f...) on TEST-MY-INV-0021 ->
            {"reason":"refused_budget","outcome":"refused_budget"}
  The trigger could not run, so execute_rule_post never evaluated and floor_lost
  never fired. The floor is now BROKEN AND CANNOT BE RESTORED TODAY.

  WHY IT CANNOT BE RESTORED: restoring needs one more APPROVED, CORROBORATED,
  document-bound, coding_kind='sales_invoice' entry for (f5c1116c, 4000), and the
  only remaining drafts are
    16543e9d  the CN  (sales_credit_note — wrong kind, and not corroborated)
    d10eb6f5  0014    (sales_invoice but corroborated=false — it would lift
                       qualifying to 6 while corroborated stays 5, so the floor
                       still would not be met, and it would burn the
                       not_corroborated witness for nothing)
    d023b48c  the PROTECTED B2 witness — never touched
  and creating any new draft requires a model call, which the exhausted daily
  budget forbids until 2026-08-08T00:00Z.

  THIS IS MY PROCESS ERROR AND I AM NAMING IT: I verified that CREDITS were
  restored and treated that as sufficient, then performed a DESTRUCTIVE step whose
  recovery depended on a DIFFERENT resource — the firm's daily token budget — that
  I had measured as near-exhausted an hour earlier and did not re-check. The rule I
  broke is the ordinary one: before an irreversible step, confirm the evidence
  supports the whole sequence, not just the next call. The correct order was to
  probe the budget with the trigger FIRST and reverse only once the draft existed.

  THE STATE IS SAFE, WHICH IS NOT THE SAME AS TIDY. Every wall is fail-closed: rule
  12c495dd is live but cannot post (a post attempt would now correctly skip
  floor_lost), and the preview verb says so honestly —
    11:22:17.239468Z  floor_met FALSE, qualifying 5, distinct_invoices 5,
                      corroborated 5, span_days 85, rule_status "live"
  No real client, no other firm, and no posted number is affected.

  EXACT RESTORATION RECIPE (any lane, after 2026-08-08T00:00Z):
    1. request_autodraft on filing b0b4f42f-e33d-458d-9a74-eb425f4741e0
       (TEST-MY-INV-0021, document 0b75d683-1147-4c63-ab60-731f3adc65a4 — already
       ingested, corroborated, amount_due stated, buyer resolves to f5c1116c).
       WITH THE FLOOR STILL AT 5 THIS IS ALSO THE floor_lost TRIGGER: the draft
       will reach (e2) under pg_advisory_xact_lock(203005004, hashtext(client_id))
       and the receipt lands in clara.rule_post_skips. Capture it — that closes the
       last cell.
    2. Then approve that same draft as the RPA human -> floor 5 -> 6.
    3. Ingest SYNTHETIC-TEST-MY-INV-0022.pdf (already generated at
       .tmp/h2/corpus/), draft, approve -> floor 6 -> 7. Restored.
  Two model calls total. Nothing else is needed and nothing else is outstanding.

C3. TB + ISOLATION — RE-VERIFIED AT CLOSE
-------------------------------------------------------------------------
  TB TIES TO THE SEN: debits 33,038,416 = credits 33,038,416, difference 0
    (approved, unreversed, client 9ab680ea...).
  journal_entries created since 11:10Z, by firm: ROME PUBLIC ADVISORY = 2
    (the two deliberate reversals). Every other firm = 0.
  audit_log since 11:10Z by my actor 4f179b75, by firm:
    ROME PUBLIC ADVISORY = 5. Every other firm = 0.
  BELCORT sales lane still OFF: firm_limits(cde5917c...).sales_lane_active = f.
  B2 protected witness d023b48c-94fa-43a5-a544-cc4fe3b1163d: status 'draft',
    posting_date 2026-07-31. NEVER approved, never touched.
  Stranded agent tasks: 0.  Leader cycle-errors in the retained log window: 0.
  Git: no commits, no branch changes, nothing staged by me.

C4. THE COMPLETED CLAIM TABLE — §4.2 and the nine controls
-------------------------------------------------------------------------
  §4.2 CLAIMS
    ocr_sales rule PROPOSED -> SIGNED -> POSTED UNATTENDED,
       the envelope's first exercise ever                        PROVEN (4 posts,
       entries 14dfc792 / 6825b0a9 / ac6f9d9a / c72dbc16, across rules a3f93bfe
       and 12c495dd)
    floor >=6/>=6/>=60d + corroborated>=6, sales_invoice-only     PROVEN (peaked
       7/7/7/85; deliberately at 5/5/5/85 at handback, see C2)
    generator satisfies the FULL 0023:304-346 predicate           PROVEN 13/13
       tax-stating synthetics corroborated, two-reader agreement on net AND tax
    preview verb == the floor, both directions                    PROVEN
    NOT claimable: real-document autopost / MyInvois XML          not attempted
    F1 fix accepted (settle 'completed', zero strands,
       zero leader errors, race unchanged)                        PROVEN

  THE NINE CONTROLS — receipts SEEN (8 named post-time tokens + 3 admission-side)
    1 evidence class re-derived from the lane   evidence_class_mismatch   SEEN x2
    2 positive polarity                          polarity_unverified       NOT REACHABLE
        (set_document_kind writes a positive human classify verdict; needs a
         deliberately unclassified document)
    3 hard direction evidence                    direction_unproven        NOT REACHABLE
        (admission BINDS direction; an unprovable document never drafts)
                                                 buyer_mismatch            NOT REACHABLE
        (three independent reasons — C1)
    4 full multi-anchor corroboration            anchor_missing            SEEN
                                                 not_corroborated          SEEN
    5 existing resolved customer only            counterparty_unresolved   SEEN
                                                 customer_unresolved       NOT REACHABLE
        (needs the RULE's own counterparty retired — destroys the floor)
    6 the earned floor                           floor_lost                NOT CAPTURED
        (reachable; blocked only by the token budget — recipe at C2)
    7 bounds per WA21-R10                        window_exhausted          SEEN
                                                 over_cap                  SEEN x2
    8 re-derivation at post time                 (the mechanism behind all of the
        above; every receipt above IS control 8 firing)           PROVEN
    9 ambiguity => visible skip + draft stays    every skip above left its draft
        in the human queue                                        PROVEN
    plus, outside the nine: not_a_draft SEEN x2 (reversals refused), and
    admission-side customer_ambiguous, refused_budget on BOTH gates (concurrency
    and token), refused_attempts/cancelled.

C5. WHAT REMAINS — ONE CELL, ONE CAUSE
-------------------------------------------------------------------------
  floor_lost is the ONLY outstanding receipt that is reachable at all, and it is
  blocked solely by the firm's daily token budget resetting at 2026-08-08T00:00Z.
  The C2 recipe closes it and restores the floor in the same two calls.
  polarity_unverified, direction_unproven, buyer_mismatch and customer_unresolved
  are NOT REACHABLE from any lane the product exposes today — each for a stated,
  measured reason, not for want of trying. If the owner wants them exercised, each
  needs a deliberate new capability (an unclassified-document fixture, a
  non-model draft source, or a counterparty landscape-change harness) and that is
  a design decision, not an acceptance step.
  Half 2's substantive claim — the OCR-sales envelope proposes, signs, posts
  unattended, and refuses by name at every wall it can be shown — is CLOSED.

=========================================================================
=========================================================================
TASK #29 — floor_lost CAPTURED + FLOOR RESTORED
lane-29 · sandbox only · product doors only · 2026-08-07 12:08Z-12:26Z
Precondition (verified, not assumed): clara.firm_limits(39008536...).
  daily_token_limit = 2000000 (raised from the NULL/1,000,000 default that
  blocked C2). Fresh RPA session minted (node mint_rpa_jwt.mjs) before use;
  the stale token had 7 minutes left.
=========================================================================

T1. STARTING STATE — RE-VERIFIED, NOT ASSUMED
-------------------------------------------------------------------------
  preview_ocr_sales_evidence(12c495dd) at 12:11:46.274674Z:
    floor_met FALSE, qualifying 5, distinct_invoices 5, corroborated 5,
    span_days 85 — matches C2's handback exactly.
  rule 12c495dd: status 'live', counterparty f5c1116c, evidence_class
    ocr_sales, 1 post already landed in the August window (cap 3/month).
  Document 0b75d683 (TEST-MY-INV-0021): status 'ingested', document_kind
    'invoice', filed under document_filings b0b4f42f (never touched since
    C2 — filed_at 2026-08-07 11:01:32Z, retired_at null).

T2. THE floor_lost RECEIPT — SEEN, VERBATIM (closes the last §7-A cell)
-------------------------------------------------------------------------
  request_autodraft(p_filing:'b0b4f42f-e33d-458d-9a74-eb425f4741e0') ->
    {"outcome":"already_done","task_id":"3f968f84-e879-4c03-b48a-04c5a4836500"}
  The runtime's own periodic sweep had reached this filing 15 seconds before
  my call (open_sweep_run 12:08:50.286717Z, admit_autodraft_task, origin
  'sweep', task 3f968f84) and drafted it at 12:09:05.418652Z (draft_entry,
  actor 00000000-0000-4000-8000-000000c1a7a0, entry
  c0fb26f1-59c0-44e2-9026-63eefce30be6, op_key
  code-doc:3f968f84-...:0b75d683-...) — my request_autodraft call landed
  after the draft already existed, hence "already_done". With the floor
  still at 5|5|5|85, the entry reached execute_rule_post under
  pg_advisory_xact_lock(203005004, hashtext(client_id)) and was refused.

  THE RECEIPT — clara.rule_post_skips, VERBATIM, ALL COLUMNS:
    id          aa87e30e-80a9-4f1e-8a80-98f595f7b1c9
    firm_id     39008536-838f-478c-9eee-ff1e84b77aa9
    client_id   9ab680ea-a570-4713-89b5-28bca458ee2c
    entry_id    c0fb26f1-59c0-44e2-9026-63eefce30be6
    rule_id     12c495dd-9d17-4819-8d61-8deca2a0c8fe
    reason      floor_lost
    created_at  2026-08-07 12:09:05.522554+00

  THIS IS THE LAST OF THE NINE CONTROLS' NAMED SKIP TOKENS TO BE SEEN.
  §4.2's "the earned floor" control (control 6) is now PROVEN by direct
  observation, not derivation.

T3. RESTORATION STEP 1 — entry c0fb26f1 (0021) APPROVED, floor 5 -> 6
-------------------------------------------------------------------------
  revision_token read fresh immediately before approving: ba2665b3-f8ec-
  48f5-8a33-7a15c0cf2e00 (entry still 'draft', unchanged since 12:09:05Z).
  approve_entry(p_entry:'c0fb26f1-...', p_expected_revision:'ba2665b3-...',
    p_attestation:null, p_op_key:'task29-approve-0021-1') ->
    {"status":"approved","entry_id":"c0fb26f1-..."}
  audit_log, 12:12:54.8897Z: approve_entry, actor 4f179b75 (RPA human),
    checked_via_rule_id: null (a genuine human approval of a standing
    draft, not a rule-post — matches the C3/R4 pattern exactly).
  preview_ocr_sales_evidence(12c495dd) at 12:12:58.637393Z:
    floor_met TRUE, qualifying 6, distinct_invoices 6, corroborated 6,
    span_days 85. THE FLOOR IS RESTORED TO THE REQUIRED MINIMUM.

T4. RESTORATION STEP 2 — SYNTHETIC-TEST-MY-INV-0022 ingested, filed, drafted
-------------------------------------------------------------------------
  Ingested via the product's intake transport (begin/bytes/finalize):
    document 90702695-d62f-417c-ac60-ea292936dbbb, 1917 bytes, application/pdf.
    (First BEGIN attempt hit HTTP 503 — one runtime health check was
    'critical' at that moment, `context deadline exceeded`; a retry ~40s
    later succeeded cleanly. Not treated as a blocker: the other check was
    passing throughout and the retry worked on the first try.)
  set_document_kind(p_document, p_kind:'invoice', p_reason:'Clara task #29
    -- floor restoration, sandbox sales invoice #0022 (labelled-synthetic
    ADR-048 fixture)', p_op_key:'task29-kind-0022-1') -> ok, prior_kind null.
  file_document(p_document, p_client:'9ab680ea-...', p_resolution:'' (empty
    string, as instructed), p_op_key:'task29-file-0022-1') ->
    {"client_id":"9ab680ea-...","filing_id":"e86d3b1a-5dd7-4153-ad55-
    a3f88144feca","document_id":"90702695-..."}
  Extraction pipeline completed ~80s later (ocr -> doc_classify ->
  invoice_facts, all 'done'). clara._invoice_fact_state(90702695...):
    corroborated true, invoice_id TEST-MY-INV-0022, gross 58300 cents
    (net 55000 + tax 3300), customer_registration 209901000002 (resolves
    to f5c1116c, the rule's counterparty).
  request_autodraft(p_filing:'e86d3b1a-...') ->
    {"outcome":"admitted","task_id":"90c0ef0a-e885-4042-b039-ff8fbe91485c"}
  NOT refused_budget — the raised limit held (tokens_used stayed well under
  daily_token_limit throughout; see T6).

T5. FINDING — 0022 SELF-POSTED. It counts as the F1 fix's SECOND clean
    unattended post, but NOT toward the floor. The recipe's "floor 6->7"
    expectation does not hold once the rule is already live and the floor
    is already met. Floor settles at 6, durably met, not 7.
-------------------------------------------------------------------------
  Task 90c0ef0a completed at 12:20:50Z. The resulting entry
  6413f8f5-ad2d-4a01-8394-e2e4cd1c41e4 was ALREADY status 'approved' by the
  time I read it — the SAME ~100ms race documented in the RE-RUN section
  (R1), reproduced a second time, cleanly:
    12:20:50.121718Z  draft_entry    actor 00000000-...-c1a7a0 (agent)
                       op_key code-doc:90c0ef0a-...:90702695-...
    12:20:50.228282Z  approve_entry  actor 4f179b75 (rule's signer)
                       op_key rulepost:6413f8f5-...:611
                       checked_via_rule_id 12c495dd-9d17-4819-8d61-8deca2a0c8fe
    12:20:50.531358Z  settle_autodraft_task outcome 'drafted' -> ok, tokens
                       91193 (task 90c0ef0a 'completed', error_code null;
                       zero strand, zero leader cycle-errors — F1 holds)
  rule_post_runs f539fd5e-2297-4e2c-a2b7-aeda51c8eb20: rule 12c495dd,
    entry 6413f8f5, posted_at 12:20:50.228282Z, posted_total_cents 58300.
    Rule 12c495dd's window is now 2/3 for August (was 1/3 before this task;
    rule status/config untouched, per the hard rule).
  LINES (balanced): 1200 Trade receivables Dr 58300 | 4000 Service revenue
    Cr 55000 | 2300 SST output tax payable Cr 3300.

  WHY THIS DOESN'T RAISE THE FLOOR — read from the function itself
  (clara._ocr_sales_floor_pop), not inferred:
    "...and j.status='approved' and j.reversed_by is null
     and j.checked_via_rule_id is null and j.document_id is not null
     and j.coding_kind='sales_invoice' ..."
  checked_via_rule_id IS NULL is an explicit exclusion: an entry the rule
  posted ITSELF can never count as evidence for its OWN authority (correct,
  anti-circular design — otherwise a live rule could bootstrap its own
  floor indefinitely). c0fb26f1 (0021) counts because a HUMAN approved a
  standing draft directly (checked_via_rule_id stays null on that path,
  same as the original R4/C3 restorations). 6413f8f5 (0022) does NOT count
  because the rule's own event-driven consumer reached it first and posted
  it before any human could intervene — the identical ~100ms race that
  makes autopost autopost.
  preview_ocr_sales_evidence(12c495dd) at 12:26:15.089334Z (FINAL READING):
    {"floor_met":true,"qualifying":6,"distinct_invoices":6,"corroborated":6,
     "span_days":85,"rule_status":"live","tax_silent_documents":0}
  qualifying stopped at 6, not 7 as the recipe anticipated. The corpus
  generator's own comment (.tmp/h2/make_corpus.py:74, written by a prior
  session) calls 0022+0023 "the floor RESTORATION pair" — SYNTHETIC-TEST-
  MY-INV-0023.pdf exists, pre-generated, unused, net 65000 cents (under the
  RM2,000 cap, so it would NOT trigger over_cap either). Reaching a literal
  7 from here needs an entry that reaches execute_rule_post and is REFUSED
  (any named reason) rather than posted, then approved by hand — e.g. a
  document hitting window_exhausted on the 4th attempt of a window already
  at 3/3. That needs at least one more document than 0023 alone can supply
  (0023 would most likely just become the rule's 3rd post this window and
  be excluded the same way 0022 was). I deliberately stopped rather than
  spend more of the shared daily budget chasing a number that is not
  itself the acceptance criterion — floor_met TRUE is the requirement
  (7A-R4/C5: qualifying>=6, distinct_invoices>=6, corroborated>=6,
  span_days>=60), and it is met, durably, by a genuinely human-approved
  entry with room above nothing (6 of 6 required, no headroom, but MET).
  0023 is left untouched at .tmp/h2/corpus/SYNTHETIC-TEST-MY-INV-0023.pdf
  for the owner to decide whether chasing literal 7 (or completing
  window_exhausted's approval-side receipt) is worth a follow-up task.

T6. TB + ISOLATION + WITNESS — RE-VERIFIED AT CLOSE
-------------------------------------------------------------------------
  TB TIES TO THE SEN: debits 33,133,816 = credits 33,133,816, difference 0
    (approved, unreversed, client 9ab680ea..., clara.journal_lines join
    clara.journal_entries).
  B2 protected witness d023b48c-94fa-43a5-a544-cc4fe3b1163d: status
    'draft', posting_date 2026-07-31. NEVER approved, never touched by me.
  Rule 12c495dd: status 'live', UNCHANGED by me (only read via preview).
  Stranded agent_tasks (status running/cancel_requested), firm-wide: 0.
  My two tasks (3f968f84 pre-existing/sweep, 90c0ef0a mine/one_click):
    both 'completed', error_code null.
  Leader cycle-errors in the retained fly log window: 0 (`fly logs
    --no-tail | grep -iE "cycle-error|draft settlement entry not found"`
    returned nothing).
  Isolation: audit_log rows by actor 4f179b75 since 12:08Z, by firm:
    ROME PUBLIC ADVISORY (39008536) = 8. Every other firm = 0. I did not
    touch BELCORT (cde5917c) or any other firm; concurrent activity seen
    in the shared audit_log (a different client e054b797 under the SAME
    sandbox firm running an unrelated H1 corpus campaign; 7 new
    journal_entries in firm cde5917c from other lanes) belongs to other
    concurrent lanes, not to this task.
  clara.firm_usage_daily(39008536, 2026-08-07).tokens_used = 1,333,575 of
    daily_token_limit 2,000,000 at close (the raise held throughout; no
    refused_budget was ever seen on this task).

T7. RESULT
-------------------------------------------------------------------------
  floor_lost: CAPTURED, verbatim, receipt aa87e30e-80a9-4f1e-8a80-
    98f595f7b1c9. This was the LAST of the nine controls' named skip
    tokens outstanding — §7-A's negative battery is now COMPLETE:
    evidence_class_mismatch, over_cap, not_corroborated, anchor_missing,
    counterparty_unresolved, window_exhausted, not_a_draft, floor_lost all
    SEEN; polarity_unverified/direction_unproven/buyer_mismatch/
    customer_unresolved remain NOT REACHABLE from any lane the product
    exposes today, each for the specific measured reason already on file
    in C1/C4/R6 (unchanged by this task).
  Floor: RESTORED to floor_met TRUE, 6/6/6/85 (met at exactly the required
    minimum, not at the pre-incident 7/7/7/85 peak — see T5 for the
    mechanistic reason execution stopped at 6, not 7).
  Bonus: a SECOND clean unattended ocr_sales autopost (entry 6413f8f5,
    rule 12c495dd), zero strand, zero leader error — further live evidence
    the F1 fix (0047_settle_guard_identity, runtime v57) holds under real
    traffic, on top of the RE-RUN section's first post.
```
