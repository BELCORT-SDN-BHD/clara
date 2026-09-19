-- 0226_bank_match_evidence — #657 (把银行证据匹配到已有入账，避免重复现金分录 · match bank
-- evidence to an already-approved booking, so no second cash journal is ever born).
-- =====================================================================================
-- Spec of record: issue #657, the wave-2026-09-18 orchestrator decisions (DECISIONS §2 row
-- 0226, §3, §3.1, §6.1) and brief-657.md's binding section (D14, D15, Q3/J2, Q4/J3).
-- Domain words: CONTEXT.md — "Settlement candidate row", "Match basis", "Bank match",
-- "Statement line", "Remaining capacity", "Bank line exception", and the existing
-- "Settlement allocation" entry whose _Avoid_ ("A new cash movement merely because an
-- existing movement is matched") this file is the enforcement of.
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. One granted READ that tells a human everything a
-- single bank statement line can say about itself before a match is decided — its own facts,
-- its statement's header and lineage, the period's coverage figures, the governing open
-- exception, the ungranted booking-block payload, and one deterministic BASIS row per
-- candidate entry — plus one ungranted total helper that reads an operation key's task field
-- without a parser at the comparison site; and it recuts five existing bodies so the candidate
-- surface carries the counterparty's NAME, a TRUTHFUL high-stakes flag and a bounded match
-- history, so the match receipt states its own "no new journal entry" fact, and so the agent
-- lane's digest binding compares a typed task rather than a split_part of a string.
--
-- WHAT THIS FILE DOES NOT ADD. No table. No column. No new `accounting_work.purpose`. No new
-- Work or question object (D14: the pending line is DERIVED, stores nothing and clears
-- itself). No suspense account, no write-off, no refund path, no parameter-loop bypass. No
-- settlement door (#655 births the open item, #657 allocates; SYNTHESIS §4). No certification
-- affordance (#675 owns H-14's certify half). No exception-resolution door (#671). No new DML
-- grant on any table. No second GL-cash expression: §D's coverage block is lifted from
-- `clara.list_bank_statements`' OWN `tie` object rather than re-derived, which is the whole
-- reason that call is there.
--
-- =====================================================================================
-- §A · THE TWO-COPY CANDIDATE DISCIPLINE, AND WHY THE COPY IS TAKEN RATHER THAN TYPED.
--
-- `clara.list_bank_match_candidates(uuid,uuid)` (0038:8010-8054) and the copy inlined in
-- `clara._agent_get_bank_pack_core(uuid,uuid,text,jsonb,text)` (0121:5735-5771) are the SAME
-- projection written twice: the agent lane cannot call the public read because that read calls
-- `clara._human_ctx`, which demands a human JWT. Nothing at runtime fails if only one of the
-- two moves, which is exactly the drift class `0040 FIX WAVE A5` already paid for once.
--
-- So the projection is written between the sentinel comments `/* P657-CAND-BEGIN */` and
-- `/* P657-CAND-END */` in BOTH bodies, and §8 extracts both marked regions out of the CATALOG
-- and asserts they are identical modulo whitespace — Q4/J3's "field-identical modulo the
-- firm/ctx binding", made executable rather than promised. The firm binding is NOT inside the
-- marked region: the public read filters `je.firm_id = c.firm` and the pack filters
-- `je.firm_id = v_firm`, both OUTSIDE the projection, which is what lets the projection itself
-- be byte-identical. A future change edits both copies; the tail refuses this file if it edits
-- only one.
--
-- A FIRST CUT SPLICED THE COPY OUT OF THE CATALOG instead (take it, do not type it) and had to
-- be reverted: apps/web/test/sqlFunctionCensus.ts refuses a dynamic statement it cannot resolve
-- to exactly one function definition, and a positional splice is unresolvable by construction.
-- §4 carries the measurement.
--
-- NO SHARED CORE THIS WAVE (Q4/J3, binding). Extracting a third body that both call would move
-- `_human_ctx`'s layering — 0119-scale surgery — and #657 is not that ticket.
--
-- =====================================================================================
-- §B · THE BASIS LIVES ON THE LINE READ, NOT ON THE CANDIDATE READ.
--
-- A basis is a relation between a LINE and a CANDIDATE. `list_bank_match_candidates(p_client,
-- p_bank_account)` has no line in scope, and adding one would be a new parameterisation of a
-- rostered name — a NEW VERB by DECISIONS §2.2, not a widened read. So `candidate_basis[]`
-- rides on `clara.get_bank_line_matching_context(p_line)`, which has both sides.
--
-- ITS POPULATION IS THE CANDIDATE SET, NOT THE BOOK. One row per entry
-- `clara.list_bank_match_candidates` would OFFER for this line's bank account — the same
-- remaining-capacity predicate, so the two arrays describe the same entries. A basis row for an
-- entry the surface can never present is not evidence; it is weight on every line click, and it
-- grows with the client's whole booking history rather than with the offerable set.
-- `p657.db.matching-context` asserts the two entry-id sets are EQUAL.
--
-- Q3 / SYNTHESIS J2 (binding): a DETERMINISTIC basis, never a score. There is no 0–1 number
-- anywhere in this file, `clara.list_bank_line_suggestions` (dropped whole at 0129:395) is not
-- revived, and #665's classifier-retirement AC3 is not fought. The four facts are:
--   amount_exact       — the line's |amount_cents| equals the candidate's remaining capacity
--                        on the side this line would clear. A boolean, not a closeness.
--   date_delta_days    — (line.entry_date − entry.posting_date) in whole days. Signed.
--   counterparty_match — 'id'   the canonical counterparty's registration_normalized or tin
--                               appears as a whole word in the line description (an identifier
--                               is an identity CLAIM, so it is the stronger rung);
--                        'name' the canonical counterparty's name-family token (the house's own
--                               `clara.name_family_token`) appears as a whole word;
--                        'none' the entry names no counterparty, or neither test holds.
--                        Whole-word matching is `clara._bank_desc_word_match` — the estate's
--                        own escaped, case-folded, boundary-anchored matcher, not a LIKE.
--   class_hint         — the LINE's own `clara._bank_line_class_hint(description)`. It is the
--                        line's contribution to the pair; the ENTRY's `coding_kind` already
--                        rides on the candidate row, and a second copy of one fact is how two
--                        surfaces come to disagree about it.
--
-- =====================================================================================
-- §C · THE HOUSE LAWS WITH NO EXECUTABLE REACH INTO THIS FILE, HONOURED BY HAND.
--
-- Three `do` blocks enforce real laws at THEIR OWN position in the chain and can never see a
-- function 0226 creates. They are named here, and obeyed, precisely because nothing compiles
-- them for this file:
--   1. 0044:2916-2930 (roster :2929-2930, enforcement :3006-3012, raise :3014-3017) reads the
--      three literals `settlement_entry_id`, `charge_entry_id` and `adjustment_entry_ids` as
--      "this act BUILT that entry", exempting only `_wdb_born_in_booking_act`,
--      `_settle_from_bank_line_core`, `complete_pending_match` and `match_bank_line`.
--      `clara.get_bank_line_matching_context` NAMES NONE OF THE THREE. It is a read; it builds
--      nothing. The behavioural law is proved live by `x42.r7-af2-7`
--      (x42-r7-af2-offpath.test.mjs:242) and this file does not weaken it.
--   2. 0044:2954-2963's `_wdb_born_in_booking_act` call-count: this file WRAPS
--      `clara._wdb_line_booking_block` and does not touch that block's body.
--   3. 0040:7423-7430's `completing_recon` single-writer assertion: that GUC is named nowhere
--      in this file.
-- The suites that DO reach a function this file creates are `operation-census.test.mjs` and
-- `rig-isolation.test.mjs`, and both are run for this delivery.
--
-- LIKEWISE the four signature censuses (`0119:210-218`, `0129:1197-1199`, `0103:1055-1070`,
-- `0040:6776-6781`) are `do` blocks at their own chain position and cannot see 0226. DECISIONS
-- §2.2 is why the tail below writes this file's OWN single-`pg_proc`-row census over every name
-- it installs AND every name it recuts. `clara.list_bank_match_candidates` keeps its exact
-- 2-argument signature and gains no defaulted parameter: a new parameterisation is a NEW VERB.
--
-- =====================================================================================
-- §D · C33.8 — ONE OPERATION-KEY SCHEMA ON THE AGENT LANE, PARSER-FREE AT THE COMPARISON SITE.
--
-- `clara._agent_verify_inputs_digest` (created 3-arg at 0129:1038, ceremony 0129:1023-1058)
-- bound a prior `pack_read` receipt by DERIVING the task with
-- `split_part(coalesce(p_op_key,''), ':', 2)` (0129:1048) and COMPARING with
-- `split_part(r.op_key, ':', 2)` (0129:1052). Two string parsers, one on each side, agreeing
-- only by convention. This file replaces that with a typed uuid parameter and a comparison that
-- reads a STORED column first:
--     (p_task is null or coalesce(r.wake_task_id, clara._bank_op_key_task(r.op_key)) = p_task)
-- The null-task fallback keeps today's exact semantics and is deliberately NOT tightened —
-- tightening it would refuse a live agent act whose pack was read seconds before this migration
-- applied. `clara._bank_op_key_task` is TOTAL: uuid-regex guarded, STRICT, IMMUTABLE, never
-- raises, NULL when field 2 is absent or is not a uuid.
--
-- `clara._agent_bank_receipt` now STORES the binding: its INSERT gains `wake_task_id`, valued
-- `coalesce(clara._wake_task_id(), clara._bank_op_key_task(p_op_key))`. Measured on this rig
-- before writing a line of it: `clara._wake_task_id()` resolves NULL on the live bank chat lane
-- (the only two writers of `wake_credentials.agent_task_id` are the exact closure pinned at
-- 0159:518-529 — `mint_wake_credential_for_task` and `mint_chat_close_credential` — and the
-- bank chat credential is minted by `clara.mint_wake_credential('interactive_client', …)`,
-- packages/runtime/lib/pools.mjs:484-492), so the key-derived half is what actually populates
-- the column today and the `_wake_task_id()` half is the forward path. `bank_agent_receipts` is
-- APPEND-ONLY (0121:4407-4410), so no backfill UPDATE is lawful and rows written before 0226
-- keep the compare-time `coalesce` fallback. That is by design, not a gap.
--
-- LOUD, FOR EVERY FUTURE BANK-FAMILY PIN. The thirteen `clara._agent_*_core` bodies rostered at
-- 0129:1067-1081 are re-patched here, so EVERY ONE of them gets a NEW prosrc sha. A later
-- migration pinning any of them must measure against #657's POST-image, never 0129's.
-- (SYNTHESIS.md:262-266 "LOUD #2" says the same thing about the same thirteen.)
--
-- CHANGING THE PACK SHAPE CHANGES EVERY FUTURE DIGEST: `_agent_get_bank_pack_core` hashes the
-- WHOLE pack (0121:5785), and §3 widens the candidate rows inside it. Harmless under the
-- current rule (the verify needs SOME prior read in this task), but any fixture that hard-codes
-- a pack digest is invalidated by this file.
--
-- =====================================================================================
-- §E · EVERY PIN IN THIS FILE WAS MEASURED ON THE RIG, OFF pg_proc.prosrc, NEVER TRANSCRIBED
-- FROM FILE TEXT. Four of the bodies in this blast radius are provably not their file's text:
-- `match_bank_line/6` was patched in place by 0040 S4.4a; `_match_bank_line_core` was recut
-- WHOLE at 0121:1863 (0038's text is not the live body); `_agent_verify_inputs_digest` was
-- dropped and recreated at 0129:1038; `_agent_bank_receipt` was CoR-patched twice
-- (0129:922-995, then 0134:106 onward). Measured 2026-09-19 on clara_657 (PG 17.11, 219
-- migrations, newest 0224_preview_invite).
--
-- LOCK ORDER is untouched by this file (accounting_plans -> accounting_work -> agent_tasks ->
-- agent_interruptions estate-wide; and inside the bank matcher journal_entries -> the client
-- advisory rung -> bank lines -> statements). §5's CoR on `_match_bank_line_core` is
-- substring-anchored on the terminal `_finish_op` payload ALONE precisely so the three lock
-- literals `order by je.id for update`, `pg_advisory_xact_lock(203005004` and
-- `order by l.id for update` cannot move; the tail re-asserts all three, in order.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- §1 · PRESTATE PINS.  0195:390-409's idiom: sha256(convert_to(prosrc,'UTF8')) off pg_proc,
--      each compared to the value MEASURED on this rig. Five recut targets + two
--      NON-REGRESSION pins (bodies this file must NOT move).
-- -------------------------------------------------------------------------------------
do $p657_prestate$
declare v_sha text; v_n int;
begin
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.list_bank_match_candidates(uuid,uuid)'::regprocedure;
  if v_sha <> '85e001d862726463578557125c2e6f2544f20b945f866c0d5fecc045689c6620' then
    raise exception '#657 prestate: clara.list_bank_match_candidates has DRIFTED from its pinned 0038 body (sha %) -- re-derive the recut against the live body before applying', v_sha using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._agent_get_bank_pack_core(uuid,uuid,text,jsonb,text)'::regprocedure;
  if v_sha <> '6771ef1f76ab3501661c11de54db622b3a6ad2fda4a50526c70a4bb80b44e16b' then
    raise exception '#657 prestate: clara._agent_get_bank_pack_core has DRIFTED from its pinned 0121 body (sha %) -- the inlined candidate copy is spliced positionally and a drifted body cannot be spliced safely', v_sha using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._match_bank_line_core(jsonb,uuid,jsonb,jsonb,jsonb,boolean,text)'::regprocedure;
  if v_sha <> 'c52eefd25cb74b5cf8ea8ab9bd66823a790a6694faf48e40ddf386da4595aea5' then
    raise exception '#657 prestate: clara._match_bank_line_core is not at its LIVE 0121:1863 body (sha %) -- 0038''s file text is NOT this body; re-measure', v_sha using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._agent_verify_inputs_digest(uuid,text,text)'::regprocedure;
  if v_sha <> 'bb7dc2a9ec99699c6a2fc68d3a67e01e33a5da8060003b1babb6fea108edfb35' then
    raise exception '#657 prestate: clara._agent_verify_inputs_digest/3 is not at its pinned 0129:1038 body (sha %) -- re-derive before dropping', v_sha using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._agent_bank_receipt(uuid,uuid,text,text,uuid,text,jsonb,text,text,jsonb,timestamptz)'::regprocedure;
  if v_sha <> 'ef3a1c186c61925743f238fb996b189f34128d7023cc15d9e7e32fe0c4e94177' then
    raise exception '#657 prestate: clara._agent_bank_receipt is not at its twice-CoR-patched (0129:922-995 then 0134:106) body (sha %) -- the two anchors below are measured against THAT text', v_sha using errcode='CLR10';
  end if;

  -- NON-REGRESSION: neither of these is recut by this file, in either direction.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)'::regprocedure;
  if v_sha <> '308b7f083f9d27252fb24a65c77dd3aa42e3090e310344fba326bb3e31edc42b' then
    raise exception '#657 prestate: clara.match_bank_line/6 (the PUBLIC door, a thin wrapper since 0119) has moved (sha %) -- this file changes the CORE, never the door', v_sha using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._wdb_line_booking_block(uuid,uuid,uuid)'::regprocedure;
  if v_sha <> '5cb7be13b083a987d3b6d3c60d4338c1bbaae4f1d3f361df3a3af8342c1d285d' then
    raise exception '#657 prestate: clara._wdb_line_booking_block has moved (sha %) -- the new read WRAPS this body and publishes its payload verbatim', v_sha using errcode='CLR10';
  end if;

  -- The ungranted block must still be ungranted BEFORE we wrap it: wrapping a body that has
  -- since been granted would be publishing something already public, and the tail's "still
  -- zero grants" assertion would then be measuring nothing. 0044:2780 is the revoke.
  select count(*)::int into v_n from aclexplode(
    (select coalesce(p.proacl, acldefault('f', p.proowner)) from pg_proc p
      where p.oid='clara._wdb_line_booking_block(uuid,uuid,uuid)'::regprocedure)) a
   where a.grantee <> 0
     and a.grantee <> (select p.proowner from pg_proc p
                        where p.oid='clara._wdb_line_booking_block(uuid,uuid,uuid)'::regprocedure);
  if v_n <> 0 then
    raise exception '#657 prestate: clara._wdb_line_booking_block already carries % non-owner grant(s) -- 0044:2780''s revoke has been undone elsewhere', v_n using errcode='CLR10';
  end if;

  -- The new names must not already exist.
  if to_regprocedure('clara.get_bank_line_matching_context(uuid)') is not null then
    raise exception '#657 prestate: clara.get_bank_line_matching_context already exists' using errcode='CLR10';
  end if;
  if to_regprocedure('clara._bank_op_key_task(text)') is not null then
    raise exception '#657 prestate: clara._bank_op_key_task already exists' using errcode='CLR10';
  end if;

  raise notice '#657 prestate: OK -- five recut targets at their measured live bodies, match_bank_line/6 and _wdb_line_booking_block unmoved, the block still ungranted, and neither new name taken.';
end
$p657_prestate$;

-- Everything this file creates or recuts is owned by clara_fn_owner (the 0219/0224 idiom:
-- `set role` here, `reset role` before the tail). The recuts would preserve their owner anyway;
-- the two NEW names and the recreated verifier would not.
set role clara_fn_owner;

-- -------------------------------------------------------------------------------------
-- §2 · clara._bank_op_key_task(text) -> uuid.  The TOTAL, ungranted key reader.
--
-- The bank operation-key schema is `bank-<verb>:<taskId>:<segment>:<stableJson>`
-- (chatTurn.v14.bank.ts:64-66), so field 2 IS the task id. This helper is the ONE place that
-- fact is parsed, and it is written so it can never raise: STRICT (a null key is a null answer
-- without entering the body), IMMUTABLE (it depends on nothing but its argument) and
-- uuid-regex guarded (a key with no colons, a key whose second field is a segment name, a key
-- whose payload itself contains colons -- every one of them yields NULL rather than a 22P02).
-- Totality is the point: this helper is called from inside a comparison that must fall back
-- gracefully for every pre-0226 row, and a raising parser there would turn an honest "this
-- digest was never read in this task" into an unclassifiable crash.
-- -------------------------------------------------------------------------------------
create function clara._bank_op_key_task(p_op_key text)
  returns uuid
  language sql
  immutable strict
  set search_path = clara, pg_temp
  as $bank_op_key_task$
  select case
    when split_part(p_op_key, ':', 2) ~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then split_part(p_op_key, ':', 2)::uuid
    else null::uuid
  end;
$bank_op_key_task$;

comment on function clara._bank_op_key_task(text) is
  '#657 C33.8: field 2 of a bank operation key as a uuid, or NULL. TOTAL (STRICT + uuid-regex guarded) -- it never raises. UNGRANTED: reachable only from the definer bodies that own the key schema.';

revoke all on function clara._bank_op_key_task(text) from public;

-- -------------------------------------------------------------------------------------
-- §3 · RECUT clara.list_bank_match_candidates(uuid,uuid) -- SAME signature, SAME floor, SAME
--      grant.  Three additions, and nothing else moves:
--        counterparty_name  the name of clara._canonical_counterparty(p_client, <cp id>)
--                           (0011:1316, ungranted, definer-reachable) read from
--                           clara.counterparties.name -- NULL-safe, and it follows a merge
--                           chain, so a merged payer reads as its SURVIVOR (2026-09-15 D11:
--                           #647 owns counterparty identity; this read CONSUMES it and writes
--                           no alias of its own).
--        high_stakes        clara.is_high_stakes(entry_id) (0004:72, recut 0009:1513) --
--                           replacing the HARDCODED `false` at 0038:8025, which told every
--                           human that no candidate was ever high-stakes.
--        match_history      a BOUNDED array (order by acted_at desc limit 5) of this entry's
--                           prior groups on THIS bank account's COA:
--                           {match_id, status, matched_cents, acted_at}.
--
--      The `high_stakes` and `counterparty_name` fields already exist in the WEB row type
--      (apps/web/lib/bank/match-types.ts:49-50) and have been read as null/false since the
--      surface was built -- this recut is what makes those two fields honest.
-- -------------------------------------------------------------------------------------
create or replace function clara.list_bank_match_candidates(p_client uuid, p_bank_account uuid)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp
  as $list_bank_match_candidates$
declare c record; v_coa text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select ba.coa_account_code into v_coa from clara.bank_accounts ba
    where ba.id = p_bank_account and ba.firm_id = c.firm and ba.client_id = p_client;
  if not found then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(t.row_j order by t.posting_date desc) from (
    select je.posting_date, /* P657-CAND-BEGIN */ jsonb_build_object(
      'entry_id', je.id, 'posting_date', je.posting_date, 'memo', je.memo,
      'coding_kind', je.coding_kind,
      'counterparty_id', (select min(jl2.counterparty_id::text)::uuid from clara.journal_lines jl2
         where jl2.entry_id = je.id and jl2.counterparty_id is not null),
      'counterparty_name', (select cp.name from clara.counterparties cp
         where cp.client_id = p_client
           and cp.id = clara._canonical_counterparty(p_client,
             (select min(jl3.counterparty_id::text)::uuid from clara.journal_lines jl3
                where jl3.entry_id = je.id and jl3.counterparty_id is not null))),
      'high_stakes', coalesce(clara.is_high_stakes(je.id), false),
      'match_history', coalesce((select jsonb_agg(h.row_h order by h.acted_at desc) from (
         select coalesce(bm.completed_at, bm.created_at) as acted_at,
           jsonb_build_object('match_id', bm.id, 'status', bm.status,
             'matched_cents', em.matched_cents,
             'acted_at', coalesce(bm.completed_at, bm.created_at)) as row_h
         from clara.bank_match_entry_members em
         join clara.bank_matches bm on bm.id = em.match_id
         join clara.bank_accounts ba3 on ba3.id = bm.bank_account_id
         where em.entry_id = je.id and ba3.client_id = p_client
           and ba3.coa_account_code = v_coa
         order by coalesce(bm.completed_at, bm.created_at) desc, bm.id desc
         limit 5) h), '[]'::jsonb),
      'debit_remaining_cents', greatest(0,
        (select coalesce(sum(jl.debit_cents), 0) from clara.journal_lines jl
          where jl.entry_id = je.id and jl.account_code = v_coa)
        - (select coalesce(sum(em.matched_cents), 0)
           from clara.bank_match_entry_members em
           join clara.bank_matches bm on bm.id = em.match_id
           join clara.bank_accounts ba2 on ba2.id = bm.bank_account_id
           where em.entry_id = je.id and em.matched_cents > 0
             and bm.status in ('pending','live')
             and ba2.coa_account_code = v_coa and ba2.client_id = p_client)),
      'credit_remaining_cents', greatest(0,
        (select coalesce(sum(jl.credit_cents), 0) from clara.journal_lines jl
          where jl.entry_id = je.id and jl.account_code = v_coa)
        - (select coalesce(sum(-em.matched_cents), 0)
           from clara.bank_match_entry_members em
           join clara.bank_matches bm on bm.id = em.match_id
           join clara.bank_accounts ba2 on ba2.id = bm.bank_account_id
           where em.entry_id = je.id and em.matched_cents < 0
             and bm.status in ('pending','live')
             and ba2.coa_account_code = v_coa and ba2.client_id = p_client))) /* P657-CAND-END */ as row_j
    from clara.journal_entries je
    where je.firm_id = c.firm and je.client_id = p_client
      and je.status = 'approved' and je.reversed_by is null and je.reversal_of is null
      and exists (select 1 from clara.journal_lines jl
        where jl.entry_id = je.id and jl.account_code = v_coa
          and (jl.debit_cents <> 0 or jl.credit_cents <> 0))
  ) t where (t.row_j->>'debit_remaining_cents')::bigint > 0
         or (t.row_j->>'credit_remaining_cents')::bigint > 0), '[]'::jsonb);
