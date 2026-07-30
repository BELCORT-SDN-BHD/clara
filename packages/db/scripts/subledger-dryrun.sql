-- subledger-dryrun.sql -- the MANDATORY read-only precheck for migration 0037 (WCA-R9a).
--
-- WHAT THIS IS. A strictly read-only script that answers, against the LIVE database and
-- BEFORE 0037 is applied, the one question the ceremony cannot afford to discover halfway
-- through: does the existing approved book decompose into an AR/AP open-item subledger that
-- ties to the control accounts to the sen, and does it satisfy the structural laws 0037's
-- tables and triggers will start enforcing?
--
-- HOW TO RUN IT, exactly:
--     python ~/.clara-tools/live_psql_file.py packages/db/scripts/subledger-dryrun.sql
--
-- THE RUNNER IS live_psql_file.py AND THE REASON IS NOT STYLE. live_ro.py runs psql with
-- `-c` -- ONE statement string -- and cannot run a file at all. And there is NO read-only
-- database role in this estate: both helpers open the same owner DSN out of
-- ~/.clara-live-dsn.txt. So the read-only property of this precheck is enforced BY THIS
-- SCRIPT -- it opens `begin transaction read only` and ends in `rollback`, and PostgreSQL
-- refuses any write inside that block -- not by the credential it runs under. Saying it any
-- other way would be claiming a safety property the estate does not have.
--
-- IT DOES EXECUTE ONE FUNCTION: clara._canonical_counterparty, which is SECURITY DEFINER and
-- REVOKEd from PUBLIC (a lesser role could not run it even if one existed). It reads only,
-- but it RAISES CLR23 'counterparty merge chain is invalid' on a cyclic or over-deep merge
-- chain. With ON_ERROR_STOP set, that aborts the run -- correctly: a broken merge chain is a
-- real finding about the corpus and the ceremony must not start on it.
--
-- Apart from that one function it reads nothing but clara.journal_entries,
-- clara.journal_lines, clara.coa_accounts and clara.counterparties, and it writes nothing.
-- It is estate-wide (everything groups by client), so it is ONE run, not one per firm.
--
-- IT CANNOT REFERENCE ANY 0037 OBJECT. clara.open_items, clara.open_item_allocations and
-- clara._subledger_classify_entry do not exist yet when this runs -- that is the whole point
-- -- so the classifier's decomposition logic is MODELLED below. See THE DRIFT CAVEAT at the
-- bottom for the discipline that keeps the two copies honest.
--
-- HOW THE CEREMONY USES IT.
--   1. Run it. Capture the whole output with the run.
--   2. SECTION 0 must show the EXPECTED estate: firms = :expected_firms (pinned at the top,
--      overridable with -v), and a non-zero entry/line census. A session that can see nothing
--      -- or only part of the estate -- produces zero rows in every probe below, and zero rows
--      is what GREEN looks like, so this census is the only thing standing between "clean
--      corpus" and "empty (or half-visible) session". It is a GATE, not a header.
--   3. SECTIONS 1-6 must each return ZERO rows.
--   4. SECTION 7 is the informational census; capture it for the post-apply diff.
--   5. SECTION 8 prints ONE machine-checkable row. `gate = GO` and nothing else starts the
--      ceremony. ANYTHING ELSE = THE CEREMONY DOES NOT START -- remediate through the
--      sanctioned verbs first (reverse and re-code, or rebind the counterparty), never with a
--      hand UPDATE, then re-run this.
--   6. After the migration applies on the rig, section 7's per-entry census can be diffed
--      against clara._subledger_decompose_preview(client, domain) -- see the drift caveat.
--
-- SIGN CONVENTION, stated once and used everywhere below: for the 'ar' domain a POSITIVE
-- amount means the customer owes us (control debits minus credits); for 'ap' a POSITIVE
-- amount means we owe the supplier (control credits minus debits). Only APPROVED entries are
-- in the books, so every read joins status='approved' -- an opening entry can be WITHDRAWN
-- after its draft-time clara.opening_items row exists, which is exactly why the decomposition
-- is entries-driven and never opening_items-driven.

\set ON_ERROR_STOP on
\pset pager off
\timing off

