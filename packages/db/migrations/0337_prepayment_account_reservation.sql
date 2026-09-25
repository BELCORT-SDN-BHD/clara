-- 0337_prepayment_account_reservation — #1078 (riders sweep wave, lane 02): THE PREPAYMENT-ACCOUNT
-- ROSTER RESERVES ITS ENROLLED CODES, THE WAY ITS FIXED-ASSET AND STAFF-ADVANCE SIBLINGS ALREADY DO.
-- =====================================================================================
-- Spec of record: issue #1078's body (an owner question, filed from #940's own follow-ups) and the
-- OWNER RULING recorded on it on 2026-09-24, which is the contract:
--
--   "`account_inactive` is a known, harmless dead axis for chart accounts: no deactivation door is
--    built. The prepayment roster DOES reserve its enrolled accounts, the way its fixed-asset and
--    staff-advance siblings already do: that half joins the sweep wave's lane L2 as a rider with
--    its own migration."
--
-- ONLY THE SECOND HALF IS BUILT HERE. Nothing in this file deactivates a chart account, and
-- `account_inactive` stays exactly as unreachable as it was.
--
-- THE DEFECT. `clara.enrol_prepayment_account` (0306 §B, recut by 0308 for the second purpose and
-- by 0315 §H for its race handler) writes a roster row and reserves NOTHING.
-- `clara._acct_role_reserved` (0043:756, the shared reservation census) unions the fixed-asset
-- family and the staff-advance register and has never known the prepayment roster exists. So a
-- code enrolled as a prepayment account this morning can be:
--
--   · bound as a REGISTERED BANK ACCOUNT this afternoon (`clara.add_bank_account` →
--     `t_bank_accounts_fa_reserved` → `clara._fa_assert_code_unreserved`),
--   · enrolled into the FIXED-ASSET register (`clara.upsert_fa_account_profile` →
--     `clara._fa_role_claim_conflict`), including through the opening-balance carry-down
--     (`clara._draft_opening_item_core`),
--   · enrolled as a STAFF-ADVANCE account (`clara.enrol_staff_advance_account` →
--     `clara._adv_enrolment_admission`),
--
-- and every one of those was ADMITTED. The collision then surfaced days later, at the schedule
-- door, as a `prepayment_source_unfit` refusal with the shared wall's `bank_account` axis — which
-- is the ticket's own sentence: "nothing prevents the double-enrolment from happening in the first
-- place".
--
-- MEASURED, not inferred, on this lane's rig before a line of this file was written: with 0336 the
-- head of the chain, enrolling `19000101` as a prepayment account and then calling
-- `clara.add_bank_account` on the same code SUCCEEDED, and `clara._acct_role_reserved` answered
-- with no rows for an enrolled code. The cells are `p1078.claim.bank` and `p1078.reserve.roster`
-- in tests/prepayment-account-reservation.test.mjs.
--
-- THE FIX, IN ONE SENTENCE: the shared census gains a third domain, and the four bodies that read
-- it are brought up to three domains — the one that must NOT see the new domain is told so, and
-- the three that must are given the release door that actually releases it.
--
--   §A  clara._acct_role_reserved            + the prepayment-roster arm (LIVE enrolments only)
--   §B  clara._adj_line_eligibility_breach   the posting wall skips the new domain; answers unmoved
--   §C  clara._fa_assert_code_unreserved     the bank belt's reason token names the right register
--   §D  clara.upsert_fa_account_profile      its remedy names retire_prepayment_account
--   §E  clara._adv_enrolment_admission       a third remedy branch, with its own advice
--   §F  clara._draft_opening_item_core       the release list names the third register too
--
-- WHY §B IS NOT A SOFTENING, and why it is the load-bearing half of this file. The fixed-asset and
-- staff-advance reservations mean "a register machine owns this code; an ad-hoc line must not touch
-- it". A prepayment-roster enrolment means the OPPOSITE: this account IS the prepaid asset (or the
-- contract liability) the amortisation lane exists to post against, and that lane asks the shared
-- wall about that very code — `clara._prepayment_schedule_core` and
-- `clara._revenue_recognition_core` on the source leg, both correction doors, both attention reads,
-- and `clara.enrol_prepayment_account` on the code being enrolled. Leaving the wall unfiltered was
-- measured on this rig: the schedule door refuses its own enrolled prepaid leg, the attention bands
-- drop every candidate they exist to offer, and a bookkeeper restating an enrolment's reason is
-- refused by their own live enrolment. Because the wall could not see the roster before 0337,
-- filtering the domain out is precisely what makes every answer the wall gives IDENTICAL to the
-- answer it gave before — which `p1078.wall.unmoved` measures at the wall AND at the doors.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--   · It does not build a chart-account deactivation door, and it does not make `account_inactive`
--     reachable. The owner ruled that axis a known, harmless dead one.
--   · It does not touch `clara._acct_role_reserved_at`, the AS-OF twin. Its single reader is
--     `clara._fa_gl_leg_foreign`, which asks "was a NON-FA register holding this code when that leg
--     was booked" for the fixed-asset tie-out; giving it a prepayment arm would make every leg on a
--     prepayment account foreign to the FA register as of that date, which is an accounting answer
--     nobody asked to change. The twin is PINNED in §0 so the asymmetry is deliberate and a drift
--     is visible.
--   · It does not reserve a code whose enrolment has been RETIRED while a schedule still runs
--     against it. #940's owner decision 5 says retiring closes the account to NEW schedules and
--     leaves a running one posting to term end, so that state is reachable and is NOT covered here;
--     closing it needs either a precondition on `clara.retire_prepayment_account` or a second
--     disjunct over live plans, and both are a decision this ticket was not given. It is written up
--     as a follow-up rather than swept.
--   · It does not change `clara.enrol_prepayment_account`, `clara.retire_prepayment_account`,
--     `clara._prepayment_account_enrolled` or either schedule core. Not one line, and not one sha
--     pin on the two cores either: they are recut by this lane's own earlier tickets and by nobody
--     else, and what this file needs from them — that they still ask the shared wall — is probed
--     structurally in §0 instead.
--   · It mints no relation, no function, no grant, no role and no axis. It mints exactly TWO
--     tokens: the reservation domain `prepayment` and the bank belt's
--     `coa_account_prepayment_reserved`, plus one remedy word
--     (`retire_prepayment_enrolment_then_re_enrol`) on a door that already had two.
--
-- REDO-SAFE BY CONSTRUCTION (#957, packages/db/README.md "Redo"): the whole file is
-- `create or replace function` statements between a marker-tolerant prestate and a tail that reads
-- the live catalog. A redo over its own effects re-installs identical text.
-- =====================================================================================

-- =====================================================================================
-- §0 — PRESTATE. Every claim this file makes about what it is editing, measured BEFORE it edits.
-- =====================================================================================
do $c0337_pre$
declare
  v_sha text; v_src text; v_i int; v_n int;
  v_first int := 0; v_redo int := 0; v_modes text := '';
  -- THE BODIES THIS FILE RECUTS, pinned by their sha256(prosrc) MEASURED ON THIS RIG (riders sweep
  -- lane 02 database `clara_l05`, 311 files, max 0336_revenue_recognition_plan_op_key — #1114 and
  -- #1077 landed before this ticket and moved none of them), never copied from an older migration's
  -- header. Each admits exactly TWO pre-images of its own — its measured live sha, or a body that
  -- already carries this file's own `0337` attribution — so a redo is admitted and real drift still
  -- refuses BY NAME. 0336's and 0317's idiom, line for line.
  v_recut text[][] := array[
    ['clara._acct_role_reserved(uuid,text)',
     'e1b44ed0c2449c4e4947e40b0d9d2675da73d02c7365e90453382e158ebf69cd'],
    ['clara._adj_line_eligibility_breach(uuid,jsonb)',
     '727fceade766c85a8fc4753d03e6e071a9008334e149266488e5d5232dd98021'],
    ['clara._fa_assert_code_unreserved(uuid,text)',
     '816f9c24c6cf36b876c7fa3ec1df8a6eac4d492e5f139a8d64755caef534203b'],
    ['clara.upsert_fa_account_profile(uuid,text,text,text,text)',
     '14cba9a309642dafa8a39131a3b850f9663b5b7d64e3fea8632852c11af0e41c'],
    ['clara._adv_enrolment_admission(uuid,text,uuid)',
     '55a2bf3c3020202c32e513219e83c8f3b72a23640100431436137ea8b2949f2a']
  ];
  -- …AND THE NEIGHBOURS THIS FILE DEPENDS ON AND MUST NOT MOVE.
  --
  --   · `_fa_role_claim_conflict` is the discriminator two of the recut doors reach the union
  --     through: it returns any reservation that is not the FA role being claimed, so §A's new
  --     domain flows through it with no edit. If it gained a domain filter, §D and §F would stop
  --     refusing and this file's whole fixed-asset half would silently vacate.
  --   · `_fa_reserved_roles` is §A's FA disjunct, delegated rather than re-listed.
  --   · `_acct_role_reserved_at` is the AS-OF twin this file deliberately leaves FA+advance-only
  --     (see the header). Pinned so the asymmetry is a decision and not a drift.
  --   · the three roster bodies are what makes the new arm mean anything, and this file changes
  --     none of them: the arm reads the relation their doors write.
  --   · `enrol_staff_advance_account` is the verb that ENFORCES §E's predicate; §E only rewords a
  --     branch, so the verb must still be the body that raises on it.
  --   · `_fa_reversal_blocked` is the fourth reader of `_fa_role_claim_conflict` and the one this
  --     file does NOT recut, because its sentence is already domain-neutral ("release that claim
  --     first (retire the enrolment or the profile that took it)"). That is a claim about its TEXT,
  --     so its text is pinned.
  v_keep text[][] := array[
    ['clara._fa_role_claim_conflict(uuid,text,text)',
     '3c17cf8d1418719510cd2e3f5e99eefd20327254207155802fc6fda54ffba581'],
    ['clara._fa_reserved_roles(uuid)',
     '2de9eee6694e478f3c8489eaaeb6fb59ded10bb1f1df691e323fad6910148ed5'],
    ['clara._acct_role_reserved_at(uuid,text,timestamptz)',
     '43ccc13ea49bcf2e9cc97de2528778ccb187cb25516191b7fef52748cac7f4bc'],
    ['clara._prepayment_account_enrolled(uuid,text,text)',
     '0c10eafa94824a00a5d4c7b08ae1ba093d52f0e4f2c0b953a7951b46a27948db'],
    ['clara.enrol_prepayment_account(uuid,text,text,text,text)',
     'd35d58aa31927165a3f0ff764a6bbb90651042c868dfb75be6b0c2ba5240c476'],
    ['clara.retire_prepayment_account(uuid,text,text,text)',
     '5a0fc662384760a5303c1cdffb02793967761013137d859dafe2239f118e8f63'],
    ['clara.enrol_staff_advance_account(uuid,text,text,boolean,text,text)',
     '6db2120df4ffa29cfda6cc282323cb633df6036dfdb76d47b7270a6e6adbf477'],
    ['clara._fa_reversal_blocked(uuid)',
     '157b8a420c4318e45648398652bf764895ab9693eb6476a12b17f191b892553a']
  ];
  -- THE BODIES THAT MUST STILL ASK THE SHARED WALL, probed STRUCTURALLY rather than pinned. §B's
  -- correctness claim is "the prepayment lane asks this wall about its own enrolled code", and
  -- these five are where it asks. They are this lane's own bodies, recut by #1114 and #1077 in this
  -- very branch, so a sha pin here would make this file refuse to apply behind its own siblings; a
  -- containment probe says the same thing and survives a recut that keeps the call.
  v_askers text[] := array[
    'clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)',
    'clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)',
    'clara.list_prepayment_attention(uuid)',
    'clara.list_revenue_recognition_attention(uuid)',
    'clara.enrol_prepayment_account(uuid,text,text,text,text)'
  ];
  v_sig text;
begin
  -- 1 · THE ROSTER RELATION EXISTS AND CARRIES THE THREE COLUMNS §A's ARM READS. Without it
  --     `create or replace` on §A would install a body that fails at its first call.
  if to_regclass('clara.prepayment_account_enrolments') is null then
    raise exception '0337 prestate: clara.prepayment_account_enrolments is absent -- 0306 must apply first'
      using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_attribute a
   where a.attrelid = 'clara.prepayment_account_enrolments'::regclass
     and a.attnum > 0 and not a.attisdropped
     and a.attname in ('client_id', 'account_code', 'purpose', 'active');
  if v_n <> 4 then
    raise exception '0337 prestate: the roster relation does not carry {client_id, account_code, purpose, active} -- found % of 4', v_n
      using errcode='CLR10';
  end if;

  -- 2 · THE RECUT BODIES, each in ONE of its own two admissible pre-images.
  for v_i in 1 .. array_length(v_recut, 1) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex'), p.prosrc into v_sha, v_src
      from pg_proc p where p.oid = v_recut[v_i][1]::regprocedure;
    if v_sha is null then
      raise exception '0337 prestate: % is absent', v_recut[v_i][1] using errcode='CLR10';
    elsif v_sha = v_recut[v_i][2] then
      v_first := v_first + 1; v_modes := v_modes || v_recut[v_i][1] || '=FIRST ';
    elsif position('0337' in v_src) > 0 then
      v_redo := v_redo + 1; v_modes := v_modes || v_recut[v_i][1] || '=REDO ';
    else
      raise exception '0337 prestate: % is neither its pinned pre-image (%) nor this file''s own recut; live sha %',
        v_recut[v_i][1], v_recut[v_i][2], v_sha using errcode='CLR10';
    end if;
  end loop;

  -- 3 · THE NEIGHBOURS ARE EXACTLY WHAT THIS FILE WAS WRITTEN AGAINST.
  for v_i in 1 .. array_length(v_keep, 1) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_keep[v_i][1]::regprocedure;
    if v_sha is distinct from v_keep[v_i][2] then
      raise exception '0337 prestate: % moved (expected %, live %) -- this file asks it as the estate''s own rule and does not edit it; re-measure before applying',
        v_keep[v_i][1], v_keep[v_i][2], coalesce(v_sha, '(absent)') using errcode='CLR10';
    end if;
  end loop;

  -- 4 · THE PREPAYMENT LANE REALLY DOES ASK THE SHARED WALL ABOUT ITS OWN CODES. This is §B's
  --     reason for existing, so it is measured rather than asserted in prose.
  foreach v_sig in array v_askers loop
    select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
    if v_src is null then
      raise exception '0337 prestate: % is absent', v_sig using errcode='CLR10';
    end if;
    if position('_adj_line_eligibility_breach' in v_src) = 0 then
      raise exception '0337 prestate: % no longer asks clara._adj_line_eligibility_breach -- §B''s filter was written because it does; re-derive §B before applying', v_sig
        using errcode='CLR10';
    end if;
  end loop;

  -- 5 · THE NEW DOMAIN IS FREE. `prepayment` must be minted as a reservation domain by THIS file
  --     and by nothing else, or two arms would answer the same question differently.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.prosrc like '%''prepayment''::text%'
     and p.proname <> '_acct_role_reserved';
  if v_n <> 0 then
    raise exception '0337 prestate: % clara body(ies) outside the reservation reader already emit a ''prepayment''::text domain literal', v_n
      using errcode='CLR10';
  end if;

  raise notice '0337 prestate OK -- % FIRST, % REDO -- %', v_first, v_redo, v_modes;
end $c0337_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — clara._acct_role_reserved — THE SHARED RESERVATION READER GAINS ITS THIRD ARM.
--
-- 0043's canonical full-union form, VERBATIM, plus one disjunct and the comment that explains it.
-- The FA disjunct and both staff-advance disjuncts are byte-for-byte 0043's, so every answer this
-- authority gave yesterday about those two domains it gives today, and what is ADDED is the
-- prepayment roster.
--
-- WHY THE UNION AND NOT A FOURTH READER. 0042 SS2.1's doctrine is ONE authority, one answer shape,
-- and every claim-side door reading it: `clara._fa_assert_code_unreserved` (the bank belt, reached
-- from the trigger on clara.bank_accounts), `clara._fa_role_claim_conflict` (the fixed-asset
-- profile door, the opening-balance carry-down and the disposal-reversal wall) and
-- `clara._adv_enrolment_admission` (the staff-advance enrolment door). Adding the roster HERE
-- closes all of them at once and cannot drift from them; a fourth reader spliced into three doors
-- is the drift 0042's own tails exist to prevent.
-- =====================================================================================
create or replace function clara._acct_role_reserved(p_client uuid, p_code text)
  returns table(domain text, role text, owner_ref text)
  language sql stable security definer set search_path = clara, pg_temp as $c0337_a$
  select 'fa'::text, rr.fa_role, rr.owner_asset_code
    from clara._fa_reserved_roles(p_client) rr
   where p_client is not null and p_code is not null and rr.account_code = p_code
  union
  select 'staff_advance'::text, 'advance'::text, en.account_code
    from clara.staff_advance_accounts en
   where p_client is not null and p_code is not null
     and en.client_id = p_client and en.active and en.account_code = p_code
  union
  select 'staff_advance'::text, 'advance'::text, adv.account_code
    from clara.staff_advances adv
    join clara.staff_advance_accounts en2 on en2.id = adv.enrolment_id and en2.active
   where p_client is not null and p_code is not null
     and adv.client_id = p_client and adv.account_code = p_code
  union
  -- #1078 [0337] THE PREPAYMENT-ACCOUNT ROSTER ARM, and it is the D-b1 advance arm's shape, not a
  -- third doctrine: only ACTIVE enrolments reserve, the owner_ref is the code itself, and the ROLE
  -- is the enrolment's own purpose ('prepayment' or 'deferred_revenue') because one roster carries
  -- both and a refusal has to be able to say which half holds the code. A RETIRED enrolment must
  -- not block re-enrolment of its own code (0043's SS3.1 law, restated here for the same reason:
  -- a retired generation owns nothing live).
  --
  -- WHAT DOES *NOT* RESERVE, stated rather than implied: a schedule that outlives its enrolment.
  -- Owner decision 5 of #940 says retiring an account closes it to NEW schedules and leaves a
  -- running one posting to term end, so a retired enrolment can still have an amortisation running
  -- against its code. Closing that needs either a precondition on clara.retire_prepayment_account
  -- or a second disjunct over live plans, and both are a decision this ticket was not given.
  select 'prepayment'::text, pae.purpose, pae.account_code
    from clara.prepayment_account_enrolments pae
   where p_client is not null and p_code is not null
     and pae.client_id = p_client and pae.active and pae.account_code = p_code $c0337_a$;
revoke all on function clara._acct_role_reserved(uuid, text) from public;

comment on function clara._acct_role_reserved(uuid, text) is
  '0042/0043/#1078: the ONE shared census of which register holds a client''s chart code, message-neutral over three domains -- ''fa'' (active account profiles and live register rows), ''staff_advance'' (active enrolments and their register rows) and ''prepayment'' (#1078: LIVE prepayment-account roster enrolments, role = the enrolment''s purpose). Lock-free and STABLE by design: the doors that WRITE role-claiming state take clara._fa_lock_roles themselves, leaf-last. Every caller owns its own refusal text, and clara._adj_line_eligibility_breach deliberately does not treat the ''prepayment'' domain as a posting breach -- see its own body for why.';

-- =====================================================================================
-- §B — clara._adj_line_eligibility_breach — THE SHARED NEGATIVE WALL, WITH ITS ANSWERS UNMOVED.
--
-- 0042's body VERBATIM except the reservation read, which now skips the domain §A added. This is
-- not a softening of the wall: before 0337 the wall could not see a prepayment enrolment at all,
-- so filtering the domain out is exactly what keeps every answer it gives IDENTICAL to the answer
-- it gave yesterday, for every client, every code and every caller. The cell that holds that is
-- `p1078.wall.unmoved`, which drives the wall and the prepayment lane's own doors rather than
-- reading this body.
--
-- WITHOUT THIS SECTION §A IS A REGRESSION, measured on this rig before it was written: with the
-- roster arm in the union and the wall unfiltered, `clara._prepayment_schedule_core` refuses its
-- own enrolled prepaid leg (`prepayment_source_unfit` / `prepaid_account_ineligible`), the two
-- attention reads drop every enrolled candidate, and `clara.enrol_prepayment_account` refuses a
-- bookkeeper restating the reason on a live enrolment.
-- =====================================================================================
create or replace function clara._adj_line_eligibility_breach(p_client uuid, p_lines jsonb)
  returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $c0337_b$
declare x jsonb; v_code text; a record; rr record;
begin
  for x in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_code := x ->> 'account_code';
    select ca.account_code, ca.is_active, ca.account_class, ca.is_bank_account
      into a from clara.coa_accounts ca
      where ca.client_id = p_client and ca.account_code = v_code;
    if not found then
      return jsonb_build_object('account_code', v_code, 'axis', 'account_unknown');
    end if;
    if not a.is_active then
      return jsonb_build_object('account_code', v_code, 'axis', 'account_inactive');
    end if;
    if a.account_class is not null then
      return jsonb_build_object('account_code', v_code, 'axis', 'control_account',
        'account_class', a.account_class);
    end if;
    -- BOTH bank instruments are asked, and either one refuses. coa_accounts.is_bank_account is
    -- the stamp clara.add_bank_account writes; clara.bank_accounts.coa_account_code is the
    -- binding itself. They cannot legitimately disagree, and if they ever do the SAFE answer
    -- is to refuse -- a template posting into a bank control is a reconciliation break.
    if a.is_bank_account
       or exists (select 1 from clara.bank_accounts ba
                  where ba.client_id = p_client and ba.coa_account_code = v_code) then
      return jsonb_build_object('account_code', v_code, 'axis', 'bank_account');
    end if;
    -- #1078 [0337] THE PREPAYMENT DOMAIN IS NOT A BREACH, AND THIS FILTER IS WHAT KEEPS EVERY
    -- ANSWER THIS WALL GIVES EXACTLY WHAT IT GAVE BEFORE 0337. The fixed-asset and staff-advance
    -- reservations mean "a register machine owns this code, an ad-hoc line must not touch it". A
    -- prepayment-roster enrolment means the OPPOSITE: this account is the prepaid asset (or the
    -- contract liability) that the amortisation lane exists to post against, and that lane asks
    -- THIS wall about THAT code -- clara._prepayment_schedule_core and
    -- clara._revenue_recognition_core on the source leg, both correction doors, both attention
    -- reads, and clara.enrol_prepayment_account on the code being enrolled. A wall that saw the
    -- roster would refuse the lane its own accounts and would refuse a bookkeeper restating the
    -- reason on a live enrolment.
    --
    -- `is distinct from` rather than `<>` keeps the fail-closed direction: a null domain, which
    -- this union cannot produce today, would still be reported as a breach.
    select r.domain, r.role, r.owner_ref into rr
      from clara._acct_role_reserved(p_client, v_code) r
     where r.domain is distinct from 'prepayment' limit 1;
    if found then
      return jsonb_build_object('account_code', v_code, 'axis', 'account_reserved',
        'domain', rr.domain, 'role', rr.role, 'owner_ref', rr.owner_ref);
    end if;
  end loop;
  return null;
end $c0337_b$;
revoke all on function clara._adj_line_eligibility_breach(uuid, jsonb) from public;

-- =====================================================================================
-- §C — clara._fa_assert_code_unreserved — THE BANK BELT. 0041's body VERBATIM except the reason
--      token on its shared-union arm.
--
-- THIS IS THE TICKET'S OWN HEADLINE EXAMPLE: "an account enrolled as a prepayment account today
-- can be bound as a bank account ... the very next day". It closes with NO edit to this body's
-- logic at all — the belt reads the union, and §A put the roster in it. What this section changes
-- is only the machine reason, which said `advance` whatever domain held the code. The message was
-- already domain-driven and is untouched.
-- =====================================================================================
create or replace function clara._fa_assert_code_unreserved(p_client uuid, p_code text) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $c0337_c$
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
        detail = jsonb_build_object('reason',
            case when v_domain = 'prepayment' then 'coa_account_prepayment_reserved'
                 else 'coa_account_advance_reserved' end,
          'account_code', p_code, 'reservation_domain', v_domain,
          'reservation_role', v_reserved_role)::text;
  end if;
end $c0337_c$;
revoke all on function clara._fa_assert_code_unreserved(uuid, text) from public;

-- =====================================================================================
-- §D — clara.upsert_fa_account_profile — THE FIXED-ASSET PROFILE DOOR. 0041's body VERBATIM except
--      the release door its shared-union refusal names.
--
-- The refusal itself needs no edit: the door asks `clara._fa_role_claim_conflict`, which asks the
-- union, so §A already makes it refuse a code the prepayment roster holds. What it needed is the
-- REMEDY: it named retire_staff_advance_account whatever register held the code.
-- =====================================================================================
create or replace function clara.upsert_fa_account_profile(p_client uuid, p_asset_account text,
    p_accum_account text, p_depr_expense_account text, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $c0337_d$
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
    -- does not release the claim is the dead end WDB-R2 ruled out in 2026-08-03. The advance
    -- branch's words are UNCHANGED, character for character.
    raise exception 'account % is already reserved by the % register (% role, owner %) for this client and cannot be enrolled in the fixed-asset register; %, or enrol this profile on a different account', v_clash, v_res_domain, v_res_role, coalesce(v_res_owner, '(unnamed)'),
      case when v_res_domain = 'prepayment'
           then 'retire that prepayment-account enrolment first (retire_prepayment_account, which closes the account to new schedules and leaves any running one posting to term end)'
           else 'retire that enrolment first (retire_staff_advance_account, which needs every advance on it settled)' end
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
end $c0337_d$;
revoke all on function clara.upsert_fa_account_profile(uuid, text, text, text, text) from public;
grant execute on function clara.upsert_fa_account_profile(uuid, text, text, text, text)
  to clara_authenticated;

-- =====================================================================================
-- §E — clara._adv_enrolment_admission — THE STAFF-ADVANCE ENROLMENT DOOR'S ADMISSION PREDICATE.
--      0043's body VERBATIM except a third remedy branch on its reservation arm.
--
-- This body is BOTH the gate `clara.enrol_staff_advance_account` enforces and the sentence
-- `clara._adv_on_approve` shows a person who is trying to reverse an entry on a retired advance
-- code, which is why the branch carries an `advice` and not only a `remedy` token.
-- =====================================================================================
create or replace function clara._adv_enrolment_admission(p_client uuid, p_code text,
    p_exclude_entry uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $c0337_e$
declare
  v_bal bigint; v_dom text; v_role text; v_owner text; v_bank uuid; v_perm boolean;
  v_axis text; v_reason text; v_msg text; v_remedy text; v_advice text; v_detail jsonb;
  v_fallback constant text :=
    ' Or leave the code as it is and post an ordinary correcting journal entry on it instead: nothing guards a retired advance code, and staff_advance_tie reports movement outside every enrolment window in its own out_of_window_cents column.';
begin
  select coalesce(sum(l.debit_cents - l.credit_cents), 0) into v_bal
    from clara.journal_lines l
    join clara.journal_entries j on j.id = l.entry_id
    where l.client_id = p_client and l.account_code = p_code and j.status = 'approved'
      and (p_exclude_entry is null or j.id <> p_exclude_entry);

  -- (i) TYPING (the verb's own argument, kept at its own site).
  if not exists (select 1 from clara.coa_accounts a
                 where a.client_id = p_client and a.account_code = p_code
                   and a.is_active and a.account_type = 'asset'
                   and a.account_class is null) then
    v_axis := 'account_type'; v_reason := 'advance_enrolment_invalid';
    v_msg := 'a staff-advance account must be an active, asset-typed, non-control account on this client''s chart';
    v_remedy := 'fix_chart_account_then_re_enrol';
    v_advice := format('Re-enrolment is refused today: %s is not an active, asset-typed, non-control account on this client''s chart. Restore the chart account (active, asset-typed, no control class) FIRST, then re-enrol this code, then reverse the entry again.%s', p_code, v_fallback);
  end if;

  -- (ii) THE BANK DOOR. Status-blind, exactly as the verb wrote it -- a bank account that was
  -- deactivated still carries `coa_account_code`, so the code stays bound until the binding is
  -- MOVED. The advice names the verb that moves it rather than implying deactivation frees it.
  if v_axis is null then
    select ba.id into v_bank from clara.bank_accounts ba
      where ba.client_id = p_client and ba.coa_account_code = p_code limit 1;
    if v_bank is not null then
      v_axis := 'bank_account'; v_reason := 'advance_enrolment_invalid';
      v_msg := format('account %s is a registered bank account for this client and cannot be enrolled as a staff-advance account', p_code);
      v_remedy := 'move_bank_binding_then_re_enrol';
      v_advice := format('Re-enrolment is refused today: %s is bound to a registered bank account for this client (deactivating that bank account does NOT free the code -- the binding survives it). Move the binding onto another chart code (remap_bank_account_coa) FIRST, then re-enrol this code, then reverse the entry again.%s', p_code, v_fallback);
    end if;
  end if;

  -- (iii) THE SHARED RESERVATION UNION.
  if v_axis is null then
    select rr.domain, rr.role, rr.owner_ref into v_dom, v_role, v_owner
      from clara._acct_role_reserved(p_client, p_code) rr limit 1;
    if v_dom is not null then
      v_axis := 'role_reserved'; v_reason := 'advance_enrolment_invalid';
      v_msg := format('chart account %s is already reserved by the %s register (%s role) for this client; pick a different account', p_code, v_dom, v_role);
      -- WHICH SHAPE HOLDS IT, AND WHAT ACTUALLY RELEASES THAT SHAPE. `_fa_reserved_roles`
      -- unions two: an ACTIVE fa_account_profiles row (released by retire_fa_account_profile)
      -- and a clara.fixed_assets REGISTER ROW, which keeps the codes it was born with and so
      -- survives the profile being retired or version-forwarded.
      --
      -- [CROSS-SECTION EDIT, authored by the S5 reservation-authority lane -- owner ruling
      -- 2026-08-03 / WDB-R1 item 2. Reported, not silent.] This arm used to answer
      -- "permanent, and it will never become possible". That was a TRUE statement about the
      -- pre-0042 world, where the register disjuncts carried no status test -- and it was
      -- precisely the defect the ruling ordered eradicated, because it made a lawful advance
      -- reversal un-recordable FOREVER. 0042 S5.15 gates those disjuncts, so a DISPOSED,
      -- SUPERSEDED or UNWOUND row no longer holds the code: this branch now has a followable
      -- remedy and, under WDB-R2, must name it instead of promising an impossibility.
      --
      -- THE PROBE IS GATED IDENTICALLY TO THE UNION, which is the whole point: a message that
      -- measured "does any row carry this code" while the union measured "does any LIVE row
      -- carry it" would report a claim that does not exist -- telling a professional to end an
      -- asset that is already disposed. One predicate, both places, so they cannot drift.
      v_perm := (v_dom = 'fa') and exists (
        select 1 from clara.fixed_assets f
         where f.client_id = p_client
           and clara._fa_status_holds_account_role(f.status)
           and p_code in (f.asset_account_code, f.accum_depr_account_code,
                          f.depr_expense_account_code));
      if v_perm then
        v_remedy := 'release_fa_register_row_then_re_enrol';
        v_advice := format('Re-enrolment is refused today: the FIXED-ASSET REGISTER holds %s (%s role, owner asset %s) on a LIVE register row, and retiring the account profile alone does NOT release it -- a register row keeps the codes it was born with. End that row first (dispose the asset, or reverse its acquisition, which unwinds it -- each has its own preconditions and will say so), then re-enrol this code, then reverse the entry again.%s', p_code, v_role, coalesce(v_owner, '(unnamed)'), v_fallback);
      elsif v_dom = 'fa' then
        v_remedy := 'retire_fa_profile_then_re_enrol';
        v_advice := format('Re-enrolment is refused today: %s is reserved by the fixed-asset register (%s role, owner asset %s) through an ACTIVE account profile. Retire that profile (retire_fa_account_profile) FIRST, then re-enrol this code, then reverse the entry again.%s', p_code, v_role, coalesce(v_owner, '(unnamed)'), v_fallback);
      elsif v_dom = 'prepayment' then
        -- #1078 [0337] THE THIRD DOMAIN, AND ITS OWN DOOR. The shared union gained a
        -- prepayment-roster arm, so this body can now be handed a domain whose claim
        -- retire_staff_advance_account cannot release. Naming that door here would be the exact
        -- dead end the WDB-R2 ruling of 2026-08-03 ordered eradicated from this very arm. What
        -- retirement does and does not do is stated rather than implied: #940's owner decision 5
        -- closes the account to NEW schedules and leaves a running one posting to term end, so a
        -- retirement is enough to free the code for an advance enrolment and does not disturb the
        -- books.
        v_remedy := 'retire_prepayment_enrolment_then_re_enrol';
        v_advice := format('Re-enrolment is refused today: %s is already reserved by the prepayment-account roster for this client (%s purpose). Retire that enrolment (retire_prepayment_account, which closes the account to new schedules and leaves any running one posting to term end) FIRST, then re-enrol this code, then reverse the entry again.%s', p_code, v_role, v_fallback);
      else
        v_remedy := 'retire_advance_enrolment_then_re_enrol';
        v_advice := format('Re-enrolment is refused today: %s is already reserved by the staff-advance register for this client (owner %s). Retire that enrolment (retire_staff_advance_account, which needs every advance on it settled) FIRST, then re-enrol this code, then reverse the entry again.%s', p_code, coalesce(v_owner, '(unnamed)'), v_fallback);
      end if;
    end if;
  end if;

  -- (iv) ENROL-CLEAN-ONLY.
  if v_axis is null and v_bal <> 0 then
    v_axis := 'balance'; v_reason := 'enrolment_balance_nonzero';
    v_msg := format('account %s already carries an approved GL balance of %s cents; a staff-advance enrolment can only start from a clean account (carry the existing balances down onto a fresh dedicated code, or use a new account for this person)', p_code, v_bal);
    v_remedy := 'clear_balance_then_re_enrol';
    v_advice := format('The code now carries an approved GL balance of %s cents from other use, so a re-enrolment would be refused (a staff-advance enrolment can only start from a clean account): carry that balance down onto its own dedicated code FIRST, then re-enrol this code, then reverse the entry again.', v_bal);
  end if;

  if v_axis is null then
    return jsonb_build_object('admitted', true, 'account_code', p_code,
      'balance_cents', v_bal, 'axis', null, 'reason', null, 'remedy', 're_enrol',
      'advice', 'Re-enrol the account, then reverse the entry again -- every enrolment gate (chart typing, the bank door, the shared register reservations and the account''s approved balance) passes for this code right now, so enrolment will admit it.');
  end if;

  v_detail := jsonb_build_object('reason', v_reason, 'axis', v_axis,
    'account_code', p_code, 'remedy', v_remedy);
  if v_axis = 'role_reserved' then
    v_detail := v_detail || jsonb_build_object('reserved_domain', v_dom,
      'reserved_role', v_role, 'reserved_owner', v_owner);
  elsif v_axis = 'balance' then
    v_detail := v_detail || jsonb_build_object('balance_cents', v_bal);
  elsif v_axis = 'bank_account' then
    v_detail := v_detail || jsonb_build_object('bank_account_id', v_bank);
  end if;
  return jsonb_build_object('admitted', false, 'account_code', p_code,
    'balance_cents', v_bal, 'axis', v_axis, 'reason', v_reason, 'remedy', v_remedy,
    'message', v_msg, 'advice', v_advice, 'detail', v_detail);
end $c0337_e$;
revoke all on function clara._adv_enrolment_admission(uuid, text, uuid) from public;

reset role;

-- =====================================================================================
-- §TAIL — what must be true AFTER this file, read off the LIVE catalog rather than off this
--         file's own text.
-- =====================================================================================
do $c0337_tail$
declare
  v_src text; v_n int; v_sig text;
  v_mine text[] := array[
    'clara._acct_role_reserved(uuid,text)',
    'clara._adj_line_eligibility_breach(uuid,jsonb)',
    'clara._fa_assert_code_unreserved(uuid,text)',
    'clara.upsert_fa_account_profile(uuid,text,text,text,text)',
    'clara._adv_enrolment_admission(uuid,text,uuid)'
  ];
begin
  -- 1 · THE SHARED CENSUS CARRIES THREE DOMAINS AND LOST NEITHER OF THE TWO IT HAD. Gaining the
  --     roster arm while dropping the FA delegate or an advance disjunct would be a silent
  --     narrowing of two registers' claims, which is worse than the defect this file closes.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._acct_role_reserved(uuid,text)'::regprocedure;
  if v_src is null then
    raise exception '0337 tail: clara._acct_role_reserved is absent after the recut' using errcode='CLR10';
  end if;
  if position('clara.prepayment_account_enrolments' in v_src) = 0 then
    raise exception '0337 tail: the reservation census does not read the prepayment-account roster -- #1078''s whole arm is missing'
      using errcode='CLR10';
  end if;
  if position('''prepayment''::text' in v_src) = 0 then
    raise exception '0337 tail: the reservation census reads the roster but emits no ''prepayment'' domain, so no caller can name which register holds the code'
      using errcode='CLR10';
  end if;
  if position('clara._fa_reserved_roles' in v_src) = 0 then
    raise exception '0337 tail: the reservation census lost its FA disjunct -- 0041''s claims would silently release'
      using errcode='CLR10';
  end if;
  if position('clara.staff_advance_accounts' in v_src) = 0
     or position('clara.staff_advances' in v_src) = 0 then
    raise exception '0337 tail: the reservation census lost an advance disjunct -- 0043''s claims would silently release'
      using errcode='CLR10';
  end if;
  -- …AND ITS RETURN SHAPE IS THE ONE TWO CONSUMERS DESTRUCTURE POSITIONALLY (0043's pinned
  -- (domain, role, owner_ref)).
  select count(*) into v_n from unnest(
      (select p.proargnames from pg_proc p
        where p.oid = 'clara._acct_role_reserved(uuid,text)'::regprocedure)) as t(nm)
   where nm in ('domain', 'role', 'owner_ref');
  if v_n <> 3 then
    raise exception '0337 tail: clara._acct_role_reserved no longer returns (domain, role, owner_ref) -- found % of the 3 names', v_n
      using errcode='CLR10';
  end if;
  -- …and it is still the LOCK-FREE STABLE reader 0042 tail 9(d) specified, because every posting
  -- and approve path that re-derives line eligibility reads it.
  select count(*) into v_n from pg_proc p
   where p.oid = 'clara._acct_role_reserved(uuid,text)'::regprocedure
     and p.provolatile = 's' and p.prosecdef
     and position('advisory' in p.prosrc) = 0;
  if v_n <> 1 then
    raise exception '0337 tail: clara._acct_role_reserved is no longer a lock-free STABLE security-definer reader (0042 tail 9(d))'
      using errcode='CLR10';
  end if;

  -- 2 · THE AS-OF TWIN DID NOT GAIN THE ARM, and that asymmetry is this file's decision (header).
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._acct_role_reserved_at(uuid,text,timestamptz)'::regprocedure;
  if v_src is null then
    raise exception '0337 tail: clara._acct_role_reserved_at is absent' using errcode='CLR10';
  end if;
  if position('prepayment' in v_src) <> 0 then
    raise exception '0337 tail: the AS-OF reservation twin gained a prepayment arm -- clara._fa_gl_leg_foreign would start calling every prepayment leg foreign to the fixed-asset register, which this file deliberately does not decide'
      using errcode='CLR10';
  end if;

  -- 3 · THE POSTING WALL SKIPS THE NEW DOMAIN AND STILL ASKS THE CENSUS. Both halves: a wall that
  --     stopped asking the census would release the FA and advance claims it exists to enforce, and
  --     a wall that asked without the filter would refuse the prepayment lane its own accounts.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._adj_line_eligibility_breach(uuid,jsonb)'::regprocedure;
  if position('clara._acct_role_reserved(p_client, v_code)' in v_src) = 0 then
    raise exception '0337 tail: the shared eligibility wall no longer asks the reservation census'
      using errcode='CLR10';
  end if;
  if position('r.domain is distinct from ''prepayment''' in v_src) = 0 then
    raise exception '0337 tail: the shared eligibility wall does not skip the ''prepayment'' domain -- the prepayment and deferred-revenue lanes would refuse their own enrolled accounts'
      using errcode='CLR10';
  end if;
  --     …and its five axes are all still spoken. Dropping one would be a behaviour change this
  --     file has no standing to make.
  foreach v_sig in array array['account_unknown', 'account_inactive', 'control_account',
                               'bank_account', 'account_reserved'] loop
    if position('''' || v_sig || '''' in v_src) = 0 then
      raise exception '0337 tail: the shared eligibility wall lost its % axis', v_sig
        using errcode='CLR10';
    end if;
  end loop;

  -- 4 · THE BANK BELT TYPES ITS REASON PER DOMAIN, and the advance token it already answered with
  --     is still there: a surface reading `coa_account_advance_reserved` today reads nothing new.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._fa_assert_code_unreserved(uuid,text)'::regprocedure;
  if position('coa_account_prepayment_reserved' in v_src) = 0
     or position('coa_account_advance_reserved' in v_src) = 0 then
    raise exception '0337 tail: the bank belt does not carry BOTH reservation reason tokens'
      using errcode='CLR10';
  end if;
  if position('clara._acct_role_reserved(p_client, p_code)' in v_src) = 0 then
    raise exception '0337 tail: the bank belt no longer reads the shared reservation census (0045''s replay of 0042 tail 3(6))'
      using errcode='CLR10';
  end if;

  -- 5 · THE FIXED-ASSET PROFILE DOOR NAMES THE DOOR THAT RELEASES *THIS* CLAIM, and still names the
  --     advance one for an advance claim.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.upsert_fa_account_profile(uuid,text,text,text,text)'::regprocedure;
  if position('retire_prepayment_account' in v_src) = 0
     or position('retire_staff_advance_account' in v_src) = 0 then
    raise exception '0337 tail: the fixed-asset profile door does not name both release doors'
      using errcode='CLR10';
  end if;
  if position('clara._fa_role_claim_conflict' in v_src) = 0 then
    raise exception '0337 tail: the fixed-asset profile door no longer asks the shared discriminator'
      using errcode='CLR10';
  end if;

  -- 6 · THE STAFF-ADVANCE ADMISSION PREDICATE HAS A THIRD REMEDY, and kept its two.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._adv_enrolment_admission(uuid,text,uuid)'::regprocedure;
  foreach v_sig in array array['retire_prepayment_enrolment_then_re_enrol',
                               'retire_advance_enrolment_then_re_enrol',
                               'retire_fa_profile_then_re_enrol',
                               'release_fa_register_row_then_re_enrol'] loop
    if position(v_sig in v_src) = 0 then
      raise exception '0337 tail: the advance admission predicate lost the % remedy', v_sig
        using errcode='CLR10';
    end if;
  end loop;
  if position('clara._acct_role_reserved(p_client, p_code)' in v_src) = 0 then
    raise exception '0337 tail: the advance admission predicate no longer asks the census itself -- 0042 S5.14(6) accepts it as the enrolment delegate ONLY because it does'
      using errcode='CLR10';
  end if;


  -- 8 · NOTHING ELSE MOVED. No overload was minted for any recut body, and the ACLs are exactly
  --     what they were: the five internal bodies are `clara_fn_owner`'s alone and the one door in
  --     this file is `clara_authenticated`'s. `create or replace function` preserves a grant rather
  --     than granting one; this re-measures both rather than trusting it.
  foreach v_sig in array v_mine loop
    select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'clara' and p.proname = split_part(split_part(v_sig, '.', 2), '(', 1);
    if v_n <> 1 then
      raise exception '0337 tail: % has % catalog entries, expected exactly 1 (an overload was minted)', v_sig, v_n
        using errcode='CLR10';
    end if;
    if v_sig <> 'clara.upsert_fa_account_profile(uuid,text,text,text,text)' then
      if has_function_privilege('clara_authenticated', v_sig::regprocedure, 'EXECUTE')
         or has_function_privilege('clara_runtime', v_sig::regprocedure, 'EXECUTE')
         or has_function_privilege('clara_agent_ro', v_sig::regprocedure, 'EXECUTE')
         or has_function_privilege('public', v_sig::regprocedure, 'EXECUTE') then
        raise exception '0337 tail: an application role reached %, which is an INTERNAL body reached only from a definer path', v_sig
          using errcode='CLR10';
      end if;
    end if;
  end loop;
  if not has_function_privilege('clara_authenticated',
       'clara.upsert_fa_account_profile(uuid,text,text,text,text)'::regprocedure, 'EXECUTE') then
    raise exception '0337 tail: clara_authenticated lost EXECUTE on the fixed-asset profile door'
      using errcode='CLR10';
  end if;
  if has_function_privilege('clara_runtime',
       'clara.upsert_fa_account_profile(uuid,text,text,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('clara_agent_ro',
       'clara.upsert_fa_account_profile(uuid,text,text,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('clara_wake_interactive',
       'clara.upsert_fa_account_profile(uuid,text,text,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('clara_wake_proactive',
       'clara.upsert_fa_account_profile(uuid,text,text,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('public',
       'clara.upsert_fa_account_profile(uuid,text,text,text,text)'::regprocedure, 'EXECUTE') then
    raise exception '0337 tail: a machine lane reached the fixed-asset profile door'
      using errcode='CLR10';
  end if;

  -- 9 · THE THREE CLAIM-SIDE CONSUMERS STILL REACH THE CENSUS, counted. 0042 S5.14(6) is a
  --     migration-time gate that could not see a door a later file adds; this is the same
  --     measurement made after this file's own edits.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'
     and lower(regexp_replace(regexp_replace(regexp_replace(
           p.prosrc, '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
         ~ 'clara\._acct_role_reserved *\(';
  if v_n <> 4 then
    raise exception '0337 tail: expected exactly 4 clara bodies to CALL the reservation census (the wall, the bank belt, the FA discriminator and the advance admission delegate); found %', v_n
      using errcode='CLR10';
  end if;

  raise notice '0337 tail OK -- the prepayment roster reserves its live enrolments, the posting wall is unmoved, and the three claim doors name the door that releases the claim';
end $c0337_tail$;