end $list_bank_match_candidates$;

-- -------------------------------------------------------------------------------------
-- §4 · RECUT clara._agent_get_bank_pack_core WITH THE SAME CANDIDATE PROJECTION.
--
--      A STATIC create-or-replace of the whole body, not a dynamic splice, and the reason is a
--      LIVE GATE rather than taste: apps/web/test/sqlFunctionCensus.ts reads every migration
--      and refuses a dynamic statement it cannot resolve to exactly one function definition
--      (sql_function_census_unresolved_execute). It models a header variable concatenated with
--      a dollar tag, a body operand that is a tracked variable or a `replace(...)` over one,
--      and the same tag again — 0129:1063-1106 fits because its body operand IS a replace over
--      the tracked prosrc. A first cut of this file took the projection OUT of §3's freshly
--      recut catalog body and spliced it into the pack positionally, which is prettier (the
--      copy is TAKEN rather than typed) and is unresolvable by construction: it red five web
--      census cells (do-action-floors, firm/capabilities, members-doors and two in
--      firm-scope-db-pins). Measured, then conformed — the house gate wins over the nicer shape.
--
--      SO THE PROJECTION IS TYPED TWICE, AND THE TAIL IS WHAT KEEPS THE TWO HONEST. Both copies
--      are bracketed by the sentinel comments /* P657-CAND-BEGIN */ and /* P657-CAND-END */;
--      §8 extracts both marked regions out of the CATALOG and asserts they are identical modulo
--      whitespace (Q4 / SYNTHESIS J3), and `p657.db.pack-parity` asserts the same fact from the
--      test side. A future change to the candidate projection edits BOTH copies, and this file's
--      tail refuses the migration if it edits only one — which is the drift class 0040 FIX WAVE
--      A5 already paid for once.
--
--      Everything outside the marked region is 0121's body byte-for-byte: the same firm binding
--      (v_firm, where the public read uses c.firm — the ONLY difference between the two copies,
--      and it lives OUTSIDE the projection, which is what lets the projection be identical), the
--      same tier-A gate, the same inlined list_unmatched_lines copy, the same literal
--      not_implemented payers/terms, the same whole-pack digest and the same receipt call.
-- -------------------------------------------------------------------------------------
create or replace function clara._agent_get_bank_pack_core(p_client uuid, p_bank_account uuid, p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp
  as $packcore657$
declare
  v_firm uuid; v_acct jsonb; v_stmt jsonb; v_lines jsonb; v_cands jsonb; v_coa text;
  v_items jsonb; v_proposals jsonb; v_digest text; v_pack jsonb;
begin
  select firm_id into v_firm from clara.clients where id = p_client;
  if v_firm is null then raise exception 'client not in your firm' using errcode='CLR11'; end if;
  perform clara._agent_bank_tier_a(p_client, v_firm);
  select to_jsonb(a) into v_acct from clara.bank_accounts a
    where a.id = p_bank_account and a.client_id = p_client and a.firm_id = v_firm;
  if v_acct is null then raise exception 'bank account not found for this client' using errcode='CLR11'; end if;
  v_coa := v_acct->>'coa_account_code';
  select to_jsonb(s) into v_stmt from clara.bank_statements s
    where s.bank_account_id = p_bank_account and s.status = 'live'
    order by s.period_end desc limit 1;
  -- list_unmatched_lines' own body, verbatim predicates, scoped additionally to p_bank_account.
  select coalesce(jsonb_agg(jsonb_build_object(
      'line_id', l.id, 'statement_id', l.statement_id, 'bank_account_id', l.bank_account_id,
      'bank_account_display', ba.bank_name_display || ' ' || ba.account_number,
      'line_no', l.line_no, 'entry_date', l.entry_date, 'value_date', l.value_date,
      'description', l.description, 'amount_cents', l.amount_cents,
      'class_hint', clara._bank_line_class_hint(l.description))
      order by l.entry_date, l.id), '[]'::jsonb) into v_lines
    from clara.bank_statement_lines l
    join clara.bank_statements s on s.id = l.statement_id
    join clara.bank_accounts ba on ba.id = l.bank_account_id
    where l.firm_id = v_firm and l.client_id = p_client and l.bank_account_id = p_bank_account
      and s.status = 'live'
      and not exists (select 1 from clara.bank_match_line_members m
        where m.line_id = l.id and m.group_status in ('pending', 'live'))
      and not coalesce((select (e.status = 'open'
                                or e.resolution_disposition = 'bank_corrective_line')
                          from clara.bank_line_exceptions e
                         where e.line_id = l.id
                         order by (e.status = 'open') desc, e.created_at desc, e.id desc
                         limit 1), false);
  -- list_bank_match_candidates' own body, verbatim predicates.
  select coalesce(jsonb_agg(t.row_j order by t.posting_date desc), '[]'::jsonb) into v_cands
    from (
      select je.posting_date, /* P657-CAND-BEGIN */ jsonb_build_object(
      'entry_id', je.id, 'posting_date', je.posting_date, 'memo', je.memo,
      'coding_kind', je.coding_kind,
      'counterparty_id', (select min(jl2.counterparty_id::text)::uuid from clara.journal_lines jl2
         where jl2.entry_id = je.id and jl2.counterparty_id is not null),
      'counterparty_name', (select cp.name from clara.counterparties cp
         where cp.client_id = p_client
           and cp.id = clara._canonical_counterparty(p_client,
             (select min(jl3.counterparty_id::text)::uuid from clara.journal_lines jl3
                where jl3.entry_id = je.id and jl3.counterparty_id is not null))),
      'high_stakes', coalesce(clara.is_high_stakes(je.id), false),
      'match_history', coalesce((select jsonb_agg(h.row_h order by h.acted_at desc) from (
         select coalesce(bm.completed_at, bm.created_at) as acted_at,
           jsonb_build_object('match_id', bm.id, 'status', bm.status,
             'matched_cents', em.matched_cents,
             'acted_at', coalesce(bm.completed_at, bm.created_at)) as row_h
         from clara.bank_match_entry_members em
         join clara.bank_matches bm on bm.id = em.match_id
         join clara.bank_accounts ba3 on ba3.id = bm.bank_account_id
         where em.entry_id = je.id and ba3.client_id = p_client
           and ba3.coa_account_code = v_coa
         order by coalesce(bm.completed_at, bm.created_at) desc, bm.id desc
         limit 5) h), '[]'::jsonb),
      'debit_remaining_cents', greatest(0,
        (select coalesce(sum(jl.debit_cents), 0) from clara.journal_lines jl
          where jl.entry_id = je.id and jl.account_code = v_coa)
        - (select coalesce(sum(em.matched_cents), 0)
           from clara.bank_match_entry_members em
           join clara.bank_matches bm on bm.id = em.match_id
           join clara.bank_accounts ba2 on ba2.id = bm.bank_account_id
           where em.entry_id = je.id and em.matched_cents > 0
             and bm.status in ('pending','live')
             and ba2.coa_account_code = v_coa and ba2.client_id = p_client)),
      'credit_remaining_cents', greatest(0,
        (select coalesce(sum(jl.credit_cents), 0) from clara.journal_lines jl
          where jl.entry_id = je.id and jl.account_code = v_coa)
        - (select coalesce(sum(-em.matched_cents), 0)
           from clara.bank_match_entry_members em
           join clara.bank_matches bm on bm.id = em.match_id
           join clara.bank_accounts ba2 on ba2.id = bm.bank_account_id
           where em.entry_id = je.id and em.matched_cents < 0
             and bm.status in ('pending','live')
             and ba2.coa_account_code = v_coa and ba2.client_id = p_client))) /* P657-CAND-END */ as row_j
      from clara.journal_entries je
      where je.firm_id = v_firm and je.client_id = p_client
        and je.status = 'approved' and je.reversed_by is null and je.reversal_of is null
        and exists (select 1 from clara.journal_lines jl
          where jl.entry_id = je.id and jl.account_code = v_coa
            and (jl.debit_cents <> 0 or jl.credit_cents <> 0))
    ) t where (t.row_j->>'debit_remaining_cents')::bigint > 0
           or (t.row_j->>'credit_remaining_cents')::bigint > 0;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.item_date), '[]'::jsonb) into v_items
    from clara.open_items i where i.client_id = p_client;
  select coalesce(jsonb_agg(jsonb_build_object('id', pr.id, 'kind', pr.kind,
           'subject_id', pr.subject_id, 'payload', pr.payload, 'created_at', pr.created_at)), '[]'::jsonb)
    into v_proposals
    from clara.bank_agent_proposals pr where pr.client_id = p_client and pr.status = 'open';
  v_pack := jsonb_build_object('schema', 'clara.bank-pack/v1',
    'bank_account', v_acct, 'statement', v_stmt, 'lines', v_lines, 'candidates', v_cands,
    'open_items', v_items,
    'learned_payers', jsonb_build_object('not_implemented', true),
    'recon_terms', jsonb_build_object('not_implemented', true),
    'open_proposals', v_proposals,
    'budget', jsonb_build_object('lines', jsonb_array_length(v_lines), 'candidates', jsonb_array_length(v_cands), 'truncated', false));
  v_digest := encode(clara._hash(v_pack), 'hex');
  v_pack := v_pack || jsonb_build_object('digest', v_digest);
  perform clara._agent_bank_receipt(v_firm, p_client, 'pack_read', 'admitted', p_bank_account,
    coalesce(nullif(btrim(p_rationale),''), 'bank pack read'),
    coalesce(p_model, '{"provider":"unspecified","model":"unspecified","version":"unspecified"}'::jsonb),
    v_digest, p_op_key, jsonb_build_object('verdict', 'admitted'));
  return v_pack;
