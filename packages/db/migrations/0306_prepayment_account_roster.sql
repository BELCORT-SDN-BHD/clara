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

-- =====================================================================================
-- §D — clara.create_prepayment_schedule — RECUT. 0305's full body (#939's two lanes, unchanged),
-- with ONE wall added: the prepaid leg this door just picked must be on the client's prepayment
-- roster, asked BEFORE the shared negative wall. Both lanes are guarded, because the question is
-- asked after the branch on the leg either lane chose -- the same placement 0305 gave the wall and
-- for the same reason.
--
-- NOTHING ELSE IN THIS BODY MOVES. The document lane is still 0223's, the memo-only lane still
-- 0305's, the reservation still precedes the duplicate check, and every refusal token, sentence and
-- payload key is the one it was. The diff against the pinned pre-image is one `if` block and this
-- header's attribution.
-- =====================================================================================
create or replace function clara.create_prepayment_schedule(p_client uuid, p_source_entry uuid,
    p_expense_account text, p_expense_basis text, p_purpose text, p_authority_ref jsonb,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_actor uuid; v_firm uuid; v_client_firm uuid; v_client_status text;
  v_dedupe jsonb; v_sched jsonb; v_refusal text; v_lines jsonb; v_line jsonb;
  v_n int; v_total bigint; v_base bigint; v_from date; v_to date;
  v_prepaid text; v_target text; v_basis_text text;
  v_acct record; v_breach jsonb; v_period record; v_doc uuid; v_entry record;
  v_basis jsonb; v_plan jsonb; v_plan_id uuid; v_rev_id uuid; v_sid uuid;
  v_eval uuid; v_existing uuid; v_paired jsonb := '[]'::jsonb; v_x jsonb;
  v_code text; v_msg text; v_detail text; v_reason text; v_constraint text;
  v_result jsonb; v_memo text;
  -- #939 — the term provenance this door now CHOOSES rather than assumes.
  v_term_source text; v_sp_id uuid; v_st_id uuid; v_term_start date; v_term_end date;
  v_basis_kind text; v_legs int; v_leg record; v_fy record; v_st record;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'creating a prepayment schedule requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('bookkeeper')) a;

  select c.firm_id, c.status into v_client_firm, v_client_status from clara.clients c where c.id = p_client;
  if v_client_firm is null or v_client_firm <> v_firm then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new prepayment schedule' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;
  if p_purpose is null or btrim(p_purpose) = '' then
    raise exception 'a prepayment schedule needs a purpose' using errcode='CLR10',
      detail='{"reason":"invalid_purpose","constraint":"nonempty"}';
  end if;

  -- ---- THE RESERVATION, TAKEN BEFORE THE DUPLICATE CHECK, AND THE ORDER IS MEASURED. ----
  --
  -- A REPLAY OF THE SAME DECISION MUST WIN OVER "THAT PREPAYMENT ALREADY HAS A SCHEDULE". The
  -- first cut asked the duplicate question first and the two answers collided: a caller whose
  -- response was lost retried with the SAME op key and got CLR13 `prepayment_schedule_exists`
  -- instead of the schedule it had already created -- a lost response turned into a second
  -- question, which is the exact defect `_reserve_op` exists to prevent. Measured by
  -- `p653.schedule.one_per_entry` before this order was written.
  --
  -- THE PAYLOAD HASH IS OVER THE CALLER'S OWN ARGUMENTS ONLY, never over the derived allocation:
  -- the key identifies the DECISION a human made, and the term, the period count and the
  -- allocation are OUTPUTS of that decision. Hashing an output would make the same decision
  -- collide with itself whenever the document's term was corrected in between.
  --
  -- A REFUSAL BELOW COSTS NOTHING. Every raise from here on aborts the statement's transaction and
  -- takes this reservation row with it, so the caller may fix the input and retry under the SAME
  -- key. That is why validating after reserving is safe here even though 0193's own doors validate
  -- first -- and it is stated rather than left to be inferred.
  v_dedupe := clara._reserve_op(v_firm, 'create_prepayment_schedule', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'source_entry', p_source_entry,
      'expense_account', nullif(btrim(coalesce(p_expense_account,'')),''),
      'expense_basis', nullif(btrim(coalesce(p_expense_basis,'')),''),
      'purpose', btrim(p_purpose), 'authority', p_authority_ref)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this prepayment-schedule key is held by an in-flight sibling'
        using errcode='CLR13', detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- ONE SCHEDULE PER RECOGNITION ENTRY. `uq_prepayment_schedules_source` is the structural
  -- backstop; this is the typed answer, and it names the schedule that already exists so the
  -- surface can send the caller there instead of offering a second configuration.
  select s.id into v_existing from clara.prepayment_schedules s
   where s.source_entry_id = p_source_entry and s.firm_id = v_firm;
  if v_existing is not null then
    raise exception 'this prepayment is already amortised by an existing schedule'
      using errcode='CLR13',
        detail=jsonb_build_object('reason','prepayment_schedule_exists',
          'schedule_id', v_existing, 'source_entry', p_source_entry)::text;
  end if;

  -- ---- #939 — WHICH LANE IS THIS RECOGNITION ON? The door reads the entry ONCE and branches on
  -- the one fact that decides it: whether it binds a document. The absent/foreign case answers
  -- with v1's OWN token and sentence, so a caller cannot tell this recut from the body it
  -- replaced on that arm.
  select je.id, je.status, je.document_id, je.posting_date into v_entry
    from clara.journal_entries je
   where je.id = p_source_entry and je.client_id = p_client and je.firm_id = v_firm;
  if v_entry.id is null then
    raise exception 'the source entry is not this client''s' using errcode='CLR10',
      detail=jsonb_build_object('reason','prepayment_source_unfit',
        'reason_text','the source entry is not this client''s',
        'source_entry', p_source_entry)::text;
  end if;

  if v_entry.document_id is not null then
    -- ================= THE DOCUMENT LANE — UNCHANGED FROM 0223 =================
    -- THE FROZEN EVALUATOR. Reached as a DEFINER owned by its own owner role: it is a registered
    -- single-member `clara.evaluator_versions` closure AND a member of the rig's closed ungranted
    -- census, so minting a grant to reach it would red the rig and editing it would red the apply.
    -- Its refusals are RETURNED rather than raised, which is exactly why they can be re-raised here
    -- with their own payloads intact.
    v_sched := clara.prepayment_schedule_v1(p_client, p_source_entry);
    v_refusal := v_sched ->> 'refusal';
    if v_refusal is not null then
      raise exception '%', coalesce(v_sched ->> 'reason', 'this prepayment cannot be scheduled')
        using errcode='CLR10',
          detail=(jsonb_build_object('reason', v_refusal,
                    'reason_text', v_sched ->> 'reason')
                  || (v_sched - 'refusal' - 'reason' - 'schedule_version'))::text;
    end if;

    -- THE TERM CARRIER THE EVALUATOR ACTUALLY RODE, re-read here so the schedule row names the exact
    -- `clara.document_service_periods` row rather than "whatever is live at read time". A later
    -- correction supersedes that row; this schedule keeps naming the one it was derived from.
    v_doc := v_entry.document_id;
    select sp.id, sp.period_start, sp.period_end, sp.basis_kind, sp.basis into v_period
      from clara.document_service_periods sp
     where sp.document_id = v_doc and sp.superseded_at is null;
    if v_period.id is null then
      -- Unreachable behind the evaluator's own `prepayment_term_underivable` arm; asserted rather
      -- than assumed, because a schedule row whose `service_period_id` were NULL would be a derived
      -- record that cannot say what it was derived from.
      raise exception 'no live service period is recorded for the document this entry binds'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_term_underivable',
            'missing','document_service_periods','document_id', v_doc)::text;
    end if;
    v_term_source := 'document_service_period';
    v_sp_id       := v_period.id;
    v_st_id       := null;
    v_term_start  := v_period.period_start;
    v_term_end    := v_period.period_end;
    v_basis_kind  := v_period.basis_kind;
  else
    -- ================= #939 — THE MEMO-ONLY LANE =================
    -- (a) THE SOURCE MUST HAVE POSTED. v1's first arm, its token and its sentence verbatim.
    if v_entry.status <> 'approved' then
      raise exception 'a prepayment schedule amortises a POSTED entry; this one is %', v_entry.status
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_source_unfit',
            'reason_text','a prepayment schedule amortises a POSTED entry; this one is ' || v_entry.status,
            'source_entry', p_source_entry, 'status', v_entry.status)::text;
    end if;
    -- (b) THE PREPAID-ASSET LEG must be UNAMBIGUOUS: exactly one debited asset line. Zero or many
    -- is a refusal, never a guess -- picking one of two candidate legs would be the surface
    -- choosing a number. v1's second arm, asked HERE because v2 reads no table.
    select count(*)::int into v_legs
      from clara.journal_lines jl
      join clara.coa_accounts ca
        on ca.client_id = jl.client_id and ca.account_code = jl.account_code
     where jl.entry_id = p_source_entry and jl.debit_cents > 0 and ca.account_type = 'asset';
    if v_legs <> 1 then
      raise exception '%', case when v_legs = 0 then 'the source entry debits no asset account'
                                else 'the source entry debits more than one asset account, so its prepaid leg is ambiguous' end
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_source_unfit',
            'reason_text', case when v_legs = 0 then 'the source entry debits no asset account'
                                else 'the source entry debits more than one asset account, so its prepaid leg is ambiguous' end,
            'source_entry', p_source_entry, 'candidate_legs', v_legs)::text;
    end if;
    select jl.account_code, jl.debit_cents into v_leg
      from clara.journal_lines jl
      join clara.coa_accounts ca
        on ca.client_id = jl.client_id and ca.account_code = jl.account_code
     where jl.entry_id = p_source_entry and jl.debit_cents > 0 and ca.account_type = 'asset';

    -- (c) THE TERM. This is the arm the whole ticket is about: before #939 the answer here was
    -- `prepayment_term_underivable` naming `journal_entries.document_id`, which told a firm its
    -- prepayment could never be amortised at all. It now names the CARRIER and the DOOR that
    -- fills it, so the person's next act is one call -- 0140's own "the refusal NAMES what to
    -- record and where", finally true for this lane too.
    select t.id, t.period_start, t.period_end into v_st
      from clara.prepayment_stated_terms t
     where t.source_entry_id = p_source_entry and t.superseded_at is null;
    if v_st.id is null then
      raise exception 'this recognition binds no document and nobody has stated its service period'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_term_underivable',
            'reason_text','this recognition binds no document and nobody has stated its service period',
            'missing','prepayment_stated_terms',
            'remedy','clara.record_prepayment_stated_term',
            'source_entry', p_source_entry)::text;
    end if;

    -- (d) THE FY ARM. v1's third arm, and it is a SELF-HEALABLE state rather than a dead end: the
    -- successor year can be opened and the call retried.
    select fy.id, fy.starts_on, fy.ends_on into v_fy
      from clara.fiscal_years fy
     where fy.client_id = p_client
       and v_entry.posting_date between fy.starts_on and fy.ends_on;
    if v_fy.id is null then
      raise exception 'the source entry does not sit inside any opened fiscal year for this client'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_term_underivable',
            'reason_text','the source entry does not sit inside any opened fiscal year for this client',
            'missing','fiscal_years','source_entry', p_source_entry)::text;
    end if;
    if v_st.period_end > v_fy.ends_on
       and not exists (select 1 from clara.fiscal_years nx
                        where nx.client_id = p_client and nx.starts_on > v_fy.ends_on
                          and nx.status in ('open', 'reopened')) then
      raise exception 'the term runs past this fiscal year and no successor year is open yet'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_term_underivable',
            'reason_text','the term runs past this fiscal year and no successor year is open yet',
            'missing','fiscal_years.successor','fy_ends_on', v_fy.ends_on,
            'period_end', v_st.period_end, 'source_entry', p_source_entry)::text;
    end if;

    -- (e) THE SECOND EVALUATOR, with the leg and the term this door just picked. A prepaid ASSET
    -- is released by CREDIT, which is why the side is stated here rather than defaulted there.
    v_sched := clara.prepayment_schedule_v2(v_leg.debit_cents, v_leg.account_code, 'credit',
      v_st.period_start, v_st.period_end);
    v_refusal := v_sched ->> 'refusal';
    if v_refusal is not null then
      raise exception '%', coalesce(v_sched ->> 'reason', 'this prepayment cannot be scheduled')
        using errcode='CLR10',
          detail=(jsonb_build_object('reason', v_refusal,
                    'reason_text', v_sched ->> 'reason')
                  || (v_sched - 'refusal' - 'reason' - 'schedule_version'))::text;
    end if;
    v_term_source := 'human_stated';
    v_sp_id       := null;
    v_doc         := null;
    v_st_id       := v_st.id;
    v_term_start  := v_st.period_start;
    v_term_end    := v_st.period_end;
    -- The carrier column keeps its meaning: a HUMAN said this, rather than an extraction having
    -- read it off a page. The stated-term lane has no 'extracted' arm at all.
    v_basis_kind  := 'human_stated';
  end if;

  v_lines   := v_sched -> 'period_lines';
  v_n       := (v_sched ->> 'period_count')::int;
  v_total   := (v_sched ->> 'total_cents')::bigint;
  -- v1 names the released leg `prepaid_account_code`; v2 names it `release_account_code`, because
  -- the leg it releases may be a liability. ONE local either way.
  v_prepaid := coalesce(v_sched ->> 'prepaid_account_code', v_sched ->> 'release_account_code');

  -- ---- #940 — THE ROSTER IS ASKED FIRST, AND THE WALL AFTERWARDS. ----
  --
  -- WHAT THIS CLOSES, and it is 0223's own carried-forward note rather than a new worry. The wall
  -- below is NEGATIVE — is this leg ineligible? — so an ordinary asset account with no class, no
  -- bank stamp and no reserved role passes it, on BOTH lanes. A utility deposit, an inventory
  -- purchase and a prepaid tax all satisfy every predicate this door had, and each one could be
  -- amortised into expense for a whole stated term with every entry balanced and every period
  -- receipted. The missing half was a POSITIVE statement that this account holds prepayments, and
  -- 0306 carries it: a per-client roster, enrolled by a bookkeeper with a stated reason.
  --
  -- WHY THE ORDER IS ROSTER-THEN-WALL (the brief's own words, and owner decision 6 behind them).
  -- Every reason an account can NEVER be enrolled — unknown, inactive, control-class, bank-bound,
  -- reserved by the fixed-asset or staff-advance roster — is answered at the ENROLMENT door, with
  -- a stated reason, where the person is deciding about the account. Here the person is amortising
  -- a prepayment, and the one useful answer is "this account is not on the roster; here is where
  -- to put it". So an account that fails both is told about the roster, and the wall still guards
  -- the accounts the roster admits (an account enrolled while eligible can be bound as a bank
  -- account the next day).
  --
  -- THE TOKEN IS 0140'S OWN `prepayment_source_unfit` WITH A NEW AXIS. The brief's line is "its
  -- ineligibility refusal gains a not-enrolled axis that names the roster panel" — one axis, not a
  -- second vocabulary, so every surface already rendering this refusal renders this one.
  --
  -- ONE SPELLING, THREE CALLERS. `clara._prepayment_account_enrolled` is the same predicate §G's
  -- arm B asks, so the band can never advertise a recognition this door would refuse; #915's OBO
  -- twin and #941's deferred-revenue mirror ask it too, with their own purpose.
  --
  -- A SCHEDULE ALREADY RUNNING IS NEVER RE-CHECKED (owner decision 3). This call is the only place
  -- a NEW schedule is born; nothing on the plan lane's monthly admission path asks the roster, so
  -- retiring an account closes the future and leaves the past posting to term end.
  if not clara._prepayment_account_enrolled(p_client, v_prepaid, 'prepayment') then
    raise exception 'account % is not enrolled as a prepayment account for this client', v_prepaid
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_source_unfit',
          'reason_text','account ' || v_prepaid || ' is not enrolled as a prepayment account for this client',
          'axis','prepaid_account_not_enrolled', 'prepaid_account_code', v_prepaid,
          'source_entry', p_source_entry,
          'remedy','clara.enrol_prepayment_account',
          'panel','client_registers_prepayment_accounts')::text;
  end if;

  -- ---- THE PREPAID LEG IS JUDGED TOO, BY THE ESTATE'S OWN RULE. ----
  --
  -- WHY THIS WALL EXISTS AT ALL, and it is the finding a review measured rather than a precaution.
  -- `clara.prepayment_schedule_v1` takes "the one debited asset leg" VERBATIM (0140:1046-1064) and
  -- never asks WHICH asset. Its whole predicate -- approved, binds a document, debits exactly one
  -- asset line -- is satisfied by every ordinary sales invoice (Dr trade receivables), every
  -- documented bank receipt and every fixed-asset purchase. Without this the door would accept a
  -- RECEIVABLE as a prepayment and post Dr expense / Cr receivable every month for the whole
  -- stated term, and §E's arm B would ADVERTISE those entries as "posted, not yet amortised" with
  -- a "configure the schedule" action beside them. Measured on the rig: a document-bound
  -- Dr-374-C56 invoice was accepted and its schedule credited the control account.
  --
  -- IT IS THE SAME HELPER THE EXPENSE HALF ALREADY USES (0042:643) -- `account_class is not null`
  -- (a control account), `is_bank_account` / `clara.bank_accounts`, `is_active`, and the FA
  -- role-reservation census -- so this is the estate's OWN existing eligibility rule applied to a
  -- second leg, never a second rule written here. The line is shaped as a CREDIT because that is
  -- the side every period will actually post against this account.
  --
  -- THE TOKEN IS 0140'S OWN `prepayment_source_unfit`, because that is exactly what this says: the
  -- SOURCE entry is not fit to be amortised. No new vocabulary; the web mirror and the chat-lane
  -- mirror already carry it, and `axis` says which leg so a surface can name it.
  --
  -- WHAT THIS DOES NOT CLOSE, stated rather than implied: an ordinary asset account with no class,
  -- no bank stamp and no reserved role still passes -- the wall is NEGATIVE (is this leg
  -- ineligible?) and not a POSITIVE prepayment-class roster. A roster would need a chart-level
  -- classification this estate does not carry; it is named as a follow-up rather than invented.
  --
  -- #939: it guards BOTH lanes, because it is asked AFTER the branch on the leg either lane picked.
  v_breach := clara._adj_line_eligibility_breach(p_client,
    jsonb_build_array(jsonb_build_object('account_code', v_prepaid,
      'debit_cents', 0, 'credit_cents', 1)));
  if v_breach is not null then
    raise exception 'account % holds this entry''s debited asset, and it cannot carry a prepayment', v_prepaid
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_source_unfit',
          'axis','prepaid_account_ineligible', 'prepaid_account_code', v_prepaid,
          'source_entry', p_source_entry, 'breach', v_breach)::text;
  end if;

  -- THE SIX DERIVED SCHEDULE FIELDS, every one read off the evaluator's own output: the cadence is
  -- monthly / last-day-of-month because the evaluator emits whole calendar months, the window opens
  -- on the FIRST line's `period_end` and closes on the LAST line's, `day_of_month` and
  -- `reversal_day_rule` are absent. None of them is a parameter of this door.
  v_from    := (v_lines -> 0 ->> 'period_end')::date;
  v_to      := (v_lines -> (v_n - 1) ->> 'period_end')::date;
  v_base    := (v_lines -> 0 ->> 'credit_cents')::bigint;

  -- ---- THE EXPENSE HALF, RE-DERIVED. 0140's three tokens, 0042's helper, no new vocabulary. ----
  v_target := nullif(btrim(coalesce(p_expense_account, '')), '');
  if v_target is null then
    -- The no-plausible-account arm, NOT a default path (0140:3455-3462): a lane that refused
    -- whenever it was unsure of a classification would never charge anything.
    raise exception 'no expense account was proposed for the amortisation charge'
      using errcode='CLR10',
        detail='{"reason":"prepayment_target_underivable","axis":"account_missing"}';
  end if;
  select ca.account_code, ca.account_type, ca.is_active into v_acct
    from clara.coa_accounts ca
   where ca.client_id = p_client and ca.account_code = v_target;
  if v_acct.account_code is null then
    raise exception 'this client''s chart holds no account %', v_target using errcode='CLR10',
      detail=jsonb_build_object('reason','prepayment_target_ineligible','axis','account_unknown',
        'account_code', v_target)::text;
  end if;
  if v_acct.account_type <> 'expense' then
    -- An amortisation charge is an expense. A balance-sheet target would move the prepayment
    -- sideways and never charge it (0140:3474-3480).
    raise exception 'account % is a % account; an amortisation charge is an expense', v_target, v_acct.account_type
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_target_ineligible','axis','not_expense_class',
          'account_code', v_acct.account_code, 'account_type', v_acct.account_type)::text;
  end if;
  -- THE SAME HELPER THE PROPOSE DOOR AND THE POSTER ALREADY USE, so a bank-class, control,
  -- inactive or role-reserved account refuses by the estate's OWN existing rule rather than a
  -- second one written here.
  v_breach := clara._adj_line_eligibility_breach(p_client,
    jsonb_build_array(jsonb_build_object('account_code', v_acct.account_code,
      'debit_cents', 1, 'credit_cents', 0)));
  if v_breach is not null then
    raise exception 'account % cannot carry an amortisation charge', v_target using errcode='CLR10',
      detail=(jsonb_build_object('reason','prepayment_target_ineligible') || v_breach)::text;
  end if;
  v_basis_text := nullif(btrim(coalesce(p_expense_basis, '')), '');
  if v_basis_text is null then
    -- A judgement with NO RECORDED BASIS is what this wall exists to prevent (0140:3489-3495):
    -- refuse rather than record an unexplained classification.
    raise exception 'the expense account was proposed without its stated grounds'
      using errcode='CLR10',
        detail='{"reason":"prepayment_target_underivable","axis":"basis_missing"}';
  end if;

  -- ---- THE PAIRED ALLOCATION. The evaluator's line VERBATIM plus this lane's own pairing. ----
  for v_x in select value from jsonb_array_elements(v_lines) loop
    v_paired := v_paired || jsonb_build_array(v_x
      || jsonb_build_object('amount_cents', (v_x ->> 'credit_cents')::bigint,
           'prepaid_account_code', v_prepaid, 'expense_account_code', v_acct.account_code));
  end loop;

  -- ---- THE PROPOSAL, THROUGH THE SHARED PREDICATE. ----
  v_memo := 'Prepayment amortisation: ' || btrim(p_purpose);
  v_basis := jsonb_build_object(
    'posting_date', to_char(v_from, 'YYYY-MM-DD'), 'memo', v_memo, 'currency', 'MYR',
    'lines', jsonb_build_array(
      jsonb_build_object('account_code', v_acct.account_code, 'debit_cents', v_base,
        'credit_cents', 0, 'description', 'amortisation charge'),
      jsonb_build_object('account_code', v_prepaid, 'debit_cents', 0,
        'credit_cents', v_base, 'description', 'prepaid release')));
  begin
    perform clara._assert_journal_basis(v_basis);
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text,
                            v_detail = pg_exception_detail;
    begin
      v_reason := (v_detail::jsonb) ->> 'reason';
      v_constraint := (v_detail::jsonb) ->> 'constraint';
    exception when others then
      v_reason := null; v_constraint := null;
    end;
    -- C3 (0140:3505-3523), RESTATED AS THE SHARED PREDICATE'S OWN ANSWER. One cent over two months
    -- truncates to a base of 0, so the first period's derived basis moves no money and
    -- `clara._assert_journal_basis` refuses it. That raw refusal is correct but not actionable, so
    -- it becomes F-A4's typed rung -- carrying the predicate's OWN constraint and naming it as the
    -- owner, so a reader can see this door routed through it rather than inventing a second check.
    --
    -- MEASURED, not assumed: an all-zero balanced basis is refused by 0178's PER-LINE
    -- `exactly_one_side` arm (`0178:771-775`), which fires BEFORE its `nonzero_total` arm
    -- (`0178:785-787`) can ever be reached -- every line that survives the per-line arm carries
    -- exactly one POSITIVE side, so the debit total can never be zero. C08.2's owner is confirmed
    -- to be this predicate; the arm that actually answers is `exactly_one_side`, and that is a
    -- finding about 0178 rather than about this door. The constraint is therefore CARRIED THROUGH
    -- from whatever 0178 raised rather than asserted here to be any particular word.
    if v_reason = 'invalid_basis' and v_base <= 0 then
      raise exception 'this term charges nothing in at least one period: % cents over % periods truncates to a base of 0', v_total, v_n
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_amount_below_period_granularity',
            'constraint', v_constraint, 'owner', 'clara._assert_journal_basis',
            'total_cents', v_total, 'period_count', v_n, 'base_cents', v_base)::text;
    end if;
    raise;
  end;

  -- ---- THE PLAN. Through 0193's OWN door, so the authority resolution, the schedule assertion,
  -- the basis predicate, the overlap warning and the audit row are all its, not a second copy. ----
  v_plan := clara.create_accounting_plan(
    p_client => p_client, p_kind => 'amortisation_schedule', p_purpose => btrim(p_purpose),
    p_authority_kind => 'explicit_instruction', p_authority_ref => p_authority_ref,
    p_frequency => 'monthly', p_day_rule => 'last_day_of_month', p_day_of_month => null,
    p_timezone => 'Asia/Kuala_Lumpur', p_effective_from => v_from, p_effective_to => v_to,
    p_basis => v_basis, p_reversal_day_rule => null, p_op_key => p_op_key || ':plan');
  v_plan_id := (v_plan ->> 'plan_id')::uuid;
  v_rev_id  := (v_plan ->> 'revision_id')::uuid;

  -- LOCK ORDER RUNG 1, taken here too although this door reaches no `clara.accounting_work`: the
  -- plan row is the lane's first rung (0193:253-262) and a writer that took the schedule row first
  -- would be the one that later constructs the cycle 0193 exists to prevent.
  perform 1 from clara.accounting_plans where id = v_plan_id for update;

  -- #939 — THE EVALUATOR VERSION ROW THIS SCHEDULE ACTUALLY RODE, resolved by the entrypoint
  -- signature of the evaluator the branch above chose rather than by a literal.
  select e.id into v_eval from clara.evaluator_versions e
   where e.evaluator_name = 'prepayment_schedule'
     and e.entrypoint_signature = case when v_term_source = 'human_stated'
       then 'clara.prepayment_schedule_v2(bigint,text,text,date,date)'
       else 'clara.prepayment_schedule_v1(uuid,uuid)' end
   order by e.version desc limit 1;

  -- THE STRUCTURAL BACKSTOP ANSWERS IN THE LANE'S OWN WORDS. The typed duplicate check above
  -- cannot see a WINNER THAT HAS NOT COMMITTED: two people configuring the same recognition at
  -- once both pass it, and the loser queues on `uq_prepayment_schedules_source` until the winner
  -- commits. Before this block that loser was answered a bare 23505 -- `duplicate key value
  -- violates unique constraint "uq_prepayment_schedules_source"` -- a sentence with no next act,
  -- which no surface has a case for. MEASURED by `p653.schedule.duplicate_race` behind a real lock
  -- barrier. The index is still the authority; this only re-reads the winning row and re-raises the
  -- SAME CLR13 payload the pre-check raises, so both paths are one answer.
  begin
    insert into clara.prepayment_schedules(firm_id, client_id, plan_id, plan_kind, revision,
        source_entry_id, prepaid_account_code, expense_account_code, expense_account_basis,
        service_period_id, document_id, term_start, term_end, basis_kind, period_lines,
        total_cents, period_count, remainder_placement, schedule_version, evaluator_version_id,
        created_by, term_source, stated_term_id)
      values (v_firm, p_client, v_plan_id, 'amortisation_schedule',
        (v_plan ->> 'revision')::int, p_source_entry, v_prepaid, v_acct.account_code, v_basis_text,
        v_sp_id, v_doc, v_term_start, v_term_end, v_basis_kind,
        v_paired, v_total, v_n, coalesce(v_sched ->> 'remainder_placement', 'final_period'),
        coalesce(v_sched ->> 'schedule_version', 'v1'), v_eval, v_actor,
        v_term_source, v_st_id)
      returning id into v_sid;
  exception when unique_violation then
    -- The read runs in the OUTER transaction, after the failed subtransaction rolled back, so the
    -- winner is visible by now. `v_existing` may still be null if some OTHER unique index fired --
    -- in which case the payload says so by carrying a null schedule_id rather than pretending.
    select s.id into v_existing from clara.prepayment_schedules s
     where s.source_entry_id = p_source_entry and s.firm_id = v_firm;
    raise exception 'this prepayment is already amortised by an existing schedule'
      using errcode='CLR13',
        detail=jsonb_build_object('reason','prepayment_schedule_exists',
          'schedule_id', v_existing, 'source_entry', p_source_entry,
          'raced', true)::text;
  end;

  perform clara._audit(v_firm, v_actor, null, null, 'create_prepayment_schedule', null,
    jsonb_build_object('client', p_client, 'schedule', v_sid, 'plan', v_plan_id,
      'source_entry', p_source_entry, 'service_period', v_sp_id,
      'term_source', v_term_source, 'stated_term', v_st_id,
      'expense_account', v_acct.account_code, 'periods', v_n, 'total_cents', v_total,
      'op_key', p_op_key));

  v_result := jsonb_build_object(
    'schedule_id', v_sid, 'plan_id', v_plan_id, 'revision_id', v_rev_id,
    'revision', (v_plan ->> 'revision')::int, 'status', v_plan ->> 'status',
    'kind', 'amortisation_schedule',
    'client_id', p_client, 'source_entry_id', p_source_entry, 'document_id', v_doc,
    'service_period_id', v_sp_id, 'basis_kind', v_basis_kind,
    -- #939 — WHERE THE TERM CAME FROM, in the door's own answer, so a surface never has to infer
    -- it from the absence of a document id.
    'term_source', v_term_source, 'stated_term_id', v_st_id,
    'term_start', to_char(v_term_start, 'YYYY-MM-DD'),
    'term_end', to_char(v_term_end, 'YYYY-MM-DD'),
    'prepaid_account_code', v_prepaid, 'expense_account_code', v_acct.account_code,
    'expense_account_basis', v_basis_text,
    'total_cents', v_total, 'period_count', v_n,
    'remainder_placement', coalesce(v_sched ->> 'remainder_placement', 'final_period'),
    'schedule_version', coalesce(v_sched ->> 'schedule_version', 'v1'),
    'period_lines', v_paired,
    -- THE DERIVED CADENCE, echoed so the caller can SEE that none of it was theirs to choose.
    'frequency', 'monthly', 'day_rule', 'last_day_of_month', 'day_of_month', null,
    'timezone', 'Asia/Kuala_Lumpur',
    'effective_from', to_char(v_from, 'YYYY-MM-DD'), 'effective_to', to_char(v_to, 'YYYY-MM-DD'),
    'next_occurrences', v_plan -> 'next_occurrences',
    'overlap_warning', v_plan -> 'overlap_warning',
    -- THE BOUNDARY, IN THE DOOR'S OWN ANSWER (AC4). Accepted configuration is not a posted
    -- occurrence, and recognition + configuration in ONE commit is unbuildable on v1 because the
    -- evaluator refuses a source entry that has not posted.
    'configuration_only', true);
  return clara._finish_op(v_firm, 'create_prepayment_schedule', p_op_key, v_result);
end $$;

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

  -- 5b · THE RECUT BODY. It keeps its posture and its clara_authenticated-ONLY ACL, and it
  --      actually carries this file's own attribution -- never inferred from the diff having
  --      applied. It must also still call the roster predicate: a recut that kept the comment and
  --      lost the `if` would pass an attribution test.
  if to_regprocedure('clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)') is null then
    raise exception '#940 tail: clara.create_prepayment_schedule does not resolve after the recut'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_posture from pg_proc p
   where p.oid = 'clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)'::regprocedure;
  if position('#940' in v_posture) = 0
     or position('clara._prepayment_account_enrolled(p_client, v_prepaid, ''prepayment'')' in v_posture) = 0
     or position('prepaid_account_not_enrolled' in v_posture) = 0 then
    raise exception '#940 tail: clara.create_prepayment_schedule does not carry this file''s roster gate -- the recut did not land'
      using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_authenticated',
        'clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)'::regprocedure, 'execute')
     or has_function_privilege('public',
        'clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)'::regprocedure, 'execute')
     or has_function_privilege('clara_runtime',
        'clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)'::regprocedure, 'execute') then
    raise exception '#940 tail: the recut moved clara.create_prepayment_schedule''s ACL -- this lane is human-only until #915'
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
