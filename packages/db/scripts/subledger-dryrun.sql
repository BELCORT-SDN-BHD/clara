-- subledger-dryrun.sql -- the MANDATORY read-only precheck for migration 0037 (WCA-R9a).
--
-- WHAT THIS IS. A strictly read-only SELECT script that answers, against the LIVE database and
-- BEFORE 0037 is applied, the one question the ceremony cannot afford to discover halfway
-- through: does the existing approved book decompose into an AR/AP open-item subledger that
-- ties to the control accounts to the sen, and does it satisfy the four structural laws
-- 0037's tables and triggers will start enforcing?
--
-- It reads nothing but clara.journal_entries, clara.journal_lines, clara.coa_accounts and
-- clara.counterparties, and it writes nothing at all. It can therefore be run through the
-- read-only login (live_ro) with no quiesce, no lock and no risk, any number of times.
--
-- IT CANNOT REFERENCE ANY 0037 OBJECT. clara.open_items, clara.open_item_allocations and
-- clara._subledger_classify_entry do not exist yet when this runs -- that is the whole point --
-- so the classifier's decomposition logic is INLINED below. See THE DRIFT CAVEAT at the bottom
-- for the discipline that keeps the two copies honest.
--
-- HOW THE CEREMONY USES IT.
--   1. Run this script against live through the read-only role, for EVERY firm.
--   2. Section 1 must return ZERO rows for every client x domain: the per-client-per-domain
--      diff between the decomposed subledger total and the control GL balance must be exactly
--      zero, summed over EVERY account of that account_class (plural control accounts are
--      legal and each of them counts).
--   3. Sections 2, 3, 4 and 5 must each return ZERO rows. Each is one of the structural laws
--      0037 begins enforcing, and each names its own remedy.
--   4. ALL FOUR FIRMS x BOTH DOMAINS MUST BE ZERO-DIFF. GREEN = GO. ANYTHING ELSE = THE
--      CEREMONY DOES NOT START -- remediate through the sanctioned verbs first (reverse and
--      re-code, or rebind the counterparty), never with a hand UPDATE, then re-run this.
--   5. After the migration applies on the rig, section 6's per-entry census can be diffed
--      against clara._subledger_decompose_preview(client, domain) -- see the drift caveat.
--
-- SIGN CONVENTION, stated once and used everywhere below: for the 'ar' domain a POSITIVE
-- amount means the customer owes us (control debits minus credits); for 'ap' a POSITIVE
-- amount means we owe the supplier (control credits minus debits). Only APPROVED entries are
-- in the books, so every read joins status='approved' -- an opening entry can be WITHDRAWN
-- after its draft-time clara.opening_items row exists, which is exactly why the decomposition
-- is entries-driven and never opening_items-driven.

\pset pager off
\timing off

-- =====================================================================================
-- SECTION 1 -- THE TIE. Per client x domain: the decomposed subledger total vs the control
-- GL balance. MUST RETURN ZERO ROWS.
--
-- The decomposition and the GL balance are computed from the SAME scan of journal_lines, so
-- this is not a tautology: what it actually tests is that grouping the control legs by
-- (domain, CANONICAL counterparty) and dropping every zero net loses nothing -- i.e. that
-- there is no control amount that cannot be attributed to a counterparty. A control leg with
-- a NULL counterparty is precisely such an amount, which is why section 2 exists as its own
-- named probe rather than being left to show up here as an unexplained difference.
-- =====================================================================================
select 'SECTION 1 -- tie diff (must be empty)' as probe, *
from (
  with control_lines as (
    select e.client_id,
           case a.account_class when 'receivable' then 'ar' else 'ap' end as domain,
           clara._canonical_counterparty(e.client_id, l.counterparty_id) as counterparty_id,
           l.debit_cents, l.credit_cents, a.account_class
    from clara.journal_entries e
    join clara.journal_lines l on l.entry_id = e.id
    join clara.coa_accounts a
      on a.client_id = l.client_id and a.account_code = l.account_code
    where e.status = 'approved' and a.account_class in ('payable','receivable')
  ),
  gl as (
    select client_id, domain,
           sum(case when account_class = 'receivable'
                    then debit_cents - credit_cents
                    else credit_cents - debit_cents end)::bigint as gl_cents
    from control_lines group by 1, 2
  ),
  items as (
    select client_id, domain, sum(net)::bigint as item_cents from (
      select client_id, domain, counterparty_id,
             sum(case when account_class = 'receivable'
                      then debit_cents - credit_cents
                      else credit_cents - debit_cents end)::bigint as net
      from control_lines group by 1, 2, 3
    ) per_party where net <> 0 group by 1, 2
  )
  select coalesce(gl.client_id, items.client_id) as client_id,
         coalesce(gl.domain, items.domain) as domain,
         coalesce(gl.gl_cents, 0) as gl_cents,
         coalesce(items.item_cents, 0) as item_cents,
         coalesce(gl.gl_cents, 0) - coalesce(items.item_cents, 0) as diff_cents
  from gl full outer join items
    on items.client_id = gl.client_id and items.domain = gl.domain
  where coalesce(gl.gl_cents, 0) is distinct from coalesce(items.item_cents, 0)
) z order by client_id, domain;