-- THE EXPECTED FIRM COUNT -- a pinned NUMBER, not a "> 0". Section 0 exists to tell an empty
-- session apart from a clean corpus, and "> 0" only does half that job: a PARTIALLY visible
-- session -- one firm of four, because a policy, a search_path or a wrong DSN scoped it --
-- passes a positive census and then returns zero rows from every probe below, which reads as
-- a perfect green over a corpus it never scanned. Equality is the only form that catches it.
-- 4 = the live estate at the C-a ceremony (BELCORT, ROME PUBLIC ADVISORY, Alara Advisory,
-- Borneo Books). A rig or a future estate states its own count on the command line rather
-- than editing this file:
--     psql -v expected_firms=1 -f packages/db/scripts/subledger-dryrun.sql
-- (and the ceremony's runner takes the same -v). If the live count ever changes, the honest
-- fix is to change this default in the same commit that changes the estate.
\if :{?expected_firms}
\else
\set expected_firms 4
\endif

begin transaction read only;

-- =====================================================================================
-- SECTION 0 -- THE VISIBILITY CENSUS. POSITIVE gate: the entry and line counts must be
-- NON-ZERO, and the FIRM count must equal :expected_firms EXACTLY (see the \set at the top --
-- "> 0" would pass a partially-visible session, which is the failure this census exists for).
--
-- Every other probe in this file passes by returning nothing. A session that sees an empty
-- database -- wrong target, an RLS-scoped role, a typo in the DSN -- returns nothing from all
-- of them and reads as a perfect green. This section is the only thing that can tell those
-- two states apart, which is why it runs first and why its numbers go in the GO/NO-GO row.
-- =====================================================================================
select 'SECTION 0 -- visibility census (firms must EQUAL the pin; the rest > 0)' as probe,
       (select count(*) from clara.firms)                                    as firms,
       (select count(*) from clara.clients)                                  as clients,
       (select count(*) from clara.journal_entries where status='approved')  as approved_entries,
       (select count(*)
          from clara.journal_entries e
          join clara.journal_lines l on l.entry_id = e.id
          join clara.coa_accounts a
            on a.client_id = l.client_id and a.account_code = l.account_code
         where e.status='approved' and a.account_class in ('payable','receivable'))
                                                                             as approved_control_lines;

select (select count(*) from clara.firms)                                   as n_firms,
       (select count(*) from clara.journal_entries where status='approved') as n_approved,
       (select count(*)
          from clara.journal_entries e
          join clara.journal_lines l on l.entry_id = e.id
          join clara.coa_accounts a
            on a.client_id = l.client_id and a.account_code = l.account_code
         where e.status='approved' and a.account_class in ('payable','receivable'))
                                                                            as n_control_lines
\gset

-- =====================================================================================
-- SECTION 1 -- THE TIE. Per client x domain: the MODELLED subledger total vs the control GL
-- balance. MUST RETURN ZERO ROWS.
--
-- WHY THIS IS NOT A TAUTOLOGY, since the first cut of this file was one and returned a green
-- that could not fail for any corpus whatsoever. If both sides sum the SAME per-line scan and
-- differ only by dropping zero-valued groups, the difference is identically zero as a matter
-- of arithmetic -- there is no corpus that can make such a probe fire, so it tests nothing.
--
-- What 0037's classifier actually does is asymmetric, and THAT is what this models:
--   * a NON-REVERSAL entry decomposes from its OWN control legs, netted per (domain, CANONICAL
--     counterparty), with every zero net dropped;
--   * an approved REVERSAL decomposes as the exact NEGATION of its ORIGINAL's decomposition --
--     it never looks at the mirror's own legs at all.
-- The GL side, by contrast, sums EVERY approved control leg, mirrors included. The two agree
-- only if a mirror's own legs really are the negation of its original's, which is a FACT
-- ABOUT THE WRITERS (reverse_entry and approve_wrong_client_correction copy journal_lines
-- verbatim with the sides swapped), not a fact about arithmetic. A corpus where any mirror was
-- edited, partially copied, or re-drafted makes this section fire. Section 5 then names which
-- one and by how much.
--
-- The canonicalisation is load-bearing in the same way: two parties later merged into one
-- collapse into ONE item, and a decomposition that grouped on the raw stored id would produce
-- two rows the running system will never write.
-- =====================================================================================
select 'SECTION 1 -- tie diff (must be empty)' as probe, *
from (
  with entry_decomp as (
    -- NON-REVERSAL entries, from their own legs, per (domain, canonical counterparty).
    select e.id as entry_id, e.client_id,
           case a.account_class when 'receivable' then 'ar' else 'ap' end as domain,
           clara._canonical_counterparty(e.client_id, l.counterparty_id) as counterparty_id,
           sum(case when a.account_class = 'receivable'
                    then l.debit_cents - l.credit_cents
                    else l.credit_cents - l.debit_cents end)::bigint as amount_cents
    from clara.journal_entries e
    join clara.journal_lines l on l.entry_id = e.id
    join clara.coa_accounts a
      on a.client_id = l.client_id and a.account_code = l.account_code
    where e.status = 'approved' and e.reversal_of is null
      and a.account_class in ('payable','receivable')
    group by 1, 2, 3, 4
    having sum(case when a.account_class = 'receivable'
                    then l.debit_cents - l.credit_cents
                    else l.credit_cents - l.debit_cents end) <> 0
  ),
  reversal_decomp as (
    -- APPROVED REVERSALS, as the exact negation of the ORIGINAL's decomposition. The join to
    -- entry_decomp is what makes this the classifier's ladder 1 and not a second reading of
    -- the mirror's legs.
    select m.id as entry_id, m.client_id, d.domain, d.counterparty_id,
           (-sum(d.amount_cents))::bigint as amount_cents
    from clara.journal_entries m
    join entry_decomp d on d.entry_id = m.reversal_of
    where m.status = 'approved' and m.reversal_of is not null
    group by 1, 2, 3, 4
    having sum(d.amount_cents) <> 0
  ),
  items as (
    select client_id, domain, sum(amount_cents)::bigint as item_cents
    from (select * from entry_decomp union all select * from reversal_decomp) u
    group by 1, 2
  ),
  gl as (
    select e.client_id,
           case a.account_class when 'receivable' then 'ar' else 'ap' end as domain,
           sum(case when a.account_class = 'receivable'
                    then l.debit_cents - l.credit_cents
                    else l.credit_cents - l.debit_cents end)::bigint as gl_cents
    from clara.journal_entries e
    join clara.journal_lines l on l.entry_id = e.id
    join clara.coa_accounts a
      on a.client_id = l.client_id and a.account_code = l.account_code
    where e.status = 'approved' and a.account_class in ('payable','receivable')
    group by 1, 2
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

select count(*) as n_sec1 from (
  with entry_decomp as (
    select e.id as entry_id, e.client_id,
           case a.account_class when 'receivable' then 'ar' else 'ap' end as domain,
           clara._canonical_counterparty(e.client_id, l.counterparty_id) as counterparty_id,
           sum(case when a.account_class = 'receivable'
                    then l.debit_cents - l.credit_cents
                    else l.credit_cents - l.debit_cents end)::bigint as amount_cents
    from clara.journal_entries e
    join clara.journal_lines l on l.entry_id = e.id
    join clara.coa_accounts a
      on a.client_id = l.client_id and a.account_code = l.account_code
    where e.status = 'approved' and e.reversal_of is null
      and a.account_class in ('payable','receivable')
    group by 1, 2, 3, 4
    having sum(case when a.account_class = 'receivable'
                    then l.debit_cents - l.credit_cents
                    else l.credit_cents - l.debit_cents end) <> 0
  ),
  reversal_decomp as (
    select m.id as entry_id, m.client_id, d.domain, d.counterparty_id,
           (-sum(d.amount_cents))::bigint as amount_cents
    from clara.journal_entries m
    join entry_decomp d on d.entry_id = m.reversal_of
    where m.status = 'approved' and m.reversal_of is not null
    group by 1, 2, 3, 4
    having sum(d.amount_cents) <> 0
  ),
  items as (
    select client_id, domain, sum(amount_cents)::bigint as item_cents
    from (select * from entry_decomp union all select * from reversal_decomp) u
    group by 1, 2
  ),
  gl as (
    select e.client_id,
           case a.account_class when 'receivable' then 'ar' else 'ap' end as domain,
           sum(case when a.account_class = 'receivable'
                    then l.debit_cents - l.credit_cents
                    else l.credit_cents - l.debit_cents end)::bigint as gl_cents
    from clara.journal_entries e
    join clara.journal_lines l on l.entry_id = e.id
    join clara.coa_accounts a
      on a.client_id = l.client_id and a.account_code = l.account_code
    where e.status = 'approved' and a.account_class in ('payable','receivable')
    group by 1, 2
  )
  select 1 from gl full outer join items
    on items.client_id = gl.client_id and items.domain = gl.domain
  where coalesce(gl.gl_cents, 0) is distinct from coalesce(items.item_cents, 0)
) z \gset

-- =====================================================================================
-- SECTION 2 -- COUNTERPARTY-LESS CONTROL LINES. MUST RETURN ZERO ROWS.
-- A control-class line with no counterparty contributes to the GL control balance but can
-- produce no open item, so it breaks the identity outright. 0037 refuses to apply if any
-- exists (its probe 1). REMEDY: reverse and re-code the affected entries through the
-- sanctioned verbs.
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

select count(*) as n_sec2
from clara.journal_entries e
join clara.journal_lines l on l.entry_id = e.id
join clara.coa_accounts a on a.client_id = l.client_id and a.account_code = l.account_code
where e.status = 'approved' and a.account_class in ('payable','receivable')
  and l.counterparty_id is null \gset

-- =====================================================================================
-- SECTION 3 -- KIND CONTRADICTIONS. MUST RETURN ZERO ROWS.
-- domain 'ar' demands a counterparty of kind 'customer'; 'ap' demands 'vendor'. Both lanes
-- write wrong attributions silently today -- a NULL-coding_kind birth defaults to 'vendor' --
-- so this is the probe most likely to find something on a real corpus.
-- REMEDY: bind the correct counterparty (or state kind:'customer' in the proposal) through
-- the sanctioned verbs before the ceremony. (0037's probe 2.)
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

select count(*) as n_sec3
from clara.journal_entries e
join clara.journal_lines l on l.entry_id = e.id
join clara.coa_accounts a on a.client_id = l.client_id and a.account_code = l.account_code
join clara.counterparties cp
  on cp.id = clara._canonical_counterparty(e.client_id, l.counterparty_id)
where e.status = 'approved' and a.account_class in ('payable','receivable')
  and ((a.account_class = 'receivable' and cp.kind <> 'customer')
    or (a.account_class = 'payable'    and cp.kind <> 'vendor')) \gset

-- =====================================================================================
-- SECTION 4 -- CROSS-DOMAIN CONTRA ENTRIES. MUST RETURN ZERO ROWS.
-- One entry with control NETS in BOTH domains is a set-off between a customer and a supplier.
-- After 0037 it refuses at approve; a pre-existing one is an owner decision, not an
-- engineering one. REMEDY: split via a clearing account, one entry per domain.
--
-- COUNTED ON NETS, NOT ON LEGS, to state exactly the law the running system will enforce:
-- 0037's refusal counts distinct domains over CLASSIFIER output, and the classifier drops
-- zero nets. An entry carrying a receivable leg pair that cancels has ONE domain, not two, and
-- a leg-counting probe would stop the ceremony over a corpus the running system accepts.
-- (0037's probe 3 counts the same way.)
-- =====================================================================================
select 'SECTION 4 -- entries with control NETS in BOTH domains (must be empty)' as probe, *
from (
  select z.client_id, z.entry_id, z.posting_date, z.memo
  from (
    select e.client_id, e.id as entry_id, e.posting_date, e.memo,
           case a.account_class when 'receivable' then 'ar' else 'ap' end as domain,
           sum(case when a.account_class = 'receivable'
                    then l.debit_cents - l.credit_cents
                    else l.credit_cents - l.debit_cents end)::bigint as amount_cents
    from clara.journal_entries e
    join clara.journal_lines l on l.entry_id = e.id
    join clara.coa_accounts a on a.client_id = l.client_id and a.account_code = l.account_code
    where e.status = 'approved' and a.account_class in ('payable','receivable')
    group by 1, 2, 3, 4, 5
  ) z
  where z.amount_cents <> 0
  group by 1, 2, 3, 4
  having count(distinct z.domain) > 1
) y order by client_id, entry_id;

select count(*) as n_sec4 from (
  select z.entry_id
  from (
    select e.id as entry_id,
           case a.account_class when 'receivable' then 'ar' else 'ap' end as domain,
           sum(case when a.account_class = 'receivable'
                    then l.debit_cents - l.credit_cents
                    else l.credit_cents - l.debit_cents end)::bigint as amount_cents
    from clara.journal_entries e
    join clara.journal_lines l on l.entry_id = e.id
    join clara.coa_accounts a on a.client_id = l.client_id and a.account_code = l.account_code
    where e.status = 'approved' and a.account_class in ('payable','receivable')
    group by 1, 2
  ) z
  where z.amount_cents <> 0
  group by 1
  having count(distinct z.domain) > 1
) y \gset

-- =====================================================================================
-- SECTION 5 -- THE MIRROR LEMMA. MUST RETURN ZERO ROWS.
--
-- Section 1's reversal side is derived from the ORIGINAL's legs; its GL side sums the
-- MIRROR's own legs. They agree only because reverse_entry and approve_wrong_client_correction
-- copy journal_lines VERBATIM with the sides swapped -- i.e. a mirror's per-(domain,
-- counterparty) nets are the exact negation of its original's. This probe TESTS that lemma
-- instead of assuming it, and it is the section that NAMES the offender when section 1 fires.
-- (0037's probe 4.)
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

select count(*) as n_sec5 from (
  with pair_nets as (
    select m.id as mirror_id,
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
    group by 1, 2, 3
    union all
    select m.id,
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
    group by 1, 2, 3
  )
  select 1 from pair_nets group by mirror_id, domain, counterparty_id
  having sum(mirror_cents) is distinct from -sum(original_cents)
) z \gset

-- =====================================================================================
-- SECTION 6 -- THE KIND-MATRIX SIGN LAW. MUST RETURN ZERO ROWS.
--
-- 0037's ck_open_items_kind_matrix says a 'bill' is a POSITIVE payable claim, an 'invoice' a
-- POSITIVE receivable claim and a 'credit_note' a NEGATIVE receivable claim. Nothing in the
-- PRE-0037 schema says so: account_class is a per-client CHART property, and a typed entry
-- whose control net came out on the wrong side -- a supplier credit mis-coded AS a bill, the
-- exact trap the section-4.9 credit-note wall names -- decomposes into a row the backfill
-- INSERT cannot write. Without this probe that lands mid-migration as a bare CHECK violation
-- with no remedy attached. (0037's probe 5 is this same test, in-migration.)
--
-- Only the three typed anchors are testable: the settlement kinds cannot exist before 0037
-- widens the coding-kind CHECK, and opening / reversal_unwind / adjustment admit EITHER sign
-- by design. REMEDY: reverse and re-code the entry through the sanctioned verbs, or correct
-- the account_class of the control account it touches.
-- =====================================================================================
select 'SECTION 6 -- classified (kind, domain, sign) triples that violate the matrix (must be empty)' as probe, *
from (
  select e.client_id, e.id as entry_id, e.posting_date, e.coding_kind,
         case a.account_class when 'receivable' then 'ar' else 'ap' end as domain,
         clara._canonical_counterparty(e.client_id, l.counterparty_id) as counterparty_id,
         case e.coding_kind when 'supplier_bill' then 'bill'
                            when 'sales_invoice' then 'invoice'
                            else 'credit_note' end as item_kind,
         sum(case when a.account_class = 'receivable'
                  then l.debit_cents - l.credit_cents
                  else l.credit_cents - l.debit_cents end)::bigint as amount_cents
  from clara.journal_entries e
  join clara.journal_lines l on l.entry_id = e.id
  join clara.coa_accounts a on a.client_id = l.client_id and a.account_code = l.account_code
  where e.status = 'approved' and a.account_class in ('payable','receivable')
    and e.reversal_of is null and not e.is_opening_balance
    and e.coding_kind in ('supplier_bill','sales_invoice','sales_credit_note')
  group by 1, 2, 3, 4, 5, 6, 7
) z
where z.amount_cents <> 0
  and not ((z.item_kind = 'bill'        and z.domain = 'ap' and z.amount_cents > 0)
        or (z.item_kind = 'invoice'     and z.domain = 'ar' and z.amount_cents > 0)
        or (z.item_kind = 'credit_note' and z.domain = 'ar' and z.amount_cents < 0))
order by client_id, entry_id;

select count(*) as n_sec6 from (
  select e.id as entry_id,
         case a.account_class when 'receivable' then 'ar' else 'ap' end as domain,
         clara._canonical_counterparty(e.client_id, l.counterparty_id) as counterparty_id,
         case e.coding_kind when 'supplier_bill' then 'bill'
                            when 'sales_invoice' then 'invoice'
                            else 'credit_note' end as item_kind,
         sum(case when a.account_class = 'receivable'
                  then l.debit_cents - l.credit_cents
                  else l.credit_cents - l.debit_cents end)::bigint as amount_cents
  from clara.journal_entries e
  join clara.journal_lines l on l.entry_id = e.id
  join clara.coa_accounts a on a.client_id = l.client_id and a.account_code = l.account_code
  where e.status = 'approved' and a.account_class in ('payable','receivable')
    and e.reversal_of is null and not e.is_opening_balance
    and e.coding_kind in ('supplier_bill','sales_invoice','sales_credit_note')
  group by 1, 2, 3, 4
) z
where z.amount_cents <> 0
  and not ((z.item_kind = 'bill'        and z.domain = 'ap' and z.amount_cents > 0)
        or (z.item_kind = 'invoice'     and z.domain = 'ar' and z.amount_cents > 0)
        or (z.item_kind = 'credit_note' and z.domain = 'ar' and z.amount_cents < 0)) \gset

-- =====================================================================================
-- SECTION 7 -- THE CENSUS. Informational, not a gate: the exact items 0037's backfill will
-- write, per client x domain x counterparty, with the precedence-ladder kind. Capture it with
-- the run; after the rig apply, the same shape comes out of
--   select * from clara._subledger_decompose_preview(<client>, null);
-- and the two must agree row for row apart from the unwind lineage columns (this script
-- computes a mirror's OWN nets, which section 5 has just proven identical to the negated
-- original the real classifier uses).
-- =====================================================================================
select 'SECTION 7 -- census (informational)' as probe, *
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
-- SECTION 8 -- THE GATE. ONE row, machine-checkable. `gate` must read exactly GO.
--
-- It restates every number above rather than re-deriving them, so the gate can never disagree
-- with the sections a human just read. Note that `visible` is part of the AND, and that its
-- firm test is an EQUALITY against the pin: a session that saw nothing -- or saw one firm of
-- four -- fails here even though every probe above returned zero rows, which is the whole
-- reason section 0 exists.
-- =====================================================================================
select case when :n_firms = :expected_firms and :n_approved > 0 and :n_control_lines > 0
             and :n_sec1 = 0 and :n_sec2 = 0 and :n_sec3 = 0
             and :n_sec4 = 0 and :n_sec5 = 0 and :n_sec6 = 0
            then 'GO' else 'NO-GO' end                       as gate,
       (:n_firms = :expected_firms and :n_approved > 0 and :n_control_lines > 0) as visible,
       :expected_firms as expected_firms,
       :n_firms as firms, :n_approved as approved_entries,
       :n_control_lines as approved_control_lines,
       :n_sec1 as tie_diffs, :n_sec2 as counterparty_less_lines,
       :n_sec3 as kind_contradictions, :n_sec4 as cross_domain_entries,
       :n_sec5 as mirror_lemma_breaks, :n_sec6 as kind_matrix_breaks;

rollback;

-- =====================================================================================
-- THE DRIFT CAVEAT -- read this before trusting a GO.
--
-- This script is a HAND MODEL of clara._subledger_classify_entry's decomposition, written
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
--   zero-net-drop is identical, (d) the canonicalisation of the counterparty is identical on
--   BOTH the entry side and the reversal side, and (e) section 1's reversal arm still derives
--   from the ORIGINAL's decomposition rather than from the mirror's own legs.
--   Then run clara._subledger_decompose_preview on the rig for the same client and confirm
--   section 7 above reproduces it.
--
-- Two KNOWN and DELIBERATE differences, which are not drift:
--   * SECTION 7 computes a reversal mirror's OWN control nets; the real classifier -- and
--     section 1 of this script -- negate the ORIGINAL's decomposition. Section 5 proves those
--     are the same thing for this corpus, and it is a GATE precisely so this difference can
--     never hide a divergence.
--   * SECTION 7 does not populate opening_item_id or reversal_unwind_of. Those are lineage
--     columns; they carry no amount and cannot affect the tie.
--
-- If any clause has drifted, THIS FILE is the one to fix -- the migration's body is the law.
-- =====================================================================================
