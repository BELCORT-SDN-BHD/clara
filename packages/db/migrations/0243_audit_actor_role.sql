-- 0243_audit_actor_role — #912 (rider; wave 2 lane 02): THE ROLE THE ACTOR HELD AT THE INSTANT OF
-- A GOVERNED ACT, RECORDED ON THE AUDIT ROW.
-- =====================================================================================
-- Spec of record: issue #912's Agent Brief (triage comment, 2026-09-17) AS AMENDED by the OWNER
-- RULING of 2026-09-18 on the same issue, which chose between the brief's two shapes: "the shared
-- audit writer records the actor's role at write time on clara.audit_log (new nullable column;
-- pre-mechanism rows stay null and read as 'unknown'); NO membership-history relation."
--
-- THE GAP, AS TRIAGE MEASURED IT (verified again here, on this rig, before authoring):
-- `clara.firm_memberships` has NO history -- `clara.set_member_role` (0004:445) UPDATEs the role
-- in place and `clara.remove_member` (0004:472) flips status in place -- and `clara.audit_log`
-- (0002:275-288) carried no role column. So after any promotion or demotion, "what authority did
-- this act actually run under" was unanswerable. 0220's own firm register says so in the file:
-- its `promoter_role_now` is READ AT QUERY TIME from the live roster and is labelled `_now`
-- precisely because the role at the instant was not reconstructible.
--
-- WHAT THIS FILE DOES, IN THREE SENTENCES. (1) `clara.audit_log` gains ONE nullable `actor_role`
-- column under its own CHECK. (2) A BEFORE INSERT row trigger on that table -- the write path
-- EVERY governed door reaches through `clara._audit`, the sole writer -- resolves the actor's
-- live role in the act's own firm and stamps it on the row, so all 304 doors inherit the column
-- with NO per-door change (the ruling's own acceptance criterion). (3) The firm register cites it
-- (§C) beside the promoter's CURRENT role, as two facts, over one new index that keeps that
-- citation from costing a sequential scan of the whole audit log.
--
-- WHY THE TRIGGER AND NOT A RECUT OF `clara._audit`, WHICH IS WHAT THE RULING NAMES. Because
-- `clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)` IS A FROZEN BODY and the estate refuses to
-- let this file change it. It is ordinal 10 of the `metric_input_snapshot` v1 producer closure:
-- `clara.metric_input_producer_version_members` pins `sha256(pg_get_functiondef(...))` for each of
-- the 15 members, `clara.verify_metric_input_producer_freeze()` (0058/0060) raises
-- `metric input producer freeze mismatch` on any drift AND hard-codes that 15-signature roster in
-- its own body, and `scripts/migrate.mjs`'s FREEZE_GUARDS re-reads every protected row's evidence
-- before and after each migration. Measured, not assumed: an earlier draft of this file DID recut
-- `_audit`, and the runner rolled the whole migration back with "metric input producer protected
-- freeze evidence changed during the migration — refusing to migrate". There is no version-bump
-- escape either: the freeze reads the LIVE body of every version row's members, so a new producer
-- version cannot release the old one's pin. A metric snapshot's whole point is that its producer
-- closure can be re-executed byte-for-byte years later; that guarantee outranks this ticket.
--
-- The trigger honours every clause of the ruling and is strictly WIDER than the recut would have
-- been: the stamp is on the TABLE's own write path, so it reaches any writer, not only the one
-- function. `clara._audit` is left byte-for-byte as 0004 wrote it -- §0 and §Z both pin it -- and
-- that frozen body is also what makes the column unforgeable: `_audit`'s INSERT column list does
-- not name `actor_role` and now can never be made to.
--
-- THE THREE-WAY THE COLUMN CARRIES, AND WHY IT IS NOT TWO. The ruling asks for NULL to mean
-- "written before the mechanism existed, so unknown". If the stamp ALSO wrote NULL whenever the
-- actor holds no active membership -- the ordinary case for the WAKE lane, whose actor is always
-- the global agent identity (0004's own lane split: "actor is ALWAYS the global agent user") --
-- then NULL would mean two different things and the ruling's "unknown" would itself be a guess.
-- So the trigger stores the literal `'none'` for "the mechanism looked and the actor held no
-- active membership in this firm", and NULL is left to mean exactly one thing:
--   NULL                          -- this row predates the column. UNKNOWN, and never guessed.
--   'none'                        -- measured at write time: no active membership in this firm.
--   viewer|bookkeeper|admin|owner -- measured at write time: the role held.
-- `'none'` is deliberately NOT a rank: `clara.role_rank('none')` is NULL (0002:326-332, the
-- `else null` arm), so nothing can accidentally compare it as authority.
--
-- NOTHING IS BACK-DATED, AND HISTORY BEING RE-LOADED IS NOT AN ACT. `alter table ... add column`
-- with no DEFAULT leaves every existing row NULL, and this file contains no UPDATE of
-- `clara.audit_log` at all -- §A measures that claim on this database rather than asserting it.
-- The trigger stamps ONLY a row whose own `at` is this transaction's `now()` or later: a row
-- arriving with a timestamp from the past is history being re-loaded (a `scripts/restore.mjs`
-- run replays a plain dump through COPY, and BEFORE INSERT row triggers fire for COPY), and
-- history is never handed a role the database did not witness. The table's append-only triggers
-- (0003, `t_audit_append_only`) refuse any later UPDATE; §Z proves they still stand.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO (the ticket's own "out of scope"). No membership
-- revision relation, no back-dating of any authority, no change to the role ladder, no
-- re-evaluation of work run under an authority later found insufficient, and no change to any
-- door's floor. It does not touch `clara.list_client_knowledge` (the ruling names only the FIRM
-- register), and it adds no grant: `clara_authenticated`'s SELECT on `clara.audit_log` is a
-- TABLE-level grant (`relacl`, measured: `clara_authenticated=r/clara_fn_owner`, with every
-- `attacl` null), so the new column is readable by exactly the audience the old ones were, under
-- the unchanged bookkeeper-floor RLS policy `p_audit_log_human` -- §Z proves both.
-- =====================================================================================

-- =====================================================================================
-- §0 — PRESTATE. Fail closed. Two legitimate live states and only two: the pristine pre-#912
-- database (first apply) or one already carrying this file's OWN effects (a #957 REDO of this
-- unedited file -- every statement below is written idempotent so that redo is safe).
--
-- The prosrc pin is MEASURED ON THIS RIG NOW, per the wave-2 work order's rule for a lane whose
-- earlier tickets may already have recut a shared body. #898 (0240) recut
-- `clara._knowledge_assert_value`, NOT `clara._audit`; `clara._audit` still carries its original
-- 0004 body (verified byte-identical to the migration text that created it), and this file's
-- whole design rests on it STAYING that body -- so ITS pin is a single hard value rather than a
-- pre/post pair. `clara.list_firm_knowledge`, which §C DOES recut, gets the ordinary pre/post
-- pair; its live body was likewise verified byte-identical to 0220's own text before §C was
-- built from that text.
-- =====================================================================================
do $prestate$
declare
  v_audit_sha text; v_register_sha text;
  v_col_type text; v_col_nullable text; v_col_default text; v_found boolean;
begin
  if to_regclass('clara.audit_log') is null or to_regclass('clara.firm_memberships') is null then
    raise exception '#912 prestate: clara.audit_log or clara.firm_memberships is absent' using errcode = 'CLR10';
  end if;

  -- The column is either ABSENT (first apply) or EXACTLY the one §A installs (redo). A column of
  -- some third shape is somebody else's, and this file will not write through it.
  select true, data_type, is_nullable, column_default
    into v_found, v_col_type, v_col_nullable, v_col_default
    from information_schema.columns
   where table_schema = 'clara' and table_name = 'audit_log' and column_name = 'actor_role';
  if coalesce(v_found, false)
     and (v_col_type, v_col_nullable, v_col_default) is distinct from ('text', 'YES', null) then
    raise exception '#912 prestate: clara.audit_log.actor_role exists with an unexpected shape (data_type=%, is_nullable=%, column_default=%) -- re-author against the live column',
      v_col_type, v_col_nullable, v_col_default using errcode = 'CLR10';
  end if;

  -- THE FROZEN WRITER, UNTOUCHED. This file's design depends on `clara._audit` still carrying its
  -- 0004 body: that is what makes the column unforgeable (its INSERT column list cannot name
  -- `actor_role`) and it is what the metric-input-producer freeze pins. A drifted body here means
  -- somebody has already broken that freeze, and this file must not build on it.
  select encode(sha256(prosrc::bytea), 'hex') into v_audit_sha
    from pg_proc where oid = 'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)'::regprocedure;
  if v_audit_sha <> '000c730cd29d6544b014ecb0635fc30d9a238f23cdbd8d224ae8f4331086e2f1' then
    raise exception '#912 prestate: clara._audit carries prosrc sha256 %, not the 0004 body this file was authored against -- it is a frozen metric-input-producer member and must not have moved', v_audit_sha
      using errcode = 'CLR10';
  end if;

  -- …and the freeze itself is whole BEFORE this file runs, so a failure afterwards can only be
  -- this file's doing. Asked through the estate's OWN verifier rather than by re-deriving the
  -- member hashes here: that function is the definition of the check (it raises
  -- `metric input producer freeze mismatch`), and re-implementing it in this file would be a
  -- second opinion that could drift from the one the migration runner actually enforces.
  perform clara.verify_metric_input_producer_freeze();

  -- THE REGISTER §C RECUTS. Either the pristine 0220 body (first apply) or the exact body §C
  -- installs (a redo of this unedited file, whose `create or replace` is a no-op). Any third body
  -- belongs to somebody else and would be silently overwritten by §C -- so it is refused instead.
  select encode(sha256(prosrc::bytea), 'hex') into v_register_sha
    from pg_proc where oid = 'clara.list_firm_knowledge()'::regprocedure;
  if v_register_sha not in ('caea06da6e33a5c173a88ee7b5fe2327caa714d1df797ae148ed07c35a548797',
                            'ad8aaed83a289679b16efb0668abfeafcaa7538e9a2baf8452e3c237406a9b31') then
    raise exception '#912 prestate: clara.list_firm_knowledge carries prosrc sha256 %, neither the 0220 pin nor the post-recut pin this file was authored against -- re-author §C against the live body', v_register_sha
      using errcode = 'CLR10';
  end if;

  raise notice '#912 prestate: clean -- clara.audit_log.actor_role is absent or already this file''s own column, clara._audit is byte-for-byte its 0004 body, no frozen producer member drifts, and clara.list_firm_knowledge carries either the 0220 pin or this file''s own recut.';
end
$prestate$;

-- =====================================================================================
-- §A — THE COLUMN. Table-owner DDL (clara.audit_log is owned by clara_fn_owner), exactly like
-- 0002's own `create table` for this relation.
-- =====================================================================================
set role clara_fn_owner;

do $column$
declare v_present boolean; v_total bigint; v_with_role bigint;
begin
  select exists (select 1 from information_schema.columns
                  where table_schema = 'clara' and table_name = 'audit_log' and column_name = 'actor_role')
    into v_present;

  if not v_present then
    -- NO DEFAULT, deliberately: every row already in the table stays NULL, which is this
    -- mechanism's word for "unknown". A DEFAULT would hand every historical row a value the
    -- database never observed. (A DEFAULT could not have been right anyway: a column default
    -- cannot see the row's own `firm_id` and `actor`, which is exactly what the role depends on.)
    alter table clara.audit_log add column actor_role text;

    -- THE NO-BACKFILL CLAIM, MEASURED rather than asserted, in the same transaction that mints
    -- the column: if a later editor ever adds an UPDATE to this file, this raise is what stops it.
    select count(*), count(*) filter (where actor_role is not null)
      into v_total, v_with_role from clara.audit_log;
    if v_with_role <> 0 then
      raise exception '#912 §A: % of the % audit row(s) that predate this migration carry a role -- this file writes none, and no history row may be given a guess',
        v_with_role, v_total using errcode = 'CLR10';
    end if;
    raise notice '#912 §A: clara.audit_log.actor_role added; all % pre-existing row(s) stay NULL (unknown), none back-filled.', v_total;
  else
    raise notice '#912 §A: clara.audit_log.actor_role is already present -- a #957 redo of this unedited file. The column and every row in it are left exactly as they are.';
  end if;
end
$column$;

-- The CHECK, dropped-then-added so the statement pair is its own redo guard. `'none'` is the
-- measured "no active membership" marker the header explains; NULL (pre-mechanism) is admitted by
-- the first arm, never by the IN list.
alter table clara.audit_log drop constraint if exists ck_audit_log_actor_role;
alter table clara.audit_log add constraint ck_audit_log_actor_role
  check (actor_role is null or actor_role in ('viewer','bookkeeper','admin','owner','none'));

comment on column clara.audit_log.actor_role is
  '#912: the role `actor` held in `firm_id` AT WRITE TIME, stamped by clara._tf_audit_actor_role. '
  'NULL means the row predates this mechanism (unknown -- never a guess); ''none'' means the '
  'mechanism looked and the actor held no active membership in this firm (the wake lane''s agent '
  'identity); otherwise one of viewer/bookkeeper/admin/owner. Never back-dated, never updated.';

-- =====================================================================================
-- §B — THE STAMP. One BEFORE INSERT row trigger on clara.audit_log. Every governed door reaches
-- this write path through `clara._audit` (§Z censuses that it is the sole writer), so all 304
-- callers inherit the column without a single per-door edit — and without touching the frozen
-- `_audit` body the header explains.
-- =====================================================================================
create or replace function clara._tf_audit_actor_role() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $tf$
declare v_role text;
begin
  -- HISTORY BEING RE-LOADED IS NOT AN ACT. `at` defaults to now() and is filled in before this
  -- trigger runs, so an ordinary audit write carries exactly this transaction's timestamp. A row
  -- arriving with an OLDER one is a restore replaying a dump (scripts/restore.mjs pipes a plain
  -- dump through psql, and BEFORE INSERT row triggers fire for COPY) or a rig minting a
  -- pre-mechanism world: either way the database did not witness that act and must not invent a
  -- role for it. Left exactly as it arrived -- NULL stays NULL, and NULL still means unknown.
  if new.at is null or new.at < now() then return new; end if;

  -- THE ROLE AT THE INSTANT. Read from the LIVE roster inside the same transaction as the act
  -- itself, so a demotion a second later cannot change what this row says. The lookup is
  -- firm-pinned (`m.firm_id = new.firm_id`): a role is a fact about one firm, and the act's own
  -- firm is the only one this row may speak for.
  select m.role into v_role
    from clara.firm_memberships m
   where m.firm_id = new.firm_id and m.user_id = new.actor and m.status = 'active'
   limit 1;

  -- UNCONDITIONAL for an act happening now: whatever the caller supplied is replaced by what the
  -- database measures, so no writer can assert an authority it did not hold. No active membership
  -- is stored as the literal 'none' so that NULL in this column keeps exactly one meaning: the
  -- row predates the column.
  new.actor_role := coalesce(v_role, 'none');
  return new;
end $tf$;

revoke all on function clara._tf_audit_actor_role() from public;

drop trigger if exists t_audit_actor_role on clara.audit_log;
create trigger t_audit_actor_role
  before insert on clara.audit_log
  for each row execute function clara._tf_audit_actor_role();

reset role;

-- =====================================================================================
-- §C — THE REGISTER CITES IT. `clara.list_firm_knowledge`'s authority block gains ONE key beside
-- the promoter's current role. Everything else in this body is 0220's, byte for byte: the recut
-- is a full `create or replace` of the whole function (idempotent, so a #957 redo of this file is
-- a no-op) whose text was taken from 0220 itself and verified byte-identical to the LIVE prosrc
-- before the one key was spliced in. §0 pins both the pre- and the post-recut body.
--
-- THE INDEX IS NOT DECORATION. The new key is a correlated lookup into clara.audit_log, which on
-- this rig alone already holds ~66.9k rows and grows with every governed act in the estate; the
-- table carried exactly one index (its primary key) before this file. Without this one, each
-- firm-scope rule on the register costs a sequential scan of the whole audit log. The predicate
-- keeps the index to the knowledge-revision rows the register can actually match.
-- =====================================================================================
set role clara_fn_owner;

create index if not exists ix_audit_log_knowledge_revision
  on clara.audit_log (firm_id, (args ->> 'revision_id'))
  where args ->> 'revision_id' is not null;

create or replace function clara.list_firm_knowledge() returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $read$
declare c record; v_rows jsonb; v_version bigint; v_today date;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  v_today := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  -- THE WATERMARK SPANS EVERY FIRM-SCOPE REVISION, not the rows this read emits — a withdrawal
  -- appends a revision and removes a live row, so a max over the emitted set would move the number
  -- BACKWARDS across the one event most likely to matter (`list_client_knowledge`'s own reason,
  -- 0192:1332-1338, applied to this register's scope).
  select coalesce(max(r.knowledge_version), 0) into v_version
    from clara.knowledge_records r
   where r.firm_id = c.firm and r.scope_kind = 'firm';
  select coalesce(jsonb_agg(j order by knowledge_key, recorded_at desc), '[]'::jsonb)
    into v_rows
    from (
      select clara._knowledge_row_json(r)
          || jsonb_build_object(
               'asserted_by_name', u.display_name,
               'key_description', kk.description,
               'value_shape', kk.value_shape,
               'validated_against', kk.validated_against,
               'authority_bearing', kk.authority_bearing,
               'firm_defaultable_reason', e.eligible_reason,
               'in_effect_today', (r.state = 'live'
                 and (r.effective_from is null or r.effective_from <= v_today)
                 and (r.effective_to is null or r.effective_to >= v_today)),
               'authority', jsonb_build_object(
                 'promoter', r.asserted_by,
                 'promoter_name', u.display_name,
                 'recorded_via', r.recorded_via,
                 'recorded_at', r.recorded_at,
                 'reason', r.basis,
                 'required_role', clara._knowledge_floor(r.knowledge_key, 'firm'),
                 -- #912 — THE ROLE AT THE ACT, from the audit row the promotion itself wrote.
                 -- `clara._knowledge_insert_revision` (0192:866) audits EVERY knowledge revision
                 -- with that revision's own id in `args.revision_id`, so this join is exact: one
                 -- revision, one row, no window to widen. `a.actor` is re-checked against
                 -- `r.asserted_by` because the promotion lane audits each record under the
                 -- ANSWERER (0192:1713-1725) -- reporting somebody else's role would be worse
                 -- than reporting none. NULL means the act predates clara.audit_log.actor_role
                 -- (0243) and is UNKNOWN, never a guess, and never `promoter_role_now` under
                 -- another name: the two are separate facts and the surface renders them as two.
                 'promoter_role_at_act', (select a.actor_role from clara.audit_log a
                                           where a.firm_id = r.firm_id
                                             and a.args ->> 'revision_id' = r.id::text
                                             and a.actor is not distinct from r.asserted_by
                                           order by a.id limit 1),
                 'promoter_role_now', (select m.role from clara.firm_memberships m
                                        where m.firm_id = r.firm_id and m.user_id = r.asserted_by
                                        order by (m.status = 'active') desc, m.created_at desc
                                        limit 1),
                 'promoter_active', exists (select 1 from clara.firm_memberships m
                                             where m.firm_id = r.firm_id and m.user_id = r.asserted_by
                                               and m.status = 'active')),
               'exception_count', (
                 select count(*)::int from clara.knowledge_records o
                  where o.firm_id = c.firm and o.scope_kind = 'client' and o.state = 'live'
                    and o.knowledge_key = r.knowledge_key
                    and o.applies_when_digest = r.applies_when_digest),
               'exceptions', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'client_id', o.client_id, 'client_name', cl.name,
                          'record_id', o.record_id, 'value', o.value,
                          'recorded_at', o.recorded_at) order by cl.name, o.recorded_at desc), '[]'::jsonb)
                   from clara.knowledge_records o
                   join clara.clients cl on cl.id = o.client_id
                  where o.firm_id = c.firm and o.scope_kind = 'client' and o.state = 'live'
                    and o.knowledge_key = r.knowledge_key
                    and o.applies_when_digest = r.applies_when_digest),
               'live_work', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'work_id', w.id, 'client_id', w.client_id, 'purpose', w.purpose,
                          'status', w.status) order by w.created_at desc), '[]'::jsonb)
                   from clara.accounting_work w
                  where w.firm_id = c.firm
                    -- The TERMINAL set 0184 itself enumerates (0184:1284); anything else is a Work
                    -- somebody may still be waiting on.
                    and w.status not in ('completed','refused','failed','cancelled','expired')
                    and exists (select 1 from clara.knowledge_records o
                                 where o.firm_id = c.firm and o.state = 'live'
                                   and o.knowledge_key = r.knowledge_key
                                   and o.source_work_id = w.id))
             ) as j,
             r.knowledge_key as knowledge_key, r.recorded_at as recorded_at
        from clara.knowledge_records r
        left join clara.users u on u.id = r.asserted_by
        left join clara.knowledge_keys kk on kk.knowledge_key = r.knowledge_key
        left join clara.knowledge_key_firm_eligibility e on e.knowledge_key = r.knowledge_key
       where r.firm_id = c.firm and r.scope_kind = 'firm' and r.superseded_at is null
    ) k;
  return jsonb_build_object('firm_id', c.firm, 'as_of', v_today,
    'knowledge_version', coalesce(v_version, 0)::text, 'records', v_rows);
