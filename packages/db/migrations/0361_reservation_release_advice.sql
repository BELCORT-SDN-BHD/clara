-- 0361_reservation_release_advice — #1078 fix round (riders sweep wave, lane 02): the widened
-- claim census gets ONE map of "which door releases a claim of this domain", and its FOURTH
-- consumer stops lying.
-- =====================================================================================
-- Spec of record: the spec review of `riders/wS-lane02` (finding L02-SPEC-01, major), the
-- standards review of the same branch (STD-1) and the adversarial review (ADV-L02-10), all
-- 2026-09-25. Migration number 0361 assigned by the orchestrator from the sweep wave's overflow
-- block; 0337 is applied and immutable and is not edited here.
--
-- WHAT 0337 DID, AND WHAT IT LEFT. 0337 (#1078) widened `clara._acct_role_reserved` to a THIRD
-- domain: the prepayment-account roster now reserves its enrolled codes the way the fixed-asset
-- and staff-advance registers already did. It then taught three of that census's consumers to say
-- the right thing per domain — the bank belt's machine token (§C), the fixed-asset profile door's
-- release sentence (§D) and the staff-advance enrolment door's re-enrolment advice (§E).
--
-- THE FOURTH CONSUMER WAS NOT TOUCHED. `clara._draft_opening_item_core` — the opening-balance
-- carry-down, which asks the SAME census through `clara._fa_role_claim_conflict` — still reports
-- every non-fixed-asset claim as `coa_account_advance_reserved` and still offers a remedy list
-- that names only `retire_staff_advance_account` and "retire the profile that holds it". Neither
-- releases a prepayment-roster claim. A firm carrying an opening fixed asset down onto a code its
-- own prepayment roster holds is therefore told the wrong register holds it and pointed at a door
-- that cannot let go — which is exactly the class
-- [0042](0042_wave_d_b0_shared_authorities.sql):2110 names (WDB-R2: "a refusal must name a
-- followable remedy, or say honestly that there is none").
--
-- WHY A MAP RATHER THAN A FOURTH COPY OF THE CASE. Three sites each re-derived the same
-- domain→door dispatch inline, and the fourth had simply never been widened. A fifth register
-- would inherit the same default the same way. `clara._reservation_release_advice` answers BY
-- NAME and RAISES on a domain it does not know, so the next domain cannot be silently
-- mis-reported: it fails loudly at the first refusal that meets it, in the file that added it.
--
-- THE SECTIONS:
--   §A  clara._reservation_release_advice   the one map: token, door, and what releasing costs
--   §B  clara._fa_assert_code_unreserved    the bank belt's token comes from the map
--   §C  clara.upsert_fa_account_profile     the profile door's sentence comes from the map
--   §D  clara._draft_opening_item_core      the FOURTH consumer, corrected (L02-SPEC-01)
--   §E  clara._fa_role_claim_conflict       a deterministic order by (ADV-L02-10)
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--   · It does not recut `clara._adv_enrolment_admission`. That body's per-domain text is not a
--     release sentence — it is a RE-ENROLMENT NARRATIVE with an extra axis of its own (a live
--     fixed-asset REGISTER ROW is permanent where an active PROFILE is not, and the two get
--     different advice under the same `fa` domain). Folding four narrative shapes and a
--     permanence flag into the map would make the map the thing that is hard to read. The
--     duplication that is real — one token, one release sentence — is what §A owns.
--   · It changes no wall, admits nothing new and refuses nothing new. Every edit below is what a
--     refusal SAYS. The census, the eligibility wall and every admission decision are untouched,
--     and §TAIL re-measures that.
--   · It reads no row and backfills nothing.
-- =====================================================================================

set local statement_timeout = '20min';  -- PRECAUTIONARY, not load-bearing.

-- =====================================================================================
-- §0 — PRESTATE. Every claim this file makes about what it is editing, measured BEFORE it edits.
-- =====================================================================================
do $c0361_pre$
declare
  v_n int; v_sha text; v_src text; v_i int;
  v_first int := 0; v_redo int := 0; v_modes text := '';
  -- THE BODIES THIS FILE RECUTS, pinned by their sha256(prosrc) MEASURED ON THIS RIG (riders
  -- sweep lane 02 database `clara_l05`, 314 files, max `0338_prepayment_close_standing_instruction`
  -- — this lane's own 0335 to 0338 are live), never copied from an older migration's header. Each
  -- admits exactly TWO pre-images: its measured live sha, or a body already carrying this file's
  -- own `0361` attribution, so a redo (#957) is admitted and real drift still refuses BY NAME.
  --
  --   · `_fa_assert_code_unreserved` and `upsert_fa_account_profile` are 0337 §C and §D.
  --   · `_fa_role_claim_conflict` is 0042 §5.15b's own body, unmoved since.
  v_recut text[][] := array[
    ['clara._fa_assert_code_unreserved(uuid,text)',
     '5cba0262cf2e6f24185a230d9a94bda053ebda77952641478b4eaa8fb66086a1'],
    ['clara.upsert_fa_account_profile(uuid,text,text,text,text)',
     'b00de56b2ade5e8908b532f356d153d4da3bcdf6105913d4eabd281c22bf6ed1'],
    ['clara._fa_role_claim_conflict(uuid,text,text)',
     '3c17cf8d1418719510cd2e3f5e99eefd20327254207155802fc6fda54ffba581']
  ];
  -- …AND THE NEIGHBOURS THIS FILE READS AND DOES NOT EDIT. Both are 0337's own post-image, and
  -- neither is written by any other lane of this wave (the plan's seam lists reserve the plan
  -- family to L1; this family is L2's alone).
  --
  --   · `_acct_role_reserved` is the census whose THIRD domain this whole file is about. If it
  --     gained a FOURTH, §A would have to gain a row for it — and §A raises rather than guessing,
  --     which is the point.
  --   · `_adj_line_eligibility_breach` is the posting wall 0337 §B deliberately keeps blind to the
  --     prepayment domain. Nothing here touches it; it is pinned so that stays visible.
  v_keep text[][] := array[
    ['clara._acct_role_reserved(uuid,text)',
     'dcd352f0ef697b39b675c26e9dbd369756ca026f5f71ec9be832e8de20223c0f'],
    ['clara._adj_line_eligibility_breach(uuid,jsonb)',
     '53137471bc99c7cfd83e30b58d6f5f01ae111195ee028c48a024f79b3f5fa7b5']
  ];
begin
  -- 1 · 0337 IS ON THIS CHAIN. This file corrects 0337's own fourth consumer; applied ahead of it
  --     it would splice a body that does not yet carry the domain it is about.
  select count(*) into v_n from clara.schema_migrations
   where version ~ 'prepayment_account_reservation$';
  if v_n <> 1 then
    raise exception '0361 prestate: 0337_prepayment_account_reservation is not applied (% rows) -- this file corrects its fourth consumer and cannot run ahead of it', v_n
      using errcode='CLR10';
  end if;

  -- 2 · THE CENSUS REALLY CARRIES THE THREE DOMAINS §A MAPS, read off the body rather than
  --     assumed. A fourth would make §A incomplete, and §A's own raise is what would find it.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._acct_role_reserved(uuid,text)'::regprocedure;
  for v_i in 1 .. 3 loop
    if position((array['''fa''', '''staff_advance''', '''prepayment'''])[v_i] in v_src) = 0 then
      raise exception '0361 prestate: clara._acct_role_reserved does not name the domain % -- §A maps exactly three',
        (array['fa', 'staff_advance', 'prepayment'])[v_i] using errcode='CLR10';
    end if;
  end loop;

  -- 3 · THE BODIES THIS FILE RECUTS, each in ONE of its own two admissible pre-images.
  for v_i in 1 .. array_length(v_recut, 1) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex'), p.prosrc into v_sha, v_src
      from pg_proc p where p.oid = v_recut[v_i][1]::regprocedure;
    if v_sha is null then
      raise exception '0361 prestate: % is absent', v_recut[v_i][1] using errcode='CLR10';
    elsif v_sha = v_recut[v_i][2] then
      v_first := v_first + 1; v_modes := v_modes || v_recut[v_i][1] || '=FIRST ';
    elsif position('0361' in v_src) > 0 then
      v_redo := v_redo + 1; v_modes := v_modes || v_recut[v_i][1] || '=REDO ';
    else
      raise exception '0361 prestate: % is neither its pinned pre-image (%) nor this file''s own recut; live sha %',
        v_recut[v_i][1], v_recut[v_i][2], v_sha using errcode='CLR10';
    end if;
  end loop;

  -- 4 · THE NEIGHBOURS ARE EXACTLY WHAT THIS FILE WAS WRITTEN AGAINST.
  for v_i in 1 .. array_length(v_keep, 1) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_keep[v_i][1]::regprocedure;
    if v_sha is distinct from v_keep[v_i][2] then
      raise exception '0361 prestate: % moved (expected %, live %) -- this file reads it and does not edit it; re-measure before applying',
        v_keep[v_i][1], v_keep[v_i][2], coalesce(v_sha, '(absent)') using errcode='CLR10';
    end if;
  end loop;

  -- 5 · AND THE CARRY-DOWN DOOR IS IN ONE OF ITS TWO ADMISSIBLE SHAPES. §D SPLICES it rather than
  --     rewriting it: `clara._draft_opening_item_core` is a 445-line body that has never been
  --     written out whole in any file but 0017, and 0041 §4.5 and 0042 §5.15c both edited it the
  --     same way — `pg_get_functiondef`, a COUNTED replacement, and a refusal on any other count.
  --     That idiom's one failure mode is matching twice or zero times, so §D counts every anchor
  --     before it touches anything.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)'::regprocedure;
  if v_src is null then
    raise exception '0361 prestate: clara._draft_opening_item_core is absent' using errcode='CLR10';
  end if;
  if position('_reservation_release_advice' in v_src) > 0 then
    raise notice '0361 prestate: the carry-down already reads the shared map -- REDO';
    v_redo := v_redo + 1;
  elsif encode(sha256(convert_to(v_src, 'UTF8')), 'hex')
        = '642967d213f75b3d92f3259ee273657c8870e63dd3a4a81663d8a94d421d368f' then
    v_first := v_first + 1;
  else
    raise exception '0361 prestate: clara._draft_opening_item_core is neither its pinned pre-image (642967d2…) nor this file''s own splice; live sha %',
      encode(sha256(convert_to(v_src, 'UTF8')), 'hex') using errcode='CLR10';
  end if;

  raise notice '0361 prestate OK -- % FIRST, % REDO -- %', v_first, v_redo, v_modes;
end $c0361_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — clara._reservation_release_advice — THE ONE MAP.
--
-- TWO FACTS PER DOMAIN, and they are the only two that were being re-derived:
--   · `reason_token`      — what a MACHINE reading a refusal is told holds the code.
--   · `release_sentence`  — what a PERSON is told to do about it, including what doing it costs.
--
-- IT RAISES ON A DOMAIN IT DOES NOT KNOW. That is the whole reason it exists rather than a
-- `case … else <the advance answer>`: the `else` is how the carry-down door came to report a
-- prepayment claim as an advance one for a whole ticket without anybody noticing. A fifth
-- register meets this raise at its first refusal instead.
--
-- THE THREE SENTENCES ARE 0337's AND 0041's OWN WORDS, carried here character for character so
-- that no refusal this file touches changes what it says beyond the correction it is making.
-- The prepayment sentence states what retirement does NOT do (#940's owner decision 5: it closes
-- the account to new schedules and leaves a running one posting to term end), because a remedy
-- whose cost is hidden is the half of WDB-R2 that is easy to miss.
-- =====================================================================================
create or replace function clara._reservation_release_advice(p_domain text)
  returns table(reason_token text, release_sentence text)
  language plpgsql stable security definer set search_path = clara, pg_temp as $c0361_a$
begin
  if p_domain = 'prepayment' then
    return query select 'coa_account_prepayment_reserved'::text,
      'retire that prepayment-account enrolment first (retire_prepayment_account, which closes the account to new schedules and leaves any running one posting to term end)'::text;
  elsif p_domain = 'staff_advance' then
    return query select 'coa_account_advance_reserved'::text,
      'retire that enrolment first (retire_staff_advance_account, which needs every advance on it settled)'::text;
  elsif p_domain = 'fa' then
    return query select 'coa_account_fa_reserved'::text,
      'release the fixed-asset claim first -- an ACTIVE profile releases its codes on retire_fa_account_profile, and a register row holds the three codes it was born with until that row is disposed, superseded or its acquisition is reversed'::text;
  else
    -- FAIL CLOSED, BY NAME. Not `else <the advance answer>`: a domain this map does not know is a
    -- register whose release door nobody has stated, and answering for it would be an invention.
    raise exception 'no release advice is recorded for reservation domain % -- add it to clara._reservation_release_advice before a door can refuse in its name', coalesce(p_domain, '(null)')
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'reservation_domain_unmapped',
          'reservation_domain', p_domain)::text;
  end if;
end $c0361_a$;
revoke all on function clara._reservation_release_advice(text) from public;

comment on function clara._reservation_release_advice(text) is
  '#1078 fix round (0361): the ONE map from a clara._acct_role_reserved domain to the machine reason token a refusal carries and the sentence that tells a person which door releases the claim and what releasing it costs. Raises CLR10 reservation_domain_unmapped on a domain it does not know, rather than defaulting to the staff-advance answer the way three hand-written dispatches did. An UNGRANTED internal: reachable only from a SECURITY DEFINER body already running as clara_fn_owner.';


-- =====================================================================================
-- §B — clara._fa_assert_code_unreserved — THE BANK BELT'S TOKEN COMES FROM THE MAP.
--      0337 §C's body VERBATIM except the `case` that chose the reason token.
-- =====================================================================================
create or replace function clara._fa_assert_code_unreserved(p_client uuid, p_code text) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $c0361_b$
declare v_role text; v_owner text; v_domain text; v_reserved_role text;
begin
  if p_client is null or p_code is null then return; end if;
  perform clara._fa_lock_roles(p_client);
  select rr.fa_role, rr.owner_asset_code into v_role, v_owner
    from clara._fa_reserved_roles(p_client) rr where rr.account_code = p_code limit 1;
  if v_role is not null then
    raise exception 'chart account % is reserved by the fixed-asset register (% role, cost account %) and cannot back a bank account; pick a different account, or release the claim first -- an ACTIVE profile releases its codes on retire_fa_account_profile, and a register row holds the three codes it was born with until that row is disposed, superseded or its acquisition is reversed', p_code, v_role, v_owner
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'coa_account_fa_reserved', 'account_code', p_code,
          'fa_role', v_role, 'fa_profile_asset_account', v_owner)::text;
  end if;
  -- 0042 (Wave D-b, design SS2.1 / SS3.1): THE SHARED RESERVATION UNION. The FA arm above is
  -- untouched -- same message, same token, same cost-account pointer -- and this arm covers
  -- what D-b adds to the predicate: ACTIVE staff-advance enrolments and the register rows
  -- born on them. Read through the ONE reservation reader rather than re-listing its members
  -- here, so this belt, the enrolment doors and the adjustment-template line-eligibility
  -- check can never come to disagree about what "reserved" means. A bank account bound to an
  -- enrolled advance code would move the advance register's numbers through a door the
  -- advance machine never sees; the leaf acquired at the top of this body is what makes the
  -- read a decision rather than a snapshot.
  select rr.domain, rr.role into v_domain, v_reserved_role
    from clara._acct_role_reserved(p_client, p_code) rr limit 1;
  if v_domain is not null then
    raise exception 'chart account % is reserved by the % register (% role) and cannot back a bank account; pick a different account', p_code, v_domain, v_reserved_role
      using errcode = 'CLR10',
        -- #1078 [0337] THE TOKEN NAMES THE REGISTER THAT ACTUALLY HOLDS THE CODE. The message
        -- above is already domain-driven ("reserved by the % register"), but the machine reason
        -- said `advance` whatever the domain was, which was survivable while `staff_advance` was
        -- the only domain this arm could ever see. It is not the only one any more. The advance
        -- token is UNCHANGED, byte for byte, so nothing that reads it today reads anything new.
        -- #1078 fix round [0361] ONE MAP, NOT A CASE PER SITE. The dispatch this line used to
        -- carry was `prepayment -> its token, ELSE the advance token`, which is the shape that
        -- let a THIRD domain inherit the advance token by default -- exactly the defect the
        -- carry-down door was found shipping. `clara._reservation_release_advice` answers by
        -- NAME and RAISES on a domain it does not know, so a fourth register cannot be quietly
        -- mis-reported by any of its readers.
        detail = jsonb_build_object('reason',
            (select a.reason_token from clara._reservation_release_advice(v_domain) a),
          'account_code', p_code, 'reservation_domain', v_domain,
          'reservation_role', v_reserved_role)::text;
  end if;
end $c0361_b$;
revoke all on function clara._fa_assert_code_unreserved(uuid, text) from public;

-- =====================================================================================
-- §C — clara.upsert_fa_account_profile — THE PROFILE DOOR'S SENTENCE COMES FROM THE MAP.
--      0337 §D's body VERBATIM except the `case` that chose the release sentence.
-- =====================================================================================
create or replace function clara.upsert_fa_account_profile(p_client uuid, p_asset_account text,
    p_accum_account text, p_depr_expense_account text, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $c0361_c$
declare c record; v_dedupe jsonb; v_firm uuid; v_existing record; v_id uuid; v_changed boolean;
        v_clash text; v_had_live boolean; d record;
        v_res_domain text; v_res_role text; v_res_owner text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'upsert_fa_account_profile', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'asset', p_asset_account,
      'accum', p_accum_account, 'expense', p_depr_expense_account)));
  if v_dedupe is not null then return v_dedupe; end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  if nullif(btrim(p_asset_account), '') is null then
    raise exception 'an FA account profile needs a cost account'
      using errcode = 'CLR37', detail = '{"reason":"fa_profile_invalid","axis":"asset_account"}';
  end if;
  -- THE PAIR IS A PAIR. Half a profile is a register that can never depreciate and never say
  -- why -- so it refuses here, by name, rather than surfacing as silence three months later.
  if (p_accum_account is null) <> (p_depr_expense_account is null) then
    raise exception 'state BOTH the accumulated-depreciation and the depreciation-expense account, or NEITHER (neither = a non-depreciable profile, e.g. land)'
      using errcode = 'CLR37', detail = '{"reason":"fa_profile_invalid","axis":"pair"}';
  end if;
  -- TYPING. The cost and accumulated codes are asset-typed, the expense code expense-typed,
  -- and none of the three may be a control account: a control-class leg in this family would
  -- put a second receivable/payable movement on an entry the subledger classifier also reads.
  if not exists (select 1 from clara.coa_accounts a
                 where a.client_id = p_client and a.account_code = p_asset_account
                   and a.is_active and a.account_type = 'asset' and a.account_class is null) then
    raise exception 'the fixed-asset cost account must be an active, asset-typed, non-control account on this chart'
      using errcode = 'CLR37', detail = '{"reason":"fa_profile_invalid","axis":"asset_account"}';
  end if;
  if p_accum_account is not null then
    if not exists (select 1 from clara.coa_accounts a
                   where a.client_id = p_client and a.account_code = p_accum_account
                     and a.is_active and a.account_type = 'asset' and a.account_class is null) then
      raise exception 'the accumulated-depreciation account must be an active, asset-typed, non-control account on this chart'
        using errcode = 'CLR37', detail = '{"reason":"fa_profile_invalid","axis":"accum_account"}';
    end if;
    if not exists (select 1 from clara.coa_accounts a
                   where a.client_id = p_client and a.account_code = p_depr_expense_account
                     and a.is_active and a.account_type = 'expense' and a.account_class is null) then
      raise exception 'the depreciation-expense account must be an active, expense-typed, non-control account on this chart'
        using errcode = 'CLR37', detail = '{"reason":"fa_profile_invalid","axis":"expense_account"}';
    end if;
  end if;
  if p_asset_account = coalesce(p_accum_account, '')
     or p_asset_account = coalesce(p_depr_expense_account, '')
     or (p_accum_account is not null and p_accum_account = p_depr_expense_account) then
    raise exception 'the three enrolled accounts must be pairwise distinct'
      using errcode = 'CLR37', detail = '{"reason":"fa_profile_invalid","axis":"distinct"}';
  end if;

  -- ---------------------------------------------------------------------------------
  -- CLIENT-WIDE ROLE TOPOLOGY [round-3 fold F5c]. Pairwise distinctness WITHIN one profile is
  -- not enough: profiles (cost=A, accum=B) and (cost=B, accum=C) were both lawful, and then a
  -- debit to B (an ordinary disposal clearing accumulated depreciation) soft-birthed a PHANTOM
  -- register row on the second profile -- probed, with a fabricated cost -- while the tie
  -- compared the first profile's register accumulation against B's whole GL balance. Sharing
  -- ONE accumulated account across two profiles makes both per-pair ties arithmetically
  -- impossible. The three roles are therefore disjoint across a client's ACTIVE profiles.
  -- ---------------------------------------------------------------------------------
  --
  -- ...AND THE FACTS ARE READ WHEREVER THEY LIVE [round-3.5 fold G4]. The checks below used to
  -- read fa_account_profiles WHERE active, which is only half the world: a register row bakes
  -- its three codes at birth and keeps posting to them after the profile that named them is
  -- version-forwarded or retired. Probed consequence: version-forward the accumulated code,
  -- re-enrol the FREED code as another profile's COST account (admitted!), then dispose the old
  -- asset -- its accumulated-debit leg soft-birthed a phantom register row with a fabricated
  -- cost. clara._fa_reserved_roles is the ONE predicate over both worlds; the leaf rung above
  -- it makes the read-then-write honest against a concurrent bank binding of the same code.
  perform clara._fa_lock_roles(p_client);
  if p_accum_account is not null then
    select rr.owner_asset_code into v_clash from clara._fa_reserved_roles(p_client) rr
      where rr.account_code = p_accum_account and rr.fa_role = 'accum'
        and rr.owner_asset_code <> p_asset_account
      limit 1;
    if v_clash is not null then
      raise exception 'another enrolled profile or register row for this client already uses % as its accumulated-depreciation account (cost account %); the register ties per (cost, accumulated) pair and cannot share one accumulated account', p_accum_account, v_clash
        using errcode = 'CLR37',
          detail = jsonb_build_object('reason', 'fa_profile_invalid', 'axis', 'accum_shared',
            'account_code', p_accum_account, 'other_profile_asset_account', v_clash)::text;
    end if;
  end if;
  for d in select * from (values ('cost', p_asset_account), ('accum', p_accum_account),
                                 ('expense', p_depr_expense_account)) as t(want_role, code) loop
    if d.code is null then continue; end if;
    select rr.owner_asset_code || ' (' || rr.fa_role || ')' into v_clash
      from clara._fa_reserved_roles(p_client) rr
      where rr.account_code = d.code and rr.fa_role <> d.want_role
      limit 1;
    if v_clash is not null then
      raise exception 'account % is already spoken for in a DIFFERENT fixed-asset role for this client (%); cost, accumulated-depreciation and depreciation-expense roles must not overlap -- and a role ANY register row of this client carries counts, whatever the profile now says', d.code, v_clash
        using errcode = 'CLR37',
          detail = jsonb_build_object('reason', 'fa_profile_invalid', 'axis', 'role_overlap',
            'account_code', d.code, 'other_profile_asset_account', v_clash)::text;
    end if;
  end loop;
  -- RESERVED ACCOUNTS [round-3 fold F5c / INT-M3]. A bank account passes every typing test
  -- above (asset-typed, no account_class), and one mis-typed code in the enrolment form would
  -- (i) birth a bogus register row on every receipt into that bank and (ii) refuse EVERY
  -- payment out of it at approval, with a remedy ("reverse the acquisition and re-book it")
  -- that is meaningless for a bank movement. The FA profile is the one enrolment act in this
  -- wave with unbounded blast radius; it gets the same shape of guard as the control-class one.
  select ba.coa_account_code into v_clash from clara.bank_accounts ba
    where ba.client_id = p_client
      and ba.coa_account_code in (p_asset_account, coalesce(p_accum_account, ''),
                                  coalesce(p_depr_expense_account, ''))
    limit 1;
  if v_clash is not null then
    raise exception 'account % is a registered bank account for this client and cannot be enrolled in the fixed-asset register', v_clash
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_profile_invalid', 'axis', 'reserved_account',
          'account_code', v_clash)::text;
  end if;
  -- 0042 (owner ruling 2026-08-03, WDB-R3): THE SHARED RESERVATION UNION, CONSULTED FROM THIS
  -- SIDE TOO. clara.enrol_staff_advance_account has always read the full union and refused a
  -- code the fixed-asset family owns; this door read only the FA-side reader, so the same
  -- collision approached from the other direction was ADMITTED and both registers ended up
  -- believing they owned one account. The FA-granular arms above stay first and unchanged --
  -- they can name the offending sister profile, which a cross-domain read cannot -- and this
  -- arm asks the SHARED DISCRIMINATOR (0042 S5.15b) rather than restating its rule, so it
  -- fires on everything those arms structurally cannot see and cannot drift from them.
  -- The leaf taken above covers this read as well, so a concurrent enrolment of the same code
  -- is serialised rather than raced.
  select q.code, cf.res_domain, cf.res_role, cf.res_owner
    into v_clash, v_res_domain, v_res_role, v_res_owner
    from (values ('cost', p_asset_account), ('accum', p_accum_account),
                 ('expense', p_depr_expense_account)) as q(want_role, code)
    cross join lateral clara._fa_role_claim_conflict(p_client, q.code, q.want_role) cf
    where q.code is not null
    limit 1;
  if v_res_domain is not null then
    -- #1078 [0337] THE RELEASE DOOR IS PER DOMAIN. This sentence named retire_staff_advance_account
    -- whatever register held the code, which was true while `staff_advance` was the only domain
    -- this arm could see. The prepayment roster is a third, and a refusal that names a door which
    -- does not release the claim is the dead end WDB-R2 ruled out on 2026-08-03. The advance
    -- branch's words are UNCHANGED, character for character.
    --
    -- #1078 fix round [0361] AND THE SENTENCE NOW COMES FROM THE ONE MAP. 0337 wrote this
    -- dispatch inline here, a second one for the machine token in `_fa_assert_code_unreserved`,
    -- and the carry-down door was found still carrying a third that had never been widened at
    -- all. `clara._reservation_release_advice` is the single answer to "which door releases a
    -- claim of this domain, and what does releasing it cost", and it RAISES on a domain it does
    -- not know rather than defaulting to one.
    raise exception 'account % is already reserved by the % register (% role, owner %) for this client and cannot be enrolled in the fixed-asset register; %, or enrol this profile on a different account', v_clash, v_res_domain, v_res_role, coalesce(v_res_owner, '(unnamed)'),
      (select a.release_sentence from clara._reservation_release_advice(v_res_domain) a)
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_profile_invalid', 'axis', 'role_reserved',
          'account_code', v_clash, 'reserved_domain', v_res_domain,
          'reserved_role', v_res_role, 'reserved_owner', v_res_owner)::text;
  end if;

  -- ---------------------------------------------------------------------------------
  -- VERSION-FORWARD, NEVER MUTATE [round-3 fold F5b]. An enrolment interval is a historical
  -- fact the belt reads at approved_at; re-pointing an enrolled pair in place would rewrite
  -- history (and, probed, immediately created old/new pairs measuring against the same full
  -- cost-account GL). A real change therefore RETIRES the live row and inserts a fresh one; an
  -- unchanged re-upsert is idempotent and must not move the belt's horizon under live history.
  -- ---------------------------------------------------------------------------------
  select * into v_existing from clara.fa_account_profiles
    where client_id = p_client and asset_account_code = p_asset_account and active
    limit 1 for update;
  v_had_live := found;
  v_changed := (not v_had_live)
            or v_existing.accum_depr_account_code is distinct from p_accum_account
            or v_existing.depr_expense_account_code is distinct from p_depr_expense_account;
  if not v_changed then
    v_id := v_existing.id;
  else
    if v_had_live then
      update clara.fa_account_profiles
        set active = false, retired_by = c.actor, retired_at = now()
        where id = v_existing.id;
    end if;
    insert into clara.fa_account_profiles(firm_id, client_id, asset_account_code,
        accum_depr_account_code, depr_expense_account_code, active, enrolled_at, created_by)
      values (c.firm, p_client, p_asset_account, p_accum_account, p_depr_expense_account,
        true, now(), c.actor)
      returning id into v_id;
  end if;
  perform clara._audit(c.firm, c.actor, null, null, 'upsert_fa_account_profile', null,
    jsonb_build_object('client', p_client, 'asset_account', p_asset_account,
      'accum_account', p_accum_account, 'expense_account', p_depr_expense_account,
      'op_key', p_op_key));
  return clara._finish_op(c.firm, 'upsert_fa_account_profile', p_op_key,
    jsonb_build_object('profile_id', v_id, 'client_id', p_client,
      'asset_account_code', p_asset_account,
      'depreciable', p_accum_account is not null, 'active', true));
