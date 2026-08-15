-- 0086_b3_reopen_ends_on_part2.sql -- B3 (ADR-068 ruling 1), the second half: the
-- ESTATE-WIDE censuses that 0085's replaced body obliges, taken from the LIVE catalog.
--
-- MIGRATION NUMBER claimed at MERGE (standing law), immediately after its part 1. The pair
-- moves together or not at all; the numbers are mechanical, the ORDER is not.
--
-- TWO FILES, ONE CHANGE, ORDER OBLIGATORY. 0085_b3_reopen_ends_on.sql carries the prestate,
-- the replaced clara.reopen_fiscal_year body and the post-checks that make the replacement
-- SAFE to leave in place. THIS file carries the censuses whose subject is the whole estate
-- rather than the one body, and it REFUSES to apply when part 1 has not: it reads part 1's
-- schema_migrations row AND, independently, the live body's own B3 markers, because a ledger
-- row is a claim about a run while the body is the thing itself. NAMED RESIDUE, restated from
-- part 1: between the two commits the new body is live with its safety post-checks passed and
-- the estate-wide approve-writer roster not yet re-taken. That window is one transaction
-- boundary inside a single migrate run. If this file fails, the run aborts with part 1
-- applied -- fix forward with a new migration, never by hand-editing either file.
--
-- WHY THE CENSUSES BELONG TO A MIGRATION AT ALL. 0045 minted an approve-path detector and
-- pinned the writers it found; 0056 grew the roster four to five with finalize_close and
-- said so in-migration. B3 grows it five to six, because reopen_fiscal_year now performs its
-- own census-visible flip instead of delegating to reverse_entry. An enumeration is never the
-- enforcement -- the walls are -- but an UNCHECKED enumeration is worse than a checked one,
-- and a roster that silently grows is how an unaudited approve path arrives.
--
-- This file creates NO object, grants nothing and writes no row. It only measures.
set local statement_timeout = '5min';

do $tail$
declare
  v_src text; v_grantees text[]; v_n int; v_names text;
  v_flip int; v_rev int; v_stamp int; v_ord int; v_l004 int; v_l007 int; v_row int;