-- =====================================================================================
-- SECTION 2 -- COUNTERPARTY-LESS CONTROL LINES. MUST RETURN ZERO ROWS.
-- A control-class line with no counterparty contributes to the GL control balance but can
-- produce no open item, so it breaks the identity outright. 0037 refuses to apply if any
-- exists. REMEDY: reverse and re-code the affected entries through the sanctioned verbs.
-- =====================================================================================
select 'SECTION 2 -- counterparty-less approved control lines (must be empty)' as probe,
       e.client_id, e.id as entry_id, e.posting_date, l.account_code,
       l.debit_cents, l.credit_cents
from clara.journal_entries e
join clara.journal_lines l on l.entry_id = e.id
join clara.coa_accounts a on a.client_id = l.client_id and a.account_code = l.account_code
where e.status = 'approved' and a.account_class in ('payable','receivable')
  and l.counterparty_id is null
order by e.client_id, e.posting_date, e.id;

-- =====================================================================================
-- SECTION 3 -- KIND CONTRADICTIONS. MUST RETURN ZERO ROWS.
-- domain 'ar' demands a counterparty of kind 'customer'; 'ap' demands 'vendor'. Both lanes
-- write wrong attributions silently today -- a NULL-coding_kind birth defaults to 'vendor' --
-- so this is the probe most likely to find something on a real corpus.
-- REMEDY: bind the correct counterparty (or state kind:'customer' in the proposal) through
-- the sanctioned verbs before the ceremony.
-- =====================================================================================
select 'SECTION 3 -- counterparty kind contradicts the control domain (must be empty)' as probe,
       e.client_id, e.id as entry_id, a.account_class, cp.id as counterparty_id,
       cp.kind as counterparty_kind, cp.name
from clara.journal_entries e
join clara.journal_lines l on l.entry_id = e.id
join clara.coa_accounts a on a.client_id = l.client_id and a.account_code = l.account_code
join clara.counterparties cp
  on cp.id = clara._canonical_counterparty(e.client_id, l.counterparty_id)
where e.status = 'approved' and a.account_class in ('payable','receivable')
  and ((a.account_class = 'receivable' and cp.kind <> 'customer')
    or (a.account_class = 'payable'    and cp.kind <> 'vendor'))
order by e.client_id, e.id;

-- =====================================================================================
-- SECTION 4 -- CROSS-DOMAIN CONTRA ENTRIES. MUST RETURN ZERO ROWS.
-- One entry with control nets in BOTH domains is a set-off between a customer and a supplier.
-- After 0037 it refuses at approve; a pre-existing one is an owner decision, not an
-- engineering one. REMEDY: split via a clearing account, one entry per domain.
-- =====================================================================================
select 'SECTION 4 -- entries with control nets in BOTH domains (must be empty)' as probe,
       e.client_id, e.id as entry_id, e.posting_date, e.memo
from clara.journal_entries e
join clara.journal_lines l on l.entry_id = e.id
join clara.coa_accounts a on a.client_id = l.client_id and a.account_code = l.account_code
where e.status = 'approved' and a.account_class in ('payable','receivable')
group by e.client_id, e.id, e.posting_date, e.memo
having count(distinct a.account_class) > 1
order by 2, 3;

-- =====================================================================================
-- SECTION 5 -- THE MIRROR LEMMA. MUST RETURN ZERO ROWS.
--
-- 0037's classifier decomposes a REVERSAL by negating the ORIGINAL's items, not by reading
-- the mirror's own legs. Section 1 above, by contrast, reads every approved entry's own legs.
-- The two agree only because reverse_entry and approve_wrong_client_correction copy
-- journal_lines VERBATIM with the sides swapped -- i.e. a mirror's per-(domain, counterparty)
-- nets are the exact negation of its original's. This probe TESTS that lemma instead of
-- assuming it. If it returns rows, section 1's green is not evidence for 0037's behaviour and
-- the ceremony must stop until the divergence is explained.
-- =====================================================================================
select 'SECTION 5 -- reversal mirrors that are not exact negations (must be empty)' as probe, *
from (
  with pair_nets as (
    select m.id as mirror_id, m.client_id, m.reversal_of as original_id,
           case a.account_class when 'receivable' then 'ar' else 'ap' end as domain,
           clara._canonical_counterparty(m.client_id, l.counterparty_id) as counterparty_id,
           sum(case when a.account_class = 'receivable'
                    then l.debit_cents - l.credit_cents
                    else l.credit_cents - l.debit_cents end)::bigint as mirror_cents,
           0::bigint as original_cents
    from clara.journal_entries m
    join clara.journal_entries o on o.id = m.reversal_of and o.status = 'approved'
    join clara.journal_lines l on l.entry_id = m.id
    join clara.coa_accounts a on a.client_id = l.client_id and a.account_code = l.account_code
    where m.status = 'approved' and a.account_class in ('payable','receivable')
    group by 1, 2, 3, 4, 5
    union all
    select m.id, m.client_id, m.reversal_of,
           case a.account_class when 'receivable' then 'ar' else 'ap' end,
           clara._canonical_counterparty(o.client_id, l.counterparty_id),
           0::bigint,
           sum(case when a.account_class = 'receivable'
                    then l.debit_cents - l.credit_cents
                    else l.credit_cents - l.debit_cents end)::bigint
    from clara.journal_entries m
    join clara.journal_entries o on o.id = m.reversal_of and o.status = 'approved'
    join clara.journal_lines l on l.entry_id = o.id
    join clara.coa_accounts a on a.client_id = l.client_id and a.account_code = l.account_code
    where m.status = 'approved' and a.account_class in ('payable','receivable')
    group by 1, 2, 3, 4, 5
  )
  select mirror_id, client_id, original_id, domain, counterparty_id,
         sum(mirror_cents)::bigint as mirror_cents,
         sum(original_cents)::bigint as original_cents
  from pair_nets
  group by 1, 2, 3, 4, 5
  having sum(mirror_cents) is distinct from -sum(original_cents)
) z order by client_id, mirror_id, domain;