end $c0361_c$;
revoke all on function clara.upsert_fa_account_profile(uuid, text, text, text, text) from public;
grant execute on function clara.upsert_fa_account_profile(uuid, text, text, text, text)
  to clara_authenticated;

-- =====================================================================================
-- §D — clara._draft_opening_item_core — THE FOURTH CONSUMER, CORRECTED (L02-SPEC-01).
--
-- A GUARDED SPLICE, and the idiom is this body's own. `clara._draft_opening_item_core` is a
-- 445-line body written out whole only in [0017](0017_wave_b.sql); every later correction to it
-- — 0041 §4.5's four-part carry-down recut and 0042 §5.15c's reservation arm — was made by
-- reading `pg_get_functiondef`, COUNTING an anchor, replacing it and refusing on any other count.
-- Re-typing 445 lines to change one sentence and one token would put 444 lines of unrelated text
-- under this file's signature and make every future reader diff them.
--
-- THE SPLICE'S ONE FAILURE MODE is matching twice or matching zero times, so both anchors are
-- counted before anything is written and the whole `do` block raises on any other count.
--
-- WHAT CHANGES, AND IT IS ONLY WHAT THE REFUSAL SAYS:
--   · `detail.reason` stops being the literal `coa_account_advance_reserved` and becomes the map's
--     answer for the domain that actually holds the code. A surface branching on the advance token
--     still sees it for a staff-advance claim, byte for byte.
--   · The remedy clause stops listing two doors that may both be wrong and becomes the map's own
--     sentence for that domain — for a prepayment claim, `retire_prepayment_account`, with what
--     retiring it does and does not do.
-- Nothing else moves: the same errcode, the same five interpolated values, the same detail keys in
-- the same order, and the same decision about whether to refuse at all.
-- =====================================================================================
do $c0361_d$
declare
  v_sig text := 'clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0361 §D: clara._draft_opening_item_core is GONE' using errcode='CLR10';
  end if;
  if position('_reservation_release_advice' in v_def) <> 0 then
    raise notice '0361 §D: the carry-down already reads the shared map -- REDO, nothing to splice';
    return;
  end if;

  -- (1) THE REMEDY CLAUSE. The two-door list becomes one `%` fed by the map.
  v_frm := $f$ Seed this asset on a different account, or release the existing claim first -- a staff-advance enrolment is released by retire_staff_advance_account (which needs every advance on it settled); a fixed-asset claim is released by retiring the profile that holds it, and a register row holds its codes until it is disposed, superseded or its acquisition is reversed', v_res_code, v_res_want, v_res_domain, v_res_role, coalesce(v_res_owner, '(unnamed)')$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0361 §D (1): the carry-down''s reservation remedy clause appears % time(s) (expected exactly 1) -- the body drifted', v_cnt
      using errcode='CLR10';
  end if;
  v_to := $t$ Seed this asset on a different account, or release the existing claim first -- %', v_res_code, v_res_want, v_res_domain, v_res_role, coalesce(v_res_owner, '(unnamed)'), (select a.release_sentence from clara._reservation_release_advice(v_res_domain) a)$t$;
  v_def := replace(v_def, v_frm, v_to);

  -- (2) THE MACHINE TOKEN. It said `advance` whatever register held the code.
  v_frm := $f$          detail = jsonb_build_object('reason', 'coa_account_advance_reserved',
            'account_code', v_res_code, 'claim_role', v_res_want,$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0361 §D (2): the carry-down''s reservation reason token appears % time(s) (expected exactly 1) -- the body drifted', v_cnt
      using errcode='CLR10';
  end if;
  v_to := $t$          detail = jsonb_build_object('reason',
              (select a.reason_token from clara._reservation_release_advice(v_res_domain) a),
            'account_code', v_res_code, 'claim_role', v_res_want,$t$;
  v_def := replace(v_def, v_frm, v_to);

  execute v_def;
  raise notice '0361 §D: the opening-balance carry-down now names the register that holds the code and a door that can release it';
end $c0361_d$;

-- =====================================================================================
-- §E — clara._fa_role_claim_conflict — A DETERMINISTIC ORDER BY (ADV-L02-10).
--
-- 0042 §5.15b's body VERBATIM except one clause. It reads the shared census with `limit 1` and no
-- ORDER BY, and every caller above branches on the single domain it returns. While the census
-- could only ever return `fa` and `staff_advance` rows for one code, an arbitrary choice was
-- harmless; with a third domain, and with three refusals now naming a per-domain release door, an
-- arbitrary choice is an arbitrary REMEDY. A code carrying two live claims would tell one caller
-- to retire an enrolment and the next, on the same state, to retire a profile.
--
-- IT IS ORDERED, NOT DE-DUPLICATED. Two claims on one code is a state the estate refuses to
-- CREATE going forward; wherever one already exists the door must answer the same way twice
-- running, which is what an order by buys. Alphabetical on (domain, role) is deliberate: there is
-- no ranking between registers to encode, and inventing one would be a policy nobody ruled.
-- =====================================================================================
create or replace function clara._fa_role_claim_conflict(p_client uuid, p_code text, p_want_role text)
  returns table(res_domain text, res_role text, res_owner text)
  language plpgsql stable security definer
  set search_path = clara, pg_temp as $c0361_e$
begin
  -- FAIL CLOSED ON AN UNKNOWN ROLE. The OUT names are res_* rather than domain/role/owner_ref
  -- so no plpgsql name resolution can shadow the union's own columns below.
  if p_want_role is null or p_want_role not in ('cost', 'accum', 'expense') then
    raise exception 'a fixed-asset role claim must name cost, accum or expense; got % -- classify the role in clara._fa_role_claim_conflict before any door can claim in it', coalesce(p_want_role, '(null)')
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_role_unclassified', 'role', p_want_role)::text;
  end if;
  -- THE RULE. `is distinct from` rather than `<>` so a null on either side is a CONFLICT
  -- rather than an unknown that filters the row away -- the same fail-closed direction.
  --
  -- #1078 fix round [0361]: …AND THE CHOICE IS DETERMINISTIC. `limit 1` with no order by let the
  -- census's physical order decide WHICH claim a refusal names, which decided which release door
  -- it named once 0337 made the sentence per-domain. Ordered on (domain, role), which is the same
  -- order `reservedRolesFor` has always read the census in.
  return query
    select rr.domain, rr.role, rr.owner_ref
      from clara._acct_role_reserved(p_client, p_code) rr
     where p_code is not null
       and (rr.domain is distinct from 'fa' or rr.role is distinct from p_want_role)
     order by rr.domain, rr.role
     limit 1;
end $c0361_e$;
revoke all on function clara._fa_role_claim_conflict(uuid, text, text) from public;

reset role;

-- =====================================================================================
-- §TAIL — what must be true AFTER this file, read off the LIVE catalog rather than off this
-- file's own statements.
-- =====================================================================================
do $c0361_tail$
declare v_n int; v_src text; v_token text; v_sentence text; v_detail text;
begin
  -- 1 · THE MAP EXISTS, IS UNGRANTED, AND ANSWERS ALL THREE DOMAINS.
  if to_regprocedure('clara._reservation_release_advice(text)') is null then
    raise exception '0361 tail: the map is absent' using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_proc p
   where p.oid = 'clara._reservation_release_advice(text)'::regprocedure
     and p.prosecdef and p.provolatile = 's'
     and p.proowner::regrole::text = 'clara_fn_owner'
     -- UNGRANTED, in this family's own spelling: `revoke all … from public` leaves the owner's
     -- own implicit EXECUTE materialised, exactly as clara._fa_assert_code_unreserved carries it.
     and p.proacl::text = '{clara_fn_owner=X/clara_fn_owner}';
  if v_n <> 1 then
    raise exception '0361 tail: the map is not an ungranted STABLE SECURITY DEFINER body owned by clara_fn_owner'
      using errcode='CLR10';
  end if;
  for v_n in 1 .. 3 loop
    select a.reason_token, a.release_sentence into v_token, v_sentence
      from clara._reservation_release_advice(
        (array['fa', 'staff_advance', 'prepayment'])[v_n]) a;
    if v_token is null or v_sentence is null then
      raise exception '0361 tail: the map answers nothing for domain %',
        (array['fa', 'staff_advance', 'prepayment'])[v_n] using errcode='CLR10';
    end if;
  end loop;

  -- 2 · AND IT REFUSES A DOMAIN IT DOES NOT KNOW, by name. Driven, not commented: an `else` that
  --     guessed is the defect this whole file exists to close.
  v_detail := null;
  begin
    perform 1 from clara._reservation_release_advice('a_register_nobody_built');
  exception when sqlstate 'CLR10' then
    get stacked diagnostics v_detail = pg_exception_detail;
  end;
  if v_detail is null or position('reservation_domain_unmapped' in v_detail) = 0 then
    raise exception '0361 tail: the map did not refuse an unmapped domain BY NAME (detail %) -- an else that guessed is the defect this file closes', coalesce(v_detail, '(no refusal at all)')
      using errcode='CLR10';
  end if;

  -- 3 · THE THREE CONSUMERS READ THE MAP, and the fourth is the one this file is about.
  for v_n in 1 .. 3 loop
    select p.prosrc into v_src from pg_proc p
     where p.oid = (array[
       'clara._fa_assert_code_unreserved(uuid,text)',
       'clara.upsert_fa_account_profile(uuid,text,text,text,text)',
       'clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)'
     ])[v_n]::regprocedure;
    if position('_reservation_release_advice' in v_src) = 0 then
      raise exception '0361 tail: % does not read the shared map',
        (array['_fa_assert_code_unreserved', 'upsert_fa_account_profile',
               '_draft_opening_item_core'])[v_n] using errcode='CLR10';
    end if;
  end loop;

  -- 4 · AND NONE OF THEM STILL CARRIES ITS OWN HARD-CODED DEFAULT. This is the assertion that
  --     would have caught L02-SPEC-01 the day 0337 landed.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'
     and p.proname in ('_fa_assert_code_unreserved', 'upsert_fa_account_profile',
                       '_draft_opening_item_core')
     and position('''coa_account_advance_reserved''' in p.prosrc) > 0;
  if v_n <> 0 then
    raise exception '0361 tail: % of the three consumers still hard-codes the staff-advance reason token', v_n
      using errcode='CLR10';
  end if;

  -- 5 · THE CARRY-DOWN'S REFUSAL NO LONGER NAMES A DOOR THAT CANNOT RELEASE THE CLAIM. The old
  --     two-door list is gone; the per-domain sentence replaces it.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)'::regprocedure;
  if position('a staff-advance enrolment is released by retire_staff_advance_account' in v_src) <> 0 then
    raise exception '0361 tail: the carry-down still lists the two-door remedy that cannot release a prepayment claim'
      using errcode='CLR10';
  end if;

  -- 6 · THE DISCRIMINATOR IS DETERMINISTIC, AND STILL LOCK-FREE AND STABLE (0042 §5.15b's own
  --     two assertions, re-made here because this file recut the body they were made about).
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._fa_role_claim_conflict(uuid,text,text)'::regprocedure;
  if position('order by rr.domain, rr.role' in v_src) = 0 then
    raise exception '0361 tail: clara._fa_role_claim_conflict chooses its claim without an order by'
      using errcode='CLR10';
  end if;
  if position('pg_advisory' in v_src) <> 0 then
    raise exception '0361 tail: the discriminator acquires an advisory lock -- it must stay a lock-free stable reader'
      using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_proc p
   where p.oid = 'clara._fa_role_claim_conflict(uuid,text,text)'::regprocedure
     and p.provolatile = 's' and p.proowner::regrole::text = 'clara_fn_owner';
  if v_n <> 1 then
    raise exception '0361 tail: the discriminator is not a STABLE clara_fn_owner body' using errcode='CLR10';
  end if;

  -- 7 · THE POSTING WALL IS STILL BLIND TO THE PREPAYMENT DOMAIN (0337 §B's decision), and this
  --     file did not touch it. A refusal's WORDS are all that moved here.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._adj_line_eligibility_breach(uuid,jsonb)'::regprocedure;
  if position('is distinct from ''prepayment''' in v_src) = 0 then
    raise exception '0361 tail: the shared posting wall no longer filters the prepayment domain -- 0337 §B''s decision moved'
      using errcode='CLR10';
  end if;

  raise notice '0361 tail OK -- one map, three consumers reading it, the carry-down corrected, and the claim discriminator deterministic';
end $c0361_tail$;