begin
  -- =========================================================================
  -- (1) PART 1 IS PRESENT. Two independent instruments: the ledger row, and the body.
  -- Either alone is a single point of failure -- a ledger row is a claim ABOUT a run, and a
  -- body carrying the markers without its row would mean the pair applied out of order.
  -- =========================================================================
  if not exists (select 1 from clara.schema_migrations m
                  where m.version like '%b3\_reopen\_ends\_on') then
    raise exception '0086: part 1 (b3_reopen_ends_on) is not recorded as applied -- this file is its second half and must never apply alone'
      using errcode = 'CLR10';
  end if;
  select prosrc into v_src from pg_proc
    where oid = 'clara.reopen_fiscal_year(uuid,text,jsonb,text)'::regprocedure;
  if v_src is null then
    raise exception '0086: clara.reopen_fiscal_year is absent at its pinned signature'
      using errcode = 'CLR10';
  end if;
  if position('''draft'', v_fy.ends_on' in v_src) = 0
     or position('''reopen_reversal'', v_mirror, 1' in v_src) = 0
     or position('clara.reverse_entry(' in v_src) <> 0 then
    raise exception '0086: the live reopen body does not carry part 1''s ends_on route -- the pair applied out of order, or something replaced the body between them'
      using errcode = 'CLR10';
  end if;
  -- The body must NOT still be 0056's: part 1's own prestate pins that sha, and reading it
  -- here from the same literal keeps this file independent of part 1's temp table.
  if encode(sha256(convert_to(v_src, 'UTF8')), 'hex')
     = '3ecf3380877951b7c984cc1883814a3b44aa4926fe9c5859e4433fc8c1d95f6c' then
    raise exception '0086: the live reopen body is still 0056''s'
      using errcode = 'CLR10';
  end if;

  -- =========================================================================
  -- (2) clara.reverse_entry IS BYTE-IDENTICAL to its pre-B3 body. The never-backdate law for
  -- TRANSACTION reversals is a claim about THAT body, so it is measured there. The sha is a
  -- durable literal rather than a stash handed between files: a pin that only exists inside
  -- one transaction cannot be re-checked by anything afterwards.
  -- =========================================================================
  if (select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') from pg_proc
        where oid = 'clara.reverse_entry(uuid,text,text)'::regprocedure)
     is distinct from 'cc01323e453de38afb83f0e50b300a488e8a963ce458c621dee9abec4651f4b9' then
    raise exception '0086: clara.reverse_entry is not the body B3 was authored against -- either B3 moved it (forbidden) or a sibling migration recut it and the never-backdate claim must be re-derived'
      using errcode = 'CLR10';
  end if;

  -- =========================================================================
  -- (3) THE ORDER IS TEXTUALLY WHAT IT CLAIMS. The acquisition order (row -> 004 -> 007) is
  -- 0056's containment for lock cycle 2 and survives; the ordering guard still appears TWICE
  -- (the second occurrence authoritative, under the locks); and the three effects sit in the
  -- order the permit's load-bearing role requires: the mirror's approve BEFORE the status
  -- flip, the original's linkage stamp AFTER it.
  -- =========================================================================
  v_ord := (length(v_src) - length(replace(v_src, 'reopen_ordering_violation', '')))
             / length('reopen_ordering_violation');
  if v_ord <> 2 then
    raise exception '0086: the reopen ordering guard appears % time(s), expected exactly 2', v_ord
      using errcode = 'CLR10';
  end if;
  v_row  := position('for update' in v_src);
  v_l004 := position('pg_advisory_xact_lock(203005004' in v_src);
  v_l007 := position('pg_advisory_xact_lock(203005007' in v_src);
  if v_row = 0 or v_l004 = 0 or v_l007 = 0 or v_row > v_l004 or v_l004 > v_l007 then
    raise exception '0086: the acquisition order (row -> 004 -> 007) no longer holds'
      using errcode = 'CLR10';
  end if;
  v_rev   := position('status=''approved'', approved_at = now()' in v_src);
  v_flip  := position('status = ''reopened''' in v_src);
  v_stamp := position('reversed_by = v_mirror' in v_src);
  if v_rev = 0 or v_flip = 0 or v_stamp = 0 or v_rev > v_flip or v_stamp < v_flip then
    raise exception '0086: the effects order broke (mirror approve %, status flip %, linkage stamp %) -- the permit stops being what admits the backdated write the moment the flip moves ahead of it', v_rev, v_flip, v_stamp
      using errcode = 'CLR10';
  end if;
  -- The body proves its OWN act rather than trusting these statements: it re-reads the row
  -- and the permit and compares with IS DISTINCT FROM, so a null on either side raises
  -- instead of evaluating to NULL and passing.
  if position('v_posted is distinct from v_fy.ends_on' in v_src) = 0
     or position('v_used is distinct from 1' in v_src) = 0 then
    raise exception '0086: the body no longer re-reads its own landed date/status and its permit consumption with null-safe comparisons'
      using errcode = 'CLR10';
  end if;

  -- (4) and (5) -- the two body-definition CENSUSES -- live in their OWN block below, and the
  -- split is MECHANICAL rather than stylistic. The repo's wiki dynamic-SQL gate classifies a
  -- block that BOTH reads function definitions from the catalog AND names the run-a-string
  -- statement as a change-of-record patch site, then demands a statically resolvable patch
  -- target. This block reads grants (whose privilege literal is that same word) and no
  -- definition; the census block reads definitions and never names that word. Neither is a
  -- patch site, and neither had to be weakened to say so.

  -- =========================================================================
  -- (6) THE 0057 S11.2 OBLIGATION, DISCHARGED FOR THE NEW MOVER. 0057's roster census runs
  -- at 0057's own apply and can never see a writer born after it, so the obligation is
  -- discharged HERE, in the file that creates the writer: reopen_fiscal_year's effect table
  -- is clara.journal_entries, its body performs a qualified static DML statement against
  -- that table (0057's own write-shaped predicate, not a mere mention -- the weaker version
  -- of this check was measurably vacuous), and that table carries t_snapshot_staleness.
  -- =========================================================================
  if lower(regexp_replace(regexp_replace(regexp_replace(coalesce(v_src, ''),
       '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
     !~ '(insert into|update|delete from) clara\.journal_entries\M' then
    raise exception '0086: reopen_fiscal_year performs no qualified static write against clara.journal_entries -- the roster claim would be prose, not a path'
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from pg_trigger g
    where g.tgrelid = 'clara.journal_entries'::regclass and g.tgname = 't_snapshot_staleness'
      and not g.tgisinternal;
  if v_n <> 1 then
    raise exception '0086: clara.journal_entries carries % t_snapshot_staleness trigger(s), expected 1 -- the new mover would be uncovered', v_n
      using errcode = 'CLR10';
  end if;

  -- =========================================================================
  -- (7) OWNERSHIP AND GRANTS UNMOVED across the pair. Part 1 proved definer + pinned
  -- search_path on the body it wrote; the owner and the grantee set are estate facts and
  -- belong with the censuses. The grantee read can SEE a PUBLIC grant (grantee 0 is mapped,
  -- never inner-joined away).
  -- =========================================================================
  if not exists (select 1 from pg_proc
                  where oid = 'clara.reopen_fiscal_year(uuid,text,jsonb,text)'::regprocedure
                    and prosecdef and pg_get_userbyid(proowner) = 'clara_fn_owner') then
    raise exception '0086: reopen_fiscal_year is not a clara_fn_owner SECURITY DEFINER'
      using errcode = 'CLR10';
  end if;
  select coalesce(array_agg(g order by g), '{}') into v_grantees from (
    select distinct case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as g
      from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid = 'clara.reopen_fiscal_year(uuid,text,jsonb,text)'::regprocedure
       and a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner) q;
  if v_grantees is distinct from array['clara_authenticated'] then
    raise exception '0086: reopen_fiscal_year grantees are %, expected exactly {clara_authenticated}', v_grantees
      using errcode = 'CLR10';
  end if;
  -- The permit table stays caller-unreachable: forged permits are what would turn a
  -- target-bound door into a generic one.
  foreach v_names in array array['clara_authenticated', 'clara_agent_ro', 'clara_runtime',
      'clara_wake_interactive', 'clara_wake_proactive'] loop
    if has_table_privilege(v_names, 'clara.close_write_permits', 'insert')
       or has_table_privilege(v_names, 'clara.close_write_permits', 'update')
       or has_table_privilege(v_names, 'clara.close_write_permits', 'select') then
      raise exception '0086: % can reach close_write_permits -- a forged permit would make the backdating door generic', v_names
        using errcode = 'CLR10';
    end if;
  end loop;

  raise notice '0086 part 2a OK: clara.reverse_entry is byte-identical to the body B3 was authored against, so the never-backdate law for TRANSACTION reversals is untouched and no verb gained a caller-supplied posting date. The effects order is textually what it claims (mirror approve BEFORE the status flip, the original''s linkage stamp AFTER it), both ordering guards survive, the acquisition order row -> 004 -> 007 holds, and the body re-reads its own landed date, status and single permit consumption with null-safe comparisons. 0057''s roster obligation is discharged for the new mover by its own write-shaped path plus the staleness trigger on journal_entries. Ownership, the pinned search_path and the clara_authenticated-only grant are unmoved, and clara.close_write_permits stays out of reach of every application role -- a forged permit is the one thing that would turn this target-bound door into a generic one.';
end $tail$;

-- =====================================================================================
-- THE TWO CENSUSES, in their own block. See the note above: this block reads function
-- DEFINITIONS and deliberately carries no `execute` token, so the wiki dynamic-SQL gate
-- reads it as what it is -- a catalog count -- rather than as an unattributable patch site.
-- =====================================================================================
do $census$
declare v_n int; v_names text;
  v_roster constant text :=
    '_approve_entry_core, _approve_opening_entry, approve_wrong_client_correction, finalize_close, reopen_fiscal_year, reverse_entry';
begin
  -- (4) THE APPROVE-WRITER CENSUS -- 0045's own instrument (comment-stripped, whitespace-
  -- collapsed, bare-form tolerant because every clara body runs `set search_path = clara`),
  -- replicated against the LIVE catalog. The pinned five grow to SIX and the sixth is this
  -- verb. NAMES, not just a count: a count alone passes a substitution.
  select count(*)::int, string_agg(p.proname::text, ', ' order by p.proname::text collate "C")
    into v_n, v_names
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace and p.prokind = 'f'
     and lower(regexp_replace(regexp_replace(regexp_replace(
           (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '')),
           '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
         ~* 'update[[:space:]]+(only[[:space:]]+)?(clara[[:space:]]*\.[[:space:]]*)?journal_entries[[:space:]]+set[[:space:]]+status[[:space:]]*=[[:space:]]*''approved''';
  if v_n <> 6 or v_names is distinct from v_roster then
    raise exception '0086: the approve-writer census reads % (%), expected 0045''s pinned five plus reopen_fiscal_year', v_n, v_names
      using errcode = 'CLR10';
  end if;

  -- (5) THE SUBLEDGER-HOOK CALLER CENSUS, the same shape and the same reason: reopen's own
  -- approve path calls clara._subledger_on_approve (the hook is CALLED, never argued a
  -- no-op), so the caller set grows five to six alongside the approve writers. The
  -- self-match guard is 0042's: pg_get_functiondef's header line for the hook itself
  -- matches its own call shape, which is why the target is excluded by name.
  select count(*)::int, string_agg(p.proname::text, ', ' order by p.proname::text collate "C")
    into v_n, v_names
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.proname <> '_subledger_on_approve'
     and (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), ''))
         like '%clara._subledger_on_approve(%';
  if v_n <> 6 or v_names is distinct from v_roster then
    raise exception '0086: the _subledger_on_approve caller census reads % (%), expected the pinned five plus reopen_fiscal_year', v_n, v_names
      using errcode = 'CLR10';
  end if;

  raise notice '0086 part 2b OK: the approve-writer roster grows 0045''s pinned five to SIX and the sixth is reopen_fiscal_year, which now performs its own census-visible flip instead of delegating to reverse_entry; the _subledger_on_approve caller census grows with it by the same one name, so the subledger hook is provably CALLED on the reopen reversal rather than argued a no-op. Both censuses assert the NAMES, not merely the count -- a count alone passes a substitution.';
end $census$;
