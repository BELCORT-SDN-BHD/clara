-- =====================================================================================
-- chatTurn_v14 (F-A3 PR-3, OQ-6) -- THE GRANT THAT MAKES CHAT-DRIVEN BANK ACTS REACHABLE.
--
-- MEASURED, INDEPENDENTLY, AT REVIEW: `clara_wake_interactive` -- the Postgres role the chat
-- write pool SET ROLEs to on every checkout (packages/runtime/lib/pools.mjs,
-- `withWriteWakeScoped`), for BOTH the `interactive` and `interactive_client` wake kinds alike --
-- held EXECUTE on 0 of the 13 bank `wake_*` wrapper functions. That grant, not anything in F-A3
-- PR-3's own migration (0129_f_a3_pr3_retirement_parity_doors.sql, SS4), is what keeps
-- chat/bank parity inert: SS4 widens `wake_fn_allowlist` (an APPLICATION-level table
-- `assert_wake_allowed` reads) to admit `interactive_client` for the bank roster, but the
-- Postgres ACL is an entirely separate mechanism keyed on the CONNECTING ROLE, and SS4 never
-- touches it. A credential can be minted, carry the right wake_kind, and still hit a bare 42501
-- (permission denied for function) the instant the wrapper is called, until this grant lands.
--
-- SCOPE, DELIBERATELY NARROW. This grants EXECUTE on exactly the thirteen named bank `wake_*`
-- wrappers `clara_wake_bank` already holds (0121, F-A3/PR-1b) -- an EXTEND-ONLY ACL widening,
-- mirroring SS4's own extend-only allowlist widening. It is NOT a blanket grant to
-- `clara_wake_interactive`: every other function that role can already reach keeps its exact
-- existing grant, untouched, and nothing outside this named list gains anything.
--
-- WHY `clara_wake_interactive`, NOT A NEW DEDICATED ROLE (the grant/role choice, argued and
-- decided, not defaulted). The chat write pool has exactly ONE Postgres role wired for ALL
-- interactive/interactive_client traffic (pools.mjs's `withWriteWakeScoped`); OQ-6's own ruling
-- text (bank-agency-annexes-3-build.md's Annex O.2/P) frames chat parity as "interactive_client
-- rows on the same cores" with explicitly NO new credential kind, and nothing in the design
-- anywhere proposes a second bank-chat login/pool/DSN. Building one would be new runtime
-- infrastructure the design never called for, to solve a problem (Postgres reachability) that a
-- thirteen-line, narrowly-scoped grant already solves cleanly. The rejected alternative is minting
-- a `bank_agent`-kind credential from chat instead of widening this grant -- NOT viable: that is
-- precisely the provenance lie OQ-6 exists to fix (a chat-driven act must carry `interactive_
-- client`/the real human, never the autonomous-lane's own kind).
--
-- SEQUENCED AFTER F-A3 PR-3's own migration (this file assumes SS4 has already run and measures
-- that fact in its own prestate) -- logically independent (Postgres ACLs and wake_fn_allowlist
-- are separate mechanisms), but sequencing after keeps the "reachable AND allowlisted" story
-- coherent in one D1 window rather than landing a grant with no allowlist row behind it yet.
-- =====================================================================================

do $ctv14_pre$
declare v_n int;
begin
  -- (a) the thirteen named functions all resolve at their exact live signatures (0121).
  if to_regprocedure('clara.wake_get_bank_pack(uuid,uuid,text,jsonb,text)') is null
     or to_regprocedure('clara.wake_add_bank_account(uuid,text,uuid,text,text,text,text,jsonb,text,text)') is null
     or to_regprocedure('clara.wake_upsert_account(uuid,text,text,text,text,text,text,jsonb,text,text)') is null
     or to_regprocedure('clara.wake_match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text)') is null
     or to_regprocedure('clara.wake_settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,jsonb,text,text)') is null
     or to_regprocedure('clara.wake_unmatch_bank_match(uuid,uuid,text,text,jsonb,text,text)') is null
     or to_regprocedure('clara.wake_complete_bank_reconciliation(uuid,uuid[],text,jsonb,text,text)') is null
     or to_regprocedure('clara.wake_void_bank_reconciliation(uuid,text,text,jsonb,text,text)') is null
     or to_regprocedure('clara.wake_resolve_bank_line_exception(uuid,text,text,uuid,text,jsonb,text,text)') is null
     or to_regprocedure('clara.wake_propose_bank_line_exception(uuid,text,text,uuid,text,jsonb,text,text)') is null
     or to_regprocedure('clara.wake_void_bank_statement(uuid,uuid,text,text,jsonb,text,text)') is null
     or to_regprocedure('clara.wake_propose_bank_identifier_promotion(uuid,uuid,text,text,int,text,jsonb,text,text)') is null
     or to_regprocedure('clara.wake_resolve_and_book_bank_line(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,bigint,text,text,jsonb,text,text,boolean)') is null
  then
    raise exception 'chatTurn_v14 bank grants prestate: at least one of the thirteen named wake_* bank functions does not resolve at its expected 0121 signature' using errcode='CLR10';
  end if;

  -- (b) clara_wake_interactive holds EXECUTE on NONE of them yet (this file has not partially
  -- applied) -- the measured fact this migration exists to fix, re-proven live rather than assumed.
  select count(*)::int into v_n from (values
    ('clara.wake_get_bank_pack(uuid,uuid,text,jsonb,text)'),
    ('clara.wake_add_bank_account(uuid,text,uuid,text,text,text,text,jsonb,text,text)'),
    ('clara.wake_upsert_account(uuid,text,text,text,text,text,text,jsonb,text,text)'),
    ('clara.wake_match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text)'),
    ('clara.wake_settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,jsonb,text,text)'),
    ('clara.wake_unmatch_bank_match(uuid,uuid,text,text,jsonb,text,text)'),
    ('clara.wake_complete_bank_reconciliation(uuid,uuid[],text,jsonb,text,text)'),
    ('clara.wake_void_bank_reconciliation(uuid,text,text,jsonb,text,text)'),
    ('clara.wake_resolve_bank_line_exception(uuid,text,text,uuid,text,jsonb,text,text)'),
    ('clara.wake_propose_bank_line_exception(uuid,text,text,uuid,text,jsonb,text,text)'),
    ('clara.wake_void_bank_statement(uuid,uuid,text,text,jsonb,text,text)'),
    ('clara.wake_propose_bank_identifier_promotion(uuid,uuid,text,text,int,text,jsonb,text,text)'),
    ('clara.wake_resolve_and_book_bank_line(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,bigint,text,text,jsonb,text,text,boolean)')
  ) as t(sig)
  where has_function_privilege('clara_wake_interactive', t.sig::regprocedure, 'execute');
  if v_n <> 0 then
    raise exception 'chatTurn_v14 bank grants prestate: clara_wake_interactive already holds EXECUTE on % of the 13 bank wake_* functions -- this file may be partially applied', v_n using errcode='CLR10';
  end if;

  raise notice 'chatTurn_v14 bank grants prestate: clean -- all 13 named wake_* bank functions resolve, clara_wake_interactive holds EXECUTE on none of them yet';
end
$ctv14_pre$;

grant execute on function clara.wake_get_bank_pack(uuid,uuid,text,jsonb,text) to clara_wake_interactive;
grant execute on function clara.wake_add_bank_account(uuid,text,uuid,text,text,text,text,jsonb,text,text) to clara_wake_interactive;
grant execute on function clara.wake_upsert_account(uuid,text,text,text,text,text,text,jsonb,text,text) to clara_wake_interactive;
grant execute on function clara.wake_match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text) to clara_wake_interactive;
grant execute on function clara.wake_settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,jsonb,text,text) to clara_wake_interactive;
grant execute on function clara.wake_unmatch_bank_match(uuid,uuid,text,text,jsonb,text,text) to clara_wake_interactive;
grant execute on function clara.wake_complete_bank_reconciliation(uuid,uuid[],text,jsonb,text,text) to clara_wake_interactive;
grant execute on function clara.wake_void_bank_reconciliation(uuid,text,text,jsonb,text,text) to clara_wake_interactive;
grant execute on function clara.wake_resolve_bank_line_exception(uuid,text,text,uuid,text,jsonb,text,text) to clara_wake_interactive;
grant execute on function clara.wake_propose_bank_line_exception(uuid,text,text,uuid,text,jsonb,text,text) to clara_wake_interactive;
grant execute on function clara.wake_void_bank_statement(uuid,uuid,text,text,jsonb,text,text) to clara_wake_interactive;
grant execute on function clara.wake_propose_bank_identifier_promotion(uuid,uuid,text,text,int,text,jsonb,text,text) to clara_wake_interactive;
grant execute on function clara.wake_resolve_and_book_bank_line(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,bigint,text,text,jsonb,text,text,boolean) to clara_wake_interactive;