end $packcore657$;

-- -------------------------------------------------------------------------------------
-- §5 · clara.get_bank_line_matching_context(p_line uuid) -> jsonb.  THE NEW HUMAN READ.
--
--      SECURITY DEFINER, search_path pinned, `_human_ctx(clara.role_rank('bookkeeper'))` as the
--      floor, firm taken from the SESSION (never from an argument), EXECUTE to
--      clara_authenticated and nobody else. It is the GRANTED WRAPPER over the UNGRANTED
--      `clara._wdb_line_booking_block(uuid,uuid,uuid)` (0044:2459, revoked 0044:2780) -- the
--      0219 idiom: publish the ANSWER, never the predicate.
--
--      NOT-FOUND HAS NO EXISTENCE ORACLE: a line outside the caller's firm returns the same
--      NULL a non-existent line returns.
--
--      WHY IT KEEPS AN EXCEPTED LINE ON SCREEN. `clara.list_unmatched_lines` EXCLUDES a line
--      with an open (or bank-corrective-resolved) exception BY DESIGN (0040:4117-4122). AC12
--      needs that line VISIBLE and PENDING with a linked recovery. This read is how: the face
--      asks for the line by id and gets everything it needs to keep rendering it, including the
--      booking-block payload whose `remedy_calls` become links into the Exceptions tab. The
--      door still refuses; nothing here is a bypass.
--
--      THE COVERAGE BLOCK IS LIFTED, NOT DERIVED. `line_count`, `total_debit_cents`,
--      `total_credit_cents` come off the statement row; `tie` comes VERBATIM out of
--      `clara.list_bank_statements(p_client, p_bank_account)` (0038:7923-7957, `tie` at
--      :7942-7952). This file therefore adds NO second GL-cash expression -- the product's
--      existing one is called, not copied (brief non-goal; and see the report's open question
--      about the two cash expressions that now exist across #657 and #660).
-- -------------------------------------------------------------------------------------
create function clara.get_bank_line_matching_context(p_line uuid)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp
  as $get_bank_line_matching_context$
declare
  c record; l record; s record; ba record;
  v_stmts jsonb; v_stmt_j jsonb; v_exc jsonb; v_block jsonb; v_basis jsonb;
  v_line_status text; v_line_match uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_line is null then return null; end if;

  select bl.* into l from clara.bank_statement_lines bl
    where bl.id = p_line and bl.firm_id = c.firm;
  if not found then return null; end if;

  select bs.* into s from clara.bank_statements bs
    where bs.id = l.statement_id and bs.firm_id = c.firm;
  if not found then return null; end if;

  select a.* into ba from clara.bank_accounts a
    where a.id = l.bank_account_id and a.firm_id = c.firm;

  -- The tie object, taken from the existing read rather than recomputed (see the header).
  v_stmts := clara.list_bank_statements(l.client_id, l.bank_account_id);
  select e.value into v_stmt_j
    from jsonb_array_elements(coalesce(v_stmts, '[]'::jsonb)) as e(value)
   where (e.value->>'id')::uuid = s.id;

  -- The governing exception: the SAME ordering list_unmatched_lines uses to decide whether a
  -- line is excepted (0040:4117-4122) -- open first, then newest -- so the two surfaces can
  -- never name different rows as "the" exception on one line.
  select to_jsonb(x) into v_exc from (
    select e.id, e.kind, e.reason, e.status, e.created_at, e.created_by,
           e.resolved_at, e.resolved_by, e.resolution_disposition, e.resolution_note,
           e.evidence_document_id, e.counterpart_line_id
      from clara.bank_line_exceptions e
     where e.line_id = l.id and e.firm_id = c.firm
     order by (e.status = 'open') desc, e.created_at desc, e.id desc
     limit 1) x;

  -- The ungranted block's payload, VERBATIM. Its two trailing parameters default to NULL
  -- (0044:2459-2460); NULL is the honest answer when nothing blocks.
  v_block := clara._wdb_line_booking_block(l.id);

  -- THE DETERMINISTIC BASIS, one row per CANDIDATE entry of this line's bank account.
  -- Never a score (Q3 / SYNTHESIS J2). See the file header §B for each field's definition.
  --
  -- "CANDIDATE" MEANS THE SAME POPULATION §3's READ OFFERS, and the remaining-capacity
  -- predicate is how that sentence is made true rather than merely written. A FIRST CUT
  -- filtered only on firm / client / approved / not-reversed / touches-the-COA and therefore
  -- described EVERY approved bank-touching entry the client had ever booked, fully-spent ones
  -- included. Nothing failed: matching-candidates.tsx builds its map from this array but looks
  -- rows up BY the candidate read's own entry ids, so the surplus was computed, hashed into the
  -- pack, sent over the wire and silently dropped — cost with no reader. The capacity is now
  -- computed ONCE per entry in the inner select (it was typed twice, once per arm of the
  -- amount_exact CASE) and the outer select filters on it exactly as §3's `) t where ...` does.
  -- p657.db.matching-context asserts the two entry-id sets are equal, so the claim is executable.
  --
  -- THE AGGREGATE CARRIES A TIEBREAK. Two entries posted on the same date have no natural
  -- order, and an arbitrary one is a flake waiting for the first test that pins it; entry_id
  -- breaks it, the way the candidate read's own match_history projection breaks its tie on
  -- bm.id.
  select coalesce(jsonb_agg(b.row_b order by b.posting_date desc, b.entry_id), '[]'::jsonb) into v_basis
    from (
      select r.entry_id, r.posting_date, jsonb_build_object(
        'entry_id', r.entry_id,
        'amount_exact', (case when l.amount_cents > 0 then r.debit_remaining_cents
                              else r.credit_remaining_cents end) = abs(l.amount_cents),
        'date_delta_days', (l.entry_date - r.posting_date),
        'counterparty_match', (
          select case
            when cp.id is null then 'none'
            when (nullif(btrim(coalesce(cp.registration_normalized, '')), '') is not null
                  and clara._bank_desc_word_match(l.description, array[cp.registration_normalized]))
              or (nullif(btrim(coalesce(cp.tin, '')), '') is not null
                  and clara._bank_desc_word_match(l.description, array[lower(btrim(cp.tin))]))
              then 'id'
            when clara.name_family_token(cp.name) is not null
                 and clara._bank_desc_word_match(l.description, array[clara.name_family_token(cp.name)])
              then 'name'
            else 'none'
          end
          from (select 1) one
          left join clara.counterparties cp
            on cp.client_id = l.client_id
           and cp.id = clara._canonical_counterparty(l.client_id,
                 (select min(jl4.counterparty_id::text)::uuid from clara.journal_lines jl4
                    where jl4.entry_id = r.entry_id and jl4.counterparty_id is not null))),
        'class_hint', clara._bank_line_class_hint(l.description)) as row_b
      from (
        select je.id as entry_id, je.posting_date,
          greatest(0,
            (select coalesce(sum(jl.debit_cents), 0) from clara.journal_lines jl
              where jl.entry_id = je.id and jl.account_code = ba.coa_account_code)
            - (select coalesce(sum(em.matched_cents), 0)
               from clara.bank_match_entry_members em
               join clara.bank_matches bm on bm.id = em.match_id
               join clara.bank_accounts ba2 on ba2.id = bm.bank_account_id
               where em.entry_id = je.id and em.matched_cents > 0
                 and bm.status in ('pending','live')
                 and ba2.coa_account_code = ba.coa_account_code
                 and ba2.client_id = l.client_id)) as debit_remaining_cents,
          greatest(0,
            (select coalesce(sum(jl.credit_cents), 0) from clara.journal_lines jl
              where jl.entry_id = je.id and jl.account_code = ba.coa_account_code)
            - (select coalesce(sum(-em.matched_cents), 0)
               from clara.bank_match_entry_members em
               join clara.bank_matches bm on bm.id = em.match_id
               join clara.bank_accounts ba2 on ba2.id = bm.bank_account_id
               where em.entry_id = je.id and em.matched_cents < 0
                 and bm.status in ('pending','live')
                 and ba2.coa_account_code = ba.coa_account_code
                 and ba2.client_id = l.client_id)) as credit_remaining_cents
        from clara.journal_entries je
        where je.firm_id = c.firm and je.client_id = l.client_id
          and je.status = 'approved' and je.reversed_by is null and je.reversal_of is null
          and ba.coa_account_code is not null
          and exists (select 1 from clara.journal_lines jl
            where jl.entry_id = je.id and jl.account_code = ba.coa_account_code
              and (jl.debit_cents <> 0 or jl.credit_cents <> 0))
      ) r
      where r.debit_remaining_cents > 0 or r.credit_remaining_cents > 0
    ) b;

  -- THE LINE'S LIVE MEMBERSHIP, read ONCE. Two independent `limit 1` subselects with no order
  -- could, if a second pending/live member row ever existed, name DIFFERENT matches in the two
  -- fields — a self-contradicting payload. The line-exclusivity index makes that unlikely
  -- rather than impossible, so this reads the row, not the fields, and orders explicitly.
  select m.group_status, m.match_id into v_line_status, v_line_match
    from clara.bank_match_line_members m
   where m.line_id = l.id and m.group_status in ('pending','live')
   order by (m.group_status = 'live') desc, m.match_id
   limit 1;

  return jsonb_build_object(
    'schema', 'clara.bank-line-matching-context/v1',
    'line', jsonb_build_object(
      'line_id', l.id, 'client_id', l.client_id, 'statement_id', l.statement_id,
      'bank_account_id', l.bank_account_id,
      'bank_account_display', case when ba.id is null then null
        else ba.bank_name_display || ' ' || ba.account_number end,
      'coa_account_code', ba.coa_account_code,
      'line_no', l.line_no, 'entry_date', l.entry_date, 'value_date', l.value_date,
      'description', l.description, 'amount_cents', l.amount_cents,
      'running_balance_cents', l.running_balance_cents,
      'class_hint', clara._bank_line_class_hint(l.description),
      'group_status', v_line_status,
      'match_id', v_line_match),
    'statement', jsonb_build_object(
      'id', s.id, 'status', s.status, 'superseded_by', s.superseded_by,
      'voided_by', s.voided_by, 'voided_at', s.voided_at, 'voided_reason', s.voided_reason,
      'ingest_mode', s.ingest_mode,
      'period_start', s.period_start, 'period_end', s.period_end,
      'statement_date', s.statement_date,
      'opening_cents', s.opening_cents, 'closing_cents', s.closing_cents,
      'source_doc_sha256', s.source_doc_sha256,
      'document_id', s.document_id,
      'original_filename', (select d.original_filename from clara.documents d
                             where d.id = s.document_id and d.firm_id = c.firm)),
    'coverage', jsonb_build_object(
      'line_count', s.line_count,
      'total_debit_cents', s.total_debit_cents,
      'total_credit_cents', s.total_credit_cents,
      'tie', coalesce(v_stmt_j->'tie', 'null'::jsonb)),
    'exception', coalesce(v_exc, 'null'::jsonb),
    'booking_block', coalesce(v_block, 'null'::jsonb),
    'candidate_basis', v_basis);
end $get_bank_line_matching_context$;

comment on function clara.get_bank_line_matching_context(uuid) is
  '#657: everything one bank statement line can say about itself before a match is decided -- its own facts, its statement header/lineage and filename, the period coverage (tie lifted from list_bank_statements, never re-derived), the governing bank_line_exceptions row, _wdb_line_booking_block''s payload verbatim, and one DETERMINISTIC basis row per entry list_bank_match_candidates would OFFER for this line''s bank account (the same remaining-capacity predicate, so the two arrays describe the same entries). Never a score.';

-- GRANT MATRIX. A function is PUBLIC-executable until revoked (0005:38-42), so the revoke is
-- not optional. ONE grantee: clara_authenticated. clara_runtime gains nothing (this is a human
-- judgement surface), both agent read roles gain nothing, and all four wake lanes gain nothing
-- -- the agent lane reads the pack, which is where its own gating lives.
revoke all on function clara.get_bank_line_matching_context(uuid) from public;
grant execute on function clara.get_bank_line_matching_context(uuid) to clara_authenticated;

-- -------------------------------------------------------------------------------------
-- §6 · CoR clara._match_bank_line_core's TERMINAL _finish_op PAYLOAD.
--
--      A SUBSTRING-ANCHORED replacement, not a retyped body, and that is the point: the three
--      lock-order literals, all seventeen refusal tokens and their `detail.reason` spellings,
--      and the public 6-arg signature cannot move if the only text that changes is the final
--      `_finish_op` call. The anchor is asserted to occur exactly once.
--
--      WHAT THE PAYLOAD GAINS (0038:4233-4238's shape, widened):
--        entry_ids / line_ids / bank_account_id / account_code -- so AC5's outcome block can
--          link the JE, the line and the allocation WITHOUT a second read racing the write it
--          is describing.
--        new_journal_entries -- coalesce(array_length(v_adj_entries,1), 0). With
--          p_adjustments empty this is 0, from the door's OWN record of what it created;
--          the face never asserts it.
--        settlement_objects -- 0. This body writes bank_matches, its two member tables,
--          bank_match_audit, one domain_events row and one op_receipts row, and touches
--          open_items / open_item_allocations NOWHERE. Settlement is settle_from_bank_line's
--          job (#655 births the open item, #657 allocates and ships no settlement door).
--
--      This is the machine-readable form of AC3 and AC5: "no new cash entry was created" is a
--      fact the DOOR states about itself.
-- -------------------------------------------------------------------------------------
do $p657_finish_op$
declare
  v_sig text := 'clara._match_bank_line_core(jsonb,uuid,jsonb,jsonb,jsonb,boolean,text)';
  v_oid oid; v_def text; v_src text; v_head text; v_target text; v_replacement text; v_occ int;
begin
  v_oid := to_regprocedure(v_sig);
  if v_oid is null then
    raise exception '#657 finish_op: % does not resolve at its exact pinned signature', v_sig using errcode='CLR10';
  end if;
  v_def := pg_get_functiondef(v_oid);
  select p.prosrc into v_src from pg_proc p where p.oid = v_oid;
  v_head := left(v_def, position(E'\nAS $function$' in v_def));
  if v_def <> v_head || 'AS $function$' || v_src || '$function$' || E'\n' then
    raise exception '#657 finish_op: % does not split at the AS $function$ boundary', v_sig using errcode='CLR10';
  end if;

  v_target :=
    'return clara._finish_op(c.firm, ''match_bank_line'', p_op_key,' || E'\n' ||
    '    jsonb_build_object(''match_id'', v_match, ''status'', ''live'',' || E'\n' ||
    '      ''line_cents'', v_line_cents, ''entry_cents'', v_entry_cents,' || E'\n' ||
    '      ''adjustment_cents'', v_adj_cents,' || E'\n' ||
    '      ''adjustment_entry_ids'', to_jsonb(v_adj_entries),' || E'\n' ||
    '      ''period_exceptions'', v_exceptions));';
  v_replacement :=
    'return clara._finish_op(c.firm, ''match_bank_line'', p_op_key,' || E'\n' ||
    '    jsonb_build_object(''match_id'', v_match, ''status'', ''live'',' || E'\n' ||
    '      ''line_cents'', v_line_cents, ''entry_cents'', v_entry_cents,' || E'\n' ||
    '      ''adjustment_cents'', v_adj_cents,' || E'\n' ||
    '      ''adjustment_entry_ids'', to_jsonb(v_adj_entries),' || E'\n' ||
    '      ''period_exceptions'', v_exceptions,' || E'\n' ||
    '      -- #657 AC3/AC5: the receipt states its own no-new-cash fact. new_journal_entries is' || E'\n' ||
    '      -- what THIS act created (zero unless a named adjustment leg was asked for);' || E'\n' ||
    '      -- settlement_objects is 0 because this body writes no open_item and no allocation.' || E'\n' ||
    '      ''entry_ids'', to_jsonb(v_entry_ids), ''line_ids'', to_jsonb(v_line_ids),' || E'\n' ||
    '      ''bank_account_id'', v_bank, ''account_code'', v_coa,' || E'\n' ||
    '      ''new_journal_entries'', coalesce(array_length(v_adj_entries, 1), 0),' || E'\n' ||
    '      ''settlement_objects'', 0));';

  v_occ := (length(v_src) - length(replace(v_src, v_target, ''))) / length(v_target);
  if v_occ <> 1 then
    raise exception '#657 finish_op: % does not carry the pinned terminal _finish_op payload exactly once (found %) -- re-derive before patching', v_sig, v_occ using errcode='CLR10';
  end if;
  execute v_head || 'AS $p657fin$' || replace(v_src, v_target, v_replacement) || '$p657fin$';
  raise notice '#657 finish_op: clara._match_bank_line_core''s terminal receipt now carries entry_ids/line_ids/bank_account_id/account_code/new_journal_entries/settlement_objects.';
end
$p657_finish_op$;

-- -------------------------------------------------------------------------------------
-- §7 · C33.8 -- THE STRUCTURED TASK BINDING.
--
--      (a) DROP+CREATE clara._agent_verify_inputs_digest: the 3-arg (uuid,text,TEXT) body
--          created at 0129:1038 becomes 3-arg (uuid,text,UUID). The derivation at 0129:1048
--          goes away entirely; the comparison at 0129:1052 becomes a typed one with NO
--          split_part at the comparison site. Both refusal MESSAGES and both `detail.reason`
--          tokens are byte-identical to 0129's -- a human and an agent must not learn a second
--          name for this one state.
--      (b) Re-patch the THIRTEEN call sites with 0129's own loop shape (0129:1063-1106, roster
--          :1067-1081). Three of the thirteen bind v_client rather than p_client; the roster is
--          reproduced from 0129 with its `|`-suffix, not retyped from memory.
--      (c) CoR clara._agent_bank_receipt with TWO anchored substitutions, each asserted to
--          occur exactly once: the INSERT column list gains `wake_task_id`, and the VALUES tail
--          (0129's replacement text, not 0121's -- measured) gains the matching expression.
-- -------------------------------------------------------------------------------------
do $p657_drop_verify$
declare v_oid oid; v_sha text;
begin
  v_oid := to_regprocedure('clara._agent_verify_inputs_digest(uuid,text,text)');
  if v_oid is null then
    raise exception '#657 C33.8: clara._agent_verify_inputs_digest/3(text) does not resolve -- already recut?' using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha from pg_proc where oid = v_oid;
  if v_sha <> 'bb7dc2a9ec99699c6a2fc68d3a67e01e33a5da8060003b1babb6fea108edfb35' then
    raise exception '#657 C33.8: clara._agent_verify_inputs_digest prosrc sha256 mismatch (got %) -- re-derive before dropping', v_sha using errcode='CLR10';
  end if;
  drop function clara._agent_verify_inputs_digest(uuid,text,text);
end
$p657_drop_verify$;

create function clara._agent_verify_inputs_digest(p_client uuid, p_digest text, p_task uuid)
  returns void
  language plpgsql security definer set search_path = clara, pg_temp
  as $verify_digest$
begin
  if nullif(btrim(coalesce(p_digest,'')),'') is null then
    raise exception 'an unattended bank act must name the pack digest its judgement was made on'
      using errcode='CLR10', detail='{"reason":"inputs_digest_unverified"}';
  end if;
  -- #657 C33.8: a TYPED comparison, with no string parser at the comparison site. The stored
  -- wake_task_id is read FIRST; clara._bank_op_key_task is the fallback for rows written
  -- before 0226 (the table is append-only, 0121:4407-4410, so no backfill is lawful).
  -- The null-task arm keeps 0129's exact semantics and is deliberately NOT tightened:
  -- tightening it would refuse a live agent act whose pack was read seconds ago.
  if not exists (
    select 1 from clara.bank_agent_receipts r
     where r.client_id = p_client and r.act_kind = 'pack_read' and r.inputs_digest = p_digest
       and (p_task is null or coalesce(r.wake_task_id, clara._bank_op_key_task(r.op_key)) = p_task)
  ) then
    raise exception 'the named inputs digest matches no bank pack this client actually read within the current task'
      using errcode='CLR10', detail='{"reason":"inputs_digest_unverified"}';
  end if;
end
$verify_digest$;
revoke all on function clara._agent_verify_inputs_digest(uuid,text,uuid) from public;

do $p657_c2_callers$
declare
  v_sig text; v_client_var text; v_target text; v_replacement text;
  v_src text; v_occ int; v_oid oid; v_def text; v_head text;
  v_sigs text[] := array[
    'clara._agent_add_bank_account_core(uuid,text,uuid,text,text,text,text,jsonb,text,text)|p_client',
    'clara._agent_book_staff_advance_application_core(uuid,date,text,jsonb,jsonb,text,text,text,jsonb,text,text)|p_client',
    'clara._agent_complete_bank_reconciliation_core(uuid,uuid[],text,jsonb,text,text)|v_client',
    'clara._agent_match_bank_line_core(uuid,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text)|p_client',
    'clara._agent_propose_bank_identifier_promotion_core(uuid,uuid,text,text,int,text,jsonb,text,text)|p_client',
    'clara._agent_propose_line_exception_core(uuid,text,text,uuid,text,jsonb,text,text)|v_client',
    'clara._agent_resolve_and_book_core(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,bigint,text,text,jsonb,text,text,boolean)|p_client',
    'clara._agent_resolve_bank_line_exception_core(uuid,text,text,uuid,text,jsonb,text,text)|v_client',
    'clara._agent_settle_from_bank_line_core(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,jsonb,text,text)|p_client',
    'clara._agent_unmatch_bank_match_core(uuid,uuid,text,text,jsonb,text,text)|p_client',
    'clara._agent_upsert_account_core(uuid,text,text,text,text,text,text,jsonb,text,text)|p_client',
    'clara._agent_void_bank_reconciliation_core(uuid,text,text,jsonb,text,text)|v_client',
    'clara._agent_void_bank_statement_core(uuid,uuid,text,text,jsonb,text,text)|p_client'];
  v_entry text; v_n int := 0;
begin
  foreach v_entry in array v_sigs loop
    v_sig := split_part(v_entry, '|', 1);
    v_client_var := split_part(v_entry, '|', 2);
    v_target := 'perform clara._agent_verify_inputs_digest(' || v_client_var || ', p_inputs_digest, p_op_key); -- H2, C2';
    v_replacement := 'perform clara._agent_verify_inputs_digest(' || v_client_var
      || ', p_inputs_digest, coalesce(clara._wake_task_id(), clara._bank_op_key_task(p_op_key))); -- H2, C2, #657';
    v_oid := to_regprocedure(v_sig);
    if v_oid is null then
      raise exception '#657 C33.8: % does not resolve at its exact pinned signature', v_sig using errcode='CLR10';
    end if;
    v_def := pg_get_functiondef(v_oid);
    select p.prosrc into v_src from pg_proc p where p.oid = v_oid;
    v_head := left(v_def, position(E'\nAS $function$' in v_def));
    if v_def <> v_head || 'AS $function$' || v_src || '$function$' || E'\n' then
      raise exception '#657 C33.8: % does not split at the AS $function$ boundary', v_sig using errcode='CLR10';
    end if;
    v_occ := (length(v_src) - length(replace(v_src, v_target, ''))) / length(v_target);
    if v_occ <> 1 then
      raise exception '#657 C33.8: % does not carry 0129''s post-image _agent_verify_inputs_digest call exactly once (found %) -- the core has DIVERGED from 0129''s shape; STOP and report rather than patching', v_sig, v_occ using errcode='CLR10';
    end if;
    execute v_head || 'AS $p657c2$' || replace(v_src, v_target, v_replacement) || '$p657c2$';
    v_n := v_n + 1;
  end loop;
  if v_n <> 13 then
    raise exception '#657 C33.8: % cores re-patched, expected exactly 13', v_n using errcode='CLR10';
  end if;
  raise notice '#657 C33.8: all 13 rostered _agent_*_core bodies now bind a TYPED task. Every one has a NEW prosrc sha -- future bank-family pins measure against #657''s post-image, never 0129''s.';
end
$p657_c2_callers$;

do $p657_receipt_cor$
declare
  v_sig text := 'clara._agent_bank_receipt(uuid,uuid,text,text,uuid,text,jsonb,text,text,jsonb,timestamptz)';
  v_oid oid; v_def text; v_src text; v_head text; v_new text;
  v_t1 text; v_r1 text; v_t2 text; v_r2 text; v_occ int;
begin
  v_oid := to_regprocedure(v_sig);
  if v_oid is null then
    raise exception '#657 C33.8: % does not resolve at its exact pinned signature', v_sig using errcode='CLR10';
  end if;
  v_def := pg_get_functiondef(v_oid);
  select p.prosrc into v_src from pg_proc p where p.oid = v_oid;
  v_head := left(v_def, position(E'\nAS $function$' in v_def));
  if v_def <> v_head || 'AS $function$' || v_src || '$function$' || E'\n' then
    raise exception '#657 C33.8: % does not split at the AS $function$ boundary', v_sig using errcode='CLR10';
  end if;

  -- (i) the INSERT COLUMN LIST -- 0121:4979-4981, untouched by 0129/0134.
  v_t1 := 'inputs_digest, gate_verdicts, approval_arm, op_key)';
  v_r1 := 'inputs_digest, gate_verdicts, approval_arm, op_key, wake_task_id)';
  -- (ii) the VALUES TAIL -- 0129's replacement text, not 0121's (measured on the rig).
  v_t2 := 'end from clara.wake_context() w),' || E'\n' || '      p_op_key)';
  v_r2 := 'end from clara.wake_context() w),' || E'\n'
       || '      p_op_key,' || E'\n'
       || '      -- #657 C33.8: the task binding is STORED, so the round trip is parser-free for'
       || E'\n'
       || '      -- every row written after 0226. _wake_task_id() is the forward path (it is NULL'
       || E'\n'
       || '      -- on today''s interactive_client bank credential, measured); the key-derived'
       || E'\n'
       || '      -- half is what populates the column now. Append-only table: no backfill.'
       || E'\n'
       || '      coalesce(clara._wake_task_id(), clara._bank_op_key_task(p_op_key)))';

  v_occ := (length(v_src) - length(replace(v_src, v_t1, ''))) / length(v_t1);
  if v_occ <> 1 then
    raise exception '#657 C33.8: _agent_bank_receipt''s INSERT column-list anchor occurs % time(s), expected 1 -- STOP: ship the compare-time coalesce alone and name the residual', v_occ using errcode='CLR10';
  end if;
  v_occ := (length(v_src) - length(replace(v_src, v_t2, ''))) / length(v_t2);
  if v_occ <> 1 then
    raise exception '#657 C33.8: _agent_bank_receipt''s VALUES-tail anchor occurs % time(s), expected 1 -- STOP: ship the compare-time coalesce alone and name the residual', v_occ using errcode='CLR10';
  end if;

  v_new := replace(replace(v_src, v_t1, v_r1), v_t2, v_r2);
  execute v_head || 'AS $p657rcpt$' || v_new || '$p657rcpt$';
  raise notice '#657 C33.8: clara._agent_bank_receipt now writes bank_agent_receipts.wake_task_id.';
end
$p657_receipt_cor$;

reset role;

-- -------------------------------------------------------------------------------------
-- §8 · TAIL.  Owner / SECURITY DEFINER / search_path / ACL for every touched body; the
--      candidate-projection parity assertion; the three lock-order literals in order; this
--      file's OWN single-pg_proc-row census over every name it installs AND every name it
--      recuts (DECISIONS §2.2 -- the four earlier censuses are `do` blocks at their own chain
--      position and cannot see 0226); the post-image shas of all thirteen cores, asserted;
--      and the two ungranted helpers still holding zero grants.
-- -------------------------------------------------------------------------------------
do $p657_tail$
declare
  v_n int; v_sig text; v_src text; v_a text; v_b text; v_i int; v_j int; v_k int;
  v_names text[] := array[
    'get_bank_line_matching_context', '_bank_op_key_task', '_agent_verify_inputs_digest',
    'list_bank_match_candidates', '_agent_get_bank_pack_core', '_match_bank_line_core',
    '_agent_bank_receipt',
    '_agent_add_bank_account_core', '_agent_book_staff_advance_application_core',
    '_agent_complete_bank_reconciliation_core', '_agent_match_bank_line_core',
    '_agent_propose_bank_identifier_promotion_core', '_agent_propose_line_exception_core',
    '_agent_resolve_and_book_core', '_agent_resolve_bank_line_exception_core',
    '_agent_settle_from_bank_line_core', '_agent_unmatch_bank_match_core',
    '_agent_upsert_account_core', '_agent_void_bank_reconciliation_core',
    '_agent_void_bank_statement_core'];
  v_defs text[] := array[
    'clara.get_bank_line_matching_context(uuid)',
    'clara._agent_verify_inputs_digest(uuid,text,uuid)',
    'clara.list_bank_match_candidates(uuid,uuid)',
    'clara._agent_get_bank_pack_core(uuid,uuid,text,jsonb,text)',
    'clara._match_bank_line_core(jsonb,uuid,jsonb,jsonb,jsonb,boolean,text)',
    'clara._agent_bank_receipt(uuid,uuid,text,text,uuid,text,jsonb,text,text,jsonb,timestamptz)'];
  v_ungranted text[] := array[
    'clara._wdb_line_booking_block(uuid,uuid,uuid)',
    'clara._bank_op_key_task(text)',
    'clara._agent_verify_inputs_digest(uuid,text,uuid)'];
  -- THE THIRTEEN POST-IMAGE SHAS (0195:390-409's prestate idiom, run on the POST side). Each
  -- was MEASURED off pg_proc.prosrc on clara_657 after §7(b)'s loop applied, never transcribed
  -- from file text — the caller loop reads each body out of the LIVE CATALOG (with the
  -- definition reader §7(b) names; spelling that function name HERE would flip
  -- scripts/check-wiki-dynamic-sql.mjs to classify this assertion-only tail as a
  -- change-of-record patch with an unresolved target, because its comment masker desynchronises
  -- earlier in this file and stops masking comments from :203 onward — measured, and filed as a
  -- follow-up rather than worked around by weakening the lint) and replaces one counted anchor,
  -- so the post-image is a function of
  -- 0129/0134's live text and nothing else. Pinning them here is what makes Risk 6's sentence
  -- ("every one of the thirteen gets a NEW prosrc sha; future bank-family pins measure against
  -- #657's post-image, never 0129's") an executable fact instead of a note in a report.
  v_posts text[][] := array[
    ['clara._agent_add_bank_account_core(uuid,text,uuid,text,text,text,text,jsonb,text,text)',
     '74275dcf369c0b478ffe64b35766375c775c59865ff2cbb5bc39d7a088d1ef44'],
    ['clara._agent_book_staff_advance_application_core(uuid,date,text,jsonb,jsonb,text,text,text,jsonb,text,text)',
     'b24efc35555b36990234f41d0e5d4c428e4f38b3d9b6b7d08984eed919fd62c3'],
    ['clara._agent_complete_bank_reconciliation_core(uuid,uuid[],text,jsonb,text,text)',
     'a3c6959715e84d9de001fd247f62a2ca814d0c23d46b3887ef1af2a33699196b'],
    ['clara._agent_match_bank_line_core(uuid,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text)',
     'd735c1d7d2e7e660f83130fa3a7d1b0e9c0ae1411523a8c5f1f5a2ec8ac73f42'],
    ['clara._agent_propose_bank_identifier_promotion_core(uuid,uuid,text,text,int,text,jsonb,text,text)',
     'cc9fcafcd0fe4e398d18161e364963f433b74694e201e6f397f8cfe38f6405da'],
    ['clara._agent_propose_line_exception_core(uuid,text,text,uuid,text,jsonb,text,text)',
     '6f83c76aab7a647724a31e06a1468eca591ea320189fa42201372da13610ea14'],
    ['clara._agent_resolve_and_book_core(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,bigint,text,text,jsonb,text,text,boolean)',
     '3bbf947f03e709f375d78e52b72f0973ecd95b2b477e790d32b31dbded2bdb9b'],
    ['clara._agent_resolve_bank_line_exception_core(uuid,text,text,uuid,text,jsonb,text,text)',
     'bad39b0a26d8b79b3d2b0ffa02ee0598c3e1def36d8cd4df5c50ae616ecaeeef'],
    ['clara._agent_settle_from_bank_line_core(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,jsonb,text,text)',
     '504a6ba1133e24551a739ec6989a89e7f35801cef0060bdedf4085e9fa9d90fa'],
    ['clara._agent_unmatch_bank_match_core(uuid,uuid,text,text,jsonb,text,text)',
     '35a3494d639a550b6676ce221e2775aa5a8b1dc9a2b9025ed3f18759b1ff4a66'],
    ['clara._agent_upsert_account_core(uuid,text,text,text,text,text,text,jsonb,text,text)',
     '59f6bad298acebd8f14ccc383527e986825035685171a07ef90f978de37c1f82'],
    ['clara._agent_void_bank_reconciliation_core(uuid,text,text,jsonb,text,text)',
     '6b7e8ce99b24a896dfa12828b485616df5b0a75a171d21073ad20a4cb6828c7a'],
    ['clara._agent_void_bank_statement_core(uuid,uuid,text,text,jsonb,text,text)',
     '87c359a67a56ad8ab08089732637516b75f08c8ab35d1cc1574ee29f0ae7f6fa']];
  v_name text; v_owner text; v_secdef boolean; v_cfg text[];
begin
  -- 1 · ONE pg_proc ROW PER NAME. A defaulted parameter would create an overload and an
  --     overload of a rostered name is a NEW VERB (DECISIONS §2.2). Nothing else in the chain
  --     can catch that for a file at position 0226; this is the catch.
  foreach v_name in array v_names loop
    select count(*)::int into v_n from pg_proc p
     where p.pronamespace = 'clara'::regnamespace and p.proname = v_name;
    if v_n <> 1 then
      raise exception '#657 tail: clara.% resolves to % pg_proc row(s), expected exactly 1 -- an overload appeared', v_name, v_n using errcode='CLR10';
    end if;
  end loop;

  -- 2 · OWNER / SECURITY DEFINER / search_path, for every definer body this file installed or
  --     recut. (_bank_op_key_task is a SECURITY INVOKER sql helper and is checked separately.)
  foreach v_sig in array v_defs loop
    select pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
      into v_owner, v_secdef, v_cfg
      from pg_proc p where p.oid = v_sig::regprocedure;
    if v_owner <> 'clara_fn_owner' then
      raise exception '#657 tail: % is owned by % (expected clara_fn_owner)', v_sig, v_owner using errcode='CLR10';
    end if;
    if not v_secdef then
      raise exception '#657 tail: % is not SECURITY DEFINER', v_sig using errcode='CLR10';
    end if;
    if v_cfg is null or not ('search_path=clara, pg_temp' = any(v_cfg)) then
      raise exception '#657 tail: % does not pin search_path=clara, pg_temp (got %)', v_sig, v_cfg using errcode='CLR10';
    end if;
  end loop;
  select pg_get_userbyid(p.proowner), p.proconfig into v_owner, v_cfg
    from pg_proc p where p.oid = 'clara._bank_op_key_task(text)'::regprocedure;
  if v_owner <> 'clara_fn_owner' or v_cfg is null or not ('search_path=clara, pg_temp' = any(v_cfg)) then
    raise exception '#657 tail: clara._bank_op_key_task is owned by % / config % -- expected clara_fn_owner with a pinned search_path', v_owner, v_cfg using errcode='CLR10';
  end if;

  -- 3 · ACL, BYTE FOR BYTE. The one new granted name holds exactly clara_authenticated; the
  --     two recut granted reads keep the ACL they had; every ungranted name holds ZERO
  --     non-owner grants.
  select count(*)::int into v_n from aclexplode(
      (select p.proacl from pg_proc p where p.oid='clara.get_bank_line_matching_context(uuid)'::regprocedure)) a
   where a.grantee = 'clara_authenticated'::regrole and a.privilege_type = 'EXECUTE';
  if v_n <> 1 then
    raise exception '#657 tail: clara.get_bank_line_matching_context does not grant EXECUTE to clara_authenticated' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from aclexplode(
      (select p.proacl from pg_proc p where p.oid='clara.get_bank_line_matching_context(uuid)'::regprocedure)) a
   where a.grantee <> 0
     and a.grantee <> 'clara_authenticated'::regrole
     and a.grantee <> 'clara_fn_owner'::regrole;
  if v_n <> 0 then
    raise exception '#657 tail: clara.get_bank_line_matching_context carries % grant(s) beyond clara_authenticated', v_n using errcode='CLR10';
  end if;
  if (select p.proacl::text from pg_proc p where p.oid='clara.list_bank_match_candidates(uuid,uuid)'::regprocedure)
     <> '{clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner}' then
    raise exception '#657 tail: clara.list_bank_match_candidates'' ACL moved under the recut (got %)',
      (select p.proacl::text from pg_proc p where p.oid='clara.list_bank_match_candidates(uuid,uuid)'::regprocedure)
      using errcode='CLR10';
  end if;
  if (select p.proacl::text from pg_proc p where p.oid='clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)'::regprocedure)
     <> '{clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner}' then
    raise exception '#657 tail: clara.match_bank_line''s ACL moved (got %)',
      (select p.proacl::text from pg_proc p where p.oid='clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)'::regprocedure)
      using errcode='CLR10';
  end if;
  foreach v_sig in array v_ungranted loop
    select count(*)::int into v_n from aclexplode(
        (select coalesce(p.proacl, acldefault('f', p.proowner)) from pg_proc p where p.oid = v_sig::regprocedure)) a
     where a.grantee <> 0 and a.grantee <> 'clara_fn_owner'::regrole;
    if v_n <> 0 then
      raise exception '#657 tail: % carries % non-owner grant(s) -- it must hold ZERO', v_sig, v_n using errcode='CLR10';
    end if;
  end loop;
  -- The old 3-arg (uuid,text,text) verify must be GONE, not merely shadowed.
  if to_regprocedure('clara._agent_verify_inputs_digest(uuid,text,text)') is not null then
    raise exception '#657 tail: the pre-0226 clara._agent_verify_inputs_digest(uuid,text,text) still resolves' using errcode='CLR10';
  end if;

  -- 4 · THE CANDIDATE-PROJECTION PARITY ASSERTION (Q4 / SYNTHESIS J3). Both marked regions,
  --     whitespace-normalised, must be identical. The firm binding lives OUTSIDE the region.
  select p.prosrc into v_src from pg_proc p where p.oid='clara.list_bank_match_candidates(uuid,uuid)'::regprocedure;
  v_i := strpos(v_src, '/* P657-CAND-BEGIN */') + length('/* P657-CAND-BEGIN */');
  v_j := strpos(v_src, '/* P657-CAND-END */');
  if v_i <= length('/* P657-CAND-BEGIN */') or v_j <= 0 then
    raise exception '#657 tail: the public candidate read carries no marked projection' using errcode='CLR10';
  end if;
  v_a := btrim(regexp_replace(substr(v_src, v_i, v_j - v_i), '\s+', ' ', 'g'));
  select p.prosrc into v_src from pg_proc p where p.oid='clara._agent_get_bank_pack_core(uuid,uuid,text,jsonb,text)'::regprocedure;
  v_i := strpos(v_src, '/* P657-CAND-BEGIN */') + length('/* P657-CAND-BEGIN */');
  v_j := strpos(v_src, '/* P657-CAND-END */');
  if v_i <= length('/* P657-CAND-BEGIN */') or v_j <= 0 then
    raise exception '#657 tail: the pack core carries no marked projection -- the splice did not land' using errcode='CLR10';
  end if;
  v_b := btrim(regexp_replace(substr(v_src, v_i, v_j - v_i), '\s+', ' ', 'g'));
  if v_a <> v_b then
    raise exception '#657 tail: the two candidate projections are NOT field-identical -- public(%) vs pack(%)', left(v_a, 120), left(v_b, 120) using errcode='CLR10';
  end if;
  -- and the three additions are actually IN it.
  if position('counterparty_name' in v_a) = 0 or position('match_history' in v_a) = 0
     or position('clara.is_high_stakes(je.id)' in v_a) = 0 then
    raise exception '#657 tail: the shared candidate projection is missing one of the three additions' using errcode='CLR10';
  end if;
  if position('''high_stakes'', false' in v_a) > 0 then
    raise exception '#657 tail: the shared candidate projection still hardcodes high_stakes=false' using errcode='CLR10';
  end if;

  -- 5 · THE THREE LOCK-ORDER LITERALS, IN ORDER, in the recut core (0040:6808-6842's law,
  --     re-asserted from the test side by x38.aa at x38-wave-c-b-match.test.mjs:1469).
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._match_bank_line_core(jsonb,uuid,jsonb,jsonb,jsonb,boolean,text)'::regprocedure;
  v_i := strpos(v_src, 'order by je.id for update');
  v_j := strpos(v_src, 'pg_advisory_xact_lock(203005004');
  v_k := strpos(v_src, 'order by l.id for update');
  if v_i = 0 or v_j = 0 or v_k = 0 or not (v_i < v_j and v_j < v_k) then
    raise exception '#657 tail: the three lock-order literals are missing or out of order in _match_bank_line_core (je=%, advisory=%, lines=%)', v_i, v_j, v_k using errcode='CLR10';
  end if;
  if position('''new_journal_entries'', coalesce(array_length(v_adj_entries, 1), 0)' in v_src) = 0
     or position('''settlement_objects'', 0' in v_src) = 0 then
    raise exception '#657 tail: _match_bank_line_core''s receipt does not carry the no-new-cash pair' using errcode='CLR10';
  end if;
  -- the public door is still the untouched thin wrapper
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid='clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)'::regprocedure)
     <> '308b7f083f9d27252fb24a65c77dd3aa42e3090e310344fba326bb3e31edc42b' then
    raise exception '#657 tail: clara.match_bank_line/6 moved -- this file recuts the CORE only' using errcode='CLR10';
  end if;

  -- 6 · NO split_part SURVIVES IN THE DIGEST VERIFIER, and the typed comparison is there.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._agent_verify_inputs_digest(uuid,text,uuid)'::regprocedure;
  if position('split_part' in v_src) > 0 then
    raise exception '#657 tail: clara._agent_verify_inputs_digest still parses a key with split_part' using errcode='CLR10';
  end if;
  if position('coalesce(r.wake_task_id, clara._bank_op_key_task(r.op_key)) = p_task' in v_src) = 0 then
    raise exception '#657 tail: clara._agent_verify_inputs_digest does not carry the typed task comparison' using errcode='CLR10';
  end if;

  -- 7 · ALL THIRTEEN CORES carry the #657 post-image call exactly once, EVERY ONE AT ITS PINNED
  --     POST-IMAGE SHA, and the receipt stores the binding.
  --
  --     The sha loop is the brief's "assert every post-image sha in the tail". A previous cut of
  --     this comment said the shas were asserted by the companion battery cell
  --     p657.db.digest-census; that cell asserts the substring anchor and no sha at all, so the
  --     file pointed at evidence that did not exist. Both now hold: the anchor is counted below,
  --     and the sha is compared against v_posts.
  for v_i in 1 .. array_length(v_posts, 1) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_a from pg_proc p
      where p.oid = v_posts[v_i][1]::regprocedure;
    if v_a is distinct from v_posts[v_i][2] then
      raise exception '#657 tail: % is at prosrc sha % -- expected #657 post-image %. A core diverged from 0129''s shape, or this file was applied against a chain that had already moved it', v_posts[v_i][1], v_a, v_posts[v_i][2] using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.proname like '\_agent\_%\_core'
     and p.prosrc like '%clara._agent_verify_inputs_digest(%clara._bank_op_key_task(p_op_key))); -- H2, C2, #657%';
  if v_n <> 13 then
    raise exception '#657 tail: % _agent_*_core bodies carry the #657 post-image digest call, expected exactly 13', v_n using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._agent_bank_receipt(uuid,uuid,text,text,uuid,text,jsonb,text,text,jsonb,timestamptz)'::regprocedure;
  if position('inputs_digest, gate_verdicts, approval_arm, op_key, wake_task_id)' in v_src) = 0
     or position('coalesce(clara._wake_task_id(), clara._bank_op_key_task(p_op_key)))' in v_src) = 0 then
    raise exception '#657 tail: clara._agent_bank_receipt does not write wake_task_id' using errcode='CLR10';
  end if;
  if position('on conflict (firm_id, op_key) do nothing' in v_src) = 0 then
    raise exception '#657 tail: clara._agent_bank_receipt lost its append-only ON CONFLICT arm' using errcode='CLR10';
  end if;

  -- 8 · THE NEW READ NAMES NONE OF 0044's THREE CREATION-KEY LITERALS (§C item 1 -- a law with
  --     no executable reach into this file, so this file compiles it for itself).
  select p.prosrc into v_src from pg_proc p where p.oid='clara.get_bank_line_matching_context(uuid)'::regprocedure;
  if position('settlement_entry_id' in v_src) > 0
     or position('charge_entry_id' in v_src) > 0
     or position('adjustment_entry_ids' in v_src) > 0 then
    raise exception '#657 tail: clara.get_bank_line_matching_context names one of 0044''s three creation-key literals -- a READ must never claim it BUILT an entry' using errcode='CLR10';
  end if;

  -- 9 · EVERY bank.% EVENT TYPE STILL CARRIES A TAXONOMY DECISION.
  --
  --     THE TITLE SAYS WHAT THE BLOCK MEASURES. It used to read "NO NEW TABLE, NO NEW EVENT
  --     TYPE, NO NEW accounting_work purpose (D14)" and assert none of those three things: it
  --     counts orphaned bank event types, a fact about the ESTATE that this file can move in
  --     one direction only (by registering an event and forgetting its taxonomy row). D14's
  --     three negatives are real and they are honoured -- this file creates no table, registers
  --     no event type and never names `accounting_work` -- but they are honoured BY CONSTRUCTION
  --     and read by a human, not compiled here. Claiming otherwise in a tail heading is the
  --     class of unbacked claim AGENTS.md forbids, so the heading now matches the measurement.
  select count(*)::int into v_n from clara.event_types where name like 'bank.%'
    and name not in (select event_type from clara.trigger_taxonomy);
  if v_n <> 0 then
    raise exception '#657 tail: % bank event type(s) carry no taxonomy decision -- this file registers no new event and must not have orphaned one', v_n using errcode='CLR10';
  end if;

  raise notice '#657 tail: OK -- clara.get_bank_line_matching_context(uuid) and clara._bank_op_key_task(text) each exist exactly once; the read is clara_authenticated-only and the helper plus _wdb_line_booking_block plus the recreated _agent_verify_inputs_digest hold ZERO non-owner grants; every installed and recut name resolves to exactly ONE pg_proc row; the public candidate read and the pack core''s inlined copy are field-identical (counterparty_name + truthful high_stakes + bounded match_history, in both); _match_bank_line_core keeps its three lock-order literals in order and now states new_journal_entries/settlement_objects while match_bank_line/6 itself is byte-unmoved; _agent_verify_inputs_digest carries no split_part and compares a typed task; all 13 rostered cores carry the #657 post-image call AND each is at its pinned post-image prosrc sha; _agent_bank_receipt stores wake_task_id and keeps its append-only ON CONFLICT arm; and the new read names none of 0044''s three creation-key literals.';
end
$p657_tail$;
