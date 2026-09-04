-- =====================================================================================
-- DB-A / 8 of 8 -- THE UNMEASURABLE BANK ACCOUNT BECOMES AN OUTSTANDING ITEM (H-55, the
-- review's blocker).
--
-- APPLY ORDER: AFTER dba3, which mints the `no_statements` key this file enumerates.
--
-- WHAT dba3 LEFT OPEN, AND IT IS A GAP I OPENED. dba3 gave _close_gate_bank_items a third
-- population -- enrolled accounts the fiscal year holds no statement for at all -- and drove
-- state='unknown' from it. That is the right verdict, and on its own it is not enough, because
-- drawer 2's admission does not read `state`. It reads ITEMS:
--
--   finalize_close (0128:204-231) fires its drawer-2 arm on state in (fail, unknown, error),
--   then calls clara._gate_outstanding_items(check_key, measured) and requires every key IT
--   returns to carry a live attestation bound to the current digest. If that list comes back
--   EMPTY the arm substitutes array['__gate__'], so a blanket attestation is demanded.
--
-- clara._gate_outstanding_items' open_bank_recon_items branch (0104:596-603, the live body)
-- enumerates open_exceptions and statement_gaps and NOTHING ELSE, so the new population is
-- invisible to every consumer that reaches items through it: finalize_close's admission,
-- attest_close_exception's accepted-key domain (0120:979-994), get_close_readiness and the
-- theta close plan.
--
-- WHAT THAT COSTS TODAY, STATED PRECISELY RATHER THAN DRAMATICALLY. The review that found
-- this described a close SEALING over the unmeasurable account. MEASURED, IT DOES NOT --
-- and the reason is a DIFFERENT gate, which is exactly why the enumeration still has to be
-- fixed rather than leaned on. clara.bank_recon_close_state, the DRAWER-1 bank_recon_identity
-- gate, enumerates from the same account registry and answers `unknown` with reason
-- `no_statements_loaded` for an enrolled account carrying no statements (its own body, read;
-- reproduced on the rig while authoring this file). A drawer-1 unknown refuses ABSOLUTELY,
-- for anybody, with no attestation path -- so finalize_close stops before it ever reaches
-- drawer 2. The user-facing cost is therefore a DEAD END, not an unsafe seal: the
-- professional is refused, and cannot name the account to attest it either, because
-- `<id>:no_statements` is not in attest_close_exception's accepted key domain and a blanket
-- attestation is refused the moment any other item exists.
--
-- SO WHY FIX IT AT ALL, IF ANOTHER GATE CATCHES THE SHAPE? Because "another gate happens to
-- refuse" is the definition of absence-as-evidence (law 2). This gate measured a population
-- and then did not carry it into the one list its own consumers read; that is a hole whether
-- or not a neighbour is standing in front of it today. If bank_recon_identity's shape moves,
-- or an account somehow holds a completed reconciliation covering FY end without a statement
-- inside the year, the neighbour steps aside and nothing is left. A gate owns its own
-- population.
--
-- THE KEY SHAPE IS `<bank_account_id>:no_statements`, and it cannot collide with the gap
-- keys beside it: a gap key is `<bank_account_id>:<YYYY-MM>` and no month renders as the
-- literal `no_statements`. attest_close_exception needs no change -- it derives its accepted
-- item keys from this very function (0120:979-994, read), so the new key becomes attestable
-- the moment the arm lands, and an item this function does not name is refused by that same
-- body as `attest_item_unknown`.
--
-- EXTEND-ONLY, PROVEN BY CONSTRUCTION rather than asserted: the tail removes the added
-- fragment from the installed prosrc and requires the pinned pre-image back BYTE FOR BYTE.
-- That is 0104:832's own shape ("removing the new arm reproduces the pinned body exactly"),
-- reused deliberately -- four other bodies read this function and a silent move in any other
-- arm would change what a signed attestation covers.
--
-- D1 WRITE-QUIESCE IS OWED, for the reason 0104:168 names about this same body: it is READ
-- INSIDE finalize_close's transaction, and PostgreSQL runs an in-flight PL/pgSQL call to
-- completion on the body it STARTED with. A close finalizing across this deploy would
-- enumerate its items from the OLD, narrower body and could admit on a list that never
-- included the unmeasurable account. One body, one window.
-- =====================================================================================

-- Precautionary, not load-bearing: one CREATE OR REPLACE on a small STABLE sql body.
set local statement_timeout = '5min';
set local lock_timeout = '5s';

-- The pre-image STASH. The tail's extend-only proof subtracts the added fragment from the
-- INSTALLED body and requires this exact text back, so the comparison is against what was
-- actually live at prestate time -- never against this file's own retyping of it, which would
-- make the proof compare the file to itself.
create temp table _dba8_pre(k text primary key, v text) on commit drop;

-- =====================================================================================
-- PRESTATE
-- =====================================================================================
do $dba8_pre$
declare v_src text; v_got text;
begin
  if to_regprocedure('clara._gate_outstanding_items(text,jsonb)') is null then
    raise exception 'dba8 prestate: clara._gate_outstanding_items does not resolve' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._bank_enrolled_fy_months(uuid,date,date)') is null then
    raise exception 'dba8 prestate: dba3 has not applied -- the no_statements key this file enumerates does not exist yet'
      using errcode = 'CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._gate_outstanding_items(text,jsonb)'::regprocedure;
  v_got := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
  -- The POST-0104 body (0104:581's re-cut, which added the undated_documents arm), measured
  -- on a full replay to the frontier while authoring this file. NOT 0104:285's constant --
  -- that one pins the PRE-0104 body, and confusing the two is exactly how a "verbatim" claim
  -- gets made against text that is not live.
  if v_got <> '2df52b8f6ae75a6e0ca2cabe6d9527c390af3b9e9bd9af08a5056f1f667c4341' then
    raise exception 'dba8 prestate: _gate_outstanding_items prosrc sha256 is % -- not the post-0104 body this file was authored against. STOP.', v_got
      using errcode = 'CLR10';
  end if;
  if position('no_statements' in v_src) <> 0 then
    raise exception 'dba8 prestate: the body already enumerates no_statements -- already applied to this database'
      using errcode = 'CLR10';
  end if;
  -- The three things the retyped body below carries verbatim, witnessed BEFORE the replace.
  if position('when ''undated_documents'' then' in v_src) = 0
     or position('''statement_gaps''' in v_src) = 0
     or position('''open_exceptions''' in v_src) = 0 then
    raise exception 'dba8 prestate: the live body is missing 0104''s undated arm or the two bank populations -- this is not the body this file retypes'
      using errcode = 'CLR10';
  end if;

  -- THE CONSUMER THIS FILE EXISTS FOR. If finalize_close stopped reading items, the fix would
  -- be aimed at a seam that no longer decides anything.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.finalize_close(uuid,text,text)'::regprocedure;
  if position('clara._gate_outstanding_items(g.check_key, g.measured)' in v_src) = 0
     or position('__gate__' in v_src) = 0 then
    raise exception 'dba8 prestate: finalize_close no longer enumerates items through _gate_outstanding_items -- the blocker this file closes is not where it was found'
      using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._gate_outstanding_items(text,jsonb)'::regprocedure;
  insert into _dba8_pre(k, v) values ('prosrc:_gate_outstanding_items', v_src);
  raise notice 'dba8 prestate: clean -- _gate_outstanding_items matches its post-0104 pre-image sha, does not yet enumerate no_statements, and finalize_close still admits drawer 2 by item list.';
end $dba8_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- S1 -- clara._gate_outstanding_items : ONE FRAGMENT ADDED TO ONE ARM.
--
-- 0104:581's body retyped verbatim -- all five arms, the same order, the same spacing -- with
-- a third `union all` inside open_bank_recon_items and nothing else touched. The tail proves
-- that claim by subtraction rather than by reading.
-- =====================================================================================
create or replace function clara._gate_outstanding_items(p_check_key text, p_measured jsonb)
  returns text[] language sql stable security definer set search_path = clara, pg_temp as $fn$
  select case p_check_key
    when 'unapproved_drafts_in_period' then
      coalesce((select array_agg(x ->> 'entry_id' order by x ->> 'entry_id')
        from jsonb_array_elements(coalesce(p_measured -> 'drafts', '[]'::jsonb)) x), '{}')
    when 'uncoded_documents' then
      coalesce((select array_agg(x ->> 'filing_id' order by x ->> 'filing_id')
        from jsonb_array_elements(coalesce(p_measured -> 'uncoded', '[]'::jsonb)) x), '{}')
    when 'undated_documents' then
      coalesce((select array_agg(x ->> 'filing_id' order by x ->> 'filing_id')
        from jsonb_array_elements(coalesce(p_measured -> 'undated', '[]'::jsonb)) x), '{}')
    when 'depreciation_through_fy_end' then
      coalesce((select array_agg(x ->> 'asset_id' order by x ->> 'asset_id')
        from jsonb_array_elements(coalesce(p_measured -> 'lagging_assets', '[]'::jsonb)) x), '{}')
    when 'open_bank_recon_items' then
      coalesce((select array_agg(k order by k) from (
        select x ->> 'exception_id' as k
          from jsonb_array_elements(coalesce(p_measured -> 'open_exceptions', '[]'::jsonb)) x
        union all
        select (g ->> 'bank_account_id') || ':' || (g ->> 'month')
          from jsonb_array_elements(coalesce(p_measured -> 'statement_gaps', '[]'::jsonb)) g
        union all
        select (n ->> 'bank_account_id') || ':no_statements'
          from jsonb_array_elements(coalesce(p_measured -> 'no_statements', '[]'::jsonb)) n
      ) u), '{}')
    else '{}'::text[]
  end;
$fn$;

reset role;

-- =====================================================================================
-- TAIL CENSUS -- the extend-only proof, then the behaviour it exists for.
-- =====================================================================================
do $dba8_tail$
declare
  v_new text; v_frag text; v_n int;
  v_items text[]; v_measured jsonb;
begin
  -- (1) SHAPE, read from pg_proc.
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara._gate_outstanding_items(text,jsonb)'::regprocedure
     and p.prosecdef and p.provolatile = 's' and p.proowner = 'clara_fn_owner'::regrole
     and array_to_string(p.proconfig, ',') like '%search_path%';
  if v_n <> 1 then
    raise exception 'dba8 tail: _gate_outstanding_items is not a STABLE SECURITY DEFINER search_path-pinned body owned by clara_fn_owner'
      using errcode = 'CLR10';
  end if;
  if pg_catalog.has_function_privilege('clara_authenticated', 'clara._gate_outstanding_items(text,jsonb)', 'execute')
     or pg_catalog.has_function_privilege('clara_agent_ro', 'clara._gate_outstanding_items(text,jsonb)', 'execute') then
    raise exception 'dba8 tail: _gate_outstanding_items became app-callable' using errcode = 'CLR10';
  end if;

  -- (2) EXTEND-ONLY BY SUBTRACTION (0104:832's shape). The added fragment occurs exactly
  -- once, and removing it reproduces the pinned pre-image byte for byte -- not a space, not a
  -- comment, not another arm's ordering.
  select p.prosrc into v_new from pg_proc p
   where p.oid = 'clara._gate_outstanding_items(text,jsonb)'::regprocedure;
  v_frag := E'        union all\n'
         || E'        select (n ->> ''bank_account_id'') || '':no_statements''\n'
         || E'          from jsonb_array_elements(coalesce(p_measured -> ''no_statements'', ''[]''::jsonb)) n\n';
  v_n := (length(v_new) - length(replace(v_new, v_frag, ''))) / length(v_frag);
  if v_n <> 1 then
    raise exception 'dba8 tail: the no_statements fragment occurs % time(s) in the installed body, expected 1', v_n
      using errcode = 'CLR10';
  end if;
  if replace(v_new, v_frag, '') is distinct from
     (select v from _dba8_pre where k = 'prosrc:_gate_outstanding_items') then
    raise exception 'dba8 tail: _gate_outstanding_items is NOT extend-only -- removing the added fragment does not reproduce the pinned pre-image byte for byte. Some other arm moved, and four bodies read this one.'
      using errcode = 'CLR10';
  end if;

  -- (3) BEHAVIOURAL, on synthetic payloads -- a source proof is not a behaviour proof.
  -- (3a) THE MIXED CASE: an enumerated finding AND a statement-less account must BOTH appear.
  -- With only the finding in the list, the account is invisible to every consumer that reads
  -- items -- finalize_close's admission, attest_close_exception's key domain, the readiness
  -- read and the close plan -- so it cannot be attested by name at all.
  v_measured := jsonb_build_object(
    'open_exceptions', jsonb_build_array(jsonb_build_object('exception_id', 'exc-1')),
    'statement_gaps',  '[]'::jsonb,
    'no_statements',   jsonb_build_array(jsonb_build_object('bank_account_id', 'acct-1')));
  v_items := clara._gate_outstanding_items('open_bank_recon_items', v_measured);
  if not ('exc-1' = any (v_items)) or not ('acct-1:no_statements' = any (v_items))
     or coalesce(array_length(v_items, 1), 0) <> 2 then
    raise exception 'dba8 tail (3a): the MIXED case enumerates % -- both the exception and the unmeasurable account must be outstanding', to_jsonb(v_items)
      using errcode = 'CLR10';
  end if;

  -- (3b) THE THREE POPULATIONS TOGETHER, and the key shapes do not collide.
  v_measured := jsonb_build_object(
    'open_exceptions', jsonb_build_array(jsonb_build_object('exception_id', 'exc-9')),
    'statement_gaps',  jsonb_build_array(jsonb_build_object('bank_account_id', 'acct-1', 'month', '2026-03')),
    'no_statements',   jsonb_build_array(jsonb_build_object('bank_account_id', 'acct-1')));
  v_items := clara._gate_outstanding_items('open_bank_recon_items', v_measured);
  if coalesce(array_length(v_items, 1), 0) <> 3
     or not ('acct-1:2026-03' = any (v_items)) or not ('acct-1:no_statements' = any (v_items)) then
    raise exception 'dba8 tail (3b): three populations yielded % -- the gap key and the no-statement key must both survive on the SAME account', to_jsonb(v_items)
      using errcode = 'CLR10';
  end if;

  -- (3c) MUST-NOT-GO-GREEN: the empty payload still yields NOTHING, so finalize_close's
  -- `__gate__` substitution is untouched, and the four OTHER arms still answer.
  if coalesce(array_length(clara._gate_outstanding_items('open_bank_recon_items', '{}'::jsonb), 1), 0) <> 0 then
    raise exception 'dba8 tail (3c): an empty bank payload now yields items -- the __gate__ blanket path is broken'
      using errcode = 'CLR10';
  end if;
  if clara._gate_outstanding_items('uncoded_documents',
        jsonb_build_object('uncoded', jsonb_build_array(jsonb_build_object('filing_id', 'f-1'))))
      is distinct from array['f-1'] then
    raise exception 'dba8 tail (3c): the uncoded_documents arm stopped answering' using errcode = 'CLR10';
  end if;
  if clara._gate_outstanding_items('undated_documents',
        jsonb_build_object('undated', jsonb_build_array(jsonb_build_object('filing_id', 'f-2'))))
      is distinct from array['f-2'] then
    raise exception 'dba8 tail (3c): the undated_documents arm stopped answering' using errcode = 'CLR10';
  end if;
  if coalesce(array_length(clara._gate_outstanding_items('bank_recon_identity', '{}'::jsonb), 1), 0) <> 0 then
    raise exception 'dba8 tail (3c): the terminal else arm stopped answering empty' using errcode = 'CLR10';
  end if;

  raise notice 'dba8 tail: OK -- clara._gate_outstanding_items CoR''d from its post-0104 pre-image (sha-pinned in the prestate), still STABLE SECURITY DEFINER, search_path-pinned, clara_fn_owner-owned and app-callable by NOBODY. EXTEND-ONLY PROVEN BY SUBTRACTION: the added fragment occurs exactly once and removing it reproduces the pinned pre-image BYTE FOR BYTE, so no other arm moved. BEHAVIOURALLY EXERCISED: a MIXED payload (one enumerated finding + one statement-less account) now enumerates BOTH -- before this file it named the finding alone, so the unmeasurable account was in NO consumer''s item list and could not even be attested by name; three populations on one account yield three distinct keys with no collision between <acct>:<YYYY-MM> and <acct>:no_statements; an empty payload still yields nothing so finalize_close''s __gate__ blanket path is untouched; and the uncoded, undated and terminal-else arms all still answer. attest_close_exception needs no change -- it derives its accepted keys from this body (0120:979-994). No table in workflow/graphile_worker/spike touched. D1 WRITE-QUIESCE IS OWED: this body is READ inside finalize_close''s transaction (0104:168 names the same obligation on the same body), so a close spanning the deploy would enumerate from the OLD, narrower list.';
end $dba8_tail$;
