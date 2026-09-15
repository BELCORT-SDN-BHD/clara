-- 0211_accounting_work_egress_recovery — #812 (successor to 0195 / #631):
-- THE WAY BACK ON AFTER A **DEACTIVATION**, NAMED AT THE DOORS AND REACHABLE FROM THE CONSOLE.
-- =====================================================================================
-- Spec of record: issue #812 and its Agent Brief. Domain words: CONTEXT.md — "Purpose
-- authorisation". 0195's bytes are applied and immutable; this file is append-only.
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. A `comment on function` on both halves of the
-- deactivate/activate pair naming them as the recovery path for the DERIVED `accounting_work`
-- purpose (distinct from restore, which reverses a revoke), and ONE thin owner-floored door,
-- `clara.reactivate_client_egress_purpose(client, purpose, op_key)`, that resolves the surviving
-- consent internally and performs exactly that activation.
--
-- =====================================================================================
-- THE MEASUREMENT CAME FIRST, AND IT ROUND-TRIPS.
--
-- The brief's instruction was to MEASURE before branching, because nothing in the estate had ever
-- deactivated an `accounting_work` ACTIVATION: the work-egress battery's `deactivateClient` helper
-- archives the CLIENT, which is a different withdrawal with a different recovery. Measured on a
-- database at frontier 0198 + 0210, with the battery's own fixtures:
--
--   prepare_egress_dispatch            -> granted (the derived pair is self-minted, once)
--   deactivate_client_egress_purpose   -> {status: deactivated}
--   prepare_egress_dispatch            -> unknown
--   activate_client_egress_purpose(… the SURVIVING consent id …)
--                                      -> {status: active, consent_id: <the same consent>}
--   prepare_egress_dispatch            -> granted
--
-- So the door was already open and nothing had ever walked through it. THREE facts make it open,
-- and all three are 0195's, not this file's: deactivation stamps the ACTIVATION and never sets the
-- consent's `revoked_at`; the one-live-activation uniqueness is PARTIAL
-- (`where deactivated_at is null`), so a second activation is representable; and 0195's
-- `activate_client_egress_purpose` allowlist admits `accounting_work`.
--
-- THIS FILE THEREFORE TAKES THE ROUND-TRIP ARM: it PINS the path rather than building a second
-- restore arm that would mint a fresh consent nobody needs. The permanent regression proof is
-- `packages/db/tests/work-egress-authority.test.mjs` — `w812.reactivate.round_trip`,
-- `.retroactive`, `.door` and `.floor`.
--
-- =====================================================================================
-- WHY A THIN DOOR IS STILL NEEDED, AND WHY IT IS THIN.
--
-- `activate_client_egress_purpose` requires the caller to NAME the consent, and refuses
-- `consent_mismatch` unless the named row is THE live consent for the pair. No lawful read exposes
-- that id to `clara_authenticated`: `clara.client_egress_purpose_consents` carries FORCE ROW LEVEL
-- SECURITY with a single `clara_fn_owner` policy and no table grant to any application role
-- (0020), and no verb returns it. A firm owner therefore cannot call the door that would recover
-- their own client — the console has no id to send.
--
-- `clara.reactivate_client_egress_purpose(p_client, p_purpose, p_op_key)` closes exactly that gap
-- and nothing else: owner floor, `accounting_work` only, firm-scoped, it RESOLVES the surviving
-- live consent inside the database and then DELEGATES to `clara.activate_client_egress_purpose`
-- unchanged. It writes no audit row and appends no event of its own — the delegate writes the
-- same `audit_log` row (`fn = 'activate_client_egress_purpose'`) and the same
-- `egress.purpose_activated` event it always has, and carries the same `_reserve_op` idempotency
-- under the same op_key. Every typed refusal the activate door raises (`no_consent`,
-- `consent_mismatch`, `duplicate_live`) reaches the caller unchanged. It is a LOOKUP in front of
-- an existing door, never a second implementation of it.
--
-- GRANTED TO `clara_authenticated` AND NOTHING ELSE. No runtime, agent or wake variant: a human
-- took the authority away, only a human gives it back. The rig's grant-roster cohort declares it.
--
-- =====================================================================================
-- LIVE-AT-WRITE, AND 0020's ONE-TERMINAL CHECK, STATED RATHER THAN RE-OPENED.
--
-- "Authority must be live at the moment the books move" is enforced by TWO JOINS in the recut
-- posting core (`clara._record_journal_entry_core`, 0195): behind the run's CONSUMED dispatch
-- authorization it re-reads the consent's `revoked_at is null` AND the activation's
-- `deactivated_at is null`. It is NOT enforced by invalidating the consumed row, because 0020's
-- `ck_egress_dispatch_authorizations_one_terminal` (`consumed_at is null or invalidated_at is
-- null`) makes a consumed-then-invalidated row unrepresentable.
--
-- THAT CONSTRAINT IS DELIBERATELY LEFT AS IT STANDS. The decision is the owner's and it is already
-- taken (#812's brief, "Out of scope"): document the two-join approach and do not recut the CHECK.
-- §0 below MEASURES that the constraint still reads exactly as 0020 wrote it, so "deliberately
-- left" is a checked claim rather than an assumption; §T re-measures it after.
--
-- WHICH WITHDRAWALS ARE REVERSIBLE THROUGH WHICH DOOR (the sentence ARCHITECTURE §5.E now carries):
--   * `revoke_client_egress_purpose`     withdraws the CONSENT
--       -> reversed by `restore_client_egress_purpose` (mints a FRESH consent + activation)
--   * `deactivate_client_egress_purpose` withdraws the ACTIVATION, consent survives
--       -> reversed by `reactivate_client_egress_purpose` (re-activates the SURVIVING consent)
--   * a NEWER published legal version not yet accepted, or the client going inactive
--       -> reversed by accepting the new version / re-activating the client; no egress door
--          restores an authority the FIRM does not currently hold.
-- In every case recovery restores FUTURE dispatches only. A run whose authorization was consumed
-- before the withdrawal stays refused at the posting core, because the two joins read the consent
-- and the activation that authorization itself names. `w631.write.withdrawn_after_consume` pins
-- that for revoke → restore; `w812.reactivate.retroactive` pins it for deactivate → reactivate.
--
-- =====================================================================================
-- WHAT THIS FILE DOES NOT TOUCH.
--   * The bodies of `activate_client_egress_purpose`, `deactivate_client_egress_purpose`,
--     `revoke_client_egress_purpose`, `restore_client_egress_purpose`, `prepare_egress_dispatch`
--     and `_record_journal_entry_core` — all unchanged; §0 pins the two it comments by prosrc
--     sha256, so a comment never lands on a body somebody else recut.
--   * `ck_egress_dispatch_authorizations_one_terminal` — measured, not recut.
--   * `prepare_egress_dispatch`'s `not exists` mint guard, which spans revoked rows: the derived
--     mint stays sticky and is never the recovery path.
--   * Every frozen body and the frozen manifest. NO RUNTIME CUTOVER: this file adds one door no
--     runtime lane may call.
--
-- ROLLBACK is a NEW append-only migration (packages/db/README.md).
--
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES AT RUNTIME:
--   clara.reactivate_client_egress_purpose                       (clara_authenticated)
--     CLR04 (from clara._human_ctx)                              — below the owner floor
--     CLR10  (no detail)                                         — op_key missing
--     CLR10  reason='malformed'                                  — a null client
--     CLR10  reason='purpose_not_reactivatable'                  — any purpose but accounting_work
--     CLR11  (no detail)                                         — another firm's client, or none
--     CLR28  reason='no_consent'                                 — nothing live to re-activate over
--     CLR28  reason='nothing_to_reactivate'                      — nothing was ever deactivated
--   …and, unchanged, from the door it delegates to:
--     CLR28  reason='duplicate_live'                             — an activation is already live
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is editing, measured before it edits.
-- =====================================================================================
do $w812_pre$
declare n text; v_sha text; v_def text; v_n int;
begin
  foreach n in array array[
    'clara.activate_client_egress_purpose(uuid,text,uuid,text)',
    'clara.deactivate_client_egress_purpose(uuid,text,text,text)',
    'clara.restore_client_egress_purpose(uuid,text,text)',
    'clara.revoke_client_egress_purpose(uuid,text,text,text)',
    'clara._accounting_work_egress_live(uuid,uuid)',
    'clara._human_ctx(integer)',
    'clara.role_rank(text)'
  ] loop
    if to_regprocedure(n) is null then
      raise exception '#812 prestate: prerequisite absent: % (migration 0195 has not been applied)', n
        using errcode='CLR10';
    end if;
  end loop;

  -- 0.1 · the door this file adds must NOT already exist.
  if to_regprocedure('clara.reactivate_client_egress_purpose(uuid,text,text)') is not null then
    raise exception '#812 prestate: clara.reactivate_client_egress_purpose already exists'
      using errcode='CLR10';
  end if;

  -- 0.2 · SHA PINS of the two bodies this file comments. A comment is cheap; a comment that
  -- describes a body somebody else recut is a lie in the catalog.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.activate_client_egress_purpose(uuid,text,uuid,text)'::regprocedure;
  if v_sha <> 'b2657c488c3412fd42d8495e71b41530dd542dc7cf9cf84417546a04df473cca' then
    raise exception '#812 prestate: clara.activate_client_egress_purpose is not 0195''s body (prosrc sha256 %)', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.deactivate_client_egress_purpose(uuid,text,text,text)'::regprocedure;
  if v_sha <> '6463184d56f8ed33caf5d6201d8959c93cf36c40bbb226176e86f73d82f4499c' then
    raise exception '#812 prestate: clara.deactivate_client_egress_purpose is not 0195''s body (prosrc sha256 %)', v_sha
      using errcode='CLR10';
  end if;

  -- 0.3 · BOTH ALLOWLISTS CARRY accounting_work. The whole round trip rests on this, and an
  -- earlier triage note read a superseded body and reported the opposite.
  select count(*)::int into v_n from pg_proc p
   where p.oid in ('clara.activate_client_egress_purpose(uuid,text,uuid,text)'::regprocedure,
                   'clara.deactivate_client_egress_purpose(uuid,text,text,text)'::regprocedure)
     and position('''accounting_work''' in p.prosrc) > 0;
  if v_n <> 2 then
    raise exception '#812 prestate: the activate/deactivate allowlists do not both admit accounting_work'
      using errcode='CLR10';
  end if;

  -- 0.4 · THE ONE-LIVE UNIQUENESS IS PARTIAL. A total unique index would make the second
  -- activation unrepresentable and this file's whole premise false.
  select pg_get_indexdef(i.indexrelid) into v_def from pg_index i
   where i.indexrelid = 'clara.uq_client_egress_purpose_activations_one_live'::regclass;
  if v_def is null or position('deactivated_at IS NULL' in v_def) = 0 then
    raise exception '#812 prestate: uq_client_egress_purpose_activations_one_live is not partial on deactivated_at -- got {%}', v_def
      using errcode='CLR10';
  end if;

  -- 0.5 · 0020's ONE-TERMINAL CHECK, measured so "deliberately left" is a checked claim.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conname='ck_egress_dispatch_authorizations_one_terminal'
     and conrelid='clara.egress_dispatch_authorizations'::regclass;
  if v_def is distinct from 'CHECK (((consumed_at IS NULL) OR (invalidated_at IS NULL)))' then
    raise exception '#812 prestate: ck_egress_dispatch_authorizations_one_terminal is not 0020''s -- got {%}', v_def
      using errcode='CLR10';
  end if;

  -- 0.6 · THE TWO JOINS that make live-at-write true are in the posting core. This file documents
  -- them; if they are not there, the documentation would be the only thing enforcing the rule.
  if to_regprocedure('clara._record_journal_entry_core(uuid,uuid,uuid,text,date,text,jsonb,text,uuid,text,text,uuid,text,boolean,text,uuid,text)') is null then
    -- the core's signature has been recut repeatedly; probe by NAME rather than by arity.
    if not exists (select 1 from pg_proc p where p.pronamespace='clara'::regnamespace
                    and p.proname='_record_journal_entry_core') then
      raise exception '#812 prestate: clara._record_journal_entry_core is absent' using errcode='CLR10';
    end if;
  end if;
  if not exists (select 1 from pg_proc p
                  where p.pronamespace='clara'::regnamespace
                    and p.proname='_record_journal_entry_core'
                    and position('deactivated_at is null' in p.prosrc) > 0
                    and position('revoked_at is null' in p.prosrc) > 0) then
    raise exception '#812 prestate: the posting core no longer re-reads BOTH the consent revocation and the activation deactivation -- live-at-write is not enforced by the two joins this file documents'
      using errcode='CLR10';
  end if;

  raise notice '#812 prestate: clean -- both 0195 doors carry their pinned bodies and both admit accounting_work, the one-live activation uniqueness is PARTIAL on deactivated_at, 0020''s ck_egress_dispatch_authorizations_one_terminal is untouched, the posting core still re-reads both withdrawal columns, and clara.reactivate_client_egress_purpose does not yet exist.';
end
$w812_pre$;

-- =====================================================================================
-- §A THE RECOVERY PATH, NAMED AT BOTH DOORS. Comments only: no body moves.
-- =====================================================================================
comment on function clara.deactivate_client_egress_purpose(uuid,text,text,text) is
  '#631, documented by #812: withdraw a client''s typed egress ACTIVATION. Owner floor, firm-'
  'scoped, idempotent by op_key. It stamps the activation (deactivated_at, deactivation_reason) '
  'and invalidates that consent''s still-UNCONSUMED dispatch authorizations; it NEVER revokes the '
  'consent. For the DERIVED accounting_work purpose this is the REVERSIBLE withdrawal: the way '
  'back on is clara.reactivate_client_egress_purpose (or clara.activate_client_egress_purpose '
  'naming the surviving consent), which re-activates the SAME consent. That is NOT '
  'clara.restore_client_egress_purpose, which reverses a REVOKE only and mints a fresh pair. '
  'Recovery restores FUTURE dispatches only: a run whose authorization was consumed before the '
  'deactivation stays refused at the posting core, whose two joins read this activation.';

comment on function clara.activate_client_egress_purpose(uuid,text,uuid,text) is
  '#631, documented by #812: activate a typed egress consent for a client. Owner floor, firm-'
  'scoped, idempotent by op_key; typed refusals no_consent, consent_mismatch, duplicate_live. The '
  'one-live-activation uniqueness is PARTIAL (where deactivated_at is null), so this door is also '
  'the RECOVERY path for a DEACTIVATED accounting_work activation: name the consent that survived '
  'the deactivation and a fresh activation row is inserted beside the stamped one. Because no '
  'lawful read exposes that consent id to clara_authenticated, the console calls '
  'clara.reactivate_client_egress_purpose, which resolves it and delegates here. A REVOKED '
  'consent is a different withdrawal and is reversed by clara.restore_client_egress_purpose, '
  'which mints a fresh pair -- never by this door.';

set role clara_fn_owner;

-- =====================================================================================
-- §B THE THIN RECOVERY DOOR. A consent LOOKUP in front of clara.activate_client_egress_purpose.
--
-- It deliberately writes NOTHING of its own: the delegate's audit row, domain event, op
-- idempotency and every typed refusal are the ones this family already has, so there is exactly
-- one implementation of "activate a typed egress consent" in the estate.
-- =====================================================================================
create function clara.reactivate_client_egress_purpose(p_client uuid, p_purpose text, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp
  set plan_cache_mode = force_custom_plan
  as $$
declare c record; v_consent uuid; v_prior uuid;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null then
    raise exception 'typed egress re-activation is malformed' using errcode='CLR10',
      detail='{"reason":"malformed"}';
  end if;
  if p_purpose is null or p_purpose<>'accounting_work' then
    raise exception 'only the DERIVED egress purpose is re-activated through this door'
      using errcode='CLR10',
        detail='{"reason":"purpose_not_reactivatable","reactivatable":"accounting_work"}';
  end if;
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  -- THE SURVIVING CONSENT. A deactivation never sets revoked_at, so there is at most one.
  select x.id into v_consent from clara.client_egress_purpose_consents x
   where x.firm_id=c.firm and x.client_id=p_client and x.purpose='accounting_work'
     and x.revoked_at is null;
  if v_consent is null then
    raise exception 'no live typed egress consent for this client and purpose'
      using errcode='CLR28',detail='{"reason":"no_consent"}';
  end if;
  -- …and something must actually have been deactivated. Without this arm the door would be a
  -- second spelling of `activate`, offered to a client nobody ever withdrew.
  select a.id into v_prior from clara.client_egress_purpose_activations a
   where a.firm_id=c.firm and a.client_id=p_client and a.purpose='accounting_work'
     and a.deactivated_at is not null
   order by a.deactivated_at desc limit 1;
  if v_prior is null then
    raise exception 'nothing was deactivated for this client and purpose'
      using errcode='CLR28',detail='{"reason":"nothing_to_reactivate"}';
  end if;
  -- THE DELEGATE. Its audit row, its event, its op idempotency, its typed refusals.
  return clara.activate_client_egress_purpose(p_client,'accounting_work',v_consent,p_op_key);
end $$;
alter function clara.reactivate_client_egress_purpose(uuid,text,text) owner to clara_fn_owner;
revoke all on function clara.reactivate_client_egress_purpose(uuid,text,text) from public;
comment on function clara.reactivate_client_egress_purpose(uuid,text,text) is
  '#812: the way back on after an owner DEACTIVATES a client''s derived accounting_work egress '
  'activation. Owner floor, accounting_work only, firm-scoped. Resolves the consent that SURVIVED '
  'the deactivation -- no lawful read exposes that id to clara_authenticated -- and delegates to '
  'clara.activate_client_egress_purpose, which writes the audit row, appends '
  'egress.purpose_activated and holds the op_key idempotency. Refuses no_consent when nothing is '
  'live to re-activate over (a REVOKE is reversed by clara.restore_client_egress_purpose instead) '
  'and nothing_to_reactivate when nothing was ever deactivated. Recovery restores FUTURE '
  'dispatches only.';

reset role;

grant execute on function clara.reactivate_client_egress_purpose(uuid,text,text) to clara_authenticated;

-- =====================================================================================
-- §T TAIL CENSUS. Re-read the COMMITTED catalog and say what it found.
-- =====================================================================================
do $w812_tail$
declare v_posture text; v_def text; v_comment text; v_n int;
begin
  -- 1 · the new door exists exactly once, with the intended posture and the intended ACL.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='reactivate_client_egress_purpose';
  if v_n <> 1 then
    raise exception '#812 tail: clara.reactivate_client_egress_purpose has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig,','),'<none>') || ' | '
         || coalesce(array_to_string(p.proacl,','),'<null>')
    into v_posture from pg_proc p
   where p.oid='clara.reactivate_client_egress_purpose(uuid,text,text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#812 tail: the recovery door has the wrong posture -- expected owner clara_fn_owner, SECURITY DEFINER, pinned search_path and EXECUTE to clara_authenticated ONLY (no runtime, agent or wake variant); got {%}', v_posture
      using errcode='CLR10';
  end if;

  -- 2 · it carries the OWNER floor and the accounting_work-only allowlist, read from its own text.
  if not exists (select 1 from pg_proc p
                  where p.oid='clara.reactivate_client_egress_purpose(uuid,text,text)'::regprocedure
                    and position('clara.role_rank(''owner'')' in p.prosrc) > 0
                    and position('p_purpose<>''accounting_work''' in p.prosrc) > 0
                    and position('clara.activate_client_egress_purpose(' in p.prosrc) > 0) then
    raise exception '#812 tail: the recovery door lost its owner floor, its purpose allowlist or its delegation'
      using errcode='CLR10';
  end if;

  -- 3 · BOTH 0195 DOORS NOW CARRY THE RECOVERY SENTENCE, and both still say restore is a
  -- different door. A comment that named only one of them would leave the pair half-documented.
  foreach v_def in array array['clara.deactivate_client_egress_purpose(uuid,text,text,text)',
                               'clara.activate_client_egress_purpose(uuid,text,uuid,text)'] loop
    select obj_description(v_def::regprocedure, 'pg_proc') into v_comment;
    if v_comment is null
       or position('reactivate_client_egress_purpose' in v_comment) = 0
       or position('restore_client_egress_purpose' in v_comment) = 0 then
      raise exception '#812 tail: % does not name the recovery path and its distinction from restore', v_def
        using errcode='CLR10';
    end if;
  end loop;

  -- 4 · 0020's ONE-TERMINAL CHECK IS EXACTLY AS IT WAS. "Deliberately left" re-measured after.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conname='ck_egress_dispatch_authorizations_one_terminal'
     and conrelid='clara.egress_dispatch_authorizations'::regclass;
  if v_def is distinct from 'CHECK (((consumed_at IS NULL) OR (invalidated_at IS NULL)))' then
    raise exception '#812 tail: ck_egress_dispatch_authorizations_one_terminal MOVED -- this file must not recut it; got {%}', v_def
      using errcode='CLR10';
  end if;

  -- 5 · no body was recut in passing: the two commented doors still hash to their pinned values.
  if not exists (select 1 from pg_proc p
                  where p.oid='clara.activate_client_egress_purpose(uuid,text,uuid,text)'::regprocedure
                    and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
                        = 'b2657c488c3412fd42d8495e71b41530dd542dc7cf9cf84417546a04df473cca')
     or not exists (select 1 from pg_proc p
                  where p.oid='clara.deactivate_client_egress_purpose(uuid,text,text,text)'::regprocedure
                    and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
                        = '6463184d56f8ed33caf5d6201d8959c93cf36c40bbb226176e86f73d82f4499c') then
    raise exception '#812 tail: a commented body CHANGED -- this file comments, it does not recut'
      using errcode='CLR10';
  end if;

  raise notice '#812 tail: OK -- clara.reactivate_client_egress_purpose(uuid,text,text) exists exactly once, owned by clara_fn_owner, SECURITY DEFINER, search_path-pinned, EXECUTE to clara_authenticated and nobody else (PUBLIC revoked, no runtime/agent/wake variant); it floors at owner, admits accounting_work only, and DELEGATES to clara.activate_client_egress_purpose so the audit row, the egress.purpose_activated event and the op_key idempotency have exactly one implementation. Both 0195 doors now name the recovery path and its distinction from restore, and both bodies still hash to their pinned pre-state. 0020''s ck_egress_dispatch_authorizations_one_terminal is untouched: live-at-write stays enforced by the two joins in the recut posting core.';
end
$w812_tail$;
