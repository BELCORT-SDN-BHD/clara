-- 0265_work_question_admitted_basis — #839: THE SHARED QUESTION RECORD GAINS THE ADMITTED BASIS.
-- =====================================================================================
-- Spec of record: issue #839's Agent Brief (2026-09-17) and its sequencing note (2026-09-19).
-- Domain words: CONTEXT.md — "Accounting work" (the `basis` this file projects is that word's own
-- jsonb column), "Restated work / supersedes" (what the projected basis is FOR).
--
-- WHAT THIS FILE CHANGES, IN ONE SENTENCE. `clara._work_question_record` (0180 §C, "the one record
-- every surface renders") gains ONE key, `basis` — the Work's own admitted `clara.accounting_work
-- .basis`, transcribed verbatim — beside the `basis_digest` / `work_basis_digest` pair it already
-- carried; `clara.get_work_question` and `clara.get_work_pending_question` are NOT recut at all,
-- because both already do nothing but delegate to it and return its jsonb unexamined.
--
-- WHY. #629 (0180) built the shared question record from `clara.agent_interruptions` joined to
-- `clara.accounting_work` for exactly one column, `w.status` (and, redundantly, `w.basis_digest`).
-- The Work detail (B3) can still offer "Restate as a new instruction" beside its own copy of that
-- form because `work-detail.tsx` loaded the FULL `AccountingWorkRow` — `basis` included — from a
-- separate read before it ever reached the shared panel, and mounts `RestateWorkPanel` beside it
-- rather than through it. A surface that has ONLY the shared record (B4's Needs-you row, B6's rail
-- cards) has never had that second read and could not build `restatedBasis()`'s input at all — the
-- door needs the figures already admitted, and this file is what makes them reachable from the one
-- record every surface already asks for.
--
-- THIS FILE RECUTS EXACTLY ONE BODY, AND IT IS THE UNGRANTED ONE. `_work_question_record` is
-- `revoke all ... from public` in 0180 and has never been granted to any role — it is a projection
-- helper called only from inside `get_work_question` / `get_work_pending_question`, both SECURITY
-- DEFINER. Recutting it moves nothing about who may call the two doors, what arguments they take, or
-- what role holds EXECUTE on them: their own `pg_get_functiondef` text is byte-identical before and
-- after (§T re-measures both), because neither one names a column of the record it returns — they
-- return jsonb built by the one function this file touches.
--
-- NO NEW COHORT IN packages/db/tests/rig-meta.mjs, and that is a finding rather than an omission.
-- `_work_question_record` is already listed on `WORK_QUESTIONS_0180_UNGRANTED_FNS` and stays there —
-- same name, same arity, same "ungranted" disposition — and `get_work_question` /
-- `get_work_pending_question` keep their existing membership on `WORK_QUESTIONS_0180_HUMAN_FNS`
-- unmoved. #720 (0198) recorded the identical shape for a body-only recut of a 0180 sibling
-- (`clara.expire_due_interruptions`, that file's own header, "NO COHORT, NO NEW NAME, NO GRANT
-- CHANGE") and a cohort of its own would be WRONG here for the same reason: `cohortFailures()` fails
-- a HALF-present cohort, and this file adds no name for one to be half of. See the matching
-- comment this file adds beside `WORK_QUESTIONS_0180_COHORT` in `rig-meta.mjs`.
--
-- THE FIELD IS `basis`, NOT `work_basis` — matching the web's own `WorkBasis` shape
-- (`apps/web/lib/work/types.ts`) and `RestateWorkPanel`'s prop name, so the wire key and the TS type
-- it hydrates share one word. It rides `accounting_work.basis`, which 0178 declares `not null check
-- (jsonb_typeof(basis) = 'object')` — every admitted Work carries one — so the key is never absent
-- on a row this door returns at all; the web's own type still spells it `WorkBasis | null` (matching
-- `AccountingWorkRow.basis`'s own nullability posture) because a PostgREST/RPC hop is not the place
-- to assert a NOT NULL column can never arrive as jsonb null.
--
-- =====================================================================================
-- DEPLOY ORDER. NO CONSUMER-FIRST OBLIGATION, and the ground is structural:
--
--   * the ADDED key is additive on an existing jsonb shape. A web build older than this migration
--     reads the record exactly as it does today — `WorkQuestionRecord` on that build has no `basis`
--     field to read, and ignores the extra key precisely as any jsonb consumer ignores a key it did
--     not ask for.
--   * a web build carrying THIS ticket's `basis` field, run against a database BEHIND this
--     migration, receives a record with no `basis` key at all; `record.basis` reads `undefined` in
--     that case and the restate entry point this ticket adds is gated on the key's PRESENCE
--     (`typeof record.basis === "object" && record.basis !== null`), so it renders nothing rather
--     than throwing — the same "a database below the frontier" posture `AccountingWorkRow`'s own
--     optional fields already carry (`apps/web/lib/work/types.ts`'s header).
--
-- ROLLBACK is a NEW append-only migration. An applied migration is never edited or deleted
-- (packages/db/README.md).
--
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES AT RUNTIME: NONE. `_work_question_record` is
-- a plain SQL projection with no branch and never raises; neither door it feeds changes.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is editing, measured NOW on THIS rig
-- (never transcribed from a creating migration's file text — 0227's own §0 states why: a body one
-- migration recuts can itself have been spliced by a later one, so the file text is not proof of
-- the live text).
-- =====================================================================================
do $w839_pre$
declare v_sha text; v_src text; v_n int;
begin
  -- 0.1 · the one body this file recuts, and the two it reads but does not touch, all exist.
  if to_regprocedure('clara._work_question_record(uuid)') is null then
    raise exception '#839 prestate: clara._work_question_record is absent (migration 0180 has not been applied)'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.get_work_question(uuid)') is null
     or to_regprocedure('clara.get_work_pending_question(uuid)') is null then
    raise exception '#839 prestate: the 0180 read doors are absent' using errcode='CLR10';
  end if;
  if to_regclass('clara.accounting_work') is null then
    raise exception '#839 prestate: clara.accounting_work is absent (migration 0178 has not been applied)'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from information_schema.columns
      where table_schema='clara' and table_name='accounting_work' and column_name='basis') then
    raise exception '#839 prestate: clara.accounting_work.basis is absent' using errcode='CLR10';
  end if;

  -- 0.2 · EXACTLY ONE body of the name this file recuts. A recut that landed beside the live body
  -- instead of replacing it would leave both doors calling whichever overload resolves.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='_work_question_record';
  if v_n <> 1 then
    raise exception '#839 prestate: clara._work_question_record has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;

  -- 0.3 · PRE-IMAGE sha256(prosrc) PINS, every one MEASURED on this lane's own rig (clara_l09,
  -- 0001->0234, PG 17, 2026-09-20) off pg_proc.prosrc — never transcribed from 0180's file text.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = 'clara._work_question_record(uuid)'::regprocedure;
  if v_sha is distinct from 'cb57a13128929850fde98172e05c1182c8c2b5c4ea27047c98a065d11d7bdb90' then
    raise exception '#839 prestate: clara._work_question_record has DRIFTED from its pinned pre-image (measured %, expected cb57a13128929850fde98172e05c1182c8c2b5c4ea27047c98a065d11d7bdb90) -- re-derive this file against the LIVE body before applying', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = 'clara.get_work_question(uuid)'::regprocedure;
  if v_sha is distinct from '19e4e418631d465ae0e01d43108bb7cd56f5444cb695e176d86bf1a72e33c62a' then
    raise exception '#839 prestate: clara.get_work_question has DRIFTED from its pinned pre-image (measured %, expected 19e4e418631d465ae0e01d43108bb7cd56f5444cb695e176d86bf1a72e33c62a) -- this file asserts it UNMOVED and cannot proceed against a body it does not recognise', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = 'clara.get_work_pending_question(uuid)'::regprocedure;
  if v_sha is distinct from '8a196db9bd93b471af4518c703ef117443da10379047c51bc3e65ea9d663ee06' then
    raise exception '#839 prestate: clara.get_work_pending_question has DRIFTED from its pinned pre-image (measured %, expected 8a196db9bd93b471af4518c703ef117443da10379047c51bc3e65ea9d663ee06) -- this file asserts it UNMOVED and cannot proceed against a body it does not recognise', v_sha
      using errcode='CLR10';
  end if;

  -- 0.4 · IDEMPOTENCY, measured in the live text rather than assumed: this splice has not already
  -- landed on this catalog.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._work_question_record(uuid)'::regprocedure;
  if position('''basis'', w.basis' in v_src) <> 0 then
    raise exception '#839 prestate: clara._work_question_record already projects w.basis -- this splice has already been applied'
      using errcode='CLR10';
  end if;

  raise notice '#839 prestate: clean -- clara._work_question_record exists exactly once at its pinned pre-image and does not yet project w.basis; clara.get_work_question and clara.get_work_pending_question exist at their own pinned pre-images; clara.accounting_work.basis is present.';
end
$w839_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §C′ THE RECUT. 0180 §C's body with ONE key added. Every line 0180 shipped is reproduced verbatim
-- except the one inserted line, so a diff against the prestate pin above shows exactly one addition.
--
-- `w.basis` RIDES THE SAME JOIN THE RECORD ALREADY MAKES (`join clara.accounting_work w on w.id =
-- i.work_id`, unchanged) — no new join, no new argument, no new predicate. The key is placed beside
-- `work_status` and `work_basis_digest`, the two other `w.`-sourced keys, rather than beside the
-- question's OWN `basis_digest` — it is the WORK's admitted basis, read off the Work row exactly as
-- `work_status` already is.
-- =====================================================================================
create or replace function clara._work_question_record(p_question uuid) returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $$
  select jsonb_build_object(
    'question_id', i.id,
    'work_id', i.work_id,
    'client_id', i.client_id,
    'task_id', i.task_id,
    'firm_id', i.firm_id,
    'question_version', i.question_version,
    'status', i.status,
    'question', nullif(btrim(coalesce(i.question->>'question', i.question->>'text', '')), ''),
    'context', nullif(btrim(coalesce(i.question->>'context','')), ''),
    'reason', i.reason,
    'fields', i.fields,
    'source_ref', i.source_ref,
    'basis_digest', i.basis_digest,
    'expires_at', i.expires_at,
    'created_at', i.created_at,
    'answer', i.answer,
    'answered_by', i.answered_by,
    'answered_at', i.answered_at,
    'answered_role', i.answered_role,
    'delivery_state', i.delivery_state,
    'delivery_attempts', i.delivery_attempts,
    'work_status', w.status,
    'work_basis_digest', w.basis_digest,
    -- #839 — THE ONE ADDITION. The admitted basis itself, transcribed verbatim off the Work row so
    -- a restate control anywhere this record reaches can prefill it without a second read.
    'basis', w.basis)
  from clara.agent_interruptions i
  join clara.accounting_work w on w.id = i.work_id
  where i.id = p_question and i.work_id is not null;
$$;
revoke all on function clara._work_question_record(uuid) from public;

reset role;

-- =====================================================================================
-- §T TAIL CENSUS. Re-read the COMMITTED catalog and say what it found.
-- =====================================================================================
do $w839_tail$
declare v_src text; v_n int; v_sha text; v_posture text; v_missing text;
begin
  -- 1 · still exactly ONE body, at the same signature.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='_work_question_record';
  if v_n <> 1 then
    raise exception '#839 tail: clara._work_question_record now has % bodies (expected exactly 1) -- the recut created an overload instead of replacing the live body', v_n
      using errcode='CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._work_question_record(uuid)'::regprocedure;

  -- 2 · THE ADDITION LANDED. The literal probe this whole file exists for.
  if position('''basis'', w.basis' in v_src) = 0 then
    raise exception '#839 tail: the committed body does not project w.basis -- the recut did not take'
      using errcode='CLR10';
  end if;

  -- 3 · EVERY OTHER KEY SURVIVED, key by key, against the committed text -- nothing 0180 shipped
  -- was renamed, reordered away, or dropped. One check per key, exactly as 0198's own tail does.
  v_missing := '';
  if position('''question_id'', i.id' in v_src) = 0 then v_missing := v_missing || ' question_id'; end if;
  if position('''work_id'', i.work_id' in v_src) = 0 then v_missing := v_missing || ' work_id'; end if;
  if position('''client_id'', i.client_id' in v_src) = 0 then v_missing := v_missing || ' client_id'; end if;
  if position('''task_id'', i.task_id' in v_src) = 0 then v_missing := v_missing || ' task_id'; end if;
  if position('''firm_id'', i.firm_id' in v_src) = 0 then v_missing := v_missing || ' firm_id'; end if;
  if position('''question_version'', i.question_version' in v_src) = 0 then v_missing := v_missing || ' question_version'; end if;
  if position('''status'', i.status' in v_src) = 0 then v_missing := v_missing || ' status'; end if;
  if position('''reason'', i.reason' in v_src) = 0 then v_missing := v_missing || ' reason'; end if;
  if position('''fields'', i.fields' in v_src) = 0 then v_missing := v_missing || ' fields'; end if;
  if position('''source_ref'', i.source_ref' in v_src) = 0 then v_missing := v_missing || ' source_ref'; end if;
  if position('''basis_digest'', i.basis_digest' in v_src) = 0 then v_missing := v_missing || ' basis_digest'; end if;
  if position('''expires_at'', i.expires_at' in v_src) = 0 then v_missing := v_missing || ' expires_at'; end if;
  if position('''created_at'', i.created_at' in v_src) = 0 then v_missing := v_missing || ' created_at'; end if;
  if position('''answer'', i.answer' in v_src) = 0 then v_missing := v_missing || ' answer'; end if;
  if position('''answered_by'', i.answered_by' in v_src) = 0 then v_missing := v_missing || ' answered_by'; end if;
  if position('''answered_at'', i.answered_at' in v_src) = 0 then v_missing := v_missing || ' answered_at'; end if;
  if position('''answered_role'', i.answered_role' in v_src) = 0 then v_missing := v_missing || ' answered_role'; end if;
  if position('''delivery_state'', i.delivery_state' in v_src) = 0 then v_missing := v_missing || ' delivery_state'; end if;
  if position('''delivery_attempts'', i.delivery_attempts' in v_src) = 0 then v_missing := v_missing || ' delivery_attempts'; end if;
  if position('''work_status'', w.status' in v_src) = 0 then v_missing := v_missing || ' work_status'; end if;
  if position('''work_basis_digest'', w.basis_digest' in v_src) = 0 then v_missing := v_missing || ' work_basis_digest'; end if;
  if position('join clara.accounting_work w on w.id = i.work_id' in v_src) = 0 then v_missing := v_missing || ' the-join'; end if;
  if position('where i.id = p_question and i.work_id is not null' in v_src) = 0 then v_missing := v_missing || ' the-where'; end if;
  if v_missing <> '' then
    raise exception '#839 tail: the recut LOST key(s)/clause(s):% -- only the basis addition may change', v_missing
      using errcode='CLR10';
  end if;

  -- 4 · POSTURE, read from the catalog: owner, SECURITY DEFINER, pinned search_path, and the EXACT
  -- ACL (grantor included) -- STILL UNGRANTED to every role, exactly as 0180 left it.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara._work_question_record(uuid)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner' then
    raise exception '#839 tail: clara._work_question_record has the wrong posture -- expected owner clara_fn_owner, SECURITY DEFINER, search_path=clara, pg_temp and NO grant to any role; got {%}', v_posture
      using errcode='CLR10';
  end if;

  -- 5 · THE SHA MOVED (the recut actually changed the body)…
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = 'clara._work_question_record(uuid)'::regprocedure;
  if v_sha = 'cb57a13128929850fde98172e05c1182c8c2b5c4ea27047c98a065d11d7bdb90' then
    raise exception '#839 tail: clara._work_question_record is BYTE-IDENTICAL to its pre-image -- the recut did not commit'
      using errcode='CLR10';
  end if;

  -- …and 6 · THE TWO DOORS THIS FILE DOES NOT TOUCH ARE BYTE-IDENTICAL TO THEIR OWN PRE-IMAGES,
  -- because neither one's own text names a column of the record it forwards.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = 'clara.get_work_question(uuid)'::regprocedure;
  if v_sha is distinct from '19e4e418631d465ae0e01d43108bb7cd56f5444cb695e176d86bf1a72e33c62a' then
    raise exception '#839 tail: clara.get_work_question MOVED (measured %) -- this file must not touch it', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = 'clara.get_work_pending_question(uuid)'::regprocedure;
  if v_sha is distinct from '8a196db9bd93b471af4518c703ef117443da10379047c51bc3e65ea9d663ee06' then
    raise exception '#839 tail: clara.get_work_pending_question MOVED (measured %) -- this file must not touch it', v_sha
      using errcode='CLR10';
  end if;

  raise notice '#839 tail: OK -- clara._work_question_record exists exactly once at (uuid), owned by clara_fn_owner, SECURITY DEFINER, search_path-pinned and granted to NO role (unchanged from 0180); it now projects w.basis beside every key 0180 shipped, all twenty of which are still present verbatim; clara.get_work_question and clara.get_work_pending_question are byte-identical to their own pre-images, so both doors keep their exact ACL and behaviour and simply forward one more key.';
end
$w839_tail$;