end $read$;

reset role;

-- =====================================================================================
-- §Z — TAIL. Proves the column and its CHECK are exactly what §A installed; that the stamp is
-- attached by name with the posture the estate requires of a definer body; that the sole-writer
-- census still reads ONE and that one is clara._audit; that `clara._audit` itself did NOT move
-- and the metric-input-producer freeze it belongs to is still whole; that all 304 callers are
-- still callers; that §C's register recut is byte-for-byte what this file installs and kept its
-- own audience; that its index exists; that the append-only triggers still stand; and that the
-- new column is readable by exactly the audience the old ones were, through the unchanged
-- TABLE-level grant.
-- =====================================================================================
do $tail$
declare
  v_def text; v_writers text[]; v_callers int; v_sha text;
  v_args text; v_secdef boolean; v_config text[]; v_owner text; v_acl text[];
  v_relacl text[]; v_attacl_n int; v_policy text; v_triggers text[];
  v_reg_sha text; v_reg_secdef boolean; v_reg_config text[]; v_reg_owner text; v_reg_acl text[];
  v_indexdef text; v_tgtype smallint; v_tgfn text;
  v_tf_secdef boolean; v_tf_config text[]; v_tf_owner text; v_tf_acl text[];
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'clara' and table_name = 'audit_log'
                    and column_name = 'actor_role' and data_type = 'text' and is_nullable = 'YES') then
    raise exception '#912 tail: clara.audit_log.actor_role is absent or is not a nullable text column' using errcode = 'CLR10';
  end if;

  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.audit_log'::regclass and conname = 'ck_audit_log_actor_role';
  if v_def is distinct from 'CHECK (((actor_role IS NULL) OR (actor_role = ANY (ARRAY[''viewer''::text, ''bookkeeper''::text, ''admin''::text, ''owner''::text, ''none''::text]))))' then
    raise exception '#912 tail: ck_audit_log_actor_role carries an unexpected definition (%)', v_def using errcode = 'CLR10';
  end if;

  -- THE STAMP IS ATTACHED, and it is a BEFORE INSERT ROW trigger -- an AFTER trigger could not
  -- set the column at all, and a statement trigger has no row to set it on. Read off pg_trigger's
  -- own columns: `tgtype` 7 is ROW(1) | BEFORE(2) | INSERT(4), the three bits that matter, and
  -- `tgfoid` names the body by signature.
  select t.tgtype, t.tgfoid::regprocedure::text into v_tgtype, v_tgfn
    from pg_trigger t
   where t.tgrelid = 'clara.audit_log'::regclass and not t.tgisinternal and t.tgname = 't_audit_actor_role';
  if v_tgtype is distinct from 7::smallint or v_tgfn is distinct from 'clara._tf_audit_actor_role()' then
    raise exception '#912 tail: t_audit_actor_role reads (tgtype=%, fn=%) -- the stamp must be BEFORE INSERT, FOR EACH ROW, on this file''s own body', v_tgtype, v_tgfn
      using errcode = 'CLR10';
  end if;
  select p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner), p.proacl::text[]
    into v_tf_secdef, v_tf_config, v_tf_owner, v_tf_acl
    from pg_proc p where p.oid = 'clara._tf_audit_actor_role()'::regprocedure;
  if not v_tf_secdef or v_tf_config is distinct from array['search_path=clara, pg_temp']
     or v_tf_owner <> 'clara_fn_owner' then
    raise exception '#912 tail: clara._tf_audit_actor_role lacks the definer posture the estate requires (secdef=%, config=%, owner=%)', v_tf_secdef, v_tf_config, v_tf_owner
      using errcode = 'CLR10';
  end if;
  if v_tf_acl is distinct from array['clara_fn_owner=X/clara_fn_owner'] then
    raise exception '#912 tail: clara._tf_audit_actor_role is granted to % -- a trigger body is reached by the trigger, never by a caller', v_tf_acl
      using errcode = 'CLR10';
  end if;

  -- THE SOLE-WRITER CENSUS. This is what makes "every governed door inherits the column with no
  -- per-door change" a measured fact rather than a hope: every one of them writes its audit row
  -- through this one function, and that function reaches the table through the trigger above.
  select coalesce(array_agg(ns.nspname || '.' || p.proname order by p.proname), '{}')
    into v_writers
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname not in ('pg_catalog', 'information_schema')
     and p.prosrc like '%insert into clara.audit_log%';
  if v_writers is distinct from array['clara._audit'] then
    raise exception '#912 tail: clara.audit_log has % writer(s) (%) -- clara._audit must be the only one', array_length(v_writers, 1), v_writers
      using errcode = 'CLR10';
  end if;

  select count(*)::int into v_callers
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname not in ('pg_catalog', 'information_schema') and p.prosrc like '%clara._audit(%';
  if v_callers <> 304 then
    raise exception '#912 tail: % function(s) call clara._audit, not the 304 measured on this chain at 0242 -- a caller appeared or vanished while this file was authored', v_callers
      using errcode = 'CLR10';
  end if;

  -- `clara._audit` DID NOT MOVE. Signature, definer posture, grant and body, all unchanged -- so
  -- no call site can have broken and the frozen producer closure is intact.
  select pg_get_function_identity_arguments(p.oid), p.prosecdef, p.proconfig,
         pg_get_userbyid(p.proowner), p.proacl::text[], encode(sha256(p.prosrc::bytea), 'hex')
    into v_args, v_secdef, v_config, v_owner, v_acl, v_sha
    from pg_proc p where p.oid = 'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)'::regprocedure;
  if v_args <> 'p_firm uuid, p_actor uuid, p_obo uuid, p_wake_kind text, p_fn text, p_entry uuid, p_args jsonb'
     or not v_secdef or v_config is distinct from array['search_path=clara, pg_temp']
     or v_owner <> 'clara_fn_owner' or v_acl is distinct from array['clara_fn_owner=X/clara_fn_owner'] then
    raise exception '#912 tail: clara._audit''s identity moved (args=%, secdef=%, config=%, owner=%, acl=%)', v_args, v_secdef, v_config, v_owner, v_acl
      using errcode = 'CLR10';
  end if;
  if v_sha <> '000c730cd29d6544b014ecb0635fc30d9a238f23cdbd8d224ae8f4331086e2f1' then
    raise exception '#912 tail: clara._audit''s body moved to sha256 % -- this file must not touch a frozen metric-input-producer member', v_sha
      using errcode = 'CLR10';
  end if;
  perform clara.verify_metric_input_producer_freeze();

  -- §C LANDED, AND LANDED ALONE. The register carries this file's one new key and nothing else
  -- moved: the whole body is pinned, so a stray edit anywhere in 0220's 5,060 characters would
  -- fail here rather than ship.
  select encode(sha256(p.prosrc::bytea), 'hex'), p.prosecdef, p.proconfig,
         pg_get_userbyid(p.proowner), p.proacl::text[]
    into v_reg_sha, v_reg_secdef, v_reg_config, v_reg_owner, v_reg_acl
    from pg_proc p where p.oid = 'clara.list_firm_knowledge()'::regprocedure;
  if v_reg_sha <> 'ad8aaed83a289679b16efb0668abfeafcaa7538e9a2baf8452e3c237406a9b31' then
    raise exception '#912 tail: clara.list_firm_knowledge carries prosrc sha256 % after §C, not the body this file installs', v_reg_sha
      using errcode = 'CLR10';
  end if;
  if not v_reg_secdef or v_reg_config is distinct from array['search_path=clara, pg_temp', 'plan_cache_mode=force_custom_plan']
     or v_reg_owner <> 'clara_fn_owner'
     or v_reg_acl is distinct from array['clara_fn_owner=X/clara_fn_owner', 'clara_authenticated=X/clara_fn_owner'] then
    raise exception '#912 tail: clara.list_firm_knowledge''s posture moved (secdef=%, config=%, owner=%, acl=%) -- §C recuts the body, never the audience', v_reg_secdef, v_reg_config, v_reg_owner, v_reg_acl
      using errcode = 'CLR10';
  end if;

  -- …and the citation has the index it needs. Without it every firm-scope rule on the register
  -- costs a sequential scan of the whole audit log.
  select indexdef into v_indexdef from pg_indexes
   where schemaname = 'clara' and tablename = 'audit_log' and indexname = 'ix_audit_log_knowledge_revision';
  if v_indexdef is null then
    raise exception '#912 tail: ix_audit_log_knowledge_revision is absent -- the register''s audit lookup would scan the whole log' using errcode = 'CLR10';
  end if;

  -- APPEND-ONLY STILL STANDS, by trigger name, beside the new stamp: the column can never be
  -- back-filled by a later UPDATE either.
  select coalesce(array_agg(tgname order by tgname), '{}') into v_triggers
    from pg_trigger where tgrelid = 'clara.audit_log'::regclass and not tgisinternal;
  if v_triggers is distinct from array['t_audit_actor_role', 't_audit_append_only', 't_audit_no_truncate'] then
    raise exception '#912 tail: clara.audit_log''s triggers read % -- the no-backfill guarantee rests on the append-only pair', v_triggers using errcode = 'CLR10';
  end if;

  -- NO NEW AUDIENCE. The grant stays TABLE-level (so the new column is neither more nor less
  -- readable than `actor` beside it) and the bookkeeper-floor RLS policy is untouched.
  select relacl::text[] into v_relacl from pg_class where oid = 'clara.audit_log'::regclass;
  if v_relacl is distinct from array['clara_fn_owner=arwdDxtm/clara_fn_owner', 'clara_authenticated=r/clara_fn_owner'] then
    raise exception '#912 tail: clara.audit_log''s grants read % -- this file adds none', v_relacl using errcode = 'CLR10';
  end if;
  select count(*)::int into v_attacl_n from pg_attribute
   where attrelid = 'clara.audit_log'::regclass and attnum > 0 and not attisdropped and attacl is not null;
  if v_attacl_n <> 0 then
    raise exception '#912 tail: % column-level grant(s) exist on clara.audit_log -- the new column would sit outside them', v_attacl_n using errcode = 'CLR10';
  end if;
  select pg_get_expr(polqual, polrelid) into v_policy from pg_policy
   where polrelid = 'clara.audit_log'::regclass and polname = 'p_audit_log_human';
  if v_policy is distinct from '((firm_id = clara.jwt_firm()) AND (COALESCE(clara.actor_role_rank(), ''-1''::integer) >= clara.role_rank(''bookkeeper''::text)))' then
    raise exception '#912 tail: p_audit_log_human''s qual moved to % -- who may read an audit row is not this file''s to change', v_policy using errcode = 'CLR10';
  end if;

  raise notice '#912 tail: OK -- clara.audit_log.actor_role is a nullable text column under ck_audit_log_actor_role, t_audit_actor_role stamps it BEFORE INSERT, clara._audit is still the SOLE writer and still byte-for-byte its frozen 0004 body, all 304 callers are unchanged, the metric-input-producer freeze is whole, clara.list_firm_knowledge carries exactly this file''s recut over ix_audit_log_knowledge_revision, the append-only triggers stand, and no grant or policy moved.';
end
$tail$;