do $ctv14_tail$
declare v_n int; v_public int;
begin
  -- Every one of the 13 now grants clara_wake_interactive EXECUTE, PUBLIC still has none, and
  -- clara_wake_bank's own pre-existing grant is untouched (both directions checked, never one
  -- role's presence alone -- the same NULL-proacl-leak discipline F-A3 PR-3's own tail uses).
  select count(*)::int into v_n from (values
    ('clara.wake_get_bank_pack(uuid,uuid,text,jsonb,text)'),
    ('clara.wake_add_bank_account(uuid,text,uuid,text,text,text,text,jsonb,text,text)'),
    ('clara.wake_upsert_account(uuid,text,text,text,text,text,text,jsonb,text,text)'),
    ('clara.wake_match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text)'),
    ('clara.wake_settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,jsonb,text,text)'),
    ('clara.wake_unmatch_bank_match(uuid,uuid,text,text,jsonb,text,text)'),
    ('clara.wake_complete_bank_reconciliation(uuid,uuid[],text,jsonb,text,text)'),
    ('clara.wake_void_bank_reconciliation(uuid,text,text,jsonb,text,text)'),
    ('clara.wake_resolve_bank_line_exception(uuid,text,text,uuid,text,jsonb,text,text)'),
    ('clara.wake_propose_bank_line_exception(uuid,text,text,uuid,text,jsonb,text,text)'),
    ('clara.wake_void_bank_statement(uuid,uuid,text,text,jsonb,text,text)'),
    ('clara.wake_propose_bank_identifier_promotion(uuid,uuid,text,text,int,text,jsonb,text,text)'),
    ('clara.wake_resolve_and_book_bank_line(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,bigint,text,text,jsonb,text,text,boolean)')
  ) as t(sig)
  where has_function_privilege('clara_wake_interactive', t.sig::regprocedure, 'execute')
    and not has_function_privilege('public', t.sig::regprocedure, 'execute')
    and has_function_privilege('clara_wake_bank', t.sig::regprocedure, 'execute');
  if v_n <> 13 then
    raise exception 'chatTurn_v14 bank grants tail: only %/13 functions carry the expected shape (clara_wake_interactive EXECUTE + clara_wake_bank EXECUTE still intact + PUBLIC still none)', v_n using errcode='CLR10';
  end if;

  select count(*)::int into v_public from (values
    ('clara.wake_get_bank_pack(uuid,uuid,text,jsonb,text)'),
    ('clara.wake_add_bank_account(uuid,text,uuid,text,text,text,text,jsonb,text,text)'),
    ('clara.wake_upsert_account(uuid,text,text,text,text,text,text,jsonb,text,text)'),
    ('clara.wake_match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text)'),
    ('clara.wake_settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,jsonb,text,text)'),
    ('clara.wake_unmatch_bank_match(uuid,uuid,text,text,jsonb,text,text)'),
    ('clara.wake_complete_bank_reconciliation(uuid,uuid[],text,jsonb,text,text)'),
    ('clara.wake_void_bank_reconciliation(uuid,text,text,jsonb,text,text)'),
    ('clara.wake_resolve_bank_line_exception(uuid,text,text,uuid,text,jsonb,text,text)'),
    ('clara.wake_propose_bank_line_exception(uuid,text,text,uuid,text,jsonb,text,text)'),
    ('clara.wake_void_bank_statement(uuid,uuid,text,text,jsonb,text,text)'),
    ('clara.wake_propose_bank_identifier_promotion(uuid,uuid,text,text,int,text,jsonb,text,text)'),
    ('clara.wake_resolve_and_book_bank_line(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,bigint,text,text,jsonb,text,text,boolean)')
  ) as t(sig)
  where has_function_privilege('public', t.sig::regprocedure, 'execute');
  if v_public <> 0 then
    raise exception 'chatTurn_v14 bank grants tail: % of the 13 bank wake_* functions are reachable by PUBLIC -- the NULL-proacl leak', v_public using errcode='CLR10';
  end if;

  raise notice 'chatTurn_v14 bank grants tail: OK -- clara_wake_interactive now holds EXECUTE on all 13 bank wake_* wrappers, clara_wake_bank''s own pre-existing grant is untouched, PUBLIC has none. This is the reachability half of OQ-6; the provenance half (acting_actor/on_behalf_of/via_wake_kind/approval_arm threaded through _agent_bank_receipt and its callers) is a sibling lane''s own migration.';
end
$ctv14_tail$;
