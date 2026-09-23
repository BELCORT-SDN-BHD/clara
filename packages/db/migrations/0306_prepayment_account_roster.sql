-- 0306_prepayment_account_roster — #940 (riders wave 4, lane 04): ANY ASSET ACCOUNT THAT SURVIVES
-- THE SHARED NEGATIVE WALL CAN BE AMORTISED INTO EXPENSE FOR TWELVE MONTHS.
-- =====================================================================================
-- Spec of record: issue #940's Agent Brief (parent #911, closed as split; owner ruling 2026-09-18,
-- option B with its six defaults).
--
-- THE GAP THIS CLOSES. `clara.prepayment_schedule_v1` (0140) takes "the one debited asset leg"
-- verbatim and never asks WHICH asset; 0223 added `clara._adj_line_eligibility_breach` (0042) on
-- that leg, and 0305 (#939) carried the same wall onto the memo-only lane. That wall is NEGATIVE —
-- not a control account, not a bank account, not inactive, not reserved by the fixed-asset or
-- staff-advance rosters — so an ordinary asset account with no class, no bank stamp and no reserved
-- role still passes. A deposit, an inventory purchase or a prepaid tax can therefore be amortised
-- into expense for twelve months with every entry balanced and every period receipted. 0223's own
-- header named the missing half and said why it had not been built: "a roster would need a
-- chart-level classification this estate does not carry".
--
-- WHY IT IS NOT A CHART CLASSIFICATION, measured rather than assumed. `coa_accounts.account_class`
-- admits only 'payable' and 'receivable', and the shared wall refuses ANY non-null class as a
-- control account — so a 'prepaid' member of that enum would make every prepaid account INELIGIBLE
-- (#911's own triage measurement, 2026-09-17). The positive classification needs its own carrier,
-- and the nearest precedent in this estate is the per-client enrolment register:
-- `clara.fa_account_profiles` (0041) and `clara.staff_advance_accounts` (0043).
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. A per-client enrolment roster —
-- `clara.prepayment_account_enrolments`, in the fixed-asset account profiles' shape, carrying a
-- PURPOSE from birth ('prepayment' | 'deferred_revenue') so the deferred-revenue mirror (#941)
-- rides the SAME roster and no second one is ever opened — its two bookkeeper-floored human doors
-- `clara.enrol_prepayment_account` / `clara.retire_prepayment_account`, and the roster question
-- asked in TWO places that must never disagree: the schedule door, ahead of the existing wall, and
-- the attention read's candidate arm.
--
-- WHAT IT DELIBERATELY DOES NOT DO.
--   · It does not change `clara._adj_line_eligibility_breach`. The negative wall is the estate's
--     own rule, shared by the adjustment lane, the expense half of this door and arm B; the roster
--     is asked BEFORE it and the wall is asked afterwards, unmoved. §0 pins its body
--     UNCONDITIONALLY, so a changed sha is always a finding.
--   · It does not re-check a schedule that already exists, back-fill the roster from history, or
--     consult the roster at monthly admission (owner decision 3). A schedule already running keeps
--     posting to term end, including on an account since retired (decision 5), and this file adds
--     nothing at all to the plan lane's admission path — which is what makes that true.
--   · It does not open the deferred-revenue purpose. The COLUMN admits it from birth (so #941 adds
--     an arm, never a second roster), and the door refuses it BY NAME with `purpose_rule_not_stated`
--     until #941 states its account-type rule (a non-control liability). Admitting a purpose whose
--     rule does not exist would let a liability be enrolled under the asset rule.
--
-- THE TWO DOORS #915 AND #941 WILL REACH. #915 gives `clara.create_prepayment_schedule` an OBO
-- twin for the conversation lane; #941 mirrors the whole lane for deferred revenue. Both land AFTER
-- this file in this same lane, and the brief's AC6 says whichever lands second carries the check
-- into the other's door. This file lands FIRST, so the check it installs is the one they carry:
-- the predicate is spelled ONCE, in `clara._prepayment_account_enrolled(client, code, purpose)`,
-- so a sibling door asks the same question by calling it rather than by copying five lines.
--
-- ==================== THE PRESTATE PINS ARE PER BODY, NOT GLOBAL ====================
-- 0305 (#939) states the reasoning in full and this file inherits it: each recut body admits
-- exactly TWO pre-images of its OWN — its measured live sha256(prosrc), or a body that already
-- carries this file's own `#940` attribution — and anything else is real drift and still refuses BY
-- NAME. The mode each body was found in is reported in the notice, so a half-and-half reading is
-- visible rather than silent. Three sibling tickets of this lane (#915, #941, #1036) recut some of
-- the same bodies immediately after this file.
--
-- REDO-SAFE BY CONSTRUCTION (#957, packages/db/README.md): `create table if not exists`,
-- `create or replace function`, `drop trigger if exists` before each `create trigger`, `drop policy
-- if exists` before each policy, and every index under `if not exists`.
-- =====================================================================================

set local statement_timeout = '20min';  -- PRECAUTIONARY, not load-bearing: this file does no
                                        -- backfill and no bulk scan. The roster is born empty, by
                                        -- owner decision 3 (no auto-enrolment from history).

-- =====================================================================================
-- §0 — PRESTATE. Every claim this file makes about what it is editing, measured BEFORE it edits.
-- =====================================================================================
do $t940_pre$
declare
  v_sha text; v_src text; v_i int;
  v_first int := 0; v_redo int := 0; v_modes text := '';
  -- THE TWO BODIES THIS FILE RECUTS, pinned by their sha256(prosrc) MEASURED ON THIS RIG after
  -- 0305 (rule: pin what is LIVE, never a literal copied from an older migration's text).
  v_recut text[][] := array[
    ['clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)',
     'd1d3b5326009c6d1149075d5fcb1c6eff943c4c59034685b59c4fa3ec0c50f4a'],
    ['clara.list_prepayment_attention(uuid)',
     '745ca3032410529233eb2bcad143553cb6a6b89026350fb5cb4450fe740093e9']
  ];
  -- …AND THE TWO NEIGHBOURS THIS FILE RELIES ON AND MUST NOT MOVE. The roster is asked BEFORE the
  -- shared negative wall and the enrolment door asks that SAME wall, so both bodies are part of
  -- this file's contract even though it edits neither. Pinned UNCONDITIONALLY — there is no redo
  -- branch, because this file never touches them in either mode, so a changed sha is always a
  -- finding.
  v_keep text[][] := array[
    ['clara._adj_line_eligibility_breach(uuid,jsonb)',
     '727fceade766c85a8fc4753d03e6e071a9008334e149266488e5d5232dd98021'],
    ['clara._acct_role_reserved(uuid,text)',
     'e1b44ed0c2449c4e4947e40b0d9d2675da73d02c7365e90453382e158ebf69cd']
  ];
begin
  if to_regclass('clara.prepayment_schedules') is null then
    raise exception '#940 prestate: clara.prepayment_schedules is absent -- 0223 must apply first'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.coa_accounts') is null then
    raise exception '#940 prestate: clara.coa_accounts is absent -- 0003 must apply first'
      using errcode='CLR10';
  end if;

  for v_i in 1 .. array_length(v_recut, 1) loop
    if to_regprocedure(v_recut[v_i][1]) is null then
      raise exception '#940 prestate: % does not resolve -- 0223/0305 must apply first', v_recut[v_i][1]
        using errcode='CLR10';
    end if;
    select p.prosrc, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src, v_sha
      from pg_proc p where p.oid = v_recut[v_i][1]::regprocedure;
    if v_sha = v_recut[v_i][2] then
      v_first := v_first + 1; v_modes := v_modes || v_recut[v_i][1] || '=FIRST ';
    elsif position('#940' in v_src) > 0 then
      v_redo := v_redo + 1; v_modes := v_modes || v_recut[v_i][1] || '=REDO ';
    else
      raise exception '#940 prestate: % has DRIFTED -- it is neither its measured pre-image nor a body this file already recut, so re-derive the recut against the live text before applying (got %)',
        v_recut[v_i][1], v_sha using errcode='CLR10';
    end if;
  end loop;

  for v_i in 1 .. array_length(v_keep, 1) loop
    if to_regprocedure(v_keep[v_i][1]) is null then
      raise exception '#940 prestate: % is absent -- 0042 must apply first', v_keep[v_i][1]
        using errcode='CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_keep[v_i][1]::regprocedure;
    if v_sha is distinct from v_keep[v_i][2] then
      raise exception '#940 prestate: % has MOVED (got %) -- this file asks it as the estate''s own rule and does not edit it; re-measure the roster''s reliance on it before applying',
        v_keep[v_i][1], v_sha using errcode='CLR10';
    end if;
  end loop;

  -- THE ROSTER IS BORN EMPTY (owner decision 3: no back-check, no automatic enrolment). On a redo
  -- it is not, and that is stated rather than silently tolerated.
  if to_regclass('clara.prepayment_account_enrolments') is null then
    raise notice '#940 prestate: FIRST APPLY -- the roster relation does not exist yet. Recut modes: %', v_modes;
  else
    select count(*)::int into v_i from clara.prepayment_account_enrolments;
    raise notice '#940 prestate: REDO -- the roster relation already exists with % row(s). Recut modes: %',
      v_i, v_modes;
  end if;
end
$t940_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — clara.prepayment_account_enrolments — THE PER-CLIENT ROSTER.
--
-- WHY PER CLIENT AND NOT A MARK ON THE FIRM'S STANDARD CHART TEMPLATE (owner decision 1). The same
-- template account is a prepayment for one client and an ordinary deposit for the next; the firm's
-- template is a starting point, not a statement about a client's books. `clara.fa_account_profiles`
-- and `clara.staff_advance_accounts` are per client for exactly this reason, and the ONE thing a
-- template mark would buy — enrolment without a decision — is the thing owner decision 4 forbids.
--
-- WHY A PURPOSE COLUMN FROM BIRTH. Deferred revenue (#941) is the mirror of this lane: a credited
-- LIABILITY released over the same term by the same evaluator. It needs the same positive roster
-- and a different account-type rule. A second relation would give two answers to one question —
-- "may this account carry a release schedule" — so the purpose is a CLOSED SET on ONE roster,
-- widened additively (owner 2026-09-18: "No second roster is ever opened").
--
-- THE SHAPE IS `clara.staff_advance_accounts`' (0043), which is itself `clara.fa_account_profiles`'
-- (0041) clone: an immutable [enrolled_at, retired_at] interval, version-forward on any change, a
-- REQUIRED non-blank attestation, a no-delete + no-truncate pair, forced RLS and a SELECT-only
-- application grant. What this roster does NOT copy is that relation's op-key columns: the
-- reservation ledger (`clara.op_receipts`) already records which decision wrote which row, and
-- 0041's own profile carries neither.
-- =====================================================================================
create table if not exists clara.prepayment_account_enrolments (
  id            uuid        primary key default gen_random_uuid(),
  firm_id       uuid        not null references clara.firms(id),
  client_id     uuid        not null,
  account_code  text        not null,
  -- THE CLOSED SET, widened ADDITIVELY. 'prepayment' is the only purpose this file's doors admit;
  -- the column admits the second from birth so #941 adds an arm rather than a relation.
  purpose       text        not null
                            check (purpose in ('prepayment', 'deferred_revenue')),
  -- THE STATED REASON (owner decision 4: "enrolment requires a one-sentence reason"). Not optional
  -- and not defaulted -- 0043's `enrolment_attestation` law verbatim.
  reason        text        not null check (btrim(reason) <> ''),
  active        boolean     not null default true,
  enrolled_at   timestamptz not null default now(),
  created_by    uuid        not null references clara.users(id),
  retired_by    uuid        references clara.users(id),
  retired_at    timestamptz,
  -- active XOR the retired pair (0041's ck_fap_retired, column for column).
  constraint ck_pae_retired check (
    (active and retired_by is null and retired_at is null)
    or (not active and retired_by is not null and retired_at is not null)),
  -- TENANCY IS STRUCTURAL, not a trusted column: the (client, firm) pair and the (client, code)
  -- pair are each ONE fact, enforced by a composite FK, so RLS's firm predicate and every reader's
  -- account predicate are provably the same tenant and the same chart.
  constraint fk_pae_client foreign key (client_id, firm_id)
    references clara.clients (id, firm_id),
  constraint fk_pae_account foreign key (client_id, account_code)
    references clara.coa_accounts (client_id, account_code),
  constraint uq_prepayment_account_enrolments_id_firm_client unique (id, firm_id, client_id)
);

-- ONE LIVE ENROLMENT PER (CLIENT, ACCOUNT, PURPOSE). Re-enrolment mints a NEW row (version-forward,
-- 0041:456-460's precedent) and retired rows are kept forever as the roster's historical intervals,
-- so the uniqueness is scoped to the LIVE population only. Two bookkeepers racing on the same
-- account serialize on the predecessor's row lock and the loser meets this index loudly rather than
-- producing a silent double-live state.
create unique index if not exists uq_prepayment_account_enrolments_live
  on clara.prepayment_account_enrolments (client_id, account_code, purpose) where active;
-- The roster question is asked per (client, code, purpose) on the schedule door's hot path and once
-- per arm-B candidate; the panel reads a client's whole live roster.
create index if not exists ix_prepayment_account_enrolments_live
  on clara.prepayment_account_enrolments (client_id, purpose, account_code) where active;
-- A later reader that asks "was this account enrolled when that schedule was configured" reads the
-- INTERVAL, retired rows included -- 0041:472-473's ix_fa_account_profiles_interval exactly.
create index if not exists ix_prepayment_account_enrolments_interval
  on clara.prepayment_account_enrolments (client_id, enrolled_at, retired_at);

-- -------------------------------------------------------------------------------------------------
-- §A.1 — RETIRE-ONLY + APPEND-ONLY. The ONE lawful update is the retirement stamp; everything else
-- on the row is immutable from INSERT, and a row already retired is immutable outright.
--
-- 0041 and 0043 both carry NO update-transition guard at all (their own headers say so), and that
-- is the one line of their shape this file does not copy: the REASON is the fact this roster exists
-- to carry, and a reason that could be rewritten in place is not a basis, it is a label. The
-- version-forward path below never needs an in-place edit — it retires and inserts — so the guard
-- costs the doors nothing.
-- -------------------------------------------------------------------------------------------------
create or replace function clara._tf_pae_retire_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if not old.active then
    raise exception 'a retired prepayment-account enrolment is immutable'
      using errcode = 'CLR08', detail = '{"reason":"prepayment_account_enrolment_immutable"}';
  end if;
  if new.active or new.retired_by is null or new.retired_at is null
     or new.id           is distinct from old.id
     or new.firm_id      is distinct from old.firm_id
     or new.client_id    is distinct from old.client_id
     or new.account_code is distinct from old.account_code
     or new.purpose      is distinct from old.purpose
     or new.reason       is distinct from old.reason
     or new.created_by   is distinct from old.created_by
     or new.enrolled_at  is distinct from old.enrolled_at then
    raise exception 'prepayment_account_enrolments admits exactly one update: the retirement stamp (active false with retired_by and retired_at together, set once)'
      using errcode = 'CLR08', detail = '{"reason":"prepayment_account_enrolment_immutable"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_pae_retire_only() from public;

drop trigger if exists t_pae_retire_only on clara.prepayment_account_enrolments;
create trigger t_pae_retire_only before update on clara.prepayment_account_enrolments
  for each row execute function clara._tf_pae_retire_only();
drop trigger if exists t_pae_no_delete on clara.prepayment_account_enrolments;
create trigger t_pae_no_delete before delete on clara.prepayment_account_enrolments
  for each row execute function clara._tf_append_only();
drop trigger if exists t_pae_no_truncate on clara.prepayment_account_enrolments;
create trigger t_pae_no_truncate before truncate on clara.prepayment_account_enrolments
  for each statement execute function clara._tf_no_truncate();

-- -------------------------------------------------------------------------------------------------
-- §A.2 — FORCED RLS + THE POLICY PAIR, spelled exactly as clara.staff_advance_accounts' pair is:
-- the firm predicate and a SELECT-ONLY application grant. The FLOOR lives on the two doors, not on
-- the read: the Registers panel shows a client's roster to anyone who may see the client's
-- registers at all, and the acts that CHANGE it are bookkeeper work.
-- -------------------------------------------------------------------------------------------------
alter table clara.prepayment_account_enrolments enable row level security;
alter table clara.prepayment_account_enrolments force row level security;
drop policy if exists p_pae_owner on clara.prepayment_account_enrolments;
create policy p_pae_owner on clara.prepayment_account_enrolments
  for all to clara_fn_owner using (true) with check (true);
drop policy if exists p_pae_human on clara.prepayment_account_enrolments;
create policy p_pae_human on clara.prepayment_account_enrolments
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.prepayment_account_enrolments to clara_authenticated;

comment on table clara.prepayment_account_enrolments is
  '#940: the POSITIVE per-client roster of accounts a firm has enrolled as holding prepayments (purpose ''prepayment'') or deferred revenue (''deferred_revenue'', opened by #941). It gates clara.create_prepayment_schedule and the attention read''s candidate arm AHEAD of the shared negative wall clara._adj_line_eligibility_breach, which is unchanged. Version-forward, never mutated: [enrolled_at, retired_at] is an immutable interval, so the reason in force when a schedule was configured is never overwritten. Retiring closes the account to NEW schedules only -- a running schedule posts to term end (owner decision 5, 2026-09-18).';

-- =====================================================================================
-- §A.3 — clara._prepayment_account_enrolled — THE ROSTER QUESTION, SPELLED ONCE.
--
-- Three callers ask it: the schedule door (§D), the attention read's candidate arm (§E), and — when
-- they land — #915's OBO twin and #941's deferred-revenue mirror. A predicate copied into four
-- bodies is four chances to drift, and the brief's own AC6 is "the door and arm B agree both ways".
-- STABLE and ungranted: it is reached only from a definer body, exactly as the shared wall is.
-- =====================================================================================
create or replace function clara._prepayment_account_enrolled(
    p_client uuid, p_account_code text, p_purpose text)
  returns boolean
  language sql stable security definer set search_path = clara, pg_temp as $$
  select exists (
    select 1 from clara.prepayment_account_enrolments e
     where e.client_id = p_client and e.account_code = p_account_code
       and e.purpose = p_purpose and e.active);
$$;
revoke all on function clara._prepayment_account_enrolled(uuid, text, text) from public;

comment on function clara._prepayment_account_enrolled(uuid, text, text) is
  '#940: is this client''s account on the prepayment-account roster for this purpose, RIGHT NOW. The one spelling of the roster question, so the schedule door and the attention read cannot drift apart. It reads the LIVE population only -- a schedule already running is never re-checked (owner decision 3), which is why no caller on the admission path asks it.';

-- =====================================================================================
-- §B — clara.enrol_prepayment_account — THE ENROLMENT DOOR.
--
-- BOOKKEEPER FLOOR (owner decision 2: "the same floor as editing the chart and the fixed-asset
-- profiles"). clara_authenticated ONLY: no agent role, no wake role, no runtime role, no wake
-- wrapper.
--
-- THE ORDER OF ITS WALLS IS THE RULING'S OWN (decision 6): every reason an account CANNOT hold
-- prepayments is answered HERE, at enrolment, with a stated reason -- never later at the schedule
-- door, where the person is doing something else and the remedy is somewhere else.
--
-- THE FIVE NEGATIVE AXES ARE THE ESTATE'S OWN, ASKED THROUGH ITS OWN HELPER.
-- `clara._adj_line_eligibility_breach` (0042) is what the adjustment lane, the expense half of the
-- schedule door and arm B already ask; asking it here means an account that would be refused a
-- posting is refused an enrolment, by ONE rule rather than a second one written in this file. The
-- probe line is shaped as a CREDIT because that is the side every amortisation period will actually
-- post against this account.
-- =====================================================================================
create or replace function clara.enrol_prepayment_account(
    p_client uuid, p_account text, p_purpose text, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_actor uuid; v_firm uuid; v_client_firm uuid; v_client_status text;
  v_dedupe jsonb; v_code text; v_purpose text; v_reason text;
  v_breach jsonb; v_type text; v_existing record; v_id uuid;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'enrolling a prepayment account requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select a.actor, a.firm into v_actor, v_firm
    from clara._human_ctx(clara.role_rank('bookkeeper')) a;

  select c.firm_id, c.status into v_client_firm, v_client_status from clara.clients c where c.id = p_client;
  if v_client_firm is null or v_client_firm <> v_firm then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new prepayment-account enrolment' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;

  v_code    := nullif(btrim(coalesce(p_account, '')), '');
  v_purpose := nullif(btrim(coalesce(p_purpose, '')), '');
  v_reason  := nullif(btrim(coalesce(p_reason, '')), '');

  -- RESERVE-BEFORE-MUTABLE-VALIDATION (0305 §B's placement and its reasoning): the replay
  -- short-circuit sits after identity/authz and before anything reading mutable world state, so a
  -- retry of a SUCCEEDED call returns its stored receipt even though the chart moved. A FIRST call
  -- that fails a later validation raises, and the raise rolls the reservation back with it, so the
  -- caller may fix the input and retry under the SAME key.
  v_dedupe := clara._reserve_op(v_firm, 'enrol_prepayment_account', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'account', v_code,
      'purpose', v_purpose, 'reason', v_reason)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this prepayment-account enrolment key is held by an in-flight sibling'
        using errcode='CLR13', detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- WHO/REASON/WHEN is the ruled trio. A fact without its basis is REFUSED, never defaulted; the
  -- table CHECK says the same thing, and this is the door saying it by name first.
  if v_reason is null then
    raise exception 'enrolling an account as a prepayment account requires its one-line reason'
      using errcode='CLR37',
        detail='{"reason":"prepayment_account_enrolment_invalid","axis":"reason_missing"}';
  end if;
  if v_purpose is null or v_purpose not in ('prepayment', 'deferred_revenue') then
    raise exception 'a prepayment-account enrolment has purpose ''prepayment'' or ''deferred_revenue''; got %',
      coalesce(v_purpose, '<null>') using errcode='CLR37',
        detail=jsonb_build_object('reason','prepayment_account_enrolment_invalid',
          'axis','purpose_unknown', 'purpose', v_purpose)::text;
  end if;
  -- THE SECOND PURPOSE EXISTS AS A COLUMN AND NOT YET AS A RULE. #941 states the account-type rule
  -- for deferred revenue (a non-control LIABILITY) and opens this arm; until it does, admitting the
  -- purpose would enrol a liability under the asset rule below.
  if v_purpose = 'deferred_revenue' then
    raise exception 'the deferred-revenue purpose has no account-type rule on this database yet (#941 states it)'
      using errcode='CLR37',
        detail=jsonb_build_object('reason','prepayment_account_enrolment_invalid',
          'axis','purpose_rule_not_stated', 'purpose', v_purpose,
          'remedy','#941 deferred revenue')::text;
  end if;

  -- THE SHARED NEGATIVE WALL, ASKED HERE (decision 6). Unknown, inactive, control-class, bank and
  -- role-reserved accounts are refused at ENROLMENT with the wall's OWN axis carried through, so
  -- the reason a person reads is the estate's own rather than a paraphrase.
  v_breach := clara._adj_line_eligibility_breach(p_client,
    jsonb_build_array(jsonb_build_object('account_code', v_code,
      'debit_cents', 0, 'credit_cents', 1)));
  if v_breach is not null then
    raise exception 'account % cannot be enrolled as a prepayment account for this client', coalesce(v_code, '<null>')
      using errcode='CLR37',
        detail=(jsonb_build_object('reason','prepayment_account_enrolment_invalid',
                  'account_code', v_code) || v_breach)::text;
  end if;

  -- …AND THE ONE POSITIVE RULE THIS PURPOSE ADDS. A prepayment is a prepaid ASSET released by
  -- credit; an expense, income, liability or equity account could never carry one, and the door
  -- that would have refused it is three screens away.
  select ca.account_type into v_type from clara.coa_accounts ca
   where ca.client_id = p_client and ca.account_code = v_code;
  if v_type <> 'asset' then
    raise exception 'account % is a % account; a prepayment is a prepaid ASSET', v_code, v_type
      using errcode='CLR37',
        detail=jsonb_build_object('reason','prepayment_account_enrolment_invalid',
          'axis','not_asset_class', 'account_code', v_code, 'account_type', v_type,
          'purpose', v_purpose)::text;
  end if;

  -- VERSION-FORWARD, NEVER MUTATE (0041's round-3 fold F5b). An unchanged re-enrolment is
  -- idempotent and must not move the interval under live history; a RESTATED reason retires the
  -- live row and inserts a fresh one, so the basis a schedule was configured under stays readable
  -- for as long as the schedule does.
  select * into v_existing from clara.prepayment_account_enrolments
   where client_id = p_client and account_code = v_code and purpose = v_purpose and active
   limit 1 for update;
  if found and v_existing.reason = v_reason then
    v_id := v_existing.id;
  else
    if found then
      update clara.prepayment_account_enrolments
         set active = false, retired_by = v_actor, retired_at = now()
       where id = v_existing.id;
    end if;
    insert into clara.prepayment_account_enrolments(firm_id, client_id, account_code, purpose,
        reason, created_by)
      values (v_firm, p_client, v_code, v_purpose, v_reason, v_actor)
      returning id into v_id;
  end if;

  -- args stay REDACTED (ids and codes, never the reason text -- the reason lives on the row, which
  -- is the record of record; 0002's audit_log doctrine).
  perform clara._audit(v_firm, v_actor, null, null, 'enrol_prepayment_account', null,
    jsonb_build_object('client', p_client, 'account', v_code, 'purpose', v_purpose,
      'enrolment_id', v_id, 'op_key', p_op_key));

  return clara._finish_op(v_firm, 'enrol_prepayment_account', p_op_key,
    jsonb_build_object('enrolment_id', v_id, 'client_id', p_client, 'account_code', v_code,
      'purpose', v_purpose, 'reason', v_reason, 'enrolled_by', v_actor, 'active', true));
end $$;
revoke all on function clara.enrol_prepayment_account(uuid, text, text, text, text) from public;

comment on function clara.enrol_prepayment_account(uuid, text, text, text, text) is
  '#940: enrol one of this client''s accounts on the prepayment roster, with the one-line reason owner decision 4 requires. Bookkeeper floor, clara_authenticated only. Every reason an account cannot hold prepayments is answered HERE (decision 6): the shared negative wall clara._adj_line_eligibility_breach with its own axis carried through, plus the one positive rule this purpose adds (a prepaid asset). Version-forward: an unchanged re-enrolment is idempotent, a restated reason retires the live row and inserts a fresh one.';

-- =====================================================================================
-- §C — clara.retire_prepayment_account — THE RETIREMENT DOOR.
--
-- RETIRING CLOSES THE FUTURE ONLY (owner decision 5). It ends the scope in which NEW schedules may
-- be configured on this account; it touches no schedule that already exists, and nothing on the
-- plan lane's monthly admission path asks the roster at all -- which is what makes "a running
-- schedule posts to term end" true by construction rather than by a rule written somewhere.
-- =====================================================================================
create or replace function clara.retire_prepayment_account(
    p_client uuid, p_account text, p_purpose text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_actor uuid; v_firm uuid; v_client_firm uuid; v_dedupe jsonb;
  v_code text; v_purpose text; v_id uuid;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'retiring a prepayment account requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select a.actor, a.firm into v_actor, v_firm
    from clara._human_ctx(clara.role_rank('bookkeeper')) a;

  select c.firm_id into v_client_firm from clara.clients c where c.id = p_client;
  if v_client_firm is null or v_client_firm <> v_firm then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;

  v_code    := nullif(btrim(coalesce(p_account, '')), '');
  v_purpose := nullif(btrim(coalesce(p_purpose, '')), '');

  v_dedupe := clara._reserve_op(v_firm, 'retire_prepayment_account', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'account', v_code, 'purpose', v_purpose)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this prepayment-account retirement key is held by an in-flight sibling'
        using errcode='CLR13', detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  if v_purpose is null or v_purpose not in ('prepayment', 'deferred_revenue') then
    raise exception 'a prepayment-account enrolment has purpose ''prepayment'' or ''deferred_revenue''; got %',
      coalesce(v_purpose, '<null>') using errcode='CLR37',
        detail=jsonb_build_object('reason','prepayment_account_enrolment_invalid',
          'axis','purpose_unknown', 'purpose', v_purpose)::text;
  end if;

  update clara.prepayment_account_enrolments
     set active = false, retired_by = v_actor, retired_at = now()
   where client_id = p_client and account_code = v_code and purpose = v_purpose and active
   returning id into v_id;
  if v_id is null then
    raise exception 'no live prepayment enrolment stands on % for this client', coalesce(v_code, '<null>')
      using errcode='CLR37',
        detail=jsonb_build_object('reason','prepayment_account_enrolment_invalid',
          'axis','not_enrolled', 'account_code', v_code, 'purpose', v_purpose)::text;
  end if;

  perform clara._audit(v_firm, v_actor, null, null, 'retire_prepayment_account', null,
    jsonb_build_object('client', p_client, 'account', v_code, 'purpose', v_purpose,
      'enrolment_id', v_id, 'op_key', p_op_key));

  return clara._finish_op(v_firm, 'retire_prepayment_account', p_op_key,
    jsonb_build_object('enrolment_id', v_id, 'client_id', p_client, 'account_code', v_code,
      'purpose', v_purpose, 'retired_by', v_actor, 'active', false));
end $$;
revoke all on function clara.retire_prepayment_account(uuid, text, text, text) from public;

comment on function clara.retire_prepayment_account(uuid, text, text, text) is
  '#940: close a client''s account to NEW prepayment schedules. Bookkeeper floor, clara_authenticated only. Owner decision 5: a schedule already running continues to term end -- this door ends an enrolment interval and nothing else, and the plan lane''s monthly admission path never asks the roster.';

reset role;

-- THE TWO HUMAN GRANTS, minted as the migration role rather than as clara_fn_owner (0305's own
-- placement): the human lane and nobody else. clara._prepayment_account_enrolled is granted to
-- NOBODY -- it is reached only from a definer body, exactly as the shared wall is.
grant execute on function clara.enrol_prepayment_account(uuid, text, text, text, text)
  to clara_authenticated;
grant execute on function clara.retire_prepayment_account(uuid, text, text, text)
  to clara_authenticated;

-- =====================================================================================
-- §TAIL — what must be true AFTER this file, measured rather than asserted by having applied.
-- =====================================================================================
do $t940_tail$
declare v_n int; v_posture text;
begin
  -- 1 · THE RELATION EXISTS with the posture §A claims, FORCED RLS, both policies, and a
  --     SELECT-only human policy.
  if to_regclass('clara.prepayment_account_enrolments') is null then
    raise exception '#940 tail: clara.prepayment_account_enrolments does not exist' using errcode='CLR10';
  end if;
  if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'clara' and c.relname = 'prepayment_account_enrolments'
         and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception '#940 tail: clara.prepayment_account_enrolments is not RLS-forced' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'clara.prepayment_account_enrolments'::regclass
                   and polname = 'p_pae_owner')
     or not exists (select 1 from pg_policy where polrelid = 'clara.prepayment_account_enrolments'::regclass
                      and polname = 'p_pae_human' and polcmd = 'r'
                      and position('jwt_firm' in pg_get_expr(polqual, polrelid)) > 0) then
    raise exception '#940 tail: the policy pair on clara.prepayment_account_enrolments is incomplete or the human policy lost its firm predicate'
      using errcode='CLR10';
  end if;

  -- 2 · THE THREE TRIGGERS: retire-only, no delete, no truncate.
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.prepayment_account_enrolments'::regclass and not tgisinternal;
  if v_n <> 3 then
    raise exception '#940 tail: expected 3 triggers on clara.prepayment_account_enrolments, found %', v_n
      using errcode='CLR10';
  end if;

  -- 3 · THE LIVENESS INDEX IS PARTIAL, pinned by its predicate rather than by its name.
  if not exists (
      select 1 from pg_index i
       where i.indrelid = 'clara.prepayment_account_enrolments'::regclass and i.indisunique
         and position('active' in pg_get_expr(i.indpred, i.indrelid)) > 0) then
    raise exception '#940 tail: clara.prepayment_account_enrolments has no partial-unique LIVE index'
      using errcode='CLR10';
  end if;

  -- 4 · THE TWO DOORS' POSTURE AND THEIR ACL. Enrolling is human work: the human lane holds
  --     EXECUTE and no machine principal does, and no wake wrapper exists anywhere in the catalog.
  foreach v_posture in array array[
      'clara.enrol_prepayment_account(uuid,text,text,text,text)',
      'clara.retire_prepayment_account(uuid,text,text,text)'] loop
    if to_regprocedure(v_posture) is null then
      raise exception '#940 tail: % does not resolve at its exact signature', v_posture using errcode='CLR10';
    end if;
    if not exists (select 1 from pg_proc p
                    where p.oid = v_posture::regprocedure
                      and pg_get_userbyid(p.proowner) = 'clara_fn_owner' and p.prosecdef
                      and p.provolatile = 'v'
                      and coalesce(array_to_string(p.proconfig, ','), '') = 'search_path=clara, pg_temp') then
      raise exception '#940 tail: %''s owner/definer/volatility/search_path posture is wrong -- got {%}',
        v_posture,
        (select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | ' || p.provolatile::text
                || ' | ' || coalesce(array_to_string(p.proconfig, ','), '<none>')
           from pg_proc p where p.oid = v_posture::regprocedure)
        using errcode='CLR10';
    end if;
    if not has_function_privilege('clara_authenticated', v_posture::regprocedure, 'execute') then
      raise exception '#940 tail: clara_authenticated cannot execute %', v_posture using errcode='CLR10';
    end if;
    if has_function_privilege('public', v_posture::regprocedure, 'execute') then
      raise exception '#940 tail: PUBLIC can execute %', v_posture using errcode='CLR10';
    end if;
  end loop;
  foreach v_posture in array array['clara_agent_ro','clara_wake_interactive','clara_wake_proactive',
                                   'clara_runtime'] loop
    if has_function_privilege(v_posture,
          'clara.enrol_prepayment_account(uuid,text,text,text,text)'::regprocedure, 'execute')
       or has_function_privilege(v_posture,
          'clara.retire_prepayment_account(uuid,text,text,text)'::regprocedure, 'execute') then
      raise exception '#940 tail: % can execute a roster door -- enrolling is bookkeeper work', v_posture
        using errcode='CLR10';
    end if;
  end loop;
  -- …and there are EXACTLY TWO functions named for the enrolment act, by census rather than by
  -- convention: a wake wrapper or an agent core would be a third.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname ~ 'prepayment_account$';
  if v_n <> 2 then
    raise exception '#940 tail: expected exactly TWO functions named for the prepayment-account roster act, found % -- a wake wrapper or an agent core would be one of them', v_n
      using errcode='CLR10';
  end if;

  -- 5 · THE ROSTER PREDICATE IS ONE FUNCTION, UNGRANTED. It is reached only from a definer body,
  --     exactly as the shared wall is, and law 31 says do not mint a grant no consumer needs.
  if to_regprocedure('clara._prepayment_account_enrolled(uuid,text,text)') is null then
    raise exception '#940 tail: clara._prepayment_account_enrolled does not resolve' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p, aclexplode(p.proacl) a
   where p.oid = 'clara._prepayment_account_enrolled(uuid,text,text)'::regprocedure
     and pg_get_userbyid(a.grantee) <> 'clara_fn_owner';
  if v_n <> 0 then
    raise exception '#940 tail: clara._prepayment_account_enrolled holds % application grant(s)', v_n
      using errcode='CLR10';
  end if;

  -- 6 · THE SHARED NEGATIVE WALL IS EXACTLY WHERE 0042 LEFT IT, re-measured AFTER this file ran.
  --     "This file does not change the wall" is a claim, and the sha is the evidence.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_posture
    from pg_proc p where p.oid = 'clara._adj_line_eligibility_breach(uuid,jsonb)'::regprocedure;
  if v_posture is distinct from '727fceade766c85a8fc4753d03e6e071a9008334e149266488e5d5232dd98021' then
    raise exception '#940 tail: clara._adj_line_eligibility_breach moved during this file' using errcode='CLR10';
  end if;

  raise notice '#940 tail: OK -- clara.prepayment_account_enrolments exists RLS-FORCED with its owner policy and a SELECT-only firm-predicated human policy, its three retire/append-only triggers and its partial-unique live index; clara.enrol_prepayment_account and clara.retire_prepayment_account are the ONLY two functions named for the act (no wake wrapper, no agent core), are owned by clara_fn_owner as VOLATILE SECURITY DEFINERs with a pinned search_path, and are executable by clara_authenticated and by no agent, wake, runtime or PUBLIC principal; clara._prepayment_account_enrolled is the ONE spelling of the roster question and holds no application grant; and clara._adj_line_eligibility_breach is byte-identical to its pre-image -- this file did not change the shared wall.';
end
$t940_tail$;
