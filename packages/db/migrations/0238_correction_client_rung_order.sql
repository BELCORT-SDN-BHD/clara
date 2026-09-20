-- 0238_correction_client_rung_order -- #914: `clara.approve_wrong_client_correction` RE-CUT so the
-- CLIENT ADVISORY RUNG (203005004) precedes every `clara.clients` ROW it touches. It was the only
-- door in the estate that took the row first. Nothing else about the door moves: same signature,
-- same owner, same SECURITY DEFINER flag, same ACL, same refusals in the same order, same
-- receipt, same effects on the books.
-- =====================================================================================
-- Spec of record: issue #914 (Agent Brief in the 2026-09-17 triage comment). Filed from wave
-- 2026-09-15 (PR #860) out of #649's round-two re-check, which censused every rung-bearing body
-- and found exactly ONE that takes a `clara.clients` row before the rung -- this door -- and
-- measured a real deadlock against an adversary in the prescribed order. DECISIONS.md SS3.1's
-- final row names it as a PRE-EXISTING violation, explicitly not #649's to fix.
--
-- THE TOTAL ORDER, BEFORE AND AFTER (acquisition sequence, not source order):
--
--   BEFORE (0027 -> 0037 -> 0038 -> 0125, the live tip this file replaces)
--     firm rung 203005002
--       -> filing_corrections ROW (for update)
--       -> documents ROW (for update)                     [0027 task #29]
--       -> document_filings ROWS (order by id, for update)[0027 task #29]
--       -> clara.clients ROW on x.from_client             [0019 SS1, the publication serializer]
--       -> journal_entries ROWS (order by id, for update of je)
--       -> client rung 203005004 on o.client_id, inside the item loop's reverse branch
--
--   AFTER (this file)
--     firm rung 203005002
--       -> filing_corrections ROW (for update)
--       -> documents ROW (for update)                     [0027 task #29, unmoved]
--       -> document_filings ROWS (order by id, for update)[0027 task #29, unmoved]
--       -> journal_entries ROWS (order by id, for update of je)
--       -> client rung 203005004 on x.from_client, ONCE   [hoisted out of the loop AND out of its
--                                                          `action = 'reverse'` branch: now taken
--                                                          by EVERY correction]
--       -> clara.clients ROW on x.from_client             [moved DOWN, below the rung]
--
-- WHY THIS DOES NOT INVERT AGAINST ANY NEIGHBOUR.
--
--   * THE APPROVE CORE (0037 SECTION K's ONE NAMED EXCEPTION). `clara._approve_entry_core` and
--     the section-4.9 composites take the client rung BEFORE their row locks, but two verbs --
--     `clara.reverse_entry` and this door -- lock a PRE-EXISTING `clara.journal_entries` row
--     FIRST and only then take 203005004, because the core does, and inverting it in one verb
--     would itself be the deadlock. This file PRESERVES that: the rung still sits AFTER
--     `for update of je`. Hoisting the rung to the top of the body (the obvious-looking remedy)
--     is exactly what 0037 forbids, which is why the remedy here is to move the ROW down instead.
--     0037 SECTION H.3 also installed a body census asserting the rung sits after the JE row
--     locks and before `clara._subledger_allocated_items_present(`; that relative order is
--     unchanged and `x37-wave-c-a-subledger.test.mjs`'s live pin still passes.
--   * THE REVERSE-ENTRY DOOR. `clara.reverse_entry` takes the entry row, then 203005004, then the
--     subledger probe, and touches NO `clara.clients` row at all (measured: it is not in the
--     eleven-body census below). The two doors meet only on the entry row and the rung, in the
--     same order as before.
--   * THE SETTLE DOOR (#649 round 2). `clara.settle_client_onboarding_facts` takes the rung and
--     THEN the client row (rung@893 -> row@972, measured). Before this file the two doors met in
--     opposite orders on exactly that pair; after it they agree.
--   * `clara.set_client_fy_end` (0042 SS5.12 "THE RUNG BEFORE THE GUARD READS") takes the rung
--     (@1128) and then updates `clara.clients` (@2480). Same agreement.
--   * THE FILING NEIGHBOURS. `clara.retire_document_filing` and `clara.file_document` meet this
--     door on `clara.documents` and `clara.document_filings`, which this file does not move: the
--     0027 task-#29 order (documents strictly before the first document_filings touch) is intact
--     and re-asserted in this file's tail. `clara.retire_document_filing` also takes a
--     `clara.clients` row, and takes it AFTER `clara.documents`, exactly as this door still does.
--   * THE NEW PAIR THIS FILE CREATES, stated rather than hoped: the journal_entries row locks now
--     precede the `clara.clients` row. A door taking a client ROW and then a journal_entries ROW
--     would invert against that. There is none -- the eleven bodies that acquire a `clara.clients`
--     row were censused on the rig at 237 migrations and only this one also locks a
--     `clara.journal_entries` row.
--
-- WHICH CLIENT THE RUNG COVERS, and why one acquisition is the same lock as the old per-item one:
-- the correction's SOURCE client, `x.from_client`. Every captured item is an entry selected by
-- `je.filing_id = <the source client's active filing>` (`clara.preview_wrong_client_correction`,
-- 0007:2460, whose plan `clara.propose_wrong_client_correction` stores verbatim);
-- `ck_je_document_filing_pair` makes `document_id` and `filing_id` null together, and the
-- `t_je_provenance` constraint trigger (0007, still DEFERRABLE INITIALLY DEFERRED and enabled)
-- refuses any entry with a document whose filing's `client_id` differs from the entry's own. So
-- `o.client_id = x.from_client` for every item, structurally, not by observation -- and neither
-- column can drift afterwards, because neither appears in any allowset of `t_je_immutable` and a
-- filing's identity is immutable as well (`_tf_document_filing_update`). The old per-item
-- acquisition was therefore already a re-entrant no-op after the first item; this file takes the
-- same key once, earlier, and holds it a little longer.
--
-- THE HOIST ALSO DROPS A CONDITION, AND THAT IS A REAL (IF SMALL) BEHAVIOUR CHANGE (fix round,
-- ADV-L01-07). In 0125 the rung sat inside `if it.action = 'reverse' then`, so a correction whose
-- items are ALL `withdraw_draft` or `already_reversed` -- one that reverses nothing -- took no
-- client rung at all. Here it takes 203005004 like every other correction. This is strictly MORE
-- locking and it adds no pair: every `rung -> Y` the straight-line acquisition creates (the
-- `clara.clients` row, the item-state-hash and closed-period reads, the `client_resolutions` read,
-- the allocated/bank probes, the draft-mirror `for update` on `clara.journal_entries`) already
-- existed on the reverse arm, and 0037 SECTION H.3's "rung before
-- `clara._subledger_allocated_items_present(`" order is intact. Taking the rung on the
-- nothing-to-reverse path is also the honest posture: the door still reads and writes that
-- client's rows (the filing retirement, the coding task, the receipt) whichever branch its items
-- take.
--
-- WHAT THIS FILE DOES NOT DO (out of scope per the Agent Brief).
--   * No new or renumbered rung. The two identifiers (203005002 firm, 203005004 client) and the
--     roles they play are unchanged.
--   * The settle door's order is not touched.
--   * Nothing about what the correction does to the books changes: the same reversal mirror, the
--     same adoption branch, the same `clara._subledger_on_approve` hook call (exactly once), the
--     same `clara._book_today()` legal date, the same filing retirement and re-filing, the same
--     coding task, notification, audit row, domain events and receipt.
--   * No grant moves. `create or replace function` preserves the ACL, and the tail re-reads it.
--
-- CONSUMER ORDER. None owed. The signature, the receipt shape and every refusal code and message
-- are unchanged, so no caller -- web, runtime or chat -- needs to move before or after this file.
-- Rollback is a successor migration re-issuing the 0125 body verbatim; this file's prestate pins
-- that body's sha so a rollback can be proven byte-exact.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- §A  PRESTATE. The world this file reasons about, measured rather than remembered.
--
-- REDO-TOLERANT BY CONSTRUCTION (#957, packages/db/README.md "Redo"). The one pin that names a
-- sha accepts TWO values: 0125's live body (a first apply) or this file's own (a redo of an
-- unmerged edit). The notice says which state the database was in. `create or replace function`
-- is idempotent DDL, so re-running this file over its own old effects changes nothing else.
-- =====================================================================================
do $w914_pre$
declare
  v_sha text; v_owner text; v_secdef bool; v_acl text; v_src text; v_state text;
  v_rung int; v_row int; v_je int; v_doc int; v_fil int; v_n int; v_bad text;
begin
  if to_regprocedure('clara.approve_wrong_client_correction(uuid,text,text,text)') is null then
    raise exception '#914 prestate: clara.approve_wrong_client_correction is absent -- 0007/0009/0027/0037/0038/0125 must apply first'
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'), r.rolname, p.prosecdef,
         coalesce(p.proacl::text,'(null)'), p.prosrc
    into v_sha, v_owner, v_secdef, v_acl, v_src
    from pg_proc p join pg_roles r on r.oid = p.proowner
   where p.oid = 'clara.approve_wrong_client_correction(uuid,text,text,text)'::regprocedure;

  -- 1 · THE BODY THIS FILE REPLACES: 0125's (measured on this rig at 237 migrations,
  -- 0001->0237, before this file existed), or this file's own after a redo.
  if v_sha = 'a9c0719e84f5e97a91aaa66a034fcce810d1c96d436883a0cd90471c49d8d25e' then
    v_state := 'first apply (0125''s body is live)';
  elsif v_sha = '8531862ccbd2caffd5d665d6dfe92f3cd2174f30ff7a9e48c9cdb58763246188' then
    v_state := 'redo (#914''s own body is already live)';
  else
    raise exception '#914 prestate: clara.approve_wrong_client_correction is neither its 0125 body nor #914''s own (sha %) -- a third party recut it; re-derive the new order against the LIVE body before replacing it', v_sha
      using errcode='CLR10';
  end if;

  -- 2 · OWNER, DEFINER FLAG AND GRANT, so the replace below can be proven to move none of them.
  if v_owner is distinct from 'clara_fn_owner' or v_secdef is distinct from true then
    raise exception '#914 prestate: the door''s owner or SECURITY DEFINER flag has moved (owner=%, secdef=%)', v_owner, v_secdef
      using errcode='CLR10';
  end if;
  if v_acl is distinct from '{clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner}' then
    raise exception '#914 prestate: the door carries an unexpected ACL (%) -- expected owner + clara_authenticated only (0007:2776 / 0009)', v_acl
      using errcode='CLR10';
  end if;

  -- 3 · THE DEFECT ITSELF, re-measured on the live body rather than cited from #649's report:
  -- the client ROW is acquired BEFORE the client rung. On a redo the two are already in the new
  -- order, which is the other lawful state.
  v_rung := position('pg_advisory_xact_lock(203005004' in v_src);
  v_row  := position('from clara.clients cl' in v_src);
  v_je   := position('for update of je' in v_src);
  if v_rung = 0 or v_row = 0 or v_je = 0 then
    raise exception '#914 prestate: the live body is missing one of its three anchors (rung=%, client row=%, je row lock=%) -- this file cannot reorder a ladder it cannot find', v_rung, v_row, v_je
      using errcode='CLR10';
  end if;
  if v_state like 'first apply%' and v_row > v_rung then
    raise exception '#914 prestate: the live 0125 body already takes the client rung before the client row -- the defect this file exists to close is not present'
      using errcode='CLR10';
  end if;

  -- 4 · THE 0027 TASK-#29 ORDER this file must not disturb: documents strictly before the first
  -- document_filings touch.
  v_doc := position('from clara.documents where id=x.document_id for update' in v_src);
  v_fil := position('from clara.document_filings f where f.document_id=x.document_id' in v_src);
  if v_doc = 0 or v_fil = 0 or v_doc > v_fil then
    raise exception '#914 prestate: the live body has lost 0027''s documents-before-document_filings order (documents=%, filings=%)', v_doc, v_fil
      using errcode='CLR10';
  end if;

  -- 5 · THE 0037 MARKERS the replacement reproduces verbatim: the hook exactly once, the
  -- allocation refusal, the 0038 bank-match refusal, the adoption branch and the 0042 house legal
  -- date. A body missing any of them is not the body this file transcribed.
  select count(*) into v_n from regexp_matches(v_src, 'clara\._subledger_on_approve\(', 'g');
  if v_n <> 1 then
    raise exception '#914 prestate: the subledger hook appears % times in the live body (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  foreach v_bad in array array['clara._subledger_allocated_items_present(',
                               'clara._bank_live_match_present(',
                               'clara._bank_live_statement_on_document(',
                               'clara._expected_reversal_state_hash(',
                               'clara._book_today()'] loop
    if position(v_bad in v_src) = 0 then
      raise exception '#914 prestate: the live body no longer carries the marker % -- refusing to replace a body this file cannot account for', v_bad
        using errcode='CLR10';
    end if;
  end loop;

  -- 6 · THE STRUCTURAL PREMISE OF THE ONE-ACQUISITION RUNG: the provenance wall that makes every
  -- captured entry's client_id equal to the correction's source client. Without it, one rung on
  -- x.from_client would not cover what the old per-item rung on o.client_id covered.
  if not exists (select 1 from pg_trigger
                  where tgrelid='clara.journal_entries'::regclass and not tgisinternal
                    and tgname='t_je_provenance' and tgenabled <> 'D') then
    raise exception '#914 prestate: t_je_provenance is absent or disabled -- a captured entry could then carry a client_id its filing does not, and one rung on x.from_client would not cover it'
      using errcode='CLR10';
  end if;
  if position('f.client_id = new.client_id' in
      (select p.prosrc from pg_proc p join pg_trigger t on t.tgfoid = p.oid
        where t.tgrelid='clara.journal_entries'::regclass and t.tgname='t_je_provenance')) = 0 then
    raise exception '#914 prestate: t_je_provenance no longer asserts filing/entry client congruence'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid='clara.journal_entries'::regclass
                    and conname='ck_je_document_filing_pair' and convalidated) then
    raise exception '#914 prestate: ck_je_document_filing_pair is absent or not validated -- filing_id could then be set with document_id null, escaping t_je_provenance entirely'
      using errcode='CLR10';
  end if;

  raise notice '#914 prestate: clean -- state: %. Door at sha %, owner clara_fn_owner, SECURITY DEFINER, ACL owner+clara_authenticated; anchors rung=%, client row=%, je row lock=%; 0027 order intact (documents=% < filings=%); the subledger hook appears exactly once; t_je_provenance and ck_je_document_filing_pair both live.',
    v_state, v_sha, v_rung, v_row, v_je, v_doc, v_fil;
end
$w914_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §B  THE CHANGE. ONE `create or replace function`. The body below is 0125's text with exactly
-- three edits, and nothing else: the `for update of je` statement moves up above the client row;
-- a single `pg_advisory_xact_lock(203005004, hashtext(x.from_client::text))` is inserted between
-- them; and the item loop's per-item acquisition on `o.client_id` becomes a comment saying the
-- rung is held from above. Every other character -- every refusal, every comment, every write --
-- is 0125's, verbatim.
-- =====================================================================================
create or replace function clara.approve_wrong_client_correction(p_correction uuid, p_plan_hash text,
    p_attestation text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; x record; it record; o record; pending record;
  v_current bigint; v_mirror uuid; v_to_filing uuid; v_from_filing uuid;
  v_resolution uuid; v_solo text; v_adopted boolean;
  v_recode_notification uuid; v_coding_task uuid; v_facts jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  select * into x from clara.filing_corrections where id=p_correction;
  if not found or x.firm_id<>c.firm then raise exception 'correction not in your firm' using errcode='CLR11'; end if;
  -- [R1-F1] A filing correction may not capture any K-family entry.
  if exists(select 1 from clara.filing_correction_items i
      join clara.journal_entries je on je.id=i.entry_id
      where i.correction_id=p_correction and je.is_opening_balance) then
    raise exception 'opening entries are mutable only through the K-family'
      using errcode='CLR31',
        detail='{"reason":"opening_entry_k_family_only"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'approve_wrong_client_correction',p_op_key,
    clara._hash(jsonb_build_object('correction',p_correction,'plan_hash',p_plan_hash,
      'attestation',p_attestation)));
  if v_dedupe is not null then return v_dedupe; end if;

  perform pg_advisory_xact_lock(203005002,hashtext(c.firm::text));
  select * into x from clara.filing_corrections where id=p_correction for update;
  if x.status<>'proposed' or x.plan_hash<>p_plan_hash then raise exception 'correction plan/state mismatch' using errcode='CLR12'; end if;
  if c.actor=x.maker then
    if clara.eligible_checker_count(c.firm)>=2 then
      raise exception 'correction requires a distinct checker' using errcode='CLR19';
    elsif p_attestation is null or btrim(p_attestation)='' then
      raise exception 'solo correction approval requires attestation' using errcode='CLR19';
    else v_solo:=p_attestation; end if;
  end if;
  select coalesce(max(seq),0) into v_current from clara.domain_events where firm_id=c.firm;
  if v_current<>x.books_version then raise exception 'correction plan is stale (books version moved)' using errcode='CLR19'; end if;

  -- 0027 (task #29): lock the parent document BEFORE any document_filings touch -- same
  -- fix as confirm_attribution_candidate. Previously this function's first
  -- document_filings acquisition preceded `documents` (only reached later, via
  -- _recompute_document_retention), the same inversion against file_document.
  perform 1 from clara.documents where id=x.document_id for update;
  -- 0038 (design 4.2 / part2 section 5): PROVENANCE DURABILITY. A live bank statement binds this
  -- document AND the filing this correction is about to retire. Moving the document to another
  -- client under a statement that already produced lines -- and possibly matches and settlements
  -- -- is not a correction, it is a rewrite of a books-bearing fact. Refused at the top, before
  -- any filing work, so the refusal costs no write. Remedy: void the statement (which itself
  -- requires zero pending/live match groups on its lines, WCB-R5), then correct the filing, then
  -- re-ingest.
  if clara._bank_live_statement_on_document(x.document_id) then
    raise exception 'a live bank statement is bound to this document; void the statement before correcting its filing'
      using errcode='CLR10',detail='{"reason":"live_bank_statement_present"}';
  end if;
  perform 1 from clara.document_filings f where f.document_id=x.document_id and f.firm_id=c.firm
    order by f.id for update;
  select id into v_from_filing from clara.document_filings where document_id=x.document_id
    and client_id=x.from_client and retired_at is null;
  if v_from_filing is null then raise exception 'source filing is no longer active' using errcode='CLR19'; end if;
  perform 1 from clara.journal_entries je join clara.filing_correction_items i on i.entry_id=je.id
    where i.correction_id=x.id order by je.id for update of je;
  -- 0238 (#914): THE CLIENT RUNG, ONCE, BEFORE ANY clara.clients ROW. Until this file, this was
  -- the only door in the estate that took a clara.clients row BEFORE the client advisory rung;
  -- every sibling takes the rung first (clara.set_client_fy_end, 0042 SS5.12 "THE RUNG BEFORE
  -- THE GUARD READS"; clara.settle_client_onboarding_facts since #649 round 2), so the inversion
  -- was a real, measured deadlock under concurrent corrections. It is closed by moving the ROW
  -- DOWN, never by hoisting the rung above the journal_entries row locks: 0037 SECTION K's one
  -- named exception -- reverse_entry and this door lock a PRE-EXISTING entry row FIRST, because
  -- the approve core does -- still holds, and the rung still sits after the entry row locks.
  --
  -- ONE ACQUISITION, FOR THE CORRECTION'S SOURCE CLIENT (x.from_client). That is provably the
  -- same key the old per-item acquisition took on o.client_id: every captured item is an entry
  -- with je.filing_id = the SOURCE client's active filing (preview_wrong_client_correction,
  -- 0007:2460), ck_je_document_filing_pair forces document_id and filing_id to be non-null
  -- together, and the t_je_provenance constraint trigger (0007) refuses any entry whose
  -- filing's client_id differs from its own. Neither column appears in any allowset of
  -- t_je_immutable, and a filing's identity is immutable as well, so the pair cannot drift
  -- after insert. Advisory xact locks are re-entrant, so the old per-item repetition was
  -- already a no-op after the first item; taking it once, here, is the same lock at a lawful
  -- earlier point, held for a little longer.
  perform pg_advisory_xact_lock(203005004,hashtext(x.from_client::text));
  -- [WB-R21/0019 SS1] The wiki VETO is gone. A correction move still retires the
  -- SOURCE filing, so the SOURCE client's row lock -- the serializer against wiki
  -- publication -- stays. 0238 (#914) moved it down from the position the veto call
  -- held to just below the rung above: it is still taken before every refusal that
  -- follows (item state hash, closed period, destination authority) and still held,
  -- unreleased, when the source filing is retired at the end of this body.
  perform 1 from clara.clients cl
    where cl.id=x.from_client and cl.firm_id=c.firm for update;
  if not found then
    raise exception 'filing client not in the supplied firm' using errcode='CLR11';
  end if;
  if exists(select 1 from clara.filing_correction_items i
      where i.correction_id=x.id and i.entry_state_hash<>clara._entry_state_hash(i.entry_id)) then
    raise exception 'correction item state changed' using errcode='CLR19';
  end if;
  if exists(select 1 from clara.filing_correction_items i where i.correction_id=x.id
      and clara._correction_period_state(i.entry_id)<>'no_period_model') then
    raise exception 'correction touches a closed period' using errcode='CLR19';
  end if;
  select id into v_resolution from clara.client_resolutions
    where firm_id=c.firm and client_id=x.to_client and subject_kind='document'
      and subject_id=x.document_id and method in ('human','rule','judgement') and confidence>=0.95
      and superseded_at is null order by created_at desc limit 1;
  if v_resolution is null then raise exception 'destination client attribution is not authoritative' using errcode='CLR01'; end if;

  for it in select * from clara.filing_correction_items where correction_id=x.id order by entry_id loop
    select * into o from clara.journal_entries where id=it.entry_id;
    if it.action='reverse' then
      -- 0037: SERIALIZE REVERSE AGAINST ALLOCATION, exactly as reverse_entry now does. This
      -- body already holds the FIRM advisory rung (203005002) and the captured entries' JE
      -- row locks; neither serializes against a section-4.9 composite, which takes the CLIENT
      -- rung and locks only its OWN freshly-inserted entry. The client rung that closes the
      -- check-then-act window on the refusal below is HELD FROM ABOVE: 0238 (#914) hoisted it
      -- out of this loop into a single acquisition on x.from_client -- still AFTER the JE row
      -- locks, so the JE -> advisory order the core uses is preserved, and now also before any
      -- clara.clients row. The full rung is firm(203005002) -> client(203005004).
      -- 0037 (design 4.5): the same reverse refusal reverse_entry carries. A correction that
      -- moves a filing between clients still REVERSES the entries it captures, so an
      -- allocated open item must be unallocated first here too.
      if clara._subledger_allocated_items_present(o.id) then
        raise exception 'open items on this entry carry allocations; unallocate them first'
          using errcode='CLR10',detail='{"reason":"allocated_items_present"}';
      end if;
      -- 0038 (design 4.6): the same reverse-while-matched refusal reverse_entry now carries. A
      -- correction that moves a filing between clients still REVERSES the entries it captures,
      -- so a captured entry that is a live bank-match member must be unmatched first. Refusal
      -- (a) above does not cover this: the captured entry may be matched to a statement on a
      -- DIFFERENT document entirely.
      if clara._bank_live_match_present(o.id) then
        raise exception 'a captured entry is matched to a bank statement line; unmatch the bank match first'
          using errcode='CLR10',detail='{"reason":"live_bank_match_present"}';
      end if;
      v_mirror:=null; v_adopted:=false;
      for pending in select * from clara.journal_entries
          where reversal_of=o.id and status='draft' order by id for update loop
        if v_mirror is null
           and clara._entry_state_hash(pending.id)=clara._expected_reversal_state_hash(pending.id,o.id) then
          v_mirror:=pending.id; v_adopted:=true;
        else
          update clara.journal_entries set status='withdrawn',withdrawn_by=c.actor,
            withdrawn_at=now(),withdrawal_reason='superseded-by-correction',
            proposed_counterparty=null,match_fingerprint=null,updated_at=now()
            where id=pending.id;
        end if;
      end loop;
      if v_mirror is null then
        -- 0042 (owner ruling 2026-08-03, WDB-R1): THE HOUSE LEGAL DATE, not the session's.
        -- The date this correction is booked at is a property of the HOUSE (Asia/Kuala_Lumpur),
        -- never of whoever opened the connection. The session clock this replaces is one day
        -- early for eight hours of every UTC day, so on the live runtime this door minted
        -- corrections dated into the PREVIOUS day -- and a previous day can sit in a month the
        -- client has already closed and filed. 0041 S4.4 removed this exact shape from
        -- clara.reverse_entry; this is its untreated sibling, and clara._book_today() is now
        -- the one body in the catalog that answers the question for both.
        insert into clara.journal_entries(client_id,status,posting_date,memo,origin,
            resolution_id,is_opening_balance,is_year_end,tax_affecting,maker_actor,
            last_human_editor,reversal_of,reversal_reason)
          values(o.client_id,'draft',clara._book_today(),'Correction reversal: '||x.reason,
            'reversal',o.resolution_id,o.is_opening_balance,o.is_year_end,o.tax_affecting,
            c.actor,c.actor,o.id,x.reason) returning id into v_mirror;
        insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,
            credit_cents,description,counterparty_id)
          select v_mirror,line_no,account_code,credit_cents,debit_cents,
            description,counterparty_id
          from clara.journal_lines where entry_id=o.id order by line_no;
      end if;
      perform clara._assert_balanced(v_mirror);
      perform clara._assert_supplier_bill_shape(v_mirror);
      update clara.journal_entries set status='approved',checker_actor=c.actor,
        approved_at=now(),self_approval_attestation=v_solo,updated_at=now()
        where id=v_mirror;
      update clara.journal_entries set reversed_by=v_mirror,reversal_reason=x.reason,
        updated_at=now() where id=o.id;
      -- 0037 (design 4.3, path 4 of four): the hook. Covers the ADOPTED-draft-mirror hole
      -- too -- a mirror drafted by another lane and approved here would otherwise reach the
      -- books with no unwind at all.
      perform clara._subledger_on_approve(v_mirror);
      update clara.filing_correction_items set reversal_id=v_mirror,outcome='reversed',
        adopted_reversal=v_adopted where id=it.id;
    elsif it.action='withdraw_draft' then
      update clara.journal_entries set status='withdrawn',withdrawn_by=c.actor,
        withdrawn_at=now(),withdrawal_reason=x.reason,proposed_counterparty=null,
        match_fingerprint=null,updated_at=now() where id=o.id;
      update clara.filing_correction_items set outcome='withdrawn' where id=it.id;
    else
      update clara.filing_correction_items set outcome='already_reversed' where id=it.id;
    end if;
  end loop;

  update clara.document_filings set retired_at=now(),retired_by=c.actor,
    retirement_reason=x.reason,correction_id=x.id where id=v_from_filing;
  select id into v_to_filing from clara.document_filings where document_id=x.document_id
    and client_id=x.to_client and retired_at is null;
  if v_to_filing is null then
    insert into clara.document_filings(firm_id,document_id,client_id,filed_by,
        resolution_id,basis,correction_id)
      values(c.firm,x.document_id,x.to_client,c.actor,v_resolution,'correction',x.id)
      returning id into v_to_filing;
  end if;
  perform clara._recompute_document_retention(x.document_id);
  v_facts:=clara._enqueue_invoice_facts_core(x.document_id);
  insert into clara.coding_tasks(firm_id,client_id,document_id,filing_id,origin,
      correction_id,opened_by)
    values(c.firm,x.to_client,x.document_id,v_to_filing,'correction',x.id,c.actor)
    returning id into v_coding_task;
  insert into clara.notifications(firm_id,client_id,kind,payload,created_by)
    values(c.firm,x.to_client,'document_recode_required',jsonb_build_object(
      'correction_id',x.id,'document_id',x.document_id,'to_client',x.to_client,
      'coding_task_id',v_coding_task,'work_kind','recode_document','status','pending',
      'carrier','slice6-coding-floor'),c.actor) returning id into v_recode_notification;
  update clara.filing_corrections set status='completed',checker=c.actor,
    attestation=v_solo,approved_at=now(),completed_at=now() where id=x.id;
  perform clara._audit(c.firm,c.actor,null,null,'approve_wrong_client_correction',null,
    jsonb_build_object('correction',x.id,'document',x.document_id,
      'from_filing',v_from_filing,'to_filing',v_to_filing,
      'coding_task',v_coding_task,'plan_hash',p_plan_hash,'op_key',p_op_key));

  for it in select * from clara.filing_correction_items where correction_id=x.id order by entry_id loop
    if it.outcome='reversed' then
      if not it.adopted_reversal then
        perform clara._append_event(c.firm,'entry.drafted',x.from_client,c.actor,null,null,
          it.reversal_id,null,null,'{}'::jsonb);
      end if;
      perform clara._append_event(c.firm,'entry.approved',x.from_client,c.actor,null,null,
        it.reversal_id,null,null,'{}'::jsonb);
      perform clara._append_event(c.firm,'entry.reversed',x.from_client,c.actor,null,null,
        it.entry_id,null,null,'{}'::jsonb);
    end if;
  end loop;
  perform clara._append_event(c.firm,'document.filing_retired',x.from_client,c.actor,null,null,
    null,x.document_id,null,jsonb_build_object('filing_id',v_from_filing,
      'correction_id',x.id));
  perform clara._append_event(c.firm,'document.filed',x.to_client,c.actor,null,null,
    null,x.document_id,v_resolution,jsonb_build_object('filing_id',v_to_filing,
      'correction_id',x.id));
  perform clara._append_event(c.firm,'document.correction_applied',null,c.actor,null,null,
    null,x.document_id,null,jsonb_build_object('correction_id',x.id));
  perform clara._append_event(c.firm,'coding_task.opened',x.to_client,c.actor,null,null,
    null,x.document_id,null,jsonb_build_object('coding_task_id',v_coding_task,
      'filing_id',v_to_filing,'correction_id',x.id));
  perform clara._append_event(c.firm,'notification.recorded',x.to_client,c.actor,null,null,
    null,null,null,jsonb_build_object('notification_id',v_recode_notification,
      'correction_id',x.id,'coding_task_id',v_coding_task));
  if v_facts->>'status'='failed'
     and coalesce((select t38.lane from clara.document_processing_tasks t38
       where t38.id=(v_facts->>'task_id')::uuid),'')
       not in ('statement_facts','statement_parse') then
    perform clara._append_event(c.firm,'document.invoice_facts_failed',null,c.actor,null,null,
      null,x.document_id,null,jsonb_build_object('task_id',v_facts->>'task_id',
        'reason',v_facts->>'reason'));
  end if;
  return clara._finish_op(c.firm,'approve_wrong_client_correction',p_op_key,
    jsonb_build_object('correction_id',x.id,'status','completed',
      'from_filing_id',v_from_filing,'to_filing_id',v_to_filing,
      'coding_task_id',v_coding_task));
end $$;

reset role;

-- =====================================================================================
-- §C  TAIL. Everything above, re-read from the catalog: the door's new ladder, the neighbours it
-- must not have disturbed, its unchanged identity and refusal vocabulary, and -- the claim the
-- ticket's AC2 asks for -- a CATALOGUE-DERIVED CENSUS over EVERY clara body proving no door is
-- left that takes a `clara.clients` row before the client rung.
-- =====================================================================================
do $w914_tail$
declare
  v_sha text; v_owner text; v_secdef bool; v_acl text; v_src text;
  v_rung int; v_row int; v_je int; v_sub int; v_doc int; v_fil int; v_n int; v_msg text;
  v_violators text; v_censused int;
begin
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'), r.rolname, p.prosecdef,
         coalesce(p.proacl::text,'(null)'), p.prosrc
    into v_sha, v_owner, v_secdef, v_acl, v_src
    from pg_proc p join pg_roles r on r.oid = p.proowner
   where p.oid = 'clara.approve_wrong_client_correction(uuid,text,text,text)'::regprocedure;

  -- 1 · THE BODY THIS FILE MEANT TO WRITE, and nothing else about the door moved.
  if v_sha is distinct from '8531862ccbd2caffd5d665d6dfe92f3cd2174f30ff7a9e48c9cdb58763246188' then
    raise exception '#914 tail: the live body is not the one this file transcribed (sha %) -- the §B replacement did not land as written', v_sha
      using errcode='CLR10';
  end if;
  if v_owner is distinct from 'clara_fn_owner' or v_secdef is distinct from true then
    raise exception '#914 tail: the door''s owner or SECURITY DEFINER flag moved (owner=%, secdef=%)', v_owner, v_secdef
      using errcode='CLR10';
  end if;
  if v_acl is distinct from '{clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner}' then
    raise exception '#914 tail: the door''s ACL moved (%) -- a reorder must not change EXECUTE reachability', v_acl
      using errcode='CLR10';
  end if;

  -- 2 · THE NEW LADDER, read off the live body: journal_entries rows -> client rung -> client row,
  -- with the rung taken exactly ONCE, on the correction's SOURCE client, and never on o.client_id.
  v_je   := position('for update of je' in v_src);
  v_rung := position('pg_advisory_xact_lock(203005004' in v_src);
  v_row  := position('from clara.clients cl' in v_src);
  v_sub  := position('clara._subledger_allocated_items_present(' in v_src);
  if v_je = 0 or v_rung = 0 or v_row = 0 or v_sub = 0 then
    raise exception '#914 tail: an anchor is missing (je=%, rung=%, client row=%, subledger probe=%)', v_je, v_rung, v_row, v_sub
      using errcode='CLR10';
  end if;
  if not (v_je < v_rung) then
    raise exception '#914 tail: the client rung (%) no longer sits AFTER the journal_entries row locks (%) -- 0037 SECTION K''s named exception is inverted against the approve core', v_rung, v_je
      using errcode='CLR10';
  end if;
  if not (v_rung < v_row) then
    raise exception '#914 tail: the client rung (%) does not precede the clara.clients row (%) -- this file''s whole purpose', v_rung, v_row
      using errcode='CLR10';
  end if;
  if not (v_rung < v_sub) then
    raise exception '#914 tail: the client rung (%) no longer precedes clara._subledger_allocated_items_present (%) -- 0037 SECTION H.3''s check-then-act window is reopened', v_rung, v_sub
      using errcode='CLR10';
  end if;
  select count(*) into v_n from regexp_matches(v_src, 'pg_advisory_xact_lock\(203005004', 'g');
  if v_n <> 1 then
    raise exception '#914 tail: the client rung is acquired % times (expected exactly 1, taken once for x.from_client)', v_n
      using errcode='CLR10';
  end if;
  if position('pg_advisory_xact_lock(203005004,hashtext(x.from_client::text))' in v_src) = 0 then
    raise exception '#914 tail: the one client rung is not taken on x.from_client'
      using errcode='CLR10';
  end if;
  if position('pg_advisory_xact_lock(203005004,hashtext(o.client_id::text))' in v_src) <> 0 then
    raise exception '#914 tail: the per-item rung on o.client_id is still acquired -- the hoist did not replace it'
      using errcode='CLR10';
  end if;
  select count(*) into v_n from regexp_matches(v_src, 'pg_advisory_xact_lock\(203005002', 'g');
  if v_n <> 1 then
    raise exception '#914 tail: the FIRM rung is acquired % times (expected exactly 1) -- no rung was added or renumbered by this file', v_n
      using errcode='CLR10';
  end if;

  -- 3 · THE SOURCE CLIENT ROW IS STILL HELD WHEN THE SOURCE FILING IS RETIRED. Both statements
  -- are in the same transaction and PostgreSQL holds a row lock to commit, so the source-position
  -- order is the whole claim: the lock is taken before the retirement, and nothing releases it.
  if position('update clara.document_filings set retired_at=now()' in v_src) = 0
     or position('update clara.document_filings set retired_at=now()' in v_src) < v_row then
    raise exception '#914 tail: the source filing is no longer retired under the source client''s row lock (row=%, retirement=%)', v_row, position('update clara.document_filings set retired_at=now()' in v_src)
      using errcode='CLR10';
  end if;

  -- 4 · THE NEIGHBOURS THIS FILE MUST NOT HAVE DISTURBED: 0027's task-#29 order and 0037/0038's
  -- markers, re-read rather than remembered.
  v_doc := position('from clara.documents where id=x.document_id for update' in v_src);
  v_fil := position('from clara.document_filings f where f.document_id=x.document_id' in v_src);
  if v_doc = 0 or v_fil = 0 or v_doc > v_fil then
    raise exception '#914 tail: 0027''s documents-before-document_filings order is broken (documents=%, filings=%)', v_doc, v_fil
      using errcode='CLR10';
  end if;
  select count(*) into v_n from regexp_matches(v_src, 'clara\._subledger_on_approve\(', 'g');
  if v_n <> 1 then
    raise exception '#914 tail: the subledger hook appears % times (expected exactly 1) -- 0037 section H.3''s single call site', v_n
      using errcode='CLR10';
  end if;
  foreach v_msg in array array['clara._bank_live_match_present(',
                               'clara._bank_live_statement_on_document(',
                               'clara._expected_reversal_state_hash(',
                               'clara._book_today()',
                               'adopted_reversal=v_adopted'] loop
    if position(v_msg in v_src) = 0 then
      raise exception '#914 tail: the marker % is gone from the recut body', v_msg using errcode='CLR10';
    end if;
  end loop;

  -- 5 · EVERY REFUSAL OF THE DOOR, UNCHANGED. Fifteen `raise exception` sites in 0125's body,
  -- fifteen here, and each of the fifteen messages still present -- so each appears exactly once.
  select count(*) into v_n from regexp_matches(v_src, 'raise exception', 'g');
  if v_n <> 15 then
    raise exception '#914 tail: the body carries % raise sites (0125 carried 15) -- a refusal was added or lost', v_n
      using errcode='CLR10';
  end if;
  foreach v_msg in array array[
      'op_key is required',
      'correction not in your firm',
      'opening entries are mutable only through the K-family',
      'correction plan/state mismatch',
      'correction requires a distinct checker',
      'solo correction approval requires attestation',
      'correction plan is stale (books version moved)',
      'a live bank statement is bound to this document; void the statement before correcting its filing',
      'source filing is no longer active',
      'filing client not in the supplied firm',
      'correction item state changed',
      'correction touches a closed period',
      'destination client attribution is not authoritative',
      'open items on this entry carry allocations; unallocate them first',
      'a captured entry is matched to a bank statement line; unmatch the bank match first'] loop
    if position('raise exception ''' || v_msg || '''' in v_src) = 0 then
      raise exception '#914 tail: the refusal "%" is gone from the recut body', v_msg using errcode='CLR10';
    end if;
  end loop;

  -- 6 · THE ESTATE CENSUS (AC2). Comments stripped, then for EVERY clara body: the first
  -- `clara.clients` ROW acquisition (a locking select on it, or an UPDATE/DELETE of it) against
  -- the first client-rung acquisition. A body with no client-row acquisition cannot violate the
  -- order; a body with one and no rung never meets the rung at all. What must be empty is the set
  -- that takes the ROW first and the RUNG after.
  with b as (
    select p.proname::text as fn,
           regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') as src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'clara'
  ), m as (
    select fn,
           position('pg_advisory_xact_lock(203005004' in src) as rung_at,
           regexp_instr(src, '(update|delete[[:space:]]+from)[[:space:]]+clara\.clients') as write_at,
           regexp_instr(src, 'clara\.clients[^;]*?for[[:space:]]+(update|share|no[[:space:]]+key[[:space:]]+update|key[[:space:]]+share)') as lock_at
      from b
  ), r as (
    select fn, rung_at,
           least(coalesce(nullif(write_at,0), 2147483647), coalesce(nullif(lock_at,0), 2147483647)) as row_at
      from m
  )
  select count(*) filter (where row_at < 2147483647),
         coalesce(string_agg(fn || ' (row@' || row_at || ' before rung@' || rung_at || ')', ', '
                             order by fn) filter (where row_at < 2147483647 and rung_at > 0 and row_at < rung_at), '')
    into v_censused, v_violators
    from r;
  if v_violators <> '' then
    raise exception '#914 tail: a door still takes a clara.clients ROW before the client rung: %', v_violators
      using errcode='CLR10';
  end if;
  if v_censused < 11 then
    raise exception '#914 tail: the census found only % bodies acquiring a clara.clients row (11 were measured on the #914 rig) -- the detector has stopped detecting, which would make the empty violator set meaningless', v_censused
      using errcode='CLR10';
  end if;

  raise notice '#914 tail: OK -- clara.approve_wrong_client_correction now takes journal_entries rows (@%) -> the client rung 203005004 ONCE on x.from_client (@%) -> the source clara.clients row (@%), with clara._subledger_allocated_items_present still after the rung (@%); 0027''s documents(@%)-before-document_filings(@%) order, the single subledger hook, and all fifteen refusals are unmoved; owner, SECURITY DEFINER flag and ACL unchanged; and a census of % clara bodies that acquire a clara.clients row finds NO door left that takes one before the rung.',
    v_je, v_rung, v_row, v_sub, v_doc, v_fil, v_censused;
end
$w914_tail$;
