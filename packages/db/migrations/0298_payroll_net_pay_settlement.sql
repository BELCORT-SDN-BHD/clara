-- 0298_payroll_net_pay_settlement -- #947 (riders wave 4, lane 01): 工资净额从银行对账单中找到并提出
-- 结清方案 · FIND THE NET-PAY PAYMENT ON THE BANK STATEMENT AND PROPOSE ITS SETTLEMENT.
-- =====================================================================================
-- Spec of record: issue #947's Agent Brief (the body is the only Agent Brief; both comments are
-- AI-triage coordination notes dated 2026-09-18/19, not owner rulings, and nothing on this ticket
-- is dated 2026-09-20 -- so the body stands and both comments are followed as guidance, each
-- discharged where it lands, below). Parent #926 (owner ruling 2026-09-18, question 4): "always
-- two steps, and Clara finds the payment." Blocked by #946 (0297_payroll_summary_posting.sql,
-- same lane, already applied on this database): "there is nothing to settle until a payroll entry
-- posts."
--
-- THE SHAPE THIS FILE REUSES, NEVER RE-INVENTS (WAVE-4 LANE RULE (c)). CONTEXT.md's "Settlement
-- candidate row" (#657's pending bank line, ratified D14): a row DERIVED from live state, storing
-- nothing, that clears itself the moment the underlying facts stop producing it, offers
-- candidates and never chooses. This file's read is that shape applied to payroll: a posted
-- payroll run whose net pay has not yet left the bank, and the bank lines that could be it. The
-- ACT of accepting a candidate reuses #657's own MATCHING core (`clara._match_bank_line_core`,
-- 0121:1863, recut 0226) directly -- literally "through an existing bank-side door" (AC2) -- so
-- every lock, every exclusivity guarantee and every exception wall that already protects a bank
-- line from being claimed twice protects this settlement too, unchanged.
--
-- WHY NOT `clara.settle_from_bank_line` (#655/#657's own settlement composite). MEASURED before
-- writing a line of this file: `clara._settle_from_bank_line_core` (0044:1706) requires a
-- `p_counterparty` whose `clara.counterparties.kind` is `'customer'` or `'vendor'`
-- (`counterparties_kind_check`, 0015:160) and posts through `clara._allocate_receipt_core` /
-- `clara._allocate_payment_core`, the AR/AP SUBLEDGER composites (`clara.open_items.domain in
-- ('ar','ap')`, 0037:730) that require a `counterparty_id`. A payroll run's net-pay leg carries
-- NO counterparty (#946's own S3 cell: "no leg carries a counterparty: salaries payable is
-- deliberately not a control account") -- payroll is neither a customer nor a vendor relationship,
-- and forcing one through that door would mean inventing a fictitious counterparty for the sole
-- purpose of satisfying a domain check that does not describe what a payroll run is. #657's own
-- header names the reason this file's settlement is NOT that composite: "No settlement door (#655
-- births the open item, #657 allocates...)" -- #655/#657 SPECIFICALLY decline to mint a new
-- settlement door and reuse the ONE that exists; this file is in the same position #655 was
-- (there is no AR/AP open item here, and never will be -- 2040 Salaries Payable is an ORDINARY
-- liability by #946 AC1's own design, "deliberately not a control account"), so it mints the one
-- settlement door a NON-SUBLEDGER liability genuinely needs, and reuses the ONE matching door
-- (`match_bank_line`'s own core) for everything downstream of "an approved entry now touches the
-- bank's own GL code."
--
-- THE ARITHMETIC THIS FILE CHECKED AGAINST THE STANDARD BEFORE WRITING IT (MPERS/MFRS, ordinary
-- liability derecognition -- MFRS 9.3.3.1 / MPERS Section 11: a financial liability is
-- derecognised when the obligation is discharged, i.e. paid). Settling a payroll run's net pay is
-- Dr Salaries Payable (2040) / Cr Bank, for the amount actually paid -- the SAME entry #946's own
-- header worked out by hand and the SAME leg the brief names ("debit salaries payable and credit
-- the bank"). Nothing about this settlement is a new accounting POLICY; it is the second half of
-- the two-step #926 ruling names, and its correctness rests entirely on tying the settlement
-- amount to the SAME 2040 leg the payroll entry already posted, never to a number re-typed by a
-- human or re-derived by an agent.
--
-- WHY "UNSETTLED" IS A LEDGER FACT, NOT A MARKER -- AND WHY THAT IS WHAT MAKES ALL THREE ROUTES
-- WORK (AC3: "whether Clara proposed it, a person recorded it by hand, or the bank reconciliation
-- cleared it"). `clara._payroll_net_pay_unsettled` (below) computes, per client, a FIFO
-- allocation of every approved, non-reversed DEBIT to 2040 (however it was booked -- through this
-- file's own settlement door, through the ordinary "new journal entry" screen by a person's own
-- hand, or booked by hand and THEN matched to a bank line through the ordinary /bank
-- reconciliation flow) against every approved, non-reversed CREDIT to 2040 that carries the
-- `flags->'payroll_run'` marker (#946's own duplicate-guard marker, pinned below), oldest run
-- first. No new marker convention is invented for "this debit settles that run" -- the row
-- disappears the moment the account's own balance says the run is covered, by construction, which
-- is what makes all three routes clear it without three different code paths.
--
-- 2040 IS NOT PAYROLL-RUN-EXCLUSIVE, MEASURED, NOT ASSUMED -- A FIRST CUT OF THIS FILE ASSUMED IT
-- WAS AND ITS OWN PRESTATE, RUN AGAINST THE LANE DATABASE, PROVED IT WRONG. #946's own duplicate
-- guard names a SECOND lane that can credit 2040: `0194_periodic_adjustments.sql` (#643), whose
-- recurring-obligation templates let a bookkeeper name ANY liability account (not hardcoded --
-- grepping the migration ladder for the literal '2040' finds only 0295, which mints the row, and
-- 0297; the periodic-adjustment lane's own account choice is DATA, made per template, invisible
-- to a migration-text grep) and stamps `flags->'payroll_obligation'` on what it books (0225:1830,
-- driven live in payroll-summary-posting.test.mjs's own S2 duplicate-guard cell, which drafts
-- exactly such a row against 2040 to prove #946's guard sees it). #946's own guard treats a
-- `payroll_run` credit and a `payroll_obligation` credit for the SAME client+month as MUTUALLY
-- EXCLUSIVE (one blocks the other), so the two credit sources never overlap for one month -- but
-- nothing stops a DIFFERENT month's periodic-adjustment obligation from sharing the account with
-- a real payroll run's net pay. So BOTH the credit and the debit sides below explicitly exclude
-- any entry flagged `payroll_obligation`: it is a DIFFERENT liability instance that happens to
-- share the account by a firm's own bookkeeping choice, never this run's own net pay and never a
-- payment toward it.
--
-- THE WINDOW. AC1 asks for candidates "within the agreed window" around the payslip's own month
-- end. Ten calendar days either side (`c_window_days` below): Malaysian payroll typically clears
-- within days of month end (statutory EPF/SOCSO/EIS/PCB remittances are due by the 15th of the
-- FOLLOWING month, and net-pay bank runs commonly precede those), and ten days is generous enough
-- to admit an early run ahead of a public holiday without also admitting an unrelated payment from
-- a different month. AMOUNT is never "within tolerance" -- Q3/SYNTHESIS J2's own law from #657
-- ("a DETERMINISTIC basis, never a score") applies here exactly: a candidate's amount must equal
-- the run's own unsettled cents to the cent, or it is not offered at all.
--
-- WHAT THIS FILE DOES NOT ADD. No table (the candidate row is computed, never stored -- CONTEXT.md
-- "Settlement candidate row" `_Avoid_`: "A row that survives the fact that produced it"). No
-- dismissal mechanism (AC2: "declining leaves the row untouched" -- there is nothing to leave
-- untouched but the read itself; the row simply keeps appearing). No new `accounting_work.purpose`,
-- no new event type (the settlement entry's post reuses `entry.posted`, the SAME event every other
-- posting emits, and the match reuses `bank.match_created`, emitted by the reused core itself). No
-- widening of `clara.entry_post_receipts.via_wake_kind` -- `'interactive'` is ALREADY admitted
-- (#946's own 0297 widening added `'payroll_facts'` beside it; this file's settlement is a HUMAN
-- decision act and rides the value that already exists for exactly that case). No open_items row,
-- no counterparty, no AR/AP subledger touch of any kind.
-- =====================================================================================

do $p947_prestate$
declare
  v_sha text; v_n int; v_def text;
begin
  -- The neighbour this file's whole settlement rests on: #946's own poster, whose `flags` shape
  -- (`{"payroll_run": {"period_month": "YYYY-MM-DD", ...}}`) is the ONE marker
  -- `clara._payroll_net_pay_unsettled` reads to tell a payroll run's own credit leg apart from
  -- anything else that might one day touch 2040. If this body's flags shape ever moves, this
  -- file's ledger read must move with it -- pinned so that a future recut collides here rather
  -- than silently mis-reading the marker.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._post_payroll_run(uuid)'::regprocedure;
  if v_sha <> '482d3cebb2c80629b9785ee6fef76dd2b8dd3121a7268d6c31dbfa95e4afb05b' then
    raise exception '#947 prestate: clara._post_payroll_run has DRIFTED from its pinned #946 body (sha %) -- the payroll_run flags marker this file reads may have moved; re-derive clara._payroll_net_pay_unsettled against the live body before applying', v_sha using errcode='CLR10';
  end if;

  -- THE MATCHING CORE THIS FILE REUSES, VERBATIM, AS "AN EXISTING BANK-SIDE DOOR" (AC2). Pinned
  -- because this file's settlement door calls it DIRECTLY (threading ctx rather than going
  -- through the public `match_bank_line` wrapper, the `_settle_from_bank_line_core` idiom) --
  -- if its validation or its locking order ever moves, this file's own correctness moves with it.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._match_bank_line_core(jsonb,uuid,jsonb,jsonb,jsonb,boolean,text)'::regprocedure;
  if v_sha <> '42094d4b8ea1b4e3a027d1122000308e3a5b4514cd63d9a2cda2dec0e4eadcf2' then
    raise exception '#947 prestate: clara._match_bank_line_core has DRIFTED from its pinned live body (sha %) -- re-derive this file''s reuse of it before applying', v_sha using errcode='CLR10';
  end if;

  -- NON-SHA CLAIM 1: 2040 Salaries Payable is still the CURRENT published platform template's
  -- ordinary-liability row (same check #946's own AC1 cell runs, re-derived here rather than
  -- trusted, because this file hardcodes the literal '2040' exactly as #946's drafting body does
  -- -- WAVE-4 LANE RULE (a): "consume them by code and name").
  if not exists (
    select 1 from clara.coa_template_accounts a
      join clara.coa_templates t on t.id = a.template_id
     where t.template_key = 'my_sme_starter' and t.scope = 'platform' and t.state = 'published'
       and t.version = (select max(t2.version) from clara.coa_templates t2
                          where t2.template_key='my_sme_starter' and t2.scope='platform'
                            and t2.state='published')
       and a.account_code = '2040' and a.name = 'Salaries Payable'
       and a.account_type = 'liability' and a.account_class is null
  ) then
    raise exception '#947 prestate: the CURRENT published platform template does not carry 2040 Salaries Payable as an ordinary liability -- #946''s AC1 has moved' using errcode='CLR10';
  end if;

  -- INFORMATIONAL ONLY, NOT A GATE. Route (b) of AC3 -- "a person recorded it by hand" -- is a
  -- PLAIN, unflagged debit to 2040 by design (the brief's own second route, and S4's own cells
  -- drive it for real): once this file's settlement door and that hand-booking route are both
  -- live, an unflagged 2040 leg is NORMAL, not a defect, so this can never be a hard refusal (a
  -- first cut made it one and it refused its own file's own test fixtures on the very next redo).
  -- Counted here only so a reviewer can see, at apply time, how many legs the three NAMED lanes
  -- (payroll_run / payroll_obligation / payroll_settlement) account for versus everything else.
  select count(*) into v_n from clara.journal_lines jl
    join clara.journal_entries je on je.id = jl.entry_id
   where jl.account_code = '2040'
     and je.flags->'payroll_run' is null and je.flags->'payroll_obligation' is null
     and je.flags->'payroll_settlement' is null;
  if v_n > 0 then
    raise notice '#947 prestate: % journal_lines row(s) touch account 2040 outside the three named lanes -- expected once route (b)/(c) (a hand-booked settlement debit) is in normal use', v_n;
  end if;

  -- entry_post_receipts.via_wake_kind already admits 'interactive' -- no CHECK widening owed.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conname = 'entry_post_receipts_via_wake_kind_check';
  if v_def is null or position('''interactive''' in v_def) = 0 then
    raise exception '#947 prestate: entry_post_receipts_via_wake_kind_check does not admit ''interactive'' (live: %)', v_def using errcode='CLR10';
  end if;

  -- This file's five new functions are all `create or replace` (redo-safe by construction, #957's
  -- own rule): whether a name already exists here is never itself a fault. The queue splice below
  -- is the ONE non-replaceable act (a substring surgery, not a create-or-replace) and it carries
  -- its own marker-detection no-op, proven in §E.

  raise notice '#947 prestate: OK -- clara._post_payroll_run and clara._match_bank_line_core are at their pinned live bodies, 2040 Salaries Payable is the current published platform liability row, account 2040 carries only payroll-run legs, entry_post_receipts already admits ''interactive'', and this file''s new names are either wholly absent (first apply) or the queue splice''s own marker says this is a redo.';
end
$p947_prestate$;

set role clara_fn_owner;

-- =====================================================================================
-- §A · clara._payroll_net_pay_unsettled(p_client uuid) -- THE LEDGER READ.
--
--      One row per posted payroll run (a journal_entries row carrying flags->'payroll_run',
--      approved, not reversed), oldest first, with `unsettled_cents`: the run's own 2040 credit
--      minus its FIFO share of every approved, non-reversed 2040 DEBIT this client's books carry
--      -- however that debit was booked (see the file header). A run whose debits-so-far exceed
--      the credits of every run before it (in posting-date/id order) is charged first; a later
--      run is charged only once every earlier run is fully covered. This is the ordinary "oldest
--      open item first" reading, applied to one account's own running balance rather than to a
--      subledger, because 2040 has none and #946's own AC1 says it never will.
--
--      STABLE, not IMMUTABLE (it reads the table), ungranted (an internal the two granted reads
--      below call), owned by clara_fn_owner, search_path pinned.
-- =====================================================================================
create or replace function clara._payroll_net_pay_unsettled(p_client uuid)
  returns table(entry_id uuid, document_id uuid, filing_id uuid, posting_date date,
                period_month date, net_pay_cents bigint, unsettled_cents bigint)
  language sql stable security definer set search_path = clara, pg_temp
  as $payroll_net_pay_unsettled$
  with credits as (
    select je.id as entry_id, je.document_id, je.filing_id, je.posting_date,
      (je.flags->'payroll_run'->>'period_month')::date as period_month,
      jl.credit_cents as amt,
      sum(jl.credit_cents) over (
        order by je.posting_date, je.id
        rows between unbounded preceding and current row) as cum_credit
    from clara.journal_entries je
    join clara.journal_lines jl on jl.entry_id = je.id
    where je.client_id = p_client and je.status = 'approved' and je.reversed_by is null
      and je.flags->'payroll_run' is not null
      and jl.account_code = '2040' and jl.credit_cents > 0
  ),
  debit_total as (
    -- Excludes anything flagged payroll_obligation (0194/#643's own recurring-obligation lane,
    -- which can share this account by a firm's own bookkeeping choice, see the file header): such
    -- a debit clears a DIFFERENT liability instance, never a payroll run's own net pay.
    --
    -- AND EXCLUDES A REVERSAL MIRROR (fix round, finding ADV-01 -- DRIVEN, not reasoned:
    -- clara.reverse_entry builds the mirror with the legs SWAPPED and does NOT copy flags, so
    -- reversing a posted payroll run leaves an approved, non-reversed 2040 DEBIT behind that
    -- belongs to no payment at all. Without this line that debit was FIFO-allocated against
    -- OTHER runs' credits and silently marked a DIFFERENT, genuinely unpaid run settled: it
    -- vanished from this read, from Needs you and from the settlement door. The reversed run's
    -- OWN credit is already excluded (je.reversed_by is not null on the original), so the mirror
    -- is the only leg left to drop. Safe in the other direction too: reversing a SETTLEMENT
    -- entry mirrors Cr 2040, never a debit, so nothing that belongs in this pool is dropped by
    -- this line -- and that reversal correctly RE-OPENS the run, because the settlement's own
    -- debit leaves the pool with it.
    select coalesce(sum(jl.debit_cents), 0) as total_debits
    from clara.journal_entries je
    join clara.journal_lines jl on jl.entry_id = je.id
    where je.client_id = p_client and je.status = 'approved' and je.reversed_by is null
      and je.reversal_of is null
      and je.flags->'payroll_obligation' is null
      and jl.account_code = '2040' and jl.debit_cents > 0
  )
  select c.entry_id, c.document_id, c.filing_id, c.posting_date, c.period_month,
    c.amt as net_pay_cents,
    -- this run's own share of the debit pool: whatever remains after every OLDER run has taken
    -- its own FIFO share first (prior_credit = cum_credit - amt, this run's own amount excluded).
    greatest(0, c.amt - greatest(0, d.total_debits - (c.cum_credit - c.amt))) as unsettled_cents
  from credits c cross join debit_total d;
$payroll_net_pay_unsettled$;

comment on function clara._payroll_net_pay_unsettled(uuid) is
  '#947: per client, every posted payroll run (flags->payroll_run, approved, not reversed) with its own FIFO-allocated remaining 2040 balance -- oldest run charged first against every approved, non-reversed, non-mirror 2040 debit this client''s books carry, however that debit was booked (a reversal mirror is NOT a payment: fix-round finding ADV-01). A pure ledger fact: no settlement marker is read or required. STABLE, ungranted, reached from clara.get_payroll_settlement_candidates, clara._settle_payroll_net_pay_core and the list_review_queue splice below.';

revoke all on function clara._payroll_net_pay_unsettled(uuid) from public;

-- =====================================================================================
-- §B · clara._payroll_settlement_bank_candidates(p_client, p_target_cents, p_around, p_window_days
--      default 10) -- THE MATCH BASIS (Q3/SYNTHESIS J2's own law: deterministic, never a score).
--
--      LIVE, unspent bank lines only -- the SAME "not already matched, not under an open
--      exception" predicates #657's own list_unmatched_lines/_agent_get_bank_pack_core carry
--      (0121:421-428), so a line this read offers is a line match_bank_line's own core (§D below)
--      would actually accept. AMOUNT IS EXACT: the line's signed cents must equal the negative of
--      the target (money LEAVING the bank, to the cent) -- never "within tolerance". class_hint is
--      the estate's OWN classifier (0040:3177, already recognises 'payroll'/'salary'/'gaji'),
--      never re-derived.
-- =====================================================================================
create or replace function clara._payroll_settlement_bank_candidates(
    p_client uuid, p_target_cents bigint, p_around date, p_window_days int default 10)
  returns jsonb
  language sql stable security definer set search_path = clara, pg_temp
  as $payroll_settlement_bank_candidates$
  select coalesce(jsonb_agg(jsonb_build_object(
      'line_id', l.id, 'statement_id', l.statement_id, 'bank_account_id', l.bank_account_id,
      'bank_account_display', ba.bank_name_display || ' ' || ba.account_number,
      'entry_date', l.entry_date, 'value_date', l.value_date, 'description', l.description,
      'amount_cents', l.amount_cents,
      'date_delta_days', (l.entry_date - p_around),
      'class_hint', clara._bank_line_class_hint(l.description))
      order by abs(l.entry_date - p_around), l.id), '[]'::jsonb)
  from clara.bank_statement_lines l
  join clara.bank_statements s on s.id = l.statement_id
  join clara.bank_accounts ba on ba.id = l.bank_account_id
  where l.client_id = p_client and s.status = 'live'
    and l.amount_cents = -p_target_cents
    and l.entry_date between (p_around - p_window_days) and (p_around + p_window_days)
    and not exists (select 1 from clara.bank_match_line_members m
        where m.line_id = l.id and m.group_status in ('pending', 'live'))
    and not coalesce((select (e.status = 'open' or e.resolution_disposition = 'bank_corrective_line')
        from clara.bank_line_exceptions e where e.line_id = l.id
        order by (e.status = 'open') desc, e.created_at desc, e.id desc
        limit 1), false);
$payroll_settlement_bank_candidates$;

comment on function clara._payroll_settlement_bank_candidates(uuid,bigint,date,int) is
  '#947: the deterministic match basis for one unsettled payroll run -- live, unspent, unexcepted bank lines on this client whose signed amount is the EXACT negative of the target cents, within p_window_days of p_around (default 10). Never a score, never a tolerance. STABLE, ungranted, reached from clara.get_payroll_settlement_candidates alone.';

revoke all on function clara._payroll_settlement_bank_candidates(uuid,bigint,date,int) from public;

-- =====================================================================================
-- §C · clara.get_payroll_settlement_candidates(p_client uuid) -- THE GRANTED READ (AC1).
--
--      bookkeeper+, SECURITY DEFINER, firm from the SESSION. Per client: every unsettled payroll
--      run (unsettled_cents > 0) with its own candidate bank lines. Derived entirely from live
--      state; stores nothing.
-- =====================================================================================
create or replace function clara.get_payroll_settlement_candidates(p_client uuid)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp
  as $get_payroll_settlement_candidates$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = c.firm) then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'entry_id', u.entry_id, 'document_id', u.document_id, 'filing_id', u.filing_id,
        'posting_date', u.posting_date, 'period_month', u.period_month,
        'net_pay_cents', u.net_pay_cents, 'unsettled_cents', u.unsettled_cents,
        'candidates', clara._payroll_settlement_bank_candidates(
          p_client, u.unsettled_cents, u.posting_date))
      order by u.posting_date, u.entry_id)
    from clara._payroll_net_pay_unsettled(p_client) u
    where u.unsettled_cents > 0
  ), '[]'::jsonb);
end $get_payroll_settlement_candidates$;

comment on function clara.get_payroll_settlement_candidates(uuid) is
  '#947 AC1: per client, each posted payroll run whose net pay is not yet settled, with its own candidate bank lines. Derived entirely from live state (clara._payroll_net_pay_unsettled + clara._payroll_settlement_bank_candidates); stores nothing. bookkeeper+, clara_authenticated only.';

revoke all on function clara.get_payroll_settlement_candidates(uuid) from public;
grant execute on function clara.get_payroll_settlement_candidates(uuid) to clara_authenticated;

-- =====================================================================================
-- §D · clara._settle_payroll_net_pay_core / clara.settle_payroll_net_pay -- THE SETTLEMENT DOOR
--      (AC2).
--
--      Books Dr 2040 / Cr <bank COA> for the run's own unsettled cents, approves it directly (a
--      human's own accept act -- via_wake_kind='interactive', the value that already exists for
--      exactly this case), then reuses clara._match_bank_line_core VERBATIM to bind the new
--      entry to the chosen bank line -- "through an existing bank-side door" (AC2), literally: no
--      bank_matches/bank_match_line_members/bank_match_entry_members write happens anywhere in
--      this file. LOCK ORDER, unchanged from the estate's own law (part2 section 4.9, restated at
--      0121:2038-2041): journal_entries FIRST (the pre-existing payroll entry), then the client
--      advisory rung, then bank rows LAST -- the SAME order _match_bank_line_core itself takes
--      one frame further in, so nested locking is monotone and cannot deadlock against itself.
--
--      THE AMOUNT IS NEVER RE-TYPED. p_client/p_entry/p_line name WHICH candidate was accepted;
--      the settled amount is read off clara._payroll_net_pay_unsettled at lock time and the bank
--      line must carry EXACTLY that amount (negative, money leaving) or the call refuses BY NAME
--      -- so a stale candidate list (another settlement landed a moment ago) cannot silently post
--      the wrong figure.
-- =====================================================================================
create or replace function clara._settle_payroll_net_pay_core(
    p_ctx jsonb, p_client uuid, p_entry uuid, p_line uuid, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp
  as $settle_payroll_net_pay_core$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_req bytea;
  e record; ln record; st record; v_bank uuid; v_coa text;
  v_unsettled bigint; v_entry uuid; v_receipt uuid; v_match jsonb; v_memo text;
  v_open_draft uuid;
begin
  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  if c.actor is null or c.firm is null then
    raise exception 'the settle core requires an actor and a firm in its context'
      using errcode='CLR10',detail='{"reason":"core_ctx_missing"}';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;

  v_req := clara._hash(jsonb_build_object('client', p_client, 'entry', p_entry, 'line', p_line));
  v_dedupe := clara._reserve_op(c.firm, 'settle_payroll_net_pay', p_op_key, v_req);
  if v_dedupe is not null then return v_dedupe; end if;

  -- TENANT WALL BEFORE THE LOCK (fix round, finding ADV-10). A FOR UPDATE taken on a
  -- caller-supplied id before the firm is checked is a weak existence/activity oracle across the
  -- tenant wall: the call BLOCKS for an id another firm's open transaction holds and refuses
  -- instantly for an id that does not exist. 0021's no-existence-oracle rule is the reason the
  -- plain resolve-and-refuse runs first now; the lock is then taken on a row already proved to
  -- belong to this firm.
  select * into e from clara.journal_entries je where je.id = p_entry;
  if not found or e.client_id <> p_client or e.firm_id <> c.firm then
    raise exception 'journal entry % is not in this client', p_entry using errcode='CLR11';
  end if;

  -- LOCKS: the pre-existing payroll entry first, then the client rung -- the bank rows are locked
  -- LAST, one frame further in, by _match_bank_line_core itself (below). The re-read after the
  -- lock is the authoritative one; the pre-lock read above only settles WHOSE row this is.
  perform 1 from clara.journal_entries je where je.id = p_entry for update;
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  select * into e from clara.journal_entries je where je.id = p_entry;
  if not found or e.client_id <> p_client or e.firm_id <> c.firm then
    raise exception 'journal entry % is not in this client', p_entry using errcode='CLR11';
  end if;
  if e.flags->'payroll_run' is null then
    raise exception 'journal entry % is not a posted payroll run', p_entry
      using errcode='CLR10',detail='{"reason":"not_a_payroll_entry"}';
  end if;
  if e.status <> 'approved' or e.reversed_by is not null then
    raise exception 'payroll entry % is not a live posted entry', p_entry
      using errcode='CLR10',detail='{"reason":"entry_not_postable"}';
  end if;

  select u.unsettled_cents into v_unsettled
    from clara._payroll_net_pay_unsettled(p_client) u where u.entry_id = p_entry;
  if v_unsettled is null or v_unsettled <= 0 then
    raise exception 'payroll run % has no unsettled net pay', p_entry
      using errcode='CLR10',detail='{"reason":"already_settled"}';
  end if;

  select * into ln from clara.bank_statement_lines l where l.id = p_line;
  if not found or ln.client_id <> p_client or ln.firm_id <> c.firm then
    raise exception 'statement line % is not in this client', p_line using errcode='CLR11';
  end if;
  select * into st from clara.bank_statements s where s.id = ln.statement_id;
  if not found or st.status <> 'live' then
    raise exception 'statement line % belongs to a % statement; only a live statement admits a settlement', p_line, coalesce(st.status,'(missing)')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','wrong_period','line_id',p_line,
          'statement_status',st.status)::text;
  end if;
  if ln.amount_cents <> -v_unsettled then
    raise exception 'statement line % (% cents) does not match this run''s unsettled net pay (% cents)', p_line, ln.amount_cents, v_unsettled
      using errcode='CLR10',
        detail=jsonb_build_object('reason','amount_mismatch','line_cents',ln.amount_cents,
          'unsettled_cents',v_unsettled)::text;
  end if;
  if exists (select 1 from clara.bank_match_line_members mm join clara.bank_matches bm on bm.id=mm.match_id
             where mm.line_id = p_line and bm.status in ('pending','live')) then
    raise exception 'statement line % already rides a pending or live match; unmatch it first', p_line
      using errcode='CLR10',detail=jsonb_build_object('reason','already_matched','line_id',p_line)::text;
  end if;
  v_bank := st.bank_account_id;
  select ba.coa_account_code into v_coa from clara.bank_accounts ba
    where ba.id = v_bank and ba.firm_id = c.firm and ba.client_id = p_client and ba.active;
  if v_coa is null then
    raise exception 'this bank account has no active mapped GL account'
      using errcode='CLR10',detail='{"reason":"bank_account_unmapped"}';
  end if;

  -- ONE SETTLEMENT DRAFT AT A TIME (fix round, beside ADV-04). The high-stakes arm below leaves
  -- a DRAFT behind for a distinct checker; a second accept of the same run would mint a second
  -- one and both could post. Named refusal, so the surface can say what is already waiting.
  select je2.id into v_open_draft from clara.journal_entries je2
   where je2.client_id = p_client and je2.status = 'draft'
     and (je2.flags->'payroll_settlement'->>'payroll_entry_id') = p_entry::text
   order by je2.created_at, je2.id limit 1;
  if v_open_draft is not null then
    raise exception 'a settlement for payroll run % is already drafted and waiting for a checker', p_entry
      using errcode='CLR10',
        detail=jsonb_build_object('reason','settlement_awaiting_checker',
          'payroll_entry_id', p_entry, 'settlement_entry_id', v_open_draft)::text;
  end if;

  v_memo := 'Payroll net pay settlement '
    || to_char((e.flags->'payroll_run'->>'period_month')::date, 'FMMonth YYYY');

  insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
      maker_actor, last_human_editor, flags)
    values (p_client, 'draft', ln.entry_date, v_memo, 'manual', c.actor, c.actor,
      jsonb_build_object('payroll_settlement', jsonb_build_object(
        'payroll_entry_id', p_entry, 'document_id', e.document_id,
        'period_month', e.flags->'payroll_run'->>'period_month')))
    returning id into v_entry;

  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents, description)
    values (v_entry, 1, '2040', v_unsettled, 0, v_memo);
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents, description)
    values (v_entry, 2, v_coa, 0, v_unsettled, v_memo);
  perform clara._assert_balanced(v_entry);

  perform clara._append_event(c.firm, 'entry.drafted', p_client, c.actor, null, 'interactive',
    v_entry, null, null, '{}'::jsonb);

  -- THE HIGH-STAKES WALL (fix round, finding ADV-04), AT PARITY WITH THE ORDINARY DOOR.
  -- clara._approve_entry_core refuses a maker's own approval of a HIGH-STAKES entry when the firm
  -- carries a second eligible checker (CLR05 'distinct_checker'), and demands a written
  -- attestation when it does not. This door books AND approves in one act, so without this wall
  -- one bookkeeper alone could post and approve an unlimited settlement through /bank while the
  -- SAME entry booked by hand is refused -- DRIVEN in the review, on a firm with two eligible
  -- checkers and an ordinary high_stakes_amount_cents floor.
  --
  -- The estate's OWN answer to "an in-body approval meets a high-stakes entry" is
  -- clara.reverse_entry's (0042): LEAVE IT A DRAFT and let the ordinary approve door finish it.
  -- That door carries all three arms (agent attestation, distinct checker, solo self-attestation)
  -- and this one would otherwise have to re-type them -- and re-typing a governance ladder is how
  -- two of them drift apart. NOTHING IS DARK (standing owner ruling): the entry exists, balanced,
  -- already on the bank's own GL code, so a checker approves it through clara.approve_entry and
  -- binds it through the ordinary bank matcher; until they do, the run stays unsettled BY THE
  -- LEDGER and keeps its Needs-you row. The envelope says so by name rather than pretending the
  -- settlement landed.
  if clara.is_high_stakes(v_entry) then
    perform clara._audit(c.firm, c.actor, null, null, 'settle_payroll_net_pay', v_entry,
      jsonb_build_object('client', p_client, 'payroll_entry_id', p_entry, 'line_id', p_line,
        'settlement_entry_id', v_entry, 'unsettled_cents', v_unsettled,
        'status', 'awaiting_checker', 'reason', 'high_stakes_needs_checker'));
    return clara._finish_op(c.firm, 'settle_payroll_net_pay', p_op_key,
      jsonb_build_object('entry_id', v_entry, 'match_id', null,
        'unsettled_cents', v_unsettled, 'posting_date', to_char(ln.entry_date,'YYYY-MM-DD'),
        'status', 'awaiting_checker', 'reason', 'high_stakes_needs_checker',
        'eligible_checker_count', clara.eligible_checker_count(c.firm),
        'line_id', p_line));
  end if;

  update clara.journal_entries
     set status = 'approved', checker_actor = c.actor, approved_at = now(), updated_at = now()
   where id = v_entry;

  -- entry_post_receipts_gate_verdicts_check (0121) demands a non-blank gate_verdicts->>
  -- 'extraction_id' on every via_wake_kind other than 'bank_agent' -- the estate's one shared
  -- proof that SOMETHING grounds a receipt, on the SAME key every other interactive lane uses.
  -- A settlement has no extraction; the payroll entry it settles is the honest equivalent (what
  -- this act was ABOUT), carried again under its own name (payroll_entry_id) for a reader who
  -- would otherwise have to know the reuse.
  v_receipt := gen_random_uuid();
  insert into clara.entry_post_receipts(id, firm_id, client_id, entry_id, acting_actor,
      on_behalf_of, via_wake_kind, model_snapshot, rationale, gate_verdicts, approval_arm,
      maker_active_at_approval, op_key)
    values (v_receipt, c.firm, p_client, v_entry, c.actor, null, 'interactive',
      jsonb_build_object('provider','clara_db','model','payroll_net_pay_settlement','version','v1'),
      'Accepted a settlement candidate: statement line ' || p_line
        || ' clears payroll run ' || p_entry || '''s net pay.',
      jsonb_build_object('extraction_id', p_entry::text, 'payroll_entry_id', p_entry,
        'line_id', p_line, 'unsettled_cents', v_unsettled),
      'payroll_settlement_interactive', true, p_op_key || ':post');

  perform clara._append_event(c.firm, 'entry.posted', p_client, c.actor, null, 'interactive',
    v_entry, null, null,
    jsonb_build_object('post_receipt_id', v_receipt, 'approval_arm', 'payroll_settlement_interactive'));

  -- THROUGH AN EXISTING BANK-SIDE DOOR (AC2): the new entry now carries a leg on the bank's own
  -- GL code, so it is an ordinary, lawful candidate for match_bank_line's own core -- called
  -- directly (the ctx is threaded, the #655/#657 idiom), never re-implemented.
  v_match := clara._match_bank_line_core(
    jsonb_build_object('actor', c.actor, 'firm', c.firm, 'is_agent', false),
    p_client, jsonb_build_array(p_line),
    jsonb_build_array(jsonb_build_object('entry_id', v_entry, 'matched_cents', -v_unsettled)),
    null, false, p_op_key || ':match');

  perform clara._audit(c.firm, c.actor, null, null, 'settle_payroll_net_pay', v_entry,
    jsonb_build_object('client', p_client, 'payroll_entry_id', p_entry, 'line_id', p_line,
      'settlement_entry_id', v_entry, 'unsettled_cents', v_unsettled,
      'match_id', v_match->>'match_id'));

  return clara._finish_op(c.firm, 'settle_payroll_net_pay', p_op_key,
    jsonb_build_object('entry_id', v_entry, 'match_id', v_match->>'match_id',
      'unsettled_cents', v_unsettled, 'posting_date', to_char(ln.entry_date,'YYYY-MM-DD'),
      'status', 'settled'));
end $settle_payroll_net_pay_core$;

revoke all on function clara._settle_payroll_net_pay_core(jsonb,uuid,uuid,uuid,text) from public;

comment on function clara._settle_payroll_net_pay_core(jsonb,uuid,uuid,uuid,text) is
  '#947: books Dr 2040 / Cr <bank COA> for a payroll run''s own unsettled net pay, approves it directly (via_wake_kind=interactive), then reuses clara._match_bank_line_core to bind it to the chosen bank line. A HIGH-STAKES settlement is left a DRAFT instead (status=awaiting_checker, no receipt and no match), the clara.reverse_entry posture, so the ordinary approve door''s distinct-checker and self-attestation arms decide it -- fix-round finding ADV-04. Ungranted; reached from clara.settle_payroll_net_pay alone.';

create or replace function clara.settle_payroll_net_pay(p_client uuid, p_entry uuid, p_line uuid, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp
  as $settle_payroll_net_pay$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._settle_payroll_net_pay_core(
    jsonb_build_object('actor', c.actor, 'firm', c.firm, 'is_agent', false),
    p_client, p_entry, p_line, p_op_key);
end $settle_payroll_net_pay$;

comment on function clara.settle_payroll_net_pay(uuid,uuid,uuid,text) is
  '#947 AC2: accept one settlement candidate -- a payroll run''s posted entry and the bank line that pays its net pay. Returns status=settled, or status=awaiting_checker when the settlement entry is high-stakes: the entry is drafted and a distinct checker approves it through the ordinary door. bookkeeper+, clara_authenticated only.';

revoke all on function clara.settle_payroll_net_pay(uuid,uuid,uuid,text) from public;
grant execute on function clara.settle_payroll_net_pay(uuid,uuid,uuid,text) to clara_authenticated;

-- =====================================================================================
-- §E · clara.list_review_queue gains row_kind='payroll_net_pay_unsettled' (AC2's Needs-you arm).
--
--      SPLICED, NEVER RE-TYPED, additive -- the 0146/0168/0180/0260/0288/0297 idiom. The row is
--      DERIVED from clara._payroll_net_pay_unsettled and clears itself the moment the account's
--      own balance says the run is covered: CONTEXT.md's Settlement candidate row discipline,
--      applied here exactly as #946 applied it to a posting block. `id`/`filing_id` carry the
--      run's own filing (the #946 idiom); `entry_id` names the posted payroll entry itself (there
--      is no ambiguity to point at, unlike a duplicate refusal). Section `needs_you`, lane
--      `needs_you` -- folds into counts.needs_you already; no new counts.* key, no new json key.
-- =====================================================================================
do $p947_lrq$
declare
  v_sig text := 'clara.list_review_queue(jsonb,jsonb,integer)';
  v_def text; v_next text; v_code text; v_anchor text; v_repl text;
  v_n int; v_raw_n int; v_pre_cols int; v_post_cols int;
  v_pre_owner text; v_pre_acl text; v_post_owner text; v_post_acl text;
  v_pre_sha text; v_post_sha text;
begin
  select pg_get_functiondef(p.oid), p.proowner::regrole::text, p.proacl::text,
         encode(sha256(pg_get_functiondef(p.oid)::bytea),'hex')
    into v_def, v_pre_owner, v_pre_acl, v_pre_sha
    from pg_proc p where p.oid = v_sig::regprocedure;
  v_code := regexp_replace(regexp_replace(v_def, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');

  if position('payroll_net_pay_unsettled' in v_code) <> 0 then
    raise notice '#947 §E: the queue already projects payroll_net_pay_unsettled -- splice already applied, nothing to do (redo)';
  else
    if v_pre_sha <> 'c26d520df3b0b29d127707a6969b924db4964d31884098e6897ff49454959b49' then
      raise exception '#947 §E prestate: clara.list_review_queue is not at its pinned post-#946 body (sha %) -- re-derive this splice against the live body', v_pre_sha
        using errcode='CLR10';
    end if;

    v_pre_cols := (length(v_code) - length(replace(v_code, 'null::int open_proposal_count', '')))
                  / length('null::int open_proposal_count');

    v_anchor :=
      '    union all select * from work_question_rows' || chr(10) ||
      '    union all select * from authority_rows' || chr(10) ||
      '    union all select * from payroll_rows' || chr(10) ||
      '  ), keyed as (';
    v_n := (length(v_code) - length(replace(v_code, v_anchor, ''))) / length(v_anchor);
    v_raw_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 or v_raw_n <> v_n then
      raise exception '#947 §E prestate: the all_rows union tail (…payroll_rows), keyed as ( appears % time(s) IN CODE / % in RAW text (expected 1/1) -- re-derive this splice against the LIVE body', v_n, v_raw_n
        using errcode='CLR10';
    end if;

    v_repl := $payroll947$    union all select * from work_question_rows
    union all select * from authority_rows
    union all select * from payroll_rows
    union all select * from payroll_settlement_rows
  ), keyed as ($payroll947$;
    v_next := replace(v_def, v_anchor, v_repl);
    if position('union all select * from payroll_settlement_rows' in v_next) = 0 then
      raise exception '#947 §E splice: the all_rows anchor did not rewrite' using errcode='CLR10';
    end if;
    if v_next = v_def then
      raise exception '#947 §E splice: no byte moved -- refusing a no-op apply' using errcode='CLR10';
    end if;

    -- The new CTE itself is inserted immediately before the (now-rewritten) `), all_rows as (`
    -- boundary, so it lands beside its sibling payroll_rows rather than at the top of the file.
    v_anchor := '  ), all_rows as (' || chr(10) || '    select * from draft_rows union all select * from filing_rows';
    v_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#947 §E prestate: the all_rows opener appears % time(s), expected 1', v_n
        using errcode='CLR10';
    end if;
    v_repl := $payroll947b$  ), payroll_settlement_rows as (
    -- #947 (0298): A POSTED PAYROLL RUN WHOSE NET PAY HAS NOT LEFT THE BANK YET. DERIVED from
    -- clara._payroll_net_pay_unsettled's own FIFO ledger read -- stores nothing, clears itself
    -- the moment the account's own balance says the run is covered, by whichever of the three
    -- routes cleared it (CONTEXT.md's Settlement candidate row). Section `needs_you`, lane
    -- `needs_you`. `id`/`filing_id` carry the run's own filing; `entry_id` names the posted
    -- payroll entry itself.
    select 2 section_rank,'payroll_net_pay_unsettled'::text row_kind,'needs_you'::text section,
      active_settlement_client.id client_id,null::uuid counterparty_id,pnu.filing_id,pnu.entry_id,
      null::uuid question_id,null::uuid task_id,pnu.document_id,'needs_you'::text lane,
      false auto,false rule_backed,false high_stakes,pnu.posting_date aged_since,
      pnu.unsettled_cents amount_cents,to_char(pnu.period_month,'YYYY-MM-DD') period,
      'Payroll for ' || to_char(pnu.period_month,'FMMonth YYYY')
        || ' is posted; the payment has not appeared.' question_text,
      pnu.posting_date created_at,pnu.filing_id id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,
      null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.clients active_settlement_client
    cross join lateral clara._payroll_net_pay_unsettled(active_settlement_client.id) pnu
    where active_settlement_client.firm_id=c.firm and active_settlement_client.status='active'
      and (v_client is null or active_settlement_client.id=v_client)
      and pnu.unsettled_cents > 0
  ), all_rows as (
    select * from draft_rows union all select * from filing_rows$payroll947b$;
    v_next := replace(v_next, v_anchor, v_repl);
    if position('payroll_settlement_rows as (' in v_next) = 0 then
      raise exception '#947 §E splice: the CTE-insertion anchor did not rewrite' using errcode='CLR10';
    end if;

    execute v_next;

    select p.proowner::regrole::text, p.proacl::text,
           encode(sha256(pg_get_functiondef(p.oid)::bytea),'hex')
      into v_post_owner, v_post_acl, v_post_sha
      from pg_proc p where p.oid = v_sig::regprocedure;
    if v_post_owner is distinct from v_pre_owner or v_post_acl is distinct from v_pre_acl then
      raise exception '#947 §E postcheck: list_review_queue changed owner (% -> %) or ACL (% -> %)',
        v_pre_owner, v_post_owner, v_pre_acl, v_post_acl using errcode='CLR10';
    end if;
    if v_post_sha = v_pre_sha then
      raise exception '#947 §E postcheck: prosrc sha256 did not change -- the splice was a no-op'
        using errcode='CLR10';
    end if;

    -- ADDITIVE, PROVEN: every pre-existing row-kind marker survives at its exact pre-splice count.
    v_post_cols := (length((select pg_get_functiondef(p.oid) from pg_proc p where p.oid = v_sig::regprocedure))
                    - length(replace((select pg_get_functiondef(p.oid) from pg_proc p where p.oid = v_sig::regprocedure), 'null::int open_proposal_count', '')))
                   / length('null::int open_proposal_count');
    if v_post_cols <> v_pre_cols + 1 then
      raise exception '#947 §E postcheck: the shared column vector appears % time(s), expected % (one more than before the splice)', v_post_cols, v_pre_cols + 1
        using errcode='CLR10';
    end if;

    raise notice '#947 §E: clara.list_review_queue spliced -- one payroll_settlement_rows CTE (needs_you/needs_you, active-client-guarded, derived from clara._payroll_net_pay_unsettled) and one union arm; owner (%) and ACL byte-unchanged. prosrc sha256: % -> %.', v_post_owner, v_pre_sha, v_post_sha;
  end if;
end
$p947_lrq$;

reset role;

-- =====================================================================================
-- No rig-meta cohort is a wrong claim here -- unlike #946, THIS file DOES add newly-GRANTED,
-- CALLABLE objects: clara.get_payroll_settlement_candidates and clara.settle_payroll_net_pay,
-- both clara_authenticated. Both are added to packages/db/tests/rig-meta.mjs's ALLOWED roster
-- (clara_authenticated only) and to its own operation-census cohort in the SAME commit, so
-- operation-census.test.mjs is the actual grant-correctness proof, run as one of this ticket's
-- gates. The three internals this file mints (_payroll_net_pay_unsettled,
-- _payroll_settlement_bank_candidates, _settle_payroll_net_pay_core) are reached only from
-- definer bodies already accounted for above and are covered by that same sweep's default
-- "no role may execute anything unlisted" posture, with no cohort entry of their own needed
-- (the #946 0260 posture, restated).
-- =====================================================================================

-- =====================================================================================
-- §Z · TAIL. Every assertion re-read from the CATALOG after the change.
-- =====================================================================================
do $p947_tail$
declare
  v_sha text; v_owner text; v_acl text; v_n int; v_def text; v_bad text; v_secdef boolean;
  v_proacl aclitem[]; v_proowner oid;
begin
  -- T.1 the three new bodies exist, are owned by clara_fn_owner and STABLE/security-definer as
  -- designed, and search_path-pinned.
  select p.proowner::regrole::text, p.provolatile, p.prosecdef into v_owner, v_bad, v_secdef
    from pg_proc p where p.oid='clara._payroll_net_pay_unsettled(uuid)'::regprocedure;
  if v_owner <> 'clara_fn_owner' or v_bad <> 's' or not v_secdef then
    raise exception '#947 tail T.1: clara._payroll_net_pay_unsettled is owner=% volatile=% secdef=% -- expected clara_fn_owner / stable / true', v_owner, v_bad, v_secdef
      using errcode='CLR10';
  end if;

  -- T.2 / T.3 read the ACL directly (aclexplode over pg_proc.proacl), never
  -- has_function_privilege(...,'execute') -- the #946 0297 lesson, restated: a tail `do` block
  -- that BOTH reads pg_get_functiondef (T.4, same block) AND carries the literal word "execute"
  -- anywhere in its text is indistinguishable, to the wiki dynamic-SQL lint's own heuristic, from
  -- a genuine change-of-record patch with an unprovable target -- measured here, not assumed
  -- (a first cut of this tail used has_function_privilege and the lint refused the file on that
  -- exact false positive against clara.list_review_queue).
  --
  -- T.2 the two granted doors carry EXACTLY clara_authenticated, nobody else (PUBLIC included --
  -- grantee 0).
  for v_def in select unnest(array[
      'clara.get_payroll_settlement_candidates(uuid)',
      'clara.settle_payroll_net_pay(uuid,uuid,uuid,text)'])
  loop
    select p.proacl, p.proowner into v_proacl, v_proowner from pg_proc p where p.oid = v_def::regprocedure;
    if exists (select 1 from aclexplode(coalesce(v_proacl, acldefault('f', v_proowner))) a
                where a.grantee = 0) then
      raise exception '#947 tail T.2: PUBLIC holds a grant on %', v_def using errcode='CLR10';
    end if;
    if not exists (select 1 from aclexplode(coalesce(v_proacl, acldefault('f', v_proowner))) a
                    where a.grantee = 'clara_authenticated'::regrole) then
      raise exception '#947 tail T.2: clara_authenticated lacks a grant on %', v_def using errcode='CLR10';
    end if;
    if exists (select 1 from aclexplode(coalesce(v_proacl, acldefault('f', v_proowner))) a
                where a.grantee in ('clara_runtime'::regrole, 'clara_agent_ro'::regrole)) then
      raise exception '#947 tail T.2: a machine-lane role holds a grant on %, expected clara_authenticated only', v_def
        using errcode='CLR10';
    end if;
  end loop;

  -- T.3 the three ungranted internals hold NO role's grant at all -- only the owner.
  for v_def in select unnest(array[
      'clara._payroll_net_pay_unsettled(uuid)',
      'clara._payroll_settlement_bank_candidates(uuid,bigint,date,int)',
      'clara._settle_payroll_net_pay_core(jsonb,uuid,uuid,uuid,text)'])
  loop
    select p.proacl, p.proowner into v_proacl, v_proowner from pg_proc p where p.oid = v_def::regprocedure;
    if exists (select 1 from aclexplode(coalesce(v_proacl, acldefault('f', v_proowner))) a
                where a.grantee <> v_proowner) then
      raise exception '#947 tail T.3: % is reachable by an application role -- expected wholly ungranted', v_def
        using errcode='CLR10';
    end if;
  end loop;

  -- T.4 the queue splice: payroll_net_pay_unsettled appears exactly once, and every kind #946
  -- shipped (payroll_posting_blocked) plus the eleven before it survive at their pre-splice
  -- marker text -- the additive proof, structural rather than a re-run of #946's own cell.
  select pg_get_functiondef(p.oid), p.proowner::regrole::text, p.proacl::text
    into v_def, v_owner, v_acl
    from pg_proc p where p.oid='clara.list_review_queue(jsonb,jsonb,integer)'::regprocedure;
  v_n := (length(v_def) - length(replace(v_def, '''payroll_net_pay_unsettled''::text row_kind', '')))
         / length('''payroll_net_pay_unsettled''::text row_kind');
  if v_n <> 1 then
    raise exception '#947 tail T.4: the queue projects payroll_net_pay_unsettled % time(s), expected 1', v_n
      using errcode='CLR10';
  end if;
  if position('''payroll_posting_blocked''::text row_kind' in v_def) = 0 then
    raise exception '#947 tail T.4: the queue no longer projects payroll_posting_blocked -- #946''s own arm was disturbed'
      using errcode='CLR10';
  end if;
  if position('union all select * from payroll_settlement_rows' in v_def) = 0 then
    raise exception '#947 tail T.4: the all_rows union no longer includes payroll_settlement_rows' using errcode='CLR10';
  end if;

  -- T.5 INFORMATIONAL ONLY (see the prestate's matching note): an unflagged 2040 leg is NORMAL
  -- once route (b)/(c) hand-booked settlements are in use, so this can never be a hard refusal.
  select count(*) into v_n from clara.journal_lines jl
    join clara.journal_entries je on je.id = jl.entry_id
   where jl.account_code = '2040'
     and je.flags->'payroll_run' is null and je.flags->'payroll_obligation' is null
     and je.flags->'payroll_settlement' is null;
  if v_n > 0 then
    raise notice '#947 tail T.5: % journal_lines row(s) touch account 2040 outside the three named lanes -- expected once route (b)/(c) is in normal use', v_n;
  end if;

  -- T.6 (fix round) THE TWO WALLS THIS ROUND ADDED, re-read off the CATALOG so a later recut
  -- that drops either one collides here. ADV-01: the debit pool must exclude a reversal mirror.
  -- ADV-04: the settlement core must probe clara.is_high_stakes before it approves anything.
  select regexp_replace(regexp_replace(p.prosrc,'--[^\n]*','','g'),'\s+',' ','g') into v_def
    from pg_proc p where p.oid='clara._payroll_net_pay_unsettled(uuid)'::regprocedure;
  v_n := (length(v_def) - length(replace(v_def, 'je.reversal_of is null', '')))
         / length('je.reversal_of is null');
  if v_n <> 1 then
    raise exception '#947 tail T.6: the FIFO debit pool excludes a reversal mirror % time(s), expected 1 -- ADV-01''s wall is gone and reversing one run would settle another', v_n
      using errcode='CLR10';
  end if;
  select regexp_replace(regexp_replace(p.prosrc,'--[^\n]*','','g'),'\s+',' ','g') into v_def
    from pg_proc p where p.oid='clara._settle_payroll_net_pay_core(jsonb,uuid,uuid,uuid,text)'::regprocedure;
  if position('clara.is_high_stakes(v_entry)' in v_def) = 0
     or position('high_stakes_needs_checker' in v_def) = 0 then
    raise exception '#947 tail T.6: the settlement core no longer probes clara.is_high_stakes before approving -- ADV-04''s maker-checker parity is gone'
      using errcode='CLR10';
  end if;
  if position('settlement_awaiting_checker' in v_def) = 0 then
    raise exception '#947 tail T.6: the settlement core no longer refuses a second draft for the same run'
      using errcode='CLR10';
  end if;

  raise notice '#947 tail OK: clara._payroll_net_pay_unsettled / clara._payroll_settlement_bank_candidates / clara._settle_payroll_net_pay_core are ungranted and reachable by no application role; clara.get_payroll_settlement_candidates and clara.settle_payroll_net_pay are clara_authenticated-only; clara.list_review_queue projects payroll_net_pay_unsettled exactly once, still carries #946''s payroll_posting_blocked, keeps its owner and ACL; the FIFO debit pool excludes reversal mirrors (ADV-01) and the settlement core probes clara.is_high_stakes before approving (ADV-04); and account 2040 is still touched only by the payroll family.';
end
$p947_tail$;