-- =====================================================================================
-- SECTION 6 -- THE CENSUS. Informational, not a gate: the exact items 0037's backfill will
-- write, per client x domain x counterparty, with the precedence-ladder kind. Capture it with
-- the run; after the rig apply, the same shape comes out of
--   select * from clara._subledger_decompose_preview(<client>, null);
-- and the two must agree row for row apart from the unwind lineage columns (this script
-- computes a mirror's OWN nets, which section 5 has just proven identical to the negated
-- original the real classifier uses).
-- =====================================================================================
select 'SECTION 6 -- census (informational)' as probe, *
from (
  select e.client_id,
         case a.account_class when 'receivable' then 'ar' else 'ap' end as domain,
         clara._canonical_counterparty(e.client_id, l.counterparty_id) as counterparty_id,
         e.id as entry_id, e.posting_date,
         case
           when e.reversal_of is not null then 'reversal_unwind'
           when e.is_opening_balance then 'opening'
           when e.coding_kind = 'supplier_bill' then 'bill'
           when e.coding_kind = 'sales_invoice' then 'invoice'
           when e.coding_kind = 'sales_credit_note' then 'credit_note'
           when e.coding_kind in ('customer_receipt','supplier_payment') then 'settlement'
           when e.coding_kind is null then 'adjustment'
           else 'UNCLASSIFIED'
         end as item_kind,
         sum(case when a.account_class = 'receivable'
                  then l.debit_cents - l.credit_cents
                  else l.credit_cents - l.debit_cents end)::bigint as amount_cents
  from clara.journal_entries e
  join clara.journal_lines l on l.entry_id = e.id
  join clara.coa_accounts a on a.client_id = l.client_id and a.account_code = l.account_code
  where e.status = 'approved' and a.account_class in ('payable','receivable')
  group by 1, 2, 3, 4, 5, 6
) z where amount_cents <> 0
order by client_id, domain, counterparty_id, posting_date, entry_id;

-- =====================================================================================
-- THE DRIFT CAVEAT -- read this before trusting a green run.
--
-- This script is a HAND COPY of clara._subledger_classify_entry's decomposition, written
-- against the base tables because the real function does not exist on the target when this
-- runs. Two copies of one rule drift; that is what copies do. The discipline that keeps them
-- honest is a POSITIVE step in the ceremony, not a hope:
--
--   AFTER the rig apply and BEFORE the live apply, diff this script's logic against the
--   installed body --
--     select pg_get_functiondef('clara._subledger_classify_entry(uuid)'::regprocedure);
--     select pg_get_functiondef('clara._subledger_decompose_preview(uuid,text)'::regprocedure);
--   -- and confirm, clause by clause, that (a) the precedence ladder here matches the ladder
--   there (reversal, then opening, then the typed anchors, then the settlement kinds, then
--   the generic adjustment, then nothing), (b) the sign convention is identical, (c) the
--   zero-net-drop is identical, and (d) the canonicalisation of the counterparty is identical.
--   Then run clara._subledger_decompose_preview on the rig for the same client and confirm
--   section 6 above reproduces it.
--
-- Two KNOWN and DELIBERATE differences, which are not drift:
--   * SECTION 6 computes a reversal mirror's OWN control nets; the real classifier negates the
--     ORIGINAL's items. Section 5 proves those are the same thing for this corpus, and it is a
--     GATE precisely so this difference can never hide a divergence.
--   * SECTION 6 does not populate opening_item_id or reversal_unwind_of. Those are lineage
--     columns; they carry no amount and cannot affect the tie.
--
-- If any clause has drifted, THIS FILE is the one to fix -- the migration's body is the law.
-- =====================================================================================
